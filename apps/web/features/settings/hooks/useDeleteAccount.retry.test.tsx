import { useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepUpDialogProps } from '@/features/auth/StepUpDialog';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { queryClient as productionQueryClient } from '@shared/stores/query-client';
import { NO_PENDING_ACCOUNT_DELETION } from '@agiworkforce/cloud-contracts';
import { toUserMessage } from '@/lib/user-error-message';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  useDeleteAccount,
  useCancelAccountDeletion,
  useAccountDeletionStatus,
} from './use-settings-queries';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  dialog: vi.fn(),
  sessionCurrent: true,
}));

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  useSessionSnapshot: () => () =>
    mocks.sessionCurrent
      ? {
          userId: 'native-user-1',
          sessionId: 'session-1',
          isCurrent: () => mocks.sessionCurrent,
          getToken: async () => 'captured-token',
        }
      : null,
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/identity/client', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule2>()),
  useSignOut: () => mocks.signOut,
}));

vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule3>()),
  useAuthStore: (selector: (state: { logout: typeof mocks.logout }) => unknown) =>
    selector({ logout: mocks.logout }),
}));

vi.mock('@shared/lib/get-auth-token', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule4>()),
  getAuthToken: vi.fn(async () => 'session-token'),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule5>()),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...Object.fromEntries(new Headers(headers).entries()),
    'x-csrf-token': 'csrf-token',
  })),
}));

vi.mock('@/features/auth/StepUpDialog', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule6>()),
  StepUpDialog: (props: StepUpDialogProps) => {
    mocks.dialog(props);
    return <button onClick={props.onCancel}>Cancel identity confirmation</button>;
  },
}));

const DELETE_PATH = '/api/user/delete-account';
const GRANT_PATH = '/api/auth/step-up';
const CANCEL_PATH = '/api/user/delete-account/cancel-schedule';
const fetchMock = vi.fn<WebFetch>();
let client: QueryClient;
let deletion: ReturnType<typeof useDeleteAccount>;
let cancellation: ReturnType<typeof useCancelAccountDeletion>;
let statusReader: ReturnType<typeof useAccountDeletionStatus>;

const pendingStatus = {
  cancellationPrecondition: 'schedule-pair-v1',
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
  const currentStatus = useAccountDeletionStatus();
  const currentDeletion = useDeleteAccount();
  useLayoutEffect(() => {
    statusReader = currentStatus;
    deletion = currentDeletion;
  }, [currentStatus, currentDeletion]);
  return (
    <>
      <button
        onClick={() => {
          if (currentStatus.snapshot) currentDeletion.mutate(currentStatus.snapshot);
        }}
      >
        Schedule deletion
      </button>
      {currentDeletion.stepUpDialog}
    </>
  );
}

async function renderDeletion() {
  fetchMock.mockImplementationOnce(async () => response(NO_PENDING_ACCOUNT_DELETION));
  render(
    <QueryClientProvider client={client}>
      <DeletionHarness />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(statusReader.snapshot).not.toBeNull());
  fetchMock.mockClear();
}

function CancellationHarness() {
  const currentStatus = useAccountDeletionStatus();
  const currentCancellation = useCancelAccountDeletion();
  useLayoutEffect(() => {
    statusReader = currentStatus;
    cancellation = currentCancellation;
  }, [currentStatus, currentCancellation]);
  return (
    <button onClick={() => currentCancellation.begin(currentStatus.snapshot)?.confirm()}>
      Cancel scheduled deletion
    </button>
  );
}

async function renderCancellation() {
  fetchMock.mockImplementationOnce(async () => response(pendingStatus));
  render(
    <QueryClientProvider client={client}>
      <CancellationHarness />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(statusReader.data).toEqual(pendingStatus));
  fetchMock.mockClear();
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
  mocks.logout.mockReset();
  mocks.sessionCurrent = true;
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
  delete (window as unknown as Record<string, unknown>)['Clerk'];
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
    await renderDeletion();
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
    await renderDeletion();
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
    await renderDeletion();
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
    await renderDeletion();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
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

describe('account deletion session authority', () => {
  const scheduledReceipt = {
    message: 'Account deletion scheduled.',
    scheduledFor: '2026-11-06T12:00:00.000Z',
    status: 'pending',
    statusReason: 'Deletion is scheduled and has not started.',
  };

  async function scheduleSuccessfully() {
    fetchMock.mockImplementation(async () => response(scheduledReceipt));
    await renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await waitFor(() => expect(deletion.isSuccess).toBe(true));
  }

  it('sends nothing when the session retires while the CSRF header is pending', async () => {
    let release: (headers: Record<string, string>) => void = () => undefined;
    vi.mocked(addCsrfHeaders).mockImplementationOnce(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          release = resolve;
        }),
    );
    fetchMock.mockImplementation(async () => response(scheduledReceipt));
    await renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await waitFor(() => expect(addCsrfHeaders).toHaveBeenCalled());

    mocks.sessionCurrent = false;
    release({ 'x-csrf-token': 'csrf-token' });

    await terminalError();
    expect(deletionCalls()).toHaveLength(0);
    expect(toUserMessage(deletion.error, 'fallback')).toBe(
      'Deletion was not scheduled. Close this dialog, check the current status, and reopen the confirmation.',
    );
    expectNoSignOut();
  });

  it('does not replay with a fresh proof after the session retires during identity confirmation', async () => {
    let releaseGrant: (reply: Response) => void = () => undefined;
    fetchMock.mockImplementation(async (url) => {
      if (String(url) === DELETE_PATH) return challenge();
      if (String(url) === GRANT_PATH)
        return new Promise<Response>((resolve) => {
          releaseGrant = resolve;
        });
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    await renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await waitFor(() => expect(grantCalls()).toHaveLength(1));

    mocks.sessionCurrent = false;
    releaseGrant(response({ token: 'grant.signature' }));

    await terminalError();
    expect(deletionCalls()).toHaveLength(1);
    expect(toUserMessage(deletion.error, 'fallback')).toBe(
      'Deletion was not scheduled. Close this dialog, check the current status, and reopen the confirmation.',
    );
  });

  it('dispatches with the confirming session credentials and no ambient cookies', async () => {
    await scheduleSuccessfully();

    const init = deletionCalls()[0]?.[1];
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer captured-token');
  });

  it('signs out only the session that owns the receipt', async () => {
    await scheduleSuccessfully();

    await act(async () => {
      await deletion.signOutAfterDeletion();
    });

    expect(mocks.logout).toHaveBeenCalledWith({ sessionId: 'session-1' });
    expect(mocks.signOut).toHaveBeenCalledWith({ sessionId: 'session-1', redirectUrl: '/' });
    expect(mocks.replace).toHaveBeenCalledWith('/');
  });

  it('does nothing on Continue after the receipt session was replaced', async () => {
    await scheduleSuccessfully();
    mocks.sessionCurrent = false;

    await act(async () => {
      await deletion.signOutAfterDeletion();
    });

    expectNoSignOut();
  });

  it('stops before the identity sign-out and navigation when a replacement session appears during logout', async () => {
    await scheduleSuccessfully();
    mocks.logout.mockImplementation(async () => {
      (window as unknown as Record<string, unknown>)['Clerk'] = { session: { id: 'session-2' } };
    });

    await act(async () => {
      await deletion.signOutAfterDeletion();
    });

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
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
    await renderDeletion();
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
      await renderCancellation();
      fireEvent.click(screen.getByText('Cancel scheduled deletion'));
      await waitFor(() => expect(cancellation.isSuccess).toBe(true));
      expect(cancellation.data?.cancelled).toBe(cancelled);
      expect(statusReader.data).toEqual(NO_PENDING_ACCOUNT_DELETION);
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
      await renderCancellation();
      fireEvent.click(screen.getByText('Cancel scheduled deletion'));
      await waitFor(() => expect(cancellation.isError).toBe(true), {
        timeout: productionRetryDelay() * 3 + 1000,
      });
      await beyondRetryWindow();
      expect(cancellation.isSuccess).toBe(false);
      expect(toUserMessage(cancellation.error, 'fallback')).toBe(
        'We could not confirm the cancellation outcome. Check the current status, then open a new confirmation before trying again.',
      );
      expect(statusReader.data).toEqual(pendingStatus);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expectNoSignOut();
    },
  );

  it('preserves a meaningful expired-window HTTP refusal and the cached schedule without replay', async () => {
    const message = 'The cancellation window has closed. Nothing was restored.';
    fetchMock.mockResolvedValue(
      response({ error: message, cancelled: false, reason: 'grace_window_expired' }, 409),
    );
    await renderCancellation();
    fireEvent.click(screen.getByText('Cancel scheduled deletion'));
    await waitFor(() => expect(cancellation.isError).toBe(true), {
      timeout: productionRetryDelay() * 3 + 1000,
    });
    await beyondRetryWindow();
    expect(toUserMessage(cancellation.error, 'fallback')).toBe(message);
    expect(statusReader.data).toEqual(pendingStatus);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule0 = typeof import('@/lib/identity/useSessionSnapshot');
type ImportedModule1 = typeof import('next/navigation');
type ImportedModule2 = typeof import('@/lib/identity/client');
type ImportedModule3 = typeof import('@shared/stores/authentication-store');
type ImportedModule4 = typeof import('@shared/lib/get-auth-token');
type ImportedModule5 = typeof import('@/lib/client/csrf');
type ImportedModule6 = typeof import('@/features/auth/StepUpDialog');
