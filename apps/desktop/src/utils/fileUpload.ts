import type { FileAttachment } from '../types/chat';
import { generateId, readFileAsDataURL } from './fileUtils';

export interface UploadConfig {
  onProgress?: (progress: number) => void;
  chunkSize?: number;
}

export async function uploadFile(file: File, config?: UploadConfig): Promise<FileAttachment> {
  const { onProgress } = config || {};

  try {
    const dataUrl = await readFileAsDataURL(file);

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

    const attachment: FileAttachment = {
      id: generateId(),
      name: file.name,
      size: file.size,
      type: file.type,
      data: dataUrl,
    };

    return attachment;
  } catch (error) {
    throw new Error(`Failed to upload ${file.name}: ${error}`);
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

export const deleteFile = async (_fileId: string): Promise<void> => {
  try {
    // TODO: Implement file deletion
  } catch (error) {
    throw new Error(`Failed to delete file: ${error}`);
  }
};

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
