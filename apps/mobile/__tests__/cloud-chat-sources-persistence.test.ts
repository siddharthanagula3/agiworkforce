import { createElement } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({})),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
  getCurrentUser: jest.fn(async () => null),
  getCurrentUserId: jest.fn(async () => null),
}));

jest.mock('../services/api', () => {
  function MockApiPaywallError(this: { name: string; message: string }, feat: string) {
    this.name = 'ApiPaywallError';
    this.message = `Paywall: ${feat}`;
  }
  MockApiPaywallError.prototype = Object.create(Error.prototype);
  return {
    api: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      uploadFile: jest.fn(),
    },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));
jest.mock('../services/llmGate', () => ({
  ensureCloudSendConsent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('../lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  rehydrateWhenMmkvReady: jest.fn(),
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

import { api } from '../services/api';
import { managedCloudChat } from '../services/managedCloudChat';
import { markMessageForSync, syncNow } from '../services/cloudSyncEngine';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';
import {
  searchQueryFromMetadata,
  turnSourceMetadata,
  turnSources,
} from '../src/features/chat/utils/messageSources';
import { CollapsibleSources } from '../src/features/chat/components/CollapsibleSources';
import type { ChatMessage, ToolCall } from '../types/chat';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000c1';
const QUESTION_ID = '0190a000-0000-7000-8000-0000000000c2';
const ANSWER_ID = '0190a000-0000-7000-8000-0000000000c3';
const ASKED_AT = '2026-11-14T09:00:00.000Z';
const ANSWERED_AT = '2026-11-14T09:00:05.000Z';

interface PushedMessage {
  id: string;
  metadata: Record<string, unknown> | null;
}

let pullMessages: unknown[] = [];

function result(index: number) {
  return {
    url: `https://site${index}.example.org/article`,
    title: `Result ${index}`,
    snippet: `About result ${index}`,
    publishedDate: '2026-11-01',
    retrievedAt: '2026-11-14T08:59:00.000Z',
  };
}

const TWELVE_RESULTS = Array.from({ length: 12 }, (_, index) => result(index + 1));

const NATIVE_SEARCH_METADATA = {
  searchResults: { query: 'tulip care', results: TWELVE_RESULTS },
  citations: [
    { type: 'url_citation', url: 'https://site4.example.org/article', title: 'Result 4' },
    { type: 'url_citation', url: 'https://cited-only.example.net/guide', title: 'Cited guide' },
  ],
};

function answer(): ChatMessage | undefined {
  return (useChatCloudMessageStore.getState().messages[CONV_ID] ?? []).find(
    (message) => message.id === ANSWER_ID,
  );
}

function serverRow(role: 'user' | 'assistant', metadata: Record<string, unknown> | null) {
  return {
    id: role === 'user' ? QUESTION_ID : ANSWER_ID,
    conversationId: CONV_ID,
    role,
    content: role === 'user' ? 'How do I care for tulips?' : 'Water them weekly [1][2].',
    inputTokens: 0,
    outputTokens: 0,
    createdAt: role === 'user' ? ASKED_AT : ANSWERED_AT,
    ...(metadata ? { metadata } : {}),
  };
}

function serveConversation(messages: Record<string, unknown>[]): void {
  jest.spyOn(managedCloudChat, 'getConversation').mockResolvedValue({
    conversation: {
      id: CONV_ID,
      title: 'Tulips',
      projectId: null,
      pinned: false,
      starred: false,
      archived: false,
      isTemporary: false,
      createdAt: ASKED_AT,
      updatedAt: ANSWERED_AT,
    },
    messages,
    total: messages.length,
    hasMore: false,
  } as never);
}

function pushedAnswer(): PushedMessage | undefined {
  return mockPost.mock.calls
    .filter(([path]) => path === '/api/chat/sync')
    .flatMap(([, body]) => (body as { messages?: PushedMessage[] }).messages ?? [])
    .filter((message) => message.id === ANSWER_ID)
    .at(-1);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('sources-persistence-user');
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
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
    id: CONV_ID,
    title: 'Tulips',
    createdAt: ASKED_AT,
    updatedAt: ANSWERED_AT,
    messageCount: 0,
    pinned: false,
    executionMode: 'cloud',
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('the sources of a Cloud answer', () => {
  it('are shown for a chat answered on web by a provider search, every page numbered', async () => {
    serveConversation([serverRow('user', null), serverRow('assistant', NATIVE_SEARCH_METADATA)]);

    await useChatMessageStore.getState().loadMessages(CONV_ID);

    const citations = answer()?.citations ?? [];
    expect(citations).toHaveLength(13);
    expect(citations.slice(0, 3).map((source) => source.url)).toEqual([
      'https://site4.example.org/article',
      'https://cited-only.example.net/guide',
      'https://site1.example.org/article',
    ]);
    expect(citations[10]).toEqual(result(10));
  });

  it('arrive through a sync with an answer from another device', async () => {
    pullMessages = [
      {
        id: ANSWER_ID,
        conversation_id: CONV_ID,
        role: 'assistant',
        content: 'Water them weekly [1].',
        model: null,
        provider: null,
        input_tokens: 0,
        output_tokens: 0,
        metadata: { searchResults: [result(1), result(2)] },
        created_at: ANSWERED_AT,
        updated_at: ANSWERED_AT,
        deleted_at: null,
        server_version: '2',
      },
    ];

    await syncNow();

    expect(answer()?.citations).toEqual([result(1), result(2)]);
  });

  it('are stored with an answer this phone streamed, and are back after the chat is reopened', async () => {
    const shownSources = [result(1), result(2), result(3)];
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
      {
        id: QUESTION_ID,
        role: 'user',
        content: 'How do I care for tulips?',
        createdAt: ASKED_AT,
      } as ChatMessage,
      {
        id: ANSWER_ID,
        role: 'assistant',
        content: 'Water them weekly [1].',
        createdAt: ANSWERED_AT,
        citations: shownSources,
        metadata: { reaction: 'up' },
      } as ChatMessage,
    ]);
    markMessageForSync(CONV_ID, ANSWER_ID);
    await syncNow();

    const pushed = pushedAnswer();
    expect(pushed?.metadata?.['searchResults']).toEqual(shownSources);

    serveConversation([serverRow('user', null), serverRow('assistant', pushed?.metadata ?? null)]);
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, []);
    await useChatMessageStore.getState().loadMessages(CONV_ID);

    expect(answer()?.citations).toEqual(shownSources);
  });

  it('stay on screen when a reload brings back a row that stored none', async () => {
    const shownSources = [result(5)];
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
      {
        id: ANSWER_ID,
        role: 'assistant',
        content: 'Water them weekly [1].',
        createdAt: ANSWERED_AT,
        citations: shownSources,
      } as ChatMessage,
    ]);
    serveConversation([serverRow('user', null), serverRow('assistant', null)]);

    await useChatMessageStore.getState().loadMessages(CONV_ID);

    expect(answer()?.citations).toEqual(shownSources);
  });
});

describe('the Sources control after a chat is reopened', () => {
  it('lists the same sources, in the same order, as the live answer did', async () => {
    const searchTool: ToolCall = {
      id: 'search-1',
      name: 'web_search',
      status: 'succeeded',
      searchResults: TWELVE_RESULTS,
    };
    const cited = [
      { url: 'https://site4.example.org/article', title: 'Result 4' },
      { url: 'https://cited-only.example.net/guide', title: 'Cited guide' },
    ];
    const liveSources = turnSources([searchTool], cited);
    const stored = {
      ...turnSourceMetadata([searchTool], cited),
      searchResults: { query: 'tulip care', results: TWELVE_RESULTS },
    };
    serveConversation([serverRow('user', null), serverRow('assistant', stored)]);

    await useChatMessageStore.getState().loadMessages(CONV_ID);

    const reopened = answer();
    expect(reopened?.citations?.map((source) => source.url)).toEqual(
      liveSources.map((source) => source.url),
    );
    const screen = render(
      createElement(CollapsibleSources, {
        sources: reopened?.citations ?? [],
        citedCount: 2,
        query: searchQueryFromMetadata(reopened?.metadata),
      }),
    );
    fireEvent.press(screen.getByLabelText('View 13 sources'));
    expect(screen.getByText('tulip care')).toBeTruthy();
    expect(screen.getByLabelText('Source 1: Result 4')).toBeTruthy();
    expect(screen.getByLabelText('Source 2: Cited guide')).toBeTruthy();
    expect(screen.getByLabelText('Source 13: Result 12')).toBeTruthy();
  });
});
