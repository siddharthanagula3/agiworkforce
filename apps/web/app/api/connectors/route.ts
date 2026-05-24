/**
 * Connectors API
 *
 * GET    /api/connectors - List user's connected services
 * POST   /api/connectors - Save a new connector connection
 * DELETE /api/connectors - Remove a connector connection
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';

type UserConnectorRow = {
  id: string;
  connector_id: string;
  auth_type: string;
  connected_at: string;
  updated_at: string;
};

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

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<UserConnectorRow>(
    `select id, connector_id, auth_type, connected_at, updated_at
     from user_connectors
     where user_id = $1 and is_active = true
     order by connected_at desc`,
    [userId],
  );

  return NextResponse.json({
    connectors: rows.map((c) => ({
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

  const { userId } = await getClerkAuthUser(request);

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

  const db = getNeonDb();
  const now = new Date().toISOString();

  // NOTE: Real OAuth integration is deferred. For connectors with authType
  // 'oauth', this endpoint currently only records intent (is_active: true)
  // without performing an OAuth redirect, token exchange, or storing provider
  // credentials. The UI already gates OAuth connectors behind a "Coming Soon"
  // state so users cannot reach this path for oauth connectors in practice.
  // When real OAuth ships, add: redirect to provider, exchange code for token,
  // encrypt + store credentials, then set is_active: true.
  //
  // Upsert: if user reconnects a previously disconnected connector, reactivate it
  const [data] = await db.query<UserConnectorRow>(
    `insert into user_connectors (user_id, connector_id, auth_type, is_active, connected_at, updated_at)
     values ($1, $2, $3, true, $4, $5)
     on conflict (user_id, connector_id)
     do update set
       auth_type = excluded.auth_type,
       is_active = true,
       connected_at = excluded.connected_at,
       updated_at = excluded.updated_at
     returning id, connector_id, auth_type, connected_at, updated_at`,
    [userId, body.connectorId, authType, now, now],
  );

  if (!data) {
    logger.error({ userId: userId, connectorId: body.connectorId }, 'Failed to save connector');
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

  const { userId } = await getClerkAuthUser(request);

  const url = new URL(request.url);
  const connectorId = url.searchParams.get('connectorId');

  if (!connectorId || !VALID_CONNECTOR_IDS.has(connectorId)) {
    throw createError.validation('Valid connectorId query param is required');
  }

  const db = getNeonDb();

  // Soft-delete: mark as inactive rather than removing the row
  await db.execute(
    `update user_connectors
     set is_active = false, updated_at = $1
     where user_id = $2 and connector_id = $3`,
    [new Date().toISOString(), userId, connectorId],
  );

  return NextResponse.json({ success: true });
}

export const GET = withErrorHandler(handleGetConnectors);
export const POST = withErrorHandler(handleCreateConnector);
export const DELETE = withErrorHandler(handleDeleteConnector);
