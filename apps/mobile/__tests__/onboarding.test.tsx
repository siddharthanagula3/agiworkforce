/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Onboarding Screen — component tests
 *
 * Covers:
 *   - Renders 3 screens (not 5)
 *   - Screen 1: shows "AGI Workforce" + tagline + "Get Started" + "Sign In"
 *   - Screen 2: shows "Every AI model, one app"
 *   - Screen 3: shows "Control your desktop from your phone"
 *   - "Get Started" on last screen navigates to auth
 */

import { render, fireEvent } from '@testing-library/react-native';

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
  SafeAreaView: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return { Sparkles: icon, Cpu: icon, Smartphone: icon, Monitor: icon, ArrowLeftRight: icon };
});

const mockStorageSet = jest.fn();
jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: (...args: unknown[]) => mockStorageSet(...args),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import OnboardingScreen from '../app/onboarding';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Onboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Screen 1 (initial)', () => {
    it('shows "AGI Workforce" title', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('AGI Workforce')).toBeTruthy();
    });

    it('shows tagline subtitle', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('One app, every model, total control.')).toBeTruthy();
    });

    it('shows "Get Started" button on first slide', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('Get Started')).toBeTruthy();
    });

    it('shows "Sign In" button on first slide', () => {
      const { getByText } = render(<OnboardingScreen />);
      expect(getByText('Sign In')).toBeTruthy();
    });

    it('tapping "Sign In" sets onboarding-done and navigates to login', () => {
      const { getByLabelText } = render(<OnboardingScreen />);

      fireEvent.press(getByLabelText('Sign in to existing account'));

      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  describe('Screen 2 (after first tap)', () => {
    it('shows "Every AI model, one app" after tapping Get Started', () => {
      const { getByText } = render(<OnboardingScreen />);

      // Tap "Get Started" on first slide to go to slide 2
      fireEvent.press(getByText('Get Started'));

      expect(getByText('Every AI model, one app')).toBeTruthy();
    });

    it('shows the provider description on screen 2', () => {
      const { getByText } = render(<OnboardingScreen />);

      fireEvent.press(getByText('Get Started'));

      expect(getByText('Claude, GPT, Gemini, Grok, DeepSeek & more. 9+ providers.')).toBeTruthy();
    });

    it('shows "Next" button on middle slide', () => {
      const { getByText } = render(<OnboardingScreen />);

      fireEvent.press(getByText('Get Started'));

      expect(getByText('Next')).toBeTruthy();
    });

    it('does NOT show "Sign In" on screen 2', () => {
      const { getByText, queryByText } = render(<OnboardingScreen />);

      fireEvent.press(getByText('Get Started'));

      expect(queryByText('Sign In')).toBeNull();
    });
  });

  describe('Screen 3 (last slide)', () => {
    it('shows "Control your desktop from your phone"', () => {
      const { getByText } = render(<OnboardingScreen />);

      // Navigate to slide 2 then slide 3
      fireEvent.press(getByText('Get Started'));
      fireEvent.press(getByText('Next'));

      expect(getByText('Control your desktop from your phone')).toBeTruthy();
    });

    it('shows desktop control description', () => {
      const { getByText } = render(<OnboardingScreen />);

      fireEvent.press(getByText('Get Started'));
      fireEvent.press(getByText('Next'));

      expect(
        getByText('Assign tasks, approve actions, get results. All from your pocket.'),
      ).toBeTruthy();
    });

    it('shows "Get Started" on last slide (not "Next")', () => {
      const { getByText, queryByText } = render(<OnboardingScreen />);

      fireEvent.press(getByText('Get Started'));
      fireEvent.press(getByText('Next'));

      expect(getByText('Get Started')).toBeTruthy();
      expect(queryByText('Next')).toBeNull();
    });

    it('"Get Started" on last screen sets onboarding-done and navigates to login', () => {
      const { getByText } = render(<OnboardingScreen />);

      // Navigate to last slide
      fireEvent.press(getByText('Get Started'));
      fireEvent.press(getByText('Next'));

      // Tap "Get Started" on last slide
      fireEvent.press(getByText('Get Started'));

      expect(mockStorageSet).toHaveBeenCalledWith('onboarding-done', 'true');
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('has exactly 3 slides total (navigating through all)', () => {
    const { getByText } = render(<OnboardingScreen />);

    // Slide 1
    expect(getByText('AGI Workforce')).toBeTruthy();

    // Slide 2
    fireEvent.press(getByText('Get Started'));
    expect(getByText('Every AI model, one app')).toBeTruthy();

    // Slide 3
    fireEvent.press(getByText('Next'));
    expect(getByText('Control your desktop from your phone')).toBeTruthy();

    // Tapping "Get Started" on slide 3 finishes onboarding (no slide 4)
    fireEvent.press(getByText('Get Started'));
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });
});
