import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = vi.hoisted(() => ({
  hasPassword: false,
  passkeys: [] as Array<{ id: string; name: string | null; createdAt: Date; lastUsedAt: null }>,
}));

vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: () => ({
    user: { email: 'person@example.com', hasPassword: identity.hasPassword },
  }),
  usePasskeys: () => ({ passkeys: identity.passkeys }),
  useConnectedAccounts: () => ({
    isLoaded: true,
    accounts: [],
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock('@features/settings/hooks/use-step-up', () => ({
  useStepUp: () => ({ withStepUp: vi.fn(), dialog: null }),
}));

vi.mock('@/features/auth/step-up-fetch', () => ({
  isStepUpCancelled: () => false,
  sendAuthorizedJson: vi.fn(async () =>
    Response.json({ identities: [], providers: [], consequence: '' }),
  ),
}));

import { SignInMethodsPanel } from './SignInMethodsPanel';

function formatted(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

describe('SignInMethodsPanel', () => {
  beforeEach(() => {
    identity.hasPassword = false;
    identity.passkeys = [];
  });

  it('offers Add on the password row and opens the password form', async () => {
    const onOpenPassword = vi.fn();
    render(<SignInMethodsPanel onOpenPassword={onOpenPassword} />);

    const row = await screen.findByRole('button', { name: 'Add password' });
    expect(row).toHaveTextContent('Not set');
    fireEvent.click(row);
    expect(onOpenPassword).toHaveBeenCalledOnce();
  });

  it('offers Change when the account already has a password', async () => {
    identity.hasPassword = true;
    render(<SignInMethodsPanel onOpenPassword={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Change password' })).toHaveTextContent('Set');
  });

  it('renders the password row without an action when there is no form to open', async () => {
    render(<SignInMethodsPanel />);

    expect(await screen.findByText('Not set')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /password/i })).toBeNull();
  });

  it('dates the passkeys row by the most recently added passkey', async () => {
    const older = new Date('2026-03-02T12:00:00Z');
    const newest = new Date('2026-07-21T12:00:00Z');
    identity.passkeys = [
      { id: 'pk_new', name: 'Phone', createdAt: newest, lastUsedAt: null },
      { id: 'pk_old', name: 'Laptop', createdAt: older, lastUsedAt: null },
    ];
    render(<SignInMethodsPanel />);

    expect(
      await screen.findByText(
        `2 saved. Manage them under Passkeys. Last added on ${formatted(newest)}.`,
      ),
    ).toBeInTheDocument();
  });
});
