import { describe, expect, it, vi } from 'vitest';
import {
  BILLING_PLAN_PRICING,
  SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER,
  isPerSeatBillingPlan,
} from '@agiworkforce/types';
import { runDevAccounts, type DevAccountCommands } from '../dev-accounts/cli';
import {
  DevAccountsRefusal,
  assertLocalServerAddress,
  assertLocalTestEnvironment,
  type DevAccountsRefusalCode,
} from '../dev-accounts/environment';
import { DEV_ACCOUNTS, findDevAccount, inSeedOrder, slugOfPlan } from '../dev-accounts/catalog';

const LOCAL_ENV = {
  AGI_DATABASE_URL: 'postgresql://owner@127.0.0.1:5432/agiworkforce_dev',
  DATABASE_URL: 'postgresql://owner@127.0.0.1:5432/agiworkforce_dev',
  CLERK_SECRET_KEY: 'sk_test_local',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_local',
  STRIPE_SECRET_KEY: 'sk_test_local',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_local',
};

function refusalOf(env: Record<string, string | undefined>): DevAccountsRefusalCode | null {
  try {
    assertLocalTestEnvironment(env);
    return null;
  } catch (error) {
    if (error instanceof DevAccountsRefusal) return error.code;
    throw error;
  }
}

describe('dev accounts environment guard', () => {
  it('accepts the local stack', () => {
    expect(refusalOf(LOCAL_ENV)).toBeNull();
  });

  it.each([
    'postgresql://u:p@localhost/db',
    'postgresql://u:p@db.localhost/db',
    'postgresql://u:p@agi.test:5432/db',
    'postgres://u:p@[::1]:5432/db',
  ])('accepts the local database %s', (url) => {
    expect(refusalOf({ ...LOCAL_ENV, AGI_DATABASE_URL: url, DATABASE_URL: url })).toBeNull();
  });

  it.each([
    ['a Neon host', 'postgresql://u:p@ep-cool-name.us-east-2.aws.neon.tech/neondb'],
    ['a staging host', 'postgresql://u:p@staging-db.example.com/db'],
    ['a private network address', 'postgresql://u:p@10.0.0.5/db'],
    ['a name that only contains localhost', 'postgresql://u:p@localhost.attacker.com/db'],
    ['a name that only starts like loopback', 'postgresql://u:p@127.attacker.com/db'],
  ])('refuses %s', (_label, url) => {
    expect(refusalOf({ ...LOCAL_ENV, DATABASE_URL: url })).toBe('database_not_local');
    expect(refusalOf({ ...LOCAL_ENV, AGI_DATABASE_URL: url })).toBe('database_not_local');
  });

  it('refuses when any other postgres URL in the environment is remote', () => {
    expect(
      refusalOf({
        ...LOCAL_ENV,
        DATABASE_URL_UNPOOLED: 'postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db',
      }),
    ).toBe('database_not_local');
  });

  it('refuses without a database URL', () => {
    expect(refusalOf({ ...LOCAL_ENV, AGI_DATABASE_URL: undefined, DATABASE_URL: undefined })).toBe(
      'database_url_missing',
    );
  });

  it('refuses a database URL that is not postgres', () => {
    expect(
      refusalOf({
        ...LOCAL_ENV,
        AGI_DATABASE_URL: 'mysql://127.0.0.1/db',
        DATABASE_URL: undefined,
      }),
    ).toBe('database_url_invalid');
  });

  it('refuses a websocket proxy that is not on this machine', () => {
    expect(refusalOf({ ...LOCAL_ENV, AGI_DATABASE_WS_PROXY: 'proxy.example.com:4444' })).toBe(
      'database_proxy_not_local',
    );
    expect(refusalOf({ ...LOCAL_ENV, AGI_DATABASE_WS_PROXY: '127.0.0.1:4444' })).toBeNull();
  });

  it.each([
    ['VERCEL_ENV', 'production'],
    ['VERCEL_ENV', 'preview'],
    ['AGI_DEPLOY_ENV', 'production'],
    ['NODE_ENV', 'production'],
  ])('refuses a runtime that declares %s=%s', (key, value) => {
    expect(refusalOf({ ...LOCAL_ENV, [key]: value })).toBe('deployed_runtime');
  });

  it('has no override for a remote database', () => {
    expect(
      refusalOf({
        ...LOCAL_ENV,
        DATABASE_URL: 'postgresql://u:p@ep-x.aws.neon.tech/db',
        AGI_ALLOW_REMOTE_DATABASE: 'yes-i-am-pointing-a-development-runtime-at-a-shared-database',
      }),
    ).toBe('database_not_local');
  });

  it('refuses a missing or production Clerk key', () => {
    expect(refusalOf({ ...LOCAL_ENV, CLERK_SECRET_KEY: undefined })).toBe('clerk_key_missing');
    expect(refusalOf({ ...LOCAL_ENV, CLERK_SECRET_KEY: 'sk_live_production' })).toBe(
      'clerk_key_not_development',
    );
    expect(
      refusalOf({ ...LOCAL_ENV, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_production' }),
    ).toBe('clerk_key_not_development');
  });

  it('refuses a missing or live Stripe key', () => {
    expect(refusalOf({ ...LOCAL_ENV, STRIPE_SECRET_KEY: undefined })).toBe('stripe_key_missing');
    expect(refusalOf({ ...LOCAL_ENV, STRIPE_SECRET_KEY: 'sk_live_production' })).toBe(
      'stripe_key_not_test',
    );
    expect(refusalOf({ ...LOCAL_ENV, STRIPE_SECRET_KEY: 'rk_live_restricted' })).toBe(
      'stripe_key_not_test',
    );
    expect(refusalOf({ ...LOCAL_ENV, STRIPE_SECRET_KEY: 'rk_test_restricted' })).toBeNull();
    expect(refusalOf({ ...LOCAL_ENV, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_live_x' })).toBe(
      'stripe_key_not_test',
    );
  });

  it('refuses a database server that answers from another machine', () => {
    expect(() => assertLocalServerAddress('127.0.0.1/32')).not.toThrow();
    expect(() => assertLocalServerAddress('::1/128')).not.toThrow();
    expect(() => assertLocalServerAddress(null)).not.toThrow();
    expect(() => assertLocalServerAddress('34.201.10.4/32')).toThrow(DevAccountsRefusal);
  });
});

describe('dev accounts command', () => {
  function commands(): DevAccountCommands {
    return {
      seed: vi.fn(async () => undefined),
      reset: vi.fn(async () => undefined),
      list: vi.fn(async () => undefined),
    };
  }

  it('refuses before loading anything that can write', async () => {
    const loadCommands = vi.fn(async () => commands());
    const errors: string[] = [];
    const exit = await runDevAccounts(
      ['seed', 'all'],
      { ...LOCAL_ENV, DATABASE_URL: 'postgresql://u:p@ep-x.aws.neon.tech/db' },
      loadCommands,
      () => undefined,
      (line) => errors.push(line),
    );
    expect(exit).toBe(1);
    expect(loadCommands).not.toHaveBeenCalled();
    expect(errors.join('\n')).toContain('database_not_local');
  });

  it.each([
    ['reset', ['reset', 'pro']],
    ['list', ['list']],
  ])('refuses %s with a live Stripe key before loading commands', async (_name, argv) => {
    const loadCommands = vi.fn(async () => commands());
    const exit = await runDevAccounts(
      argv,
      { ...LOCAL_ENV, STRIPE_SECRET_KEY: 'sk_live_production' },
      loadCommands,
      () => undefined,
      () => undefined,
    );
    expect(exit).toBe(1);
    expect(loadCommands).not.toHaveBeenCalled();
  });

  it('runs the named command once the environment is local', async () => {
    const loaded = commands();
    const exit = await runDevAccounts(
      ['reset', 'pro'],
      LOCAL_ENV,
      async () => loaded,
      () => undefined,
      () => undefined,
    );
    expect(exit).toBe(0);
    expect(loaded.reset).toHaveBeenCalledWith(
      expect.objectContaining({ databaseHost: '127.0.0.1' }),
      'pro',
      expect.any(Function),
    );
  });

  it('asks for a name before resetting', async () => {
    const loadCommands = vi.fn(async () => commands());
    expect(
      await runDevAccounts(
        ['reset'],
        LOCAL_ENV,
        loadCommands,
        () => undefined,
        () => undefined,
      ),
    ).toBe(2);
    expect(loadCommands).not.toHaveBeenCalled();
  });
});

describe('dev accounts catalog', () => {
  it('has one account per individual plan, named from the plan catalog', () => {
    for (const plan of SELF_SERVE_INDIVIDUAL_UPGRADE_LADDER) {
      const account = findDevAccount(slugOfPlan(plan));
      expect(account?.plan).toBe(plan);
      expect(account?.billing).toBe('manual');
    }
    expect(findDevAccount('max-20x')?.purpose).toContain(BILLING_PLAN_PRICING.max_15x.label);
  });

  it('seats the team member in a per-seat workspace after its owner', () => {
    const member = DEV_ACCOUNTS.find((account) => account.seatIn);
    const owner = member?.seatIn ? findDevAccount(member.seatIn) : undefined;
    expect(owner && isPerSeatBillingPlan(owner.plan)).toBe(true);
    expect(owner?.teamSeats).toBeGreaterThanOrEqual(2);
    const order = inSeedOrder(DEV_ACCOUNTS).map((account) => account.name);
    expect(order.indexOf(member!.name)).toBeGreaterThan(order.indexOf(owner!.name));
  });

  it('gives every lane that needs isolation its own account', () => {
    for (const lane of ['chrome', 'vscode', 'desktop', 'cli', 'mobile', 'credits']) {
      expect(findDevAccount(`lane-${lane}`)).toBeDefined();
    }
  });

  it('covers extra usage, a nearly full window and Stripe billing', () => {
    expect(DEV_ACCOUNTS.some((account) => account.extraUsageTopUpUsd !== undefined)).toBe(true);
    expect(DEV_ACCOUNTS.some((account) => (account.fiveHourWindowPercent ?? 0) > 0)).toBe(true);
    expect(DEV_ACCOUNTS.some((account) => account.billing === 'stripe')).toBe(true);
  });

  it('uses unique names', () => {
    const names = DEV_ACCOUNTS.map((account) => account.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
