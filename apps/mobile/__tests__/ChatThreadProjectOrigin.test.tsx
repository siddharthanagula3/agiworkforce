/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

let mockParams: Record<string, string> = { id: 'thread-1' };
let mockCanGoBack = false;
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockStopSpeaking = jest.fn(async () => undefined);

jest.mock('@clerk/expo', () => ({
  useSession: () => ({ session: null }),
  useUser: () => ({ user: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({
  openNearestDrawer: jest.fn(),
}));

jest.mock('@/src/features/voice/hooks/useVoiceOutputOwner', () => ({
  useVoiceOutputOwner: () => ({ stop: mockStopSpeaking, dispose: jest.fn(async () => undefined) }),
}));

jest.mock('@/src/features/chat/components/Composer/Composer', () => {
  const { View } = require('react-native');
  return { Composer: () => <View testID="composer" /> };
});

jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return { AddToChatSheet: () => <View /> };
});

jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return { ModelPickerSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/PaywallBottomSheet', () => {
  const { View } = require('react-native');
  return { PaywallBottomSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return { StyleSelector: () => <View /> };
});

jest.mock('@/src/features/chat/components/MessageList', () => {
  const { View } = require('react-native');
  return { MessageList: () => <View testID="message-list" /> };
});

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? false : Icon) });
});

jest.mock('@/lib/mmkv', () => {
  const values = new Map<string, string>();
  return {
    whenMmkvReady: jest.fn((cb) => cb()),
    rehydrateWhenMmkvReady: jest.fn((store) => {
      if (store?.persist?.rehydrate) store.persist.rehydrate();
    }),
    mmkvStorage: {
      getItem: jest.fn().mockReturnValue(null),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    storage: {
      getString: (key: string) => values.get(key),
      set: (key: string, value: string) => values.set(key, value),
      delete: (key: string) => values.delete(key),
    },
  };
});

import ChatScreen from '../app/(app)/chat/[id]';
import { useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';

const PROJECT_ID = 'project-garden';

function localProject(name: string) {
  return {
    id: PROJECT_ID,
    name,
    description: '',
    instructions: '',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

function cloudProject(name: string, deletedAt: string | null = null) {
  return {
    id: PROJECT_ID,
    name,
    description: null,
    instructions: null,
    color: null,
    isArchived: false,
    metadata: null,
    source: 'mobile' as const,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt,
  };
}

function seedThread(executionMode: 'local' | 'cloud', projectId: string | null = PROJECT_ID) {
  useChatStore.setState({
    conversations: [
      {
        id: 'thread-1',
        title: 'Quarterly plan',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
        messageCount: 0,
        pinned: false,
        executionMode,
        projectId: projectId ?? undefined,
      },
    ],
    messages: { 'thread-1': [] },
    loadConversations: jest.fn(async () => undefined),
    loadMessages: jest.fn(async () => undefined),
  } as never);
}

const chipLabel = (name: string) => `Active project: ${name}. Tap to view details.`;

describe('the header of a chat opened from a project page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { id: 'thread-1' };
    mockCanGoBack = false;
    useProjectStore.setState({ projects: [], activeProjectId: null });
    useCloudProjectStore.setState({ projects: [], activeProjectId: null });
    useChatStore.setState({
      missingConversationId: null,
      messageLoadErrorConversationId: null,
    } as never);
  });

  describe('the left control', () => {
    it('is the menu button for a chat that did not come from a project', () => {
      mockCanGoBack = true;
      useCloudProjectStore.setState({ projects: [cloudProject('Garden')] });
      seedThread('cloud');
      render(<ChatScreen />);

      expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Back to Garden' })).toBeNull();
    });

    it('is a 44 point chevron named for the project when the chat came from the project page', () => {
      mockParams = { id: 'thread-1', from: 'project' };
      mockCanGoBack = true;
      useCloudProjectStore.setState({ projects: [cloudProject('Garden')] });
      seedThread('cloud');
      render(<ChatScreen />);

      const back = screen.getByRole('button', { name: 'Back to Garden' });
      expect(back).toHaveStyle({ width: 44, height: 44 });
      expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
    });

    it('goes back to the project page and stops read aloud', () => {
      mockParams = { id: 'thread-1', from: 'project' };
      mockCanGoBack = true;
      useCloudProjectStore.setState({ projects: [cloudProject('Garden')] });
      seedThread('cloud');
      render(<ChatScreen />);

      fireEvent.press(screen.getByRole('button', { name: 'Back to Garden' }));

      expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('stays the menu button when there is no screen to go back to', () => {
      mockParams = { id: 'thread-1', from: 'project' };
      mockCanGoBack = false;
      seedThread('local');
      useProjectStore.setState({ projects: [localProject('Garden')] });
      render(<ChatScreen />);

      expect(screen.getByRole('button', { name: 'Open menu' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Back to Garden' })).toBeNull();
    });

    it('still goes back when the project was deleted while the chat was open', () => {
      mockParams = { id: 'thread-1', from: 'project' };
      mockCanGoBack = true;
      useCloudProjectStore.setState({
        projects: [cloudProject('Garden', '2026-11-10T00:00:00.000Z')],
      });
      seedThread('cloud');
      render(<ChatScreen />);

      fireEvent.press(screen.getByRole('button', { name: 'Back to project' }));

      expect(mockBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('the project chip', () => {
    it('names the project of a Cloud chat and opens the project page', () => {
      useCloudProjectStore.setState({ projects: [cloudProject('Garden')] });
      seedThread('cloud');
      render(<ChatScreen />);

      const chip = screen.getByRole('button', { name: chipLabel('Garden') });
      expect(chip).toHaveStyle({ height: 44, maxWidth: 120 });
      expect(screen.getByRole('button', { name: 'Open project sources' })).toBeTruthy();

      fireEvent.press(chip);

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/(app)/projects/[id]',
        params: { id: PROJECT_ID },
      });
    });

    it('keeps the name on one line with a tail ellipsis', () => {
      useCloudProjectStore.setState({
        projects: [cloudProject('A project with a very long name that cannot fit')],
      });
      seedThread('cloud');
      render(<ChatScreen />);

      const name = screen.getByText('A project with a very long name that cannot fit');
      expect(name.props.numberOfLines).toBe(1);
    });

    it('renders nothing until the Cloud project list has loaded', () => {
      seedThread('cloud');
      render(<ChatScreen />);

      expect(screen.queryByRole('button', { name: /Active project/ })).toBeNull();
    });

    it('renders nothing for a Cloud project that was deleted', () => {
      useCloudProjectStore.setState({
        projects: [cloudProject('Garden', '2026-11-10T00:00:00.000Z')],
      });
      seedThread('cloud');
      render(<ChatScreen />);

      expect(screen.queryByRole('button', { name: /Active project/ })).toBeNull();
    });

    it('does not take a Cloud chat project name from the Local project list', () => {
      useProjectStore.setState({ projects: [localProject('Local garden')] });
      seedThread('cloud');
      render(<ChatScreen />);

      expect(screen.queryByRole('button', { name: /Active project/ })).toBeNull();
    });

    it('still names the project of a Local chat from the Local list', () => {
      useProjectStore.setState({ projects: [localProject('Garden')] });
      useCloudProjectStore.setState({ projects: [cloudProject('Cloud garden')] });
      seedThread('local');
      render(<ChatScreen />);

      expect(screen.getByRole('button', { name: chipLabel('Garden') })).toBeTruthy();
      expect(screen.queryByRole('button', { name: chipLabel('Cloud garden') })).toBeNull();
    });

    it('is absent for a chat outside any project', () => {
      useCloudProjectStore.setState({ projects: [cloudProject('Garden')] });
      seedThread('cloud', null);
      render(<ChatScreen />);

      expect(screen.queryByRole('button', { name: /Active project/ })).toBeNull();
    });
  });
});
