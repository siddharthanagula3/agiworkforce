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
      qrData: 'agi://pair/ABCD1234WXYZ',
      error: null,
      peerConnected: false,
      requestPairingCode,
      clearError: vi.fn(),
    });
  });

  it('names the real Mobile path and supports manual-code copy', async () => {
    render(<QRPairingCard />);

    expect(screen.getByText(/AGI Workforce/)).toHaveTextContent(
      'AGI Workforce → Desktop Companion',
    );
    expect(screen.getByText('Select Scan QR Code')).toBeInTheDocument();
    expect(
      screen.getByText(
        'On your phone, choose Enter code manually and type this 12-character code.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('ABCD 1234 WXYZ')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy pairing code' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith('ABCD1234WXYZ', {
        successMessage: 'Pairing code copied',
        errorMessage: 'Could not copy the pairing code',
      });
    });
    expect(screen.getByRole('button', { name: 'Pairing code copied' })).toBeInTheDocument();
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
