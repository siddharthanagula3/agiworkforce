import { describe, expect, it } from 'vitest';
import {
  getAutoRoutingProfiles,
  getModelMetadataById,
  resolveAutoModeModel,
} from '@agiworkforce/types';
import { CLOUD_FALLBACK_MODELS } from '../modelStore';

const PROFILE_TIER = {
  economy: 'free',
  balanced: 'pro',
  premium: 'max',
} as const;

describe('unified-chat fallback model registry', () => {
  it('admits only chat fallbacks with provider-published token windows', () => {
    expect(CLOUD_FALLBACK_MODELS.length).toBeGreaterThan(0);
    expect(
      CLOUD_FALLBACK_MODELS.every(
        (model) => Number.isFinite(model.contextWindow) && model.contextWindow > 0,
      ),
    ).toBe(true);
  });

  it('derives every Auto row and representative capability from the canonical registry', () => {
    const profiles = getAutoRoutingProfiles();
    const rows = CLOUD_FALLBACK_MODELS.filter((model) => model.id.startsWith('auto'));

    expect(rows.map(({ id, name }) => ({ id, name }))).toEqual(
      profiles.map(({ id, label }) => ({ id, name: label })),
    );

    for (const profile of profiles) {
      const row = rows.find((candidate) => candidate.id === profile.id);
      const representativeId = resolveAutoModeModel(
        profile.id,
        PROFILE_TIER[profile.profile],
        'general',
      );
      const representative = getModelMetadataById(representativeId);
      expect(row?.contextWindow).toBe(representative?.contextWindow);
      expect(row?.supportsVision).toBe(representative?.capabilities.vision);
      expect(row?.supportsTools).toBe(representative?.capabilities.tools);
    }
  });
});
