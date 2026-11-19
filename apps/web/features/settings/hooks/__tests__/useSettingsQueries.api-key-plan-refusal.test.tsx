import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { billingPlanCapabilityUpgradeMessage } from '@agiworkforce/types';
import { createRequestAuthority } from '@/lib/identity/request-authority';

vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { APIKeyMutationRejectedError, useCreateAPIKey } from '../use-settings-queries';

const REFUSAL = billingPlanCapabilityUpgradeMessage('managed_api');
const fetchMock = vi.fn();
const requests: Array<ReturnType<typeof createRequestAuthority>> = [];
const clients: QueryClient[] = [];

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function createRejection(response: Response): Promise<unknown> {
  fetchMock.mockResolvedValue(response);
  const client = new QueryClient();
  clients.push(client);
  const request = createRequestAuthority({
    userId: 'owner',
    sessionId: 'session',
    isCurrent: () => true,
    getToken: async () => 'captured-token',
  });
  requests.push(request);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useCreateAPIKey(), { wrapper });
  act(() => {
    result.current.mutate({
      scope: { request, organizationId: null, onStepUpRequired: vi.fn() },
      draft: { name: 'Integration', scopes: ['models:read'] },
    });
  });
  await waitFor(() => expect(result.current.status).toBe('error'));
  return result.current.error;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  requests.splice(0).forEach((request) => request.retire());
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe('API key create refusals', () => {
  it('carries the upgrade recovery of a plan refusal with the server sentence', async () => {
    const error = await createRejection(
      json(
        {
          error: {
            code: 'SUBSCRIPTION_REQUIRED',
            message: REFUSAL,
            details: {
              code: 'managed_api_plan_required',
              recovery: { action: 'upgrade', href: '/pricing' },
            },
          },
        },
        403,
      ),
    );

    expect(error).toBeInstanceOf(APIKeyMutationRejectedError);
    expect((error as APIKeyMutationRejectedError).recovery).toBe('upgrade');
    expect((error as Error).message).toBe(REFUSAL);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a refusal without a recovery', { error: { message: 'Name is required' } }],
    [
      'a recovery other than upgrade',
      { error: { message: 'Try again soon.', details: { recovery: { action: 'retry' } } } },
    ],
    ['a malformed error body', { error: null }],
  ])('offers no upgrade for %s', async (_, body) => {
    const error = await createRejection(json(body, 400));

    expect(error).toBeInstanceOf(APIKeyMutationRejectedError);
    expect((error as APIKeyMutationRejectedError).recovery).toBeNull();
  });

  it('does not treat a server fault as a refusal, whatever its body names', async () => {
    const error = await createRejection(
      json(
        { error: { message: 'Unavailable', details: { recovery: { action: 'upgrade' } } } },
        503,
      ),
    );

    expect(error).not.toBeInstanceOf(APIKeyMutationRejectedError);
  });
});
