/**
 * Panindigan Main Class
 * Fully-Featured Unofficial Facebook Chat API Library
 */

import { EventEmitter } from 'events';
import { Authenticator } from '../auth/Authenticator.js';
import { MQTTClient } from '../mqtt/MQTTClient.js';
import { MediaUploader } from '../media/MediaUploader.js';
import { logger } from '../utils/Logger.js';
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
} from '../types/index.js';

export interface PanindiganFCAOptions extends LoginOptions {
  autoConnect?: boolean;
}

export class PanindiganFCA extends EventEmitter {
  private authenticator: Authenticator;
  private mqttClient: MQTTClient | null = null;
  private options: PanindiganFCAOptions;
  private connected: boolean = false;
  // Event listeners are handled by EventEmitter base class

  constructor(options: PanindiganFCAOptions = {}) {
    super();
    this.options = options;
    this.authenticator = new Authenticator(options);
    
    // Set log level
    if (options.logLevel) {
      logger.setLogLevel(options.logLevel);
    }
  }

  /**
   * Get MediaUploader instance
   */
  private getMediaUploader(): MediaUploader {
    return new MediaUploader(this.authenticator.getGraphQLClient());
  }

  /**
   * Login to Facebook
   */
  async login(options?: LoginOptions): Promise<Session> {
    // Check environment variable for AppState (safe hosting)
    const envAppState = process.env.FACEBOOK_APPSTATE;
    const loginOptions = { ...options };
    
    if (envAppState && !loginOptions.appState && !loginOptions.credentials) {
      logger.info('Using FACEBOOK_APPSTATE from environment variable');
      loginOptions.appState = envAppState;
    }
    
    const session = await this.authenticator.login(loginOptions);
    
    // Auto-connect MQTT if enabled
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
    
    // Set up MQTT event handlers
    this.mqttClient.on('connect', () => {
      this.connected = true;
      this.emit('connect');
      logger.info('Connected to MQTT');
    });

    this.mqttClient.on('disconnect', () => {
      this.connected = false;
      this.emit('disconnect');
    });

    this.mqttClient.on('message', (topic, payload) => {
      this.handleMQTTMessage(topic, payload);
    });

    this.mqttClient.on('error', (error) => {
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

  /**
   * Check if connected to MQTT
   */
  isConnected(): boolean {
    return this.connected && (this.mqttClient?.isConnected() ?? false);
  }

  /**
   * Check if logged in
   */
  isLoggedIn(): boolean {
    return this.authenticator.isLoggedIn();
  }

  /**
   * Get current session
   */
  getSession(): Session | null {
    return this.authenticator.getSession();
  }

  /**
   * Get AppState for saving
   */
  getAppState(): AppState | null {
    return this.authenticator.getAppState();
  }

  // ==================== MESSAGING ====================

  /**
   * Send a message
   */
  async sendMessage(threadId: string, options: SendMessageOptions): Promise<SendMessageResult> {
    this.requireLogin();
    const session = this.getSession()!;
    
    logger.debug('Sending message', { threadId, options });
    
    const { MessageSender } = await import('../messaging/MessageSender.js');
    const sender = new MessageSender(this.authenticator.getGraphQLClient());
    
    return sender.sendMessage({
      threadId,
      options,
      userId: session.userId,
      fbDtsg: session.fbDtsg,
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
  async replyToMessage(threadId: string, messageId: string, text: string): Promise<SendMessageResult> {
    return this.sendMessage(threadId, {
      body: text,
      replyToMessage: messageId,
    });
  }

  /**
   * Edit a message
   */
  async editMessage(messageId: string, newText: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Editing message', { messageId, newText });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('MessageEditMutation', {
        message_id: messageId,
        body: newText,
      });
      return true;
    } catch (error) {
      logger.error('Failed to edit message', error);
      return false;
    }
  }

  /**
   * Unsend/delete a message
   */
  async unsendMessage(messageId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Unsending message', { messageId });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('MessageUnsendMutation', {
        message_id: messageId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to unsend message', error);
      return false;
    }
  }

  /**
   * React to a message
   */
  async reactToMessage(messageId: string, reaction: ReactionType | null): Promise<boolean> {
    this.requireLogin();
    logger.debug('Reacting to message', { messageId, reaction });
    
    try {
      const { REACTION_IDS } = await import('../utils/Constants.js');
      await this.authenticator.getGraphQLClient().mutation('MessageReactionMutation', {
        message_id: messageId,
        reaction: reaction ? REACTION_IDS[reaction] : 0,
      });
      return true;
    } catch (error) {
      logger.error('Failed to react to message', error);
      return false;
    }
  }

  /**
   * Forward a message
   */
  async forwardMessage(messageId: string, threadId: string): Promise<SendMessageResult> {
    this.requireLogin();
    logger.debug('Forwarding message', { messageId, threadId });
    
    try {
      const result = await this.authenticator.getGraphQLClient().mutation<{
        forward_message: {
          message: {
            message_id: string;
            timestamp: number;
          };
        };
      }>('MessageForwardMutation', {
        message_id: messageId,
        thread_id: threadId,
      });
      
      return {
        messageId: result?.forward_message?.message?.message_id || `fwd_${Date.now()}`,
        timestamp: result?.forward_message?.message?.timestamp || Date.now(),
        threadId,
      };
    } catch (error) {
      logger.error('Failed to forward message', error);
      throw error;
    }
  }

  /**
   * Get message history
   */
  async getMessageHistory(threadId: string, limit: number = 20): Promise<ThreadHistoryResult> {
    this.requireLogin();
    logger.debug('Getting message history', { threadId, limit });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.getThreadHistory({ threadId, limit });
  }

  /**
   * Mark messages as read
   */
  async markAsRead(threadId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Marking as read', { threadId });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('MarkAsReadMutation', {
        thread_id: threadId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to mark as read', error);
      return false;
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(threadId: string, isTyping: boolean = true): Promise<boolean> {
    this.requireLogin();
    logger.debug('Sending typing indicator', { threadId, isTyping });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('TypingIndicatorMutation', {
        thread_id: threadId,
        is_typing: isTyping,
      });
      return true;
    } catch (error) {
      logger.error('Failed to send typing indicator', error);
      return false;
    }
  }

  // ==================== THREADS ====================

  /**
   * Get thread list
   */
  async getThreadList(limit: number = 20): Promise<Thread[]> {
    this.requireLogin();
    logger.debug('Getting thread list', { limit });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    const result = await manager.getThreadList({ limit });
    return result.threads;
  }

  /**
   * Get thread info
   */
  async getThreadInfo(threadId: string): Promise<Thread> {
    this.requireLogin();
    logger.debug('Getting thread info', { threadId });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.getThreadInfo(threadId);
  }

  /**
   * Create a group
   */
  async createGroup(options: CreateGroupOptions): Promise<Thread> {
    this.requireLogin();
    logger.debug('Creating group', options);
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.createGroup(options);
  }

  /**
   * Add participants to group
   */
  async addParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    this.requireLogin();
    logger.debug('Adding participants', { threadId, userIds });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.addParticipants(threadId, userIds);
  }

  /**
   * Remove participants from group
   */
  async removeParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    this.requireLogin();
    logger.debug('Removing participants', { threadId, userIds });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.removeParticipants(threadId, userIds);
  }

  /**
   * Promote participants to admin
   */
  async promoteParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    this.requireLogin();
    logger.debug('Promoting participants', { threadId, userIds });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.promoteParticipants(threadId, userIds);
  }

  /**
   * Demote participants from admin
   */
  async demoteParticipants(threadId: string, userIds: string[]): Promise<boolean> {
    this.requireLogin();
    logger.debug('Demoting participants', { threadId, userIds });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.demoteParticipants(threadId, userIds);
  }

  /**
   * Set nickname in thread
   */
  async setNickname(threadId: string, userId: string, nickname: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Setting nickname', { threadId, userId, nickname });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.setNickname(threadId, userId, nickname);
  }

  /**
   * Change thread color
   */
  async changeThreadColor(threadId: string, color: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Changing thread color', { threadId, color });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.changeThreadColor(threadId, color as import('../types/index.js').ThreadColor);
  }

  /**
   * Change thread emoji
   */
  async changeThreadEmoji(threadId: string, emoji: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Changing thread emoji', { threadId, emoji });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.changeThreadEmoji(threadId, emoji);
  }

  /**
   * Leave group
   */
  async leaveGroup(threadId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Leaving group', { threadId });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.leaveGroup(threadId);
  }

  /**
   * Archive thread
   */
  async archiveThread(threadId: string, archive: boolean = true): Promise<boolean> {
    this.requireLogin();
    logger.debug('Archiving thread', { threadId, archive });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.archiveThread(threadId, archive);
  }

  /**
   * Mute thread
   */
  async muteThread(threadId: string, mute: boolean = true): Promise<boolean> {
    this.requireLogin();
    logger.debug('Muting thread', { threadId, mute });
    
    const { ThreadManager } = await import('../threads/ThreadManager.js');
    const manager = new ThreadManager(this.authenticator.getGraphQLClient());
    
    return manager.muteThread(threadId, mute);
  }

  // ==================== USERS ====================

  /**
   * Get user info
   */
  async getUserInfo(userId: string): Promise<Profile>;
  async getUserInfo(userIds: string[]): Promise<Record<string, Profile>>;
  async getUserInfo(userIdOrIds: string | string[]): Promise<Profile | Record<string, Profile>> {
    this.requireLogin();
    logger.debug('Getting user info', { userIdOrIds });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    if (Array.isArray(userIdOrIds)) {
      return manager.getUserInfo(userIdOrIds);
    }
    return manager.getUserInfo(userIdOrIds);
  }

  /**
   * Search for users
   */
  async searchUsers(query: string, limit: number = 10): Promise<SearchUsersResult> {
    this.requireLogin();
    logger.debug('Searching users', { query, limit });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.searchUsers(query, limit);
  }

  /**
   * Get friends list
   */
  async getFriends(limit: number = 100): Promise<GetFriendsResult> {
    this.requireLogin();
    logger.debug('Getting friends', { limit });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.getFriends(limit);
  }

  /**
   * Send friend request
   */
  async sendFriendRequest(userId: string, message?: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Sending friend request', { userId, message });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.sendFriendRequest(userId, message);
  }

  /**
   * Accept friend request
   */
  async acceptFriendRequest(userId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Accepting friend request', { userId });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.acceptFriendRequest(userId);
  }

  /**
   * Decline friend request
   */
  async declineFriendRequest(userId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Declining friend request', { userId });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.declineFriendRequest(userId);
  }

  /**
   * Unfriend
   */
  async unfriend(userId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Unfriending', { userId });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.unfriend(userId);
  }

  /**
   * Block user
   */
  async blockUser(userId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Blocking user', { userId });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.blockUser(userId);
  }

  /**
   * Unblock user
   */
  async unblockUser(userId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Unblocking user', { userId });
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.unblockUser(userId);
  }

  /**
   * Get blocked list
   */
  async getBlockedList(): Promise<GetBlockedListResult> {
    this.requireLogin();
    logger.debug('Getting blocked list');
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.getBlockedList();
  }

  /**
   * Get birthdays
   */
  async getBirthdays(): Promise<GetBirthdaysResult> {
    this.requireLogin();
    logger.debug('Getting birthdays');
    
    const { UserManager } = await import('../users/UserManager.js');
    const manager = new UserManager(this.authenticator.getGraphQLClient());
    
    return manager.getBirthdays();
  }

  // ==================== MEDIA ====================

  /**
   * Upload image
   */
  async uploadImage(buffer: Buffer, options?: ImageUploadOptions): Promise<UploadResult> {
    this.requireLogin();
    logger.debug('Uploading image', options);
    
    try {
      return await this.getMediaUploader().uploadImage(buffer, options);
    } catch (error) {
      logger.error('Failed to upload image', error);
      throw error;
    }
  }

  /**
   * Upload video
   */
  async uploadVideo(buffer: Buffer, options?: VideoUploadOptions): Promise<UploadResult> {
    this.requireLogin();
    logger.debug('Uploading video', options);
    
    try {
      return await this.getMediaUploader().uploadVideo(buffer, options);
    } catch (error) {
      logger.error('Failed to upload video', error);
      throw error;
    }
  }

  /**
   * Upload audio
   */
  async uploadAudio(buffer: Buffer, options?: AudioUploadOptions): Promise<UploadResult> {
    this.requireLogin();
    logger.debug('Uploading audio', options);
    
    try {
      return await this.getMediaUploader().uploadAudio(buffer, options);
    } catch (error) {
      logger.error('Failed to upload audio', error);
      throw error;
    }
  }

  /**
   * Upload document
   */
  async uploadDocument(buffer: Buffer, options?: DocumentUploadOptions): Promise<UploadResult> {
    this.requireLogin();
    logger.debug('Uploading document', options);
    
    try {
      return await this.getMediaUploader().uploadDocument(buffer, options || { filename: 'document.pdf' });
    } catch (error) {
      logger.error('Failed to upload document', error);
      throw error;
    }
  }

  /**
   * Download attachment
   */
  async downloadAttachment(url: string, options?: DownloadOptions): Promise<DownloadResult> {
    this.requireLogin();
    logger.debug('Downloading attachment', { url, options });
    
    try {
      const response = await this.authenticator.getRequestHandler().get(url);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get('content-type') || 'application/octet-stream';
      const contentDisposition = response.headers.get('content-disposition');
      let filename = options?.filename || 'download';
      
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      return {
        buffer,
        filename,
        mimeType: contentType,
        size: buffer.length,
      };
    } catch (error) {
      logger.error('Failed to download attachment', error);
      throw error;
    }
  }

  // ==================== POLLS ====================

  /**
   * Create a poll
   */
  async createPoll(options: CreatePollOptions): Promise<Poll> {
    this.requireLogin();
    logger.debug('Creating poll', options);
    
    try {
      const result = await this.authenticator.getGraphQLClient().mutation<{
        create_poll: {
          poll: {
            id: string;
            question: string;
            options: Array<{
              id: string;
              text: string;
              vote_count: number;
            }>;
            total_votes: number;
            is_closed: boolean;
          };
        };
      }>('CreatePollMutation', {
        thread_id: options.threadId,
        question: options.question,
        options: options.options,
        allows_multiple_choices: options.allowsMultipleChoices || false,
        duration: options.duration,
      });
      
      const poll = result?.create_poll?.poll;
      
      return {
        pollId: poll?.id || `poll_${Date.now()}`,
        threadId: options.threadId,
        creatorId: this.getSession()?.userId || '',
        question: poll?.question || options.question,
        options: poll?.options?.map((opt: { id: string; text: string; vote_count: number }) => ({
          optionId: opt.id,
          text: opt.text,
          voteCount: opt.vote_count,
        })) || options.options.map((text, idx) => ({
          optionId: `opt_${idx}`,
          text,
          voteCount: 0,
        })),
        totalVotes: poll?.total_votes || 0,
        isClosed: poll?.is_closed || false,
        allowsMultipleChoices: options.allowsMultipleChoices || false,
        createdAt: Date.now(),
      };
    } catch (error) {
      logger.error('Failed to create poll', error);
      throw error;
    }
  }

  /**
   * Vote on a poll
   */
  async votePoll(pollId: string, optionIds: string[]): Promise<boolean> {
    this.requireLogin();
    logger.debug('Voting on poll', { pollId, optionIds });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('VotePollMutation', {
        poll_id: pollId,
        option_ids: optionIds,
      });
      return true;
    } catch (error) {
      logger.error('Failed to vote on poll', error);
      return false;
    }
  }

  /**
   * Get poll results
   */
  async getPollResults(pollId: string): Promise<Poll> {
    this.requireLogin();
    logger.debug('Getting poll results', { pollId });
    
    try {
      const result = await this.authenticator.getGraphQLClient().query<{
        poll: {
          id: string;
          thread_id: string;
          creator_id: string;
          question: string;
          options: Array<{
            id: string;
            text: string;
            vote_count: number;
            voters?: string[];
          }>;
          total_votes: number;
          is_closed: boolean;
          allows_multiple_choices: boolean;
          created_at: number;
          closed_at?: number;
        };
      }>('PollQuery', {
        poll_id: pollId,
      });
      
      const poll = result?.poll;
      
      if (!poll) {
        throw new Error('Poll not found');
      }
      
      return {
        pollId: poll.id,
        threadId: poll.thread_id,
        creatorId: poll.creator_id,
        question: poll.question,
        options: poll.options.map((opt: { id: string; text: string; vote_count: number; voters?: string[] }) => ({
          optionId: opt.id,
          text: opt.text,
          voteCount: opt.vote_count,
          voters: opt.voters,
        })),
        totalVotes: poll.total_votes,
        isClosed: poll.is_closed,
        allowsMultipleChoices: poll.allows_multiple_choices,
        createdAt: poll.created_at,
        closedAt: poll.closed_at,
      };
    } catch (error) {
      logger.error('Failed to get poll results', error);
      throw error;
    }
  }

  // ==================== EVENTS ====================

  /**
   * Create an event
   */
  async createEvent(options: CreateEventOptions): Promise<EventPlanner> {
    this.requireLogin();
    logger.debug('Creating event', options);
    
    try {
      const result = await this.authenticator.getGraphQLClient().mutation<{
        create_event: {
          event: {
            id: string;
            name: string;
            description?: string;
            location?: string;
            start_time: number;
            end_time?: number;
            cover_image?: string;
            guest_count: {
              going: number;
              maybe: number;
              cant_go: number;
              invited: number;
            };
          };
        };
      }>('CreateEventMutation', {
        thread_id: options.threadId,
        name: options.name,
        description: options.description,
        location: options.location,
        start_time: options.startTime,
        end_time: options.endTime,
        cover_image: options.coverImage,
      });
      
      const event = result?.create_event?.event;
      
      return {
        eventId: event?.id || `event_${Date.now()}`,
        threadId: options.threadId,
        creatorId: this.getSession()?.userId || '',
        name: event?.name || options.name,
        description: event?.description || options.description,
        location: event?.location || options.location,
        startTime: event?.start_time || options.startTime,
        endTime: event?.end_time || options.endTime,
        coverImage: event?.cover_image,
        guestCount: event?.guest_count ? {
          going: event.guest_count.going,
          maybe: event.guest_count.maybe,
          cantGo: event.guest_count.cant_go,
          invited: event.guest_count.invited,
        } : { going: 0, maybe: 0, cantGo: 0, invited: 0 },
        isCancelled: false,
      };
    } catch (error) {
      logger.error('Failed to create event', error);
      throw error;
    }
  }

  /**
   * RSVP to an event
   */
  async rsvpToEvent(eventId: string, response: 'going' | 'maybe' | 'cant_go'): Promise<boolean> {
    this.requireLogin();
    logger.debug('RSVP to event', { eventId, response });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('RSVPEventMutation', {
        event_id: eventId,
        response: response,
      });
      return true;
    } catch (error) {
      logger.error('Failed to RSVP to event', error);
      return false;
    }
  }

  // ==================== STORIES ====================

  /**
   * Get stories
   */
  async getStories(userId?: string): Promise<Story[]> {
    this.requireLogin();
    logger.debug('Getting stories', { userId });
    
    try {
      const result = await this.authenticator.getGraphQLClient().query<{
        stories: Array<{
          id: string;
          author_id: string;
          author_name: string;
          type: 'image' | 'video' | 'text';
          url?: string;
          thumbnail_url?: string;
          text?: string;
          timestamp: number;
          expires_at: number;
          seen_by: string[];
          reactions: Array<{
            user_id: string;
            reaction: string;
          }>;
        }>;
      }>('StoriesQuery', {
        user_id: userId,
      });
      
      return (result?.stories || []).map((story: { id: string; author_id: string; author_name: string; type: 'image' | 'video' | 'text'; url?: string; thumbnail_url?: string; text?: string; timestamp: number; expires_at: number; seen_by: string[]; reactions: Array<{ user_id: string; reaction: string }> }) => ({
        storyId: story.id,
        authorId: story.author_id,
        authorName: story.author_name,
        type: story.type,
        url: story.url,
        thumbnailUrl: story.thumbnail_url,
        text: story.text,
        timestamp: story.timestamp,
        expiresAt: story.expires_at,
        seenBy: story.seen_by,
        reactions: story.reactions.map((r: { user_id: string; reaction: string }) => ({
          userId: r.user_id,
          reaction: r.reaction,
        })),
      }));
    } catch (error) {
      logger.error('Failed to get stories', error);
      return [];
    }
  }

  /**
   * View story
   */
  async viewStory(storyId: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Viewing story', { storyId });
    
    try {
      await this.authenticator.getGraphQLClient().mutation('ViewStoryMutation', {
        story_id: storyId,
      });
      return true;
    } catch (error) {
      logger.error('Failed to view story', error);
      return false;
    }
  }

  // ==================== CALLS ====================

  /**
   * Initiate a call
   */
  async initiateCall(threadId: string, isVideo: boolean = false): Promise<CallResult> {
    this.requireLogin();
    logger.debug('Initiating call', { threadId, isVideo });
    
    try {
      const result = await this.authenticator.getGraphQLClient().mutation<{
        initiate_call: {
          call: {
            id: string;
            status: 'initiated' | 'connected' | 'ended' | 'failed';
          };
        };
      }>('InitiateCallMutation', {
        thread_id: threadId,
        is_video: isVideo,
      });
      
      return {
        callId: result?.initiate_call?.call?.id || `call_${Date.now()}`,
        status: result?.initiate_call?.call?.status || 'initiated',
      };
    } catch (error) {
      logger.error('Failed to initiate call', error);
      return { callId: `call_${Date.now()}`, status: 'failed' };
    }
  }

  // ==================== EVENT HANDLING ====================

  /**
   * Register event listener
   */
  on<T extends EventType>(
    event: T, 
    listener: EventListener<PanindiganEvent>
  ): this {
    super.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Remove event listener
   */
  off<T extends EventType>(
    event: T, 
    listener: EventListener<PanindiganEvent>
  ): this {
    super.off(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Register one-time event listener
   */
  once<T extends EventType>(
    event: T, 
    listener: EventListener<PanindiganEvent>
  ): this {
    super.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Require login
   */
  private requireLogin(): void {
    if (!this.isLoggedIn()) {
      throw new Error('Not logged in. Call login() first.');
    }
  }

  /**
   * Handle incoming MQTT message
   */
  private handleMQTTMessage(topic: string, payload: Buffer): void {
    try {
      let data: unknown;
      let isJson = false;
      
      // Try to parse as JSON
      try {
        data = JSON.parse(payload.toString());
        isJson = true;
      } catch {
        // Binary or non-JSON payload
        data = payload;
      }
      
      // Log raw message for debugging (truncate large payloads)
      const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);
      const truncatedPayload = payloadStr.substring(0, 200);
      logger.debug('Received MQTT message', {
        topic,
        isJson,
        payloadLength: payload.length,
        preview: truncatedPayload,
      });
      
      // Emit raw message event
      this.emit('raw', topic, data);
      
      // Parse and emit specific events using EventParser
      if (isJson && typeof data === 'object' && data !== null) {
        const event = this.mqttClient?.parseEvent(topic, payload);
        if (event) {
          const eventRecord = event as unknown as Record<string, unknown>;
          const threadId = eventRecord.threadId || (eventRecord.message as Record<string, unknown> | undefined)?.threadId;
          logger.debug('Parsed MQTT event', {
            topic,
            eventType: event.type,
            threadId: threadId as string | undefined,
          });
          
          // Emit typed event
          this.emit(event.type, event);
          this.emit('event', event);
        }
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

// Default export
export default PanindiganFCA;
