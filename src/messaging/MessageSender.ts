/**
 * Message Sender for Panindigan
 * Handles sending text messages, media, and formatted content
 */

import { logger } from '../utils/Logger.js';
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
}

export class MessageSender {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Send a message
   */
  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { threadId, options } = params;

    logger.debug('Sending message', { threadId, body: options.body?.substring(0, 50) });

    // Build message data
    const messageData = this.buildMessageData(params);

    try {
      // Send via GraphQL
      const result = await this.graphqlClient.mutation<{
        sendMessage: {
          message: {
            message_id: string;
            timestamp: number;
          };
        };
      }>('MessageSendMutation', messageData);

      const messageId = result?.sendMessage?.message?.message_id || `msg_${Date.now()}`;
      const timestamp = result?.sendMessage?.message?.timestamp || Date.now();

      logger.logMessage('sent', threadId, messageId, options.body);

      return {
        messageId,
        timestamp,
        threadId,
      };
    } catch (error) {
      logger.error('Failed to send message', error);
      throw error;
    }
  }

  /**
   * Build message data for GraphQL
   */
  private buildMessageData(params: SendMessageParams): Record<string, unknown> {
    const { threadId, options, userId } = params;

    const data: Record<string, unknown> = {
      thread_id: threadId,
      body: options.body || '',
      author: userId,
    };

    // Add reply reference
    if (options.replyToMessage) {
      data.replied_to_message_id = options.replyToMessage;
    }

    // Add mentions
    if (options.mentions && options.mentions.length > 0) {
      data.mentions = options.mentions.map((m) => ({
        id: m.id,
        offset: m.offset,
        length: m.length,
      }));
    }

    // Add attachments
    if (options.attachments && options.attachments.length > 0) {
      data.attachments = options.attachments.map((att) => {
        if (typeof att === 'string') {
          return { id: att };
        }
        if (Buffer.isBuffer(att)) {
          return { buffer: att.toString('base64') };
        }
        return att;
      });
    }

    // Add sticker
    if (options.sticker) {
      data.sticker_id = options.sticker;
    }

    // Add emoji
    if (options.emoji) {
      data.emoji = options.emoji;
      data.emoji_size = options.emojiSize || 'medium';
    }

    // Silent message
    if (options.isSilent) {
      data.is_silent = true;
    }

    return data;
  }

  /**
   * Format text with mentions
   */
  formatTextWithMentions(text: string, mentions: Mention[]): string {
    // Sort mentions by offset in reverse order to replace from end to start
    const sortedMentions = [...mentions].sort((a, b) => b.offset - a.offset);
    
    let formattedText = text;
    for (const mention of sortedMentions) {
      const before = formattedText.substring(0, mention.offset);
      const after = formattedText.substring(mention.offset + mention.length);
      formattedText = `${before}@${mention.tag}${after}`;
    }
    
    return formattedText;
  }

  /**
   * Parse mentions from text
   */
  parseMentions(text: string): { text: string; mentions: Mention[] } {
    const mentions: Mention[] = [];
    const mentionRegex = /@\{([^}]+)\}/g;
    let match;
    let offset = 0;

    while ((match = mentionRegex.exec(text)) !== null) {
      const fullMatch = match[0];
      const userId = match[1];
      
      mentions.push({
        tag: userId,
        id: userId,
        offset: match.index - offset,
        length: fullMatch.length,
      });

      // Remove the mention syntax from text
      text = text.substring(0, match.index - offset) + `@${userId}` + text.substring(match.index - offset + fullMatch.length);
      offset += fullMatch.length - (`@${userId}`.length);
    }

    return { text, mentions };
  }

  /**
   * Apply rich text formatting
   */
  applyFormatting(text: string, formatting: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    monospace?: boolean;
  }): string {
    let formatted = text;

    if (formatting.bold) {
      formatted = `**${formatted}**`;
    }
    if (formatting.italic) {
      formatted = `_${formatted}_`;
    }
    if (formatting.strikethrough) {
      formatted = `~${formatted}~`;
    }
    if (formatting.monospace) {
      formatted = `\`${formatted}\``;
    }

    return formatted;
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(threadId: string, isTyping: boolean): Promise<boolean> {
    try {
      await this.graphqlClient.mutation('TypingIndicatorMutation', {
        thread_id: threadId,
        is_typing: isTyping,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send typing indicator', error);
      return false;
    }
  }

  /**
   * Mark messages as read
   */
  async markAsRead(threadId: string): Promise<boolean> {
    try {
      await this.graphqlClient.mutation('MarkAsReadMutation', {
        thread_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to mark as read', error);
      return false;
    }
  }

  /**
   * Mark messages as delivered
   */
  async markAsDelivered(threadId: string, messageId: string): Promise<boolean> {
    try {
      await this.graphqlClient.mutation('MarkAsDeliveredMutation', {
        thread_id: threadId,
        message_id: messageId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to mark as delivered', error);
      return false;
    }
  }
}
