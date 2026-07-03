/**
 * Fast MQTT Client with Auto-Restart & Keep-Alive
 * Optimized connection management for Facebook MQTT
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/Logger.js';
import { MQTT_BROKER_URLS, MQTT_DEFAULT_OPTIONS, MQTT_TOPICS, MQTT_WEB_APP_ID } from '../utils/Constants.js';
import { generateClientId, generateMqttSessionId } from '../utils/Helpers.js';
import { EventParser } from '../events/EventParser.js';
import type { Session } from '../types/index.js';

interface MQTTMessage {
  topic: string;
  payload: Buffer;
  qos: number;
  retain: boolean;
}

export interface FastMQTTOptions {
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  maxReconnectDelay?: number;
  keepAliveInterval?: number;
  connectionTimeout?: number;
  autoRestart?: boolean;
  restartOnDisconnect?: boolean;
  healthCheckInterval?: number;
}

export class FastMQTT extends EventEmitter {
  private ws: WebSocket | null = null;
  private session: Session;
  private clientId: string;
  private connected: boolean = false;
  private connecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private maxReconnectDelay: number;
  private reconnectTimer?: NodeJS.Timeout;
  private keepAliveTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private lastPacketId: number = 0;
  private pendingAcks: Map<number, () => void> = new Map();
  private messageQueue: MQTTMessage[] = [];
  private connectionTimeout: number;
  private autoRestart: boolean;
  private restartOnDisconnect: boolean;
  private healthCheckInterval: number;
  private lastHealthCheck: number = Date.now();
  private lastMessageTime: number = Date.now();
  private eventParser: EventParser;
  private isManuallyDisconnected: boolean = false;
  // Random per-connection MQTT session id (the "s"/"mqtt_sid" fields and the
  // broker URL's "sid" param). This is NOT the Iris sync sequence id.
  private mqttSessionId: number;

  constructor(session: Session, options: FastMQTTOptions = {}) {
    super();
    this.session = session;
    this.clientId = generateClientId();
    this.mqttSessionId = generateMqttSessionId();
    this.eventParser = new EventParser();
    
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? Infinity;
    this.reconnectDelay = options.reconnectDelay ?? 3000;
    this.maxReconnectDelay = options.maxReconnectDelay ?? 60000;
    this.connectionTimeout = options.connectionTimeout ?? 60000;
    this.autoRestart = options.autoRestart ?? true;
    this.restartOnDisconnect = options.restartOnDisconnect ?? true;
    this.healthCheckInterval = options.healthCheckInterval ?? 30000;
    
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
    this.isManuallyDisconnected = false;
    logger.logMQTT('FastMQTT connecting', { clientId: this.clientId, userId: this.session.userId });

    try {
      const brokerUrl = this.buildBrokerUrl();
      const cookieHeader = this.buildCookieHeader();
      
      logger.debug('FastMQTT connection details', { 
        brokerUrl: brokerUrl.substring(0, 100) + '...', 
        cookieCount: this.session.cookies.length,
      });
      
      // The "mqtt" WebSocket subprotocol MUST be negotiated (Sec-WebSocket-Protocol)
      // or Facebook's broker closes the raw socket before reading any MQTT packet.
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
        handshakeTimeout: this.connectionTimeout,
        perMessageDeflate: false,
      });

      this.setupWebSocketHandlers();

      await this.waitForConnection();

    } catch (error) {
      this.connecting = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('FastMQTT connection failed', { error: errorMessage });
      
      if (this.autoRestart && !this.isManuallyDisconnected) {
        this.scheduleReconnect();
      }
      
      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data) => this.handleMessage(data as Buffer));
    this.ws.on('close', (code, reason) => this.handleClose(code, reason));
    this.ws.on('error', (error) => this.handleError(error));
    this.ws.on('ping', () => this.handlePing());
    this.ws.on('pong', () => this.handlePong());
  }

  /**
   * Wait for connection with timeout
   */
  private waitForConnection(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.connecting = false;
        
        const wsState = this.ws?.readyState;
        const stateNames: Record<number, string> = {
          0: 'CONNECTING',
          1: 'OPEN',
          2: 'CLOSING',
          3: 'CLOSED',
        };
        
        reject(new Error(`FastMQTT connection timeout after ${this.connectionTimeout}ms (WebSocket state: ${stateNames[wsState || 3]})`));
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
  }

  /**
   * Handle WebSocket open
   */
  private handleOpen(): void {
    logger.logMQTT('FastMQTT WebSocket opened');
    this.sendConnect();
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(code: number, reason: Buffer): void {
    logger.logMQTT('FastMQTT WebSocket closed', { code, reason: reason.toString() });
    
    this.connected = false;
    this.connecting = false;
    
    this.stopKeepAlive();
    this.stopHealthCheck();
    
    this.emit('disconnect', { code, reason: reason.toString() });
    
    if (this.restartOnDisconnect && !this.isManuallyDisconnected) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(error: Error): void {
    logger.error('FastMQTT WebSocket error', error);
    this.emit('error', error);
  }

  /**
   * Handle WebSocket ping
   */
  private handlePing(): void {
    logger.debug('FastMQTT: Received ping from server');
    this.lastMessageTime = Date.now();
  }

  /**
   * Handle WebSocket pong
   */
  private handlePong(): void {
    logger.debug('FastMQTT: Received pong from server');
    this.lastMessageTime = Date.now();
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: Buffer): void {
    this.lastMessageTime = Date.now();
    
    try {
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
      logger.error('FastMQTT packet parse error', error);
    }
  }

  /**
   * Handle CONNACK
   */
  private handleConnAck(packet: { returnCode: number }): void {
    if (packet.returnCode === 0) {
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      
      logger.logMQTT('FastMQTT CONNACK - connected', {
        returnCode: packet.returnCode,
        clientId: this.clientId,
      });
      
      this.startKeepAlive();
      this.startHealthCheck();
      this.subscribeToTopics();
      this.sendSyncQueue();
      this.processMessageQueue();
      
      this.emit('connect');
    } else {
      this.connecting = false;
      
      const refusalCodes: Record<number, string> = {
        1: 'Connection Refused - Unacceptable protocol version',
        2: 'Connection Refused - Identifier rejected',
        3: 'Connection Refused - Server unavailable',
        4: 'Connection Refused - Bad user name or password',
        5: 'Connection Refused - Not authorized (bad cookies)',
      };
      
      const reason = refusalCodes[packet.returnCode] || `Connection refused with code ${packet.returnCode}`;
      const error = new Error(reason);
      
      logger.error('FastMQTT connection refused', {
        returnCode: packet.returnCode,
        reason,
      });
      
      this.emit('error', error);
    }
  }

  /**
   * Handle PUBLISH
   */
  private handlePublish(packet: { topic: string; payload: Buffer; qos: number; packetId?: number }): void {
    if (packet.qos > 0 && packet.packetId) {
      this.sendPubAck(packet.packetId);
    }
    
    this.emit('message', packet.topic, packet.payload);

    // parseAll fans bulk presence maps into one event per UID
    const events = this.eventParser.parseAll(packet.topic, packet.payload);
    for (const event of events) {
      this.emit(event.type, event);
      this.emit('event', event);
    }
  }

  /**
   * Handle PUBACK
   */
  private handlePubAck(packet: { packetId: number }): void {
    const ack = this.pendingAcks.get(packet.packetId);
    if (ack) {
      ack();
      this.pendingAcks.delete(packet.packetId);
    }
  }

  /**
   * Handle SUBACK
   */
  private handleSubAck(packet: { packetId: number; grantedQos: number[] }): void {
    logger.logMQTT('FastMQTT subscription acknowledged', { packetId: packet.packetId });
  }

  /**
   * Handle PINGRESP
   */
  private handlePingResp(): void {
    logger.debug('FastMQTT ping response received');
  }

  /**
   * Start keep-alive
   */
  private startKeepAlive(): void {
    this.keepAliveTimer = setInterval(() => {
      if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
        this.sendPing();
      }
    }, MQTT_DEFAULT_OPTIONS.keepalive * 1000);
  }

  /**
   * Stop keep-alive
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  /**
   * Start health check
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * Stop health check
   */
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  /**
   * Perform health check
   */
  private performHealthCheck(): void {
    const now = Date.now();
    const timeSinceLastMessage = now - this.lastMessageTime;
    
    this.lastHealthCheck = now;
    
    if (timeSinceLastMessage > MQTT_DEFAULT_OPTIONS.keepalive * 2000) {
      logger.warn('FastMQTT: No messages received recently, sending health check ping');
      this.sendPing();
    }
    
    if (timeSinceLastMessage > MQTT_DEFAULT_OPTIONS.keepalive * 5000) {
      logger.error('FastMQTT: Connection appears stale, forcing reconnect');
      this.forceReconnect();
    }
    
    logger.debug('FastMQTT health check', {
      connected: this.connected,
      timeSinceLastMessage,
      wsState: this.ws?.readyState,
    });
  }

  /**
   * Force reconnect
   */
  private forceReconnect(): void {
    logger.warn('FastMQTT: Forcing reconnect due to health check failure');
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.connecting = false;
    
    if (this.autoRestart && !this.isManuallyDisconnected) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isManuallyDisconnected) {
      return;
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('FastMQTT: Max reconnection attempts reached');
      this.emit('max_reconnect_attempts_reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );
    
    logger.logMQTT('FastMQTT scheduling reconnect', { 
      attempt: this.reconnectAttempts, 
      delay,
      maxAttempts: this.maxReconnectAttempts,
    });
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();
      } catch (error) {
        // Will retry if max attempts not reached
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
   * Disconnect
   */
  disconnect(): void {
    logger.logMQTT('FastMQTT disconnecting');
    
    this.isManuallyDisconnected = true;
    this.stopReconnect();
    this.stopKeepAlive();
    this.stopHealthCheck();
    
    if (this.ws) {
      this.sendDisconnect();
      this.ws.close();
      this.ws = null;
    }
    
    this.connected = false;
    this.connecting = false;
    this.emit('disconnect');
  }

  /**
   * Subscribe to topic
   */
  subscribe(topic: string, qos: number = 1): void {
    if (!this.connected || !this.ws) {
      throw new Error('Not connected to MQTT broker');
    }

    const packetId = this.getNextPacketId();
    const subscribePacket = this.buildSubscribePacket(packetId, topic, qos);
    
    this.ws.send(subscribePacket);
    logger.logMQTT('FastMQTT subscribed', { topic, qos });
  }

  /**
   * Publish message
   */
  publish(topic: string, payload: Buffer | string, qos: number = 1, retain: boolean = false): void {
    const message: MQTTMessage = {
      topic,
      payload: Buffer.isBuffer(payload) ? payload : Buffer.from(payload),
      qos,
      retain,
    };

    if (!this.connected || !this.ws) {
      this.messageQueue.push(message);
      return;
    }

    this.sendPublish(message);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection stats
   */
  getStats(): {
    connected: boolean;
    reconnectAttempts: number;
    lastHealthCheck: number;
    lastMessageTime: number;
    messageQueueSize: number;
  } {
    return {
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      lastHealthCheck: this.lastHealthCheck,
      lastMessageTime: this.lastMessageTime,
      messageQueueSize: this.messageQueue.length,
    };
  }

  // --- MQTT Packet Methods ---

  private sendConnect(): void {
    const packet = this.buildConnectPacket();
    this.ws?.send(packet);
  }

  /**
   * Publish the Iris sync queue request.
   *
   * Mirrors real Messenger Web: after CONNACK, publish to
   * `/messenger_sync_create_queue` (fresh) or `/messenger_sync_get_diffs`
   * (resume) so the server streams the message backlog over `/t_ms`.
   * Only a real irisSeqId is ever used — never fabricated.
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

    logger.logMQTT('FastMQTT sending Iris sync queue request', { topic, hasRealSeqId });

    this.publish(topic, JSON.stringify(payload), 1);
  }

  private sendDisconnect(): void {
    const packet = Buffer.from([0xE0, 0x00]);
    this.ws?.send(packet);
  }

  private sendPing(): void {
    const packet = Buffer.from([0xC0, 0x00]);
    this.ws?.send(packet);
    logger.debug('FastMQTT ping sent');
  }

  private sendPubAck(packetId: number): void {
    const packet = Buffer.from([0x40, 0x02, (packetId >> 8) & 0xFF, packetId & 0xFF]);
    this.ws?.send(packet);
  }

  private sendPublish(message: MQTTMessage): void {
    const packetId = message.qos > 0 ? this.getNextPacketId() : undefined;
    const packet = this.buildPublishPacket(message, packetId);
    this.ws?.send(packet);
  }

  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.connected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.sendPublish(message);
      }
    }
  }

  private subscribeToTopics(): void {
    const topics: string[] = [
      MQTT_TOPICS.MESSAGE_SYNC,
      MQTT_TOPICS.RTC,
      MQTT_TOPICS.PRESENCE,
      MQTT_TOPICS.TYPING,
      MQTT_TOPICS.GRAPHQL,
      MQTT_TOPICS.MESSAGING_EVENTS,
      MQTT_TOPICS.NOTIFY,
      MQTT_TOPICS.REGION_HINT,
      `mqtt_c2b_${this.session.userId}`,
      MQTT_TOPICS.SUBSCRIPTION,
      MQTT_TOPICS.ADMIN_TEXT,
      MQTT_TOPICS.PRESENCE_EXTENDED,
      MQTT_TOPICS.MESSAGE_BODY,
      MQTT_TOPICS.DELTA,
      MQTT_TOPICS.ORCA_PRESENCE,
      MQTT_TOPICS.ORCA_TYPING,
      MQTT_TOPICS.ORCA_MESSAGES,
      MQTT_TOPICS.WEBRTC,
      MQTT_TOPICS.WEBRTC_RESPONSE,
    ];
    
    for (const topic of topics) {
      try {
        this.subscribe(topic, 1);
      } catch (error) {
        logger.debug('Failed to subscribe to topic', { topic, error });
      }
    }
  }

  /**
   * Get next packet ID.
   * MQTT 3.1.1 §2.3.1: packet identifiers MUST be non-zero (1–65535).
   */
  private getNextPacketId(): number {
    this.lastPacketId = (this.lastPacketId % 65535) + 1;
    return this.lastPacketId;
  }

  /**
   * Build broker URL.
   *
   * Mirrors the real Messenger Web WebSocket URL: MQTT session id (`sid`),
   * client id (`cid`) and a region hint. Iris sync resumption (irisSeqId)
   * happens post-CONNACK via `sendSyncQueue()`, not as a URL param.
   */
  private buildBrokerUrl(): string {
    const baseUrl = MQTT_BROKER_URLS[0];

    const params: string[] = [
      `sid=${this.mqttSessionId}`,
      `cid=${encodeURIComponent(this.clientId)}`,
      `region=${encodeURIComponent((this.session.region || 'PRN').toLowerCase())}`,
    ];

    return `${baseUrl}?${params.join('&')}`;
  }

  private buildCookieHeader(): string {
    const validCookies = this.session.cookies.filter((c) => c.key && c.value);
    return validCookies.map((c) => `${c.key}=${c.value}`).join('; ');
  }

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

  private parsePublishPacket(data: Buffer): { type: string; topic: string; payload: Buffer; qos: number; packetId?: number } {
    const qos = (data[0] >> 1) & 0x03;
    let offset = 2;
    
    let multiplier = 1;
    let remainingLength = 0;
    let digit;
    do {
      digit = data[offset++];
      remainingLength += (digit & 127) * multiplier;
      multiplier *= 128;
    } while ((digit & 128) !== 0);
    
    const topicLength = data.readUInt16BE(offset);
    offset += 2;
    
    const topic = data.toString('utf8', offset, offset + topicLength);
    offset += topicLength;
    
    let packetId: number | undefined;
    if (qos > 0) {
      packetId = data.readUInt16BE(offset);
      offset += 2;
    }
    
    // Use subarray (non-copying) instead of the deprecated Buffer.slice()
    const payload = data.subarray(offset);
    
    return { type: 'PUBLISH', topic, payload, qos, packetId };
  }

  /**
   * Build CONNECT packet.
   *
   * Facebook's broker speaks MQTT 3.1 ("MQIsdp"/level 3) and authenticates
   * via a JSON object in the CONNECT `username` field — a bare MQTT 3.1.1
   * CONNECT with no username (the previous implementation) gets the raw
   * socket closed by the broker before any CONNACK is sent.
   */
  private buildConnectPacket(): Buffer {
    const protocolName = Buffer.from('MQIsdp');
    const protocolLevel = 3; // MQTT 3.1 (Facebook does not accept 3.1.1)
    const connectFlags = 0x82; // Username present + Clean Session
    const keepAlive = MQTT_DEFAULT_OPTIONS.keepalive;
    
    const clientIdBuf = Buffer.from(this.clientId, 'utf-8');
    const clientIdLength = Buffer.alloc(2);
    clientIdLength.writeUInt16BE(clientIdBuf.length);

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
    
    const variableHeader = Buffer.concat([
      Buffer.from([0, protocolName.length]),
      protocolName,
      Buffer.from([protocolLevel]),
      Buffer.from([connectFlags]),
      Buffer.from([(keepAlive >> 8) & 0xFF, keepAlive & 0xFF]),
    ]);
    
    const payload = Buffer.concat([clientIdLength, clientIdBuf, usernameLength, usernameBuf]);
    const remainingLength = variableHeader.length + payload.length;
    const remainingLengthBuf = this.encodeRemainingLength(remainingLength);
    
    const fixedHeader = Buffer.concat([Buffer.from([0x10]), remainingLengthBuf]);

    logger.debug('FastMQTT CONNECT packet', {
      clientId: this.clientId,
      protocolName: protocolName.toString(),
      protocolLevel,
      mqttSessionId: this.mqttSessionId,
      remainingLength,
    });
    
    return Buffer.concat([fixedHeader, variableHeader, payload]);
  }

  private encodeRemainingLength(length: number): Buffer {
    const encoded: number[] = [];
    let num = length;
    
    do {
      let digit = num % 128;
      num = Math.floor(num / 128);
      if (num > 0) {
        digit |= 0x80;
      }
      encoded.push(digit);
    } while (num > 0);
    
    return Buffer.from(encoded);
  }

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
    
    const fixedHeader = Buffer.concat([Buffer.from([0x82]), remainingLengthBuf]);
    
    return Buffer.concat([fixedHeader, payload]);
  }

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
    
    const fixedHeaderByte = 0x30 | (message.qos << 1) | (message.retain ? 1 : 0);
    const fixedHeader = Buffer.concat([Buffer.from([fixedHeaderByte]), remainingLengthBuf]);
    
    return Buffer.concat([fixedHeader, variableHeader, message.payload]);
  }
}
