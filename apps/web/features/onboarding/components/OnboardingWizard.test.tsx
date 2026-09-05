import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingWizard } from './OnboardingWizard';
import { ONBOARDING_USE_CASES } from '../lib/use-cases';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  loadSeed: vi.fn(),
  complete: vi.fn(),
  skip: vi.fn(),
  identityUser: { firstName: 'Ada', fullName: 'Ada Lovelace' } as {
    firstName?: string;
    fullName?: string;
  } | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: () => ({ isLoaded: true, isSignedIn: true, user: mocks.identityUser }),
}));

vi.mock('../lib/onboarding-preferences', () => ({
  loadOnboardingSeed: () => mocks.loadSeed(),
  completeOnboarding: (input: unknown) => mocks.complete(input),
  skipOnboarding: () => mocks.skip(),
}));

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.identityUser = { firstName: 'Ada', fullName: 'Ada Lovelace' };
    mocks.loadSeed.mockResolvedValue({ preferredName: '', workDescription: '' });
    mocks.complete.mockResolvedValue(undefined);
    mocks.skip.mockResolvedValue(undefined);
  });

  it('seeds the name field from Clerk when nothing is stored yet', async () => {
    render(<OnboardingWizard />);

    expect(await screen.findByDisplayValue('Ada')).toBeInTheDocument();
  });

  it('prefers a previously stored name over the Clerk fallback', async () => {
    mocks.loadSeed.mockResolvedValue({ preferredName: 'Sid', workDescription: 'Design / UX' });

    render(<OnboardingWizard />);

    expect(await screen.findByDisplayValue('Sid')).toBeInTheDocument();
  });

  it('advances to the use-case step and finishes with the chosen use case', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    const nameInput = await screen.findByLabelText('Preferred name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Priya');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByRole('heading', { name: 'What do you want to do first?' }),
    ).toBeInTheDocument();

    const secondUseCase = ONBOARDING_USE_CASES[1]!;
    await user.click(screen.getByRole('radio', { name: new RegExp(secondUseCase.label) }));
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    await waitFor(() =>
      expect(mocks.complete).toHaveBeenCalledWith({
        preferredName: 'Priya',
        workDescription: '',
        primaryUseCase: secondUseCase.value,
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith('/chat');
  });

  it('completes with the chosen prompt prefilled when a starter prompt is picked', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    const nameInput = await screen.findByLabelText('Preferred name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Priya');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    const firstUseCase = ONBOARDING_USE_CASES[0]!;
    await user.click(screen.getByRole('radio', { name: new RegExp(firstUseCase.label) }));

    const chosenPrompt = firstUseCase.starterPrompts[0]!;
    await user.click(screen.getByRole('button', { name: chosenPrompt }));

    await waitFor(() =>
      expect(mocks.complete).toHaveBeenCalledWith({
        preferredName: 'Priya',
        workDescription: '',
        primaryUseCase: firstUseCase.value,
      }),
    );
    expect(mocks.replace).toHaveBeenCalledWith(
      `/chat?starterPrompt=${encodeURIComponent(chosenPrompt)}`,
    );
  });

  it('shows the default prompts before a use case has been chosen', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    const nameInput = await screen.findByLabelText('Preferred name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Priya');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'What do you want to do first?' });

    expect(screen.getByText('Start with one of these')).toBeInTheDocument();
  });

  it('returns to the name step on Back without losing what was typed', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    const nameInput = await screen.findByLabelText('Preferred name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Priya');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'What do you want to do first?' });

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByDisplayValue('Priya')).toBeInTheDocument();
  });

  it('skips immediately from the first step without requiring input', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    await screen.findByLabelText('Preferred name');
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));

    await waitFor(() => expect(mocks.skip).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith('/chat');
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('surfaces a recoverable error instead of a dead end when saving fails', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    render(<OnboardingWizard />);

    const nameInput = await screen.findByLabelText('Preferred name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Priya');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'What do you want to do first?' });
    await user.click(screen.getByRole('button', { name: 'Finish' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Finish' })).not.toBeDisabled();
  });
});
