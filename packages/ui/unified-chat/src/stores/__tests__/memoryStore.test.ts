import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemoryStore } from '../memoryStore';

describe('memoryStore', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined);
    useMemoryStore.setState({ facts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds local memory facts newest first and ignores blank facts', async () => {
    expect(await useMemoryStore.getState().add('')).toBeNull();

    const first = await useMemoryStore.getState().add('I prefer Python for data work.');
    const second = await useMemoryStore.getState().add('Use concise answers.');

    expect(first?.text).toBe('I prefer Python for data work.');
    expect(second?.text).toBe('Use concise answers.');
    expect(useMemoryStore.getState().facts.map((fact) => fact.text)).toEqual([
      'Use concise answers.',
      'I prefer Python for data work.',
    ]);
  });

  it('returns the existing fact for case-insensitive duplicates', async () => {
    const first = await useMemoryStore.getState().add('I prefer Python.');
    const duplicate = await useMemoryStore.getState().add('i prefer python.');

    expect(duplicate?.id).toBe(first?.id);
    expect(useMemoryStore.getState().facts).toHaveLength(1);
  });

  it('updates, removes, and clears local memory facts', async () => {
    const fact = await useMemoryStore.getState().add('Prefer TypeScript.');
    expect(fact).not.toBeNull();

    await useMemoryStore.getState().update(fact!.id, 'Prefer Rust for systems work.');
    expect(useMemoryStore.getState().facts[0]?.text).toBe('Prefer Rust for systems work.');

    await useMemoryStore.getState().remove(fact!.id);
    expect(useMemoryStore.getState().facts).toHaveLength(0);

    await useMemoryStore.getState().add('Remember local mode.');
    await useMemoryStore.getState().clear();
    expect(useMemoryStore.getState().facts).toHaveLength(0);
  });
});

describe('memoryStore pinning', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', undefined);
    useMemoryStore.setState({ facts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pins and unpins a local fact', async () => {
    const created = await useMemoryStore.getState().add('Prefers metric units');
    expect(created).not.toBeNull();
    const id = created!.id;

    await useMemoryStore.getState().setPinned(id, true);
    expect(useMemoryStore.getState().facts.find((f) => f.id === id)?.pinned).toBe(true);

    await useMemoryStore.getState().setPinned(id, false);
    expect(useMemoryStore.getState().facts.find((f) => f.id === id)?.pinned).toBe(false);
  });

  it('refuses to pin a fact the server has not acknowledged yet', async () => {
    useMemoryStore.setState({
      facts: [
        {
          id: 'pending-1',
          text: 'Still saving',
          pending: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    await useMemoryStore.getState().setPinned('pending-1', true);
    expect(useMemoryStore.getState().facts[0]?.pinned).toBeUndefined();
  });
});
