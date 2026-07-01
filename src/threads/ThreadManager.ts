/**
 * Thread Manager for Panindigan
 * All mutations use real Facebook form-encoded endpoints — no fake GraphQL names.
 */

import { logger } from '../utils/Logger.js';
import {
  FACEBOOK_THREAD_LIST_URL,
  FACEBOOK_THREAD_INFO_URL,
  FACEBOOK_THREAD_HISTORY_URL,
  FACEBOOK_SET_NICKNAME_URL,
  FACEBOOK_SET_THREAD_NAME_URL,
  FACEBOOK_SET_THREAD_SETTINGS_URL,
  FACEBOOK_ADD_PARTICIPANTS_URL,
  FACEBOOK_REMOVE_PARTICIPANT_URL,
  FACEBOOK_LEAVE_GROUP_URL,
  FACEBOOK_UPDATE_ADMINS_URL,
  FACEBOOK_NEW_GROUP_URL,
  FACEBOOK_PIN_MESSAGE_URL,
  FACEBOOK_UNPIN_MESSAGE_URL,
  FACEBOOK_ARCHIVE_THREAD_URL,
  FACEBOOK_MUTE_THREAD_URL,
  FACEBOOK_DELETE_THREAD_URL,
} from '../utils/Constants.js';
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
  Message,
} from '../types/index.js';

export class ThreadManager {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Get thread list via POST /ajax/mercury/threadlist_info.php
   */
  async getThreadList(
    options: GetThreadListOptions = {}
  ): Promise<GetThreadListResult> {
    const limit = options.limit || 20;
    const folder = (options.folder || 'inbox').toUpperCase();

    logger.debug('Getting thread list', { limit, folder });

    try {
      const params: Record<string, string> = {
        'threads[limit]': String(limit),
        'threads[folder]': folder,
        'threads[tags][0]': folder,
        'threads[include_delivery_receipts]': 'true',
        'threads[include_send_receipts]': 'true',
        'threads[include_read_receipts]': 'true',
        client: 'mercury',
      };

      if (options.before) {
        params['threads[before]'] = String(options.before);
      }

      const result = await this.graphqlClient.formPost<{
        payload?: {
          viewer?: {
            message_threads?: {
              nodes?: unknown[];
              page_info?: { has_next_page?: boolean; end_cursor?: string };
            };
          };
        };
      }>(FACEBOOK_THREAD_LIST_URL, params);

      const nodes =
        result?.payload?.viewer?.message_threads?.nodes || [];
      const hasMore =
        result?.payload?.viewer?.message_threads?.page_info
          ?.has_next_page || false;

      return {
        threads: nodes.map((t) => this.parseThread(t)),
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to get thread list', error);
      throw error;
    }
  }

  /**
   * Get thread info via POST /ajax/mercury/thread_info.php
   */
  async getThreadInfo(threadId: string): Promise<Thread> {
    logger.debug('Getting thread info', { threadId });

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: { threads?: unknown[] };
      }>(FACEBOOK_THREAD_INFO_URL, {
        'id[thread_fbid]': threadId,
        client: 'mercury',
      });

      const thread = result?.payload?.threads?.[0];
      return this.parseThread(thread);
    } catch (error) {
      logger.error('Failed to get thread info', error);
      throw error;
    }
  }

  /**
   * Get thread message history via POST /ajax/mercury/conversation_info.php
   */
  async getThreadHistory(
    options: ThreadHistoryOptions
  ): Promise<ThreadHistoryResult> {
    const { threadId, limit = 20 } = options;

    logger.debug('Getting thread history', { threadId, limit });

    try {
      const params: Record<string, string> = {
        'id[thread_fbid]': threadId,
        window_size: String(limit),
        client: 'mercury',
      };

      if (options.before) {
        params['last_timestamp'] = String(options.before);
      }

      const result = await this.graphqlClient.formPost<{
        payload?: {
          actions?: unknown[];
          hasMore?: boolean;
        };
      }>(FACEBOOK_THREAD_HISTORY_URL, params);

      const messages = result?.payload?.actions || [];
      const hasMore = result?.payload?.hasMore || false;

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
   * Create a new group via POST /messaging/new_group_thread/
   */
  async createGroup(options: CreateGroupOptions): Promise<Thread> {
    logger.debug('Creating group', options);

    try {
      const params: Record<string, string> = {};
      options.participantIds.forEach((uid, i) => {
        params[`to[${i}]`] = uid;
      });

      const result = await this.graphqlClient.formPost<{
        payload?: { thread?: unknown };
      }>(FACEBOOK_NEW_GROUP_URL, params);

      const thread = result?.payload?.thread || {};
      return this.parseThread(thread);
    } catch (error) {
      logger.error('Failed to create group', error);
      throw error;
    }
  }

  /**
   * Add participants via POST /messaging/add_participants/
   */
  async addParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    logger.debug('Adding participants', { threadId, userIds });

    try {
      const params: Record<string, string> = { thread_fbid: threadId };
      userIds.forEach((uid, i) => {
        params[`to[${i}]`] = uid;
      });

      await this.graphqlClient.formPost(FACEBOOK_ADD_PARTICIPANTS_URL, params);
      return true;
    } catch (error) {
      logger.error('Failed to add participants', error);
      return false;
    }
  }

  /**
   * Remove participants — calls /messaging/remove_participant/ for each user.
   */
  async removeParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    logger.debug('Removing participants', { threadId, userIds });

    try {
      await Promise.all(
        userIds.map((uid) =>
          this.graphqlClient.formPost(FACEBOOK_REMOVE_PARTICIPANT_URL, {
            uid,
            thread_fbid: threadId,
          })
        )
      );
      return true;
    } catch (error) {
      logger.error('Failed to remove participants', error);
      return false;
    }
  }

  /**
   * Promote to admin via POST /messaging/update_thread_admins/
   */
  async promoteParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    logger.debug('Promoting participants', { threadId, userIds });

    try {
      await Promise.all(
        userIds.map((uid) =>
          this.graphqlClient.formPost(FACEBOOK_UPDATE_ADMINS_URL, {
            thread_fbid: threadId,
            admin_id: uid,
            add_admin: 'true',
          })
        )
      );
      return true;
    } catch (error) {
      logger.error('Failed to promote participants', error);
      return false;
    }
  }

  /**
   * Demote from admin via POST /messaging/update_thread_admins/
   */
  async demoteParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    logger.debug('Demoting participants', { threadId, userIds });

    try {
      await Promise.all(
        userIds.map((uid) =>
          this.graphqlClient.formPost(FACEBOOK_UPDATE_ADMINS_URL, {
            thread_fbid: threadId,
            admin_id: uid,
            add_admin: 'false',
          })
        )
      );
      return true;
    } catch (error) {
      logger.error('Failed to demote participants', error);
      return false;
    }
  }

  /**
   * Set nickname via POST /messaging/set_nickname/
   */
  async setNickname(
    threadId: string,
    userId: string,
    nickname: string
  ): Promise<boolean> {
    logger.debug('Setting nickname', { threadId, userId, nickname });

    try {
      await this.graphqlClient.formPost(FACEBOOK_SET_NICKNAME_URL, {
        nickname,
        participant_id: userId,
        thread_fbid: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to set nickname', error);
      return false;
    }
  }

  /**
   * Change thread color via POST /messaging/set_thread_settings/
   */
  async changeThreadColor(threadId: string, color: ThreadColor): Promise<boolean> {
    logger.debug('Changing thread color', { threadId, color });

    try {
      await this.graphqlClient.formPost(FACEBOOK_SET_THREAD_SETTINGS_URL, {
        thread_fbid: threadId,
        theme_color: String(color),
      });
      return true;
    } catch (error) {
      logger.error('Failed to change thread color', error);
      return false;
    }
  }

  /**
   * Change thread emoji via POST /messaging/set_thread_settings/
   */
  async changeThreadEmoji(threadId: string, emoji: string): Promise<boolean> {
    logger.debug('Changing thread emoji', { threadId, emoji });

    try {
      await this.graphqlClient.formPost(FACEBOOK_SET_THREAD_SETTINGS_URL, {
        thread_fbid: threadId,
        custom_like_icon: emoji,
      });
      return true;
    } catch (error) {
      logger.error('Failed to change thread emoji', error);
      return false;
    }
  }

  /**
   * Change thread name via POST /messaging/set_thread_name/
   */
  async changeThreadName(threadId: string, name: string): Promise<boolean> {
    logger.debug('Changing thread name', { threadId, name });

    try {
      await this.graphqlClient.formPost(FACEBOOK_SET_THREAD_NAME_URL, {
        thread_name: name,
        thread_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to change thread name', error);
      return false;
    }
  }

  /**
   * Pin a message via POST /messaging/pin_message/
   */
  async pinMessage(threadId: string, messageId: string): Promise<boolean> {
    logger.debug('Pinning message', { threadId, messageId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_PIN_MESSAGE_URL, {
        message_id: messageId,
        thread_fbid: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to pin message', error);
      return false;
    }
  }

  /**
   * Unpin a message via POST /messaging/unpin_message/
   */
  async unpinMessage(threadId: string, messageId: string): Promise<boolean> {
    logger.debug('Unpinning message', { threadId, messageId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_UNPIN_MESSAGE_URL, {
        message_id: messageId,
        thread_fbid: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unpin message', error);
      return false;
    }
  }

  /**
   * Archive/unarchive a thread via POST /ajax/mercury/move_thread.php
   */
  async archiveThread(threadId: string, archive: boolean = true): Promise<boolean> {
    logger.debug('Archiving thread', { threadId, archive });

    try {
      await this.graphqlClient.formPost(FACEBOOK_ARCHIVE_THREAD_URL, {
        'ids[0]': threadId,
        folder: archive ? 'ARCHIVED' : 'INBOX',
      });
      return true;
    } catch (error) {
      logger.error('Failed to archive thread', error);
      return false;
    }
  }

  /**
   * Mute/unmute a thread via POST /ajax/mercury/change_mute_thread.php
   */
  async muteThread(
    threadId: string,
    mute: boolean = true,
    duration?: number
  ): Promise<boolean> {
    logger.debug('Muting thread', { threadId, mute, duration });

    try {
      await this.graphqlClient.formPost(FACEBOOK_MUTE_THREAD_URL, {
        'ids[0]': threadId,
        mute_settings: mute ? String(duration ?? -1) : '0',
      });
      return true;
    } catch (error) {
      logger.error('Failed to mute thread', error);
      return false;
    }
  }

  /**
   * Leave a group via POST /ajax/leave_group/
   */
  async leaveGroup(threadId: string): Promise<boolean> {
    logger.debug('Leaving group', { threadId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_LEAVE_GROUP_URL, {
        group_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to leave group', error);
      return false;
    }
  }

  /**
   * Delete a thread via POST /ajax/mercury/delete_thread.php
   */
  async deleteThread(threadId: string): Promise<boolean> {
    logger.debug('Deleting thread', { threadId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_DELETE_THREAD_URL, {
        'ids[0]': threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete thread', error);
      return false;
    }
  }

  // ─── Parsers ──────────────────────────────────────────────────────────────

  private parseThread(data: unknown): Thread {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid thread data');
    }

    const t = data as Record<string, unknown>;
    const threadKey = t.thread_key as Record<string, unknown> | undefined;

    return {
      threadId: String(
        threadKey?.thread_fb_id ||
          threadKey?.other_user_id ||
          t.thread_fbid ||
          t.id ||
          ''
      ),
      type: this.parseThreadType(t.thread_type as string),
      name: t.name as string | undefined,
      participants: [],
      participantIds: [],
      unreadCount: Number(t.unread_count) || 0,
      messageCount: Number(t.messages_count) || undefined,
      lastMessageTimestamp:
        Number(
          (t.last_message as Record<string, unknown>)?.timestamp
        ) || undefined,
      lastReadTimestamp: Number(t.last_read_timestamp) || undefined,
      isArchived: !!(t.is_archived),
      isMuted: !!(t.is_muted),
      isPinned: !!(t.is_pinned),
      color: t.theme_color as ThreadColor | undefined,
      emoji: t.theme_emoji as string | undefined,
      adminIds: [],
      approvalMode: !!(t.approval_mode),
      joinLink: t.join_link as string | undefined,
      description: t.description as string | undefined,
      image: t.image as string | undefined,
      nicknames: {},
      pinnedMessages: [],
      folder: t.folder as
        | 'inbox'
        | 'archive'
        | 'pending'
        | 'other'
        | undefined,
    };
  }

  private parseThreadType(type: string | undefined): ThreadType {
    switch (type) {
      case 'GROUP': return 'group';
      case 'ONE_TO_ONE': return 'user';
      case 'PAGE': return 'page';
      case 'MARKETPLACE': return 'marketplace';
      default: return 'user';
    }
  }

  private parseMessage(data: unknown): Message {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid message data');
    }

    const m = data as Record<string, unknown>;
    const meta = m.message_metadata as Record<string, unknown> | undefined;
    const threadKey = meta?.thread_key as Record<string, unknown> | undefined;

    return {
      messageId: String(m.message_id || meta?.message_id || ''),
      threadId: String(
        threadKey?.thread_fb_id ||
          threadKey?.other_user_id ||
          ''
      ),
      senderId: String(meta?.actor_fb_id || m.sender_id || ''),
      body: m.body as string | undefined,
      attachments: [],
      mentions: [],
      timestamp: Number(meta?.timestamp) || Date.now(),
      isGroup: !!(threadKey?.thread_fb_id),
      reactions: [],
      isUnread: false,
    };
  }
}
