import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StarterPrompts } from './StarterPrompts';
import { DEFAULT_STARTER_PROMPTS, ONBOARDING_USE_CASES } from '../lib/use-cases';

const mocks = vi.hoisted(() => ({
  fetchNamespace: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: (namespace: string) => mocks.fetchNamespace(namespace),
}));

describe('StarterPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the default prompts before the chosen use case has loaded', () => {
    mocks.fetchNamespace.mockReturnValue(new Promise(() => {}));

    render(<StarterPrompts onSelect={vi.fn()} />);

    for (const prompt of DEFAULT_STARTER_PROMPTS) {
      expect(screen.getByRole('button', { name: prompt })).toBeInTheDocument();
    }
  });

  it('shows the prompts for the chosen use case once loaded', async () => {
    const useCase = ONBOARDING_USE_CASES[0]!;
    mocks.fetchNamespace.mockResolvedValue({ primaryUseCase: useCase.value });

    render(<StarterPrompts onSelect={vi.fn()} />);

    expect(
      await screen.findByRole('button', { name: useCase.starterPrompts[0] }),
    ).toBeInTheDocument();
  });

  it('falls back to the default prompts for an unrecognized use case', async () => {
    mocks.fetchNamespace.mockResolvedValue({ primaryUseCase: 'not-a-real-use-case' });

    render(<StarterPrompts onSelect={vi.fn()} />);

    expect(
      await screen.findByRole('button', { name: DEFAULT_STARTER_PROMPTS[0] }),
    ).toBeInTheDocument();
  });

  it('hands the exact prompt text to onSelect when clicked', async () => {
    mocks.fetchNamespace.mockResolvedValue({});
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<StarterPrompts onSelect={onSelect} />);

    const button = await screen.findByRole('button', { name: DEFAULT_STARTER_PROMPTS[0] });
    await user.click(button);

    expect(onSelect).toHaveBeenCalledWith(DEFAULT_STARTER_PROMPTS[0]);
  });
});
