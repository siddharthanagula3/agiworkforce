/* eslint-disable @typescript-eslint/no-require-imports */

import { Alert, StyleSheet } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PRODUCT_BRAND } from '@agiworkforce/types';

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
    Clock: icon,
    Cpu: icon,
    Lightbulb: icon,
    Plane: icon,
    Settings: icon,
    Shield: icon,
  };
});

const mockStoredValues = new Map<string, string>();
const mockStorageSet = jest.fn((key: unknown, value: unknown) => {
  mockStoredValues.set(String(key), String(value));
});
const mockStorageGet = jest.fn((key: unknown) => mockStoredValues.get(String(key)));
const mockStorageDelete = jest.fn((key: unknown) => {
  mockStoredValues.delete(String(key));
});
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
const mockComposeShortFirstRunDisclosure = jest.fn().mockReturnValue({
  title: 'Before you continue',
  summary: 'This app processes your data on-device.',
  article50_1: 'Article 50(1) of the EU AI Act...',
  sourceUrl: 'https://eur-lex.europa.eu',
  acceptLabel: 'Continue',
  declineLabel: 'Not now',
  detailsLabel: 'Why we show this',
  thirdPartyAiProviders: [],
  offersManagedCloud: false,
  chineseHqProviderRows: [
    { id: 'deepseek', displayName: 'DeepSeek (China)', defaultEnabled: false },
    { id: 'moonshot', displayName: 'Moonshot AI / Kimi (China)', defaultEnabled: false },
  ],
});
const mockRecordDisclosureAcceptance = jest.fn().mockImplementation(async (args) => {
  args.ledger.write({
    version: 1,
    acceptedAt: new Date().toISOString(),
    surface: args.surface,
    disclosureCopyHash: 'fixture-disclosure-hash',
    managedCloudAccepted: args.managedCloudAccepted,
    chineseHqProvidersAccepted: [...args.chineseHqProvidersAccepted],
  });
});
jest.mock('@agiworkforce/compliance', () => ({
  ...jest.requireActual('@agiworkforce/compliance'),
  composeShortFirstRunDisclosure: (...args: unknown[]) =>
    mockComposeShortFirstRunDisclosure(...args),
  isDisclosureSatisfied: (...args: unknown[]) => mockIsDisclosureSatisfied(...args),
  recordDisclosureAcceptance: (...args: unknown[]) => mockRecordDisclosureAcceptance(...args),
  DISCLOSURE_LEDGER_KEY: 'disclosure_ledger',
}));

const mockOpenInAppBrowser = jest.fn().mockResolvedValue(true);
jest.mock('../lib/safeOpenURL', () => ({
  openInAppBrowser: (...args: unknown[]) => mockOpenInAppBrowser(...args),
}));

const mockDetectCapabilities = jest.fn(() => new Promise(() => {}));
const mockGetInstalledModel = jest.fn().mockResolvedValue(null);
const DEFAULT_LOCAL_MODEL_ID = 'fixture-default-local-model';
const LITE_LOCAL_MODEL_ID = 'fixture-lite-local-model';

jest.mock('../storage/installedModels', () => ({
  getInstalledModel: (...args: unknown[]) => mockGetInstalledModel(...args),
  recordInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

// Declared as a hoisted function so the `@agiworkforce/local-llm` factory can
// build them: the model store is now imported at onboarding module scope and
// reads the catalogue during that import, before any `const` has run.
function mockMakeLocalModelFixtures() {
  const base = {
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
  return [
    base,
    {
      ...base,
      id: LITE_LOCAL_MODEL_ID,
      displayName: 'AGI Lite',
      family: 'fixture-lite-family',
      paramCountB: 1,
      fileSizeBytes: 600_000_000,
      role: 'lite-mode',
    },
  ];
}

const [mockDefaultLocalModel, mockLiteLocalModel] = mockMakeLocalModelFixtures();

jest.mock('@agiworkforce/local-llm', () => ({
  detectCapabilities: (...args: unknown[]) => mockDetectCapabilities(...args),
  getDefaultModel: jest.fn(() => mockMakeLocalModelFixtures()[0]),
  getModelById: jest.fn((id: string) =>
    mockMakeLocalModelFixtures().find((model) => model.id === id),
  ),
  getShippableModels: jest.fn(() => mockMakeLocalModelFixtures()),
  getSystemModelForTier1Runtime: jest.fn(() => undefined),
  hasRunnableGgufArtifacts: jest.fn(() => true),
  tier2LoadModel: jest.fn().mockResolvedValue(undefined),
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
  PRIVACY_POLICY_URL,
  TERMS_OF_USE_URL,
} from '../src/features/onboarding/components/FirstRunDisclosureModal';
import { webContentPageUrl } from '../src/platform/webContentPage';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import * as personalizationFieldLimits from '../src/features/settings/personalization/personalizationFieldLimits';
import { CLOUD_PROVIDER_CONSENT_KEY } from '../services/providerConsent';
import {
  CLOUD_CHAT_POST_AUTH_INTENT,
  POST_AUTH_INTENT_PARAM,
} from '../src/features/auth/services/postAuthIntent';

async function skipAboutYou(getByTestId: (id: string) => unknown) {
  await waitFor(() => expect(getByTestId('onboarding-about-you-screen')).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByTestId('about-you-skip-btn') as never);
    await Promise.resolve();
  });
}

describe('Onboarding', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockStoredValues.clear();
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

    it('shows the logo symbol alone, named for screen readers, with no wordmark', () => {
      const { getByTestId, getByLabelText, queryByTestId, queryByText } = render(
        <OnboardingScreen />,
      );
      expect(getByTestId('hero-brand-mark')).toBeTruthy();
      expect(getByLabelText(PRODUCT_BRAND)).toBeTruthy();
      expect(queryByTestId('hero-wordmark')).toBeNull();
      expect(queryByText('AGI')).toBeNull();
    });

    it('makes the tagline the heading of the hero', () => {
      const { getByRole } = render(<OnboardingScreen />);
      expect(getByRole('header', { name: 'Your AI workspace for everyday work.' })).toBeTruthy();
    });

    it('shows the polished hero tagline', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('Your AI workspace for everyday work.')).toBeTruthy();
    });

    it('shows hero tagline testID', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-tagline')).toBeTruthy();
    });

    it('shows locked footer copy', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('hero-footer')).toBeTruthy();
    });

    it('states the settings, history and accuracy notices as plain rows', () => {
      const { getByTestId, getByText } = render(<OnboardingScreen />);
      expect(
        getByText("You're in control of your settings and can change them anytime."),
      ).toBeTruthy();
      expect(
        getByText(
          'Local chats stay on this phone. AGI Cloud chats are saved to your account, and you can delete them.',
        ),
      ).toBeTruthy();
      expect(getByText('AI can make mistakes, so check important information.')).toBeTruthy();
      for (const id of ['settings', 'history', 'mistakes']) {
        expect(getByTestId(`hero-notice-${id}`)).toBeTruthy();
      }
    });

    it('sets the notice text at 17 points and keeps it left-aligned', () => {
      const { getByText } = render(<OnboardingScreen />);
      const style = StyleSheet.flatten(
        getByText('AI can make mistakes, so check important information.').props.style,
      );
      expect(style.fontSize).toBe(17);
      expect(style.textAlign).toBe('left');
    });

    it('shows the agreement line above the button with both links', () => {
      const { getByTestId, getByRole } = render(<OnboardingScreen />);
      expect(getByTestId('hero-legal-line')).toHaveTextContent(
        'By continuing you agree to the Terms and Privacy Policy',
      );
      expect(getByRole('link', { name: 'Read the terms of use' })).toBeTruthy();
      expect(getByRole('link', { name: 'Read the privacy policy' })).toBeTruthy();
    });

    it('draws the two links at the size of the sentence around them', () => {
      const { getByTestId, getByText } = render(<OnboardingScreen />);
      for (const id of ['hero-terms-link', 'hero-privacy-link']) {
        const link = getByTestId(id);
        expect(link.props.className ?? '').not.toMatch(/\btext-(xs|sm)\b/);
        const fontSize = StyleSheet.flatten(link.props.style)?.fontSize;
        expect(fontSize === undefined || fontSize >= 16).toBe(true);
      }
      expect(getByText('Terms')).toBe(getByTestId('hero-terms-link'));
      expect(getByText('Privacy Policy')).toBe(getByTestId('hero-privacy-link'));
    });

    it('opens the Terms and the Privacy Policy without starting onboarding', () => {
      const { getByTestId, queryByTestId } = render(<OnboardingScreen />);
      fireEvent.press(getByTestId('hero-terms-link'));
      expect(mockOpenInAppBrowser).toHaveBeenLastCalledWith(webContentPageUrl(TERMS_OF_USE_URL));
      fireEvent.press(getByTestId('hero-privacy-link'));
      expect(mockOpenInAppBrowser).toHaveBeenLastCalledWith(webContentPageUrl(PRIVACY_POLICY_URL));
      expect(mockOpenInAppBrowser).toHaveBeenCalledTimes(2);
      expect(queryByTestId('onboarding-about-you-screen')).toBeNull();
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
      await skipAboutYou(getByTestId);

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

    it('accepting the disclosure advances through about-you to the device-tier screen', async () => {
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
      await skipAboutYou(getByTestId);
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

    it('records an empty China-HQ opt-in list when the toggles are left alone', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-accept-btn'));
        await Promise.resolve();
      });
      expect(mockRecordDisclosureAcceptance).toHaveBeenCalledWith(
        expect.objectContaining({ chineseHqProvidersAccepted: [] }),
      );
    });

    it('records no Cloud acceptance for a notice that never asked about Cloud', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-accept-btn'));
        await Promise.resolve();
      });
      expect(mockRecordDisclosureAcceptance).toHaveBeenCalledWith(
        expect.objectContaining({ managedCloudAccepted: false }),
      );
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockStorageSet).not.toHaveBeenCalledWith(
        CLOUD_PROVIDER_CONSENT_KEY,
        expect.anything(),
      );
      alertSpy.mockRestore();
    });

    it('threads a toggled-on China-HQ provider into the disclosure record', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      await act(async () => {
        fireEvent(getByTestId('disclosure-provider-toggle-deepseek'), 'valueChange', true);
        await Promise.resolve();
      });
      await act(async () => {
        fireEvent.press(getByTestId('disclosure-accept-btn'));
        await Promise.resolve();
      });
      expect(mockRecordDisclosureAcceptance).toHaveBeenCalledWith(
        expect.objectContaining({ chineseHqProvidersAccepted: ['deepseek'] }),
      );
    });

    it('states what AGI Cloud collects before the user can accept', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId, getByText } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(getByTestId('disclosure-privacy-card')).toBeTruthy();
      expect(getByText(/the messages you send/)).toBeTruthy();
      expect(getByText(/device identifier/)).toBeTruthy();
      expect(getByText(/your chats stay on this device/)).toBeTruthy();
    });

    it('links the privacy policy and the India DPDP notice from the disclosure', async () => {
      mockIsDisclosureSatisfied.mockReturnValue(false);
      const { getByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });

      await act(async () => {
        fireEvent.press(getByTestId('disclosure-privacy-policy-link'));
        await Promise.resolve();
      });
      expect(mockOpenInAppBrowser).toHaveBeenCalledWith(
        'https://agiworkforce.com/privacy?from=mobile',
      );

      await act(async () => {
        fireEvent.press(getByTestId('disclosure-dpdp-notice-link'));
        await Promise.resolve();
      });
      expect(mockOpenInAppBrowser).toHaveBeenCalledWith(
        'https://agiworkforce.com/privacy/india?from=mobile',
      );
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
      const { getByTestId, queryByTestId } = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(queryByTestId('disclosure-accept-btn')).toBeNull();
      expect(getByTestId('onboarding-about-you-screen')).toBeTruthy();
    });
  });

  describe('About-you step', () => {
    const initialLocalSettings = useLocalSettingsStore.getState();

    beforeEach(() => {
      useLocalSettingsStore.setState(initialLocalSettings, true);
    });

    async function renderAtAboutYou() {
      mockIsDisclosureSatisfied.mockReturnValue(true);
      const utils = render(<OnboardingScreen />);
      await act(async () => {
        fireEvent.press(utils.getByTestId('hero-start-chatting-btn'));
        await Promise.resolve();
      });
      expect(utils.getByTestId('onboarding-about-you-screen')).toBeTruthy();
      return utils;
    }

    it('saves the name and work typed here to personalization and moves on', async () => {
      const { getByLabelText, getByTestId } = await renderAtAboutYou();

      fireEvent.changeText(getByLabelText('Your name'), '  Sam  ');
      fireEvent.changeText(getByLabelText('What best describes your work?'), 'product design');
      await act(async () => {
        fireEvent.press(getByTestId('about-you-continue-btn'));
        await Promise.resolve();
      });

      expect(useLocalSettingsStore.getState().personalization).toEqual(
        expect.objectContaining({ nickname: 'Sam', occupation: 'product design' }),
      );
      expect(getByTestId('onboarding-device-tier-screen')).toBeTruthy();
    });

    it('does not continue without a name', async () => {
      const { getByTestId, queryByTestId } = await renderAtAboutYou();

      await act(async () => {
        fireEvent.press(getByTestId('about-you-continue-btn'));
        await Promise.resolve();
      });

      expect(queryByTestId('onboarding-device-tier-screen')).toBeNull();
      expect(getByTestId('onboarding-about-you-screen')).toBeTruthy();
    });

    it('stops the name and work at the lengths Personalization keeps', async () => {
      const limits = personalizationFieldLimits as Record<
        keyof typeof personalizationFieldLimits,
        number
      >;
      const replaced = [
        jest.replaceProperty(limits, 'PERSONALIZATION_NICKNAME_MAX_LENGTH', 7),
        jest.replaceProperty(limits, 'PERSONALIZATION_OCCUPATION_MAX_LENGTH', 9),
      ];
      try {
        const { getByLabelText } = await renderAtAboutYou();

        expect(getByLabelText('Your name').props.maxLength).toBe(7);
        expect(getByLabelText('What best describes your work?').props.maxLength).toBe(9);
      } finally {
        for (const property of replaced) property.restore();
      }
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
      await skipAboutYou(utils.getByTestId);
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
      expect(getByText('1 GB download · Wi-Fi recommended')).toBeTruthy();
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
      'hero-brand-mark',
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
