import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DesktopRuntimeError,
  IDLE_REMOTE_CONTROL_STATE,
  type DesktopRuntimeEvent,
  type RemoteControlState,
} from '@agiworkforce/local-runtime-contract';
import { HOSTED_SETTINGS_NAV_FIELDS } from '@/features/settings/components/web-settings-navigation';

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

const { RemoteControlSection } = await import('../components/RemoteControlSection');
const { useBillingStore } = await import('@shared/stores/web-auth-store');

function signedInOn(tier: string | null) {
  useBillingStore.setState({
    subscription:
      tier === null
        ? null
        : {
            tier,
            display_name: tier,
            status: 'active',
            current_period_end: null,
            cancel_at_period_end: false,
            plan_name: tier,
          },
  } as Partial<ReturnType<typeof useBillingStore.getState>>);
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  runtimeListener = null;
  vi.stubGlobal('fetch', fetchMock);
  readRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE });
  signedInOn(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Remote Control on the Free plan', () => {
  it('offers the upgrade path instead of a pairing a Free account cannot start', async () => {
    signedInOn('free');
    render(<RemoteControlSection />);

    const upgrade = await screen.findByRole('link', { name: 'Upgrade' });
    expect(upgrade).toHaveAttribute('href', '/upgrade/basic');
    expect(screen.getByRole('status')).toHaveTextContent('Remote Control comes with paid plans.');
    expect(screen.queryByRole('button', { name: 'Pair a phone' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lets a paid account pair', async () => {
    signedInOn('basic');
    render(<RemoteControlSection />);

    expect(await screen.findByRole('button', { name: 'Pair a phone' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Upgrade' })).toBeNull();
  });

  it('shows the server refusal when the plan was not known before pairing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Your plan does not include Remote Control. Upgrade to Basic to use it.',
        code: 'plan_upgrade_required',
      }),
    });
    render(<RemoteControlSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pair a phone' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your plan does not include Remote Control.',
    );
  });
});

describe('Remote Control in the desktop shell', () => {
  it('creates a pairing, hands the desktop token to the shell and leaves the QR code to it', async () => {
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
    expect(await screen.findByText(/Scan the code in the pairing window/u)).toBeVisible();
    expect(screen.getByLabelText('Pairing code')).toHaveTextContent('ABCD1234WXYZ');
    expect(screen.queryByRole('img')).toBeNull();
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
    expect(stopRemoteControl).not.toHaveBeenCalled();
    const confirmation = await screen.findByRole('alertdialog');
    await userEvent.click(within(confirmation).getByRole('button', { name: 'Disconnect phone' }));
    await waitFor(() => expect(stopRemoteControl).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Pair a phone' })).toBeVisible();
  });

  it('says the allowed phone can reconnect once it leaves, not to scan a closed window', async () => {
    readRemoteControl.mockResolvedValue({
      ...IDLE_REMOTE_CONTROL_STATE,
      status: 'waiting',
      pairingCode: 'ABCD1234WXYZ',
      reconnectable: true,
    });

    render(<RemoteControlSection />);

    expect(await screen.findByText(/reconnects on its own/u)).toBeVisible();
    expect(screen.queryByText(/pairing window/u)).toBeNull();
    expect(screen.queryByLabelText('Pairing code')).toBeNull();
    expect(screen.getByRole('button', { name: 'Stop Remote Control' })).toBeVisible();
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

  it('refreshes the QR through a new pairing and opens it larger on request', async () => {
    readRemoteControl.mockResolvedValue({
      ...IDLE_REMOTE_CONTROL_STATE,
      status: 'waiting',
      pairingCode: 'OLDC0DE',
      qrPayload: 'agi-pair://old',
    });
    stopRemoteControl.mockResolvedValue({ ...IDLE_REMOTE_CONTROL_STATE });
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'NEWC0DE',
        expiresAt: 1_900_000_000_000,
        signaling: { wsUrl: 'wss://relay/ws' },
        pairTokens: { desktop: 'desktop-token' },
      }),
    });
    startRemoteControl.mockResolvedValue({
      ...IDLE_REMOTE_CONTROL_STATE,
      status: 'waiting',
      pairingCode: 'NEWC0DE',
      qrPayload: 'agi-pair://new',
    });

    render(<RemoteControlSection />);
    await screen.findByRole('img', { name: 'Pairing QR code' });

    await userEvent.click(screen.getByRole('button', { name: 'Enlarge pairing QR code' }));
    const enlarged = await screen.findByRole('dialog');
    expect(within(enlarged).getByRole('img', { name: 'Enlarged pairing QR code' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(screen.getByRole('button', { name: 'Refresh pairing code' }));

    await waitFor(() => expect(startRemoteControl).toHaveBeenCalled());
    expect(stopRemoteControl).toHaveBeenCalled();
    expect(stopRemoteControl.mock.invocationCallOrder[0]).toBeLessThan(
      startRemoteControl.mock.invocationCallOrder[0] ?? 0,
    );
    expect(await screen.findByLabelText('Pairing code')).toHaveTextContent('NEWC0DE');
    expect(await screen.findByRole('img', { name: 'Pairing QR code' })).toBeVisible();
  });

  it('renders nothing on a shell that cannot host Remote Control', async () => {
    readRemoteControl.mockRejectedValue(
      new DesktopRuntimeError({ code: 'unknown-command', message: 'no command' }),
    );
    const view = render(<RemoteControlSection />);
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  });
});

describe('Remote Control search index', () => {
  it('is the Capabilities region the desktop settings search lists as Remote Control', async () => {
    readRemoteControl.mockResolvedValue(IDLE_REMOTE_CONTROL_STATE);

    render(<RemoteControlSection />);

    const labels = (HOSTED_SETTINGS_NAV_FIELDS.capabilities ?? []).map((field) => field.label);
    expect(labels).toContain('Remote Control');
    expect(await screen.findByRole('region', { name: 'Remote Control' })).toBeInTheDocument();
  });
});
