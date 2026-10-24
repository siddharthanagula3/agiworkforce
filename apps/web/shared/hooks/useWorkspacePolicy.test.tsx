import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_CONTROLS } from '@agiworkforce/types';

vi.mock('@/lib/identity/client', () => ({
  useCurrentUser: () => ({ isLoaded: true, isSignedIn: true, user: { id: 'user-1' } }),
}));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'token') }));

import {
  __resetWorkspacePolicyPollersForTest,
  useDisabledWorkspaceFeatures,
} from './use-workspace-policy';

const ORG = '11111111-1111-4111-8111-111111111111';

function body(revision: number, featureAccess: Record<string, boolean>) {
  return {
    organizationId: ORG,
    governed: true,
    revision,
    controls: {
      ...DEFAULT_WORKSPACE_CONTROLS,
      featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, ...featureAccess },
      appliedOverrideIds: [],
    },
  };
}

function policy(revision: number, featureAccess: Record<string, boolean>) {
  return new Response(JSON.stringify(body(revision, featureAccess)), {
    status: 200,
    headers: { ETag: `"r${revision}"` },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  __resetWorkspacePolicyPollersForTest();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useDisabledWorkspaceFeatures', () => {
  it('applies an admin change when the tab regains focus, without a reload', async () => {
    fetchMock
      .mockResolvedValueOnce(policy(1, {}))
      .mockResolvedValueOnce(policy(2, { code: false, work: false }));

    const { result } = renderHook(() => useDisabledWorkspaceFeatures());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).toEqual(['fast_mode']));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current).toEqual(['work', 'code', 'fast_mode']));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/settings/organization/policy/effective');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer token', 'If-None-Match': '"r1"' });
  });

  it('removes the opt-in restriction only after the admin enables fast mode', async () => {
    fetchMock
      .mockResolvedValueOnce(policy(1, {}))
      .mockResolvedValueOnce(policy(2, { fast_mode: true }));

    const { result } = renderHook(() => useDisabledWorkspaceFeatures());
    await waitFor(() => expect(result.current).toEqual(['fast_mode']));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current).toEqual([]));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('starts from the policy cached for this account while the network is away', async () => {
    localStorage.setItem(
      'agi.workspace-policy.user-1',
      JSON.stringify({ etag: '"r7"', policy: body(7, { schedules: false }) }),
    );
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { result } = renderHook(() => useDisabledWorkspaceFeatures());

    expect(result.current).toEqual(['schedules', 'fast_mode']);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current).toEqual(['schedules', 'fast_mode']);
  });
});
