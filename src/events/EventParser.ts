/**
 * Event Parser for Panindigan
 * Parses MQTT messages into typed events
 */

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
} from '../types/index.js';

export class EventParser {
  /**
   * Parse an MQTT message based on topic
   */
  parse(topic: string, payload: Buffer): PanindiganEvent | null {
    try {
      const data = JSON.parse(payload.toString());

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
        default:
          if (topic.startsWith('/mqtt_c2b_')) {
            return this.parseC2BEvent(data);
          }
          logger.debug('Unhandled topic', { topic });
          return null;
      }
    } catch (error) {
      logger.debug('Failed to parse event payload', { topic, error });
      return null;
    }
  }

  /**
   * Parse message sync events (handles both 1-1 and group messages)
   */
  private parseMessageSync(data: unknown): PanindiganEvent | null {
    const msgData = data as Record<string, unknown>;

    // Handle deltas array (Facebook can send multiple events)
    if (msgData.deltas && Array.isArray(msgData.deltas)) {
      const deltas = msgData.deltas as unknown[];
      for (const delta of deltas) {
        const parsed = this.parseDelta(delta);
        if (parsed) {
          return parsed;
        }
      }
    }

    // Handle single delta
    if (msgData.delta) {
      return this.parseDelta(msgData.delta);
    }

    // Handle direct message structure
    if (msgData.messageMetadata) {
      return this.parseDirectDelta(msgData);
    }

    return null;
  }

  /**
   * Parse a single delta and extract message or event
   */
  private parseDelta(delta: unknown): PanindiganEvent | null {
    const deltaData = delta as Record<string, unknown>;

    // Parse new messages with metadata
    if (deltaData.messageMetadata) {
      const metadata = deltaData.messageMetadata as Record<string, unknown>;
      const threadKey = metadata.threadKey as Record<string, unknown> | undefined;

      // Extract thread ID - works for both 1-1 and group chats
      const threadId = this.extractThreadId(threadKey);
      if (!threadId) {
        logger.debug('Could not extract thread ID from message metadata', { threadKey });
        return null;
      }

      // Determine if it's a group chat
      const isGroup = !!(threadKey as Record<string, string> | undefined)?.threadFbId;

      const event: MessageEvent = {
        type: 'message',
        timestamp: Date.now(),
        message: {
          messageId: (metadata.messageId as string) || `msg_${Date.now()}`,
          threadId,
          senderId: (metadata.actorFbId as string) || '',
          body: (deltaData.body as string) || '',
          timestamp: (metadata.timestamp as number) || Date.now(),
          attachments: this.parseAttachments(deltaData) as unknown as import('../types/index.js').MessageAttachment[],
          mentions: this.parseMentions(deltaData) as unknown as import('../types/index.js').Mention[],
          isGroup,
          reactions: [],
          isUnread: true,
        },
      };

      logger.debug('Parsed message event', {
        threadId,
        isGroup,
        messageId: event.message.messageId,
        sender: event.message.senderId,
      });

      return event;
    }

    // Parse message reactions
    if (deltaData.reaction) {
      const reaction = deltaData.reaction as Record<string, unknown>;
      const threadKey = deltaData.threadKey as Record<string, unknown> | undefined;
      const threadId = this.extractThreadId(threadKey);

      if (!threadId) {
        return null;
      }

      const event: MessageReactionEvent = {
        type: 'message_reaction',
        timestamp: Date.now(),
        threadId,
        messageId: (reaction.messageId as string) || '',
        userId: (deltaData.actorFbId as string) || '',
        reaction: this.mapReaction((reaction.reaction as string) || ''),
      };
      return event;
    }

    return null;
  }

  /**
   * Parse direct delta structure
   */
  private parseDirectDelta(data: Record<string, unknown>): MessageEvent | null {
    const metadata = data.messageMetadata as Record<string, unknown> | undefined;
    if (!metadata) {
      return null;
    }

    const threadKey = metadata.threadKey as Record<string, unknown> | undefined;
    const threadId = this.extractThreadId(threadKey);
    if (!threadId) {
      return null;
    }

    const isGroup = !!(threadKey as Record<string, string> | undefined)?.threadFbId;

    return {
      type: 'message',
      timestamp: Date.now(),
      message: {
        messageId: (metadata.messageId as string) || `msg_${Date.now()}`,
        threadId,
        senderId: (metadata.actorFbId as string) || '',
        body: (data.body as string) || '',
        timestamp: (metadata.timestamp as number) || Date.now(),
        attachments: this.parseAttachments(data) as unknown as import('../types/index.js').MessageAttachment[],
        mentions: this.parseMentions(data) as unknown as import('../types/index.js').Mention[],
        isGroup,
        reactions: [],
        isUnread: true,
      },
    };
  }

  /**
   * Extract thread ID from threadKey (handles both group and 1-1)
   */
  private extractThreadId(threadKey: Record<string, unknown> | undefined): string | null {
    if (!threadKey) {
      return null;
    }

    // For group chats, use threadFbId
    if (threadKey.threadFbId) {
      return threadKey.threadFbId as string;
    }

    // For 1-1 chats, use otherUserFbId
    if (threadKey.otherUserFbId) {
      return threadKey.otherUserFbId as string;
    }

    return null;
  }

  /**
   * Parse attachments from delta
   */
  private parseAttachments(delta: Record<string, unknown>): unknown[] {
    const attachments = delta.attachments;
    if (!attachments || !Array.isArray(attachments)) {
      return [];
    }
    return attachments;
  }

  /**
   * Parse mentions from delta
   */
  private parseMentions(delta: Record<string, unknown>): unknown[] {
    const mentions = delta.mentions;
    if (!mentions || !Array.isArray(mentions)) {
      return [];
    }
    return mentions;
  }

  /**
   * Parse RTC (Real-Time Call) events
   */
  private parseRTCEvent(data: unknown): PanindiganEvent | null {
    const rtcData = data as Record<string, unknown>;

    if (rtcData.callState) {
      const event: CallEvent = {
        type: 'call',
        timestamp: Date.now(),
        callId: rtcData.callId as string,
        threadId: rtcData.threadId as string,
        callerId: rtcData.callerId as string,
        isVideo: rtcData.isVideoCall as boolean || false,
        isGroupCall: rtcData.isGroupCall as boolean || false,
        status: this.mapCallState(rtcData.callState as string),
        duration: rtcData.duration as number,
      };
      return event;
    }

    return null;
  }

  /**
   * Parse presence updates
   */
  private parsePresence(data: unknown): PresenceEvent | null {
    const presenceData = data as Record<string, unknown>;

    const event: PresenceEvent = {
      type: 'presence',
      timestamp: Date.now(),
      userId: presenceData.userId as string,
      status: this.mapPresenceStatus(presenceData.status as string),
      lastActive: presenceData.lastActive as number,
    };

    return event;
  }

  /**
   * Parse typing notifications
   */
  private parseTypingNotification(data: unknown): TypingEvent | null {
    const typingData = data as Record<string, unknown>;

    const event: TypingEvent = {
      type: 'typ',
      timestamp: Date.now(),
      threadId: typingData.threadId as string,
      userId: typingData.senderId as string,
      isTyping: typingData.typingStatus === 1,
    };

    return event;
  }

  /**
   * Parse GraphQL events
   */
  private parseGraphQLEvent(data: unknown): PanindiganEvent | null {
    const gqlData = data as Record<string, unknown>;

    // Parse thread updates
    if (gqlData.deltaThreadName) {
      const delta = gqlData.deltaThreadName as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadRenameEvent = {
        type: 'thread_rename',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        name: delta.name as string,
      };
      return event;
    }

    if (gqlData.deltaThreadColor) {
      const delta = gqlData.deltaThreadColor as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadColorEvent = {
        type: 'thread_color',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        color: delta.color as import('../types/index.js').ThreadColor,
      };
      return event;
    }

    if (gqlData.deltaThreadIcon) {
      const delta = gqlData.deltaThreadIcon as Record<string, unknown>;
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

    if (gqlData.deltaThreadImage) {
      const delta = gqlData.deltaThreadImage as Record<string, unknown>;
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

    if (gqlData.deltaNickname) {
      const delta = gqlData.deltaNickname as Record<string, unknown>;
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

    if (gqlData.deltaParticipantsAdded) {
      const delta = gqlData.deltaParticipantsAdded as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadParticipantsEvent = {
        type: 'thread_add_participants',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: delta.participantIds as string[],
      };
      return event;
    }

    if (gqlData.deltaParticipantsRemoved) {
      const delta = gqlData.deltaParticipantsRemoved as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadParticipantsEvent = {
        type: 'thread_remove_participants',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: delta.participantIds as string[],
      };
      return event;
    }

    if (gqlData.deltaAdminAdded) {
      const delta = gqlData.deltaAdminAdded as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadAdminEvent = {
        type: 'thread_promote',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: delta.participantIds as string[],
      };
      return event;
    }

    if (gqlData.deltaAdminRemoved) {
      const delta = gqlData.deltaAdminRemoved as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadAdminEvent = {
        type: 'thread_demote',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        author: delta.actorFbId as string,
        participantIds: delta.participantIds as string[],
      };
      return event;
    }

    if (gqlData.deltaLeftThread) {
      const delta = gqlData.deltaLeftThread as Record<string, unknown>;
      const threadKey = delta.threadKey as Record<string, string> | undefined;
      const event: ThreadLeaveEvent = {
        type: 'thread_leave',
        timestamp: Date.now(),
        threadId: threadKey?.threadFbId || '',
        userId: delta.actorFbId as string,
      };
      return event;
    }

    return null;
  }

  /**
   * Parse messaging events
   */
  private parseMessagingEvent(data: unknown): PanindiganEvent | null {
    const msgData = data as Record<string, unknown>;

    // Parse read receipts
    if (msgData.readReceipt) {
      const receipt = msgData.readReceipt as Record<string, unknown>;
      const event: ReadReceiptEvent = {
        type: 'read_receipt',
        timestamp: Date.now(),
        threadId: receipt.threadId as string,
        userId: receipt.actorFbId as string,
        watermarkTimestamp: receipt.watermarkTimestamp as number,
      };
      return event;
    }

    // Parse delivery receipts
    if (msgData.deliveryReceipt) {
      const receipt = msgData.deliveryReceipt as Record<string, unknown>;
      const event: DeliveryReceiptEvent = {
        type: 'delivery_receipt',
        timestamp: Date.now(),
        threadId: receipt.threadId as string,
        userId: receipt.actorFbId as string,
        deliveredTimestamp: receipt.deliveredTimestamp as number,
      };
      return event;
    }

    return null;
  }

  /**
   * Parse C2B (Client to Business) events
   */
  private parseC2BEvent(data: unknown): PanindiganEvent | null {
    // Handle personal message events
    return this.parseMessageSync(data);
  }

  /**
   * Map reaction string to ReactionType
   */
  private mapReaction(reaction: string): 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'care' | null {
    const reactionMap: Record<string, 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'care'> = {
      '👍': 'like',
      '❤️': 'love',
      '😆': 'haha',
      '😮': 'wow',
      '😢': 'sad',
      '😠': 'angry',
      '🥰': 'care',
    };
    return reactionMap[reaction] || null;
  }

  /**
   * Map presence status string
   */
  private mapPresenceStatus(status: string): 'active' | 'idle' | 'offline' {
    switch (status) {
      case 'ACTIVE':
      case 'active':
        return 'active';
      case 'IDLE':
      case 'idle':
        return 'idle';
      default:
        return 'offline';
    }
  }

  /**
   * Map call state string
   */
  private mapCallState(state: string): 'started' | 'ended' | 'missed' {
    switch (state) {
      case 'STARTED':
      case 'started':
        return 'started';
      case 'ENDED':
      case 'ended':
        return 'ended';
      default:
        return 'missed';
    }
  }
}
