import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { listCanonicalModels } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/neon-db');
type ScanModule1 = typeof import('@/lib/server/rls-db');
type ScanModule2 = typeof import('@/lib/services/managed-content-safety-service');
type ScanModule3 = typeof import('./chat-attachment-hydration');
type ScanModule4 = typeof import('@/lib/services/managed-memory-context-service');
type ScanModule5 = typeof import('@/lib/server/user-identity');
type ScanModule6 = typeof import('@/lib/services/managed-usage-request-service');

const mocks = vi.hoisted(() => ({
  flagQuery: vi.fn(),
  scopedQuery: vi.fn(),
  enforceSafety: vi.fn(),
  hydrate: vi.fn(),
  loadPolicy: vi.fn(),
  customInstructions: vi.fn(),
  reserveManagedUsage: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getNeonDb: () => ({ query: mocks.flagQuery }),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  getUserScopedDb: async () => ({
    db: { query: mocks.scopedQuery },
    userId: 'fast-gate-user',
    organizationId: null,
  }),
}));
vi.mock('@/lib/services/managed-content-safety-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  enforceManagedContentSafetyPreference: mocks.enforceSafety,
}));
vi.mock('./chat-attachment-hydration', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  hydrateChatAttachments: mocks.hydrate,
}));
vi.mock('@/lib/services/managed-memory-context-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  loadManagedMemoryPolicy: mocks.loadPolicy,
}));
vi.mock('@/lib/server/user-identity', async (importOriginal) => ({
  ...(await importOriginal<ScanModule5>()),
  buildCustomInstructionsPreamble: mocks.customInstructions,
}));
vi.mock('@/lib/services/managed-usage-request-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule6>()),
  reserveManagedUsageRequest: mocks.reserveManagedUsage,
}));

import { resetFlagDefinitionCache } from '@/lib/feature-flags/flag-store';
import { CreditService } from '@/lib/services/credit-service';
import { processRequest } from './request-processor';

const fastModel = listCanonicalModels().find((model) => model.fastTier);
if (!fastModel) throw new Error('The catalogue must declare a fast model');
const MODEL_ID = fastModel.id;
const SWITCH_ROW = {
  key: 'capability.fast_mode',
  description: 'Fast mode admission',
  kill_switch: true,
  variants: ['on', 'off'],
  default_variant: 'on',
  rules: [],
  expires_at: null,
  maturity: 'general_availability',
  release_channel: 'stable',
  availability: 'general',
  owner_name: 'chat',
  archived_at: null,
  version: 1,
  created_at: '2026-09-30T00:00:00.000Z',
  updated_at: '2026-09-30T00:00:00.000Z',
};

function run(speed?: 'fast' | 'standard') {
  return processRequest(
    new NextRequest('https://agiworkforce.com/api/llm/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'fast-gate-request' },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: 'user', content: 'Summarize the agenda.' }],
        stream: false,
        ...(speed ? { speed } : {}),
      }),
    }),
    {
      ok: true,
      userId: 'fast-gate-user',
      token: 'session-token',
      subscription: {
        id: 'fast-gate-subscription',
        user_id: 'fast-gate-user',
        plan_tier: 'max',
        status: 'active',
        current_period_start: new Date('2026-09-01T00:00:00.000Z'),
        current_period_end: new Date('2026-10-01T00:00:00.000Z'),
        stripe_subscription_id: 'fixture-subscription',
        stripe_price_id: 'fixture-price',
      },
    },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  resetFlagDefinitionCache();
  vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-provider-configured');
  mocks.flagQuery.mockResolvedValue([]);
  mocks.scopedQuery.mockImplementation(async (sql: string) =>
    sql.includes('subscription.overage_enabled')
      ? [{ overage_enabled: true, available_microusd: 1_000_000_000 }]
      : [],
  );
  mocks.enforceSafety.mockResolvedValue({ enabled: false, allowed: true });
  mocks.hydrate.mockResolvedValue(undefined);
  mocks.loadPolicy.mockResolvedValue({
    enabled: false,
    generateFromHistory: false,
    allowToolAssistedGeneration: false,
  });
  mocks.customInstructions.mockResolvedValue(null);
  mocks.reserveManagedUsage.mockImplementation(async (input) => ({
    ...input,
    db: { query: mocks.scopedQuery },
    leaseToken: 'fixture-lease',
  }));
  vi.spyOn(CreditService, 'getBalance').mockResolvedValue({
    account_id: 'fixture-account',
    credits_allocated_cents: 100_000,
    credits_remaining_cents: 90_000,
    credits_used_cents: 10_000,
  } as Awaited<ReturnType<typeof CreditService.getBalance>>);
  vi.spyOn(CreditService, 'checkAvailable').mockResolvedValue(true);
  vi.spyOn(CreditService, 'checkAvailableMicrousd').mockResolvedValue(true);
});

afterEach(() => vi.unstubAllEnvs());

describe('Fast mode operator admission', () => {
  it('refuses a switched-off Fast mode before reserving credits or producing a provider request', async () => {
    mocks.flagQuery.mockImplementation(async (sql: string) =>
      sql.includes('feature_flag_definitions') ? [SWITCH_ROW] : [],
    );
    await expect(run('fast')).rejects.toMatchObject({ statusCode: 503, userSafe: true });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
    expect(mocks.enforceSafety).not.toHaveBeenCalled();
  });

  it.each(['standard', undefined] as const)(
    'leaves ordinary completion admitted with speed %s while Fast mode is switched off',
    async (speed) => {
      mocks.flagQuery.mockImplementation(async (sql: string) =>
        sql.includes('feature_flag_definitions') ? [SWITCH_ROW] : [],
      );
      const result = await run(speed);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.llmRequest).not.toHaveProperty('speed', 'fast');
      expect(mocks.reserveManagedUsage).toHaveBeenCalledOnce();
      expect(mocks.reserveManagedUsage.mock.calls[0]?.[0]).not.toHaveProperty('funding');
    },
  );

  it('admits Fast mode under an open switch with extra usage funding', async () => {
    mocks.flagQuery.mockImplementation(async (sql: string) =>
      sql.includes('feature_flag_definitions') ? [{ ...SWITCH_ROW, kill_switch: false }] : [],
    );
    const result = await run('fast');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.llmRequest.speed).toBe('fast');
    expect(mocks.reserveManagedUsage.mock.calls[0]?.[0]).toMatchObject({
      userId: 'fast-gate-user',
      funding: 'extra_usage',
    });
  });

  it('refuses a user override that closes Fast mode', async () => {
    mocks.flagQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flag_definitions')) return [{ ...SWITCH_ROW, kill_switch: false }];
      if (sql.includes('public.feature_flags')) {
        return [
          {
            flag_name: SWITCH_ROW.key,
            user_id: 'fast-gate-user',
            organization_id: null,
            variant: 'off',
            enabled: false,
            expires_at: null,
          },
        ];
      }
      return [];
    });
    await expect(run('fast')).rejects.toMatchObject({ statusCode: 503, userSafe: true });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed switch instead of silently leaving it out', async () => {
    mocks.flagQuery.mockImplementation(async (sql: string) =>
      sql.includes('feature_flag_definitions') ? [{ ...SWITCH_ROW, rules: 'unreadable' }] : [],
    );
    await expect(run('fast')).rejects.toMatchObject({ statusCode: 503, userSafe: true });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
  });

  it('fails closed on an override naming an undeclared variant', async () => {
    mocks.flagQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flag_definitions')) return [{ ...SWITCH_ROW, kill_switch: false }];
      if (sql.includes('public.feature_flags')) {
        return [
          {
            flag_name: SWITCH_ROW.key,
            user_id: 'fast-gate-user',
            organization_id: null,
            variant: 'unknown',
            enabled: false,
            expires_at: null,
          },
        ];
      }
      return [];
    });
    await expect(run('fast')).rejects.toMatchObject({ statusCode: 503, userSafe: true });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
  });

  it('keeps an ordinary completion available when the Fast mode store is unreadable', async () => {
    mocks.flagQuery.mockRejectedValue(new Error('flag store unavailable'));
    const result = await run('standard');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.llmRequest).not.toHaveProperty('speed', 'fast');
    expect(mocks.reserveManagedUsage).toHaveBeenCalledOnce();
  });

  it('fails closed when the operator definitions cannot be read', async () => {
    mocks.flagQuery.mockRejectedValue(new Error('flag definitions unavailable'));
    await expect(run('fast')).rejects.toMatchObject({ statusCode: 503, userSafe: true });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
  });

  it('fails closed when the operator overrides cannot be read', async () => {
    mocks.flagQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flag_definitions')) return [{ ...SWITCH_ROW, kill_switch: false }];
      if (sql.includes('public.feature_flags')) throw new Error('flag overrides unavailable');
      return [];
    });
    await expect(run('fast')).rejects.toMatchObject({ statusCode: 503, userSafe: true });
    expect(mocks.reserveManagedUsage).not.toHaveBeenCalled();
  });
});
