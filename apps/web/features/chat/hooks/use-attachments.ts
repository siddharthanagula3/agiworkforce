'use client';

/**
 * useAttachments - Hook for managing file attachments in the chat composer
 *
 * Features:
 * - State: attachments (File[]) and previews ({file, url, type}[])
 * - addFiles / removeFile / clearAll actions
 * - Preview URLs via URL.createObjectURL
 * - Validation: max 20 files, max 30MB per file, allowed MIME types
 * - Auto-cleanup of object URLs on unmount
 */

import { useState, useCallback, useEffect, useRef } from 'react';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_COUNT = 20;
const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30MB

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // Code
  'text/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'application/xml',
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttachmentPreviewType = 'image' | 'document';

export interface AttachmentPreview {
  file: File;
  url: string;
  type: AttachmentPreviewType;
}

export interface UseAttachmentsOptions {
  /** Maximum number of files allowed (default: 20) */
  maxFiles?: number;
  /** Maximum file size in bytes (default: 30MB) */
  maxFileSize?: number;
  /** Callback fired when a validation error occurs */
  onError?: (message: string) => void;
}

export interface UseAttachmentsReturn {
  /** Raw File objects */
  attachments: File[];
  /** Preview metadata with object URLs for rendering */
  previews: AttachmentPreview[];
  /** Whether files can still be added */
  canAddMore: boolean;
  /** Add one or more files (validates before adding) */
  addFiles: (files: File[]) => void;
  /** Remove a file by its index */
  removeFile: (index: number) => void;
  /** Clear all attachments and revoke all preview URLs */
  clearAll: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function classifyFile(file: File): AttachmentPreviewType {
  return file.type.startsWith('image/') ? 'image' : 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedType(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  // Fallback: allow if the browser couldn't determine the MIME but the file
  // has a text-like extension (.ts, .tsx, .py, .rs, .go, etc.)
  if (!file.type && /\.(ts|tsx|js|jsx|py|rs|go|rb|sh|yml|yaml|toml)$/i.test(file.name)) {
    return true;
  }
  return false;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsReturn {
  const { maxFiles = MAX_FILE_COUNT, maxFileSize = MAX_FILE_SIZE_BYTES, onError } = options;

  const [attachments, setAttachments] = useState<File[]>([]);
  const [previews, setPreviews] = useState<AttachmentPreview[]>([]);
  const previewUrlsRef = useRef<string[]>([]);

  // Revoke a single URL and remove it from the tracking ref
  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    previewUrlsRef.current = previewUrlsRef.current.filter((u) => u !== url);
  }, []);

  // Revoke ALL tracked URLs
  const revokeAllUrls = useCallback(() => {
    for (const url of previewUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    previewUrlsRef.current = [];
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      revokeAllUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── addFiles ─────────────────────────────────────────────────────────────

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      // Validate count
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

        // Validate size
        if (file.size > maxFileSize) {
          onError?.(
            `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(maxFileSize)}.`,
          );
          continue;
        }

        // Validate type
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

  // ── removeFile ───────────────────────────────────────────────────────────

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

  // ── clearAll ─────────────────────────────────────────────────────────────

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
