/**
 * AuthPage shell behaviour.
 *
 * Native in-app sign-in is now the default on Desktop; the device-authorization
 * browser approval that used to own this screen survives only as an explicit
 * fallback. These assert the shell renders the native form, keeps the fallback
 * reachable, and still surfaces the auth store's session-ended reason instead
 * of a blank prompt.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
  isElectronHost: false,
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useAuthStore } from '../../../stores/auth';
import { AuthPage } from '../AuthPage';

describe('Desktop Cloud sign-in shell', () => {
  const signIn = vi.fn();
  const completeNativeSignIn = vi.fn();

  beforeEach(() => {
    // Points Desktop at the same Clerk instance the web app uses; without it
    // native sign-in correctly reports itself unconfigured.
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ');
    signIn.mockReset();
    completeNativeSignIn.mockReset();
    signIn.mockResolvedValue({ error: null });
    completeNativeSignIn.mockResolvedValue({ error: null });
    useAuthStore.setState({ signIn, completeNativeSignIn, isLoading: false, error: null });
    useAppModeStore.setState({ mode: 'cloud' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders the native form inline instead of a device-approval prompt', () => {
    render(<AuthPage />);

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByText(/checking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enter this code/i)).not.toBeInTheDocument();
  });

  it('keeps browser approval reachable as an explicit fallback', async () => {
    const onAuthSuccess = vi.fn();
    render(<AuthPage onAuthSuccess={onAuthSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /sign in through your browser instead/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('', ''));
    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalledOnce());
  });

  it('keeps Local Mode claims and the return control on a native host', () => {
    render(<AuthPage />);

    expect(
      screen.getByText('Sign in right here. Local Mode keeps working without an account.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Local Mode stays available without an account.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use local mode/i }));
    expect(useAppModeStore.getState().mode).toBe('local');
  });

  /**
   * DES-C18. `cloudAccountAuth` produces specific reasons a session ended
   * ("Your AGI Cloud session has expired…", "…no longer authorized…"). Rendering
   * only the attempt-local error would make an expired or revoked session
   * indistinguishable from a first-run sign-in prompt.
   */
  it('surfaces the stored session-expiry reason, not a blank sign-in prompt', () => {
    useAuthStore.setState({
      error: 'Your AGI Cloud session has expired. Please connect again.',
    });

    render(<AuthPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/session has expired/i);
  });

  it('clears the stored session error when a new attempt starts', async () => {
    useAuthStore.setState({ error: 'Your AGI Cloud session is no longer authorized.' });
    let releaseSignIn: (value: { error: null }) => void = () => {};
    signIn.mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          releaseSignIn = resolve;
        }),
    );

    render(<AuthPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/no longer authorized/i);

    fireEvent.click(screen.getByRole('button', { name: /sign in through your browser instead/i }));

    await waitFor(() => expect(useAuthStore.getState().error).toBeNull());
    expect(screen.queryByTestId('native-sign-in-error')).not.toBeInTheDocument();

    releaseSignIn({ error: null });
  });

  it('prefers the current attempt failure over a stale stored error', async () => {
    useAuthStore.setState({ error: 'Your AGI Cloud session has expired. Please connect again.' });
    signIn.mockResolvedValue({ error: 'AGI Cloud sign-in was cancelled.' });

    render(<AuthPage />);
    fireEvent.click(screen.getByRole('button', { name: /sign in through your browser instead/i }));

    await waitFor(() =>
      expect(screen.getByTestId('native-sign-in-error')).toHaveTextContent(/was cancelled/i),
    );
  });
});
