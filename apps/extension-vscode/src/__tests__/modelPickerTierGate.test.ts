import { describe, it, expect } from 'vitest';
import { canAccessModelForSubscriptionTier, getCoreManualModelOptions } from '@agiworkforce/types';
import {
  buildGroupedQuickPickItems,
  getModelPickerOptionsForTier,
  isModelReachableForTier,
  modelLockForRoute,
  modelLockHeading,
  modelLockReason,
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

function headingAbove(
  items: ReturnType<typeof buildGroupedQuickPickItems>,
  index: number,
): string | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor--) {
    const item = items[cursor];
    if (item?.kind !== undefined) return item.label;
  }
  return undefined;
}

describe('buildGroupedQuickPickItems, tier gating', () => {
  it('never returns an empty roster on the lowest tier', () => {
    const items = buildGroupedQuickPickItems('local').filter((i) => i.modelId !== undefined);
    expect(items.length).toBeGreaterThan(0);
  });

  it('files an unreachable model under what would unlock it, not among the usable ones', () => {
    const items = buildGroupedQuickPickItems('local');
    const index = items.findIndex((i) => i.modelId === CLOUD_MODEL);
    const cloudRow = items[index];

    expect(cloudRow).toBeDefined();
    expect(cloudRow?.disabled).toBe(true);
    expect(cloudRow?.lock).toEqual({ kind: 'sign-in' });
    expect(headingAbove(items, index)).toBe('Sign in to AGI Cloud');
  });

  it('does not lock reachable models on max', () => {
    const items = buildGroupedQuickPickItems('max');
    const cloudRow = items.find((i) => i.modelId === CLOUD_MODEL);

    expect(cloudRow).toBeDefined();
    expect(cloudRow?.lock).toBeUndefined();
    expect(cloudRow?.disabled).toBeUndefined();
  });

  it('gates the shared self-routing Auto option too', () => {
    const items = buildGroupedQuickPickItems('local');
    const index = items.findIndex((i) => i.modelId === 'auto');

    expect(items[index]).toBeDefined();
    expect(items[index]?.disabled).toBe(true);
    expect(headingAbove(items, index)).toBe('Sign in to AGI Cloud');
  });

  it('leaves every row unlocked when no tier is supplied', () => {
    const items = buildGroupedQuickPickItems();

    expect(items.filter((i) => i.lock !== undefined)).toHaveLength(0);
  });

  it('names an upgrade rather than a sign-in when the plan is the thing missing', () => {
    const items = buildGroupedQuickPickItems('basic');
    const index = items.findIndex((i) => i.modelId === BASIC_MODEL);

    expect(items[index]?.lock).toEqual({ kind: 'upgrade' });
    expect(headingAbove(items, index)).toBe('Upgrade your AGI plan');
  });
});

describe('buildGroupedQuickPickItems, route grouping', () => {
  const DEEPSEEK_MODEL = catalogModels.find((model) => String(model.provider) === 'deepseek')?.id;
  const OTHER_MODEL = catalogModels.find((model) => String(model.provider) === 'openai')?.id;

  it('keeps what this route can run above what it cannot', () => {
    expect(DEEPSEEK_MODEL).toBeDefined();
    expect(OTHER_MODEL).toBeDefined();

    const items = buildGroupedQuickPickItems('byok', {
      trustMode: 'byok',
      provider: 'deepseek',
    });
    const usableIndex = items.findIndex((i) => i.modelId === DEEPSEEK_MODEL);
    const lockedIndex = items.findIndex((i) => i.modelId === OTHER_MODEL);

    expect(items[usableIndex]?.lock).toBeUndefined();
    expect(items[lockedIndex]?.lock).toEqual({
      kind: 'provider-key',
      providerLabel: 'OpenAI',
      routeLabel: 'DeepSeek',
    });
    expect(usableIndex).toBeLessThan(lockedIndex);
    expect(headingAbove(items, lockedIndex)).toBe('Add your OpenAI key');
  });

  it('leaves the catalog alone when no session has told it the route yet', () => {
    const items = buildGroupedQuickPickItems('byok');

    expect(items.filter((i) => i.lock !== undefined)).toHaveLength(0);
  });

  it('does not lock another provider on a managed-cloud route', () => {
    expect(
      modelLockForRoute(CLOUD_MODEL, 'openai', 'max', {
        trustMode: 'managed_cloud',
        provider: 'anthropic',
      }),
    ).toBeUndefined();
  });

  it('never prints a raw provider id for one the catalog cannot name', () => {
    const lock = modelLockForRoute('or-anything', 'open_router', 'byok', {
      trustMode: 'byok',
      provider: 'deepseek',
    });

    expect(lock).toEqual({ kind: 'provider-key', routeLabel: 'DeepSeek' });
    expect(lock === undefined ? '' : modelLockHeading(lock)).toBe('Add another provider key');
    expect(lock === undefined ? '' : modelLockReason('Amazon: Nova 2 Lite', lock)).toBe(
      "Amazon: Nova 2 Lite cannot run on this session's route, which uses DeepSeek. Add another provider key to use it.",
    );
  });

  it('says which provider the model runs on and which one the session is using', () => {
    const lock = modelLockForRoute(CLOUD_MODEL, 'openai', 'byok', {
      trustMode: 'byok',
      provider: 'deepseek',
    });

    expect(lock).toBeDefined();
    expect(modelLockReason('GPT-6 Astra', lock!)).toBe(
      "GPT-6 Astra cannot run on this session's route, which uses DeepSeek. Add your OpenAI key to use it.",
    );
    expect(modelLockReason('GPT-6 Astra', { kind: 'sign-in' })).toBe(
      'GPT-6 Astra is not available on this session. Sign in to AGI Cloud to use it.',
    );
  });
});

describe('getModelPickerOptionsForTier, webview <select>', () => {
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
