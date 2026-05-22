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
});
