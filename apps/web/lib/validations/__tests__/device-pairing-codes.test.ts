import { describe, expect, it } from 'vitest';

import { generateCliUserCode, generateQrLinkCode } from '@/lib/server/device-codes';
import {
  CLI_USER_CODE_PATTERN,
  CliUserCodeSchema,
  QR_LINK_CODE_PATTERN,
  QrLinkCodeSchema,
  devicePairingFlow,
} from '@/lib/validations/device';

describe('device pairing code formats', () => {
  it('classifies each generator output as exactly one flow', () => {
    for (let i = 0; i < 500; i++) {
      const cli = generateCliUserCode();
      const qr = generateQrLinkCode();

      expect(devicePairingFlow(cli)).toBe('cli');
      expect(devicePairingFlow(qr)).toBe('qr');

      expect(CLI_USER_CODE_PATTERN.test(cli)).toBe(true);
      expect(QR_LINK_CODE_PATTERN.test(cli)).toBe(false);
      expect(QR_LINK_CODE_PATTERN.test(qr)).toBe(true);
      expect(CLI_USER_CODE_PATTERN.test(qr)).toBe(false);
    }
  });

  it('accepts each generator output only in its own schema', () => {
    const cli = generateCliUserCode();
    const qr = generateQrLinkCode();

    expect(CliUserCodeSchema.safeParse(cli).success).toBe(true);
    expect(QrLinkCodeSchema.safeParse(cli).success).toBe(false);
    expect(QrLinkCodeSchema.safeParse(qr).success).toBe(true);
    expect(CliUserCodeSchema.safeParse(qr).success).toBe(false);
  });

  it('returns null for codes belonging to neither flow', () => {
    expect(devicePairingFlow('ABC123DEF456')).toBeNull();
    expect(devicePairingFlow('not-a-code')).toBeNull();
    expect(devicePairingFlow('')).toBeNull();
    expect(devicePairingFlow(null)).toBeNull();
    expect(devicePairingFlow(undefined)).toBeNull();
  });

  it('normalizes case and surrounding whitespace before classifying', () => {
    expect(devicePairingFlow('  abcd-2345 ')).toBe('cli');
    expect(devicePairingFlow(' a1b2c3d4e5f60718 ')).toBe('qr');
  });
});
