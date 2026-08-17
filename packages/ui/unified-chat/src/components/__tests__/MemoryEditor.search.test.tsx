import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryEditor, type MemoryEditorDataAdapter } from '../MemoryEditor';
import type { MemoryFact } from '../../stores/memoryStore';

function fact(id: string, text: string): MemoryFact {
  return {
    id,
    text,
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
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

const FACTS = [
  fact('a', 'I prefer Python for data work'),
  fact('b', 'My dog is called Biscuit'),
  fact('c', 'I live in Bengaluru'),
];

describe('MemoryEditor search', () => {
  it('narrows the list to facts matching the query, case-insensitively', () => {
    render(<MemoryEditor adapter={adapter(FACTS)} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    fireEvent.change(screen.getByLabelText('Search memory'), { target: { value: 'BISCUIT' } });

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('My dog is called Biscuit');
  });

  it('says nothing matched instead of showing the empty-memory copy', () => {
    render(<MemoryEditor adapter={adapter(FACTS)} />);

    fireEvent.change(screen.getByLabelText('Search memory'), { target: { value: 'kayaking' } });

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText(/No memory matches/i)).toBeDefined();
    expect(screen.queryByText(/No cloud memory facts yet/i)).toBeNull();
  });

  it('restores the full list when the query is cleared', () => {
    render(<MemoryEditor adapter={adapter(FACTS)} />);

    const input = screen.getByLabelText('Search memory');
    fireEvent.change(input, { target: { value: 'python' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(1);

    fireEvent.change(input, { target: { value: '  ' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('offers no search box when there is nothing to search', () => {
    render(<MemoryEditor adapter={adapter([])} />);
    expect(screen.queryByLabelText('Search memory')).toBeNull();
  });
});
