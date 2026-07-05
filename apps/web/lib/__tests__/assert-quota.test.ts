/**
 * Tests for lib/assert-quota.ts
 *
 * Covers:
 *   - Each threshold per tier (Free 80%/100%/150%, Hobby 80%/100%/150%)
 *   - Image/video/CU/MCP sub-quota independence
 *   - Concurrent assertQuota calls don't double-charge (atomicity via RPC)
 *   - Edge: cap exactly at boundary
 *   - Edge: cumulative usage exceeds 150% (already past hard cap)
 *   - Edge: token_credits row missing (default to 0 used)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks · set up before the module under test is imported
// ---------------------------------------------------------------------------

// Mock server-only so it doesn't error in jsdom
vi.mock('server-only', () => ({}));

// Mock @agiworkforce/types to provide getTierPolicy without triggering the
// broken SLOT_REGISTRY init (pre-existing issue from Task #3 in-flight work).
// The tier policies below mirror TIER_POLICIES_INTERNAL from model-catalog.ts.
vi.mock('@agiworkforce/types', () => {
  const FREE_POLICY = {
    tier: 'free',
    surfacedUx: 'auto_only',
    allowedSlots: ['workhorse_general'],
    allowedProviderSurfaces: ['managed_cloud'],
    tokenCapPerMonth: 100_000,
    messagesPerDayCap: 5,
    manualModelSelection: false,
    allowManualSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: false,
    allowMediaGeneration: false,
    allowImageGeneration: false,
    allowVideoGeneration: false,
    allowToolUse: false,
    allowMCP: false,
    capBehavior: { warnAt: 0.8, downgradeAt: 1.0, hardCapAt: 1.5 },
  };
  const HOBBY_POLICY = {
    tier: 'hobby',
    surfacedUx: 'auto_only',
    allowedSlots: [
      'workhorse_general',
      'escalation_coding',
      'reasoning_premium',
      'image_generation',
    ],
    allowedProviderSurfaces: ['managed_cloud'],
    tokenCapPerMonth: 2_000_000,
    manualModelSelection: false,
    allowManualSelection: false,
    allowBrowserDom: false,
    allowComputerUse: false,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    allowVideoGeneration: false,
    imageQuotaPerMonth: 10,
    imageSyntheticTokenCost: 50_000,
    allowToolUse: 'web_search_with_burn_warning',
    allowMCP: 'basic_with_burn_warning',
    capBehavior: { warnAt: 0.8, downgradeAt: 1.0, hardCapAt: 1.5 },
  };
  const PRO_POLICY = {
    tier: 'pro',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: [
      'workhorse_general',
      'general_balanced_pro',
      'coding_premium_pro',
      'reasoning_premium_pro',
      'multimodal_pro',
      'long_context_pro',
      'image_generation',
      'browser_dom',
      'computer_use',
      'search_fast',
      'search_premium',
    ],
    allowedProviderSurfaces: ['managed_cloud', 'byok'],
    tokenCapPerMonth: 10_000_000,
    manualModelSelection: true,
    allowManualSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
    allowImageGeneration: true,
    allowVideoGeneration: false,
    imageQuotaPerMonth: null,
    imageSyntheticTokenCost: 50_000,
    allowToolUse: 'unlimited',
    allowMCP: 'unlimited',
    capBehavior: { warnAt: 0.8, downgradeAt: 1.0, hardCapAt: 1.5 },
  };
  const MAX_POLICY = {
    tier: 'max',
    surfacedUx: 'auto_plus_manual',
    allowedSlots: ['general_fast', 'general_balanced', 'general_premium'],
    allowedProviderSurfaces: ['managed_cloud', 'byok', 'local'],
    manualModelSelection: true,
    allowBrowserDom: true,
    allowComputerUse: true,
    allowSearch: true,
    allowMediaGeneration: true,
  };
  // Pro+ adds the flagship daily cap on top of Pro.
  const PRO_PLUS_POLICY = {
    ...PRO_POLICY,
    tier: 'pro_plus',
    flagshipDailyTokenCap: 15_000,
    videoSecondsPerMonth: 60,
    allowedSlots: [
      ...PRO_POLICY.allowedSlots,
      'flagship_coding_pro_plus',
      'flagship_general_pro_plus',
      'video_generation_pro_plus',
    ],
  };
  const POLICIES: Record<string, typeof FREE_POLICY> = {
    free: FREE_POLICY,
    hobby: HOBBY_POLICY as unknown as typeof FREE_POLICY,
    pro: PRO_POLICY as unknown as typeof FREE_POLICY,
    pro_plus: PRO_PLUS_POLICY as unknown as typeof FREE_POLICY,
    max: MAX_POLICY as unknown as typeof FREE_POLICY,
    enterprise: MAX_POLICY as unknown as typeof FREE_POLICY,
  };
  // Slot → model lookup mirrors SLOT_REGISTRY for the two slots that the
  // flagship-downgrade path uses. Returning synthetic strings for any other
  // slot is fine because assertQuota only resolves these specific identifiers.
  const SLOT_MODELS: Record<string, string> = {
    workhorse_general: 'gemini-3.1-flash-lite',
    coding_premium_pro: 'claude-sonnet-4.6',
    general_balanced_pro: 'gpt-5.4-mini',
  };
  // Session/weekly/flagship-weekly budget helpers, mirroring the real
  // packages/types/src/billing-catalog.ts formulas exactly (not imported via
  // vi.importActual to avoid the broken SLOT_REGISTRY init noted above).
  // Only 'pro'/'max' have a monthlyUsageBudgetUsd here (10 / 75) — 'free' and
  // 'hobby' (which isn't a real BillingPlanTier and would normalize to
  // 'free') both budget to 0, so their rolling-usage checks short-circuit
  // before ever touching the DB mock.
  const MONTHLY_BUDGET_CENTS: Record<string, number> = { pro: 1000, max: 7500 };
  const weeklyBudgetCents = (tier: string) =>
    Math.round(((MONTHLY_BUDGET_CENTS[tier] ?? 0) * 12) / 52);
  const sessionBudgetCents = (tier: string) => Math.round(weeklyBudgetCents(tier) * 0.2);
  const flagshipWeeklyBudgetCents = (tier: string) => Math.round(weeklyBudgetCents(tier) * 0.3);

  return {
    getTierPolicy: (tier: string | null | undefined) => {
      const key = (tier ?? '').toLowerCase();
      return POLICIES[key] ?? POLICIES['free'];
    },
    getRoutingSlotModel: (slot: string) => SLOT_MODELS[slot] ?? `model-for-${slot}`,
    getPlanSessionUsageBudgetCents: (tier: string | null | undefined) =>
      sessionBudgetCents((tier ?? '').toLowerCase()),
    getPlanWeeklyUsageBudgetCents: (tier: string | null | undefined) =>
      weeklyBudgetCents((tier ?? '').toLowerCase()),
    getPlanFlagshipWeeklyUsageBudgetCents: (tier: string | null | undefined) =>
      flagshipWeeklyBudgetCents((tier ?? '').toLowerCase()),
  };
});

// Mock the react `cache` function to be a pass-through in tests.
// In production, cache() deduplicates within a React request context.
// In tests, we want each call to hit the mock directly.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Neon DB mock
// ---------------------------------------------------------------------------

// query returns an array of rows; execute returns a row count.
const mockQuery = vi.fn();
const mockExecute = vi.fn();

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: mockQuery,
    execute: mockExecute,
    transaction: vi.fn(),
    withUser: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Import after mocks
import { assertQuota, reconcileUsage } from '../assert-quota';

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

type UsageRow = {
  credits_used_cents: number;
  credits_allocated_cents: number;
  daily_used_cents: number | null;
  flagship_daily_tokens: number | null;
  flagship_daily_reset_at: string | null;
};

/**
 * Seed the mock to return a usage row with given used/allocated cents.
 * pctUsed = usedCents / allocatedCents (surrogate for token usage fraction).
 * Also seeds image count query to return 0 (pass-through for image tests).
 */
function seedUsageRow(opts: {
  credits_used_cents: number;
  credits_allocated_cents: number;
  daily_used_cents?: number;
  flagship_daily_tokens?: number | null;
  flagship_daily_reset_at?: string | null;
}) {
  const row: UsageRow = {
    credits_used_cents: opts.credits_used_cents,
    credits_allocated_cents: opts.credits_allocated_cents,
    daily_used_cents: opts.daily_used_cents ?? null,
    flagship_daily_tokens: opts.flagship_daily_tokens ?? null,
    flagship_daily_reset_at: opts.flagship_daily_reset_at ?? null,
  };
  // Use mockResolvedValue (not Once) so parallel _fetchUsageRow calls all
  // see the same row. react cache() dedups in production; in tests it's a
  // pass-through, so any fan-out must still see consistent data.
  mockQuery.mockResolvedValue([row]);
}

/** Seed the mock to return no usage row (new user). */
function seedNoUsageRow() {
  mockQuery.mockResolvedValue([]);
}

/** Seed the mock to simulate a DB error on the usage row fetch. */
function seedUsageRowError(message = 'DB error') {
  mockQuery.mockRejectedValue(new Error(message));
}

const BASE_OPTS = {
  userId: 'user-123',
  token: 'jwt-abc',
  requestedTokens: 1000,
};

// ---------------------------------------------------------------------------
// describe blocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: empty usage (no row)
  mockQuery.mockResolvedValue([]);
  mockExecute.mockResolvedValue(0);
});

describe('assertQuota · Free tier (tokenCapPerMonth = 100_000)', () => {
  it('returns ok when well below 80% threshold', async () => {
    // 50k used of 100k cap = 50%, plus 1k requested = still ~50%
    seedUsageRow({ credits_used_cents: 50_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('ok');
  });

  it('returns warn at exactly 80% of cap', async () => {
    // 79_000 / 100_000 = 79% used. Requesting 1_000 token = +1% = 80%.
    // 80% == warnAt so we expect 'warn' (boundary: >= warnAt, < downgradeAt)
    seedUsageRow({ credits_used_cents: 79_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.pctUsed).toBeCloseTo(0.8, 2);
    }
  });

  it('returns warn between 80% and 100%', async () => {
    seedUsageRow({ credits_used_cents: 85_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('warn');
  });

  it('returns downgrade at exactly 100% (credits at 99k + 1k request)', async () => {
    // 99_000 used + 1_000 requested / 100_000 cap = 100%
    seedUsageRow({ credits_used_cents: 99_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('downgrade');
    if (result.kind === 'downgrade') {
      expect(result.modelOverride).toBe('gemini-3.1-flash-lite');
    }
  });

  it('returns downgrade between 100% and 150%', async () => {
    seedUsageRow({ credits_used_cents: 120_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('downgrade');
  });

  it('returns paywall at exactly 150% (hardCapAt)', async () => {
    // 149_000 used + 1_000 requested = 150_000 / 100_000 = 150%
    seedUsageRow({ credits_used_cents: 149_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('token_cap');
      expect(result.requiredTier).toBe('pro');
    }
  });

  it('returns paywall when already past 150% (cumulative > hardCap)', async () => {
    // Already at 200% · every new request should be refused
    seedUsageRow({ credits_used_cents: 200_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 100 });
    expect(result.kind).toBe('paywall');
  });

  it('returns ok when no usage row exists (new user, 0 used)', async () => {
    // No row = 0 used, requesting 1_000 of 100_000 = 1% · well below warnAt
    seedNoUsageRow();
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('ok');
  });

  it('returns ok when DB error fetching usage row (fail-open)', async () => {
    // DB error -> 0 used assumed -> proceed
    seedUsageRowError();
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 });
    expect(result.kind).toBe('ok');
  });
});

describe('assertQuota · Hobby tier (tokenCapPerMonth = 2_000_000)', () => {
  it('returns ok well below 80%', async () => {
    // 1M used / 2M allocated = 50%
    seedUsageRow({ credits_used_cents: 1_000_000, credits_allocated_cents: 2_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'hobby', requestedTokens: 10_000 });
    expect(result.kind).toBe('ok');
  });

  it('returns warn at 80%', async () => {
    // 1_590_000 / 2_000_000 = 79.5%, request 10k tokens = +0.5% = 80%
    seedUsageRow({ credits_used_cents: 1_590_000, credits_allocated_cents: 2_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'hobby', requestedTokens: 10_000 });
    expect(result.kind).toBe('warn');
  });

  it('returns downgrade at 100%', async () => {
    // 1_990_000 + 10_000 = 2_000_000 / 2_000_000 = 100%
    seedUsageRow({ credits_used_cents: 1_990_000, credits_allocated_cents: 2_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'hobby', requestedTokens: 10_000 });
    expect(result.kind).toBe('downgrade');
  });

  it('returns paywall at 150%', async () => {
    // 2_990_000 + 10_000 = 3_000_000 / 2_000_000 = 150%
    seedUsageRow({ credits_used_cents: 2_990_000, credits_allocated_cents: 2_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'hobby', requestedTokens: 10_000 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.requiredTier).toBe('enterprise');
    }
  });

  it('returns paywall feature=token_cap for hobby tier', async () => {
    seedUsageRow({ credits_used_cents: 3_100_000, credits_allocated_cents: 2_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'hobby', requestedTokens: 100 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('token_cap');
    }
  });
});

describe('assertQuota · tier boundary exactly at threshold', () => {
  it('treats pctUsed exactly == warnAt as warn (inclusive lower bound)', async () => {
    // 80_000 / 100_000 = exactly 80% = warnAt. No additional tokens requested.
    seedUsageRow({ credits_used_cents: 80_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 0 });
    expect(result.kind).toBe('warn');
  });

  it('treats pctUsed exactly == downgradeAt as downgrade', async () => {
    // 100_000 / 100_000 = exactly 100% = downgradeAt
    seedUsageRow({ credits_used_cents: 100_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 0 });
    expect(result.kind).toBe('downgrade');
  });

  it('treats pctUsed exactly == hardCapAt as paywall', async () => {
    // 150_000 / 100_000 = exactly 150% = hardCapAt
    seedUsageRow({ credits_used_cents: 150_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 0 });
    expect(result.kind).toBe('paywall');
  });
});

describe('assertQuota · image sub-quota (Hobby: 10/mo)', () => {
  it('returns paywall for image on free tier (not allowed)', async () => {
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'free',
      requestedTokens: 0,
      feature: 'image',
    });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('image');
    }
  });

  it('returns ok for image on hobby tier when no images used yet', async () => {
    // Token usage: 0 used (no row)
    // image usage: 0 images (media_generations returns count 0)
    mockQuery.mockResolvedValue([]);

    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'hobby',
      requestedTokens: 0,
      feature: 'image',
    });
    // Token check: ok (no usage). Image check: 0 images used of 10 quota = 0% < 80%.
    expect(result.kind).toBe('ok');
  });
});

describe('assertQuota · video sub-quota', () => {
  it('returns paywall for video on free tier', async () => {
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'free',
      requestedTokens: 0,
      feature: 'video',
    });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('video');
    }
  });

  it('returns paywall for video on hobby tier (not allowed per spec)', async () => {
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'hobby',
      requestedTokens: 0,
      feature: 'video',
    });
    expect(result.kind).toBe('paywall');
  });
});

describe('assertQuota · computer_use sub-quota', () => {
  it('returns paywall for computer_use on free tier', async () => {
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'free',
      requestedTokens: 0,
      feature: 'computer_use',
    });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('computer_use');
    }
  });

  it('returns paywall for computer_use on hobby tier', async () => {
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'hobby',
      requestedTokens: 0,
      feature: 'computer_use',
    });
    expect(result.kind).toBe('paywall');
  });
});

describe('assertQuota · mcp sub-quota', () => {
  it('returns paywall for mcp on free tier', async () => {
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'free',
      requestedTokens: 0,
      feature: 'mcp',
    });
    expect(result.kind).toBe('paywall');
  });

  it('returns ok for mcp on hobby tier (basic_with_burn_warning = allowed)', async () => {
    // Hobby allows MCP with burn warning. Token usage 0%.
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'hobby',
      requestedTokens: 0,
      feature: 'mcp',
    });
    // Token: ok. MCP: hobby policy.allowMCP = 'basic_with_burn_warning' (truthy) -> ok.
    expect(result.kind).toBe('ok');
  });
});

describe('assertQuota · sub-quota independence', () => {
  it('token paywall takes precedence over image ok', async () => {
    // Token at 200% (paywall) + image not requested separately
    seedUsageRow({ credits_used_cents: 200_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'free',
      requestedTokens: 100,
      feature: 'image',
    });
    // Free tier: image returns paywall (not allowed), token also paywall
    // Either way the result is paywall
    expect(result.kind).toBe('paywall');
  });

  it('image paywall does not affect token check independently', async () => {
    // Token: well within limits. Image: free tier = paywall.
    seedUsageRow({ credits_used_cents: 10_000, credits_allocated_cents: 100_000 });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'free',
      requestedTokens: 100,
      feature: 'image',
    });
    // Token is ok, but image is paywall (free tier doesn't allow image gen)
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('image');
    }
  });
});

describe('assertQuota · tiers without token cap', () => {
  it('returns ok for pro tier with low usage (has tokenCapPerMonth = 10M)', async () => {
    // Pro tier has a 10M monthly token cap. With 0 prior usage and 1k requested, well under 80%.
    seedNoUsageRow();
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro',
      requestedTokens: 1_000,
    });
    expect(result.kind).toBe('ok');
  });

  it('returns ok for max tier', async () => {
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'max',
      requestedTokens: 999_999_999,
    });
    expect(result.kind).toBe('ok');
  });
});

describe('assertQuota · concurrent calls do not double-charge', () => {
  it('concurrent parallel calls both see the same usage snapshot', async () => {
    // In production, cache() deduplicates. In tests, cache() is a pass-through,
    // so both calls will hit the mock. Both calls see the same seeded data.
    // The key property is that neither call WRITES to the DB · that is
    // exclusively done via reconcileUsage -> db.execute('select increment_usage(...)').
    const row: UsageRow = {
      credits_used_cents: 50_000,
      credits_allocated_cents: 100_000,
      daily_used_cents: null,
      flagship_daily_tokens: null,
      flagship_daily_reset_at: null,
    };
    mockQuery.mockResolvedValue([row]);

    const [r1, r2] = await Promise.all([
      assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 }),
      assertQuota({ ...BASE_OPTS, tier: 'free', requestedTokens: 1_000 }),
    ]);

    // Both should be ok (50% + 1% = 51% < 80%)
    expect(r1.kind).toBe('ok');
    expect(r2.kind).toBe('ok');
    // No writes happened · only reads
    expect(mockExecute).not.toHaveBeenCalled();
  });
});

describe('reconcileUsage', () => {
  it('calls increment_usage with correct positional params', async () => {
    mockExecute.mockResolvedValueOnce(1);

    await reconcileUsage({
      userId: 'user-123',
      token: 'jwt-abc',
      actualTokens: 5_000,
    });

    expect(mockExecute).toHaveBeenCalledWith('select increment_usage($1, $2, $3, $4)', [
      'user-123',
      5_000,
      'chat',
      false,
    ]);
  });

  it('calls increment_usage with feature param when provided', async () => {
    mockExecute.mockResolvedValueOnce(1);

    await reconcileUsage({
      userId: 'user-123',
      token: 'jwt-abc',
      actualTokens: 1_000,
      feature: 'image',
    });

    expect(mockExecute).toHaveBeenCalledWith('select increment_usage($1, $2, $3, $4)', [
      'user-123',
      1_000,
      'image',
      false,
    ]);
  });

  it('forwards isFlagship=true for Pro+ flagship daily tracking', async () => {
    mockExecute.mockResolvedValueOnce(1);

    await reconcileUsage({
      userId: 'user-123',
      token: 'jwt-abc',
      actualTokens: 2_500,
      feature: 'chat',
      isFlagship: true,
    });

    expect(mockExecute).toHaveBeenCalledWith('select increment_usage($1, $2, $3, $4)', [
      'user-123',
      2_500,
      'chat',
      true,
    ]);
  });

  it('skips execute call when actualTokens is 0', async () => {
    await reconcileUsage({
      userId: 'user-123',
      token: 'jwt-abc',
      actualTokens: 0,
    });
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it('does not throw when execute fails (fire-and-forget semantics)', async () => {
    mockExecute.mockRejectedValueOnce(new Error('RPC unavailable'));

    // Should not throw
    await expect(
      reconcileUsage({
        userId: 'user-123',
        token: 'jwt-abc',
        actualTokens: 500,
      }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Pro tier tests · tokenCapPerMonth = 10_000_000, capBehavior same cadence
// ---------------------------------------------------------------------------

describe('assertQuota · Pro tier (tokenCapPerMonth = 10_000_000)', () => {
  // Token cap: 10M. capBehavior: { warnAt: 0.8, downgradeAt: 1.0, hardCapAt: 1.5 }
  // Credits surrogate: pctUsed = credits_used_cents / credits_allocated_cents.

  it('ok when usage is at 50% (5M tokens)', async () => {
    // 5M used / 10M cap = 50% + negligible requested = well below 80% warnAt.
    seedUsageRow({ credits_used_cents: 5_000_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 1_000 });
    expect(result.kind).toBe('ok');
  });

  it('warn at exactly 80% boundary (8M tokens)', async () => {
    // 7_990_000 / 10_000_000 = 79.9%, requesting 10_000 = +0.1% => 80.0% = warnAt.
    seedUsageRow({ credits_used_cents: 7_990_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 10_000 });
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.pctUsed).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('warn between 80% and 100% (9M tokens)', async () => {
    // 9M used / 10M cap = 90% · above warnAt, below downgradeAt.
    seedUsageRow({ credits_used_cents: 9_000_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 1_000 });
    expect(result.kind).toBe('warn');
  });

  it('downgrade at exactly 100% (10M tokens)', async () => {
    // 9_990_000 used + 10_000 requested = 10_000_000 / 10_000_000 = 100% = downgradeAt.
    seedUsageRow({ credits_used_cents: 9_990_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 10_000 });
    expect(result.kind).toBe('downgrade');
    if (result.kind === 'downgrade') {
      expect(result.modelOverride).toBe('gemini-3.1-flash-lite');
    }
  });

  it('downgrade between 100% and 150% (12M tokens)', async () => {
    // 12M used / 10M cap = 120% · above downgradeAt, below hardCapAt.
    seedUsageRow({ credits_used_cents: 12_000_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 1_000 });
    expect(result.kind).toBe('downgrade');
  });

  it('paywall at exactly 150% boundary (15M tokens)', async () => {
    // 14_990_000 used + 10_000 requested = 15_000_000 / 10_000_000 = 150% = hardCapAt.
    seedUsageRow({ credits_used_cents: 14_990_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 10_000 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('token_cap');
      // nextTierUp('pro') now returns 'max' (pro_plus removed from locked tiers)
      expect(result.requiredTier).toBe('max');
    }
  });

  it('paywall when already past 150% (17M tokens)', async () => {
    // 17M used / 10M cap = 170% · already past hardCapAt.
    seedUsageRow({ credits_used_cents: 17_000_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 100 });
    expect(result.kind).toBe('paywall');
  });

  it('Pro tier with imageQuotaPerMonth null and 100 images already generated yields ok for token check', async () => {
    // Pro has imageQuotaPerMonth = null, meaning unlimited image gen within the token bucket.
    // A token usage row at 50% should still return 'ok' regardless of image count.
    // The image count mock (media_generations) has no effect because imageQuotaPerMonth is null.
    const row: UsageRow = {
      credits_used_cents: 5_000_000,
      credits_allocated_cents: 10_000_000,
      daily_used_cents: null,
      flagship_daily_tokens: null,
      flagship_daily_reset_at: null,
    };
    mockQuery.mockResolvedValue([row]);

    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro',
      requestedTokens: 1_000,
      feature: 'image',
    });
    // Token check: 50% < 80% = ok. Image check: allowImageGeneration=true, imageQuotaPerMonth=null => ok.
    expect(result.kind).toBe('ok');
  });

  it('nextTierUp for pro resolves to max (pro_plus removed from locked tiers)', async () => {
    // Drive paywall outcome and check the requiredTier field which is set by nextTierUp('pro').
    seedUsageRow({ credits_used_cents: 20_000_000, credits_allocated_cents: 10_000_000 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 100 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.requiredTier).toBe('max');
    }
  });
});

// ---------------------------------------------------------------------------
// Session (rolling 5h) / weekly / flagship-weekly rolling-usage tests.
//
// Pro's derived budgets here (from the mock above): weekly = round(1000*12/52)
// = 231, session = round(231*0.2) = 46, flagshipWeekly = round(231*0.3) = 69.
// These checks read `credit_transactions` (not `token_credits`), so they use
// a SEPARATE mock resolution keyed by which query text is sent.
// ---------------------------------------------------------------------------

describe('assertQuota · session (rolling 5h) / weekly / flagship-weekly caps', () => {
  /** Route mockQuery by SQL text: token_credits row vs. credit_transactions rolling sum. */
  function seedRollingUsage(opts: {
    tokenCreditsRow?: Partial<UsageRow>;
    allModelsUsedCents?: number;
    flagshipUsedCents?: number;
  }) {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('from token_credits')) {
        return Promise.resolve(
          opts.tokenCreditsRow
            ? [
                {
                  credits_used_cents: 0,
                  credits_allocated_cents: 1_000_000,
                  daily_used_cents: null,
                  flagship_daily_tokens: null,
                  flagship_daily_reset_at: null,
                  ...opts.tokenCreditsRow,
                },
              ]
            : [],
        );
      }
      if (sql.includes("metadata->>'is_flagship'")) {
        return Promise.resolve([{ used_cents: opts.flagshipUsedCents ?? 0 }]);
      }
      if (sql.includes('from credit_transactions')) {
        return Promise.resolve([{ used_cents: opts.allModelsUsedCents ?? 0 }]);
      }
      return Promise.resolve([]);
    });
  }

  it('returns ok when session usage is well under the 5h cap (46 cents for pro)', async () => {
    seedRollingUsage({ allModelsUsedCents: 10 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 100 });
    expect(result.kind).toBe('ok');
  });

  it('returns paywall when session usage exceeds 150% of the 5h cap', async () => {
    // Session cap for pro = 46 cents; 150% = 69 cents. allModelsUsedCents
    // feeds both the weekly AND session rolling-sum queries in this mock
    // (both match "from credit_transactions" without the flagship filter),
    // so set it high enough to trip session's smaller cap specifically.
    seedRollingUsage({ allModelsUsedCents: 100 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 0 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('session');
    }
  });

  it('returns paywall for flagship-weekly when flagship-only spend exceeds its cap, even if all-models spend is low', async () => {
    // flagshipWeekly cap for pro = 69 cents. Keep all-models spend (which
    // also gates session/weekly) low, but push flagship-only spend past 150%.
    seedRollingUsage({ allModelsUsedCents: 5, flagshipUsedCents: 200 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 0 });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('flagship_weekly');
    }
  });

  it('skips all rolling-window checks for tiers with no derived budget (hobby normalizes to free -> 0)', async () => {
    seedRollingUsage({ allModelsUsedCents: 999_999, flagshipUsedCents: 999_999 });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'hobby', requestedTokens: 100 });
    // hobby's monthly token check still runs (tokenCapPerMonth=2M) but with
    // an empty token_credits row (0 used) that's well under 80%.
    expect(result.kind).toBe('ok');
  });

  it('fails open (ok) when the rolling-usage query errors', async () => {
    mockQuery.mockImplementation((sql: string) => {
      if (sql.includes('from credit_transactions')) {
        return Promise.reject(new Error('DB unavailable'));
      }
      return Promise.resolve([]);
    });
    const result = await assertQuota({ ...BASE_OPTS, tier: 'pro', requestedTokens: 100 });
    expect(result.kind).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// Pro+ flagship daily-cap tests
// flagshipDailyTokenCap = 15_000 tokens/day on flagship_*_pro_plus slots
// (Opus 4.7, GPT-5.5). Below cap = ok. 80% = warn. 100% = downgrade to the
// matching Pro slot (sonnet-4.6 / gpt-5.4-mini). 150% = paywall.
// ---------------------------------------------------------------------------

describe('assertQuota · Pro+ flagship daily cap (15K tokens/day)', () => {
  /** ISO timestamp for "5 minutes ago" · counter is live. */
  const liveResetAt = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();
  /** ISO timestamp for "26 hours ago" · counter is stale (lazy reset). */
  const staleResetAt = () => new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

  it('does not check daily cap when slot is omitted (legacy callers)', async () => {
    // Pro+ user, plenty of monthly headroom, daily counter at 14K tokens · no slot
    // means assertQuota cannot tell that the request is flagship-bound, so the
    // daily cap is skipped. This protects legacy chat completions callers.
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 14_000,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 1_000,
    });
    expect(result.kind).toBe('ok');
  });

  it('does not check daily cap for non-flagship slot on Pro+ (e.g. coding_premium_pro)', async () => {
    // Even with the daily counter at 14K, a non-flagship slot bypasses the
    // daily cap entirely.
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 14_000,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 1_000,
      slot: 'coding_premium_pro',
    });
    expect(result.kind).toBe('ok');
  });

  it('returns ok well below 80% of daily cap', async () => {
    // 5K used + 1K requested = 40% of 15K cap.
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 5_000,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 1_000,
      slot: 'flagship_coding_pro_plus',
    });
    expect(result.kind).toBe('ok');
  });

  it('returns warn at exactly 80% of daily cap', async () => {
    // 11_000 used + 1_000 requested = 12_000 / 15_000 = 80%
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 11_000,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 1_000,
      slot: 'flagship_general_pro_plus',
    });
    expect(result.kind).toBe('warn');
    if (result.kind === 'warn') {
      expect(result.warning).toContain('flagship_daily');
      expect(result.pctUsed).toBeCloseTo(0.8, 2);
    }
  });

  it('downgrades to coding_premium_pro (sonnet-4.6) at 100% on flagship_coding_pro_plus', async () => {
    // 14_500 used + 500 requested = 15_000 / 15_000 = 100% = downgradeAt
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 14_500,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 500,
      slot: 'flagship_coding_pro_plus',
    });
    expect(result.kind).toBe('downgrade');
    if (result.kind === 'downgrade') {
      // Routes to coding_premium_pro slot model · Sonnet 4.6.
      expect(result.modelOverride).toBe('claude-sonnet-4.6');
      expect(result.reason).toContain('Pro+ daily flagship cap');
    }
  });

  it('downgrades to general_balanced_pro (gpt-5.4-mini) at 100% on flagship_general_pro_plus', async () => {
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 14_500,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 500,
      slot: 'flagship_general_pro_plus',
    });
    expect(result.kind).toBe('downgrade');
    if (result.kind === 'downgrade') {
      expect(result.modelOverride).toBe('gpt-5.4-mini');
    }
  });

  it('paywalls at 150% of daily cap', async () => {
    // 22_000 used + 500 requested = 22_500 / 15_000 = 150% = hardCapAt
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 22_000,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 500,
      slot: 'flagship_coding_pro_plus',
    });
    expect(result.kind).toBe('paywall');
    if (result.kind === 'paywall') {
      expect(result.feature).toBe('flagship_daily');
      // nextTierUp from pro_plus jumps to enterprise via the default branch.
      expect(['enterprise', 'max']).toContain(result.requiredTier);
    }
  });

  it('treats stale reset_at (>24h) as 0 used · lazy reset', async () => {
    // Counter shows 14_999 but reset_at is 26h ago: assertQuota treats the
    // counter as expired and computes pctUsed using 0 + requested = 1K/15K.
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 14_999,
      flagship_daily_reset_at: staleResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 1_000,
      slot: 'flagship_coding_pro_plus',
    });
    expect(result.kind).toBe('ok');
  });

  it('treats NULL reset_at as 0 used (first-ever flagship request)', async () => {
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: null,
      flagship_daily_reset_at: null,
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 5_000,
      slot: 'flagship_general_pro_plus',
    });
    expect(result.kind).toBe('ok');
  });

  it('Pro tier (no flagshipDailyTokenCap) skips daily check even with flagship slot', async () => {
    // Pro policy doesn't set flagshipDailyTokenCap. Even if a caller passes a
    // flagship_*_pro_plus slot (shouldn't happen via the resolver, but the
    // helper must remain defensive), no daily check fires.
    seedUsageRow({
      credits_used_cents: 1_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 999_999,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro',
      requestedTokens: 1_000,
      slot: 'flagship_coding_pro_plus',
    });
    expect(result.kind).toBe('ok');
  });

  it('returns most-severe outcome when both monthly and daily caps trip', async () => {
    // Monthly at 90% (warn) AND daily at 105% (downgrade). Severity rank:
    // downgrade > warn, so the daily downgrade wins.
    seedUsageRow({
      credits_used_cents: 9_000_000,
      credits_allocated_cents: 10_000_000,
      flagship_daily_tokens: 15_750,
      flagship_daily_reset_at: liveResetAt(),
    });
    const result = await assertQuota({
      ...BASE_OPTS,
      tier: 'pro_plus',
      requestedTokens: 100,
      slot: 'flagship_coding_pro_plus',
    });
    expect(result.kind).toBe('downgrade');
    if (result.kind === 'downgrade') {
      expect(result.modelOverride).toBe('claude-sonnet-4.6');
    }
  });
});
