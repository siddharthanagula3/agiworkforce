import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/runtimeEnvironment', () => ({
  isTauri: false,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: false,
  isCloudWeb: true,
  isElectronHost: true,
}));

import { useAppModeStore } from '../../../stores/appModeStore';
import { useAuthStore } from '../../../stores/auth';
import { AuthPage } from '../AuthPage';

describe('Electron Cloud sign-in shell', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_Y2xlcmsuYWdpd29ya2ZvcmNlLmNvbSQ');
    useAuthStore.setState({
      signIn: vi.fn().mockResolvedValue({ error: null }),
      completeNativeSignIn: vi.fn().mockResolvedValue({ error: null }),
      isLoading: false,
      error: null,
    });
    useAppModeStore.setState({ mode: 'cloud' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('shows only Cloud sign-in claims and controls', () => {
    render(<AuthPage />);

    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.queryByText(/Local Mode/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /use local mode/i })).not.toBeInTheDocument();
  });
});
