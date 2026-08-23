import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: { getState: jest.fn(() => ({ status: 'disconnected' })) },
}));

jest.mock('@/stores/dispatchTaskStore', () => ({
  useDispatchTaskStore: { getState: jest.fn(() => ({})) },
}));

import { extractPairingCode, isValidPairingCode } from '../services/companion';
import { parsePairingPayload } from '../services/manualPairing';

const PAIRING_CODE = 'ABCD1234WXYZ';
const PAIRING_SECRET = '9f'.repeat(32);
const PAIR_TOKEN = 'a'.repeat(64);

// Mirrors buildPairingPayload in apps/desktop/src/stores/connectionStore.ts,
// which is pinned to this exact shape by
// apps/desktop/src/stores/__tests__/connectionStore.pairingSecret.test.ts.
const DESKTOP_PAIRING_PAYLOAD = `agiw3:${PAIRING_CODE}:${PAIRING_SECRET}`;

const QR_SCANNER_PATH = join(__dirname, '../src/features/companion/components/QRScanner.tsx');

function manualEntryMaxLength(): number {
  const source = readFileSync(QR_SCANNER_PATH, 'utf8');
  const match = /maxLength=\{(\d+)\}/.exec(source);
  if (!match?.[1]) {
    throw new Error('QRScanner no longer caps the manual-entry field; update this contract test.');
  }
  return Number(match[1]);
}

describe('Desktop pairing payload against the scanner gate that admits it', () => {
  it('is accepted by the validator every camera read and manual submit is gated on', () => {
    expect(isValidPairingCode(DESKTOP_PAIRING_PAYLOAD)).toBe(true);
    expect(isValidPairingCode(`  ${DESKTOP_PAIRING_PAYLOAD}  `)).toBe(true);
  });

  it('fits the manual-entry field, so pasting the pairing link is not truncated', () => {
    expect(DESKTOP_PAIRING_PAYLOAD.length).toBeLessThanOrEqual(manualEntryMaxLength());
  });

  it('still resolves to the pairing code the desktop prints under the QR', () => {
    expect(extractPairingCode(DESKTOP_PAIRING_PAYLOAD)).toBe(PAIRING_CODE);
  });

  it('carries the out-of-band secret through to the key derivation inputs', () => {
    expect(parsePairingPayload(DESKTOP_PAIRING_PAYLOAD)).toStrictEqual({
      code: PAIRING_CODE,
      pairingSecret: PAIRING_SECRET,
      legacyPayload: false,
    });
  });

  it('is distinguishable from every payload an older Desktop can render', () => {
    expect(parsePairingPayload(`agiw:${PAIRING_CODE}:${PAIR_TOKEN}`).legacyPayload).toBe(true);
    expect(parsePairingPayload(`agiw:${PAIRING_CODE}`).legacyPayload).toBe(true);
    expect(parsePairingPayload(DESKTOP_PAIRING_PAYLOAD).legacyPayload).toBe(false);
  });
});
