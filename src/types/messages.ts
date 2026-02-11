/**
 * Message Types
 */

export interface MessageID {
  threadId: string;
  messageId: string;
}

export interface Mention {
  tag: string;
  id: string;
  offset: number;
  length: number;
}

export interface MessageAttachment {
  type: 'photo' | 'video' | 'audio' | 'file' | 'sticker' | 'gif' | 'share' | 'location' | 'animated_image';
  id: string;
  url?: string;
  previewUrl?: string;
  filename?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  duration?: number;
  title?: string;
  description?: string;
  source?: string;
}

export interface PhotoAttachment extends MessageAttachment {
  type: 'photo';
  largePreviewUrl?: string;
  thumbnailUrl?: string;
}

export interface VideoAttachment extends MessageAttachment {
  type: 'video';
  previewUrl: string;
}

export interface AudioAttachment extends MessageAttachment {
  type: 'audio';
  isVoiceMail: boolean;
}

export interface FileAttachment extends MessageAttachment {
  type: 'file';
}

export interface StickerAttachment extends MessageAttachment {
  type: 'sticker';
  stickerId: string;
  packId?: string;
  frameCount?: number;
  frameRate?: number;
}

export interface GIFAttachment extends MessageAttachment {
  type: 'gif';
  gifUrl: string;
}

export interface ShareAttachment extends MessageAttachment {
  type: 'share';
  targetUrl: string;
  styleList?: string[];
}

export interface LocationAttachment extends MessageAttachment {
  type: 'location';
  latitude: number;
  longitude: number;
  address?: string;
  city?: string;
}

export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'care';

export interface Reaction {
  userId: string;
  type: ReactionType;
  timestamp: number;
}

export interface Message {
  messageId: string;
  threadId: string;
  senderId: string;
  body?: string;
  attachments: MessageAttachment[];
  mentions: Mention[];
  timestamp: number;
  isGroup: boolean;
  participantIds?: string[];
  messageReply?: MessageReply;
  reactions: Reaction[];
  isUnread: boolean;
  isForwarded?: boolean;
  isSponsored?: boolean;
  metadata?: Record<string, unknown>;
}

export interface MessageReply {
  messageId: string;
  threadId: string;
  senderId: string;
  body?: string;
  attachments: MessageAttachment[];
  timestamp: number;
}

export interface SendMessageOptions {
  body?: string;
  mentions?: Mention[];
  replyToMessage?: string;
  attachments?: Array<Buffer | string | UploadableFile>;
  sticker?: string;
  emoji?: string;
  emojiSize?: 'small' | 'medium' | 'large';
  isSilent?: boolean;
}

export interface UploadableFile {
  path?: string;
  buffer?: Buffer;
  name: string;
  mimeType?: string;
}

export interface SendMessageResult {
  messageId: string;
  timestamp: number;
  threadId: string;
}

export interface EditMessageOptions {
  messageId: string;
  body: string;
}

export interface UnsendMessageResult {
  success: boolean;
  messageId: string;
}

export interface ForwardMessageOptions {
  messageId: string;
  threadId: string;
}

export interface ReactToMessageOptions {
  messageId: string;
  reaction: ReactionType | null;
}

export interface MessageSearchOptions {
  threadId?: string;
  query?: string;
  offset?: number;
  limit?: number;
  before?: number;
  after?: number;
  from?: string;
}

export interface MessageSearchResult {
  messages: Message[];
  hasMore: boolean;
  totalCount?: number;
}

export interface ReadReceipt {
  userId: string;
  watermarkTimestamp: number;
  threadId: string;
}

export interface DeliveryReceipt {
  userId: string;
  deliveredTimestamp: number;
  threadId: string;
}

export interface TypingIndicator {
  userId: string;
  threadId: string;
  isTyping: boolean;
}
