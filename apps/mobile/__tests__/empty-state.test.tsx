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

const mockClerkState: {
  user: null | {
    firstName?: string | null;
    fullName?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
  };
} = { user: null };

jest.mock('@clerk/expo', () => ({
  useUser: () => mockClerkState,
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
    getString: (...args) => mockStorageGetString(...args),
    set: (...args) => mockStorageSet(...args),
    delete: jest.fn(),
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
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '../stores/settings/cloudSettingsStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultPersonalization = {
  fullName: '',
  nickname: '',
  occupation: '',
  instructions: '',
  style: 'default' as const,
  warmth: 50,
  enthusiasm: 50,
  headersLists: 50,
  emoji: 50,
};

// ChatEmptyState reads personalization from the active mode's store.
// Tests run in local mode (useChatAppModeStore defaults to 'local'), so
// seed useLocalSettingsStore.
function resetSettingsStore() {
  useLocalSettingsStore.setState({ personalization: defaultPersonalization });
  useCloudSettingsStore.setState({ personalization: defaultPersonalization });
  useChatAppModeStore.setState({ appMode: 'local' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatEmptyState', () => {
  beforeEach(() => {
    resetSettingsStore();
    mockStorageGetString.mockReturnValue(undefined);
    mockClerkState.user = null;
    jest.clearAllMocks();
  });

  describe('headline', () => {
    it('shows "Ask anything" when no display name is set', () => {
      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Ask anything')).toBeTruthy();
    });

    it('shows personalized greeting when nickname is set', () => {
      useLocalSettingsStore.setState({
        personalization: {
          fullName: '',
          nickname: 'Alex',
          occupation: '',
          instructions: '',
          style: 'default',
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
      useLocalSettingsStore.setState({
        personalization: {
          fullName: 'Jane Smith',
          nickname: '',
          occupation: '',
          instructions: '',
          style: 'default',
          warmth: 50,
          enthusiasm: 50,
          headersLists: 50,
          emoji: 50,
        },
      });

      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('Hi, Jane')).toBeTruthy();
    });

    it('uses the loaded Clerk identity immediately in Cloud before settings sync finishes', () => {
      useChatAppModeStore.setState({ appMode: 'cloud' });
      mockClerkState.user = {
        firstName: 'Ada',
        fullName: 'Ada Lovelace',
        primaryEmailAddress: { emailAddress: 'ada@example.com' },
      };

      const { getByText } = render(<ChatEmptyState />);

      expect(getByText('Hi, Ada')).toBeTruthy();
    });
  });

  describe('subtitle', () => {
    it('shows "How can I help you?" when no display name', () => {
      const { getByText } = render(<ChatEmptyState />);
      expect(getByText('How can I help you?')).toBeTruthy();
    });

    it('does NOT show subtitle when display name is set', () => {
      useLocalSettingsStore.setState({
        personalization: {
          fullName: '',
          nickname: 'Alex',
          occupation: '',
          instructions: '',
          style: 'default',
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
