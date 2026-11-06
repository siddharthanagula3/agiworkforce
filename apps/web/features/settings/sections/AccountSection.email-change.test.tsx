import type { ComponentProps } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NO_PENDING_ACCOUNT_DELETION } from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailAddressChange } from '../components/EmailAddressChange';
import { AccountSection } from './AccountSection';

type User = { id: string; email: string; name: string };
const fixture = vi.hoisted(() => ({
  user: { id: 'a', email: 'old@example.com', name: 'Original' } as User | null,
  updateUser: vi.fn(),
  editor: null as ComponentProps<typeof EmailAddressChange> | null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock('@shared/stores/authentication-store', () => {
  const state = () => ({ user: fixture.user, logout: vi.fn(), updateUser: fixture.updateUser });
  return { useAuthStore: Object.assign((selector: (store: ReturnType<typeof state>) => unknown) => selector(state()), { getState: state }) };
});
vi.mock('../components/EmailAddressChange', () => ({
  EmailAddressChange: (props: ComponentProps<typeof EmailAddressChange>) => {
    fixture.editor = props;
    return <div data-testid="email-editor-active">{String(props.active)}</div>;
  },
}));
vi.mock('../components/Settings/ApiKeys', () => ({ ApiKeysManager: () => null }));
vi.mock('../hooks/use-settings-queries', async (original) => ({
  ...await original<typeof import('../hooks/use-settings-queries')>(),
  useUserActivity: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useOrganizationOverview: () => ({ data: undefined }),
  useDeleteAccount: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isSuccess: false,
    error: null, data: undefined, signOutAfterDeletion: vi.fn(async () => {}) }),
  useAccountDeletionStatus: () => ({ data: NO_PENDING_ACCOUNT_DELETION, isError: false, error: null, refetch: vi.fn() }),
  useCancelAccountDeletion: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => {
  fixture.user = { id: 'a', email: 'old@example.com', name: 'Original' };
  fixture.editor = null;
  fixture.updateUser.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.settings.accountDeletionStatus(), NO_PENDING_ACCOUNT_DELETION);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sessions: [], totalCount: 0 }))));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe('account email completion ownership', () => {
  it('merges a confirmed email into the latest matching user, not the captured user', () => {
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const complete = fixture.editor!.onChanged;
    fixture.user = { id: 'a', email: 'old@example.com', name: 'Updated while waiting' };
    act(() => complete('new@example.com', { userId: 'a', isCurrent: () => true }));
    expect(fixture.updateUser).toHaveBeenCalledExactlyOnceWith({ id: 'a', email: 'new@example.com', name: 'Updated while waiting' });
  });

  it.each(['replaced-account', 'signed-out', 'retired'] as const)('ignores a completion for %s', (kind) => {
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const complete = fixture.editor!.onChanged;
    if (kind === 'replaced-account') fixture.user = { id: 'b', email: 'b@example.com', name: 'B' };
    if (kind === 'signed-out') fixture.user = null;
    act(() => complete('new@example.com', { userId: 'a', isCurrent: () => kind !== 'retired' }));
    expect(fixture.updateUser).not.toHaveBeenCalled();
  });

  it('checks completion currentness again after reading the latest store state', () => {
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    act(() => fixture.editor!.onChanged('new@example.com', { userId: 'a', isCurrent }));
    expect(fixture.updateUser).not.toHaveBeenCalled();
  });

  it('retains the lazily opened editor while withdrawing explicit admission at either close', () => {
    const mounted = render(<AccountSection />, { wrapper });
    expect(fixture.editor).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    expect(fixture.editor!.active).toBe(true);
    mounted.rerender(<AccountSection emailEditorActive={false} />);
    expect(fixture.editor!.active).toBe(false);
    mounted.rerender(<AccountSection emailEditorActive />);
    expect(fixture.editor!.active).toBe(true);
    act(() => fixture.editor!.onClose());
    expect(screen.getByTestId('email-editor-active')).toHaveTextContent('false');
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    expect(fixture.editor!.active).toBe(true);
  });
});
