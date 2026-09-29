'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  CHAT_ATTACHMENT_MIME_TYPES,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  chatAttachmentAcceptAttribute,
  isSupportedChatAttachment,
} from '@/lib/chat-attachment-policy';
import {
  PICTURE_METADATA_REFUSAL,
  carriesPictureMetadata,
  pictureMetadataRefusalNotice,
  prepareChatAttachment,
  type ChatDraftRefusal,
} from '@features/chat/lib/attachment-metadata';

const MAX_FILE_COUNT = MAX_CHAT_ATTACHMENT_COUNT;
const MAX_FILE_SIZE_BYTES = MAX_CHAT_ATTACHMENT_BYTES;
const MAX_MESSAGE_BYTES = MAX_CHAT_ATTACHMENT_MESSAGE_BYTES;

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
  maxTotalBytes?: number;
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

type IntakeIssueReason =
  | 'empty'
  | 'too_large'
  | 'unsupported'
  | 'too_many'
  | 'over_message_budget'
  | 'duplicate'
  | typeof PICTURE_METADATA_REFUSAL;

interface IntakeIssue {
  file: File;
  reason: IntakeIssueReason;
}

interface HeldFile {
  file: File;
  key: string;
}

interface IntakeLimits {
  maxFiles: number;
  maxFileSize: number;
  maxTotalBytes: number;
}

function fileIdentity(file: File): string {
  return JSON.stringify([file.name, file.size, file.lastModified, file.type]);
}

function singleIssueNotice(issue: IntakeIssue, limits: IntakeLimits): string {
  const { file } = issue;
  switch (issue.reason) {
    case 'empty':
      return `"${file.name}" is empty. Add content to the file and attach it again.`;
    case 'too_large':
      return `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(limits.maxFileSize)}.`;
    case 'unsupported':
      return `"${file.name}" has an unsupported file type (${file.type || 'unknown'}).`;
    case 'too_many':
      return `Maximum ${limits.maxFiles} files allowed.`;
    case 'over_message_budget':
      return `"${file.name}" was not attached. Files on one message must total ${formatFileSize(limits.maxTotalBytes)} or less.`;
    case 'duplicate':
      return `"${file.name}" is already attached.`;
    default:
      return pictureMetadataRefusalNotice(file.name);
  }
}

function issueReasonPhrase(reason: IntakeIssueReason, limits: IntakeLimits): string {
  switch (reason) {
    case 'empty':
      return 'empty';
    case 'too_large':
      return `larger than ${formatFileSize(limits.maxFileSize)}`;
    case 'unsupported':
      return 'unsupported file type';
    case 'too_many':
      return `over the ${limits.maxFiles}-file limit`;
    case 'over_message_budget':
      return `over the ${formatFileSize(limits.maxTotalBytes)} total for one message`;
    case 'duplicate':
      return 'already attached';
    default:
      return 'its location details could not be removed';
  }
}

function intakeNotice(
  total: number,
  attached: number,
  issues: readonly IntakeIssue[],
  limits: IntakeLimits,
): string | null {
  const [first] = issues;
  if (!first) return null;
  if (total === 1) return singleIssueNotice(first, limits);
  if (attached === 0 && issues.every((issue) => issue.reason === 'too_many')) {
    return singleIssueNotice(first, limits);
  }
  const list = issues
    .map((issue) => `"${issue.file.name}" (${issueReasonPhrase(issue.reason, limits)})`)
    .join(', ');
  return attached > 0
    ? `Attached ${attached} of ${total} files. Not attached: ${list}.`
    : `None of the ${total} files were attached: ${list}.`;
}

function refusalOf(issue: IntakeIssue): ChatDraftRefusal | null {
  if (issue.reason === 'duplicate') return null;
  return { filename: issue.file.name, reason: issue.reason };
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
  const {
    maxFiles = MAX_FILE_COUNT,
    maxFileSize = MAX_FILE_SIZE_BYTES,
    maxTotalBytes = MAX_MESSAGE_BYTES,
    onError,
  } = options;

  const [attachments, setAttachments] = useState<File[]>([]);
  const [previews, setPreviews] = useState<AttachmentPreview[]>([]);
  const [refused, setRefused] = useState<ChatDraftRefusal[]>([]);
  const [preparing, setPreparing] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);
  const previewKeysRef = useRef<string[]>([]);
  const heldBytesRef = useRef<Map<string, number>>(new Map());
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

  const admit = useCallback((accepted: readonly HeldFile[], unreadable: readonly HeldFile[]) => {
    heldCountRef.current -= unreadable.length;
    for (const entry of unreadable) heldBytesRef.current.delete(entry.key);
    for (const entry of accepted) heldBytesRef.current.set(entry.key, entry.file.size);
    if (unreadable.length > 0) {
      setRefused((prev) => [
        ...prev,
        ...unreadable.map((entry): ChatDraftRefusal => ({
          filename: entry.file.name,
          reason: PICTURE_METADATA_REFUSAL,
        })),
      ]);
    }
    if (accepted.length === 0) return;
    const newPreviews = accepted.map(({ file }) => {
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      return { file, url, type: classifyFile(file) };
    });
    previewKeysRef.current.push(...accepted.map((entry) => entry.key));
    setAttachments((prev) => [...prev, ...accepted.map((entry) => entry.file)]);
    setPreviews((prev) => [...prev, ...newPreviews]);
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const limits: IntakeLimits = { maxFiles, maxFileSize, maxTotalBytes };
      const report = (attached: number, issues: readonly IntakeIssue[]) => {
        const notice = intakeNotice(incoming.length, attached, issues, limits);
        if (notice) onError?.(notice);
      };
      const issues: IntakeIssue[] = [];
      const batch: HeldFile[] = [];
      const batchKeys = new Set<string>();
      const availableSlots = maxFiles - heldCountRef.current;
      let messageBytes = [...heldBytesRef.current.values()].reduce((sum, bytes) => sum + bytes, 0);

      for (const file of incoming) {
        const key = fileIdentity(file);
        if (heldBytesRef.current.has(key) || batchKeys.has(key)) {
          issues.push({ file, reason: 'duplicate' });
          continue;
        }
        if (batch.length >= availableSlots) {
          issues.push({ file, reason: 'too_many' });
          continue;
        }
        if (file.size === 0) {
          issues.push({ file, reason: 'empty' });
          continue;
        }
        if (file.size > maxFileSize) {
          issues.push({ file, reason: 'too_large' });
          continue;
        }
        if (!isAllowedType(file)) {
          issues.push({ file, reason: 'unsupported' });
          continue;
        }
        if (messageBytes + file.size > maxTotalBytes) {
          issues.push({ file, reason: 'over_message_budget' });
          continue;
        }
        messageBytes += file.size;
        batchKeys.add(key);
        batch.push({ file, key });
      }

      const refusals = issues.map(refusalOf).filter((entry) => entry !== null);
      if (refusals.length > 0) setRefused((prev) => [...prev, ...refusals]);
      if (batch.length === 0) {
        report(0, issues);
        return;
      }

      heldCountRef.current += batch.length;
      for (const entry of batch) heldBytesRef.current.set(entry.key, entry.file.size);
      const generation = draftGenerationRef.current;
      if (
        pendingBatchesRef.current === 0 &&
        !batch.some(({ file }) => carriesPictureMetadata(file))
      ) {
        admit(batch, []);
        report(batch.length, issues);
        return;
      }

      const settle = (accepted: readonly HeldFile[], unreadable: readonly HeldFile[]) => {
        if (generation !== draftGenerationRef.current) return;
        admit(accepted, unreadable);
        report(accepted.length, [
          ...issues,
          ...unreadable.map((entry): IntakeIssue => ({
            file: entry.file,
            reason: PICTURE_METADATA_REFUSAL,
          })),
        ]);
      };

      pendingBatchesRef.current += 1;
      setPreparing(true);
      admissionRef.current = admissionRef.current
        .then(() => Promise.all(batch.map(({ file }) => prepareChatAttachment(file))))
        .then(
          (results) => {
            const accepted: HeldFile[] = [];
            const unreadable: HeldFile[] = [];
            results.forEach((result, index) => {
              const entry = batch[index];
              if (!entry) return;
              if (result.status === 'ready') accepted.push({ file: result.file, key: entry.key });
              else unreadable.push(entry);
            });
            settle(accepted, unreadable);
          },
          () => settle([], batch),
        )
        .then(() => {
          pendingBatchesRef.current -= 1;
          if (pendingBatchesRef.current === 0) setPreparing(false);
        });
    },
    [admit, maxFiles, maxFileSize, maxTotalBytes, onError],
  );

  const removeFile = useCallback(
    (index: number) => {
      if (index < 0 || index >= previews.length) return;

      const preview = previews[index];
      if (preview) {
        revokeUrl(preview.url);
      }

      const [key] = previewKeysRef.current.splice(index, 1);
      if (key) heldBytesRef.current.delete(key);
      heldCountRef.current = Math.max(0, heldCountRef.current - 1);
      setAttachments((prev) => prev.filter((_, i) => i !== index));
      setPreviews((prev) => prev.filter((_, i) => i !== index));
    },
    [previews, revokeUrl],
  );

  const clearAll = useCallback(() => {
    draftGenerationRef.current += 1;
    heldCountRef.current = 0;
    heldBytesRef.current.clear();
    previewKeysRef.current = [];
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
