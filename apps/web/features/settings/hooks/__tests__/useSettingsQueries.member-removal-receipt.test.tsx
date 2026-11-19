import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'session-token') }));
vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
  addCsrfHeaders: vi.fn(),
  clearCsrfToken: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@shared/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { useRemoveTeamMember } from '../use-settings-queries';

const ORG = '11111111-1111-4111-8111-111111111111';
const MEMBER = `${ORG}:user_target`;
const fetchMock = vi.fn();

function harness() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRemoveTeamMember(), { wrapper });
}

function respond(body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe('removing a team member reports what the server could not revoke', () => {
  it('confirms removal only when cleanup reported no warnings', async () => {
    respond({
      message: 'Member removed',
      revoked: { sessions: 2, deviceTokens: 1, apiKeys: 3 },
      warnings: [],
    });
    const { result } = harness();

    act(() => result.current.mutate({ memberId: MEMBER, organizationId: ORG }));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({
      cleanup: 'confirmed',
      revoked: { sessions: 2, deviceTokens: 1, apiKeys: 3 },
    });
    expect(toastMock.success).toHaveBeenCalledWith('Team member removed');
    expect(toastMock.warning).not.toHaveBeenCalled();
  });

  it('keeps a cleanup warning in front of the administrator instead of a plain success', async () => {
    respond({
      message: 'Member removed',
      revoked: { sessions: 1, deviceTokens: 0, apiKeys: 0 },
      warnings: ['api key revocation failed'],
    });
    const { result } = harness();

    act(() => result.current.mutate({ memberId: MEMBER, organizationId: ORG }));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({ cleanup: 'incomplete' });
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalledTimes(1);
    expect(toastMock.warning.mock.calls[0]?.[0]).toMatch(/could not be revoked/);
    expect(toastMock.warning.mock.calls[0]?.[1]).toEqual({ duration: Infinity });
    expect(String(toastMock.warning.mock.calls[0]?.[0])).not.toContain('api key revocation failed');
  });

  it('treats an unreadable receipt as removed with cleanup unconfirmed, not as a failure', async () => {
    respond('not json');
    const { result } = harness();

    act(() => result.current.mutate({ memberId: MEMBER, organizationId: ORG }));

    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({ cleanup: 'unconfirmed' });
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalled();
    expect(toastMock.warning.mock.calls[0]?.[0]).toMatch(/could not be confirmed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

type ImportedModule1 = typeof import('@/lib/client/csrf');
type ImportedModule0 = typeof import('@shared/lib/logger');
