'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
} from '@/lib/chat-attachment-policy';
import {
  PICTURE_METADATA_REFUSAL,
  carriesPictureMetadata,
  pictureMetadataRefusalNotice,
  prepareChatAttachments,
  type ChatDraftRefusal,
} from '@features/chat/lib/attachment-metadata';

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
 * accepts every type listed here, the old `accept="image/*"` narrowing and the
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
  /**
   * Files this draft refused, so the send can say so instead of leaving the
   * model to answer a prompt about a file it never received. Cleared with the
   * rest of the draft, so a refusal rides exactly the turn it happened on.
   */
  refused: ChatDraftRefusal[];
  /** A picture is still having its location and camera details removed. */
  preparing: boolean;
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
  const [refused, setRefused] = useState<ChatDraftRefusal[]>([]);
  const [preparing, setPreparing] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);
  const heldCountRef = useRef(0);
  const draftGenerationRef = useRef(0);
  const pendingBatchesRef = useRef(0);
  const admissionRef = useRef<Promise<void>>(Promise.resolve());

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
      draftGenerationRef.current += 1;
      revokeAllUrls();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const admit = useCallback(
    (generation: number, accepted: File[], unreadable: ChatDraftRefusal[]) => {
      if (generation !== draftGenerationRef.current) return;
      heldCountRef.current -= unreadable.length;
      for (const refusal of unreadable) onError?.(pictureMetadataRefusalNotice(refusal.filename));
      if (unreadable.length > 0) setRefused((prev) => [...prev, ...unreadable]);
      if (accepted.length === 0) return;
      const newPreviews = accepted.map((file) => {
        const url = URL.createObjectURL(file);
        previewUrlsRef.current.push(url);
        return { file, url, type: classifyFile(file) };
      });
      setAttachments((prev) => [...prev, ...accepted]);
      setPreviews((prev) => [...prev, ...newPreviews]);
    },
    [onError],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const availableSlots = maxFiles - heldCountRef.current;
      const rejected: ChatDraftRefusal[] = [];
      if (availableSlots <= 0) {
        onError?.(`Maximum ${maxFiles} files allowed.`);
        setRefused((prev) => [
          ...prev,
          ...incoming.map((file) => ({ filename: file.name, reason: 'too_many' as const })),
        ]);
        return;
      }

      const candidates: File[] = [];

      for (const file of incoming) {
        if (candidates.length >= availableSlots) {
          onError?.(`Only ${availableSlots} more file(s) can be added (max ${maxFiles}).`);
          rejected.push({ filename: file.name, reason: 'too_many' });
          break;
        }

        if (file.size === 0) {
          onError?.(`"${file.name}" is empty. Add content to the file and attach it again.`);
          rejected.push({ filename: file.name, reason: 'empty' });
          continue;
        }

        if (file.size > maxFileSize) {
          onError?.(
            `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(maxFileSize)}.`,
          );
          rejected.push({ filename: file.name, reason: 'too_large' });
          continue;
        }

        if (!isAllowedType(file)) {
          onError?.(`"${file.name}" has an unsupported file type (${file.type || 'unknown'}).`);
          rejected.push({ filename: file.name, reason: 'unsupported' });
          continue;
        }

        candidates.push(file);
      }

      if (rejected.length > 0) setRefused((prev) => [...prev, ...rejected]);
      if (candidates.length === 0) return;

      heldCountRef.current += candidates.length;
      const generation = draftGenerationRef.current;
      if (pendingBatchesRef.current === 0 && !candidates.some(carriesPictureMetadata)) {
        admit(generation, candidates, []);
        return;
      }

      pendingBatchesRef.current += 1;
      setPreparing(true);
      admissionRef.current = admissionRef.current
        .then(() => prepareChatAttachments(candidates))
        .then(
          ({ accepted, refused: unreadable }) => admit(generation, accepted, unreadable),
          () =>
            admit(
              generation,
              [],
              candidates.map((file) => ({ filename: file.name, reason: PICTURE_METADATA_REFUSAL })),
            ),
        )
        .then(() => {
          pendingBatchesRef.current -= 1;
          if (pendingBatchesRef.current === 0) setPreparing(false);
        });
    },
    [admit, maxFiles, maxFileSize, onError],
  );

  const removeFile = useCallback(
    (index: number) => {
      if (index < 0 || index >= previews.length) return;

      const preview = previews[index];
      if (preview) {
        revokeUrl(preview.url);
      }

      heldCountRef.current = Math.max(0, heldCountRef.current - 1);
      setAttachments((prev) => prev.filter((_, i) => i !== index));
      setPreviews((prev) => prev.filter((_, i) => i !== index));
    },
    [previews, revokeUrl],
  );

  const clearAll = useCallback(() => {
    draftGenerationRef.current += 1;
    heldCountRef.current = 0;
    revokeAllUrls();
    setAttachments([]);
    setPreviews([]);
    setRefused([]);
  }, [revokeAllUrls]);

  return {
    attachments,
    previews,
    canAddMore: attachments.length < maxFiles,
    refused,
    preparing,
    addFiles,
    removeFile,
    clearAll,
  };
}

export default useAttachments;
