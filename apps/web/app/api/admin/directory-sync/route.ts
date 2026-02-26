import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { logSecurityEvent, getClientIp } from '@/lib/security-audit';
import { withRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { requireCsrfToken } from '@/lib/csrf';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ---------------------------------------------------------------------------
// Admin auth verification (mirrors /api/admin/security pattern)
// ---------------------------------------------------------------------------

async function verifyAdminAccess(
  request: NextRequest,
): Promise<{ isAdmin: boolean; userId?: string; organizationId?: string; error?: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { isAdmin: false, error: 'Server configuration error' };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { isAdmin: false, error: 'Missing authorization header' };
  }

  const token = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Verify the JWT and get the user
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { isAdmin: false, error: 'Invalid or expired token' };
  }

  // Check admin via app_metadata (secure — only modifiable via service role)
  const isAdminFromAppMetadata = user.app_metadata?.role === 'admin';

  if (!isAdminFromAppMetadata) {
    // Not a global admin — check if they are an org owner/admin.
    // NOTE: profiles.is_admin is intentionally NOT used as a fallback here because
    // profiles is user-editable and could allow privilege escalation. Only
    // app_metadata.role (service-role-only writable) grants global admin status.
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return { isAdmin: false, error: 'Insufficient privileges — org admin or owner required' };
    }

    return {
      isAdmin: true,
      userId: user.id,
      organizationId: membership.organization_id,
    };
  }

  // Global admin — resolve their organization
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  return {
    isAdmin: true,
    userId: user.id,
    organizationId: membership?.organization_id ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// GET — List directory sync connections for the admin's organization
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Rate limit: reuse the default config for admin endpoints
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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: connections, error: fetchError } = await supabaseAdmin
      .from('directory_sync_connections')
      .select(
        'id, provider, directory_id, display_name, is_active, last_sync_at, created_at, updated_at',
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      logger.error(
        { error: fetchError, organizationId },
        'Failed to fetch directory sync connections',
      );
      return NextResponse.json({ error: 'Failed to fetch connections' }, { status: 500 });
    }

    return NextResponse.json({
      connections: connections ?? [],
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
// POST — Register a new directory sync connection
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Rate limit
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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const body = await request.json();
    const { provider, directory_id, display_name } = body as {
      provider?: string;
      directory_id?: string;
      display_name?: string;
    };

    // Validate required fields
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

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: connection, error: insertError } = await supabaseAdmin
      .from('directory_sync_connections')
      .insert({
        organization_id: organizationId,
        provider,
        directory_id,
        display_name: display_name ?? null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      // Handle duplicate directory_id
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'A connection with this directory_id already exists' },
          { status: 409 },
        );
      }
      logger.error(
        { error: insertError, organizationId },
        'Failed to create directory sync connection',
      );
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
// DELETE — Remove a directory sync connection
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  // Rate limit
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

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('id');

    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection id is required as query parameter' },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Verify the connection belongs to the admin's organization
    const { data: existing } = await supabaseAdmin
      .from('directory_sync_connections')
      .select('id, organization_id, provider, directory_id')
      .eq('id', connectionId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    if (existing.organization_id !== organizationId) {
      logger.warn(
        { userId, connectionId, requestedOrg: organizationId, actualOrg: existing.organization_id },
        'Unauthorized attempt to delete directory sync connection from another organization',
      );
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('directory_sync_connections')
      .delete()
      .eq('id', connectionId);

    if (deleteError) {
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
