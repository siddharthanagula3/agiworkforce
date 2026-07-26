import { describe, expect, it } from 'vitest';
import { getModelsForTierAndSurface } from '@agiworkforce/types';

import {
  canUseDesktopCloudAgiWork,
  canUseDesktopCloudCodeExecution,
  canUseDesktopCloudImageGeneration,
  resolveDesktopCloudPickerModels,
} from '../desktopCloudEntitlements';

const MODEL_TYPES: Array<'chat' | 'code' | 'reasoning' | 'multimodal' | 'search'> = [
  'chat',
  'code',
  'reasoning',
  'multimodal',
  'search',
];

const modelOptions = () => ({ modelTypes: [...MODEL_TYPES] });

function discoveredMaxCatalog() {
  return [
    ...getModelsForTierAndSurface('max', 'desktop/cloud-chat', modelOptions()).map((model) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
    })),
    {
      id: 'image-only-row-that-does-not-belong-in-chat',
      name: 'Image only',
      provider: 'example',
    },
  ];
}

describe('Desktop Cloud entitlement projection', () => {
  it('fails closed until the account plan has hydrated', () => {
    expect(resolveDesktopCloudPickerModels(discoveredMaxCatalog(), null)).toEqual([]);
    expect(canUseDesktopCloudAgiWork(null)).toBe(false);
    expect(canUseDesktopCloudImageGeneration(null)).toBe(false);
    expect(canUseDesktopCloudCodeExecution(null, true)).toBe(false);
  });

  it('prepends canonical Auto and intersects discovery with the hydrated tier and Desktop runtime', () => {
    const discovered = discoveredMaxCatalog();
    const basic = resolveDesktopCloudPickerModels(discovered, 'basic');
    const max = resolveDesktopCloudPickerModels(discovered, 'max');
    const allowedBasicIds = new Set(
      getModelsForTierAndSurface('basic', 'desktop/cloud-chat', modelOptions()).map(
        (model) => model.id,
      ),
    );

    expect(basic[0]?.id).toBe('auto');
    expect(basic.slice(1).every((model) => allowedBasicIds.has(model.id))).toBe(true);
    expect(basic.map((model) => model.id)).not.toContain(
      'image-only-row-that-does-not-belong-in-chat',
    );
    expect(new Set(basic.map((model) => model.id)).size).toBe(basic.length);
    expect(max.length).toBeGreaterThan(basic.length);
  });

  it('matches the server billing gates for AGI Work, images, and managed sandboxes', () => {
    expect(canUseDesktopCloudAgiWork('basic')).toBe(false);
    expect(canUseDesktopCloudAgiWork('pro')).toBe(true);
    expect(canUseDesktopCloudImageGeneration('basic')).toBe(false);
    expect(canUseDesktopCloudImageGeneration('pro')).toBe(true);

    expect(canUseDesktopCloudCodeExecution('free', true)).toBe(false);
    expect(canUseDesktopCloudCodeExecution('basic', true)).toBe(true);
    expect(canUseDesktopCloudCodeExecution('pro', false)).toBe(false);
  });
});
