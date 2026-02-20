import type { FileAttachment } from '../types/chat';
import { generateId, readFileAsDataURL } from './fileUtils';

export interface UploadConfig {
  onProgress?: (progress: number) => void;
  /** Chunk size in bytes for large file processing. Default: 1MB */
  chunkSize?: number;
  /** Maximum file size in bytes before forcing chunked processing. Default: 5MB */
  largeFileThreshold?: number;
}

/**
 * Read file as data URL with progress tracking.
 * For large files, uses chunked reading to avoid blocking the main thread.
 */
async function readFileWithProgress(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // For smaller files, use direct reading
  const SMALL_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB

  if (file.size <= SMALL_FILE_THRESHOLD) {
    // Report progress for small files
    if (onProgress) {
      onProgress(10);
      await new Promise((resolve) => setTimeout(resolve, 100));
      onProgress(50);
    }

    const result = await readFileAsDataURL(file);

    if (onProgress) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      onProgress(100);
    }

    return result;
  }

  // For larger files, use chunked reading with FileReader
  return new Promise((resolve, reject) => {
    const chunkSize = 1024 * 1024; // 1MB chunks
    let offset = 0;
    const chunks: string[] = [];

    const reader = new FileReader();

    const readNextChunk = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsDataURL(slice);
    };

    reader.onload = (e) => {
      if (e.target?.result) {
        chunks.push(e.target.result as string);
        offset += chunkSize;

        // Report progress
        if (onProgress) {
          const progress = Math.min(Math.round((offset / file.size) * 80) + 10, 90);
          onProgress(progress);
        }

        if (offset < file.size) {
          // Use setTimeout to prevent blocking the main thread
          setTimeout(readNextChunk, 0);
        } else {
          // All chunks read, combine them
          // For data URLs, we need to extract the base data and combine the binary parts
          const firstChunk = chunks[0];
          if (!firstChunk) {
            reject(new Error(`Failed to read file: ${file.name}`));
            return;
          }
          const dataUrlPrefix = firstChunk.split(',')[0] + ',';

          // Combine all binary data
          const combinedBinary = chunks.map((chunk) => chunk.split(',')[1]).join('');

          resolve(dataUrlPrefix + combinedBinary);

          if (onProgress) {
            onProgress(100);
          }
        }
      }
    };

    reader.onerror = () => {
      reject(new Error(`Failed to read file: ${file.name}`));
    };

    // Start reading
    readNextChunk();
  });
}

export async function uploadFile(file: File, config?: UploadConfig): Promise<FileAttachment> {
  const { onProgress, largeFileThreshold = 5 * 1024 * 1024 } = config || {};

  // Validate file size
  if (file.size > largeFileThreshold && !onProgress) {
    console.warn(
      `Large file (${(file.size / 1024 / 1024).toFixed(2)}MB): Consider adding onProgress callback for better UX`,
    );
  }

  try {
    // Read file with progress tracking
    const dataUrl = await readFileWithProgress(file, onProgress);

    const attachment: FileAttachment = {
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type,
      data: dataUrl,
    };

    return attachment;
  } catch (error) {
    throw new Error(`Failed to process ${file.name}: ${error}`);
  }
}

export async function uploadFiles(
  files: File[],
  onProgress?: (fileIndex: number, progress: number) => void,
): Promise<FileAttachment[]> {
  const attachments: FileAttachment[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) continue;

    const attachment = await uploadFile(file, {
      onProgress: (progress) => onProgress?.(i, progress),
    });
    attachments.push(attachment);
  }

  return attachments;
}

/**
 * Delete a file attachment by its ID
 * Since files are stored as data URLs in memory/state, this is a no-op
 * that signals the caller to remove the file from their state
 */
export const deleteFile = async (fileId: string): Promise<void> => {
  if (!fileId) {
    throw new Error('File ID is required for deletion');
  }
  // Files are stored in component state as data URLs, not on disk
  // The caller should handle removing the file from their state after this returns
  // This function exists for API consistency and future server-side file storage
  return Promise.resolve();
};

export async function downloadFile(url: string, filename: string): Promise<void> {
  // AUDIT-007-015 fix: Track blobUrl for guaranteed cleanup in finally block
  let blobUrl: string | undefined;

  try {
    const response = await fetch(url);
    const blob = await response.blob();
    blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    try {
      a.click();
    } finally {
      document.body.removeChild(a);
    }
  } catch (error) {
    throw new Error(`Failed to download file: ${error}`);
  } finally {
    // AUDIT-007-015 fix: Ensure blob URL is always revoked, even if click fails
    if (blobUrl !== undefined) {
      URL.revokeObjectURL(blobUrl);
    }
  }
}

export function extractArtifacts(content: string) {
  const artifacts = [];

  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const code = match[2];

    if (code !== undefined) {
      artifacts.push({
        id: generateId(),
        type: 'code' as const,
        language,
        content: code.trim(),
      });
    }
  }

  return artifacts;
}

export interface AttachmentData {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
}

export function prepareAttachmentsForApi(attachments: FileAttachment[]): AttachmentData[] {
  return attachments.map((attachment) => {
    const data: AttachmentData = {
      id: attachment.id,
      name: attachment.name,
      size: attachment.size,
      type: attachment.type,
    };

    if (attachment.url !== undefined) {
      data.url = attachment.url;
    }

    return data;
  });
}
