/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

let mockSearchParams: Record<string, string> = { id: 'thread-1' };
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: mockReplace,
  back: jest.fn(),
  canGoBack: () => false,
};

jest.mock('@clerk/expo', () => ({
  ...jest.requireActual('@clerk/expo'),
  useSession: () => ({ session: null }),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockSearchParams,
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
  onHasTextChange?: (hasText: boolean) => void;
  onOpenVoiceMode?: () => void;
}
const mockRetrySend = jest.fn();
let mockComposerProps = {} as MockComposerProps;
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
          captureAttachmentOperation: () => ({ isCurrent: () => true, addAttachments: jest.fn() }),
        };
      }
      return <View testID="composer" />;
    },
  };
});

let mockOnPhotos: (() => Promise<void>) | undefined;
jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return {
    AddToChatSheet: (props: { onPhotos?: () => Promise<void> }) => {
      mockOnPhotos = props.onPhotos;
      return <View />;
    },
  };
});

const mockDeleteCloudMessagesRemote = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('@/src/features/chat/services/cloudMessageMutations', () => ({
  ...jest.requireActual('@/src/features/chat/services/cloudMessageMutations'),
  deleteCloudMessagesRemote: (...args: unknown[]) => mockDeleteCloudMessagesRemote(...args),
}));

const mockPickImageAssets = jest.fn(async (_options: Record<string, unknown>) => []);
jest.mock('@/src/features/media/photo-picker', () => ({
  ...jest.requireActual('@/src/features/media/photo-picker'),
  pickImageAssetsFromLibrary: (options: Record<string, unknown>) => mockPickImageAssets(options),
}));

let mockPickerProps: { openSignal?: number; modelScope?: unknown } = {};
jest.mock('@/src/features/model-picker/components/ModelPickerSheet', () => {
  const { View } = require('react-native');
  return {
    ModelPickerSheet: (props: { openSignal?: number; modelScope?: unknown }) => {
      mockPickerProps = props;
      return <View />;
    },
  };
});

jest.mock('@/src/features/chat/components/PaywallBottomSheet', () => {
  const { View } = require('react-native');
  return { PaywallBottomSheet: () => <View /> };
});

jest.mock('@/src/features/chat/components/StyleSelector', () => {
  const { View } = require('react-native');
  return { StyleSelector: () => <View /> };
});

let mockImageEditModelIds: ReadonlySet<string> = new Set();
const mockImageEditOwners: Array<string | null> = [];
jest.mock('@/stores/chat/imageEditAdmissions', () => ({
  useImageEditModelIds: (ownerId: string | null) => {
    mockImageEditOwners.push(ownerId);
    return mockImageEditModelIds;
  },
}));

const mockRunImageGenerationTurn = jest.fn();
jest.mock('@/src/features/chat/actions/runImageGenerationTurn', () => ({
  ...jest.requireActual('@/src/features/chat/actions/runImageGenerationTurn'),
  runImageGenerationTurn: (...args: unknown[]) => mockRunImageGenerationTurn(...args),
}));

interface MockMessageListProps {
  onReaction: (messageId: string, reaction: 'thumbsUp' | 'thumbsDown' | null) => void;
  onSubmitRatingDetails?: (
    messageId: string,
    details: { reason: string | null; comment: string },
  ) => Promise<void>;
  onEditImageArea?: (message: unknown, edit: unknown) => void;
  onEditImage?: (message: unknown, edit: unknown) => void;
  onResearchPlanDecision?: (messageId: string, decision: unknown) => void;
  inTemporaryChat?: boolean;
  imageEditModelIds?: ReadonlySet<string>;
  onQuoteReply: (message: unknown) => void;
  onEditMessage: (messageId: string, content: string, attachments?: unknown[]) => unknown;
  editAttachmentsSupported?: boolean;
  highlightMessageId?: string;
  onFollowUp?: (prompt: string) => void;
  lastAnswerLiveRun?: string;
  continuableMessageId?: string | null;
  onDeleteMessage?: (messageId: string) => void;
  messages?: Array<{ content: string }>;
  footer?: React.ReactElement<{
    cached?: readonly string[];
    onFetched?: (messageId: string, suggestions: string[]) => void;
    fallbackTurn?: { assistantContent: string; userContent?: string; messageCount: number };
    searchUnavailable?: boolean;
  }> | null;
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

let mockTurnVerdict: 'idle' | 'running' | 'stalled' | 'checking' | 'unknown' | 'waiting' = 'idle';
jest.mock('@/src/features/chat/inFlightTurnRecovery', () => ({
  ...jest.requireActual('@/src/features/chat/inFlightTurnRecovery'),
  useInFlightTurnRecovery: () => mockTurnVerdict,
}));

let mockRetiredNotice: string | null = null;
jest.mock('@/src/features/model-picker/retirement', () => ({
  ...jest.requireActual('@/src/features/model-picker/retirement'),
  retiredModelNotice: () => mockRetiredNotice,
}));

let mockChooseModel: ((...args: unknown[]) => void) | undefined;
jest.mock('@/src/features/chat/components/ModelTierWarningBanner', () => {
  const { View } = require('react-native');
  return {
    ModelTierWarningBanner: (props: { onChooseModel?: (...args: unknown[]) => void }) => {
      mockChooseModel = props.onChooseModel;
      return <View testID="model-tier-banner" />;
    },
  };
});

let mockVoiceCaptureError: ((err: unknown) => void) | undefined;
jest.mock('@/src/features/voice/hooks/useVoiceConversation', () => {
  const actual = jest.requireActual('@/src/features/voice/hooks/useVoiceConversation');
  return {
    ...actual,
    useVoiceConversation: (options: { onCaptureError?: (err: unknown) => void }) => {
      mockVoiceCaptureError = options.onCaptureError;
      return actual.useVoiceConversation(options);
    },
  };
});

jest.mock('@/src/features/voice/components/LiveVoiceComposer', () => {
  const { View } = require('react-native');
  return {
    LiveVoiceComposer: ({ visible }: { visible: boolean }) =>
      visible ? <View testID="live-voice-composer" /> : null,
  };
});

import { NativeModules, Platform } from 'react-native';
import ChatScreen from '../app/(app)/chat/[id]';
import { VOICE_DISCLOSURE } from '../src/features/voice/components/VoiceOnboardingSheet';
import { useSettingsStore } from '../stores/settingsStore';
import { useChatExecutionStore, useChatStore } from '../stores/chatStore';
import { useProjectStore } from '../src/features/projects/store';
import { PAST_CHAT_HIGHLIGHT_PARAM } from '../src/features/chat/utils/referenceCitations';
import { useTierStore } from '../src/features/billing/store';
import { useWaitlistStore } from '../src/features/waitlist';
import { useAuthStore } from '../src/features/auth/store';
import {
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  chatAttachmentLimitsToWire,
  RESPONSE_RATING_RATE_LIMITED,
  supportsManagedMediaImageEdit,
} from '@agiworkforce/cloud-contracts';
import { requireCatalogModel, requireFreeMobileCloudModel } from '../test-utils/modelFixtures';
import { IN_FLIGHT_TURN_WAITING_MESSAGE } from '../src/features/chat/inFlightTurnRecovery';
import { ResponseRatingError } from '../stores/chat/responseRatingError';
import {
  applyServerAttachmentLimits,
  clearServerAttachmentLimits,
} from '../src/features/chat/upload/attachmentLimits';
import { attachmentLimitsFor } from '../src/features/chat/utils/attachmentValidation';
import { photoSelectionLimitForPlan } from '../src/features/chat/utils/photoSelectionLimit';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const { editMessage: realEditMessage, retryMessage: realRetryMessage } =
  useChatExecutionStore.getState();

const QUESTION = {
  id: 'user-1',
  role: 'user',
  content: 'Summarise the plan',
  createdAt: '2026-06-20T00:00:00.000Z',
};

function seedThread(messages: unknown[] = [QUESTION]): void {
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
  mockSearchParams = { id: 'thread-1' };
  mockTurnVerdict = 'idle';
  mockRetiredNotice = null;
  mockChooseModel = undefined;
  mockPickerProps = {};
  mockMessageListProps = {} as MockMessageListProps;
  mockComposerProps = {} as MockComposerProps;
  mockImageEditModelIds = new Set();
  mockImageEditOwners.length = 0;
  useProjectStore.setState({ projects: [], activeProjectId: null });
  useChatStore.setState({
    missingConversationId: null,
    messageLoadErrorConversationId: null,
    isLoadingMessages: false,
  } as never);
  useChatExecutionStore.setState({
    error: null,
    errorConversationId: null,
    errorRetry: null,
    editMessage: realEditMessage,
    retryMessage: realRetryMessage,
  });
});

describe('editing a question in the thread', () => {
  it('lets the edit sheet remove files and sends the files that are left', () => {
    seedThread();
    const editMessage = jest.fn(() => true);
    useChatExecutionStore.setState({ editMessage });
    render(<ChatScreen />);

    expect(mockMessageListProps.editAttachmentsSupported).toBe(true);
    const kept = [{ url: 'file:///kept.png', mimeType: 'image/png', fileName: 'kept.png' }];
    act(() => {
      mockMessageListProps.onEditMessage('user-1', 'Summarise the new plan', kept);
    });

    expect(editMessage).toHaveBeenCalledWith('thread-1', 'user-1', 'Summarise the new plan', kept);
  });
});

describe('opening a chat from a past-chat source', () => {
  it('points the list at the cited message', () => {
    seedThread();
    mockSearchParams = { id: 'thread-1', [PAST_CHAT_HIGHLIGHT_PARAM]: 'user-1' };
    render(<ChatScreen />);

    expect(mockMessageListProps.highlightMessageId).toBe('user-1');
  });

  it('highlights nothing when it was opened normally', () => {
    seedThread();
    render(<ChatScreen />);

    expect(mockMessageListProps).not.toHaveProperty('highlightMessageId');
  });
});

describe('the notice for a retired model', () => {
  it('offers a model and goes away when dismissed', () => {
    seedThread();
    mockRetiredNotice = 'This model was retired. New messages use another model.';
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('retired-model-notice')).toBeTruthy();
    expect(screen.getByLabelText('Choose a model')).toBeTruthy();

    const signalBefore = mockPickerProps.openSignal ?? 0;
    fireEvent.press(screen.getByLabelText('Choose a model'));
    expect(mockPickerProps.openSignal).toBe(signalBefore + 1);
    expect(mockPickerProps.modelScope).toBe('local');

    fireEvent.press(screen.getByLabelText('Dismiss'));

    expect(screen.queryByTestId('retired-model-notice')).toBeNull();
  });
});

describe('the model-tier banner', () => {
  it('is given a way to open the model picker', () => {
    seedThread();
    render(<ChatScreen />);

    const signalBefore = mockPickerProps.openSignal ?? 0;
    act(() => mockChooseModel?.({ nativeEvent: {} }));

    expect(mockPickerProps.openSignal).toBe(signalBefore + 1);
    expect(mockPickerProps.modelScope).toBe('local');
  });
});

describe('an answer that stopped arriving', () => {
  it('can be asked again from the notice', () => {
    seedThread();
    mockTurnVerdict = 'stalled';
    const retryMessage = jest.fn();
    useChatExecutionStore.setState({ retryMessage });
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('Retry'));

    expect(retryMessage).toHaveBeenCalledWith('thread-1', 'user-1');
  });

  it('goes away when dismissed', () => {
    seedThread();
    mockTurnVerdict = 'stalled';
    const screen = render(<ChatScreen />);
    expect(screen.getByTestId('chat-in-flight-turn')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Dismiss'));

    expect(screen.queryByTestId('chat-in-flight-turn')).toBeNull();
  });

  it('leaves a send that failed on this phone to its own error banner', () => {
    seedThread();
    mockTurnVerdict = 'stalled';
    useChatExecutionStore.setState({
      error: 'Message could not be sent. Please try again.',
      errorConversationId: 'thread-1',
    });
    const screen = render(<ChatScreen />);

    expect(screen.queryByTestId('chat-in-flight-turn')).toBeNull();
    expect(screen.queryByLabelText('Retry')).toBeNull();
    expect(screen.getByLabelText('Dismiss error')).toBeTruthy();
  });

  it('shows no Retry while the answer is still running', () => {
    seedThread();
    mockTurnVerdict = 'running';
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat-in-flight-turn')).toBeTruthy();
    expect(screen.queryByLabelText('Retry')).toBeNull();
  });

  const PARTIAL_ANSWER = {
    id: 'answer-partial',
    role: 'assistant',
    content: 'The plan has',
    createdAt: '2026-06-20T00:00:01.000Z',
  };

  function seedCloudThread(): void {
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 2,
          pinned: false,
          executionMode: 'cloud',
        },
      ],
      messages: { 'thread-1': [QUESTION, PARTIAL_ANSWER] },
    } as never);
  }

  it('reruns an answer that stopped being written', () => {
    seedThread([QUESTION, PARTIAL_ANSWER]);
    mockTurnVerdict = 'stalled';
    const retryMessage = jest.fn();
    useChatExecutionStore.setState({ retryMessage });
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('Retry'));

    expect(retryMessage).toHaveBeenCalledWith('thread-1', 'answer-partial');
  });

  it.each([
    ['running', 'live'],
    ['stalled', 'ended'],
    ['unknown', 'unknown'],
  ] as const)(
    'tells the list a Cloud answer the server reports as %s is %s',
    (verdict, liveRun) => {
      seedCloudThread();
      mockTurnVerdict = verdict;
      render(<ChatScreen />);

      expect(mockMessageListProps.lastAnswerLiveRun).toBe(liveRun);
    },
  );

  it('shows no notice while the status is unknown or still being checked', () => {
    seedCloudThread();
    mockTurnVerdict = 'unknown';
    const screen = render(<ChatScreen />);
    expect(screen.queryByTestId('chat-in-flight-turn')).toBeNull();

    mockTurnVerdict = 'checking';
    screen.rerender(<ChatScreen />);
    expect(screen.queryByTestId('chat-in-flight-turn')).toBeNull();
  });

  it('waits for an answer written elsewhere with no Retry and no Dismiss', () => {
    seedCloudThread();
    useChatStore.setState({ messages: { 'thread-1': [QUESTION] } } as never);
    mockTurnVerdict = 'waiting';
    const retryMessage = jest.fn();
    useChatExecutionStore.setState({ retryMessage });
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat-in-flight-turn')).toBeTruthy();
    expect(screen.getByText(IN_FLIGHT_TURN_WAITING_MESSAGE)).toBeTruthy();
    expect(screen.queryByLabelText('Retry')).toBeNull();
    expect(screen.queryByLabelText('Dismiss')).toBeNull();
    expect(retryMessage).not.toHaveBeenCalled();
  });

  it('leaves the wait to the error banner of a send that failed on this phone', () => {
    seedThread();
    mockTurnVerdict = 'waiting';
    useChatExecutionStore.setState({
      error: 'Message could not be sent. Please try again.',
      errorConversationId: 'thread-1',
    });
    const screen = render(<ChatScreen />);

    expect(screen.queryByTestId('chat-in-flight-turn')).toBeNull();
  });

  describe('Continue under a cut-off Cloud answer', () => {
    const RUN_MARKED_RUNNING = {
      schemaVersion: 1,
      sessionId: 'session-1',
      turnId: 'turn-1',
      lastSequence: 0,
      status: 'running',
      startedAtMs: 1_000,
      updatedAtMs: 1_000,
      entries: [],
    };

    function seedCutOffCloudAnswer(metadata: Record<string, unknown> = {}): void {
      seedCloudThread();
      useChatStore.setState(
        (state) =>
          ({
            conversations: state.conversations.map((conversation) => ({
              ...conversation,
              model: requireFreeMobileCloudModel().id,
            })),
            messages: {
              'thread-1': [
                QUESTION,
                { ...PARTIAL_ANSWER, metadata: { finishReason: 'length', ...metadata } },
              ],
            },
          }) as never,
      );
    }

    it('is hidden while history loads for an answer whose run is still marked running', () => {
      seedCutOffCloudAnswer({ agentActivity: RUN_MARKED_RUNNING });
      useChatStore.setState({ isLoadingMessages: true } as never);
      mockTurnVerdict = 'idle';
      render(<ChatScreen />);

      expect(mockMessageListProps.continuableMessageId).toBeNull();
    });

    it('stays offered while history loads for an answer with no run left unfinished', () => {
      seedCutOffCloudAnswer();
      useChatStore.setState({ isLoadingMessages: true } as never);
      mockTurnVerdict = 'idle';
      render(<ChatScreen />);

      expect(mockMessageListProps.continuableMessageId).toBe('answer-partial');
    });

    it.each(['idle', 'stalled'] as const)('is offered once the turn is %s', (verdict) => {
      seedCutOffCloudAnswer();
      mockTurnVerdict = verdict;
      render(<ChatScreen />);

      expect(mockMessageListProps.continuableMessageId).toBe('answer-partial');
    });

    it.each(['running', 'checking', 'unknown'] as const)(
      'is hidden while the turn is %s, so a second answer is never started',
      (verdict) => {
        seedCutOffCloudAnswer();
        mockTurnVerdict = verdict;
        render(<ChatScreen />);

        expect(mockMessageListProps.continuableMessageId).toBeNull();
      },
    );
  });
});

describe('deleting a message in a Cloud chat', () => {
  const ROWS = [
    { ...QUESTION, conversationId: 'thread-1', parentId: null },
    {
      id: 'answer-1',
      conversationId: 'thread-1',
      role: 'assistant',
      content: 'Three phases.',
      createdAt: '2026-06-20T00:00:01.000Z',
      parentId: 'user-1',
    },
  ];

  function seedCloudLeaf(): void {
    activateCloudAccount('thread-owner');
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({ conversations: [], messages: {} } as never);
    useChatCloudMessageStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 2,
          pinned: false,
          executionMode: 'cloud',
          activeLeafMessageId: 'answer-1',
        },
      ],
      messages: { 'thread-1': ROWS },
    } as never);
  }

  const cloudLeaf = () =>
    useChatCloudMessageStore.getState().conversations.find((c) => c.id === 'thread-1')
      ?.activeLeafMessageId;

  afterEach(() => {
    useChatCloudMessageStore.getState().clearCloudData();
    __resetCloudAccountSessionForTests();
  });

  it('puts the message and the thread position back when the server refuses the delete', async () => {
    seedCloudLeaf();
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    let refuse: (error: Error) => void = () => undefined;
    mockDeleteCloudMessagesRemote.mockImplementationOnce(
      () =>
        new Promise<undefined>((_resolve, reject) => {
          refuse = reject;
        }),
    );
    render(<ChatScreen />);

    act(() => mockMessageListProps.onDeleteMessage?.('answer-1'));
    expect(cloudLeaf()).toBe('user-1');

    await act(async () => {
      refuse(new Error('offline'));
    });

    expect(useChatCloudMessageStore.getState().messages['thread-1']?.map((m) => m.id)).toEqual([
      'user-1',
      'answer-1',
    ]);
    expect(cloudLeaf()).toBe('answer-1');
    expect(alert).toHaveBeenCalledWith(
      'Could not delete message',
      'Check your connection and try again.',
    );
    alert.mockRestore();
  });
});

describe('photos offered by the picker in a chat', () => {
  function seedMode(executionMode: 'cloud' | 'local'): void {
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 1,
          pinned: false,
          executionMode,
        },
      ],
      messages: { 'thread-1': [QUESTION] },
    } as never);
  }

  async function openPhotos(): Promise<number> {
    render(<ChatScreen />);
    expect(mockOnPhotos).toBeTruthy();
    await act(async () => {
      await mockOnPhotos?.();
    });
    expect(mockPickImageAssets).toHaveBeenCalledTimes(1);
    return mockPickImageAssets.mock.calls[0]![0]['selectionLimit'] as number;
  }

  afterEach(() => clearServerAttachmentLimits());

  it('offers no more photos in Cloud than the attachment limits keep', async () => {
    seedMode('cloud');
    applyServerAttachmentLimits(
      chatAttachmentLimitsToWire({
        ...CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
        maxFilesPerMessage: 3,
      }),
    );

    const limit = await openPhotos();

    expect(limit).toBe(attachmentLimitsFor('cloud', 'max').filesPerMessage);
    expect(limit).toBe(3);
  });

  it('keeps the plan limit in Local, where nothing is uploaded', async () => {
    seedMode('local');
    applyServerAttachmentLimits(
      chatAttachmentLimitsToWire({
        ...CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
        maxFilesPerMessage: 3,
      }),
    );

    const limit = await openPhotos();

    expect(limit).toBe(photoSelectionLimitForPlan('max'));
  });
});

describe('suggested follow-ups under a finished Cloud answer', () => {
  const ANSWER = {
    id: 'answer-1',
    role: 'assistant',
    content: 'The plan has three phases: research, build and launch.',
    createdAt: '2026-06-20T00:00:01.000Z',
  };

  function seedCloudAnswer(metadata?: Record<string, unknown>): void {
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useChatStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Quarterly plan',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 2,
          pinned: false,
          executionMode: 'cloud',
        },
      ],
      messages: { 'thread-1': [QUESTION, { ...ANSWER, ...(metadata ? { metadata } : {}) }] },
    } as never);
  }

  it('shows the ones saved on the answer without asking again', () => {
    seedCloudAnswer({ followUpSuggestions: ['What does research cost?', 'Who builds it?'] });
    render(<ChatScreen />);

    expect(mockMessageListProps.footer?.props.cached).toEqual([
      'What does research cost?',
      'Who builds it?',
    ]);
  });

  it('keeps the ones it fetched on the answer for the next time the chat opens', () => {
    seedCloudAnswer();
    render(<ChatScreen />);
    expect(mockMessageListProps.footer?.props.cached).toBeUndefined();

    act(() => {
      mockMessageListProps.footer?.props.onFetched?.('answer-1', ['When is the launch?']);
    });

    const answer = useChatStore
      .getState()
      .messages['thread-1']?.find((message) => message.id === 'answer-1');
    expect(answer?.metadata?.followUpSuggestions).toEqual(['When is the launch?']);
    expect(mockMessageListProps.footer?.props.cached).toEqual(['When is the launch?']);
  });

  it('steps aside while the person types a message and comes back when the box is empty', () => {
    seedCloudAnswer({ followUpSuggestions: ['What does research cost?'] });
    render(<ChatScreen />);
    expect(mockMessageListProps.footer).toBeTruthy();

    act(() => mockComposerProps.onHasTextChange?.(true));
    expect(mockMessageListProps.footer).toBeNull();

    act(() => mockComposerProps.onHasTextChange?.(false));
    expect(mockMessageListProps.footer?.props.cached).toEqual(['What does research cost?']);
  });

  it('gives the suggestions this turn to derive from when none were generated', () => {
    seedCloudAnswer();
    render(<ChatScreen />);

    expect(mockMessageListProps.footer?.props.fallbackTurn).toEqual({
      assistantContent: ANSWER.content,
      userContent: QUESTION.content,
      messageCount: 2,
    });
    expect(mockMessageListProps.footer?.props.searchUnavailable).toBe(false);
  });

  it('tells the suggestions when web search was unavailable for the answer', () => {
    seedCloudAnswer({
      agentActivity: {
        entries: [{ kind: 'tool', category: 'web-search', unavailable: true }],
      },
    });
    render(<ChatScreen />);

    expect(mockMessageListProps.footer?.props.searchUnavailable).toBe(true);
  });
});

describe('the handlers given to every answer while one streams', () => {
  it('keep their identity as tokens arrive, so finished answers do not draw again', () => {
    seedThread([
      QUESTION,
      {
        id: 'answer-1',
        role: 'assistant',
        content: 'The plan',
        createdAt: '2026-06-20T00:00:01.000Z',
        isStreaming: true,
      },
    ]);
    render(<ChatScreen />);
    const before = mockMessageListProps.onFollowUp;

    act(() => {
      useChatStore.setState({
        messages: {
          'thread-1': [
            QUESTION,
            {
              id: 'answer-1',
              role: 'assistant',
              content: 'The plan has three phases',
              createdAt: '2026-06-20T00:00:01.000Z',
              isStreaming: true,
            },
          ],
        },
      } as never);
    });

    expect(mockMessageListProps.messages?.[1]?.content).toBe('The plan has three phases');
    expect(before).toBeDefined();
    expect(mockMessageListProps.onFollowUp).toBe(before);
  });

  it('keeps every handler and shared value the rows read while the streaming answer grows', () => {
    const finished = {
      id: 'answer-0',
      role: 'assistant',
      content: 'An earlier answer',
      createdAt: '2026-06-20T00:00:00.500Z',
    };
    const QUESTION_FOLLOW_UP = {
      id: 'user-2',
      role: 'user',
      content: 'And the timeline?',
      createdAt: '2026-06-20T00:00:00.800Z',
    };
    const streamingAnswer = (content: string) => ({
      id: 'answer-1',
      role: 'assistant',
      content,
      createdAt: '2026-06-20T00:00:01.000Z',
      isStreaming: true,
    });
    seedThread([QUESTION, finished, QUESTION_FOLLOW_UP, streamingAnswer('The plan')]);
    render(<ChatScreen />);
    const before = { ...mockMessageListProps } as Record<string, unknown>;

    act(() => {
      useChatStore.setState({
        messages: {
          'thread-1': [
            QUESTION,
            finished,
            QUESTION_FOLLOW_UP,
            streamingAnswer('The plan has three phases'),
          ],
        },
        streamingContent: 'The plan has three phases',
      } as never);
    });

    const after = mockMessageListProps as unknown as Record<string, unknown>;
    expect(after.messages).not.toBe(before.messages);
    const changed = Object.keys(after).filter(
      (key) =>
        key !== 'messages' &&
        key !== 'footer' &&
        typeof after[key] !== 'string' &&
        typeof after[key] !== 'number' &&
        typeof after[key] !== 'boolean' &&
        after[key] !== undefined &&
        after[key] !== null &&
        after[key] !== before[key],
    );
    expect(changed).toEqual([]);
  });
});

describe('editing an area of a generated image', () => {
  const EDITING_IMAGE_MODEL = requireCatalogModel(
    (model) => model.modelType === 'image' && supportsManagedMediaImageEdit(model.imageApi),
    'image model that edits images',
  ).id;

  function seedCloudImage(): void {
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
    useAuthStore.setState({ clerkUserId: 'image-owner', isClerkSignedIn: true } as never);
    useChatStore.setState({
      conversations: [
        {
          id: 'thread-1',
          title: 'Poster',
          createdAt: '2026-06-20T00:00:00.000Z',
          updatedAt: '2026-06-20T00:00:00.000Z',
          messageCount: 2,
          pinned: false,
          executionMode: 'cloud',
        },
      ],
      messages: {
        'thread-1': [
          QUESTION,
          {
            id: 'image-1',
            role: 'assistant',
            content: 'Generated image',
            createdAt: '2026-06-20T00:00:01.000Z',
            type: 'image',
            model: EDITING_IMAGE_MODEL,
            imageUrl: '/api/files/poster',
          },
        ],
      },
    } as never);
  }

  afterEach(() => {
    useAuthStore.setState({ clerkUserId: null, isClerkSignedIn: false } as never);
  });

  it('is offered only when the server says the model edits images', () => {
    seedCloudImage();
    mockImageEditModelIds = new Set([EDITING_IMAGE_MODEL]);
    render(<ChatScreen />);

    expect(mockImageEditOwners).toContain('image-owner');
    expect(mockMessageListProps.onEditImageArea).toBeDefined();
  });

  it('tells the list which models the server admits for editing', () => {
    seedCloudImage();
    const admitted = new Set([EDITING_IMAGE_MODEL]);
    mockImageEditModelIds = admitted;
    render(<ChatScreen />);

    expect(mockMessageListProps.imageEditModelIds).toBe(admitted);
  });

  it('is not offered when the server does not list the model as editing', () => {
    seedCloudImage();
    render(<ChatScreen />);

    expect(mockImageEditOwners).toContain('image-owner');
    expect(mockMessageListProps.onEditImageArea).toBeUndefined();
  });

  it('does not ask the server in a Local chat', () => {
    seedThread();
    render(<ChatScreen />);

    expect(mockImageEditOwners.every((owner) => owner === null)).toBe(true);
  });

  it('runs a whole-image change as an edit of that image with the model that made it', () => {
    seedCloudImage();
    mockImageEditModelIds = new Set([EDITING_IMAGE_MODEL]);
    render(<ChatScreen />);
    const image = useChatStore.getState().messages['thread-1']?.[1];

    act(() => {
      mockMessageListProps.onEditImage?.(image, {
        operation: 'edit',
        prompt: 'Make the sky orange',
        sourceBase64: 'c291cmNl',
      });
    });

    expect(mockRunImageGenerationTurn).toHaveBeenCalledTimes(1);
    expect(mockRunImageGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'thread-1',
        ownerId: 'image-owner',
        model: EDITING_IMAGE_MODEL,
        operation: 'edit',
        prompt: 'Make the sky orange',
        displayText: 'Make the sky orange',
        sourceImageBase64: 'c291cmNl',
      }),
    );
  });

  it('runs another shape as a new image that Retry replays', () => {
    seedCloudImage();
    mockImageEditModelIds = new Set([EDITING_IMAGE_MODEL]);
    render(<ChatScreen />);
    const image = useChatStore.getState().messages['thread-1']?.[1];

    act(() => {
      mockMessageListProps.onEditImage?.(image, {
        operation: 'reshape',
        prompt: 'A poster of a lighthouse',
        aspectRatio: '16:9',
      });
    });

    expect(mockRunImageGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: EDITING_IMAGE_MODEL,
        prompt: 'A poster of a lighthouse',
        displayText: 'Make it 16:9',
        replayOnRetry: true,
      }),
    );
  });

  it('runs a variation as an edit of that image with its own label', () => {
    seedCloudImage();
    mockImageEditModelIds = new Set([EDITING_IMAGE_MODEL]);
    render(<ChatScreen />);
    const image = useChatStore.getState().messages['thread-1']?.[1];

    act(() => {
      mockMessageListProps.onEditImage?.(image, {
        operation: 'variation',
        prompt: 'A lighthouse at dusk',
        sourceBase64: 'c291cmNl',
      });
    });

    expect(mockRunImageGenerationTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        model: EDITING_IMAGE_MODEL,
        operation: 'variation',
        displayText: 'Make a variation',
        sourceImageBase64: 'c291cmNl',
      }),
    );
  });

  it('refuses a change to an image whose model is not recorded, and says why', () => {
    seedCloudImage();
    mockImageEditModelIds = new Set([EDITING_IMAGE_MODEL]);
    render(<ChatScreen />);
    const image = useChatStore.getState().messages['thread-1']?.[1];
    const alert = jest
      .spyOn(require('react-native').Alert, 'alert')
      .mockImplementation(() => undefined);

    try {
      act(() => {
        mockMessageListProps.onEditImage?.(
          { ...image, model: undefined },
          { operation: 'variation', prompt: 'Lighthouse', sourceBase64: 'c291cmNl' },
        );
      });

      expect(mockRunImageGenerationTurn).not.toHaveBeenCalled();
      expect(alert).toHaveBeenCalledWith(
        'This image cannot be edited',
        'The model that made it is not recorded with it. Describe the change in a new message instead.',
      );
    } finally {
      alert.mockRestore();
    }
  });

  it('offers no whole-image change when the server does not list the model as editing', () => {
    seedCloudImage();
    render(<ChatScreen />);

    expect(mockMessageListProps.onEditImage).toBeUndefined();
    expect(mockMessageListProps.inTemporaryChat).toBe(false);
  });
});

describe('starting a research plan', () => {
  const realResumeResearch = useChatExecutionStore.getState().resumeResearch;

  afterEach(() => {
    useChatExecutionStore.setState({ resumeResearch: realResumeResearch });
  });

  it('passes the answers to the plan questions with the start', async () => {
    seedThread();
    const resumeResearch = jest.fn(async () => undefined);
    useChatExecutionStore.setState({ resumeResearch });
    render(<ChatScreen />);
    const steps = [{ id: 's1', type: 'search', description: 'Look', status: 'pending' }];
    const choices = {
      deliverable: { depth: 'standard' },
      sources: { files: false, allowDomains: [], denyDomains: [], connectors: [] },
    };

    await act(async () => {
      mockMessageListProps.onResearchPlanDecision?.('answer-1', {
        steps,
        choices,
        answers: 'Q: Which region?\nA: Europe',
      });
    });

    expect(resumeResearch).toHaveBeenCalledWith(
      'thread-1',
      'answer-1',
      'start',
      steps,
      choices,
      'Q: Which region?\nA: Europe',
    );
  });
});

describe('rating an answer', () => {
  const realSetMessageReaction = useChatStore.getState().setMessageReaction;

  afterEach(() => {
    useChatStore.setState({ setMessageReaction: realSetMessageReaction } as never);
  });

  async function rateAndFail(error: unknown): Promise<jest.SpyInstance> {
    seedThread();
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    useChatStore.setState({
      setMessageReaction: jest.fn(() => Promise.reject(error)),
    } as never);
    render(<ChatScreen />);
    await act(async () => {
      mockMessageListProps.onReaction('user-1', 'thumbsUp');
    });
    return alert;
  }

  it('says the server could not be reached when the rating fails on the network', async () => {
    const alert = await rateAndFail(new Error('TypeError: Network request failed'));

    expect(alert).toHaveBeenCalledWith(
      'Could not save rating',
      'Could not reach the server. Check your connection and try again.',
    );
  });

  it('lets an answer in a Cloud chat take a reason, and sends it for that chat', async () => {
    const realSubmit = useChatStore.getState().submitResponseRatingDetails;
    const submitResponseRatingDetails = jest.fn(async () => undefined);
    useTierStore.setState({ tier: 'max' });
    useWaitlistStore.setState({ cloudUnlocked: true });
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
      submitResponseRatingDetails,
    } as never);
    render(<ChatScreen />);

    await act(async () => {
      await mockMessageListProps.onSubmitRatingDetails?.('answer-1', {
        reason: 'style',
        comment: 'Too formal',
      });
    });

    expect(submitResponseRatingDetails).toHaveBeenCalledWith('thread-1', 'answer-1', {
      reason: 'style',
      comment: 'Too formal',
    });
    useChatStore.setState({ submitResponseRatingDetails: realSubmit } as never);
  });

  it('offers no reason to an answer in a Local chat, which sends no rating', () => {
    seedThread();
    render(<ChatScreen />);

    expect(mockMessageListProps.onReaction).toBeDefined();
    expect(mockMessageListProps.onSubmitRatingDetails).toBeUndefined();
  });

  it('shows the sentence the rating gave, such as the one for going too fast', async () => {
    const alert = await rateAndFail(new ResponseRatingError(RESPONSE_RATING_RATE_LIMITED));

    expect(alert).toHaveBeenCalledWith('Could not save rating', RESPONSE_RATING_RATE_LIMITED);
  });

  it('never shows the raw error text of a failed rating', async () => {
    const alert = await rateAndFail(new Error('SQLITE_BUSY: database is locked'));

    expect(alert).toHaveBeenCalledWith(
      'Could not save rating',
      'Check your connection or sign in, then try again.',
    );
  });
});

describe('a voice capture that fails in an open chat', () => {
  it('offers Open Settings when the microphone permission was refused', () => {
    const { VoiceCaptureError } = jest.requireActual('@/src/features/voice/services/voiceInput');
    seedThread();
    const alert = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    render(<ChatScreen />);

    act(() => {
      mockVoiceCaptureError?.(new VoiceCaptureError('mic-permission-denied', 'denied'));
    });

    expect(mockVoiceCaptureError).toBeDefined();
    const [title, , buttons] = alert.mock.calls.at(-1) ?? [];
    expect(title).toBe('Voice input unavailable');
    expect((buttons as { text?: string }[]).map((button) => button.text)).toContain(
      'Open Settings',
    );
    alert.mockRestore();
  });
});

describe('voice mode in an open Local chat on a phone without an on-device recognizer', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  const runOn = (os: 'ios' | 'android', version: number | string) => {
    Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => version, configurable: true });
  };

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => originalOS, configurable: true });
    Object.defineProperty(Platform, 'Version', { get: () => originalVersion, configurable: true });
  });

  it('gives the composer no voice mode on Android API 32', () => {
    runOn('android', 32);
    seedThread();

    render(<ChatScreen />);

    expect(mockComposerProps.onOpenVoiceMode).toBeUndefined();
  });

  it('gives the composer voice mode on Android API 33', () => {
    runOn('android', 33);
    seedThread();

    render(<ChatScreen />);

    expect(mockComposerProps.onOpenVoiceMode).toEqual(expect.any(Function));
  });

  it('ignores a link that asks for voice on Android API 32', () => {
    runOn('android', 32);
    useSettingsStore.setState({ voiceEnabled: true, voiceOnboardingSeen: true });
    mockSearchParams = { id: 'thread-1', voice: 'live' };
    seedThread();

    const screen = render(<ChatScreen />);

    expect(screen.queryByTestId('voice-inline-bar')).toBeNull();
    expect(screen.queryByText(VOICE_DISCLOSURE['on-device'])).toBeNull();
    expect(screen.getByTestId('composer')).toBeTruthy();
  });

  it('opens turn-based voice from the same link on Android API 33', () => {
    runOn('android', 33);
    useSettingsStore.setState({ voiceEnabled: true, voiceOnboardingSeen: true });
    mockSearchParams = { id: 'thread-1', voice: 'live' };
    seedThread();

    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('voice-inline-bar')).toBeTruthy();
  });

  describe('in a Cloud chat where live voice is available on Android API 32', () => {
    const nativeModules = NativeModules as Record<string, unknown>;
    const originalWebRtc = nativeModules['WebRTCModule'];

    const seedLiveVoiceThread = () => {
      runOn('android', 32);
      nativeModules['WebRTCModule'] = {};
      useWaitlistStore.setState({ cloudUnlocked: true });
      useAuthStore.setState({ clerkUserId: 'voice-owner', isClerkSignedIn: true } as never);
      useSettingsStore.setState({ voiceEnabled: true, voiceOnboardingSeen: true });
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
    };

    afterEach(() => {
      if (originalWebRtc === undefined) delete nativeModules['WebRTCModule'];
      else nativeModules['WebRTCModule'] = originalWebRtc;
      useAuthStore.setState({ clerkUserId: null, isClerkSignedIn: false } as never);
    });

    it('gives the composer voice mode', () => {
      seedLiveVoiceThread();

      render(<ChatScreen />);

      expect(mockComposerProps.onOpenVoiceMode).toEqual(expect.any(Function));
    });

    it('opens live voice from a link that asks for it', () => {
      seedLiveVoiceThread();
      mockSearchParams = { id: 'thread-1', voice: 'live' };

      const screen = render(<ChatScreen />);

      expect(screen.getByTestId('live-voice-composer')).toBeTruthy();
      expect(screen.queryByTestId('voice-inline-bar')).toBeNull();
    });
  });
});
