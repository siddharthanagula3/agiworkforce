import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { toast } from 'sonner';

import { subscribeToLocalModelCatalogChanges } from '@/lib/localModelCatalog';

import { MasterPasswordLaunchUnlock } from '../MasterPasswordLaunchUnlock';

function stubVault(
  status: { is_configured: boolean; is_unlocked: boolean },
  unlockSucceeds = true,
) {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'master_password_get_status') {
      return { ...status, last_changed: null, needs_migration: false };
    }
    if (command === 'master_password_unlock') {
      return unlockSucceeds
        ? { success: true, message: 'App unlocked successfully' }
        : { success: false, message: 'Invalid password' };
    }
    return undefined;
  });
}

describe('MasterPasswordLaunchUnlock', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(toast.warning).mockReset();
  });

  afterEach(() => cleanup());

  it('says which saved keys an unlock could not upgrade, and stays quiet otherwise', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'master_password_get_status') {
        return {
          is_configured: true,
          is_unlocked: false,
          last_changed: null,
          needs_migration: false,
        };
      }
      if (command === 'master_password_unlock') {
        return {
          success: true,
          message: 'App unlocked successfully',
          keys_not_upgraded: ['openai', 'anthropic'],
        };
      }
      return undefined;
    });
    render(<MasterPasswordLaunchUnlock />);

    fireEvent.change(await screen.findByLabelText('Master password'), {
      target: { value: 'Alpha-Beta-Unique-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect(toast.warning).toHaveBeenCalledWith(
      'Some saved keys were not upgraded',
      expect.objectContaining({
        description: expect.stringContaining(
          'the saved keys for openai, anthropic could not be read',
        ),
      }),
    );
  });

  it('asks for the master password at launch when saved keys are locked', async () => {
    stubVault({ is_configured: true, is_unlocked: false });
    render(<MasterPasswordLaunchUnlock />);

    expect(await screen.findByRole('dialog', { name: 'Unlock your saved keys' })).toBeVisible();
    expect(screen.getByText(/chats that use your own keys cannot send/)).toBeInTheDocument();
    expect(
      screen.getByText(/seals your saved provider API keys and nothing else/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/connector app credentials are sealed/)).not.toBeInTheDocument();
  });

  it('stays out of the way when no master password is set or the vault is open', async () => {
    stubVault({ is_configured: false, is_unlocked: false });
    const { unmount } = render(<MasterPasswordLaunchUnlock />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('master_password_get_status'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    stubVault({ is_configured: true, is_unlocked: true });
    render(<MasterPasswordLaunchUnlock />);
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('unlocks, registers the local runtimes again and closes', async () => {
    stubVault({ is_configured: true, is_unlocked: false });
    const onCatalogChanged = vi.fn();
    const unsubscribe = subscribeToLocalModelCatalogChanges(onCatalogChanged);
    render(<MasterPasswordLaunchUnlock />);

    fireEvent.change(await screen.findByLabelText('Master password'), {
      target: { value: 'Alpha-Beta-Unique-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toast.warning).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('master_password_unlock', {
      password: 'Alpha-Beta-Unique-1',
    });
    expect(invoke).toHaveBeenCalledWith(
      'llm_configure_provider',
      expect.objectContaining({ provider: 'lmstudio', apiKey: null }),
    );
    expect(onCatalogChanged).toHaveBeenCalled();
    unsubscribe();
  });

  it('keeps the dialog open and says why when the password is wrong', async () => {
    stubVault({ is_configured: true, is_unlocked: false }, false);
    render(<MasterPasswordLaunchUnlock />);

    fireEvent.change(await screen.findByLabelText('Master password'), {
      target: { value: 'Nonmatching-Phrase-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid password');
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(invoke).not.toHaveBeenCalledWith('llm_configure_provider', expect.anything());
  });

  it('shows the lockout message the vault returns', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'master_password_get_status') {
        return {
          is_configured: true,
          is_unlocked: false,
          last_changed: null,
          needs_migration: false,
        };
      }
      throw new Error('Too many failed attempts. Please wait 30 seconds before trying again.');
    });
    render(<MasterPasswordLaunchUnlock />);

    fireEvent.change(await screen.findByLabelText('Master password'), {
      target: { value: 'Nonmatching-Phrase-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 30 seconds');
  });

  it('can be dismissed and leaves the vault locked', async () => {
    stubVault({ is_configured: true, is_unlocked: false });
    render(<MasterPasswordLaunchUnlock />);

    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(invoke).not.toHaveBeenCalledWith('master_password_unlock', expect.anything());
  });
});
