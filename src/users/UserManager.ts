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
  FACEBOOK_FOLLOW_URL,
  FACEBOOK_MUTUAL_FRIENDS_URL,
  FACEBOOK_PENDING_REQUESTS_URL,
  FACEBOOK_FRIENDS_INFO_URL,
  FACEBOOK_SENT_REQUESTS_URL,
  FACEBOOK_BLOCK_URL,
  FACEBOOK_BLOCKED_LIST_URL,
  FACEBOOK_BIRTHDAYS_URL,
  FACEBOOK_PRESENCE_URL,
} from '../utils/Constants.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
import type {
  User,
  Profile,
  Presence,
  SearchUsersResult,
  GetFriendsResult,
  GetBlockedListResult,
  GetBirthdaysResult,
  Birthday,
  FriendRequest,
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
        profileUrl: e.url || `https://facebook.com/${e.uid}`,
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
   * Get friends list via POST /ajax/mercury/friends_info.php
   */
  async getFriends(
    limit: number = 100,
    offset: number = 0
  ): Promise<GetFriendsResult> {
    logger.debug('Getting friends', { limit, offset });

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          profiles?: Record<
            string,
            {
              id?: string;
              name?: { text?: string } | string;
              uri?: string;
              large_image_uri?: string;
              small_image_uri?: string;
              type?: string;
              is_friend?: boolean;
              gender?: number;
            }
          >;
        };
      }>(FACEBOOK_FRIENDS_INFO_URL, {
        order: 'top_friends',
        start_index: String(offset),
        num_friends: String(limit),
      });

      const profiles = result?.payload?.profiles || {};
      const friends: User[] = Object.values(profiles)
        .map((raw) => {
          const nameText =
            typeof raw.name === 'object' ? raw.name?.text : raw.name;
          const name = String(nameText || 'Unknown');
          const parts = name.split(' ');
          return {
            userId: String(raw.id || ''),
            name,
            firstName: parts[0],
            lastName: parts.length > 1 ? parts[parts.length - 1] : undefined,
            profileUrl: raw.uri || `https://facebook.com/${raw.id}`,
            photoUrl: raw.large_image_uri || raw.small_image_uri,
            thumbSrc: raw.small_image_uri,
            type: 'user' as const,
            isFriend: true,
            isBlocked: false,
            isVerified: false,
            isActive: false,
            gender:
              raw.gender === 1
                ? ('female' as const)
                : raw.gender === 2
                ? ('male' as const)
                : undefined,
          };
        })
        .filter((f) => f.userId);

      return { friends, hasMore: friends.length === limit };
    } catch (error) {
      logger.error('Failed to get friends', error);
      throw error;
    }
  }

  /**
   * Get pending (received) friend requests via POST /ajax/requests/friend/
   */
  async getPendingFriendRequests(): Promise<FriendRequest[]> {
    logger.debug('Getting pending friend requests');

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          requests?: Array<{
            uid?: string;
            name?: string;
            photo_uri?: string;
            mutual_friend_count?: number;
            timestamp?: number;
            message?: string;
          }>;
        };
      }>(FACEBOOK_PENDING_REQUESTS_URL, {
        action: 'get_all',
      });

      const requests = result?.payload?.requests || [];
      return requests.map((r) => ({
        userId: String(r.uid || ''),
        name: String(r.name || 'Unknown'),
        photoUrl: r.photo_uri,
        mutualFriends: r.mutual_friend_count,
        timestamp: Number(r.timestamp) || Date.now(),
        message: r.message,
      }));
    } catch (error) {
      logger.error('Failed to get pending friend requests', error);
      throw error;
    }
  }

  /**
   * Get sent (outgoing) friend requests via POST /ajax/social-privacy/friend-request-page.php
   */
  async getSentFriendRequests(): Promise<FriendRequest[]> {
    logger.debug('Getting sent friend requests');

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          requests?: Array<{
            uid?: string;
            id?: string;
            name?: string;
            photo_uri?: string;
            timestamp?: number;
            message?: string;
          }>;
        };
      }>(FACEBOOK_SENT_REQUESTS_URL, {
        type: 'outgoing',
        offset: '0',
        count: '30',
      });

      return (result?.payload?.requests || []).map((r) => ({
        userId: String(r.uid || r.id || ''),
        name: String(r.name || 'Unknown'),
        photoUrl: r.photo_uri,
        timestamp: Number(r.timestamp) || Date.now(),
        message: r.message,
      }));
    } catch (error) {
      logger.error('Failed to get sent friend requests', error);
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
   * Follow a user (subscribe to their public posts) via POST /ajax/follow/get_follow.php
   */
  async followUser(userId: string): Promise<boolean> {
    logger.debug('Following user', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_FOLLOW_URL, {
        uid: userId,
        action: 'follow',
      });
      return true;
    } catch (error) {
      logger.error('Failed to follow user', error);
      return false;
    }
  }

  /**
   * Unfollow a user (stop receiving their public posts) via POST /ajax/follow/get_follow.php
   */
  async unfollowUser(userId: string): Promise<boolean> {
    logger.debug('Unfollowing user', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_FOLLOW_URL, {
        uid: userId,
        action: 'unfollow',
      });
      return true;
    } catch (error) {
      logger.error('Failed to unfollow user', error);
      return false;
    }
  }

  /**
   * Get mutual friends via POST /ajax/mutual_friends/
   */
  async getMutualFriends(userId: string): Promise<User[]> {
    logger.debug('Getting mutual friends', { userId });

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          mutual_friends?: Array<{
            id?: string;
            uid?: string;
            name?: string;
            uri?: string;
            pic?: string;
          }>;
        };
      }>(FACEBOOK_MUTUAL_FRIENDS_URL, {
        node_id: userId,
      });

      const mutual = result?.payload?.mutual_friends || [];
      return mutual.map((m) => ({
        userId: String(m.id || m.uid || ''),
        name: String(m.name || 'Unknown'),
        profileUrl: m.uri || `https://facebook.com/${m.id}`,
        photoUrl: m.pic,
        type: 'user' as const,
        isFriend: true,
        isBlocked: false,
        isVerified: false,
        isActive: false,
      }));
    } catch (error) {
      logger.error('Failed to get mutual friends', error);
      throw error;
    }
  }

  /**
   * Block a user via POST /ajax/profile/userblockunblock.php
   */
  async blockUser(userId: string): Promise<boolean> {
    logger.debug('Blocking user', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_BLOCK_URL, {
        uid: userId,
        block_action: 'block',
        block_surface_id: '2',
      });
      return true;
    } catch (error) {
      logger.error('Failed to block user', error);
      return false;
    }
  }

  /**
   * Unblock a user via POST /ajax/profile/userblockunblock.php
   */
  async unblockUser(userId: string): Promise<boolean> {
    logger.debug('Unblocking user', { userId });

    try {
      await this.graphqlClient.formPost(FACEBOOK_BLOCK_URL, {
        uid: userId,
        block_action: 'unblock',
        block_surface_id: '2',
      });
      return true;
    } catch (error) {
      logger.error('Failed to unblock user', error);
      return false;
    }
  }

  /**
   * Get blocked users list via POST /settings/blocking/ajax/
   */
  async getBlockedList(): Promise<GetBlockedListResult> {
    logger.debug('Getting blocked list');

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          users?: Array<{
            id?: string;
            uid?: string;
            name?: string;
            uri?: string;
            pic?: string;
          }>;
        };
      }>(FACEBOOK_BLOCKED_LIST_URL, { action: 'get_list' });

      const users: User[] = (result?.payload?.users || []).map((u) => ({
        userId: String(u.id || u.uid || ''),
        name: String(u.name || 'Unknown'),
        profileUrl: u.uri || `https://facebook.com/${u.id || u.uid}`,
        photoUrl: u.pic,
        type: 'user' as const,
        isFriend: false,
        isBlocked: true,
        isVerified: false,
        isActive: false,
      }));

      return { users };
    } catch (error) {
      logger.error('Failed to get blocked list', error);
      throw error;
    }
  }

  /**
   * Get birthdays via POST /ajax/birthday/notification/
   */
  async getBirthdays(): Promise<GetBirthdaysResult> {
    logger.debug('Getting birthdays');

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          birthdays?: {
            today?: unknown[];
            upcoming?: unknown[];
            recent?: unknown[];
          };
        };
      }>(FACEBOOK_BIRTHDAYS_URL, { action: 'get_birthdays' });

      const bdays = result?.payload?.birthdays || {};
      return {
        today: (bdays.today || []).map((b) => this.parseBirthday(b)),
        upcoming: (bdays.upcoming || []).map((b) => this.parseBirthday(b)),
        recent: (bdays.recent || []).map((b) => this.parseBirthday(b)),
      };
    } catch (error) {
      logger.error('Failed to get birthdays', error);
      throw error;
    }
  }

  /**
   * Query per-user presence via POST /ajax/mercury/chat_online_presences.php.
   * For real-time bulk presence, subscribe to MQTT /t_p instead.
   */
  async getPresence(userId: string): Promise<Presence> {
    logger.debug('Getting presence', { userId });

    try {
      const result = await this.graphqlClient.formPost<{
        payload?: {
          presences?: Record<
            string,
            {
              la?: number; // last active timestamp (seconds)
              p?: number;  // 2 = active, 0 = idle, else offline
            }
          >;
        };
      }>(FACEBOOK_PRESENCE_URL, {
        'ids[0]': userId,
      });

      const raw = result?.payload?.presences?.[userId];
      const p = Number(raw?.p ?? -1);
      const status: 'active' | 'idle' | 'offline' =
        p === 2 ? 'active' : p === 0 ? 'idle' : 'offline';

      return {
        userId,
        status,
        lastActive: raw?.la ? raw.la * 1000 : undefined,
        isActive: status === 'active',
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
