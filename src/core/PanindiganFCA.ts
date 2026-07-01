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
import { logger } from '../utils/Logger.js';
import { REACTION_EMOJIS } from '../utils/Constants.js';
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

  // Singleton manager instances — created once, reused for every call
  private messageSender: MessageSender;
  private threadManager: ThreadManager;
  private userManager: UserManager;
  private mediaUploader: MediaUploader;

  constructor(options: PanindiganFCAOptions = {}) {
    super();
    this.options = options;
    this.authenticator = new Authenticator(options);

    // Managers are created here and share the same GraphQLClient instance
    const gql = this.authenticator.getGraphQLClient();
    this.messageSender = new MessageSender(gql);
    this.threadManager = new ThreadManager(gql);
    this.userManager = new UserManager(gql);
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
   * Edit a message (GraphQL — no stable form endpoint)
   */
  async editMessage(messageId: string, newText: string): Promise<boolean> {
    this.requireLogin();
    logger.debug('Editing message', { messageId });

    try {
      await this.authenticator.getGraphQLClient().mutation(
        'MessageEditMutation',
        { message_id: messageId, body: newText }
      );
      return true;
    } catch (error) {
      logger.error('Failed to edit message', error);
      return false;
    }
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
    // Convert canonical name to emoji string (or null to remove reaction)
    const emoji = reaction ? (REACTION_EMOJIS[reaction] ?? reaction) : null;
    return this.messageSender.reactToMessage(messageId, emoji);
  }

  /**
   * Forward a message (GraphQL)
   */
  async forwardMessage(
    messageId: string,
    threadId: string
  ): Promise<SendMessageResult> {
    this.requireLogin();
    logger.debug('Forwarding message', { messageId, threadId });

    try {
      const result = await this.authenticator
        .getGraphQLClient()
        .mutation<{
          forward_message: {
            message: { message_id: string; timestamp: number };
          };
        }>('MessageForwardMutation', {
          message_id: messageId,
          thread_id: threadId,
        });

      return {
        messageId:
          result?.forward_message?.message?.message_id || `fwd_${Date.now()}`,
        timestamp:
          result?.forward_message?.message?.timestamp || Date.now(),
        threadId,
      };
    } catch (error) {
      logger.error('Failed to forward message', error);
      throw error;
    }
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
   * Mark messages as read via real /ajax/mercury/change_read_status.php
   */
  async markAsRead(threadId: string): Promise<boolean> {
    this.requireLogin();
    return this.messageSender.markAsRead(threadId);
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

  async unfriend(userId: string): Promise<boolean> {
    this.requireLogin();
    return this.userManager.unfriend(userId);
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
        options:
          poll?.options?.map(
            (opt: { id: string; text: string; vote_count: number }) => ({
              optionId: opt.id,
              text: opt.text,
              voteCount: opt.vote_count,
            })
          ) ||
          options.options.map((text, idx) => ({
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

  async votePoll(pollId: string, optionIds: string[]): Promise<boolean> {
    this.requireLogin();
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
      }>('PollQuery', { poll_id: pollId });

      const poll = result?.poll;
      if (!poll) throw new Error('Poll not found');

      return {
        pollId: poll.id,
        threadId: poll.thread_id,
        creatorId: poll.creator_id,
        question: poll.question,
        options: poll.options.map(
          (opt: {
            id: string;
            text: string;
            vote_count: number;
            voters?: string[];
          }) => ({
            optionId: opt.id,
            text: opt.text,
            voteCount: opt.vote_count,
            voters: opt.voters,
          })
        ),
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
        guestCount: event?.guest_count
          ? {
              going: event.guest_count.going,
              maybe: event.guest_count.maybe,
              cantGo: event.guest_count.cant_go,
              invited: event.guest_count.invited,
            }
          : { going: 0, maybe: 0, cantGo: 0, invited: 0 },
        isCancelled: false,
      };
    } catch (error) {
      logger.error('Failed to create event', error);
      throw error;
    }
  }

  async rsvpToEvent(
    eventId: string,
    response: 'going' | 'maybe' | 'cant_go'
  ): Promise<boolean> {
    this.requireLogin();
    try {
      await this.authenticator.getGraphQLClient().mutation('RSVPEventMutation', {
        event_id: eventId,
        response,
      });
      return true;
    } catch (error) {
      logger.error('Failed to RSVP to event', error);
      return false;
    }
  }

  // ==================== STORIES ====================

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
          reactions: Array<{ user_id: string; reaction: string }>;
        }>;
      }>('StoriesQuery', { user_id: userId });

      return (result?.stories || []).map(
        (s: {
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
          reactions: Array<{ user_id: string; reaction: string }>;
        }) => ({
          storyId: s.id,
          authorId: s.author_id,
          authorName: s.author_name,
          type: s.type,
          url: s.url,
          thumbnailUrl: s.thumbnail_url,
          text: s.text,
          timestamp: s.timestamp,
          expiresAt: s.expires_at,
          seenBy: s.seen_by,
          reactions: s.reactions.map(
            (r: { user_id: string; reaction: string }) => ({
              userId: r.user_id,
              reaction: r.reaction,
            })
          ),
        })
      );
    } catch (error) {
      logger.error('Failed to get stories', error);
      return [];
    }
  }

  async viewStory(storyId: string): Promise<boolean> {
    this.requireLogin();
    try {
      await this.authenticator
        .getGraphQLClient()
        .mutation('ViewStoryMutation', { story_id: storyId });
      return true;
    } catch (error) {
      logger.error('Failed to view story', error);
      return false;
    }
  }

  // ==================== CALLS ====================

  async initiateCall(
    threadId: string,
    isVideo: boolean = false
  ): Promise<CallResult> {
    this.requireLogin();
    logger.debug('Initiating call', { threadId, isVideo });

    try {
      const result = await this.authenticator
        .getGraphQLClient()
        .mutation<{
          initiate_call: {
            call: {
              id: string;
              status: 'initiated' | 'connected' | 'ended' | 'failed';
            };
          };
        }>('InitiateCallMutation', { thread_id: threadId, is_video: isVideo });

      return {
        callId:
          result?.initiate_call?.call?.id || `call_${Date.now()}`,
        status: result?.initiate_call?.call?.status || 'initiated',
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
      throw new Error('Not logged in. Call login() first.');
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

      // Emit raw for debugging / custom handling
      this.emit('raw', topic, payload);

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
