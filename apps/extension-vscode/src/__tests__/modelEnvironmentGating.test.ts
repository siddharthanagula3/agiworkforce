/**
 * modelEnvironmentGating.test.ts, P3 Phase A: environment-gating in the model picker.
 *
 * Three test suites:
 *   1. Pure unit, evaluateModelEnvironment + environmentAvailability (no mock needed).
 *   2. Real catalog, every model from getCoreManualModelOptions() appears in the
 *      picker output (safety property: current catalog has no flagged models).
 *   3. Synthetic flagged model, a model with requiresEnvironment:'e2b' is filtered
 *      out of buildGroupedQuickPickItems() (gating property).
 *
 * The flagged model lives ONLY in the test mock, models.json is NOT modified.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateModelEnvironment } from '@agiworkforce/types';
import { environmentAvailability } from '../features/model-picker/modelConstants';
import { requireCatalogModel } from './catalogModelFixtures';

const CATALOG_BASE_MODEL_ID = requireCatalogModel().id;

describe('environmentAvailability (Phase A stub)', () => {
  it('returns { configured: false } for e2b', () => {
    expect(environmentAvailability('e2b')).toEqual({ configured: false });
  });

  it('returns { configured: false } for local-runtime', () => {
    expect(environmentAvailability('local-runtime')).toEqual({ configured: false });
  });
});

describe('evaluateModelEnvironment, logic', () => {
  it('model without requiresEnvironment is always selectable', () => {
    // Safety property: undefined env → selectable regardless of availability.
    expect(evaluateModelEnvironment(undefined, { configured: false })).toEqual({
      selectable: true,
    });
    expect(evaluateModelEnvironment(undefined, undefined)).toEqual({ selectable: true });
  });

  it('e2b-gated model is NOT selectable when configured=false', () => {
    const result = evaluateModelEnvironment('e2b', { configured: false });
    expect(result.selectable).toBe(false);
    expect(result.reason).toBe('Requires managed compute (currently in private beta)');
  });

  it('e2b-gated model is selectable when configured=true and available=true', () => {
    const result = evaluateModelEnvironment('e2b', { configured: true, available: true });
    expect(result.selectable).toBe(true);
  });

  it('local-runtime-gated model is NOT selectable when configured=false', () => {
    const result = evaluateModelEnvironment('local-runtime', { configured: false });
    expect(result.selectable).toBe(false);
    expect(result.reason).toBe('Requires a local model runtime to be installed');
  });

  it('fail-closed: e2b model with configured=true but available=false is NOT selectable', () => {
    const result = evaluateModelEnvironment('e2b', { configured: true, available: false });
    expect(result.selectable).toBe(false);
  });
});

// ─── Suite 2: Real catalog, safety property ──────────────────────────────────

describe('buildGroupedQuickPickItems, real catalog, no flagged models', () => {
  it('every LIVE model appears in the picker output; non-live models never do', async () => {
    const { getCoreManualModelOptions, isModelSelectable } = await import('@agiworkforce/types');
    const { buildGroupedQuickPickItems } = await import('../features/model-picker/modelConstants');

    const manualOptions = getCoreManualModelOptions();
    const items = buildGroupedQuickPickItems();
    const pickerIds = new Set(items.map((i) => i.modelId).filter(Boolean));

    for (const opt of manualOptions) {
      expect(pickerIds.has(opt.id), `picker selectability mismatch for ${opt.id}`).toBe(
        isModelSelectable(opt.id),
      );
    }
  });
});

describe('buildGroupedQuickPickItems, e2b-flagged synthetic model is filtered out', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('filters out a model with requiresEnvironment: e2b', async () => {
    const SYNTH_ID = '__test_synth_e2b_model__';

    vi.doMock('@agiworkforce/types', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@agiworkforce/types')>();
      const baseMeta = actual.getModelMetadataById(CATALOG_BASE_MODEL_ID);
      if (!baseMeta) throw new Error('Catalog fixture metadata is required');

      const synthOption = {
        id: SYNTH_ID,
        label: 'Synthetic E2B Model',
        provider: baseMeta.provider,
        providerLabel: String(baseMeta.provider),
        description: 'Synthetic test model requiring E2B',
        detail: '',
      };

      const synthMeta = {
        ...baseMeta,
        id: SYNTH_ID,
        name: 'Synthetic E2B Model',
        requiresEnvironment: 'e2b' as const,
      };

      return {
        ...actual,
        getCoreManualModelOptions: () => [...actual.getCoreManualModelOptions(), synthOption],
        getModelMetadataById: (id: string) =>
          id === SYNTH_ID ? synthMeta : actual.getModelMetadataById(id),
      };
    });

    const { buildGroupedQuickPickItems } = await import('../features/model-picker/modelConstants');

    const items = buildGroupedQuickPickItems();
    const pickerIds = items.map((i) => i.modelId).filter(Boolean);

    expect(pickerIds).not.toContain(SYNTH_ID);
  });

  it('does not filter out a model without requiresEnvironment (safety)', async () => {
    const SYNTH_ID = '__test_synth_no_env_model__';

    vi.doMock('@agiworkforce/types', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@agiworkforce/types')>();
      const baseMeta = actual.getModelMetadataById(CATALOG_BASE_MODEL_ID);
      if (!baseMeta) throw new Error('Catalog fixture metadata is required');

      const synthOption = {
        id: SYNTH_ID,
        label: 'Synthetic Ungated Model',
        provider: baseMeta.provider,
        providerLabel: String(baseMeta.provider),
        description: 'Synthetic test model with no environment requirement',
        detail: '',
      };

      const synthMeta = {
        ...baseMeta,
        id: SYNTH_ID,
        name: 'Synthetic Ungated Model',
        // requiresEnvironment is intentionally absent
      };

      return {
        ...actual,
        getCoreManualModelOptions: () => [...actual.getCoreManualModelOptions(), synthOption],
        getModelMetadataById: (id: string) =>
          id === SYNTH_ID ? synthMeta : actual.getModelMetadataById(id),
      };
    });

    const { buildGroupedQuickPickItems } = await import('../features/model-picker/modelConstants');

    const items = buildGroupedQuickPickItems();
    const pickerIds = items.map((i) => i.modelId).filter(Boolean);

    expect(pickerIds).toContain(SYNTH_ID);
  });
});
