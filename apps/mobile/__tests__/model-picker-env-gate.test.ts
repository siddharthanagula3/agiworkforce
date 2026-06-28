/**
 * P3 Phase A: Environment-gating tests for the mobile model picker service.
 *
 * Verifies:
 *  (a) A model WITHOUT requiresEnvironment is unchanged.
 *  (b) A model WITH requiresEnvironment: 'e2b' becomes availability:'locked'
 *      with the correct reason from evaluateModelEnvironment.
 *  (c) The wiring test: a cloud model whose catalog entry declares
 *      requiresEnvironment:'e2b' appears as locked (with env reason) in
 *      getModelListForCloudAccess — even when cloudUnlocked:true.
 *  (d) CRITICAL SAFETY: no current catalog model has its availability changed.
 */

// ---------------------------------------------------------------------------
// Mocks — same pattern as model-picker-cloud-labels.test.ts
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    getNumber: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
  },
}));

// Partial mock of @agiworkforce/types: spread actual so SLOT_REGISTRY and all
// other exports are preserved, but wrap getModelMetadataById so individual
// tests can inject requiresEnvironment onto a specific model ID.
jest.mock('@agiworkforce/types', () => {
  const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  return {
    ...actual,
    getModelMetadataById: jest.fn((id: string) => actual.getModelMetadataById(id)),
  };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  applyEnvironmentGate,
  environmentAvailability,
  getModelListForCloudAccess,
  type ModelDef,
} from '../src/features/model-picker/service';
import { evaluateModelEnvironment, getModelMetadataById } from '@agiworkforce/types';

// Typed reference to the mocked function for per-test overrides.
const mockGetModelMetadataById = getModelMetadataById as jest.MockedFunction<
  typeof getModelMetadataById
>;

// ---------------------------------------------------------------------------
// Tests for the helper functions
// ---------------------------------------------------------------------------

describe('environmentAvailability (Phase A stub)', () => {
  it('always returns { configured: false } for e2b', () => {
    expect(environmentAvailability('e2b')).toEqual({ configured: false });
  });

  it('always returns { configured: false } for local-runtime', () => {
    expect(environmentAvailability('local-runtime')).toEqual({ configured: false });
  });
});

describe('applyEnvironmentGate', () => {
  const baseModel: ModelDef = {
    id: 'test-model',
    name: 'Test Model',
    provider: 'openai',
    providerLabel: 'OpenAI',
    contextWindow: 128_000,
    maxOutput: 4096,
    supportsVision: false,
    supportsThinking: false,
    tier: 'balanced',
    surface: 'cloud_managed',
    availability: 'ready',
    runtimeLabel: 'AGI Cloud',
    detailLabel: 'OpenAI provider',
    description: 'Test model in AGI Cloud',
  };

  // (a) Model WITHOUT requiresEnvironment is unchanged
  it('(a) returns the model unchanged when requiresEnvironment is undefined', () => {
    const result = applyEnvironmentGate(baseModel, undefined);
    expect(result).toBe(baseModel); // same reference — no copy made
    expect(result.availability).toBe('ready');
    expect(result.lockReason).toBeUndefined();
  });

  it('(a) returns the model unchanged when called with explicit undefined (no-op for all current models)', () => {
    const lockedBase = {
      ...baseModel,
      availability: 'locked' as const,
      lockReason: 'Sign in to use AGI Cloud chat.',
    };
    const result = applyEnvironmentGate(lockedBase, undefined);
    expect(result).toBe(lockedBase);
  });

  // (b) Model WITH requiresEnvironment: 'e2b' becomes locked with env reason
  it("(b) locks a model with requiresEnvironment:'e2b' and sets the correct reason", () => {
    const result = applyEnvironmentGate(baseModel, 'e2b');

    expect(result).not.toBe(baseModel); // new object
    expect(result.availability).toBe('locked');

    // Verify reason matches evaluateModelEnvironment output exactly
    const verdict = evaluateModelEnvironment('e2b', { configured: false });
    expect(verdict.selectable).toBe(false);
    expect(result.lockReason).toBe(verdict.reason);
    // Exact string check (note the em-dash — not a hyphen):
    expect(result.lockReason).toMatch(/managed compute/i);
  });

  it("(b) locks a model with requiresEnvironment:'local-runtime' and sets the correct reason", () => {
    const result = applyEnvironmentGate(baseModel, 'local-runtime');

    expect(result.availability).toBe('locked');
    const verdict = evaluateModelEnvironment('local-runtime', { configured: false });
    expect(result.lockReason).toBe(verdict.reason);
    expect(result.lockReason).toBe('Requires a local model runtime to be installed');
  });

  it("(b) env gate overrides 'ready' availability even if cloud is unlocked (runs last / fail-closed)", () => {
    // Simulate a cloud-unlocked model that also requires e2b
    const unlockedModel = { ...baseModel, availability: 'ready' as const, lockReason: undefined };
    const result = applyEnvironmentGate(unlockedModel, 'e2b');

    expect(result.availability).toBe('locked');
    expect(result.lockReason).toMatch(/managed compute/i);
  });
});

// ---------------------------------------------------------------------------
// Wiring test (c): env gate is actually called from toCloudModelDef, not just
// defined as a helper. We inject requiresEnvironment:'e2b' onto a known cloud
// model via the getModelMetadataById mock, then assert that
// getModelListForCloudAccess(true) — which calls toCloudModelDef at call time
// — marks it locked with the env reason, even when cloudUnlocked:true.
//
// This test fails if applyEnvironmentGate is removed from toCloudModelDef
// (model would be 'ready'). It also fails if the gate runs before the
// cloudUnlocked availability assignment (the 'ready' would overwrite the lock).
// ---------------------------------------------------------------------------

describe('getModelListForCloudAccess — environment gating wiring (c)', () => {
  // gpt-5.4-mini is DEFAULT_CLOUD_MODEL_ID and always present in the unlocked list.
  const TARGET_ID = 'gpt-5.4-mini';

  beforeEach(() => {
    // Restore default passthrough behaviour before each test.
    mockGetModelMetadataById.mockImplementation((id) =>
      jest
        .requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types')
        .getModelMetadataById(id),
    );
  });

  afterEach(() => {
    mockGetModelMetadataById.mockReset();
  });

  it('(c) a cloud model with requiresEnvironment:e2b is locked in getModelListForCloudAccess(true) even when cloudUnlocked', () => {
    // Inject requiresEnvironment:'e2b' onto the target model ID.
    const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
    mockGetModelMetadataById.mockImplementation((id) => {
      const base = actual.getModelMetadataById(id);
      if (id === TARGET_ID && base) {
        return { ...base, requiresEnvironment: 'e2b' as const };
      }
      return base;
    });

    // cloudUnlocked:true rebuilds models via toCloudModelDef at call time —
    // the mock is in effect when that call hits getModelMetadataById.
    const models = getModelListForCloudAccess(true);
    const target = models.find((m) => m.id === TARGET_ID);

    expect(target).toBeDefined();
    expect(target!.availability).toBe('locked');
    expect(target!.lockReason).toMatch(/managed compute/i);
  });

  it('(c) non-targeted cloud models are unaffected by the injected requiresEnvironment', () => {
    const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
    mockGetModelMetadataById.mockImplementation((id) => {
      const base = actual.getModelMetadataById(id);
      if (id === TARGET_ID && base) {
        return { ...base, requiresEnvironment: 'e2b' as const };
      }
      return base;
    });

    const models = getModelListForCloudAccess(true);
    const otherCloudModels = models.filter(
      (m) => m.surface === 'cloud_managed' && m.id !== TARGET_ID,
    );

    // All other cloud models should be 'ready' when cloudUnlocked:true.
    for (const m of otherCloudModels) {
      expect(m.availability).toBe('ready');
    }
  });
});

// ---------------------------------------------------------------------------
// (d) CRITICAL SAFETY: no current model has its availability changed
// ---------------------------------------------------------------------------

describe('CRITICAL SAFETY: no current model availability is altered by Phase A env gate (d)', () => {
  it('all models from getModelListForCloudAccess(false) have their expected (non-env-gated) lock state', () => {
    const models = getModelListForCloudAccess(false);

    // Every model should either be 'ready'/'download_required' (local) or
    // 'locked' with the cloud sign-in reason (cloud). No model should have an
    // env-gate reason.
    for (const model of models) {
      if (model.lockReason !== undefined) {
        expect(model.lockReason ?? '').not.toMatch(/managed compute/i);
        expect(model.lockReason).not.toBe('Requires a local model runtime to be installed');
      }
    }
  });

  it('local models retain their existing availability unchanged', () => {
    const models = getModelListForCloudAccess(false);
    const localModels = models.filter((m) => m.surface === 'local');

    expect(localModels.length).toBeGreaterThan(0);
    for (const m of localModels) {
      // Local models are 'ready' (built-in, 0 bytes) or 'download_required'
      expect(['ready', 'download_required']).toContain(m.availability);
      expect(m.lockReason).toBeUndefined();
    }
  });

  it('cloud models retain their sign-in-locked state unchanged', () => {
    const models = getModelListForCloudAccess(false);
    const cloudModels = models.filter((m) => m.surface === 'cloud_managed');

    expect(cloudModels.length).toBeGreaterThan(0);
    for (const m of cloudModels) {
      expect(m.availability).toBe('locked');
      expect(m.lockReason).toBe('Sign in to use AGI Cloud chat.');
    }
  });
});
