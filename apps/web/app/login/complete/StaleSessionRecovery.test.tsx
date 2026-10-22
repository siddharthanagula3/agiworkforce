import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal()),
  useSignOut: () => mocks.signOut,
}));

import { SIGN_IN_COMPLETION_TIMEOUT_MS, StaleSessionRecovery } from './StaleSessionRecovery';

const loginUrl = '/login?redirectTo=%2F&authRetry=1';

describe('finishing sign-in', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops waiting on a sign-out that never settles and offers the way back to sign-in', async () => {
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    render(<StaleSessionRecovery loginUrl={loginUrl} alreadyRetried={false} />);

    expect(mocks.signOut).toHaveBeenCalledWith({ redirectUrl: loginUrl });
    expect(screen.getByRole('heading', { name: 'Finishing signing in' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIGN_IN_COMPLETION_TIMEOUT_MS - 1);
    });
    expect(screen.queryByRole('link', { name: 'Back to sign-in' })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(
      screen.getByRole('heading', { name: 'We could not finish signing you in' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/taking longer than it should/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign-in' })).toHaveAttribute('href', loginUrl);
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('shows the cleared-session error at once when sign-out fails', async () => {
    mocks.signOut.mockRejectedValue(new Error('Network unavailable'));
    render(<StaleSessionRecovery loginUrl={loginUrl} alreadyRetried={false} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText(/Clearing it did not help/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to sign-in' })).toBeInTheDocument();
  });

  it('does not sign out again on the second pass', () => {
    render(<StaleSessionRecovery loginUrl={loginUrl} alreadyRetried />);

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Back to sign-in' })).toBeInTheDocument();
  });

  it('clears the timer when the page goes away', () => {
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    const { unmount } = render(<StaleSessionRecovery loginUrl={loginUrl} alreadyRetried={false} />);

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
