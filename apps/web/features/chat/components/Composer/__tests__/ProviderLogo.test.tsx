import { PROVIDER_DISPLAY, getProviderOfferings } from '@agiworkforce/types';
import { AVAILABLE_MODELS, findSelectableModel } from '@shared/stores/model-store';
import { describe, expect, it } from 'vitest';
import { providerBrandColor, toProviderId } from '../ProviderLogo';

const OFFERING_PROVIDERS_WITHOUT_DISPLAY_IDENTITY: Readonly<Record<string, string>> = {
  experientiallabs: 'experiential free offerings carry no licensed mark or brand colour yet',
};

describe('toProviderId', () => {
  it('resolves every registry spelling of OpenRouter to the display identity', () => {
    expect(toProviderId('open_router')).toBe('openrouter');
    expect(toProviderId('open-router')).toBe('openrouter');
    expect(toProviderId('openrouter')).toBe('openrouter');
  });

  it('maps managed cloud to the AGI identity and rejects unknown keys', () => {
    expect(toProviderId('managed_cloud')).toBe('agi-cloud');
    expect(toProviderId('not-a-provider')).toBeNull();
  });

  it('paints OpenRouter with its brand colour, not the muted fallback', () => {
    const color = providerBrandColor('open_router');
    expect(color).toBe(PROVIDER_DISPLAY.openrouter.brandColor);
    expect(color).not.toBe('var(--chat-text-muted)');
  });
});

describe('every selectable model resolves a display identity', () => {
  it.each(AVAILABLE_MODELS.map((model) => [model.id, model.providerKey] as const))(
    '%s (%s)',
    (modelId, providerKey) => {
      expect(toProviderId(providerKey), `model ${modelId} has no display identity`).not.toBeNull();
    },
  );

  it('resolves every free-quota offering the store accepts, except the named exceptions', () => {
    for (const offeringKey of Object.keys(getProviderOfferings())) {
      const selection = findSelectableModel(offeringKey);
      if (!selection) continue;
      if (selection.providerKey in OFFERING_PROVIDERS_WITHOUT_DISPLAY_IDENTITY) {
        expect(toProviderId(selection.providerKey)).toBeNull();
        continue;
      }
      expect(
        toProviderId(selection.providerKey),
        `offering ${offeringKey} has no display identity`,
      ).not.toBeNull();
    }
  });
});
