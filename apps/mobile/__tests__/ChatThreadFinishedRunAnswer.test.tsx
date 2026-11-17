/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { AGENT_EVENT_SCHEMA_VERSION, type CloudAgentRun } from '@agiworkforce/cloud-contracts';
import type { AgentEventEnvelope } from '@agiworkforce/types/protocol';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import { SYNTHETIC_CLOUD_MODEL_ID } from '../test-utils/modelFixtures';

const CONVERSATION_ID = '01a1e712-6f5a-7000-9bb3-05395af29301';
const QUESTION_ID = '01a1e712-6f5a-7001-9bb3-05395af293a2';
const ANSWER_ID = '01a1e712-6f5a-7001-9bb3-05395af293a3';
const RUN_ID = 'b5f2f046-81ba-4c34-a171-f8984ff97903';
const SENT_AT = '2026-11-16T18:00:00.000Z';
const FINISHED_AT = '2026-11-16T18:00:42.000Z';
const ANSWER_TEXT = 'The answer the server finished after the app closed.';

let mockSearchParams: Record<string, string> = { id: CONVERSATION_ID };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), []);
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true, isReconnecting: false, queueSize: 0 }),
}));

jest.mock('@/src/navigation/openNearestDrawer', () => ({ openNearestDrawer: jest.fn() }));

jest.mock('@/src/features/chat/components/Composer/Composer', () => {
  const { View } = require('react-native');
  return {
    Composer: (props: { attachRef?: { current: unknown } }) => {
      if (props.attachRef) {
        props.attachRef.current = {
          retrySend: jest.fn(),
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

jest.mock('@/stores/chat/imageEditAdmissions', () => ({
  useImageEditModelIds: () => new Set<string>(),
}));

interface MockMessageListProps {
  messages: Array<{ id: string }>;
  speechOwner?: unknown;
  onRetryMessage?: (messageId: string) => void;
  lastAnswerLiveRun?: string;
}
let mockMessageListProps = {} as MockMessageListProps;
jest.mock('@/src/features/chat/components/MessageList', () => {
  const { View } = require('react-native');
  const { MessageBubble } = require('@/src/features/chat/components/MessageBubble');
  return {
    MessageList: (props: MockMessageListProps) => {
      mockMessageListProps = props;
      return (
        <View testID="message-list">
          {props.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              speechOwner={props.speechOwner}
              onRetryMessage={props.onRetryMessage}
            />
          ))}
        </View>
      );
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
      clearAll: () => values.clear(),
    },
  };
});

const mockApiFetch = jest.fn();
jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('@/services/cloudSyncEngine', () => ({
  ...jest.requireActual('@/services/cloudSyncEngine'),
  syncNow: jest.fn(async () => undefined),
}));

jest.mock('@/services/streaming', () => ({
  ...jest.requireActual('@/services/streaming'),
  streamChat: jest.fn(),
}));

const mockGetConversation = jest.fn();
jest.mock('@/services/managedCloudChat', () => ({
  ...jest.requireActual('@/services/managedCloudChat'),
  managedCloudChat: {
    ...jest.requireActual('@/services/managedCloudChat').managedCloudChat,
    getConversation: (...args: unknown[]) => mockGetConversation(...args),
  },
}));

import ChatScreen from '../app/(app)/chat/[id]';
import { storage } from '../lib/mmkv';
import { streamChat } from '../services/streaming';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import { useTierStore } from '../src/features/billing/store';
import {
  IN_FLIGHT_TURN_STALLED_MESSAGE,
  IN_FLIGHT_TURN_WAITING_MESSAGE,
} from '../src/features/chat/inFlightTurnRecovery';
import { recordInFlightTurnSend } from '../src/features/chat/inFlightTurnRun';
import { useWaitlistStore } from '../src/features/waitlist';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';

const REQUEST_ID = createManagedChatIdempotencyKey({
  surface: 'mobile',
  purpose: 'send',
  operationId: ANSWER_ID,
});

function run(overrides: Partial<CloudAgentRun> = {}): CloudAgentRun {
  return {
    id: RUN_ID,
    userId: 'user-1',
    requestId: REQUEST_ID,
    conversationId: CONVERSATION_ID,
    originSurface: 'mobile',
    workMode: 'chat',
    state: 'ready_for_review',
    provider: 'fixture-provider',
    model: SYNTHETIC_CLOUD_MODEL_ID,
    lastEventSequence: 4,
    cancellationRequestedAt: null,
    completedAt: FINISHED_AT,
    createdAt: SENT_AT,
    updatedAt: FINISHED_AT,
    ...overrides,
  };
}

function envelope(sequence: number, event: AgentEventEnvelope['event']): AgentEventEnvelope {
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: ANSWER_ID,
    turnId: REQUEST_ID,
    sequence,
    emittedAtMs: Date.parse(SENT_AT) + sequence * 1_000,
    event,
  } as AgentEventEnvelope;
}

const finishedEvents = [
  envelope(0, { type: 'task-state-changed', state: 'running', taskId: REQUEST_ID }),
  envelope(1, { type: 'text-delta', delta: 'The answer the server ' }),
  envelope(2, { type: 'text-delta', delta: 'finished after the app closed.' }),
  envelope(3, { type: 'task-state-changed', state: 'ready_for_review', taskId: REQUEST_ID }),
  envelope(4, { type: 'stop', reason: 'end-turn' }),
] as AgentEventEnvelope[];

const question = {
  id: QUESTION_ID,
  conversationId: CONVERSATION_ID,
  role: 'user' as const,
  content: 'What changed this quarter?',
  createdAt: SENT_AT,
  parentId: null,
  metadata: { requestedModel: SYNTHETIC_CLOUD_MODEL_ID },
};

const conversation = {
  id: CONVERSATION_ID,
  title: 'Quarter',
  createdAt: SENT_AT,
  updatedAt: SENT_AT,
  messageCount: 1,
  pinned: false,
  model: SYNTHETIC_CLOUD_MODEL_ID,
  executionMode: 'cloud' as const,
  activeLeafMessageId: QUESTION_ID,
};

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function serveRun(runRow: CloudAgentRun, events: readonly AgentEventEnvelope[]): void {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path.includes('requestId=')) return json({ runs: [runRow], nextCursor: null });
    if (path.startsWith(`/api/llm/v1/chat/completions/runs/${RUN_ID}`)) {
      const after = Number(new URL(`https://phone${path}`).searchParams.get('after'));
      const page = events.filter((event) => event.sequence > after);
      return json({
        run: runRow,
        events: page,
        nextAfterSequence: page.length > 0 ? page[page.length - 1]!.sequence : after,
      });
    }
    if (path.includes('conversationId=')) return json({ runs: [], nextCursor: null });
    return { ok: false, status: 404, json: async () => ({}) };
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  (storage as unknown as { clearAll: () => void }).clearAll();
  mockSearchParams = { id: CONVERSATION_ID };
  mockMessageListProps = {} as MockMessageListProps;
  __resetCloudAccountSessionForTests();
  activateCloudAccount('finished-run-answer-user');
  useTierStore.setState({ tier: 'max' });
  useWaitlistStore.setState({ cloudUnlocked: true });
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.setState({
    conversations: [conversation] as never,
    messages: { [CONVERSATION_ID]: [question] } as never,
  });
  mockGetConversation.mockResolvedValue({
    conversation,
    messages: [question],
    total: 1,
    hasMore: false,
  });
  recordInFlightTurnSend({
    conversationId: CONVERSATION_ID,
    questionId: QUESTION_ID,
    operationId: ANSWER_ID,
  });
});

describe('reopening a Cloud chat whose answer the server finished after the app was ended', () => {
  it('shows the answer with its action row and no notice, after the history load', async () => {
    serveRun(run(), finishedEvents);
    render(<ChatScreen />);
    await settle();

    expect(mockGetConversation).toHaveBeenCalled();
    expect(screen.getByText(ANSWER_TEXT)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Read aloud' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Regenerate response' })).toBeOnTheScreen();
    expect(
      screen.getAllByRole('button', { name: /^More message actions for / }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByTestId('chat-in-flight-turn')).toBeNull();
    expect(screen.queryByText(IN_FLIGHT_TURN_STALLED_MESSAGE)).toBeNull();
    expect(screen.queryByText(IN_FLIGHT_TURN_WAITING_MESSAGE)).toBeNull();
    expect(screen.queryByLabelText('Retry')).toBeNull();
    expect(mockMessageListProps.messages.map((message) => message.id)).toEqual([
      QUESTION_ID,
      ANSWER_ID,
    ]);
    expect(streamChat).not.toHaveBeenCalled();
    expect(
      mockApiFetch.mock.calls.every(
        (call) => (call[1] as { method?: string } | undefined)?.method === 'GET',
      ),
    ).toBe(true);
  });

  it('shows the stopped notice with Retry when the run failed', async () => {
    serveRun(run({ state: 'failed' }), finishedEvents);
    render(<ChatScreen />);
    await settle();

    expect(screen.getByTestId('chat-in-flight-turn')).toBeOnTheScreen();
    expect(screen.getByText(IN_FLIGHT_TURN_STALLED_MESSAGE)).toBeOnTheScreen();
    expect(screen.getByLabelText('Retry')).toBeOnTheScreen();
    expect(screen.queryByText(ANSWER_TEXT)).toBeNull();
  });
});
