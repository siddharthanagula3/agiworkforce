import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArtifactsStore } from '../stores/artifacts-store';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  userId: 'user-1' as string | null,
  getToken: vi.fn(async () => 'test-token' as string | null),
}));

const pullArtifactCloudChanges = vi.hoisted(() => vi.fn());

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
}));

vi.mock('../services/artifact-cloud-sync', () => ({
  pullArtifactCloudChanges,
}));

import { useArtifactCloudSync } from './use-artifact-cloud-sync';

describe('useArtifactCloudSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.isLoaded = true;
    authState.userId = 'user-1';
    useArtifactsStore.getState().clearArtifacts();
  });

  it('starts at cursor zero and exposes a successful background sync state', async () => {
    pullArtifactCloudChanges.mockResolvedValueOnce('12');

    const { unmount } = renderHook(() => useArtifactCloudSync());

    await waitFor(() => expect(pullArtifactCloudChanges).toHaveBeenCalledTimes(1));
    expect(pullArtifactCloudChanges).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: '0', getToken: authState.getToken }),
    );
    await waitFor(() => expect(useArtifactsStore.getState().cloudSyncStatus).toBe('synced'));

    unmount();
    expect(useArtifactsStore.getState().cloudSyncStatus).toBe('idle');
  });

  it('surfaces a failed pull as retrying instead of silently claiming sync', async () => {
    pullArtifactCloudChanges.mockRejectedValueOnce(new Error('network unavailable'));

    const { unmount } = renderHook(() => useArtifactCloudSync());

    await waitFor(() => expect(useArtifactsStore.getState().cloudSyncStatus).toBe('error'));
    expect(useArtifactsStore.getState().cloudSyncError).toBe('network unavailable');

    act(() => unmount());
  });
});
