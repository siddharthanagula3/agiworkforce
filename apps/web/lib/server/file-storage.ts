import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { BillingPlanTier } from '@agiworkforce/types';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { resolveEntitledPlanTier } from '@/lib/services/entitlement-resolution';
import {
  getFileStorageLimitBytes,
  getFileStorageLimitErrorMessage,
} from '@/lib/services/free-plan-entitlements';

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

export interface FileStorageScope {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
}

export interface FileStorageAllowance {
  planTier: BillingPlanTier;
  limitBytes: number | null;
}

export interface FileStorageMeter {
  usedBytes: number | null;
  limitBytes: number | null;
}

function isSchemaNotReady(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as Record<string, unknown>)['code'];
  return code === PG_UNDEFINED_TABLE || code === PG_UNDEFINED_COLUMN;
}

export async function sumFileStorageBytes(scope: FileStorageScope): Promise<number> {
  const [row] = await scope.db.query<{ total: string | number | null }>(
    `select
       (select coalesce(sum(m.byte_size), 0)
          from public.media_assets m
         where m.user_id = $1
           and m.organization_id is not distinct from $2::uuid
           and not m.temporary_chat
           and m.deleted_at is null)
     + (select coalesce(sum(k.byte_count), 0)
          from public.project_knowledge_files k
          join public.user_projects p on p.id = k.project_id
           and p.deleted_at is null
         where p.user_id = $1
           and p.organization_id is not distinct from $2::uuid
           and k.deleted_at is null
           and k.superseded_at is null) as total`,
    [scope.userId, scope.organizationId],
  );
  return Number(row?.total ?? 0);
}

export async function resolveFileStorageAllowance(
  scope: FileStorageScope,
): Promise<FileStorageAllowance> {
  const planTier = await resolveEntitledPlanTier(scope.db, scope.userId, {
    workspaceOrganizationId: scope.organizationId,
  });
  return { planTier, limitBytes: getFileStorageLimitBytes(planTier) };
}

export async function assertFileStorageAvailable(
  scope: FileStorageScope,
  incomingBytes: number,
  allowance?: FileStorageAllowance,
): Promise<void> {
  const { planTier, limitBytes } = allowance ?? (await resolveFileStorageAllowance(scope));
  if (limitBytes === null) return;
  let usedBytes: number;
  try {
    usedBytes = await sumFileStorageBytes(scope);
  } catch (error) {
    if (!isSchemaNotReady(error)) throw error;
    usedBytes = 0;
  }
  if (usedBytes + incomingBytes > limitBytes) {
    throw createError.validation(getFileStorageLimitErrorMessage(planTier, limitBytes));
  }
}

export async function readFileStorageMeter(scope: FileStorageScope): Promise<FileStorageMeter> {
  let limitBytes: number | null = null;
  try {
    limitBytes = (await resolveFileStorageAllowance(scope)).limitBytes;
  } catch (error) {
    logger.warn({ error, userId: scope.userId }, 'File storage meter: plan read failed');
  }
  let usedBytes: number | null = null;
  try {
    usedBytes = await sumFileStorageBytes(scope);
  } catch (error) {
    if (!isSchemaNotReady(error)) {
      logger.warn({ error, userId: scope.userId }, 'File storage meter: usage read failed');
    }
  }
  return { usedBytes, limitBytes };
}
