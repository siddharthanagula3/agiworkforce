import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AccountSection } from './AccountSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  useSession: () => ({ session: null }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      user: { id: 'user-1' },
      logout: vi.fn(),
    }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

vi.mock('../components/Settings/ApiKeys', () => ({
  ApiKeysManager: () => <div>Scoped API key manager</div>,
}));

// This suite only exercises the API-key manager mount, not account deletion
// (see AccountSection.delete.test.tsx for the real useDeleteAccount
// integration, including a QueryClientProvider). Stub the hook here so
// mounting AccountSection doesn't require a QueryClient.
vi.mock('../hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
  // The pane now carries a Recent activity panel under the sessions list; these
  // files have no QueryClient, and these tests are about other rows.
  useUserActivity: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useOrganizationOverview: () => ({ data: undefined }),
  useDeleteAccount: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null,
    data: undefined,
    signOutAfterDeletion: vi.fn(async () => {}),
  }),
  useAccountDeletionStatus: () => ({
    data: { pending: false, canCancel: false, requestedAt: null, scheduledFor: null },
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCancelAccountDeletion: () => ({
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

describe('AccountSection API keys', () => {
  it('drills into the scoped API-key manager from the API keys row', async () => {
    render(<AccountSection />);

    expect(screen.queryByText('Scoped API key manager')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'API keys' }));

    expect(screen.getByText('Scoped API key manager')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /API keys/ }));

    expect(screen.queryByText('Scoped API key manager')).not.toBeInTheDocument();
  });
});
