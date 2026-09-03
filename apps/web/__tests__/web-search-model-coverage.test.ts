import { describe, expect, it } from 'vitest';
import { getModelMetadataById, getModelsForTierAndSurface } from '@agiworkforce/types';
import { isWebSearchAvailable } from '@agiworkforce/search';

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

describe.each(CLOUD_CHAT_PROFILES)('Cloud chat web-search coverage, %s', (profile) => {
  it('enumerates a non-empty selectable model roster', () => {
    const ids = selectableCloudChatModelIds(profile);
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
      `selectable ${profile} models with NO web-search path (native or generic): ${incapable.join(', ') || 'none'}, either add a search/tools capability or remove them from the roster`,
    ).toEqual([]);
  });
});
