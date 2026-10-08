import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import { resolveConnectorAccessToken } from '@/lib/connectors/oauth-access';
import { canonicalConnectorScope } from '@/lib/connectors/oauth-scope-allowlist';
import { logger } from '@/lib/logger';
import {
  MEMBERSHIP_STATUSES_THAT_MAY_ACT,
  ownerIsActiveWorkspaceMemberSql,
} from '@/lib/server/workspace-scope';
import { decodeHtmlEntities } from '@/lib/url-fetch/url-fetch-tool';

import { ingestTriggerEvent } from './trigger-ingest';
import { mapTrigger, type TriggerRow } from './trigger-service';
import { GMAIL_TRIGGER_EVENT_TYPES, type EventTrigger } from './trigger-types';

export const GMAIL_PUBSUB_TOPIC_ENV = 'GMAIL_PUBSUB_TOPIC';

const GMAIL_CONNECTOR_ID = 'gmail';
const GMAIL_USERS_API = 'https://gmail.googleapis.com/gmail/v1/users';
const GMAIL_READ_SCOPES: ReadonlySet<string> = new Set([
  'https://mail.google.com/',
  'gmail.modify',
  'gmail.readonly',
  'gmail.metadata',
]);
const WATCHED_LABEL = 'INBOX';
const GMAIL_REQUEST_TIMEOUT_MS = 10_000;
const MAX_HISTORY_RECORDS_PER_READ = 10;
const MAX_MESSAGES_PER_READ = 20;
const MAX_TRIGGERS_PER_NOTICE = 20;
const MAX_WATCHES_PER_RENEWAL = 200;
const RENEWAL_CONCURRENCY = 5;
const MAX_HEADER_CHARS = 320;
const MAX_SNIPPET_CHARS = 500;
const MESSAGE_HEADERS = ['From', 'To', 'Subject'] as const;

const OWNER_ACCOUNT_MAY_ACT = ownerMayRunUnattendedSql('trigger.user_id', 2);
const OWNER_IS_A_MEMBER = ownerIsActiveWorkspaceMemberSql(
  'trigger.user_id',
  'trigger.organization_id',
  3,
);

const WATCH_ERRORS = {
  notConfigured: 'Gmail triggers are not set up on this server yet.',
  notConnected: 'Connect Gmail in Connectors, then try again.',
  reconnect: 'Reconnect Gmail in Connectors, then try again.',
  noReadAccess:
    'The connected Gmail account has not allowed reading mail. Reconnect Gmail in Connectors and allow it.',
  refused: 'Gmail refused to watch this mailbox. Try again later.',
  unreachable: 'Gmail could not be reached. Try again later.',
} as const;

function otherMailboxError(address: string): string {
  return `The Gmail account connected in Connectors is not ${address}. Connect ${address} there, then try again.`;
}

type GmailCall =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; reason: string | null; message: string };

type GmailFailure = Extract<GmailCall, { ok: false }>;

type GmailAccessFailure = { ok: false; error: string };

type GmailSession = (resource: string, body?: Record<string, unknown>) => Promise<GmailCall>;

type WatchOutcome =
  { ok: true; historyId: string; expiresAt: string | null } | { ok: false; error: string };

export interface GmailReadOutcome {
  matched: number;
  queued: number;
  retry: boolean;
}

async function callGmail(
  accessToken: string,
  mailbox: string,
  resource: string,
  body?: Record<string, unknown>,
): Promise<GmailCall> {
  let response: Response;
  try {
    response = await fetch(`${GMAIL_USERS_API}/${encodeURIComponent(mailbox)}/${resource}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(GMAIL_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return { ok: true, body: parsed };
  const detail = (parsed['error'] ?? {}) as {
    message?: unknown;
    errors?: Array<{ reason?: unknown }>;
  };
  const reason = detail.errors?.[0]?.reason;
  return {
    ok: false,
    status: response.status,
    reason: typeof reason === 'string' ? reason : null,
    message: typeof detail.message === 'string' ? detail.message : `HTTP ${response.status}`,
  };
}

function isTransient(call: GmailFailure): boolean {
  return call.status === 0 || call.status === 429 || call.status >= 500;
}

async function gmailAccessToken(
  userId: string,
  forceRefresh: boolean,
): Promise<{ ok: true; accessToken: string } | GmailAccessFailure> {
  const access = await resolveConnectorAccessToken(
    userId,
    GMAIL_CONNECTOR_ID,
    forceRefresh ? { forceRefresh } : {},
  );
  if (access.status === 'ready') {
    const scopes = access.grantedScopes.map(canonicalConnectorScope);
    if (scopes.length > 0 && !scopes.some((scope) => GMAIL_READ_SCOPES.has(scope))) {
      return { ok: false, error: WATCH_ERRORS.noReadAccess };
    }
    return { ok: true, accessToken: access.accessToken };
  }
  if (access.status === 'not-configured') return { ok: false, error: WATCH_ERRORS.notConfigured };
  if (access.status === 'not-connected') return { ok: false, error: WATCH_ERRORS.notConnected };
  if (access.status === 'unreachable') return { ok: false, error: WATCH_ERRORS.unreachable };
  return { ok: false, error: WATCH_ERRORS.reconnect };
}

async function openGmailSession(
  userId: string,
  mailbox: string,
): Promise<{ ok: true; call: GmailSession } | GmailAccessFailure> {
  const access = await gmailAccessToken(userId, false);
  if (!access.ok) return access;
  let accessToken = access.accessToken;
  let refreshed = false;
  const call: GmailSession = async (resource, body) => {
    const first = await callGmail(accessToken, mailbox, resource, body);
    if (first.ok || first.status !== 401 || refreshed) return first;
    refreshed = true;
    const renewed = await gmailAccessToken(userId, true);
    if (!renewed.ok) return first;
    accessToken = renewed.accessToken;
    return callGmail(accessToken, mailbox, resource, body);
  };
  return { ok: true, call };
}

async function watchMailbox(userId: string, address: string): Promise<WatchOutcome> {
  const topicName = process.env[GMAIL_PUBSUB_TOPIC_ENV]?.trim();
  if (!topicName) return { ok: false, error: WATCH_ERRORS.notConfigured };

  const session = await openGmailSession(userId, address);
  if (!session.ok) return session;

  const profile = await session.call('profile');
  if (!profile.ok) {
    logger.warn(
      { event: 'gmail_watch_profile_refused', status: profile.status, reason: profile.reason },
      'Gmail refused the mailbox profile read that proves ownership',
    );
    if (profile.status === 401) return { ok: false, error: WATCH_ERRORS.reconnect };
    if (isTransient(profile)) return { ok: false, error: WATCH_ERRORS.unreachable };
    return {
      ok: false,
      error:
        profile.reason === 'insufficientPermissions'
          ? WATCH_ERRORS.noReadAccess
          : otherMailboxError(address),
    };
  }
  const profileAddress = profile.body['emailAddress'];
  if (typeof profileAddress !== 'string' || profileAddress.toLowerCase() !== address) {
    return { ok: false, error: otherMailboxError(address) };
  }

  const watch = await session.call('watch', {
    topicName,
    labelIds: [WATCHED_LABEL],
    labelFilterBehavior: 'include',
  });
  if (!watch.ok) {
    logger.error(
      { event: 'gmail_watch_refused', status: watch.status, reason: watch.reason },
      watch.message,
    );
    if (watch.status === 401) return { ok: false, error: WATCH_ERRORS.reconnect };
    return {
      ok: false,
      error: isTransient(watch) ? WATCH_ERRORS.unreachable : WATCH_ERRORS.refused,
    };
  }
  const historyId = watch.body['historyId'];
  const expiration = Number(watch.body['expiration']);
  if (typeof historyId !== 'string' || !/^\d{1,20}$/.test(historyId)) {
    return { ok: false, error: WATCH_ERRORS.refused };
  }
  return {
    ok: true,
    historyId,
    expiresAt: Number.isFinite(expiration) ? new Date(expiration).toISOString() : null,
  };
}

async function recordWatchError(
  db: DatabaseAdapter,
  trigger: Pick<EventTrigger, 'id' | 'userId'>,
  error: string,
): Promise<EventTrigger | null> {
  const [row] = await db.query<TriggerRow>(
    `update event_triggers set watch_error = $3
      where id = $1 and user_id = $2 and source = 'gmail'
      returning *`,
    [trigger.id, trigger.userId, error],
  );
  return row ? mapTrigger(row) : null;
}

export async function registerGmailWatch(
  db: DatabaseAdapter,
  trigger: EventTrigger,
  options: { restart: boolean },
): Promise<EventTrigger> {
  if (trigger.source !== 'gmail' || !trigger.sourceAccount) return trigger;
  const outcome = await watchMailbox(trigger.userId, trigger.sourceAccount);
  if (!outcome.ok) return (await recordWatchError(db, trigger, outcome.error)) ?? trigger;

  const [row] = await db.query<TriggerRow>(
    `update event_triggers
        set verification_status = 'verified',
            verified_at = coalesce(verified_at, now()),
            watch_history_id = case
              when $3::boolean or watch_history_id is null then $4
              else watch_history_id
            end,
            watch_expires_at = $5::timestamptz,
            watch_error = null
      where id = $1 and user_id = $2 and source = 'gmail'
      returning *`,
    [trigger.id, trigger.userId, options.restart, outcome.historyId, outcome.expiresAt],
  );
  return row ? mapTrigger(row) : trigger;
}

export async function startGmailWatch(
  db: DatabaseAdapter,
  trigger: EventTrigger,
): Promise<EventTrigger> {
  try {
    return await registerGmailWatch(db, trigger, { restart: true });
  } catch (error) {
    logger.error(
      { event: 'gmail_watch_not_started', triggerId: trigger.id, error },
      'Gmail watch could not be started; the trigger stays pending until it is retried',
    );
    return trigger;
  }
}

export async function releaseGmailWatch(
  db: DatabaseAdapter,
  trigger: Pick<EventTrigger, 'id' | 'userId' | 'source' | 'sourceAccount'>,
): Promise<void> {
  if (trigger.source !== 'gmail' || !trigger.sourceAccount) return;
  const notStopped = 'Gmail watch could not be stopped; it lapses within seven days unless renewed';
  try {
    const [others] = await db.query<{ count: string }>(
      `select count(*)::text as count from event_triggers
        where user_id = $1 and source = 'gmail' and source_account = $2
          and is_enabled = true and id <> $3`,
      [trigger.userId, trigger.sourceAccount, trigger.id],
    );
    if (Number.parseInt(others?.count ?? '0', 10) > 0) return;
    const session = await openGmailSession(trigger.userId, trigger.sourceAccount);
    const stopped = session.ok ? await session.call('stop', {}) : null;
    if (!stopped?.ok) {
      logger.warn({ event: 'gmail_watch_not_stopped', triggerId: trigger.id }, notStopped);
    }
  } catch (error) {
    logger.warn({ event: 'gmail_watch_not_stopped', triggerId: trigger.id, error }, notStopped);
  }
}

function header(message: Record<string, unknown>, name: string): string | null {
  const payload = message['payload'] as { headers?: Array<{ name?: unknown; value?: unknown }> };
  const found = payload?.headers?.find(
    (entry) => typeof entry.name === 'string' && entry.name.toLowerCase() === name.toLowerCase(),
  );
  return typeof found?.value === 'string' ? found.value.slice(0, MAX_HEADER_CHARS) : null;
}

function addedMessageIds(record: Record<string, unknown>): string[] {
  const added = Array.isArray(record['messagesAdded']) ? record['messagesAdded'] : [];
  return added.flatMap((entry) => {
    const id = (entry as { message?: { id?: unknown } }).message?.id;
    return typeof id === 'string' ? [id] : [];
  });
}

async function advanceHistory(
  db: DatabaseAdapter,
  trigger: Pick<EventTrigger, 'id' | 'userId'>,
  historyId: string,
): Promise<void> {
  await db.execute(
    `update event_triggers set watch_history_id = $3, watch_error = null
      where id = $1 and user_id = $2 and source = 'gmail'
        and (watch_history_id is null or watch_history_id::numeric < $3::numeric)`,
    [trigger.id, trigger.userId, historyId],
  );
}

async function readTriggerMailbox(
  db: DatabaseAdapter,
  row: TriggerRow,
  noticeHistoryId: string | null,
): Promise<GmailReadOutcome> {
  const trigger = mapTrigger(row);
  const address = trigger.sourceAccount;
  const startHistoryId = row.watch_history_id ?? null;
  const idle: GmailReadOutcome = { matched: 0, queued: 0, retry: false };
  if (!address) return idle;
  if (!startHistoryId) {
    if (noticeHistoryId) await advanceHistory(db, trigger, noticeHistoryId);
    return idle;
  }

  const session = await openGmailSession(trigger.userId, address);
  if (!session.ok) {
    await recordWatchError(db, trigger, session.error);
    return idle;
  }
  const query = new URLSearchParams({
    startHistoryId,
    historyTypes: 'messageAdded',
    labelId: WATCHED_LABEL,
    maxResults: String(MAX_HISTORY_RECORDS_PER_READ),
  });
  const history = await session.call(`history?${query.toString()}`);
  if (!history.ok) {
    if (history.status === 404) {
      logger.warn(
        { event: 'gmail_history_expired', triggerId: trigger.id },
        'The stored Gmail history id is too old to list from; reading resumes from this notice',
      );
      if (noticeHistoryId) await advanceHistory(db, trigger, noticeHistoryId);
      return idle;
    }
    if (isTransient(history)) return { ...idle, retry: true };
    logger.warn(
      {
        event: 'gmail_history_refused',
        triggerId: trigger.id,
        status: history.status,
        reason: history.reason,
      },
      'Gmail refused the mailbox history read',
    );
    await recordWatchError(
      db,
      trigger,
      history.status === 401 ? WATCH_ERRORS.reconnect : WATCH_ERRORS.refused,
    );
    return idle;
  }

  const records = Array.isArray(history.body['history'])
    ? (history.body['history'] as Record<string, unknown>[])
    : [];
  const messageIds: string[] = [];
  let readThrough: string | null = null;
  let capped = false;
  for (const record of records) {
    const ids = addedMessageIds(record).filter((id) => !messageIds.includes(id));
    if (messageIds.length > 0 && messageIds.length + ids.length > MAX_MESSAGES_PER_READ) {
      capped = true;
      break;
    }
    messageIds.push(...ids);
    if (typeof record['id'] === 'string') readThrough = record['id'];
  }
  const currentHistoryId = history.body['historyId'];
  if (
    !capped &&
    typeof history.body['nextPageToken'] !== 'string' &&
    typeof currentHistoryId === 'string'
  ) {
    readThrough = currentHistoryId;
  }

  const messageQuery = new URLSearchParams({ format: 'metadata' });
  for (const name of MESSAGE_HEADERS) messageQuery.append('metadataHeaders', name);
  const messages = await Promise.all(
    messageIds.map((id) =>
      session.call(`messages/${encodeURIComponent(id)}?${messageQuery.toString()}`),
    ),
  );
  if (messages.some((message) => !message.ok && message.status !== 404)) {
    return { ...idle, retry: true };
  }

  const outcome: GmailReadOutcome = { ...idle };
  for (const [index, message] of messages.entries()) {
    if (!message.ok) continue;
    const messageId = messageIds[index] as string;
    const internalDate = Number(message.body['internalDate']);
    const snippet = typeof message.body['snippet'] === 'string' ? message.body['snippet'] : '';
    const outcomes = await ingestTriggerEvent(db, {
      source: 'gmail',
      type: GMAIL_TRIGGER_EVENT_TYPES[0],
      deliveryId: messageId,
      account: null,
      triggerId: trigger.id,
      installationId: null,
      occurredAt: Number.isFinite(internalDate)
        ? new Date(internalDate).toISOString()
        : new Date().toISOString(),
      data: {
        mailbox: address,
        messageId,
        threadId: typeof message.body['threadId'] === 'string' ? message.body['threadId'] : null,
        from: header(message.body, 'From'),
        to: header(message.body, 'To'),
        subject: header(message.body, 'Subject'),
        snippet: decodeHtmlEntities(snippet).slice(0, MAX_SNIPPET_CHARS),
        labels: Array.isArray(message.body['labelIds']) ? message.body['labelIds'] : [],
      },
    });
    outcome.matched += outcomes.length;
    outcome.queued += outcomes.filter((entry) => entry.outcome === 'enqueued').length;
  }
  if (readThrough) await advanceHistory(db, trigger, readThrough);
  return outcome;
}

export async function readGmailNotice(
  db: DatabaseAdapter,
  notice: { emailAddress: string; historyId: string },
): Promise<GmailReadOutcome> {
  const rows = await db.query<TriggerRow>(
    `select trigger.* from event_triggers as trigger
      where trigger.source = 'gmail'
        and trigger.source_account = $1
        and trigger.is_enabled = true
        and trigger.verification_status = 'verified'
        and ${OWNER_ACCOUNT_MAY_ACT}
        and ${OWNER_IS_A_MEMBER}
      order by trigger.created_at asc
      limit $4`,
    [
      notice.emailAddress,
      UNATTENDED_RUN_DENIED_STATUSES,
      MEMBERSHIP_STATUSES_THAT_MAY_ACT,
      MAX_TRIGGERS_PER_NOTICE,
    ],
  );
  const total: GmailReadOutcome = { matched: 0, queued: 0, retry: false };
  for (const row of rows) {
    const outcome = await readTriggerMailbox(db, row, notice.historyId);
    total.matched += outcome.matched;
    total.queued += outcome.queued;
    total.retry ||= outcome.retry;
  }
  return total;
}

export async function renewGmailWatches(
  db: DatabaseAdapter,
): Promise<{ renewed: number; failed: number; queued: number }> {
  const rows = await db.query<TriggerRow>(
    `select trigger.* from event_triggers as trigger
      where trigger.source = 'gmail'
        and trigger.is_enabled = true
        and ${OWNER_ACCOUNT_MAY_ACT}
        and ${OWNER_IS_A_MEMBER}
      order by trigger.watch_expires_at asc nulls first, trigger.id asc
      limit $1`,
    [MAX_WATCHES_PER_RENEWAL, UNATTENDED_RUN_DENIED_STATUSES, MEMBERSHIP_STATUSES_THAT_MAY_ACT],
  );
  const totals = { renewed: 0, failed: 0, queued: 0 };
  for (let start = 0; start < rows.length; start += RENEWAL_CONCURRENCY) {
    await Promise.all(
      rows.slice(start, start + RENEWAL_CONCURRENCY).map(async (row) => {
        try {
          const renewed = await registerGmailWatch(db, mapTrigger(row), { restart: false });
          if (renewed.watchError || renewed.verificationStatus !== 'verified') {
            totals.failed += 1;
            return;
          }
          totals.renewed += 1;
          if (row.watch_history_id) {
            totals.queued += (await readTriggerMailbox(db, row, null)).queued;
          }
        } catch (error) {
          totals.failed += 1;
          logger.error(
            { event: 'gmail_watch_renewal_failed', triggerId: row.id, error },
            'Gmail watch renewal failed',
          );
        }
      }),
    );
  }
  return totals;
}
