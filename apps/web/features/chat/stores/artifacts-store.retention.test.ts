import { beforeEach, describe, expect, it } from 'vitest';
import type { ArtifactWireDelta, ChatSyncPushResponse } from '@agiworkforce/cloud-contracts';
import { _sharedArtifactStore, useArtifactsStore } from './artifacts-store';

const ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';
const MESSAGE_ID = '33333333-3333-4333-8333-333333333333';
const partial = {
  id: ID,
  conversationId: CONVERSATION_ID,
  messageId: MESSAGE_ID,
  type: 'html' as const,
  language: 'html',
  title: 'Partial',
  content: '<main>Partial',
  interrupted: true,
};

function cloud(overrides: Partial<ArtifactWireDelta> = {}): ArtifactWireDelta {
  return {
    id: ID,
    conversation_id: CONVERSATION_ID,
    message_id: MESSAGE_ID,
    title: 'Cloud',
    artifact_type: 'html',
    language: 'html',
    content: '<main>Cloud</main>',
    current_version: 2,
    pinned: false,
    tags: [],
    created_at: '2026-07-17T00:00:00.000Z',
    updated_at: '2026-07-17T00:01:00.000Z',
    deleted_at: null,
    server_version: '12',
    ...overrides,
  };
}

function rejected(current: ArtifactWireDelta | null): ChatSyncPushResponse {
  return {
    protocolVersion: 2,
    applied: { conversations: [], messages: [], artifacts: [] },
    conflicts: { conversations: [], messages: [], artifacts: [{ id: ID, current }] },
    cursor: '12',
  };
}

function expectRefusal(outcome: 'unchanged' | 'preserved' | 'blocked', content = partial.content) {
  const engineBefore = _sharedArtifactStore.getState();
  const facadeBefore = useArtifactsStore.getState();
  const persistedBefore = localStorage.getItem('agi-artifacts-store');
  expect(facadeBefore.retainPartialArtifact({ ...partial, content })).toBe(outcome);
  expect(_sharedArtifactStore.getState()).toBe(engineBefore);
  expect(useArtifactsStore.getState()).toEqual(facadeBefore);
  expect(localStorage.getItem('agi-artifacts-store')).toBe(persistedBefore);
}

describe('create-only partial retention in currently known client state', () => {
  beforeEach(() => useArtifactsStore.getState().reset());

  it('creates a first partial using existing creation and selection semantics', () => {
    expect(useArtifactsStore.getState().retainPartialArtifact(partial)).toBe('created');
    expect(useArtifactsStore.getState().artifacts).toEqual([expect.objectContaining(partial)]);
    expect(useArtifactsStore.getState().selectedArtifactId).toBe(ID);
    expect(useArtifactsStore.getState().getArtifactVersions(ID)).toHaveLength(1);
    expectRefusal('unchanged');
    expectRefusal('preserved', '<main>Later partial');
  });

  it.each(['edit', 'rename', 'restore', 'empty'] as const)(
    'preserves saved %s and all side/UI/history state',
    (kind) => {
      const store = useArtifactsStore.getState();
      store.upsertArtifact(partial);
      if (kind === 'edit' || kind === 'restore') {
        store.upsertArtifact({ ...partial, content: 'My edited work' });
      }
      if (kind === 'restore') store.restoreArtifactVersion(ID, 0);
      if (kind === 'rename') store.renameArtifact(ID, 'My title');
      if (kind === 'empty') store.upsertArtifact({ ...partial, content: '' });
      store.openArtifactForEditing(ID);
      store.setCloudSyncStatus('error', 'Existing sync error');
      expectRefusal('preserved', 'New partial bytes');
      expectRefusal('unchanged', useArtifactsStore.getState().artifacts[0]!.content);
      expectRefusal('preserved', `${useArtifactsStore.getState().artifacts[0]!.content} `);
    },
  );

  it('uses cloud-visible content, not a raw local match, and never creates over cloud-only work', () => {
    const store = useArtifactsStore.getState();
    store.applyCloudArtifactDeltas([cloud()]);
    expectRefusal('unchanged', '<main>Cloud</main>');
    expectRefusal('preserved');
    store.upsertArtifact(partial);
    expectRefusal('preserved');
    expectRefusal('unchanged', '<main>Cloud</main>');
  });

  it('leaves saved type and generated-file side metadata intact on refusal', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact({
      ...partial,
      type: 'pdf',
      language: 'pdf',
      title: 'My file',
      generatedFile: {
        id: 'gf-1',
        computeSessionId: 'cs-1',
        ownerUserId: 'u1',
        sourceSurface: 'web',
        privacyMode: 'managed',
        providerMode: 'ManagedGateway',
        kind: 'pdf',
        fileName: 'Draft.pdf',
        mimeType: 'application/pdf',
        uri: '/api/files/11111111-2222-4333-8444-555555555555',
        byteCount: 2048,
        checksumSha256: 'a'.repeat(64),
        previewDerivatives: [],
        createdAt: '2026-07-10T00:00:00Z',
      },
    });
    expectRefusal('unchanged');
    expectRefusal('preserved', 'Later bytes');
  });

  it('uses the canonical locally edited winner when it supersedes cloud', () => {
    const store = useArtifactsStore.getState();
    store.applyCloudArtifactDeltas([cloud()]);
    store.upsertArtifact(partial);
    store.upsertArtifact({ ...partial, content: 'Local edit', createdAt: new Date('2026-07-18') });
    expectRefusal('unchanged', 'Local edit');
    expectRefusal('preserved', '<main>Cloud</main>');
  });

  it.each([false, true])(
    'blocks a cloud tombstone even with hidden local=%s and matching bytes',
    (local) => {
      const store = useArtifactsStore.getState();
      if (local) store.upsertArtifact(partial);
      store.applyCloudArtifactDeltas([
        cloud({ content: partial.content, deleted_at: '2026-07-18T00:00:00.000Z' }),
      ]);
      expectRefusal('blocked');
      store.clearCloudArtifacts();
      expect(useArtifactsStore.getState().artifacts).toHaveLength(local ? 1 : 0);
    },
  );

  it('keeps a removed in-flight artifact blocked without consuming its pending result', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact(partial);
    expect(store.collectArtifactPushBatch()).toHaveLength(1);
    store.removeArtifact(ID);
    expectRefusal('blocked');
    store.applyArtifactPushResult({
      protocolVersion: 2,
      applied: { conversations: [], messages: [], artifacts: [{ id: ID, server_version: '13' }] },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '13',
    });
    expect(useArtifactsStore.getState().artifacts[0]?.content).toBe(partial.content);
  });

  it('blocks residual rejected pushes including an empty rejected content string', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact({ ...partial, content: '' });
    expect(store.collectArtifactPushBatch()).toHaveLength(1);
    store.applyArtifactPushResult(rejected(null));
    store.removeArtifact(ID);
    expectRefusal('blocked', '');
    expectRefusal('blocked');
  });

  it('blocks residual conflicts after local deletion and cloud clearing', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact(partial);
    expect(store.collectArtifactPushBatch()).toHaveLength(1);
    store.applyArtifactPushResult(rejected(cloud()));
    store.removeArtifact(ID);
    store.clearCloudArtifacts();
    expect(useArtifactsStore.getState().artifactConflicts[ID]).toBeDefined();
    expectRefusal('blocked');
  });

  it('blocks a residual rename marker after per-id deletion', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact(partial);
    store.renameArtifact(ID, 'Renamed');
    store.removeArtifact(ID);
    expectRefusal('blocked');
  });

  it('blocks history and side metadata left by a result arriving after local deletion', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact(partial);
    expect(store.collectArtifactPushBatch()).toHaveLength(1);
    store.removeArtifact(ID);
    store.applyArtifactPushResult(rejected(cloud()));
    store.resolveArtifactConflict(ID, 'theirs');
    store.clearCloudArtifacts();
    expect(store.getArtifactVersions(ID)).toHaveLength(1);
    expectRefusal('blocked');
  });

  it('guards history-only store fixtures but permits an empty history array', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact(partial);
    const versions = store.getArtifactVersions(ID);
    store.removeArtifact(ID);
    _sharedArtifactStore.setState({ versionsById: { [ID]: versions } });
    expectRefusal('blocked');
    _sharedArtifactStore.setState({ versionsById: { [ID]: [] } });
    expect(store.retainPartialArtifact(partial)).toBe('created');
  });

  it('conservatively blocks side-map residue left by bounded collection eviction', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact(partial);
    for (let index = 0; index < 200; index++) {
      store.upsertArtifact({ ...partial, id: `other-${index}` });
    }
    expect(_sharedArtifactStore.getState().artifacts.some((artifact) => artifact.id === ID)).toBe(
      false,
    );
    expect(store.getArtifactVersions(ID)).toEqual([]);
    expectRefusal('blocked');
  });
});
