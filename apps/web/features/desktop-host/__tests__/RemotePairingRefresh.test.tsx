import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IDLE_REMOTE_CONTROL_STATE,
  type DesktopRuntimeEvent,
  type HostBridge,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';

const readRemoteControl = vi.fn<() => Promise<RemoteControlState>>();
const startRemoteControl = vi.fn();
const stopRemoteControl = vi.fn();
vi.mock('../lib/runtime-client', () => ({
  readRemoteControl,
  startRemoteControl,
  stopRemoteControl,
}));
const push = vi.fn();
const toastError = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => headers),
}));

const { useRemotePairingRefresh } = await import('../hooks/use-remote-pairing-refresh');

let listener: ((event: DesktopRuntimeEvent) => void) | null = null;
const host = {
  onRuntimeEvent: (callback: (event: DesktopRuntimeEvent) => void) => {
    listener = callback;
    return () => {
      listener = null;
    };
  },
} as unknown as HostBridge;

function Mount() {
  useRemotePairingRefresh(host);
  return null;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  listener = null;
  vi.stubGlobal('fetch', fetchMock);
  stopRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE });
  startRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE, status: 'waiting' });
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      code: 'NEWC0DE',
      expiresAt: 1_900_000_000_000,
      signaling: { wsUrl: 'wss://relay/ws' },
      pairTokens: { desktop: 'desktop-token' },
    }),
  });
});

describe('refreshing the pairing code from anywhere in the desktop app', () => {
  it('stops the waiting pairing and starts a new one', async () => {
    readRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE, status: 'waiting' });
    render(<Mount />);

    act(() => listener?.({ kind: 'remote-control-refresh-requested' }));

    await waitFor(() => expect(startRemoteControl).toHaveBeenCalledTimes(1));
    expect(stopRemoteControl.mock.invocationCallOrder[0]).toBeLessThan(
      startRemoteControl.mock.invocationCallOrder[0] ?? 0,
    );
    expect(startRemoteControl).toHaveBeenCalledWith({
      code: 'NEWC0DE',
      wsUrl: 'wss://relay/ws',
      pairToken: 'desktop-token',
      expiresAt: 1_900_000_000_000,
    });
  });

  it('does nothing when no pairing is waiting', async () => {
    readRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE, status: 'connected' });
    render(<Mount />);

    act(() => listener?.({ kind: 'remote-control-refresh-requested' }));

    await waitFor(() => expect(readRemoteControl).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stopRemoteControl).not.toHaveBeenCalled();
  });

  it('says so, with a way to the Remote Control settings, when the refresh fails', async () => {
    readRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE, status: 'waiting' });
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'nope' }) });
    render(<Mount />);

    act(() => listener?.({ kind: 'remote-control-refresh-requested' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(startRemoteControl).not.toHaveBeenCalled();
    const [message, options] = toastError.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    expect(message).toContain('Open Settings > Remote Control');
    options.action.onClick();
    expect(push).toHaveBeenCalledWith('/settings/capabilities');
  });

  it('stays quiet when there was nothing to refresh', async () => {
    readRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE, status: 'idle' });
    render(<Mount />);

    act(() => listener?.({ kind: 'remote-control-refresh-requested' }));

    await waitFor(() => expect(readRemoteControl).toHaveBeenCalled());
    expect(toastError).not.toHaveBeenCalled();
  });
});
