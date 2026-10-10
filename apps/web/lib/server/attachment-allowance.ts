import 'server-only';

import {
  CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  getBillingPlanPricing,
  getNextUpgradeTier,
  getPlanDailyAttachmentUploads,
  getPlanMaxAttachmentBytes,
} from '@agiworkforce/types';

import { AppError, ErrorCode } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getKeyValueStore } from '@/lib/server/key-value';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import { UPGRADE_HREF } from '@/lib/services/managed-usage-request-service';

export type AttachmentUploadKind = 'chat-attachment' | 'knowledge-file';

export const ATTACHMENT_TOO_LARGE_CODE = 'attachment_over_plan_limit';
export const CHAT_ATTACHMENT_NEEDS_PROJECT_CODE = 'chat_attachment_needs_project';
export const DAILY_UPLOAD_LIMIT_CODE = 'daily_upload_limit_reached';

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

/**
 * The largest file this plan may send on this path. A chat attachment is sent
 * to the model inline, so it also stays under what a provider request carries.
 */
export function attachmentLimitBytes(
  planTier: string | null | undefined,
  kind: AttachmentUploadKind,
): number {
  const planLimit = getPlanMaxAttachmentBytes(planTier);
  return kind === 'chat-attachment' ? Math.min(planLimit, MAX_CHAT_ATTACHMENT_BYTES) : planLimit;
}

export function attachmentSizeRefusal(
  planTier: string,
  kind: AttachmentUploadKind,
  byteCount: number,
): AppError | null {
  if (byteCount <= attachmentLimitBytes(planTier, kind)) return null;
  const planLimit = getPlanMaxAttachmentBytes(planTier);
  if (kind === 'chat-attachment' && byteCount <= planLimit) {
    return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE, 413, {
      code: CHAT_ATTACHMENT_NEEDS_PROJECT_CODE,
    }).asUserSafe();
  }
  const label = getBillingPlanPricing(planTier).label;
  const upgrade = upgradeRecovery(planTier);
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
}): Promise<string> {
  const planTier = await resolveEntitledPlanTier(input.db, input.userId, {
    workspaceOrganizationId: input.organizationId ?? null,
  });
  const refusal = attachmentSizeRefusal(planTier, input.kind, input.byteCount);
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
    await store.expire(key, 2 * SECONDS_PER_DAY);
  } catch (error) {
    logger.error({ error, userId: input.userId }, '[uploads] the daily upload count failed');
    throw refuse();
  }
  if (count > dailyLimit) {
    await store.increment(key, -1).catch(() => undefined);
    throw refuse();
  }
}
