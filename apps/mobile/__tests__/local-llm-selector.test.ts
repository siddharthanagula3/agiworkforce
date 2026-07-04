/**
 * Unit tests for @agiworkforce/local-llm catalog and capability detection logic.
 * All NativeModules mocked — no real device required.
 */

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
    jest.resetModules();
    (global as { nativeModuleProxy?: Record<string, unknown> }).nativeModuleProxy = {
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
    };

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

// System-tier model IDs (OS-resident, not downloaded) — at least one must exist.
const SYSTEM_TIER_IDS = ['apple-foundation-models', 'gemini-nano-aicore'];

describe('local-llm: catalog', () => {
  it('returns all shippable models including at least one system-tier entry', () => {
    const { getShippableModels, getModelsForRole, getModelById, detectCapabilities } =
      getLocalLlm();

    const models = getShippableModels();
    expect(models.length).toBeGreaterThanOrEqual(4);
    const ids = models.map((m: { id: string }) => m.id);
    // At least one system-tier model (platform-dependent) must be present
    expect(SYSTEM_TIER_IDS.some((id: string) => ids.includes(id))).toBe(true);
    // Standard downloadable models must be present
    expect(ids).toContain('qwen3-4b-instruct-2507');
    expect(ids).toContain('llama-3.2-1b-instruct-spinquant');
    expect(ids).not.toContain('qwen2.5-vl-3b-instruct');
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
    const { getModelById } = getLocalLlm();

    const qwen = getModelById('qwen3-4b-instruct-2507');
    expect(qwen).toBeDefined();
    expect(qwen.fileSizeBytes).toBeGreaterThan(0);
    expect(qwen.supportedRuntimes).toContain('executorch');
    const llama = getModelById('llama-3.2-1b-instruct-spinquant');
    expect(llama).toBeDefined();
    expect(llama.fileSizeBytes).toBeGreaterThan(0);
    expect(llama.supportedRuntimes).toContain('executorch');
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
    expect(getModelById('totally-fake-model')).toBeUndefined();
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
