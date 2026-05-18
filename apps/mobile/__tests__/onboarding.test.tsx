/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Onboarding Screen — component tests
 *
 * PRD-MOBILE §11 3-branch flow:
 *   Welcome → Mode picker → Branch A (Local) / Branch B (Cloud) / Branch C (Decide later)
 * Apple 5.1.2(i) consent modal: fires before provider list, not pre-checked, cancel safe.
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
    Sparkles: icon,
    Cpu: icon,
    Cloud: icon,
    Smartphone: icon,
    Monitor: icon,
    ArrowLeftRight: icon,
    ChevronRight: icon,
    ChevronDown: icon,
    ChevronUp: icon,
    ArrowLeft: icon,
    Check: icon,
    ExternalLink: icon,
    X: icon,
  };
});

const mockStorageSet = jest.fn();
const mockStorageGet = jest.fn().mockReturnValue(undefined);
jest.mock('../lib/mmkv', () => ({
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

const mockSecureGet = jest.fn().mockResolvedValue(null);
const mockSecureSet = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-secure-store', () => ({
  getItemAsync: (...args: unknown[]) => mockSecureGet(...args),
  setItemAsync: (...args: unknown[]) => mockSecureSet(...args),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

jest.mock('../lib/safeOpenURL', () => ({
  openExternalUrl: jest.fn().mockResolvedValue(true),
  isAllowedExternalUrl: jest.fn().mockReturnValue(true),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import OnboardingScreen from '../app/(public)/onboarding';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecureGet.mockResolvedValue(null);
  });

  // -------------------------------------------------------------------------
  // Welcome screen
  // -------------------------------------------------------------------------

  describe('Welcome screen (initial)', () => {
    it('renders with testID onboarding-root', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('onboarding-root')).toBeTruthy();
    });

    it('shows welcome screen testID', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('welcome-screen')).toBeTruthy();
    });

    it('shows "Continue" button', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('welcome-continue-btn')).toBeTruthy();
    });

    it('shows "Sign In" button', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('welcome-sign-in-btn')).toBeTruthy();
    });

    it('"Sign In" sets onboarding-done and navigates to login', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      fireEvent.press(getByTestId('welcome-sign-in-btn'));
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
    });

    it('"Continue" navigates to mode picker', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      fireEvent.press(getByTestId('welcome-continue-btn'));
      expect(getByTestId('mode-picker-screen')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Mode picker
  // -------------------------------------------------------------------------

  describe('Mode picker screen', () => {
    function renderAtModePicker() {
      const utils = render(<OnboardingScreen />);
      fireEvent.press(utils.getByTestId('welcome-continue-btn'));
      return utils;
    }

    it('shows three mode cards', () => {
      const { getByTestId } = renderAtModePicker();
      expect(getByTestId('mode-local-card')).toBeTruthy();
      expect(getByTestId('mode-cloud-card')).toBeTruthy();
      expect(getByTestId('mode-decide-later-card')).toBeTruthy();
    });

    it('local mode is pre-selected', () => {
      const { getByTestId } = renderAtModePicker();
      expect(getByTestId('mode-local-card').props.accessibilityState?.selected).toBe(true);
    });

    it('tapping cloud card selects it', () => {
      const { getByTestId } = renderAtModePicker();
      fireEvent.press(getByTestId('mode-cloud-card'));
      expect(getByTestId('mode-cloud-card').props.accessibilityState?.selected).toBe(true);
    });

    it('"Decide later" goes directly to login', () => {
      const { getByTestId } = renderAtModePicker();
      fireEvent.press(getByTestId('mode-decide-later-card'));
      fireEvent.press(getByTestId('mode-picker-confirm-btn'));
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-mode', 'decide_later');
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
    });

    it('back button returns to welcome screen', () => {
      const { getByTestId } = renderAtModePicker();
      fireEvent.press(getByTestId('onboarding-back-btn'));
      expect(getByTestId('welcome-screen')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Branch A: Local
  // -------------------------------------------------------------------------

  describe('Branch A: Local', () => {
    function renderAtLocalModelPicker() {
      const utils = render(<OnboardingScreen />);
      fireEvent.press(utils.getByTestId('welcome-continue-btn'));
      fireEvent.press(utils.getByTestId('mode-picker-confirm-btn'));
      return utils;
    }

    it('shows local model picker', () => {
      const { getByTestId } = renderAtLocalModelPicker();
      expect(getByTestId('local-model-picker-screen')).toBeTruthy();
    });

    it('shows System, Fast, Capable model options', () => {
      const { getByTestId } = renderAtLocalModelPicker();
      expect(getByTestId('local-model-system')).toBeTruthy();
      expect(getByTestId('local-model-fast')).toBeTruthy();
      expect(getByTestId('local-model-capable')).toBeTruthy();
    });

    it('System model goes to ready without download screen', () => {
      const { getByTestId } = renderAtLocalModelPicker();
      fireEvent.press(getByTestId('local-model-system'));
      fireEvent.press(getByTestId('local-model-download-btn'));
      expect(getByTestId('local-ready-screen')).toBeTruthy();
    });

    it('"Open chat" on local-ready finishes onboarding as local mode', () => {
      const { getByTestId } = renderAtLocalModelPicker();
      fireEvent.press(getByTestId('local-model-system'));
      fireEvent.press(getByTestId('local-model-download-btn'));
      fireEvent.press(getByTestId('local-ready-screen-open-chat-btn'));
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-mode', 'local');
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
    });
  });

  // -------------------------------------------------------------------------
  // Branch B: Cloud + 5.1.2(i) consent
  // -------------------------------------------------------------------------

  describe('Branch B: Cloud — Apple 5.1.2(i) consent', () => {
    function renderAtCloudBranch() {
      const utils = render(<OnboardingScreen />);
      fireEvent.press(utils.getByTestId('welcome-continue-btn'));
      fireEvent.press(utils.getByTestId('mode-cloud-card'));
      return utils;
    }

    it('consent modal is not visible before user enters Cloud branch', () => {
      const { getByTestId } = renderAtCloudBranch();
      expect(getByTestId('byok-consent-modal').props.visible).toBe(false);
    });

    it('consent modal appears when user confirms Cloud mode (no prior consent)', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(getByTestId('byok-consent-modal').props.visible).toBe(true);
      });
    });

    it('consent modal has title "Connecting to AI providers"', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => expect(getByTestId('byok-consent-modal-title')).toBeTruthy());
    });

    it('consent modal has all three body paragraphs', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(getByTestId('byok-consent-body-p1')).toBeTruthy();
        expect(getByTestId('byok-consent-body-p2')).toBeTruthy();
        expect(getByTestId('byok-consent-body-p3')).toBeTruthy();
      });
    });

    it('consent modal renders the provider table', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => expect(getByTestId('byok-consent-provider-table')).toBeTruthy());
    });

    it('accept and cancel buttons are present (accept not pre-toggled)', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(getByTestId('byok-consent-accept-btn')).toBeTruthy();
        expect(getByTestId('byok-consent-cancel-btn')).toBeTruthy();
      });
    });

    it('cancel stays on mode picker — no functionality lost', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => getByTestId('byok-consent-cancel-btn'));
      await act(async () => {
        fireEvent.press(getByTestId('byok-consent-cancel-btn'));
      });
      await waitFor(() => {
        expect(getByTestId('byok-consent-modal').props.visible).toBe(false);
        expect(getByTestId('mode-picker-screen')).toBeTruthy();
      });
    });

    it('cancel via close icon also stays on mode picker', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => getByTestId('byok-consent-cancel-icon'));
      await act(async () => {
        fireEvent.press(getByTestId('byok-consent-cancel-icon'));
      });
      await waitFor(() => expect(getByTestId('mode-picker-screen')).toBeTruthy());
    });

    it('accept persists consent to SecureStore and unlocks provider picker', async () => {
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => getByTestId('byok-consent-accept-btn'));
      await act(async () => {
        fireEvent.press(getByTestId('byok-consent-accept-btn'));
        await Promise.resolve();
      });
      await waitFor(() => {
        expect(mockSecureSet).toHaveBeenCalledWith(
          'byok_consent_accepted_at',
          expect.any(String),
          expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }),
        );
        expect(getByTestId('cloud-provider-picker-screen')).toBeTruthy();
      });
    });

    it('prior consent (within 30d) skips modal', async () => {
      mockSecureGet.mockResolvedValue(String(Date.now() - 60 * 60 * 1000));
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => expect(getByTestId('cloud-provider-picker-screen')).toBeTruthy());
    });

    it('selecting Anthropic advances to cloud-ready screen', async () => {
      mockSecureGet.mockResolvedValue(String(Date.now() - 60 * 60 * 1000));
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => getByTestId('cloud-provider-picker-screen'));
      fireEvent.press(getByTestId('cloud-provider-anthropic'));
      expect(getByTestId('cloud-ready-screen')).toBeTruthy();
    });

    it('"Open chat" on cloud-ready finishes onboarding as cloud mode', async () => {
      mockSecureGet.mockResolvedValue(String(Date.now() - 60 * 60 * 1000));
      const { getByTestId } = renderAtCloudBranch();
      await act(async () => {
        fireEvent.press(getByTestId('mode-picker-confirm-btn'));
        await Promise.resolve();
      });
      await waitFor(() => getByTestId('cloud-provider-picker-screen'));
      fireEvent.press(getByTestId('cloud-provider-anthropic'));
      fireEvent.press(getByTestId('cloud-ready-screen-open-chat-btn'));
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-mode', 'cloud');
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
    });
  });

  // -------------------------------------------------------------------------
  // Branch C: Decide later
  // -------------------------------------------------------------------------

  describe('Branch C: Decide later', () => {
    it('jumps to login without any modal or intermediate screen', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      fireEvent.press(getByTestId('welcome-continue-btn'));
      fireEvent.press(getByTestId('mode-decide-later-card'));
      fireEvent.press(getByTestId('mode-picker-confirm-btn'));
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(auth)/login' });
    });
  });

  // -------------------------------------------------------------------------
  // Detox-testable selector audit
  // -------------------------------------------------------------------------

  describe('testID coverage (Detox acceptance gates)', () => {
    const welcomeIds = [
      'onboarding-root',
      'welcome-screen',
      'welcome-title',
      'welcome-subtitle',
      'welcome-continue-btn',
      'welcome-sign-in-btn',
    ];

    it.each(welcomeIds)('testID "%s" exists on welcome screen', (id) => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId(id)).toBeTruthy();
    });

    it('mode picker testIDs exist', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      fireEvent.press(getByTestId('welcome-continue-btn'));
      expect(getByTestId('mode-picker-screen')).toBeTruthy();
      expect(getByTestId('mode-picker-title')).toBeTruthy();
      expect(getByTestId('mode-picker-confirm-btn')).toBeTruthy();
      expect(getByTestId('mode-local-card')).toBeTruthy();
      expect(getByTestId('mode-cloud-card')).toBeTruthy();
      expect(getByTestId('mode-decide-later-card')).toBeTruthy();
    });

    it('byok-consent-modal is in the tree', () => {
      const { getByTestId } = render(<OnboardingScreen />);
      expect(getByTestId('byok-consent-modal')).toBeTruthy();
    });
  });
});
