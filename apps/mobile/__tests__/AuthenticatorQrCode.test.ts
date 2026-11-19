import { encodeQrPath } from '../src/features/settings/account-security/AuthenticatorQrCode';

const QUIET_ZONE_MODULES = 4;
const OTPAUTH = 'otpauth://totp/AGI:person@example.com?secret=FIXTURESECRET&issuer=AGI';

describe('encodeQrPath', () => {
  it('draws the address as a non-empty path with a four module quiet zone on every side', () => {
    const code = encodeQrPath(OTPAUTH);

    expect(code).not.toBeNull();
    expect(code!.path.length).toBeGreaterThan(0);
    expect(code!.size).toBeGreaterThan(QUIET_ZONE_MODULES * 2);
    expect((code!.size - QUIET_ZONE_MODULES * 2 - 17) % 4).toBe(0);
  });

  it('starts with the top-left finder pattern, seven modules wide, at the quiet zone corner', () => {
    const code = encodeQrPath(OTPAUTH);

    expect(code!.path.startsWith(`M${QUIET_ZONE_MODULES} ${QUIET_ZONE_MODULES}h7v1h-7z`)).toBe(
      true,
    );
  });

  it('keeps every segment inside the drawn size', () => {
    const code = encodeQrPath(OTPAUTH)!;
    const segments = [...code.path.matchAll(/M(\d+) (\d+)h(\d+)v1/g)];

    expect(segments.length).toBeGreaterThan(0);
    for (const [, x, y, width] of segments) {
      expect(Number(x) + Number(width)).toBeLessThanOrEqual(code.size - QUIET_ZONE_MODULES);
      expect(Number(y) + 1).toBeLessThanOrEqual(code.size - QUIET_ZONE_MODULES);
    }
  });

  it('returns null when the address is too long to encode', () => {
    expect(encodeQrPath('x'.repeat(8000))).toBeNull();
  });
});
