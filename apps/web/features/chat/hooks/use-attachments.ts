'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE,
  chatAttachmentAcceptAttribute,
  chatImageTooLargeMessage,
  chatLargeFileKindMaxBytes,
  isSupportedChatAttachment,
  resolveChatAttachmentMimeType,
} from '@/lib/chat-attachment-policy';
import { useBillingStore } from '@shared/stores/web-auth-store';
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
const MAX_IMAGE_BYTES = MAX_CHAT_IMAGE_ATTACHMENT_BYTES;

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
  maxImageSize?: number;
  maxTotalBytes?: number;
  /**
   * The plan's largest upload. A file above what chat sends inline but within
   * this belongs in a project, and the notice says so.
   */
  planFileLimitBytes?: number;
  /** Names the plan in a notice about a file larger than it allows. */
  planLabel?: string;
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
  /** Resolves with the incoming files the draft took, so a caller can keep the rest. */
  admitFiles: (files: File[]) => Promise<File[]>;
  removeFile: (index: number) => void;
  clearAll: () => void;
}

function classifyFile(file: File): AttachmentPreviewType {
  return resolveChatAttachmentMimeType(file.name, file.type)?.startsWith('image/')
    ? 'image'
    : 'document';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Rounded down, so the draft never promises room the account does not have. */
function formatStorageLeft(bytes: number): string {
  if (bytes < 1024 * 1024) return formatFileSize(bytes);
  return `${Math.floor(bytes / (1024 * 1024))} MB`;
}

type IntakeIssueReason =
  | 'empty'
  | 'too_large'
  | 'image_too_large'
  | 'kind_too_large'
  | 'storage_full'
  | 'needs_project'
  | 'unsupported'
  | 'too_many'
  | 'over_message_budget'
  | 'over_inline_budget'
  | 'duplicate'
  | typeof PICTURE_METADATA_REFUSAL;

interface IntakeIssue {
  file: File;
  reason: IntakeIssueReason;
  /** The cap for this file's kind, on a `kind_too_large` issue. */
  limitBytes?: number;
}

interface HeldFile {
  file: File;
  key: string;
}

interface IntakeLimits {
  maxFiles: number;
  maxFileSize: number;
  maxImageSize: number;
  maxTotalBytes: number;
  planFileLimitBytes?: number | undefined;
  planLabel?: string | undefined;
  inlineMessageBytes?: number | undefined;
  storageRemainingBytes?: number | null | undefined;
}

/**
 * What a handshake that offers large files adds to the draft. Files within the
 * inline limit still go inline, so together they keep today's message budget.
 */
interface LargeFileOffer {
  inlineMessageBytes: number;
  storageRemainingBytes: number | null;
}

/**
 * The server lowers an offered limit to exactly the remaining storage, never
 * below today's, so only that value means storage and not a cap set the limit.
 */
function storageSetsLimit(limit: number, floor: number, remaining: number | null): boolean {
  return remaining !== null && limit === Math.max(floor, remaining);
}

function fileIdentity(file: File): string {
  return JSON.stringify([file.name, file.size, file.lastModified, file.type]);
}

function imageTooLargeMessage(limits: IntakeLimits): string {
  return chatImageTooLargeMessage({
    maxFileBytes: limits.maxFileSize,
    maxImageBytes: limits.maxImageSize,
    maxMessageBytes: limits.maxTotalBytes,
    maxFilesPerMessage: limits.maxFiles,
  });
}

function singleIssueNotice(issue: IntakeIssue, limits: IntakeLimits): string {
  const { file } = issue;
  switch (issue.reason) {
    case 'empty':
      return `"${file.name}" is empty. Add content to the file and attach it again.`;
    case 'too_large':
      return limits.planLabel && limits.planFileLimitBytes !== undefined
        ? `"${file.name}" is too large (${formatFileSize(file.size)}). ${limits.planLabel} accounts can upload files up to ${formatFileSize(limits.planFileLimitBytes)} each.`
        : `"${file.name}" is too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(limits.maxFileSize)}.`;
    case 'image_too_large':
      return `"${file.name}" is too large. ${imageTooLargeMessage(limits)}`;
    case 'kind_too_large':
      return `"${file.name}" is too large (${formatFileSize(file.size)}). Files of this type can be up to ${formatFileSize(issue.limitBytes ?? limits.maxFileSize)}.`;
    case 'storage_full':
      return `"${file.name}" was not attached. You have ${formatStorageLeft(limits.storageRemainingBytes ?? 0)} of storage left. Delete files in your Library to make room.`;
    case 'needs_project':
      return `"${file.name}" was not attached. ${CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE}`;
    case 'unsupported':
      return `"${file.name}" has an unsupported file type (${file.type || 'unknown'}).`;
    case 'too_many':
      return `Maximum ${limits.maxFiles} files allowed.`;
    case 'over_message_budget':
      return `"${file.name}" was not attached. Files on one message must total ${formatFileSize(limits.maxTotalBytes)} or less.`;
    case 'over_inline_budget':
      return `"${file.name}" was not attached. Files on one message must total ${formatFileSize(limits.inlineMessageBytes ?? limits.maxTotalBytes)} or less.`;
    case 'duplicate':
      return `"${file.name}" is already attached.`;
    default:
      return pictureMetadataRefusalNotice(file.name);
  }
}

function issueReasonPhrase(issue: IntakeIssue, limits: IntakeLimits): string {
  switch (issue.reason) {
    case 'empty':
      return 'empty';
    case 'too_large':
      return `larger than ${formatFileSize(limits.planFileLimitBytes ?? limits.maxFileSize)}`;
    case 'image_too_large':
      return `an image over ${formatFileSize(limits.maxImageSize)}`;
    case 'kind_too_large':
      return `larger than ${formatFileSize(issue.limitBytes ?? limits.maxFileSize)} for its type`;
    case 'storage_full':
      return `more than the ${formatStorageLeft(limits.storageRemainingBytes ?? 0)} of storage left`;
    case 'needs_project':
      return `over ${formatFileSize(limits.maxFileSize)}, add it to a project`;
    case 'unsupported':
      return 'unsupported file type';
    case 'too_many':
      return `over the ${limits.maxFiles}-file limit`;
    case 'over_message_budget':
      return `over the ${formatFileSize(limits.maxTotalBytes)} total for one message`;
    case 'over_inline_budget':
      return `over the ${formatFileSize(limits.inlineMessageBytes ?? limits.maxTotalBytes)} total for one message`;
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
    .map((issue) => `"${issue.file.name}" (${issueReasonPhrase(issue, limits)})`)
    .join(', ');
  return attached > 0
    ? `Attached ${attached} of ${total} files. Not attached: ${list}.`
    : `None of the ${total} files were attached: ${list}.`;
}

function refusalOf(issue: IntakeIssue): ChatDraftRefusal | null {
  switch (issue.reason) {
    case 'duplicate':
      return null;
    case 'needs_project':
    case 'image_too_large':
    case 'kind_too_large':
    case 'storage_full':
      return { filename: issue.file.name, reason: 'too_large' };
    case 'over_inline_budget':
      return { filename: issue.file.name, reason: 'over_message_budget' };
    default:
      return { filename: issue.file.name, reason: issue.reason };
  }
}

export function useAttachments(options: UseAttachmentsOptions = {}): UseAttachmentsReturn {
  const {
    maxFiles = MAX_FILE_COUNT,
    maxFileSize = MAX_FILE_SIZE_BYTES,
    maxImageSize = MAX_IMAGE_BYTES,
    maxTotalBytes = MAX_MESSAGE_BYTES,
    planFileLimitBytes,
    planLabel,
    onError,
  } = options;
  const publishedLimits = useBillingStore((state) => state.attachmentLimits);
  const offeredInlineMessageBytes =
    publishedLimits?.largeFilesAvailable === true ? publishedLimits.inlineMessageBytes : undefined;
  const offeredStorageRemainingBytes =
    offeredInlineMessageBytes === undefined
      ? undefined
      : (publishedLimits?.storageRemainingBytes ?? null);

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

  const admitFiles = useCallback(
    (incoming: File[]): Promise<File[]> => {
      if (incoming.length === 0) return Promise.resolve([]);

      const offer: LargeFileOffer | null =
        offeredInlineMessageBytes === undefined || offeredStorageRemainingBytes === undefined
          ? null
          : {
              inlineMessageBytes: offeredInlineMessageBytes,
              storageRemainingBytes: offeredStorageRemainingBytes,
            };
      const limits: IntakeLimits = {
        maxFiles,
        maxFileSize,
        maxImageSize,
        maxTotalBytes,
        planFileLimitBytes:
          offer && planFileLimitBytes !== undefined
            ? Math.max(planFileLimitBytes, maxFileSize)
            : planFileLimitBytes,
        planLabel,
        ...(offer
          ? {
              inlineMessageBytes: offer.inlineMessageBytes,
              storageRemainingBytes: offer.storageRemainingBytes,
            }
          : {}),
      };
      const storageLeft = offer?.storageRemainingBytes ?? null;
      const report = (attached: number, issues: readonly IntakeIssue[]) => {
        const notice = intakeNotice(incoming.length, attached, issues, limits);
        if (notice) onError?.(notice);
      };
      const issues: IntakeIssue[] = [];
      const batch: HeldFile[] = [];
      const batchKeys = new Set<string>();
      const availableSlots = maxFiles - heldCountRef.current;
      const heldSizes = [...heldBytesRef.current.values()];
      let messageBytes = heldSizes.reduce((sum, bytes) => sum + bytes, 0);
      let inlineBytes = heldSizes
        .filter((bytes) => bytes <= MAX_FILE_SIZE_BYTES)
        .reduce((sum, bytes) => sum + bytes, 0);

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
          if (
            storageLeft !== null &&
            file.size > storageLeft &&
            storageSetsLimit(maxFileSize, MAX_FILE_SIZE_BYTES, storageLeft)
          ) {
            issues.push({ file, reason: 'storage_full' });
            continue;
          }
          issues.push({
            file,
            reason:
              limits.planFileLimitBytes !== undefined && file.size <= limits.planFileLimitBytes
                ? 'needs_project'
                : 'too_large',
          });
          continue;
        }
        const mimeType = resolveChatAttachmentMimeType(file.name, file.type);
        if (!mimeType || !isSupportedChatAttachment(file.name, mimeType)) {
          issues.push({ file, reason: 'unsupported' });
          continue;
        }
        if (mimeType.startsWith('image/') && file.size > maxImageSize) {
          issues.push({ file, reason: 'image_too_large' });
          continue;
        }
        const inline = file.size <= MAX_FILE_SIZE_BYTES;
        if (offer && !inline) {
          const kindMaxBytes =
            chatLargeFileKindMaxBytes(file.name, mimeType) ?? MAX_FILE_SIZE_BYTES;
          if (file.size > kindMaxBytes) {
            issues.push({ file, reason: 'kind_too_large', limitBytes: kindMaxBytes });
            continue;
          }
        }
        if (offer && inline && inlineBytes + file.size > offer.inlineMessageBytes) {
          issues.push({ file, reason: 'over_inline_budget' });
          continue;
        }
        if (messageBytes + file.size > maxTotalBytes) {
          issues.push({
            file,
            reason:
              storageLeft !== null &&
              messageBytes + file.size > storageLeft &&
              storageSetsLimit(maxTotalBytes, MAX_MESSAGE_BYTES, storageLeft)
                ? 'storage_full'
                : 'over_message_budget',
          });
          continue;
        }
        messageBytes += file.size;
        if (inline) inlineBytes += file.size;
        batchKeys.add(key);
        batch.push({ file, key });
      }

      const refusals = issues.map(refusalOf).filter((entry) => entry !== null);
      if (refusals.length > 0) setRefused((prev) => [...prev, ...refusals]);
      if (batch.length === 0) {
        report(0, issues);
        return Promise.resolve([]);
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
        return Promise.resolve(batch.map(({ file }) => file));
      }

      const settle = (accepted: readonly HeldFile[], unreadable: readonly HeldFile[]): File[] => {
        if (generation !== draftGenerationRef.current) return [];
        admit(accepted, unreadable);
        report(accepted.length, [
          ...issues,
          ...unreadable.map((entry): IntakeIssue => ({
            file: entry.file,
            reason: PICTURE_METADATA_REFUSAL,
          })),
        ]);
        return batch
          .filter((entry) => accepted.some((held) => held.key === entry.key))
          .map(({ file }) => file);
      };

      pendingBatchesRef.current += 1;
      setPreparing(true);
      const taken = admissionRef.current
        .then(() =>
          generation === draftGenerationRef.current
            ? Promise.all(batch.map(({ file }) => prepareChatAttachment(file)))
            : [],
        )
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
            return settle(accepted, unreadable);
          },
          () => settle([], batch),
        );
      admissionRef.current = taken.then(() => {
        if (generation !== draftGenerationRef.current) return;
        pendingBatchesRef.current -= 1;
        if (pendingBatchesRef.current === 0) setPreparing(false);
      });
      return taken;
    },
    [
      admit,
      maxFiles,
      maxFileSize,
      maxImageSize,
      maxTotalBytes,
      planFileLimitBytes,
      planLabel,
      offeredInlineMessageBytes,
      offeredStorageRemainingBytes,
      onError,
    ],
  );

  const addFiles = useCallback(
    (incoming: File[]) => {
      void admitFiles(incoming);
    },
    [admitFiles],
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
    admissionRef.current = Promise.resolve();
    pendingBatchesRef.current = 0;
    setPreparing(false);
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
    admitFiles,
    removeFile,
    clearAll,
  };
}
