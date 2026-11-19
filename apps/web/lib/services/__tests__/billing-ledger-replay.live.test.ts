import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  LEDGER_REPLAY_SCENARIOS,
  REPLAY_EMAIL,
  REPLAY_PRICES,
  REPLAY_USER_ID,
  ReplayStripe,
  replayClock,
  type LedgerScenario,
  type ReplayStep,
} from './billing-ledger-replay-scenarios';

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');

const liveDatabaseUrl = process.env['AGI_LIVE_DATABASE_URL'] ?? '';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLoopbackDatabase(connectionString: string): boolean {
  try {
    return LOOPBACK_HOSTS.has(new URL(connectionString).hostname);
  } catch {
    return false;
  }
}

const live =
  process.env['AGI_TEST_LIVE_BILLING_LEDGER'] === '1' && isLoopbackDatabase(liveDatabaseUrl);

if (live) {
  process.env['AGI_KV_PROVIDER'] = 'none';
  process.env['STRIPE_PRICE_PRO_MONTHLY'] = REPLAY_PRICES.pro;
  process.env['STRIPE_PRICE_MAX_MONTHLY'] = REPLAY_PRICES.max;
}

const scope = vi.hoisted(() => ({ db: null as DatabaseAdapter | null }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => scope.db,
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: vi.fn(async () => undefined),
  logSecurityEvent: vi.fn(async () => undefined),
}));

const {
  handleCreditTopUp,
  upsertSubscriptionFromSession,
  updateSubscriptionFromStripeSubscription,
} = await import('@/app/api/stripe-webhook/lib/db');
const { handleAutoReloadEvent } = await import('@/app/api/stripe-webhook/lib/auto-reload-events');
const { handleChargeRefunded } = await import('@/app/api/stripe-webhook/lib/refund-events');
const { handleDisputeCreated, handleDisputeOutcome } =
  await import('@/app/api/stripe-webhook/lib/dispute-events');
const { recordVerifiedMobileIapPurchase } = await import('../mobile-iap-ledger-service');
const { processMobileIapLifecycleEvent } = await import('../mobile-iap-notification-service');

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

afterEach(() => {
  scope.db = null;
  vi.useRealTimers();
});

// The entry points open their own transaction. Inside the one each scenario
// rolls back, that becomes a savepoint, so a delivery that throws undoes only
// its own writes, as its own webhook or notice transaction would.
function nestable(tx: DatabaseAdapter): DatabaseAdapter {
  let savepoints = 0;
  const adapter: DatabaseAdapter = new Proxy(tx, {
    get(target, property) {
      if (property === 'transaction') {
        return async <T>(run: (inner: DatabaseAdapter) => Promise<T>): Promise<T> => {
          const savepoint = `ledger_replay_${(savepoints += 1)}`;
          await target.execute(`savepoint ${savepoint}`);
          try {
            const result = await run(adapter);
            await target.execute(`release savepoint ${savepoint}`);
            return result;
          } catch (error) {
            await target.execute(`rollback to savepoint ${savepoint}`);
            throw error;
          }
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return adapter;
}

async function deliver(
  db: DatabaseAdapter,
  stripe: ReplayStripe,
  step: ReplayStep,
): Promise<unknown> {
  stripe.remember(step.stripe);
  const client = stripe.client;
  switch (step.via) {
    case 'upsertSubscriptionFromSession':
      return db.transaction((tx) => upsertSubscriptionFromSession(tx, client, step.session));
    case 'handleCreditTopUp':
      return db.transaction((tx) => handleCreditTopUp(tx, client, step.session));
    case 'updateSubscriptionFromStripeSubscription':
      return db.transaction((tx) =>
        updateSubscriptionFromStripeSubscription(tx, client, step.subscription, {
          eventSequence: step.eventCreated,
        }),
      );
    case 'handleAutoReloadEvent':
      return db.transaction((tx) => handleAutoReloadEvent(tx, step.event));
    case 'handleChargeRefunded':
      return db.transaction((tx) => handleChargeRefunded(tx, client, step.charge));
    case 'handleDisputeCreated':
      return db.transaction((tx) => handleDisputeCreated(tx, client, step.dispute, step.charge));
    case 'handleDisputeOutcome':
      return db.transaction((tx) =>
        handleDisputeOutcome(tx, client, step.dispute, step.eventCreated),
      );
    case 'recordVerifiedMobileIapPurchase':
      return recordVerifiedMobileIapPurchase({
        db,
        userId: REPLAY_USER_ID,
        purchaseToken: step.purchaseToken,
        verified: step.verified,
      });
    case 'processMobileIapLifecycleEvent':
      return processMobileIapLifecycleEvent({ db, event: step.event });
  }
}

async function deliverAll(
  db: DatabaseAdapter,
  stripe: ReplayStripe,
  steps: readonly ReplayStep[],
  deliveries: number,
): Promise<{ step: string; outcome: unknown }[]> {
  const outcomes: { step: string; outcome: unknown }[] = [];
  for (const step of steps) {
    for (let delivery = 0; delivery < deliveries; delivery += 1) {
      try {
        const result = await deliver(db, stripe, step);
        outcomes.push({ step: step.label, outcome: result === undefined ? 'ok' : result });
      } catch (error) {
        outcomes.push({
          step: step.label,
          outcome: { error: error instanceof Error ? error.message : String(error) },
        });
      }
    }
  }
  return outcomes;
}

const LEDGER_TABLES = {
  subscriptions: `
    select id, status, plan_tier, plan_catalog_version, stripe_customer_id,
           stripe_subscription_id, stripe_price_id, apple_original_transaction_id,
           google_purchase_token, current_period_start, current_period_end,
           cancel_at_period_end, canceled_at, last_stripe_event_at
      from public.subscriptions where user_id = $1`,
  token_credits: `
    select id, subscription_id, period_start, period_end, plan_catalog_version,
           credits_allocated_microusd, credits_used_microusd, top_up_allocated_microusd,
           credits_allocated_cents, credits_used_cents, top_up_allocated_cents,
           bonus_granted_cents
      from public.token_credits where user_id = $1`,
  credit_transactions: `
    select id, credit_account_id, transaction_type, amount_microusd, amount_cents,
           description, metadata
      from public.credit_transactions where user_id = $1`,
  expiring_credit_purchases: `
    select credit_transaction_id, credit_account_id, purchase_country, reference,
           purchased_microusd, remaining_microusd, expires_at, reminded_at, expired_at,
           created_by
      from public.expiring_credit_purchases where user_id = $1`,
  mobile_iap_transactions: `
    select platform, product_key, product_kind, store_transaction_id, plan_tier,
           units_granted, intended_amount_cents, refunded_amount_cents, status, environment,
           purchased_at, expires_at, refund_state_signed_at
      from public.mobile_iap_transactions where user_id = $1`,
  billing_disputes: `
    select id, charge_id, amount_cents, currency, stripe_status, outcome, revoked_account_id,
           revoked_credits_microusd, revoked_top_up_microusd, prior_subscription_status,
           prior_cancel_at_period_end, opened_at, revoked_at, closed_at, restored_at,
           restored_credits_microusd
      from public.billing_disputes where user_id = $1`,
} as const;

type LedgerTable = keyof typeof LEDGER_TABLES;
type Ledger = Record<LedgerTable, unknown[]>;

async function readLedger(db: DatabaseAdapter): Promise<Ledger> {
  const ledger = {} as Ledger;
  for (const [table, sql] of Object.entries(LEDGER_TABLES) as [LedgerTable, string][]) {
    const rows = await db.query<{ row: unknown }>(
      `select to_jsonb(snapshot) as row from (${sql}) snapshot`,
      [REPLAY_USER_ID],
    );
    ledger[table] = rows.map(({ row }) => row);
  }
  return ledger;
}

const DAY_SECONDS = 86_400;
const DAY_LABEL_WINDOW = 120;
const MONTH_LABEL_WINDOW = 36;
const TIMESTAMP = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function signed(value: number, unit: string): string {
  return `T0${value < 0 ? '-' : '+'}${Math.abs(value)}${unit}`;
}

function addCalendarMonths(anchorSeconds: number, months: number): number {
  const anchor = new Date(anchorSeconds * 1000);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return (
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
    ) / 1000
  );
}

// Every instant becomes an offset from the second the scenario's transaction
// started, so the golden file does not depend on the day it is replayed. Day
// offsets near the anchor are what the builders choose; anything further out is
// tried as a calendar-month offset first, because month lengths would otherwise
// make the same rule read differently each month.
function labelInstants(text: string, anchorSeconds: number): string {
  return text.replace(TIMESTAMP, (instant, wholeSeconds: string, zone: string) => {
    const seconds = Date.parse(`${wholeSeconds}${zone}`) / 1000;
    return Number.isFinite(seconds) ? labelOffset(seconds, anchorSeconds) : instant;
  });
}

function labelOffset(seconds: number, anchorSeconds: number): string {
  const offset = seconds - anchorSeconds;
  if (offset === 0) return 'T0';
  if (offset % DAY_SECONDS === 0 && Math.abs(offset) <= DAY_LABEL_WINDOW * DAY_SECONDS) {
    return signed(offset / DAY_SECONDS, 'd');
  }
  for (let months = 1; months <= MONTH_LABEL_WINDOW; months += 1) {
    if (addCalendarMonths(anchorSeconds, months) === seconds) return signed(months, 'mo');
    if (addCalendarMonths(anchorSeconds, -months) === seconds) return signed(-months, 'mo');
  }
  if (offset % DAY_SECONDS === 0) return signed(offset / DAY_SECONDS, 'd');
  return signed(offset, 's');
}

function mapStrings(value: unknown, map: (text: string) => string): unknown {
  if (typeof value === 'string') return map(value);
  if (value instanceof Date) return map(value.toISOString());
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, map));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, mapStrings((value as Record<string, unknown>)[key], map)]),
    );
  }
  return value;
}

function normalise<T extends { outcomes: unknown; ledger: Ledger }>(
  snapshot: T,
  anchorSeconds: number,
): T {
  const timed = mapStrings(snapshot, (text) => labelInstants(text, anchorSeconds)) as T;
  const masked = (row: unknown) =>
    JSON.stringify(mapStrings(row, (text) => text.replace(UUID, '<id>')));
  for (const table of Object.keys(timed.ledger) as LedgerTable[]) {
    timed.ledger[table] = [...timed.ledger[table]].sort((a, b) =>
      masked(a).localeCompare(masked(b)),
    );
  }
  const ids = new Map<string, string>();
  return mapStrings(timed, (text) =>
    text.replace(UUID, (id) => {
      if (!ids.has(id)) ids.set(id, `<id ${ids.size + 1}>`);
      return ids.get(id)!;
    }),
  ) as T;
}

interface Replayed {
  outcomes: unknown;
  ledger: Ledger;
}

async function replay(scenario: LedgerScenario, deliveries: number): Promise<Replayed> {
  let result: Replayed | null = null;
  await database!
    .transaction(async (tx) => {
      const db = nestable(tx);
      scope.db = db;
      await db.execute(`set local timezone to 'UTC'`);
      const [started] = await db.query<{ seconds: string }>(
        `select floor(extract(epoch from now()))::bigint::text as seconds`,
      );
      const anchorSeconds = Number(started!.seconds);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(anchorSeconds * 1000);

      await db.execute(`insert into public.profiles (id, email) values ($1, $2)`, [
        REPLAY_USER_ID,
        REPLAY_EMAIL,
      ]);
      const [binding] = await db.query<{ app_account_token: string }>(
        `insert into public.mobile_iap_accounts (user_id) values ($1) returning app_account_token`,
        [REPLAY_USER_ID],
      );
      const steps = scenario.steps({
        clock: replayClock(anchorSeconds),
        appAccountToken: binding!.app_account_token,
      });
      const stripe = new ReplayStripe();

      const outcomes = await deliverAll(db, stripe, steps, deliveries);
      result = normalise({ outcomes, ledger: await readLedger(db) }, anchorSeconds);
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
  return result!;
}

function goldenPath(scenario: LedgerScenario): string {
  const slug = scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `./__golden__/billing-ledger-replay/${slug}.json`;
}

// llm-guardrail-allow: needs AGI_TEST_LIVE_BILLING_LEDGER=1 and a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres; every scenario runs in a transaction it rolls back.
describe.skipIf(!live)('ledger writes of today’s payment entry points', () => {
  for (const scenario of LEDGER_REPLAY_SCENARIOS) {
    it(`${scenario.name} writes the golden ledger, and each event delivered twice writes the same`, async () => {
      const once = await replay(scenario, 1);
      const twice = await replay(scenario, 2);

      await expect(
        `${JSON.stringify(
          {
            scenario: scenario.name,
            outcomes: once.outcomes,
            ledger: once.ledger,
            outcomesDeliveredTwice: twice.outcomes,
          },
          null,
          2,
        )}\n`,
      ).toMatchFileSnapshot(goldenPath(scenario));
      expect(twice.ledger).toEqual(once.ledger);
    });
  }
});
