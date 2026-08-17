import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useArtifactsStore } from '../stores/artifacts-store';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  userId: 'user-1' as string | null,
  getToken: vi.fn(async () => 'test-token' as string | null),
}));

const pullArtifactCloudChanges = vi.hoisted(() => vi.fn());
const pushArtifactCloudChanges = vi.hoisted(() => vi.fn(async () => null));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => authState,
}));

vi.mock('../services/artifact-cloud-sync', () => ({
  pullArtifactCloudChanges,
  pushArtifactCloudChanges,
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

  it('pushes locally created artifacts to the cloud after each pull', async () => {
    pullArtifactCloudChanges.mockResolvedValue('12');
    useArtifactsStore.getState().addArtifact({
      id: '00000000-0000-4000-8000-00000000a001',
      type: 'html',
      title: 'Local artifact',
      language: 'html',
      content: '<main>Local</main>',
      messageId: '00000000-0000-4000-8000-00000000d001',
      conversationId: '00000000-0000-4000-8000-00000000c001',
    });

    const { unmount } = renderHook(() => useArtifactCloudSync());

    await waitFor(() => expect(pushArtifactCloudChanges).toHaveBeenCalledTimes(1));
    expect(pushArtifactCloudChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        getToken: authState.getToken,
        artifacts: [
          expect.objectContaining({
            id: '00000000-0000-4000-8000-00000000a001',
            conversationId: '00000000-0000-4000-8000-00000000c001',
            content: '<main>Local</main>',
            baseVersion: '0',
          }),
        ],
      }),
    );

    act(() => unmount());
  });

  it('surfaces a failed pull as retrying instead of silently claiming sync', async () => {
    pullArtifactCloudChanges.mockRejectedValueOnce(new Error('network unavailable'));

    const { unmount } = renderHook(() => useArtifactCloudSync());

    await waitFor(() => expect(useArtifactsStore.getState().cloudSyncStatus).toBe('error'));
    expect(useArtifactsStore.getState().cloudSyncError).toBe('network unavailable');

    act(() => unmount());
  });
});
