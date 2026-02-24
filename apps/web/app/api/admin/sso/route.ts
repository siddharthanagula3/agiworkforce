import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { withRateLimit } from '@/lib/rate-limit';
import { logSecurityEvent } from '@/lib/security-audit';
import { logger } from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Admin SSO Management API
 *
 * GET    /api/admin/sso                  — List SSO connections for the caller's organization(s)
 * GET    /api/admin/sso?orgId=<uuid>     — List SSO connections for a specific org (admin/owner)
 * POST   /api/admin/sso                  — Create a new SSO connection (org owner only)
 * DELETE /api/admin/sso?id=<uuid>        — Remove/deactivate an SSO connection (org owner only)
 *
 * All endpoints require organization admin or owner role. Uses service role key to bypass RLS
 * so that explicit, audited authorization checks can be performed in application code.
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

interface OrgMemberRow {
  role: string;
}

interface CreateSSOConnectionBody {
  organization_id: string;
  provider_type: 'saml' | 'oidc';
  domain: string;
  display_name?: string;
  metadata_url?: string;
  metadata_xml?: string;
  attribute_mapping?: Record<string, string>;
}

type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

function getSupabaseAdmin(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase service role not configured');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Verify the caller is authenticated and return their user ID.
 * Uses the service role key to safely validate the JWT.
 */
async function verifyAuth(
  request: NextRequest,
): Promise<{ userId: string; error?: never } | { userId?: never; error: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { error: 'Server configuration error' };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: 'Missing authorization header' };
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { error: 'Invalid or expired token' };
  }

  return { userId: user.id };
}

/**
 * Check whether the caller has the required role in the given organization.
 * Returns the role string if access is granted, null otherwise.
 */
async function getOrgRole(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<OrgRole | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  const row = data as unknown as OrgMemberRow;
  const role = row.role as OrgRole;
  return role;
}

/**
 * GET /api/admin/sso
 *
 * List SSO connections for the caller's organization (or a specific org when ?orgId= is given).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { userId, error: authError } = await verifyAuth(request);
  if (!userId) {
    logger.warn({ error: authError }, 'Unauthorized SSO list attempt');
    return NextResponse.json({ error: authError ?? 'Unauthorized' }, { status: 401 });
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('orgId');

  try {
    if (orgId) {
      // Require admin or owner to view a specific org's SSO connections
      const role = await getOrgRole(supabase, userId, orgId);
      if (!role || !['owner', 'admin'].includes(role)) {
        logger.warn({ userId, orgId }, 'User lacks admin/owner role for SSO list');
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const { data, error } = await supabase
        .from('sso_connections')
        .select(
          'id, organization_id, provider_type, domain, display_name, metadata_url, is_active, attribute_mapping, created_at, updated_at, created_by',
        )
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error, orgId }, 'Failed to list SSO connections');
        return NextResponse.json({ error: 'Failed to fetch SSO connections' }, { status: 500 });
      }

      return NextResponse.json({ connections: (data ?? []) as SSOConnection[] });
    }

    // No orgId — return connections for all orgs the caller administers
    const { data: memberRows, error: memberError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .in('role', ['owner', 'admin']);

    if (memberError) {
      logger.error({ error: memberError, userId }, 'Failed to fetch org memberships');
      return NextResponse.json(
        { error: 'Failed to fetch organization memberships' },
        { status: 500 },
      );
    }

    const orgIds = ((memberRows ?? []) as Array<{ organization_id: string }>).map(
      (r) => r.organization_id,
    );

    if (orgIds.length === 0) {
      return NextResponse.json({ connections: [] });
    }

    const { data, error } = await supabase
      .from('sso_connections')
      .select(
        'id, organization_id, provider_type, domain, display_name, metadata_url, is_active, attribute_mapping, created_at, updated_at, created_by',
      )
      .in('organization_id', orgIds)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Failed to list SSO connections for user orgs');
      return NextResponse.json({ error: 'Failed to fetch SSO connections' }, { status: 500 });
    }

    return NextResponse.json({ connections: (data ?? []) as SSOConnection[] });
  } catch (error) {
    logger.error({ error, userId }, 'Unexpected error in SSO GET');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/sso
 *
 * Create a new SSO connection. Caller must be an owner of the target organization.
 *
 * Body: CreateSSOConnectionBody
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Strict rate limit — creating SSO connections is a high-privilege admin action
  const rateLimitResponse = await withRateLimit(request, 'api-key-create');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { userId, error: authError } = await verifyAuth(request);
  if (!userId) {
    logger.warn({ error: authError }, 'Unauthorized SSO create attempt');
    return NextResponse.json({ error: authError ?? 'Unauthorized' }, { status: 401 });
  }

  let body: CreateSSOConnectionBody;
  try {
    body = (await request.json()) as CreateSSOConnectionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    organization_id,
    provider_type,
    domain,
    display_name,
    metadata_url,
    metadata_xml,
    attribute_mapping,
  } = body;

  // Input validation
  if (!organization_id) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
  }
  if (!provider_type || !['saml', 'oidc'].includes(provider_type)) {
    return NextResponse.json({ error: 'provider_type must be "saml" or "oidc"' }, { status: 400 });
  }
  if (!domain) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400 });
  }
  // Basic domain format validation (e.g. acme.com)
  const domainPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
  if (!domainPattern.test(domain)) {
    return NextResponse.json(
      { error: 'domain must be a valid domain name (e.g. acme.com)' },
      { status: 400 },
    );
  }
  if (!metadata_url && !metadata_xml) {
    return NextResponse.json(
      { error: 'Either metadata_url or metadata_xml must be provided' },
      { status: 400 },
    );
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    // Only org owners may create SSO connections
    const role = await getOrgRole(supabase, userId, organization_id);
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

    const { data, error } = await supabase
      .from('sso_connections')
      .insert({
        organization_id,
        provider_type,
        domain: domain.toLowerCase(),
        display_name: display_name ?? null,
        metadata_url: metadata_url ?? null,
        metadata_xml: metadata_xml ?? null,
        attribute_mapping: attribute_mapping ?? {},
        created_by: userId,
        is_active: true,
      })
      .select(
        'id, organization_id, provider_type, domain, display_name, metadata_url, is_active, attribute_mapping, created_at, updated_at',
      )
      .single();

    if (error) {
      // Unique constraint violation on domain
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Domain "${domain}" is already configured for SSO` },
          { status: 409 },
        );
      }
      logger.error({ error, userId, organization_id, domain }, 'Failed to create SSO connection');
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

    return NextResponse.json({ connection: data as SSOConnection }, { status: 201 });
  } catch (error) {
    logger.error({ error, userId, organization_id }, 'Unexpected error in SSO POST');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/sso?id=<uuid>[&hard=true]
 *
 * Deactivate (default) or permanently delete an SSO connection.
 * Caller must be an org owner.
 *
 * Query params:
 *   id    — UUID of the SSO connection to remove (required)
 *   hard  — Set to "true" for a permanent hard delete (default: soft deactivate)
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'api-key-revoke');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const { userId, error: authError } = await verifyAuth(request);
  if (!userId) {
    logger.warn({ error: authError }, 'Unauthorized SSO delete attempt');
    return NextResponse.json({ error: authError ?? 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('id');
  const hardDelete = searchParams.get('hard') === 'true';

  if (!connectionId) {
    return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 });
  }

  let supabase: SupabaseClient;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  try {
    // Fetch the connection to determine which org it belongs to
    const { data: existing, error: fetchError } = await supabase
      .from('sso_connections')
      .select('id, organization_id, domain, provider_type')
      .eq('id', connectionId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'SSO connection not found' }, { status: 404 });
    }

    const conn = existing as unknown as {
      id: string;
      organization_id: string;
      domain: string;
      provider_type: string;
    };

    // Only org owners may remove SSO connections
    const role = await getOrgRole(supabase, userId, conn.organization_id);
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
      const { error } = await supabase.from('sso_connections').delete().eq('id', connectionId);

      if (error) {
        logger.error({ error, userId, connectionId }, 'Failed to hard-delete SSO connection');
        return NextResponse.json({ error: 'Failed to delete SSO connection' }, { status: 500 });
      }

      logger.info(
        { userId, connectionId, domain: conn.domain },
        'SSO connection permanently deleted',
      );
    } else {
      // Soft delete: deactivate so the record is preserved for audit purposes
      const { error } = await supabase
        .from('sso_connections')
        .update({ is_active: false })
        .eq('id', connectionId);

      if (error) {
        logger.error({ error, userId, connectionId }, 'Failed to deactivate SSO connection');
        return NextResponse.json({ error: 'Failed to deactivate SSO connection' }, { status: 500 });
      }

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
