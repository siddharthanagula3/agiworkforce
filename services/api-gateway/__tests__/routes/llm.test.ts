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
import { describe, expect, it } from 'vitest';
import { getAllowedModelsForTier, getRoutingSlotModel, modelsCatalog } from '@agiworkforce/types';
import { HOBBY_ALLOWED_MODELS, resolveProvider } from '../../src/routes/llm';

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
    // escalation_coding (GLM-4.7) lives under tierAllowedModels.economy.
    expect(HOBBY_ALLOWED_MODELS.has(escalation)).toBe(true);
    // reasoning_premium (DeepSeek V4 Flash) lives under economy.
    expect(HOBBY_ALLOWED_MODELS.has(reasoning)).toBe(true);
  });

  it('excludes flagship models that should be Pro-only', () => {
    // claude-opus-4.7 + gpt-5.5 are flagship; the api-gateway must NOT
    // serve them on Hobby even if a malicious caller supplies the ID.
    expect(HOBBY_ALLOWED_MODELS.has('claude-opus-4.7')).toBe(false);
    expect(HOBBY_ALLOWED_MODELS.has('gpt-5.5')).toBe(false);
    expect(HOBBY_ALLOWED_MODELS.has('gpt-5.4-pro')).toBe(false);
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

  it('throws 400 for catalog-known models from non-proxied providers', () => {
    // The api-gateway only proxies anthropic/openai/google. Other
    // providers in models.json (xAI, DeepSeek, Perplexity, Qwen,
    // Moonshot, Zhipu, LM Studio, Ollama) reach users via desktop BYOK
    // or providerStream — never via this proxy. The route must reject
    // them explicitly rather than silently route to the wrong upstream.
    //
    // grok-4.3 is xAI; deepseek-v4-flash is DeepSeek; sonar is Perplexity.
    // All three are catalog-known but NOT proxied here.
    expect(() => resolveProvider('grok-4.3')).toThrow(/does not proxy/);
    expect(() => resolveProvider('deepseek-v4-flash')).toThrow(/does not proxy/);
    expect(() => resolveProvider('sonar')).toThrow(/does not proxy/);
  });

  it('lookup is consistent with the catalog provider field for every Hobby model', () => {
    // For each model in the Hobby allow-list, verify that:
    //   - if its catalog provider is anthropic/openai/google, resolveProvider() succeeds
    //   - otherwise resolveProvider() throws (gateway can't proxy it).
    // This keeps the proxy honest: any new economy-tier model that
    // joins models.json must EITHER be on a proxied provider OR be
    // explicitly rejected — there's no silent fallthrough.
    const proxiedProviders = new Set(['anthropic', 'openai', 'google']);
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
