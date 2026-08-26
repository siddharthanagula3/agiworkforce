import { readFileSync } from 'node:fs';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isProxyTrusted, resolveClientIp, resolveTrustedProxyHops } from '../src/client-ip.js';
import { WebSocketRateLimiter, WS_CONNECTION_LIMIT } from '../src/middleware/rateLimit.js';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const EDGE_SOCKET = '::ffff:10.0.0.7';
const CLIENT_A = '198.51.100.7';
const CLIENT_B = '198.51.100.8';
const SPOOFED = '1.2.3.4';

const PROXIED: NodeJS.ProcessEnv = { TRUST_PROXY: 'true' };
const DIRECT: NodeJS.ProcessEnv = {};

function requestFrom(remoteAddress: string | undefined, headers: IncomingHttpHeaders = {}) {
  return { headers, socket: { remoteAddress } } as unknown as IncomingMessage;
}

describe('resolveClientIp', () => {
  it('ignores a forwarding header entirely when TRUST_PROXY is disabled', () => {
    const req = requestFrom(CLIENT_A, { 'x-forwarded-for': SPOOFED });
    expect(resolveClientIp(req, DIRECT)).toBe(CLIENT_A);
  });

  it('falls back to the socket address behind a proxy when no header is present', () => {
    expect(resolveClientIp(requestFrom(EDGE_SOCKET), PROXIED)).toBe(EDGE_SOCKET);
  });

  it('uses the single entry the edge proxy wrote for an honest client', () => {
    const req = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': CLIENT_A });
    expect(resolveClientIp(req, PROXIED)).toBe(CLIENT_A);
  });

  it('does not identify a client as the IP it declared for itself', () => {
    const req = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${SPOOFED}, ${CLIENT_A}` });
    expect(resolveClientIp(req, PROXIED)).toBe(CLIENT_A);
    expect(resolveClientIp(req, PROXIED)).not.toBe(SPOOFED);
  });

  it('ignores a long fabricated chain and keeps the proxy-written entry', () => {
    const req = requestFrom(EDGE_SOCKET, {
      'x-forwarded-for': `${SPOOFED}, 5.6.7.8, 9.9.9.9, ${CLIENT_A}`,
    });
    expect(resolveClientIp(req, PROXIED)).toBe(CLIENT_A);
  });

  it('ignores a fabricated chain split across duplicate headers', () => {
    const req = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': [SPOOFED, CLIENT_A] });
    expect(resolveClientIp(req, PROXIED)).toBe(CLIENT_A);
  });

  it('separates two genuine clients that both declare the same fake IP', () => {
    const a = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${SPOOFED}, ${CLIENT_A}` });
    const b = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${SPOOFED}, ${CLIENT_B}` });
    expect(resolveClientIp(a, PROXIED)).toBe(CLIENT_A);
    expect(resolveClientIp(b, PROXIED)).toBe(CLIENT_B);
  });

  it('accepts an IPv6 entry written by the proxy', () => {
    const req = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${SPOOFED}, 2001:db8::1` });
    expect(resolveClientIp(req, PROXIED)).toBe('2001:db8::1');
  });

  it('falls back to the socket address when the selected entry is not an IP', () => {
    const req = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${CLIENT_A}, not-an-ip` });
    expect(resolveClientIp(req, PROXIED)).toBe(EDGE_SOCKET);
  });

  it('skips the configured number of hops from the right', () => {
    const req = requestFrom(EDGE_SOCKET, {
      'x-forwarded-for': `${SPOOFED}, ${CLIENT_A}, 192.0.2.50`,
    });
    expect(resolveClientIp(req, { TRUST_PROXY: '1', TRUSTED_PROXY_HOPS: '2' })).toBe(CLIENT_A);
  });

  it('falls back to the socket address when the chain is shorter than the hop count', () => {
    const req = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': CLIENT_A });
    expect(resolveClientIp(req, { TRUST_PROXY: '1', TRUSTED_PROXY_HOPS: '3' })).toBe(EDGE_SOCKET);
  });

  it('reports unknown only when there is nothing left to fall back to', () => {
    expect(resolveClientIp(requestFrom(undefined), PROXIED)).toBe('unknown');
  });
});

describe('trusted proxy configuration', () => {
  it('trusts a proxy only for the documented TRUST_PROXY values', () => {
    expect(isProxyTrusted({ TRUST_PROXY: 'true' })).toBe(true);
    expect(isProxyTrusted({ TRUST_PROXY: '1' })).toBe(true);
    expect(isProxyTrusted({ TRUST_PROXY: 'yes' })).toBe(false);
    expect(isProxyTrusted({})).toBe(false);
  });

  it('defaults to a single hop and rejects unusable hop counts', () => {
    expect(resolveTrustedProxyHops({})).toBe(1);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '2' })).toBe(2);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '0' })).toBe(1);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '-3' })).toBe(1);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: '1.5' })).toBe(1);
    expect(resolveTrustedProxyHops({ TRUSTED_PROXY_HOPS: 'all' })).toBe(1);
  });

  it('never hands Express an unbounded trust-proxy setting', () => {
    const source = readFileSync(resolve(serviceRoot, 'src/index.ts'), 'utf8');
    expect(source).not.toMatch(/app\.set\(\s*'trust proxy'\s*,\s*true\s*\)/);
    expect(source).toMatch(/app\.set\('trust proxy', resolveTrustedProxyHops\(\)\)/);
  });
});

describe('WebSocketRateLimiter identity behind a trusted proxy', () => {
  let limiter: WebSocketRateLimiter;
  let previousTrustProxy: string | undefined;

  beforeEach(() => {
    previousTrustProxy = process.env['TRUST_PROXY'];
    process.env['TRUST_PROXY'] = 'true';
    limiter = new WebSocketRateLimiter();
  });

  afterEach(() => {
    limiter.shutdown();
    if (previousTrustProxy === undefined) delete process.env['TRUST_PROXY'];
    else process.env['TRUST_PROXY'] = previousTrustProxy;
  });

  it('caps a client that mints a fresh declared IP for every connection', () => {
    const results = [];
    for (let attempt = 0; attempt <= WS_CONNECTION_LIMIT; attempt++) {
      const req = requestFrom(EDGE_SOCKET, {
        'x-forwarded-for': `10.10.0.${attempt}, ${CLIENT_A}`,
      });
      expect(limiter.getClientIp(req)).toBe(CLIENT_A);
      results.push(limiter.checkConnection(limiter.getClientIp(req)));
    }

    expect(results.slice(0, WS_CONNECTION_LIMIT).every((result) => result.allowed)).toBe(true);
    expect(results[WS_CONNECTION_LIMIT]?.allowed).toBe(false);
  });

  it('still lets a second genuine client connect after the first is capped', () => {
    const spoofing = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${SPOOFED}, ${CLIENT_A}` });
    for (let attempt = 0; attempt <= WS_CONNECTION_LIMIT; attempt++) {
      limiter.checkConnection(limiter.getClientIp(spoofing));
    }

    const other = requestFrom(EDGE_SOCKET, { 'x-forwarded-for': `${SPOOFED}, ${CLIENT_B}` });
    expect(limiter.checkConnection(limiter.getClientIp(other)).allowed).toBe(true);
  });
});
