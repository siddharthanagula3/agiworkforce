/* eslint-disable @typescript-eslint/no-require-imports */

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
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
    Easing: { linear: (value: number) => value },
    cancelAnimation: jest.fn(),
    useAnimatedProps: (factory: () => unknown) => factory(),
    useSharedValue: <T,>(value: T) => ({ value }),
    withRepeat: <T,>(value: T) => value,
    withTiming: <T,>(value: T) => value,
    default: {
      createAnimatedComponent: (component: unknown) => component,
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
  ...jest.requireActual('@agiworkforce/compliance'),
  composeShortFirstRunDisclosure: jest.fn().mockReturnValue({
    title: 'Before you continue',
    summary: 'This app processes your data on-device.',
    article50_1: 'Article 50(1)',
    sourceUrl: 'https://eur-lex.europa.eu',
    acceptLabel: 'Continue',
    declineLabel: 'Not now',
    detailsLabel: 'Why we show this',
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

const mockDownloadModel = jest.fn();
const mockCancelDownload = jest.fn();
const GGUF_MODEL_ID = 'fixture-gguf-model';

jest.mock('@/services/modelDownload', () => {
  class ModelDownloadError extends Error {
    readonly kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.name = 'ModelDownloadError';
      this.kind = kind;
    }
  }
  return {
    ModelDownloadError,
    downloadModel: (...args: unknown[]) => mockDownloadModel(...args),
    cancelDownload: (...args: unknown[]) => mockCancelDownload(...args),
    assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('@agiworkforce/local-llm', () => {
  const ggufModel = {
    id: 'fixture-gguf-model',
    displayName: 'Fixture GGUF',
    family: 'fixture-family',
    paramCountB: 4.0,
    fileSizeBytes: 2_147_483_648,
    supportedRuntimes: ['llama-rn'],
    contextWindow: 32768,
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
    downloadUrl: 'https://models.example/fixture.gguf',
    checksum: 'a'.repeat(64),
    format: 'gguf',
  };
  return {
    detectCapabilities: jest.fn().mockResolvedValue({
      totalRAMMB: 6144,
      tier1Available: false,
      tier1Runtime: null,
      tier2Available: false,
      tier3Available: true,
      osVersion: '18.2',
      thermalThrottled: false,
    }),
    getCapabilities: jest.fn().mockResolvedValue(null),
    getDefaultModel: jest.fn().mockReturnValue(ggufModel),
    getModelById: jest.fn((id: string) => (id === ggufModel.id ? ggufModel : undefined)),
    getShippableModels: jest.fn().mockReturnValue([ggufModel]),
    getSystemModelForTier1Runtime: jest.fn().mockReturnValue(undefined),
    hasRunnableGgufArtifacts: jest.fn().mockReturnValue(true),
    hasSufficientRAMForMultimodal: jest.fn().mockReturnValue(true),
    isMultimodalModel: jest.fn().mockReturnValue(false),
    tier2LoadModel: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../storage/installedModels', () => ({
  recordInstalledModel: jest.fn().mockResolvedValue(undefined),
  insertInstalledModel: jest.fn().mockResolvedValue(undefined),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  listInstalledModels: jest.fn().mockResolvedValue([]),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

import OnboardingScreen from '../app/(public)/onboarding';
import { useModelInstallStore } from '../src/features/model-picker/installStore';
import { useModelStore } from '../src/features/model-picker/store';

async function skipAboutYou(getByTestId: (id: string) => unknown) {
  await waitFor(() => expect(getByTestId('onboarding-about-you-screen')).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByTestId('about-you-skip-btn') as never);
    await Promise.resolve();
  });
}

describe('Onboarding GGUF download outlives the screen', () => {
  let finishDownload: () => void = () => undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useModelInstallStore.setState({ installedModelIds: [], readySystemModelIds: [], jobs: {} });
    mockDownloadModel.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDownload = () => resolve({ id: GGUF_MODEL_ID });
        }),
    );
  });

  async function startDownload() {
    const utils = render(<OnboardingScreen />);
    await act(async () => {
      fireEvent.press(utils.getByTestId('hero-start-chatting-btn'));
      await Promise.resolve();
    });
    await skipAboutYou(utils.getByTestId);
    await waitFor(() => utils.getByTestId('onboarding-device-tier-screen'));
    await act(async () => {
      fireEvent.press(utils.getByTestId('device-tier-download-btn'));
      await Promise.resolve();
    });
    await waitFor(() => utils.getByTestId('onboarding-download-screen'));
    await waitFor(() => expect(mockDownloadModel).toHaveBeenCalledTimes(1));
    return utils;
  }

  it('Continue to chat leaves the download running and finishes quietly when it completes', async () => {
    const { getByTestId } = await startDownload();
    const selectedBefore = useModelStore.getState().selectedModel;

    await act(async () => {
      fireEvent.press(getByTestId('download-skip-btn'));
      await Promise.resolve();
    });

    expect(mockCancelDownload).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(useModelInstallStore.getState().jobs[GGUF_MODEL_ID]?.status).toBe('downloading');

    await act(async () => {
      finishDownload();
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(useModelStore.getState().selectedModel).toBe(selectedBefore);
    expect(useModelInstallStore.getState().installedModelIds).toContain(GGUF_MODEL_ID);
    expect(useModelInstallStore.getState().jobs[GGUF_MODEL_ID]).toEqual({
      status: 'ready',
      progress: 1,
    });
  });

  it('activates the downloaded model and opens the app when the screen is still showing', async () => {
    await startDownload();

    await act(async () => {
      finishDownload();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/(app)' }));
    });
    expect(useModelStore.getState().selectedModel).toBe(GGUF_MODEL_ID);
  });
});
