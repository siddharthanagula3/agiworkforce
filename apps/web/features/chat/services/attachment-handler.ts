import { logger } from '@shared/lib/logger';
/**
 * File Attachment Handler
 *
 * Handles file uploads, storage, and retrieval for chat attachments.
 * Uses Vercel Blob for file hosting (requires BLOB_READ_WRITE_TOKEN on the server).
 *
 * NOTE: Vercel Blob URLs are permanent public URLs. The bucket-init concept does
 * not apply. For deletion, pass the full blob URL (blob.url) to del().
 * Attachment.id stores the blob URL so deleteFile() can call del(url).
 */

import { put, del, list } from '@vercel/blob';
import { secureFilenameSegment } from '@/lib/secure-random';
import type { Attachment } from '../types';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  attachment: Attachment;
  url: string;
  publicUrl: string;
}

export class AttachmentHandler {
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  private readonly allowedTypes = [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Documents
    'application/pdf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/xml',
    // Office documents
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Code files
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'text/x-python',
    'text/x-java',
  ];

  /**
   * No-op: Vercel Blob has no bucket concept.
   * Retained for API compatibility with existing callers.
   */
  async initializeBucket(): Promise<void> {
    // Vercel Blob does not require bucket initialization.
  }

  /**
   * Validate file before upload
   */
  validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds ${this.maxFileSize / 1024 / 1024}MB limit`,
      };
    }

    // Check file type
    if (!this.allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not allowed`,
      };
    }

    // Check filename for malicious patterns
    const filename = file.name.toLowerCase();
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.app', '.dmg'];

    if (dangerousExtensions.some((ext) => filename.endsWith(ext))) {
      return {
        valid: false,
        error: 'Executable files are not allowed',
      };
    }

    return { valid: true };
  }

  /**
   * Upload a file to Vercel Blob
   */
  async uploadFile(
    file: File,
    userId: string,
    sessionId: string,
    _onProgress?: (progress: UploadProgress) => void,
  ): Promise<UploadResult> {
    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate unique filename
    // WEB-16: secureFilenameSegment uses crypto.getRandomValues (rejection-
    // sampled, unbiased) instead of Math.random · prevents URL-enumeration
    // attacks against neighboring uploads when sessionId is known to attacker.
    const timestamp = Date.now();
    const randomString = secureFilenameSegment(13);
    const extension = file.name.split('.').pop();
    const safeFilename = `${userId}/${sessionId}/${timestamp}_${randomString}.${extension}`;

    try {
      // Upload file to Vercel Blob
      const blob = await put(safeFilename, file, {
        access: 'public',
        contentType: file.type,
      });

      // Create thumbnail for images
      let thumbnailUrl: string | undefined;
      if (file.type.startsWith('image/')) {
        thumbnailUrl = await this.createThumbnail(file, safeFilename, userId, sessionId);
      }

      // Attachment.id stores the blob URL so deleteFile() can call del(url).
      const attachment: Attachment = {
        id: blob.url,
        name: file.name,
        type: file.type,
        size: file.size,
        url: blob.url,
        thumbnailUrl,
      };

      return {
        attachment,
        url: blob.url,
        publicUrl: blob.url,
      };
    } catch (error) {
      logger.error('File upload error:', error);
      throw new Error(
        `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Create thumbnail for images
   */
  private async createThumbnail(
    file: File,
    originalPath: string,
    _userId: string,
    _sessionId: string,
  ): Promise<string | undefined> {
    try {
      // Create thumbnail using canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      const img = new Image();
      const imageUrl = URL.createObjectURL(file);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = imageUrl;
      });

      // Calculate thumbnail dimensions (max 200x200)
      const maxSize = 200;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxSize) {
          height = (height * maxSize) / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = (width * maxSize) / height;
          height = maxSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      });

      if (!blob) return undefined;

      // Upload thumbnail to Vercel Blob
      const thumbnailPath = originalPath.replace(/\.[^/.]+$/, '_thumb.jpg');

      const thumbBlob = await put(thumbnailPath, blob, {
        access: 'public',
        contentType: 'image/jpeg',
      });

      URL.revokeObjectURL(imageUrl);

      return thumbBlob.url;
    } catch (error) {
      logger.error('Thumbnail creation error:', error);
      return undefined;
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: File[],
    userId: string,
    sessionId: string,
    onProgress?: (fileIndex: number, progress: UploadProgress) => void,
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const result = await this.uploadFile(
        file!,
        userId,
        sessionId,
        onProgress ? (progress) => onProgress(i, progress) : undefined,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Delete a file from Vercel Blob.
   * @param blobUrl - The full Vercel Blob URL returned by put() (stored as Attachment.id).
   */
  async deleteFile(blobUrl: string): Promise<void> {
    await del(blobUrl);

    // Also try to delete thumbnail if it exists (derive thumb URL from original)
    const thumbnailUrl = blobUrl.replace(/\.[^/.?#]+(\?.*)?$/, (_, qs) => `_thumb.jpg${qs ?? ''}`);
    try {
      await del(thumbnailUrl);
    } catch {
      // Thumbnail may not exist; ignore deletion errors.
    }
  }

  /**
   * Get file info from Vercel Blob.
   * @param blobUrl - The full Vercel Blob URL.
   */
  async getFileInfo(blobUrl: string): Promise<{
    name: string;
    size: number;
    type: string;
    url: string;
  } | null> {
    try {
      const { blobs } = await list({ prefix: blobUrl });
      if (!blobs || blobs.length === 0) return null;
      const entry = blobs[0]!;
      const name = entry.pathname.split('/').pop() ?? entry.pathname;
      return {
        name,
        size: entry.size,
        type: 'application/octet-stream', // Vercel Blob list does not return content-type
        url: entry.url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Vercel Blob public URLs are permanent and do not expire.
   * This method is retained for API compatibility; it returns the URL unchanged.
   * @param blobUrl - The full Vercel Blob URL.
   */
  async refreshSignedUrl(blobUrl: string, _expiresIn: number = 3600): Promise<string> {
    return blobUrl;
  }

  /**
   * Get all attachments for a session from Vercel Blob.
   */
  async getSessionAttachments(userId: string, sessionId: string): Promise<Attachment[]> {
    const prefix = `${userId}/${sessionId}/`;

    let blobs;
    try {
      ({ blobs } = await list({ prefix }));
    } catch (error) {
      logger.error('Failed to list attachments:', error);
      return [];
    }

    if (!blobs || blobs.length === 0) {
      return [];
    }

    const attachments: Attachment[] = [];

    for (const entry of blobs) {
      const name = entry.pathname.split('/').pop() ?? entry.pathname;
      // Skip thumbnails
      if (name.includes('_thumb.')) continue;

      // Derive thumbnail URL by path convention
      const thumbnailUrl = entry.url.replace(
        /\.[^/.?#]+(\?.*)?$/,
        (_, qs) => `_thumb.jpg${qs ?? ''}`,
      );

      attachments.push({
        id: entry.url,
        name,
        type: 'application/octet-stream', // Vercel Blob list does not return content-type
        size: entry.size,
        url: entry.url,
        thumbnailUrl,
      });
    }

    return attachments;
  }

  /**
   * Download a file from Vercel Blob.
   * @param blobUrl - The full Vercel Blob URL.
   */
  async downloadFile(blobUrl: string, filename: string): Promise<void> {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error('Failed to download file');
    }
    const data = await response.blob();

    // Create download link
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

export const attachmentHandler = new AttachmentHandler();
