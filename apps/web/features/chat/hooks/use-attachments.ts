'use client';

/**
 * useAttachments - Hook for managing file attachments in the chat composer
 *
 * Features:
 * - State: attachments (File[]) and previews ({file, url, type}[])
 * - addFiles / removeFile / clearAll actions
 * - Preview URLs via URL.createObjectURL
 * - Validation: max 10 files, max 12 MiB per file, cross-provider-safe MIME types
 * - Auto-cleanup of object URLs on unmount
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
} from '@/lib/chat-attachment-policy';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_COUNT = MAX_CHAT_ATTACHMENT_COUNT;
const MAX_FILE_SIZE_BYTES = MAX_CHAT_ATTACHMENT_BYTES;

/**
 * MIME allowlist for `addFiles`. Exported (with the helpers below) so the
 * composer that owns the `<input type="file">` element can build its
 * `accept` attribute and gating logic from this single source of truth
 * instead of hardcoding a separate, narrower list that drifts out of sync
 * with what this hook actually accepts.
 *
 * `ChatComposerNew.tsx` uses `getAcceptAttribute()` (this full allowlist) and
 * accepts every type listed here — the old `accept="image/*"` narrowing and the
 * "web chat accepts images only" message it described are both gone.
 *
 * AUDIT-FIX CMP-27: because the picker offers documents as well as images, the
 * composer's capability gate can no longer be an `image/*` test. Images and
 * PDFs travel as provider media/document blocks and need a multimodal model;
 * text and code files are inlined as text and any model can read them. The
 * composer classifies with `isChatImageMimeType` + `application/pdf` from the
 * same policy module this file imports, so the two cannot drift.
 */
export const ALLOWED_MIME_TYPES = new Set<string>(CHAT_ATTACHMENT_MIME_TYPES);

/**
 * Extension fallback used when the browser can't determine a MIME type
 * (common for code files on some platforms). Kept in sync with the regex
 * in `isAllowedType` below so `getAcceptAttribute()` reflects reality.
 */
/**
 * Builds an `<input type="file" accept="...">` value from the canonical
 * allowlist above. Consuming components should call this instead of
 * hardcoding `accept="image/*"`, which silently disagrees with what
 * `addFiles`/`isAllowedType` actually accept and produces dead
 * document-upload code paths (menu says "Add photos & files" but the file
 * picker only offers images).
 */
export function getAcceptAttribute(): string {
  return chatAttachmentAcceptAttribute();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttachmentPreviewType = 'image' | 'document';

export interface AttachmentPreview {
  file: File;
  url: string;
  type: AttachmentPreviewType;
}

export interface UseAttachmentsOptions {
  /** Maximum number of files allowed (default: `MAX_CHAT_ATTACHMENT_COUNT`, 10). */
  maxFiles?: number;
  /**
   * Maximum size of one file in bytes. Defaults to `MAX_CHAT_ATTACHMENT_BYTES`
   * (12 MiB) — the same value `/api/uploads/presign` enforces, so an accepted
   * file is one the server will actually take. `MAX_ATTACHMENT_BYTES` (25 MiB)
   * in `@agiworkforce/types` is a different, larger bound and is not what this
   * hook uses.
   */
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

/**
 * Exported so callers (e.g. the composer's drop/paste/file-input handlers)
 * can pre-filter or validate a `File[]` using the exact same rule `addFiles`
 * enforces internally, rather than hand-rolling a narrower `file.type.startsWith('image/')`
 * check that silently drops valid non-image documents.
 */
export function isAllowedType(file: File): boolean {
  return isSupportedChatAttachment(file.name, file.type);
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
