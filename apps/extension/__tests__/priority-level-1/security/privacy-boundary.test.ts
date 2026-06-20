/**
 * L1 Security — Privacy / Trust Boundaries (extension surface).
 *
 * The Chrome extension is a v1 LOCAL-ONLY surface: it has no LLM brain and no
 * database. Its trust boundary is the network egress allowlist. "No silent
 * cloud routing" (CLAUDE.md / AGENTS.md) is enforced here by two real
 * validators in src/background/policy.ts:
 *
 *   - validateBridgeUrl   — the desktop bridge must be loopback-only.
 *   - validateGatewayUrl  — user-authed gateway calls must hit an exact
 *                           allowlisted https origin (no attacker subdomains).
 *
 * These tests import the production validators directly (never mirror them —
 * the mirror pattern is the H-02 bug class). They assert the boundary cannot
 * be widened by hostile or malformed input.
 */

import { describe, expect, test } from 'vitest';
import {
  ALLOWED_BRIDGE_HOSTS,
  DEFAULT_AGI_BRIDGE_URL,
  GATEWAY_URL_ALLOWLIST_EXACT,
  validateBridgeUrl,
  validateGatewayUrl,
} from '../../../src/background/policy';

describe('L1 Security - Privacy Boundaries (bridge egress)', () => {
  test('HAPPY_PATH: loopback bridge URLs are accepted and normalized', () => {
    expect(validateBridgeUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(validateBridgeUrl('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    // ws/wss collapse to http/https so the WebSocket form maps to the allowlist.
    expect(validateBridgeUrl('ws://localhost:8787')).toBe('http://localhost:8787');
    expect(ALLOWED_BRIDGE_HOSTS.has(new URL(DEFAULT_AGI_BRIDGE_URL).hostname)).toBe(true);
  });

  test('SECURITY: non-loopback bridge host is rejected (no LAN/cloud routing)', () => {
    expect(validateBridgeUrl('http://evil.example.com:8787')).toBeNull();
    expect(validateBridgeUrl('http://192.168.1.10:8787')).toBeNull();
    // 0.0.0.0 was removed (SEV-CHEXT-09): on Linux it routes to LAN services.
    expect(validateBridgeUrl('http://0.0.0.0:8787')).toBeNull();
    expect(ALLOWED_BRIDGE_HOSTS.has('0.0.0.0')).toBe(false);
  });

  test('SECURITY: non-http(s) bridge schemes and malformed URLs are rejected', () => {
    expect(validateBridgeUrl('javascript:alert(1)')).toBeNull();
    expect(validateBridgeUrl('file:///etc/passwd')).toBeNull();
    expect(validateBridgeUrl('not a url')).toBeNull();
    expect(validateBridgeUrl('')).toBeNull();
  });
});

describe('L1 Security - Privacy Boundaries (gateway egress)', () => {
  test('SECURITY: only exact-allowlisted https gateway origins pass', () => {
    expect(validateGatewayUrl('https://api.agiworkforce.com')).toBe('https://api.agiworkforce.com');
    // Attacker-controlled subdomain must NOT pass (M-02: no open-subdomain rule).
    expect(validateGatewayUrl('https://evil.agiworkforce.com')).toBeNull();
    expect(validateGatewayUrl('https://api.agiworkforce.com.attacker.com')).toBeNull();
    // http is rejected — a JWT would travel in plaintext.
    expect(validateGatewayUrl('http://api.agiworkforce.com')).toBeNull();
    // Every entry in the published allowlist is https and round-trips.
    for (const origin of GATEWAY_URL_ALLOWLIST_EXACT) {
      expect(origin.startsWith('https://')).toBe(true);
      expect(validateGatewayUrl(origin)).toBe(origin);
    }
  });
});
