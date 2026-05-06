/**
 * Regression tests for HIGH-MOB-02 — `Linking.openURL` no-validation
 * (red-team finding 2026-05).
 *
 * Three screens used to call `Linking.openURL(data.url)` directly with a
 * URL returned from `/api/portal`. A MITM (mobile has no cert pinning
 * yet) or compromised backend could return:
 *
 *   - `intent://...`   — Android intent laundering for privilege escalation
 *   - `javascript:...` — XSS in some in-app browsers
 *   - `file:///...`    — local-file disclosure on Android
 *   - `tel:` / `mailto:` / `sms:` — phishing surface
 *   - `https://attacker.com/billing-clone` — credit-card phishing
 *
 * `openExternalUrl()` (lib/safeOpenURL.ts) is the chokepoint that all 3
 * screens now route through. These tests pin the allowlist contract.
 */

const mockOpenURL = jest.fn();
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockOpenURL(...args),
}));

import { isAllowedExternalUrl, openExternalUrl } from '../lib/safeOpenURL';

beforeEach(() => {
  mockOpenURL.mockReset().mockResolvedValue(undefined);
});

describe('isAllowedExternalUrl — accepts', () => {
  it.each([
    'https://agiworkforce.com/billing',
    'https://agiworkforce.com/account',
    'https://agiworkforce.com/help',
    'https://billing.agiworkforce.com/portal',
    'https://app.agiworkforce.com/x',
    'https://stripe.com/customers/cus_xyz',
    'https://billing.stripe.com/p/login/abc',
    'https://checkout.stripe.com/pay/cs_xyz',
  ])('accepts %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });
});

describe('isAllowedExternalUrl — rejects', () => {
  it.each([
    ['empty', ''],
    ['plain string', 'not a url'],
    ['undefined', undefined],
    ['null', null],
    ['number', 42],
    ['object', { url: 'https://agiworkforce.com' }],
  ])('rejects non-string-URL: %s', (_label, input) => {
    expect(isAllowedExternalUrl(input)).toBe(false);
  });

  // The exact attacker payloads from the red-team writeup
  it.each([
    ['intent://', 'intent://attacker.com#Intent;scheme=https;end'],
    ['javascript:', 'javascript:alert(1)'],
    ['file://', 'file:///etc/passwd'],
    ['tel:', 'tel:+15551234567'],
    ['mailto:', 'mailto:phish@attacker.com'],
    ['sms:', 'sms:+15551234567?body=hi'],
    ['ftp://', 'ftp://attacker.com/file'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['ws://', 'ws://attacker.com/sock'],
    ['http (must be https)', 'http://agiworkforce.com/billing'],
  ])('rejects %s scheme: %s', (_label, url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });

  it.each([
    ['phishing clone', 'https://attacker.com/billing-clone'],
    ['lookalike domain', 'https://agiworkforce.evil.com/billing'],
    ['suffix-spoof of stripe', 'https://attacker-stripe.com/checkout'],
    ['suffix-spoof of agiworkforce', 'https://attacker-agiworkforce.com/x'],
    ['prefix-spoof', 'https://stripeagiworkforce.com/x'],
  ])('rejects spoof: %s', (_label, url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });

  it('rejects URL with userinfo', () => {
    expect(isAllowedExternalUrl('https://attacker:secret@agiworkforce.com/billing')).toBe(false);
  });

  it('rejects exact "stripe.com" suffix without subdomain content', () => {
    // `.stripe.com` suffix requires the hostname to be longer than the
    // suffix itself — `.stripe.com` alone is not a valid hostname.
    expect(isAllowedExternalUrl('https://.stripe.com/x')).toBe(false);
  });
});

describe('openExternalUrl — Linking.openURL integration', () => {
  it('opens the URL when allowlisted and returns true', async () => {
    const ok = await openExternalUrl('https://agiworkforce.com/billing');
    expect(ok).toBe(true);
    expect(mockOpenURL).toHaveBeenCalledWith('https://agiworkforce.com/billing');
  });

  it('does NOT call Linking.openURL for rejected URLs', async () => {
    const ok = await openExternalUrl('intent://attacker.example/');
    expect(ok).toBe(false);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('returns false when Linking.openURL rejects', async () => {
    mockOpenURL.mockRejectedValueOnce(new Error('platform refused'));
    const ok = await openExternalUrl('https://agiworkforce.com/help');
    expect(ok).toBe(false);
  });

  it('does NOT call Linking.openURL for non-string input', async () => {
    const ok = await openExternalUrl(undefined);
    expect(ok).toBe(false);
    expect(mockOpenURL).not.toHaveBeenCalled();
  });
});
