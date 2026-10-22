import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryEditor, type MemoryEditorDataAdapter } from '../MemoryEditor';
import type { MemoryFact } from '../../stores/memoryStore';

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

function formatted(iso: string, withYear: boolean): string {
  return new Intl.DateTimeFormat(
    undefined,
    withYear
      ? { month: 'short', day: 'numeric', year: 'numeric' }
      : { month: 'short', day: 'numeric' },
  ).format(new Date(iso));
}

describe('MemoryEditor updated date', () => {
  it('shows when each memory was last updated, not when it was first saved', () => {
    render(
      <MemoryEditor
        adapter={adapter([
          {
            id: 'a',
            text: 'Prefers short answers',
            source: 'user',
            createdAt: '2024-01-05T12:00:00.000Z',
            updatedAt: '2024-03-02T12:00:00.000Z',
          },
        ])}
      />,
    );

    expect(
      screen.getByText(`Added by you · Updated ${formatted('2024-03-02T12:00:00.000Z', true)}`),
    ).toBeTruthy();
    expect(screen.queryByText(/edited/)).toBeNull();
  });

  it('drops the year for a memory updated this year', () => {
    const thisYear = new Date();
    thisYear.setMonth(0, 15);
    thisYear.setHours(12, 0, 0, 0);
    const iso = thisYear.toISOString();
    render(
      <MemoryEditor
        adapter={adapter([{ id: 'a', text: 'Works in Lisbon', createdAt: iso, updatedAt: iso }])}
      />,
    );

    expect(screen.getByText(`Added · Updated ${formatted(iso, false)}`)).toBeTruthy();
  });
});
