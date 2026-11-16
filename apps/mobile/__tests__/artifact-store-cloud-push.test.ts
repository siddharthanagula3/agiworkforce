import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';

var mockMmkv: Map<string, string>;
var mockActiveCloudOwnerId: string | null;

jest.mock('@/lib/mmkv', () => {
  mockMmkv = new Map<string, string>();
  return {
    storage: {
      getString: (key: string) => mockMmkv.get(key),
      set: (key: string, value: string) => void mockMmkv.set(key, value),
      delete: (key: string) => void mockMmkv.delete(key),
      remove: (key: string) => void mockMmkv.delete(key),
      getAllKeys: () => [...mockMmkv.keys()],
    },
    mmkvStorage: {
      getItem: (key: string) => mockMmkv.get(key) ?? null,
      setItem: (key: string, value: string) => void mockMmkv.set(key, value),
      removeItem: (key: string) => void mockMmkv.delete(key),
    },
    whenMmkvReady: (callback: () => void) => callback(),
    rehydrateWhenMmkvReady: jest.fn(),
  };
});

jest.mock('@/src/features/auth/services/cloudAccountSession', () => {
  mockActiveCloudOwnerId = null;
  return {
    captureCloudAccountEpoch: () =>
      mockActiveCloudOwnerId === null ? null : { ownerId: mockActiveCloudOwnerId, epoch: 1 },
    isCloudAccountEpochCurrent: () => true,
  };
});

import {
  canonicalToMobileArtifact,
  deriveAndMapToMobileArtifacts,
  useArtifactStore,
} from '@/src/features/artifacts/store';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = '2026-11-15T00:00:00.000Z';
const CLOUD_A = { scope: 'cloud', ownerId: 'user-a' } as const;
const THEME = { teal: 't', terraCotta: 'c', agentThinking: 'k', agentActive: 'a' };
const ORIGINAL = [
  '<!-- @artifact -->',
  '<!DOCTYPE html>',
  '<title>Counter</title>',
  '<div>0</div>',
].join('\n');
const EDITED = [
  '<!-- @artifact -->',
  '<!DOCTYPE html>',
  '<title>Counter</title>',
  '<div>10</div>',
].join('\n');

function deriveCloudArtifact(provenance: typeof CLOUD_A | { scope: 'local' } = CLOUD_A) {
  const [derived] = deriveAndMapToMobileArtifacts(
    ['```html', ORIGINAL, '```'].join('\n'),
    CONVERSATION_ID,
    MESSAGE_ID,
    CREATED_AT,
    'Cloud chat',
    provenance,
  );
  if (!derived) throw new Error('expected a derived artifact');
  useArtifactStore.getState().addArtifacts([derived]);
  return derived;
}

function delta(id: string, overrides: Partial<ArtifactWireDelta> = {}): ArtifactWireDelta {
  return {
    id,
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    title: 'Code',
    artifact_type: 'html',
    language: 'html',
    content: ORIGINAL,
    current_version: 3,
    pinned: true,
    tags: ['launch'],
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    deleted_at: null,
    server_version: '7',
    ...overrides,
  };
}

function liveContent(id: string): string | undefined {
  return useArtifactStore.getState().artifacts.find((artifact) => artifact.id === id)?.content;
}

beforeEach(() => {
  mockMmkv.clear();
  mockActiveCloudOwnerId = 'user-a';
  useArtifactStore.setState({
    artifacts: [],
    versionsById: {},
    cloudArtifacts: [],
    cloudArtifactsOwnerId: null,
    pendingCloudPushes: {},
  });
});

describe('Library card preview lines', () => {
  it('drops a leading artifact marker and fence lines from the preview', () => {
    const artifact = canonicalToMobileArtifact(
      {
        id: 'doc',
        type: 'document',
        title: 'Page',
        content: ['<!-- @artifact -->', '```html', '<main>Hello</main>', '```', 'Done'].join('\n'),
      },
      CREATED_AT,
      'Chat',
      THEME,
      { scope: 'local' },
    );
    expect(artifact.previewLines).toEqual(['<main>Hello</main>', 'Done']);
  });

  it('drops a marker that sits under an opening fence and a tilde fence', () => {
    const artifact = canonicalToMobileArtifact(
      {
        id: 'diagram',
        type: 'code',
        title: 'Flow',
        content: ['~~~mermaid', '%% @artifact', 'graph TD', 'A --> B', '~~~'].join('\n'),
      },
      CREATED_AT,
      'Chat',
      THEME,
      { scope: 'local' },
    );
    expect(artifact.previewLines).toEqual(['graph TD', 'A --> B']);
  });

  it('keeps a marker that is not the first line, since only a leading marker is chrome', () => {
    const artifact = canonicalToMobileArtifact(
      {
        id: 'note',
        type: 'document',
        title: 'Note',
        content: ['Write the marker as', '// @artifact'].join('\n'),
      },
      CREATED_AT,
      'Chat',
      THEME,
      { scope: 'local' },
    );
    expect(artifact.previewLines).toEqual(['Write the marker as', '// @artifact']);
  });
});

describe('pending pushes of edited Cloud artifacts', () => {
  it('records a saved Cloud edit as a push item carrying the server row it was based on', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().applyCloudArtifactDeltas([delta(derived.id)], 'user-a');

    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([
      {
        id: derived.id,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        title: derived.title,
        artifactType: 'html',
        language: derived.language,
        content: EDITED,
        currentVersion: 4,
        pinned: true,
        tags: ['launch'],
        baseVersion: '7',
      },
    ]);
    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-b')).toEqual([]);
  });

  it('pushes a never-synced derived artifact against base version 0 with its conversation', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    const [item] = useArtifactStore.getState().pendingCloudArtifactPushes('user-a');
    expect(item).toMatchObject({
      id: derived.id,
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
      artifactType: 'html',
      content: EDITED,
      baseVersion: '0',
      currentVersion: 2,
    });
  });

  it('never queues a Local artifact edit for the account', () => {
    const derived = deriveCloudArtifact({ scope: 'local' });
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    expect(useArtifactStore.getState().pendingCloudPushes).toEqual({});
    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([]);
  });

  it('queues a restored version as a push too', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });
    useArtifactStore.getState().markArtifactPushed(derived.id, '8');

    expect(useArtifactStore.getState().restoreArtifactVersion(derived.id, 0)).toBe(true);

    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([
      expect.objectContaining({ content: ORIGINAL, baseVersion: '8' }),
    ]);
  });

  it('settles a push: the cloud row takes the new server version and the next edit builds on it', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().applyCloudArtifactDeltas([delta(derived.id)], 'user-a');
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    useArtifactStore.getState().markArtifactPushed(derived.id, '9');

    const state = useArtifactStore.getState();
    expect(state.pendingCloudArtifactPushes('user-a')).toEqual([]);
    const row = state.cloudArtifacts.find((candidate) => candidate.id === derived.id);
    expect(row?.content).toBe(EDITED);
    expect(row?.metadata).toEqual({ pinned: true, tags: ['launch'], serverVersion: '9' });

    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: `${EDITED}\n// next` });
    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([
      expect.objectContaining({ content: `${EDITED}\n// next`, baseVersion: '9' }),
    ]);
  });

  it('keeps a newer edit made while an older push was in flight, rebased on the new version', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: `${EDITED}\n// later` });

    useArtifactStore.getState().markArtifactPushed(derived.id, '5', EDITED);

    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([
      expect.objectContaining({ content: `${EDITED}\n// later`, baseVersion: '5' }),
    ]);
  });

  it('ignores a push result for another account', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });
    mockActiveCloudOwnerId = 'user-b';

    useArtifactStore.getState().markArtifactPushed(derived.id, '9');

    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toHaveLength(1);
  });

  it('on a conflict with a newer server copy, shows the server copy and keeps the edit as a version', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().applyCloudArtifactDeltas([delta(derived.id)], 'user-a');
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });
    const serverContent = 'const fromDesktop = true;';

    useArtifactStore
      .getState()
      .settleArtifactPushConflict(
        derived.id,
        delta(derived.id, { content: serverContent, server_version: '12' }),
      );

    const state = useArtifactStore.getState();
    expect(liveContent(derived.id)).toBe(serverContent);
    expect(state.versionsById[derived.id]?.map((version) => version.content)).toEqual([
      ORIGINAL,
      EDITED,
      serverContent,
    ]);
    expect(state.pendingCloudArtifactPushes('user-a')).toEqual([]);
    expect(state.cloudArtifacts.find((row) => row.id === derived.id)?.metadata).toMatchObject({
      serverVersion: '12',
    });
  });

  it('on a conflict whose server copy is one this device already had, retries on the server version', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    useArtifactStore
      .getState()
      .settleArtifactPushConflict(derived.id, delta(derived.id, { server_version: '3' }));

    expect(liveContent(derived.id)).toBe(EDITED);
    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([
      expect.objectContaining({ content: EDITED, baseVersion: '3' }),
    ]);
  });

  it('drops a refused push that has no server row instead of retrying it forever', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    useArtifactStore.getState().settleArtifactPushConflict(derived.id, null);

    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([]);
    expect(liveContent(derived.id)).toBe(EDITED);
  });

  it('forgets a pending push once a pull brings the same content, and on sign-out', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });
    useArtifactStore
      .getState()
      .applyCloudArtifactDeltas(
        [delta(derived.id, { content: EDITED, server_version: '20' })],
        'user-a',
      );
    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toEqual([]);

    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: `${EDITED}\n// again` });
    expect(useArtifactStore.getState().pendingCloudArtifactPushes('user-a')).toHaveLength(1);
    useArtifactStore.getState().clearAccountScopedArtifacts();
    expect(useArtifactStore.getState().pendingCloudPushes).toEqual({});
  });

  it('persists pending pushes so a restart still sends the edit', () => {
    const derived = deriveCloudArtifact();
    useArtifactStore.getState().saveArtifactEdit({ ...derived, content: EDITED });

    const persisted = JSON.parse(mockMmkv.get('artifact-store') ?? '{}') as {
      state?: {
        pendingCloudPushes?: Record<string, { ownerId: string; item: { content: string } }>;
      };
    };
    expect(persisted.state?.pendingCloudPushes?.[derived.id]).toMatchObject({
      ownerId: 'user-a',
      item: { content: EDITED, baseVersion: '0' },
    });
  });
});
