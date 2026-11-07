import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepUpDialogProps } from '@/features/auth/StepUpDialog';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { queryClient as productionQueryClient, queryKeys } from '@shared/stores/query-client';
import {
  NO_PENDING_ACCOUNT_DELETION,
  type AccountDeletionStatus,
} from '@agiworkforce/cloud-contracts';
import { toUserMessage } from '@/lib/user-error-message';
import { useDeleteAccount, useCancelAccountDeletion } from './use-settings-queries';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  dialog: vi.fn(),
}));

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => () => ({
    userId: 'native-user-1',
    sessionId: 'session-1',
    isCurrent: () => true,
    getToken: async () => 'captured-token',
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/client')>()),
  useSignOut: () => mocks.signOut,
}));

vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/stores/authentication-store')>()),
  useAuthStore: (selector: (state: { logout: typeof mocks.logout }) => unknown) =>
    selector({ logout: mocks.logout }),
}));

vi.mock('@shared/lib/get-auth-token', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/lib/get-auth-token')>()),
  getAuthToken: vi.fn(async () => 'session-token'),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...Object.fromEntries(new Headers(headers).entries()),
    'x-csrf-token': 'csrf-token',
  })),
}));

vi.mock('@/features/auth/StepUpDialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/auth/StepUpDialog')>()),
  StepUpDialog: (props: StepUpDialogProps) => {
    mocks.dialog(props);
    return <button onClick={props.onCancel}>Cancel identity confirmation</button>;
  },
}));

const DELETE_PATH = '/api/user/delete-account';
const GRANT_PATH = '/api/auth/step-up';
const CANCEL_PATH = '/api/user/delete-account/cancel';
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
let deletion: ReturnType<typeof useDeleteAccount>;
let cancellation: ReturnType<typeof useCancelAccountDeletion>;

const pendingStatus = {
  pending: true,
  canCancel: true,
  requestedAt: '2026-11-05T12:00:00.000Z',
  scheduledFor: '2026-11-06T12:00:00.000Z',
};

function productionRetryDelay(): number {
  const delay = productionQueryClient.getDefaultOptions().mutations?.retryDelay;
  if (typeof delay !== 'number') throw new Error('Update fixture for the production retry delay');
  return delay;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function challenge(): Response {
  return response(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'account.delete',
          consequence: 'Your account and its content are scheduled for deletion.',
          freshnessSeconds: 300,
        },
      },
    },
    403,
  );
}

function deletionCalls() {
  return fetchMock.mock.calls.filter(
    ([url, init]) => String(url) === DELETE_PATH && init?.method === 'DELETE',
  );
}

function grantCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url) === GRANT_PATH);
}

function DeletionHarness() {
  deletion = useDeleteAccount();
  return (
    <>
      <button onClick={() => deletion.mutate()}>Schedule deletion</button>
      {deletion.stepUpDialog}
    </>
  );
}

function renderDeletion() {
  render(
    <QueryClientProvider client={client}>
      <DeletionHarness />
    </QueryClientProvider>,
  );
}

function CancellationHarness() {
  cancellation = useCancelAccountDeletion();
  return (
    <button
      onClick={() =>
        cancellation
          .begin(
            client.getQueryState<AccountDeletionStatus, Error>(
              queryKeys.settings.accountDeletionStatus(),
            ),
          )
          ?.confirm()
      }
    >
      Cancel scheduled deletion
    </button>
  );
}

function renderCancellation() {
  client.setQueryData(queryKeys.settings.accountDeletionStatus(), pendingStatus);
  render(
    <QueryClientProvider client={client}>
      <CancellationHarness />
    </QueryClientProvider>,
  );
}

async function terminalError() {
  await waitFor(() => expect(deletion.isError).toBe(true), {
    timeout: productionRetryDelay() * 3 + 1000,
  });
}

async function beyondRetryWindow() {
  vi.useFakeTimers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(productionRetryDelay() * 2 + 1);
  });
  vi.useRealTimers();
}

function expectNoSignOut() {
  expect(mocks.logout).not.toHaveBeenCalled();
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  client = new QueryClient({
    defaultOptions: {
      mutations: { ...productionQueryClient.getDefaultOptions().mutations },
    },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useDeleteAccount retry admission', () => {
  it('does not restart deletion or reopen identity confirmation after cancellation', async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === DELETE_PATH) return challenge();
      if (String(url) === GRANT_PATH)
        return response(
          {
            error: { code: 'STEP_UP_VERIFICATION_REQUIRED', details: { level: 'first_factor' } },
          },
          403,
        );
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    fireEvent.click(await screen.findByText('Cancel identity confirmation'));
    await terminalError();
    expect(isStepUpCancelled(deletion.error)).toBe(true);
    const dialogRenders = mocks.dialog.mock.calls.length;
    await beyondRetryWindow();
    expect(deletionCalls()).toHaveLength(1);
    expect(grantCalls()).toHaveLength(1);
    expect(mocks.dialog).toHaveBeenCalledTimes(dialogRenders);
    expect(screen.queryByText('Cancel identity confirmation')).toBeNull();
    expectNoSignOut();
  });

  it('does not replay a DELETE whose transport rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await terminalError();
    await beyondRetryWindow();
    expect(deletionCalls()).toHaveLength(1);
    expect(grantCalls()).toHaveLength(0);
    expect(mocks.dialog).not.toHaveBeenCalled();
    expect(toUserMessage(deletion.error, 'fallback')).toBe(
      'We could not confirm whether deletion was scheduled. Reload the page, then check Settings > Account before trying again.',
    );
    expectNoSignOut();
  });

  it('does not start a new mutation cycle when the grant-authorized replay rejects', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === GRANT_PATH) return response({ token: 'grant.signature' });
      if (String(url) === DELETE_PATH) {
        if (new Headers(init?.headers).has('x-step-up-token'))
          throw new TypeError('Failed to fetch');
        return challenge();
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await terminalError();
    await beyondRetryWindow();
    expect(deletionCalls()).toHaveLength(2);
    expect(new Headers(deletionCalls()[1]?.[1]?.headers).get('x-step-up-token')).toBe(
      'grant.signature',
    );
    expect(grantCalls()).toHaveLength(1);
    expect(mocks.dialog).not.toHaveBeenCalled();
    expectNoSignOut();
  });

  it('allows a later explicit invocation as a new action', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await terminalError();
    await beyondRetryWindow();
    expect(deletionCalls()).toHaveLength(1);
    fetchMock.mockResolvedValue(
      response({
        message: 'Account deletion scheduled.',
        scheduledFor: '2026-11-06T12:00:00.000Z',
        status: 'pending',
        statusReason: 'Deletion is scheduled and has not started.',
      }),
    );
    fireEvent.click(screen.getByText('Schedule deletion'));
    await waitFor(() => expect(deletion.isSuccess).toBe(true));
    expect(deletionCalls()).toHaveLength(2);
    expectNoSignOut();
  });

  it('retains actual production retries for an ordinary mutation without the local override', async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Transient failure'))
      .mockResolvedValue('done');
    function OrdinaryMutation() {
      const mutation = useMutation({ mutationFn: operation });
      return (
        <>
          <button onClick={() => mutation.mutate()}>Run ordinary mutation</button>
          <span>{mutation.status}</span>
        </>
      );
    }
    render(
      <QueryClientProvider client={client}>
        <OrdinaryMutation />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText('Run ordinary mutation'));
    await waitFor(() => expect(screen.getByText('success')).toBeTruthy(), {
      timeout: productionRetryDelay() * 3 + 1000,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });
});

describe('account deletion mutation receipts with production retry defaults', () => {
  it.each([
    { label: 'empty body', reply: () => new Response(null, { status: 204 }) },
    { label: 'invalid JSON', reply: () => new Response('{', { status: 200 }) },
    { label: 'missing receipt', reply: () => response({}) },
    {
      label: 'invalid date',
      reply: () =>
        response({
          message: 'Account deletion scheduled.',
          scheduledFor: 'bad-date',
          status: 'pending',
          statusReason: 'Scheduled.',
        }),
    },
    {
      label: 'refusal in success body',
      reply: () =>
        response({
          message: 'Account deletion scheduled.',
          scheduledFor: pendingStatus.scheduledFor,
          status: 'pending',
          statusReason: 'Scheduled.',
          error: 'Nothing was scheduled.',
        }),
    },
  ])('does not report scheduling success or replay after $label', async ({ reply }) => {
    fetchMock.mockImplementation(async () => reply());
    renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await terminalError();
    await beyondRetryWindow();
    expect(deletion.isSuccess).toBe(false);
    expect(toUserMessage(deletion.error, 'fallback')).toBe(
      'We could not confirm whether deletion was scheduled. Reload the page, then check Settings > Account before trying again.',
    );
    expect(deletionCalls()).toHaveLength(1);
    expectNoSignOut();
  });

  it.each([true, false])(
    'clears the pending cache only after a valid cancelled=%s receipt',
    async (cancelled) => {
      fetchMock.mockResolvedValue(
        response({
          message: cancelled ? 'Account deletion cancelled.' : 'No account deletion is pending.',
          cancelled,
        }),
      );
      renderCancellation();
      fireEvent.click(screen.getByText('Cancel scheduled deletion'));
      await waitFor(() => expect(cancellation.isSuccess).toBe(true));
      expect(cancellation.data?.cancelled).toBe(cancelled);
      expect(client.getQueryData(queryKeys.settings.accountDeletionStatus())).toEqual(
        NO_PENDING_ACCOUNT_DELETION,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(CANCEL_PATH);
      expectNoSignOut();
    },
  );

  it.each([
    {
      label: 'transport failure',
      reply: (): Response => {
        throw new TypeError('Failed to fetch');
      },
    },
    { label: 'empty body', reply: () => new Response(null, { status: 204 }) },
    { label: 'invalid JSON', reply: () => new Response('{', { status: 200 }) },
    { label: 'missing receipt', reply: () => response({}) },
    { label: 'missing boolean', reply: () => response({ message: 'Account deletion cancelled.' }) },
    {
      label: 'nonboolean cancellation',
      reply: () => response({ message: 'Account deletion cancelled.', cancelled: 'true' }),
    },
    {
      label: 'contradictory refusal',
      reply: () =>
        response({
          message: 'No account deletion is pending.',
          cancelled: false,
          reason: 'grace_window_expired',
        }),
    },
  ])(
    'preserves cached schedule and does not replay cancellation after $label',
    async ({ reply }) => {
      fetchMock.mockImplementation(async () => reply());
      renderCancellation();
      fireEvent.click(screen.getByText('Cancel scheduled deletion'));
      await waitFor(() => expect(cancellation.isError).toBe(true), {
        timeout: productionRetryDelay() * 3 + 1000,
      });
      await beyondRetryWindow();
      expect(cancellation.isSuccess).toBe(false);
      expect(toUserMessage(cancellation.error, 'fallback')).toBe(
        'We could not confirm the cancellation outcome. Reload the page, then check Settings > Account before trying again.',
      );
      expect(client.getQueryData(queryKeys.settings.accountDeletionStatus())).toEqual(
        pendingStatus,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expectNoSignOut();
    },
  );

  it('preserves a meaningful expired-window HTTP refusal and the cached schedule without replay', async () => {
    const message = 'The cancellation window has closed. Nothing was restored.';
    fetchMock.mockResolvedValue(
      response({ error: message, cancelled: false, reason: 'grace_window_expired' }, 409),
    );
    renderCancellation();
    fireEvent.click(screen.getByText('Cancel scheduled deletion'));
    await waitFor(() => expect(cancellation.isError).toBe(true), {
      timeout: productionRetryDelay() * 3 + 1000,
    });
    await beyondRetryWindow();
    expect(toUserMessage(cancellation.error, 'fallback')).toBe(message);
    expect(client.getQueryData(queryKeys.settings.accountDeletionStatus())).toEqual(pendingStatus);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
