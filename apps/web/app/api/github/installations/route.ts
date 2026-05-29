import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import type { GitHubInstallationRow } from '@/lib/server/neon-types';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { withRateLimit } from '@/lib/rate-limit';
import { getClerkAuthUser } from '@/lib/api-auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

  let installations: GitHubInstallationRow[];
  try {
    installations = await db.query<GitHubInstallationRow>(
      `select id, installation_id, account_login, account_type, pr_review_enabled, review_model, created_at
       from github_installations
       where user_id = $1
       order by created_at desc`,
      [userId],
    );
  } catch (err) {
    logger.error({ err, userId }, 'Failed to fetch GitHub installations');
    return NextResponse.json({ error: 'Failed to fetch installations' }, { status: 500 });
  }

  return NextResponse.json({ installations });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  // AUDIT-008-006: Enforce CSRF protection for DELETE endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();

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
