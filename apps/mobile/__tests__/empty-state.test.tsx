/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ChatEmptyState — component tests
 *
 * Covers:
 *   - Shows time-aware greeting (morning/afternoon/evening)
 *   - Shows "How can I help you?" subtitle
 *   - Does NOT show suggestion chips
 *   - Shows pairing banner on first launch
 *   - Pairing banner is dismissible
 */

import { render, fireEvent } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — must be before component import
// ---------------------------------------------------------------------------

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
    FadeInDown: { duration: () => ({ delay: () => ({}) }) },
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return { Sparkles: icon, Monitor: icon, X: icon };
});

const mockStorageGetString = jest.fn().mockReturnValue(undefined);
const mockStorageSet = jest.fn();

jest.mock('../lib/mmkv', () => ({
  storage: {
    getString: (...args: unknown[]) => mockStorageGetString(...args),
    set: (...args: unknown[]) => mockStorageSet(...args),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { ChatEmptyState } from '../components/chat/ChatEmptyState';
import { useSettingsStore } from '../stores/settingsStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetSettingsStore() {
  useSettingsStore.setState({
    personalization: {
      fullName: '',
      nickname: '',
      occupation: '',
      instructions: '',
      warmth: 50,
      enthusiasm: 50,
      headersLists: 50,
      emoji: 50,
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatEmptyState', () => {
  beforeEach(() => {
    resetSettingsStore();
    mockStorageGetString.mockReturnValue(undefined);
    jest.clearAllMocks();
  });

  describe('greeting', () => {
    it('shows time-aware greeting for morning (before 12)', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);

      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Good morning')).toBeTruthy();

      jest.restoreAllMocks();
    });

    it('shows time-aware greeting for afternoon (12-16)', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);

      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Good afternoon')).toBeTruthy();

      jest.restoreAllMocks();
    });

    it('shows time-aware greeting for evening (17+)', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(19);

      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Good evening')).toBeTruthy();

      jest.restoreAllMocks();
    });

    it('includes nickname in greeting when set', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(9);
      useSettingsStore.setState({
        personalization: {
          fullName: '',
          nickname: 'Alex',
          occupation: '',
          instructions: '',
          warmth: 50,
          enthusiasm: 50,
          headersLists: 50,
          emoji: 50,
        },
      });

      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Good morning, Alex')).toBeTruthy();

      jest.restoreAllMocks();
    });

    it('uses first name from fullName when nickname is empty', () => {
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
      useSettingsStore.setState({
        personalization: {
          fullName: 'Jane Smith',
          nickname: '',
          occupation: '',
          instructions: '',
          warmth: 50,
          enthusiasm: 50,
          headersLists: 50,
          emoji: 50,
        },
      });

      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Good afternoon, Jane')).toBeTruthy();

      jest.restoreAllMocks();
    });
  });

  it('shows "How can I help you?" subtitle', () => {
    const { getByText } = render(<ChatEmptyState />);
    expect(getByText('How can I help you?')).toBeTruthy();
  });

  it('does NOT show suggestion chips', () => {
    const { queryByText } = render(<ChatEmptyState />);

    // Common suggestion chip patterns that should NOT exist
    expect(queryByText(/suggest/i)).toBeNull();
    expect(queryByText(/try asking/i)).toBeNull();
    expect(queryByText(/get started with/i)).toBeNull();
  });

  describe('pairing banner', () => {
    it('shows pairing banner on first launch (no dismissal in storage)', () => {
      mockStorageGetString.mockReturnValue(undefined);

      const { getByText } = render(<ChatEmptyState showPairingBanner />);
      expect(getByText('Pair your desktop?')).toBeTruthy();
      expect(getByText('Scan QR to connect')).toBeTruthy();
    });

    it('does NOT show pairing banner when previously dismissed', () => {
      mockStorageGetString.mockReturnValue('true');

      const { queryByText } = render(<ChatEmptyState showPairingBanner />);
      expect(queryByText('Pair your desktop?')).toBeNull();
    });

    it('pairing banner is dismissible', () => {
      mockStorageGetString.mockReturnValue(undefined);

      const { getByLabelText, queryByText } = render(<ChatEmptyState showPairingBanner />);

      // Banner should be visible
      expect(queryByText('Pair your desktop?')).toBeTruthy();

      // Tap dismiss button
      fireEvent.press(getByLabelText('Dismiss pairing banner'));

      // Banner should be gone
      expect(queryByText('Pair your desktop?')).toBeNull();

      // Should persist dismissal
      expect(mockStorageSet).toHaveBeenCalledWith('dismissedDesktopPairingBanner', 'true');
    });

    it('calls onPairDesktop when pairing button is pressed', () => {
      mockStorageGetString.mockReturnValue(undefined);
      const onPairDesktop = jest.fn();

      const { getByLabelText } = render(
        <ChatEmptyState showPairingBanner onPairDesktop={onPairDesktop} />,
      );

      fireEvent.press(getByLabelText('Pair your desktop'));
      expect(onPairDesktop).toHaveBeenCalled();
    });
  });
});
