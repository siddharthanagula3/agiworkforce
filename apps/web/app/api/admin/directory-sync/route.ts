import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent, getClientIp, recordAuditEvent } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { requireCsrfToken } from '@/lib/csrf';
import { getNeonDb } from '@/lib/server/neon-db';
import type { DirectorySyncConnectionRow, DirectorySyncEventRow } from '@/lib/server/neon-types';
import { readJsonBody } from '@/lib/read-json-body';
import { isDirectorySyncAccessFailure, requireDirectorySyncAdmin } from './directory-sync-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PROVIDERS = ['okta', 'azure_ad', 'google', 'onelogin', 'generic_scim'] as const;

function scimBaseUrl(request: NextRequest): string {
  return `${new URL(request.url).origin}/api/scim/v2`;
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const requestedOrgId = new URL(request.url).searchParams.get('organizationId');
    const access = await requireDirectorySyncAdmin(request, requestedOrgId);
    if (isDirectorySyncAccessFailure(access)) return access.response;

    const db = getNeonDb();

    let connections: DirectorySyncConnectionRow[];
    let events: DirectorySyncEventRow[];
    try {
      connections = await db.query<DirectorySyncConnectionRow>(
        `select id, organization_id, provider, directory_id, display_name, is_active,
                last_sync_at, created_at, updated_at
           from directory_sync_connections
          where organization_id = $1
          order by created_at desc`,
        [access.organizationId],
      );
      events = await db.query<DirectorySyncEventRow>(
        `select id, connection_id, organization_id, event_type, user_email, raw_payload,
                processed_at, error, created_at
           from directory_sync_events
          where organization_id = $1
          order by created_at desc
          limit 50`,
        [access.organizationId],
      );
    } catch (fetchError) {
      logger.error(
        { error: fetchError, organizationId: access.organizationId },
        'Failed to fetch directory sync connections',
      );
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    return NextResponse.json({
      connections,
      events,
      organization_id: access.organizationId,
      scim_base_url: scimBaseUrl(request),
    });
  } catch (error) {
    logger.error({ error }, 'Error in directory sync GET');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const body = await readJsonBody(request);
    const { provider, directory_id, display_name, organizationId } = body as {
      provider?: unknown;
      directory_id?: unknown;
      display_name?: unknown;
      organizationId?: unknown;
    };

    if (organizationId !== undefined && typeof organizationId !== 'string') {
      return NextResponse.json({ error: 'organizationId must be a string' }, { status: 400 });
    }

    const access = await requireDirectorySyncAdmin(request, organizationId ?? null);
    if (isDirectorySyncAccessFailure(access)) return access.response;

    if (typeof provider !== 'string' || typeof directory_id !== 'string') {
      return NextResponse.json(
        { error: 'provider and directory_id are required and must be strings' },
        { status: 400 },
      );
    }

    if (!provider || !directory_id) {
      return NextResponse.json(
        { error: 'provider and directory_id are required' },
        { status: 400 },
      );
    }

    if (directory_id.length > 255) {
      return NextResponse.json(
        { error: 'directory_id exceeds the 255 character limit' },
        { status: 400 },
      );
    }

    if (display_name !== undefined && display_name !== null) {
      if (typeof display_name !== 'string') {
        return NextResponse.json({ error: 'display_name must be a string' }, { status: 400 });
      }
      if (display_name.length > 255) {
        return NextResponse.json(
          { error: 'display_name exceeds the 255 character limit' },
          { status: 400 },
        );
      }
    }

    if (!(VALID_PROVIDERS as readonly string[]).includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 },
      );
    }

    const db = getNeonDb();

    let connection: DirectorySyncConnectionRow;
    try {
      const rows = await db.query<DirectorySyncConnectionRow>(
        'insert into directory_sync_connections (organization_id, provider, directory_id, display_name, is_active) values ($1, $2, $3, $4, true) returning *',
        [access.organizationId, provider, directory_id, display_name ?? null],
      );
      connection = rows[0]!;
    } catch (err: unknown) {
      const pgCode = (err as { code?: string })?.code;
      if (pgCode === '23505') {
        return NextResponse.json(
          { error: 'A connection with this directory_id already exists' },
          { status: 409 },
        );
      }
      logger.error(
        { error: err, organizationId: access.organizationId },
        'Failed to create directory sync connection',
      );
      return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 });
    }

    await logSecurityEvent({
      userId: access.userId,
      eventType: 'admin_action',
      severity: 'medium',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync',
      details: {
        action: 'directory_sync_connection_created',
        connectionId: connection.id,
        provider,
        directoryId: directory_id,
        organizationId: access.organizationId,
      },
    });

    await recordAuditEvent({
      userId: access.userId,
      eventType: 'directory_sync_connection_created',
      organizationId: access.organizationId,
      request,
      severity: 'warning',
      detail: {
        resourceType: 'directory_sync_connection',
        resourceId: connection.id,
        resourceName: typeof display_name === 'string' ? display_name : directory_id,
        source: provider,
      },
    });

    logger.info(
      {
        userId: access.userId,
        organizationId: access.organizationId,
        provider,
        directoryId: directory_id,
      },
      'Directory sync connection created',
    );

    return NextResponse.json({ connection, scim_base_url: scimBaseUrl(request) }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError && error.statusCode < 500) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error({ error }, 'Error in directory sync POST');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const { searchParams } = new URL(request.url);
    const access = await requireDirectorySyncAdmin(request, searchParams.get('organizationId'));
    if (isDirectorySyncAccessFailure(access)) return access.response;

    const connectionId = searchParams.get('id');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection id is required as query parameter' },
        { status: 400 },
      );
    }

    const db = getNeonDb();

    const existing = await db
      .query<
        Pick<DirectorySyncConnectionRow, 'id' | 'organization_id' | 'provider' | 'directory_id'>
      >(
        `select id, organization_id, provider, directory_id
           from directory_sync_connections
          where id = $1 and organization_id = $2
          limit 1`,
        [connectionId, access.organizationId],
      )
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    try {
      await db.execute(
        'delete from directory_sync_connections where id = $1 and organization_id = $2',
        [connectionId, access.organizationId],
      );
    } catch (deleteError) {
      logger.error(
        { error: deleteError, connectionId },
        'Failed to delete directory sync connection',
      );
      return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
    }

    await logSecurityEvent({
      userId: access.userId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync',
      details: {
        action: 'directory_sync_connection_deleted',
        connectionId,
        provider: existing.provider,
        directoryId: existing.directory_id,
        organizationId: access.organizationId,
      },
    });

    await recordAuditEvent({
      userId: access.userId,
      eventType: 'directory_sync_connection_deleted',
      organizationId: access.organizationId,
      request,
      severity: 'critical',
      detail: {
        resourceType: 'directory_sync_connection',
        resourceId: connectionId,
        resourceName: existing.directory_id,
        source: existing.provider,
      },
    });

    logger.info(
      { userId: access.userId, organizationId: access.organizationId, connectionId },
      'Directory sync connection deleted',
    );

    return NextResponse.json({
      success: true,
      message: `Directory sync connection ${connectionId} deleted`,
    });
  } catch (error) {
    logger.error({ error }, 'Error in directory sync DELETE');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
