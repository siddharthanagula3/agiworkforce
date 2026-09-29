import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { TERMS_GATE_STORAGE_KEY } from '@/app/signup/TermsGate';

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), logout: vi.fn() }));

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal()),
  useSignOut: () => mocks.signOut,
}));
vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthStore: (select: (state: { logout: typeof mocks.logout }) => unknown) => select(mocks),
}));

import { TermsReviewSignOut } from './TermsReviewSignOut';

describe('leaving terms review', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.localStorage.setItem(TERMS_GATE_STORAGE_KEY, POLICY_LAST_UPDATED.terms);
    mocks.logout.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
  });

  it('clears unfinished signup consent and signs out through the identity boundary', async () => {
    render(<TermsReviewSignOut />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: '/login' }));
    expect(mocks.logout).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem(TERMS_GATE_STORAGE_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled();
  });

  it('shows a retryable error if signing out fails', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<TermsReviewSignOut />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
