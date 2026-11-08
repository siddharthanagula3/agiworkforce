import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComposerSuggestions } from './ComposerSuggestions';

describe('ComposerSuggestions', () => {
  it('fills the draft from a suggestion and does not send it', () => {
    const onPick = vi.fn();
    render(<ComposerSuggestions onPick={onPick} />);

    fireEvent.click(screen.getByRole('button', { name: 'Draft a plan' }));

    expect(onPick).toHaveBeenCalledWith('Draft a plan');
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('hides the suggestions and shows them again', () => {
    render(<ComposerSuggestions onPick={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide suggestions' }));

    expect(screen.queryByRole('button', { name: 'Draft a plan' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show suggestions' }));

    expect(screen.getByRole('button', { name: 'Draft a plan' })).toBeInTheDocument();
  });
});
