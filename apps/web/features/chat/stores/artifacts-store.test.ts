import { beforeEach, describe, expect, it } from 'vitest';
import type { ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import { useArtifactsStore } from './artifacts-store';

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

// AUDIT-FIX ART-21: the two `extractArtifactsFromContent` cases that used to
// live here were deleted with the API they covered. That action wrapped a
// forked `parseCodeBlocks` inside this store, which the module's own header
// forbids ("do NOT reimplement derivation here"); it had no non-test callers,
// so these tests were the only thing keeping the fork alive. Artifact
// derivation is covered where it actually happens, in
// packages/platform/artifacts/src/__tests__/artifact-derivation.test.ts.
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
    // A new/empty chat with no matching id sees nothing.
    expect(state.getConversationArtifacts('conv-c')).toHaveLength(0);
  });

  it('getConversationArtifacts excludes orphaned artifacts without a conversationId', () => {
    const store = useArtifactsStore.getState();
    // Add an artifact without conversationId (legacy / orphaned).
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
    // No conversationId -> hidden from all conversation-scoped views.
    expect(state.getConversationArtifacts('any-conv')).toHaveLength(0);
  });

  // Regression: an artifact first stored before the active conversation loaded
  // (conversationId=undefined) must adopt the conversationId on a later upsert
  // with identical content. artifactsEqual ignores conversationId, so without
  // an explicit backfill the orphaned artifact stayed hidden from its own
  // chat's Artifacts panel ("No artifacts yet" despite an inline card).
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

    // First upsert: active conversation not yet loaded -> no conversationId.
    store.upsertArtifact({ ...base });
    expect(useArtifactsStore.getState().getConversationArtifacts('conv-loaded')).toHaveLength(0);

    // Re-stamp once the conversation id is known (same content).
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
    // A later render fires before load completes -> conversationId undefined.
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
