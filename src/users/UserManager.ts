/**
 * User Manager for Panindigan
 * Handles user operations, friend management, and profile operations.
 * Uses real Facebook form-encoded endpoints where available.
 */

import { logger } from '../utils/Logger.js';
import {
  FACEBOOK_USER_INFO_URL,
  FACEBOOK_SEARCH_URL,
  FACEBOOK_FRIEND_REQUEST_URL,
  FACEBOOK_MANAGE_FRIEND_URL,
} from '../utils/Constants.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
import type {
  User,
  Profile,
  SearchUsersResult,
  GetFriendsResult,
  GetBlockedListResult,
  GetBirthdaysResult,
  Birthday,
} from '../types/index.js';

export class UserManager {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Get user info via POST /chat/user_info/
   */
  async getUserInfo(userId: string): Promise<Profile>;
  async getUserInfo(userIds: string[]): Promise<Record<string, Profile>>;
  async getUserInfo(
    userIdOrIds: string | string[]
  ): Promise<Profile | Record<string, Profile>> {
    const isArray = Array.isArray(userIdOrIds);
    const userIds = isArray ? userIdOrIds : [userIdOrIds];

    logger.debug('Getting user info', { userIds });

    try {
      const params: Record<string, string> = {};
      userIds.forEach((uid, i) => {
        params[`ids[${i}]`] = uid;
      });

      const result = await this.graphqlClient.formPost<{
        payload?: {
          profiles?: Record<
            string,
            {
              id?: string;
              name?: { text?: string };
              uri?: string;
              large_image_uri?: string;
              small_image_uri?: string;
              type?: string;
              is_friend?: boolean;
              gender?: number;
            }
          >;
        };
      }>(FACEBOOK_USER_INFO_URL, params);

      const profiles = result?.payload?.profiles || {};
      const users: Record<string, Profile> = {};

      for (const uid of userIds) {
        const raw = profiles[uid];
        if (raw) {
          users[uid] = this.parseProfileFromMercury(uid, raw);
        }
      }

      return isArray ? users : (users[userIdOrIds as string] ?? this.emptyProfile(userIdOrIds as string));
    } catch (error) {
      logger.error('Failed to get user info', error);
      throw error;
    }
  }

  /**
   * Search for users via POST /ajax/typeahead/search.php
   */
  async searchUsers(
    query: string,
    limit: number = 10
  ): Promise<SearchUsersResult> {
    logger.debug('Searching users', { query, limit });

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          entries?: Array<{
            uid?: string;
            type?: string;
            text?: string;
            url?: string;
            photo?: string;
          }>;
        };
      }>(FACEBOOK_SEARCH_URL, {
        value: query,
        filter: 'page',
        context: 'browse',
        view: 'search',
        start: '0',
        limit: String(limit),
        token: '',
      });

      const entries = (result?.payload?.entries || []).filter(
        (e) => e.uid && (e.type === 'user' || e.type === 'friend')
      );

      const users: User[] = entries.map((e) => ({
        userId: String(e.uid || ''),
        name: String(e.text || 'Unknown'),
        profileUrl:
          e.url || `https://facebook.com/${e.uid}`,
        photoUrl: e.photo,
        type: 'user' as const,
        isFriend: e.type === 'friend',
        isBlocked: false,
        isVerified: false,
        isActive: false,
      }));

      return { users, hasMore: users.length === limit };
    } catch (error) {
      logger.error('Failed to search users', error);
      throw error;
    }
  }

  /**
   * Get friends list (GraphQL query — no stable form endpoint)
   */
  async getFriends(
    limit: number = 100,
    offset: number = 0
  ): Promise<GetFriendsResult> {
    logger.debug('Getting friends', { limit, offset });

    try {
      const result = await this.graphqlClient.query<{
        viewer: {
          friends: {
            nodes: unknown[];
            page_info: { has_next_page: boolean };
          };
        };
      }>('FriendsQuery', { limit, offset });

      const friends = (result?.viewer?.friends?.nodes || []).map((f) =>
        this.parseUser(f)
      );
      const hasMore =
        result?.viewer?.friends?.page_info?.has_next_page || false;

      return { friends, hasMore };
    } catch (error) {
      logger.error('Failed to get friends', error);
      throw error;
    }
  }

  /**
   * Send friend request via POST /ajax/add_friend/action.php
   */
  async sendFriendRequest(userId: string, message?: string): Promise<boolean> {
    logger.debug('Sending friend request', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_FRIEND_REQUEST_URL, {
        to_friend: userId,
        action: 'add_friend',
        how_found: 'search',
        ...(message ? { message } : {}),
      });
      return true;
    } catch (error) {
      logger.error('Failed to send friend request', error);
      return false;
    }
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(userId: string): Promise<boolean> {
    logger.debug('Accepting friend request', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_FRIEND_REQUEST_URL, {
        to_friend: userId,
        action: 'confirm',
      });
      return true;
    } catch (error) {
      logger.error('Failed to accept friend request', error);
      return false;
    }
  }

  /**
   * Decline friend request
   */
  async declineFriendRequest(userId: string): Promise<boolean> {
    logger.debug('Declining friend request', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_FRIEND_REQUEST_URL, {
        to_friend: userId,
        action: 'reject',
      });
      return true;
    } catch (error) {
      logger.error('Failed to decline friend request', error);
      return false;
    }
  }

  /**
   * Cancel a sent friend request
   */
  async cancelFriendRequest(userId: string): Promise<boolean> {
    logger.debug('Canceling friend request', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_FRIEND_REQUEST_URL, {
        to_friend: userId,
        action: 'cancel',
      });
      return true;
    } catch (error) {
      logger.error('Failed to cancel friend request', error);
      return false;
    }
  }

  /**
   * Unfriend via POST /ajax/friends/lists/remove.php
   */
  async unfriend(userId: string): Promise<boolean> {
    logger.debug('Unfriending user', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_MANAGE_FRIEND_URL, {
        uid: userId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unfriend', error);
      return false;
    }
  }

  /**
   * Block / unblock (GraphQL mutations — no stable form endpoint)
   */
  async blockUser(userId: string): Promise<boolean> {
    logger.debug('Blocking user', { userId });

    try {
      await this.graphqlClient.mutation('BlockUserMutation', {
        user_id: userId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to block user', error);
      return false;
    }
  }

  async unblockUser(userId: string): Promise<boolean> {
    logger.debug('Unblocking user', { userId });

    try {
      await this.graphqlClient.mutation('UnblockUserMutation', {
        user_id: userId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unblock user', error);
      return false;
    }
  }

  /**
   * Get blocked users list
   */
  async getBlockedList(): Promise<GetBlockedListResult> {
    logger.debug('Getting blocked list');

    try {
      const result = await this.graphqlClient.query<{
        viewer: { blocked_users: { nodes: unknown[] } };
      }>('BlockedUsersQuery', {});

      const users = (result?.viewer?.blocked_users?.nodes || []).map((u) =>
        this.parseUser(u)
      );
      return { users };
    } catch (error) {
      logger.error('Failed to get blocked list', error);
      throw error;
    }
  }

  /**
   * Get birthdays
   */
  async getBirthdays(): Promise<GetBirthdaysResult> {
    logger.debug('Getting birthdays');

    try {
      const result = await this.graphqlClient.query<{
        birthdays: {
          today: unknown[];
          upcoming: unknown[];
          recent: unknown[];
        };
      }>('BirthdaysQuery', {});

      return {
        today: (result?.birthdays?.today || []).map((b) => this.parseBirthday(b)),
        upcoming: (result?.birthdays?.upcoming || []).map((b) =>
          this.parseBirthday(b)
        ),
        recent: (result?.birthdays?.recent || []).map((b) => this.parseBirthday(b)),
      };
    } catch (error) {
      logger.error('Failed to get birthdays', error);
      throw error;
    }
  }

  /**
   * Get user presence / online status
   */
  async getPresence(userId: string): Promise<{
    userId: string;
    status: 'active' | 'idle' | 'offline';
    lastActive?: number;
  }> {
    logger.debug('Getting presence', { userId });

    try {
      const result = await this.graphqlClient.query<{
        user: {
          presence: { status: string; last_active: number };
        };
      }>('PresenceQuery', { user_id: userId });

      return {
        userId,
        status:
          (result?.user?.presence?.status as 'active' | 'idle' | 'offline') ||
          'offline',
        lastActive: result?.user?.presence?.last_active,
      };
    } catch (error) {
      logger.error('Failed to get presence', error);
      throw error;
    }
  }

  // ─── Parsers ──────────────────────────────────────────────────────────────

  /**
   * Parse a raw profile object from /chat/user_info/ Mercury response.
   */
  private parseProfileFromMercury(
    uid: string,
    raw: {
      id?: string;
      name?: { text?: string };
      uri?: string;
      large_image_uri?: string;
      small_image_uri?: string;
      type?: string;
      is_friend?: boolean;
      gender?: number;
    }
  ): Profile {
    const name = raw.name?.text || 'Unknown';
    const parts = name.split(' ');

    const user: User = {
      userId: String(raw.id || uid),
      name,
      firstName: parts[0],
      lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
      profileUrl: raw.uri || `https://facebook.com/${uid}`,
      photoUrl: raw.large_image_uri || raw.small_image_uri,
      thumbSrc: raw.small_image_uri,
      type: (raw.type as 'user' | 'page' | 'bot') || 'user',
      isFriend: !!(raw.is_friend),
      isBlocked: false,
      isVerified: false,
      isActive: false,
      gender:
        raw.gender === 1
          ? 'female'
          : raw.gender === 2
          ? 'male'
          : undefined,
    };

    return { ...user, canMessage: true };
  }

  private parseUser(data: unknown): User {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid user data');
    }

    const u = data as Record<string, unknown>;

    return {
      userId: String(u.id || u.user_id || ''),
      name: String(u.name || 'Unknown'),
      firstName: u.first_name as string | undefined,
      lastName: u.last_name as string | undefined,
      vanity: u.vanity as string | undefined,
      profileUrl:
        (u.profile_url as string) ||
        `https://facebook.com/${u.id}`,
      thumbSrc: u.thumb_src as string | undefined,
      photoUrl: u.photo_url as string | undefined,
      coverPhotoUrl: u.cover_photo_url as string | undefined,
      isFriend: !!(u.is_friend),
      isBlocked: !!(u.is_blocked),
      gender: (u.gender as 'male' | 'female' | 'neutral') || undefined,
      type: (u.type as 'user' | 'page' | 'bot') || 'user',
      isVerified: !!(u.is_verified),
      isActive: !!(u.is_active),
      lastActiveTimestamp: Number(u.last_active_timestamp) || undefined,
    };
  }

  private parseBirthday(data: unknown): Birthday {
    const b = data as Record<string, unknown>;
    return {
      userId: String(b.user_id || b.id || ''),
      name: String(b.name || 'Unknown'),
      date: String(b.date || b.birthday_date || ''),
      age: Number(b.age) || undefined,
    };
  }

  private emptyProfile(userId: string): Profile {
    return {
      userId,
      name: 'Unknown',
      profileUrl: `https://facebook.com/${userId}`,
      isFriend: false,
      isBlocked: false,
      isVerified: false,
      isActive: false,
      type: 'user',
      canMessage: false,
    };
  }
}
