import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryEditor, type MemoryEditorDataAdapter } from '../MemoryEditor';
import type { MemoryFact } from '../../stores/memoryStore';

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

describe('MemoryEditor pinning', () => {
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
  });
});
