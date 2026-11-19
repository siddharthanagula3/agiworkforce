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
import type { ChatMessage } from '../types/chat';
import { managedCloudAgentRunPath } from '@agiworkforce/cloud-contracts';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONV_ID = '0190a000-0000-7000-8000-0000000000d1';
const QUESTION_ID = '0190a000-0000-7000-8000-0000000000d2';
const ANSWER_ID = '0190a000-0000-7000-8000-0000000000d3';
const RUN_ID = '0190a000-0000-7000-8000-0000000000d4';
const IMAGE_PATH = '/api/files/0190a000-0000-7000-8000-0000000000d5';
const ASKED_AT = '2026-11-14T09:00:00.000Z';
const ANSWERED_AT = '2026-11-14T09:00:05.000Z';

const RUN = { runId: RUN_ID, runPath: managedCloudAgentRunPath(RUN_ID), lastSequence: 4 };

const IMAGE_METADATA = {
  toolType: 'image-generation',
  imageUrl: IMAGE_PATH,
  imageGenPrompt: 'A red tulip',
  imageGenAspect: '3:4',
};

const APPROVAL_METADATA = {
  cloudAgentRun: RUN,
  cloudApproval: {
    schemaVersion: 1,
    runId: RUN_ID,
    calls: [{ toolCallId: 'call_send', name: 'mcp__gmail__send_email', input: '{"to":"a@b.c"}' }],
  },
};

const INPUT_METADATA = {
  cloudAgentRun: RUN,
  tools: [
    {
      id: 'phone-input:call_repo',
      name: 'mcp__github__create_issue',
      status: 'awaiting_input',
      toolCallId: 'call_repo',
      connectorId: 'github',
      inputRequests: { repo: { method: 'elicitation/create', params: { message: 'Which repo?' } } },
    },
  ],
};

const VIDEO_METADATA = {
  toolType: 'video-generation',
  videoUrl: '/api/files/0190a000-0000-7000-8000-0000000000d6',
  thumbnailUrl: '/api/files/0190a000-0000-7000-8000-0000000000d7',
  videoStatus: 'completed',
  videoTaskId: 'task-1',
};

const REASONING_METADATA = {
  thinkingContent: 'Tulips need cold before they bloom.',
  thinkingDurationSeconds: 7,
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
    content: role === 'user' ? 'Draw a tulip' : 'Here it is.',
    inputTokens: 0,
    outputTokens: 0,
    createdAt: role === 'user' ? ASKED_AT : ANSWERED_AT,
    ...(metadata ? { metadata } : {}),
  };
}

function serveConversation(metadata: Record<string, unknown>): void {
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
    messages: [serverRow('user', null), serverRow('assistant', metadata)],
    total: 2,
    hasMore: false,
  } as never);
}

let pullMessages: unknown[] = [];

function pulledAnswer(metadata: Record<string, unknown>) {
  return {
    id: ANSWER_ID,
    conversation_id: CONV_ID,
    role: 'assistant',
    content: 'Here it is.',
    model: null,
    provider: null,
    input_tokens: 0,
    output_tokens: 0,
    metadata,
    created_at: ANSWERED_AT,
    updated_at: ANSWERED_AT,
    deleted_at: null,
    server_version: '2',
  };
}

async function openFresh(metadata: Record<string, unknown>): Promise<ChatMessage | undefined> {
  serveConversation(metadata);
  await useChatMessageStore.getState().loadMessages(CONV_ID);
  return answer();
}

async function pullFromAnotherPhone(
  metadata: Record<string, unknown>,
): Promise<ChatMessage | undefined> {
  pullMessages = [pulledAnswer(metadata)];
  await syncNow();
  return answer();
}

const OPEN_PATHS = [
  ['opening the chat after a restart', openFresh],
  ['a sync from another phone', pullFromAnotherPhone],
] as const;

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('renderer-hydration-user');
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

describe.each(OPEN_PATHS)('a stored Cloud answer read back by %s', (_label, read) => {
  it('shows the generated image with its prompt and ratio', async () => {
    const message = await read(IMAGE_METADATA);
    expect(message).toMatchObject({
      type: 'image',
      imageUrl: IMAGE_PATH,
      imageGenPersisted: true,
      imageGenStatus: 'completed',
      imageGenPrompt: 'A red tulip',
      imageAspectRatio: '3:4',
    });
  });

  it('keeps a pending approval answerable', async () => {
    const message = await read(APPROVAL_METADATA);
    expect(message?.toolCalls).toEqual([
      expect.objectContaining({
        toolCallId: 'call_send',
        name: 'mcp__gmail__send_email',
        status: 'awaiting-approval',
        requiresApproval: true,
      }),
    ]);
  });

  it('brings back a form that still needs the person', async () => {
    const message = await read(INPUT_METADATA);
    expect(message?.pendingToolInput).toMatchObject({
      runId: RUN_ID,
      toolCalls: [{ toolCallId: 'call_repo', connectorId: 'github' }],
    });
  });

  it('shows a video made on web with its poster', async () => {
    const message = await read(VIDEO_METADATA);
    expect(message).toMatchObject({
      type: 'video',
      videoUrl: VIDEO_METADATA.videoUrl,
      videoThumbnailUrl: VIDEO_METADATA.thumbnailUrl,
      videoGenStatus: 'completed',
      videoTaskId: 'task-1',
      isGeneratingVideo: false,
    });
  });

  it('keeps the reasoning and how long it took', async () => {
    const message = await read(REASONING_METADATA);
    expect(message?.reasoning).toBe('Tulips need cold before they bloom.');
    expect(message?.metadata?.['thinkingDuration']).toBe(7);
  });

  it('shows the search a web turn ran with its query and results', async () => {
    const message = await read({
      tools: [
        {
          id: 'tool-search-1',
          name: 'web_search',
          status: 'completed',
          args: '{"query":"tulip planting"}',
        },
        { id: 'tool-approve', name: 'send_email', status: 'awaiting_approval' },
      ],
    });
    expect(message?.toolCalls).toEqual([
      expect.objectContaining({
        name: 'web_search',
        status: 'succeeded',
        input: '{"query":"tulip planting"}',
      }),
    ]);
  });

  it('settles a step that was still running when it was saved', async () => {
    const message = await read({
      tools: [{ id: 'tool-fetch', name: 'web_fetch', status: 'running' }],
      statusSteps: [{ id: 'memory', icon: 'thinking', message: 'Saving', status: 'running' }],
    });
    expect(message?.toolCalls?.[0]?.status).toBe('failed');
    expect(message?.steps).toEqual([
      { id: 'memory', icon: 'thinking', message: 'Saving', status: 'failed' },
    ]);
  });

  it('keeps the notices and the code output the live turn showed', async () => {
    const stored = {
      movedFromModel: 'fixture-earlier-model',
      movedReason: 'capability',
      routeLane: 'free',
      secretRedactionCount: 2,
      webSearchRequested: true,
      webSearchAskedInText: true,
      followUpSuggestions: ['When do they bloom?'],
      codeExecutionResult: { stdout: '4', stderr: '', returnCode: 0 },
      isExecutingCode: false,
    };
    const message = await read(stored);
    expect(message?.metadata).toEqual(expect.objectContaining(stored));
  });
});

describe.each(OPEN_PATHS)(
  'an image still being made on this phone, read back by %s',
  (_label, read) => {
    it('keeps its placeholder so the finished image lands on it', async () => {
      useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
        {
          id: QUESTION_ID,
          role: 'user',
          content: 'Draw a tulip',
          createdAt: ASKED_AT,
        },
        {
          id: ANSWER_ID,
          role: 'assistant',
          content: '',
          createdAt: ANSWERED_AT,
          isGeneratingImage: true,
          imageGenStatus: 'generating',
          imageGenPrompt: 'A red tulip',
        } as ChatMessage,
      ]);

      const whileMaking = await read({});
      expect(whileMaking).toMatchObject({
        isGeneratingImage: true,
        imageGenStatus: 'generating',
        imageGenPrompt: 'A red tulip',
      });

      useChatMessageStore
        .getState()
        .completeImageGeneration(CONV_ID, ANSWER_ID, { imageUrl: IMAGE_PATH, aspectRatio: '1:1' });

      expect(answer()).toMatchObject({
        type: 'image',
        imageUrl: IMAGE_PATH,
        isGeneratingImage: false,
        imageGenStatus: 'completed',
      });
    });
  },
);

describe('tool steps run on this phone', () => {
  const SEARCH = {
    id: 'call-search',
    toolCallId: 'call-search',
    name: 'web_search',
    status: 'succeeded' as const,
    input: '{"query":"tulip planting"}',
    searchResults: [{ url: 'https://bulbs.example/tulips', title: 'Planting tulips' }],
  };
  const CONNECT = {
    id: 'call-gmail',
    toolCallId: 'call-gmail',
    name: 'mcp__gmail__search',
    status: 'failed' as const,
    output: '{"error":"connector_not_connected","connectorId":"gmail"}',
  };

  async function pushedAnswer(): Promise<Record<string, unknown> | undefined> {
    markMessageForSync(CONV_ID, ANSWER_ID);
    await syncNow();
    return mockPost.mock.calls
      .filter(([path]) => path === '/api/chat/sync')
      .flatMap(
        ([, body]) =>
          (body as { messages?: Array<{ id: string; metadata: Record<string, unknown> }> })
            .messages ?? [],
      )
      .find((message) => message.id === ANSWER_ID)?.metadata;
  }

  it('are stored in the tools entries web reads, and come back when the chat opens', async () => {
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
      {
        id: ANSWER_ID,
        role: 'assistant',
        content: 'Here it is.',
        createdAt: ANSWERED_AT,
        toolCalls: [SEARCH, CONNECT],
        steps: [{ id: 'memory', icon: 'success', message: 'Saved to memory', status: 'completed' }],
      } as ChatMessage,
    ]);

    const metadata = await pushedAnswer();
    expect(metadata?.['tools']).toEqual([
      expect.objectContaining({
        id: 'phone-tool:call-search',
        name: 'web_search',
        status: 'completed',
        toolCallId: 'call-search',
        args: SEARCH.input,
        searchResults: SEARCH.searchResults,
      }),
      expect.objectContaining({
        id: 'phone-tool:call-gmail',
        name: 'mcp__gmail__search',
        status: 'failed',
        error: CONNECT.output,
      }),
    ]);
    expect(metadata?.['statusSteps']).toEqual([
      { id: 'memory', icon: 'success', message: 'Saved to memory', status: 'completed' },
    ]);

    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, []);
    const reopened = await openFresh(metadata ?? {});
    expect(reopened?.toolCalls).toEqual([
      expect.objectContaining({
        id: 'call-search',
        name: 'web_search',
        status: 'succeeded',
        input: SEARCH.input,
        searchResults: SEARCH.searchResults,
      }),
      expect.objectContaining({
        name: 'mcp__gmail__search',
        status: 'failed',
        output: CONNECT.output,
      }),
    ]);
    expect(reopened?.steps).toEqual([
      { id: 'memory', icon: 'success', message: 'Saved to memory', status: 'completed' },
    ]);
  });

  it('are not stored twice when the answer already carries web entries for them', async () => {
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, []);
    const reopened = await openFresh({
      tools: [{ id: 'web-1', toolCallId: 'call-web', name: 'web_search', status: 'completed' }],
    });
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [reopened as ChatMessage]);

    const metadata = await pushedAnswer();
    expect(metadata?.['tools']).toEqual([
      { id: 'web-1', toolCallId: 'call-web', name: 'web_search', status: 'completed' },
    ]);
  });
});

describe('reasoning streamed on this phone', () => {
  it('is stored in the keys web reads', async () => {
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
      {
        id: ANSWER_ID,
        role: 'assistant',
        content: 'Here it is.',
        createdAt: ANSWERED_AT,
        reasoning: 'Tulips need cold before they bloom.',
        metadata: { thinkingDuration: 7, thinkingStartedAt: Date.parse(ASKED_AT) },
      } as ChatMessage,
    ]);
    markMessageForSync(CONV_ID, ANSWER_ID);
    await syncNow();

    const pushed = mockPost.mock.calls
      .filter(([path]) => path === '/api/chat/sync')
      .flatMap(
        ([, body]) =>
          (body as { messages?: Array<{ id: string; metadata: Record<string, unknown> }> })
            .messages ?? [],
      )
      .find((message) => message.id === ANSWER_ID);
    expect(pushed?.metadata).toMatchObject({
      thinkingContent: 'Tulips need cold before they bloom.',
      thinkingDurationSeconds: 7,
      thinkingStartedAt: ASKED_AT,
    });
  });
});
