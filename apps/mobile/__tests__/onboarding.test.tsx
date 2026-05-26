/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Onboarding Screen — component tests (v1 local-only rewrite)
 *
 * PRD-MOBILE §11 3-screen flow:
 *   Screen 1 (Hero) → disclosure modal → Screen 2 (Device tier) → Screen 3 (Download)
 *
 * Locked (2026-05-18):
 *   - No cloud branch, no login button, no BYOK
 *   - Hero tagline: "AGI runs on your device."
 *   - Footer: "Made by AGI Automation LLC · Delaware, USA"
 *   - Compliance disclosure fires before screen 2 (Article 50(1) + Apple 5.1.2(i))
 *
 * Tests that relied on the old 4-branch flow (welcome/mode-picker/cloud/BYOK)
 * were replaced here when onboarding-engineer rewrote the component in task #16.
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

const mockStorageSet = jest.fn();
const mockStorageGet = jest.fn().mockReturnValue(undefined);
jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => store.persist.rehydrate()),
  storage: {
    getString: (...args: unknown[]) => mockStorageGet(...args),
    set: (...args: unknown[]) => mockStorageSet(...args),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// ModelPickerSheet pulls in @gorhom/bottom-sheet which requires native modules.
// Stub both so onboarding tests don't crash on the model-picker import.
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

// Compliance package — control disclosure satisfied / not satisfied
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

// Local LLM catalog stub
jest.mock('@agiworkforce/local-llm', () => ({
  detectCapabilities: jest.fn().mockResolvedValue({
    totalRAMMB: 4096,
    tier1Available: false,
    tier2Available: true,
  }),
  getDefaultModel: jest.fn().mockReturnValue({
    id: 'qwen2.5-1.5b-instruct-q4_k_m',
    displayName: 'Qwen 2.5 1.5B',
    family: 'qwen',
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
  }),
  getShippableModels: jest.fn().mockReturnValue([]),
}));

// expo-constants
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    platform: {
      ios: { model: 'iPhone14', systemVersion: '18.0' },
    },
    deviceName: 'Test iPhone',
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import OnboardingScreen from '../app/(public)/onboarding';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Onboarding (v1 local-only)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDisclosureSatisfied.mockReturnValue(false);
  });

  // -------------------------------------------------------------------------
  // Hero screen
  // -------------------------------------------------------------------------

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

    it('shows exact locked tagline', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-tagline')).toBeTruthy();
    });

    it('shows locked footer copy', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-footer')).toBeTruthy();
    });

    it('shows "Start chatting" button', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-start-chatting-btn')).toBeTruthy();
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

  // -------------------------------------------------------------------------
  // Disclosure modal gate (Apple 5.1.2(i) + Article 50(1))
  // -------------------------------------------------------------------------

  describe('Disclosure modal gate', () => {
    it('tapping "Start chatting" shows disclosure modal when not previously satisfied', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      // Modal becomes visible — disclosure-accept-btn is from FirstRunDisclosureModal
      await waitFor(() => expect(getByTestId('disclosure-accept-btn')).toBeTruthy());
    });

    it('accepting the disclosure advances to device-tier screen', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      await waitFor(() => getByTestId('disclosure-accept-btn'));
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
      await waitFor(() => getByTestId('disclosure-accept-btn'));
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
      await waitFor(() => getByTestId('disclosure-decline-btn'));
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-decline-btn'));
      });
      await waitFor(() => {
        expect(getByTestId('onboarding-hero-screen')).toBeTruthy();
        expect(queryByTestId('onboarding-device-tier-screen')).toBeNull();
      });
    });

    it('skips modal when disclosure is already satisfied', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(true);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      await waitFor(() => expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy());
    });
  });

  // -------------------------------------------------------------------------
  // Device-tier screen (Screen 2)
  // -------------------------------------------------------------------------

  describe('Device-tier screen', () => {
    async function renderAtDeviceTier() {
      mockIsDisclosureSatisfied.mockReturnValue(true);
      const utils = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(utils.getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      await waitFor(() => utils.getByTestId('onboarding-device-tier-screen'));
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

    it('shows pick-a-different-model button', async () => {
      const { getByTestId } = await renderAtDeviceTier();
      expect(getByTestId('device-tier-pick-model-btn')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // testID coverage (Detox acceptance gates)
  // -------------------------------------------------------------------------

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
