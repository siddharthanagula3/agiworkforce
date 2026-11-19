import {
  ChatSyncPushRequestSchema,
  type ArtifactSyncPushItem,
} from '@agiworkforce/cloud-contracts';

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
import { ARTIFACT_PUSH_BATCH_MAX, syncNow } from '../services/cloudSyncEngine';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '../src/features/auth/services/cloudAccountSession';

const mockGet = api.get as jest.MockedFunction<typeof api.get>;
const mockPost = api.post as jest.MockedFunction<typeof api.post>;

const OWNER = 'artifact-push-user';
const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const TEMPORARY_CONVERSATION_ID = '33333333-3333-4333-8333-333333333333';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_ID = '44444444-4444-4444-8444-444444444444';
const T = '2026-11-15T00:00:00.000Z';
const ORIGINAL = 'const total = 1;';
const EDITED = 'const total = 2;';
const EDITED_AGAIN = 'const total = 3;';

interface SyncPushBody {
  conversations?: Array<{ id: string }>;
  messages?: Array<{ id: string }>;
  artifacts?: ArtifactSyncPushItem[];
}

function pushItem(overrides: Partial<ArtifactSyncPushItem> = {}): ArtifactSyncPushItem {
  return {
    id: ARTIFACT_ID,
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    title: 'Total',
    artifactType: 'code',
    language: 'ts',
    content: EDITED,
    currentVersion: 2,
    baseVersion: '7',
    ...overrides,
  };
}

function seedEditedArtifact(item: ArtifactSyncPushItem = pushItem(), ownerId = OWNER): void {
  const live = {
    id: item.id,
    title: item.title ?? 'Total',
    content: item.content,
    language: 'ts',
    type: 'code',
    previewLines: [item.content],
    conversationId: item.conversationId,
    messageId: item.messageId ?? undefined,
    createdAt: T,
    provenance: { scope: 'cloud', ownerId },
  };
  useArtifactStore.setState((state) => ({
    artifacts: [...state.artifacts, live as never],
    versionsById: {
      ...state.versionsById,
      [item.id]: [{ ...live, content: ORIGINAL } as never, live as never],
    },
    pendingCloudPushes: { ...state.pendingCloudPushes, [item.id]: { ownerId, item } },
  }));
}

function serverRow(content: string, serverVersion: string) {
  return {
    id: ARTIFACT_ID,
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    title: 'Total',
    artifact_type: 'code',
    language: 'ts',
    content,
    current_version: 3,
    pinned: false,
    tags: [],
    created_at: T,
    updated_at: T,
    deleted_at: null,
    server_version: serverVersion,
  };
}

function pushResponse(
  body: SyncPushBody,
  artifacts: { applied?: unknown[]; conflicts?: unknown[] } = {},
) {
  return {
    protocolVersion: 2,
    applied: {
      conversations: (body.conversations ?? []).map((c) => ({ id: c.id, server_version: '1' })),
      messages: (body.messages ?? []).map((m) => ({ id: m.id, server_version: '1' })),
      artifacts: artifacts.applied ?? [],
    },
    conflicts: { conversations: [], messages: [], artifacts: artifacts.conflicts ?? [] },
    cursor: '1',
  };
}

function chatSyncBodies(): SyncPushBody[] {
  return mockPost.mock.calls
    .filter(([path]) => path === '/api/chat/sync')
    .map(([, body]) => body as SyncPushBody);
}

beforeEach(() => {
  jest.clearAllMocks();
  __resetCloudAccountSessionForTests();
  activateCloudAccount(OWNER);
  useCloudSyncStateStore.getState().reset();
  useChatCloudMessageStore.getState().clearCloudData();
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
    pendingCloudPushes: {},
  });
  useChatAppModeStore.getState().setAppMode('cloud');
  mockGet.mockImplementation((async (path: string) => {
    if (path.startsWith('/api/memory/sync')) return { memories: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/projects/sync')) return { projects: [], cursor: '0', hasMore: false };
    if (path.startsWith('/api/settings/sync')) return { settings: {}, cursor: '0', hasMore: false };
    return { conversations: [], messages: [], artifacts: [], cursor: '0', hasMore: false };
  }) as never);
});

describe('pushing an edited Cloud artifact', () => {
  it('sends the edit even when no chat or message changed, and settles it on the server version', async () => {
    seedEditedArtifact();
    mockPost.mockImplementation((async (_path: string, body: SyncPushBody) =>
      pushResponse(body, {
        applied: [{ id: ARTIFACT_ID, server_version: '12' }],
      })) as never);

    await syncNow();

    expect(chatSyncBodies()).toHaveLength(1);
    expect(chatSyncBodies()[0]?.artifacts).toEqual([pushItem()]);
    const state = useArtifactStore.getState();
    expect(state.pendingCloudPushes).toEqual({});
    expect(state.cloudArtifacts).toEqual([
      expect.objectContaining({
        id: ARTIFACT_ID,
        content: EDITED,
        metadata: expect.objectContaining({ serverVersion: '12' }),
      }),
    ]);
  });

  it('keeps an edit made while the push was in flight and rebases it on the new version', async () => {
    seedEditedArtifact();
    mockPost.mockImplementation((async (_path: string, body: SyncPushBody) => {
      useArtifactStore.setState((state) => ({
        pendingCloudPushes: {
          [ARTIFACT_ID]: {
            ownerId: OWNER,
            item: { ...state.pendingCloudPushes[ARTIFACT_ID]!.item, content: EDITED_AGAIN },
          },
        },
      }));
      return pushResponse(body, { applied: [{ id: ARTIFACT_ID, server_version: '12' }] });
    }) as never);

    await syncNow();

    const pending = useArtifactStore.getState().pendingCloudPushes[ARTIFACT_ID];
    expect(pending?.item.content).toBe(EDITED_AGAIN);
    expect(pending?.item.baseVersion).toBe('12');
    expect(useArtifactStore.getState().cloudArtifacts[0]?.content).toBe(EDITED);
  });

  it('shows the server copy on a conflict and keeps the edit as an earlier version', async () => {
    seedEditedArtifact();
    const serverContent = 'const total = 99;';
    mockPost.mockImplementation((async (_path: string, body: SyncPushBody) =>
      pushResponse(body, {
        conflicts: [{ id: ARTIFACT_ID, current: serverRow(serverContent, '15') }],
      })) as never);

    await syncNow();

    const state = useArtifactStore.getState();
    expect(state.pendingCloudPushes).toEqual({});
    expect(state.artifacts.find((artifact) => artifact.id === ARTIFACT_ID)?.content).toBe(
      serverContent,
    );
    expect(state.versionsById[ARTIFACT_ID]?.map((version) => version.content)).toContain(EDITED);
  });

  it('drops an edit the server refused with no row', async () => {
    seedEditedArtifact();
    mockPost.mockImplementation((async (_path: string, body: SyncPushBody) =>
      pushResponse(body, { conflicts: [{ id: ARTIFACT_ID, current: null }] })) as never);

    await syncNow();

    expect(useArtifactStore.getState().pendingCloudPushes).toEqual({});
  });

  it("never sends another account's edits or an artifact from a temporary chat", async () => {
    useChatCloudMessageStore.getState().addCloudConversation({
      id: TEMPORARY_CONVERSATION_ID,
      title: 'Temporary',
      createdAt: T,
      updatedAt: T,
      messageCount: 0,
      pinned: false,
      temporary: true,
    });
    seedEditedArtifact(pushItem(), 'another-account');
    seedEditedArtifact(
      pushItem({
        id: '55555555-5555-4555-8555-555555555555',
        conversationId: TEMPORARY_CONVERSATION_ID,
      }),
    );
    mockPost.mockImplementation((async (_path: string, body: SyncPushBody) =>
      pushResponse(body)) as never);

    await syncNow();

    expect(chatSyncBodies()).toHaveLength(0);
  });

  it('sends no more artifacts in one push than the sync contract accepts', async () => {
    const items = Array.from({ length: ARTIFACT_PUSH_BATCH_MAX + 1 }, (_, index) =>
      pushItem({ id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}` }),
    );
    useArtifactStore.setState({
      pendingCloudPushes: Object.fromEntries(
        items.map((item) => [item.id, { ownerId: OWNER, item }]),
      ),
    });
    mockPost.mockImplementation((async (_path: string, body: SyncPushBody) =>
      pushResponse(body)) as never);

    await syncNow();

    const sent = chatSyncBodies()[0]?.artifacts ?? [];
    expect(sent).toHaveLength(ARTIFACT_PUSH_BATCH_MAX);
    const request = { protocolVersion: 2, conversations: [], messages: [] };
    expect(ChatSyncPushRequestSchema.safeParse({ ...request, artifacts: sent }).success).toBe(true);
    expect(ChatSyncPushRequestSchema.safeParse({ ...request, artifacts: items }).success).toBe(
      false,
    );
  });
});
