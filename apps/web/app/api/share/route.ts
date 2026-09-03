import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { getNeonDb } from '@/lib/server/neon-db';
import { withErrorHandler } from '@/lib/error-handler';
import { withRateLimit } from '@/lib/rate-limit';
import { requireCsrfToken } from '@/lib/csrf';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getClerkAuthUser } from '@/lib/api-auth';
import { handleCorsPreflightRequest } from '@/lib/cors';
import { buildExternalSharingGateResponse } from '@/lib/managed-compute-gate';
import { recordAuditEvent } from '@/lib/security-audit';
import { redactSecretsFromValue } from '@/lib/security/secrets-audit';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

const DEFAULT_SHARE_EXPIRY_DAYS = 7;

const CreateShareSchema = z.object({
  title: z.string().min(1).max(200).default('Shared Session'),
  model_id: z.string().optional(),
  provider: z.string().optional(),
  messages: z.array(z.record(z.string(), z.unknown())).default([]),
  expires_in_days: z
    .union([z.literal(1), z.literal(7), z.literal(30)])
    .default(DEFAULT_SHARE_EXPIRY_DAYS),
});

interface SanitizedMessages {
  messages: Array<Record<string, unknown>>;
  secretPatternNames: string[];
  secretMatchCount: number;
}

function sanitizeMessages(messages: Array<Record<string, unknown>>): SanitizedMessages {
  const pathStripped = messages.map((msg) => {
    if (msg['display_args'] && typeof msg['display_args'] === 'string') {
      return {
        ...msg,
        display_args: (msg['display_args'] as string).replace(
          /\/[^\s"']*(\/[^\s"']+)+/g,
          '[local-path]',
        ),
      };
    }
    return msg;
  });

  const { value, detections } = redactSecretsFromValue(pathStripped);
  return {
    messages: value,
    secretPatternNames: [...new Set(detections.map((detection) => detection.name))],
    secretMatchCount: detections.length,
  };
}

type SharedSessionRow = {
  token: string;
  expires_at: string;
  total_messages: number;
};

async function handleCreateShare(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const sharingGateResponse = await buildExternalSharingGateResponse(userId, request);
  if (sharingGateResponse) return sharingGateResponse;

  const db = getNeonDb();

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // Empty body is fine - defaults applied by schema
  }

  const parsed = CreateShareSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }
  const { title, model_id, provider, messages, expires_in_days: expiresInDays } = parsed.data;

  const token = randomBytes(18).toString('base64url');

  const {
    messages: sanitizedMessages,
    secretPatternNames,
    secretMatchCount,
  } = sanitizeMessages(messages);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const [data] = await db.query<SharedSessionRow>(
    `insert into shared_sessions
       (token, owner_id, title, model_id, provider, messages, total_messages, expires_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
     returning token, expires_at, total_messages`,
    [
      token,
      userId,
      title,
      model_id ?? null,
      provider ?? null,
      JSON.stringify(sanitizedMessages),
      sanitizedMessages.length,
      expiresAt,
    ],
  );

  if (!data) {
    logger.error({ userId: userId }, 'Failed to create shared session');
    throw createError.internal('Failed to create share');
  }

  if (secretMatchCount > 0) {
    const organizationId = await resolveActiveOrganizationId(db, userId, request).catch(() => null);
    await recordAuditEvent({
      userId,
      organizationId,
      eventType: 'secret_detected',
      request,
      outcome: 'success',
      severity: 'info',
      detail: {
        resourceType: 'share',
        resourceId: data.token,
        source: secretPatternNames.join(','),
        count: secretMatchCount,
        status: 'redacted',
      },
    }).catch((error) => {
      logger.error({ error, userId }, 'Failed to record secret-redaction audit event');
    });
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  const shareUrl = `${appUrl}/share/${data.token}`;

  return NextResponse.json(
    {
      shareUrl,
      token: data.token,
      expiresAt: data.expires_at,
      messageCount: data.total_messages,
    },
    { status: 201 },
  );
}

type SharedSessionListRow = {
  token: string;
  title: string | null;
  model_id: string | null;
  provider: string | null;
  total_messages: number;
  expires_at: string;
  created_at: string;
};

async function handleListShares(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const db = getNeonDb();

  const rows = await db.query<SharedSessionListRow>(
    `select token, title, model_id, provider, total_messages, expires_at, created_at
     from shared_sessions
     where owner_id = $1
     order by created_at desc
     limit 200`,
    [userId],
  );

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  const now = Date.now();

  return NextResponse.json({
    shares: rows.map((row) => ({
      token: row.token,
      title: row.title ?? 'Shared Session',
      shareUrl: `${appUrl}/share/${row.token}`,
      modelId: row.model_id,
      provider: row.provider,
      messageCount: row.total_messages,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      expired: new Date(row.expires_at).getTime() <= now,
    })),
  });
}

export const POST = withErrorHandler(handleCreateShare);
export const GET = withErrorHandler(handleListShares);
