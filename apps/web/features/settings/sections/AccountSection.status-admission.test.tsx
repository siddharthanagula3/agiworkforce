import type { ComponentProps, MouseEvent } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NO_PENDING_ACCOUNT_DELETION,
  MANAGED_CLOUD_ACCOUNT_DELETION_PATH,
  MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH,
  type AccountDeletionStatus,
} from '@agiworkforce/cloud-contracts';
import { queryKeys } from '@shared/stores/query-client';
import { AccountSection } from './AccountSection';

const { schedule, cancel, confirmations, identity } = vi.hoisted(() => ({
  schedule: vi.fn(),
  cancel: vi.fn<(init?: RequestInit) => void>(),
  confirmations: new Map<string, () => void>(),
  identity: { epoch: 0, subject: 'native-user-1', listeners: new Set<() => void>() },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('@clerk/nextjs', () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<MockedModule0>()),
  useSessionSnapshot: () => () => {
    const epoch = identity.epoch;
    return {
      userId: identity.subject,
      sessionId: `session-${epoch}`,
      isCurrent: () => identity.epoch === epoch,
      getToken: async () => `captured-token-${epoch}`,
      subscribe: (listener: () => void) => {
        identity.listeners.add(listener);
        return () => {
          identity.listeners.delete(listener);
        };
      },
    };
  },
}));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<MockedModule1>()),
  addCsrfHeaders: async (headers: HeadersInit) => headers,
}));
vi.mock('@shared/stores/authentication-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { id: 'user-1' }, logout: vi.fn() }),
}));
vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({ subscription: null, initialized: true }),
}));
vi.mock('../components/Settings/ApiKeys', () => ({ ApiKeysManager: () => null }));
vi.mock('../hooks/use-settings-queries', async (importOriginal) => ({
  ...(await importOriginal()),
  useUserActivity: () => ({ data: [], isPending: false, error: null, refetch: vi.fn() }),
  useOrganizationOverview: () => ({ data: undefined }),
  useDeleteAccount: () => ({
    mutate: schedule,
    reset: vi.fn(),
    isPending: false,
    isSuccess: false,
    error: null,
    data: undefined,
    signOutAfterDeletion: vi.fn(),
  }),
}));
vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const original = await importOriginal<MockedModule2>();
  return {
    ...original,
    AlertDialogAction: (
      props: ComponentProps<typeof original.AlertDialogAction> & { 'data-testid'?: string },
    ) => {
      if (props['data-testid'] && props.onClick) {
        const handler = props.onClick;
        confirmations.set(props['data-testid'], () =>
          handler({ preventDefault: vi.fn() } as unknown as MouseEvent<HTMLButtonElement>),
        );
      }
      return <original.AlertDialogAction {...props} />;
    },
  };
});

let key: readonly unknown[];
const pending: AccountDeletionStatus = {
  cancellationPrecondition: 'schedule-pair-v1',
  pending: true,
  canCancel: true,
  requestedAt: null,
  scheduledFor: '2020-01-02T11:00:00.000Z',
};

function response(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

async function setup(
  status?: AccountDeletionStatus,
  responseBody: unknown = status ?? NO_PENDING_ACCOUNT_DELETION,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const statusRead = vi
    .fn<() => Promise<Response>>()
    .mockImplementation(async () => response(responseBody));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (String(input) === MANAGED_CLOUD_ACCOUNT_DELETION_PATH) return statusRead();
    if (String(input) === MANAGED_CLOUD_ACCOUNT_DELETION_CANCEL_SCHEDULE_PATH) {
      cancel(init);
      return response({ message: 'Account deletion cancelled.', cancelled: true });
    }
    return response({ sessions: [], totalCount: 0 });
  });
  render(
    <QueryClientProvider client={client}>
      <AccountSection />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: queryKeys.settings.accountDeletionStatus() })
        .some((query) => query.state.fetchStatus === 'idle' && query.state.status !== 'pending'),
    ).toBe(true),
  );
  key = client
    .getQueryCache()
    .findAll({ queryKey: queryKeys.settings.accountDeletionStatus() })
    .find((query) => query.state.status !== 'pending')!.queryKey;
  return { client, statusRead };
}

async function openConfirmation(action: 'schedule' | 'cancel') {
  const trigger = action === 'schedule' ? 'delete-account-trigger' : 'cancel-deletion-trigger';
  const confirm = action === 'schedule' ? 'delete-account-confirm' : 'cancel-deletion-confirm';
  await waitFor(() => expect(screen.getByTestId(trigger)).toBeEnabled());
  fireEvent.click(screen.getByTestId(trigger));
  if (action === 'schedule')
    fireEvent.change(screen.getByTestId('delete-confirm-input'), { target: { value: 'DELETE' } });
  await waitFor(() => expect(screen.getByTestId(confirm)).toBeEnabled());
  const retained = confirmations.get(confirm);
  if (!retained) throw new Error('Confirmation handler was not captured');
  return retained;
}

beforeEach(() => {
  vi.restoreAllMocks();
  schedule.mockReset();
  cancel.mockReset();
  confirmations.clear();
  identity.epoch = 0;
  identity.subject = 'native-user-1';
  identity.listeners.clear();
});

describe('AccountSection deletion status admission', () => {
  it('preserves the scheduling draft but rejects its original confirmation after owner replacement (UNRUN)', async () => {
    await setup(NO_PENDING_ACCOUNT_DELETION);
    const retained = await openConfirmation('schedule');
    act(() => {
      identity.epoch += 1;
      identity.subject = 'native-user-2';
      for (const notify of [...identity.listeners]) notify();
    });
    expect(screen.getByTestId('delete-confirm-input')).toHaveValue('DELETE');
    expect(screen.getByTestId('delete-account-confirm')).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId('delete-account-trigger')).toBeEnabled());
    expect(screen.getByTestId('delete-account-confirm')).toBeDisabled();
    act(() => retained());
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('admits status from the native subject even though the mapped product account has a different ID (UNRUN)', async () => {
    await setup(pending);
    expect(key).toContain('native-user-1');
    expect(key).not.toContain('user-1');
    const retained = await openConfirmation('cancel');
    act(() => retained());
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    const sent = cancel.mock.calls[0]![0]!;
    expect(sent.method).toBe('PUT');
    expect(JSON.parse(String(sent.body))).toEqual({
      expectedSchedule: { requestedAt: pending.requestedAt, scheduledFor: pending.scheduledFor },
    });
  });

  it('shows a legacy offset status but refuses cancellation without a schedule-pair precondition', async () => {
    await setup({
      pending: true,
      canCancel: true,
      requestedAt: null,
      scheduledFor: '2020-01-02T12:00:00+01:00',
    });
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeDisabled();
    expect(schedule).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('blocks cached pending status after a malformed refetch and admits a fresh confirmation after retry', async () => {
    const { client, statusRead } = await setup(pending);
    statusRead.mockImplementation(async () => response({ ...pending, scheduledFor: 'not-a-date' }));
    await act(async () => {
      await client.refetchQueries({ queryKey: key, exact: true });
    });
    expect(screen.getByTestId('pending-deletion-title')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeDisabled();
    expect(screen.queryByTestId('delete-account-trigger')).toBeNull();
    expect(
      screen.getByText(/Could not check whether a deletion is already pending/),
    ).toBeInTheDocument();
    statusRead.mockImplementation(async () => response(pending));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const current = await openConfirmation('cancel');
    act(() => {
      current();
    });
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(schedule).not.toHaveBeenCalled();
  });

  it('updates invalidation-only UI even when the cached result was already stale', async () => {
    const { client, statusRead } = await setup(pending);
    act(() => {
      client.setQueryData(key, client.getQueryData(key), { updatedAt: Date.now() - 60_000 });
    });
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeEnabled();
    await act(async () => {
      await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
    });
    expect(screen.getByTestId('cancel-deletion-trigger')).toBeDisabled();
    expect(screen.getByText(/Deletion status needs to be checked again/)).toBeInTheDocument();
    expect(statusRead).toHaveBeenCalledTimes(1);
    statusRead.mockImplementation(async () => response(pending));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('cancel-deletion-trigger')).toBeEnabled());
  });

  it.each(['requestedAt', 'scheduledFor'] as const)(
    'blocks both actions on malformed %s',
    async (field) => {
      await setup(undefined, { ...pending, [field]: 'not-a-date' });
      await waitFor(() =>
        expect(
          screen.getByText(/Could not check whether a deletion is already pending/),
        ).toBeInTheDocument(),
      );
      expect(screen.getByTestId('delete-account-trigger')).toBeDisabled();
      expect(screen.queryByTestId('cancel-deletion-trigger')).toBeNull();
      expect(schedule).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  describe.each(['schedule', 'cancel'] as const)('%s confirmation', (action) => {
    it('admits an unchanged ready snapshot', async () => {
      await setup(action === 'schedule' ? NO_PENDING_ACCOUNT_DELETION : pending);
      const retained = await openConfirmation(action);
      act(() => {
        retained();
      });
      await waitFor(() =>
        expect(action === 'schedule' ? schedule : cancel).toHaveBeenCalledTimes(1),
      );
    });

    it.each([
      'invalidated',
      'paused',
      'fetching',
      'malformed',
      'recovered',
      'equal-data',
      'cancelled',
      'replaced',
    ] as const)('rejects a retained handler after status becomes %s', async (change) => {
      const status = action === 'schedule' ? NO_PENDING_ACCOUNT_DELETION : pending;
      const { client, statusRead } = await setup(status);
      const retained = await openConfirmation(action);
      const before = client.getQueryState(key);

      if (change === 'invalidated') {
        await act(async () => {
          await client.invalidateQueries({ queryKey: key, exact: true, refetchType: 'none' });
        });
      } else if (change === 'paused') {
        act(() => {
          client
            .getQueryCache()
            .find({ queryKey: key, exact: true })
            ?.setState({ fetchStatus: 'paused' });
        });
      } else if (change === 'replaced') {
        act(() => {
          client.removeQueries({ queryKey: key, exact: true });
          client.setQueryData(key, status);
        });
      } else if (change === 'fetching' || change === 'cancelled') {
        statusRead.mockImplementation(() => new Promise<Response>(() => {}));
        act(() => {
          void client.refetchQueries({ queryKey: key, exact: true });
        });
        expect(client.getQueryState(key)?.fetchStatus).toBe('fetching');
        if (change === 'cancelled')
          await act(async () => {
            await client.cancelQueries({ queryKey: key, exact: true });
          });
      } else {
        statusRead.mockImplementation(async () =>
          response(
            change === 'malformed' || change === 'recovered'
              ? { ...pending, scheduledFor: 'not-a-date' }
              : { ...status },
          ),
        );
        await act(async () => {
          await client.refetchQueries({ queryKey: key, exact: true });
        });
        if (change === 'equal-data') {
          const current = client.getQueryData<{
            status: AccountDeletionStatus;
            readSequence: number;
          }>(key)!;
          const previous = before!.data as { status: AccountDeletionStatus; readSequence: number };
          expect(current.status).toEqual(previous.status);
          expect(current.readSequence).toBeGreaterThan(previous.readSequence);
        }
        if (change === 'malformed') expect(client.getQueryState(key)?.status).toBe('error');
        if (change === 'recovered') {
          statusRead.mockImplementation(async () => response(status));
          await act(async () => {
            await client.refetchQueries({ queryKey: key, exact: true });
          });
          expect(client.getQueryState(key)?.status).toBe('success');
        }
      }

      expect(client.getQueryState(key)).not.toBe(before);
      expect(
        screen.getByText(
          action === 'schedule'
            ? /Deletion status changed\. Close this dialog/
            : /A fresh confirmation is required\. Close this dialog/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(
          action === 'schedule' ? 'delete-account-confirm' : 'cancel-deletion-confirm',
        ),
      ).toBeDisabled();
      act(() => {
        retained();
      });
      expect(schedule).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    });
  });
});

type MockedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type MockedModule1 = typeof import('@/lib/client/csrf');
type MockedModule2 = typeof import('@agiworkforce/ui');
