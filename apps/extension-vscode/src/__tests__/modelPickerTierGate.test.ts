/**
 * VSCODE-PICKER-TIER-01 — model-picker tier gating.
 *
 * The picker used to render the entire managed-cloud catalog unconditionally,
 * so a signed-out user (or one in Local mode) saw every cloud model as if it
 * were selectable. These tests lock the fix on all three render paths:
 *
 *   1. buildGroupedQuickPickItems()  — `agi-workforce.selectModel` QuickPick
 *   2. buildGroupedQuickPickItems()  — ChatStateManager inline popover
 *   3. getModelPickerOptionsForTier() — sidebar/editor webview <select>
 *
 * The invariant is "marked, not removed": unreachable rows stay in the list and
 * carry MODEL_LOCKED_HINT. Removing them would empty the picker, because
 * models.json contains zero ollama/lmstudio rows — local models reach the
 * extension only through runtime discovery from the app-server.
 */

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
    // The regression this guards: filtering unreachable rows OUT would leave a
    // signed-out user with nothing to pick when no local runtime is running.
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
