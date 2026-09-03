'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
} from '@/lib/chat-attachment-policy';

const MAX_FILE_COUNT = MAX_CHAT_ATTACHMENT_COUNT;
const MAX_FILE_SIZE_BYTES = MAX_CHAT_ATTACHMENT_BYTES;

export const ALLOWED_MIME_TYPES = new Set<string>(CHAT_ATTACHMENT_MIME_TYPES);

export function getAcceptAttribute(): string {
  return chatAttachmentAcceptAttribute();
}

export type AttachmentPreviewType = 'image' | 'document';

export interface AttachmentPreview {
  file: File;
  url: string;
  type: AttachmentPreviewType;
}

export interface UseAttachmentsOptions {
  maxFiles?: number;
  maxFileSize?: number;
  onError?: (message: string) => void;
}

export interface UseAttachmentsReturn {
  attachments: File[];
  previews: AttachmentPreview[];
  canAddMore: boolean;
  addFiles: (files: File[]) => void;
  removeFile: (index: number) => void;
  clearAll: () => void;
}

function classifyFile(file: File): AttachmentPreviewType {
  return file.type.startsWith('image/') ? 'image' : 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Exported so callers (e.g. the composer's drop/paste/file-input handlers)
 * can pre-filter or validate a `File[]` using the exact same rule `addFiles`
 * enforces internally, rather than hand-rolling a narrower `file.type.startsWith('image/')`
 * check that silently drops valid non-image documents.
 */
export function isAllowedType(file: File): boolean {
  return isSupportedChatAttachment(file.name, file.type);
}

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsReturn {
  const { maxFiles = MAX_FILE_COUNT, maxFileSize = MAX_FILE_SIZE_BYTES, onError } = options;

  const [attachments, setAttachments] = useState<File[]>([]);
  const [previews, setPreviews] = useState<AttachmentPreview[]>([]);
  const previewUrlsRef = useRef<string[]>([]);

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    previewUrlsRef.current = previewUrlsRef.current.filter((u) => u !== url);
  }, []);

  const revokeAllUrls = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      revokeAllUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const availableSlots = maxFiles - attachments.length;
      if (availableSlots <= 0) {
        onError?.(`Maximum ${maxFiles} files allowed.`);
        return;
      }

      const accepted: File[] = [];
      const newPreviews: AttachmentPreview[] = [];

      for (const file of incoming) {
        if (accepted.length >= availableSlots) {
          onError?.(`Only ${availableSlots} more file(s) can be added (max ${maxFiles}).`);
          break;
        }

        if (file.size > maxFileSize) {
          onError?.(
            `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(maxFileSize)}.`,
          );
          continue;
        }

        if (!isAllowedType(file)) {
          onError?.(`"${file.name}" has an unsupported file type (${file.type || 'unknown'}).`);
          continue;
        }

        const url = URL.createObjectURL(file);
        previewUrlsRef.current.push(url);

        accepted.push(file);
        newPreviews.push({ file, url, type: classifyFile(file) });
      }

      if (accepted.length > 0) {
        setAttachments((prev) => [...prev, ...accepted]);
        setPreviews((prev) => [...prev, ...newPreviews]);
      }
    },
    [attachments.length, maxFiles, maxFileSize, onError],
  );

  const removeFile = useCallback(
    (index: number) => {
      if (index < 0 || index >= previews.length) return;

      const preview = previews[index];
      if (preview) {
        revokeUrl(preview.url);
      }

      setAttachments((prev) => prev.filter((_, i) => i !== index));
      setPreviews((prev) => prev.filter((_, i) => i !== index));
    },
    [previews, revokeUrl],
  );

  const clearAll = useCallback(() => {
    revokeAllUrls();
    setAttachments([]);
    setPreviews([]);
  }, [revokeAllUrls]);

  return {
    attachments,
    previews,
    canAddMore: attachments.length < maxFiles,
    addFiles,
    removeFile,
    clearAll,
  };
}

export default useAttachments;
