import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  CLI_USER_CODE_PATTERN,
  DeviceLinkRequestSchema,
  DevicePollRequestSchema,
  QR_LINK_CODE_PATTERN,
  devicePairingFlow,
} from '@/lib/validations/device';
import { generateCliUserCode, generateQrLinkCode } from '@/lib/server/device-codes';

describe('who chooses the identity a pairing is bound to', () => {
  it('refuses a caller that names the device id it wants to be issued', () => {
    const parsed = DeviceLinkRequestSchema.safeParse({
      device_name: 'Work laptop',
      device_type: 'desktop',
      device_id: 'attacker-chosen-id',
    });

    expect(
      parsed.success,
      'a caller choosing its own device id can hand that value to someone else, have them approve it, and poll for the token it mints',
    ).toBe(false);
  });

  it('refuses a caller that names its own fingerprint', () => {
    const parsed = DeviceLinkRequestSchema.safeParse({
      device_name: 'Work laptop',
      device_fingerprint: 'deadbeef',
    });

    expect(parsed.success).toBe(false);
  });

  it('accepts the two things a caller may say about itself, and nothing else', () => {
    expect(DeviceLinkRequestSchema.safeParse({}).success).toBe(true);
    expect(
      DeviceLinkRequestSchema.safeParse({ device_name: 'Work laptop', device_type: 'cli' }).success,
    ).toBe(true);
  });

  it('will not take a fingerprint made of anything but hex, at any length it likes', () => {
    expect(
      DevicePollRequestSchema.safeParse({ device_id: 'a', device_fingerprint: 'zz' }).success,
    ).toBe(false);
    expect(
      DevicePollRequestSchema.safeParse({ device_id: 'a', device_fingerprint: 'ab'.repeat(200) })
        .success,
    ).toBe(false);
  });
});

describe('the code format is the only thing telling the two pairing flows apart', () => {
  it('keeps the two formats disjoint over the codes they really produce', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const cli = generateCliUserCode();
      const qr = generateQrLinkCode();

      expect(devicePairingFlow(cli)).toBe('cli');
      expect(devicePairingFlow(qr)).toBe('qr');
      expect(QR_LINK_CODE_PATTERN.test(cli)).toBe(false);
      expect(CLI_USER_CODE_PATTERN.test(qr)).toBe(false);
    }
  });

  it('answers nothing for a code neither flow could have issued', () => {
    for (const value of ['', 'ABCD-234', 'abcd-2345!', 'ABCD', null, 42, {}]) {
      expect(devicePairingFlow(value)).toBeNull();
    }
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
