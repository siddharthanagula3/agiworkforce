import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type NeonDbModule = typeof import('@/lib/server/neon-db');
type DataRegionModule = typeof import('@/lib/server/data-region');

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
vi.mock('@/lib/server/data-region', async (importOriginal) => ({
  ...(await importOriginal<DataRegionModule>()),
  managedCloudDataRegion: () => 'us-east-1',
}));

import { flagConfigProblems, isDeclaredFlagKey, isUnreadFlagKey } from '../config-schema';
import { evaluateFlags, type FlagSubject } from '../evaluate-flags';
import {
  FLAG_ON_VARIANT,
  type FlagDefinition,
  type FlagDefinitionInput,
  type FlagOverride,
} from '../flag-definition';
import { resetFlagDefinitionCache } from '../flag-store';
import { readStoreTestPurchasesAllowed } from '../store-test-purchase-gate';
import {
  STORE_TEST_PURCHASES_FLAG_KEY,
  storeTestPurchasesAllowed,
  storeTestPurchasesDefinition,
} from '../store-test-purchases';

const NOW = Date.parse('2026-10-12T00:00:00.000Z');
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const reviewer: FlagSubject = {
  userId: 'reviewer-account',
  workspaceId: WORKSPACE_ID,
  role: null,
  plan: null,
  region: 'us-east-1',
  country: null,
  surface: null,
  clientVersion: null,
};

function stored(overrides: Partial<FlagDefinitionInput> = {}): FlagDefinition {
  return {
    ...storeTestPurchasesDefinition(),
    ...overrides,
    version: 1,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

function override(overrides: Partial<FlagOverride> = {}): FlagOverride {
  return {
    flagKey: STORE_TEST_PURCHASES_FLAG_KEY,
    subject: 'user',
    subjectId: reviewer.userId,
    variant: FLAG_ON_VARIANT,
    expiresAt: null,
    ...overrides,
  };
}

function allowed(definition: FlagDefinition | null, overrides: FlagOverride[] = []): boolean {
  return storeTestPurchasesAllowed(
    evaluateFlags(definition ? [definition] : [], reviewer, overrides, NOW),
  );
}

describe('who may be granted a store test purchase in production', () => {
  it('is nobody until the operator creates the flag and names an account', () => {
    expect(allowed(null)).toBe(false);
    expect(allowed(stored())).toBe(false);
  });

  it('is the one account the operator overrode to on', () => {
    expect(allowed(stored(), [override()])).toBe(true);
    expect(allowed(stored(), [override({ subjectId: 'someone-else' })])).toBe(false);
  });

  it('is never a population: a default, a rule or a workspace override of on admits no one', () => {
    expect(allowed(stored({ defaultVariant: FLAG_ON_VARIANT }))).toBe(false);
    expect(
      allowed(
        stored({ rules: [{ id: 'everyone', conditions: {}, variant: FLAG_ON_VARIANT }] as never }),
      ),
    ).toBe(false);
    expect(allowed(stored(), [override({ subject: 'workspace', subjectId: WORKSPACE_ID })])).toBe(
      false,
    );
  });

  it('ends when the override expires or the flag is killed', () => {
    expect(allowed(stored(), [override({ expiresAt: '2026-10-11T00:00:00.000Z' })])).toBe(false);
    expect(allowed(stored({ killSwitch: true }), [override()])).toBe(false);
  });

  it('is a declared flag whose only accepted default is off', () => {
    expect(isDeclaredFlagKey(STORE_TEST_PURCHASES_FLAG_KEY)).toBe(true);
    expect(isUnreadFlagKey(STORE_TEST_PURCHASES_FLAG_KEY)).toBe(false);
    expect(flagConfigProblems(storeTestPurchasesDefinition())).toEqual([]);
    expect(
      flagConfigProblems({ ...storeTestPurchasesDefinition(), defaultVariant: FLAG_ON_VARIANT }),
    ).toHaveLength(1);
  });
});

describe('reading the allowance for a purchase', () => {
  const definitionRow = {
    key: STORE_TEST_PURCHASES_FLAG_KEY,
    description: '',
    kill_switch: false,
    variants: ['on', 'off'],
    default_variant: 'off',
    rules: [],
    expires_at: null,
    maturity: 'general_availability',
    release_channel: null,
    availability: null,
    owner_name: 'billing',
    archived_at: null,
    version: 1,
    created_at: '2026-10-12T00:00:00.000Z',
    updated_at: '2026-10-12T00:00:00.000Z',
  };
  const overrideRow = {
    flag_name: STORE_TEST_PURCHASES_FLAG_KEY,
    user_id: reviewer.userId,
    organization_id: null,
    variant: 'on',
    enabled: true,
    expires_at: null,
  };

  function flagStore(options: { definitions?: unknown[]; overrides?: unknown[] }) {
    store.query.mockImplementation(async (sql: string) =>
      sql.includes('feature_flag_definitions')
        ? (options.definitions ?? [])
        : (options.overrides ?? []),
    );
  }

  beforeEach(() => {
    store.query.mockReset();
    resetFlagDefinitionCache();
  });

  it('allows the account whose override the flag store holds', async () => {
    flagStore({ definitions: [definitionRow], overrides: [overrideRow] });

    await expect(readStoreTestPurchasesAllowed(reviewer.userId)).resolves.toBe(true);
    const overrideRead = store.query.mock.calls.find(([sql]) =>
      String(sql).includes('from public.feature_flags'),
    );
    expect(overrideRead?.[1]).toEqual([reviewer.userId, null, [STORE_TEST_PURCHASES_FLAG_KEY]]);
  });

  it('refuses an account with no override', async () => {
    flagStore({ definitions: [definitionRow] });

    await expect(readStoreTestPurchasesAllowed('someone-else')).resolves.toBe(false);
  });

  it('refuses when nobody has created the flag', async () => {
    flagStore({ overrides: [overrideRow] });

    await expect(readStoreTestPurchasesAllowed(reviewer.userId)).resolves.toBe(false);
  });

  it('refuses when the flag store cannot be read', async () => {
    store.query.mockRejectedValue(new Error('connection refused'));

    await expect(readStoreTestPurchasesAllowed(reviewer.userId)).resolves.toBe(false);
  });
});
