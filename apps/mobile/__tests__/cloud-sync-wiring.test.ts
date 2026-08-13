/**
 * Cloud sync WIRING integration (P2 Phase 1).
 *
 * Proves the live send path is wired to the sync engine end-to-end: a cloud-mode
 * send writes the finalized turn into the REAL cloud store, marks the conversation
 * + messages dirty with UUIDv7 ids, and a subsequent syncNow() pushes them to
 * /api/chat/sync. Local sends are untouched (no cloud-store writes, no dirty queue).
 *
 * Only services/streaming, services/api, and a few native shims are mocked; the
 * stores (execution, cloud message, sidecar, app mode) are the real implementations.
 */
import { isUuidV7, setUuidV7RandomSource } from '@agiworkforce/utils';

// Inject a deterministic byte source so uuidv7() works regardless of the test
// runtime's global crypto. The monotonic counter still makes each id unique.
setUuidV7RandomSource((n) => {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) bytes[i] = (i * 31 + 7) & 0xff;
  return bytes;
});

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
    api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    ApiPaywallError: MockApiPaywallError,
  };
});

jest.mock('../services/streaming', () => ({ streamChat: jest.fn() }));

jest.mock('../services/remoteChatGate', () => {
  class MockRemoteChatDisabledError extends Error {
    readonly code = 'MOBILE_REMOTE_CHAT_DISABLED';
  }
  return {
    getRemoteChatDisabledReason: jest.fn(() => null),
    RemoteChatDisabledError: MockRemoteChatDisabledError,
  };
});

jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return {
    ...actual,
    localGenerate: jest.fn(),
    getCapabilities: jest.fn().mockResolvedValue({ tier2Available: true, tier3Available: true }),
  };
});

jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  getInstalledModel: jest.fn().mockResolvedValue(null),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
}));

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

import { api } from '../services/api';
import { streamChat, type StreamCallbacks } from '../services/streaming';
import { useChatExecutionStore } from '../stores/chat/chatExecutionStore';
import { useChatCloudMessageStore } from '../stores/chat/chatCloudMessageStore';
import { useCloudSyncStateStore } from '../stores/chat/cloudSyncStateStore';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useChatMessageStore } from '../stores/chat/chatMessageStore';
import { useChatStore } from '../stores/chatStore';
import type { ChatMessage } from '../types/chat';
import { LOCKED_CLOUD_MODELS } from '../src/features/model-picker/service';
import {
  requireLocalModel,
  requireAutoMode,
  requireMediaSlotModel,
  requireMobileCloudModel,
} from '../test-utils/modelFixtures';
import { syncNow } from '../services/cloudSyncEngine';
import { useAuthStore } from '../src/features/auth/store';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockStreamChat = streamChat as jest.MockedFunction<typeof streamChat>;
const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const CONV_ID = '0190a000-0000-7000-8000-000000000001'; // a valid UUIDv7 conversation id
const CLOUD_MODEL = LOCKED_CLOUD_MODELS[0]?.id ?? requireMobileCloudModel().id;
const LOCAL_MODEL = requireLocalModel().id;
const IMAGE_MODEL = requireMediaSlotModel('image').id;
const AUTO_MODEL = requireAutoMode().id;

/** Drive streamChat to emit one content delta then complete. */
function streamReplies(text: string) {
  mockStreamChat.mockImplementation(async (_body, callbacks: StreamCallbacks) => {
    callbacks.onDelta({ content: text });
    callbacks.onDone();
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount('cloud-sync-wiring-user');
  useAuthStore.setState({
    clerkUserId: 'cloud-sync-wiring-user',
    isClerkLoaded: true,
    isClerkSignedIn: true,
  });
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useChatMessageStore.setState({ conversations: [], messages: {} });
  useChatAppModeStore.getState().setAppMode('local'); // onDone's auto-sync no-ops while asserting
  // Contract-valid empty pulls per endpoint — the engine schema-validates every
  // response, so a chat-shaped page returned for memory/projects/settings fails
  // the parse and flips sync status to 'error'.
  mockGet.mockImplementation((async (path: string) => {
    if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
    return { conversations: [], messages: [], artifacts: [], cursor: '0', hasMore: false };
  }) as never);
  mockPost.mockImplementation((async (
    _p: string,
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
});

describe('cloud repository authority', () => {
  it('ignores legacy Local residue for a Cloud-owned conversation', () => {
    const userMsg: ChatMessage = {
      id: 'msg-user-1',
      conversationId: CONV_ID,
      role: 'user',
      content: 'hi there',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const assistantInFlight: ChatMessage = {
      id: 'msg-asst-1',
      conversationId: CONV_ID,
      role: 'assistant',
      content: '',
      isStreaming: true,
      createdAt: '2026-01-01T00:00:01.000Z',
    };

    // Cloud store owns the conversation and is the only transcript authority.
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CONV_ID,
      title: 'Cloud Chat',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      messageCount: 1,
      pinned: false,
      starred: false,
      archived: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
    });
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [userMsg]);

    // Simulate stale data left by the pre-migration split-brain writer.
    useChatMessageStore.setState({ messages: { [CONV_ID]: [userMsg, assistantInFlight] } });

    // Combined reads do not union the residue back into the Cloud transcript.
    const merged = useChatStore.getState().messages[CONV_ID] ?? [];
    expect(merged.map((m) => m.role)).toEqual(['user']);
    expect(merged.find((m) => m.role === 'assistant')).toBeUndefined();
  });
});

describe('cloud send → sync write-through', () => {
  it('keeps image-generation state and UUIDv7 identities only in the Cloud repository', () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CONV_ID,
      title: 'Cloud Image',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      pinned: false,
      starred: false,
      archived: false,
      model: AUTO_MODEL,
      executionMode: 'cloud',
    });

    const assistantId = useChatStore
      .getState()
      .beginImageGeneration(CONV_ID, 'Create an image', 'a blue observatory', IMAGE_MODEL);
    const inFlightMessages = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    expect(
      useCloudSyncStateStore
        .getState()
        .dirtyMessages.map((ref) => ref.messageId)
        .sort(),
    ).toEqual(inFlightMessages.map((message) => message.id).sort());
    useChatStore.getState().completeImageGeneration(CONV_ID, assistantId, {
      imageUrl: 'https://example.com/observatory.png',
      model: IMAGE_MODEL,
    });

    expect(useChatMessageStore.getState().messages[CONV_ID]).toBeUndefined();
    const cloudMessages = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    expect(cloudMessages).toHaveLength(2);
    for (const message of cloudMessages) expect(isUuidV7(message.id)).toBe(true);
    expect(cloudMessages[1]).toEqual(
      expect.objectContaining({
        id: assistantId,
        type: 'image',
        imageUrl: 'https://example.com/observatory.png',
        imageGenStatus: 'completed',
      }),
    );
    expect(
      useChatCloudMessageStore.getState().conversations.find((c) => c.id === CONV_ID)?.model,
    ).toBe(AUTO_MODEL);
  });

  it('forks a Cloud conversation wholly inside the Cloud repository', async () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CONV_ID,
      title: 'Cloud Source',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 1,
      pinned: false,
      starred: false,
      archived: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
    });
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
      {
        id: '0190a000-0000-7000-8000-000000000002',
        conversationId: CONV_ID,
        role: 'user',
        content: 'source message',
        createdAt: new Date().toISOString(),
        model: CLOUD_MODEL,
      },
    ]);
    mockPost.mockImplementationOnce((async (
      _path: string,
      body: { id: string; title: string },
    ) => ({
      conversation: {
        id: body.id,
        title: body.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        project_id: null,
        pinned: false,
        starred: false,
        archived: false,
        is_temporary: false,
        model: CLOUD_MODEL,
      },
    })) as never);

    const forkId = await useChatStore.getState().forkConversation(CONV_ID);

    expect(useChatMessageStore.getState().conversations).toHaveLength(0);
    expect(useChatMessageStore.getState().messages[forkId]).toBeUndefined();
    expect(useChatCloudMessageStore.getState().conversations.some((c) => c.id === forkId)).toBe(
      true,
    );
    const forkMessages = useChatCloudMessageStore.getState().messages[forkId] ?? [];
    expect(forkMessages).toHaveLength(1);
    expect(forkMessages[0]).toEqual(
      expect.objectContaining({ conversationId: forkId, content: 'source message' }),
    );
    expect(isUuidV7(forkMessages[0]!.id)).toBe(true);

    // CAP-035: the fork persists a real parent/branch relation, not an
    // untracked copy. The parent link points at the source conversation and the
    // fork point is the last source message id.
    const forkConversation = useChatCloudMessageStore
      .getState()
      .conversations.find((c) => c.id === forkId);
    expect(forkConversation?.parentConversationId).toBe(CONV_ID);
    expect(forkConversation?.forkPointMessageId).toBe('0190a000-0000-7000-8000-000000000002');
  });

  it('writes the finalized turn into the cloud store with UUIDv7 ids and marks it dirty', async () => {
    // A real cloud conversation lives in the cloud store (created via the REST path).
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CONV_ID,
      title: 'Cloud Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      pinned: false,
      starred: false,
      archived: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
    });
    streamReplies('Hello from cloud');

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'hi there', CLOUD_MODEL);

    // Cloud store now holds the user + assistant messages with valid UUIDv7 ids.
    const cloudMsgs = useChatCloudMessageStore.getState().messages[CONV_ID] ?? [];
    expect(cloudMsgs).toHaveLength(2);
    expect(cloudMsgs.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(cloudMsgs[0]?.content).toBe('hi there');
    expect(cloudMsgs[1]?.content).toBe('Hello from cloud');
    for (const m of cloudMsgs) expect(isUuidV7(m.id)).toBe(true);

    // The sidecar has queued the conversation + both messages for the next push.
    const sync = useCloudSyncStateStore.getState();
    expect(sync.dirtyConversationIds).toContain(CONV_ID);
    expect(sync.dirtyMessages.map((d) => d.messageId).sort()).toEqual(
      cloudMsgs.map((m) => m.id).sort(),
    );
  });

  it('pushes the queued cloud turn to /api/chat/sync on the next syncNow', async () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CONV_ID,
      title: 'Cloud Chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: 0,
      pinned: false,
      starred: false,
      archived: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
    });
    streamReplies('Reply');
    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'question', CLOUD_MODEL);

    // Flip to managed mode and sync.
    useChatAppModeStore.getState().setAppMode('cloud');
    await syncNow();

    expect(mockPost).toHaveBeenCalled();
    // Filter specifically for the chat sync call — settings sync now also POSTs
    // in the same syncNow() cycle (after pullProjects), so we can't rely on
    // "last call" ordering. Find the call that targeted /api/chat/sync.
    const chatSyncCall = mockPost.mock.calls.find((c) => (c[0] as string) === '/api/chat/sync') as
      | [
          string,
          { conversations: Array<{ id: string }>; messages: Array<{ id: string; role: string }> },
        ]
      | undefined;
    expect(chatSyncCall).toBeDefined();
    expect(chatSyncCall![1].conversations.map((c) => c.id)).toContain(CONV_ID);
    expect(chatSyncCall![1].messages.map((m) => m.role).sort()).toEqual(['assistant', 'user']);
    // Queue drains once the server acks.
    expect(useCloudSyncStateStore.getState().dirtyMessages).toHaveLength(0);
  });

  it('does NOT touch the cloud store or sync queue for a LOCAL send', async () => {
    useChatMessageStore.setState({
      conversations: [
        {
          id: 'local-1',
          title: 'Local Chat',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          pinned: false,
          starred: false,
          archived: false,
          model: LOCAL_MODEL,
          executionMode: 'local',
        },
      ],
      messages: { 'local-1': [] },
    });
    streamReplies('local reply');

    // The local-runtime path may reject on the stubbed localGenerate; we only care
    // that the cloud store + sync queue stay untouched, so swallow any rejection.
    await useChatExecutionStore
      .getState()
      .sendMessage('local-1', 'hello', LOCAL_MODEL)
      .catch(() => {});

    expect(useChatCloudMessageStore.getState().messages['local-1']).toBeUndefined();
    expect(useCloudSyncStateStore.getState().dirtyMessages).toHaveLength(0);
    expect(useCloudSyncStateStore.getState().dirtyConversationIds).toHaveLength(0);
  });
});

describe('cross-device history continuation', () => {
  it('feeds cloud-store (pulled) history to the LLM when continuing a conversation authored elsewhere', async () => {
    // Prior turns exist ONLY in the cloud store (pulled from web/desktop), never in
    // the local message store — the cross-device continuation case.
    useChatCloudMessageStore.getState().addCloudConversation({
      id: CONV_ID,
      title: 'Started on Web',
      createdAt: '2026-06-20T00:00:00.000Z',
      updatedAt: '2026-06-20T00:00:01.000Z',
      messageCount: 2,
      pinned: false,
      starred: false,
      archived: false,
      model: CLOUD_MODEL,
      executionMode: 'cloud',
    });
    useChatCloudMessageStore.getState().setCloudMessages(CONV_ID, [
      {
        id: '0190a000-0000-7000-8000-00000000aaaa',
        role: 'user',
        content: 'started on web',
        createdAt: '2026-06-20T00:00:00.000Z',
      },
      {
        id: '0190a000-0000-7000-8000-00000000bbbb',
        role: 'assistant',
        content: 'replied on web',
        createdAt: '2026-06-20T00:00:01.000Z',
      },
    ] as never);

    let capturedBody: Parameters<typeof streamChat>[0] | null = null;
    mockStreamChat.mockImplementation(async (body, callbacks: StreamCallbacks) => {
      capturedBody = body;
      callbacks.onDelta({ content: 'continued on mobile' });
      callbacks.onDone();
    });

    await useChatExecutionStore.getState().sendMessage(CONV_ID, 'continue on mobile', CLOUD_MODEL);

    const contents = (capturedBody?.messages ?? []).map((m) =>
      typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    );
    // The pulled web turns are present AND precede the new mobile message.
    expect(contents).toEqual(
      expect.arrayContaining(['started on web', 'replied on web', 'continue on mobile']),
    );
    expect(contents.indexOf('replied on web')).toBeLessThan(contents.indexOf('continue on mobile'));
  });
});
