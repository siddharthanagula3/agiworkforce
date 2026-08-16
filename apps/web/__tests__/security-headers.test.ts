import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const WEB_ROOT = join(__dirname, '..');
const readWebFile = (p: string) => readFileSync(join(WEB_ROOT, p), 'utf8');
const REPO_ROOT = join(WEB_ROOT, '..', '..');

describe('WEB-13 · production security headers', () => {
  const config = readWebFile('next.config.ts');

  it('declares the full security-header set on every route', () => {
    const required: Array<[string, string]> = [
      ['X-DNS-Prefetch-Control', 'off'],
      ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload'],
      ['X-Frame-Options', 'DENY'],
      ['X-Content-Type-Options', 'nosniff'],
      ['Referrer-Policy', 'origin-when-cross-origin'],
      ['Cross-Origin-Opener-Policy', 'same-origin'],
      ['Cross-Origin-Resource-Policy', 'same-origin'],
      ['Cross-Origin-Embedder-Policy', 'credentialless'],
    ];
    for (const [key, value] of required) {
      expect(config, `next.config.ts must declare ${key}`).toContain(key);
      expect(config, `${key} must keep its hardened value`).toContain(value);
    }
  });

  it('locks down a restrictive Permissions-Policy (camera/geolocation/payment denied)', () => {
    expect(config).toContain('Permissions-Policy');
    for (const denied of ['camera=()', 'geolocation=()', 'payment=()', 'usb=()']) {
      expect(config, `Permissions-Policy must deny ${denied}`).toContain(denied);
    }
  });

  it('applies the security headers to every route (source /:path*)', () => {
    expect(config).toContain("source: '/:path*'");
  });

  it('sets a per-request Content-Security-Policy with a nonce in proxy.ts', () => {
    const proxy = readWebFile('proxy.ts');
    expect(proxy).toContain("response.headers.set('Content-Security-Policy'");
    expect(proxy.toLowerCase()).toContain('nonce');
  });

  it('keeps the PDF frame exception narrow and query-gated', () => {
    expect(config).toContain("source: '/api/files/:id'");
    expect(config).toContain("key: 'preview', value: 'pdf'");
    expect(config).toContain("value: 'SAMEORIGIN'");
  });
});

describe('WEB-13 · cross-origin artifact sandbox headers', () => {
  const sandboxConfig = readFileSync(
    join(REPO_ROOT, 'infrastructure', 'sandbox', 'vercel.json'),
    'utf8',
  );

  it('opts the child frame into the parent cross-origin embedder policy', () => {
    expect(sandboxConfig).toContain('Cross-Origin-Embedder-Policy');
    expect(sandboxConfig).toContain('credentialless');
  });

  it('keeps the sandbox cross-origin and unable to make network connections', () => {
    expect(sandboxConfig).toContain('Cross-Origin-Resource-Policy');
    expect(sandboxConfig).toContain('cross-origin');
    expect(sandboxConfig).toContain("connect-src 'none'");
  });
});
