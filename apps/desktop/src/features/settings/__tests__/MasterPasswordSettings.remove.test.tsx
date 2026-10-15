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

import { MasterPasswordSettings } from '../MasterPasswordSettings';

function stubVault(removal: { success: boolean; message: string }) {
  let configured = true;
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'master_password_get_status') {
      return {
        is_configured: configured,
        is_unlocked: configured,
        last_changed: null,
        needs_migration: false,
      };
    }
    if (command === 'master_password_remove') {
      if (removal.success) configured = false;
      return removal;
    }
    return undefined;
  });
}

describe('removing the master password', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  afterEach(() => cleanup());

  it('says what happens to saved keys, asks for the password and removes it', async () => {
    stubVault({ success: true, message: 'Master password removed' });
    render(<MasterPasswordSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(screen.getByText(/Nothing is deleted/)).toBeInTheDocument();
    expect(screen.getByText(/can use them without\s+a password/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Remove master password' });
    expect(submit).toBeDisabled();
    expect(invoke).not.toHaveBeenCalledWith('master_password_remove', expect.anything());

    fireEvent.change(screen.getByLabelText('Master Password'), {
      target: { value: 'Alpha-Beta-Unique-1' },
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('master_password_remove', {
        password: 'Alpha-Beta-Unique-1',
      });
    });
    expect(await screen.findByText('Not configured')).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Master password removed', expect.anything());
  });

  it('keeps the password and shows the reason when it is wrong', async () => {
    stubVault({ success: false, message: 'Password is incorrect' });
    render(<MasterPasswordSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    fireEvent.change(screen.getByLabelText('Master Password'), {
      target: { value: 'Nonmatching-Phrase-9' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove master password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Password is incorrect');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('can be cancelled without asking the vault to do anything', async () => {
    stubVault({ success: true, message: 'Master password removed' });
    render(<MasterPasswordSettings />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith('master_password_remove', expect.anything());
  });
});
