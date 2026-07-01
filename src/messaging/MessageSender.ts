/**
 * Message Sender for Panindigan
 * Uses the real Facebook /messaging/send/ form endpoint with offline threading IDs.
 */

import { logger } from '../utils/Logger.js';
import {
  FACEBOOK_SEND_URL,
  FACEBOOK_TYPING_URL,
  FACEBOOK_MARK_READ_URL,
  FACEBOOK_MARK_DELIVERED_URL,
  FACEBOOK_UNSEND_URL,
  FACEBOOK_REACTION_URL,
} from '../utils/Constants.js';
import {
  generateOfflineThreadingId,
  generateClientMutationId,
} from '../utils/Helpers.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
import type {
  SendMessageOptions,
  SendMessageResult,
  Mention,
} from '../types/index.js';

export interface SendMessageParams {
  threadId: string;
  options: SendMessageOptions;
  userId: string;
  fbDtsg: string;
  /** Pass true when threadId is a group/multi-person thread. Defaults to true. */
  isGroup?: boolean;
}

export class MessageSender {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Send a message to a thread via POST /messaging/send/.
   *
   * For group threads supply isGroup=true (default) and threadId becomes thread_fbid.
   * For 1-1 conversations supply isGroup=false and threadId becomes other_user_fbid.
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { threadId, options, userId, isGroup = true } = params;

    logger.debug('Sending message', {
      threadId,
      isGroup,
      body: options.body?.substring(0, 60),
    });

    const offlineThreadingId = generateOfflineThreadingId();
    const clientMutationId = generateClientMutationId();
    const now = Date.now();
    const hasAttachment =
      !!(options.attachments && options.attachments.length > 0) ||
      !!(options.sticker);

    // Base payload — identical to what the Messenger web app sends
    const form: Record<string, string> = {
      action_type: 'ma-type:user-generated-message',
      author: `fbid:${userId}`,
      body: options.body || '',
      client_mutation_id: String(clientMutationId),
      has_attachment: String(hasAttachment),
      html_body: 'false',
      is_filtered_content: 'false',
      is_filtered_content_account: 'false',
      is_filtered_content_bh: 'false',
      is_forward: 'false',
      is_user_generated: 'true',
      message_source_data: JSON.stringify({
        source: 'source:chat:web',
        web_messenger_campaign_id: null,
      }),
      offline_threading_id: offlineThreadingId,
      source: 'source:chat:web',
      timestamp: String(now),
    };

    // Thread target — group vs 1-1
    if (isGroup) {
      form['thread_fbid'] = threadId;
    } else {
      form['other_user_fbid'] = threadId;
    }

    // Sticker
    if (options.sticker) {
      form['sticker_id'] = options.sticker;
    }

    // Reply-to
    if (options.replyToMessage) {
      form['replied_to_message_id'] = options.replyToMessage;
    }

    // Emoji shorthand (sending a single large emoji)
    if (options.emoji) {
      form['body'] = options.emoji;
      if (options.emojiSize) {
        form['emoji_size'] = options.emojiSize;
      }
    }

    // @-Mentions — Facebook expects profile_xmd[N][field]=value
    if (options.mentions && options.mentions.length > 0) {
      options.mentions.forEach((m: Mention, i: number) => {
        form[`profile_xmd[${i}][id]`] = m.id;
        form[`profile_xmd[${i}][offset]`] = String(m.offset);
        form[`profile_xmd[${i}][length]`] = String(m.length);
        form[`profile_xmd[${i}][type]`] = 'p';
      });
    }

    // Attachments (already uploaded — attachment IDs)
    if (options.attachments && options.attachments.length > 0) {
      options.attachments.forEach((att, i) => {
        if (typeof att === 'string') {
          form[`image_ids[${i}]`] = att;
        }
      });
    }

    // Silent message flag
    if (options.isSilent) {
      form['is_silent'] = 'true';
    }

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          message_id?: string;
          timestamp_precise?: string;
        };
        error?: unknown;
      }>(FACEBOOK_SEND_URL, form);

      const messageId =
        result?.payload?.message_id || `mid.${offlineThreadingId}`;
      const timestamp = result?.payload?.timestamp_precise
        ? Number(result.payload.timestamp_precise)
        : now;

      logger.logMessage('sent', threadId, messageId, options.body);

      return { messageId, timestamp, threadId };
    } catch (error) {
      logger.error('Failed to send message', error);
      throw error;
    }
  }

  /**
   * Send a typing indicator via POST /ajax/messaging/typ.php.
   */
  async sendTypingIndicator(
    threadId: string,
    isTyping: boolean,
    isGroup: boolean = true
  ): Promise<boolean> {
    try {
      const form: Record<string, string> = {
        typ: isTyping ? '1' : '0',
        source: 'mercury',
      };

      if (isGroup) {
        form['thread[thread_fbid]'] = threadId;
      } else {
        form['to'] = threadId;
      }

      await this.graphqlClient.formPost(FACEBOOK_TYPING_URL, form);
      return true;
    } catch (error) {
      logger.error('Failed to send typing indicator', error);
      return false;
    }
  }

  /**
   * Mark a thread as read via POST /ajax/mercury/change_read_status.php.
   */
  async markAsRead(threadId: string): Promise<boolean> {
    try {
      await this.graphqlClient.formPost(FACEBOOK_MARK_READ_URL, {
        [`ids[${threadId}]`]: 'true',
        shouldSendReadReceipt: 'true',
        watermarkTimestamp: String(Date.now()),
        syncGroup: '1',
      });
      return true;
    } catch (error) {
      logger.error('Failed to mark as read', error);
      return false;
    }
  }

  /**
   * Send a delivery receipt via POST /ajax/mercury/delivery_receipts.php.
   */
  async markAsDelivered(threadId: string, messageId: string): Promise<boolean> {
    try {
      await this.graphqlClient.formPost(FACEBOOK_MARK_DELIVERED_URL, {
        thread_fbid: threadId,
        message_id: messageId,
        delivered_watermark_timestamp: String(Date.now()),
      });
      return true;
    } catch (error) {
      logger.error('Failed to mark as delivered', error);
      return false;
    }
  }

  /**
   * Unsend (delete for everyone) a message via POST /messaging/unsend_message/.
   */
  async unsendMessage(messageId: string): Promise<boolean> {
    try {
      await this.graphqlClient.formPost(FACEBOOK_UNSEND_URL, {
        message_id: messageId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unsend message', error);
      return false;
    }
  }

  /**
   * React to a message via POST /messaging/message_reactions/.
   * Pass reaction=null or an empty string to remove an existing reaction.
   */
  async reactToMessage(
    messageId: string,
    reaction: string | null
  ): Promise<boolean> {
    try {
      await this.graphqlClient.formPost(FACEBOOK_REACTION_URL, {
        message_id: messageId,
        reaction: reaction ?? '',
      });
      return true;
    } catch (error) {
      logger.error('Failed to react to message', error);
      return false;
    }
  }

  // ─── Text helpers (unchanged) ──────────────────────────────────────────────

  /**
   * Format text with @-mention syntax embedded
   */
  formatTextWithMentions(text: string, mentions: Mention[]): string {
    const sorted = [...mentions].sort((a, b) => b.offset - a.offset);
    let out = text;
    for (const m of sorted) {
      out =
        out.substring(0, m.offset) +
        `@${m.tag}` +
        out.substring(m.offset + m.length);
    }
    return out;
  }

  /**
   * Parse @{userId} placeholders from text into Mention objects
   */
  parseMentions(text: string): { text: string; mentions: Mention[] } {
    const mentions: Mention[] = [];
    const regex = /@\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    let offset = 0;

    while ((match = regex.exec(text)) !== null) {
      const full = match[0];
      const uid = match[1];
      const pos = match.index - offset;

      mentions.push({
        tag: uid,
        id: uid,
        offset: pos,
        length: full.length,
      });

      text =
        text.substring(0, pos) +
        `@${uid}` +
        text.substring(pos + full.length);
      offset += full.length - `@${uid}`.length;
    }

    return { text, mentions };
  }

  /**
   * Apply Messenger-compatible rich text formatting markers
   */
  applyFormatting(
    text: string,
    formatting: {
      bold?: boolean;
      italic?: boolean;
      strikethrough?: boolean;
      monospace?: boolean;
    }
  ): string {
    let out = text;
    if (formatting.bold) out = `**${out}**`;
    if (formatting.italic) out = `_${out}_`;
    if (formatting.strikethrough) out = `~${out}~`;
    if (formatting.monospace) out = `\`${out}\``;
    return out;
  }
}
