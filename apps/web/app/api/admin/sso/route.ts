import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';
import { getClerkAuthUser } from '@/lib/api-auth';
import { getNeonDb } from '@/lib/server/neon-db';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { OrganizationMemberRow, SSOConnectionRow } from '@/lib/server/neon-types';

/**
 * Admin SSO Management API
 *
 * GET    /api/admin/sso                  - List SSO connections for the caller's organization(s)
 * GET    /api/admin/sso?orgId=<uuid>     - List SSO connections for a specific org (admin/owner)
 * POST   /api/admin/sso                  - Create a new SSO connection (org owner only)
 * DELETE /api/admin/sso?id=<uuid>        - Remove/deactivate an SSO connection (org owner only)
 *
 * All endpoints require organization admin or owner role.
 */

interface SSOConnection {
  id: string;
  organization_id: string;
  provider_type: 'saml' | 'oidc';
  domain: string;
  display_name: string | null;
  metadata_url: string | null;
  is_active: boolean;
  attribute_mapping: Record<string, string>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const CreateSSOConnectionSchema = z.object({
  organization_id: z.string().uuid(),
  provider_type: z.enum(['saml', 'oidc']),
  domain: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/),
  display_name: z.string().max(200).optional(),
  metadata_url: z.string().url().optional(),
  metadata_xml: z.string().max(500_000).optional(),
  attribute_mapping: z.record(z.string(), z.string()).optional(),
});

type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Verify the caller is authenticated and return their user ID.
 */
async function verifyAuth(
  request: NextRequest,
): Promise<{ userId: string; error?: never } | { userId?: never; error: string }> {
  try {
    const { userId } = await getClerkAuthUser(request);
    return { userId };
  } catch {
    return { error: 'Invalid or expired token' };
  }
}

/**
 * Check whether the caller has the required role in the given organization.
 */
async function getOrgRole(
  db: DatabaseAdapter,
  userId: string,
  organizationId: string,
): Promise<OrgRole | null> {
  const rows = await db.query<Pick<OrganizationMemberRow, 'role'>>(
    'select role from organization_members where organization_id = $1 and user_id = $2 limit 1',
    [organizationId, userId],
  );

  if (rows.length === 0) {
    return null;
  }

  return (rows[0]!.role as OrgRole) ?? null;
}

/**
 * GET /api/admin/sso
 */
export async function GET(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { userId, error: authError } = await verifyAuth(request);
  if (!userId) {
    logger.warn({ error: authError }, 'Unauthorized SSO list attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getNeonDb();
  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');

  try {
    if (orgId) {
      // Require admin or owner to view a specific org's SSO connections
      const role = await getOrgRole(db, userId, orgId);
      if (!role || !['owner', 'admin'].includes(role)) {
        logger.warn({ userId, orgId }, 'User lacks admin/owner role for SSO list');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const rows = await db.query<SSOConnectionRow>(
        'select id, organization_id, provider_type, domain, display_name, metadata_url, is_active, attribute_mapping, created_at, updated_at, created_by from sso_connections where organization_id = $1 order by created_at desc',
        [orgId],
      );

      return NextResponse.json({ connections: rows as unknown as SSOConnection[] });
    }

    // No orgId - return connections for all orgs the caller administers
    const memberRows = await db.query<Pick<OrganizationMemberRow, 'organization_id'>>(
      "select organization_id from organization_members where user_id = $1 and role in ('owner', 'admin')",
      [userId],
    );

    const orgIds = memberRows.map((r) => r.organization_id);

    if (orgIds.length === 0) {
      return NextResponse.json({ connections: [] });
    }

    const rows = await db.query<SSOConnectionRow>(
      'select id, organization_id, provider_type, domain, display_name, metadata_url, is_active, attribute_mapping, created_at, updated_at, created_by from sso_connections where organization_id = any($1) order by created_at desc',
      [orgIds],
    );

    return NextResponse.json({ connections: rows as unknown as SSOConnection[] });
  } catch (error) {
    logger.error({ error, userId }, 'Unexpected error in SSO GET');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/sso
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-create');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const { userId, error: authError } = await verifyAuth(request);
  if (!userId) {
    logger.warn({ error: authError }, 'Unauthorized SSO create attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSSOConnectionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const {
    organization_id,
    provider_type,
    domain,
    display_name,
    metadata_url,
    metadata_xml,
    attribute_mapping,
  } = parsed.data;

  if (!metadata_url && !metadata_xml) {
    return NextResponse.json(
      { error: 'Either metadata_url or metadata_xml must be provided' },
      { status: 400 },
    );
  }

  const db = getNeonDb();

  try {
    // Only org owners may create SSO connections
    const role = await getOrgRole(db, userId, organization_id);
    if (role !== 'owner') {
      logger.warn({ userId, organization_id }, 'User lacks org owner role for SSO create');

      await logSecurityEvent({
        userId,
        eventType: 'authorization_failed',
        severity: 'medium',
        endpoint: '/api/admin/sso',
        details: { action: 'create-sso-connection', organization_id, domain },
      });

      return NextResponse.json(
        { error: 'Forbidden: only organization owners can create SSO connections' },
        { status: 403 },
      );
    }

    let rows: SSOConnectionRow[];
    try {
      rows = await db.query<SSOConnectionRow>(
        'insert into sso_connections (organization_id, provider_type, domain, display_name, metadata_url, metadata_xml, attribute_mapping, created_by, is_active) values ($1, $2, $3, $4, $5, $6, $7, $8, true) returning id, organization_id, provider_type, domain, display_name, metadata_url, is_active, attribute_mapping, created_at, updated_at',
        [
          organization_id,
          provider_type,
          domain.toLowerCase(),
          display_name ?? null,
          metadata_url ?? null,
          metadata_xml ?? null,
          JSON.stringify(attribute_mapping ?? {}),
          userId,
        ],
      );
    } catch (err: unknown) {
      const pgCode = (err as { code?: string })?.code;
      if (pgCode === '23505') {
        return NextResponse.json(
          { error: `Domain "${domain}" is already configured for SSO` },
          { status: 409 },
        );
      }
      logger.error(
        { error: err, userId, organization_id, domain },
        'Failed to create SSO connection',
      );
      return NextResponse.json({ error: 'Failed to create SSO connection' }, { status: 500 });
    }

    logger.info({ userId, organization_id, domain, provider_type }, 'SSO connection created');

    await logSecurityEvent({
      userId,
      eventType: 'admin_action',
      severity: 'low',
      endpoint: '/api/admin/sso',
      details: {
        action: 'create-sso-connection',
        organization_id,
        domain,
        provider_type,
      },
    });

    return NextResponse.json({ connection: rows[0] as unknown as SSOConnection }, { status: 201 });
  } catch (error) {
    logger.error({ error, userId, organization_id }, 'Unexpected error in SSO POST');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sso?id=<uuid>[&hard=true]
 */
export async function DELETE(request: NextRequest): Promise<Response> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-revoke');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;

  const { userId, error: authError } = await verifyAuth(request);
  if (!userId) {
    logger.warn({ error: authError }, 'Unauthorized SSO delete attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('id');
  const hardDelete = searchParams.get('hard') === 'true';

  if (!connectionId) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  const db = getNeonDb();

  try {
    // Fetch the connection to determine which org it belongs to
    const existing = await db.query<
      Pick<SSOConnectionRow, 'id' | 'organization_id' | 'domain' | 'provider_type'>
    >(
      'select id, organization_id, domain, provider_type from sso_connections where id = $1 limit 1',
      [connectionId],
    );

    if (existing.length === 0) {
      return NextResponse.json({ error: 'SSO connection not found' }, { status: 404 });
    }

    const conn = existing[0]!;

    // Only org owners may remove SSO connections
    const role = await getOrgRole(db, userId, conn.organization_id);
    if (role !== 'owner') {
      logger.warn(
        { userId, connectionId, organization_id: conn.organization_id },
        'User lacks org owner role for SSO delete',
      );

      await logSecurityEvent({
        userId,
        eventType: 'authorization_failed',
        severity: 'medium',
        endpoint: '/api/admin/sso',
        details: {
          action: 'delete-sso-connection',
          connectionId,
          organization_id: conn.organization_id,
        },
      });

      return NextResponse.json(
        { error: 'Forbidden: only organization owners can remove SSO connections' },
        { status: 403 },
      );
    }

    if (hardDelete) {
      await db
        .execute('delete from sso_connections where id = $1', [connectionId])
        .catch((err: unknown) => {
          logger.error(
            { error: err, userId, connectionId },
            'Failed to hard-delete SSO connection',
          );
          throw err;
        });
      logger.info(
        { userId, connectionId, domain: conn.domain },
        'SSO connection permanently deleted',
      );
    } else {
      // Soft delete: deactivate so the record is preserved for audit purposes
      await db
        .execute('update sso_connections set is_active = false where id = $1', [connectionId])
        .catch((err: unknown) => {
          logger.error({ error: err, userId, connectionId }, 'Failed to deactivate SSO connection');
          throw err;
        });
      logger.info({ userId, connectionId, domain: conn.domain }, 'SSO connection deactivated');
    }

    await logSecurityEvent({
      userId,
      eventType: 'admin_action',
      severity: 'medium',
      endpoint: '/api/admin/sso',
      details: {
        action: hardDelete ? 'hard-delete-sso-connection' : 'deactivate-sso-connection',
        connectionId,
        domain: conn.domain,
        organization_id: conn.organization_id,
      },
    });

    return NextResponse.json({
      success: true,
      message: hardDelete
        ? `SSO connection for domain "${conn.domain}" permanently deleted`
        : `SSO connection for domain "${conn.domain}" deactivated`,
    });
  } catch (error) {
    logger.error({ error, userId, connectionId }, 'Unexpected error in SSO DELETE');
    if (error instanceof Error && error.message.includes('fetch failed')) {
      return NextResponse.json({ error: 'Database temporarily unavailable' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
