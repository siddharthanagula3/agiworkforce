import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  PLATFORM_EVENT_TRIGGER_RUNS_PER_DAY,
  PLATFORM_EVENT_TRIGGER_RUNS_PER_HOUR,
} from '@agiworkforce/types';

import {
  UNATTENDED_RUN_DENIED_STATUSES,
  ownerMayRunUnattendedSql,
} from '@/lib/auth/account-lifecycle';
import { evaluateFieldConditions } from '@/lib/automation/field-conditions';
import { enqueueJob } from '@/lib/jobs/job-service';
import { logger } from '@/lib/logger';
import {
  MEMBERSHIP_STATUSES_THAT_MAY_ACT,
  ownerIsActiveWorkspaceMemberSql,
} from '@/lib/server/workspace-scope';
import { recordNotification } from '@/lib/services/notification-service';

import { mapTrigger, type TriggerRow } from './trigger-service';
import { hashVerificationCode } from './trigger-signatures';
import { eventTypeMatchCandidates, type EventTrigger, type TriggerEvent } from './trigger-types';

const MAX_TRIGGERS_PER_EVENT = 20;
const MAX_EVENT_DATA_BYTES = 16_384;

export interface TriggerIngestOutcome {
  triggerId: string;
  outcome: 'filtered' | 'debounced' | 'enqueued' | 'duplicate';
  detail: string | null;
  jobId?: string;
}

function boundedEventData(data: Record<string, unknown>): Record<string, unknown> {
  const encoded = JSON.stringify(data);
  if (encoded.length <= MAX_EVENT_DATA_BYTES) return data;
  return { truncated: true, preview: encoded.slice(0, MAX_EVENT_DATA_BYTES) };
}

const OWNER_ACCOUNT_MAY_ACT = ownerMayRunUnattendedSql('trigger.user_id', 7);
const OWNER_IS_A_MEMBER = ownerIsActiveWorkspaceMemberSql(
  'trigger.user_id',
  'trigger.organization_id',
  8,
);

function triggerMatchStatement(membershipNegation: '' | 'not '): string {
  return `select trigger.*
       from event_triggers as trigger
       join scheduled_tasks as task
         on task.id = trigger.task_id and task.user_id = trigger.user_id
      where trigger.is_enabled = true
        and trigger.source = $1
        and (
          ($2::text is not null and trigger.source_account = $2)
          or ($3::uuid is not null and trigger.id = $3)
        )
        and trigger.event_types && $4::text[]
        and (
          trigger.source <> 'github'
          or exists (
            select 1 from github_installations as installation
             where installation.installation_id = $5
               and installation.user_id = trigger.user_id
          )
        )
        and ${OWNER_ACCOUNT_MAY_ACT}
        and ${membershipNegation}${OWNER_IS_A_MEMBER}
      order by trigger.created_at asc
      limit $6`;
}

function triggerMatchParams(event: TriggerEvent): unknown[] {
  return [
    event.source,
    event.account,
    event.triggerId,
    eventTypeMatchCandidates(event.type),
    event.installationId,
    MAX_TRIGGERS_PER_EVENT,
    UNATTENDED_RUN_DENIED_STATUSES,
    MEMBERSHIP_STATUSES_THAT_MAY_ACT,
  ];
}

// An event that matched a trigger whose owner has left the workspace fires
// nothing, so the reason is named rather than read as a delivery that went missing.
async function reportTriggersLeftByDepartedMembers(
  db: DatabaseAdapter,
  event: TriggerEvent,
): Promise<void> {
  const skipped = await db.query<{ id: string }>(
    triggerMatchStatement('not '),
    triggerMatchParams(event),
  );
  if (skipped.length === 0) return;
  logger.warn(
    {
      skipped: 'owner_not_a_member',
      count: skipped.length,
      triggerIds: skipped.map((row) => row.id),
      source: event.source,
    },
    'Event triggers did not fire: their owner is no longer an active member of the workspace',
  );
}

async function matchingTriggers(db: DatabaseAdapter, event: TriggerEvent): Promise<EventTrigger[]> {
  const rows = await db.query<TriggerRow>(triggerMatchStatement(''), triggerMatchParams(event));
  if (rows.length === 0) await reportTriggersLeftByDepartedMembers(db, event);
  return rows.map(mapTrigger);
}

async function recordDelivery(
  db: DatabaseAdapter,
  trigger: EventTrigger,
  event: TriggerEvent,
): Promise<string | null> {
  const [row] = await db.query<{ id: string }>(
    `insert into event_trigger_events (
       trigger_id, user_id, organization_id, source, event_type, delivery_id, outcome
     ) values ($1, $2, $3, $4, $5, $6, 'received')
     on conflict (trigger_id, delivery_id) do nothing
     returning id`,
    [
      trigger.id,
      trigger.userId,
      trigger.organizationId,
      event.source,
      event.type,
      event.deliveryId,
    ],
  );
  return row?.id ?? null;
}

export async function settleTriggerDelivery(
  db: DatabaseAdapter,
  eventId: string,
  outcome: 'filtered' | 'debounced' | 'enqueued' | 'fired' | 'failed' | 'dead',
  detail: string | null,
  refs: { jobId?: string | null; runId?: string | null } = {},
): Promise<void> {
  await db.execute(
    `update event_trigger_events
        set outcome = $2, detail = $3,
            job_id = coalesce($4::uuid, job_id),
            run_id = coalesce($5::uuid, run_id),
            updated_at = now()
      where id = $1 and user_id is not null`,
    [eventId, outcome, detail?.slice(0, 2_000) ?? null, refs.jobId ?? null, refs.runId ?? null],
  );
}

async function claimDebounce(db: DatabaseAdapter, trigger: EventTrigger): Promise<boolean> {
  const affected = await db.execute(
    `update event_triggers
        set last_fired_at = now(), updated_at = now()
      where id = $1
        and user_id = $2
        and (
          debounce_seconds = 0
          or last_fired_at is null
          or last_fired_at <= now() - make_interval(secs => debounce_seconds)
        )`,
    [trigger.id, trigger.userId],
  );
  return affected === 1;
}

interface EventRunCap {
  window: 'hour' | 'day';
  limit: number;
}

type EventRunClaim =
  | { outcome: 'enqueued'; jobId: string }
  | { outcome: 'debounced'; detail: string; cap: EventRunCap | null };

async function reachedEventRunCap(
  db: DatabaseAdapter,
  userId: string,
): Promise<EventRunCap | null> {
  const [row] = await db.query<{ last_hour: number | string; last_day: number | string }>(
    `select count(*) filter (where received_at > now() - interval '1 hour') as last_hour,
            count(*) as last_day
       from event_trigger_events
      where user_id = $1
        and received_at > now() - interval '1 day'
        and (
          outcome = any (array['enqueued', 'fired', 'dead'])
          or (outcome = 'failed' and run_id is not null)
        )`,
    [userId],
  );
  if (Number(row?.last_day ?? 0) >= PLATFORM_EVENT_TRIGGER_RUNS_PER_DAY) {
    return { window: 'day', limit: PLATFORM_EVENT_TRIGGER_RUNS_PER_DAY };
  }
  if (Number(row?.last_hour ?? 0) >= PLATFORM_EVENT_TRIGGER_RUNS_PER_HOUR) {
    return { window: 'hour', limit: PLATFORM_EVENT_TRIGGER_RUNS_PER_HOUR };
  }
  return null;
}

function eventRunCapPeriod(cap: EventRunCap): string {
  return cap.window === 'hour' ? 'the last hour' : 'the last 24 hours';
}

async function announceEventRunCap(
  db: DatabaseAdapter,
  trigger: EventTrigger,
  cap: EventRunCap,
): Promise<void> {
  const slot = new Date().toISOString().slice(0, cap.window === 'hour' ? 13 : 10);
  await recordNotification(db, {
    userId: trigger.userId,
    category: 'schedule',
    severity: 'warning',
    title:
      cap.window === 'hour'
        ? 'Event-triggered tasks reached the hourly limit'
        : 'Event-triggered tasks reached the daily limit',
    message:
      `Your event-triggered tasks started ${cap.limit} runs in ${eventRunCapPeriod(cap)}, ` +
      'the most allowed. Events that arrive before that count drops are recorded without ' +
      'starting a run.',
    target: { kind: 'schedule', id: trigger.taskId },
    dedupeKey: `event-trigger-cap:${cap.window}:${slot}`,
  });
}

async function claimEventRun(
  tx: DatabaseAdapter,
  trigger: EventTrigger,
  event: TriggerEvent,
  eventId: string,
): Promise<EventRunClaim> {
  await tx.query(
    `select pg_advisory_xact_lock(hashtextextended('agi:event-trigger-runs:' || $1, 0))`,
    [trigger.userId],
  );
  const cap = await reachedEventRunCap(tx, trigger.userId);
  if (cap) {
    const detail =
      `Not run: your event-triggered tasks already started ${cap.limit} runs in ` +
      `${eventRunCapPeriod(cap)}, the most allowed`;
    await settleTriggerDelivery(tx, eventId, 'debounced', detail);
    return { outcome: 'debounced', detail, cap };
  }

  if (!(await claimDebounce(tx, trigger))) {
    const detail = `Debounced: this trigger fired less than ${trigger.debounceSeconds}s ago`;
    await settleTriggerDelivery(tx, eventId, 'debounced', detail);
    return { outcome: 'debounced', detail, cap: null };
  }

  const job = await enqueueJob(tx, {
    kind: 'event-triggers.fire',
    userId: trigger.userId,
    organizationId: trigger.organizationId,
    idempotencyKey: `trigger-event:${eventId}`,
    maxAttempts: trigger.maxAttempts,
    payload: {
      triggerId: trigger.id,
      eventId,
      event: {
        source: event.source,
        type: event.type,
        deliveryId: event.deliveryId,
        occurredAt: event.occurredAt,
        data: boundedEventData(event.data),
      },
    },
  });
  await settleTriggerDelivery(tx, eventId, 'enqueued', null, { jobId: job.id });
  return { outcome: 'enqueued', jobId: job.id };
}

async function verifySlackOwnership(
  db: DatabaseAdapter,
  trigger: EventTrigger,
  event: TriggerEvent,
): Promise<boolean> {
  const text = typeof event.data['text'] === 'string' ? event.data['text'] : '';
  const codes = text.match(/[0-9a-f]{12}/gi) ?? [];
  if (codes.length === 0) return false;
  for (const code of codes) {
    const affected = await db.execute(
      `update event_triggers
          set verification_status = 'verified', verified_at = now(),
              verification_code_sha256 = null, updated_at = now()
        where id = $1 and user_id = $2 and verification_status = 'pending'
          and verification_code_sha256 = $3`,
      [trigger.id, trigger.userId, hashVerificationCode(code)],
    );
    if (affected === 1) return true;
  }
  return false;
}

export async function ingestTriggerEvent(
  db: DatabaseAdapter,
  event: TriggerEvent,
): Promise<TriggerIngestOutcome[]> {
  const triggers = await matchingTriggers(db, event);
  const outcomes: TriggerIngestOutcome[] = [];

  for (const trigger of triggers) {
    const eventId = await recordDelivery(db, trigger, event);
    if (!eventId) {
      outcomes.push({ triggerId: trigger.id, outcome: 'duplicate', detail: null });
      continue;
    }

    if (trigger.verificationStatus !== 'verified') {
      const verified =
        trigger.source === 'slack' && (await verifySlackOwnership(db, trigger, event));
      const detail = verified
        ? 'Ownership verified by this delivery; the next event starts a run'
        : 'Waiting for ownership of this account to be verified';
      await settleTriggerDelivery(db, eventId, 'filtered', detail);
      outcomes.push({ triggerId: trigger.id, outcome: 'filtered', detail });
      continue;
    }

    if (!evaluateFieldConditions(trigger.conditions, event)) {
      const detail = 'The event did not match the trigger conditions';
      await settleTriggerDelivery(db, eventId, 'filtered', detail);
      outcomes.push({ triggerId: trigger.id, outcome: 'filtered', detail });
      continue;
    }

    let claim: EventRunClaim;
    try {
      claim = await db.transaction((tx) => claimEventRun(tx, trigger, event, eventId));
    } catch (error) {
      const detail = `The run could not be queued: ${error instanceof Error ? error.message : String(error)}`;
      logger.error({ error, triggerId: trigger.id }, 'Event trigger could not queue its run');
      await settleTriggerDelivery(db, eventId, 'failed', detail);
      outcomes.push({ triggerId: trigger.id, outcome: 'filtered', detail });
      continue;
    }

    if (claim.outcome === 'enqueued') {
      outcomes.push({
        triggerId: trigger.id,
        outcome: 'enqueued',
        detail: null,
        jobId: claim.jobId,
      });
      continue;
    }
    if (claim.cap) {
      logger.warn(
        { triggerId: trigger.id, window: claim.cap.window, limit: claim.cap.limit },
        'Event trigger held back: its owner reached the event-triggered run limit',
      );
      await announceEventRunCap(db, trigger, claim.cap);
    }
    outcomes.push({ triggerId: trigger.id, outcome: 'debounced', detail: claim.detail });
  }

  return outcomes;
}
