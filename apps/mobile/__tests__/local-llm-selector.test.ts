
const mockIosModule = {
  getCapabilities: jest.fn(),
  isThermallyThrottled: jest.fn(),
};

const mockAndroidModule = {
  getCapabilities: jest.fn(),
  isThermallyThrottled: jest.fn(),
};

let localLlmModule: typeof import('@agiworkforce/local-llm');
const getLocalLlm = () => localLlmModule;

const loadLocalLlmModule = () => {
  const moduleRef: typeof import('@agiworkforce/local-llm') = (() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NativeModules } = require('react-native') as typeof import('react-native');
    Object.assign(NativeModules, {
      AGIFoundationModels: mockIosModule,
      AGIAICore: mockAndroidModule,
      PlatformConstants: {
        getConstants: () => ({
          isTesting: false,
          reactNativeVersion: {
            major: 0,
            minor: 84,
            patch: 0,
            prerelease: null,
          },
          interfaceIdiom: 'phone',
          osVersion: '16.0',
          systemName: 'iOS',
          forceTouchAvailable: false,
        }),
      },
      SourceCode: {
        getConstants: () => ({
          scriptURL: null,
        }),
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@agiworkforce/local-llm');
  })();

  return moduleRef;
};

beforeAll(() => {
  localLlmModule = loadLocalLlmModule();
});

beforeEach(() => {
  mockIosModule.getCapabilities.mockReset();
  mockIosModule.isThermallyThrottled.mockReset();
  mockAndroidModule.getCapabilities.mockReset();
  mockAndroidModule.isThermallyThrottled.mockReset();
});

const SYNTHETIC_UNKNOWN_MODEL_ID = 'fixture-unknown-local-model';

describe('local-llm: catalog', () => {
  it('returns all shippable models including at least one system-tier entry', () => {
    const { getDefaultModel, getLiteModeModel, getModelsForRole, getShippableModels } =
      getLocalLlm();

    const models = getShippableModels();
    expect(models.length).toBeGreaterThanOrEqual(4);
    const ids = models.map((m: { id: string }) => m.id);
    const systemModels = getModelsForRole('system-multimodal').filter((model) => model.shipsInV1);
    const liteModel = getLiteModeModel();
    const hiddenVisionModel = getModelsForRole('premium-vision-pack').find(
      (model) => !model.shipsInV1,
    );

    expect(systemModels.some((model) => ids.includes(model.id))).toBe(true);
    expect(ids).toContain(getDefaultModel().id);
    expect(liteModel).toBeDefined();
    expect(ids).toContain(liteModel?.id);
    expect(hiddenVisionModel).toBeDefined();
    expect(ids).not.toContain(hiddenVisionModel?.id);
  });

  it('all catalog entries have a license field', () => {
    const { getShippableModels } = getLocalLlm();

    const models = getShippableModels();
    for (const model of models) {
      expect(typeof model.license).toBe('string');
      expect(model.license.length).toBeGreaterThan(0);
    }
  });

  it('system-tier models: fileSizeBytes=0, role=system-multimodal', () => {
    const { getModelsForRole } = getLocalLlm();

    const systemModels = getModelsForRole('system-multimodal');
    expect(systemModels.length).toBeGreaterThanOrEqual(1);
    for (const sys of systemModels) {
      expect(sys.fileSizeBytes).toBe(0);
      expect(sys.role).toBe('system-multimodal');
    }
  });

  it('download models have non-zero fileSizeBytes and executorch/llama-rn runtime support', () => {
    const { getDefaultModel, getLiteModeModel, getModelById } = getLocalLlm();

    const liteModel = getLiteModeModel();
    expect(liteModel).toBeDefined();
    for (const catalogModel of [getDefaultModel(), liteModel]) {
      if (!catalogModel) continue;
      const resolvedModel = getModelById(catalogModel.id);
      expect(resolvedModel).toBeDefined();
      expect(resolvedModel?.fileSizeBytes).toBeGreaterThan(0);
      expect(resolvedModel?.supportedRuntimes).toContain('executorch');
    }
  });

  it('getModelsForRole(system-multimodal) returns system-tier entries', () => {
    const { getModelsForRole } = getLocalLlm();

    const systemTier = getModelsForRole('system-multimodal');
    expect(systemTier.every((m: { role: string }) => m.role === 'system-multimodal')).toBe(true);
    expect(systemTier.length).toBeGreaterThanOrEqual(1);
  });

  it('getModelsForRole(default) excludes system-multimodal entries', () => {
    const { getModelsForRole } = getLocalLlm();

    const defaultModels = getModelsForRole('default');
    expect(defaultModels.every((m: { role: string }) => m.role !== 'system-multimodal')).toBe(true);
  });

  it('returns undefined for unknown model id', () => {
    const { getModelById } = getLocalLlm();
    expect(getModelById(SYNTHETIC_UNKNOWN_MODEL_ID)).toBeUndefined();
  });
});

describe('local-llm: capabilities — iOS Foundation Models', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tier1Available=true when native module reports available', async () => {
    const { detectCapabilities } = getLocalLlm();
    mockIosModule.getCapabilities.mockResolvedValue({
      tier: 1,
      available: true,
      thermalThrottled: false,
      totalRAMMB: 8192,
      osVersion: 'iOS 26.0',
      runtimeName: 'foundation_models',
    });
    const caps = await detectCapabilities();
    expect(caps.tier1Available).toBe(true);
    expect(caps.tier1Runtime).toBe('foundation_models');
    expect(caps.totalRAMMB).toBe(8192);
    expect(caps.thermalThrottled).toBe(false);
    expect(caps.tier3Available).toBe(true);
  });

  it('returns tier1Available=false when native module reports available=false', async () => {
    const { detectCapabilities } = getLocalLlm();
    mockIosModule.getCapabilities.mockResolvedValue({
      available: false,
      thermalThrottled: false,
      totalRAMMB: 4096,
      osVersion: 'iOS 17.0',
    });
    const caps = await detectCapabilities();
    expect(caps.tier1Available).toBe(false);
    expect(caps.tier1Runtime).toBeNull();
  });

  it('reports thermalThrottled=true', async () => {
    const { detectCapabilities } = getLocalLlm();
    mockIosModule.getCapabilities.mockResolvedValue({
      available: true,
      thermalThrottled: true,
      totalRAMMB: 8192,
      osVersion: 'iOS 26.0',
    });
    const caps = await detectCapabilities();
    expect(caps.thermalThrottled).toBe(true);
  });

  it('returns tier1Available=false when native module throws', async () => {
    const { detectCapabilities } = getLocalLlm();
    mockIosModule.getCapabilities.mockRejectedValue(new Error('module unavailable'));
    const caps = await detectCapabilities();
    expect(caps.tier1Available).toBe(false);
    expect(caps.tier3Available).toBe(true);
  });

  it('tier2Available is true when RAM >= 3500 MB', async () => {
    const { detectCapabilities } = getLocalLlm();
    mockIosModule.getCapabilities.mockResolvedValue({
      available: false,
      thermalThrottled: false,
      totalRAMMB: 6000,
      osVersion: 'iOS 17',
    });
    const caps = await detectCapabilities();
    expect(caps.tier2Available).toBe(true);
  });

  it('tier2Available is false when RAM < 3500 MB', async () => {
    const { detectCapabilities } = getLocalLlm();
    mockIosModule.getCapabilities.mockResolvedValue({
      available: false,
      thermalThrottled: false,
      totalRAMMB: 2048,
      osVersion: 'iOS 15',
    });
    const caps = await detectCapabilities();
    expect(caps.tier2Available).toBe(false);
  });
});
