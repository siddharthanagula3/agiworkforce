import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const authState = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));

vi.mock('@shared/stores/authentication-store', () => ({
  applyCacheScope: vi.fn(),
  cleanupAllStores: vi.fn(),
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}));

import { queryClient, queryKeys } from '@shared/stores/query-client';
import { resolveUpgradeWaitlistStatus, useUpgradeWaitlistStatus } from './use-upgrade-waitlist';

function serveStatus(body: unknown, ok = true) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  } as Response);
}

function renderStatus(options?: { enabled?: boolean }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUpgradeWaitlistStatus(options), { wrapper });
}

describe('useUpgradeWaitlistStatus', () => {
  beforeEach(() => {
    authState.user = { id: 'user-1' };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the waitlist place and access from the server', async () => {
    serveStatus({ joinedPlans: ['basic'], upgradeGateEnabled: true, accessGranted: false });

    const { result } = renderStatus();

    await waitFor(() =>
      expect(result.current.status).toEqual({
        joinedPlans: ['basic'],
        upgradeGateEnabled: true,
        accessGranted: false,
      }),
    );
  });

  it('shows a plan as joined before the server answers, then asks the server again', async () => {
    const fetchMock = serveStatus({
      joinedPlans: [],
      upgradeGateEnabled: true,
      accessGranted: false,
    });
    const { result } = renderStatus();
    await waitFor(() => expect(result.current.status).not.toBeNull());

    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    act(() => result.current.recordJoined('pro'));

    await waitFor(() => expect(result.current.status?.joinedPlans).toEqual(['pro']));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('records redeemed access so the next upgrade goes to checkout', async () => {
    const fetchMock = serveStatus({
      joinedPlans: ['basic'],
      upgradeGateEnabled: true,
      accessGranted: false,
    });
    const { result } = renderStatus();
    await waitFor(() => expect(result.current.status).not.toBeNull());

    fetchMock.mockImplementation(() => new Promise<Response>(() => undefined));
    act(() => result.current.recordAccessGranted());

    await waitFor(() => expect(result.current.status?.accessGranted).toBe(true));
  });

  it('says access is being checked until the first answer arrives', async () => {
    let answer: (response: Response) => void = () => undefined;
    vi.spyOn(global, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    );

    const { result } = renderStatus();

    expect(result.current.checking).toBe(true);
    expect(result.current.status).toBeNull();
    answer({
      ok: true,
      status: 200,
      json: async () => ({ joinedPlans: [], upgradeGateEnabled: true, accessGranted: false }),
    } as Response);
    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.status?.accessGranted).toBe(false);
  });

  it('stops checking once access cannot be read, without inventing an answer', async () => {
    serveStatus({ error: 'unavailable' }, false);

    const { result } = renderStatus();

    await waitFor(() => expect(result.current.checking).toBe(false));
    expect(result.current.status).toBeNull();
  });

  it('asks nothing for a signed-out visitor', () => {
    authState.user = null;
    const fetchMock = serveStatus({
      joinedPlans: [],
      upgradeGateEnabled: true,
      accessGranted: false,
    });

    const { result } = renderStatus();

    expect(result.current.status).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resolveUpgradeWaitlistStatus', () => {
  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('reads the status once and answers from the cache while it is fresh', async () => {
    const fetchMock = serveStatus({
      joinedPlans: ['pro'],
      upgradeGateEnabled: true,
      accessGranted: true,
    });

    await expect(resolveUpgradeWaitlistStatus('user-1')).resolves.toEqual({
      joinedPlans: ['pro'],
      upgradeGateEnabled: true,
      accessGranted: true,
    });
    await resolveUpgradeWaitlistStatus('user-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the last answer when a later read fails, instead of forgetting it', async () => {
    queryClient.setQueryData(
      queryKeys.billing.upgradeWaitlist('user-1'),
      { joinedPlans: ['basic'], upgradeGateEnabled: true, accessGranted: true },
      { updatedAt: Date.now() - 120_000 },
    );
    const fetchMock = serveStatus({ error: 'rate limited' }, false);

    await expect(resolveUpgradeWaitlistStatus('user-1')).resolves.toEqual({
      joinedPlans: ['basic'],
      upgradeGateEnabled: true,
      accessGranted: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('answers null at once rather than guessing or retrying when access cannot be read', async () => {
    const fetchMock = serveStatus({ error: 'unavailable' }, false);

    await expect(resolveUpgradeWaitlistStatus('user-1')).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
