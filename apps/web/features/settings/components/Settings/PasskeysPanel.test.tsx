import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clerk = vi.hoisted(() => ({
  user: null as null | Record<string, unknown>,
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-1', getToken: vi.fn() }),
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: clerk.user }),
}));

import { PasskeysPanel } from './PasskeysPanel';

function makeUser() {
  const deletePasskey = vi.fn(async () => ({}));
  const user = {
    id: 'user-1',
    passkeys: [
      {
        id: 'pk_1',
        name: 'MacBook',
        createdAt: new Date('2026-09-01T00:00:00Z'),
        lastUsedAt: null,
        delete: deletePasskey,
      },
    ],
    createPasskey: vi.fn(async () => ({})),
    reload: vi.fn(async () => undefined),
  };
  return { user, deletePasskey };
}

describe('PasskeysPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: function PublicKeyCredential() {},
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(window, 'PublicKeyCredential');
  });

  it('adds a passkey through the identity provider and refreshes the account', async () => {
    const { user } = makeUser();
    clerk.user = user;
    render(<PasskeysPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    await waitFor(() => expect(user.createPasskey).toHaveBeenCalledTimes(1));
    expect(user.reload).toHaveBeenCalled();
    expect(screen.getByText('MacBook')).toBeInTheDocument();
  });

  it('asks before removing a passkey and removes it only on confirm', async () => {
    const { user, deletePasskey } = makeUser();
    clerk.user = user;
    render(<PasskeysPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove MacBook' }));
    expect(deletePasskey).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove passkey' }));

    await waitFor(() => expect(deletePasskey).toHaveBeenCalledTimes(1));
  });

  it('stays quiet when the person dismisses the browser prompt', async () => {
    const { user } = makeUser();
    user.createPasskey.mockRejectedValueOnce(
      Object.assign(new Error('The operation was cancelled'), { name: 'NotAllowedError' }),
    );
    clerk.user = user;
    render(<PasskeysPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Add a passkey' }));

    await waitFor(() => expect(user.createPasskey).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('explains instead of offering the control when the browser cannot create passkeys', () => {
    Reflect.deleteProperty(window, 'PublicKeyCredential');
    clerk.user = makeUser().user;
    render(<PasskeysPanel />);

    expect(screen.queryByRole('button', { name: 'Add a passkey' })).toBeNull();
    expect(screen.getByText(/cannot create passkeys/)).toBeInTheDocument();
  });
});
