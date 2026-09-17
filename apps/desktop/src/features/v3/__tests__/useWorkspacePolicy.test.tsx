import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_WORKSPACE_CONTROLS } from '@agiworkforce/types';

const mocks = vi.hoisted(() => ({
  cloudFetch: vi.fn(),
}));

vi.mock('@/api/cloudApi', () => ({
  CLOUD_API_BASE_URL: 'https://cloud.test',
  cloudFetch: mocks.cloudFetch,
  getAuthHeaders: vi.fn(async () => ({ Authorization: 'Bearer token' })),
}));

vi.mock('../../../stores/auth', () => ({
  selectHasCloudAccountSession: () => true,
  selectUser: () => ({ id: 'account-1' }),
  useUnifiedAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector({}),
}));

import { filterNavByWorkspaceFeatures, useDisabledWorkspaceFeatures } from '../useWorkspacePolicy';

function policy(revision: number, featureAccess: Record<string, boolean>) {
  return new Response(
    JSON.stringify({
      organizationId: '11111111-1111-4111-8111-111111111111',
      governed: true,
      revision,
      controls: {
        ...DEFAULT_WORKSPACE_CONTROLS,
        featureAccess: { ...DEFAULT_WORKSPACE_CONTROLS.featureAccess, ...featureAccess },
        appliedOverrideIds: [],
      },
    }),
    { status: 200, headers: { ETag: `"r${revision}"` } },
  );
}

afterEach(() => {
  localStorage.clear();
  mocks.cloudFetch.mockReset();
});

describe('desktop workspace policy', () => {
  it('drops rail entries for features the workspace turned off', () => {
    const items = [{ id: 'tasks' }, { id: 'scheduled' }, { id: 'customize' }, { id: 'code' }];
    expect(filterNavByWorkspaceFeatures(items, ['work', 'code']).map((item) => item.id)).toEqual([
      'scheduled',
      'customize',
    ]);
  });

  it('applies a policy change on focus without restarting the app', async () => {
    mocks.cloudFetch
      .mockResolvedValueOnce(policy(1, {}))
      .mockResolvedValueOnce(policy(2, { schedules: false }));

    const { result } = renderHook(() => useDisabledWorkspaceFeatures());
    await waitFor(() => expect(mocks.cloudFetch).toHaveBeenCalledTimes(1));
    expect(result.current).toEqual([]);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current).toEqual(['schedules']));
    expect(mocks.cloudFetch.mock.calls[0]?.[0]).toBe(
      'https://cloud.test/api/settings/organization/policy/effective',
    );
    expect(mocks.cloudFetch.mock.calls[1]?.[1]?.headers).toMatchObject({ 'If-None-Match': '"r1"' });
  });
});
