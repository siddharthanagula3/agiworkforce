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

const openExternalUrl = vi.fn();
vi.mock('../../../utils/navigation', () => ({
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  openPricingPage: vi.fn(),
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useAuthStore } from '../../../stores/auth';
import { AuthPage } from '../AuthPage';

describe('Desktop Cloud sign-in shell', () => {
  const signIn = vi.fn();
  const completeNativeSignIn = vi.fn();

  beforeEach(() => {
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

    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.queryByText(/checking/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enter this code/i)).not.toBeInTheDocument();
  });

  it('sends sign-up to the web surface in the system browser, marked as desktop', async () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole('button', { name: /^sign up$/i }));

    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledOnce());
    expect(String(openExternalUrl.mock.calls[0]?.[0])).toMatch(/\/signup\?surface=desktop$/);
  });

  it('carries the brand mark once, in the page corner rather than above the heading', () => {
    render(<AuthPage />);

    expect(screen.getAllByText('AGI')).toHaveLength(1);
    expect(screen.queryByText('AGI Desktop')).not.toBeInTheDocument();
    expect(screen.queryByText(/secure cloud sign-in/i)).not.toBeInTheDocument();
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

    expect(screen.getByText('Local Mode stays available without an account.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use local mode/i }));
    expect(useAppModeStore.getState().mode).toBe('local');
  });

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
