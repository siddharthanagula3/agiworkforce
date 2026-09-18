import { MOBILE_REMOTE_SCREEN_LABEL } from '@agiworkforce/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toDataURL } from 'qrcode';
import { QRPairingCard } from './QRPairingCard';
import { useConnectionStore } from '../../stores/connectionStore';
import { useAppModeStore } from '../../stores/appModeStore';
import { useAuthStore } from '../../stores/auth';
import { accountBoundCloudFetch, getAuthHeaders } from '../../api/cloudApi';
import { copyToClipboard } from '@/utils/clipboard';

const mocks = vi.hoisted(() => {
  class MockSignalingClient {
    static instances: MockSignalingClient[] = [];

    readonly close = vi.fn();
    readonly sendSignal = vi.fn();

    constructor(readonly options: { code: string; pairToken: string }) {
      MockSignalingClient.instances.push(this);
    }
  }

  return { MockSignalingClient };
});

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,pairing-qr'),
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

vi.mock('@agiworkforce/utils', () => ({ SignalingClient: mocks.MockSignalingClient }));

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isElectronHost: false,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

vi.mock('../../api/cloudApi', () => ({
  accountBoundCloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
}));

vi.mock('../../services/dispatch', () => ({
  extractDispatchSalt: vi.fn(() => null),
  initDispatchSession: vi.fn().mockResolvedValue('key'),
  isDispatchSessionActive: vi.fn(() => true),
  resetDispatchSession: vi.fn().mockResolvedValue(undefined),
  signOutbound: vi.fn().mockResolvedValue('{}'),
  verifyInbound: vi.fn().mockResolvedValue({ ok: true, outcome: 'signed' }),
}));

describe('QRPairingCard', () => {
  const requestPairingCode = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStore.setState({
      status: 'waiting',
      pairingCode: 'ABCD1234WXYZ',
      expiresAt: null,
      qrData: `agiw3:ABCD1234WXYZ:${'9f'.repeat(32)}`,
      error: null,
      peerConnected: false,
      requestPairingCode,
      clearError: vi.fn(),
    });
  });

  it('names the real Mobile path and copies the full pairing link, not the bare code', async () => {
    render(<QRPairingCard />);

    expect(screen.getByText(/AGI Workforce/)).toHaveTextContent(
      `AGI Workforce → ${MOBILE_REMOTE_SCREEN_LABEL}`,
    );
    expect(screen.getByText('Select Scan QR Code')).toBeInTheDocument();
    expect(screen.getByText(/Pairing needs the full link/)).toBeInTheDocument();
    expect(screen.getByText('ABCD 1234 WXYZ')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing link' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(`agiw3:ABCD1234WXYZ:${'9f'.repeat(32)}`, {
        successMessage: 'Pairing link copied',
        errorMessage: 'Could not copy the pairing link',
      });
    });
    expect(screen.getByRole('button', { name: 'Pairing link copied' })).toBeInTheDocument();
  });

  it('refreshes and opens an enlarged QR without inventing another pairing target', async () => {
    render(<QRPairingCard />);

    expect(await screen.findByAltText('Pairing QR code')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Computer' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh pairing code' }));
    expect(requestPairingCode).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Enlarge pairing QR code' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scan with your phone' })).toBeInTheDocument();
    expect(screen.getByAltText('Enlarged pairing QR code')).toBeInTheDocument();
  });
});

// The store is a module singleton and the suite above replaces its actions with
// stubs, so this suite puts the real ones back before it drives the card.
const STORE_ACTIONS = {
  requestPairingCode: useConnectionStore.getState().requestPairingCode,
  clearError: useConnectionStore.getState().clearError,
};

const PAIRING_CODE = 'PAIRCODEA123';

// The phone accepts `agiw3:<code>:<64 hex>` and nothing else
// (apps/mobile/services/manualPairing.ts), so a QR the desktop draws from any
// other string pairs no phone.
const MOBILE_ACCEPTS = new RegExp(`^agiw3:${PAIRING_CODE}:[0-9a-f]{64}$`);

function pairingResponse(): Response {
  return new Response(
    JSON.stringify({
      code: PAIRING_CODE,
      expiresAt: Date.now() + 300_000,
      expiresIn: 300,
      signaling: {
        httpUrl: 'https://signal.example.test',
        wsUrl: 'wss://signal.example.test/ws',
      },
      pairTokens: { desktop: 'desktop-token', mobile: 'mobile-token' },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('QRPairingCard end to end from the card to the scannable payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.MockSignalingClient.instances.length = 0;
    useConnectionStore.setState(STORE_ACTIONS);
    useConnectionStore.getState().stopSession();
    useAppModeStore.setState({ mode: 'cloud' });
    useAuthStore.setState({
      user: { id: 'account-1', email: 'account-1@example.test' },
      isAuthenticated: true,
      isLocalDeviceAccount: false,
      accessToken: 'token-account-1',
      cloudSessionEpoch: 1,
    });
    vi.mocked(getAuthHeaders).mockResolvedValue({ Authorization: 'Bearer token-account-1' });
    vi.mocked(accountBoundCloudFetch).mockResolvedValue(pairingResponse());
  });

  async function generateFromTheCard(): Promise<string> {
    render(<QRPairingCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate pairing QR' }));

    await waitFor(() => {
      expect(useConnectionStore.getState().qrData).not.toBeNull();
    });
    return useConnectionStore.getState().qrData as string;
  }

  it('draws the QR from the payload the phone parses, not from the code alone', async () => {
    const qrData = await generateFromTheCard();

    expect(qrData).toMatch(MOBILE_ACCEPTS);
    await waitFor(() => {
      expect(toDataURL).toHaveBeenCalledWith(qrData, expect.objectContaining({ width: 512 }));
    });

    const qrImage = await screen.findByAltText('Pairing QR code');
    expect(qrImage).toHaveAttribute('src', 'data:image/png;base64,pairing-qr');
    expect(screen.getByText('PAIR CODE A123')).toBeInTheDocument();
  });

  it('gives the camera and the paste path the same payload', async () => {
    const qrData = await generateFromTheCard();
    await screen.findByAltText('Pairing QR code');

    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing link' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(qrData, expect.anything());
    });
    expect(vi.mocked(toDataURL).mock.calls[0]?.[0]).toBe(qrData);
  });

  it('keeps the relay-issued pair token out of the code on screen', async () => {
    const qrData = await generateFromTheCard();
    await screen.findByAltText('Pairing QR code');

    expect(qrData).not.toContain('mobile-token');
    expect(document.body.textContent).not.toContain('mobile-token');
    expect(document.body.textContent).not.toContain('desktop-token');
  });

  it('shows no QR to scan when the pairing request fails', async () => {
    vi.mocked(accountBoundCloudFetch).mockResolvedValue(
      new Response('nope', { status: 503, headers: { 'Content-Type': 'text/plain' } }),
    );

    render(<QRPairingCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Generate pairing QR' }));

    await waitFor(() => {
      expect(useConnectionStore.getState().status).toBe('error');
    });
    expect(screen.queryByAltText('Pairing QR code')).not.toBeInTheDocument();
    expect(screen.getByText('Generate a code to display QR')).toBeInTheDocument();
    expect(toDataURL).not.toHaveBeenCalled();
  });
});
