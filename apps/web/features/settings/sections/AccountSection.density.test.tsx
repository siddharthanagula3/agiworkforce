import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSection } from './AccountSection';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut: vi.fn() }),
}));

vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, logout: vi.fn() }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal()),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

vi.mock('../components/Settings/ApiKeys', () => ({
  ApiKeysManager: () => <div>Scoped API key manager</div>,
}));

vi.mock('../hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
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

describe('AccountSection row density', () => {
  it('renders no prose card and no loading text once sessions have resolved', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ sessions: [], totalCount: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<AccountSection />);

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.queryByText(/loading/i)).toBeNull();
    expect(document.querySelector('[class*="rounded-xl border"]')).toBeNull();
    expect(document.querySelector('[class*="rounded-lg border"]')).toBeNull();
  });
});
