import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryEditor, type MemoryEditorDataAdapter } from '../MemoryEditor';
import type { MemoryFact } from '../../stores/memoryStore';

const localStore = vi.hoisted(() => ({
  facts: [] as MemoryFact[],
  syncStatus: 'unavailable' as const,
  hydrateFromServer: vi.fn(async () => undefined),
  add: vi.fn(),
  update: vi.fn(),
  setPinned: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('../../stores/memoryStore', () => ({
  useMemoryStore: (selector?: (state: typeof localStore) => unknown) => selector ? selector(localStore) : localStore,
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStore.facts = [];
});

function fact(id: string, text: string, pinned = false): MemoryFact {
  return {
    id,
    text,
    pinned,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function adapter(facts: MemoryFact[]): MemoryEditorDataAdapter {
  return {
    scope: 'cloud',
    facts,
    syncStatus: 'synced',
    hydrateFromServer: vi.fn(async () => undefined),
    add: vi.fn(),
    update: vi.fn(),
    setPinned: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

describe('MemoryEditor pinning (unexecuted fixture alignment)', () => {
  it('lists pinned facts first and exposes a pressed pin control on them', () => {
    render(
      <MemoryEditor
        adapter={adapter([fact('a', 'Prefers short answers'), fact('b', 'Works in Lisbon', true)])}
      />,
    );

    const rows = screen.getAllByRole('button', { name: /^Edit memory: / });
    expect(rows.map((row) => row.textContent)).toEqual([
      'Works in Lisbon',
      'Prefers short answers',
    ]);
    expect(screen.getByRole('button', { name: 'Unpin memory' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: 'Pin memory' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('asks the owner to pin and unpin through the adapter', () => {
    const data = adapter([fact('a', 'Prefers short answers'), fact('b', 'Works in Lisbon', true)]);
    render(<MemoryEditor adapter={data} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pin memory' }));
    expect(data.setPinned).toHaveBeenCalledWith('a', true);

    fireEvent.click(screen.getByRole('button', { name: 'Unpin memory' }));
    expect(data.setPinned).toHaveBeenCalledWith('b', false);
    expect(localStore.setPinned).not.toHaveBeenCalled();
  });

  it.each(['local', 'cloud'] as const)(
    'refuses pinning in a supplied %s adapter without that capability',
    (scope) => {
      localStore.facts = [fact('shared-id', 'A different owner')];
      const data = adapter([fact('shared-id', 'Adapter-owned memory')]);
      data.scope = scope;
      delete data.setPinned;
      render(<MemoryEditor adapter={data} title={null} />);

      const pin = screen.getByRole('button', { name: 'Pin memory' });
      expect((pin as HTMLButtonElement).disabled).toBe(true);
      const explanation = screen.getByText('Pinning is not available for this memory source.');
      expect(pin.getAttribute('aria-describedby')).toBe(explanation.id);
      fireEvent.click(pin);

      expect(localStore.setPinned).not.toHaveBeenCalled();
      expect(localStore.hydrateFromServer).not.toHaveBeenCalled();
      expect(data.hydrateFromServer).toHaveBeenCalled();
    },
  );

  it('keeps standalone pinning owned by the default store', () => {
    localStore.facts = [fact('local-id', 'Standalone memory')];
    render(<MemoryEditor />);

    const pin = screen.getByRole('button', { name: 'Pin memory' });
    expect((pin as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pin);

    expect(localStore.setPinned).toHaveBeenCalledWith('local-id', true);
    expect(screen.queryByText('Pinning is not available for this memory source.')).toBeNull();
  });
});
