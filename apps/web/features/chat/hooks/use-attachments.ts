'use client';

/**
 * useAttachments - Hook for managing file attachments in the chat composer
 *
 * Features:
 * - State: attachments (File[]) and previews ({file, url, type}[])
 * - addFiles / removeFile / clearAll actions
 * - Preview URLs via URL.createObjectURL
 * - Validation: max 20 files, max 25 MiB per file (canonical, see
 *   `@agiworkforce/types`'s MAX_ATTACHMENT_BYTES), allowed MIME types
 * - Auto-cleanup of object URLs on unmount
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { MAX_ATTACHMENT_BYTES } from '@agiworkforce/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FILE_COUNT = 20;
/**
 * Per-file size cap. Sourced from `@agiworkforce/types` so Web matches the
 * canonical limit that Mobile + Desktop + unified-chat already enforce.
 *
 * Previously hardcoded to 30 MB here · files between 25 MiB (canonical)
 * and 30 MB (web) passed local validation but consistently failed at the
 * Anthropic/OpenAI provider gateways, surfacing as opaque 413s late in
 * the request flow. 2026-05-22 ultrathink audit.
 */
const MAX_FILE_SIZE_BYTES = MAX_ATTACHMENT_BYTES;

/**
 * MIME allowlist for `addFiles`. Exported (with the helpers below) so the
 * composer that owns the `<input type="file">` element can build its
 * `accept` attribute and gating logic from this single source of truth
 * instead of hardcoding a separate, narrower list that drifts out of sync
 * with what this hook actually accepts (see `ChatComposerNew.tsx`'s
 * `accept="image/*"` — tracked as a fast-follow, not fixed here since that
 * file is out of scope for this pass).
 */
export const ALLOWED_MIME_TYPES = new Set([
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
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Code
  'text/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'application/xml',
]);

/**
 * Extension fallback used when the browser can't determine a MIME type
 * (common for code files on some platforms). Kept in sync with the regex
 * in `isAllowedType` below so `getAcceptAttribute()` reflects reality.
 */
const ALLOWED_EXTENSIONS_FALLBACK = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rs',
  '.go',
  '.rb',
  '.sh',
  '.yml',
  '.yaml',
  '.toml',
];

/**
 * Builds an `<input type="file" accept="...">` value from the canonical
 * allowlist above. Consuming components should call this instead of
 * hardcoding `accept="image/*"`, which silently disagrees with what
 * `addFiles`/`isAllowedType` actually accept and produces dead
 * document-upload code paths (menu says "Add photos & files" but the file
 * picker only offers images).
 */
export function getAcceptAttribute(): string {
  return [...ALLOWED_MIME_TYPES, ...ALLOWED_EXTENSIONS_FALLBACK].join(',');
}

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
  /** Maximum file size in bytes (default: 25 MiB · canonical, see `@agiworkforce/types` MAX_ATTACHMENT_BYTES). */
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
