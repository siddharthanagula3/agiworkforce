import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  ConversationShareListQuerySchema,
  type ConversationShareCreated,
  type ConversationShareListResponse,
  type ConversationSharesRefreshed,
  type ConversationSharesRevoked,
} from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
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
import { inspectOutboundContent } from '@/lib/security/outbound-content-inspection';
import { resolveSecretHandlingPolicy } from '@/lib/services/organization-policy-gate';
import { TEMPORARY_CHAT_SHARE_REFUSAL } from '@/lib/temporary-chat-policy';
import {
  redactSecretsFromValue,
  SecretRedactionIncompleteError,
} from '@/lib/security/secrets-audit';
import { resolveActiveOrganizationId } from '@/lib/services/active-workspace-service';
import {
  isConversationSharingSchemaUnavailable,
  toSharedSessionVisibility,
  type SharedSessionVisibility,
} from '@/lib/services/org-shared-session-service';

export function OPTIONS(request: NextRequest) {
  return handleCorsPreflightRequest(request) ?? new NextResponse(null, { status: 204 });
}

const DEFAULT_SHARE_EXPIRY_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function shareExpiresAt(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

// A share body carried no bound of its own beyond the 4 MiB payload ceiling, so
// the secret scanner's input was whatever the caller sent.
const MAX_SHARE_MESSAGES = 2_000;
const MAX_SHARE_SERIALIZED_CHARS = 1_000_000;
const SHARE_LIST_LIMIT = 200;

const ShareMessagesSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(MAX_SHARE_MESSAGES)
  .refine(
    (value) => JSON.stringify(value).length <= MAX_SHARE_SERIALIZED_CHARS,
    'messages exceed the size limit',
  );

const ShareSnapshotSchema = z.object({
  title: z.string().min(1).max(200).default('Shared Session'),
  model_id: z.string().nullish(),
  provider: z.string().nullish(),
});

const CreateShareSchema = ShareSnapshotSchema.extend({
  conversation_id: z.string().uuid().optional(),
  messages: ShareMessagesSchema.default([]),
  expires_in_days: z
    .union([z.literal(1), z.literal(7), z.literal(30)])
    .default(DEFAULT_SHARE_EXPIRY_DAYS),
});

const RefreshSharesSchema = ShareSnapshotSchema.extend({
  tokens: z.array(z.string().min(1)).min(1).max(SHARE_LIST_LIMIT),
  messages: ShareMessagesSchema.min(1, 'A link cannot be updated to an empty chat.'),
});

interface SanitizedMessages {
  messages: Array<Record<string, unknown>>;
  secretPatternNames: string[];
  secretMatchCount: number;
}

const LOCAL_PATH_PATTERN = /\/[^\s"']*(\/[^\s"']+)+/g;
const LOCAL_PATH_PLACEHOLDER = '[local-path]';
const TOOL_CALL_FIELDS = ['tool_calls', 'toolCalls'] as const;

function stripLocalPaths(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(LOCAL_PATH_PATTERN, LOCAL_PATH_PLACEHOLDER);
  if (Array.isArray(value)) return value.map(stripLocalPaths);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        stripLocalPaths(entry),
      ]),
    );
  }
  return value;
}

function stripToolCallPaths(msg: Record<string, unknown>): Record<string, unknown> {
  let next = msg;
  if (typeof next['display_args'] === 'string') {
    next = { ...next, display_args: stripLocalPaths(next['display_args']) };
  }
  for (const field of TOOL_CALL_FIELDS) {
    if (Array.isArray(next[field])) {
      next = { ...next, [field]: stripLocalPaths(next[field]) };
    }
  }
  return next;
}

function sanitizeMessages(messages: Array<Record<string, unknown>>): SanitizedMessages {
  const pathStripped = messages.map(stripToolCallPaths);

  const { value, detections } = redactSecretsFromValue(pathStripped);
  return {
    messages: value,
    secretPatternNames: [...new Set(detections.map((detection) => detection.name))],
    secretMatchCount: detections.length,
  };
}

type SharedSessionRow = {
  id: string;
  token: string;
  expires_at: string;
  total_messages: number;
  visibility: string;
};

type ShareLinkEvent = 'share_link_created' | 'share_link_updated' | 'share_link_revoked';

async function readJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function requireConversationQuery(request: NextRequest, refusal: string): string {
  const query = ConversationShareListQuerySchema.required().safeParse({
    conversation_id: request.nextUrl.searchParams.get('conversation_id') ?? undefined,
  });
  if (!query.success) {
    throw createError.validation(refusal, query.error);
  }
  return query.data.conversation_id;
}

async function requireShareableConversation(
  db: DatabaseAdapter,
  conversationId: string,
  userId: string,
): Promise<void> {
  const [conversation] = await db.query<{ is_temporary: boolean }>(
    `select is_temporary
       from web_conversations
      where id = $1 and user_id = $2 and deleted_at is null
      limit 1`,
    [conversationId, userId],
  );
  if (!conversation) {
    throw createError.notFound('Conversation not found');
  }
  if (conversation.is_temporary === true) {
    throw createError.conflict(TEMPORARY_CHAT_SHARE_REFUSAL);
  }
}

async function inspectSnapshot(
  db: DatabaseAdapter,
  userId: string,
  conversationId: string | undefined,
  messages: Array<Record<string, unknown>>,
): Promise<SanitizedMessages> {
  const outbound = await inspectOutboundContent({
    channel: 'share',
    value: messages,
    userId,
    organizationId: null,
    ...(conversationId ? { resourceId: conversationId } : {}),
    auditUnblocked: false,
    resolveMode: () => resolveSecretHandlingPolicy(db, userId),
  });
  if (outbound.action === 'blocked') {
    throw createError.validation(outbound.message);
  }

  try {
    return sanitizeMessages(messages);
  } catch (error) {
    if (error instanceof SecretRedactionIncompleteError) {
      logger.error(
        { userId, patternNames: error.patternNames },
        '[share] redaction left a credential in the transcript; refusing to publish',
      );
      throw createError.validation(
        'This conversation contains a credential that could not be removed. Remove it and share again.',
      );
    }
    throw error;
  }
}

async function recordSecretRedaction(
  request: NextRequest,
  userId: string,
  organizationId: string | null,
  shareId: string,
  sanitized: SanitizedMessages,
): Promise<void> {
  if (sanitized.secretMatchCount === 0) return;
  await recordAuditEvent({
    userId,
    organizationId,
    eventType: 'secret_detected',
    request,
    outcome: 'success',
    severity: 'info',
    detail: {
      resourceType: 'share',
      resourceId: shareId,
      source: sanitized.secretPatternNames.join(','),
      count: sanitized.secretMatchCount,
      status: 'redacted',
    },
  }).catch((error) => {
    logger.error({ error, userId }, 'Failed to record secret-redaction audit event');
  });
}

async function recordShareLinkEvents(
  request: NextRequest,
  userId: string,
  organizationId: string | null,
  eventType: ShareLinkEvent,
  shareIds: string[],
  conversationId: string | undefined,
): Promise<void> {
  await Promise.all(
    shareIds.map((resourceId) =>
      recordAuditEvent({
        userId,
        organizationId,
        eventType,
        request,
        outcome: 'success',
        severity: 'info',
        detail: {
          resourceType: 'share_link',
          resourceId,
          ...(conversationId ? { conversationId } : {}),
        },
      }).catch((error) => {
        logger.error({ error, userId }, 'Failed to record share-link audit event');
      }),
    ),
  );
}

/**
 * The workspace this share could be aimed at, or null when the owner belongs to
 * none. The dialog renders its audience control from this rather than offering
 * a workspace option that would answer 403.
 */
async function describeWorkspaceAudience(
  db: DatabaseAdapter,
  organizationId: string | null,
): Promise<{ memberCount: number } | null> {
  if (!organizationId) return null;
  const [row] = await db.query<{ member_count: number | string | null }>(
    `select count(*) as member_count
       from public.organization_members
      where organization_id = $1`,
    [organizationId],
  );
  const parsed = Number(row?.member_count ?? 0);
  return { memberCount: Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0 };
}

async function handleCreateShare(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const sharingGateResponse = await buildExternalSharingGateResponse(userId, request);
  if (sharingGateResponse) return sharingGateResponse;

  const db = getNeonDb();

  const parsed = CreateShareSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }
  const {
    conversation_id: conversationId,
    title,
    model_id,
    provider,
    messages,
    expires_in_days: expiresInDays,
  } = parsed.data;

  if (conversationId) {
    await requireShareableConversation(db, conversationId, userId);
  }

  const sanitized = await inspectSnapshot(db, userId, conversationId, messages);

  const [data] = await db.query<SharedSessionRow>(
    `insert into shared_sessions
       (token, owner_id, title, model_id, provider, messages, total_messages, conversation_id,
        expires_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     returning id, token, expires_at, total_messages, visibility`,
    [
      randomBytes(18).toString('base64url'),
      userId,
      title,
      model_id ?? null,
      provider ?? null,
      JSON.stringify(sanitized.messages),
      sanitized.messages.length,
      conversationId ?? null,
      shareExpiresAt(expiresInDays),
    ],
  );

  if (!data) {
    logger.error({ userId: userId }, 'Failed to create shared session');
    throw createError.internal('Failed to create share');
  }

  const organizationId = await resolveActiveOrganizationId(db, userId, request).catch(() => null);
  await recordSecretRedaction(request, userId, organizationId, data.id, sanitized);
  await recordShareLinkEvents(
    request,
    userId,
    organizationId,
    'share_link_created',
    [data.id],
    conversationId,
  );

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  const shareUrl = `${appUrl}/share/${data.token}`;

  const created: ConversationShareCreated = {
    shareUrl,
    token: data.token,
    expiresAt: data.expires_at,
    messageCount: data.total_messages,
    visibility: toSharedSessionVisibility(data.visibility),
    workspace: await describeWorkspaceAudience(db, organizationId),
  };
  return NextResponse.json(created, { status: 201 });
}

async function handleRefreshConversationShares(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const rateLimitResponse = await withRateLimit(request, 'share-create');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);

  const conversationId = requireConversationQuery(
    request,
    'Name the conversation whose links to update',
  );
  const parsed = RefreshSharesSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw createError.validation('Invalid request body', parsed.error);
  }
  const { tokens, title, model_id, provider, messages } = parsed.data;

  const sharingGateResponse = await buildExternalSharingGateResponse(userId, request);
  if (sharingGateResponse) return sharingGateResponse;

  const db = getNeonDb();

  await requireShareableConversation(db, conversationId, userId);
  const sanitized = await inspectSnapshot(db, userId, conversationId, messages);

  const refreshed = await db.query<{ id: string; token: string }>(
    `with refreshed as (
       update shared_sessions
          set title = $4,
              model_id = $5,
              provider = $6,
              messages = $7::jsonb,
              total_messages = $8
        where owner_id = $1
          and conversation_id = $2
          and token = any($3::text[])
          and expires_at > now()
        returning id, token, created_at
     )
     select id, token from refreshed order by created_at desc`,
    [
      userId,
      conversationId,
      tokens,
      title,
      model_id ?? null,
      provider ?? null,
      JSON.stringify(sanitized.messages),
      sanitized.messages.length,
    ],
  );
  const [newest] = refreshed;
  if (!newest) {
    throw createError
      .notFound(
        'This link was revoked or has expired, so there is nothing to update. Create a new link instead.',
      )
      .asUserSafe();
  }

  const organizationId = await resolveActiveOrganizationId(db, userId, request).catch(() => null);
  await recordSecretRedaction(request, userId, organizationId, newest.id, sanitized);
  await recordShareLinkEvents(
    request,
    userId,
    organizationId,
    'share_link_updated',
    refreshed.map((share) => share.id),
    conversationId,
  );

  const answer: ConversationSharesRefreshed = {
    refreshed: refreshed.length,
    tokens: refreshed.map((share) => share.token),
    messageCount: sanitized.messages.length,
  };
  return NextResponse.json(answer);
}

type SharedSessionListRow = {
  token: string;
  title: string | null;
  model_id: string | null;
  provider: string | null;
  total_messages: number;
  visibility: string;
  expires_at: string;
  created_at: string;
};

async function handleListShares(request: NextRequest) {
  const rateLimitResponse = await withRateLimit(request, 'share-view');
  if (rateLimitResponse) return rateLimitResponse;

  const { userId } = await getClerkAuthUser(request);
  const query = ConversationShareListQuerySchema.safeParse({
    conversation_id: request.nextUrl.searchParams.get('conversation_id') ?? undefined,
  });
  if (!query.success) {
    throw createError.validation('Invalid conversation id', query.error);
  }
  const conversationId = query.data.conversation_id ?? null;
  const db = getNeonDb();

  let rows: SharedSessionListRow[];
  try {
    rows = await db.query<SharedSessionListRow>(
      `select token, title, model_id, provider, total_messages, visibility, expires_at, created_at
     from shared_sessions
     where owner_id = $1
     ${conversationId ? 'and conversation_id = $2' : ''}
     order by created_at desc
     limit ${SHARE_LIST_LIMIT}`,
      conversationId ? [userId, conversationId] : [userId],
    );
  } catch (error) {
    if (conversationId || !isConversationSharingSchemaUnavailable(error)) throw error;
    rows = await db.query<SharedSessionListRow>(
      `select token, title, model_id, provider, total_messages, expires_at, created_at
     from shared_sessions
     where owner_id = $1
     order by created_at desc
     limit ${SHARE_LIST_LIMIT}`,
      [userId],
    );
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'https://agiworkforce.com';
  const now = Date.now();

  const listed: ConversationShareListResponse = {
    shares: rows.map((row) => ({
      token: row.token,
      title: row.title ?? 'Shared Session',
      shareUrl: `${appUrl}/share/${row.token}`,
      modelId: row.model_id,
      provider: row.provider,
      messageCount: row.total_messages,
      visibility: toSharedSessionVisibility(row.visibility) satisfies SharedSessionVisibility,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      expired: new Date(row.expires_at).getTime() <= now,
    })),
    ...(conversationId
      ? {
          workspace: await describeWorkspaceAudience(
            db,
            await resolveActiveOrganizationId(db, userId, request).catch(() => null),
          ),
        }
      : {}),
  };
  return NextResponse.json(listed);
}

async function handleRevokeConversationShares(request: NextRequest) {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse;

  const { userId } = await getClerkAuthUser(request);
  const conversationId = requireConversationQuery(
    request,
    'Name the conversation whose links to revoke',
  );
  const db = getNeonDb();

  const revoked = await db.query<{ id: string }>(
    `delete from shared_sessions
      where owner_id = $1
        and conversation_id = $2
        and expires_at > now()
      returning id`,
    [userId, conversationId],
  );

  const organizationId =
    revoked.length > 0
      ? await resolveActiveOrganizationId(db, userId, request).catch(() => null)
      : null;
  await recordShareLinkEvents(
    request,
    userId,
    organizationId,
    'share_link_revoked',
    revoked.map((share) => share.id),
    conversationId,
  );

  const answer: ConversationSharesRevoked = { success: true, revoked: revoked.length };
  return NextResponse.json(answer);
}

export const POST = withErrorHandler(handleCreateShare);
export const PUT = withErrorHandler(handleRefreshConversationShares);
export const GET = withErrorHandler(handleListShares);
export const DELETE = withErrorHandler(handleRevokeConversationShares);
