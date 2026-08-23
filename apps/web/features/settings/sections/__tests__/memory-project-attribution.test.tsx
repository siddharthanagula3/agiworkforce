import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MemoryEditor } from '@agiworkforce/unified-chat';
import { useMemoryStore } from '@agiworkforce/unified-chat';

function fact(over: Record<string, unknown> = {}) {
  return {
    id: `f-${Math.random().toString(36).slice(2)}`,
    text: 'Ships on Fridays.',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
});

// 0135 confines some memories to a project. In a flat list a confined fact
// reads as applying everywhere, which is the opposite of what it does.
describe('project-scoped memories are distinguishable in the memory manager', () => {
  it('labels a memory confined to a project with that project', () => {
    useMemoryStore.setState({
      facts: [fact({ text: 'Client ships Fridays.', projectId: 'p1', projectName: 'Client A' })],
      syncStatus: 'synced',
    });

    render(<MemoryEditor title={null} description="" />);

    expect(screen.getByText('Only in Client A')).toBeVisible();
  });

  it('leaves a global memory unlabelled', () => {
    useMemoryStore.setState({
      facts: [fact({ text: 'I prefer metric units.' })],
      syncStatus: 'synced',
    });

    render(<MemoryEditor title={null} description="" />);

    expect(screen.queryByText(/^Only in /)).toBeNull();
  });

  it('still says the memory is confined when the project name is unavailable', () => {
    useMemoryStore.setState({
      facts: [fact({ projectId: 'p1', projectName: null })],
      syncStatus: 'synced',
    });

    render(<MemoryEditor title={null} description="" />);

    // Better a vague label than none: the user must know it is not global.
    expect(screen.getByText('Only in a project')).toBeVisible();
  });
});
