/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

const mockReplace = jest.fn();

jest.mock('@clerk/expo', () => ({
  ...jest.requireActual('@clerk/expo'),
  useSession: () => ({ session: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({ id: 'thread-1' }),
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

jest.mock('@clerk/expo', () => ({ useSession: () => ({ session: null }) }));

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
import { handOffConversationSend, takeConversationSend } from '@agiworkforce/client-runtime';
import { useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';
import { useTierStore } from '../src/features/billing/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { isAutoModeModelId } from '@agiworkforce/types';

function seedThread(overrides: Record<string, unknown> = {}): void {
  useChatStore.setState({
    conversations: [
      {
        id: 'thread-1',
        title: 'Quarterly plan',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        messageCount: 0,
        pinned: false,
        executionMode: 'local',
        ...overrides,
      },
    ],
    messages: { 'thread-1': [] },
  } as never);
}

describe('Thread header', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useProjectStore.setState({ projects: [], activeProjectId: null });
  });

  it('keeps project navigation and source controls distinct beside a long title', () => {
    const project = {
      id: 'local-project',
      name: 'A project with a long name',
      description: '',
      instructions: '',
      createdAt: '2026-10-31T00:00:00.000Z',
      updatedAt: '2026-10-31T00:00:00.000Z',
    };
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    seedThread({ projectId: project.id, title: 'A conversation title with more detail' });
    const screen = render(<ChatScreen />);

    expect(screen.getByRole('button', { name: 'Open project sources' })).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(
      screen.getByRole('button', {
        name: `Active project: ${project.name}. Tap to view details.`,
      }),
    ).toHaveStyle({ height: 44, minWidth: 44, flexShrink: 1 });
    expect(
      screen.getByRole('button', {
        name: 'A conversation title with more detail. Open conversation menu',
      }),
    ).toHaveStyle({ minWidth: 44, minHeight: 44 });
  });

  it('shows the message being handed to a new chat instead of a blank skeleton while history loads', () => {
    seedThread();
    useChatStore.setState({ isLoadingMessages: true, loadMessages: jest.fn() } as never);
    handOffConversationSend('thread-1', 'Teach me fractions');

    const screen = render(<ChatScreen />);

    expect(screen.getByText('Teach me fractions')).toBeTruthy();
    expect(screen.getByLabelText('Your message: Teach me fractions. Sending')).toBeTruthy();
    takeConversationSend('thread-1');
  });

  it('keeps the model picked for a new Cloud chat instead of resetting it to Auto', () => {
    const picked = requireMobileCloudModel(
      (model) => !isAutoModeModelId(model.id),
      'non-Auto Mobile Cloud model',
    ).id;
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useModelStore.setState({ selectedModel: picked });
    seedThread({ executionMode: 'cloud' });

    render(<ChatScreen />);

    expect(useModelStore.getState().selectedModel).toBe(picked);
  });

  it('offers Chat and Work only until the first message is sent', () => {
    useTierStore.setState({ tier: 'pro' });
    seedThread({ executionMode: 'cloud' });
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat.work-mode.chat')).toBeTruthy();

    act(() => {
      useChatStore.setState({
        messages: {
          'thread-1': [
            {
              id: 'first-question',
              conversationId: 'thread-1',
              role: 'user',
              content: 'Plan my week',
              createdAt: '2026-11-12T00:00:00.000Z',
            },
          ],
        },
      } as never);
    });

    expect(screen.queryByTestId('chat.work-mode.chat')).toBeNull();
    expect(screen.queryByTestId('chat.work-mode.agiwork')).toBeNull();
  });

  it('leaves Switch model to the failed turn instead of repeating it in the error bar', () => {
    const failure = 'The model is busy right now. Try again or pick another model.';
    seedThread();
    useChatStore.setState({
      messages: {
        'thread-1': [
          {
            id: 'question',
            conversationId: 'thread-1',
            role: 'user',
            content: 'Hello',
            createdAt: '2026-11-12T00:00:00.000Z',
          },
          {
            id: 'failed-answer',
            conversationId: 'thread-1',
            role: 'assistant',
            content: '',
            createdAt: '2026-11-12T00:00:01.000Z',
            metadata: { streamError: { message: failure, code: 'provider_overloaded' } },
          },
        ],
      },
    } as never);
    useChatExecutionStore.setState({
      error: failure,
      failureCode: { message: failure, code: 'provider_overloaded' },
    } as never);

    const screen = render(<ChatScreen />);

    expect(screen.queryByText('Switch model')).toBeNull();
  });

  it('offers Switch model in the error bar when no turn shows the failure', () => {
    const failure = 'The model is busy right now. Try again or pick another model.';
    seedThread();
    useChatExecutionStore.setState({
      error: failure,
      failureCode: { message: failure, code: 'provider_overloaded' },
    } as never);

    const screen = render(<ChatScreen />);

    expect(screen.getByText('Switch model')).toBeTruthy();
  });

  it('clips the thread to its own frame so a reply never draws over the composer controls', () => {
    seedThread();
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat.thread-frame')).toHaveStyle({ flex: 1, overflow: 'hidden' });
  });

  it('shows the conversation title and opens the conversation menu from it', () => {
    seedThread();
    const screen = render(<ChatScreen />);

    expect(screen.getByText('Quarterly plan')).toBeTruthy();
    for (const name of ['Open menu', 'New chat', 'Conversation menu']) {
      expect(screen.getByRole('button', { name })).toHaveStyle({ width: 44, height: 44 });
    }
    expect(screen.getByLabelText('Quarterly plan. Open conversation menu')).toHaveStyle({
      minWidth: 44,
      minHeight: 44,
    });
    fireEvent.press(screen.getByLabelText('Quarterly plan. Open conversation menu'));

    expect(screen.getByTestId('conversation-action-pin')).toBeTruthy();
    expect(screen.getByTestId('conversation-action-export')).toBeTruthy();
    expect(screen.getByTestId('conversation-action-context')).toBeTruthy();
    expect(screen.getByTestId('conversation-action-delete')).toBeTruthy();
  });

  it('opens the same menu from the ellipsis and offers Unpin for a pinned thread', () => {
    seedThread({ pinned: true });
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('Conversation menu'));

    expect(screen.getByLabelText('Unpin')).toBeTruthy();
  });

  it('disables both menu controls until the conversation is in the store, then enables them', () => {
    useChatStore.setState({ conversations: [], messages: {} } as never);
    const screen = render(<ChatScreen />);

    const titleButton = screen.getByLabelText('Chat. Open conversation menu');
    const ellipsis = screen.getByLabelText('Conversation menu');
    expect(titleButton.props.accessibilityState.disabled).toBe(true);
    expect(ellipsis.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(ellipsis);
    fireEvent.press(titleButton);
    expect(screen.queryByTestId('conversation-action-pin')).toBeNull();

    act(() => seedThread());

    expect(screen.getByLabelText('Conversation menu').props.accessibilityState.disabled).toBe(
      false,
    );
    fireEvent.press(screen.getByLabelText('Conversation menu'));
    expect(screen.getByTestId('conversation-action-pin')).toBeTruthy();
  });

  it('leaves the thread after a confirmed delete', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    seedThread();
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('Conversation menu'));
    fireEvent.press(screen.getByTestId('conversation-action-delete'));
    act(() => {
      screen.UNSAFE_getAllByType(Modal).forEach((modal) => modal.props.onDismiss?.());
    });
    const buttons = alert.mock.calls[0]?.[2] as Array<{ text: string; onPress?: () => void }>;
    buttons.find((button) => button.text === 'Delete')?.onPress?.();

    expect(useChatStore.getState().conversations.some((c) => c.id === 'thread-1')).toBe(false);
    expect(mockReplace).toHaveBeenCalled();
  });
});
