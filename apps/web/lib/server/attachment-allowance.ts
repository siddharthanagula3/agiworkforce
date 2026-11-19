import 'server-only';

import {
  CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE,
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  CHAT_LARGE_FILE_POLICY,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  chatAttachmentMaxBytes,
  chatLargeFileKindMaxBytes,
  type ChatAttachmentLimits,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getBillingPlanPricing,
  getNextUpgradeTier,
  getPlanDailyAttachmentUploads,
  getPlanMaxAttachmentBytes,
  getPlanMaxAttachmentsPerMessage,
  getPlanMaxChatFileBytes,
} from '@agiworkforce/types';

import { AppError, ErrorCode, createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { UPLOAD_STORAGE_FULL_MESSAGE } from '@/lib/security/upload-scan';
import {
  assertLargeFileIntakeSlot,
  chargeDailyLargeFileBytes,
} from '@/lib/server/chat-file-intake/quotas';
import {
  readChatLargeFileReadiness,
  type ChatLargeFileReadinessDeps,
  type ChatLargeFileReadinessGap,
} from '@/lib/server/chat-file-intake/readiness';
import { countInFlightIntakes, sumInFlightIntakeBytes } from '@/lib/server/chat-file-intake/store';
import { sumFileStorageBytes } from '@/lib/server/file-storage';
import { getKeyValueStore } from '@/lib/server/key-value';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { getFileStorageLimitBytes } from '@/lib/services/free-plan-entitlements';
import { UPGRADE_HREF } from '@/lib/services/managed-usage-request-service';

export type AttachmentUploadKind = 'chat-attachment' | 'knowledge-file';

export const ATTACHMENT_TOO_LARGE_CODE = 'attachment_over_plan_limit';
export const CHAT_ATTACHMENT_NEEDS_PROJECT_CODE = 'chat_attachment_needs_project';
export const CHAT_IMAGE_TOO_LARGE_CODE = 'chat_image_over_limit';
export const DAILY_UPLOAD_LIMIT_CODE = 'daily_upload_limit_reached';
export const CHAT_LARGE_FILES_UNAVAILABLE_CODE = 'chat_large_files_unavailable';
export const CHAT_LARGE_FILES_UNAVAILABLE_MESSAGE = 'Files this large aren’t available yet.';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const SECONDS_PER_DAY = 24 * 60 * 60;
const UPLOAD_COUNTER_PREFIX = 'agi:uploads:daily:';

function sizeLabel(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MEGABYTE)} MB`;
}

function upgradeRecovery(planTier: string) {
  return getNextUpgradeTier(planTier) === null
    ? {}
    : { recovery: { action: 'upgrade' as const, href: UPGRADE_HREF } };
}

function chatLimitBytes(mimeType: string | undefined): number {
  return mimeType === undefined
    ? MAX_CHAT_IMAGE_ATTACHMENT_BYTES
    : chatAttachmentMaxBytes(mimeType);
}

/**
 * The largest file this plan may send on this path. A chat attachment is sent
 * to the model inline, so it also stays under what a provider request carries,
 * and an image under the lower image ceiling. A chat file whose type is not
 * given is held to the image ceiling, the stricter of the two.
 */
export function attachmentLimitBytes(
  planTier: string | null | undefined,
  kind: AttachmentUploadKind,
  mimeType?: string,
): number {
  const planLimit = getPlanMaxAttachmentBytes(planTier);
  return kind === 'chat-attachment' ? Math.min(planLimit, chatLimitBytes(mimeType)) : planLimit;
}

/** The chat limits this plan is held to, as the sign-in handshake hands them to a client. */
export function chatAttachmentLimitsForPlan(
  planTier: string | null | undefined,
): ChatAttachmentLimits {
  return {
    maxFileBytes: attachmentLimitBytes(planTier, 'chat-attachment', 'application/octet-stream'),
    maxImageBytes: attachmentLimitBytes(planTier, 'chat-attachment', 'image/png'),
    maxMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
    maxFilesPerMessage: Math.min(
      MAX_CHAT_ATTACHMENT_COUNT,
      getPlanMaxAttachmentsPerMessage(planTier),
    ),
  };
}

export function attachmentSizeRefusal(
  planTier: string,
  kind: AttachmentUploadKind,
  byteCount: number,
  mimeType?: string,
): AppError | null {
  if (byteCount <= attachmentLimitBytes(planTier, kind, mimeType)) return null;
  const planLimit = getPlanMaxAttachmentBytes(planTier);
  if (
    kind === 'chat-attachment' &&
    chatLimitBytes(mimeType) === MAX_CHAT_IMAGE_ATTACHMENT_BYTES &&
    MAX_CHAT_IMAGE_ATTACHMENT_BYTES < planLimit
  ) {
    return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE, 413, {
      code: CHAT_IMAGE_TOO_LARGE_CODE,
    }).asUserSafe();
  }
  if (kind === 'chat-attachment' && byteCount <= planLimit) {
    return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE, 413, {
      code: CHAT_ATTACHMENT_NEEDS_PROJECT_CODE,
    }).asUserSafe();
  }
  const label = getBillingPlanPricing(planTier).label;
  const nextTier = getNextUpgradeTier(planTier);
  const upgrade =
    nextTier !== null && getPlanMaxAttachmentBytes(nextTier) > planLimit
      ? upgradeRecovery(planTier)
      : {};
  return new AppError(
    ErrorCode.PAYLOAD_TOO_LARGE,
    `${label} accounts can upload files up to ${sizeLabel(planLimit)} each.${
      upgrade.recovery ? ' Upgrade for larger files.' : ''
    }`,
    413,
    { code: ATTACHMENT_TOO_LARGE_CODE, ...upgrade },
  ).asUserSafe();
}

/**
 * Refuses a file larger than the plan allows on this path. Used where the
 * upload's bytes arrive, after its admission was already counted.
 */
export async function assertAttachmentSizeAllowed(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId?: string | null;
  kind: AttachmentUploadKind;
  byteCount: number;
  mimeType?: string;
}): Promise<string> {
  const planTier = await resolveEntitledPlanTier(input.db, input.userId, {
    workspaceOrganizationId: input.organizationId ?? null,
  });
  const refusal = attachmentSizeRefusal(planTier, input.kind, input.byteCount, input.mimeType);
  if (refusal) throw refusal;
  return planTier;
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Admits a new upload: its size against the plan, and on a plan that counts
 * uploads a day, one more upload. A count that cannot be kept refuses the
 * upload rather than letting it through uncounted.
 */
export async function admitAttachmentUpload(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId?: string | null;
  kind: AttachmentUploadKind;
  byteCount: number;
  mimeType?: string;
  now?: Date;
}): Promise<void> {
  const planTier = await assertAttachmentSizeAllowed(input);
  const dailyLimit = getPlanDailyAttachmentUploads(planTier);
  if (dailyLimit === null) return;
  const label = getBillingPlanPricing(planTier).label;
  const refuse = () =>
    new AppError(
      ErrorCode.RATE_LIMIT_EXCEEDED,
      `${label} accounts can upload ${dailyLimit} ${dailyLimit === 1 ? 'file' : 'files'} a day, and today’s are used. Upload more after midnight UTC, or upgrade for more.`,
      429,
      { code: DAILY_UPLOAD_LIMIT_CODE, ...upgradeRecovery(planTier) },
    ).asUserSafe();
  if (dailyLimit <= 0) throw refuse();
  const store = getKeyValueStore();
  if (!store) throw refuse();
  const key = `${UPLOAD_COUNTER_PREFIX}${input.userId}:${utcDay(input.now ?? new Date())}`;
  let count: number;
  try {
    count = await store.increment(key, 1);
  } catch (error) {
    logger.error({ error, userId: input.userId }, '[uploads] the daily upload count failed');
    throw refuse();
  }
  try {
    await store.expire(key, 2 * SECONDS_PER_DAY);
  } catch (error) {
    logger.error({ error, userId: input.userId }, '[uploads] the daily upload count failed');
    await store.increment(key, -1).catch(() => undefined);
    throw refuse();
  }
  if (count > dailyLimit) {
    await store.increment(key, -1).catch(() => undefined);
    throw refuse();
  }
}

export const CHAT_ATTACHMENT_UNSUPPORTED_MESSAGE =
  'Chat supports images, PDFs, Word, Excel, PowerPoint, and text or code files.';
export const CHAT_LARGE_FILE_STORAGE_FULL_CODE = 'storage_full';

interface LargeFileScope {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string;
  request: Request;
  readinessDeps?: ChatLargeFileReadinessDeps;
}

type LargeFileAllowance =
  | { ready: false; missing: ChatLargeFileReadinessGap }
  | { ready: true; maxFileBytes: number; storageLimitBytes: number | null };

/**
 * Whether this caller may start a chat file over the inline limit, and the
 * largest one the policy, the plan and the scanner allow together, before
 * storage is counted.
 */
async function resolveChatLargeFileAllowance(scope: LargeFileScope): Promise<LargeFileAllowance> {
  const readiness = await readChatLargeFileReadiness(
    { request: scope.request, db: scope.db, planTier: scope.planTier },
    scope.readinessDeps,
  );
  if (!readiness.ready) return readiness;
  return {
    ready: true,
    maxFileBytes: Math.min(
      CHAT_LARGE_FILE_POLICY.largeFiles.maxBytes,
      getPlanMaxChatFileBytes(scope.planTier),
      readiness.maxSourceScanBytes,
    ),
    storageLimitBytes: getFileStorageLimitBytes(scope.planTier),
  };
}

/** Storage used, counting the declared bytes of every large file still in flight. */
async function storageCommittedBytes(
  scope: Pick<LargeFileScope, 'db' | 'userId' | 'organizationId'>,
): Promise<number> {
  const [stored, inFlight] = await Promise.all([
    sumFileStorageBytes(scope),
    sumInFlightIntakeBytes(scope.db, {
      userId: scope.userId,
      organizationId: scope.organizationId,
    }),
  ]);
  return stored + inFlight;
}

/**
 * The chat limits the sign-in handshake hands this caller. Large files are
 * offered only when readiness holds; remaining storage then lowers the large
 * part of each limit, never below today's, so a file within the inline limit
 * behaves exactly as before. Anything that cannot be read answers today's
 * limits.
 */
export async function resolveChatAttachmentLimits(
  scope: LargeFileScope,
): Promise<ChatAttachmentLimits> {
  const today = chatAttachmentLimitsForPlan(scope.planTier);
  try {
    const allowance = await resolveChatLargeFileAllowance(scope);
    if (!allowance.ready) return today;
    const remaining =
      allowance.storageLimitBytes === null
        ? null
        : Math.max(0, allowance.storageLimitBytes - (await storageCommittedBytes(scope)));
    const withinStorage = (bytes: number) =>
      remaining === null ? bytes : Math.min(bytes, remaining);
    return {
      maxFileBytes: Math.max(today.maxFileBytes, withinStorage(allowance.maxFileBytes)),
      maxImageBytes: today.maxImageBytes,
      maxMessageBytes: Math.max(
        today.maxMessageBytes,
        withinStorage(CHAT_LARGE_FILE_POLICY.largeFiles.maxMessageBytes),
      ),
      maxFilesPerMessage: Math.max(
        today.maxFilesPerMessage,
        Math.min(
          CHAT_LARGE_FILE_POLICY.largeFiles.maxCount,
          getPlanMaxAttachmentsPerMessage(scope.planTier),
        ),
      ),
      largeFilesAvailable: true,
      storageRemainingBytes: remaining,
      inlineMessageBytes: today.maxMessageBytes,
    };
  } catch (error) {
    logger.warn(
      { error, userId: scope.userId },
      '[chat-files] large file limits could not be resolved; the inline limits are offered',
    );
    return today;
  }
}

function largeFilesUnavailable(): AppError {
  return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, CHAT_LARGE_FILES_UNAVAILABLE_MESSAGE, 413, {
    code: CHAT_LARGE_FILES_UNAVAILABLE_CODE,
  }).asUserSafe();
}

function largeFileTooLarge(planTier: string, ceilingBytes: number): AppError {
  return new AppError(
    ErrorCode.PAYLOAD_TOO_LARGE,
    `Chat files like this can be up to ${sizeLabel(ceilingBytes)} each.`,
    413,
    { code: ATTACHMENT_TOO_LARGE_CODE, ...upgradeRecovery(planTier) },
  ).asUserSafe();
}

function largeFileStorageFull(planTier: string): AppError {
  return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, UPLOAD_STORAGE_FULL_MESSAGE, 413, {
    code: CHAT_LARGE_FILE_STORAGE_FULL_CODE,
    ...upgradeRecovery(planTier),
  }).asUserSafe();
}

export interface AdmittedChatLargeFile {
  planTier: string;
  dailyBytesCharged: number;
  chargedAtMs: number;
  storageLimitBytes: number | null;
}

/**
 * Admits a `chat-large-file` create before any byte is sent: readiness, the
 * kind's ceiling, the plan and the scanner, storage net of the files still in
 * flight, the in-flight slot, and last the daily
 * large file bytes, the one check that charges. A plan value of zero for
 * either counter refuses.
 */
export async function admitChatLargeFileUpload(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  request: Request;
  fileName: string;
  mimeType: string;
  byteCount: number;
  nowMs?: number;
  readinessDeps?: ChatLargeFileReadinessDeps;
}): Promise<AdmittedChatLargeFile> {
  const planTier = await resolveEntitledPlanTier(input.db, input.userId, {
    workspaceOrganizationId: input.organizationId,
  });
  const scope: LargeFileScope = { ...input, planTier };
  const allowance = await resolveChatLargeFileAllowance(scope);
  if (!allowance.ready) {
    if (allowance.missing === 'plan') {
      throw (
        attachmentSizeRefusal(planTier, 'chat-attachment', input.byteCount, input.mimeType) ??
        largeFilesUnavailable()
      );
    }
    throw largeFilesUnavailable();
  }
  const kindMaxBytes = chatLargeFileKindMaxBytes(input.fileName, input.mimeType);
  if (kindMaxBytes === null) throw createError.validation(CHAT_ATTACHMENT_UNSUPPORTED_MESSAGE);
  const ceilingBytes = Math.min(kindMaxBytes, allowance.maxFileBytes);
  if (input.byteCount > ceilingBytes) throw largeFileTooLarge(planTier, ceilingBytes);

  if (allowance.storageLimitBytes !== null) {
    const committed = await storageCommittedBytes(scope);
    if (committed + input.byteCount > allowance.storageLimitBytes) {
      throw largeFileStorageFull(planTier);
    }
  }

  assertLargeFileIntakeSlot({
    planTier,
    inFlight: await countInFlightIntakes(input.db, { userId: input.userId }),
  });

  const chargedAtMs = input.nowMs ?? Date.now();
  const dailyBytesCharged = await chargeDailyLargeFileBytes({
    userId: input.userId,
    planTier,
    byteCount: input.byteCount,
    nowMs: chargedAtMs,
  });
  return {
    planTier,
    dailyBytesCharged,
    chargedAtMs,
    storageLimitBytes: allowance.storageLimitBytes,
  };
}

/**
 * Admission reads the counts before the intake row exists, so creates that
 * overlap can each pass them. The caller runs this inside the transaction that
 * wrote the row, under that person's create lock, so every create that ran
 * before it is visible and the row itself is the last one counted: the slot and
 * the storage are judged with the row included, and a create past the cap is
 * refused with the same answer as admission gives.
 */
export async function confirmChatLargeFileAdmission(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  admitted: AdmittedChatLargeFile;
}): Promise<void> {
  const { planTier, storageLimitBytes } = input.admitted;
  const inFlight = await countInFlightIntakes(input.db, { userId: input.userId });
  if (inFlight < 1) throw largeFilesUnavailable();
  assertLargeFileIntakeSlot({ planTier, inFlight: inFlight - 1 });
  if (storageLimitBytes === null) return;
  const committed = await storageCommittedBytes(input);
  if (committed > storageLimitBytes) throw largeFileStorageFull(planTier);
}
