/**
 * Media Uploader for Panindigan
 * Uploads files to Facebook via real multipart POST to upload.facebook.com
 */

import { logger } from '../utils/Logger.js';
import { FACEBOOK_UPLOAD_URL } from '../utils/Constants.js';
import { getMimeTypeFromExtension, parseFacebookResponse } from '../utils/Helpers.js';
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

/**
 * Facebook upload response shape
 */
interface UploadResponse {
  payload?: {
    metadata?: Array<{
      image_id?: string;
      video_id?: string;
      audio_id?: string;
      file_id?: string;
      filename?: string;
      filetype?: string;
      filesize?: number;
      width?: number;
      height?: number;
      duration?: number;
    }>;
  };
  error?: number;
  errorSummary?: string;
  errorDescription?: string;
}

export class MediaUploader {
  private graphqlClient: GraphQLClient;

  constructor(graphqlClient: GraphQLClient) {
    this.graphqlClient = graphqlClient;
  }

  /**
   * Upload an image via multipart POST to upload.facebook.com
   */
  async uploadImage(buffer: Buffer, options?: ImageUploadOptions): Promise<UploadResult> {
    const filename = options?.filename || 'image.jpg';
    const mimeType = options?.mimeType || getMimeTypeFromExtension(filename) || 'image/jpeg';

    logger.debug('Uploading image', { filename, size: buffer.length });
    return this.upload(buffer, filename, mimeType);
  }

  /**
   * Upload a video via multipart POST to upload.facebook.com
   */
  async uploadVideo(buffer: Buffer, options?: VideoUploadOptions): Promise<UploadResult> {
    const filename = options?.filename || 'video.mp4';
    const mimeType = options?.mimeType || getMimeTypeFromExtension(filename) || 'video/mp4';

    logger.debug('Uploading video', { filename, size: buffer.length });
    return this.upload(buffer, filename, mimeType);
  }

  /**
   * Upload an audio file via multipart POST to upload.facebook.com
   */
  async uploadAudio(buffer: Buffer, options?: AudioUploadOptions): Promise<UploadResult> {
    const filename = options?.filename || 'audio.mp3';
    const mimeType = options?.mimeType || getMimeTypeFromExtension(filename) || 'audio/mpeg';

    logger.debug('Uploading audio', { filename, size: buffer.length });
    return this.upload(buffer, filename, mimeType);
  }

  /**
   * Upload a document via multipart POST to upload.facebook.com
   */
  async uploadDocument(
    buffer: Buffer,
    options: DocumentUploadOptions
  ): Promise<UploadResult> {
    const filename = options?.filename || 'document.pdf';
    const mimeType =
      options?.mimeType || getMimeTypeFromExtension(filename) || 'application/pdf';

    logger.debug('Uploading document', { filename, size: buffer.length });
    return this.upload(buffer, filename, mimeType);
  }

  /**
   * Core upload routine.
   * Builds a multipart/form-data request with the file and base auth params,
   * then POSTs to https://upload.facebook.com/ajax/mercury/upload.php.
   */
  private async upload(
    buffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<UploadResult> {
    const baseParams = this.graphqlClient.buildBaseParams();
    const requestHandler = this.graphqlClient.getRequestHandler();

    // Use the built-in Node.js 22 FormData + Blob
    const form = new FormData();

    // File field name used by Messenger web: files[upload_0]
    form.append(
      'files[upload_0]',
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename
    );

    // Auth / session params
    for (const [key, value] of Object.entries(baseParams)) {
      form.append(key, value);
    }

    const response = await requestHandler.post(FACEBOOK_UPLOAD_URL, form);

    const text = await response.text();

    let data: UploadResponse;
    try {
      data = parseFacebookResponse<UploadResponse>(text);
    } catch {
      throw new Error(
        `MediaUploader: failed to parse upload response: ${text.substring(0, 200)}`
      );
    }

    if (data.error) {
      throw new Error(
        data.errorDescription ||
          data.errorSummary ||
          `Upload failed with error code ${data.error}`
      );
    }

    const meta = data?.payload?.metadata?.[0] || {};

    // Facebook returns different ID fields depending on the file type
    const attachmentId =
      meta.image_id ||
      meta.video_id ||
      meta.audio_id ||
      meta.file_id ||
      `upload_${Date.now()}`;

    return {
      attachmentId,
      mimeType: meta.filetype || mimeType,
      filename: meta.filename || filename,
      size: meta.filesize || buffer.length,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
    };
  }

  /**
   * Download an attachment via authenticated GET
   */
  async downloadAttachment(
    url: string,
    options?: DownloadOptions
  ): Promise<DownloadResult> {
    logger.debug('Downloading attachment', { url: url.substring(0, 100) });

    if (!url) {
      throw new Error('Attachment URL is required');
    }

    try {
      const requestHandler = this.graphqlClient.getRequestHandler();
      const response = await requestHandler.get(url);

      if (!response.ok) {
        throw new Error(
          `Failed to download attachment: ${response.status} ${response.statusText}`
        );
      }

      const contentType =
        response.headers.get('content-type') || 'application/octet-stream';

      let filename = options?.filename;
      const contentDisposition = response.headers.get('content-disposition');
      if (!filename && contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";\r\n]+)"?/);
        if (match?.[1]) {
          filename = match[1].trim();
        }
      }
      if (!filename) {
        const parts = new URL(url).pathname.split('/');
        filename = parts[parts.length - 1] || 'attachment';
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      logger.debug('Attachment downloaded', {
        filename,
        size: buffer.length,
        contentType,
      });

      return {
        buffer,
        filename,
        mimeType: contentType,
        size: buffer.length,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to download attachment', { url, error: msg });
      throw new Error(`Failed to download attachment: ${msg}`);
    }
  }
}
