/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Performance settings page — unit tests
 *
 * Tests:
 *   performanceMonitor service:
 *     1. recordPerfEvent stores and returns events
 *     2. getPerfEventsLastDays returns only recent events
 *     3. getRollingStats computes correct averages
 *     4. recordBenchmark + getBenchmarkHistory round-trip
 *     5. clearPerfData wipes all keys
 *     6. runBenchmark produces correct shape and persists result
 *     7. getThermalState returns a valid state
 *
 *   MMKV persistence (PERF_* keys):
 *     8. Exported key constants have correct values
 *     9. Bool round-trip via raw mmkv storage
 *
 *   PerformanceScreen rendering:
 *    10. Renders header "Performance"
 *    11. Renders "Device Tier" card
 *    12. Renders "Active Model" card
 *    13. Renders "Benchmark This Device" card
 *    14. Renders "Thermal State" card
 *    15. Renders "Inference Settings" section
 *    16. Renders the three toggle labels
 *    17. Renders Run Benchmark button
 *    18. Run Benchmark button has correct accessibility role
 *    19. Switches have accessibilityRole switch (3 total)
 */

// ---------------------------------------------------------------------------
// Mocks — must be before any imports
// ---------------------------------------------------------------------------

const mockStorage = new Map<string, string>();

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => store.persist.rehydrate()),
  storage: {
    getString: (key: string) => mockStorage.get(key) ?? undefined,
    set: (key: string, value: string) => mockStorage.set(key, value),
    delete: (key: string) => mockStorage.delete(key),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@agiworkforce/local-llm', () => ({
  isThermallyThrottled: jest.fn().mockReturnValue(false),
  getCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: '18.0',
    thermalThrottled: false,
    tier1Available: true,
    tier1Runtime: 'foundation_models',
    tier2Available: true,
    tier3Available: true,
  }),
  detectCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 8192,
    osVersion: '18.0',
    thermalThrottled: false,
    tier1Available: true,
    tier1Runtime: 'foundation_models',
    tier2Available: true,
    tier3Available: true,
  }),
  refreshCapabilities: jest.fn().mockResolvedValue({}),
  getModelById: jest.fn().mockImplementation((id: string) => {
    if (id === 'qwen3-4b-instruct-2507') {
      return {
        id: 'qwen3-4b-instruct-2507',
        displayName: 'AGI Standard',
        family: 'qwen3',
        paramCountB: 4.0,
        fileSizeBytes: 2_147_483_648,
        supportedRuntimes: ['executorch', 'llama-rn'],
        contextWindow: 262_144,
        capabilities: {
          text: true,
          visionIn: false,
          audioIn: false,
          toolCalls: true,
          structuredOutput: true,
        },
        license: 'Apache-2.0',
        role: 'default',
        shipsInV1: true,
      };
    }
    return undefined;
  }),
  localGenerate: jest
    .fn()
    .mockImplementation(async (_path: unknown, opts: { onToken?: (t: string) => void }) => {
      for (let i = 0; i < 10; i++) {
        opts.onToken?.('tok');
      }
      return { text: 'benchmark result', runtime: 'foundation_models', aborted: false };
    }),
  selectTier: jest.fn().mockResolvedValue({ tier: 1, runtime: 'foundation_models' }),
}));

// Inject AGIFoundationModels into the jest-expo NativeModules mock.
// jest-expo provides a pre-configured react-native mock so we only extend it.
const { NativeModules } = require('react-native');
NativeModules.AGIFoundationModels = {
  getThermalState: jest.fn().mockReturnValue(0),
  isThermallyThrottled: jest.fn().mockReturnValue(false),
};

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, style }: { children: React.ReactNode; style?: object }) => (
        <View style={style}>{children}</View>
      ),
    },
    useAnimatedStyle: (fn: () => object) => fn(),
    useSharedValue: (initial: number) => ({ value: initial }),
    withSpring: (toValue: number) => toValue,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
    Polyline: () => null,
    Line: () => null,
    Circle: () => null,
    Text: ({ children }: { children: React.ReactNode }) => <Text>{children}</Text>,
  };
});

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn().mockReturnValue(true),
    back: jest.fn(),
  }),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return {
    ArrowLeft: icon,
    Cpu: icon,
    Zap: icon,
    Thermometer: icon,
    PlayCircle: icon,
    BarChart2: icon,
    Timer: icon,
    MemoryStick: icon,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePerfEvent(
  overrides: Partial<import('../services/performanceMonitor').PerfEvent> = {},
): import('../services/performanceMonitor').PerfEvent {
  return {
    ts: Date.now(),
    tokensPerSecond: 20,
    firstTokenLatencyMs: 150,
    peakMemoryMB: 512,
    backend: 'foundation_models',
    thermalState: 'nominal',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests — performanceMonitor service
// ---------------------------------------------------------------------------

import {
  recordPerfEvent,
  getPerfEventsLastDays,
  getRollingStats,
  recordBenchmark,
  getBenchmarkHistory,
  clearPerfData,
  runBenchmark,
  getThermalState,
} from '../services/performanceMonitor';

describe('performanceMonitor service', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  // 1. recordPerfEvent stores events
  it('recordPerfEvent stores events and returns them via getPerfEventsLastDays', () => {
    const event = makePerfEvent({ tokensPerSecond: 42 });
    recordPerfEvent(event);
    const events = getPerfEventsLastDays(7);
    expect(events.length).toBe(1);
    expect(events[0]!.tokensPerSecond).toBe(42);
  });

  // 2. getPerfEventsLastDays filters old events
  it('getPerfEventsLastDays excludes events older than N days', () => {
    const old = makePerfEvent({ ts: Date.now() - 8 * 24 * 60 * 60 * 1000, tokensPerSecond: 5 });
    const recent = makePerfEvent({ ts: Date.now(), tokensPerSecond: 30 });
    recordPerfEvent(old);
    recordPerfEvent(recent);
    const events = getPerfEventsLastDays(7);
    expect(events.length).toBe(1);
    expect(events[0]!.tokensPerSecond).toBe(30);
  });

  // 3. getRollingStats computes correct averages
  it('getRollingStats returns correct average tok/s and TTFT', () => {
    recordPerfEvent(makePerfEvent({ tokensPerSecond: 10, firstTokenLatencyMs: 100 }));
    recordPerfEvent(makePerfEvent({ tokensPerSecond: 20, firstTokenLatencyMs: 200 }));
    recordPerfEvent(makePerfEvent({ tokensPerSecond: 30, firstTokenLatencyMs: 300 }));
    const stats = getRollingStats();
    expect(stats.sampleCount).toBe(3);
    expect(stats.avgToksPerSecond).toBeCloseTo(20, 1);
    expect(stats.avgFirstTokenLatencyMs).toBeCloseTo(200, 1);
  });

  // 4. recordBenchmark + getBenchmarkHistory round-trip
  it('recordBenchmark persists and getBenchmarkHistory returns results newest-first', () => {
    const r1: import('../services/performanceMonitor').BenchmarkResult = {
      ts: 1000,
      modelId: 'qwen3-4b-instruct-2507',
      backend: 'foundation_models',
      tokensPerSecond: 25,
      firstTokenLatencyMs: 180,
      peakMemoryMB: 0,
      thermalState: 'nominal',
      promptTokens: 12,
      outputTokens: 60,
    };
    const r2 = { ...r1, ts: 2000, tokensPerSecond: 30 };
    recordBenchmark(r1);
    recordBenchmark(r2);
    const history = getBenchmarkHistory();
    expect(history.length).toBe(2);
    // Newest first
    expect(history[0]!.ts).toBe(2000);
    expect(history[1]!.ts).toBe(1000);
  });

  // 5. clearPerfData wipes both keys
  it('clearPerfData wipes events and benchmarks', () => {
    recordPerfEvent(makePerfEvent());
    recordBenchmark({
      ts: Date.now(),
      modelId: 'test',
      backend: 'llama_rn',
      tokensPerSecond: 10,
      firstTokenLatencyMs: 200,
      peakMemoryMB: 256,
      thermalState: 'nominal',
      promptTokens: 5,
      outputTokens: 20,
    });
    clearPerfData();
    expect(getPerfEventsLastDays(7).length).toBe(0);
    expect(getBenchmarkHistory().length).toBe(0);
  });

  // 6. runBenchmark produces correct shape and persists
  it('runBenchmark calls generate and persists result', async () => {
    const generate = jest
      .fn()
      .mockImplementation(async ({ onToken }: { prompt: string; onToken: (t: string) => void }) => {
        for (let i = 0; i < 20; i++) onToken('x');
        return { text: 'done', tokenCount: 20 };
      });

    const result = await runBenchmark({
      modelId: 'qwen3-4b-instruct-2507',
      backend: 'foundation_models',
      generate,
    });

    expect(result.modelId).toBe('qwen3-4b-instruct-2507');
    expect(result.outputTokens).toBe(20);
    expect(result.tokensPerSecond).toBeGreaterThan(0);
    expect(result.firstTokenLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.thermalState).toBe('nominal');

    const history = getBenchmarkHistory();
    expect(history[0]!.modelId).toBe('qwen3-4b-instruct-2507');
  });

  // 7. getThermalState returns a valid state
  it('getThermalState returns a valid thermal state string', () => {
    const state = getThermalState();
    expect(['nominal', 'fair', 'serious', 'critical']).toContain(state);
  });
});

// ---------------------------------------------------------------------------
// Tests — MMKV bool persistence (via the perf settings keys)
// ---------------------------------------------------------------------------

import {
  PERF_CHIP_SHOW_KEY,
  PERF_THERMAL_PAUSE_KEY,
  PERF_BATTERY_PAUSE_KEY,
} from '../app/(app)/settings/performance';

describe('perf settings MMKV keys', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  // 8. Exported key constants
  it('exports the three settings key constants with correct values', () => {
    expect(PERF_CHIP_SHOW_KEY).toBe('perf-show-chip-v1');
    expect(PERF_THERMAL_PAUSE_KEY).toBe('perf-pause-at-thermal-v1');
    expect(PERF_BATTERY_PAUSE_KEY).toBe('perf-pause-at-battery-v1');
  });

  // 9. Bool round-trip
  it('bool round-trip via raw mmkv storage', () => {
    const { storage } = require('../lib/mmkv');
    storage.set('perf-show-chip-v1', 'false');
    expect(storage.getString('perf-show-chip-v1')).toBe('false');
    storage.set('perf-show-chip-v1', 'true');
    expect(storage.getString('perf-show-chip-v1')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Tests — PerformanceScreen rendering
// ---------------------------------------------------------------------------

import { render } from '@testing-library/react-native';
import PerformanceScreen from '../app/(app)/settings/performance';

describe('PerformanceScreen rendering', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
  });

  // 10. Renders header
  it('renders the "Performance" header', () => {
    const { getAllByText } = render(<PerformanceScreen />);
    expect(getAllByText('Performance').length).toBeGreaterThanOrEqual(1);
  });

  // 11. Renders Device Tier card
  it('renders the Device Tier card heading', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Device Tier')).toBeTruthy();
  });

  // 12. Renders Active Model card
  it('renders the Active Model card heading', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Active Model')).toBeTruthy();
  });

  // 13. Renders Benchmark CTA
  it('renders "Benchmark This Device" card', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Benchmark This Device')).toBeTruthy();
  });

  // 14. Renders Thermal State card
  it('renders Thermal State card heading', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Thermal State')).toBeTruthy();
  });

  // 15. Renders Inference Settings section
  it('renders the "Inference Settings" section label', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Inference Settings')).toBeTruthy();
  });

  // 16. Renders toggle labels
  it('renders the three toggle labels', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Pause at serious thermal')).toBeTruthy();
    expect(getByText('Pause at 15% battery')).toBeTruthy();
    expect(getByText('Show performance chip in chat')).toBeTruthy();
  });

  // 17. Renders Run Benchmark button text
  it('renders the Run Benchmark button', () => {
    const { getByText } = render(<PerformanceScreen />);
    expect(getByText('Run Benchmark')).toBeTruthy();
  });

  // 18. Run Benchmark has correct accessibility role
  it('Run Benchmark button has correct accessibility role', () => {
    const { getByRole } = render(<PerformanceScreen />);
    const btn = getByRole('button', { name: 'Run Benchmark' });
    expect(btn).toBeTruthy();
  });

  // 19. Three switches
  it('switches have accessibilityRole switch (3 total)', () => {
    const { getAllByRole } = render(<PerformanceScreen />);
    const switches = getAllByRole('switch');
    expect(switches.length).toBe(3);
  });
});
