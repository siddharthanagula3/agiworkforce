import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  completeLiveArtifactPrompt: vi.fn(),
  describeLiveArtifactConnectors: vi.fn(),
  readLiveArtifact: vi.fn(),
  removeLiveArtifact: vi.fn(),
  saveLiveArtifact: vi.fn(),
  setLiveArtifactRefreshPolicy: vi.fn(),
}));

vi.mock('../live-artifact-client', () => client);

import {
  LIVE_MANUAL_REFRESH,
  LIVE_STORAGE_UNAVAILABLE,
  useLiveArtifactRuntime,
} from '../useLiveArtifactRuntime';
import type { LiveArtifact } from '../live-artifact-contract';

const ARTIFACT_ID = 'c0ffee00-0000-4000-8000-000000000001';

function liveArtifact(overrides: Partial<LiveArtifact> = {}): LiveArtifact {
  return {
    artifactId: ARTIFACT_ID,
    conversationId: 'conversation-1',
    title: 'Weekly growth',
    type: 'html',
    connectors: ['google_drive'],
    allowedTools: ['google_drive__search'],
    refreshPolicy: 'on_open',
    lastRefreshedAt: null,
    readiness: 'ready',
    missingConnectors: [],
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  client.readLiveArtifact.mockResolvedValue(null);
  client.completeLiveArtifactPrompt.mockResolvedValue('fresh numbers');
  client.describeLiveArtifactConnectors.mockResolvedValue([]);
});

describe('useLiveArtifactRuntime', () => {
  it('offers no runtime when the artifact may not use one', () => {
    const { result } = renderHook(() => useLiveArtifactRuntime(null));
    expect(result.current.host).toBeUndefined();
    expect(client.readLiveArtifact).not.toHaveBeenCalled();
  });

  it('keeps saved data to published apps', async () => {
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    await expect(
      result.current.host!.handle({ op: 'storage.get', key: 'k', shared: false }),
    ).rejects.toThrow(LIVE_STORAGE_UNAVAILABLE);
  });

  it('asks once before an unbound artifact uses AI, then runs without asking again', async () => {
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    const first = result.current.host!.handle({ op: 'complete', prompt: 'hi', connectors: [] });
    await waitFor(() => expect(result.current.asking?.connectorIds).toEqual([]));
    expect(client.completeLiveArtifactPrompt).not.toHaveBeenCalled();
    act(() => result.current.answer({ allowed: true, allowedTools: [] }));
    await expect(first).resolves.toBe('fresh numbers');
    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'again', connectors: [] }),
    ).resolves.toBe('fresh numbers');
    expect(client.saveLiveArtifact).not.toHaveBeenCalled();
    expect(result.current.asking).toBeNull();
  });

  it('sends nothing when the owner declines', async () => {
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    const run = result.current.host!.handle({
      op: 'complete',
      prompt: 'hi',
      connectors: ['google_drive'],
    });
    await waitFor(() => expect(result.current.asking).not.toBeNull());
    act(() => result.current.answer({ allowed: false, allowedTools: [] }));
    await expect(run).rejects.toThrow('You chose not to let this app use your connected apps.');
    expect(client.saveLiveArtifact).not.toHaveBeenCalled();
    expect(client.completeLiveArtifactPrompt).not.toHaveBeenCalled();
  });

  it('saves the binding the owner allows, then queries the connected app', async () => {
    const saved = liveArtifact();
    client.saveLiveArtifact.mockResolvedValue(saved);
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    const run = result.current.host!.handle({
      op: 'complete',
      prompt: 'Signups this week',
      connectors: ['google_drive'],
    });
    await waitFor(() => expect(result.current.asking?.connectorIds).toEqual(['google_drive']));
    expect(client.describeLiveArtifactConnectors).toHaveBeenCalledWith(
      ARTIFACT_ID,
      ['google_drive'],
      expect.any(AbortSignal),
    );
    act(() => result.current.answer({ allowed: true, allowedTools: ['google_drive__search'] }));
    await expect(run).resolves.toBe('fresh numbers');
    expect(client.saveLiveArtifact).toHaveBeenCalledWith(ARTIFACT_ID, {
      connectors: ['google_drive'],
      allowedTools: ['google_drive__search'],
    });
    expect(client.completeLiveArtifactPrompt).toHaveBeenCalledWith(
      ARTIFACT_ID,
      { prompt: 'Signups this week', connectors: ['google_drive'] },
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(result.current.binding?.lastRefreshedAt).not.toBeNull());
  });

  it('refreshes a bound artifact on open without asking', async () => {
    client.readLiveArtifact.mockResolvedValue(liveArtifact());
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'q', connectors: ['google_drive'] }),
    ).resolves.toBe('fresh numbers');
    expect(result.current.asking).toBeNull();
  });

  it('waits for Refresh data when the owner chose to refresh only on request', async () => {
    client.readLiveArtifact.mockResolvedValue(liveArtifact({ refreshPolicy: 'manual' }));
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'q', connectors: ['google_drive'] }),
    ).rejects.toThrow(LIVE_MANUAL_REFRESH);
    expect(client.completeLiveArtifactPrompt).not.toHaveBeenCalled();
    const before = result.current.refreshKey;
    act(() => result.current.refresh());
    expect(result.current.refreshKey).toBe(before + 1);
    await expect(
      result.current.host!.handle({ op: 'complete', prompt: 'q', connectors: ['google_drive'] }),
    ).resolves.toBe('fresh numbers');
  });

  it('keeps one host for the artifact so the frame is not reloaded by state changes', async () => {
    client.readLiveArtifact.mockResolvedValue(liveArtifact());
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    const host = result.current.host;
    await waitFor(() => expect(result.current.binding).not.toBeNull());
    expect(result.current.host).toBe(host);
  });

  it('stops live updates by removing the binding', async () => {
    client.readLiveArtifact.mockResolvedValue(liveArtifact());
    client.removeLiveArtifact.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLiveArtifactRuntime(ARTIFACT_ID));
    await waitFor(() => expect(result.current.binding).not.toBeNull());
    await act(() => result.current.stopLive());
    expect(client.removeLiveArtifact).toHaveBeenCalledWith(ARTIFACT_ID);
    expect(result.current.binding).toBeNull();
  });
});
