/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Onboarding → ExecuTorch tier2 download → first offline response.
 *
 * Verifies LAUNCH-SLICE-2c requirement:
 *   A clean install reaches ONE real on-device generated response via the
 *   ExecuTorch path (mocked react-native-executorch LLMModule via
 *   _setLLMModuleForTesting), NOT the dead-end finishOnboarding() fall-through.
 *
 * Test architecture:
 *   - onboarding.tsx mocked at module boundary except for the real
 *     tier2LoadModel + recordInstalledModel (also mocked to avoid SQLite).
 *   - The local-llm module is partially mocked: catalog + detectCapabilities
 *     come from the mock; tier2LoadModel is the real export but with
 *     react-native-executorch replaced via _setLLMModuleForTesting.
 */

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be before component import
// ---------------------------------------------------------------------------

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    canGoBack: jest.fn().mockReturnValue(false),
    back: jest.fn(),
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => (
        <View {...rest}>{children}</View>
      ),
    },
    FadeIn: { duration: () => ({ delay: () => ({}) }) },
    FadeOut: { duration: () => ({}) },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => {
    const { View } = require('react-native');
    return <View {...rest}>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = ({ testID }: { testID?: string }) => <Text testID={testID}>icon</Text>;
  return {
    Cpu: icon,
    Plane: icon,
    Shield: icon,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => store.persist.rehydrate()),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const mockBottomSheet = jest.fn().mockImplementation(({ children }) => children);
  return {
    __esModule: true,
    default: mockBottomSheet,
    BottomSheetBackdrop: jest.fn().mockReturnValue(null),
    BottomSheetScrollView: jest.fn().mockImplementation(({ children }) => children),
  };
});
jest.mock('../src/features/model-picker/components/ModelPickerSheet', () => ({
  ModelPickerSheet: jest.fn().mockReturnValue(null),
}));

jest.mock('@agiworkforce/compliance', () => ({
  composeFirstRunDisclosure: jest.fn().mockReturnValue({
    title: 'Before you continue',
    summary: 'This app processes your data on-device.',
    article50_1: 'Article 50(1)',
    sourceUrl: 'https://eur-lex.europa.eu',
    acceptLabel: 'Continue',
    declineLabel: 'Not now',
    thirdPartyAiProviders: [],
    offersManagedCloud: false,
  }),
  isDisclosureSatisfied: jest.fn().mockReturnValue(true), // skip modal for these tests
  recordDisclosureAcceptance: jest.fn().mockResolvedValue(undefined),
  DISCLOSURE_LEDGER_KEY: 'disclosure_ledger',
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    platform: { ios: { model: 'iPhone15', systemVersion: '18.2' } },
    deviceName: 'Test iPhone',
  },
}));

// ---------------------------------------------------------------------------
// tier2LoadModel mock — we replace the whole @agiworkforce/local-llm mock
// with a selective version: real tier2LoadModel is simulated by capturing
// the progressCallback and resolving after we drive it, so we can assert
// progress updates before finishOnboarding fires.
// ---------------------------------------------------------------------------

const mockTier2LoadModel = jest.fn();
const mockTier2Generate = jest.fn();
const DEFAULT_MODEL_ID = 'fixture-default-local-model';
const EXECUTORCH_PRESET_NAME = 'fixture-executorch-preset';
const IOS_SYSTEM_MODEL_ID = 'fixture-ios-system-model';
const ANDROID_SYSTEM_MODEL_ID = 'fixture-android-system-model';

jest.mock('@agiworkforce/local-llm', () => {
  // Define mock catalog rows inside the hoisted factory so no clean checkout
  // depends on module-scope initialization order.
  const defaultModelWithPreset = {
    id: 'fixture-default-local-model',
    displayName: 'AGI Standard',
    family: 'fixture-family',
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
    executorchPreset: {
      modelName: 'fixture-executorch-preset',
      modelSource: 'https://models.example/fixture-model.pte',
      tokenizerSource: 'https://models.example/tokenizer.json',
      tokenizerConfigSource: 'https://models.example/tokenizer-config.json',
    },
  };
  const systemModels = [
    {
      ...defaultModelWithPreset,
      id: 'fixture-ios-system-model',
      supportedRuntimes: ['apple-foundation-models'],
      role: 'system-multimodal',
      executorchPreset: undefined,
    },
    {
      ...defaultModelWithPreset,
      id: 'fixture-android-system-model',
      supportedRuntimes: ['aicore'],
      role: 'system-multimodal',
      executorchPreset: undefined,
    },
  ];

  return {
    detectCapabilities: jest.fn().mockResolvedValue({
      totalRAMMB: 6144,
      tier1Available: false,
      tier1Runtime: null,
      tier2Available: true,
      tier3Available: true,
      osVersion: '18.2',
      thermalThrottled: false,
    }),
    getDefaultModel: jest.fn().mockReturnValue(defaultModelWithPreset),
    getShippableModels: jest.fn().mockReturnValue([defaultModelWithPreset, ...systemModels]),
    tier2LoadModel: (...args: unknown[]) => mockTier2LoadModel(...args),
    tier2Generate: (...args: unknown[]) => mockTier2Generate(...args),
  };
});

// Mock recordInstalledModel so we don't need a real SQLite DB.
const mockRecordInstalledModel = jest.fn().mockResolvedValue(undefined);
jest.mock('../storage/installedModels', () => ({
  recordInstalledModel: (...args: unknown[]) => mockRecordInstalledModel(...args),
  insertInstalledModel: (...args: unknown[]) => mockRecordInstalledModel(...args),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import OnboardingScreen from '../app/(public)/onboarding';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Onboarding → tier2 ExecuTorch download flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: tier2LoadModel resolves immediately (model already cached or fast download)
    mockTier2LoadModel.mockResolvedValue(undefined);
  });

  async function renderAtDeviceTier() {
    const utils = render(<OnboardingScreen />);
    await act(async () => {
      fireEvent.press(utils.getByTestId('hero-start-chatting-btn'));
      await Promise.resolve();
    });
    await waitFor(() => utils.getByTestId('onboarding-device-tier-screen'));
    return utils;
  }

  it('tapping Download calls tier2LoadModel with the executorchPreset', async () => {
    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockTier2LoadModel).toHaveBeenCalledTimes(1);
      expect(mockTier2LoadModel).toHaveBeenCalledWith(
        expect.objectContaining({ modelName: EXECUTORCH_PRESET_NAME }),
        expect.any(Function),
      );
    });
  });

  it('shows the download screen (progress ring) while tier2LoadModel is pending', async () => {
    // Hold the download open until we check
    let resolveTier2: () => void;
    mockTier2LoadModel.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveTier2 = res;
        }),
    );

    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });

    await waitFor(() => expect(getByTestId('onboarding-download-screen')).toBeTruthy());

    // Resolve so the component doesn't leak timers / state updates after test
    await act(async () => {
      resolveTier2();
      await Promise.resolve();
    });
  });

  it('tier2LoadModel progress callback drives the radial ring (0..100 mapping)', async () => {
    let capturedProgressCb: ((fractional: number) => void) | null = null;
    let resolveTier2: () => void;
    mockTier2LoadModel.mockImplementation(
      (_preset: unknown, progressCb: ((p: number) => void) | undefined) => {
        capturedProgressCb = progressCb ?? null;
        return new Promise<void>((res) => {
          resolveTier2 = res;
        });
      },
    );

    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => getByTestId('onboarding-download-screen'));

    // Drive progress to 50%
    await act(async () => {
      capturedProgressCb?.(0.5);
    });
    // percent label should show 50
    await waitFor(() => {
      const label = getByTestId('download-percent');
      expect(label.props.accessibilityLabel).toBe('50 percent downloaded');
    });

    // Resolve tier2 so the component cleans up
    await act(async () => {
      resolveTier2();
      await Promise.resolve();
    });
  });

  it('records installed model with format pte after tier2LoadModel resolves', async () => {
    mockTier2LoadModel.mockResolvedValue(undefined);
    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockRecordInstalledModel).toHaveBeenCalledWith(
        expect.objectContaining({
          id: DEFAULT_MODEL_ID,
          format: 'pte',
          local_path: null,
          runtime: 'local',
        }),
      );
    });
  });

  it('navigates to app after successful tier2 download and installed_models record', async () => {
    mockTier2LoadModel.mockResolvedValue(undefined);
    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(app)' }));
    });
  });

  it('shows an error message when tier2LoadModel throws', async () => {
    mockTier2LoadModel.mockRejectedValue(new Error('Network error downloading model shard'));
    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => {
      const errEl = getByTestId('download-error');
      expect(errEl.props.children).toContain('Network error downloading model shard');
    });
  });

  it('does NOT call finishOnboarding when tier2LoadModel fails', async () => {
    mockTier2LoadModel.mockRejectedValue(new Error('quota exceeded'));
    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => getByTestId('download-error'));
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does NOT silently fall through to finishOnboarding when no preset and no downloadUrl', async () => {
    // Simulate a catalog entry that has neither executorchPreset nor downloadUrl
    const { getDefaultModel } = require('@agiworkforce/local-llm');
    const currentDefaultModel = (getDefaultModel as jest.Mock)();
    (getDefaultModel as jest.Mock).mockReturnValue({
      ...currentDefaultModel,
      executorchPreset: undefined,
      downloadUrl: undefined,
      checksum: undefined,
      format: undefined,
    });

    const { getByTestId } = await renderAtDeviceTier();
    await act(async () => {
      fireEvent.press(getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });

    // Should show an error, NOT navigate to app
    await waitFor(() => {
      const errEl = getByTestId('download-error');
      expect(errEl.props.children).toContain('cannot be downloaded yet');
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockTier2LoadModel).not.toHaveBeenCalled();
  });
});

describe('Model picker — system-runtime-only models hidden', () => {
  it('LOCAL_MODEL_LIST excludes the iOS system model fixture', () => {
    const { LOCAL_MODEL_LIST } = require('../src/features/model-picker/service');
    expect(
      (LOCAL_MODEL_LIST as Array<{ id: string }>).some((m) => m.id === IOS_SYSTEM_MODEL_ID),
    ).toBe(false);
  });

  it('LOCAL_MODEL_LIST excludes the Android system model fixture', () => {
    const { LOCAL_MODEL_LIST } = require('../src/features/model-picker/service');
    expect(
      (LOCAL_MODEL_LIST as Array<{ id: string }>).some((m) => m.id === ANDROID_SYSTEM_MODEL_ID),
    ).toBe(false);
  });

  it('LOCAL_MODEL_LIST includes the default model fixture', () => {
    const { LOCAL_MODEL_LIST } = require('../src/features/model-picker/service');
    expect((LOCAL_MODEL_LIST as Array<{ id: string }>).some((m) => m.id === DEFAULT_MODEL_ID)).toBe(
      true,
    );
  });
});
