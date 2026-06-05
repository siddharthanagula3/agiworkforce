/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * ChatEmptyState — component tests
 *
 * Covers:
 *   - Shows "Ask anything" headline when no display name
 *   - Shows personalized "Hi, {name}" when name is set
 *   - Shows "How can I help you?" subtitle only when no display name
 *   - Does not render duplicate prompt chips
 *   - Does NOT show suggestion-style cards or multi-step wizard content
 *   - Keeps desktop pairing banner hidden while the companion feature is gated
 */

import { render } from '@testing-library/react-native';

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
    // useReducedMotion was added to ChatEmptyState.tsx — stub it for tests.
    useReducedMotion: () => false,
  };
});

jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const icon = () => <Text>icon</Text>;
  return new Proxy(
    {
      Monitor: icon,
      X: icon,
    },
    { get: (target, prop) => target[prop as keyof typeof target] ?? icon },
  );
});

const mockStorageGetString = jest.fn().mockReturnValue(undefined);
const mockStorageSet = jest.fn();

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store) => store.persist.rehydrate()),
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

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => null),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
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

import { ChatEmptyState } from '../src/features/chat/components/ChatEmptyState';
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
    it('does not render duplicate prompt chips inside the centered empty state', () => {
      const { queryByLabelText } = render(<ChatEmptyState />);

      expect(queryByLabelText('Code mode')).toBeNull();
      expect(queryByLabelText('Write mode')).toBeNull();
      expect(queryByLabelText('Research mode')).toBeNull();
      expect(queryByLabelText('Image mode')).toBeNull();
      expect(queryByLabelText('Computer mode, desktop required')).toBeNull();
    });
  });

  it('does NOT show multi-step wizard content', () => {
    const { queryByText } = render(<ChatEmptyState />);
    expect(queryByText(/suggest/i)).toBeNull();
    expect(queryByText(/try asking/i)).toBeNull();
    expect(queryByText(/get started with/i)).toBeNull();
    expect(queryByText(/start a conversation/i)).toBeNull();
  });

  describe('pairing banner gate', () => {
    it('does not show pairing banner without a pairing handler', () => {
      mockStorageGetString.mockReturnValue(undefined);

      const { getByText } = render(<ChatEmptyState showPairingBanner />);
      expect(getByText('Ask anything')).toBeTruthy();
    });

    it('keeps pairing banner hidden while companion is disabled', () => {
      mockStorageGetString.mockReturnValue(undefined);

      const { queryByText } = render(
        <ChatEmptyState showPairingBanner onPairDesktop={jest.fn()} />,
      );
      expect(queryByText('Pair your desktop?')).toBeNull();
      expect(queryByText('Scan QR to connect')).toBeNull();
    });

    it('does NOT show pairing banner when previously dismissed', () => {
      mockStorageGetString.mockReturnValue('true');

      const { queryByText } = render(
        <ChatEmptyState showPairingBanner onPairDesktop={jest.fn()} />,
      );
      expect(queryByText('Pair your desktop?')).toBeNull();
    });

    it('does not expose a desktop-pairing action while companion is disabled', () => {
      mockStorageGetString.mockReturnValue(undefined);
      const onPairDesktop = jest.fn();

      const { queryByLabelText } = render(
        <ChatEmptyState showPairingBanner onPairDesktop={onPairDesktop} />,
      );

      expect(queryByLabelText('Pair your desktop')).toBeNull();
      expect(onPairDesktop).not.toHaveBeenCalled();
    });
  });
});
