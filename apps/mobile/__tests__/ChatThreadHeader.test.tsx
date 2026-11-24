/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { Alert, Modal } from 'react-native';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('@clerk/expo', () => ({
  ...jest.requireActual('@clerk/expo'),
  useSession: () => ({ session: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({ id: 'thread-1' }),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const React = require('react');
    const latest = React.useRef(cb);
    latest.current = cb;
    React.useEffect(() => {
      let cleanup: void | (() => void) = latest.current();
      const entry = {
        blur: () => {
          if (typeof cleanup === 'function') cleanup();
          cleanup = undefined;
        },
        focus: () => {
          entry.blur();
          cleanup = latest.current();
        },
      };
      mockFocusEffects.add(entry);
      return () => {
        mockFocusEffects.delete(entry);
        entry.blur();
      };
    }, []);
  },
}));

const mockFocusEffects = new Set<{ blur: () => void; focus: () => void }>();

const mockArchiveConversation = jest.fn();
jest.mock('@/src/features/archived-chats', () => ({
  ...jest.requireActual('@/src/features/archived-chats'),
  archiveConversation: (...args: unknown[]) => mockArchiveConversation(...args),
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

let mockLayoutWidth: number | null = null;
jest.mock('@/src/shared/hooks/useResponsiveLayout', () => {
  const actual = jest.requireActual('@/src/shared/hooks/useResponsiveLayout');
  return {
    ...actual,
    useResponsiveLayout: () =>
      mockLayoutWidth === null
        ? actual.useResponsiveLayout()
        : actual.getResponsiveLayout(mockLayoutWidth),
  };
});

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
import { openNearestDrawer } from '../src/navigation/openNearestDrawer';
import { handOffConversationSend, takeConversationSend } from '@agiworkforce/client-runtime';
import { useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';
import { useCloudProjectStore } from '../stores/projects/cloudProjectStore';
import { useTierStore } from '../src/features/billing/store';
import { useModelStore } from '../src/features/model-picker/store';
import { useWaitlistStore } from '../src/features/waitlist';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { isAutoModeModelId } from '@agiworkforce/types';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { installCloudModeDoor } from '../src/features/chat/store/cloudModeDoor';
import {
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_SHARING_LABEL,
  ensureCloudProviderConsent,
  recordCloudProviderConsent,
  withdrawCloudProviderConsent,
} from '../services/providerConsent';

function refocusScreen(): void {
  act(() => {
    for (const effect of [...mockFocusEffects]) effect.focus();
  });
}

function blurScreen(): void {
  act(() => {
    for (const effect of [...mockFocusEffects]) effect.blur();
  });
}

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
    useChatStore.setState({
      missingConversationId: null,
      messageLoadErrorConversationId: null,
    } as never);
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

  it('names the project of this conversation, not the project the last new chat started in', () => {
    const project = {
      id: 'local-project',
      name: 'Garden',
      description: '',
      instructions: '',
      createdAt: '2026-10-31T00:00:00.000Z',
      updatedAt: '2026-10-31T00:00:00.000Z',
    };
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    seedThread();
    const screen = render(<ChatScreen />);

    expect(
      screen.queryByRole('button', {
        name: `Active project: ${project.name}. Tap to view details.`,
      }),
    ).toBeNull();
  });

  it('starts New chat from the header outside any project', () => {
    const project = {
      id: 'local-project',
      name: 'Garden',
      description: '',
      instructions: '',
      createdAt: '2026-10-31T00:00:00.000Z',
      updatedAt: '2026-10-31T00:00:00.000Z',
    };
    useProjectStore.setState({ projects: [project], activeProjectId: project.id });
    seedThread({ projectId: project.id });
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByRole('button', { name: 'New chat' }));

    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/(app)');
  });

  it('leaves no project scope behind for the next new chat once the person leaves the conversation', () => {
    seedThread();
    const screen = render(<ChatScreen />);
    act(() => {
      useProjectStore.setState({ activeProjectId: 'local-project' });
      useCloudProjectStore.setState({ activeProjectId: 'cloud-project' });
    });

    screen.unmount();

    expect(useProjectStore.getState().activeProjectId).toBeNull();
    expect(useCloudProjectStore.getState().activeProjectId).toBeNull();
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

    const header = screen.getByTestId('chat.thread-header.work-switch');
    expect(within(header).getByTestId('chat.work-mode.chat')).toBeTruthy();
    expect(within(header).getByTestId('chat.work-mode.agiwork')).toBeTruthy();
    expect(screen.getAllByTestId('chat.work-mode.chat')).toHaveLength(1);
    expect(screen.queryByLabelText('Quarterly plan. Open conversation menu')).toBeNull();

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
    expect(screen.getByLabelText('Quarterly plan. Open conversation menu')).toBeTruthy();
  });

  it('keeps the title in the header for a plan without Work', () => {
    useTierStore.setState({ tier: 'free' });
    seedThread({ executionMode: 'cloud' });
    const screen = render(<ChatScreen />);

    expect(screen.queryByTestId('chat.thread-header.work-switch')).toBeNull();
    expect(screen.getByLabelText('Quarterly plan. Open conversation menu')).toBeTruthy();
  });

  it('shows only the error, not a blank new chat, when the history did not load', () => {
    useTierStore.setState({ tier: 'pro' });
    seedThread({ executionMode: 'cloud' });
    useChatStore.setState({
      isLoadingMessages: false,
      messageLoadErrorConversationId: 'thread-1',
    } as never);
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat.history-not-loaded')).toBeTruthy();
    expect(screen.queryByTestId('message-list')).toBeNull();
    expect(screen.queryByTestId('chat.work-mode.chat')).toBeNull();
    expect(screen.getByLabelText('Quarterly plan. Open conversation menu')).toBeTruthy();
  });

  it('says a chat that no longer exists is not available and offers a new chat instead of a composer', () => {
    useTierStore.setState({ tier: 'pro' });
    seedThread({ executionMode: 'cloud' });
    useChatStore.setState({
      isLoadingMessages: false,
      missingConversationId: 'thread-1',
    } as never);
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat.conversation-unavailable')).toBeTruthy();
    expect(screen.getByText('This chat is not available')).toBeTruthy();
    expect(screen.queryByTestId('composer')).toBeNull();
    expect(screen.queryByTestId('message-list')).toBeNull();
    expect(screen.queryByTestId('chat.work-mode.chat')).toBeNull();

    fireEvent.press(screen.getByText('New chat'));
    expect(mockPush).toHaveBeenCalledWith('/(app)');
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
      errorConversationId: 'thread-1',
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
      errorConversationId: 'thread-1',
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

  describe('beside the permanent sidebar', () => {
    afterEach(() => {
      mockLayoutWidth = null;
    });

    it.each([402, 820])('opens the drawer from the header at %ipt', (width) => {
      mockLayoutWidth = width;
      seedThread();
      const screen = render(<ChatScreen />);

      fireEvent.press(screen.getByRole('button', { name: 'Open menu' }));
      expect(openNearestDrawer).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('chat.thread-header.drawer-slot')).toBeNull();
    });

    it.each([1032, 1376])(
      'offers no menu button that would do nothing at %ipt and keeps its slot',
      (width) => {
        mockLayoutWidth = width;
        seedThread();
        const screen = render(<ChatScreen />);

        expect(screen.queryByRole('button', { name: 'Open menu' })).toBeNull();
        expect(screen.getByTestId('chat.thread-header.drawer-slot')).toHaveStyle({
          width: 44,
          height: 44,
        });
        expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Conversation menu' })).toBeTruthy();
      },
    );
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

  it('leaves the thread after a confirmed delete', async () => {
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
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)'));
  });

  describe('a Cloud chat the drawer keeps mounted', () => {
    const storeLoadMessages = useChatStore.getState().loadMessages;
    let loadMessages: jest.Mock<Promise<void>, [string]>;

    beforeEach(() => {
      activateCloudAccount('header-owner');
      useTierStore.setState({ tier: 'pro' });
      seedThread({ executionMode: 'cloud' });
      loadMessages = jest.fn((_conversationId: string) => Promise.resolve());
      useChatStore.setState({ loadMessages } as never);
      useChatExecutionStore.setState({ streamingConversationIds: [] });
    });

    afterEach(() => {
      useChatStore.setState({ loadMessages: storeLoadMessages } as never);
      useChatExecutionStore.setState({ streamingConversationIds: [] });
      __resetCloudAccountSessionForTests();
    });

    async function settle(): Promise<void> {
      await act(async () => {
        await Promise.resolve();
      });
    }

    it('loads the history again when it is opened with no messages, as after a restore', async () => {
      render(<ChatScreen />);
      await settle();
      expect(loadMessages).toHaveBeenCalledTimes(1);

      refocusScreen();
      await settle();

      expect(loadMessages).toHaveBeenCalledTimes(2);
      expect(loadMessages).toHaveBeenLastCalledWith('thread-1');
    });

    it('does not load again on focus when the messages are already here', async () => {
      render(<ChatScreen />);
      await settle();
      act(() => {
        useChatStore.setState({
          messages: {
            'thread-1': [
              {
                id: 'kept-question',
                conversationId: 'thread-1',
                role: 'user',
                content: 'Plan my week',
                createdAt: '2026-11-12T00:00:00.000Z',
              },
            ],
          },
        } as never);
      });

      refocusScreen();
      await settle();

      expect(loadMessages).toHaveBeenCalledTimes(1);
    });

    it('does not load on focus while an answer is being written', async () => {
      render(<ChatScreen />);
      await settle();
      act(() => useChatExecutionStore.setState({ streamingConversationIds: ['thread-1'] }));

      refocusScreen();
      await settle();

      expect(loadMessages).toHaveBeenCalledTimes(1);
    });

    it('never starts a second load while the first is still running', async () => {
      let finish!: () => void;
      loadMessages.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      render(<ChatScreen />);
      await settle();

      refocusScreen();
      await settle();
      expect(loadMessages).toHaveBeenCalledTimes(1);

      await act(async () => finish());
      refocusScreen();
      await settle();
      expect(loadMessages).toHaveBeenCalledTimes(2);
    });

    function archiveFromHeader(screen: ReturnType<typeof render>): void {
      fireEvent.press(screen.getByLabelText('Conversation menu'));
      fireEvent.press(screen.getByTestId('conversation-action-archive'));
      act(() => {
        screen.UNSAFE_getAllByType(Modal).forEach((modal) => modal.props.onDismiss?.());
      });
    }

    it('leaves the chat once it is archived from its own menu', async () => {
      mockArchiveConversation.mockResolvedValueOnce(undefined);
      const screen = render(<ChatScreen />);
      await settle();

      archiveFromHeader(screen);

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)'));
      expect(mockArchiveConversation).toHaveBeenCalledWith('thread-1', expect.anything());
    });

    it('does not navigate when the person has already left the chat before the archive lands', async () => {
      let land!: () => void;
      mockArchiveConversation.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            land = resolve;
          }),
      );
      const screen = render(<ChatScreen />);
      await settle();

      archiveFromHeader(screen);
      await waitFor(() => expect(mockArchiveConversation).toHaveBeenCalled());
      blurScreen();
      await act(async () => land());
      await settle();

      expect(mockReplace).not.toHaveBeenCalled();
    });
  });

  describe('a Cloud chat this account has not allowed to share with AI providers', () => {
    let uninstallDoor: () => void;
    let alert: jest.SpyInstance;

    beforeEach(() => {
      __resetCloudAccountSessionForTests();
      activateCloudAccount('header-owner');
      useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'header-owner' });
      withdrawCloudProviderConsent();
      useChatAppModeStore.setState({ appMode: 'local' });
      uninstallDoor = installCloudModeDoor();
      useTierStore.setState({ tier: 'pro' });
      seedThread({ executionMode: 'cloud' });
      alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    });

    afterEach(async () => {
      uninstallDoor();
      alert.mockRestore();
      useAuthStore.setState({ isClerkSignedIn: false, clerkUserId: null });
      useChatAppModeStore.setState({ appMode: 'local' });
      invalidateCloudAccount();
      __resetCloudAccountSessionForTests();
      await ensureCloudProviderConsent();
    });

    async function settle(): Promise<void> {
      await act(async () => {
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
      });
    }

    function sharingQuestions(): unknown[] {
      return alert.mock.calls.filter(([title]) => title === `${CLOUD_PROVIDER_SHARING_LABEL}?`);
    }

    it('asks once when opened and not again on focus or an update after Not now', async () => {
      render(<ChatScreen />);
      await settle();
      expect(sharingQuestions()).toHaveLength(1);
      const buttons = alert.mock.calls[0]?.[2] as Array<{ text: string; onPress?: () => void }>;
      buttons.find((button) => button.text === CLOUD_PROVIDER_CONSENT_DECLINE_LABEL)?.onPress?.();
      await settle();

      blurScreen();
      refocusScreen();
      await settle();
      act(() => seedThread({ executionMode: 'cloud', title: 'Quarterly plan, revised' }));
      await settle();

      expect(sharingQuestions()).toHaveLength(1);
      expect(useChatAppModeStore.getState().appMode).toBe('local');
    });

    it('does not ask on the way back after sharing was turned off in Settings', async () => {
      recordCloudProviderConsent();
      render(<ChatScreen />);
      await settle();
      expect(useChatAppModeStore.getState().appMode).toBe('cloud');

      blurScreen();
      act(() => withdrawCloudProviderConsent());
      refocusScreen();
      await settle();

      expect(sharingQuestions()).toHaveLength(0);
      expect(useChatAppModeStore.getState().appMode).toBe('local');
    });
  });
});
