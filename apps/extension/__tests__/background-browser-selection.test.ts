import { describe, expect, it } from 'vitest';
import type { SitePolicyInput } from '@agiworkforce/types';
import {
  EXTENSION_BROWSER_PRESENCE,
  evaluateCrossOriginTransfer,
  scrubTelemetryText,
  selectExtensionBrowser,
  telemetryOrigin,
  TELEMETRY_TEXT_MAX_CHARS,
} from '../src/background/policy';

describe('browser selection inside the extension', () => {
  it('drives only the Chrome it is installed in', () => {
    expect([...EXTENSION_BROWSER_PRESENCE]).toEqual(['user-chrome']);
    const selection = selectExtensionBrowser();
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.kind).toBe('user-chrome');
    expect(selection.viaFallback).toBe(false);
  });

  it('refuses a cloud request instead of running it in the signed-in profile', () => {
    const selection = selectExtensionBrowser('cloud');
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.declined.find((entry) => entry.kind === 'user-chrome')?.reason).toBe(
      'would-broaden-access',
    );
  });

  it('refuses a built-in request rather than broadening into the user profile', () => {
    const selection = selectExtensionBrowser('built-in');
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.reason).toContain('built-in browser');
  });

  it('refuses when workspace policy withholds the only browser it has', () => {
    const selection = selectExtensionBrowser(null, ['cloud']);
    expect(selection.ok).toBe(false);
    if (selection.ok) return;
    expect(selection.declined.find((entry) => entry.kind === 'user-chrome')?.reason).toBe(
      'not-allowed-by-policy',
    );
  });
});

const POLICY: SitePolicyInput = {
  admin: null,
  userAllowlist: ['https://shop.example.com', 'https://mail.example.com'],
};

describe('cross-origin data transfer is policy aware', () => {
  it('allows a move between two approved origins', () => {
    const decision = evaluateCrossOriginTransfer(POLICY, {
      from: 'https://shop.example.com/cart',
      to: 'https://mail.example.com/compose',
    });
    expect(decision.allowed).toBe(true);
    expect(decision.sameOrigin).toBe(false);
  });

  it('refuses a move to an origin the policy never approved', () => {
    const decision = evaluateCrossOriginTransfer(POLICY, {
      from: 'https://shop.example.com/cart',
      to: 'https://exfil.example.net/collect',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('exfil.example.net');
  });

  it('refuses a move out of an origin the policy never approved', () => {
    const decision = evaluateCrossOriginTransfer(POLICY, {
      from: 'https://bank.example.net/statements',
      to: 'https://mail.example.com/compose',
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('bank.example.net');
  });

  it('refuses when an admin policy cannot be read', () => {
    const decision = evaluateCrossOriginTransfer(
      { admin: 'unavailable', userAllowlist: POLICY.userAllowlist },
      { from: 'https://shop.example.com/cart', to: 'https://shop.example.com/checkout' },
    );
    expect(decision.allowed).toBe(false);
    expect(decision.sameOrigin).toBe(true);
  });

  it('refuses anything that is not two web pages', () => {
    expect(
      evaluateCrossOriginTransfer(POLICY, {
        from: 'https://shop.example.com/cart',
        to: 'file:///Users/someone/notes.txt',
      }).allowed,
    ).toBe(false);
  });
});

describe('telemetry never carries page content', () => {
  it('redacts secrets and strips invisible characters before anything is shipped', () => {
    const scrubbed = scrubTelemetryText('token sk-abcdefghijklmnopqrstuvwx​ yes');
    expect(scrubbed).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(scrubbed).not.toContain('​');
  });

  it('caps the length so a page body cannot ride along', () => {
    expect(scrubTelemetryText('a'.repeat(5_000))).toHaveLength(TELEMETRY_TEXT_MAX_CHARS);
    expect(scrubTelemetryText(undefined)).toBe('');
  });

  it('reduces a page URL to its origin so path and query stay out', () => {
    expect(telemetryOrigin('https://shop.example.com/orders/8123?token=abc')).toBe(
      'https://shop.example.com',
    );
    expect(telemetryOrigin('file:///etc/passwd')).toBeNull();
  });
});
