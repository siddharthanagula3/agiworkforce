import type { ComponentProps } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NO_PENDING_ACCOUNT_DELETION } from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailAddressChange } from '../components/EmailAddressChange';
import { AccountSection } from './AccountSection';
import { useAuthStore } from '@shared/stores/authentication-store';
import { useProductAccountSnapshot } from '@/lib/identity/useProductAccountSnapshot';

const initialAuthState = useAuthStore.getState();
const fixture = vi.hoisted(() => ({
  editor: null as ComponentProps<typeof EmailAddressChange> | null,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@clerk/nextjs', async (original) => ({
  ...(await original()),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock('../components/EmailAddressChange', () => ({
  EmailAddressChange: (props: ComponentProps<typeof EmailAddressChange>) => {
    fixture.editor = props;
    return <div data-testid="email-editor-active">{String(props.active)}</div>;
  },
}));
vi.mock('../components/Settings/ApiKeys', () => ({ ApiKeysManager: () => null }));
vi.mock('../hooks/use-settings-queries', async (original) => ({
  ...(await original<MockedModule0>()),
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
    data: NO_PENDING_ACCOUNT_DELETION,
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
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);
beforeEach(() => {
  useAuthStore.setState({ user: { id: 'product-a', email: 'old@example.com', name: 'Original' } });
  fixture.editor = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.settings.accountDeletionStatus(), NO_PENDING_ACCOUNT_DELETION);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ sessions: [], totalCount: 0 }))),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.setState(initialAuthState, true);
  vi.unstubAllGlobals();
});

describe('account email completion ownership', () => {
  it('merges a confirmed email into the latest matching user, not the captured user', () => {
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const complete = fixture.editor!.onChanged;
    act(() =>
      useAuthStore.setState({
        user: {
          id: 'product-a',
          email: 'old@example.com',
          name: 'Updated while waiting',
          preferredName: 'Latest name',
          plan: 'pro',
        },
      }),
    );
    act(() => complete('new@example.com', { accountId: 'product-a', isCurrent: () => true }));
    expect(useAuthStore.getState().user).toEqual({
      id: 'product-a',
      email: 'new@example.com',
      name: 'Updated while waiting',
      preferredName: 'Latest name',
      plan: 'pro',
    });
  });

  it.each(['replaced-account', 'signed-out', 'retired'] as const)(
    'ignores a completion for %s',
    (kind) => {
      render(<AccountSection />, { wrapper });
      fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
      const complete = fixture.editor!.onChanged;
      if (kind === 'replaced-account')
        act(() =>
          useAuthStore.setState({ user: { id: 'product-b', email: 'b@example.com', name: 'B' } }),
        );
      if (kind === 'signed-out') act(() => useAuthStore.setState({ user: null }));
      const latest = useAuthStore.getState().user;
      act(() =>
        complete('new@example.com', {
          accountId: 'product-a',
          isCurrent: () => kind !== 'retired',
        }),
      );
      expect(useAuthStore.getState().user).toBe(latest);
    },
  );

  it('checks completion currentness again after reading the latest store state', () => {
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const latest = useAuthStore.getState().user;
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    act(() => fixture.editor!.onChanged('new@example.com', { accountId: 'product-a', isCurrent }));
    expect(useAuthStore.getState().user).toBe(latest);
  });

  it('refuses a native subject in place of the mapped product completion ID', () => {
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const latest = useAuthStore.getState().user;
    expect(fixture.editor!.accountId).toBe('product-a');
    act(() =>
      fixture.editor!.onChanged('new@example.com', { accountId: 'a', isCurrent: () => true }),
    );
    expect(useAuthStore.getState().user).toBe(latest);
  });

  it('keeps the latest product profile intact when a real captured authority retires across synchronous A/B/A', () => {
    const capture = renderHook(() => useProductAccountSnapshot());
    const owner = capture.result.current('product-a')!;
    render(<AccountSection />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
    const complete = fixture.editor!.onChanged;
    const latest = { id: 'product-a', email: 'replacement@example.com', name: 'Replacement A' };
    act(() => {
      useAuthStore.setState({ user: { id: 'product-b', email: 'b@example.com' } });
      useAuthStore.setState({ user: latest });
      complete('new@example.com', owner);
    });
    expect(owner.isCurrent()).toBe(false);
    expect(useAuthStore.getState().user).toEqual(latest);
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

type MockedModule0 = typeof import('../hooks/use-settings-queries');
