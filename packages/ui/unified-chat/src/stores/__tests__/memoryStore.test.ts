import { beforeEach, describe, expect, it } from 'vitest';
import { useMemoryStore } from '../memoryStore';

describe('memoryStore', () => {
  beforeEach(() => {
    useMemoryStore.setState({ facts: [] });
  });

  it('adds local memory facts newest first and ignores blank facts', () => {
    expect(useMemoryStore.getState().add('')).toBeNull();

    const first = useMemoryStore.getState().add('I prefer Python for data work.');
    const second = useMemoryStore.getState().add('Use concise answers.');

    expect(first?.text).toBe('I prefer Python for data work.');
    expect(second?.text).toBe('Use concise answers.');
    expect(useMemoryStore.getState().facts.map((fact) => fact.text)).toEqual([
      'Use concise answers.',
      'I prefer Python for data work.',
    ]);
  });

  it('returns the existing fact for case-insensitive duplicates', () => {
    const first = useMemoryStore.getState().add('I prefer Python.');
    const duplicate = useMemoryStore.getState().add('i prefer python.');

    expect(duplicate?.id).toBe(first?.id);
    expect(useMemoryStore.getState().facts).toHaveLength(1);
  });

  it('updates, removes, and clears local memory facts', () => {
    const fact = useMemoryStore.getState().add('Prefer TypeScript.');
    expect(fact).not.toBeNull();

    useMemoryStore.getState().update(fact!.id, 'Prefer Rust for systems work.');
    expect(useMemoryStore.getState().facts[0]?.text).toBe('Prefer Rust for systems work.');

    useMemoryStore.getState().remove(fact!.id);
    expect(useMemoryStore.getState().facts).toHaveLength(0);

    useMemoryStore.getState().add('Remember local mode.');
    useMemoryStore.getState().clear();
    expect(useMemoryStore.getState().facts).toHaveLength(0);
  });
});
