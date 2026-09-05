import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getUserScopedDb } from '@/lib/server/rls-db';
import type { GitHubInstallationRow } from '@/lib/server/neon-types';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { unauthorizedResponseFor } from '@/lib/api-auth-response';
import { isMfaRequiredError } from '@/lib/mfa-policy-gate';
import { isIpNotAllowedError } from '@/lib/ip-allow-list-gate';
import { isGitHubInstallationLinkingAvailable } from '@/lib/github-app';

const GITHUB_SCOPE = { resolveOrganization: false } as const;

type ScopedDb = Awaited<ReturnType<typeof getUserScopedDb>>['db'];

const PG_UNDEFINED_TABLE = '42P01';
const PG_UNDEFINED_COLUMN = '42703';

function isUndefinedTable(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    ((error as Record<string, unknown>)['code'] === PG_UNDEFINED_TABLE ||
      /relation\s+.+\s+does not exist/i.test(
        String((error as Record<string, unknown>)['message'] ?? ''),
      ))
  );
}

function isGithubOwnershipSchemaUnavailable(error: unknown): boolean {
  if (isUndefinedTable(error)) return true;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Record<string, unknown>;
  return (
    candidate['code'] === PG_UNDEFINED_COLUMN &&
    String(candidate['message'] ?? '').includes('ownership_verified_at')
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  let db: ScopedDb;
  try {
    ({ db, userId } = await getUserScopedDb(request, GITHUB_SCOPE));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGitHubInstallationLinkingAvailable()) {
    return NextResponse.json({ installations: [] });
  }

  let installations: GitHubInstallationRow[];
  try {
    installations = await db.query<GitHubInstallationRow>(
      `select id, installation_id, account_login, account_type, pr_review_enabled, review_model, created_at
       from github_installations
       where user_id = $1
         and ownership_verified_at is not null
       order by created_at desc`,
      [userId],
    );
  } catch (err) {
    if (isGithubOwnershipSchemaUnavailable(err)) {
      logger.warn(
        { userId },
        'GitHub installation ownership schema is unavailable; returning no installations',
      );
      return NextResponse.json({ installations: [] });
    }
    logger.error({ err, userId }, 'Failed to fetch GitHub installations');
    return NextResponse.json({ error: 'Failed to fetch installations' }, { status: 500 });
  }

  // installation_id is `bigint` (db/neon/0017_github.sql:4) and no int8 type
  // parser is registered, so the driver hands it back as a string even though
  // GitHubInstallationRow types it as a number. The settings panel validates this
  // body with z.number(), so an un-coerced row failed safeParse and the panel
  // showed "installations could not be loaded" and rendered GitHub as not
  // connected - for a user who was connected, and retrying never helped.
  // Every other bigint column in this codebase is already coerced the same way,
  // including this very column in lib/user-connector-tools.ts.
  return NextResponse.json({
    installations: installations.map((row) => ({
      ...row,
      installation_id: Number(row.installation_id),
    })),
  });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  let userId: string;
  let db: ScopedDb;
  try {
    ({ db, userId } = await getUserScopedDb(request, GITHUB_SCOPE));
  } catch (authError) {
    if (isMfaRequiredError(authError) || isIpNotAllowedError(authError)) {
      return unauthorizedResponseFor(authError);
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let installationId: number;
  try {
    const body = (await request.json()) as { installationId?: unknown };
    if (typeof body.installationId !== 'number') {
      return NextResponse.json({ error: 'installationId must be a number' }, { status: 400 });
    }
    installationId = body.installationId;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  try {
    await db.execute(
      'delete from github_installations where installation_id = $1 and user_id = $2',
      [installationId, userId],
    );
  } catch (err) {
    logger.error({ err, userId, installationId }, 'Failed to delete GitHub installation');
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
