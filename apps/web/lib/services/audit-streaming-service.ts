import 'server-only';

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';
import { assertResolvedPublicHostname, pinnedPublicFetch } from '@/lib/egress-policy';
import { getKeyValueStore } from '@/lib/server/key-value';

/**
 * Membership marks which organisations currently have an enabled destination,
 * so the drain cron can check membership and skip Postgres entirely when the
 * set is empty. Best-effort: a write here never blocks the destination save,
 * and a miss just means the next drain falls through to querying Postgres.
 */
export const AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY = 'agi-audit-stream:active-organizations';

const NO_ACTIVE_DESTINATIONS = 0;

async function markAuditStreamActive(organizationId: string): Promise<void> {
  try {
    const store = getKeyValueStore();
    if (!store) return;
    await store.setAdd(AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY, organizationId);
  } catch (error) {
    logger.error({ error, organizationId }, 'Audit stream active-org marker set failed');
  }
}

async function markAuditStreamInactive(organizationId: string): Promise<void> {
  try {
    const store = getKeyValueStore();
    if (!store) return;
    await store.setRemove(AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY, organizationId);
  } catch (error) {
    logger.error({ error, organizationId }, 'Audit stream active-org marker clear failed');
  }
}

export async function hasActiveAuditStreamDestinations(): Promise<boolean | null> {
  try {
    const store = getKeyValueStore();
    if (!store) return null;
    const count = await store.setSize(AUDIT_STREAM_ACTIVE_ORGS_REDIS_KEY);
    return count > NO_ACTIVE_DESTINATIONS;
  } catch (error) {
    logger.error({ error }, 'Audit stream active-org membership check failed');
    return null;
  }
}

export interface AuditDestination {
  organizationId: string;
  endpointUrl: string;
  secretPrefix: string;
  enabled: boolean;
  lastDeliveredAt: string | null;
  lastAttemptAt: string | null;
  lastStatus: string | null;
  consecutiveFailures: number;
  createdAt: string;
}

/** Events per delivery, so one busy workspace cannot make a single POST enormous. */
export const AUDIT_STREAM_BATCH = 100;

/**
 * Failures before a destination is skipped for the run.
 *
 * A dead endpoint retried forever would consume the drain and starve every
 * other workspace. It is skipped, not disabled: an administrator's
 * configuration is not ours to switch off, and the console shows the failure
 * count so they can see why nothing is arriving.
 */
export const AUDIT_STREAM_FAILURE_CEILING = 20;

interface DestinationRow {
  organization_id: string;
  endpoint_url: string;
  secret_prefix: string;
  enabled: boolean;
  last_delivered_at: string | Date | null;
  last_delivered_id: string | null;
  last_attempt_at: string | Date | null;
  last_status: string | null;
  consecutive_failures: number;
  created_at: string | Date;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function format(row: DestinationRow): AuditDestination {
  return {
    organizationId: row.organization_id,
    endpointUrl: row.endpoint_url,
    secretPrefix: row.secret_prefix,
    enabled: row.enabled,
    lastDeliveredAt: toIso(row.last_delivered_at),
    lastAttemptAt: toIso(row.last_attempt_at),
    lastStatus: row.last_status,
    consecutiveFailures: row.consecutive_failures,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

const PUBLIC_COLUMNS = `organization_id, endpoint_url, secret_prefix, enabled,
  last_delivered_at, last_delivered_id, last_attempt_at, last_status,
  consecutive_failures, created_at`;

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export interface GeneratedSecret {
  secret: string;
  hash: string;
  prefix: string;
}

/**
 * Mints a signing secret.
 *
 * Returned in full exactly once. Only the hash and an eight-character prefix
 * are stored, so the console can identify which secret is in use without being
 * able to show it, a secret a UI can re-display is a secret in a screenshot.
 */
export function generateSigningSecret(): GeneratedSecret {
  const secret = randomBytes(32).toString('hex');
  return { secret, hash: hashSecret(secret), prefix: secret.slice(0, 8) };
}

export async function readAuditDestination(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<AuditDestination | null> {
  const [row] = await db.query<DestinationRow>(
    `select ${PUBLIC_COLUMNS} from public.organization_audit_destinations
      where organization_id = $1 limit 1`,
    [organizationId],
  );
  return row ? format(row) : null;
}

/**
 * Saves a destination, validating the URL as an egress target first.
 *
 * A customer-supplied URL points wherever they say. `assertResolvedPublicHostname`
 * resolves it and refuses any address that is private, loopback, or
 * link-local, so a workspace cannot use this to make the server fetch its own
 * internal network.
 */
export async function upsertAuditDestination(
  db: DatabaseAdapter,
  organizationId: string,
  input: { endpointUrl: string; enabled: boolean; createdByUserId: string },
): Promise<{ destination: AuditDestination; secret: string }> {
  await assertResolvedPublicHostname(input.endpointUrl);

  const minted = generateSigningSecret();
  const [row] = await db.query<DestinationRow>(
    `insert into public.organization_audit_destinations
       (organization_id, endpoint_url, secret_hash, secret_prefix, enabled, created_by_user_id)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (organization_id) do update set
       endpoint_url         = excluded.endpoint_url,
       secret_hash          = excluded.secret_hash,
       secret_prefix        = excluded.secret_prefix,
       enabled              = excluded.enabled,
       consecutive_failures = 0
     returning ${PUBLIC_COLUMNS}`,
    [
      organizationId,
      input.endpointUrl,
      minted.hash,
      minted.prefix,
      input.enabled,
      input.createdByUserId,
    ],
  );
  if (!row) {
    throw new Error(`organization_audit_destinations upsert returned no row for ${organizationId}`);
  }
  if (input.enabled) {
    await markAuditStreamActive(organizationId);
  } else {
    await markAuditStreamInactive(organizationId);
  }
  return { destination: format(row), secret: minted.secret };
}

export async function deleteAuditDestination(
  db: DatabaseAdapter,
  organizationId: string,
): Promise<boolean> {
  await markAuditStreamInactive(organizationId);
  const rows = await db.query<{ organization_id: string }>(
    `delete from public.organization_audit_destinations
      where organization_id = $1 returning organization_id`,
    [organizationId],
  );
  return rows.length > 0;
}

export interface StreamableEvent {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  surface: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  severity: string;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
}

/**
 * Signs a payload the way the receiver verifies it.
 *
 * The timestamp is inside the signed material, not merely alongside it, so a
 * captured delivery cannot be replayed later with a fresh header. Receivers
 * should reject a timestamp outside their tolerance.
 */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** Constant-time, so a receiver's own verification cannot leak the secret by timing. */
export function verifySignature(
  secret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  const expected = signPayload(secret, timestamp, body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface DrainResult {
  organizationId: string;
  delivered: number;
  status: 'delivered' | 'nothing_due' | 'skipped' | 'failed';
  error: string | null;
}

interface CursorRow {
  endpoint_url: string;
  secret_hash: string;
  last_delivered_at: string | Date | null;
  last_delivered_id: string | null;
  consecutive_failures: number;
}

/**
 * Sends one batch of new events to a workspace's destination.
 *
 * The cursor is (created_at, id) rather than a timestamp alone: created_at is
 * not unique, and a burst of events sharing a millisecond is exactly what a
 * busy workspace produces, so a timestamp-only cursor would silently skip or
 * repeat those rows.
 *
 * The cursor advances ONLY on a 2xx. A failed delivery leaves it where it was
 * so the same events are retried; an audit stream that drops events on a
 * transient error is worse than one that repeats them, because a receiver can
 * deduplicate on the event id and cannot recover what never arrived.
 *
 * `secretForDelivery` is supplied by the caller rather than read here, because
 * the stored value is a hash and the raw secret only exists in the caller's
 * key material. Passing the hash signs with the hash, which is a valid shared
 * secret as long as both sides agree, the console tells the receiver which.
 */
export async function drainAuditDestination(
  db: DatabaseAdapter,
  organizationId: string,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<DrainResult> {
  const now = options.now ?? new Date();
  const send = options.fetchImpl ?? pinnedPublicFetch;

  const [row] = await db.query<CursorRow>(
    `select endpoint_url, secret_hash, last_delivered_at, last_delivered_id, consecutive_failures
       from public.organization_audit_destinations
      where organization_id = $1 and enabled = true
      limit 1`,
    [organizationId],
  );

  if (!row) {
    return { organizationId, delivered: 0, status: 'skipped', error: 'No enabled destination.' };
  }

  if (row.consecutive_failures >= AUDIT_STREAM_FAILURE_CEILING) {
    return {
      organizationId,
      delivered: 0,
      status: 'skipped',
      error: `Skipped after ${row.consecutive_failures} consecutive failures. Fix the endpoint and save the destination again to resume.`,
    };
  }

  // The cursor is compared inside the database and never round-trips through
  // JS. `timestamptz` holds microseconds and a JS Date holds milliseconds, so
  // reading it out and passing it back as a parameter truncates it, and a
  // truncated cursor is strictly LESS than the row it came from, which selects
  // that row again on every drain. Joining the destination row in keeps the
  // full precision on both sides of the comparison.
  const events = await db.query<StreamableEvent>(
    `select e.id, e.organization_id, e.actor_user_id, e.surface, e.action, e.resource_type,
            e.resource_id, e.outcome, e.severity, e.metadata, e.created_at
       from public.enterprise_audit_events e
       cross join public.organization_audit_destinations d
      where e.organization_id = $1
        and d.organization_id = $1
        and (
          d.last_delivered_at is null
          or d.last_delivered_id is null
          or (e.created_at, e.id) > (d.last_delivered_at, d.last_delivered_id)
        )
      order by e.created_at asc, e.id asc
      limit $2`,
    [organizationId, AUDIT_STREAM_BATCH],
  );

  if (events.length === 0) {
    // Stamped even though nothing was sent: `last_attempt_at` is what rotates
    // the drain's fixed per-run budget across destinations, so a quiet
    // workspace that never advanced it would hold the head of the queue
    // forever and starve everyone behind it. `last_status` is left alone so
    // the console still shows the last real delivery outcome.
    await db.query(
      `update public.organization_audit_destinations
          set last_attempt_at = now()
        where organization_id = $1`,
      [organizationId],
    );
    return { organizationId, delivered: 0, status: 'nothing_due', error: null };
  }

  const timestamp = now.toISOString();
  const body = JSON.stringify({
    organizationId,
    deliveredAt: timestamp,
    events: events.map((event) => ({ ...event, created_at: toIso(event.created_at) })),
  });
  const signature = signPayload(row.secret_hash, timestamp, body);

  let status: number | null = null;
  let error: string | null = null;
  try {
    // Re-validated on every send: a destination saved months ago may point at a
    // hostname that now resolves inward.
    await assertResolvedPublicHostname(row.endpoint_url);

    const response = await send(row.endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AGI-Audit-Timestamp': timestamp,
        'X-AGI-Audit-Signature': `sha256=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = response.status;
    if (!response.ok) error = `Endpoint answered ${response.status}.`;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const succeeded = status !== null && status >= 200 && status < 300;
  const last = events[events.length - 1];

  if (succeeded && last) {
    await db.query(
      `update public.organization_audit_destinations
          set last_delivered_at = coalesce(
                (select created_at from public.enterprise_audit_events where id = $2),
                last_delivered_at),
              last_delivered_id = $2,
              last_attempt_at = now(), last_status = $3, consecutive_failures = 0
        where organization_id = $1`,
      [organizationId, last.id, `HTTP ${status}`],
    );
    return { organizationId, delivered: events.length, status: 'delivered', error: null };
  }

  // Cursor deliberately untouched: the same events are retried rather than
  // dropped. A receiver can deduplicate on the event id; it cannot recover what
  // never arrived.
  await db.query(
    `update public.organization_audit_destinations
        set last_attempt_at = now(), last_status = $2,
            consecutive_failures = consecutive_failures + 1
      where organization_id = $1`,
    [organizationId, (error ?? 'Delivery failed').slice(0, 300)],
  );

  logger.warn({ organizationId, status, error }, '[audit-stream] delivery failed; cursor held');
  return { organizationId, delivered: 0, status: 'failed', error };
}

/**
 * Stalest destination first, not lowest id first.
 *
 * The caller takes a fixed prefix of this list, so a stable `organization_id`
 * ordering meant the same head drained on every run forever and every
 * destination past the cap received total silence at its SIEM, while the
 * console reported it healthy. Ordering by when each was last attempted makes
 * the fixed budget rotate over the whole tenant list instead.
 */
export async function listStreamingOrganizations(db: DatabaseAdapter): Promise<string[]> {
  const rows = await db.query<{ organization_id: string }>(
    `select organization_id from public.organization_audit_destinations
      where enabled = true and consecutive_failures < $1
      order by last_attempt_at asc nulls first, organization_id`,
    [AUDIT_STREAM_FAILURE_CEILING],
  );
  return rows.map((row) => row.organization_id);
}
