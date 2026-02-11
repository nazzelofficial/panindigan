/**
 * Media Uploader for Panindigan
 * Handles file uploads to Facebook
 */

import { logger } from '../utils/Logger.js';
import type { GraphQLClient } from '../api/GraphQLClient.js';
import type {
  UploadResult,
  ImageUploadOptions,
  VideoUploadOptions,
  AudioUploadOptions,
  DocumentUploadOptions,
  DownloadResult,
  DownloadOptions,
} from '../types/index.js';

export class MediaUploader {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Upload an image
   */
  async uploadImage(buffer: Buffer, options?: ImageUploadOptions): Promise<UploadResult> {
    logger.debug('Uploading image', { size: buffer.length, options });
    
    const result = await this.graphqlClient.mutation<{
      upload_image: {
        attachment: {
          id: string;
          mime_type: string;
          filename: string;
          size: number;
          width?: number;
          height?: number;
        };
      };
    }>('ImageUploadMutation', {
      buffer: buffer.toString('base64'),
      filename: options?.filename || 'image.jpg',
      mime_type: options?.mimeType || 'image/jpeg',
      width: options?.width,
      height: options?.height,
      quality: options?.quality,
    });
    
    return {
      attachmentId: result?.upload_image?.attachment?.id || `img_${Date.now()}`,
      mimeType: result?.upload_image?.attachment?.mime_type || 'image/jpeg',
      filename: result?.upload_image?.attachment?.filename || 'image.jpg',
      size: result?.upload_image?.attachment?.size || buffer.length,
      width: result?.upload_image?.attachment?.width,
      height: result?.upload_image?.attachment?.height,
    };
  }

  /**
   * Upload a video
   */
  async uploadVideo(buffer: Buffer, options?: VideoUploadOptions): Promise<UploadResult> {
    logger.debug('Uploading video', { size: buffer.length, options });
    
    const result = await this.graphqlClient.mutation<{
      upload_video: {
        attachment: {
          id: string;
          mime_type: string;
          filename: string;
          size: number;
          duration?: number;
        };
      };
    }>('VideoUploadMutation', {
      buffer: buffer.toString('base64'),
      filename: options?.filename || 'video.mp4',
      mime_type: options?.mimeType || 'video/mp4',
      thumbnail: options?.thumbnail?.toString('base64'),
    });
    
    return {
      attachmentId: result?.upload_video?.attachment?.id || `vid_${Date.now()}`,
      mimeType: result?.upload_video?.attachment?.mime_type || 'video/mp4',
      filename: result?.upload_video?.attachment?.filename || 'video.mp4',
      size: result?.upload_video?.attachment?.size || buffer.length,
      duration: result?.upload_video?.attachment?.duration,
    };
  }

  /**
   * Upload an audio file
   */
  async uploadAudio(buffer: Buffer, options?: AudioUploadOptions): Promise<UploadResult> {
    logger.debug('Uploading audio', { size: buffer.length, options });
    
    const result = await this.graphqlClient.mutation<{
      upload_audio: {
        attachment: {
          id: string;
          mime_type: string;
          filename: string;
          size: number;
          duration?: number;
        };
      };
    }>('AudioUploadMutation', {
      buffer: buffer.toString('base64'),
      filename: options?.filename || 'audio.mp3',
      mime_type: options?.mimeType || 'audio/mpeg',
      is_voice_mail: options?.isVoiceMail || false,
    });
    
    return {
      attachmentId: result?.upload_audio?.attachment?.id || `aud_${Date.now()}`,
      mimeType: result?.upload_audio?.attachment?.mime_type || 'audio/mpeg',
      filename: result?.upload_audio?.attachment?.filename || 'audio.mp3',
      size: result?.upload_audio?.attachment?.size || buffer.length,
      duration: result?.upload_audio?.attachment?.duration,
    };
  }

  /**
   * Upload a document
   */
  async uploadDocument(buffer: Buffer, options: DocumentUploadOptions): Promise<UploadResult> {
    logger.debug('Uploading document', { size: buffer.length, options });
    
    const result = await this.graphqlClient.mutation<{
      upload_document: {
        attachment: {
          id: string;
          mime_type: string;
          filename: string;
          size: number;
        };
      };
    }>('DocumentUploadMutation', {
      buffer: buffer.toString('base64'),
      filename: options?.filename || 'document.pdf',
      mime_type: options?.mimeType || 'application/pdf',
    });
    
    return {
      attachmentId: result?.upload_document?.attachment?.id || `doc_${Date.now()}`,
      mimeType: result?.upload_document?.attachment?.mime_type || 'application/pdf',
      filename: result?.upload_document?.attachment?.filename || 'document.pdf',
      size: result?.upload_document?.attachment?.size || buffer.length,
    };
  }

  /**
   * Download an attachment
   */
  async downloadAttachment(url: string, options?: DownloadOptions): Promise<DownloadResult> {
    logger.debug('Downloading attachment', { url, options });
    
    if (!url) {
      throw new Error('Attachment URL is required');
    }

    try {
      // Get RequestHandler from GraphQL client
      const requestHandler = this.graphqlClient.getRequestHandler();
      
      // Use RequestHandler to fetch the attachment
      const response = await requestHandler.get(url);
      
      if (!response.ok) {
        throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
      }

      // Get content type from response headers
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      // Extract filename from Content-Disposition header if available
      let filename = options?.filename;
      const contentDisposition = response.headers.get('content-disposition');
      if (!filename && contentDisposition) {
        const match = contentDisposition.match(/filename=([^;]+)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '').trim();
        }
      }
      
      // Fallback filename
      if (!filename) {
        const urlParts = new URL(url).pathname.split('/');
        filename = urlParts[urlParts.length - 1] || 'attachment';
      }

      // Get buffer from response
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      logger.debug('Attachment downloaded successfully', { 
        url: url.substring(0, 100), 
        size: buffer.length, 
        filename,
        contentType 
      });

      return {
        buffer,
        filename,
        mimeType: contentType,
        size: buffer.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Failed to download attachment', { url, error: message });
      throw new Error(`Failed to download attachment: ${message}`);
    }
  }
}
