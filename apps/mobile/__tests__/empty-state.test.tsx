/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ChatEmptyState — component tests
 *
 * Covers:
 *   - Shows "Ask anything" headline when no display name
 *   - Shows personalized "Hi, {name}" when name is set
 *   - Shows "How can I help you?" subtitle only when no display name
 *   - Shows 3 prompt chip buttons (Code, Write, Research)
 *   - Tapping a chip calls onSelectPrompt with correct prompt text
 *   - Does NOT show suggestion-style cards or multi-step wizard content
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
  return { Monitor: icon, X: icon, Code: icon, PenLine: icon, Search: icon };
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

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const MockSafeAreaView = (props: { children: React.ReactNode }) => <View>{props.children}</View>;
  MockSafeAreaView.displayName = 'SafeAreaView';
  return {
    SafeAreaView: MockSafeAreaView,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

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

  describe('headline', () => {
    it('shows "Ask anything" when no display name is set', () => {
      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Ask anything')).toBeTruthy();
    });

    it('shows personalized greeting when nickname is set', () => {
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
      expect(getByText('Hi, Alex')).toBeTruthy();
    });

    it('uses first name from fullName when nickname is empty', () => {
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
      expect(getByText('Hi, Jane')).toBeTruthy();
    });
  });

  describe('subtitle', () => {
    it('shows "How can I help you?" when no display name', () => {
      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('How can I help you?')).toBeTruthy();
    });

    it('does NOT show subtitle when display name is set', () => {
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

      const { queryByText } = render(<ChatEmptyState />);
      expect(queryByText('How can I help you?')).toBeNull();
    });
  });

  describe('prompt chips', () => {
    it('renders 3 prompt chip buttons', () => {
      const { getByLabelText } = render(<ChatEmptyState />);
      expect(getByLabelText('Code prompt')).toBeTruthy();
      expect(getByLabelText('Write prompt')).toBeTruthy();
      expect(getByLabelText('Research prompt')).toBeTruthy();
    });

    it('calls onSelectPrompt with correct text when Code chip is tapped', () => {
      const onSelectPrompt = jest.fn();
      const { getByLabelText } = render(<ChatEmptyState onSelectPrompt={onSelectPrompt} />);
      fireEvent.press(getByLabelText('Code prompt'));
      expect(onSelectPrompt).toHaveBeenCalledWith('Help me write a function that...');
    });

    it('calls onSelectPrompt with correct text when Write chip is tapped', () => {
      const onSelectPrompt = jest.fn();
      const { getByLabelText } = render(<ChatEmptyState onSelectPrompt={onSelectPrompt} />);
      fireEvent.press(getByLabelText('Write prompt'));
      expect(onSelectPrompt).toHaveBeenCalledWith('Write a professional email about...');
    });

    it('does not crash when onSelectPrompt is not provided', () => {
      const { getByLabelText } = render(<ChatEmptyState />);
      expect(() => fireEvent.press(getByLabelText('Code prompt'))).not.toThrow();
    });
  });

  it('does NOT show multi-step wizard content', () => {
    const { queryByText } = render(<ChatEmptyState />);
    expect(queryByText(/suggest/i)).toBeNull();
    expect(queryByText(/try asking/i)).toBeNull();
    expect(queryByText(/get started with/i)).toBeNull();
    expect(queryByText(/start a conversation/i)).toBeNull();
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

      expect(queryByText('Pair your desktop?')).toBeTruthy();
      fireEvent.press(getByLabelText('Dismiss pairing banner'));
      expect(queryByText('Pair your desktop?')).toBeNull();
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
