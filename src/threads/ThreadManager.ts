/**
 * Thread Manager for Panindigan
 * Handles thread operations, group management, and settings
 */

import { logger } from '../utils/Logger.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
import type {
  Thread,
  ThreadType,
  ThreadColor,
  CreateGroupOptions,
  GetThreadListOptions,
  GetThreadListResult,
  ThreadHistoryResult,
  ThreadHistoryOptions,
} from '../types/index.js';

export class ThreadManager {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Get thread list
   */
  async getThreadList(options: GetThreadListOptions = {}): Promise<GetThreadListResult> {
    const limit = options.limit || 20;
    const folder = options.folder || 'inbox';

    logger.debug('Getting thread list', { limit, folder });

    try {
      const result = await this.graphqlClient.query<{
        viewer: {
          message_threads: {
            nodes: unknown[];
            page_info: {
              has_next_page: boolean;
              end_cursor: string;
            };
          };
        };
      }>('ThreadListQuery', {
        limit,
        folder,
        before: options.before,
      });

      const threads = result?.viewer?.message_threads?.nodes || [];
      const hasMore = result?.viewer?.message_threads?.page_info?.has_next_page || false;

      return {
        threads: threads.map((t) => this.parseThread(t)),
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to get thread list', error);
      throw error;
    }
  }

  /**
   * Get thread info
   */
  async getThreadInfo(threadId: string): Promise<Thread> {
    logger.debug('Getting thread info', { threadId });

    try {
      const result = await this.graphqlClient.query<{
        thread: unknown;
      }>('ThreadInfoQuery', {
        thread_id: threadId,
      });

      return this.parseThread(result?.thread);
    } catch (error) {
      logger.error('Failed to get thread info', error);
      throw error;
    }
  }

  /**
   * Get thread message history
   */
  async getThreadHistory(options: ThreadHistoryOptions): Promise<ThreadHistoryResult> {
    const { threadId, limit = 20 } = options;

    logger.debug('Getting thread history', { threadId, limit });

    try {
      const result = await this.graphqlClient.query<{
        thread: {
          messages: {
            nodes: unknown[];
            page_info: {
              has_next_page: boolean;
              end_cursor: string;
            };
          };
        };
      }>('ThreadHistoryQuery', {
        thread_id: threadId,
        limit,
        before: options.before,
        after: options.after,
      });

      const messages = result?.thread?.messages?.nodes || [];
      const hasMore = result?.thread?.messages?.page_info?.has_next_page || false;

      return {
        messages: messages.map((m) => this.parseMessage(m)),
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to get thread history', error);
      throw error;
    }
  }

  /**
   * Create a new group
   */
  async createGroup(options: CreateGroupOptions): Promise<Thread> {
    logger.debug('Creating group', options);

    try {
      const result = await this.graphqlClient.mutation<{
        create_group: {
          thread: unknown;
        };
      }>('CreateGroupMutation', {
        name: options.name,
        participant_ids: options.participantIds,
        initial_message: options.initialMessage,
      });

      return this.parseThread(result?.create_group?.thread);
    } catch (error) {
      logger.error('Failed to create group', error);
      throw error;
    }
  }

  /**
   * Add participants to a group
   */
  async addParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    logger.debug('Adding participants', { threadId, userIds });

    try {
      await this.graphqlClient.mutation('AddParticipantsMutation', {
        thread_id: threadId,
        user_ids: userIds,
      });
      return true;
    } catch (error) {
      logger.error('Failed to add participants', error);
      return false;
    }
  }

  /**
   * Remove participants from a group
   */
  async removeParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    logger.debug('Removing participants', { threadId, userIds });

    try {
      await this.graphqlClient.mutation('RemoveParticipantsMutation', {
        thread_id: threadId,
        user_ids: userIds,
      });
      return true;
    } catch (error) {
      logger.error('Failed to remove participants', error);
      return false;
    }
  }

  /**
   * Promote participants to admin
   */
  async promoteParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    logger.debug('Promoting participants', { threadId, userIds });

    try {
      await this.graphqlClient.mutation('PromoteParticipantsMutation', {
        thread_id: threadId,
        user_ids: userIds,
      });
      return true;
    } catch (error) {
      logger.error('Failed to promote participants', error);
      return false;
    }
  }

  /**
   * Demote participants from admin
   */
  async demoteParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    logger.debug('Demoting participants', { threadId, userIds });

    try {
      await this.graphqlClient.mutation('DemoteParticipantsMutation', {
        thread_id: threadId,
        user_ids: userIds,
      });
      return true;
    } catch (error) {
      logger.error('Failed to demote participants', error);
      return false;
    }
  }

  /**
   * Set nickname for a user in a thread
   */
  async setNickname(threadId: string, userId: string, nickname: string): Promise<boolean> {
    logger.debug('Setting nickname', { threadId, userId, nickname });

    try {
      await this.graphqlClient.mutation('SetNicknameMutation', {
        thread_id: threadId,
        user_id: userId,
        nickname,
      });
      return true;
    } catch (error) {
      logger.error('Failed to set nickname', error);
      return false;
    }
  }

  /**
   * Change thread color/theme
   */
  async changeThreadColor(threadId: string, color: ThreadColor): Promise<boolean> {
    logger.debug('Changing thread color', { threadId, color });

    try {
      await this.graphqlClient.mutation('ChangeThreadColorMutation', {
        thread_id: threadId,
        color,
      });
      return true;
    } catch (error) {
      logger.error('Failed to change thread color', error);
      return false;
    }
  }

  /**
   * Change thread emoji
   */
  async changeThreadEmoji(threadId: string, emoji: string): Promise<boolean> {
    logger.debug('Changing thread emoji', { threadId, emoji });

    try {
      await this.graphqlClient.mutation('ChangeThreadEmojiMutation', {
        thread_id: threadId,
        emoji,
      });
      return true;
    } catch (error) {
      logger.error('Failed to change thread emoji', error);
      return false;
    }
  }

  /**
   * Change thread name
   */
  async changeThreadName(threadId: string, name: string): Promise<boolean> {
    logger.debug('Changing thread name', { threadId, name });

    try {
      await this.graphqlClient.mutation('ChangeThreadNameMutation', {
        thread_id: threadId,
        name,
      });
      return true;
    } catch (error) {
      logger.error('Failed to change thread name', error);
      return false;
    }
  }

  /**
   * Pin a message
   */
  async pinMessage(threadId: string, messageId: string): Promise<boolean> {
    logger.debug('Pinning message', { threadId, messageId });

    try {
      await this.graphqlClient.mutation('PinMessageMutation', {
        thread_id: threadId,
        message_id: messageId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to pin message', error);
      return false;
    }
  }

  /**
   * Unpin a message
   */
  async unpinMessage(threadId: string, messageId: string): Promise<boolean> {
    logger.debug('Unpinning message', { threadId, messageId });

    try {
      await this.graphqlClient.mutation('UnpinMessageMutation', {
        thread_id: threadId,
        message_id: messageId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unpin message', error);
      return false;
    }
  }

  /**
   * Archive a thread
   */
  async archiveThread(threadId: string, archive: boolean = true): Promise<boolean> {
    logger.debug('Archiving thread', { threadId, archive });

    try {
      await this.graphqlClient.mutation(archive ? 'ArchiveThreadMutation' : 'UnarchiveThreadMutation', {
        thread_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to archive thread', error);
      return false;
    }
  }

  /**
   * Mute a thread
   */
  async muteThread(threadId: string, mute: boolean = true, duration?: number): Promise<boolean> {
    logger.debug('Muting thread', { threadId, mute, duration });

    try {
      await this.graphqlClient.mutation(mute ? 'MuteThreadMutation' : 'UnmuteThreadMutation', {
        thread_id: threadId,
        duration,
      });
      return true;
    } catch (error) {
      logger.error('Failed to mute thread', error);
      return false;
    }
  }

  /**
   * Leave a group
   */
  async leaveGroup(threadId: string): Promise<boolean> {
    logger.debug('Leaving group', { threadId });

    try {
      await this.graphqlClient.mutation('LeaveGroupMutation', {
        thread_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to leave group', error);
      return false;
    }
  }

  /**
   * Delete a thread
   */
  async deleteThread(threadId: string): Promise<boolean> {
    logger.debug('Deleting thread', { threadId });

    try {
      await this.graphqlClient.mutation('DeleteThreadMutation', {
        thread_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete thread', error);
      return false;
    }
  }

  /**
   * Parse thread data from GraphQL response
   */
  private parseThread(data: unknown): Thread {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid thread data');
    }

    const thread = data as Record<string, unknown>;
    const threadKey = thread.thread_key as Record<string, unknown> | undefined;

    return {
      threadId: String(threadKey?.thread_fb_id || threadKey?.other_user_id || thread.id),
      type: this.parseThreadType(thread.thread_type as string),
      name: thread.name as string | undefined,
      participants: [],
      participantIds: [],
      unreadCount: Number(thread.unread_count) || 0,
      messageCount: Number(thread.messages_count) || undefined,
      lastMessageTimestamp: Number((thread.last_message as Record<string, unknown>)?.timestamp) || undefined,
      lastReadTimestamp: Number(thread.last_read_timestamp) || undefined,
      isArchived: !!thread.is_archived,
      isMuted: !!thread.is_muted,
      isPinned: !!thread.is_pinned,
      color: thread.theme_color as ThreadColor | undefined,
      emoji: thread.theme_emoji as string | undefined,
      adminIds: [],
      approvalMode: !!thread.approval_mode,
      joinLink: thread.join_link as string | undefined,
      description: thread.description as string | undefined,
      image: thread.image as string | undefined,
      nicknames: {},
      pinnedMessages: [],
      folder: thread.folder as 'inbox' | 'archive' | 'pending' | 'other' | undefined,
    };
  }

  /**
   * Parse thread type
   */
  private parseThreadType(type: string | undefined): ThreadType {
    switch (type) {
      case 'GROUP':
        return 'group';
      case 'ONE_TO_ONE':
        return 'user';
      case 'PAGE':
        return 'page';
      case 'MARKETPLACE':
        return 'marketplace';
      default:
        return 'user';
    }
  }

  /**
   * Parse message data
   */
  private parseMessage(data: unknown): import('../types/index.js').Message {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid message data');
    }

    const msg = data as Record<string, unknown>;
    const metadata = msg.message_metadata as Record<string, unknown> | undefined;

    return {
      messageId: String(msg.message_id || metadata?.message_id),
      threadId: String((metadata?.thread_key as Record<string, unknown>)?.thread_fb_id || (metadata?.thread_key as Record<string, unknown>)?.other_user_id),
      senderId: String(metadata?.actor_fb_id || msg.sender_id),
      body: msg.body as string | undefined,
      attachments: [],
      mentions: [],
      timestamp: Number(metadata?.timestamp) || Date.now(),
      isGroup: !!(metadata?.thread_key as Record<string, unknown>)?.thread_fb_id,
      reactions: [],
      isUnread: false,
    };
  }
}
