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
