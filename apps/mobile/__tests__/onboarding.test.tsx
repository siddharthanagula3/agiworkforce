/* eslint-disable @typescript-eslint/no-require-imports */

import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

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

const mockStorageSet = jest.fn();
const mockStorageGet = jest.fn().mockReturnValue(undefined);
const mockStorageDelete = jest.fn();
let mockModelPickerProps: { onSelect?: (modelId: string) => void } | null = null;
jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => store.persist.rehydrate()),
  storage: {
    getString: (...args: unknown[]) => mockStorageGet(...args),
    set: (...args: unknown[]) => mockStorageSet(...args),
    delete: (...args: unknown[]) => mockStorageDelete(...args),
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
  ModelPickerSheet: jest.fn((props: { onSelect?: (modelId: string) => void }) => {
    mockModelPickerProps = props;
    return null;
  }),
}));

const mockIsDisclosureSatisfied = jest.fn().mockReturnValue(false);
const mockComposeFirstRunDisclosure = jest.fn().mockReturnValue({
  title: 'Before you continue',
  summary: 'This app processes your data on-device.',
  article50_1: 'Article 50(1) of the EU AI Act...',
  sourceUrl: 'https://eur-lex.europa.eu',
  acceptLabel: 'Continue',
  declineLabel: 'Not now',
  thirdPartyAiProviders: [],
  offersManagedCloud: false,
});
const mockRecordDisclosureAcceptance = jest.fn().mockResolvedValue(undefined);
jest.mock('@agiworkforce/compliance', () => ({
  composeFirstRunDisclosure: (...args: unknown[]) => mockComposeFirstRunDisclosure(...args),
  isDisclosureSatisfied: (...args: unknown[]) => mockIsDisclosureSatisfied(...args),
  recordDisclosureAcceptance: (...args: unknown[]) => mockRecordDisclosureAcceptance(...args),
  DISCLOSURE_LEDGER_KEY: 'disclosure_ledger',
}));

const mockDetectCapabilities = jest.fn(() => new Promise(() => {}));
const mockGetInstalledModel = jest.fn().mockResolvedValue(null);
const DEFAULT_LOCAL_MODEL_ID = 'fixture-default-local-model';
const LITE_LOCAL_MODEL_ID = 'fixture-lite-local-model';

jest.mock('../storage/installedModels', () => ({
  getInstalledModel: (...args: unknown[]) => mockGetInstalledModel(...args),
  recordInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

const mockDefaultLocalModel = {
  id: DEFAULT_LOCAL_MODEL_ID,
  displayName: 'Fixture Standard',
  family: 'fixture-family',
  paramCountB: 1.5,
  fileSizeBytes: 1_073_741_824,
  supportedRuntimes: ['gguf'],
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
};
const mockLiteLocalModel = {
  ...mockDefaultLocalModel,
  id: LITE_LOCAL_MODEL_ID,
  displayName: 'AGI Lite',
  family: 'fixture-lite-family',
  paramCountB: 1,
  fileSizeBytes: 600_000_000,
  role: 'lite-mode',
};
jest.mock('@agiworkforce/local-llm', () => ({
  detectCapabilities: (...args: unknown[]) => mockDetectCapabilities(...args),
  getDefaultModel: jest.fn(() => mockDefaultLocalModel),
  getModelById: jest.fn((id: string) =>
    [mockDefaultLocalModel, mockLiteLocalModel].find((model) => model.id === id),
  ),
  getShippableModels: jest.fn(() => [mockDefaultLocalModel, mockLiteLocalModel]),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    platform: {
      ios: { model: 'iPhone14', systemVersion: '18.0' },
    },
    deviceName: 'Test iPhone',
  },
}));

import OnboardingScreen from '../app/(public)/onboarding';
import {
  CLOUD_CHAT_POST_AUTH_INTENT,
  POST_AUTH_INTENT_PARAM,
} from '../src/features/auth/services/postAuthIntent';

describe('Onboarding', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockModelPickerProps = null;
    mockIsDisclosureSatisfied.mockReturnValue(false);
    mockGetInstalledModel.mockResolvedValue(null);
  });

  describe('Hero screen (initial)', () => {
    it('renders with testID onboarding-root', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('onboarding-root')).toBeTruthy();
    });

    it('shows hero screen testID', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('onboarding-hero-screen')).toBeTruthy();
    });

    it('shows wordmark "AGI"', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-wordmark')).toBeTruthy();
    });

    it('shows the polished hero tagline', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('Your AI workspace for everyday work.')).toBeTruthy();
    });

    it('shows hero tagline testID', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-tagline')).toBeTruthy();
    });

    it('shows the website AGI brand mark beside the wordmark', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-brand-mark')).toBeTruthy();
    });

    it('shows locked footer copy', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-footer')).toBeTruthy();
    });

    it('shows "Start chatting" button', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-start-chatting-btn')).toBeTruthy();
    });

    it('shows Continue when the recommended model is already installed', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(true);
      mockGetInstalledModel.mockResolvedValue({
        id: DEFAULT_LOCAL_MODEL_ID,
        display_name: mockDefaultLocalModel.displayName,
        runtime: 'local',
        format: 'pte',
        size_bytes: 1_073_741_824,
        sha256: null,
        local_path: null,
        installed_at: Date.now(),
        last_used_at: null,
        capabilities: null,
      });

      const { getByTestId, getByText } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });

      await waitFor(() => expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy());
      await waitFor(() => expect(getByText('Continue')).toBeTruthy());
    });

    it('does NOT show device-tier screen on initial render', () => {
      const { queryByTestId } = render(<OnboardingScreen />);
      expect(queryByTestId('onboarding-device-tier-screen')).toBeNull();
    });

    it('does NOT show download screen on initial render', () => {
      const { queryByTestId } = render(<OnboardingScreen />);
      expect(queryByTestId('onboarding-download-screen')).toBeNull();
    });
  });

  describe('Disclosure modal gate', () => {
    it('tapping "Start chatting" shows disclosure modal when not previously satisfied', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(getByTestId('disclosure-accept-btn')).toBeTruthy();
    });

    it('accepting the disclosure advances to device-tier screen', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(getByTestId('disclosure-accept-btn')).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-accept-btn'));
        await Promise.resolve();
      });
      await waitFor(() => expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy());
    });

    it('accepting the disclosure calls recordDisclosureAcceptance', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(getByTestId('disclosure-accept-btn')).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-accept-btn'));
        await Promise.resolve();
      });
      expect(mockRecordDisclosureAcceptance).toHaveBeenCalled();
    });

    it('declining the disclosure keeps user on hero screen', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId, queryByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(getByTestId('disclosure-decline-btn')).toBeTruthy();
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-decline-btn'));
      });
      expect(getByTestId('onboarding-hero-screen')).toBeTruthy();
      expect(queryByTestId('onboarding-device-tier-screen')).toBeNull();
    });

    it('skips modal when disclosure is already satisfied', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(true);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy();
    });
  });

  describe('Device-tier screen', () => {
    async function renderAtDeviceTier() {
      mockIsDisclosureSatisfied.mockReturnValue(true);
      const utils = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(utils.getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(utils.getByTestId('onboarding-device-tier-screen')).toBeTruthy();
      return utils;
    }

    it('shows device-tier screen testID', async () => {
      const { getByTestId } = await renderAtDeviceTier();
      expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy();
    });

    it('shows device-tier headline testID', async () => {
      const { getByTestId } = await renderAtDeviceTier();
      expect(getByTestId('device-tier-headline')).toBeTruthy();
    });

    it('shows download button', async () => {
      const { getByTestId } = await renderAtDeviceTier();
      expect(getByTestId('device-tier-download-btn')).toBeTruthy();
    });

    it('shows model size without claiming a fixed download time', async () => {
      const { getByText, queryByText } = await renderAtDeviceTier();
      expect(getByText('1.0 GB download · Wi-Fi recommended')).toBeTruthy();
      expect(getByText('Download time depends on your connection.')).toBeTruthy();
      expect(queryByText(/Estimated download/)).toBeNull();
    });

    it('shows pick-a-different-model button', async () => {
      const { getByTestId } = await renderAtDeviceTier();
      expect(getByTestId('device-tier-pick-model-btn')).toBeTruthy();
    });

    it('carries an explicit Cloud intent into sign-in without persisting a mode', async () => {
      const { getByTestId } = await renderAtDeviceTier();

      fireEvent.press(getByTestId('device-tier-cloud-btn'));

      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockStorageSet).not.toHaveBeenCalledWith('onboarding-mode', expect.anything());
      expect(mockStorageDelete).toHaveBeenCalledWith('onboarding-mode');
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/(auth)/login',
        params: { [POST_AUTH_INTENT_PARAM]: CLOUD_CHAT_POST_AUTH_INTENT },
      });
    });

    it('uses the selected picker model for the download card', async () => {
      const { getByTestId, getByText } = await renderAtDeviceTier();

      await act(async () => {
        fireEvent.press(getByTestId('device-tier-pick-model-btn'));
        mockModelPickerProps?.onSelect?.(LITE_LOCAL_MODEL_ID);
        await Promise.resolve();
      });

      expect(getByText('AGI Lite')).toBeTruthy();
      expect(getByText('Download AGI Lite')).toBeTruthy();
    });
  });

  describe('testID coverage (Detox acceptance gates)', () => {
    const heroIds = [
      'onboarding-root',
      'onboarding-hero-screen',
      'hero-wordmark',
      'hero-tagline',
      'hero-start-chatting-btn',
      'hero-footer',
    ];

    it.each(heroIds)('testID "%s" exists on hero screen', (id) => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId(id)).toBeTruthy();
    });
  });
});
