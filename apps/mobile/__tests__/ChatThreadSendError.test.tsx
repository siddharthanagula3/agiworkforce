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
  onFollowUp?: (prompt: string) => void;
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

let mockImageRequest: unknown = null;
jest.mock('@/src/features/chat/actions/resolveMobileImageGenerationRequest', () => {
  const actual = jest.requireActual(
    '@/src/features/chat/actions/resolveMobileImageGenerationRequest',
  );
  return {
    ...actual,
    resolveMobileImageGenerationRequest: (...args: unknown[]) =>
      mockImageRequest ?? actual.resolveMobileImageGenerationRequest(...args),
  };
});

let mockVideoRequest: unknown = null;
jest.mock('@/src/features/chat/actions/resolveMobileVideoGenerationRequest', () => {
  const actual = jest.requireActual(
    '@/src/features/chat/actions/resolveMobileVideoGenerationRequest',
  );
  return {
    ...actual,
    resolveMobileVideoGenerationRequest: (...args: unknown[]) =>
      mockVideoRequest ?? actual.resolveMobileVideoGenerationRequest(...args),
  };
});

const mockRunVideoGenerationTurn = jest.fn();
jest.mock('@/src/features/chat/actions/runVideoGenerationTurn', () => ({
  ...jest.requireActual('@/src/features/chat/actions/runVideoGenerationTurn'),
  runVideoGenerationTurn: (...args: unknown[]) => mockRunVideoGenerationTurn(...args),
}));

const mockEnsureCloudSendConsent = jest.fn();
jest.mock('@/services/llmGate', () => ({
  ...jest.requireActual('@/services/llmGate'),
  ensureCloudSendConsent: () => mockEnsureCloudSendConsent(),
}));

const mockRunImageGenerationTurn = jest.fn();
jest.mock('@/src/features/chat/actions/runImageGenerationTurn', () => ({
  ...jest.requireActual('@/src/features/chat/actions/runImageGenerationTurn'),
  runImageGenerationTurn: (...args: unknown[]) => mockRunImageGenerationTurn(...args),
}));

import { Alert } from 'react-native';
import ChatScreen from '../app/(app)/chat/[id]';
import { REDUCED_SENSITIVE_CONTENT_REFUSAL } from '../lib/contentFilter';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';
import { useTierStore } from '../src/features/billing/store';
import { getShortDisplayName, UNKNOWN_MODEL_LABEL } from '../src/features/model-picker/service';
import { quotedReplyAuthor, quotedReplyText } from '../src/features/chat/components/QuotedReplyBar';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';
import { useModelStore } from '../src/features/model-picker/store';
import { useModelInstallStore } from '../src/features/model-picker/installStore';
import {
  platformSystemModelId,
  useSystemModelSession,
} from '../src/features/model-picker/systemModelAvailability';
import { DEFAULT_LOCAL_MODEL_ID, LOCAL_MODEL_LIST } from '../src/features/model-picker/service';
import { CloudProviderConsentDeclinedError } from '../services/llmGate';
import { mediaGenerationFailureMessage } from '../src/features/chat/actions/mediaGenerationError';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
  invalidateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '../src/features/auth/store';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { installCloudModeDoor } from '../src/features/chat/store/cloudModeDoor';
import {
  CLOUD_PROVIDER_CONSENT_ALLOW_LABEL,
  CLOUD_PROVIDER_CONSENT_DECLINE_LABEL,
  CLOUD_PROVIDER_SHARING_LABEL,
  ensureCloudProviderConsent,
  withdrawCloudProviderConsent,
} from '../services/providerConsent';

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
  mockEnsureCloudSendConsent.mockResolvedValue(undefined);
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

describe('a Local reply the built-in model could not give', () => {
  const SYSTEM_MODEL_ID = platformSystemModelId('ios')!;
  const DOWNLOADED_MODEL = LOCAL_MODEL_LIST.find(
    (model) => (model.fileSizeBytes ?? 0) > 0 && model.id !== DEFAULT_LOCAL_MODEL_ID,
  )!;
  const SYSTEM_FAILED =
    'Apple Intelligence could not finish this reply on this device. Try again, or choose another on-device model.';

  function seedSystemModelThread(): void {
    useChatStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 1,
          pinned: false,
          model: SYSTEM_MODEL_ID,
          executionMode: 'local',
        },
      ],
      messages: { 'thread-1': [QUESTION] },
    } as never);
    useModelStore.setState({ selectedModel: SYSTEM_MODEL_ID, selectedProvider: 'local' });
    useChatExecutionStore.getState().setSendError(SYSTEM_FAILED, {
      conversationId: 'thread-1',
      retry: { kind: 'regenerate', messageId: QUESTION.id },
    });
  }

  beforeEach(() => {
    useSystemModelSession.setState({ failedModelIds: [], unreadySinceFailureIds: [] });
    useModelInstallStore.setState({ installedModelIds: [], readySystemModelIds: [] });
  });

  it('offers the model list when nothing else is downloaded', () => {
    useSystemModelSession.setState({ failedModelIds: [SYSTEM_MODEL_ID] });
    seedSystemModelThread();
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('Open Models'));

    expect(mockPush).toHaveBeenCalledWith('/(app)/models');
  });

  it('offers a downloaded model in one tap', () => {
    useSystemModelSession.setState({ failedModelIds: [SYSTEM_MODEL_ID] });
    useModelInstallStore.setState({ installedModelIds: [DOWNLOADED_MODEL.id] });
    seedSystemModelThread();
    const screen = render(<ChatScreen />);

    const name = getShortDisplayName(DOWNLOADED_MODEL.id, useTierStore.getState().tier);
    expect(screen.getByLabelText(`Use ${name}`)).toBeTruthy();
  });

  it('keeps the plain failure while the built-in model has not failed this session', () => {
    seedSystemModelThread();
    const screen = render(<ChatScreen />);

    expect(screen.getByText(SYSTEM_FAILED)).toBeTruthy();
    expect(screen.queryByLabelText('Open Models')).toBeNull();
  });
});

describe('a message Reduce sensitive content refuses inside a chat', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    useSettingsStore.setState({ reduceSensitiveContent: true });
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockImageRequest = null;
    useSettingsStore.setState({ reduceSensitiveContent: false });
    alertSpy.mockRestore();
  });

  function readyImageRequest(prompt: string) {
    mockImageRequest = {
      status: 'ready',
      prompt,
      model: 'fixture-image-model',
      ownerId: 'user-1',
    };
  }

  it('makes no image and says why', async () => {
    seedThread([QUESTION]);
    readyImageRequest('explicit sexual content');
    render(<ChatScreen />);

    let accepted: unknown;
    await act(async () => {
      accepted = await mockComposerProps.onSend('explicit sexual content');
    });

    expect(accepted).toBe(false);
    expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Content not available',
      REDUCED_SENSITIVE_CONTENT_REFUSAL,
    );
  });

  it('sends nothing for a refused text message and shows the alert once', async () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    seedThread([QUESTION]);
    useChatExecutionStore.setState({ sendMessage });
    render(<ChatScreen />);

    await act(async () => {
      await mockComposerProps.onSend('explicit sexual content');
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('still makes an image it allows', async () => {
    seedThread([QUESTION]);
    readyImageRequest('A lighthouse at dawn');
    render(<ChatScreen />);

    await act(async () => {
      await mockComposerProps.onSend('A lighthouse at dawn');
    });

    expect(mockRunImageGenerationTurn).toHaveBeenCalledTimes(1);
    expect(mockRunImageGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'thread-1', prompt: 'A lighthouse at dawn' }),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('a picture or video asked for inside a chat before sharing with AI providers is allowed', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockRunImageGenerationTurn.mockImplementation(async (input: { onStarted?: () => void }) => {
      input.onStarted?.();
      return { status: 'completed', assistantMessageId: 'answer-1' };
    });
    mockRunVideoGenerationTurn.mockImplementation(async (input: { onStarted?: () => void }) => {
      input.onStarted?.();
      return { status: 'completed', assistantMessageId: 'answer-1' };
    });
  });

  afterEach(() => {
    mockImageRequest = null;
    mockVideoRequest = null;
    alertSpy.mockRestore();
  });

  function readyImage(prompt: string) {
    mockImageRequest = { status: 'ready', prompt, model: 'fixture-image-model', ownerId: 'user-1' };
  }

  function readyVideo(prompt: string) {
    mockVideoRequest = { status: 'ready', prompt, model: 'fixture-video-model', ownerId: 'user-1' };
  }

  async function send(text: string): Promise<unknown> {
    let accepted: unknown;
    await act(async () => {
      accepted = await mockComposerProps.onSend(text);
    });
    return accepted;
  }

  it.each([
    ['picture', readyImage, mockRunImageGenerationTurn],
    ['video', readyVideo, mockRunVideoGenerationTurn],
  ] as const)(
    'makes no %s, shows no failure and leaves the words in the composer when the person says Not now',
    async (_kind, ready, run) => {
      mockEnsureCloudSendConsent.mockRejectedValue(new CloudProviderConsentDeclinedError());
      seedThread([QUESTION]);
      ready('A lighthouse at dawn');
      render(<ChatScreen />);

      const accepted = await send('A lighthouse at dawn');

      expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
      expect(accepted).toBe(false);
      expect(run).not.toHaveBeenCalled();
      expect(useChatExecutionStore.getState().error).toBeNull();
      expect(useChatStore.getState().messages['thread-1']).toEqual([QUESTION]);
      expect(alertSpy).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['picture', readyImage, 'image', mockRunImageGenerationTurn],
    ['video', readyVideo, 'video', mockRunVideoGenerationTurn],
  ] as const)(
    'says the %s could not be made when the sharing question fails, from the composer and from a follow-up',
    async (_kind, ready, media, run) => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockEnsureCloudSendConsent.mockRejectedValue(
        new Error('The provider list could not be opened'),
      );
      seedThread([QUESTION]);
      ready('A lighthouse at dawn');
      render(<ChatScreen />);

      try {
        const accepted = await send('A lighthouse at dawn');

        expect(accepted).toBe(false);
        expect(useChatExecutionStore.getState().error).toBe(mediaGenerationFailureMessage(media));

        useChatExecutionStore.setState({ error: null, errorConversationId: null });
        await act(async () => {
          mockMessageListProps.onFollowUp?.('A lighthouse at dawn');
        });

        expect(useChatExecutionStore.getState().error).toBe(mediaGenerationFailureMessage(media));
        expect(run).not.toHaveBeenCalled();
        expect(alertSpy).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it.each([
    ['picture', readyImage, mockRunImageGenerationTurn],
    ['video', readyVideo, mockRunVideoGenerationTurn],
  ] as const)('makes the %s once sharing is allowed', async (_kind, ready, run) => {
    seedThread([QUESTION]);
    ready('A lighthouse at dawn');
    render(<ChatScreen />);

    const accepted = await send('A lighthouse at dawn');

    expect(mockEnsureCloudSendConsent).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'thread-1', prompt: 'A lighthouse at dawn' }),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe('a send in a Cloud chat this account has not allowed to share with AI providers', () => {
  let uninstallDoor: () => void;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    __resetCloudAccountSessionForTests();
    activateCloudAccount('send-owner');
    useAuthStore.setState({ isClerkSignedIn: true, clerkUserId: 'send-owner' });
    withdrawCloudProviderConsent();
    useChatAppModeStore.setState({ appMode: 'local' });
    uninstallDoor = installCloudModeDoor();
    useTierStore.setState({ tier: 'pro' });
    useChatStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 1,
          pinned: false,
          executionMode: 'cloud',
        },
      ],
      messages: { 'thread-1': [QUESTION] },
    } as never);
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

  function sharingQuestions(): unknown[][] {
    return alert.mock.calls.filter(([title]) => title === `${CLOUD_PROVIDER_SHARING_LABEL}?`);
  }

  async function answerLastQuestion(label: string): Promise<void> {
    const questions = sharingQuestions();
    const buttons = questions[questions.length - 1]?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    buttons.find((button) => button.text === label)?.onPress?.();
    await settle();
  }

  async function sendFromComposer(text: string): Promise<unknown> {
    let accepted: unknown;
    await act(async () => {
      accepted = await mockComposerProps.onSend(text);
    });
    await settle();
    return accepted;
  }

  it('asks again on Send after Not now, keeps the draft, and sends once AGI Cloud is open', async () => {
    const sendMessage = jest.fn().mockResolvedValue(true);
    useChatExecutionStore.setState({ sendMessage });
    render(<ChatScreen />);
    await settle();
    expect(sharingQuestions()).toHaveLength(1);
    await answerLastQuestion(CLOUD_PROVIDER_CONSENT_DECLINE_LABEL);

    expect(await sendFromComposer('Next steps?')).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sharingQuestions()).toHaveLength(2);

    await answerLastQuestion(CLOUD_PROVIDER_CONSENT_ALLOW_LABEL);
    expect(useChatAppModeStore.getState().appMode).toBe('cloud');

    await sendFromComposer('Next steps?');
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]?.[1]).toBe('Next steps?');
  });
});
