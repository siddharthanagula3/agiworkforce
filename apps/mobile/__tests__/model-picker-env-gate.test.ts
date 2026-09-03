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

jest.mock('@agiworkforce/types', () => {
  const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
  return {
    ...actual,
    getModelMetadataById: jest.fn((id: string) => actual.getModelMetadataById(id)),
  };
});

import {
  applyEnvironmentGate,
  environmentAvailability,
  getModelListForCloudAccess,
  type ModelDef,
} from '../src/features/model-picker/service';
import { evaluateModelEnvironment, getModelMetadataById } from '@agiworkforce/types';

const mockGetModelMetadataById = getModelMetadataById as jest.MockedFunction<
  typeof getModelMetadataById
>;

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

  it('(a) returns the model unchanged when requiresEnvironment is undefined', () => {
    const result = applyEnvironmentGate(baseModel, undefined);
    expect(result).toBe(baseModel);
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

  it("(b) locks a model with requiresEnvironment:'e2b' and sets the correct reason", () => {
    const result = applyEnvironmentGate(baseModel, 'e2b');

    expect(result).not.toBe(baseModel);
    expect(result.availability).toBe('locked');

    const verdict = evaluateModelEnvironment('e2b', { configured: false });
    expect(verdict.selectable).toBe(false);
    expect(result.lockReason).toBe(verdict.reason);
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
    const unlockedModel = { ...baseModel, availability: 'ready' as const, lockReason: undefined };
    const result = applyEnvironmentGate(unlockedModel, 'e2b');

    expect(result.availability).toBe('locked');
    expect(result.lockReason).toMatch(/managed compute/i);
  });
});

describe('getModelListForCloudAccess, environment gating wiring (c)', () => {
  function getCurrentCloudTargetId(): string {
    const targetId = getModelListForCloudAccess(true).find(
      (model) => model.surface === 'cloud_managed',
    )?.id;
    expect(targetId).toBeDefined();
    return targetId!;
  }

  beforeEach(() => {
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
    const targetId = getCurrentCloudTargetId();
    const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
    mockGetModelMetadataById.mockImplementation((id) => {
      const base = actual.getModelMetadataById(id);
      if (id === targetId && base) {
        return { ...base, requiresEnvironment: 'e2b' as const };
      }
      return base;
    });

    const models = getModelListForCloudAccess(true);
    const target = models.find((m) => m.id === targetId);

    expect(target).toBeDefined();
    expect(target!.availability).toBe('locked');
    expect(target!.lockReason).toMatch(/managed compute/i);
  });

  it('(c) non-targeted cloud models are unaffected by the injected requiresEnvironment', () => {
    const targetId = getCurrentCloudTargetId();
    const actual = jest.requireActual<typeof import('@agiworkforce/types')>('@agiworkforce/types');
    mockGetModelMetadataById.mockImplementation((id) => {
      const base = actual.getModelMetadataById(id);
      if (id === targetId && base) {
        return { ...base, requiresEnvironment: 'e2b' as const };
      }
      return base;
    });

    const models = getModelListForCloudAccess(true);
    const otherCloudModels = models.filter(
      (m) => m.surface === 'cloud_managed' && m.id !== targetId,
    );

    for (const m of otherCloudModels) {
      expect(m.availability).toBe('ready');
    }
  });
});

// (d) CRITICAL SAFETY: no current model has its availability changed

describe('CRITICAL SAFETY: no current model availability is altered by Phase A env gate (d)', () => {
  it('all models from getModelListForCloudAccess(false) have their expected (non-env-gated) lock state', () => {
    const models = getModelListForCloudAccess(false);

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
