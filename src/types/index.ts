/**
 * Panindigan Type Definitions
 * Export all types from the library
 */

// Authentication Types
export type {
  Cookie,
  CookieFormat,
  AppState,
  Credentials,
  Session,
  TwoFactorAuth,
  CheckpointData,
  LoginOptions,
  LogLevel,
  AuthError,
  SessionValidationResult,
} from './auth.js';

// Message Types
export type {
  MessageID,
  Mention,
  MessageAttachment,
  PhotoAttachment,
  VideoAttachment,
  AudioAttachment,
  FileAttachment,
  StickerAttachment,
  GIFAttachment,
  ShareAttachment,
  LocationAttachment,
  ReactionType,
  Reaction,
  Message,
  MessageReply,
  SendMessageOptions,
  UploadableFile,
  SendMessageResult,
  EditMessageOptions,
  UnsendMessageResult,
  ForwardMessageOptions,
  ReactToMessageOptions,
  MessageSearchOptions,
  MessageSearchResult,
  ReadReceipt,
  DeliveryReceipt,
  TypingIndicator,
} from './messages.js';

// Thread Types
export type {
  ThreadType,
  Thread,
  Participant,
  ThreadColor,
  CreateGroupOptions,
  AddParticipantsOptions,
  RemoveParticipantsOptions,
  PromoteParticipantsOptions,
  DemoteParticipantsOptions,
  UpdateThreadOptions,
  SetNicknameOptions,
  ThreadHistoryOptions,
  ThreadHistoryResult,
  PinMessageOptions,
  UnpinMessageOptions,
  MuteThreadOptions,
  ArchiveThreadOptions,
  DeleteThreadOptions,
  LeaveGroupOptions,
  JoinGroupOptions,
  GetThreadInfoOptions,
  GetThreadListOptions,
  GetThreadListResult,
  ThreadEvent,
} from './threads.js';

// User Types
export type {
  User,
  Profile,
  Location,
  WorkExperience,
  Education,
  FamilyMember,
  FriendRequest,
  FriendList,
  Presence,
  SearchUsersOptions,
  SearchUsersResult,
  GetFriendsOptions,
  GetFriendsResult,
  SendFriendRequestOptions,
  AcceptFriendRequestOptions,
  DeclineFriendRequestOptions,
  CancelFriendRequestOptions,
  UnfriendOptions,
  BlockUserOptions,
  UnblockUserOptions,
  GetBlockedListResult,
  Birthday,
  GetBirthdaysResult,
} from './users.js';

// Media Types
export type {
  UploadOptions,
  UploadResult,
  ImageUploadOptions,
  VideoUploadOptions,
  AudioUploadOptions,
  DocumentUploadOptions,
  Sticker,
  StickerPack,
  SearchStickersOptions,
  SearchStickersResult,
  GIF,
  SearchGIFOptions,
  SearchGIFResult,
  DownloadOptions,
  DownloadResult,
  MediaInfo,
  ImageProcessingOptions,
  VideoProcessingOptions,
  ProcessingResult,
} from './media.js';

// Event Types
export type {
  EventType,
  BaseEvent,
  MessageEvent,
  MessageReactionEvent,
  TypingEvent,
  ReadReceiptEvent,
  DeliveryReceiptEvent,
  PresenceEvent,
  ThreadRenameEvent,
  ThreadColorEvent,
  ThreadEmojiEvent,
  ThreadImageEvent,
  ThreadNicknameEvent,
  ThreadParticipantsEvent,
  ThreadAdminEvent,
  ThreadLeaveEvent,
  FriendRequestEvent,
  FriendAcceptEvent,
  FriendRemoveEvent,
  BlockEvent,
  CallEvent,
  StoryEvent,
  PollEvent,
  EventPlannerEvent,
  ConnectEvent,
  DisconnectEvent,
  ErrorEvent,
  PanindiganEvent,
  EventListener,
  EventHandlerMap,
} from './events.js';

// API Types
export type {
  GraphQLRequest,
  GraphQLResponse,
  GraphQLError,
  BatchRequest,
  BatchResponse,
  APIError,
  RateLimitInfo,
  RequestOptions,
  FacebookAPIEndpoints,
  FacebookFormData,
} from './api.js';

// Poll Types
export interface PollOption {
  optionId: string;
  text: string;
  voteCount: number;
  voters?: string[];
}

export interface Poll {
  pollId: string;
  threadId: string;
  creatorId: string;
  question: string;
  options: PollOption[];
  totalVotes: number;
  isClosed: boolean;
  allowsMultipleChoices: boolean;
  createdAt: number;
  closedAt?: number;
}

export interface CreatePollOptions {
  threadId: string;
  question: string;
  options: string[];
  allowsMultipleChoices?: boolean;
  duration?: number;
}

export interface VotePollOptions {
  pollId: string;
  optionIds: string[];
}

// Event Planner Types
export interface EventPlanner {
  eventId: string;
  threadId: string;
  creatorId: string;
  name: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime?: number;
  coverImage?: string;
  guestCount: {
    going: number;
    maybe: number;
    cantGo: number;
    invited: number;
  };
  isCancelled: boolean;
}

export interface CreateEventOptions {
  threadId: string;
  name: string;
  description?: string;
  location?: string;
  startTime: number;
  endTime?: number;
  coverImage?: Buffer | string;
}

export interface RSVPOptions {
  eventId: string;
  response: 'going' | 'maybe' | 'cant_go';
}

// Story Types
export interface Story {
  storyId: string;
  authorId: string;
  authorName: string;
  type: 'image' | 'video' | 'text';
  url?: string;
  thumbnailUrl?: string;
  text?: string;
  timestamp: number;
  expiresAt: number;
  seenBy: string[];
  reactions: Array<{
    userId: string;
    reaction: string;
  }>;
}

export interface ViewStoryOptions {
  storyId: string;
}

export interface ReactToStoryOptions {
  storyId: string;
  reaction: string;
}

export interface ReplyToStoryOptions {
  storyId: string;
  message: string;
}

// Call Types
export interface InitiateCallOptions {
  threadId: string;
  isVideo?: boolean;
}

export interface CallResult {
  callId: string;
  status: 'initiated' | 'connected' | 'ended' | 'failed';
}

// Location Types
export interface SendLocationOptions {
  threadId: string;
  latitude: number;
  longitude: number;
  address?: string;
  name?: string;
}

// Contact Types
export interface ContactCard {
  userId: string;
  name: string;
  phone?: string;
  email?: string;
}

export interface ShareContactOptions {
  threadId: string;
  contactId: string;
}

// Configuration Types
export interface PanindiganConfig {
  logLevel: import('./auth.js').LogLevel;
  userAgent: string;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  requestTimeout: number;
  rateLimitEnabled: boolean;
  sessionPath?: string;
  proxy?: string;
}

// Main API Types
export interface PanindiganAPI {
  // Authentication
  login(options: import('./auth.js').LoginOptions): Promise<import('./auth.js').Session>;
  logout(): Promise<void>;
  getSession(): import('./auth.js').Session | null;
  validateSession(): Promise<import('./auth.js').SessionValidationResult>;

  // Messaging
  sendMessage(threadId: string, options: import('./messages.js').SendMessageOptions): Promise<import('./messages.js').SendMessageResult>;
  editMessage(messageId: string, body: string): Promise<boolean>;
  unsendMessage(messageId: string): Promise<boolean>;
  forwardMessage(messageId: string, threadId: string): Promise<import('./messages.js').SendMessageResult>;
  reactToMessage(messageId: string, reaction: import('./messages.js').ReactionType | null): Promise<boolean>;
  getMessageHistory(threadId: string, options?: import('./threads.js').ThreadHistoryOptions): Promise<import('./threads.js').ThreadHistoryResult>;
  searchMessages(options: import('./messages.js').MessageSearchOptions): Promise<import('./messages.js').MessageSearchResult>;
  markAsRead(threadId: string): Promise<boolean>;
  markAsDelivered(threadId: string, messageId: string): Promise<boolean>;
  sendTypingIndicator(threadId: string, isTyping: boolean): Promise<boolean>;

  // Media
  uploadImage(buffer: Buffer, options?: import('./media.js').ImageUploadOptions): Promise<import('./media.js').UploadResult>;
  uploadVideo(buffer: Buffer, options?: import('./media.js').VideoUploadOptions): Promise<import('./media.js').UploadResult>;
  uploadAudio(buffer: Buffer, options?: import('./media.js').AudioUploadOptions): Promise<import('./media.js').UploadResult>;
  uploadDocument(buffer: Buffer, options?: import('./media.js').DocumentUploadOptions): Promise<import('./media.js').UploadResult>;
  downloadAttachment(url: string, options?: import('./media.js').DownloadOptions): Promise<import('./media.js').DownloadResult>;
  searchStickers(options: import('./media.js').SearchStickersOptions): Promise<import('./media.js').SearchStickersResult>;
  searchGIFs(options: import('./media.js').SearchGIFOptions): Promise<import('./media.js').SearchGIFResult>;

  // Threads
  createGroup(options: import('./threads.js').CreateGroupOptions): Promise<import('./threads.js').Thread>;
  getThreadInfo(threadId: string): Promise<import('./threads.js').Thread>;
  getThreadList(options?: import('./threads.js').GetThreadListOptions): Promise<import('./threads.js').GetThreadListResult>;
  updateThread(options: import('./threads.js').UpdateThreadOptions): Promise<boolean>;
  addParticipants(threadId: string, userIds: string[]): Promise<boolean>;
  removeParticipants(threadId: string, userIds: string[]): Promise<boolean>;
  promoteParticipants(threadId: string, userIds: string[]): Promise<boolean>;
  demoteParticipants(threadId: string, userIds: string[]): Promise<boolean>;
  setNickname(threadId: string, userId: string, nickname: string): Promise<boolean>;
  pinMessage(threadId: string, messageId: string): Promise<boolean>;
  unpinMessage(threadId: string, messageId: string): Promise<boolean>;
  muteThread(threadId: string, duration?: number): Promise<boolean>;
  unmuteThread(threadId: string): Promise<boolean>;
  archiveThread(threadId: string): Promise<boolean>;
  unarchiveThread(threadId: string): Promise<boolean>;
  leaveGroup(threadId: string): Promise<boolean>;
  deleteThread(threadId: string): Promise<boolean>;

  // Users
  getUserInfo(userId: string): Promise<import('./users.js').Profile>;
  getUserInfo(userIds: string[]): Promise<Record<string, import('./users.js').Profile>>;
  searchUsers(query: string, limit?: number): Promise<import('./users.js').SearchUsersResult>;
  getFriends(options?: import('./users.js').GetFriendsOptions): Promise<import('./users.js').GetFriendsResult>;
  sendFriendRequest(userId: string, message?: string): Promise<boolean>;
  acceptFriendRequest(userId: string): Promise<boolean>;
  declineFriendRequest(userId: string): Promise<boolean>;
  cancelFriendRequest(userId: string): Promise<boolean>;
  unfriend(userId: string): Promise<boolean>;
  blockUser(userId: string): Promise<boolean>;
  unblockUser(userId: string): Promise<boolean>;
  getBlockedList(): Promise<import('./users.js').GetBlockedListResult>;
  getPresence(userId: string): Promise<import('./users.js').Presence>;
  getBirthdays(): Promise<import('./users.js').GetBirthdaysResult>;

  // Polls
  createPoll(options: CreatePollOptions): Promise<Poll>;
  votePoll(pollId: string, optionIds: string[]): Promise<boolean>;
  getPollResults(pollId: string): Promise<Poll>;

  // Events
  createEvent(options: CreateEventOptions): Promise<EventPlanner>;
  rsvpToEvent(eventId: string, response: 'going' | 'maybe' | 'cant_go'): Promise<boolean>;
  getEvent(eventId: string): Promise<EventPlanner>;

  // Stories
  getStories(userId?: string): Promise<Story[]>;
  viewStory(storyId: string): Promise<boolean>;
  reactToStory(storyId: string, reaction: string): Promise<boolean>;
  replyToStory(storyId: string, message: string): Promise<import('./messages.js').SendMessageResult>;

  // Calls
  initiateCall(threadId: string, isVideo?: boolean): Promise<CallResult>;

  // Location
  sendLocation(threadId: string, latitude: number, longitude: number, name?: string): Promise<import('./messages.js').SendMessageResult>;

  // Contacts
  shareContact(threadId: string, contactId: string): Promise<import('./messages.js').SendMessageResult>;

  // Events
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;

  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
