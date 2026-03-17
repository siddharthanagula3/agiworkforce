/**
 * Connectors API
 *
 * GET    /api/connectors - List user's connected services
 * POST   /api/connectors - Save a new connector connection
 * DELETE /api/connectors - Remove a connector connection
 */

import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { requireEnv } from '@/utils/env';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

async function getAuthenticatedUser(request: NextRequest): Promise<User> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, flowType: 'pkce' },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw createError.unauthorized('Invalid token');
    }
    return data.user;
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    auth: { flowType: 'pkce' },
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // ignore — called from Server Component
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          // ignore
        }
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    throw createError.unauthorized();
  }
  return user;
}

function getServiceClient() {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Allowlist of valid connector IDs to prevent arbitrary data injection
const VALID_CONNECTOR_IDS = new Set([
  'gmail',
  'google-drive',
  'notion',
  'slack',
  'github',
  'google-sheets',
  'outlook',
  'onedrive',
  'linear',
  'jira',
  'teams',
  'confluence',
  'asana',
  'zoom',
  'hubspot',
  'salesforce',
  'calendly',
  'intercom',
  'google-analytics',
  'mailchimp',
  'stripe',
  'shopify',
  'linkedin',
  'twitter',
  'discord',
  'openai',
  'elevenlabs',
  'local-filesystem',
  'terminal',
  'browser-automation',
  'screen-vision',
  'ollama',
]);

// ─── GET: list connected services ──────────────────────────────────────────────

async function handleGetConnectors(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('user_connectors')
    .select('id, connector_id, auth_type, connected_at, updated_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('connected_at', { ascending: false });

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to fetch connectors');
    throw createError.internal('Failed to fetch connectors');
  }

  return NextResponse.json({
    connectors: (data || []).map((c) => ({
      id: c.id,
      connectorId: c.connector_id,
      authType: c.auth_type,
      connectedAt: c.connected_at,
      updatedAt: c.updated_at,
    })),
  });
}

// ─── POST: save new connection ─────────────────────────────────────────────────

async function handleCreateConnector(request: NextRequest) {
  // CSRF protection for state-changing POST endpoint
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  let body: { connectorId?: string; authType?: string };
  try {
    body = await request.json();
  } catch {
    throw createError.validation('Invalid request body');
  }

  if (!body.connectorId || typeof body.connectorId !== 'string') {
    throw createError.validation('connectorId is required');
  }

  if (!VALID_CONNECTOR_IDS.has(body.connectorId)) {
    throw createError.validation('Invalid connector ID');
  }

  const authType = body.authType ?? 'oauth';
  if (!['oauth', 'api_key', 'connection_string', 'pat'].includes(authType)) {
    throw createError.validation('Invalid auth type');
  }

  const supabase = getServiceClient();

  // Upsert: if user reconnects a previously disconnected connector, reactivate it
  const { data, error } = await supabase
    .from('user_connectors')
    .upsert(
      {
        user_id: user.id,
        connector_id: body.connectorId,
        auth_type: authType,
        is_active: true,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,connector_id' },
    )
    .select('id, connector_id, auth_type, connected_at, updated_at')
    .single();

  if (error) {
    logger.error(
      { error, userId: user.id, connectorId: body.connectorId },
      'Failed to save connector',
    );
    throw createError.internal('Failed to save connector');
  }

  return NextResponse.json(
    {
      connector: {
        id: data.id,
        connectorId: data.connector_id,
        authType: data.auth_type,
        connectedAt: data.connected_at,
        updatedAt: data.updated_at,
      },
    },
    { status: 201 },
  );
}

// ─── DELETE: remove connection ─────────────────────────────────────────────────

async function handleDeleteConnector(request: NextRequest) {
  // CSRF protection for state-changing DELETE endpoint
  const csrfError2 = await requireCsrfToken(request);
  if (csrfError2) return csrfError2 as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'chat-conversation');
  if (rateLimitResponse) return rateLimitResponse;

  const user = await getAuthenticatedUser(request);

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId');

  if (!connectorId || !VALID_CONNECTOR_IDS.has(connectorId)) {
    throw createError.validation('Valid connectorId query param is required');
  }

  const supabase = getServiceClient();

  // Soft-delete: mark as inactive rather than removing the row
  const { error } = await supabase
    .from('user_connectors')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('connector_id', connectorId);

  if (error) {
    logger.error({ error, userId: user.id, connectorId }, 'Failed to disconnect connector');
    throw createError.internal('Failed to disconnect connector');
  }

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetConnectors);
export const POST = withErrorHandler(handleCreateConnector);
export const DELETE = withErrorHandler(handleDeleteConnector);
