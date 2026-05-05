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

import { describe, it, expect } from 'vitest';
import {
  validateEgressUrl,
  validateUserImageUrl,
  isInternalHostname,
  isDataUrl,
  EgressPolicyError,
} from './egress-policy';

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

describe('validateUserImageUrl — accepts', () => {
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

describe('validateUserImageUrl — rejects', () => {
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

  // Internal-service ports — even on otherwise-valid public hostnames
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

describe('validateEgressUrl — service allowlist (unchanged behavior)', () => {
  it('allows known providers', () => {
    expect(() => validateEgressUrl('https://api.anthropic.com/v1/messages')).not.toThrow();
    expect(() => validateEgressUrl('https://api.openai.com/v1/chat/completions')).not.toThrow();
    expect(() => validateEgressUrl('https://my-project.supabase.co/rest/v1/users')).not.toThrow();
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
