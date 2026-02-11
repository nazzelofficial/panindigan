/**
 * User Manager for Panindigan
 * Handles user operations, friend management, and profile operations
 */

import { logger } from '../utils/Logger.js';
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
   * Get user info
   */
  async getUserInfo(userId: string): Promise<Profile>;
  async getUserInfo(userIds: string[]): Promise<Record<string, Profile>>;
  async getUserInfo(userIdOrIds: string | string[]): Promise<Profile | Record<string, Profile>> {
    const isArray = Array.isArray(userIdOrIds);
    const userIds = isArray ? userIdOrIds : [userIdOrIds];

    logger.debug('Getting user info', { userIds });

    try {
      const result = await this.graphqlClient.query<{
        users: Record<string, unknown>;
      }>('UserInfoQuery', {
        user_ids: userIds,
      });

      const users: Record<string, Profile> = {};
      
      for (const userId of userIds) {
        const userData = (result?.users as Record<string, unknown>)?.[userId];
        if (userData) {
          users[userId] = this.parseProfile(userData);
        }
      }

      return isArray ? users : users[userIdOrIds as string];
    } catch (error) {
      logger.error('Failed to get user info', error);
      throw error;
    }
  }

  /**
   * Search for users
   */
  async searchUsers(query: string, limit: number = 10): Promise<SearchUsersResult> {
    logger.debug('Searching users', { query, limit });

    try {
      const result = await this.graphqlClient.query<{
        search: {
          users: {
            nodes: unknown[];
            page_info: {
              has_next_page: boolean;
            };
          };
        };
      }>('UserSearchQuery', {
        query,
        limit,
      });

      const users = (result?.search?.users?.nodes || []).map((u) => this.parseUser(u));
      const hasMore = result?.search?.users?.page_info?.has_next_page || false;

      return { users, hasMore };
    } catch (error) {
      logger.error('Failed to search users', error);
      throw error;
    }
  }

  /**
   * Get friends list
   */
  async getFriends(limit: number = 100, offset: number = 0): Promise<GetFriendsResult> {
    logger.debug('Getting friends', { limit, offset });

    try {
      const result = await this.graphqlClient.query<{
        viewer: {
          friends: {
            nodes: unknown[];
            page_info: {
              has_next_page: boolean;
            };
          };
        };
      }>('FriendsQuery', {
        limit,
        offset,
      });

      const friends = (result?.viewer?.friends?.nodes || []).map((f) => this.parseUser(f));
      const hasMore = result?.viewer?.friends?.page_info?.has_next_page || false;

      return { friends, hasMore };
    } catch (error) {
      logger.error('Failed to get friends', error);
      throw error;
    }
  }

  /**
   * Send friend request
   */
  async sendFriendRequest(userId: string, message?: string): Promise<boolean> {
    logger.debug('Sending friend request', { userId, message });

    try {
      await this.graphqlClient.mutation('SendFriendRequestMutation', {
        user_id: userId,
        message,
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
      await this.graphqlClient.mutation('AcceptFriendRequestMutation', {
        user_id: userId,
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
      await this.graphqlClient.mutation('DeclineFriendRequestMutation', {
        user_id: userId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to decline friend request', error);
      return false;
    }
  }

  /**
   * Cancel friend request
   */
  async cancelFriendRequest(userId: string): Promise<boolean> {
    logger.debug('Canceling friend request', { userId });

    try {
      await this.graphqlClient.mutation('CancelFriendRequestMutation', {
        user_id: userId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to cancel friend request', error);
      return false;
    }
  }

  /**
   * Unfriend a user
   */
  async unfriend(userId: string): Promise<boolean> {
    logger.debug('Unfriending user', { userId });

    try {
      await this.graphqlClient.mutation('UnfriendMutation', {
        user_id: userId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unfriend', error);
      return false;
    }
  }

  /**
   * Block a user
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

  /**
   * Unblock a user
   */
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
        viewer: {
          blocked_users: {
            nodes: unknown[];
          };
        };
      }>('BlockedUsersQuery', {});

      const users = (result?.viewer?.blocked_users?.nodes || []).map((u) => this.parseUser(u));

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
        upcoming: (result?.birthdays?.upcoming || []).map((b) => this.parseBirthday(b)),
        recent: (result?.birthdays?.recent || []).map((b) => this.parseBirthday(b)),
      };
    } catch (error) {
      logger.error('Failed to get birthdays', error);
      throw error;
    }
  }

  /**
   * Get user presence/online status
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
          presence: {
            status: string;
            last_active: number;
          };
        };
      }>('PresenceQuery', {
        user_id: userId,
      });

      return {
        userId,
        status: (result?.user?.presence?.status as 'active' | 'idle' | 'offline') || 'offline',
        lastActive: result?.user?.presence?.last_active,
      };
    } catch (error) {
      logger.error('Failed to get presence', error);
      throw error;
    }
  }

  /**
   * Parse user data
   */
  private parseUser(data: unknown): User {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid user data');
    }

    const user = data as Record<string, unknown>;

    return {
      userId: String(user.id || user.user_id),
      name: String(user.name || 'Unknown'),
      firstName: user.first_name as string | undefined,
      lastName: user.last_name as string | undefined,
      vanity: user.vanity as string | undefined,
      profileUrl: user.profile_url as string || `https://facebook.com/${user.id}`,
      thumbSrc: user.thumb_src as string | undefined,
      photoUrl: user.photo_url as string | undefined,
      coverPhotoUrl: user.cover_photo_url as string | undefined,
      isFriend: !!user.is_friend,
      isBlocked: !!user.is_blocked,
      gender: (user.gender as 'male' | 'female' | 'neutral') || undefined,
      type: (user.type as 'user' | 'page' | 'bot') || 'user',
      isVerified: !!user.is_verified,
      isActive: !!user.is_active,
      lastActiveTimestamp: Number(user.last_active_timestamp) || undefined,
    };
  }

  /**
   * Parse profile data
   */
  private parseProfile(data: unknown): Profile {
    const user = this.parseUser(data);
    const profile = data as Record<string, unknown>;

    return {
      ...user,
      bio: profile.bio as string | undefined,
      about: profile.about as string | undefined,
      quotes: profile.quotes as string | undefined,
      birthday: profile.birthday as string | undefined,
      email: profile.email as string | undefined,
      phone: profile.phone as string | undefined,
      website: profile.website as string | undefined,
      hometown: profile.hometown as { name: string } | undefined,
      currentCity: profile.current_city as { name: string } | undefined,
      work: (profile.work as import('../types/index.js').WorkExperience[]) || undefined,
      education: (profile.education as import('../types/index.js').Education[]) || undefined,
      relationshipStatus: profile.relationship_status as string | undefined,
      familyMembers: (profile.family_members as import('../types/index.js').FamilyMember[]) || undefined,
      friendCount: Number(profile.friend_count) || undefined,
      mutualFriendCount: Number(profile.mutual_friend_count) || undefined,
      isFollowing: profile.is_following as boolean | undefined,
      canMessage: !!profile.can_message,
    };
  }

  /**
   * Parse birthday data
   */
  private parseBirthday(data: unknown): Birthday {
    const bday = data as Record<string, unknown>;

    return {
      userId: String(bday.user_id || bday.id),
      name: String(bday.name || 'Unknown'),
      date: String(bday.date || bday.birthday_date),
      age: Number(bday.age) || undefined,
    };
  }
}
