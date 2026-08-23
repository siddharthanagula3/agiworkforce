const mockSecureFetch = jest.fn();

jest.mock('@/services/secureFetch', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));

import {
  claimManualPairingToken,
  normalizePairingInput,
  parsePairingPayload,
  signalingHttpBaseUrl,
} from '../services/manualPairing';

const PAIR_TOKEN = 'a'.repeat(64);
const PAIRING_SECRET = '9f'.repeat(32);

describe('Manual companion pairing', () => {
  beforeEach(() => {
    mockSecureFetch.mockReset();
  });

  it('normalizes secret payloads into the shape the QR scanner validates', () => {
    expect(normalizePairingInput(' ABCD EFGH IJKL ')).toBe('ABCDEFGHIJKL');
    expect(normalizePairingInput('ABCD-EFGH-IJKL')).toBe('ABCDEFGHIJKL');
    expect(normalizePairingInput(`agiw:ABCD EFGH IJKL:${PAIR_TOKEN}`)).toBe(
      `agiw:ABCDEFGHIJKL:${PAIR_TOKEN}`,
    );
    expect(normalizePairingInput(`agiw3:ABCD-EFGH-IJKL:${PAIRING_SECRET}`)).toBe(
      `agiw:ABCDEFGHIJKL:${PAIRING_SECRET}`,
    );
    expect(normalizePairingInput('agiw3:ABCD EFGH IJKL')).toBe('agiw:ABCDEFGHIJKL');
  });

  describe('parsePairingPayload', () => {
    it('reads the out-of-band secret out of a secret payload', () => {
      expect(parsePairingPayload(`agiw3:ABCD EFGH IJKL:${PAIRING_SECRET}`)).toStrictEqual({
        code: 'ABCDEFGHIJKL',
        pairingSecret: PAIRING_SECRET,
        legacyPayload: false,
      });
    });

    it('flags the older code-only and code+token payloads as legacy', () => {
      expect(parsePairingPayload('agiw:ABCDEFGHIJKL')).toStrictEqual({
        code: 'ABCDEFGHIJKL',
        pairingSecret: null,
        legacyPayload: true,
      });
      expect(parsePairingPayload(`agiw:ABCDEFGHIJKL:${PAIR_TOKEN}`)).toStrictEqual({
        code: 'ABCDEFGHIJKL',
        pairingSecret: null,
        legacyPayload: true,
      });
    });

    it('never reads a relay-issued pair token as the secret, whatever it looks like', () => {
      const relayChosenToken = `03${'0'.repeat(62)}`;
      expect(parsePairingPayload(`agiw:ABCDEFGHIJKL:${relayChosenToken}`)).toMatchObject({
        pairingSecret: null,
        legacyPayload: true,
      });
      expect(
        parsePairingPayload(`agiw:ABCDEFGHIJKL:${PAIR_TOKEN}:${PAIRING_SECRET}`),
      ).toMatchObject({
        pairingSecret: null,
        legacyPayload: true,
      });
    });

    it('rejects a secret payload carrying anything beyond the code and the secret', () => {
      expect(
        parsePairingPayload(`agiw3:ABCDEFGHIJKL:${PAIRING_SECRET}:${PAIR_TOKEN}`),
      ).toStrictEqual({
        code: 'ABCDEFGHIJKL',
        pairingSecret: null,
        legacyPayload: false,
      });
    });

    it('rejects a truncated secret rather than keying off part of it', () => {
      expect(
        parsePairingPayload(`agiw3:ABCDEFGHIJKL:${PAIRING_SECRET.slice(0, 13)}`),
      ).toStrictEqual({
        code: 'ABCDEFGHIJKL',
        pairingSecret: null,
        legacyPayload: false,
      });
    });

    it('returns a bare typed code with no secret and no legacy flag', () => {
      expect(parsePairingPayload('abcd-efgh-ijkl')).toStrictEqual({
        code: 'ABCDEFGHIJKL',
        pairingSecret: null,
        legacyPayload: false,
      });
    });
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
