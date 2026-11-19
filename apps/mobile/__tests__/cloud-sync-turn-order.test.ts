import type { ChatMessage } from '../types/chat';

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../services/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '../services/api';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useArtifactStore } from '../src/features/artifacts/store';
import { markMessageForSync, syncNow } from '../services/cloudSyncEngine';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONVERSATION = 'c-turn-order';
const PHONE_SENT_AT = '2026-11-14T20:07:03.000Z';
const PHONE_PLACEHOLDER_AT = '2026-11-14T20:07:03.010Z';
const SERVER_QUESTION_AT = '2026-11-14T20:08:18.255Z';
const SERVER_ANSWER_AT = '2026-11-14T20:08:32.348Z';

let pullMessages: unknown[] = [];

function messageDelta(
  id: string,
  role: 'user' | 'assistant',
  content: string,
  createdAt: string,
  serverVersion: string,
) {
  return {
    id,
    conversation_id: CONVERSATION,
    role,
    content,
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    metadata: null,
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    server_version: serverVersion,
  };
}

function shownOrder(): string[] {
  return (useChatCloudMessageStore.getState().messages[CONVERSATION] ?? []).map((m) => m.id);
}

function syncWith(messages: unknown[]): Promise<void> {
  pullMessages = messages;
  return syncNow();
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('turn-order-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useArtifactStore.getState().clearArtifacts();
  useArtifactStore.getState().clearCloudArtifacts();
  useChatAppModeStore.getState().setAppMode('cloud');
  pullMessages = [];
  mockGet.mockImplementation((async (path: string) => {
    if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
    const messages = pullMessages;
    pullMessages = [];
    return { conversations: [], messages, artifacts: [], cursor: '1', hasMore: false };
  }) as never);
  mockPost.mockImplementation((async (
    _path: string,
    body: { conversations?: Array<{ id: string }>; messages?: Array<{ id: string }> },
  ) => ({
    protocolVersion: 2,
    applied: {
      conversations: (body?.conversations ?? []).map((c) => ({ id: c.id, server_version: '1' })),
      messages: (body?.messages ?? []).map((m) => ({ id: m.id, server_version: '1' })),
      artifacts: [],
    },
    conflicts: { conversations: [], messages: [], artifacts: [] },
    cursor: '1',
  })) as never);

  useChatCloudMessageStore.getState().addCloudConversation({
    id: CONVERSATION,
    title: 'Counting',
    createdAt: PHONE_SENT_AT,
    updatedAt: PHONE_SENT_AT,
    messageCount: 0,
    pinned: false,
    executionMode: 'cloud',
  });
  useChatCloudMessageStore.getState().setCloudMessages(CONVERSATION, [
    {
      id: 'question',
      role: 'user',
      content: 'Count from 1 to 200, one number per line.',
      createdAt: PHONE_SENT_AT,
    } as ChatMessage,
    {
      id: 'answer',
      role: 'assistant',
      content: '1\n2\n',
      createdAt: PHONE_PLACEHOLDER_AT,
      isStreaming: true,
    } as ChatMessage,
  ]);
});

describe('a turn that outlasts a sync', () => {
  it('keeps the question above its answer while the server stamps them later than the phone did', async () => {
    await syncWith([
      messageDelta(
        'question',
        'user',
        'Count from 1 to 200, one number per line.',
        SERVER_QUESTION_AT,
        '2',
      ),
    ]);
    expect(shownOrder()).toEqual(['question', 'answer']);

    const settled = (useChatCloudMessageStore.getState().messages[CONVERSATION] ?? []).map((m) =>
      m.id === 'answer' ? { ...m, content: '1\n2\n3\n', isStreaming: false } : m,
    );
    useChatCloudMessageStore.getState().setCloudMessages(CONVERSATION, settled);
    markMessageForSync(CONVERSATION, 'answer');
    await syncWith([]);
    expect(shownOrder()).toEqual(['question', 'answer']);

    await syncWith([messageDelta('answer', 'assistant', '1\n2\n3\n', SERVER_ANSWER_AT, '3')]);
    expect(shownOrder()).toEqual(['question', 'answer']);
  });

  it('still places rows another device wrote by their own time', async () => {
    await syncWith([
      messageDelta(
        'question',
        'user',
        'Count from 1 to 200, one number per line.',
        SERVER_QUESTION_AT,
        '2',
      ),
      messageDelta('earlier-elsewhere', 'user', 'From the laptop', '2026-11-14T20:01:00.000Z', '2'),
      messageDelta('later-elsewhere', 'user', 'Follow-up', '2026-11-14T20:09:00.000Z', '2'),
    ]);

    expect(shownOrder()).toEqual(['earlier-elsewhere', 'question', 'answer', 'later-elsewhere']);
  });
});
