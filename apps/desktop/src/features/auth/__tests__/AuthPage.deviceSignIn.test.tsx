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

  it('uses one browser-approved sign-in action without collecting a desktop password', () => {
    render(<AuthPage />);

    expect(screen.getByRole('button', { name: /continue in browser/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.getByText(/browser-approved device session/i)).toBeInTheDocument();
  });

  it('completes sign-in through the auth store and can return to Local Mode', async () => {
    const onAuthSuccess = vi.fn();
    render(<AuthPage onAuthSuccess={onAuthSuccess} />);

    fireEvent.click(screen.getByRole('button', { name: /continue in browser/i }));

    await waitFor(() => expect(signIn).toHaveBeenCalledWith('', ''));
    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /use local mode/i }));
    expect(useAppModeStore.getState().mode).toBe('local');
  });
});
