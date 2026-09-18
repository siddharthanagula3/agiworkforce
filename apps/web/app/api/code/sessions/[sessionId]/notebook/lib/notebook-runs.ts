import 'server-only';

import { createHash } from 'node:crypto';
import { CLOUD_CODE_NETWORK_ACCESS, type CloudCodeNetworkAccess } from '@agiworkforce/types';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';

const PG_UNDEFINED_TABLE = '42P01';

/** Weakest first: a run may demand at most what the session was created with. */
const NETWORK_ACCESS_RANK: Readonly<Record<CloudCodeNetworkAccess, number>> = {
  none: 0,
  trusted: 1,
  full: 2,
};

export interface NotebookRunRecord {
  userId: string;
  organizationId: string | null;
  sessionId: string;
  runId: string;
  cellId: string;
  cellIndex: number;
  language: string;
  code: string;
  networkAccess: CloudCodeNetworkAccess;
  fromTop: boolean;
  ok: boolean;
  error?: string | undefined;
  startedAt: string;
}

export function isCloudCodeNetworkAccess(value: unknown): value is CloudCodeNetworkAccess {
  return (
    typeof value === 'string' && (CLOUD_CODE_NETWORK_ACCESS as readonly string[]).includes(value)
  );
}

/**
 * The network policy a run is willing to execute under. The session's sandbox
 * is already provisioned, so a run cannot tighten it; it can only refuse to run
 * in a sandbox looser than it asked for, which is a real gate rather than a
 * setting that quietly does nothing.
 */
export function requireNotebookNetworkPolicy(
  sessionAccess: CloudCodeNetworkAccess,
  requested: unknown,
): CloudCodeNetworkAccess {
  if (requested === undefined || requested === null) return sessionAccess;
  if (!isCloudCodeNetworkAccess(requested)) {
    throw createError.validation(
      `requireNetworkAccess must be one of ${CLOUD_CODE_NETWORK_ACCESS.join(', ')}`,
    );
  }
  if (NETWORK_ACCESS_RANK[sessionAccess] > NETWORK_ACCESS_RANK[requested]) {
    throw createError.conflict(
      `This session runs with ${sessionAccess} network access, which is wider than the ${requested} this run asked for. Create a session with ${requested} network access to run it.`,
    );
  }
  return sessionAccess;
}

export function notebookCodeDigest(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Best effort: a result that was produced is not thrown away because its
 * provenance row could not be written, but the failure is loud in the logs.
 */
export async function recordNotebookRun(
  db: Pick<DatabaseAdapter, 'query'>,
  record: NotebookRunRecord,
): Promise<void> {
  try {
    await db.query(
      `insert into public.notebook_runs
         (user_id, organization_id, session_id, run_id, cell_id, cell_index, language,
          code, code_sha256, network_access, from_top, ok, error, started_at)
       values ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz)`,
      [
        record.userId,
        record.organizationId,
        record.sessionId,
        record.runId,
        record.cellId,
        record.cellIndex,
        record.language,
        record.code,
        notebookCodeDigest(record.code),
        record.networkAccess,
        record.fromTop,
        record.ok,
        record.error ?? null,
        record.startedAt,
      ],
    );
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === PG_UNDEFINED_TABLE) return;
    logger.error(
      { error, sessionId: record.sessionId, runId: record.runId },
      'Notebook run provenance could not be recorded',
    );
  }
}
