import { PROVIDER_DISPLAY, getProviderOfferings } from '@agiworkforce/types';
import { AVAILABLE_MODELS, findSelectableModel } from '@shared/stores/model-store';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderLogo, providerBrandColor, toProviderId } from '../ProviderLogo';

const OFFERING_PROVIDERS_WITHOUT_DISPLAY_IDENTITY: Readonly<Record<string, string>> = {
  experientiallabs: 'experiential free offerings carry no licensed mark or brand colour yet',
};
const PROVIDER_ASSET_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../public/providers',
);

describe('toProviderId', () => {
  it.each(['zhipu', 'lmstudio'])(
    'uses the official inline mark for %s instead of its image fallback',
    (providerKey) => {
      const asset = readFileSync(join(PROVIDER_ASSET_DIR, `${providerKey}.svg`), 'utf8');
      const path = /<path d="([^"]+)"/u.exec(asset)?.[1];
      expect(path).toBeTruthy();
      const markup = renderToStaticMarkup(<ProviderLogo providerKey={providerKey} />);
      expect(markup).toContain(`d="${path}"`);
      expect(markup).toContain('fill="currentColor"');
      expect(markup).not.toContain('<img');
      expect(markup).not.toContain('<text');
    },
  );

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
