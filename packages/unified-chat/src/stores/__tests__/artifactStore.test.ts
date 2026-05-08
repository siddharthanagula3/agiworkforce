/**
 * Phase A Slice 4 — artifactStore unit tests
 *
 * Covers: push / update / remove / conversation isolation / selectors
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useArtifactStore,
  selectArtifacts,
  selectActiveArtifact,
  selectArtifactById,
} from '../artifactStore';
import type { Artifact } from '../../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArtifact(id: string, title = 'Test'): Artifact {
  return {
    id,
    type: 'code',
    title,
    content: `// content for ${id}`,
    language: 'typescript',
  };
}

function store() {
  return useArtifactStore.getState();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('artifactStore', () => {
  beforeEach(() => {
    useArtifactStore.getState().reset();
  });

  // ---- setArtifacts -------------------------------------------------------

  it('setArtifacts populates a conversation', () => {
    const a1 = makeArtifact('a1');
    const a2 = makeArtifact('a2');
    store().setArtifacts('conv-1', [a1, a2]);

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.id).toBe('a1');
    expect(artifacts[1]!.id).toBe('a2');
  });

  it('setArtifacts replaces existing list for the same conversation', () => {
    const a1 = makeArtifact('a1');
    store().setArtifacts('conv-1', [a1]);

    const a2 = makeArtifact('a2');
    store().setArtifacts('conv-1', [a2]);

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.id).toBe('a2');
  });

  // ---- addArtifact --------------------------------------------------------

  it('addArtifact appends to an empty conversation', () => {
    const a1 = makeArtifact('a1');
    store().addArtifact('conv-1', a1);

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.id).toBe('a1');
  });

  it('addArtifact replaces in-place when id already exists', () => {
    const a1 = makeArtifact('a1', 'Old Title');
    store().addArtifact('conv-1', a1);

    const a1Updated = makeArtifact('a1', 'New Title');
    store().addArtifact('conv-1', a1Updated);

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.title).toBe('New Title');
  });

  // ---- updateArtifact -----------------------------------------------------

  it('updateArtifact patches the matching artifact', () => {
    const a1 = makeArtifact('a1');
    store().setArtifacts('conv-1', [a1]);

    store().updateArtifact('conv-1', 'a1', { title: 'Patched' });

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts[0]!.title).toBe('Patched');
  });

  it('updateArtifact leaves other artifacts untouched', () => {
    const a1 = makeArtifact('a1');
    const a2 = makeArtifact('a2');
    store().setArtifacts('conv-1', [a1, a2]);

    store().updateArtifact('conv-1', 'a1', { title: 'Updated A1' });

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts[1]!.title).toBe('Test');
  });

  // ---- removeArtifact -----------------------------------------------------

  it('removeArtifact deletes the matching artifact', () => {
    const a1 = makeArtifact('a1');
    const a2 = makeArtifact('a2');
    store().setArtifacts('conv-1', [a1, a2]);

    store().removeArtifact('conv-1', 'a1');

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.id).toBe('a2');
  });

  it('removeArtifact is a no-op for an unknown id', () => {
    const a1 = makeArtifact('a1');
    store().setArtifacts('conv-1', [a1]);
    store().removeArtifact('conv-1', 'does-not-exist');

    const artifacts = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    expect(artifacts).toHaveLength(1);
  });

  // ---- clearConversation --------------------------------------------------

  it('clearConversation removes only the specified conversation', () => {
    store().setArtifacts('conv-1', [makeArtifact('a1')]);
    store().setArtifacts('conv-2', [makeArtifact('a2')]);

    store().clearConversation('conv-1');

    const conv1 = selectArtifacts(useArtifactStore.getState(), 'conv-1');
    const conv2 = selectArtifacts(useArtifactStore.getState(), 'conv-2');
    expect(conv1).toHaveLength(0);
    expect(conv2).toHaveLength(1);
  });

  // ---- conversation isolation ---------------------------------------------

  it('operations on conv-1 do not bleed into conv-2', () => {
    store().setArtifacts('conv-1', [makeArtifact('a1')]);
    store().setArtifacts('conv-2', [makeArtifact('b1'), makeArtifact('b2')]);

    store().removeArtifact('conv-1', 'a1');

    expect(selectArtifacts(useArtifactStore.getState(), 'conv-1')).toHaveLength(0);
    expect(selectArtifacts(useArtifactStore.getState(), 'conv-2')).toHaveLength(2);
  });

  // ---- selectors ----------------------------------------------------------

  it('selectArtifacts returns [] for unknown conversationId', () => {
    const result = selectArtifacts(useArtifactStore.getState(), 'does-not-exist');
    expect(result).toEqual([]);
  });

  it('selectActiveArtifact returns null initially', () => {
    expect(selectActiveArtifact(useArtifactStore.getState())).toBeNull();
  });

  it('selectActiveArtifact returns artifact after openArtifact', () => {
    const a = makeArtifact('active');
    store().openArtifact(a);
    expect(selectActiveArtifact(useArtifactStore.getState())?.id).toBe('active');
  });

  it('selectArtifactById finds the correct artifact', () => {
    const a1 = makeArtifact('a1');
    const a2 = makeArtifact('a2');
    store().setArtifacts('conv-1', [a1, a2]);

    const found = selectArtifactById(useArtifactStore.getState(), 'conv-1', 'a2');
    expect(found?.id).toBe('a2');
  });

  it('selectArtifactById returns undefined for missing id', () => {
    store().setArtifacts('conv-1', [makeArtifact('a1')]);
    const found = selectArtifactById(useArtifactStore.getState(), 'conv-1', 'missing');
    expect(found).toBeUndefined();
  });

  // ---- reset ---------------------------------------------------------------

  it('reset clears artifactsByConversation and activeArtifact', () => {
    store().setArtifacts('conv-1', [makeArtifact('a1')]);
    store().openArtifact(makeArtifact('active'));
    store().reset();

    const state = useArtifactStore.getState();
    expect(state.activeArtifact).toBeNull();
    expect(Object.keys(state.artifactsByConversation)).toHaveLength(0);
  });
});
