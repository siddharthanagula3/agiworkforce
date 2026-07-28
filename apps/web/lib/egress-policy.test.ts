/**
 * Regression tests for WEB-MULTIMODAL-IMAGE-SSRF (red-team finding 2026-05).
 *
 * Pre-fix bug: chat completions forwarded `image_url` payloads to upstream
 * providers without validating the URL. A request body with
 *     image_url.url = "http://169.254.169.254/latest/meta-data/"
 * had Anthropic / OpenAI / Google fetch the IMDS endpoint server-side and
 * surface it in the model output. SSRF amplification through the LLM.
 *
 * `validateUserImageUrl()` is the chokepoint that the route handler now
 * calls before any provider call. These tests pin its contract.
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import {
  assertResolvedPublicHostname,
  validateEgressUrl,
  validateUserImageUrl,
  isInternalHostname,
  isDataUrl,
  EgressPolicyError,
} from './egress-policy';

beforeEach(() => {
  dnsMocks.lookup.mockReset();
});

describe('isDataUrl', () => {
  it.each([
    ['data:image/png;base64,iVBORw0KG...', true],
    ['DATA:image/png;base64,abc', true],
    ['data:', true],
    ['https://example.com/img.png', false],
    ['', false],
    ['javascript:alert(1)', false],
  ])('%s -> %s', (input, expected) => {
    expect(isDataUrl(input)).toBe(expected);
  });
});

describe('isInternalHostname', () => {
  // Loopback / local
  it.each([
    'localhost',
    'localhost.localdomain',
    '127.0.0.1',
    '127.255.255.255',
    '0.0.0.0',
    '::1',
    '[::1]',
  ])('blocks loopback: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  // RFC1918 private ranges
  it.each([
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
  ])('blocks RFC1918: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  // IMDS / link-local
  it.each(['169.254.169.254', '169.254.0.1', '169.254.255.255'])(
    'blocks link-local + IMDS: %s',
    (host) => {
      expect(isInternalHostname(host)).toBe(true);
    },
  );

  // CGNAT
  it.each(['100.64.0.1', '100.127.255.255'])('blocks CGNAT: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  // Multicast / reserved
  it.each(['224.0.0.1', '239.255.255.255', '255.255.255.255'])(
    'blocks multicast/reserved: %s',
    (host) => {
      expect(isInternalHostname(host)).toBe(true);
    },
  );

  // IPv6 link-local + ULA
  it.each(['fe80::1', 'fc00::1', 'fd12:3456:789a::1'])('blocks IPv6 ULA/link-local: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  // IPv4-mapped / IPv4-compatible / NAT64 IPv6 that embed an internal IPv4 —
  // these previously bypassed the guard and could reach cloud metadata.
  it.each([
    '::ffff:169.254.169.254', // AWS/GCP metadata, mapped dotted
    '::ffff:a9fe:a9fe', // same, mapped hex
    '::ffff:127.0.0.1', // loopback, mapped
    '::ffff:10.0.0.1', // private, mapped
    '::ffff:192.168.1.1', // private, mapped
    '0:0:0:0:0:ffff:169.254.169.254', // fully-expanded mapped
    '::127.0.0.1', // IPv4-compatible (deprecated)
    '64:ff9b::169.254.169.254', // NAT64 dotted
    '64:ff9b::a9fe:a9fe', // NAT64 hex
  ])('blocks IPv4-embedded IPv6 to internal target: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });

  // Mapped forms that embed a PUBLIC IPv4 stay public (no over-block).
  it.each(['::ffff:8.8.8.8', '::ffff:0808:0808'])(
    'allows IPv4-mapped IPv6 to public target: %s',
    (host) => {
      expect(isInternalHostname(host)).toBe(false);
    },
  );

  // Public addresses pass
  it.each([
    'example.com',
    'cdn.example.com',
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:2800:220:1:248:1893:25c8:1946',
  ])('allows public host: %s', (host) => {
    expect(isInternalHostname(host)).toBe(false);
  });

  // Invalid IPv4 octets (>255) are blocked (defensive)
  it.each(['256.256.256.256', '999.0.0.1'])('blocks malformed IPv4: %s', (host) => {
    expect(isInternalHostname(host)).toBe(true);
  });
});

describe('validateUserImageUrl · accepts', () => {
  it.each([
    'data:image/png;base64,iVBORw0KG...',
    'data:image/jpeg;base64,/9j/4AAQ...',
    'data:image/svg+xml;base64,PHN2Z...',
    'https://cdn.example.com/photo.jpg',
    'https://images.unsplash.com/photo-12345',
    'https://example.com:8443/image.png', // non-internal port OK
    'https://1.1.1.1/img.png', // public IPv4
  ])('accepts %s', (url) => {
    expect(() => validateUserImageUrl(url)).not.toThrow();
  });
});

describe('validateUserImageUrl · rejects', () => {
  // The exact PoC from the red-team finding
  it('blocks AWS IMDS (the original PoC)', () => {
    expect(() => validateUserImageUrl('http://169.254.169.254/latest/meta-data/')).toThrow(
      EgressPolicyError,
    );
    expect(() => validateUserImageUrl('https://169.254.169.254/latest/meta-data/')).toThrow(
      EgressPolicyError,
    );
  });

  it.each([
    ['empty string', ''],
    ['plain string', 'not a url'],
    ['javascript:', 'javascript:alert(1)'],
    ['file://', 'file:///etc/passwd'],
    ['ftp://', 'ftp://attacker.example/'],
    ['http (non-https)', 'http://example.com/img.png'],
    ['userinfo present', 'https://attacker:secret@example.com/img.png'],
    ['userinfo only user', 'https://attacker@example.com/img.png'],
  ])('blocks %s', (_label, url) => {
    expect(() => validateUserImageUrl(url)).toThrow(EgressPolicyError);
  });

  // Internal hostnames in every IPv4 form
  it.each([
    'https://localhost/img.png',
    'https://127.0.0.1/img.png',
    'https://10.0.0.1/img.png',
    'https://192.168.1.1/img.png',
    'https://172.20.0.1/img.png',
    'https://[::1]/img.png',
    'https://[fe80::1]/img.png',
  ])('blocks internal host: %s', (url) => {
    expect(() => validateUserImageUrl(url)).toThrow(EgressPolicyError);
  });

  // Internal-service ports · even on otherwise-valid public hostnames
  it.each([
    'https://example.com:22/key.pub',
    'https://example.com:5432/x',
    'https://example.com:6379/x',
    'https://example.com:11211/x',
    'https://example.com:11434/x', // ollama
    'https://example.com:27017/x', // mongo
  ])('blocks internal-service-port URL: %s', (url) => {
    expect(() => validateUserImageUrl(url)).toThrow(EgressPolicyError);
  });

  // Non-string / weird types
  it('blocks non-string', () => {
    expect(() => validateUserImageUrl(undefined as unknown as string)).toThrow(EgressPolicyError);
    expect(() => validateUserImageUrl(null as unknown as string)).toThrow(EgressPolicyError);
  });
});

describe('validateEgressUrl · service allowlist (unchanged behavior)', () => {
  it('allows known providers', () => {
    expect(() => validateEgressUrl('https://api.anthropic.com/v1/messages')).not.toThrow();
    expect(() => validateEgressUrl('https://api.openai.com/v1/chat/completions')).not.toThrow();
  });

  it('allows both Moonshot endpoints (mainland .cn and international .ai)', () => {
    // Bug 4: a plain Moonshot (Kimi) send 403'd with "Provider endpoint not in approved
    // egress allowlist" because MOONSHOT_BASE_URL=https://api.moonshot.ai/v1 was not on
    // the list. Both hosts must pass so the *_BASE_URL override validates.
    expect(() => validateEgressUrl('https://api.moonshot.ai/v1/chat/completions')).not.toThrow();
    expect(() => validateEgressUrl('https://api.moonshot.cn/v1/chat/completions')).not.toThrow();
  });

  it('no longer allows MuleRouter, dropped as a gateway 2026-07-27', () => {
    // An allowlisted host for a service we no longer use is standing SSRF
    // surface, so removal is asserted rather than left to inspection.
    expect(() => validateEgressUrl('https://api.mulerouter.ai/v1/chat/completions')).toThrow();
  });

  it('blocks unlisted host', () => {
    expect(() => validateEgressUrl('https://attacker.example/v1/messages')).toThrow(
      EgressPolicyError,
    );
  });

  it('blocks IMDS even if hostname were somehow allowlisted (defense in depth)', () => {
    // Direct IP → not in allowlist anyway, but the internal-host check fires first.
    expect(() => validateEgressUrl('https://169.254.169.254/v1/messages')).toThrow(
      EgressPolicyError,
    );
  });

  it('blocks http (must be https)', () => {
    expect(() => validateEgressUrl('http://api.anthropic.com/v1/messages')).toThrow(
      EgressPolicyError,
    );
  });
});

describe('assertResolvedPublicHostname', () => {
  it('allows a hostname whose resolved addresses are public', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);

    await expect(assertResolvedPublicHostname('https://example.com/mcp')).resolves.toBeUndefined();
  });

  it('blocks a hostname whose DNS resolves to a private address', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);

    await expect(assertResolvedPublicHostname('https://attacker.example/mcp')).rejects.toThrow(
      EgressPolicyError,
    );
  });

  it('fails closed when DNS lookup fails', async () => {
    dnsMocks.lookup.mockRejectedValueOnce(new Error('NXDOMAIN'));

    await expect(assertResolvedPublicHostname('https://missing.example/mcp')).rejects.toThrow(
      EgressPolicyError,
    );
  });
});
