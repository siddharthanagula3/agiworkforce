import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StarterPrompts } from './StarterPrompts';
import { DEFAULT_STARTER_PROMPTS, ONBOARDING_USE_CASES } from '../lib/use-cases';

describe('StarterPrompts', () => {
  it('shows the default prompts when no use case is chosen', () => {
    render(<StarterPrompts useCase={null} onSelect={vi.fn()} />);

    for (const prompt of DEFAULT_STARTER_PROMPTS) {
      expect(screen.getByRole('button', { name: prompt })).toBeInTheDocument();
    }
  });

  it('shows the prompts for the chosen use case', () => {
    const useCase = ONBOARDING_USE_CASES[0]!;
    render(<StarterPrompts useCase={useCase.value} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: useCase.starterPrompts[0] })).toBeInTheDocument();
  });

  it('updates live as the chosen use case changes', () => {
    const first = ONBOARDING_USE_CASES[0]!;
    const second = ONBOARDING_USE_CASES[1]!;
    const { rerender } = render(<StarterPrompts useCase={first.value} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: first.starterPrompts[0] })).toBeInTheDocument();

    rerender(<StarterPrompts useCase={second.value} onSelect={vi.fn()} />);

    expect(screen.queryByRole('button', { name: first.starterPrompts[0] })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: second.starterPrompts[0] })).toBeInTheDocument();
  });

  it('falls back to the default prompts for an unrecognized use case', () => {
    render(<StarterPrompts useCase="not-a-real-use-case" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: DEFAULT_STARTER_PROMPTS[0] })).toBeInTheDocument();
  });

  it('hands the exact prompt text to onSelect when clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<StarterPrompts useCase={null} onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: DEFAULT_STARTER_PROMPTS[0] }));

    expect(onSelect).toHaveBeenCalledWith(DEFAULT_STARTER_PROMPTS[0]);
  });
});
