import { readFileSync } from 'fs';
import path from 'path';

var mockMmkv: Map<string, string>;
var mockActiveCloudOwnerId: string | null;
var mockActiveCloudEpoch: number;
var mockWhenMmkvReady: jest.Mock;

jest.mock('@/lib/mmkv', () => {
  mockMmkv = new Map<string, string>();
  mockWhenMmkvReady = jest.fn((callback: () => void) => callback());
  return {
    storage: {
      getString: (key: string) => mockMmkv.get(key),
      set: (key: string, value: string) => void mockMmkv.set(key, value),
      delete: (key: string) => void mockMmkv.delete(key),
      getAllKeys: () => [...mockMmkv.keys()],
    },
    mmkvStorage: {
      getItem: (key: string) => mockMmkv.get(key) ?? null,
      setItem: (key: string, value: string) => void mockMmkv.set(key, value),
      removeItem: (key: string) => void mockMmkv.delete(key),
    },
    whenMmkvReady: (callback: () => void) => mockWhenMmkvReady(callback),
    rehydrateWhenMmkvReady: jest.fn(),
  };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => {
  mockActiveCloudOwnerId = null;
  mockActiveCloudEpoch = 1;
  return {
    captureCloudAccountEpoch: () =>
      mockActiveCloudOwnerId === null
        ? null
        : { ownerId: mockActiveCloudOwnerId, epoch: mockActiveCloudEpoch },
    isCloudAccountEpochCurrent: (snapshot: { ownerId: string; epoch: number } | null) =>
      snapshot !== null &&
      snapshot.ownerId === mockActiveCloudOwnerId &&
      snapshot.epoch === mockActiveCloudEpoch,
  };
});

import * as draftStore from '@/src/features/chat/draftStore';
import {
  deriveAndMapToMobileArtifacts,
  generatedImageToMobileArtifact,
  useArtifactStore,
} from '@/src/features/artifacts/store';
import * as offlineQueueModule from '@/services/offlineQueue';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';

const THEME = {
  teal: '#21808d',
  terraCotta: '#da7756',
  agentThinking: '#a855f7',
  agentActive: '#3b82f6',
};

const LOCAL_PROVENANCE = { scope: 'local' } as const;
const CLOUD_A_PROVENANCE = { scope: 'cloud', ownerId: 'user-a' } as const;

function artifact(
  id: string,
  provenance?: { scope: 'local' } | { scope: 'cloud'; ownerId: string },
) {
  return {
    id,
    title: id,
    kind: 'code' as const,
    content: 'const value = true;',
    ageLabel: 'just now',
    sourceLabel: 'Chat',
    accentColor: '#21808d',
    previewLines: ['const value = true;'],
    ...(provenance ? { provenance } : {}),
  };
}

beforeEach(() => {
  mockMmkv.clear();
  mockActiveCloudOwnerId = 'user-a';
  mockActiveCloudEpoch += 1;
  offlineQueueModule.offlineQueue.clear();
  useChatAppModeStore.setState({ appMode: 'local' });
  useArtifactStore.setState({
    artifacts: [],
    cloudArtifacts: [],
  });
});

describe('artifact account provenance', () => {
  it('tags derived code and generated images with their explicit execution provenance', () => {
    const derived = deriveAndMapToMobileArtifacts(
      ['```ts', 'const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;', '```'].join('\n'),
      'conversation-1',
      'message-1',
      '2026-07-26T00:00:00.000Z',
      'Local chat',
      THEME,
      LOCAL_PROVENANCE,
    );
    const image = generatedImageToMobileArtifact({
      messageId: 'message-2',
      imagePath: '/api/files/image-2',
      prompt: 'Enterprise launch',
      createdAt: '2026-07-26T00:00:00.000Z',
      conversationTitle: 'AGI Cloud',
      provenance: CLOUD_A_PROVENANCE,
      accentColor: 'semantic-image-accent',
    });

    expect(derived[0]?.provenance).toEqual(LOCAL_PROVENANCE);
    expect(image.provenance).toEqual(CLOUD_A_PROVENANCE);
    expect(image.accentColor).toBe('semantic-image-accent');
  });

  it('clears every account-scoped or unowned artifact while preserving provably Local data', () => {
    useArtifactStore.setState({
      artifacts: [
        artifact('local', LOCAL_PROVENANCE),
        artifact('cloud-a', CLOUD_A_PROVENANCE),
        artifact('legacy-unowned'),
      ],
      cloudArtifacts: [
        {
          id: 'pulled-cloud',
          type: 'document',
          title: 'Cloud document',
          content: 'private',
          version: 1,
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          metadata: {},
          deletedAt: null,
        },
      ],
      cloudArtifactsOwnerId: 'user-a',
    } as never);

    const reset = useArtifactStore.getState().clearAccountScopedArtifacts;
    expect(typeof reset).toBe('function');
    reset?.();

    expect(useArtifactStore.getState().artifacts).toEqual([artifact('local', LOCAL_PROVENANCE)]);
    expect(useArtifactStore.getState().cloudArtifacts).toEqual([]);
    expect(useArtifactStore.getState().cloudArtifactsOwnerId).toBeNull();
  });

  it('replaces the prior Cloud owner without removing Local artifacts and rejects stale writes', () => {
    useArtifactStore.getState().addArtifacts([artifact('local', LOCAL_PROVENANCE)]);
    useArtifactStore.getState().addArtifacts([artifact('cloud-a', CLOUD_A_PROVENANCE)]);
    expect(useArtifactStore.getState().cloudArtifactsOwnerId).toBe('user-a');

    mockActiveCloudOwnerId = 'user-b';
    mockActiveCloudEpoch += 1;
    useArtifactStore
      .getState()
      .addArtifacts([artifact('cloud-b', { scope: 'cloud', ownerId: 'user-b' })]);
    useArtifactStore.getState().addArtifacts([artifact('stale-cloud-a', CLOUD_A_PROVENANCE)]);

    expect(
      useArtifactStore
        .getState()
        .artifacts.map(({ id }) => id)
        .sort(),
    ).toEqual(['cloud-b', 'local']);
    expect(useArtifactStore.getState().cloudArtifactsOwnerId).toBe('user-b');
  });

  it('clears an old pulled overlay even when the new owner receives no deltas', () => {
    useArtifactStore.setState({
      cloudArtifacts: [
        {
          id: 'cloud-a',
          type: 'document',
          title: 'Account A',
          content: 'private',
          version: 1,
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T00:00:00.000Z',
          conversationId: 'conversation-a',
          messageId: 'message-a',
          metadata: {},
          deletedAt: null,
        },
      ],
      cloudArtifactsOwnerId: 'user-a',
    });
    mockActiveCloudOwnerId = 'user-b';
    mockActiveCloudEpoch += 1;

    useArtifactStore.getState().applyCloudArtifactDeltas([], 'user-b');

    expect(useArtifactStore.getState().cloudArtifacts).toEqual([]);
    expect(useArtifactStore.getState().cloudArtifactsOwnerId).toBe('user-b');
  });
});

describe('offline queue account provenance', () => {
  it('registers persisted queue restoration for encrypted-MMKV readiness', () => {
    expect(mockWhenMmkvReady).toHaveBeenCalled();
  });

  it('drops legacy unowned persisted prompts instead of adopting them', () => {
    mockMmkv.set(
      'offline_queue_v1',
      JSON.stringify([
        {
          id: 'legacy',
          conversationId: 'legacy-conversation',
          content: 'Legacy private prompt',
          model: 'auto-balanced',
          queuedAt: '2026-07-26T00:00:00.000Z',
          retryCount: 0,
        },
        {
          id: 'local',
          conversationId: 'local-conversation',
          content: 'Local prompt',
          model: 'local-model',
          queuedAt: '2026-07-26T00:00:00.000Z',
          retryCount: 0,
          provenance: LOCAL_PROVENANCE,
        },
      ]),
    );

    offlineQueueModule.offlineQueue.restoreFromStorage();

    expect(offlineQueueModule.offlineQueue.getQueue()).toEqual([
      expect.objectContaining({ id: 'local', provenance: LOCAL_PROVENANCE }),
    ]);
    expect(mockMmkv.get('offline_queue_v1')).not.toContain('Legacy private prompt');
  });

  it('rejects enqueue for a Cloud owner other than the active account', () => {
    mockActiveCloudOwnerId = 'user-b';

    expect(() =>
      offlineQueueModule.offlineQueue.enqueue({
        conversationId: 'cloud-conversation-a',
        content: 'Account A prompt',
        model: 'auto-balanced',
        provenance: CLOUD_A_PROVENANCE,
      }),
    ).toThrow('inactive account');
  });

  it('never replays an account-A Cloud prompt while account B is active', async () => {
    offlineQueueModule.offlineQueue.enqueue({
      conversationId: 'cloud-conversation-a',
      content: 'Account A private prompt',
      model: 'auto-balanced',
      provenance: CLOUD_A_PROVENANCE,
    } as never);
    mockActiveCloudOwnerId = 'user-b';
    mockActiveCloudEpoch += 1;
    const send = jest.fn().mockResolvedValue(undefined);

    await offlineQueueModule.offlineQueue.processQueue(send);

    expect(send).not.toHaveBeenCalled();
    expect(offlineQueueModule.offlineQueue.getQueue()).toEqual([]);
  });

  it.each([
    {
      activeMode: 'cloud' as const,
      provenance: LOCAL_PROVENANCE,
      model: 'local-model',
    },
    {
      activeMode: 'local' as const,
      provenance: CLOUD_A_PROVENANCE,
      model: 'auto-balanced',
    },
  ])(
    'does not replay a $provenance.scope entry while current mode is $activeMode',
    async ({ activeMode, provenance, model }) => {
      offlineQueueModule.offlineQueue.enqueue({
        conversationId: `${provenance.scope}-conversation`,
        content: `${provenance.scope} private prompt`,
        model,
        provenance,
      });
      useChatAppModeStore.setState({ appMode: activeMode });
      const send = jest.fn().mockResolvedValue(undefined);

      await offlineQueueModule.offlineQueue.processQueue(send);

      expect(send).not.toHaveBeenCalled();
      expect(offlineQueueModule.offlineQueue.getQueue()).toHaveLength(1);
    },
  );

  it('does not retry a Cloud entry when its account becomes stale in the send failure path', async () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });
    offlineQueueModule.offlineQueue.enqueue({
      conversationId: 'cloud-conversation-a',
      content: 'Account A prompt',
      model: 'auto-balanced',
      provenance: CLOUD_A_PROVENANCE,
    });
    const send = jest.fn().mockImplementation(async () => {
      mockActiveCloudOwnerId = 'user-b';
      mockActiveCloudEpoch += 1;
      throw new Error('Network interrupted during account switch');
    });

    await offlineQueueModule.offlineQueue.processQueue(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(offlineQueueModule.offlineQueue.getQueue()).toEqual([]);
  });

  it('includes provenance in duplicate identity', () => {
    offlineQueueModule.offlineQueue.enqueue({
      conversationId: 'same-conversation',
      content: 'same content',
      model: 'local-model',
      provenance: LOCAL_PROVENANCE,
    });
    offlineQueueModule.offlineQueue.enqueue({
      conversationId: 'same-conversation',
      content: 'same content',
      model: 'auto-balanced',
      provenance: CLOUD_A_PROVENANCE,
    });

    expect(offlineQueueModule.offlineQueue.getQueue()).toHaveLength(2);
  });

  it('selectively clears Cloud and legacy entries while preserving Local entries', () => {
    offlineQueueModule.offlineQueue.enqueue({
      conversationId: 'local-conversation',
      content: 'Provably local prompt',
      model: 'local-model',
      provenance: LOCAL_PROVENANCE,
    } as never);
    offlineQueueModule.offlineQueue.enqueue({
      conversationId: 'cloud-conversation',
      content: 'Cloud prompt',
      model: 'auto-balanced',
      provenance: CLOUD_A_PROVENANCE,
    } as never);

    const reset = offlineQueueModule.clearAccountScopedOfflineQueue;
    expect(typeof reset).toBe('function');
    reset?.();

    expect(offlineQueueModule.offlineQueue.getQueue()).toEqual([
      expect.objectContaining({
        conversationId: 'local-conversation',
        provenance: LOCAL_PROVENANCE,
      }),
    ]);
  });

  it('wires the chat screen so only owned Cloud turns queue while Local runs offline', () => {
    const source = readFileSync(
      path.join(__dirname, '..', 'app', '(app)', 'chat', '[id].tsx'),
      'utf8',
    );

    expect(source).toContain("if (!isOnline && conversationExecutionMode === 'cloud')");
    expect(source).toContain("provenance: { scope: 'cloud', ownerId: clerkUserId }");
    expect(source).toContain("isOnline={conversationExecutionMode === 'local' || isOnline}");
  });
});

describe('composer draft account provenance', () => {
  it('keeps Local and Cloud drafts isolated even when they share a logical composer key', () => {
    draftStore.setDraft('new-chat', 'Local draft', LOCAL_PROVENANCE);
    draftStore.setDraft('new-chat', 'Cloud draft', CLOUD_A_PROVENANCE);

    expect(draftStore.getDraft('new-chat', LOCAL_PROVENANCE)).toBe('Local draft');
    expect(draftStore.getDraft('new-chat', CLOUD_A_PROVENANCE)).toBe('Cloud draft');
  });

  it('removes Cloud and legacy drafts while preserving provably Local drafts', () => {
    draftStore.setDraft('local-conversation', 'Local draft', LOCAL_PROVENANCE);
    draftStore.setDraft('cloud-conversation', 'Cloud draft', CLOUD_A_PROVENANCE);
    mockMmkv.set('composer-draft:legacy-conversation', 'Legacy unowned draft');

    const reset = draftStore.clearAccountScopedDrafts;
    expect(typeof reset).toBe('function');
    reset?.();

    expect(draftStore.getDraft('local-conversation', LOCAL_PROVENANCE)).toBe('Local draft');
    expect(mockMmkv.has('composer-draft:cloud-conversation')).toBe(false);
    expect(mockMmkv.has('composer-draft:legacy-conversation')).toBe(false);
  });

  it('does not expose a Cloud draft to a different active account', () => {
    draftStore.setDraft('cloud-conversation', 'Account A draft', CLOUD_A_PROVENANCE);
    mockActiveCloudOwnerId = 'user-b';
    mockActiveCloudEpoch += 1;

    expect(draftStore.getDraft('cloud-conversation', CLOUD_A_PROVENANCE)).toBe('');
  });
});
