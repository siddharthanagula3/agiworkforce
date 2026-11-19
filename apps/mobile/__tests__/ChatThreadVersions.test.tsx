/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, render } from '@testing-library/react-native';

let mockSearchParams: Record<string, string> = { id: 'thread-versions' };
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => false,
};

jest.mock('@clerk/expo', () => ({ useSession: () => ({ session: null }) }));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    const latest = React.useRef(cb);
    latest.current = cb;
    React.useEffect(() => {
      const entry: MockFocusEntry = { run: () => latest.current() };
      entry.cleanup = entry.run();
      mockFocusEffects.add(entry);
      return () => {
        mockFocusEffects.delete(entry);
        mockRunCleanup(entry);
      };
    }, []);
  },
}));

type MockFocusEntry = { run: () => unknown; cleanup?: unknown };

function mockRunCleanup(entry: MockFocusEntry): void {
  if (typeof entry.cleanup === 'function') entry.cleanup();
}

const mockFocusEffects = new Set<MockFocusEntry>();

function mockRefocusScreen(): void {
  for (const entry of mockFocusEffects) {
    mockRunCleanup(entry);
    entry.cleanup = entry.run();
  }
}

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({ openNearestDrawer: jest.fn() }));

const mockFocusComposer = jest.fn();
let mockComposerAttachesLate = false;
jest.mock('@/src/features/chat/components/Composer/Composer', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Composer: (props: { attachRef?: { current: unknown } }) => {
      const handle = {
        retrySend: jest.fn(),
        addAttachments: jest.fn(),
        focus: mockFocusComposer,
        restoreText: jest.fn(),
      };
      if (props.attachRef && !mockComposerAttachesLate) props.attachRef.current = handle;
      React.useEffect(() => {
        if (!props.attachRef || !mockComposerAttachesLate) return;
        const attachRef = props.attachRef;
        setTimeout(() => {
          setTimeout(() => {
            attachRef.current = handle;
          }, 0);
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return <View testID="composer" />;
    },
  };
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

jest.mock('@/stores/chat/imageEditAdmissions', () => ({
  useImageEditModelIds: () => new Set<string>(),
}));

interface MockMessageListProps {
  variantInfoByMessageId?: Record<string, { index: number; total: number }>;
  onSelectVariant?: (messageId: string) => void;
}
let mockMessageListProps = {} as MockMessageListProps;
jest.mock('@/src/features/chat/components/MessageList', () => {
  const { View } = require('react-native');
  return {
    MessageList: (props: MockMessageListProps) => {
      mockMessageListProps = props;
      return <View testID="message-list" />;
    },
  };
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
    rehydrateWhenMmkvReady: jest.fn(),
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

jest.mock('@/src/features/chat/inFlightTurnRecovery', () => ({
  ...jest.requireActual('@/src/features/chat/inFlightTurnRecovery'),
  useInFlightTurnRecovery: () => 'idle',
}));

const mockUpdateConversation = jest.fn(async () => undefined);
jest.mock('@/services/managedCloudChat', () => ({
  ...jest.requireActual('@/services/managedCloudChat'),
  managedCloudChat: {
    ...jest.requireActual('@/services/managedCloudChat').managedCloudChat,
    updateConversation: (...args: unknown[]) => mockUpdateConversation(...(args as [])),
  },
}));

import ChatScreen from '../app/(app)/chat/[id]';
import { useChatStore } from '../stores/chatStore';

const STAMP = '2026-11-15T10:00:00.000Z';

function row(id: string, role: 'user' | 'assistant', content: string, parentId: string | null) {
  return {
    id,
    conversationId: 'thread-versions',
    role,
    content,
    createdAt: STAMP,
    parentId,
  };
}

function seedLocalThread(activeLeafMessageId?: string): void {
  useChatStore.setState({
    conversations: [
      {
        id: 'thread-versions',
        title: 'Local versions',
        createdAt: STAMP,
        updatedAt: STAMP,
        messageCount: 6,
        pinned: false,
        executionMode: 'local',
        ...(activeLeafMessageId ? { activeLeafMessageId } : {}),
      },
    ],
    messages: {
      'thread-versions': activeLeafMessageId
        ? [
            row('u1', 'user', 'first question', null),
            row('a1', 'assistant', 'first answer', 'u1'),
            row('u2', 'user', 'second question', 'a1'),
            row('a2', 'assistant', 'second answer', 'u2'),
            row('u2b', 'user', 'revised second question', 'a1'),
            row('a2b', 'assistant', 'revised answer', 'u2b'),
          ]
        : [{ ...row('u1', 'user', 'first question', null), parentId: undefined }],
    },
  } as never);
}

function leaf(): string | null | undefined {
  return useChatStore.getState().conversations.find((c) => c.id === 'thread-versions')
    ?.activeLeafMessageId;
}

async function settleFrames(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockComposerAttachesLate = false;
  mockSearchParams = { id: 'thread-versions' };
  mockMessageListProps = {} as MockMessageListProps;
});

describe('versions in a Local chat', () => {
  it('gives the edited question its pager', () => {
    seedLocalThread('a2b');
    render(<ChatScreen />);

    expect(mockMessageListProps.variantInfoByMessageId?.u2b).toMatchObject({
      index: 1,
      total: 2,
    });
  });

  it('pages back to the original question and its answers on the phone alone', () => {
    seedLocalThread('a2b');
    render(<ChatScreen />);

    act(() => mockMessageListProps.onSelectVariant?.('u2'));

    expect(leaf()).toBe('a2');
    expect(mockMessageListProps.variantInfoByMessageId?.u2).toMatchObject({ index: 0, total: 2 });
    expect(mockUpdateConversation).not.toHaveBeenCalled();
  });
});

describe('a chat opened with a prepared request', () => {
  it('puts the cursor in the composer so the keyboard is up', async () => {
    seedLocalThread();
    mockSearchParams = { id: 'thread-versions', prompt: 'Build a one-page site' };
    render(<ChatScreen />);
    await settleFrames();

    expect(mockFocusComposer).toHaveBeenCalledTimes(1);
  });

  it('raises the keyboard once per conversation, not again when the screen regains focus', async () => {
    seedLocalThread();
    mockSearchParams = { id: 'thread-versions', prompt: 'Build a one-page site' };
    render(<ChatScreen />);
    await settleFrames();
    act(() => mockRefocusScreen());
    await settleFrames();

    expect(mockFocusComposer).toHaveBeenCalledTimes(1);
  });

  it('waits for the composer when it is not ready on the first frame', async () => {
    mockComposerAttachesLate = true;
    seedLocalThread();
    mockSearchParams = { id: 'thread-versions', prompt: 'Build a one-page site' };
    render(<ChatScreen />);
    await settleFrames();

    expect(mockFocusComposer).toHaveBeenCalledTimes(1);
  });

  it('leaves the keyboard down on an ordinary open', async () => {
    seedLocalThread();
    render(<ChatScreen />);
    await settleFrames();

    expect(mockFocusComposer).not.toHaveBeenCalled();
  });
});
