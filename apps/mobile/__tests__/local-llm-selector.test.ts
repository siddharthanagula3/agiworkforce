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

jest.mock('react-native', () => ({
  NativeModules: {
    AGIFoundationModels: mockIosModule,
    AGIAICore: mockAndroidModule,
  },
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  })),
  Platform: { OS: 'ios' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  getAllModels,
  getModelById,
  getModelsByTier,
} = require('@agiworkforce/local-llm/src/catalog');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { detectCapabilities } = require('@agiworkforce/local-llm/src/capabilities');

describe('local-llm: catalog', () => {
  it('returns all models including system', () => {
    const models = getAllModels();
    expect(models.length).toBeGreaterThanOrEqual(5);
    const ids = models.map((m: { id: string }) => m.id);
    expect(ids).toContain('system');
    expect(ids).toContain('qwen2.5-1.5b-instruct-q4_k_m');
    expect(ids).toContain('llama-3.2-3b-instruct-q4');
    expect(ids).toContain('gemma-3-4b-vision-q4');
    expect(ids).toContain('whisper-base-en');
  });

  it('all catalog entries have a license field', () => {
    const models = getAllModels();
    for (const model of models) {
      expect(typeof model.license).toBe('string');
      expect(model.license.length).toBeGreaterThan(0);
    }
  });

  it('system model: sizeBytes=0, tier=[1]', () => {
    const sys = getModelById('system');
    expect(sys.sizeBytes).toBe(0);
    expect(sys.supportedTiers).toEqual([1]);
  });

  it('download models support tier 2 and 3', () => {
    const qwen = getModelById('qwen2.5-1.5b-instruct-q4_k_m');
    expect(qwen.supportedTiers).toContain(2);
    expect(qwen.supportedTiers).toContain(3);
    const llama = getModelById('llama-3.2-3b-instruct-q4');
    expect(llama.supportedTiers).toContain(2);
    expect(llama.supportedTiers).toContain(3);
  });

  it('getModelsByTier(1) returns only system', () => {
    const tier1 = getModelsByTier(1);
    expect(tier1.every((m: { supportedTiers: number[] }) => m.supportedTiers.includes(1))).toBe(
      true,
    );
    expect(tier1.some((m: { id: string }) => m.id === 'system')).toBe(true);
  });

  it('getModelsByTier(2) excludes system', () => {
    const tier2 = getModelsByTier(2);
    expect(tier2.some((m: { id: string }) => m.id === 'system')).toBe(false);
  });

  it('throws on unknown model id', () => {
    expect(() => getModelById('totally-fake-model')).toThrow(/Unknown local model/);
  });
});

describe('local-llm: capabilities — iOS Foundation Models', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns tier1Available=true when native module reports available', async () => {
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
    mockIosModule.getCapabilities.mockRejectedValue(new Error('module unavailable'));
    const caps = await detectCapabilities();
    expect(caps.tier1Available).toBe(false);
    expect(caps.tier3Available).toBe(true);
  });

  it('tier2Available is true when RAM >= 3500 MB', async () => {
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
