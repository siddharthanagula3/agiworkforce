/**
 * Tests for the bridge URL domain validation.
 *
 * SECURITY (H-02 audit 2026-05-19): this file previously **mirrored** the
 * validator from background.ts, which let the test allowlist `0.0.0.0`
 * while the production code rejected it. The test passed against the
 * wrong list. We now import `validateBridgeUrl` / `ALLOWED_BRIDGE_HOSTS`
 * directly from `src/background/policy.ts` so any future divergence
 * fails this test immediately.
 *
 * Do NOT replace these imports with a mirrored function. The mirror
 * pattern is the bug.
 */

import { describe, expect, it } from 'vitest';
import { ALLOWED_BRIDGE_HOSTS, validateBridgeUrl } from '../src/background/policy';

// ── localhost URLs ──────────────────────────────────────────────────────────

describe('validateBridgeUrl — localhost URLs pass validation', () => {
  it('accepts http://localhost', () => {
    expect(validateBridgeUrl('http://localhost')).toBe('http://localhost');
  });

  it('accepts http://localhost:8787', () => {
    expect(validateBridgeUrl('http://localhost:8787')).toBe('http://localhost:8787');
  });

  it('accepts https://localhost:443', () => {
    expect(validateBridgeUrl('https://localhost:443')).toBe('https://localhost:443');
  });
});

// ── 127.0.0.1 URLs ─────────────────────────────────────────────────────────

describe('validateBridgeUrl — 127.0.0.1 URLs pass validation', () => {
  it('accepts http://127.0.0.1', () => {
    expect(validateBridgeUrl('http://127.0.0.1')).toBe('http://127.0.0.1');
  });

  it('accepts http://127.0.0.1:8787', () => {
    expect(validateBridgeUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
  });
});

// ── [::1] IPv6 loopback ─────────────────────────────────────────────────────

describe('validateBridgeUrl — [::1] URLs pass validation (H-03)', () => {
  it('accepts http://[::1]', () => {
    expect(validateBridgeUrl('http://[::1]')).toBe('http://[::1]');
  });

  it('accepts http://[::1]:8787', () => {
    expect(validateBridgeUrl('http://[::1]:8787')).toBe('http://[::1]:8787');
  });

  it('ALLOWED_BRIDGE_HOSTS uses bracketed form (matches new URL().hostname)', () => {
    // This is what makes H-03 stay fixed — `new URL(...).hostname` returns
    // `[::1]` with brackets, and the Set must compare against the same form.
    expect(ALLOWED_BRIDGE_HOSTS.has('[::1]')).toBe(true);
    expect(ALLOWED_BRIDGE_HOSTS.has('::1')).toBe(false);
  });
});

// ── 0.0.0.0 is rejected (SEV-CHEXT-09 / H-02) ───────────────────────────────

describe('validateBridgeUrl — 0.0.0.0 is REJECTED', () => {
  it('rejects http://0.0.0.0 (Linux LAN-routes; defeats loopback contract)', () => {
    expect(validateBridgeUrl('http://0.0.0.0')).toBeNull();
  });

  it('rejects http://0.0.0.0:9000', () => {
    expect(validateBridgeUrl('http://0.0.0.0:9000')).toBeNull();
  });

  it('ALLOWED_BRIDGE_HOSTS does not contain 0.0.0.0', () => {
    expect(ALLOWED_BRIDGE_HOSTS.has('0.0.0.0')).toBe(false);
  });
});

// ── Remote URLs are rejected ────────────────────────────────────────────────

describe('validateBridgeUrl — remote URLs are rejected', () => {
  it('rejects evil.com', () => {
    expect(validateBridgeUrl('http://evil.com')).toBeNull();
  });

  it('rejects api.example.com', () => {
    expect(validateBridgeUrl('https://api.example.com/bridge')).toBeNull();
  });

  it('rejects attacker-controlled domain', () => {
    expect(validateBridgeUrl('http://malicious-server.net:8787')).toBeNull();
  });

  it('rejects a domain containing localhost as a substring', () => {
    expect(validateBridgeUrl('http://localhost.evil.com')).toBeNull();
  });
});

// ── ws:// and wss:// scheme normalization ───────────────────────────────────

describe('validateBridgeUrl — ws/wss schemes are normalized to http/https', () => {
  it('normalizes ws://localhost to http://localhost', () => {
    expect(validateBridgeUrl('ws://localhost:8787')).toBe('http://localhost:8787');
  });

  it('normalizes wss://localhost to https://localhost', () => {
    expect(validateBridgeUrl('wss://localhost:8787')).toBe('https://localhost:8787');
  });

  it('normalizes ws://127.0.0.1 to http://127.0.0.1', () => {
    expect(validateBridgeUrl('ws://127.0.0.1:9000')).toBe('http://127.0.0.1:9000');
  });

  it('still rejects ws:// with remote host', () => {
    expect(validateBridgeUrl('ws://evil.com:8787')).toBeNull();
  });
});

// ── Invalid URLs return null ────────────────────────────────────────────────

describe('validateBridgeUrl — invalid URLs return null', () => {
  it('rejects an empty string', () => {
    expect(validateBridgeUrl('')).toBeNull();
  });

  it('rejects a bare word', () => {
    expect(validateBridgeUrl('not-a-url')).toBeNull();
  });

  it('rejects a URL missing a scheme', () => {
    expect(validateBridgeUrl('localhost:8787')).toBeNull();
  });

  it('rejects a completely malformed URL', () => {
    expect(validateBridgeUrl(':///')).toBeNull();
  });
});

// ── URLs with paths are preserved ───────────────────────────────────────────

describe('validateBridgeUrl — URLs with paths are preserved', () => {
  it('preserves /api/v1 path', () => {
    expect(validateBridgeUrl('http://localhost:8787/api/v1')).toBe('http://localhost:8787/api/v1');
  });

  it('preserves a nested path', () => {
    expect(validateBridgeUrl('http://127.0.0.1:3000/bridge/connect')).toBe(
      'http://127.0.0.1:3000/bridge/connect',
    );
  });
});

// ── Trailing slashes are stripped ───────────────────────────────────────────

describe('validateBridgeUrl — trailing slashes are stripped', () => {
  it('strips trailing slash from http://localhost:8787/', () => {
    expect(validateBridgeUrl('http://localhost:8787/')).toBe('http://localhost:8787');
  });

  it('strips trailing slash from http://127.0.0.1/', () => {
    expect(validateBridgeUrl('http://127.0.0.1/')).toBe('http://127.0.0.1');
  });

  it('does not strip a path that happens to end with a slash', () => {
    // The regex strips only the final trailing slash
    expect(validateBridgeUrl('http://localhost:8787/api/')).toBe('http://localhost:8787/api');
  });
});

// ── Non-http schemes (ftp://, file://) are rejected ─────────────────────────

describe('validateBridgeUrl — non-http schemes are rejected', () => {
  it('rejects ftp://localhost', () => {
    expect(validateBridgeUrl('ftp://localhost')).toBeNull();
  });

  it('rejects file:///etc/passwd', () => {
    expect(validateBridgeUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects data: URIs', () => {
    expect(validateBridgeUrl('data:text/html,<h1>Hi</h1>')).toBeNull();
  });

  it('rejects javascript: URIs', () => {
    expect(validateBridgeUrl('javascript:alert(1)')).toBeNull();
  });
});

// ── Non-localhost IP addresses are rejected ──────────────────────────────────

describe('validateBridgeUrl — non-localhost IPs are rejected', () => {
  it('rejects 192.168.1.1 (private network)', () => {
    expect(validateBridgeUrl('http://192.168.1.1:8787')).toBeNull();
  });

  it('rejects 10.0.0.1 (private network)', () => {
    expect(validateBridgeUrl('http://10.0.0.1:8787')).toBeNull();
  });

  it('rejects 172.16.0.1 (private network)', () => {
    expect(validateBridgeUrl('http://172.16.0.1:8787')).toBeNull();
  });

  it('rejects 8.8.8.8 (public IP)', () => {
    expect(validateBridgeUrl('http://8.8.8.8')).toBeNull();
  });
});
