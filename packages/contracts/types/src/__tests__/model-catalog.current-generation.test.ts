import { describe, expect, it } from 'vitest';
import { modelRegistry } from '@agiworkforce/model-registry';

import {
  CHAT_MODEL_TYPES,
  getModelRegistryFacts,
  getModelsForTierAndSurface,
  MODEL_FAMILY_REGISTRY,
} from '../model-catalog';

const PLAN_TIERS = ['free', 'basic', 'pro', 'max', 'enterprise'] as const;
const RUNTIME_PROFILE_IDS = Object.keys(modelRegistry.runtimeProfiles);
const CHAT_TYPE_OPTIONS = { modelTypes: [...CHAT_MODEL_TYPES] };

// The QwenCloud free quota serves whatever that account is granted, so its
// rows keep the generation the quota names rather than the family's newest.
const QUOTA_PINNED_PROVIDER = 'qwen';

const ACTIVE_MODEL_BY_FAMILY = new Map(
  Object.values(MODEL_FAMILY_REGISTRY).map((family) => [
    `${family.provider}/${family.canonicalFamily}`,
    family.activeModelId,
  ]),
);

describe('the picker offers one generation per model family', () => {
  it('lists no model whose family slot is held by a different model, on any plan or surface', () => {
    const superseded: string[] = [];
    let familyRowsChecked = 0;

    for (const runtimeProfileId of RUNTIME_PROFILE_IDS) {
      for (const tier of PLAN_TIERS) {
        for (const model of getModelsForTierAndSurface(tier, runtimeProfileId, CHAT_TYPE_OPTIONS)) {
          if (model.provider === QUOTA_PINNED_PROVIDER) continue;
          const family = getModelRegistryFacts(model.id)?.family;
          if (!family) continue;
          familyRowsChecked += 1;
          const active = ACTIVE_MODEL_BY_FAMILY.get(`${model.provider}/${family}`);
          if (active !== model.id) {
            superseded.push(`${runtimeProfileId} ${tier}: ${model.id} (slot holds ${active})`);
          }
        }
      }
    }

    expect(familyRowsChecked).toBeGreaterThan(0);
    expect(superseded).toEqual([]);
  });
});
