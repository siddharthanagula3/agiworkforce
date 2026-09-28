import 'server-only';

import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import type {
  DeveloperWebhookDelivery,
  DeveloperWebhookEndpoint,
} from '@/features/developers/types';
import { platformTenantKeyRing } from '@/lib/crypto/cmek';
import { openEnvelope, sealEnvelope, type KeyRing } from '@/lib/crypto/envelope';
import {
  DEVELOPER_WEBHOOK_MAX_ATTEMPTS,
  DEVELOPER_WEBHOOK_TEST_EVENT,
  DEVELOPER_WEBHOOK_TIMEOUT_SECONDS,
  type DeveloperWebhookEventType,
} from '@/lib/developer-api/webhook-events';
import {
  generateWebhookSecret,
  webhookDeliveryHeaders,
} from '@/lib/developer-api/webhook-signature';
import {
  EgressPolicyError,
  assertResolvedPublicHostname,
  pinnedPublicFetch,
} from '@/lib/egress-policy';
import { createError } from '@/lib/errors';
import type { JobHandlerContext } from '@/lib/jobs/job-drain';
import { PermanentJobError, enqueueJob } from '@/lib/jobs/job-service';
import { logger } from '@/lib/logger';
import { createClaimedUserScopedDb } from '@/lib/server/claimed-user-scope-db';
import { getNeonDb } from '@/lib/server/neon-db';
import { PLATFORM_TENANT_KEY_ENV } from '@/lib/server/organization-encryption-keys';

export const DEVELOPER_WEBHOOK_ENDPOINT_LIMIT = 10;
export const DEVELOPER_WEBHOOK_DELIVERY_PAGE = 50;

const DELIVERY_JOB_KIND = 'webhooks.developer-delivery';
const DELIVERY_TIMEOUT_MS = DEVELOPER_WEBHOOK_TIMEOUT_SECONDS * 1000;
const ERROR_MAX = 500;

interface EndpointRow {
  id: string;
  url: string;
  description: string | null;
  event_types: string[];
  secret_prefix: string;
  enabled: boolean;
  created_at: string | Date;
}

interface DeliveryRow {
  id: string;
  event_id: string;
  event_type: string;
  status: DeveloperWebhookDelivery['status'];
  attempts: number | string;
  response_status: number | null;
  error: string | null;
  redelivery_of: string | null;
  last_attempt_at: string | Date | null;
  delivered_at: string | Date | null;
  created_at: string | Date;
}

const ENDPOINT_COLUMNS = 'id, url, description, event_types, secret_prefix, enabled, created_at';
const DELIVERY_COLUMNS =
  'id, event_id, event_type, status, attempts, response_status, error, redelivery_of, last_attempt_at, delivered_at, created_at';

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function toEndpoint(row: EndpointRow): DeveloperWebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    eventTypes: row.event_types,
    secretPrefix: row.secret_prefix,
    enabled: row.enabled,
    createdAt: iso(row.created_at) ?? '',
  };
}

function toDelivery(row: DeliveryRow): DeveloperWebhookDelivery {
  return {
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    status: row.status,
    attempts: Number(row.attempts),
    responseStatus: row.response_status,
    error: row.error,
    redeliveryOf: row.redelivery_of,
    lastAttemptAt: iso(row.last_attempt_at),
    deliveredAt: iso(row.delivered_at),
    createdAt: iso(row.created_at) ?? '',
  };
}

function keyRingFor(userId: string): KeyRing {
  try {
    return platformTenantKeyRing(PLATFORM_TENANT_KEY_ENV, `developer-webhooks:${userId}`);
  } catch (error) {
    logger.error({ error }, 'Developer webhook secrets cannot be sealed without the platform key');
    throw createError.capabilityUnavailable(
      'Webhooks are unavailable because secret storage is not configured on this deployment.',
    );
  }
}

function secretContext(endpointId: string): string {
  return `developer-webhook-endpoint:${endpointId}`;
}

export async function assertDeliverableUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw createError.validation('Enter the full URL of your endpoint, starting with https://.');
  }
  if (parsed.protocol !== 'https:') {
    throw createError.validation('Webhook endpoints must use https.');
  }
  if (parsed.username || parsed.password) {
    throw createError.validation('Put credentials in your endpoint, not in its URL.');
  }
  try {
    await assertResolvedPublicHostname(parsed.toString());
  } catch (error) {
    if (error instanceof EgressPolicyError) {
      throw createError.validation(
        'That address is private or does not resolve, so events could not reach it.',
      );
    }
    throw error;
  }
  return parsed.toString();
}

export async function listWebhookEndpoints(
  db: DatabaseAdapter,
  userId: string,
): Promise<DeveloperWebhookEndpoint[]> {
  const rows = await db.query<EndpointRow>(
    `select ${ENDPOINT_COLUMNS}
       from public.developer_webhook_endpoints
      where user_id = $1
      order by created_at asc`,
    [userId],
  );
  return rows.map(toEndpoint);
}

export async function createWebhookEndpoint(
  db: DatabaseAdapter,
  userId: string,
  input: { url: string; description: string | null; eventTypes: DeveloperWebhookEventType[] },
): Promise<{ endpoint: DeveloperWebhookEndpoint; secret: string }> {
  const [count] = await db.query<{ total: string | number }>(
    `select count(*) as total from public.developer_webhook_endpoints where user_id = $1`,
    [userId],
  );
  if (Number(count?.total ?? 0) >= DEVELOPER_WEBHOOK_ENDPOINT_LIMIT) {
    throw createError.validation(
      `You can register ${DEVELOPER_WEBHOOK_ENDPOINT_LIMIT} endpoints. Remove one to add another.`,
    );
  }

  const url = await assertDeliverableUrl(input.url);
  const endpointId = randomUUID();
  const { secret, prefix } = generateWebhookSecret();
  const sealed = sealEnvelope(keyRingFor(userId), secret, 'versioned', secretContext(endpointId));

  const [row] = await db.query<EndpointRow>(
    `insert into public.developer_webhook_endpoints
       (id, user_id, url, description, event_types, secret_enc, secret_prefix)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${ENDPOINT_COLUMNS}`,
    [endpointId, userId, url, input.description, input.eventTypes, sealed, prefix],
  );
  if (!row) throw createError.internal('The endpoint could not be saved.');
  return { endpoint: toEndpoint(row), secret };
}

export async function updateWebhookEndpoint(
  db: DatabaseAdapter,
  userId: string,
  endpointId: string,
  patch: {
    url?: string;
    description?: string | null;
    eventTypes?: DeveloperWebhookEventType[];
    enabled?: boolean;
  },
): Promise<DeveloperWebhookEndpoint> {
  const url = patch.url === undefined ? null : await assertDeliverableUrl(patch.url);
  const [row] = await db.query<EndpointRow>(
    `update public.developer_webhook_endpoints
        set url = coalesce($3, url),
            description = case when $4::boolean then $5 else description end,
            event_types = coalesce($6, event_types),
            enabled = coalesce($7, enabled)
      where id = $1
        and user_id = $2
      returning ${ENDPOINT_COLUMNS}`,
    [
      endpointId,
      userId,
      url,
      patch.description !== undefined,
      patch.description ?? null,
      patch.eventTypes ?? null,
      patch.enabled ?? null,
    ],
  );
  if (!row) throw createError.notFound('That endpoint does not exist.');
  return toEndpoint(row);
}

export async function deleteWebhookEndpoint(
  db: DatabaseAdapter,
  userId: string,
  endpointId: string,
): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `delete from public.developer_webhook_endpoints
      where id = $1
        and user_id = $2
      returning id`,
    [endpointId, userId],
  );
  if (rows.length === 0) throw createError.notFound('That endpoint does not exist.');
}

export async function listWebhookDeliveries(
  db: DatabaseAdapter,
  userId: string,
  endpointId: string,
): Promise<DeveloperWebhookDelivery[]> {
  const rows = await db.query<DeliveryRow>(
    `select ${DELIVERY_COLUMNS}
       from public.developer_webhook_deliveries
      where endpoint_id = $1
        and user_id = $2
      order by created_at desc
      limit ${DEVELOPER_WEBHOOK_DELIVERY_PAGE}`,
    [endpointId, userId],
  );
  return rows.map(toDelivery);
}

async function recordDeliveries(
  db: DatabaseAdapter,
  userId: string,
  endpointIds: readonly string[],
  event: {
    id: string;
    type: string;
    payload: Record<string, unknown>;
    redeliveryOf?: string | null;
  },
): Promise<DeveloperWebhookDelivery[]> {
  const deliveries: DeveloperWebhookDelivery[] = [];
  for (const endpointId of endpointIds) {
    const [row] = await db.query<DeliveryRow>(
      `insert into public.developer_webhook_deliveries
         (endpoint_id, user_id, event_id, event_type, payload, redelivery_of)
       values ($1, $2, $3, $4, $5::jsonb, $6)
       returning ${DELIVERY_COLUMNS}`,
      [
        endpointId,
        userId,
        event.id,
        event.type,
        JSON.stringify(event.payload),
        event.redeliveryOf ?? null,
      ],
    );
    if (!row) continue;
    await enqueueJob(db, {
      kind: DELIVERY_JOB_KIND,
      userId,
      idempotencyKey: `developer-webhook:${row.id}`,
      payload: { deliveryId: row.id },
      maxAttempts: DEVELOPER_WEBHOOK_MAX_ATTEMPTS,
    });
    deliveries.push(toDelivery(row));
  }
  return deliveries;
}

function eventEnvelope(type: string, data: Record<string, unknown>) {
  const id = randomUUID();
  return {
    id,
    type,
    payload: {
      object: 'event',
      id,
      type,
      created_at: Math.floor(Date.now() / 1000),
      data,
    },
  };
}

function attemptAfterResponse(
  userId: string,
  deliveries: readonly DeveloperWebhookDelivery[],
): void {
  if (deliveries.length === 0) return;
  after(async () => {
    const db = createClaimedUserScopedDb(getNeonDb(), { userId, organizationId: null });
    for (const delivery of deliveries) {
      await attemptDeveloperWebhookDelivery(db, userId, delivery.id, false).catch(
        (error: unknown) => {
          logger.warn(
            { error, deliveryId: delivery.id },
            'First webhook attempt failed; the queued job retries it',
          );
        },
      );
    }
  });
}

export async function queueDeveloperWebhookEvent(
  db: DatabaseAdapter,
  userId: string,
  type: DeveloperWebhookEventType,
  data: Record<string, unknown>,
  options: { attemptAfterResponse: boolean } = { attemptAfterResponse: true },
): Promise<void> {
  try {
    const endpoints = await db.query<{ id: string }>(
      `select id
         from public.developer_webhook_endpoints
        where user_id = $1
          and enabled
          and $2 = any(event_types)`,
      [userId, type],
    );
    if (endpoints.length === 0) return;
    const deliveries = await recordDeliveries(
      db,
      userId,
      endpoints.map((endpoint) => endpoint.id),
      eventEnvelope(type, data),
    );
    if (options.attemptAfterResponse) attemptAfterResponse(userId, deliveries);
  } catch (error) {
    logger.error({ error, userId, type }, 'Developer webhook event was not queued');
  }
}

export async function sendWebhookTestEvent(
  db: DatabaseAdapter,
  userId: string,
  endpointId: string,
): Promise<DeveloperWebhookDelivery> {
  const [endpoint] = await db.query<{ id: string }>(
    `select id from public.developer_webhook_endpoints where id = $1 and user_id = $2`,
    [endpointId, userId],
  );
  if (!endpoint) throw createError.notFound('That endpoint does not exist.');
  const [delivery] = await recordDeliveries(
    db,
    userId,
    [endpoint.id],
    eventEnvelope(DEVELOPER_WEBHOOK_TEST_EVENT, { endpoint_id: endpoint.id }),
  );
  if (!delivery) throw createError.internal('The test event could not be queued.');
  attemptAfterResponse(userId, [delivery]);
  return delivery;
}

export async function redeliverWebhook(
  db: DatabaseAdapter,
  userId: string,
  endpointId: string,
  deliveryId: string,
): Promise<DeveloperWebhookDelivery> {
  const [original] = await db.query<{
    id: string;
    event_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }>(
    `select id, event_id, event_type, payload
       from public.developer_webhook_deliveries
      where id = $1
        and endpoint_id = $2
        and user_id = $3`,
    [deliveryId, endpointId, userId],
  );
  if (!original) throw createError.notFound('That delivery does not exist.');
  const [delivery] = await recordDeliveries(db, userId, [endpointId], {
    id: original.event_id,
    type: original.event_type,
    payload: original.payload,
    redeliveryOf: original.id,
  });
  if (!delivery) throw createError.internal('The delivery could not be queued again.');
  attemptAfterResponse(userId, [delivery]);
  return delivery;
}

async function postWebhook(
  url: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number | null; error: string | null }> {
  try {
    await assertResolvedPublicHostname(url);
    const response = await pinnedPublicFetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    await response.body?.cancel().catch(() => undefined);
    if (response.status >= 200 && response.status < 300) {
      return { status: response.status, error: null };
    }
    if (response.status >= 300 && response.status < 400) {
      return {
        status: response.status,
        error: `The endpoint answered ${response.status}; redirects are not followed.`,
      };
    }
    return { status: response.status, error: `The endpoint answered ${response.status}.` };
  } catch (error) {
    if (error instanceof EgressPolicyError) {
      return { status: null, error: 'The endpoint now resolves to a private address.' };
    }
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return {
      status: null,
      error: timedOut
        ? `The endpoint did not answer within ${DEVELOPER_WEBHOOK_TIMEOUT_SECONDS} seconds.`
        : 'The endpoint could not be reached.',
    };
  }
}

type DeliveryAttempt =
  | { outcome: 'delivered'; status: number | null }
  | { outcome: 'failed'; error: string }
  | { outcome: 'skipped'; reason: string };

export async function attemptDeveloperWebhookDelivery(
  db: DatabaseAdapter,
  userId: string,
  deliveryId: string,
  isFinalAttempt: boolean,
): Promise<DeliveryAttempt> {
  const [row] = await db.query<{
    id: string;
    event_id: string;
    status: DeveloperWebhookDelivery['status'];
    payload: Record<string, unknown>;
    endpoint_id: string;
    url: string;
    secret_enc: string;
    enabled: boolean;
  }>(
    `select d.id, d.event_id, d.status, d.payload, e.id as endpoint_id, e.url, e.secret_enc, e.enabled
       from public.developer_webhook_deliveries d
       join public.developer_webhook_endpoints e
         on e.id = d.endpoint_id
        and e.user_id = d.user_id
      where d.id = $1
        and d.user_id = $2`,
    [deliveryId, userId],
  );
  if (!row) return { outcome: 'skipped', reason: 'endpoint_removed' };
  if (row.status === 'delivered') return { outcome: 'skipped', reason: 'already_delivered' };

  if (!row.enabled) {
    await db.query(
      `update public.developer_webhook_deliveries
          set status = 'failed', error = $3, last_attempt_at = now()
        where id = $1 and user_id = $2`,
      [row.id, userId, 'The endpoint was turned off before this event was sent.'],
    );
    return { outcome: 'skipped', reason: 'endpoint_disabled' };
  }

  const secret = openEnvelope(keyRingFor(userId), row.secret_enc, 'hex-triple', {
    value: secretContext(row.endpoint_id),
    acceptUnbound: false,
  }).plaintext;
  const body = JSON.stringify(row.payload);
  const result = await postWebhook(
    row.url,
    webhookDeliveryHeaders({
      secret,
      messageId: row.event_id,
      timestamp: Math.floor(Date.now() / 1000),
      body,
    }),
    body,
  );
  const delivered = result.error === null;
  await db.query(
    `update public.developer_webhook_deliveries
        set status = $3,
            attempts = attempts + 1,
            response_status = $4,
            error = $5,
            last_attempt_at = now(),
            delivered_at = case when $6::boolean then now() else delivered_at end
      where id = $1 and user_id = $2 and status <> 'delivered'`,
    [
      row.id,
      userId,
      delivered ? 'delivered' : isFinalAttempt ? 'failed' : 'pending',
      result.status,
      result.error?.slice(0, ERROR_MAX) ?? null,
      delivered,
    ],
  );
  return delivered
    ? { outcome: 'delivered', status: result.status }
    : { outcome: 'failed', error: result.error ?? 'The endpoint did not accept the event' };
}

export async function deliverDeveloperWebhookJob(
  context: JobHandlerContext,
): Promise<Record<string, unknown>> {
  const userId = context.job.userId;
  const deliveryId = context.job.payload['deliveryId'];
  if (!userId || typeof deliveryId !== 'string') {
    throw new PermanentJobError('Webhook delivery job carries no account or delivery');
  }
  const db = createClaimedUserScopedDb(context.db, { userId, organizationId: null });
  const attempt = await attemptDeveloperWebhookDelivery(
    db,
    userId,
    deliveryId,
    context.isFinalAttempt,
  );
  if (attempt.outcome === 'failed') throw new Error(attempt.error);
  return attempt.outcome === 'delivered'
    ? { delivered: true, status: attempt.status }
    : { skipped: attempt.reason };
}
