/**
 * HealthKit permission flow + query stub tests.
 *
 * All native modules and MMKV are mocked — no real device required.
 * Tests exercise: permission caching, Android short-circuit, typed errors,
 * all five query types, and the tool descriptor shape.
 */

// ── Mock Platform ─────────────────────────────────────────────────────────────

let mockPlatformOS: 'ios' | 'android' = 'ios';

jest.mock('react-native', () => ({
  Platform: {
    get OS() {
      return mockPlatformOS;
    },
  },
}));

// ── Mock MMKV ─────────────────────────────────────────────────────────────────

const mmkvStore: Record<string, string> = {};

jest.mock('@/lib/mmkv', () => ({
  storage: {
    getString: (key: string) => mmkvStore[key] ?? undefined,
    set: (key: string, value: string) => {
      mmkvStore[key] = value;
    },
    delete: (key: string) => {
      delete mmkvStore[key];
    },
  },
}));

// ── Mock @kingstinct/react-native-healthkit ───────────────────────────────────

const mockHK = {
  requestAuthorization: jest.fn<Promise<boolean>, [string[], string[]]>(),
  getAuthorizationStatusForType: jest.fn<Promise<string>, [string]>(),
  queryWorkoutSamples: jest.fn(),
  queryQuantitySamples: jest.fn(),
  queryCategorySamples: jest.fn(),
};

// "mockHealthkitThrow" is prefixed "mock" so Jest allows it in the factory scope.
let mockHealthkitThrow = false;

jest.mock('@kingstinct/react-native-healthkit', () => {
  if (mockHealthkitThrow) throw new Error('module unavailable');
  return { default: mockHK };
});

// ─────────────────────────────────────────────────────────────────────────────
// Imports (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const permission =
  require('../services/healthKitPermission') as typeof import('../services/healthKitPermission');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const query = require('../services/healthKitQuery') as typeof import('../services/healthKitQuery');
// HEALTHKIT_TOOL lives in the query service — not in the local-llm catalog.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const catalog =
  require('../services/healthKitQuery') as typeof import('../services/healthKitQuery');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function clearMmkv() {
  for (const k of Object.keys(mmkvStore)) delete mmkvStore[k];
}

function allGranted() {
  mockHK.requestAuthorization.mockResolvedValue(true);
  mockHK.getAuthorizationStatusForType.mockResolvedValue('sharingAuthorized');
}

function allDenied() {
  mockHK.requestAuthorization.mockResolvedValue(false);
  mockHK.getAuthorizationStatusForType.mockResolvedValue('sharingDenied');
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission flow
// ─────────────────────────────────────────────────────────────────────────────

describe('healthKitPermission — iOS', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    mockHealthkitThrow = false;
    clearMmkv();
    jest.clearAllMocks();
  });

  it('returns all granted when authorization succeeds', async () => {
    allGranted();
    const result = await permission.requestHealthKitAccess(['steps', 'sleep']);
    expect(result.granted).toEqual(expect.arrayContaining(['steps', 'sleep']));
    expect(result.denied).toHaveLength(0);
  });

  it('returns all denied when authorization is denied', async () => {
    allDenied();
    const result = await permission.requestHealthKitAccess(['steps', 'sleep']);
    expect(result.denied).toEqual(expect.arrayContaining(['steps', 'sleep']));
    expect(result.granted).toHaveLength(0);
  });

  it('caches granted state and skips native call on second request', async () => {
    allGranted();
    await permission.requestHealthKitAccess(['steps']);
    jest.clearAllMocks();

    // Second call — native module should NOT be called again for already-granted types.
    const result = await permission.requestHealthKitAccess(['steps']);
    expect(result.granted).toContain('steps');
    expect(mockHK.requestAuthorization).not.toHaveBeenCalled();
  });

  it('getCachedHealthKitAuthStatus returns undetermined before any call', () => {
    expect(permission.getCachedHealthKitAuthStatus('heart_rate')).toBe('undetermined');
  });

  it('getCachedHealthKitAuthStatus returns granted after successful auth', async () => {
    allGranted();
    await permission.requestHealthKitAccess(['heart_rate']);
    expect(permission.getCachedHealthKitAuthStatus('heart_rate')).toBe('granted');
  });

  it('getCachedHealthKitAuthStatus returns denied after denied auth', async () => {
    allDenied();
    await permission.requestHealthKitAccess(['heart_rate']);
    expect(permission.getCachedHealthKitAuthStatus('heart_rate')).toBe('denied');
  });

  it('clearHealthKitAuthCache resets all cached state', async () => {
    allGranted();
    await permission.requestHealthKitAccess(['steps']);
    permission.clearHealthKitAuthCache();
    expect(permission.getCachedHealthKitAuthStatus('steps')).toBe('undetermined');
  });

  it('returns denied for native module errors (graceful degradation)', async () => {
    mockHK.requestAuthorization.mockResolvedValue(false);
    mockHK.getAuthorizationStatusForType.mockRejectedValue(new Error('HK error'));
    const result = await permission.requestHealthKitAccess(['workouts']);
    expect(result.denied).toContain('workouts');
  });

  it('handles module unavailable gracefully (no throw)', async () => {
    // Simulate getHealthKitModule returning null by making requestAuthorization unavailable.
    // The permission service catches require() throws via try/catch — set throw flag and
    // reset module registry so the lazy require is re-evaluated.
    mockHealthkitThrow = true;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p =
      require('../services/healthKitPermission') as typeof import('../services/healthKitPermission');
    const result = await p.requestHealthKitAccess(['steps']);
    expect(result.granted).toHaveLength(0);
    expect(result.denied).toContain('steps');
    mockHealthkitThrow = false;
    jest.resetModules();
  });
});

describe('healthKitPermission — Android', () => {
  beforeEach(() => {
    mockPlatformOS = 'android';
    clearMmkv();
    jest.clearAllMocks();
  });

  it('immediately returns denied for all types on Android', async () => {
    const result = await permission.requestHealthKitAccess(['steps', 'workouts']);
    expect(result.granted).toHaveLength(0);
    expect(result.denied).toEqual(expect.arrayContaining(['steps', 'workouts']));
    expect(mockHK.requestAuthorization).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query tool
// ─────────────────────────────────────────────────────────────────────────────

const FAKE_DATE = '2026-05-18T00:00:00.000Z';
const FAKE_DATE_END = '2026-05-18T08:00:00.000Z';

describe('queryHealth — iOS', () => {
  beforeEach(() => {
    mockPlatformOS = 'ios';
    mockHealthkitThrow = false;
    clearMmkv();
    jest.clearAllMocks();
    allGranted();
  });

  it('returns workouts with duration as value', async () => {
    mockHK.queryWorkoutSamples.mockResolvedValue([
      {
        startDate: FAKE_DATE,
        endDate: FAKE_DATE_END,
        duration: 3600,
        sourceBundleId: 'com.apple.health',
      },
    ]);
    const data = await query.queryHealth({ type: 'workouts' });
    expect(data.type).toBe('workouts');
    expect(data.samples).toHaveLength(1);
    expect(data.samples[0]!.value).toBe(3600);
    expect(data.samples[0]!.unit).toBe('seconds');
    expect(data.samples[0]!.source).toBe('com.apple.health');
  });

  it('returns sleep samples with category value', async () => {
    mockHK.queryCategorySamples.mockResolvedValue([
      {
        startDate: FAKE_DATE,
        endDate: FAKE_DATE_END,
        value: 1,
        categoryType: 'HKCategoryTypeIdentifierSleepAnalysis',
        sourceBundleId: 'com.apple.health',
      },
    ]);
    const data = await query.queryHealth({ type: 'sleep' });
    expect(data.type).toBe('sleep');
    expect(data.samples[0]!.unit).toBe('category');
  });

  it('returns steps with count unit', async () => {
    mockHK.queryQuantitySamples.mockResolvedValue([
      {
        startDate: FAKE_DATE,
        endDate: FAKE_DATE_END,
        quantity: 8543,
        quantityType: 'HKQuantityTypeIdentifierStepCount',
        sourceBundleId: 'com.apple.health',
      },
    ]);
    const data = await query.queryHealth({ type: 'steps' });
    expect(data.type).toBe('steps');
    expect(data.samples[0]!.value).toBe(8543);
    expect(data.samples[0]!.unit).toBe('count');
  });

  it('returns heart_rate with count/min unit', async () => {
    mockHK.queryQuantitySamples.mockResolvedValue([
      {
        startDate: FAKE_DATE,
        endDate: FAKE_DATE_END,
        quantity: 72,
        quantityType: 'HKQuantityTypeIdentifierHeartRate',
      },
    ]);
    const data = await query.queryHealth({ type: 'heart_rate' });
    expect(data.type).toBe('heart_rate');
    expect(data.samples[0]!.unit).toBe('count/min');
    expect(data.samples[0]!.source).toBe('unknown');
  });

  it('returns active_energy with kcal unit', async () => {
    mockHK.queryQuantitySamples.mockResolvedValue([
      {
        startDate: FAKE_DATE,
        endDate: FAKE_DATE_END,
        quantity: 350,
        quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
      },
    ]);
    const data = await query.queryHealth({ type: 'active_energy' });
    expect(data.samples[0]!.unit).toBe('kcal');
  });

  it('throws HealthKitError with code permission_denied when auth is denied', async () => {
    allDenied();
    clearMmkv();
    await expect(query.queryHealth({ type: 'steps' })).rejects.toMatchObject({
      name: 'HealthKitError',
      code: 'permission_denied',
    });
  });

  it('throws HealthKitError with code query_failed when native throws', async () => {
    mockHK.queryQuantitySamples.mockRejectedValue(new Error('HK native error'));
    await expect(query.queryHealth({ type: 'steps' })).rejects.toMatchObject({
      name: 'HealthKitError',
      code: 'query_failed',
    });
  });
});

describe('queryHealth — Android', () => {
  beforeEach(() => {
    mockPlatformOS = 'android';
    clearMmkv();
  });

  it('throws not_available_on_platform on Android', async () => {
    await expect(query.queryHealth({ type: 'steps' })).rejects.toMatchObject({
      name: 'HealthKitError',
      code: 'not_available_on_platform',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool descriptor (function-calling schema)
// ─────────────────────────────────────────────────────────────────────────────

describe('HEALTHKIT_TOOL descriptor', () => {
  it('has type "function"', () => {
    expect(catalog.HEALTHKIT_TOOL.type).toBe('function');
  });

  it('function name is query_health', () => {
    expect(catalog.HEALTHKIT_TOOL.function.name).toBe('query_health');
  });

  it('has a non-empty description', () => {
    expect(catalog.HEALTHKIT_TOOL.function.description.length).toBeGreaterThan(20);
  });

  it('parameters.type is required and has correct enum', () => {
    const params = catalog.HEALTHKIT_TOOL.function.parameters;
    expect(params.required).toContain('type');
    expect(params.properties.type.enum).toEqual(
      expect.arrayContaining(['workouts', 'sleep', 'steps', 'heart_rate', 'active_energy']),
    );
  });

  it('parameters schema is valid JSON-schema object', () => {
    const params = catalog.HEALTHKIT_TOOL.function.parameters;
    expect(params.type).toBe('object');
    expect(params.properties).toBeDefined();
  });
});
