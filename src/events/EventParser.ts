/**
 * Event Parser for Panindigan
 * Parses MQTT messages into typed events — handles both JSON and zlib-compressed binary payloads
 */

import { inflateSync, inflateRawSync } from 'zlib';
import { logger } from '../utils/Logger.js';
import type {
  PanindiganEvent,
  MessageEvent,
  MessageReactionEvent,
  TypingEvent,
  ReadReceiptEvent,
  DeliveryReceiptEvent,
  PresenceEvent,
  ThreadRenameEvent,
  ThreadColorEvent,
  ThreadEmojiEvent,
  ThreadImageEvent,
  ThreadNicknameEvent,
  ThreadParticipantsEvent,
  ThreadAdminEvent,
  ThreadLeaveEvent,
  CallEvent,
  MessageAttachment,
  Mention,
  ThreadColor,
} from '../types/index.js';

export class EventParser {
  /**
   * Parse an MQTT message based on topic.
   * Facebook may send JSON directly or zlib-compressed binary payloads — both are handled.
   */
  parse(topic: string, payload: Buffer): PanindiganEvent | null {
    const data = this.decodePayload(payload);
    if (data === null) return null;

    switch (topic) {
      case '/t_ms':
        return this.parseMessageSync(data);
      case '/t_rtc':
        return this.parseRTCEvent(data);
      case '/t_p':
        return this.parsePresence(data);
      case '/t_tn':
        return this.parseTypingNotification(data);
      case '/t_graphql':
        return this.parseGraphQLEvent(data);
      case '/t_messaging_events':
        return this.parseMessagingEvent(data);
      case '/t_notify':
        return this.parseNotifyEvent(data);
      default:
        if (topic.startsWith('mqtt_c2b_')) {
          return this.parseC2BEvent(data);
        }
        logger.debug('Unhandled topic', { topic });
        return null;
    }
  }

  /**
   * Decode a raw MQTT payload.
   * Tries JSON first; if that fails, tries zlib inflate (with and without header).
   */
  private decodePayload(payload: Buffer): Record<string, unknown> | null {
    // Try plain JSON first
    const str = payload.toString('utf8');
    if (str.trimStart().startsWith('{') || str.trimStart().startsWith('[')) {
      try {
        return JSON.parse(str) as Record<string, unknown>;
      } catch {
        // fall through to binary decompression
      }
    }

    // Try zlib inflate (deflate with zlib header)
    try {
      const inflated = inflateSync(payload);
      return JSON.parse(inflated.toString('utf8')) as Record<string, unknown>;
    } catch {
      // not zlib-wrapped
    }

    // Try raw deflate (no zlib wrapper — common in FB MQTT streams)
    try {
      const inflated = inflateRawSync(payload);
      return JSON.parse(inflated.toString('utf8')) as Record<string, unknown>;
    } catch {
      // not raw deflate
    }

    // Last attempt: strip possible for(;;); prefix and parse
    try {
      const stripped = str.replace(/^for\s*\(\s*;\s*;\s*\)\s*;\s*/, '');
      return JSON.parse(stripped) as Record<string, unknown>;
    } catch {
      logger.debug('Could not decode MQTT payload', { length: payload.length });
      return null;
    }
  }

  /**
   * Parse message sync events from /t_ms.
   * Facebook pushes all delta types through this topic.
   */
  private parseMessageSync(data: Record<string, unknown>): PanindiganEvent | null {
    // deltas array (Facebook sends batches)
    if (Array.isArray(data.deltas)) {
      for (const delta of data.deltas as unknown[]) {
        const parsed = this.parseDelta(delta);
        if (parsed) return parsed;
      }
    }

    // single delta wrapper
    if (data.delta) {
      return this.parseDelta(data.delta);
    }

    // some payloads carry the delta keys directly
    if (data.messageMetadata) {
      return this.parseNewMessage(data);
    }

    return null;
  }

  /**
   * Dispatch a single delta object to the appropriate parser.
   */
  private parseDelta(delta: unknown): PanindiganEvent | null {
    const d = delta as Record<string, unknown>;
    const cls = (d.class as string | undefined)?.toLowerCase() ?? '';

    // New message
    if (d.messageMetadata || cls === 'newmessage') {
      return this.parseNewMessage(d);
    }

    // Reaction add/remove
    if (cls === 'reactionmessage') {
      return this.parseReactionDelta(d);
    }

    // Unsend / delete
    if (cls === 'unsendmessage') {
      return this.parseUnsendDelta(d);
    }

    // Read receipt
    if (cls === 'readreceipt') {
      return this.parseReadReceiptDelta(d);
    }

    // Delivery receipt
    if (cls === 'deliveryreceipt') {
      return this.parseDeliveryReceiptDelta(d);
    }

    // Typing (sometimes arrives in /t_ms as well)
    if (cls === 'typing' || d.type === 'typ') {
      return this.parseTypingDelta(d);
    }

    // Thread rename
    if (cls === 'threadname' || d.deltaThreadName) {
      return this.parseThreadNameDelta(d);
    }

    // Admin text / system messages (participant added/removed, etc.)
    if (cls === 'admintext') {
      return this.parseAdminTextDelta(d);
    }

    // Legacy field-based reactions
    if (d.reaction) {
      return this.parseReactionDelta(d);
    }

    return null;
  }

  /**
   * Parse a NewMessage delta — the core event for incoming messages.
   */
  private parseNewMessage(d: Record<string, unknown>): MessageEvent | null {
    const meta = d.messageMetadata as Record<string, unknown> | undefined;
    if (!meta) return null;

    const threadKey = meta.threadKey as Record<string, string> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) {
      logger.debug('NewMessage: no thread ID', { threadKey });
      return null;
    }

    const isGroup = !!(threadKey?.threadFbId);
    const messageId = (meta.messageId as string) || `msg_${Date.now()}`;
    const senderId = (meta.actorFbId as string) || '';
    const timestamp = Number(meta.timestamp) || Date.now();

    const attachments = this.parseAttachments(d);
    const mentions = this.parseMentions(d);
    const stickerId = (d.stickerId as string) || undefined;
    const replyTo = (d.repliedToMessageId as string) || undefined;

    const event: MessageEvent = {
      type: 'message',
      timestamp,
      message: {
        messageId,
        threadId,
        senderId,
        body: (d.body as string) || '',
        timestamp,
        attachments,
        mentions,
        isGroup,
        reactions: [],
        isUnread: true,
        ...(stickerId && { sticker: stickerId }),
        ...(replyTo && { replyToMessage: replyTo }),
      },
    };

    logger.debug('Parsed message event', { threadId, isGroup, messageId, senderId });
    return event;
  }

  /**
   * Parse a ReactionMessage delta.
   */
  private parseReactionDelta(d: Record<string, unknown>): MessageReactionEvent | null {
    const threadKey =
      (d.threadKey as Record<string, string> | undefined) ||
      (d.messageKey as Record<string, Record<string, string>>)?.threadKey;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) return null;

    const reactionRaw =
      (d.reaction as string) ||
      ((d.reaction as Record<string, string> | undefined)?.reaction ?? '');

    const event: MessageReactionEvent = {
      type: 'message_reaction',
      timestamp: Date.now(),
      threadId,
      messageId: (d.messageId as string) || '',
      userId: (d.userFbId as string) || (d.actorFbId as string) || '',
      reaction: this.mapReaction(reactionRaw),
    };
    return event;
  }

  /**
   * Parse an UnsendMessage delta.
   */
  private parseUnsendDelta(d: Record<string, unknown>): PanindiganEvent | null {
    const threadKey = d.threadKey as Record<string, string> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) return null;

    return {
      type: 'message_unsend',
      timestamp: Date.now(),
      threadId,
      messageId: (d.messageId as string) || '',
      userId: (d.actorFbId as string) || '',
    } as unknown as PanindiganEvent;
  }

  /**
   * Parse a ReadReceipt delta.
   */
  private parseReadReceiptDelta(d: Record<string, unknown>): ReadReceiptEvent | null {
    const threadKey = d.threadKey as Record<string, string> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) return null;

    return {
      type: 'read_receipt',
      timestamp: Date.now(),
      threadId,
      userId: (d.actorFbId as string) || '',
      watermarkTimestamp: Number(d.actionTimestampMs) || Date.now(),
    };
  }

  /**
   * Parse a DeliveryReceipt delta.
   */
  private parseDeliveryReceiptDelta(d: Record<string, unknown>): DeliveryReceiptEvent | null {
    const threadKey = d.threadKey as Record<string, string> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) return null;

    return {
      type: 'delivery_receipt',
      timestamp: Date.now(),
      threadId,
      userId: (d.actorFbId as string) || '',
      deliveredTimestamp: Number(d.deliveredWatermarkTimestampMs) || Date.now(),
    };
  }

  /**
   * Parse a typing delta arriving inside /t_ms.
   */
  private parseTypingDelta(d: Record<string, unknown>): TypingEvent | null {
    const threadKey =
      (d.threadKey as Record<string, string> | undefined) ||
      (d.thread_key as Record<string, string> | undefined);

    // Try threadKey first, then flat fields
    const threadId =
      this.extractThreadId(threadKey) ||
      (d.thread_fbid as string) ||
      (d.other_user_fbid as string) ||
      (d.threadId as string);

    if (!threadId) return null;

    return {
      type: 'typ',
      timestamp: Date.now(),
      threadId,
      userId: (d.sender_fbid as string) || (d.actorFbId as string) || '',
      isTyping: Number(d.state) === 1 || Number(d.typingStatus) === 1,
    };
  }

  /**
   * Parse an AdminText delta (thread renames, participant changes, etc.).
   */
  private parseAdminTextDelta(d: Record<string, unknown>): PanindiganEvent | null {
    const threadKey = d.threadKey as Record<string, string> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) return null;

    const body = (d.body as string) || '';
    const actorFbId = (d.actorFbId as string) || '';

    // Thread rename
    if (body.includes('named the group') || d.adminText === 'group_name_change') {
      const event: ThreadRenameEvent = {
        type: 'thread_rename',
        timestamp: Date.now(),
        threadId,
        author: actorFbId,
        name: (d.name as string) || '',
      };
      return event;
    }

    // Participants added
    if (body.includes('added') || d.adminText === 'group_add') {
      const event: ThreadParticipantsEvent = {
        type: 'thread_add_participants',
        timestamp: Date.now(),
        threadId,
        author: actorFbId,
        participantIds: (d.addedParticipants as string[]) || [],
      };
      return event;
    }

    // Participants removed
    if (body.includes('removed') || d.adminText === 'group_remove') {
      const event: ThreadParticipantsEvent = {
        type: 'thread_remove_participants',
        timestamp: Date.now(),
        threadId,
        author: actorFbId,
        participantIds: (d.removedParticipants as string[]) || [],
      };
      return event;
    }

    return null;
  }

  /**
   * Parse a thread-name delta (from /t_ms or /t_graphql).
   */
  private parseThreadNameDelta(d: Record<string, unknown>): ThreadRenameEvent | null {
    const inner = (d.deltaThreadName as Record<string, unknown>) || d;
    const threadKey = inner.threadKey as Record<string, string> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) return null;

    return {
      type: 'thread_rename',
      timestamp: Date.now(),
      threadId,
      author: (inner.actorFbId as string) || '',
      name: (inner.name as string) || '',
    };
  }

  /**
   * Parse RTC (Real-Time Call) events from /t_rtc.
   */
  private parseRTCEvent(data: Record<string, unknown>): CallEvent | null {
    if (!data.callState) return null;

    return {
      type: 'call',
      timestamp: Date.now(),
      callId: (data.callId as string) || '',
      threadId: (data.threadId as string) || '',
      callerId: (data.callerId as string) || '',
      isVideo: !!(data.isVideoCall),
      isGroupCall: !!(data.isGroupCall),
      status: this.mapCallState(data.callState as string),
      duration: data.duration as number,
    };
  }

  /**
   * Parse presence updates from /t_p.
   * FB sends presence as either a plain object or a list.
   */
  private parsePresence(data: Record<string, unknown>): PresenceEvent | null {
    // Single presence update
    if (data.userId || data.uid) {
      return {
        type: 'presence',
        timestamp: Date.now(),
        userId: (data.userId as string) || (data.uid as string),
        status: this.mapPresenceStatus(data.status as string),
        lastActive: data.lastActive as number,
      };
    }

    // Bulk presence map  { "<uid>": { "p": 2, "lat": 1234567890 }, ... }
    const keys = Object.keys(data).filter((k) => /^\d+$/.test(k));
    if (keys.length > 0) {
      const uid = keys[0];
      const entry = data[uid] as Record<string, unknown>;
      const p = Number(entry.p);
      let status: 'active' | 'idle' | 'offline' = 'offline';
      if (p === 2) status = 'active';
      else if (p === 0) status = 'idle';

      return {
        type: 'presence',
        timestamp: Date.now(),
        userId: uid,
        status,
        lastActive: entry.lat as number,
      };
    }

    return null;
  }

  /**
   * Parse typing notifications from /t_tn.
   */
  private parseTypingNotification(data: Record<string, unknown>): TypingEvent | null {
    // Extract thread ID from thread_key or direct fields
    const threadKey =
      (data.thread_key as Record<string, string> | undefined) ||
      (data.threadKey as Record<string, string> | undefined);

    const threadId =
      this.extractThreadId(threadKey) ||
      (threadKey?.thread_fbid as string) ||
      (data.to as string) ||
      (data.threadId as string);

    if (!threadId) return null;

    return {
      type: 'typ',
      timestamp: Date.now(),
      threadId,
      userId: (data.sender_fbid as string) || (data.from as string) || '',
      isTyping: Number(data.state) === 1 || Number(data.typ) === 1,
    };
  }

  /**
   * Parse GraphQL events from /t_graphql.
   * Facebook sends structured thread-level mutations through this topic.
   */
  private parseGraphQLEvent(data: Record<string, unknown>): PanindiganEvent | null {
    if (data.deltaThreadName) {
      const delta = data.deltaThreadName as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadRenameEvent = {
        type: 'thread_rename',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || threadKey?.otherUserFbId || '',
        author: delta.actorFbId as string,
        name: delta.name as string,
      };
      return event;
    }

    if (data.deltaThreadColor) {
      const delta = data.deltaThreadColor as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadColorEvent = {
        type: 'thread_color',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        color: (delta.color as ThreadColor),
      };
      return event;
    }

    if (data.deltaThreadIcon) {
      const delta = data.deltaThreadIcon as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadEmojiEvent = {
        type: 'thread_emoji',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        emoji: delta.emoji as string,
      };
      return event;
    }

    if (data.deltaThreadImage) {
      const delta = data.deltaThreadImage as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadImageEvent = {
        type: 'thread_image',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        imageUrl: delta.imageUrl as string,
      };
      return event;
    }

    if (data.deltaNickname) {
      const delta = data.deltaNickname as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadNicknameEvent = {
        type: 'thread_nickname',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantId: delta.participantId as string,
        nickname: delta.nickname as string,
      };
      return event;
    }

    if (data.deltaParticipantsAdded) {
      const delta = data.deltaParticipantsAdded as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadParticipantsEvent = {
        type: 'thread_add_participants',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: (delta.participantIds as string[]) || [],
      };
      return event;
    }

    if (data.deltaParticipantsRemoved) {
      const delta = data.deltaParticipantsRemoved as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadParticipantsEvent = {
        type: 'thread_remove_participants',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: (delta.participantIds as string[]) || [],
      };
      return event;
    }

    if (data.deltaAdminAdded) {
      const delta = data.deltaAdminAdded as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadAdminEvent = {
        type: 'thread_promote',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: (delta.participantIds as string[]) || [],
      };
      return event;
    }

    if (data.deltaAdminRemoved) {
      const delta = data.deltaAdminRemoved as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadAdminEvent = {
        type: 'thread_demote',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: (delta.participantIds as string[]) || [],
      };
      return event;
    }

    if (data.deltaLeftThread) {
      const delta = data.deltaLeftThread as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadLeaveEvent = {
        type: 'thread_leave',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        userId: delta.actorFbId as string,
      };
      return event;
    }

    // Forward generic message sync deltas
    return this.parseMessageSync(data);
  }

  /**
   * Parse messaging events from /t_messaging_events.
   */
  private parseMessagingEvent(data: Record<string, unknown>): PanindiganEvent | null {
    if (data.readReceipt) {
      const receipt = data.readReceipt as Record<string, unknown>;
      const threadKey = receipt.threadKey as Record<string, string> | undefined;
      const threadId = this.extractThreadId(threadKey) || (receipt.threadId as string);
      return {
        type: 'read_receipt',
        timestamp: Date.now(),
        threadId: threadId || '',
        userId: (receipt.actorFbId as string) || '',
        watermarkTimestamp: Number(receipt.watermarkTimestamp) || Date.now(),
      } as ReadReceiptEvent;
    }

    if (data.deliveryReceipt) {
      const receipt = data.deliveryReceipt as Record<string, unknown>;
      const threadKey = receipt.threadKey as Record<string, string> | undefined;
      const threadId = this.extractThreadId(threadKey) || (receipt.threadId as string);
      return {
        type: 'delivery_receipt',
        timestamp: Date.now(),
        threadId: threadId || '',
        userId: (receipt.actorFbId as string) || '',
        deliveredTimestamp: Number(receipt.deliveredTimestamp) || Date.now(),
      } as DeliveryReceiptEvent;
    }

    // Some platforms also route new messages here
    return this.parseMessageSync(data);
  }

  /**
   * Parse /t_notify events (push notifications, generic alerts).
   */
  private parseNotifyEvent(data: Record<string, unknown>): PanindiganEvent | null {
    // Notifications that carry a delta array inside
    if (Array.isArray(data.deltas)) {
      for (const delta of data.deltas as unknown[]) {
        const parsed = this.parseDelta(delta);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  /**
   * Parse C2B (personal/C2B MQTT topic) events.
   */
  private parseC2BEvent(data: Record<string, unknown>): PanindiganEvent | null {
    return this.parseMessageSync(data);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Extract thread ID from a threadKey object.
   * Group chats expose threadFbId; 1-1 chats expose otherUserFbId.
   */
  private extractThreadId(
    threadKey: Record<string, string> | undefined
  ): string | null {
    if (!threadKey) return null;
    return (
      threadKey.threadFbId ||
      threadKey.thread_fbid ||
      threadKey.otherUserFbId ||
      threadKey.other_user_fbid ||
      null
    );
  }

  /**
   * Parse the attachments array from a delta, normalising each entry.
   */
  private parseAttachments(delta: Record<string, unknown>): MessageAttachment[] {
    if (!Array.isArray(delta.attachments)) return [];
    return (delta.attachments as Record<string, unknown>[]).map((a) => {
      const type =
        (a.attach_type as string) ||
        (a.type as string) ||
        'file';

      return {
        id: (a.id as string) || (a.fbid as string) || '',
        type,
        name: (a.name as string) || '',
        url:
          (a.url as string) ||
          (a.preview_url as string) ||
          (a.large_preview_url as string) ||
          '',
        mimeType: (a.mime_type as string) || '',
        fileSize: Number(a.file_size) || undefined,
        width: Number(a.original_dimensions_width) || undefined,
        height: Number(a.original_dimensions_height) || undefined,
      } as MessageAttachment;
    });
  }

  /**
   * Parse @-mentions from a delta.
   */
  private parseMentions(delta: Record<string, unknown>): Mention[] {
    if (!Array.isArray(delta.mentions)) return [];
    return (delta.mentions as Record<string, unknown>[]).map((m) => ({
      id: (m.id as string) || (m.user_id as string) || '',
      tag: (m.tag as string) || (m.name as string) || '',
      offset: Number(m.offset) || 0,
      length: Number(m.length) || 0,
    }));
  }

  /**
   * Map a raw reaction emoji or string to a canonical reaction type.
   */
  private mapReaction(
    reaction: string
  ): 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'care' | null {
    const map: Record<string, 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'care'> = {
      '👍': 'like',
      '❤️': 'love',
      '😆': 'haha',
      '😮': 'wow',
      '😢': 'sad',
      '😠': 'angry',
      '🥰': 'care',
      like: 'like',
      love: 'love',
      haha: 'haha',
      wow: 'wow',
      sad: 'sad',
      angry: 'angry',
      care: 'care',
    };
    return map[reaction] ?? null;
  }

  /**
   * Map a presence status string to a typed value.
   */
  private mapPresenceStatus(status: string): 'active' | 'idle' | 'offline' {
    switch (status?.toUpperCase()) {
      case 'ACTIVE': return 'active';
      case 'IDLE': return 'idle';
      default: return 'offline';
    }
  }

  /**
   * Map a call state string to a typed value.
   */
  private mapCallState(state: string): 'started' | 'ended' | 'missed' {
    switch (state?.toUpperCase()) {
      case 'STARTED': return 'started';
      case 'ENDED': return 'ended';
      default: return 'missed';
    }
  }
}
