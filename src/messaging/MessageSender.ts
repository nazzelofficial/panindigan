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
  FACEBOOK_EDIT_MESSAGE_URL,
  FACEBOOK_FORWARD_MESSAGE_URL,
  REACTION_EMOJIS,
} from '../utils/Constants.js';
import {
  generateOfflineThreadingId,
  generateClientMutationId,
  sleep,
} from '../utils/Helpers.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
import type { CheckpointGuard } from '../security/CheckpointGuard.js';
import type { EntropyPool } from '../security/EntropyPool.js';
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
  private checkpointGuard?: CheckpointGuard;
  private entropyPool?: EntropyPool;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /** Attach a CheckpointGuard to gate every outgoing send. */
  setCheckpointGuard(guard: CheckpointGuard): void {
    this.checkpointGuard = guard;
  }

  /** Attach an EntropyPool to source CSPRNG bits for offline_threading_id. */
  setEntropyPool(pool: EntropyPool): void {
    this.entropyPool = pool;
  }

  /** Generate an offline threading ID, preferring CSPRNG pool when available. */
  private newOfflineId(): string {
    return this.entropyPool
      ? this.entropyPool.nextOfflineId()
      : generateOfflineThreadingId();
  }

  /**
   * Send a message to a thread via POST /messaging/send/.
   *
   * For group threads supply isGroup=true (default) and threadId becomes thread_fbid.
   * For 1-1 conversations supply isGroup=false and threadId becomes other_user_fbid.
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { threadId, options, userId, isGroup = true } = params;

    // Handle special message types
    if (options.location) {
      return this.sendLocation(threadId, options.location, userId, isGroup);
    }
    if (options.contact) {
      return this.sendContact(threadId, options.contact, userId, isGroup);
    }

    logger.debug('Sending message', {
      threadId,
      isGroup,
      body: options.body?.substring(0, 60),
    });

    // Gate send on checkpoint/burst state; get any adaptive delay
    let adaptiveDelay = 0;
    if (this.checkpointGuard) {
      adaptiveDelay = this.checkpointGuard.recordSend(); // throws if blocked
    }

    const offlineThreadingId = this.newOfflineId();
    const clientMutationId = generateClientMutationId();
    const now = Date.now();
    const hasAttachment =
      !!(options.attachments && options.attachments.length > 0) ||
      !!(options.sticker) ||
      !!(options.gifUrl) ||
      !!(options.voice);

    // syncGroup: 1 = main inbox, 2 = message requests; always send as Messenger Web does
    const syncGroup = options.syncGroup ?? 1;

    // Base payload — identical to what the Messenger web app sends
    const form: Record<string, string> = {
      action_type: 'ma-type:user-generated-message',
      author: `fbid:${userId}`,
      body: options.body || '',
      client_mutation_id: String(clientMutationId),
      has_attachment: String(hasAttachment),
      html_body: 'false',
      initiating_source: options.initiatingSource || 'source:chat:web',
      is_filtered_content: 'false',
      is_filtered_content_account: 'false',
      is_filtered_content_bh: 'false',
      is_forward: 'false',
      is_user_generated: 'true',
      message_source_data: JSON.stringify({
        source: options.initiatingSource || 'source:chat:web',
        web_messenger_campaign_id: null,
      }),
      offline_threading_id: offlineThreadingId,
      source: options.initiatingSource || 'source:chat:web',
      sync_group: String(syncGroup),
      timestamp: String(now),
    };

    // Thread target — group vs 1-1
    if (isGroup) {
      form['thread_fbid'] = threadId;
    } else {
      form['other_user_fbid'] = threadId;
    }

    // Ephemeral message TTL (Vanish Mode / disappearing messages)
    if (options.ephemeralTtl && options.ephemeralTtl > 0) {
      form['ephemeral_ttl_mode'] = '1';
      form['ttl'] = String(options.ephemeralTtl);
    }

    // Sticker
    if (options.sticker) {
      form['sticker_id'] = options.sticker;
    }

    // GIF (animated image) — Tenor/GIPHY URL
    if (options.gifUrl) {
      form['animated_image_url'] = options.gifUrl;
      form['animated_image_width'] = '500';
      form['animated_image_height'] = '375';
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

    // Attachments (already uploaded — attachment IDs or UploadableFile w/ mimeType).
    // Facebook expects different field names depending on the media type:
    //   image_ids[N]  — photos
    //   video_ids[N]  — videos
    //   audio_ids[N]  — audio / voice mails
    //   file_ids[N]   — documents / other
    if (options.attachments && options.attachments.length > 0) {
      options.attachments.forEach((att, i) => {
        if (typeof att === 'string') {
          // Bare string: pre-uploaded ID whose type is unknown — default to image.
          form[`image_ids[${i}]`] = att;
        } else if (Buffer.isBuffer(att)) {
          // Raw buffers must be uploaded first; skip silently (caller should use
          // uploadImage/uploadVideo/etc. before calling sendMessage).
        } else {
          // UploadableFile with optional mimeType — route to the right field name.
          const { buffer: _buf, path: _path, name, mimeType } = att as import('../types/index.js').UploadableFile;
          const id = name; // treat 'name' as the pre-uploaded attachment ID when no buffer
          if (!id) return;
          const mt = mimeType?.toLowerCase() ?? '';
          if (mt.startsWith('video/')) {
            form[`video_ids[${i}]`] = id;
          } else if (mt.startsWith('audio/')) {
            form[`audio_ids[${i}]`] = id;
          } else if (mt.startsWith('application/') || mt.startsWith('text/')) {
            form[`file_ids[${i}]`] = id;
          } else {
            form[`image_ids[${i}]`] = id;
          }
        }
      });
    }

    // Client tags (custom metadata for analytics)
    if (options.clientTags && options.clientTags.length > 0) {
      form['client_tags'] = JSON.stringify(options.clientTags);
    }

    // Silent message flag
    if (options.isSilent) {
      form['is_silent'] = 'true';
    }

    // Apply adaptive burst delay before the network call
    if (adaptiveDelay > 0) {
      await sleep(adaptiveDelay);
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
   * Send a location attachment.
   * Facebook represents location as a structured attachment in the message.
   */
  private async sendLocation(
    threadId: string,
    location: { latitude: number; longitude: number; name?: string; address?: string },
    userId: string,
    isGroup: boolean
  ): Promise<SendMessageResult> {
    const offlineThreadingId = this.newOfflineId();
    const clientMutationId = generateClientMutationId();
    const now = Date.now();

    const form: Record<string, string> = {
      action_type: 'ma-type:user-generated-message',
      author: `fbid:${userId}`,
      body: '',
      client_mutation_id: String(clientMutationId),
      has_attachment: 'true',
      is_user_generated: 'true',
      location_attachment: JSON.stringify({
        coordinates: {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        ...(location.name ? { name: location.name } : {}),
        ...(location.address ? { address: location.address } : {}),
      }),
      offline_threading_id: offlineThreadingId,
      source: 'source:chat:web',
      sync_group: '1',
      timestamp: String(now),
    };

    if (isGroup) {
      form['thread_fbid'] = threadId;
    } else {
      form['other_user_fbid'] = threadId;
    }

    const result = await this.graphqlClient.formPost<{
      payload?: { message_id?: string; timestamp_precise?: string };
    }>(FACEBOOK_SEND_URL, form);

    const messageId = result?.payload?.message_id || `mid.${offlineThreadingId}`;
    const timestamp = result?.payload?.timestamp_precise
      ? Number(result.payload.timestamp_precise)
      : now;

    logger.logMessage('sent', threadId, messageId, undefined);
    return { messageId, timestamp, threadId };
  }

  /**
   * Send a contact card attachment.
   */
  private async sendContact(
    threadId: string,
    contact: { userId: string; name: string; phone?: string; email?: string },
    userId: string,
    isGroup: boolean
  ): Promise<SendMessageResult> {
    const offlineThreadingId = this.newOfflineId();
    const clientMutationId = generateClientMutationId();
    const now = Date.now();

    const form: Record<string, string> = {
      action_type: 'ma-type:user-generated-message',
      author: `fbid:${userId}`,
      body: '',
      client_mutation_id: String(clientMutationId),
      has_attachment: 'true',
      is_user_generated: 'true',
      contact_fbid: contact.userId,
      offline_threading_id: offlineThreadingId,
      source: 'source:chat:web',
      sync_group: '1',
      timestamp: String(now),
    };

    if (isGroup) {
      form['thread_fbid'] = threadId;
    } else {
      form['other_user_fbid'] = threadId;
    }

    const result = await this.graphqlClient.formPost<{
      payload?: { message_id?: string; timestamp_precise?: string };
    }>(FACEBOOK_SEND_URL, form);

    const messageId = result?.payload?.message_id || `mid.${offlineThreadingId}`;
    const timestamp = result?.payload?.timestamp_precise
      ? Number(result.payload.timestamp_precise)
      : now;

    logger.logMessage('sent', threadId, messageId, undefined);
    return { messageId, timestamp, threadId };
  }

  /**
   * Edit a message body via POST /messaging/edit_message/
   */
  async editMessage(messageId: string, body: string): Promise<boolean> {
    logger.debug('Editing message', { messageId, body: body.substring(0, 60) });

    try {
      await this.graphqlClient.formPost(FACEBOOK_EDIT_MESSAGE_URL, {
        message_id: messageId,
        body,
      });
      return true;
    } catch (error) {
      logger.error('Failed to edit message', error);
      return false;
    }
  }

  /**
   * Forward a message to another thread via POST /messaging/forward_message/
   */
  async forwardMessage(
    messageId: string,
    threadId: string,
    isGroup: boolean = true
  ): Promise<SendMessageResult> {
    logger.debug('Forwarding message', { messageId, threadId });

    const offlineThreadingId = this.newOfflineId();
    const now = Date.now();

    const form: Record<string, string> = {
      message_id: messageId,
      offline_threading_id: offlineThreadingId,
      is_forward: 'true',
      source: 'source:chat:web',
      sync_group: '1',
    };

    if (isGroup) {
      form['thread_fbid'] = threadId;
    } else {
      form['other_user_fbid'] = threadId;
    }

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: { message_id?: string; timestamp_precise?: string };
      }>(FACEBOOK_FORWARD_MESSAGE_URL, form);

      const newMessageId = result?.payload?.message_id || `mid.${offlineThreadingId}`;
      const timestamp = result?.payload?.timestamp_precise
        ? Number(result.payload.timestamp_precise)
        : now;

      return { messageId: newMessageId, timestamp, threadId };
    } catch (error) {
      logger.error('Failed to forward message', error);
      throw error;
    }
  }

  /**
   * Send a typing indicator via POST /ajax/messaging/typ.php
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
   * Mark a thread as read via POST /ajax/mercury/change_read_status.php
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
   * Send a delivery receipt via POST /ajax/mercury/delivery_receipts.php
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
   * Unsend (delete for everyone) a message via POST /messaging/unsend_message/
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
   * React to a message via POST /messaging/message_reactions/
   * Pass reaction=null or an empty string to remove an existing reaction.
   * Accepts either a ReactionType name ('like', 'love', etc.) or a raw emoji.
   */
  async reactToMessage(
    messageId: string,
    reaction: string | null
  ): Promise<boolean> {
    // Map named reaction type to emoji if needed
    const reactionEmoji =
      reaction === null
        ? ''
        : REACTION_EMOJIS[reaction] ?? reaction;

    try {
      await this.graphqlClient.formPost(FACEBOOK_REACTION_URL, {
        message_id: messageId,
        reaction: reactionEmoji,
      });
      return true;
    } catch (error) {
      logger.error('Failed to react to message', error);
      return false;
    }
  }

  // ─── Text helpers ──────────────────────────────────────────────────────────

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
