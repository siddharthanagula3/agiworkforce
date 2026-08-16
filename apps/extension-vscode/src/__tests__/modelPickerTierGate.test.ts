
import { describe, it, expect } from 'vitest';
import { canAccessModelForSubscriptionTier, getCoreManualModelOptions } from '@agiworkforce/types';
import {
  MODEL_LOCKED_HINT,
  buildGroupedQuickPickItems,
  getModelPickerOptionsForTier,
  isModelReachableForTier,
} from '../features/model-picker/modelConstants';

const catalogModels = getCoreManualModelOptions();
const CLOUD_MODEL =
  catalogModels.find(
    (model) =>
      canAccessModelForSubscriptionTier(model.id, 'max') &&
      !canAccessModelForSubscriptionTier(model.id, 'pro'),
  )?.id ?? '';
const BASIC_MODEL =
  catalogModels.find((model) => canAccessModelForSubscriptionTier(model.id, 'basic'))?.id ?? '';

describe('isModelReachableForTier', () => {
  it('treats an unresolved tier as reachable (pre-gate behaviour preserved)', () => {
    expect(isModelReachableForTier(CLOUD_MODEL, undefined)).toBe(true);
  });

  it('denies managed-cloud models on the local tier', () => {
    expect(isModelReachableForTier(CLOUD_MODEL, 'local')).toBe(false);
  });

  it('allows catalog models in BYOK mode for app-server provider admission', () => {
    expect(isModelReachableForTier(CLOUD_MODEL, 'byok')).toBe(true);
  });

  it('denies managed-cloud models when signed out entirely', () => {
    expect(isModelReachableForTier(CLOUD_MODEL, 'free')).toBe(false);
  });

  it('denies managed developer models on Basic', () => {
    expect(BASIC_MODEL).not.toBe('');
    expect(isModelReachableForTier(BASIC_MODEL, 'basic')).toBe(false);
  });

  it('allows a flagship model on max', () => {
    expect(isModelReachableForTier(CLOUD_MODEL, 'max')).toBe(true);
  });
});

describe('buildGroupedQuickPickItems — tier gating', () => {
  it('never returns an empty roster on the lowest tier', () => {
    const items = buildGroupedQuickPickItems('local').filter((i) => i.modelId !== undefined);
    expect(items.length).toBeGreaterThan(0);
  });

  it('marks unreachable models with the locked hint on the local tier', () => {
    const items = buildGroupedQuickPickItems('local');
    const cloudRow = items.find((i) => i.modelId === CLOUD_MODEL);

    expect(cloudRow).toBeDefined();
    expect(cloudRow?.description).toContain(MODEL_LOCKED_HINT);
    expect(cloudRow?.disabled).toBe(true);
  });

  it('does not mark reachable models on max', () => {
    const items = buildGroupedQuickPickItems('max');
    const cloudRow = items.find((i) => i.modelId === CLOUD_MODEL);

    expect(cloudRow).toBeDefined();
    expect(cloudRow?.description).not.toContain(MODEL_LOCKED_HINT);
    expect(cloudRow?.disabled).toBe(false);
  });

  it('gates the shared self-routing Auto option too', () => {
    const items = buildGroupedQuickPickItems('local');
    const auto = items.find((i) => i.modelId === 'auto');

    expect(auto).toBeDefined();
    expect(auto?.description).toContain(MODEL_LOCKED_HINT);
    expect(auto?.disabled).toBe(true);
  });

  it('leaves every row unmarked when no tier is supplied', () => {
    const items = buildGroupedQuickPickItems();
    const marked = items.filter((i) => i.description?.includes(MODEL_LOCKED_HINT));

    expect(marked).toHaveLength(0);
  });
});

describe('getModelPickerOptionsForTier — webview <select>', () => {
  it('flags managed-cloud models unreachable on the local tier', () => {
    const options = getModelPickerOptionsForTier('local');
    const cloudOption = options.find((o) => o.id === CLOUD_MODEL);

    expect(cloudOption).toBeDefined();
    expect(cloudOption?.reachable).toBe(false);
  });

  it('flags managed-cloud models reachable on max', () => {
    const options = getModelPickerOptionsForTier('max');
    const cloudOption = options.find((o) => o.id === CLOUD_MODEL);

    expect(cloudOption?.reachable).toBe(true);
  });

  it('returns the full option list regardless of tier (marked, not removed)', () => {
    expect(getModelPickerOptionsForTier('local')).toHaveLength(
      getModelPickerOptionsForTier('max').length,
    );
  });

  it('treats every option as reachable when no tier is supplied', () => {
    expect(getModelPickerOptionsForTier().every((o) => o.reachable)).toBe(true);
  });
});
