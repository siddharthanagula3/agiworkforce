import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MEMORY_CATEGORIES, type MemoryEntry } from '@/stores/memoryStore';

import { MemoryCard } from '../MemoryCard';
import {
  MEMORY_TAB_OPTIONS,
  countMemoriesByCategory,
  MEMORY_TAB_EMPTY_LABELS,
} from '../categories';

const RUNTIME_CATEGORIES = ['preference', 'fact', 'decision', 'context', 'summary', 'skill'];

function makeMemory(category: string, id: number): MemoryEntry {
  return {
    id,
    category: category as MemoryEntry['category'],
    topic: `${category} topic`,
    content: `${category} content`,
    importance: 6,
    created_at: '2026-08-01T10:00:00.000Z',
    updated_at: '2026-08-01T10:00:00.000Z',
  };
}

describe('desktop memory category taxonomy', () => {
  it('matches the runtime taxonomy the backend can persist', () => {
    expect([...MEMORY_CATEGORIES]).toEqual(RUNTIME_CATEGORIES);
  });

  it('renders a badge for every category the backend can return', () => {
    for (const [index, category] of RUNTIME_CATEGORIES.entries()) {
      const { unmount } = render(<MemoryCard memory={makeMemory(category, index + 1)} />);
      const expected = category.charAt(0).toUpperCase() + category.slice(1);
      expect(screen.getByText(expected)).toBeTruthy();
      unmount();
    }
  });

  it('offers a filter tab and empty-state label for every category', () => {
    const tabValues = MEMORY_TAB_OPTIONS.map((option) => option.value);
    expect(tabValues).toEqual(['all', ...RUNTIME_CATEGORIES]);
    for (const category of RUNTIME_CATEGORIES) {
      expect(MEMORY_TAB_EMPTY_LABELS[category as MemoryEntry['category']]).toBeTruthy();
    }
  });

  it('counts memories in every category', () => {
    const memories = RUNTIME_CATEGORIES.map((category, index) => makeMemory(category, index + 1));
    const counts = countMemoriesByCategory(memories);
    expect(counts.all).toBe(RUNTIME_CATEGORIES.length);
    expect(counts.summary).toBe(1);
    expect(counts.skill).toBe(1);
  });
});
