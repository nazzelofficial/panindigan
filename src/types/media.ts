/**
 * Media and Attachment Types
 */

export interface UploadOptions {
  filename?: string;
  mimeType?: string;
  isVoiceMail?: boolean;
  threadId?: string;
}

export interface UploadResult {
  attachmentId: string;
  mimeType: string;
  filename: string;
  url?: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
}

export interface ImageUploadOptions extends UploadOptions {
  width?: number;
  height?: number;
  quality?: number;
}

export interface VideoUploadOptions extends UploadOptions {
  thumbnail?: Buffer;
}

export interface AudioUploadOptions extends UploadOptions {
  isVoiceMail: boolean;
}

export interface DocumentUploadOptions extends UploadOptions {
  filename: string;
}

export interface Sticker {
  stickerId: string;
  packId?: string;
  url: string;
  width: number;
  height: number;
  frameCount?: number;
  frameRate?: number;
  name?: string;
}

export interface StickerPack {
  packId: string;
  name: string;
  author?: string;
  stickers: Sticker[];
  thumbnailUrl?: string;
}

export interface SearchStickersOptions {
  query?: string;
  packId?: string;
  limit?: number;
}

export interface SearchStickersResult {
  stickers: Sticker[];
  packs: StickerPack[];
}

export interface GIF {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  source?: string;
}

export interface SearchGIFOptions {
  query: string;
  limit?: number;
  offset?: number;
  provider?: 'tenor' | 'giphy' | 'all';
}

export interface SearchGIFResult {
  gifs: GIF[];
  hasMore: boolean;
}

export interface DownloadOptions {
  url: string;
  filename?: string;
  path?: string;
}

export interface DownloadResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  size: number;
}

export interface MediaInfo {
  url: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  filename?: string;
}

export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp';
  maintainAspectRatio?: boolean;
}

export interface VideoProcessingOptions {
  width?: number;
  height?: number;
  quality?: 'low' | 'medium' | 'high';
  format?: 'mp4' | 'webm';
}

export interface ProcessingResult {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  size: number;
}
