/**
 * Panindigan Main Class
 * Fully-Featured Unofficial Facebook Chat API Library
 */

import { EventEmitter } from 'events';
import { Authenticator } from '../auth/Authenticator.js';
import { MQTTClient } from '../mqtt/MQTTClient.js';
import { MessageSender } from '../messaging/MessageSender.js';
import { ThreadManager } from '../threads/ThreadManager.js';
import { UserManager } from '../users/UserManager.js';
import { MediaUploader } from '../media/MediaUploader.js';
import { CheckpointGuard } from '../security/CheckpointGuard.js';
import { EntropyPool } from '../security/EntropyPool.js';
import { logger } from '../utils/Logger.js';
import {
  FACEBOOK_CREATE_POLL_URL,
  FACEBOOK_UPDATE_POLL_URL,
  FACEBOOK_POLL_RESULTS_URL,
  FACEBOOK_CREATE_EVENT_URL,
  FACEBOOK_RSVP_EVENT_URL,
  FACEBOOK_STORIES_URL,
  FACEBOOK_VIEW_STORY_URL,
  FACEBOOK_INITIATE_CALL_URL,
} from '../utils/Constants.js';
import { SessionExpiredError, MessageError } from '../errors/index.js';
import type { CheckpointCallback, GuardState, BurstLevel, GuardStats } from '../security/CheckpointGuard.js';
import type {
  LoginOptions,
  Session,
  AppState,
  SendMessageOptions,
  SendMessageResult,
  Thread,
  ThreadHistoryResult,
  Profile,
  PanindiganEvent,
  EventType,
  EventListener,
  ReactionType,
  CreateGroupOptions,
  UploadResult,
  ImageUploadOptions,
  VideoUploadOptions,
  AudioUploadOptions,
  DocumentUploadOptions,
  DownloadResult,
  DownloadOptions,
  Poll,
  CreatePollOptions,
  EventPlanner,
  CreateEventOptions,
  Story,
  CallResult,
  SearchUsersResult,
  GetFriendsResult,
  GetBlockedListResult,
  GetBirthdaysResult,
  Presence,
  MessageSearchOptions,
  MessageSearchResult,
  User,
  FriendRequest,
  RawEvent,
} from '../types/index.js';

export interface PanindiganFCAOptions extends LoginOptions {
  autoConnect?: boolean;
}

export class PanindiganFCA extends EventEmitter {
  private authenticator: Authenticator;
  private mqttClient: MQTTClient | null = null;
  private options: PanindiganFCAOptions;
  private connected: boolean = false;

  // Singleton manager instances — created once, reused for every call
  private messageSender: MessageSender;
  private threadManager: ThreadManager;
  private userManager: UserManager;
  private mediaUploader: MediaUploader;

  // Security subsystems
  private checkpointGuard: CheckpointGuard;
  private entropyPool: EntropyPool;

  constructor(options: PanindiganFCAOptions = {}) {
    super();
    this.options = options;
    this.authenticator = new Authenticator(options);

    // ── Security subsystems ──────────────────────────────────────────────────
    this.checkpointGuard = new CheckpointGuard();
    this.entropyPool     = new EntropyPool();

    // Forward checkpoint events to the EventEmitter so callers can listen
    this.checkpointGuard.onCheckpoint((url, err) => {
      logger.error('Checkpoint detected — stopping outbound sends', { url });
      this.emit('checkpoint', { url, error: err });
    });

    // ── Managers — all share the same GraphQLClient ──────────────────────────
    const gql = this.authenticator.getGraphQLClient();

    // Wire security into the HTTP stack
    gql.setCheckpointGuard(this.checkpointGuard);

    this.messageSender = new MessageSender(gql);
    this.messageSender.setCheckpointGuard(this.checkpointGuard);
    this.messageSender.setEntropyPool(this.entropyPool);

    this.threadManager = new ThreadManager(gql);
    this.userManager   = new UserManager(gql);
    this.mediaUploader = new MediaUploader(gql);

    if (options.logLevel) {
      logger.setLogLevel(options.logLevel);
    }
  }

  /**
   * Login to Facebook
   */
  async login(options?: LoginOptions): Promise<Session> {
    const envAppState = process.env.FACEBOOK_APPSTATE;
    const loginOptions = { ...options };

    if (envAppState && !loginOptions.appState && !loginOptions.credentials) {
      logger.info('Using FACEBOOK_APPSTATE from environment variable');
      loginOptions.appState = envAppState;
    }

    const session = await this.authenticator.login(loginOptions);

    if (this.options.autoConnect !== false) {
      await this.connect();
    }

    return session;
  }

  /**
   * Connect to MQTT for real-time events
   */
  async connect(): Promise<void> {
    if (this.connected || this.mqttClient?.isConnected()) {
      return;
    }

    const session = this.authenticator.getSession();
    if (!session) {
      throw new Error('Not logged in. Call login() first.');
    }

    logger.info('Connecting to MQTT...');

    this.mqttClient = new MQTTClient(session);

    this.mqttClient.on('connect', () => {
      this.connected = true;
      this.emit('connect');
      logger.info('Connected to MQTT');
    });

    this.mqttClient.on('disconnect', () => {
      this.connected = false;
      this.emit('disconnect');
    });

    this.mqttClient.on('message', (topic: string, payload: Buffer) => {
      this.handleMQTTMessage(topic, payload);
    });

    this.mqttClient.on('error', (error: unknown) => {
      this.emit('error', error);
    });

    await this.mqttClient.connect();
  }

  /**
   * Disconnect from MQTT
   */
  disconnect(): void {
    if (this.mqttClient) {
      this.mqttClient.disconnect();
      this.mqttClient = null;
    }
    this.connected = false;
  }

  /**
   * Logout
   */
  async logout(): Promise<void> {
    this.disconnect();
    await this.authenticator.logout();
  }

  isConnected(): boolean {
    return this.connected && (this.mqttClient?.isConnected() ?? false);
  }

  isLoggedIn(): boolean {
    return this.authenticator.isLoggedIn();
  }

  getSession(): Session | null {
    return this.authenticator.getSession();
  }

  getAppState(): AppState | null {
    return this.authenticator.getAppState();
  }

  // ==================== MESSAGING ====================

  /**
   * Send a message to a thread
   */
  async sendMessage(
    threadId: string,
    options: SendMessageOptions
  ): Promise<SendMessageResult> {
    this.requireLogin();
    const session = this.getSession()!;

    return this.messageSender.sendMessage({
      threadId,
      options,
      userId: session.userId,
      fbDtsg: session.fbDtsg,
      isGroup: true,
    });
  }

  /**
   * Send a text message (convenience method)
   */
  async sendText(threadId: string, text: string): Promise<SendMessageResult> {
    return this.sendMessage(threadId, { body: text });
  }

  /**
   * Reply to a message
   */
  async replyToMessage(
    threadId: string,
    messageId: string,
    text: string
  ): Promise<SendMessageResult> {
    return this.sendMessage(threadId, {
      body: text,
      replyToMessage: messageId,
    });
  }

  /**
   * Edit a message via real /messaging/edit_message/ endpoint
   */
  async editMessage(messageId: string, newText: string): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.editMessage(messageId, newText);
  }

  /**
   * Unsend a message via real /messaging/unsend_message/ endpoint
   */
  async unsendMessage(messageId: string): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.unsendMessage(messageId);
  }

  /**
   * React to a message via real /messaging/message_reactions/ endpoint
   */
  async reactToMessage(
    messageId: string,
    reaction: ReactionType | null
  ): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.reactToMessage(messageId, reaction);
  }

  /**
   * Forward a message via real /messaging/forward_message/ endpoint
   */
  async forwardMessage(
    messageId: string,
    threadId: string,
    isGroup: boolean = true
  ): Promise<SendMessageResult> {
    this.requireLogin();
    return this.messageSender.forwardMessage(messageId, threadId, isGroup);
  }

  /**
   * Get message history for a thread
   */
  async getMessageHistory(
    threadId: string,
    limit: number = 20
  ): Promise<ThreadHistoryResult> {
    this.requireLogin();
    return this.threadManager.getThreadHistory({ threadId, limit });
  }

  /**
   * Search messages in a thread
   */
  async searchMessages(
    options: MessageSearchOptions
  ): Promise<MessageSearchResult> {
    this.requireLogin();
    return this.threadManager.searchMessages(options);
  }

  /**
   * Mark messages as read via real /ajax/mercury/change_read_status.php
   */
  async markAsRead(threadId: string): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.markAsRead(threadId);
  }

  /**
   * Send delivery receipt via real /ajax/mercury/delivery_receipts.php
   */
  async markAsDelivered(threadId: string, messageId: string): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.markAsDelivered(threadId, messageId);
  }

  /**
   * Send typing indicator via real /ajax/messaging/typ.php
   */
  async sendTypingIndicator(
    threadId: string,
    isTyping: boolean = true
  ): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.sendTypingIndicator(threadId, isTyping, true);
  }

  // ==================== THREADS ====================

  async getThreadList(limit: number = 20): Promise<Thread[]> {
    this.requireLogin();
    const result = await this.threadManager.getThreadList({ limit });
    return result.threads;
  }

  async getThreadInfo(threadId: string): Promise<Thread> {
    this.requireLogin();
    return this.threadManager.getThreadInfo(threadId);
  }

  async createGroup(options: CreateGroupOptions): Promise<Thread> {
    this.requireLogin();
    return this.threadManager.createGroup(options);
  }

  async addParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.addParticipants(threadId, userIds);
  }

  async removeParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.removeParticipants(threadId, userIds);
  }

  async promoteParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.promoteParticipants(threadId, userIds);
  }

  async demoteParticipants(
    threadId: string,
    userIds: string[]
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.demoteParticipants(threadId, userIds);
  }

  async setNickname(
    threadId: string,
    userId: string,
    nickname: string
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.setNickname(threadId, userId, nickname);
  }

  async changeThreadColor(threadId: string, color: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.changeThreadColor(
      threadId,
      color as import('../types/index.js').ThreadColor
    );
  }

  async changeThreadEmoji(threadId: string, emoji: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.changeThreadEmoji(threadId, emoji);
  }

  /**
   * Change the group photo via real /messaging/set_thread_image/ endpoint.
   * Pass a pre-uploaded image attachment ID (from uploadImage).
   */
  async changeThreadImage(
    threadId: string,
    imageAttachmentId: string
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.setThreadImage(threadId, imageAttachmentId);
  }

  /**
   * Enable or disable join approval mode for a group
   */
  async setApprovalMode(threadId: string, enabled: boolean): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.setApprovalMode(threadId, enabled);
  }

  /**
   * Get the invite link for a group
   */
  async getInviteLink(threadId: string): Promise<string | null> {
    this.requireLogin();
    return this.threadManager.getInviteLink(threadId);
  }

  /**
   * Join a group via an invite link
   */
  async joinByInviteLink(link: string): Promise<Thread | null> {
    this.requireLogin();
    return this.threadManager.joinByInviteLink(link);
  }

  /**
   * Approve a pending join request
   */
  async approveMember(threadId: string, userId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.approveMember(threadId, userId);
  }

  /**
   * Reject a pending join request
   */
  async rejectMember(threadId: string, userId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.rejectMember(threadId, userId);
  }

  async pinMessage(threadId: string, messageId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.pinMessage(threadId, messageId);
  }

  async unpinMessage(threadId: string, messageId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.unpinMessage(threadId, messageId);
  }

  /**
   * Delete a message for yourself via /messaging/delete_message/
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.deleteMessage(messageId);
  }

  async leaveGroup(threadId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.leaveGroup(threadId);
  }

  async archiveThread(
    threadId: string,
    archive: boolean = true
  ): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.archiveThread(threadId, archive);
  }

  async muteThread(threadId: string, mute: boolean = true): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.muteThread(threadId, mute);
  }

  async deleteThread(threadId: string): Promise<boolean> {
    this.requireLogin();
    return this.threadManager.deleteThread(threadId);
  }

  // ==================== USERS ====================

  async getUserInfo(userId: string): Promise<Profile>;
  async getUserInfo(userIds: string[]): Promise<Record<string, Profile>>;
  async getUserInfo(
    userIdOrIds: string | string[]
  ): Promise<Profile | Record<string, Profile>> {
    this.requireLogin();
    if (Array.isArray(userIdOrIds)) {
      return this.userManager.getUserInfo(userIdOrIds);
    }
    return this.userManager.getUserInfo(userIdOrIds);
  }

  async searchUsers(
    query: string,
    limit: number = 10
  ): Promise<SearchUsersResult> {
    this.requireLogin();
    return this.userManager.searchUsers(query, limit);
  }

  async getFriends(limit: number = 100): Promise<GetFriendsResult> {
    this.requireLogin();
    return this.userManager.getFriends(limit);
  }

  async sendFriendRequest(userId: string, message?: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.sendFriendRequest(userId, message);
  }

  async acceptFriendRequest(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.acceptFriendRequest(userId);
  }

  async declineFriendRequest(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.declineFriendRequest(userId);
  }

  async cancelFriendRequest(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.cancelFriendRequest(userId);
  }

  async unfriend(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.unfriend(userId);
  }

  /**
   * Follow a user (subscribe to their public posts)
   */
  async followUser(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.followUser(userId);
  }

  /**
   * Unfollow a user
   */
  async unfollowUser(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.unfollowUser(userId);
  }

  /**
   * Get mutual friends with a user
   */
  async getMutualFriends(userId: string): Promise<User[]> {
    this.requireLogin();
    return this.userManager.getMutualFriends(userId);
  }

  /**
   * Get received (pending) friend requests
   */
  async getPendingFriendRequests(): Promise<FriendRequest[]> {
    this.requireLogin();
    return this.userManager.getPendingFriendRequests();
  }

  /**
   * Get sent (outgoing) friend requests
   */
  async getSentFriendRequests(): Promise<FriendRequest[]> {
    this.requireLogin();
    return this.userManager.getSentFriendRequests();
  }

  async blockUser(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.blockUser(userId);
  }

  async unblockUser(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.unblockUser(userId);
  }

  async getBlockedList(): Promise<GetBlockedListResult> {
    this.requireLogin();
    return this.userManager.getBlockedList();
  }

  async getBirthdays(): Promise<GetBirthdaysResult> {
    this.requireLogin();
    return this.userManager.getBirthdays();
  }

  /**
   * Query per-user online presence via POST /ajax/mercury/chat_online_presences.php.
   * For real-time bulk presence updates, listen to MQTT `presence` events instead.
   */
  async getPresence(userId: string): Promise<Presence> {
    this.requireLogin();
    return this.userManager.getPresence(userId);
  }

  // ==================== MEDIA ====================

  async uploadImage(
    buffer: Buffer,
    options?: ImageUploadOptions
  ): Promise<UploadResult> {
    this.requireLogin();
    return this.mediaUploader.uploadImage(buffer, options);
  }

  async uploadVideo(
    buffer: Buffer,
    options?: VideoUploadOptions
  ): Promise<UploadResult> {
    this.requireLogin();
    return this.mediaUploader.uploadVideo(buffer, options);
  }

  async uploadAudio(
    buffer: Buffer,
    options?: AudioUploadOptions
  ): Promise<UploadResult> {
    this.requireLogin();
    return this.mediaUploader.uploadAudio(buffer, options);
  }

  async uploadDocument(
    buffer: Buffer,
    options?: DocumentUploadOptions
  ): Promise<UploadResult> {
    this.requireLogin();
    return this.mediaUploader.uploadDocument(
      buffer,
      options || { filename: 'document.pdf' }
    );
  }

  async downloadAttachment(
    url: string,
    options?: DownloadOptions
  ): Promise<DownloadResult> {
    this.requireLogin();
    return this.mediaUploader.downloadAttachment(url, options);
  }

  // ==================== POLLS ====================

  /**
   * Create a poll in a thread via POST /messaging/create_poll/
   */
  async createPoll(options: CreatePollOptions): Promise<Poll> {
    this.requireLogin();
    logger.debug('Creating poll', options);

    const form: Record<string, string> = {
      thread_fbid: options.threadId,
      question: options.question,
      allows_multiple_choices: String(!!(options.allowsMultipleChoices)),
    };
    options.options.forEach((text, i) => {
      form[`options[${i}]`] = text;
    });
    if (options.duration) {
      form['duration'] = String(options.duration);
    }

    try {
      const result = await this.authenticator.getGraphQLClient().formPost<{
        payload?: {
          poll_id?: string;
          question?: string;
          options?: Array<{ id: string; text: string; vote_count: number }>;
          total_votes?: number;
          is_closed?: boolean;
        };
      }>(FACEBOOK_CREATE_POLL_URL, form);

      const payload = result?.payload;
      return {
        pollId: payload?.poll_id || `poll_${Date.now()}`,
        threadId: options.threadId,
        creatorId: this.getSession()?.userId || '',
        question: payload?.question || options.question,
        options:
          payload?.options?.map((opt) => ({
            optionId: opt.id,
            text: opt.text,
            voteCount: opt.vote_count,
          })) ??
          options.options.map((text, idx) => ({
            optionId: `opt_${idx}`,
            text,
            voteCount: 0,
          })),
        totalVotes: payload?.total_votes ?? 0,
        isClosed: payload?.is_closed ?? false,
        allowsMultipleChoices: options.allowsMultipleChoices ?? false,
        createdAt: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to create poll', error);
      throw error;
    }
  }

  /**
   * Vote on a poll via POST /messaging/update_vote/
   */
  async votePoll(pollId: string, optionIds: string[]): Promise<boolean> {
    this.requireLogin();

    const form: Record<string, string> = { poll_id: pollId };
    optionIds.forEach((id, i) => {
      form[`option_ids[${i}]`] = id;
    });

    try {
      await this.authenticator.getGraphQLClient().formPost(
        FACEBOOK_UPDATE_POLL_URL,
        form
      );
      return true;
    } catch (error) {
      logger.error('Failed to vote on poll', error);
      return false;
    }
  }

  /**
   * Get poll results via POST /ajax/messaging/poll_info.php
   */
  async getPollResults(pollId: string): Promise<Poll> {
    this.requireLogin();
    logger.debug('Getting poll results', { pollId });

    try {
      const result = await this.authenticator.getGraphQLClient().formPost<{
        payload?: {
          poll_id?: string;
          question?: string;
          thread_id?: string;
          creator_id?: string;
          options?: Array<{
            id?: string;
            text?: string;
            vote_count?: number;
            voters?: string[];
          }>;
          total_votes?: number;
          is_closed?: boolean;
          allows_multiple_choices?: boolean;
          created_time?: number;
          closed_time?: number;
        };
      }>(FACEBOOK_POLL_RESULTS_URL, { poll_id: pollId });

      const p = result?.payload;
      if (!p) throw new MessageError(`Poll ${pollId} not found`);

      return {
        pollId: p.poll_id || pollId,
        threadId: p.thread_id || '',
        creatorId: p.creator_id || '',
        question: p.question || '',
        options: (p.options || []).map((opt) => ({
          optionId: opt.id || '',
          text: opt.text || '',
          voteCount: opt.vote_count || 0,
          voters: opt.voters,
        })),
        totalVotes: p.total_votes || 0,
        isClosed: p.is_closed || false,
        allowsMultipleChoices: p.allows_multiple_choices || false,
        createdAt: p.created_time ? p.created_time * 1000 : Date.now(),
        closedAt: p.closed_time ? p.closed_time * 1000 : undefined,
      };
    } catch (error) {
      logger.error('Failed to get poll results', error);
      throw error;
    }
  }

  // ==================== EVENTS ====================

  /**
   * Create a Messenger event planner via POST /messaging/create_event/
   */
  async createEvent(options: CreateEventOptions): Promise<EventPlanner> {
    this.requireLogin();
    logger.debug('Creating event', options);

    const form: Record<string, string> = {
      thread_fbid: options.threadId,
      title: options.name,
      start_time: String(Math.floor(options.startTime / 1000)),
    };
    if (options.description) form['note'] = options.description;
    if (options.location) form['location'] = options.location;
    if (options.endTime) form['end_time'] = String(Math.floor(options.endTime / 1000));

    try {
      const result = await this.authenticator.getGraphQLClient().formPost<{
        payload?: {
          event_id?: string;
          title?: string;
          note?: string;
          location?: string;
          start_time?: number;
          end_time?: number;
          creator_id?: string;
          going_count?: number;
          maybe_count?: number;
          cant_go_count?: number;
          invited_count?: number;
          is_cancelled?: boolean;
        };
      }>(FACEBOOK_CREATE_EVENT_URL, form);

      const ev = result?.payload;
      return {
        eventId: ev?.event_id || `event_${Date.now()}`,
        threadId: options.threadId,
        creatorId: ev?.creator_id || this.getSession()?.userId || '',
        name: ev?.title || options.name,
        description: ev?.note || options.description,
        location: ev?.location || options.location,
        startTime: ev?.start_time ? ev.start_time * 1000 : options.startTime,
        endTime: ev?.end_time ? ev.end_time * 1000 : options.endTime,
        guestCount: {
          going: ev?.going_count || 0,
          maybe: ev?.maybe_count || 0,
          cantGo: ev?.cant_go_count || 0,
          invited: ev?.invited_count || 0,
        },
        isCancelled: ev?.is_cancelled || false,
      };
    } catch (error) {
      logger.error('Failed to create event', error);
      throw error;
    }
  }

  /**
   * RSVP to a Messenger event via POST /messaging/update_event_rsvp/
   */
  async rsvpToEvent(
    eventId: string,
    response: 'going' | 'maybe' | 'cant_go'
  ): Promise<boolean> {
    this.requireLogin();

    try {
      await this.authenticator.getGraphQLClient().formPost(
        FACEBOOK_RSVP_EVENT_URL,
        { event_id: eventId, rsvp_status: response }
      );
      return true;
    } catch (error) {
      logger.error('Failed to RSVP to event', error);
      return false;
    }
  }

  // ==================== STORIES ====================

  /**
   * Get stories for the authenticated user or a specific user
   * via POST /ajax/stories/
   */
  async getStories(userId?: string): Promise<Story[]> {
    this.requireLogin();
    logger.debug('Getting stories', { userId });

    try {
      const params: Record<string, string> = { action: 'get_stories' };
      if (userId) params['user_id'] = userId;

      const result = await this.authenticator.getGraphQLClient().formPost<{
        payload?: {
          stories?: Array<{
            id?: string;
            story_id?: string;
            author_fbid?: string;
            author_name?: string;
            type?: string;
            url?: string;
            thumbnail_url?: string;
            text?: string;
            creation_time?: number;
            expiration_time?: number;
            seen_by?: string[];
            reactions?: Array<{ user_id?: string; reaction?: string }>;
          }>;
        };
      }>(FACEBOOK_STORIES_URL, params);

      return (result?.payload?.stories || []).map((s) => ({
        storyId: s.id || s.story_id || '',
        authorId: s.author_fbid || '',
        authorName: s.author_name || 'Unknown',
        type: (s.type as 'image' | 'video' | 'text') || 'image',
        url: s.url,
        thumbnailUrl: s.thumbnail_url,
        text: s.text,
        timestamp: s.creation_time ? s.creation_time * 1000 : Date.now(),
        expiresAt: s.expiration_time
          ? s.expiration_time * 1000
          : Date.now() + 86400000,
        seenBy: s.seen_by || [],
        reactions: (s.reactions || []).map((r) => ({
          userId: r.user_id || '',
          reaction: r.reaction || '',
        })),
      }));
    } catch (error) {
      logger.error('Failed to get stories', error);
      throw error;
    }
  }

  /**
   * Mark a story as viewed via POST /ajax/stories/seen/
   */
  async viewStory(storyId: string): Promise<boolean> {
    this.requireLogin();

    try {
      await this.authenticator.getGraphQLClient().formPost(
        FACEBOOK_VIEW_STORY_URL,
        { 'story_ids[0]': storyId }
      );
      return true;
    } catch (error) {
      logger.error('Failed to view story', error);
      return false;
    }
  }

  // ==================== SECURITY ====================

  /**
   * Register a callback that fires whenever a Facebook checkpoint is detected.
   * The guard will block all outgoing sends until `clearCheckpoint()` is called.
   */
  onCheckpoint(cb: CheckpointCallback): this {
    this.checkpointGuard.onCheckpoint(cb);
    return this;
  }

  /**
   * Whether the account is currently in a checkpoint or suspended state.
   */
  isCheckpointed(): boolean {
    return this.checkpointGuard.isBlocked();
  }

  /**
   * Clear a checkpoint/suspended state after the user has manually resolved
   * the security challenge.  Resets burst counters too.
   */
  clearCheckpoint(): void {
    this.checkpointGuard.clearCheckpoint();
  }

  /**
   * Current burst level for the rolling 60-second send window.
   * 'safe' = < 20/min  |  'warn' = 20–39/min  |  'critical' = ≥ 40/min
   */
  getBurstLevel(): BurstLevel {
    return this.checkpointGuard.burstLevel();
  }

  /**
   * Current guard state: 'clear', 'checkpoint', or 'suspended'.
   */
  getGuardState(): GuardState {
    return this.checkpointGuard.getState();
  }

  /**
   * Full diagnostics snapshot from the security subsystem.
   */
  getSecurityStats(): GuardStats {
    return this.checkpointGuard.getStats();
  }

  /**
   * Number of messages sent in the current 60-second burst window.
   */
  getSendsLastMinute(): number {
    return this.checkpointGuard.sendsLastMinute();
  }

  /**
   * Entropy pool diagnostics (pool depth, draw count, total refills).
   */
  getEntropyStats(): ReturnType<EntropyPool['getStats']> {
    return this.entropyPool.getStats();
  }

  // ==================== CALLS ====================

  /**
   * Initiate a Messenger voice/video call via POST /messaging/call/
   * Call signaling (ICE, SDP) happens over MQTT /t_rtc and /webrtc topics.
   */
  async initiateCall(
    threadId: string,
    isVideo: boolean = false
  ): Promise<CallResult> {
    this.requireLogin();
    logger.debug('Initiating call', { threadId, isVideo });

    try {
      const result = await this.authenticator.getGraphQLClient().formPost<{
        payload?: {
          call_id?: string;
          status?: string;
        };
      }>(FACEBOOK_INITIATE_CALL_URL, {
        thread_fbid: threadId,
        call_type: isVideo ? 'video' : 'audio',
      });

      return {
        callId: result?.payload?.call_id || `call_${Date.now()}`,
        status:
          (result?.payload?.status as
            | 'initiated'
            | 'connected'
            | 'ended'
            | 'failed') || 'initiated',
      };
    } catch (error) {
      logger.error('Failed to initiate call', error);
      return { callId: `call_${Date.now()}`, status: 'failed' };
    }
  }

  // ==================== EVENT HANDLING ====================

  on<T extends EventType>(
    event: T,
    listener: EventListener<PanindiganEvent>
  ): this {
    super.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  off<T extends EventType>(
    event: T,
    listener: EventListener<PanindiganEvent>
  ): this {
    super.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<T extends EventType>(
    event: T,
    listener: EventListener<PanindiganEvent>
  ): this {
    super.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  // ==================== PRIVATE ====================

  private requireLogin(): void {
    if (!this.isLoggedIn()) {
      throw new SessionExpiredError();
    }
  }

  /**
   * Handle an incoming MQTT message.
   * The EventParser handles both JSON and zlib-compressed binary payloads,
   * so we always forward the raw Buffer — no pre-parsing needed here.
   */
  private handleMQTTMessage(topic: string, payload: Buffer): void {
    try {
      logger.debug('Received MQTT message', {
        topic,
        payloadLength: payload.length,
      });

      // Emit typed raw event for debugging / custom handling
      const rawEvent: RawEvent = {
        type: 'raw',
        timestamp: Date.now(),
        topic,
        payload,
      };
      this.emit('raw', rawEvent);

      // Let MQTTClient's parseEvent handle all decoding (JSON + binary)
      const event = this.mqttClient?.parseEvent(topic, payload);
      if (event) {
        const eventRecord = event as unknown as Record<string, unknown>;
        const threadId =
          eventRecord.threadId ||
          (eventRecord.message as Record<string, unknown> | undefined)
            ?.threadId;

        logger.debug('Parsed MQTT event', {
          topic,
          eventType: event.type,
          threadId: threadId as string | undefined,
        });

        this.emit(event.type, event);
        this.emit('event', event);
      }
    } catch (error) {
      logger.error('Error handling MQTT message', {
        topic,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Export factory function
export async function login(options: LoginOptions): Promise<PanindiganFCA> {
  const api = new PanindiganFCA(options);
  await api.login();
  return api;
}

export default PanindiganFCA;
