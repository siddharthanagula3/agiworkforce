import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillsMenu } from './SkillsMenu';

describe('SkillsMenu', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an AGI-owned empty state without duplicate add actions', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ skills: [] }), { status: 200 })),
    );

    render(<SkillsMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(
      await screen.findByText(
        'No skills installed. Open the skills library to manage available AGI skills.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/claude/i)).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add skill')).not.toBeInTheDocument();
    const libraryLink = screen.getByRole('link', { name: 'Open skills library' });
    expect(libraryLink).toHaveAttribute('href', '/skills');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/skills');
    });
  });
});
