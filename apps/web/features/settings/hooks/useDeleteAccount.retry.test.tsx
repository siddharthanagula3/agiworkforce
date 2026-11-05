import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepUpDialogProps } from '@/features/auth/StepUpDialog';
import { isStepUpCancelled } from '@/features/auth/step-up-fetch';
import { queryClient as productionQueryClient } from '@shared/stores/query-client';
import { useDeleteAccount } from './use-settings-queries';

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  signOut: vi.fn(),
  replace: vi.fn(),
  dialog: vi.fn(),
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
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
let deletion: ReturnType<typeof useDeleteAccount>;

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
  return response({
    error: {
      code: 'STEP_UP_REQUIRED',
      details: {
        action: 'account.delete',
        consequence: 'Your account and its content are scheduled for deletion.',
        freshnessSeconds: 300,
      },
    },
  }, 403);
}

function deletionCalls() {
  return fetchMock.mock.calls.filter(([url, init]) => String(url) === DELETE_PATH && init?.method === 'DELETE');
}

function grantCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url) === GRANT_PATH);
}

function DeletionHarness() {
  deletion = useDeleteAccount();
  return <>
    <button onClick={() => deletion.mutate()}>Schedule deletion</button>
    {deletion.stepUpDialog}
  </>;
}

function renderDeletion() {
  render(<QueryClientProvider client={client}><DeletionHarness /></QueryClientProvider>);
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
      if (String(url) === GRANT_PATH) return response({
        error: { code: 'STEP_UP_VERIFICATION_REQUIRED', details: { level: 'first_factor' } },
      }, 403);
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
    expectNoSignOut();
  });

  it('does not start a new mutation cycle when the grant-authorized replay rejects', async () => {
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url) === GRANT_PATH) return response({ token: 'grant.signature' });
      if (String(url) === DELETE_PATH) {
        if (new Headers(init?.headers).has('x-step-up-token')) throw new TypeError('Failed to fetch');
        return challenge();
      }
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    renderDeletion();
    fireEvent.click(screen.getByText('Schedule deletion'));
    await terminalError();
    await beyondRetryWindow();
    expect(deletionCalls()).toHaveLength(2);
    expect(new Headers(deletionCalls()[1]?.[1]?.headers).get('x-step-up-token')).toBe('grant.signature');
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
    fetchMock.mockResolvedValue(response({
      message: 'Account deletion scheduled.', scheduledFor: '2026-11-06T12:00:00.000Z',
    }));
    fireEvent.click(screen.getByText('Schedule deletion'));
    await waitFor(() => expect(deletion.isSuccess).toBe(true));
    expect(deletionCalls()).toHaveLength(2);
    expectNoSignOut();
  });

  it('retains actual production retries for an ordinary mutation without the local override', async () => {
    const operation = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('Transient failure')).mockResolvedValue('done');
    function OrdinaryMutation() {
      const mutation = useMutation({ mutationFn: operation });
      return <>
        <button onClick={() => mutation.mutate()}>Run ordinary mutation</button>
        <span>{mutation.status}</span>
      </>;
    }
    render(<QueryClientProvider client={client}><OrdinaryMutation /></QueryClientProvider>);
    fireEvent.click(screen.getByText('Run ordinary mutation'));
    await waitFor(() => expect(screen.getByText('success')).toBeTruthy(), {
      timeout: productionRetryDelay() * 3 + 1000,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
