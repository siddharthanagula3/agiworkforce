import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createRequestAuthority } from '@/lib/identity/request-authority';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { useChangePassword, useCreateAPIKey } from '../use-settings-queries';

type MutationKind = 'password' | 'apiKey';
const fetchMock = vi.fn();
const endpoints = { password: '/api/settings/password', apiKey: '/api/settings/api-keys' };
const actions = { password: 'password.change', apiKey: 'api_credential.reveal' };
const requests: Array<ReturnType<typeof createRequestAuthority>> = [];
const clients: QueryClient[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function success(kind: MutationKind) {
  return json(
    kind === 'password'
      ? {
          success: true,
          otherSessionsEnded: 1,
          otherSessionsRemaining: 0,
          deviceCredentialsRevoked: 2,
        }
      : { api_key: { id: 'key-1', name: 'Integration' }, full_key: 'fixture-key' },
    kind === 'apiKey' ? 201 : 200,
  );
}

function harness(kind: MutationKind) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: 1, retryDelay: 0 } } });
  clients.push(client);
  const request = createRequestAuthority({
    userId: 'owner',
    sessionId: 'session',
    isCurrent: () => true,
    getToken: async () => 'captured-token',
  });
  requests.push(request);
  const scope = { request, organizationId: null, onStepUpRequired: vi.fn() };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => ({ password: useChangePassword(), apiKey: useCreateAPIKey() }), {
    wrapper,
  });
  return {
    ...view,
    start: () =>
      act(() => {
        if (kind === 'password') {
          view.result.current.password.mutate({
            scope,
            draft: {
              currentPassword: 'old-password',
              newPassword: 'new-password',
              confirmPassword: 'new-password',
            },
          });
        } else {
          view.result.current.apiKey.mutate({
            scope,
            draft: { name: 'Integration', scopes: ['models:read'] },
          });
        }
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  requests.splice(0).forEach((request) => request.retire());
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe.each(['password', 'apiKey'] as const)('%s mutation retry', (kind) => {
  it.each(['transport', 'server response'] as const)(
    'does not restart after %s failure',
    async (failure) => {
      fetchMock.mockImplementation(async () => {
        if (failure === 'transport') throw new TypeError('Failed to fetch');
        return json({ error: { message: 'The operation could not be completed.' } }, 503);
      });
      const { result, start } = harness(kind);

      start();

      await waitFor(() => expect(result.current[kind].status).toBe('error'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(endpoints[kind]);
      expect(toastMock.success).not.toHaveBeenCalled();
    },
  );

  it.each(['success', 'lost response'] as const)(
    'keeps only the explicit proof replay on %s',
    async (outcome) => {
      fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
        if (url === '/api/auth/step-up') return json({ token: 'fresh-proof' });
        if (new Headers(init.headers).has(STEP_UP_TOKEN_HEADER)) {
          if (outcome === 'lost response') throw new TypeError('Failed to fetch');
          return success(kind);
        }
        return json(
          {
            error: {
              code: 'STEP_UP_REQUIRED',
              details: { action: actions[kind], freshnessSeconds: 300 },
            },
          },
          403,
        );
      });
      const { result, start } = harness(kind);

      start();

      await waitFor(() =>
        expect(result.current[kind].status).toBe(outcome === 'success' ? 'success' : 'error'),
      );
      const writes = fetchMock.mock.calls.filter(([url]) => url === endpoints[kind]);
      expect(writes).toHaveLength(2);
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/auth/step-up')).toHaveLength(1);
      expect(new Headers((writes[0]?.[1] as RequestInit).headers).has(STEP_UP_TOKEN_HEADER)).toBe(
        false,
      );
      expect(new Headers((writes[1]?.[1] as RequestInit).headers).get(STEP_UP_TOKEN_HEADER)).toBe(
        'fresh-proof',
      );
      // Credential success is presented only by the current editor.
      expect(toastMock.success).not.toHaveBeenCalled();
    },
  );
});

it('does not create another API key after an unreadable successful receipt', async () => {
  fetchMock.mockImplementation(async () => new Response('{', { status: 201 }));
  const { result, start } = harness('apiKey');

  start();

  await waitFor(() => expect(result.current.apiKey.status).toBe('error'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(toastMock.success).not.toHaveBeenCalled();
});

it('preserves the password-changed partial-cleanup message instead of retrying the old password', async () => {
  const message = 'Your password was changed, but signing out your other devices did not finish.';
  fetchMock.mockImplementation(async () => json({ error: { message } }, 503));
  const { result, start } = harness('password');

  start();

  await waitFor(() => expect(result.current.password.status).toBe('error'));
  expect(result.current.password.error?.message).toBe(message);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(toastMock.success).not.toHaveBeenCalled();
});
