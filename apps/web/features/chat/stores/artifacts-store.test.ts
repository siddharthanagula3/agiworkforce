import { beforeEach, describe, expect, it } from 'vitest';
import { useArtifactsStore } from './artifacts-store';

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

  it('extracts markdown code blocks into typed sidecar artifacts', () => {
    useArtifactsStore
      .getState()
      .extractArtifactsFromContent('```html\n<section>AGI</section>\n```', 'msg-2');

    const artifact = useArtifactsStore.getState().artifacts[0];
    expect(artifact?.messageId).toBe('msg-2');
    expect(artifact?.type).toBe('html');
    expect(artifact?.language).toBe('html');
    expect(artifact?.content).toContain('<section>AGI</section>');
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

  it('extracts code blocks with conversationId so they are scoped correctly', () => {
    useArtifactsStore
      .getState()
      .extractArtifactsFromContent('```ts\nconst y = 42;\n```', 'msg-3', 'conv-extract');

    const state = useArtifactsStore.getState();
    const convoArtifacts = state.getConversationArtifacts('conv-extract');
    expect(convoArtifacts).toHaveLength(1);
    expect(convoArtifacts[0]?.conversationId).toBe('conv-extract');
    // Does not appear under a different conversation id.
    expect(state.getConversationArtifacts('conv-other')).toHaveLength(0);
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
});
