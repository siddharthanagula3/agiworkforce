import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgresDatabaseAdapter, type DatabaseAdapter } from '@agiworkforce/data-layer';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
  process.env['AGI_TEST_LIVE_USAGE_PROMOTIONS'] === '1' && isLoopbackDatabase(liveDatabaseUrl);

const mocks = vi.hoisted(() => ({ promotionsOn: vi.fn(async () => true) }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/feature-flags/usage-promotions-gate', () => ({
  readUsagePromotionsOn: mocks.promotionsOn,
}));
vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock('@/lib/services/effective-subscription-service', () => ({
  resolveEntitlementBundle: vi.fn(),
}));

const {
  applyUsageLimitReset,
  ensurePromotionResetGrants,
  listUsageLimitPromotions,
  resetEnabledPromotionCache,
  resolvePromotionalCaps,
} = await import('./usage-limit-promotion-service');

const CAPS = { session: 1_000_000, weekly: 10_000_000, flagshipWeekly: 3_000_000 };
const MIGRATION = readFileSync(
  join(process.cwd(), 'db/neon/0390_usage_limit_promotions.sql'),
  'utf8',
)
  .replace(/^\s*begin;\s*$/m, '')
  .replace(/^\s*commit;\s*$/m, '');

class RollBack extends Error {}

const database = live ? new PostgresDatabaseAdapter({ connectionString: liveDatabaseUrl }) : null;

afterAll(async () => {
  await database?.dispose();
});

beforeEach(() => {
  resetEnabledPromotionCache();
  mocks.promotionsOn.mockReset();
  mocks.promotionsOn.mockResolvedValue(true);
});

function nestable(tx: DatabaseAdapter): DatabaseAdapter {
  let savepoints = 0;
  const adapter: DatabaseAdapter = new Proxy(tx, {
    get(target, property) {
      if (property === 'transaction') {
        return async <T>(run: (inner: DatabaseAdapter) => Promise<T>): Promise<T> => {
          const savepoint = `usage_promotion_${(savepoints += 1)}`;
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

interface Account {
  db: DatabaseAdapter;
  userId: string;
  accountId: string;
}

async function withAccount(run: (account: Account) => Promise<void>): Promise<void> {
  const userId = `qa-usage-promotion-${randomUUID()}`;
  await database!
    .transaction(async (tx) => {
      const db = nestable(tx);
      await db.execute(MIGRATION);
      await db.execute(`insert into public.profiles (id, email) values ($1, $2)`, [
        userId,
        `${userId}@example.test`,
      ]);
      const [account] = await db.query<{ id: string }>(
        `insert into public.token_credits (user_id, period_start, period_end)
         values ($1, now() - interval '10 days', now() + interval '20 days')
         returning id`,
        [userId],
      );
      await run({ db, userId, accountId: account!.id });
      throw new RollBack();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollBack)) throw error;
    });
}

async function spend(account: Account, microusd: number, hoursAgo: number): Promise<void> {
  await account.db.execute(
    `insert into public.credit_transactions
       (user_id, credit_account_id, transaction_type, amount_cents, amount_microusd, metadata, created_at)
     values ($1, $2, 'deduction', 0, $3, '{}'::jsonb, now() - make_interval(hours => $4))`,
    [account.userId, account.accountId, microusd, hoursAgo],
  );
}

async function resetPromotion(
  account: Account,
  options: {
    id?: string;
    plans?: string[];
    ceiling?: number;
    applyAt?: number;
    count?: number;
  } = {},
): Promise<string> {
  const id = options.id ?? 'qa-reset';
  await account.db.execute(
    `insert into public.usage_limit_promotions
       (id, kind, enabled, starts_at, ends_at, plans, cost_ceiling_microusd, reset_source,
        resets_per_grant, reset_valid_days, apply_at_percent)
     values ($1, 'limit_reset', true, now() - interval '1 day', now() + interval '10 days',
             $2::text[], $3, 'promotion', $4, 30, $5)`,
    [
      id,
      options.plans ?? ['pro'],
      options.ceiling ?? 1_000_000_000,
      options.count ?? 1,
      options.applyAt ?? 80,
    ],
  );
  return id;
}

async function promotion(account: Account, id: string) {
  const [row] = await account.db.query<{ committed_microusd: string; enabled: boolean }>(
    `select committed_microusd, enabled from public.usage_limit_promotions where id = $1`,
    [id],
  );
  return row;
}

async function grants(account: Account) {
  return account.db.query<{
    applied_at: string | null;
    apply_key: string | null;
    committed_microusd: string | null;
  }>(
    `select applied_at, apply_key, committed_microusd
       from public.usage_limit_promotion_grants where user_id = $1 order by reference_id`,
    [account.userId],
  );
}

function apply(account: Account, applyKey: string, planTier = 'pro') {
  return applyUsageLimitReset(account.db, {
    userId: account.userId,
    planTier,
    applyKey,
    grantId: null,
    caps: CAPS,
  });
}

// llm-guardrail-allow: needs AGI_TEST_LIVE_USAGE_PROMOTIONS=1 and a loopback AGI_LIVE_DATABASE_URL at a migrated Postgres; every case creates 0390's tables inside a transaction it rolls back.
describe.skipIf(!live)('usage-limit promotions against the real statements', () => {
  it("grants a live promotion's resets once per account", async () => {
    await withAccount(async (account) => {
      await resetPromotion(account, { count: 2 });
      const promotions = await listUsageLimitPromotions(account.db, { enabledOnly: true });
      expect(await ensurePromotionResetGrants(account.db, account.userId, 'pro', promotions)).toBe(
        2,
      );
      expect(await ensurePromotionResetGrants(account.db, account.userId, 'pro', promotions)).toBe(
        0,
      );
      expect(await grants(account)).toHaveLength(2);
    });
  });

  it('applies a reset at the limit, commits what it refreshed and restarts the windows', async () => {
    await withAccount(async (account) => {
      const id = await resetPromotion(account);
      await spend(account, 9_000_000, 30);
      await spend(account, 900_000, 1);

      const outcome = await apply(account, 'qa-apply-0001');
      expect(outcome).toMatchObject({
        status: 'applied',
        promotionId: id,
        refreshedCredits: 1_980,
      });
      expect((await promotion(account, id))?.committed_microusd).toBe('9900000');
      expect(await grants(account)).toEqual([
        expect.objectContaining({ apply_key: 'qa-apply-0001', committed_microusd: '9900000' }),
      ]);

      await expect(
        resolvePromotionalCaps(
          {
            userId: account.userId,
            planTier: 'pro',
            workload: 'chat',
            estimateMicrousd: 0,
            isFlagship: false,
            caps: CAPS,
          },
          Date.now(),
          () => account.db,
        ),
      ).resolves.toEqual({ session: 1_900_000, weekly: 19_900_000, flagshipWeekly: 3_000_000 });
    });
  });

  it('answers a retried apply with the same reset and never uses a second one', async () => {
    await withAccount(async (account) => {
      const id = await resetPromotion(account, { count: 2 });
      await spend(account, 950_000, 1);
      const first = await apply(account, 'qa-apply-0002');
      const replay = await apply(account, 'qa-apply-0002');
      expect(first.status).toBe('applied');
      expect(replay).toMatchObject({ status: 'already_applied' });
      expect(
        first.status !== 'refused' &&
          replay.status !== 'refused' &&
          first.grantId === replay.grantId,
      ).toBe(true);
      expect((await grants(account)).filter((grant) => grant.applied_at !== null)).toHaveLength(1);
      expect((await promotion(account, id))?.committed_microusd).toBe('950000');

      await expect(apply(account, 'qa-apply-0003')).resolves.toEqual({
        status: 'refused',
        reason: 'not_near_limit',
      });
    });
  });

  it('refuses a reset away from the limit', async () => {
    await withAccount(async (account) => {
      await resetPromotion(account);
      await spend(account, 100_000, 1);
      await expect(apply(account, 'qa-apply-0004')).resolves.toEqual({
        status: 'refused',
        reason: 'not_near_limit',
      });
      expect((await grants(account))[0]?.applied_at).toBeNull();
    });
  });

  it('refuses a reset the cost ceiling cannot cover and leaves it banked', async () => {
    await withAccount(async (account) => {
      const id = await resetPromotion(account, { ceiling: 500_000 });
      await spend(account, 950_000, 1);
      await expect(apply(account, 'qa-apply-0005')).resolves.toEqual({
        status: 'refused',
        reason: 'ceiling_reached',
      });
      expect((await promotion(account, id))?.committed_microusd).toBe('0');
      expect((await grants(account))[0]?.applied_at).toBeNull();
    });
  });

  it('refuses an expired reset', async () => {
    await withAccount(async (account) => {
      const id = await resetPromotion(account);
      await account.db.execute(
        `insert into public.usage_limit_promotion_grants
           (promotion_id, user_id, reference_id, granted_at, expires_at)
         values ($1, $2, 'promotion:1', now() - interval '40 days', now() - interval '10 days')`,
        [id, account.userId],
      );
      await account.db.execute(
        `update public.usage_limit_promotions set ends_at = now() - interval '1 hour',
                starts_at = now() - interval '50 days' where id = $1`,
        [id],
      );
      await spend(account, 950_000, 1);
      await expect(apply(account, 'qa-apply-0006')).resolves.toEqual({
        status: 'refused',
        reason: 'no_reset',
      });
    });
  });

  it('gives a plan the promotion does not cover no reset and lets none be applied', async () => {
    await withAccount(async (account) => {
      await resetPromotion(account, { plans: ['max'] });
      await spend(account, 950_000, 1);
      await expect(apply(account, 'qa-apply-0007')).resolves.toEqual({
        status: 'refused',
        reason: 'no_reset',
      });
      expect(await grants(account)).toHaveLength(0);
    });
  });

  it('stops a banked reset once its promotion is switched off', async () => {
    await withAccount(async (account) => {
      const id = await resetPromotion(account);
      const promotions = await listUsageLimitPromotions(account.db, { enabledOnly: true });
      await ensurePromotionResetGrants(account.db, account.userId, 'pro', promotions);
      await account.db.execute(
        `update public.usage_limit_promotions set enabled = false where id = $1`,
        [id],
      );
      await spend(account, 950_000, 1);
      await expect(apply(account, 'qa-apply-0008')).resolves.toEqual({
        status: 'refused',
        reason: 'no_reset',
      });
    });
  });

  it('claims an uplift once, commits its bound and stops at the ceiling for the next account', async () => {
    await withAccount(async (account) => {
      await account.db.execute(
        `insert into public.usage_limit_promotions
           (id, kind, enabled, starts_at, ends_at, plans, cost_ceiling_microusd,
            uplift_percent, uplift_windows, uplift_workloads)
         values ('qa-uplift', 'limit_uplift', true, now() - interval '1 day',
                 now() + interval '6 days', '{pro}', 5000000, 50, '{weekly}', '{code}')`,
      );
      await spend(account, 9_950_000, 30);
      const request = {
        userId: account.userId,
        planTier: 'pro',
        workload: 'code',
        estimateMicrousd: 100_000,
        isFlagship: false,
        caps: CAPS,
      };
      const raised = { session: 1_000_000, weekly: 15_000_000, flagshipWeekly: 4_500_000 };
      await expect(resolvePromotionalCaps(request, Date.now(), () => account.db)).resolves.toEqual(
        raised,
      );
      await expect(resolvePromotionalCaps(request, Date.now(), () => account.db)).resolves.toEqual(
        raised,
      );
      expect((await promotion(account, 'qa-uplift'))?.committed_microusd).toBe('5000000');
      await expect(
        resolvePromotionalCaps({ ...request, workload: 'chat' }, Date.now(), () => account.db),
      ).resolves.toEqual(CAPS);

      const other = `qa-usage-promotion-${randomUUID()}`;
      await account.db.execute(`insert into public.profiles (id, email) values ($1, $2)`, [
        other,
        `${other}@example.test`,
      ]);
      const [otherAccount] = await account.db.query<{ id: string }>(
        `insert into public.token_credits (user_id, period_start, period_end)
         values ($1, now() - interval '10 days', now() + interval '20 days')
         returning id`,
        [other],
      );
      await spend({ ...account, userId: other, accountId: otherAccount!.id }, 9_950_000, 30);
      await expect(
        resolvePromotionalCaps({ ...request, userId: other }, Date.now(), () => account.db),
      ).resolves.toEqual(CAPS);
    });
  });

  it('re-costs a claim after an edit and never lets the ceiling be passed', async () => {
    await withAccount(async (account) => {
      await account.db.execute(
        `insert into public.usage_limit_promotions
           (id, kind, enabled, starts_at, ends_at, plans, cost_ceiling_microusd,
            uplift_percent, uplift_windows, uplift_workloads)
         values ('qa-edit', 'limit_uplift', true, now() - interval '1 day',
                 now() + interval '6 days', '{pro}', 30000000, 50, '{weekly}', '{code}')`,
      );
      await spend(account, 9_950_000, 30);
      const request = {
        userId: account.userId,
        planTier: 'pro',
        workload: 'code',
        estimateMicrousd: 100_000,
        isFlagship: false,
        caps: CAPS,
      };
      await resolvePromotionalCaps(request, Date.now(), () => account.db);
      expect((await promotion(account, 'qa-edit'))?.committed_microusd).toBe('5000000');

      await account.db.execute(
        `update public.usage_limit_promotions
            set uplift_percent = 100, ends_at = now() + interval '13 days', version = version + 1
          where id = 'qa-edit'`,
      );
      resetEnabledPromotionCache();
      await expect(resolvePromotionalCaps(request, Date.now(), () => account.db)).resolves.toEqual({
        session: 1_000_000,
        weekly: 20_000_000,
        flagshipWeekly: 6_000_000,
      });
      expect((await promotion(account, 'qa-edit'))?.committed_microusd).toBe('20000000');

      await account.db.execute(
        `update public.usage_limit_promotions
            set uplift_percent = 300, version = version + 1
          where id = 'qa-edit'`,
      );
      resetEnabledPromotionCache();
      const before = (await promotion(account, 'qa-edit'))?.committed_microusd;
      await expect(resolvePromotionalCaps(request, Date.now(), () => account.db)).resolves.toEqual(
        CAPS,
      );
      expect((await promotion(account, 'qa-edit'))?.committed_microusd).toBe(before);
    });
  });
});
