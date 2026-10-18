import { describe, expect, it } from 'vitest';

import { generateCliUserCode } from '@/lib/server/device-codes';
import {
  CLI_USER_CODE_PATTERN,
  CliUserCodeSchema,
  QR_LINK_CODE_PATTERN,
  devicePairingFlow,
} from '@/lib/validations/device';

const QR_LINK_CODE = 'A1B2C3D4E5F60718';

describe('device pairing code formats', () => {
  it('classifies every generated user code as the CLI flow only', () => {
    for (let i = 0; i < 500; i++) {
      const cli = generateCliUserCode();

      expect(devicePairingFlow(cli)).toBe('cli');
      expect(CLI_USER_CODE_PATTERN.test(cli)).toBe(true);
      expect(QR_LINK_CODE_PATTERN.test(cli)).toBe(false);
    }
  });

  it('accepts a generated user code and refuses a QR-link code in the CLI schema', () => {
    expect(CliUserCodeSchema.safeParse(generateCliUserCode()).success).toBe(true);
    expect(CliUserCodeSchema.safeParse(QR_LINK_CODE).success).toBe(false);
  });

  it('still tells a stored QR-link row apart from a CLI row', () => {
    expect(devicePairingFlow(QR_LINK_CODE)).toBe('qr');
    expect(CLI_USER_CODE_PATTERN.test(QR_LINK_CODE)).toBe(false);
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

  it('draws a user code only from characters a person will not mistype between screens', () => {
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 200; attempt += 1) {
      for (const character of generateCliUserCode().replace('-', '')) seen.add(character);
    }

    expect(seen.size).toBeGreaterThan(20);
    for (const confusable of ['0', 'O', '1', 'I', 'L']) {
      expect([...seen], `a code can contain ${confusable}`).not.toContain(confusable);
    }
  });

  it('never repeats a code across a run, which a counter or a weak source would', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCliUserCode()));

    expect(codes.size).toBe(500);
  });
});
