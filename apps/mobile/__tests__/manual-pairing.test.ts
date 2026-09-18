const mockSecureFetch = jest.fn();

jest.mock('@/services/secureFetch', () => ({
  secureFetch: (...args: unknown[]) => mockSecureFetch(...args),
}));

jest.mock('@/services/authSession', () => ({
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer phone-session' })),
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

  // The relay cannot tell one account from another, so the claim goes to the
  // gateway that already knows who is signed in on this phone. Claiming
  // straight from the relay is what let a scanned QR join another account.
  it('claims through the authenticated gateway, never straight from the relay', async () => {
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

    const [url, init] = mockSecureFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://agiworkforce.com/api/pair/claim');
    expect(url).not.toContain('signaling');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer phone-session');
    expect(JSON.parse(String(init.body))).toEqual({ code: 'ABCDEFGHIJKL' });
  });

  it('says whose pairing it is when the code belongs to another account', async () => {
    mockSecureFetch.mockResolvedValueOnce({ ok: false, status: 403, json: jest.fn() });
    await expect(claimManualPairingToken('ABCDEFGHIJKL')).rejects.toThrow('different account');

    mockSecureFetch.mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn() });
    await expect(claimManualPairingToken('ABCDEFGHIJKL')).rejects.toThrow('Sign in on this phone');
  });

  it('fails clearly for expired codes and malformed service responses', async () => {
    mockSecureFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: jest.fn(),
    });
    await expect(claimManualPairingToken('ABCDEFGHIJKL')).rejects.toThrow('invalid or expired');
  });

  it('refuses a code Desktop could not have shown before it reaches the relay', async () => {
    mockSecureFetch.mockClear();

    await expect(claimManualPairingToken('ABCDEFGHIJK')).rejects.toThrow(
      'Enter the 12-character pairing code shown on Desktop.',
    );
    await expect(claimManualPairingToken('ABCDEFGHIJKLM')).rejects.toThrow(
      'Enter the 12-character pairing code shown on Desktop.',
    );
    expect(mockSecureFetch).not.toHaveBeenCalled();

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
