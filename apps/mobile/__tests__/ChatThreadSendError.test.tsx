/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

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

interface MockComposerProps {
  attachRef?: { current: unknown };
  onSend: (text: string) => Promise<unknown> | unknown;
  onRefusedSendChange: (refused: boolean) => void;
}
let mockComposerProps = {} as MockComposerProps;
const mockRetrySend = jest.fn();
jest.mock('@/src/features/chat/components/Composer/Composer', () => {
  const { View } = require('react-native');
  return {
    Composer: (props: MockComposerProps) => {
      mockComposerProps = props;
      if (props.attachRef) {
        props.attachRef.current = {
          retrySend: mockRetrySend,
          addAttachments: jest.fn(),
          focus: jest.fn(),
          restoreText: jest.fn(),
        };
      }
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

interface MockMessageListProps {
  onQuoteReply: (message: unknown) => void;
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
import { useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';
import { useTierStore } from '../src/features/billing/store';
import { getShortDisplayName, UNKNOWN_MODEL_LABEL } from '../src/features/model-picker/service';
import { quotedReplyAuthor, quotedReplyText } from '../src/features/chat/components/QuotedReplyBar';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const SEND_FAILED = 'Message could not be sent. Please try again.';
const INITIAL_TIER = useTierStore.getState().tier;
const { sendMessage: realSendMessage, retryMessage: realRetryMessage } =
  useChatExecutionStore.getState();

const QUESTION = {
  id: 'user-1',
  role: 'user',
  content: 'Summarise the plan',
  createdAt: '2026-06-20T00:00:00.000Z',
};

function seedThread(messages: unknown[] = []): void {
  useChatStore.setState({
    conversations: [
      {
        id: 'thread-1',
        title: 'Quarterly plan',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
        messageCount: messages.length,
        pinned: false,
        executionMode: 'local',
      },
    ],
    messages: { 'thread-1': messages },
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockComposerProps = {} as MockComposerProps;
  mockMessageListProps = {} as MockMessageListProps;
  useTierStore.setState({ tier: INITIAL_TIER });
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useChatStore.setState({
    missingConversationId: null,
    messageLoadErrorConversationId: null,
  } as never);
  useChatExecutionStore.setState({
    error: null,
    failureCode: null,
    paywallError: null,
    providerConsentError: null,
    freeCapacityError: null,
    errorConversationId: null,
    errorRetry: null,
    sendMessage: realSendMessage,
    retryMessage: realRetryMessage,
  });
});

describe('the send error banner of a conversation', () => {
  it('never shows a failure that belongs to another conversation', () => {
    seedThread();
    useChatExecutionStore.getState().setSendError(SEND_FAILED, {
      conversationId: 'thread-2',
      retry: { kind: 'resend' },
    });

    const screen = render(<ChatScreen />);

    expect(screen.queryByText(SEND_FAILED)).toBeNull();
    expect(screen.queryByLabelText('Retry sending message')).toBeNull();
  });

  it("dismissing its own failure leaves another conversation's alone", () => {
    seedThread();
    useChatExecutionStore.getState().setSendError(SEND_FAILED, { conversationId: 'thread-2' });
    render(<ChatScreen />);

    act(() => useChatExecutionStore.getState().clearErrorFor('thread-1'));

    expect(useChatExecutionStore.getState().error).toBe(SEND_FAILED);
  });

  it('offers to send the draft again only while the composer still holds it', () => {
    seedThread();
    useChatExecutionStore.getState().setSendError(SEND_FAILED, {
      conversationId: 'thread-1',
      retry: { kind: 'resend' },
    });
    const screen = render(<ChatScreen />);
    expect(screen.getByText(SEND_FAILED)).toBeTruthy();
    expect(screen.queryByLabelText('Retry sending message')).toBeNull();

    act(() => mockComposerProps.onRefusedSendChange(true));
    fireEvent.press(screen.getByLabelText('Retry sending message'));

    expect(mockRetrySend).toHaveBeenCalledTimes(1);
    expect(useChatExecutionStore.getState().error).toBeNull();
  });

  it('regenerates the stored question when the turn itself failed', () => {
    const retryMessage = jest.fn();
    seedThread([QUESTION]);
    useChatExecutionStore.setState({ retryMessage });
    useChatExecutionStore.getState().setSendError('The reply stopped.', {
      conversationId: 'thread-1',
      retry: { kind: 'regenerate', messageId: QUESTION.id },
    });
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('Retry sending message'));

    expect(retryMessage).toHaveBeenCalledWith('thread-1', QUESTION.id);
    expect(mockRetrySend).not.toHaveBeenCalled();
  });

  it('offers no Retry when there is nothing in this conversation to retry', () => {
    seedThread([QUESTION]);
    useChatExecutionStore.getState().setSendError('The reply stopped.', {
      conversationId: 'thread-1',
      retry: { kind: 'regenerate', messageId: 'gone' },
    });
    const screen = render(<ChatScreen />);
    act(() => mockComposerProps.onRefusedSendChange(true));

    expect(screen.getByText('The reply stopped.')).toBeTruthy();
    expect(screen.queryByLabelText('Retry sending message')).toBeNull();
  });

  it('a failure with no retry shows no Retry even with a refused draft', () => {
    seedThread([QUESTION]);
    useChatExecutionStore.getState().setSendError('This model cannot read images.', {
      conversationId: 'thread-1',
    });
    const screen = render(<ChatScreen />);
    act(() => mockComposerProps.onRefusedSendChange(true));

    expect(screen.queryByLabelText('Retry sending message')).toBeNull();
  });
});

describe('a quoted reply', () => {
  it('stays on screen when the send is refused and clears once one is accepted', async () => {
    const sendMessage = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    seedThread([QUESTION]);
    useChatExecutionStore.setState({ sendMessage });
    const screen = render(<ChatScreen />);
    act(() => mockMessageListProps.onQuoteReply(QUESTION));
    expect(screen.getByLabelText('Dismiss reply')).toBeTruthy();

    await act(async () => {
      await mockComposerProps.onSend('What about Q3?');
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Dismiss reply')).toBeTruthy();

    await act(async () => {
      await mockComposerProps.onSend('What about Q3?');
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('Dismiss reply')).toBeNull();
  });

  it('names a quoted answer by the model display name, never its registry ID', async () => {
    useTierStore.setState({ tier: 'max' });
    const model = requireMobileCloudModel((candidate) => {
      const name = getShortDisplayName(candidate.id, 'max');
      return name !== candidate.id && name !== UNKNOWN_MODEL_LABEL;
    }, 'Mobile Cloud model whose display name differs from its ID');
    const displayName = getShortDisplayName(model.id, 'max');
    const answer = {
      id: 'assistant-1',
      role: 'assistant',
      content: 'The capital of Australia is Canberra.',
      model: model.id,
      createdAt: '2026-06-20T00:00:01.000Z',
    };
    const sendMessage = jest.fn().mockResolvedValue(true);
    seedThread([QUESTION, answer]);
    useChatExecutionStore.setState({ sendMessage });
    const screen = render(<ChatScreen />);
    act(() => mockMessageListProps.onQuoteReply(answer));
    expect(screen.getByText(displayName)).toBeTruthy();

    await act(async () => {
      await mockComposerProps.onSend('And its population?');
    });

    const sentText = sendMessage.mock.calls[0]?.[1] as string;
    expect(sentText.startsWith(`> ${displayName}: ${answer.content}`)).toBe(true);
    expect(sentText).not.toContain(model.id);
  });

  it('quotes a Markdown answer as one plain line, in the reply bar and in the sent text', async () => {
    const answer = {
      id: 'assistant-2',
      role: 'assistant',
      content: [
        '# The History of Canals',
        '',
        'A canal is a deceptively **simple** idea: dig a channel and let water carry the load.',
      ].join('\n'),
      createdAt: '2026-06-20T00:00:01.000Z',
    };
    const plain =
      'The History of Canals A canal is a deceptively simple idea: dig a channel and let water carry the load.';
    const sendMessage = jest.fn().mockResolvedValue(true);
    seedThread([QUESTION, answer]);
    useChatExecutionStore.setState({ sendMessage });
    const screen = render(<ChatScreen />);
    act(() => mockMessageListProps.onQuoteReply(answer));
    expect(screen.getByText(plain)).toBeTruthy();

    await act(async () => {
      await mockComposerProps.onSend('Reply with one word: ok');
    });

    const sentText = sendMessage.mock.calls[0]?.[1] as string;
    expect(sentText).toBe(`> Assistant: ${plain}\n\nReply with one word: ok`);
  });

  it('cuts a long quote to one short line with an ellipsis', () => {
    const long = `## Locks\n\n${'Water rises and falls in the chamber. '.repeat(10)}`;
    const text = quotedReplyText(long);
    expect(text).not.toContain('\n');
    expect(text.startsWith('Locks Water rises')).toBe(true);
    expect(text.endsWith('...')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(153);
  });

  it('falls back to Assistant when the quoted model is not in the catalog', () => {
    expect(quotedReplyAuthor({ role: 'assistant', model: 'retired-model-id' })).toBe('Assistant');
    expect(quotedReplyAuthor({ role: 'assistant' })).toBe('Assistant');
    expect(quotedReplyAuthor({ role: 'user', model: 'retired-model-id' })).toBe('You');
  });
});
