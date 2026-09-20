import 'server-only';

import {
  PRODUCT_ANALYTICS_CONSENT_PURPOSE,
  isProductAnalyticsSurface,
  normalizeProductAnalyticsEvent,
  requiresProductAnalyticsOutcome,
  type ProductAnalyticsEvent,
  type ProductAnalyticsEventName,
  type ProductAnalyticsOutcome,
  type ProductAnalyticsProperties,
  type ProductAnalyticsSurface,
} from '@agiworkforce/types';

import type { NextRequest } from 'next/server';

import { readSurfaceHint } from '@/lib/free-chat-surface-policy';
import { logger } from '@/lib/logger';
import { hasConsent } from '@/lib/server/consent-records';
import { getNeonDb } from '@/lib/server/neon-db';

export interface ProductAnalyticsSubject {
  readonly userId: string;
  readonly organizationId?: string | null;
}

export async function isProductAnalyticsAllowed(userId: string): Promise<boolean> {
  try {
    return await hasConsent(userId, PRODUCT_ANALYTICS_CONSENT_PURPOSE);
  } catch (error) {
    logger.warn({ error }, '[product-analytics] consent could not be read; collecting nothing');
    return false;
  }
}

/**
 * Writes the batch only if the consent ledger says so, and answers with what it
 * wrote. The gate is read here rather than at the caller so that no emitter,
 * on any surface, can be the reason an event is collected without consent.
 */
export async function recordProductAnalyticsEvents(
  subject: ProductAnalyticsSubject,
  events: readonly ProductAnalyticsEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  if (!(await isProductAnalyticsAllowed(subject.userId))) return 0;

  const db = getNeonDb();
  let written = 0;
  for (const event of events) {
    await db.execute(
      `insert into public.product_analytics_events
         (user_id, organization_id, event_name, surface, outcome, properties, occurred_at)
       values ($1, $2::uuid, $3, $4, $5, $6::jsonb, $7)`,
      [
        subject.userId,
        subject.organizationId ?? null,
        event.name,
        event.surface,
        event.outcome ?? null,
        JSON.stringify(event.properties ?? {}),
        event.occurredAt,
      ],
    );
    written += 1;
  }
  await recordAccountMilestones(subject, events);
  return written;
}

const CAPABILITY_MILESTONE_EVENTS: ReadonlySet<ProductAnalyticsEventName> = new Set([
  'file_uploaded',
  'project_created',
  'library_item_opened',
  'research_started',
  'work_started',
  'code_session_started',
  'connector_connected',
  'skill_installed',
  'plugin_installed',
  'remote_session_started',
  'browser_session_started',
  'voice_session_started',
]);

const MILESTONE_EVENTS = ['first_chat', 'first_useful_response', 'activation'] as const;

export const DERIVED_MILESTONE_EVENTS: readonly ProductAnalyticsEventName[] = MILESTONE_EVENTS;

async function readAccountState(userId: string): Promise<ReadonlySet<string>> {
  const rows = await getNeonDb().query<{ event_name: string }>(
    `select distinct event_name
       from public.product_analytics_events
      where user_id = $1
        and event_name = any($2::text[])`,
    [
      userId,
      [...MILESTONE_EVENTS, 'assistant_response', ...CAPABILITY_MILESTONE_EVENTS].filter(
        (name, index, all) => all.indexOf(name) === index,
      ),
    ],
  );
  return new Set(rows.map((row) => row.event_name));
}

async function writeMilestone(
  subject: ProductAnalyticsSubject,
  name: ProductAnalyticsEventName,
  surface: ProductAnalyticsSurface,
  occurredAt: string,
): Promise<void> {
  await getNeonDb().execute(
    `insert into public.product_analytics_events
       (user_id, organization_id, event_name, surface, occurred_at)
     select $1, $2::uuid, $3, $4, $5
      where not exists (
        select 1 from public.product_analytics_events
         where user_id = $1 and event_name = $3
      )`,
    [subject.userId, subject.organizationId ?? null, name, surface, occurredAt],
  );
}

/**
 * The three funnel milestones are derived rather than emitted, so no surface
 * has to remember whether it is the account's first anything, and none of them
 * can disagree:
 *
 * - first_chat is the account's first assistant response of any outcome,
 * - first_useful_response is the first one that actually completed,
 * - activation is the first moment the account has both a completed response
 *   and one capability beyond chat, which is the point the account is using
 *   the product rather than trying it.
 *
 * Once all three are on the account nothing here runs again, so the cost falls
 * away for every account past its first week.
 */
async function recordAccountMilestones(
  subject: ProductAnalyticsSubject,
  events: readonly ProductAnalyticsEvent[],
): Promise<void> {
  const relevant = events.filter(
    (event) => event.name === 'assistant_response' || CAPABILITY_MILESTONE_EVENTS.has(event.name),
  );
  if (relevant.length === 0) return;

  const present = await readAccountState(subject.userId);
  if (MILESTONE_EVENTS.every((name) => present.has(name))) return;

  const last = relevant[relevant.length - 1]!;
  const chatted = present.has('assistant_response');
  const responded =
    present.has('first_useful_response') ||
    relevant.some((event) => event.name === 'assistant_response' && event.outcome === 'succeeded');
  const usedCapability =
    [...CAPABILITY_MILESTONE_EVENTS].some((name) => present.has(name)) ||
    relevant.some((event) => CAPABILITY_MILESTONE_EVENTS.has(event.name));

  if (
    (chatted || relevant.some((event) => event.name === 'assistant_response')) &&
    !present.has('first_chat')
  ) {
    await writeMilestone(subject, 'first_chat', last.surface, last.occurredAt);
  }
  if (responded && !present.has('first_useful_response')) {
    await writeMilestone(subject, 'first_useful_response', last.surface, last.occurredAt);
  }
  if (responded && usedCapability && !present.has('activation')) {
    await writeMilestone(subject, 'activation', last.surface, last.occurredAt);
  }
}

export interface ServerProductAnalyticsInput {
  readonly name: ProductAnalyticsEventName;
  readonly surface: ProductAnalyticsSurface;
  readonly outcome?: ProductAnalyticsOutcome;
  readonly properties?: ProductAnalyticsProperties;
}

/**
 * The server-side emitter for events a client cannot honestly report: a signup
 * lands before any page can ask, and a plan change is a fact Stripe tells us,
 * not the browser. Never awaited by the path it measures, and never able to
 * fail it.
 */
export function trackProductAnalyticsEvent(
  subject: ProductAnalyticsSubject,
  input: ServerProductAnalyticsInput,
): void {
  const event = normalizeProductAnalyticsEvent({
    name: input.name,
    surface: input.surface,
    occurredAt: new Date().toISOString(),
    outcome: input.outcome,
    properties: input.properties,
  });
  if (!event) return;

  void recordProductAnalyticsEvents(subject, [event]).catch((error: unknown) => {
    logger.warn({ error, event: input.name }, '[product-analytics] event was not recorded');
  });
}

const CAPABILITY_EVENTS: Readonly<Record<string, ProductAnalyticsEventName>> = {
  chat: 'assistant_response',
  transcription: 'voice_session_started',
  browser: 'browser_session_started',
  sandbox: 'code_session_started',
  code_compute: 'code_session_started',
  work_compute: 'work_started',
  tool: 'tool_call',
};

export interface MeteredCapabilityEvent {
  readonly userId: string | null | undefined;
  readonly organizationId?: string | null;
  readonly capability: string;
  readonly surface?: string | null;
  readonly taskOutcome?: string | null;
  readonly provider?: string | null;
}

/**
 * Every managed turn on every surface settles through the cost meter, so the
 * product event for a capability is derived there rather than asked of six
 * clients that would each have to remember. The meter already knows who, what
 * and whether it was delivered; the surface is the one it recorded, and an
 * unrecognised one is dropped rather than guessed at.
 */
export function trackMeteredCapability(event: MeteredCapabilityEvent): void {
  const { userId } = event;
  if (!userId) return;
  const name = CAPABILITY_EVENTS[event.capability];
  if (!name) return;
  if (!isProductAnalyticsSurface(event.surface)) return;

  trackProductAnalyticsEvent(
    { userId, organizationId: event.organizationId ?? null },
    {
      name,
      surface: event.surface,
      outcome: event.taskOutcome === 'undelivered' ? 'failed' : 'succeeded',
      properties: {
        capability: event.capability,
        ...(event.provider ? { provider: event.provider } : {}),
      },
    },
  );
}

const AUDITED_PRODUCT_EVENTS: Readonly<Record<string, ProductAnalyticsEventName>> = {
  plan_changed: 'plan_changed',
  connector_added: 'connector_connected',
  skill_installed: 'skill_installed',
  plugin_installed: 'plugin_installed',
  remote_pairing_initiated: 'remote_session_started',
  browser_action: 'browser_action_finished',
  computer_use_action: 'remote_action_finished',
};

const AUDIT_OUTCOME_EVENTS: Readonly<Record<string, ProductAnalyticsOutcome>> = {
  success: 'succeeded',
  failure: 'failed',
  denied: 'cancelled',
};

export interface AuditedProductEvent {
  readonly userId: string | null | undefined;
  readonly organizationId?: string | null;
  readonly eventType: string;
  readonly surface?: string | null;
  readonly outcome?: string | null;
  readonly detail: Readonly<Record<string, unknown>>;
}

/**
 * Six of the §100 events are already facts the audit trail records at the real
 * production site: the connector that was added, the plugin installed, the
 * device paired, the plan changed. Deriving the product event from the trail
 * rather than adding a second emitter beside it is what keeps the two from
 * disagreeing about whether something happened.
 */
export function trackAuditedProductEvent(event: AuditedProductEvent): void {
  const { userId } = event;
  if (!userId) return;
  const name = AUDITED_PRODUCT_EVENTS[event.eventType];
  if (!name) return;

  const properties: ProductAnalyticsProperties = {};
  for (const key of ['planTier', 'previousPlanTier', 'source'] as const) {
    const value = event.detail[key];
    if (typeof value === 'string') properties[key] = value;
  }

  const outcome = AUDIT_OUTCOME_EVENTS[event.outcome ?? 'success'] ?? 'succeeded';

  trackProductAnalyticsEvent(
    { userId, organizationId: event.organizationId ?? null },
    {
      name,
      surface: isProductAnalyticsSurface(event.surface) ? event.surface : 'web',
      ...(requiresProductAnalyticsOutcome(name) ? { outcome } : {}),
      properties,
    },
  );
}

/**
 * The surface a request came from, as the caller declared it. It is a hint, not
 * a credential: the free-lane gate is what decides entitlement from the signed
 * token, and nothing here grants anything, so an unrecognised hint reads as the
 * web app rather than failing the request it rode in on.
 */
export function resolveProductAnalyticsSurface(request: NextRequest): ProductAnalyticsSurface {
  const hint = readSurfaceHint(request);
  return isProductAnalyticsSurface(hint) ? hint : 'web';
}

/**
 * Events no surface emits by name, because they are read off something that
 * already happened: the cost meter, the audit trail or the account's own
 * history. A name here and nowhere else is produced; a name in neither is an
 * event the vocabulary promises and nothing raises.
 */
export const DERIVED_PRODUCT_ANALYTICS_EVENTS: readonly ProductAnalyticsEventName[] = Object.freeze(
  [
    ...new Set<ProductAnalyticsEventName>([
      ...MILESTONE_EVENTS,
      ...Object.values(CAPABILITY_EVENTS),
      ...Object.values(AUDITED_PRODUCT_EVENTS),
    ]),
  ],
);
