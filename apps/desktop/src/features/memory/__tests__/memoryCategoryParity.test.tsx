import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MEMORY_CATEGORIES, isMemoryCategory, type MemoryEntry } from '@/stores/memoryStore';

import { MEMORY_TAB_OPTIONS } from '../categories';
import { MemoryCard } from '../MemoryCard';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const agentCoreMemory = path.join(repoRoot, 'crates/agiworkforce-agent-core/src/memory.rs');
const tauriMemoryCommands = path.join(
  repoRoot,
  'apps/desktop/src-tauri/src/sys/commands/memory.rs',
);

const RUNTIME_ONLY_CATEGORIES = ['summary', 'skill'] as const;
const RUNTIME_ONLY_LABELS: Record<(typeof RUNTIME_ONLY_CATEGORIES)[number], string> = {
  summary: 'Summary',
  skill: 'Skill',
};

function memoryWithCategory(category: string): MemoryEntry {
  return {
    id: 1,
    category: category as MemoryEntry['category'],
    topic: `${category} topic`,
    content: 'persisted by the desktop memory runtime',
    importance: 7,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('desktop memory categories mirror the runtime', () => {
  it('matches the agent-core MemoryCategory wire values', () => {
    const source = readFileSync(agentCoreMemory, 'utf8');
    const wireValues = [...source.matchAll(/Self::\w+ => "(\w+)"/g)].map((match) => match[1]!);

    expect(wireValues.length).toBeGreaterThan(0);
    expect([...MEMORY_CATEGORIES].sort()).toEqual([...wireValues].sort());
  });

  it('is accepted by the Tauri IPC category allowlist', () => {
    const source = readFileSync(tauriMemoryCommands, 'utf8');
    const block = /const ALL_MEMORY_CATEGORIES[^=]*=\s*\[([^\]]*)\]/.exec(source);

    expect(block).not.toBeNull();

    const accepted = [...block![1]!.matchAll(/MemoryCategory::(\w+)/g)].map((match) =>
      match[1]!.toLowerCase(),
    );
    expect(accepted.sort()).toEqual([...MEMORY_CATEGORIES].sort());
  });

  it.each(RUNTIME_ONLY_CATEGORIES)('classifies %s as a known category', (category) => {
    expect(isMemoryCategory(category)).toBe(true);
  });

  it('rejects categories the runtime cannot emit', () => {
    expect(isMemoryCategory('pattern')).toBe(false);
    expect(isMemoryCategory(undefined)).toBe(false);
  });

  it.each(RUNTIME_ONLY_CATEGORIES)('offers a %s browsing tab', (category) => {
    expect(MEMORY_TAB_OPTIONS.map((option) => option.value)).toContain(category);
  });

  it.each(RUNTIME_ONLY_CATEGORIES)('renders a %s memory card with its own label', (category) => {
    render(<MemoryCard memory={memoryWithCategory(category)} />);

    expect(screen.getByText(`${category} topic`)).toBeInTheDocument();
    expect(screen.getByText(RUNTIME_ONLY_LABELS[category])).toBeInTheDocument();
  });
});
