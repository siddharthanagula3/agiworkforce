import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useMemoryStore, type MemoryEntry } from '@/stores/memoryStore';

import { MemoryCard } from '../MemoryCard';

const MEMORY: MemoryEntry = {
  id: 7,
  category: 'fact',
  topic: 'Home airport',
  content: 'The user flies out of SFO.',
  importance: 6,
  source: 'agent_observation',
  created_at: '2026-08-01T10:00:00.000Z',
  updated_at: '2026-08-01T10:00:00.000Z',
};

describe('memory correction', () => {
  beforeEach(() => {
    useMemoryStore.setState({ memories: [MEMORY] });
  });

  it('shows where the memory came from', () => {
    render(<MemoryCard memory={MEMORY} />);
    expect(screen.getByText(/agent_observation/)).toBeTruthy();
  });

  it('lets the user correct a wrong memory and persists the new content', async () => {
    const remember = vi.fn().mockResolvedValue(1);
    useMemoryStore.setState({ remember });

    render(<MemoryCard memory={MEMORY} />);

    fireEvent.click(screen.getByRole('button', { name: /correct memory/i }));

    const editor = screen.getByLabelText('Memory content');
    fireEvent.change(editor, { target: { value: 'The user flies out of OAK.' } });
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }));

    await waitFor(() => {
      expect(remember).toHaveBeenCalledWith(
        'fact',
        'Home airport',
        'The user flies out of OAK.',
        6,
      );
    });
  });

  it('does not write when the correction is empty or unchanged', async () => {
    const remember = vi.fn().mockResolvedValue(1);
    useMemoryStore.setState({ remember });

    render(<MemoryCard memory={MEMORY} />);
    fireEvent.click(screen.getByRole('button', { name: /correct memory/i }));
    fireEvent.change(screen.getByLabelText('Memory content'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save correction/i }));

    await waitFor(() => {
      expect(screen.queryByLabelText('Memory content')).toBeNull();
    });
    expect(remember).not.toHaveBeenCalled();
  });
});
