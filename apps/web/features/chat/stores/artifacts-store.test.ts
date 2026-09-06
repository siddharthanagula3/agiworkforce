import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import { ARTIFACT_PANEL_OVERLAY_QUERY, useArtifactsStore } from './artifacts-store';

function cloudDelta(overrides: Partial<ArtifactWireDelta> = {}): ArtifactWireDelta {
  return {
    id: 'artifact-cloud',
    conversation_id: 'conv-cloud',
    message_id: 'msg-cloud',
    title: 'Cloud artifact',
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

describe('chat artifacts sidecar store', () => {
  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
  });

  it('upserts artifacts with stable ids for sidecar selection', () => {
    const store = useArtifactsStore.getState();

    store.upsertArtifact({
      id: 'artifact-1',
      type: 'html',
      title: 'Preview',
      language: 'html',
      content: '<main>Hello</main>',
      messageId: 'msg-1',
    });
    store.upsertArtifact({
      id: 'artifact-1',
      type: 'html',
      title: 'Preview v2',
      language: 'html',
      content: '<main>Hello again</main>',
      messageId: 'msg-1',
    });

    const state = useArtifactsStore.getState();
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0]?.id).toBe('artifact-1');
    expect(state.artifacts[0]?.title).toBe('Preview v2');
    expect(state.selectedArtifactId).toBe('artifact-1');
  });

  it('exposes content-keyed revision history to the artifact panel', () => {
    const store = useArtifactsStore.getState();
    const base = {
      id: 'artifact-versioned',
      type: 'html' as const,
      title: 'Preview',
      language: 'html',
      messageId: 'msg-versioned',
      conversationId: 'conv-versioned',
    };

    store.upsertArtifact({ ...base, content: '<main>Version one</main>' });
    store.upsertArtifact({ ...base, content: '<main>Version two</main>' });

    expect(useArtifactsStore.getState().getArtifactVersions(base.id)).toEqual([
      expect.objectContaining({ version: 1, content: '<main>Version one</main>' }),
      expect.objectContaining({ version: 2, content: '<main>Version two</main>' }),
    ]);
  });

  describe('restoreArtifactVersion', () => {
    const base = {
      id: 'artifact-restore',
      type: 'html' as const,
      title: 'Preview',
      language: 'html',
      messageId: 'msg-restore',
      conversationId: 'conv-restore',
    };

    function seedThreeVersions() {
      const store = useArtifactsStore.getState();
      store.upsertArtifact({ ...base, content: '<main>one</main>' });
      store.upsertArtifact({ ...base, content: '<main>two</main>' });
      store.upsertArtifact({ ...base, content: '<main>three</main>' });
    }

    it('appends the restored content as the new latest version', () => {
      seedThreeVersions();

      expect(useArtifactsStore.getState().restoreArtifactVersion(base.id, 0)).toBe(true);

      const state = useArtifactsStore.getState();
      expect(state.artifacts.find((a) => a.id === base.id)?.content).toBe('<main>one</main>');
      expect(state.getArtifactVersions(base.id).map((v) => v.content)).toEqual([
        '<main>one</main>',
        '<main>two</main>',
        '<main>three</main>',
        '<main>one</main>',
      ]);
    });

    it('is a no-op for an unknown index or content that is already current', () => {
      seedThreeVersions();
      const before = useArtifactsStore.getState().getArtifactVersions(base.id).length;

      expect(useArtifactsStore.getState().restoreArtifactVersion(base.id, 99)).toBe(false);
      expect(useArtifactsStore.getState().restoreArtifactVersion(base.id, 2)).toBe(false);
      expect(useArtifactsStore.getState().restoreArtifactVersion('missing-id', 0)).toBe(false);

      expect(useArtifactsStore.getState().getArtifactVersions(base.id).length).toBe(before);
    });
  });

  it('scopes artifacts to their conversationId via addArtifactForMessage', () => {
    const store = useArtifactsStore.getState();

    store.addArtifactForMessage(
      'msg-conv-a',
      {
        id: 'art-conv-a',
        type: 'code',
        title: 'Snippet A',
        language: 'ts',
        content: 'const x = 1;',
      },
      'conv-a',
    );

    store.addArtifactForMessage(
      'msg-conv-b',
      {
        id: 'art-conv-b',
        type: 'html',
        title: 'Snippet B',
        language: 'html',
        content: '<p>hello</p>',
      },
      'conv-b',
    );

    const state = useArtifactsStore.getState();
    expect(state.artifacts).toHaveLength(2);
    expect(state.getConversationArtifacts('conv-a')).toHaveLength(1);
    expect(state.getConversationArtifacts('conv-a')[0]?.id).toBe('art-conv-a');
    expect(state.getConversationArtifacts('conv-b')).toHaveLength(1);
    expect(state.getConversationArtifacts('conv-b')[0]?.id).toBe('art-conv-b');
    expect(state.getConversationArtifacts('conv-c')).toHaveLength(0);
  });

  it('getConversationArtifacts excludes orphaned artifacts without a conversationId', () => {
    const store = useArtifactsStore.getState();
    store.upsertArtifact({
      id: 'orphan-1',
      type: 'code',
      title: 'Orphan',
      language: 'js',
      content: 'console.log("hi");',
      messageId: 'msg-orphan',
      // no conversationId
    });

    const state = useArtifactsStore.getState();
    expect(state.artifacts).toHaveLength(1);
    expect(state.getConversationArtifacts('any-conv')).toHaveLength(0);
  });

  it('backfills a missing conversationId on a later content-equal upsert', () => {
    const store = useArtifactsStore.getState();
    const base = {
      id: 'art-backfill',
      type: 'html' as const,
      title: 'Live Color Picker',
      language: 'html',
      content: '<input type="range">',
      messageId: 'msg-bf',
    };

    store.upsertArtifact({ ...base });
    expect(useArtifactsStore.getState().getConversationArtifacts('conv-loaded')).toHaveLength(0);

    store.upsertArtifact({ ...base, conversationId: 'conv-loaded' });

    const state = useArtifactsStore.getState();
    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts[0]?.conversationId).toBe('conv-loaded');
    expect(state.getConversationArtifacts('conv-loaded')).toHaveLength(1);
  });

  it('never clobbers a known conversationId with undefined on a later upsert', () => {
    const store = useArtifactsStore.getState();
    const base = {
      id: 'art-keep',
      type: 'html' as const,
      title: 'Keeper',
      language: 'html',
      content: '<p>x</p>',
      messageId: 'msg-keep',
    };

    store.upsertArtifact({ ...base, conversationId: 'conv-keep' });
    store.upsertArtifact({ ...base });

    const state = useArtifactsStore.getState();
    expect(state.artifacts[0]?.conversationId).toBe('conv-keep');
    expect(state.getConversationArtifacts('conv-keep')).toHaveLength(1);
  });

  it('overlays a pulled cloud edit on the matching locally derived artifact', () => {
    const store = useArtifactsStore.getState();
    store.addArtifactForMessage(
      'msg-cloud',
      {
        id: 'artifact-cloud',
        type: 'html',
        title: 'Derived artifact',
        language: 'html',
        content: '<main>Derived</main>',
      },
      'conv-cloud',
    );

    store.applyCloudArtifactDeltas([cloudDelta()]);

    expect(useArtifactsStore.getState().getConversationArtifacts('conv-cloud')).toEqual([
      expect.objectContaining({
        id: 'artifact-cloud',
        title: 'Cloud artifact',
        content: '<main>Cloud</main>',
      }),
    ]);
  });

  it('keeps a pulled tombstone so a derived artifact cannot reappear', () => {
    const store = useArtifactsStore.getState();
    store.addArtifactForMessage(
      'msg-cloud',
      {
        id: 'artifact-cloud',
        type: 'html',
        title: 'Derived artifact',
        language: 'html',
        content: '<main>Derived</main>',
      },
      'conv-cloud',
    );

    store.applyCloudArtifactDeltas([
      cloudDelta({ deleted_at: '2026-07-17T00:02:00.000Z', server_version: '13' }),
    ]);

    expect(useArtifactsStore.getState().getConversationArtifacts('conv-cloud')).toEqual([]);
  });
});

describe('local artifact push batching', () => {
  const CONVERSATION_ID = '00000000-0000-4000-8000-00000000c001';
  const MESSAGE_ID = '00000000-0000-4000-8000-00000000d001';
  const ARTIFACT_ID = '00000000-0000-4000-8000-00000000a001';

  function pushableDelta(overrides: Partial<ArtifactWireDelta> = {}): ArtifactWireDelta {
    return cloudDelta({
      id: ARTIFACT_ID,
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      ...overrides,
    });
  }

  function seedLocalArtifact(content = '<main>Local</main>'): void {
    useArtifactsStore.getState().addArtifact({
      id: ARTIFACT_ID,
      type: 'html',
      title: 'Local artifact',
      language: 'html',
      content,
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
    });
  }

  beforeEach(() => {
    useArtifactsStore.getState().clearArtifacts();
  });

  it('queues a locally created artifact for the cloud as an insert', () => {
    seedLocalArtifact();

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([
      expect.objectContaining({
        id: ARTIFACT_ID,
        conversationId: CONVERSATION_ID,
        messageId: MESSAGE_ID,
        artifactType: 'html',
        content: '<main>Local</main>',
        baseVersion: '0',
      }),
    ]);
  });

  it('skips artifacts the cloud already stores byte for byte', () => {
    seedLocalArtifact('<main>Cloud</main>');
    useArtifactsStore
      .getState()
      .applyCloudArtifactDeltas([
        pushableDelta({ title: 'Local artifact', content: '<main>Cloud</main>' }),
      ]);

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([]);
  });

  it('pushes a local edit over an older cloud copy using its server version', () => {
    useArtifactsStore.getState().applyCloudArtifactDeltas([pushableDelta()]);
    useArtifactsStore.getState().upsertArtifact({
      id: ARTIFACT_ID,
      type: 'html',
      title: 'Cloud artifact',
      language: 'html',
      content: '<main>Edited here</main>',
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      createdAt: new Date('2026-07-18T00:00:00.000Z'),
    });

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([
      expect.objectContaining({ content: '<main>Edited here</main>', baseVersion: '12' }),
    ]);
  });

  it('leaves a newer cloud edit alone instead of pushing the stale local copy back', () => {
    useArtifactsStore.getState().upsertArtifact({
      id: ARTIFACT_ID,
      type: 'html',
      title: 'Local artifact',
      language: 'html',
      content: '<main>Local</main>',
      messageId: MESSAGE_ID,
      conversationId: CONVERSATION_ID,
      createdAt: new Date('2026-07-16T00:00:00.000Z'),
    });
    useArtifactsStore.getState().applyCloudArtifactDeltas([pushableDelta()]);

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([]);
  });

  it('stops re-pushing once the server reports the batch applied', () => {
    seedLocalArtifact();
    const batch = useArtifactsStore.getState().collectArtifactPushBatch();
    expect(batch).toHaveLength(1);

    useArtifactsStore.getState().applyArtifactPushResult({
      protocolVersion: 2,
      applied: {
        conversations: [],
        messages: [],
        artifacts: [{ id: ARTIFACT_ID, server_version: '44' }],
      },
      conflicts: { conversations: [], messages: [], artifacts: [] },
      cursor: '44',
    });

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([]);
  });

  it('retries a rejected batch only after the artifact changes again', () => {
    seedLocalArtifact();
    useArtifactsStore.getState().collectArtifactPushBatch();

    useArtifactsStore.getState().applyArtifactPushResult({
      protocolVersion: 2,
      applied: { conversations: [], messages: [], artifacts: [] },
      conflicts: {
        conversations: [],
        messages: [],
        artifacts: [{ id: ARTIFACT_ID, current: null }],
      },
      cursor: '0',
    });

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([]);

    seedLocalArtifact('<main>Local again</main>');
    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([
      expect.objectContaining({ content: '<main>Local again</main>' }),
    ]);
  });

  it('never sends an artifact the sync contract would reject', () => {
    useArtifactsStore.getState().addArtifact({
      id: 'research-report-local',
      type: 'document',
      title: 'Report',
      language: 'markdown',
      content: '# Report',
      messageId: '',
      conversationId: CONVERSATION_ID,
    });

    expect(useArtifactsStore.getState().collectArtifactPushBatch()).toEqual([]);
  });
});

describe('artifact panel auto-open', () => {
  const originalMatchMedia = window.matchMedia;

  function stubViewport(overlay: boolean): void {
    window.matchMedia = ((query: string) =>
      ({
        matches: query === ARTIFACT_PANEL_OVERLAY_QUERY ? overlay : !overlay,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }

  beforeEach(() => {
    useArtifactsStore.getState().setPanelOpen(false);
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('opens the panel on a viewport wide enough to show it beside the transcript', () => {
    stubViewport(false);
    useArtifactsStore.getState().autoOpenPanel();
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
  });

  it('leaves the panel closed where it would cover the whole screen', () => {
    stubViewport(true);
    useArtifactsStore.getState().autoOpenPanel();
    expect(useArtifactsStore.getState().panelOpen).toBe(false);
  });

  it('still opens the panel when the reader asks for it on a phone', () => {
    stubViewport(true);
    useArtifactsStore.getState().setPanelOpen(true);
    expect(useArtifactsStore.getState().panelOpen).toBe(true);
  });
});
