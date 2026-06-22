import { describe, it, expect } from 'vitest';
import { createArtifactStore } from '../artifactStore';
import type { SharedArtifact } from '@agiworkforce/types';

function artifact(over: Partial<SharedArtifact> = {}): SharedArtifact {
  return {
    id: 'a1',
    type: 'code',
    title: 'Snippet',
    content: 'print(1)',
    language: 'python',
    version: 1,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    conversationId: 'c1',
    messageId: 'm1',
    ...over,
  };
}

describe('createArtifactStore', () => {
  it('adds a new artifact with a single version', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifact(artifact());
    expect(s.getState().artifacts).toHaveLength(1);
    expect(s.getState().getArtifactVersions('a1')).toHaveLength(1);
    expect(s.getState().getArtifact('a1')?.content).toBe('print(1)');
  });

  it('is idempotent for identical content (no version bump despite new timestamps)', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifact(artifact({ updatedAt: '2026-06-21T00:00:00.000Z' }));
    s.getState().upsertArtifact(artifact({ updatedAt: '2026-06-21T09:99:99.000Z' })); // re-derived later
    expect(s.getState().artifacts).toHaveLength(1);
    expect(s.getState().getArtifactVersions('a1')).toHaveLength(1);
    expect(s.getState().getArtifact('a1')?.version).toBe(1);
  });

  it('version-bumps the same id when content changes (an edit)', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifact(artifact());
    s.getState().upsertArtifact(artifact({ content: 'print(2)' }));
    const versions = s.getState().getArtifactVersions('a1');
    expect(versions).toHaveLength(2);
    expect(s.getState().getArtifact('a1')?.version).toBe(2);
    expect(s.getState().getArtifact('a1')?.content).toBe('print(2)');
    // createdAt preserved from the original
    expect(s.getState().getArtifact('a1')?.createdAt).toBe('2026-06-21T00:00:00.000Z');
  });

  it('filters by conversationId', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifacts([
      artifact({ id: 'a1', conversationId: 'c1' }),
      artifact({ id: 'a2', conversationId: 'c2' }),
      artifact({ id: 'a3', conversationId: 'c1' }),
    ]);
    expect(
      s
        .getState()
        .getConversationArtifacts('c1')
        .map((a) => a.id),
    ).toEqual(['a1', 'a3']);
    expect(
      s
        .getState()
        .getConversationArtifacts('c2')
        .map((a) => a.id),
    ).toEqual(['a2']);
  });

  it('openArtifact selects + opens the panel', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifact(artifact());
    s.getState().openArtifact('a1');
    expect(s.getState().selectedArtifactId).toBe('a1');
    expect(s.getState().panelOpen).toBe(true);
    s.getState().togglePanel();
    expect(s.getState().panelOpen).toBe(false);
  });

  it('enforces maxArtifacts by dropping the oldest new artifact', () => {
    const s = createArtifactStore({ maxArtifacts: 2 });
    s.getState().upsertArtifact(artifact({ id: 'a1' }));
    s.getState().upsertArtifact(artifact({ id: 'a2' }));
    s.getState().upsertArtifact(artifact({ id: 'a3' }));
    expect(s.getState().artifacts.map((a) => a.id)).toEqual(['a2', 'a3']);
    expect(s.getState().getArtifactVersions('a1')).toHaveLength(0);
  });

  it('removeArtifact clears selection if the removed artifact was selected', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifact(artifact());
    s.getState().selectArtifact('a1');
    s.getState().removeArtifact('a1');
    expect(s.getState().artifacts).toHaveLength(0);
    expect(s.getState().selectedArtifactId).toBeNull();
  });

  it('clearConversation removes only that conversation, clearAll empties everything', () => {
    const s = createArtifactStore();
    s.getState().upsertArtifacts([
      artifact({ id: 'a1', conversationId: 'c1' }),
      artifact({ id: 'a2', conversationId: 'c2' }),
    ]);
    s.getState().clearConversation('c1');
    expect(s.getState().artifacts.map((a) => a.id)).toEqual(['a2']);
    s.getState().clearAll();
    expect(s.getState().artifacts).toHaveLength(0);
    expect(s.getState().versionsById).toEqual({});
  });
});
