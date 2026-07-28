/**
 * @file Unit tests for the LLM proxy route's catalog-driven helpers.
 *
 * Coverage:
 *   - BASIC_ALLOWED_MODELS is derived from `tierAllowedModels.economy`
 *     in models.json and stays in sync with the catalog SSOT (P0-I).
 *   - resolveProvider() looks up provider via getModelMetadataById()
 *     instead of the stale `model.startsWith('claude-')` heuristic, and
 *     fails closed for catalog-unknown or non-proxied providers (P0-I).
 *
 * Why these specific assertions:
 *   The 2026-05-05 audit flagged the previous hardcoded
 *   BASIC_ALLOWED_MODELS literal-list as a drift risk — every catalog
 *   refresh would silently bypass the gate until a human noticed. The
 *   tests below pin the catalog→gateway invariant so a future model
 *   rename, provider re-attribution, or tier reshuffle either passes
 *   end-to-end or fails CI here, rather than in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllowedModelsForTier, getRoutingSlotModel, modelsCatalog } from '@agiworkforce/types';

// enforcePlanTier hits `subscriptions` via getUserScopedClient — mock the
// Neon client module so the dispatch tests below don't need a real DB.
// Mirrors the `from(table) -> {select/eq/maybeSingle}` shape already used in
// revocation.test.ts / deviceAuth.test.ts for the same module.
const { tierState } = vi.hoisted(() => ({
  tierState: {
    planTier: null as string | null,
    status: 'active' as string | null,
    hasRow: true,
  },
}));

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: vi.fn(() => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: tierState.hasRow
                ? { plan_tier: tierState.planTier, status: tierState.status }
                : null,
              error: null,
            }),
        }),
      }),
    }),
  })),
}));

const {
  BASIC_ALLOWED_MODELS,
  PRO_ALLOWED_MODELS,
  FLAGSHIP_ALLOWED_MODELS,
  resolveProvider,
  enforcePlanTier,
} = await import('../../src/routes/llm');

describe('llm route — catalog-driven Basic allow-list', () => {
  it('matches getAllowedModelsForTier("economy") from the shared catalog', () => {
    const expected = new Set(getAllowedModelsForTier('economy'));
    expect(new Set(BASIC_ALLOWED_MODELS)).toEqual(expected);
  });

  it('contains the Basic workhorse + coding + reasoning slot models', () => {
    // Canonical economy routing slots.
    // workhorse_general, coding_fast, reasoning_economy all back
    // models that must be reachable from a Basic request.
    const workhorse = getRoutingSlotModel('workhorse_general');
    const coding = getRoutingSlotModel('coding_fast');
    const reasoning = getRoutingSlotModel('reasoning_economy');

    expect(BASIC_ALLOWED_MODELS.has(workhorse)).toBe(true);
    expect(BASIC_ALLOWED_MODELS.has(coding)).toBe(true);
    expect(BASIC_ALLOWED_MODELS.has(reasoning)).toBe(true);
  });

  it('excludes flagship models that should be Pro-only', () => {
    // claude-opus-5 + gpt-5.5 are flagship; the api-gateway must NOT
    // serve them on Basic even if a malicious caller supplies the ID.
    expect(BASIC_ALLOWED_MODELS.has('claude-opus-5')).toBe(false);
    expect(BASIC_ALLOWED_MODELS.has('gpt-5.5')).toBe(false);
  });

  it('every Basic-allowed model has a known provider in the catalog', () => {
    // P0-I drift check: if any model lands in tierAllowedModels.economy
    // but isn't registered in modelsCatalog.models, the gateway would
    // 400 every Basic request for that ID. Fail loudly here instead.
    const missing: string[] = [];
    for (const id of BASIC_ALLOWED_MODELS) {
      const meta = modelsCatalog.models[id];
      if (!meta || !meta.provider) {
        missing.push(id);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('llm route — resolveProvider catalog lookup (P0-I)', () => {
  it('resolves anthropic from claude-* models via the catalog', () => {
    expect(resolveProvider('claude-sonnet-5')).toBe('anthropic');
    expect(resolveProvider('claude-sonnet-5')).toBe('anthropic');
  });

  it('resolves openai from gpt-* and o-series models via the catalog', () => {
    expect(resolveProvider('gpt-5.4-mini')).toBe('openai');
  });

  it('resolves google from gemini-* models via the catalog', () => {
    expect(resolveProvider('gemini-3.5-flash-lite')).toBe('google');
  });

  it('throws 400 for catalog-unknown models (defense against typos)', () => {
    expect(() => resolveProvider('totally-bogus-model-id')).toThrow(/Unsupported model/);
  });

  it('resolves the Wave-2-widened cloud providers via the catalog', () => {
    // Restructure Wave 2 step 2 wired every cloud adapter from
    // packages/ai/providers into the gateway, so models from xAI, DeepSeek,
    // and Perplexity now resolve instead of failing closed. Local-device
    // providers (lmstudio, and ollama unless the server deploys one)
    // remain outside the managed proxy; catalog-unknown models still 400.
    expect(resolveProvider('grok-4.5')).toBe('xai');
    expect(resolveProvider('deepseek-v4-flash')).toBe('deepseek');
    expect(resolveProvider('sonar')).toBe('perplexity');
  });

  it('proxies the current MiniMax model through its registered leaf adapter', () => {
    expect(resolveProvider('minimax-m3')).toBe('minimax');
  });

  it('lookup is consistent with the catalog provider field for every Basic model', () => {
    // For each model in the Basic allow-list, verify that:
    //   - if its catalog provider is a proxied cloud provider, resolveProvider() succeeds
    //   - otherwise resolveProvider() throws (gateway can't proxy it).
    // This keeps the proxy honest: any new economy-tier model that
    // joins models.json must EITHER be on a proxied provider OR be
    // explicitly rejected — there's no silent fallthrough.
    const proxiedProviders = new Set([
      'anthropic',
      'openai',
      'google',
      'deepseek',
      'xai',
      'perplexity',
      'minimax',
      'moonshot',
      'qwen',
      'zhipu',
      'open_router',
    ]);
    for (const id of BASIC_ALLOWED_MODELS) {
      const meta = modelsCatalog.models[id];
      if (!meta) continue;
      if (proxiedProviders.has(meta.provider)) {
        expect(resolveProvider(id)).toBe(meta.provider);
      } else {
        expect(() => resolveProvider(id)).toThrow(/does not proxy/);
      }
    }
  });
});

describe('llm route — every Basic provider has a representative model', () => {
  // For each provider that participates in the Basic tier (i.e. has at
  // least one model in tierAllowedModels.economy), assert that at least
  // one of its catalog-listed models is in the Basic set. Every provider
  // that could serve a Basic user
  // has a documented entry-point model.
  it('at least one model per Basic-participating provider passes the allow-list', () => {
    const providersInBasic = new Set<string>();
    for (const id of BASIC_ALLOWED_MODELS) {
      const provider = modelsCatalog.models[id]?.provider;
      if (provider) providersInBasic.add(provider);
    }

    expect([...providersInBasic].sort()).toEqual(['anthropic', 'google', 'openai']);
  });
});

// ---------------------------------------------------------------------------
// Edge-case / stress invariants for subscription enforcement (Phase 4)
// These tests pin the behavior of the catalog-derived allow-list and the
// resolveProvider lookup under adversarial inputs.
// ---------------------------------------------------------------------------

describe('llm route — edge-case stress (Phase 4 hardening)', () => {
  it('resolveProvider throws for empty string model id', () => {
    expect(() => resolveProvider('')).toThrow();
  });

  it('resolveProvider throws for null-ish model id (whitespace)', () => {
    expect(() => resolveProvider('   ')).toThrow();
  });

  it('resolveProvider throws for SQL injection attempt in model id', () => {
    expect(() => resolveProvider("' OR '1'='1")).toThrow();
  });

  it('resolveProvider throws for model id with path traversal attempt', () => {
    expect(() => resolveProvider('../../etc/passwd')).toThrow();
  });

  it('BASIC_ALLOWED_MODELS is non-empty and every entry is a non-empty string', () => {
    expect(BASIC_ALLOWED_MODELS.size).toBeGreaterThan(0);
    for (const id of BASIC_ALLOWED_MODELS) {
      expect(typeof id).toBe('string');
      expect(id.trim().length).toBeGreaterThan(0);
    }
  });

  it('concurrent resolveProvider calls for all Basic models are consistent', async () => {
    // Stress: 50 concurrent lookups must all return the same result as serial.
    const basicModels = [...BASIC_ALLOWED_MODELS];
    const serial = basicModels.map((id) => {
      try {
        return resolveProvider(id);
      } catch {
        return null;
      }
    });
    const concurrent = await Promise.all(
      basicModels.map((id) =>
        Promise.resolve().then(() => {
          try {
            return resolveProvider(id);
          } catch {
            return null;
          }
        }),
      ),
    );
    expect(concurrent).toEqual(serial);
  });

  it('resolveProvider is deterministic under 1000 rapid calls for the same model', () => {
    const model = 'claude-sonnet-5';
    const expected = resolveProvider(model);
    for (let i = 0; i < 1000; i++) {
      expect(resolveProvider(model)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// enforcePlanTier — tier ladder (founder directive 2026-07-16)
//
// Routing/access is tier-based: Free and Basic use economy models; Pro and
// Team add pro_additions; Max, Max 15x, and Enterprise add flagships.
// ---------------------------------------------------------------------------

describe('llm route — enforcePlanTier tier ladder (founder directive 2026-07-16)', () => {
  const allowedBasicModel = [...BASIC_ALLOWED_MODELS][0]!;
  const proAdditionModel = [...PRO_ALLOWED_MODELS].find((id) => !BASIC_ALLOWED_MODELS.has(id))!;
  const flagshipModel = [...FLAGSHIP_ALLOWED_MODELS].find((id) => !PRO_ALLOWED_MODELS.has(id))!;

  beforeEach(() => {
    tierState.planTier = null;
    tierState.status = 'active';
    tierState.hasRow = true;
  });

  it('derives the ladder from the catalog SSOT', () => {
    expect(new Set(PRO_ALLOWED_MODELS)).toEqual(
      new Set([...getAllowedModelsForTier('economy'), ...getAllowedModelsForTier('pro_additions')]),
    );
    expect(new Set(FLAGSHIP_ALLOWED_MODELS)).toEqual(
      new Set([...PRO_ALLOWED_MODELS, ...getAllowedModelsForTier('flagship_additions')]),
    );
    // The directive's named models are flagship-gated.
    for (const id of ['claude-opus-5', 'claude-fable-5', 'gpt-5.6-sol']) {
      expect(PRO_ALLOWED_MODELS.has(id)).toBe(false);
      expect(FLAGSHIP_ALLOWED_MODELS.has(id)).toBe(true);
    }
  });

  it('free tier allows economy models only', async () => {
    tierState.planTier = 'free';
    await expect(enforcePlanTier('user-1', 'token', allowedBasicModel)).resolves.toBe('free');
    await expect(enforcePlanTier('user-1', 'token', proAdditionModel)).rejects.toThrow(
      /not available on the Free plan/,
    );
  });

  it('missing subscription row is treated as the Free plan', async () => {
    tierState.hasRow = false;
    await expect(enforcePlanTier('user-1', 'token', allowedBasicModel)).resolves.toBe('free');
  });

  it.each(['canceled', 'past_due', 'unpaid', 'expired'])(
    'rejects a retained paid plan when its subscription is %s',
    async (status) => {
      tierState.planTier = 'pro';
      tierState.status = status;

      await expect(enforcePlanTier('user-1', 'token', allowedBasicModel, 'app')).rejects.toThrow(
        `Subscription is ${status}`,
      );
    },
  );

  it('does not let an inactive retained paid plan pass developer-surface admission', async () => {
    tierState.planTier = 'pro';
    tierState.status = 'canceled';

    await expect(enforcePlanTier('user-1', 'token', proAdditionModel, 'developer')).rejects.toThrow(
      'Subscription is canceled',
    );
  });

  it('keeps trialing subscriptions entitled on app and developer surfaces', async () => {
    tierState.planTier = 'pro';
    tierState.status = 'trialing';

    await expect(enforcePlanTier('user-1', 'token', proAdditionModel, 'app')).resolves.toBe('pro');
    await expect(enforcePlanTier('user-1', 'token', proAdditionModel, 'developer')).resolves.toBe(
      'pro',
    );
  });

  for (const tier of ['basic'] as const) {
    it(`${tier} tier allows an economy model`, async () => {
      tierState.planTier = tier;
      await expect(enforcePlanTier('user-1', 'token', allowedBasicModel)).resolves.toBe(tier);
    });

    it(`${tier} tier rejects a pro_additions model with 403`, async () => {
      tierState.planTier = tier;
      await expect(enforcePlanTier('user-1', 'token', proAdditionModel)).rejects.toThrow(
        /requires a Pro plan or above/,
      );
    });
  }

  for (const tier of ['pro', 'team'] as const) {
    it(`${tier} tier allows a pro_additions model`, async () => {
      tierState.planTier = tier;
      await expect(enforcePlanTier('user-1', 'token', proAdditionModel)).resolves.toBe(tier);
    });

    it(`${tier} tier rejects a flagship model with 403`, async () => {
      tierState.planTier = tier;
      await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
        /requires a Max plan or above/,
      );
    });
  }

  for (const tier of ['max', 'max_15x', 'enterprise'] as const) {
    it(`${tier} tier allows a flagship model`, async () => {
      tierState.planTier = tier;
      await expect(enforcePlanTier('user-1', 'token', flagshipModel)).resolves.toBe(tier);
    });

    it(`${tier} tier rejects a catalog-unknown model with 403`, async () => {
      tierState.planTier = tier;
      await expect(enforcePlanTier('user-1', 'token', 'gpt-99-invented-model')).rejects.toThrow(
        /not available on managed cloud/,
      );
    });
  }

  it('an unrecognized plan_tier string fails closed instead of granting access', async () => {
    tierState.planTier = 'some-future-tier-nobody-added-yet';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
      /not available for this plan/,
    );
  });

  it('an empty-string plan_tier fails closed instead of granting access', async () => {
    tierState.planTier = '';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
      /not available for this plan/,
    );
  });
});
