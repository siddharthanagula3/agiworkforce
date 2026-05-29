import { NextRequest, NextResponse } from 'next/server';
import { logSecurityEvent, getClientIp } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { OrganizationMemberRow, DirectorySyncConnectionRow } from '@/lib/server/neon-types';

// ---------------------------------------------------------------------------
// Admin auth verification
// ---------------------------------------------------------------------------

async function verifyAdminAccess(
  request: NextRequest,
): Promise<{ isAdmin: boolean; userId?: string; organizationId?: string; error?: string }> {
  let userId: string;
  try {
    ({ userId } = await getClerkAuthUser(request));
  } catch {
    return { isAdmin: false, error: 'Invalid or expired token' };
  }

  const db = getNeonDb();

  // Check if caller is an org owner/admin.
  const rows = await db
    .query<
      Pick<OrganizationMemberRow, 'organization_id' | 'role'>
    >("select organization_id, role from organization_members where user_id = $1 and role in ('owner', 'admin') limit 1", [userId])
    .catch(() => [] as Pick<OrganizationMemberRow, 'organization_id' | 'role'>[]);

  const membership = rows[0];

  if (!membership) {
    return { isAdmin: false, error: 'Insufficient privileges - org admin or owner required' };
  }

  return {
    isAdmin: true,
    userId,
    organizationId: membership.organization_id,
  };
}

// ---------------------------------------------------------------------------
// GET - List directory sync connections for the admin's organization
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { isAdmin, organizationId, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized directory sync access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No organization found for your account' },
        { status: 400 },
      );
    }

    const db = getNeonDb();

    let connections: DirectorySyncConnectionRow[];
    try {
      connections = await db.query<DirectorySyncConnectionRow>(
        'select id, provider, directory_id, display_name, is_active, last_sync_at, created_at, updated_at from directory_sync_connections where organization_id = $1 order by created_at desc',
        [organizationId],
      );
    } catch (fetchError) {
      logger.error(
        { error: fetchError, organizationId },
        'Failed to fetch directory sync connections',
      );
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    return NextResponse.json({
      connections,
      organization_id: organizationId,
    });
  } catch (error) {
    logger.error({ error }, 'Error in directory sync GET');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST - Register a new directory sync connection
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const { isAdmin, userId, organizationId, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized directory sync creation attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No organization found for your account' },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { provider, directory_id, display_name } = body as {
      provider?: string;
      directory_id?: string;
      display_name?: string;
    };

    if (!provider || !directory_id) {
      return NextResponse.json(
        { error: 'provider and directory_id are required' },
        { status: 400 },
      );
    }

    const validProviders = ['okta', 'azure_ad', 'google', 'onelogin', 'generic_scim'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${validProviders.join(', ')}` },
        { status: 400 },
      );
    }

    const db = getNeonDb();

    let connection: DirectorySyncConnectionRow;
    try {
      const rows = await db.query<DirectorySyncConnectionRow>(
        'insert into directory_sync_connections (organization_id, provider, directory_id, display_name, is_active) values ($1, $2, $3, $4, true) returning *',
        [organizationId, provider, directory_id, display_name ?? null],
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
      logger.error({ error: err, organizationId }, 'Failed to create directory sync connection');
      return NextResponse.json({ error: 'Failed to create connection' }, { status: 500 });
    }

    await logSecurityEvent({
      userId,
      eventType: 'admin_action',
      severity: 'medium',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync',
      details: {
        action: 'directory_sync_connection_created',
        connectionId: connection.id,
        provider,
        directoryId: directory_id,
        organizationId,
      },
    });

    logger.info(
      { userId, organizationId, provider, directoryId: directory_id },
      'Directory sync connection created',
    );

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    logger.error({ error }, 'Error in directory sync POST');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE - Remove a directory sync connection
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  try {
    const { isAdmin, userId, organizationId, error: authError } = await verifyAdminAccess(request);

    if (!isAdmin) {
      logger.warn({ error: authError }, 'Unauthorized directory sync deletion attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No organization found for your account' },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
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
      >('select id, organization_id, provider, directory_id from directory_sync_connections where id = $1 limit 1', [connectionId])
      .then((rows) => rows[0] ?? null);

    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    if (existing.organization_id !== organizationId) {
      logger.warn(
        {
          userId,
          connectionId,
          requestedOrg: organizationId,
          actualOrg: existing.organization_id,
        },
        'Unauthorized attempt to delete directory sync connection from another organization',
      );
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    try {
      await db.execute('delete from directory_sync_connections where id = $1', [connectionId]);
    } catch (deleteError) {
      logger.error(
        { error: deleteError, connectionId },
        'Failed to delete directory sync connection',
      );
      return NextResponse.json({ error: 'Failed to delete connection' }, { status: 500 });
    }

    await logSecurityEvent({
      userId,
      eventType: 'admin_action',
      severity: 'high',
      ipAddress: getClientIp(request),
      endpoint: '/api/admin/directory-sync',
      details: {
        action: 'directory_sync_connection_deleted',
        connectionId,
        provider: existing.provider,
        directoryId: existing.directory_id,
        organizationId,
      },
    });

    logger.info({ userId, organizationId, connectionId }, 'Directory sync connection deleted');

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
