import { readFileAsDataURL, generateId } from './fileUtils';
import type { FileAttachment } from '../types/chat';

/**
 * Upload configuration
 */
export interface UploadConfig {
  onProgress?: (progress: number) => void;
  chunkSize?: number;
}

/**
 * Upload a file to the backend
 * This is a placeholder implementation that simulates file upload
 * In production, this would integrate with your actual backend API
 */
export async function uploadFile(file: File, config?: UploadConfig): Promise<FileAttachment> {
  const { onProgress } = config || {};

  try {
    // Read file as base64
    const dataUrl = await readFileAsDataURL(file);

    // Simulate upload progress
    if (onProgress) {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        if (progress > 100) {
          progress = 100;
          clearInterval(interval);
        }
        onProgress(progress);
      }, 100);

      await new Promise((resolve) => setTimeout(resolve, 500));
      clearInterval(interval);
      onProgress(100);
    }

    // In a real implementation, you would call your backend API here
    // For example, using Tauri commands:
    // const result = await invoke<{ id: string; url: string }>('upload_file', {
    //   filename: file.name,
    //   data: dataUrl.split(',')[1], // Remove data URL prefix
    //   mimeType: file.type,
    // });

    // For now, return the file with data URL
    const attachment: FileAttachment = {
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type,
      data: dataUrl,
      // In production, this would be the URL from your backend:
      // url: result.url,
    };

    return attachment;
  } catch (error) {
    throw new Error(`Failed to upload ${file.name}: ${error}`);
  }
}

/**
 * Upload multiple files
 */
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
 * Delete an uploaded file
 */
export async function deleteFile(fileId: string): Promise<void> {
  try {
    // In production, call your backend API to delete the file
    // await invoke('delete_file', { fileId });
    console.log(`Deleting file: ${fileId}`);
  } catch (error) {
    throw new Error(`Failed to delete file: ${error}`);
  }
}

/**
 * Download a file from URL
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(blobUrl);
  } catch (error) {
    throw new Error(`Failed to download file: ${error}`);
  }
}

/**
 * Create artifacts from message content
 * This function extracts code blocks and other structured content
 * and converts them into artifacts
 */
export function extractArtifacts(content: string) {
  const artifacts = [];

  // Extract code blocks with language specification
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

/**
 * Prepare attachments for backend API
 * Converts FileAttachment objects to a format suitable for backend storage
 */
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
