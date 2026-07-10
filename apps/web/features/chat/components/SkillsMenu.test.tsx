import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('renders a searchable list and filters skills as the user types', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            skills: [
              { name: 'humanizer', description: 'Rewrite text to sound human', source: 'user' },
              { name: 'brand-guidelines', description: 'Apply brand voice', source: 'builtin' },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    render(<SkillsMenu query="" onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText('humanizer')).toBeInTheDocument();
    expect(screen.getByText('brand-guidelines')).toBeInTheDocument();

    const searchBox = screen.getByRole('textbox', { name: /search skills/i });
    fireEvent.change(searchBox, { target: { value: 'human' } });

    expect(screen.getByText('humanizer')).toBeInTheDocument();
    expect(screen.queryByText('brand-guidelines')).toBeNull();

    // A non-matching query shows the "no match" copy, not the "no skills installed" copy.
    fireEvent.change(searchBox, { target: { value: 'zzzz' } });
    expect(screen.getByText('No skills match your search.')).toBeInTheDocument();
  });
});
