const mockOpenURL = jest.fn();
jest.mock('expo-linking', () => ({
  openURL: (...args: unknown[]) => mockOpenURL(...args),
}));

import { isAllowedExternalUrl, openExternalUrl } from '../lib/safeOpenURL';

beforeEach(() => {
  mockOpenURL.mockReset().mockResolvedValue(undefined);
});

describe('isAllowedExternalUrl, accepts', () => {
  it.each([
    'https://agiworkforce.com/billing',
    'https://agiworkforce.com/account',
    'https://agiworkforce.com/help',
    'https://billing.agiworkforce.com/portal',
    'https://app.agiworkforce.com/x',
    'https://stripe.com/customers/cus_xyz',
    'https://billing.stripe.com/p/login/abc',
    'https://checkout.stripe.com/pay/cs_xyz',
    'https://apps.apple.com/account/subscriptions',
    'https://play.google.com/store/account/subscriptions',
  ])('accepts %s', (url) => {
    expect(isAllowedExternalUrl(url)).toBe(true);
  });
});

describe('isAllowedExternalUrl, rejects', () => {
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
    ['Apple sibling host', 'https://developer.apple.com/account/subscriptions'],
    ['Google sibling host', 'https://accounts.google.com/store/account/subscriptions'],
    ['prefix-spoof', 'https://stripeagiworkforce.com/x'],
  ])('rejects spoof: %s', (_label, url) => {
    expect(isAllowedExternalUrl(url)).toBe(false);
  });

  it('rejects URL with userinfo', () => {
    expect(isAllowedExternalUrl('https://attacker:secret@agiworkforce.com/billing')).toBe(false);
  });

  it('rejects exact "stripe.com" suffix without subdomain content', () => {
    expect(isAllowedExternalUrl('https://.stripe.com/x')).toBe(false);
  });
});

describe('openExternalUrl, Linking.openURL integration', () => {
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
