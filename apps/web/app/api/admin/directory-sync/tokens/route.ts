import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import { readJsonBody } from '@/lib/read-json-body';
import type { DirectorySyncConnectionRow } from '@/lib/server/neon-types';
import { createScimToken, listScimTokens } from '@/lib/server/scim/scim-token-service';
import { isDirectorySyncAccessFailure, requireDirectorySyncAdmin } from '../directory-sync-access';

// Argon2id is a native module.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * GET /api/admin/directory-sync/tokens
 *
 * Lists the SCIM credentials for the caller's organization. The raw token is
 * never returned here — it only ever exists in the response to the POST that
 * minted it. The Argon2id hash is not selected at all.
 */
export async function GET(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'scim-token-manage');
  if (rateLimited) return rateLimited;

  try {
    const access = await requireDirectorySyncAdmin(
      request,
      new URL(request.url).searchParams.get('organizationId'),
    );
    if (isDirectorySyncAccessFailure(access)) return access.response;

    const tokens = await listScimTokens(getNeonDb(), access.organizationId);

    return NextResponse.json({
      tokens: tokens.map((token) => ({
        id: token.id,
        connection_id: token.connection_id,
        name: token.name,
        // The prefix is the public half of the credential: it identifies which
        // token an IdP is presenting without revealing the secret.
        token_prefix: token.token_prefix,
        created_by_user_id: token.created_by_user_id,
        last_used_at: token.last_used_at,
        expires_at: token.expires_at,
        revoked_at: token.revoked_at,
        created_at: token.created_at,
      })),
      organization_id: access.organizationId,
    });
  } catch (error) {
    logger.error({ error }, 'Error listing SCIM tokens');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/directory-sync/tokens
 *
 * Mints a SCIM bearer token for one directory sync connection. The raw token
 * is returned EXACTLY ONCE and is not recoverable afterwards — only its
 * Argon2id hash is stored.
 *
 * The issuing admin is recorded on the row and becomes the entitlement subject
 * for every request that token later makes (see scim-auth.ts).
 */
export async function POST(request: NextRequest) {
  const rateLimited = await withRateLimit(request, 'scim-token-mint');
  if (rateLimited) return rateLimited;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request);
    const connectionId = body['connectionId'];
    const name = body['name'];
    const organizationId = body['organizationId'];
    const expiresAt = body['expiresAt'];

    if (organizationId !== undefined && typeof organizationId !== 'string') {
      return NextResponse.json({ error: 'organizationId must be a string' }, { status: 400 });
    }

    const access = await requireDirectorySyncAdmin(request, (organizationId as string) ?? null);
    if (isDirectorySyncAccessFailure(access)) return access.response;

    if (typeof connectionId !== 'string' || !UUID_PATTERN.test(connectionId)) {
      return NextResponse.json({ error: 'connectionId must be a UUID' }, { status: 400 });
    }

    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 120) {
      return NextResponse.json(
        { error: 'name is required and must be 1-120 characters' },
        { status: 400 },
      );
    }

    let expiresAtIso: string | null = null;
    if (expiresAt !== undefined && expiresAt !== null) {
      if (typeof expiresAt !== 'string') {
        return NextResponse.json({ error: 'expiresAt must be an ISO timestamp' }, { status: 400 });
      }
      const parsed = new Date(expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'expiresAt must be an ISO timestamp' }, { status: 400 });
      }
      if (parsed.getTime() <= Date.now()) {
        return NextResponse.json({ error: 'expiresAt must be in the future' }, { status: 400 });
      }
      expiresAtIso = parsed.toISOString();
    }

    const db = getNeonDb();

    // The connection must belong to the caller's organization. Naming another
    // tenant's connection id must not mint a credential against it.
    const connections = await db.query<Pick<DirectorySyncConnectionRow, 'id'>>(
      'select id from directory_sync_connections where id = $1 and organization_id = $2 limit 1',
      [connectionId, access.organizationId],
    );
    if (connections.length === 0) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const { token, rawToken } = await createScimToken(db, {
      connectionId,
      organizationId: access.organizationId,
      name: name.trim(),
      createdByUserId: access.userId,
      expiresAt: expiresAtIso,
    });

    // The raw token is NEVER logged — not here, not in the security event.
    await logSecurityEvent({
      userId: access.userId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync/tokens',
      details: {
        action: 'scim_token_created',
        tokenId: token.id,
        tokenPrefix: token.token_prefix,
        connectionId,
        organizationId: access.organizationId,
      },
    });

    return NextResponse.json(
      {
        token: {
          id: token.id,
          connection_id: token.connection_id,
          name: token.name,
          token_prefix: token.token_prefix,
          expires_at: token.expires_at,
          created_at: token.created_at,
        },
        // Shown once. There is no endpoint that can return it again.
        raw_token: rawToken,
        scim_base_url: `${new URL(request.url).origin}/api/scim/v2`,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Error minting SCIM token');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
