import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const COGS_IMPORT_SOURCE = 'stripe';
export const COGS_IMPORT_OVERLAP_MS = 3 * MS_PER_DAY;
export const COGS_IMPORT_MAX_SPAN_MS = 7 * MS_PER_DAY;
export const COGS_IMPORT_LEASE_MS = 10 * 60 * 1000;
const LAST_ERROR_MAX_CHARS = 1000;

export interface CogsImportWindow {
  since: Date;
  until: Date;
}

export interface CogsImportClaim {
  token: string;
  coveredUntil: Date;
  window: CogsImportWindow;
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export function planCogsImportWindow(coveredUntil: Date, now: Date): CogsImportWindow {
  const overlapStartMs = now.getTime() - COGS_IMPORT_OVERLAP_MS;
  const coveredMs = coveredUntil.getTime();
  const sinceMs = Number.isFinite(coveredMs) ? Math.min(coveredMs, overlapStartMs) : overlapStartMs;
  const untilMs = Math.min(now.getTime(), sinceMs + COGS_IMPORT_MAX_SPAN_MS);
  return { since: new Date(sinceMs), until: new Date(untilMs) };
}

export function cogsImportCoverageBehind(coveredUntil: Date, now: Date): boolean {
  return coveredUntil.getTime() < now.getTime();
}

export async function claimCogsImportCoverage(
  db: DatabaseAdapter,
  now: Date,
): Promise<CogsImportClaim | null> {
  const nowIso = now.toISOString();
  await db.execute(
    `insert into public.stripe_cogs_import_coverage (source, covered_until)
     values ($1, $2::timestamptz)
     on conflict (source) do nothing`,
    [COGS_IMPORT_SOURCE, new Date(now.getTime() - COGS_IMPORT_OVERLAP_MS).toISOString()],
  );

  const token = randomUUID();
  const [row] = await db.query<{ covered_until: string | Date }>(
    `update public.stripe_cogs_import_coverage
        set lease_token = $2::uuid,
            lease_expires_at = $3::timestamptz,
            last_attempt_at = $4::timestamptz
      where source = $1
        and (lease_expires_at is null or lease_expires_at <= $4::timestamptz)
      returning covered_until`,
    [
      COGS_IMPORT_SOURCE,
      token,
      new Date(now.getTime() + COGS_IMPORT_LEASE_MS).toISOString(),
      nowIso,
    ],
  );
  if (!row) return null;

  const coveredUntil = toDate(row.covered_until);
  return { token, coveredUntil, window: planCogsImportWindow(coveredUntil, now) };
}

export async function completeCogsImportCoverage(
  db: DatabaseAdapter,
  claim: CogsImportClaim,
  now: Date,
): Promise<boolean> {
  const updated = await db.execute(
    `update public.stripe_cogs_import_coverage
        set covered_until = $3::timestamptz,
            last_success_at = $4::timestamptz,
            last_error = null,
            lease_token = null,
            lease_expires_at = null
      where source = $1
        and lease_token = $2::uuid`,
    [COGS_IMPORT_SOURCE, claim.token, claim.window.until.toISOString(), now.toISOString()],
  );
  return updated > 0;
}

export async function releaseCogsImportCoverage(
  db: DatabaseAdapter,
  claim: CogsImportClaim,
  error: string | null,
): Promise<void> {
  await db.execute(
    `update public.stripe_cogs_import_coverage
        set last_error = coalesce($3::text, last_error),
            lease_token = null,
            lease_expires_at = null
      where source = $1
        and lease_token = $2::uuid`,
    [COGS_IMPORT_SOURCE, claim.token, error === null ? null : error.slice(0, LAST_ERROR_MAX_CHARS)],
  );
}
