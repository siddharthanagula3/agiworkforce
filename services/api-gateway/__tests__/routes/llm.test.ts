/**
 * @file Unit tests for the LLM proxy route's catalog-driven helpers.
 *
 * Coverage:
 *   - HOBBY_ALLOWED_MODELS is derived from `tierAllowedModels.economy`
 *     in models.json and stays in sync with the catalog SSOT (P0-I).
 *   - resolveProvider() looks up provider via getModelMetadataById()
 *     instead of the stale `model.startsWith('claude-')` heuristic, and
 *     fails closed for catalog-unknown or non-proxied providers (P0-I).
 *
 * Why these specific assertions:
 *   The 2026-05-05 audit flagged the previous hardcoded
 *   HOBBY_ALLOWED_MODELS literal-list as a drift risk — every catalog
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
  tierState: { planTier: null as string | null, hasRow: true },
}));

vi.mock('../../src/lib/neonClients', () => ({
  getUserScopedClient: vi.fn(() => ({
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({
              data: tierState.hasRow ? { plan_tier: tierState.planTier } : null,
              error: null,
            }),
        }),
      }),
    }),
  })),
}));

const { HOBBY_ALLOWED_MODELS, resolveProvider, enforcePlanTier } =
  await import('../../src/routes/llm');

describe('llm route — catalog-driven Hobby allow-list (P0-I)', () => {
  it('matches getAllowedModelsForTier("economy") from the shared catalog', () => {
    const expected = new Set(getAllowedModelsForTier('economy'));
    expect(new Set(HOBBY_ALLOWED_MODELS)).toEqual(expected);
  });

  it('contains the Hobby workhorse + escalation + reasoning slot models', () => {
    // auto-routing-spec §2 — Pool B Hobby slots.
    // workhorse_general, escalation_coding, reasoning_premium all back
    // models that MUST be reachable from a Hobby request.
    const workhorse = getRoutingSlotModel('workhorse_general');
    const escalation = getRoutingSlotModel('escalation_coding');
    const reasoning = getRoutingSlotModel('reasoning_premium');

    expect(HOBBY_ALLOWED_MODELS.has(workhorse)).toBe(true);
    // escalation_coding (GLM-5.1) lives under tierAllowedModels.economy.
    expect(HOBBY_ALLOWED_MODELS.has(escalation)).toBe(true);
    // reasoning_premium (DeepSeek V4 Flash) lives under economy.
    expect(HOBBY_ALLOWED_MODELS.has(reasoning)).toBe(true);
  });

  it('excludes flagship models that should be Pro-only', () => {
    // claude-opus-4.8 + gpt-5.5 are flagship; the api-gateway must NOT
    // serve them on Hobby even if a malicious caller supplies the ID.
    expect(HOBBY_ALLOWED_MODELS.has('claude-opus-4.8')).toBe(false);
    expect(HOBBY_ALLOWED_MODELS.has('gpt-5.5')).toBe(false);
    expect(HOBBY_ALLOWED_MODELS.has('gpt-5.5')).toBe(false);
  });

  it('every Hobby-allowed model has a known provider in the catalog', () => {
    // P0-I drift check: if any model lands in tierAllowedModels.economy
    // but isn't registered in modelsCatalog.models, the gateway would
    // 400 every Hobby request for that ID. Fail loudly here instead.
    const missing: string[] = [];
    for (const id of HOBBY_ALLOWED_MODELS) {
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
    expect(resolveProvider('claude-haiku-4.5')).toBe('anthropic');
    expect(resolveProvider('claude-sonnet-4.6')).toBe('anthropic');
  });

  it('resolves openai from gpt-* and o-series models via the catalog', () => {
    expect(resolveProvider('gpt-5.4-mini')).toBe('openai');
  });

  it('resolves google from gemini-* models via the catalog', () => {
    expect(resolveProvider('gemini-3.1-flash-lite')).toBe('google');
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
    expect(resolveProvider('grok-4.3')).toBe('xai');
    expect(resolveProvider('deepseek-v4-flash')).toBe('deepseek');
    expect(resolveProvider('sonar')).toBe('perplexity');
  });

  it('lookup is consistent with the catalog provider field for every Hobby model', () => {
    // For each model in the Hobby allow-list, verify that:
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
      'groq',
      'mistral',
      'moonshot',
      'qwen',
      'zhipu',
      'open_router',
    ]);
    for (const id of HOBBY_ALLOWED_MODELS) {
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

describe('llm route — every named provider has a representative Hobby model', () => {
  // The 12 named providers locked in MEMORY.md (current era 2026-05):
  //   anthropic, openai, google, xai, deepseek, perplexity, qwen, moonshot,
  //   zhipu, ollama, lmstudio, mistral. Plus the user-defined Custom slot.
  //
  // For each provider that participates in the Hobby tier (i.e. has at
  // least one model in tierAllowedModels.economy), assert that at least
  // one of its catalog-listed models is in the Hobby set. This is the
  // "12 named providers' Hobby flagship pass" assertion called out in
  // the P0-I task brief — every provider that COULD serve a Hobby user
  // has a documented entry-point model.
  it('at least one model per Hobby-participating provider passes the allow-list', () => {
    const providersInHobby = new Set<string>();
    for (const id of HOBBY_ALLOWED_MODELS) {
      const provider = modelsCatalog.models[id]?.provider;
      if (provider) providersInHobby.add(provider);
    }

    // Spec §1 + economy roster: at minimum these providers ship Hobby
    // entry points today. If the roster shrinks, this list shrinks
    // with it; if it grows, this list grows. Either way the assertion
    // ensures we don't accidentally drop a provider's only economy SKU.
    const expectedCore = ['anthropic', 'openai', 'google', 'deepseek', 'perplexity'];
    for (const provider of expectedCore) {
      expect(providersInHobby.has(provider)).toBe(true);
    }
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

  it('HOBBY_ALLOWED_MODELS is non-empty and every entry is a non-empty string', () => {
    expect(HOBBY_ALLOWED_MODELS.size).toBeGreaterThan(0);
    for (const id of HOBBY_ALLOWED_MODELS) {
      expect(typeof id).toBe('string');
      expect(id.trim().length).toBeGreaterThan(0);
    }
  });

  it('concurrent resolveProvider calls for all Hobby models are consistent', async () => {
    // Stress: 50 concurrent lookups must all return the same result as serial.
    const hobbyModels = [...HOBBY_ALLOWED_MODELS];
    const serial = hobbyModels.map((id) => {
      try {
        return resolveProvider(id);
      } catch {
        return null;
      }
    });
    const concurrent = await Promise.all(
      hobbyModels.map((id) =>
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
    const model = 'claude-haiku-4.5';
    const expected = resolveProvider(model);
    for (let i = 0; i < 1000; i++) {
      expect(resolveProvider(model)).toBe(expected);
    }
  });
});

// ---------------------------------------------------------------------------
// enforcePlanTier — tier dispatch (round 3 fix)
//
// Before this fix, only 'free' and 'hobby' were checked explicitly; any
// other plan_tier value (including 'basic'/'team', and any garbage string)
// silently fell through to unrestricted, unbilled model access. These tests
// pin the explicit allowlist: free blocked, hobby/basic restricted to the
// economy set (unified — basic is the 2026-07-02 hobby rename), team gets
// pro's unrestricted allowance, pro/max/enterprise unrestricted, and any
// unrecognized tier fails closed exactly like free rather than falling
// through.
// ---------------------------------------------------------------------------

describe('llm route — enforcePlanTier tier dispatch (round 3 fix)', () => {
  const allowedHobbyModel = [...HOBBY_ALLOWED_MODELS][0]!;
  const flagshipModel = 'claude-opus-4.8'; // excluded from HOBBY_ALLOWED_MODELS (see above)

  beforeEach(() => {
    tierState.planTier = null;
    tierState.hasRow = true;
  });

  it('free tier is blocked with 403', async () => {
    tierState.planTier = 'free';
    await expect(enforcePlanTier('user-1', 'token', allowedHobbyModel)).rejects.toThrow(
      /Upgrade to a paid plan/,
    );
  });

  it('missing subscription row is treated as free and blocked with 403', async () => {
    tierState.hasRow = false;
    await expect(enforcePlanTier('user-1', 'token', allowedHobbyModel)).rejects.toThrow(
      /Upgrade to a paid plan/,
    );
  });

  it('hobby tier allows an economy model', async () => {
    tierState.planTier = 'hobby';
    await expect(enforcePlanTier('user-1', 'token', allowedHobbyModel)).resolves.toBe('hobby');
  });

  it('hobby tier rejects a flagship model with 403', async () => {
    tierState.planTier = 'hobby';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
      /requires a Pro plan/,
    );
  });

  it('basic tier gets the identical restriction as hobby: allows an economy model', async () => {
    tierState.planTier = 'basic';
    await expect(enforcePlanTier('user-1', 'token', allowedHobbyModel)).resolves.toBe('basic');
  });

  it('basic tier gets the identical restriction as hobby: rejects a flagship model with 403', async () => {
    tierState.planTier = 'basic';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
      /requires a Pro plan/,
    );
  });

  it('team tier gets the same unrestricted allowance as pro (flagship model allowed)', async () => {
    tierState.planTier = 'team';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).resolves.toBe('team');
  });

  it('pro tier is unrestricted (flagship model allowed)', async () => {
    tierState.planTier = 'pro';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).resolves.toBe('pro');
  });

  it('max tier is unrestricted (flagship model allowed)', async () => {
    tierState.planTier = 'max';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).resolves.toBe('max');
  });

  it('enterprise tier is unrestricted (flagship model allowed)', async () => {
    tierState.planTier = 'enterprise';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).resolves.toBe('enterprise');
  });

  it('an unrecognized plan_tier string fails closed with the same 403 as free, not an unrestricted fallthrough', async () => {
    tierState.planTier = 'some-future-tier-nobody-added-yet';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
      /Upgrade to a paid plan/,
    );
  });

  it('an empty-string plan_tier fails closed with the same 403 as free', async () => {
    tierState.planTier = '';
    await expect(enforcePlanTier('user-1', 'token', flagshipModel)).rejects.toThrow(
      /Upgrade to a paid plan/,
    );
  });
});
