import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
  requireTerms: vi.fn(),
  getOnboardingStatus: vi.fn(),
  getCurrentUserRlsDb: vi.fn(),
  scopedDb: { query: vi.fn(), execute: vi.fn(), transaction: vi.fn() },
}));

vi.mock('@clerk/nextjs/server', () => ({ auth: () => mocks.auth() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    mocks.redirect(url);
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock('@/lib/server/require-current-terms', () => ({
  requireCurrentTermsAcceptance: (userId: string, returnTo: string) =>
    mocks.requireTerms(userId, returnTo),
}));
vi.mock('@/lib/server/user-identity', () => ({
  getOnboardingStatus: (db: unknown, userId: string) => mocks.getOnboardingStatus(db, userId),
}));
vi.mock('@/lib/server/rls-db', () => ({
  getCurrentUserRlsDb: () => mocks.getCurrentUserRlsDb(),
}));
vi.mock('@/features/onboarding/components/OnboardingWizard', () => ({
  OnboardingWizard: () => <div data-testid="onboarding-wizard" />,
}));

import WelcomePage from './page';

describe('/welcome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: 'user-1' });
    mocks.requireTerms.mockResolvedValue(undefined);
    mocks.getOnboardingStatus.mockResolvedValue({ completed: false, primaryUseCase: null });
    mocks.getCurrentUserRlsDb.mockResolvedValue({ db: mocks.scopedDb, userId: 'user-1' });
  });

  it('sends a signed-out visitor to login with a return path', async () => {
    mocks.auth.mockResolvedValue({ userId: null });

    await expect(WelcomePage()).rejects.toThrow('redirect:/login?redirectTo=%2Fwelcome');
    expect(mocks.getOnboardingStatus).not.toHaveBeenCalled();
  });

  it('redirects to /chat when onboarding is already completed', async () => {
    mocks.getOnboardingStatus.mockResolvedValue({ completed: true, primaryUseCase: 'code' });

    await expect(WelcomePage()).rejects.toThrow('redirect:/chat');
    expect(mocks.redirect).toHaveBeenCalledWith('/chat');
  });

  it('renders the wizard for a first run that has not completed onboarding', async () => {
    render(await WelcomePage());

    expect(screen.getByTestId('onboarding-wizard')).toBeInTheDocument();
    expect(mocks.requireTerms).toHaveBeenCalledWith('user-1', '/welcome');
    expect(mocks.getOnboardingStatus).toHaveBeenCalledWith(mocks.scopedDb, 'user-1');
  });
});
