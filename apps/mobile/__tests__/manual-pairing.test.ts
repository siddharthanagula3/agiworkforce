const mockSecureFetch = jest.fn();

jest.mock('@/services/secureFetch', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));

import {
  claimManualPairingToken,
  normalizePairingInput,
  signalingHttpBaseUrl,
} from '../services/manualPairing';

describe('Manual companion pairing', () => {
  beforeEach(() => {
    mockSecureFetch.mockReset();
  });

  it('normalizes only the human-readable separators in raw and full payload codes', () => {
    expect(normalizePairingInput(' ABCD EFGH IJKL ')).toBe('ABCDEFGHIJKL');
    expect(normalizePairingInput('ABCD-EFGH-IJKL')).toBe('ABCDEFGHIJKL');
    expect(normalizePairingInput(`agiw:ABCD EFGH IJKL:${'a'.repeat(64)}`)).toBe(
      `agiw:ABCDEFGHIJKL:${'a'.repeat(64)}`,
    );
  });

  it('derives the HTTPS claim origin from the configured WebSocket endpoint', () => {
    expect(signalingHttpBaseUrl('wss://signaling.example.com/ws')).toBe(
      'https://signaling.example.com',
    );
    expect(signalingHttpBaseUrl('ws://localhost:4000/ws')).toBe('http://localhost:4000');
  });

  it('exchanges a formatted code without sending account credentials', async () => {
    mockSecureFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn(async () => ({
        code: 'ABCDEFGHIJKL',
        pairToken: 'a'.repeat(64),
        expiresAt: Date.now() + 300_000,
        wsUrl: 'wss://signaling.agiworkforce.com',
      })),
    });

    await expect(claimManualPairingToken('ABCD EFGH IJKL')).resolves.toMatchObject({
      code: 'ABCDEFGHIJKL',
      pairToken: 'a'.repeat(64),
    });
    expect(mockSecureFetch).toHaveBeenCalledWith(
      'https://signaling.agiworkforce.com/pairings/ABCDEFGHIJKL/claim',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'mobile' }),
      },
    );
  });

  it('fails clearly for expired codes and malformed service responses', async () => {
    mockSecureFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(),
    });
    await expect(claimManualPairingToken('ABCDEFGHIJKL')).rejects.toThrow('invalid or expired');

    mockSecureFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => ({
        code: 'ABCDEFGHIJKL',
        pairToken: 'not-a-token',
        expiresAt: Date.now() + 300_000,
        wsUrl: 'wss://signaling.agiworkforce.com',
      })),
    });
    await expect(claimManualPairingToken('ABCDEFGHIJKL')).rejects.toThrow('invalid response');
  });
});
