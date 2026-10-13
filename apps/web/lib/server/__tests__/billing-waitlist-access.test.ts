import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');

const store = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<NeonDbModule>()),
  getNeonDb: () => ({ query: (...args: unknown[]) => store.query(...args) }),
}));

import { BILLING_UPGRADES_OPEN_FLAG_KEY } from '@/lib/feature-flags/billing-upgrades';
import { resetFlagDefinitionCache } from '@/lib/feature-flags/flag-store';
import {
  billingUpgradesForcedOpen,
  billingUpgradesOpenFor,
  hasBillingWaitlistAccess,
} from '../billing-waitlist-access';

function db(granted: boolean) {
  return { query: vi.fn(async () => [{ granted }]) } as unknown as Parameters<
    typeof hasBillingWaitlistAccess
  >[0];
}

function switchRow(overrides: Record<string, unknown> = {}) {
  return {
    key: BILLING_UPGRADES_OPEN_FLAG_KEY,
    description: '',
    kill_switch: false,
    variants: ['on', 'off'],
    default_variant: 'on',
    rules: [],
    expires_at: null,
    maturity: 'general_availability',
    release_channel: null,
    availability: null,
    owner_name: 'billing',
    archived_at: null,
    version: 2,
    created_at: '2026-10-12T00:00:00.000Z',
    updated_at: '2026-10-12T00:00:00.000Z',
    ...overrides,
  };
}

function flagStore(options: { definitions?: unknown[]; overrides?: unknown[] }) {
  store.query.mockImplementation(async (sql: string) =>
    sql.includes('feature_flag_definitions')
      ? (options.definitions ?? [])
      : (options.overrides ?? []),
  );
}

describe('paid upgrade access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFlagDefinitionCache();
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '');
    flagStore({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('admits only an account that redeemed an access code while staged', async () => {
    await expect(hasBillingWaitlistAccess(db(true), 'user-1')).resolves.toBe(true);
    await expect(hasBillingWaitlistAccess(db(false), 'user-1')).resolves.toBe(false);
  });

  it('stays gated when nobody has ever created the switch', async () => {
    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(false);
  });

  it('stays gated while the stored switch is off', async () => {
    flagStore({ definitions: [switchRow({ default_variant: 'off' })] });

    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(false);
    await expect(hasBillingWaitlistAccess(db(false), 'user-1')).resolves.toBe(false);
  });

  it('admits every account without reading redemptions once the switch is on', async () => {
    flagStore({ definitions: [switchRow()] });
    const closed = db(false);

    await expect(hasBillingWaitlistAccess(closed, 'user-1')).resolves.toBe(true);
    expect(closed.query).not.toHaveBeenCalled();
  });

  it('closes again as soon as the switch is turned back off', async () => {
    flagStore({ definitions: [switchRow()] });
    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(true);

    flagStore({ definitions: [switchRow({ default_variant: 'off', version: 3 })] });
    resetFlagDefinitionCache();

    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(false);
  });

  it('stays gated when the switch is on but its kill switch is engaged', async () => {
    flagStore({ definitions: [switchRow({ kill_switch: true })] });

    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(false);
  });

  it('stays gated when the flag store cannot be read', async () => {
    store.query.mockRejectedValue(new Error('connection refused'));

    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(false);
    await expect(hasBillingWaitlistAccess(db(false), 'user-1')).resolves.toBe(false);
  });

  it('stays gated when the stored switch does not parse', async () => {
    flagStore({ definitions: [switchRow({ rules: 'not rules' })] });

    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(false);
  });

  it('admits one account the operator opened the switch for and nobody else', async () => {
    flagStore({
      definitions: [switchRow({ default_variant: 'off' })],
      overrides: [
        {
          flag_name: BILLING_UPGRADES_OPEN_FLAG_KEY,
          user_id: 'user-1',
          organization_id: null,
          variant: 'on',
          enabled: true,
          expires_at: null,
        },
      ],
    });

    await expect(billingUpgradesOpenFor('user-1')).resolves.toBe(true);
    await expect(billingUpgradesOpenFor('user-2')).resolves.toBe(false);
  });

  it('opens for every account when the environment forces it, without reading the store', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', '1');
    const closed = db(false);

    expect(billingUpgradesForcedOpen()).toBe(true);
    await expect(hasBillingWaitlistAccess(closed, 'user-1')).resolves.toBe(true);
    expect(closed.query).not.toHaveBeenCalled();
    expect(store.query).not.toHaveBeenCalled();
  });

  it('does not treat any other environment value as the force-open override', async () => {
    vi.stubEnv('AGI_BILLING_WAITLIST_OPEN', 'true');

    expect(billingUpgradesForcedOpen()).toBe(false);
    await expect(hasBillingWaitlistAccess(db(false), 'user-1')).resolves.toBe(false);
  });
});
