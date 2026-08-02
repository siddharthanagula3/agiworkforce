import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useAuthStore } from '../../../stores/auth';
import { AuthPage } from '../AuthPage';

describe('Desktop Cloud device sign-in', () => {
  const signIn = vi.fn();

  beforeEach(() => {
    signIn.mockReset();
    signIn.mockResolvedValue({ error: null });
    useAuthStore.setState({ signIn, isLoading: false, error: null });
    useAppModeStore.setState({ mode: 'cloud' });
  });

  it('offers one in-app Cloud sign-in action without rendering a password in the main shell', () => {
    render(<AuthPage />);

    expect(screen.getByRole('button', { name: /sign in to agi cloud/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/private in-app sign-in/i)).toBeInTheDocument();
    expect(screen.queryByText(/continue in browser/i)).not.toBeInTheDocument();
  });

  it('completes sign-in through the auth store and can return to Local Mode', async () => {
    const onAuthSuccess = vi.fn();
    render(<AuthPage onAuthSuccess={onAuthSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /sign in to agi cloud/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('', ''));
    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /use local mode/i }));
    expect(useAppModeStore.getState().mode).toBe('local');
  });

  /**
   * DES-C18. `cloudAccountAuth` produces specific reasons a session ended
   * ("Your AGI Cloud session has expired…", "…no longer authorized…") and the
   * orchestrator forwards them into the store, but AuthPage kept only its own
   * attempt-local `error` state, so an expired or revoked session was
   * indistinguishable from a first-run sign-in prompt. `selectAuthError` had no
   * consumer anywhere in the app.
   */
  it('surfaces the stored session-expiry reason, not a blank sign-in prompt', () => {
    useAuthStore.setState({
      error: 'Your AGI Cloud session has expired. Please connect again.',
    });

    render(<AuthPage />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/session has expired/i);
  });

  it('clears the previous session error when a new sign-in attempt starts', async () => {
    useAuthStore.setState({ error: 'Your AGI Cloud session is no longer authorized.' });
    // Hold the attempt open so the assertion observes the in-flight state.
    let releaseSignIn: (value: { error: null }) => void = () => {};
    signIn.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          releaseSignIn = resolve;
        }),
    );

    render(<AuthPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer authorized/i);

    fireEvent.click(screen.getByRole('button', { name: /sign in to agi cloud/i }));

    await waitFor(() => expect(useAuthStore.getState().error).toBeNull());
    expect(screen.queryByTestId('device-sign-in-error')).not.toBeInTheDocument();

    releaseSignIn({ error: null });
  });

  it('prefers the current attempt failure over a stale stored error', async () => {
    useAuthStore.setState({ error: 'Your AGI Cloud session has expired. Please connect again.' });
    signIn.mockResolvedValue({ error: 'AGI Cloud sign-in was denied.' });

    render(<AuthPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign in to agi cloud/i }));

    await waitFor(() =>
      expect(screen.getByTestId('device-sign-in-error')).toHaveTextContent(/sign-in was denied/i),
    );
  });
});
