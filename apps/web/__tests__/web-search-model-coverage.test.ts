import { describe, expect, it } from 'vitest';
import { getModelMetadataById, getModelsForTierAndSurface } from '@agiworkforce/types';
import { isWebSearchAvailable } from '@agiworkforce/search';

/**
 * Invariant: every model that is SELECTABLE in Web Cloud chat must be able to
 * perform web search — either provider-native search or the generic
 * Perplexity-backed fallback tool. This is the enforceable form of the product
 * rule "web search with all the models present; remove models if they can't use
 * the internet": if a newly added roster model has no web-search path, this test
 * fails, forcing either a capability fix or its removal from the selectable set.
 *
 * `genericBackendConfigured: true` models the intended production deployment
 * (PERPLEXITY_API_KEY set), under which the tools-capable fallback models
 * (deepseek/qwen/xai/zhipu) search through the generic tool. Native-search
 * providers (anthropic/google/openai/perplexity) do not depend on that flag.
 */
const CLOUD_CHAT_PROFILES = ['web/cloud-chat', 'mobile/cloud-chat', 'desktop/cloud-chat'];
const TIERS = ['free', 'basic', 'pro', 'max', 'enterprise', 'team'];

function selectableCloudChatModelIds(profile: string): string[] {
  const ids = new Set<string>();
  for (const tier of TIERS) {
    for (const model of getModelsForTierAndSurface(tier, profile)) {
      ids.add(model.id);
    }
  }
  return [...ids];
}

describe.each(CLOUD_CHAT_PROFILES)('Cloud chat web-search coverage — %s', (profile) => {
  it('enumerates a non-empty selectable model roster', () => {
    const ids = selectableCloudChatModelIds(profile);
    if (profile === 'desktop/cloud-chat') {
      // desktop/cloud-chat is registry status "unwired" (12 harnesses declared
      // but the desktop managed-cloud chat harness is not wired yet — tracked
      // as DESKTOP-LOCAL-CHAT-EMPTY-HARNESS). It is legitimately empty until
      // desktop wires it; asserting that here is the forcing function (this
      // flips and fails the moment the roster becomes non-empty, prompting an
      // update). Do NOT flip the registry status to "implemented" to make this
      // pass — that would fake wiring.
      expect(ids.length).toBe(0);
      return;
    }
    expect(ids.length).toBeGreaterThan(0);
  });

  it('gives every selectable model a web-search path when the backend is configured', () => {
    const incapable: string[] = [];
    for (const id of selectableCloudChatModelIds(profile)) {
      const meta = getModelMetadataById(id);
      const available = isWebSearchAvailable({
        provider: meta?.provider,
        modelSupportsNativeSearch: meta?.capabilities?.search,
        modelSupportsTools: meta?.capabilities?.tools,
        genericBackendConfigured: true,
      });
      if (!available) incapable.push(id);
    }
    expect(
      incapable,
      `selectable ${profile} models with NO web-search path (native or generic): ${incapable.join(', ') || 'none'} — either add a search/tools capability or remove them from the roster`,
    ).toEqual([]);
  });
});
