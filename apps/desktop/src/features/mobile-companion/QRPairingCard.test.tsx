import { MOBILE_REMOTE_SCREEN_LABEL } from '@agiworkforce/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QRPairingCard } from './QRPairingCard';
import { useConnectionStore } from '../../stores/connectionStore';
import { copyToClipboard } from '@/utils/clipboard';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,pairing-qr'),
}));

vi.mock('@/utils/clipboard', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
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
