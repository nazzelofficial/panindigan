/**
 * MQTT Client for Panindigan
 * genuine MQTT over WebSocket for real-time messaging
 */
 
import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/Logger.js';
import { MQTT_BROKER_URLS, MQTT_DEFAULT_OPTIONS, MQTT_TOPICS, MQTT_WEB_APP_ID } from '../utils/Constants.js';
import { generateClientId, generateMqttSessionId } from '../utils/Helpers.js';
import { EventParser } from '../events/EventParser.js';
import type { Session, PanindiganEvent } from '../types/index.js';
 
interface MQTTMessage {
  topic: string;
  payload: Buffer;
  qos: number;
  retain: boolean;
}
 
export class MQTTClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private session: Session;
  private clientId: string;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = Infinity;
  private reconnectDelay: number = 3000;
  private reconnectTimer?: NodeJS.Timeout;
  private keepAliveTimer?: NodeJS.Timeout;
  private lastPacketId: number = 0;
  private pendingAcks: Map<number, () => void> = new Map();
  private messageQueue: MQTTMessage[] = [];
  // Use 180s timeout for MQTT connection (Facebook can be slow with groups)
  private connectionTimeout: number = 180000;
  private eventParser: EventParser;
  // Random per-connection MQTT session id (the "s"/"mqtt_sid" fields and the
  // broker URL's "sid" param). This is NOT the Iris sync sequence id.
  private mqttSessionId: number;
 
  constructor(session: Session) {
    super();
    this.session = session;
    this.clientId = generateClientId();
    this.mqttSessionId = generateMqttSessionId();
    this.eventParser = new EventParser();
    // Increase max listeners to prevent memory leak warnings
    this.setMaxListeners(50);
  }
 
  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<void> {
    if (this.connected || this.connecting) {
      return;
    }
 
    this.connecting = true;
    logger.logMQTT('connecting', { clientId: this.clientId, userId: this.session.userId });
 
    try {
      // Build connection URL with authentication
      const brokerUrl = this.buildBrokerUrl();
      const cookieHeader = this.buildCookieHeader();
      
      logger.debug('MQTT connection details', { 
        brokerUrl: brokerUrl.substring(0, 100) + '...', 
        brokerUrlLength: brokerUrl.length,
        userId: this.session.userId,
        userIdLength: this.session.userId.length,
        cookieCount: this.session.cookies.length,
        hasCUser: this.session.cookies.some(c => c.key === 'c_user'),
        hasXS: this.session.cookies.some(c => c.key === 'xs'),
      });
      
      // Create WebSocket connection.
      // IMPORTANT: Facebook's chat broker requires the "mqtt" WebSocket
      // subprotocol to be negotiated via Sec-WebSocket-Protocol. Without it
      // the broker accepts the WS upgrade but then closes the raw socket
      // before ever reading the MQTT CONNECT packet — which is exactly the
      // "wsState: CLOSED" / connection-timeout symptom with no CONNACK.
      this.ws = new WebSocket(brokerUrl, 'mqtt', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://www.facebook.com',
          'Cookie': cookieHeader,
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://www.facebook.com/',
        },
        perMessageDeflate: false,
        timeout: this.connectionTimeout,
        handshakeTimeout: this.connectionTimeout,
      });
 
      // Set up event handlers
      this.ws.on('open', () => this.handleOpen());
      this.ws.on('message', (data) => this.handleMessage(data as Buffer));
      this.ws.on('close', (code, reason) => this.handleClose(code, reason));
      this.ws.on('error', (error) => {
        logger.logMQTT('WebSocket error event', {
          error: error instanceof Error ? error.message : String(error),
          errorCode: (error as unknown as {code?: string}).code,
        });
        this.handleError(error);
      });
 
      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          this.connecting = false;
          
          // Check WebSocket state
          const wsState = this.ws?.readyState;
          const stateNames: Record<number, string> = {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED',
          };
          
          const errorMsg = `MQTT connection timeout after ${this.connectionTimeout}ms (WebSocket state: ${stateNames[wsState || 3]}) - checking:
  - Are your cookies valid and not expired?
  - Is your network connection stable?
  - Try refreshing your cookies from Facebook
  - Check if the MQTT broker is accessible`;
          
          logger.error('MQTT connection timeout', {
            wsState: stateNames[wsState || 3],
            brokerUrl: brokerUrl.substring(0, 100),
            userId: this.session.userId,
          });
          
          reject(new Error(errorMsg));
        }, this.connectionTimeout);
 
        const onConnect = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          this.off('error', onError);
          resolve();
        };
 
        const onError = (error: Error) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeout);
          this.off('connect', onConnect);
          reject(error);
        };
 
        this.once('connect', onConnect);
        this.once('error', onError);
      });
 
    } catch (error) {
      this.connecting = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.logMQTT('connection failed', {
        error: errorMessage,
        clientId: this.clientId,
        userId: this.session.userId,
      });
      throw error;
    }
  }
 
  /**
   * Disconnect from MQTT broker
   */
  disconnect(): void {
    logger.logMQTT('disconnecting');
    
    this.stopReconnect();
    this.stopKeepAlive();
    
    if (this.ws) {
      // Send DISCONNECT packet
      this.sendDisconnect();
      
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.connecting = false;
    this.emit('disconnect');
  }
 
  /**
   * Subscribe to a topic
   */
  subscribe(topic: string, qos: number = 1): void {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to MQTT broker');
    }
 
    const packetId = this.getNextPacketId();
    const subscribePacket = this.buildSubscribePacket(packetId, topic, qos);
    
    this.ws.send(subscribePacket);
    logger.logMQTT('subscribed', { topic, qos });
  }
 
  /**
   * Publish a message
   */
  publish(topic: string, payload: Buffer | string, qos: number = 1, retain: boolean = false): void {
    const message: MQTTMessage = {
      topic,
      payload: Buffer.isBuffer(payload) ? payload : Buffer.from(payload),
      qos,
      retain,
    };
 
    if (!this.connected || !this.ws) {
      // Queue message for later
      this.messageQueue.push(message);
      return;
    }
 
    this.sendPublish(message);
  }
 
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
 
  /**
   * Handle WebSocket open
   */
  private handleOpen(): void {
    logger.logMQTT('WebSocket opened');
    
    // Send MQTT CONNECT packet
    this.sendConnect();
  }
 
  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    try {
      // Parse MQTT packet
      const packet = this.parsePacket(data);
      
      switch (packet.type) {
        case 'CONNACK':
          this.handleConnAck(packet as unknown as { returnCode: number });
          break;
        case 'PUBLISH':
          this.handlePublish(packet as unknown as { topic: string; payload: Buffer; qos: number; packetId?: number });
          break;
        case 'PUBACK':
          this.handlePubAck(packet as unknown as { packetId: number });
          break;
        case 'SUBACK':
          this.handleSubAck(packet as unknown as { packetId: number; grantedQos: number[] });
          break;
        case 'PINGRESP':
          this.handlePingResp();
          break;
        default:
          logger.logMQTT('unknown packet type', { type: packet.type });
      }
    } catch (error) {
      logger.logMQTT('packet parse error', error);
    }
  }
 
  /**
   * Handle WebSocket close
   */
  private handleClose(code: number, reason: Buffer): void {
    logger.logMQTT('WebSocket closed', { code, reason: reason.toString() });
    
    this.connected = false;
    this.connecting = false;
    
    this.emit('disconnect', { code, reason: reason.toString() });
    
    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }
 
  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    logger.logMQTT('WebSocket error', error);
    this.emit('error', error);
  }
 
  /**
   * Handle CONNACK packet
   */
  private handleConnAck(packet: { returnCode: number }): void {
    if (packet.returnCode === 0) {
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      
      logger.logMQTT('CONNACK received - connected successfully', {
        returnCode: packet.returnCode,
        clientId: this.clientId,
      });
      
      // Start keep-alive
      this.startKeepAlive();
      
      // Subscribe to required topics
      this.subscribeToTopics();

      // Resume/create the Iris sync queue so message backlog starts flowing
      this.sendSyncQueue();
      
      // Process queued messages
      this.processMessageQueue();
      
      this.emit('connect');
    } else {
      this.connecting = false;
      
      // Map connection refusal codes
      const refusalCodes: Record<number, string> = {
        1: 'Connection Refused - Unacceptable protocol version',
        2: 'Connection Refused - Identifier rejected',
        3: 'Connection Refused - Server unavailable',
        4: 'Connection Refused - Bad user name or password',
        5: 'Connection Refused - Not authorized (bad cookies)',
      };
      
      const reason = refusalCodes[packet.returnCode] || `Connection refused with code ${packet.returnCode}`;
      const error = new Error(reason);
      
      logger.error('MQTT connection refused', {
        returnCode: packet.returnCode,
        reason,
        clientId: this.clientId,
        userId: this.session.userId,
      });
      
      this.emit('error', error);
    }
  }

  /**
   * Publish the Iris sync queue request.
   *
   * Real Messenger Web behavior: after CONNACK, the client publishes to
   * `/messenger_sync_create_queue` (fresh sync, no prior position) or
   * `/messenger_sync_get_diffs` (resume from a known position) so the
   * server starts streaming the message backlog over `/t_ms`.
   *
   * Only a real irisSeqId extracted from Facebook is ever used here — if
   * none is available yet, a fresh queue is created and the server assigns
   * a starting position; no sequence id is ever fabricated.
   */
  private sendSyncQueue(): void {
    const hasRealSeqId = !!this.session.irisSeqId && this.session.irisSeqId !== '0';
    const topic = hasRealSeqId ? '/messenger_sync_get_diffs' : '/messenger_sync_create_queue';

    const basePayload: Record<string, unknown> = {
      sync_api_version: 10,
      max_deltas_able_to_process: 1000,
      delta_batch_size: 500,
      encoding: 'JSON',
      entity_fbid: this.session.userId,
    };

    const payload = hasRealSeqId
      ? { ...basePayload, last_seq_id: this.session.irisSeqId }
      : { ...basePayload, initial_titan_sequence_id: null, device_params: null };

    logger.logMQTT('sending Iris sync queue request', { topic, hasRealSeqId });

    this.publish(topic, JSON.stringify(payload), 1);
  }
 
  /**
   * Handle PUBLISH packet
   */
  private handlePublish(packet: { topic: string; payload: Buffer; qos: number; packetId?: number }): void {
    // Send PUBACK if QoS > 0
    if (packet.qos > 0 && packet.packetId) {
      this.sendPubAck(packet.packetId);
    }
    
    // Emit message event
    this.emit('message', packet.topic, packet.payload);
    
    // Parse and emit specific events
    this.parseAndEmitEvent(packet.topic, packet.payload);
  }
 
  /**
   * Handle PUBACK packet
   */
  private handlePubAck(packet: { packetId: number }): void {
    const ack = this.pendingAcks.get(packet.packetId);
    if (ack) {
      ack();
      this.pendingAcks.delete(packet.packetId);
    }
  }
 
  /**
   * Handle SUBACK packet
   */
  private handleSubAck(packet: { packetId: number; grantedQos: number[] }): void {
    logger.logMQTT('subscription acknowledged', { packetId: packet.packetId });
  }
 
  /**
   * Handle PINGRESP packet
   */
  private handlePingResp(): void {
    logger.logMQTT('ping response received');
  }
 
  /**
   * Send CONNECT packet
   */
  private sendConnect(): void {
    try {
      // Build MQTT CONNECT packet
      const packet = this.buildConnectPacket();
      
      if (!this.ws) {
        logger.error('WebSocket is null when sending CONNECT packet');
        return;
      }
      
      logger.logMQTT('sending CONNECT packet', {
        packetSize: packet.length,
        clientId: this.clientId,
        userId: this.session.userId,
      });
      
      this.ws.send(packet);
      
      logger.logMQTT('CONNECT packet sent successfully');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to send CONNECT packet', {
        error: errorMsg,
      });
      this.emit('error', new Error(`Failed to send CONNECT packet: ${errorMsg}`));
    }
  }
 
  /**
   * Send DISCONNECT packet
   */
  private sendDisconnect(): void {
    // Build MQTT DISCONNECT packet (simple: 0xE0 0x00)
    const packet = Buffer.from([0xE0, 0x00]);
    this.ws?.send(packet);
  }
 
  /**
   * Send PUBLISH packet
   */
  private sendPublish(message: MQTTMessage): Promise<void> | void {
    const packetId = message.qos > 0 ? this.getNextPacketId() : undefined;
    const packet = this.buildPublishPacket(message, packetId);
    
    this.ws?.send(packet);
    
    if (message.qos > 0 && packetId) {
      // Wait for acknowledgment
      return new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingAcks.delete(packetId);
          reject(new Error('PUBLISH timeout'));
        }, 30000);
        
        this.pendingAcks.set(packetId, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }
 
  /**
   * Send PUBACK packet
   */
  private sendPubAck(packetId: number): void {
    const packet = this.buildPubAckPacket(packetId);
    this.ws?.send(packet);
  }
 
  /**
   * Send PINGREQ packet
   */
  private sendPing(): void {
    // MQTT PINGREQ packet: 0xC0 0x00
    const packet = Buffer.from([0xC0, 0x00]);
    this.ws?.send(packet);
    logger.logMQTT('ping sent');
  }
 
  /**
   * Subscribe to required topics
   */
  private subscribeToTopics(): void {
    // All topics Messenger Web subscribes to at connection time
    const topics = [
      MQTT_TOPICS.MESSAGE_SYNC,          // /t_ms — all messages + deltas
      MQTT_TOPICS.RTC,                   // /t_rtc — voice/video calls
      MQTT_TOPICS.PRESENCE,              // /t_p — presence updates
      MQTT_TOPICS.TYPING,                // /t_tn — typing notifications
      MQTT_TOPICS.GRAPHQL,               // /t_graphql — thread mutations
      MQTT_TOPICS.MESSAGING_EVENTS,      // /t_messaging_events — read/delivery
      MQTT_TOPICS.NOTIFY,                // /t_notify — push alerts
      MQTT_TOPICS.REGION_HINT,           // /t_region_hint — broker routing
      MQTT_TOPICS.ORCA_PRESENCE,         // /orca_presence — extended presence
      MQTT_TOPICS.ORCA_TYPING,           // /orca_typing_notifications
      MQTT_TOPICS.ORCA_MESSAGES,         // /orca_message_notifications
      MQTT_TOPICS.WEBRTC,                // /webrtc — WebRTC signaling
      MQTT_TOPICS.WEBRTC_RESPONSE,       // /webrtc_response
      `mqtt_c2b_${this.session.userId}`, // personal C2B channel
      MQTT_TOPICS.SUBSCRIPTION,          // /t_sb — subscription updates
      MQTT_TOPICS.ADMIN_TEXT,            // /t_admin_text — system messages
      MQTT_TOPICS.PRESENCE_EXTENDED,     // /t_presence
      MQTT_TOPICS.MESSAGE_BODY,          // /t_msg_body
      MQTT_TOPICS.DELTA,                 // /t_delta
    ];
    
    for (const topic of topics) {
      try {
        this.subscribe(topic, 1);
        logger.logMQTT('subscribed to topic', { topic });
      } catch (error) {
        logger.debug('Failed to subscribe to topic', { topic, error });
      }
    }
  }
 
  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.connected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendPublish(message);
      }
    }
  }
 
  /**
   * Start keep-alive timer
   */
  private startKeepAlive(): void {
    this.keepAliveTimer = setInterval(() => {
      if (this.connected) {
        this.sendPing();
      }
    }, MQTT_DEFAULT_OPTIONS.keepalive * 1000);
  }
 
  /**
   * Stop keep-alive timer
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }
 
  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 30000);
    
    logger.logMQTT('scheduling reconnect', { attempt: this.reconnectAttempts, delay });
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();
      } catch (error) {
        // Reconnection will be retried if max attempts not reached
      }
    }, delay);
  }
 
  /**
   * Stop reconnection
   */
  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
 
  /**
   * Get next packet ID
   * MQTT 3.1.1 §2.3.1: packet identifiers MUST be non-zero.
   * Valid range is 1–65535; wrap from 65535 back to 1.
   */
  private getNextPacketId(): number {
    this.lastPacketId = (this.lastPacketId % 65535) + 1;
    return this.lastPacketId;
  }
 
  /**
   * Build broker URL.
   *
   * The real Messenger Web client's WebSocket URL only carries the MQTT
   * session id (`sid`), the client id (`cid`) and a region hint — it does
   * NOT carry the Iris sync sequence id. Message backlog resumption happens
   * *after* CONNACK via a `/messenger_sync_create_queue` (fresh) or
   * `/messenger_sync_get_diffs` (resume) PUBLISH — see `sendSyncQueue()`.
   * Putting irisSeqId in the URL (the previous behavior) is not part of the
   * real protocol and was never validated by the broker either way.
   */
  private buildBrokerUrl(): string {
    const baseUrl = MQTT_BROKER_URLS[0];
 
    // Build URL manually to avoid URLSearchParams truncation issues
    // IMPORTANT: Do not use URLSearchParams as it truncates long user IDs
    const params = [
      `sid=${this.mqttSessionId}`,
      `cid=${this.clientId}`,
      `region=${(this.session.region || 'PRN').toLowerCase()}`,
    ];
    
    return `${baseUrl}?${params.join('&')}`;
  }
 
  /**
   * Build cookie header
   */
  private buildCookieHeader(): string {
    // Filter out cookies that don't have a key or value
    const validCookies = this.session.cookies.filter((c) => c.key && c.value);
    
    // Build cookie string - NO encoding needed for HTTP Cookie header
    // HTTP Cookie header format: name=value; name2=value2
    return validCookies
      .map((c) => `${c.key}=${c.value}`)
      .join('; ');
  }
 
  /**
   * Parse MQTT packet
   */
  private parsePacket(data: Buffer): { type: string; [key: string]: unknown } {
    const packetType = (data[0] >> 4) & 0x0F;
    const packetTypes: Record<number, string> = {
      1: 'CONNECT',
      2: 'CONNACK',
      3: 'PUBLISH',
      4: 'PUBACK',
      5: 'PUBREC',
      6: 'PUBREL',
      7: 'PUBCOMP',
      8: 'SUBSCRIBE',
      9: 'SUBACK',
      12: 'PINGREQ',
      13: 'PINGRESP',
      14: 'DISCONNECT',
    };
    
    const type = packetTypes[packetType] || 'UNKNOWN';
    
    // Parse based on type
    switch (type) {
      case 'CONNACK':
        return { type, returnCode: data[3] };
      case 'PUBLISH':
        return this.parsePublishPacket(data);
      case 'PUBACK':
        return { type, packetId: data.readUInt16BE(2) };
      case 'SUBACK':
        return { type, packetId: data.readUInt16BE(2), grantedQos: [data[4]] };
      default:
        return { type };
    }
  }
 
  /**
   * Parse PUBLISH packet
   */
  private parsePublishPacket(data: Buffer): { type: string; topic: string; payload: Buffer; qos: number; packetId?: number } {
    const qos = (data[0] >> 1) & 0x03;
    let offset = 2;
    
    // Read remaining length (variable length encoding)
    let multiplier = 1;
    let remainingLength = 0;
    let digit;
    do {
      digit = data[offset++];
      remainingLength += (digit & 127) * multiplier;
      multiplier *= 128;
    } while ((digit & 128) !== 0);
    
    // Read topic length
    const topicLength = data.readUInt16BE(offset);
    offset += 2;
    
    // Read topic
    const topic = data.toString('utf8', offset, offset + topicLength);
    offset += topicLength;
    
    // Read packet ID if QoS > 0
    let packetId: number | undefined;
    if (qos > 0) {
      packetId = data.readUInt16BE(offset);
      offset += 2;
    }
    
    // Read payload — use subarray (non-copying) instead of the deprecated slice()
    const payload = data.subarray(offset);
    
    return { type: 'PUBLISH', topic, payload, qos, packetId };
  }
 
  /**
   * Build CONNECT packet.
   *
   * ROOT CAUSE OF THE CONNECTION TIMEOUT: Facebook's Messenger MQTT broker
   * speaks MQTT 3.1 — protocol name "MQIsdp", protocol level 3 — and
   * authenticates the session through a JSON object placed in the CONNECT
   * packet's `username` field (u, s, cp, ecp, chat_on, fg, d, ct, aid,
   * mqtt_sid, st, pm, dc, no_auto_fg, gas, pack). The previous
   * implementation sent a bare MQTT 3.1.1 ("MQTT"/level 4) CONNECT with no
   * username at all, which the broker rejects at the transport level
   * (closing the raw socket) before ever emitting a CONNACK — exactly the
   * "wsState: CLOSED" / connection-timeout symptom that was observed.
   */
  private buildConnectPacket(): Buffer {
    const protocolName = Buffer.from('MQIsdp');
    const protocolLevel = 3; // MQTT 3.1 (Facebook does not accept 3.1.1)
    
    // Connect flags: bit 7 = Username present, bit 1 = Clean Session
    const connectFlags = 0x82;
    
    const keepAlive = MQTT_DEFAULT_OPTIONS.keepalive;
    
    const clientIdBuf = Buffer.from(this.clientId, 'utf-8');
    const clientIdLength = Buffer.alloc(2);
    clientIdLength.writeUInt16BE(clientIdBuf.length);

    // Username payload: real session data only — the user's actual FB id,
    // the actual device id issued during login, and this connection's
    // randomly generated MQTT session id. No fabricated/guessed fields.
    const usernamePayload = JSON.stringify({
      u: this.session.userId,
      s: this.mqttSessionId,
      cp: 3,
      ecp: 10,
      chat_on: true,
      fg: false,
      d: this.session.deviceId,
      ct: 'websocket',
      aid: MQTT_WEB_APP_ID,
      mqtt_sid: this.mqttSessionId,
      st: [],
      pm: [],
      dc: '',
      no_auto_fg: true,
      gas: null,
      pack: [],
    });
    const usernameBuf = Buffer.from(usernamePayload, 'utf-8');
    const usernameLength = Buffer.alloc(2);
    usernameLength.writeUInt16BE(usernameBuf.length);
    
    // Build variable header
    const variableHeader = Buffer.concat([
      Buffer.from([0, protocolName.length]), // Protocol name length (2 bytes)
      protocolName, // "MQIsdp" (6 bytes)
      Buffer.from([protocolLevel]), // Protocol level (1 byte)
      Buffer.from([connectFlags]), // Connect flags (1 byte)
      Buffer.from([(keepAlive >> 8) & 0xFF, keepAlive & 0xFF]), // Keep alive (2 bytes)
    ]);
    
    // Build payload: clientId + username (no password field is sent)
    const payload = Buffer.concat([clientIdLength, clientIdBuf, usernameLength, usernameBuf]);
    
    // Calculate remaining length (variable header + payload)
    const remainingLength = variableHeader.length + payload.length;
    
    // Encode remaining length as variable-length quantity
    const remainingLengthBuf = this.encodeRemainingLength(remainingLength);
    
    // Build fixed header (packet type + flags, then remaining length)
    const fixedHeaderByte = 0x10; // CONNECT packet type (1) with flags (0000)
    const fixedHeader = Buffer.concat([Buffer.from([fixedHeaderByte]), remainingLengthBuf]);
    
    logger.debug('MQTT CONNECT packet', {
      clientId: this.clientId,
      protocolName: protocolName.toString(),
      protocolLevel,
      mqttSessionId: this.mqttSessionId,
      remainingLength,
      fixedHeaderLength: fixedHeader.length,
      variableHeaderLength: variableHeader.length,
      payloadLength: payload.length,
    });
    
    return Buffer.concat([fixedHeader, variableHeader, payload]);
  }
 
  /**
   * Encode remaining length as variable-length quantity (MQTT spec)
   */
  private encodeRemainingLength(length: number): Buffer {
    const encoded: number[] = [];
    let num = length;
    
    do {
      let digit = num % 128;
      num = Math.floor(num / 128);
      if (num > 0) {
        digit |= 0x80; // Set continuation bit
      }
      encoded.push(digit);
    } while (num > 0);
    
    return Buffer.from(encoded);
  }
 
  /**
   * Build SUBSCRIBE packet
   */
  private buildSubscribePacket(packetId: number, topic: string, qos: number): Buffer {
    const topicBuf = Buffer.from(topic, 'utf-8');
    const topicLength = Buffer.alloc(2);
    topicLength.writeUInt16BE(topicBuf.length);
    
    const packetIdBuf = Buffer.alloc(2);
    packetIdBuf.writeUInt16BE(packetId);
    
    const payload = Buffer.concat([
      packetIdBuf,
      topicLength,
      topicBuf,
      Buffer.from([qos]),
    ]);
    
    const remainingLength = payload.length;
    const remainingLengthBuf = this.encodeRemainingLength(remainingLength);
    
    const fixedHeaderByte = 0x82; // SUBSCRIBE packet type (8) with reserved flags (0010)
    const fixedHeader = Buffer.concat([Buffer.from([fixedHeaderByte]), remainingLengthBuf]);
    
    return Buffer.concat([fixedHeader, payload]);
  }
 
  /**
   * Build PUBLISH packet
   */
  private buildPublishPacket(message: MQTTMessage, packetId?: number): Buffer {
    const topicBuf = Buffer.from(message.topic, 'utf-8');
    const topicLength = Buffer.alloc(2);
    topicLength.writeUInt16BE(topicBuf.length);
    
    let variableHeader = Buffer.concat([topicLength, topicBuf]);
    
    if (message.qos > 0 && packetId) {
      const packetIdBuf = Buffer.alloc(2);
      packetIdBuf.writeUInt16BE(packetId);
      variableHeader = Buffer.concat([variableHeader, packetIdBuf]);
    }
    
    const remainingLength = variableHeader.length + message.payload.length;
    const remainingLengthBuf = this.encodeRemainingLength(remainingLength);
    
    // Fixed header with packet type (3) and QoS/retain flags
    const fixedHeaderByte = 0x30 | (message.qos << 1) | (message.retain ? 1 : 0);
    const fixedHeader = Buffer.concat([Buffer.from([fixedHeaderByte]), remainingLengthBuf]);
    
    return Buffer.concat([fixedHeader, variableHeader, message.payload]);
  }
 
  /**
   * Build PUBACK packet
   */
  private buildPubAckPacket(packetId: number): Buffer {
    return Buffer.from([0x40, 0x02, (packetId >> 8) & 0xFF, packetId & 0xFF]);
  }
 
  /**
   * Parse and emit specific events from MQTT messages.
   * Uses parseAll() so that bulk presence maps fan out into individual events.
   */
  private parseAndEmitEvent(topic: string, payload: Buffer): void {
    // Emit raw data first
    this.emit('raw', topic, payload);

    // parseAll returns N events (most topics: 0–1; presence: one per UID)
    const events = this.eventParser.parseAll(topic, payload);
    for (const event of events) {
      this.emit(event.type, event);
      this.emit('event', event);
    }
  }
 
  /**
   * Get the event parser instance
   */
  getEventParser(): EventParser {
    return this.eventParser;
  }
 
  /**
   * Parse a raw event manually
   */
  parseEvent(topic: string, payload: Buffer): PanindiganEvent | null {
    return this.eventParser.parse(topic, payload);
  }
}