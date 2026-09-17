import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopRuntimeError,
  IDLE_REMOTE_CONTROL_STATE,
  type DesktopRuntimeEvent,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';

const readRemoteControl = vi.fn<() => Promise<RemoteControlState>>();
const startRemoteControl = vi.fn();
const stopRemoteControl = vi.fn();
let runtimeListener: ((event: DesktopRuntimeEvent) => void) | null = null;
const bridge = {
  shell: 'electron',
  platform: 'darwin',
  appVersion: '1.8.0',
  onRuntimeEvent: (listener: (event: DesktopRuntimeEvent) => void) => {
    runtimeListener = listener;
    return () => {
      runtimeListener = null;
    };
  },
};

vi.mock('../lib/runtime-client', () => ({
  readRemoteControl,
  startRemoteControl,
  stopRemoteControl,
}));
vi.mock('../lib/host', () => ({ useDesktopHost: () => bridge }));
vi.mock('@agiworkforce/local-runtime-contract', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getHostBridge: () => bridge,
}));
vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: Record<string, string>) => ({
    ...headers,
    'x-csrf-token': 'csrf',
  })),
}));
vi.mock('qrcode', () => ({ default: { toString: vi.fn(async () => '<svg></svg>') } }));

const { RemoteControlSection } = await import('../components/RemoteControlSection');

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  runtimeListener = null;
  vi.stubGlobal('fetch', fetchMock);
  readRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Remote Control in the desktop shell', () => {
  it('creates a pairing, hands the desktop token to the shell and shows the QR code', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'ABCD1234WXYZ',
        expiresAt: 1_900_000_000_000,
        expiresIn: 300,
        signaling: { httpUrl: 'https://relay', wsUrl: 'wss://relay/ws' },
        pairTokens: { desktop: 'desktop-token', mobile: 'mobile-token' },
      }),
    });
    startRemoteControl.mockResolvedValue({
      ...IDLE_REMOTE_CONTROL_STATE,
      status: 'waiting',
      pairingCode: 'ABCD1234WXYZ',
      qrPayload: `agiw3:ABCD1234WXYZ:${'ab'.repeat(32)}`,
    });

    render(<RemoteControlSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pair a phone' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pair/initiate');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf' });
    expect(JSON.parse(String(init.body))).toEqual({ initiator: 'desktop' });
    expect(startRemoteControl).toHaveBeenCalledWith({
      code: 'ABCD1234WXYZ',
      wsUrl: 'wss://relay/ws',
      pairToken: 'desktop-token',
      expiresAt: 1_900_000_000_000,
    });
    expect(await screen.findByRole('img', { name: 'Pairing QR code' })).toBeVisible();
    expect(screen.getByLabelText('Pairing code')).toHaveTextContent('ABCD1234WXYZ');
  });

  it('follows the shell when the phone connects and lets the user disconnect it', async () => {
    stopRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE });
    render(<RemoteControlSection />);
    await screen.findByRole('button', { name: 'Pair a phone' });

    act(() => {
      runtimeListener?.({
        kind: 'remote-control-changed',
        state: {
          ...IDLE_REMOTE_CONTROL_STATE,
          status: 'connected',
          phoneName: 'Pixel',
          attachedSessions: 2,
        },
      });
    });

    expect(
      await screen.findByText('Connected to Pixel · 2 sessions open on the phone'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect phone' }));
    await waitFor(() => expect(stopRemoteControl).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Pair a phone' })).toBeVisible();
  });

  it('says why pairing did not start', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Pairing is not configured' }),
    });

    render(<RemoteControlSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pair a phone' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pairing is not configured');
    expect(startRemoteControl).not.toHaveBeenCalled();
  });

  it('renders nothing on a shell that cannot host Remote Control', async () => {
    readRemoteControl.mockRejectedValue(
      new DesktopRuntimeError({ code: 'unknown-command', message: 'no command' }),
    );
    const view = render(<RemoteControlSection />);
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  });
});
