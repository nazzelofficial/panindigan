/**
 * Panindigan
 * A Fully-Featured Unofficial Facebook Chat API Library for TypeScript
 * 
 * @module panindigan
 * @version 1.0.0
 * @license MIT
 */

// Main API
export { PanindiganFCA, login, type PanindiganFCAOptions } from './core/PanindiganFCA.js';

// Authentication
export { Authenticator } from './auth/Authenticator.js';
export { SessionManager } from './auth/SessionManager.js';
export { CookieParser } from './auth/CookieParser.js';

// MQTT
export { MQTTClient } from './mqtt/MQTTClient.js';
export { FastMQTT, type FastMQTTOptions } from './mqtt/FastMQTT.js';

// Security
export { AntiSuspension, type AntiSuspensionOptions } from './security/AntiSuspension.js';
export { EntropyPool, type EntropyPoolOptions } from './security/EntropyPool.js';
export {
  CheckpointGuard,
  type CheckpointGuardOptions,
  type CheckpointCallback,
  type GuardState,
  type BurstLevel,
  type GuardStats,
} from './security/CheckpointGuard.js';

// Multi-Account
export { MultiAccountManager, type AccountConfig, type AccountInstance } from './core/MultiAccountManager.js';

// Events
export { EventParser } from './events/EventParser.js';

// Media
export { MediaUploader } from './media/MediaUploader.js';

// API
export { RequestHandler } from './api/RequestHandler.js';
export { GraphQLClient } from './api/GraphQLClient.js';

// Utilities
export { Logger, logger } from './utils/Logger.js';
export * as Constants from './utils/Constants.js';
export * as Helpers from './utils/Helpers.js';
export { CircuitBreaker, type CircuitBreakerOptions, CircuitState } from './utils/CircuitBreaker.js';
export { RequestCache, type CacheOptions, type CacheEntry } from './utils/RequestCache.js';
export { RateLimiter, type RateLimiterOptions } from './utils/RateLimiter.js';
export { MessageQueue, type QueuedMessage, type MessageQueueOptions } from './utils/MessageQueue.js';

// Error Classes (concrete, throwable)
export {
  PanindiganError,
  AuthenticationError,
  CheckpointError,
  MQTTError,
  RateLimitError,
  NetworkError,
  UploadError,
  MessageError,
  ThreadError,
  UserError,
  GraphQLError as GraphQLRequestError,
  SessionExpiredError,
  TwoFactorRequiredError,
  TimeoutError,
  UnsupportedOperationError,
} from './errors/index.js';

// Type Exports
export type {
  // Auth Types
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

  // Message Types
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

  // Thread Types
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

  // User Types
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

  // Media Types
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

  // Event Types
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

  // API Types
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

  // Additional Types
  Poll,
  PollOption,
  CreatePollOptions,
  VotePollOptions,
  EventPlanner,
  CreateEventOptions,
  RSVPOptions,
  Story,
  ViewStoryOptions,
  ReactToStoryOptions,
  ReplyToStoryOptions,
  InitiateCallOptions,
  CallResult,
  SendLocationOptions,
  ContactCard,
  ShareContactOptions,
  PanindiganConfig,
  PanindiganAPI,
} from './types/index.js';

// Default export
export { PanindiganFCA as default } from './core/PanindiganFCA.js';
