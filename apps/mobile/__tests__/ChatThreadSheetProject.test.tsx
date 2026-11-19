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
        };
      }
      return <View testID="composer" />;
    },
  };
});

let mockSheetProps: { conversationProjectId?: string | null } | null = null;
jest.mock('@/src/features/chat/components/AddToChatSheet', () => {
  const { View } = require('react-native');
  return {
    AddToChatSheet: (props: { conversationProjectId?: string | null }) => {
      mockSheetProps = props;
      return <View />;
    },
  };
});

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

const mockImageEditModelIds: ReadonlySet<string> = new Set();
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

const mockTurnVerdict: 'idle' | 'running' | 'stalled' = 'idle';
jest.mock('@/src/features/chat/inFlightTurnRecovery', () => ({
  ...jest.requireActual('@/src/features/chat/inFlightTurnRecovery'),
  useInFlightTurnRecovery: () => mockTurnVerdict,
}));

const mockRetiredNotice: string | null = null;
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

import ChatScreen from '../app/(app)/chat/[id]';
import { useChatStore } from '../stores/chatStore';

function seedThread(projectId?: string): void {
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
        ...(projectId ? { projectId } : {}),
      },
    ],
    messages: { 'thread-1': [] },
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { id: 'thread-1' };
  mockSheetProps = null;
});

describe('the Add to chat sheet in a thread', () => {
  it('is told the project the conversation belongs to', () => {
    seedThread('project-1');
    render(<ChatScreen />);

    expect(mockSheetProps?.conversationProjectId).toBe('project-1');
  });

  it('is told there is none for a conversation outside any project', () => {
    seedThread();
    render(<ChatScreen />);

    expect(mockSheetProps).not.toBeNull();
    expect(mockSheetProps?.conversationProjectId).toBeNull();
  });
});
