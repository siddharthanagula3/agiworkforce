import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { clientHandshakeHeaders } from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));
vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe('isOriginAllowed', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env['ALLOWED_ORIGINS'];
    delete process.env['NEXT_PUBLIC_APP_URL'];
  });

  it('allows requests without Origin header by default', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed(null)).toBe(true);
  });

  it('rejects missing Origin when requireOrigin is true', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed(null, true)).toBe(false);
  });

  it('allows Tauri origin tauri://localhost', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('tauri://localhost')).toBe(true);
  });

  it('allows the Electron cloud shell origin agi://cloud, exactly', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('agi://cloud')).toBe(true);
    expect(isOriginAllowed('agi://cloud-evil')).toBe(false);
    expect(isOriginAllowed('agi://other')).toBe(false);
    expect(isOriginAllowed('agi://cloud.example.com')).toBe(false);
  });

  it('rejects the literal null origin even with requireOrigin off', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('null')).toBe(false);
  });

  it('adds readable CORS headers to a wrapped Desktop failure response', async () => {
    const { withCorsRoute } = await import('../cors');
    const route = withCorsRoute(async () => Response.json({ error: 'failed' }, { status: 500 }));
    const response = await route(
      new NextRequest('https://agiworkforce.com/api/example', {
        headers: { origin: 'https://tauri.localhost' },
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://tauri.localhost');
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('preserves an explicit route-specific frame policy', async () => {
    const { withCorsRoute } = await import('../cors');
    const route = withCorsRoute(
      async () =>
        new Response('pdf', {
          headers: { 'X-Frame-Options': 'SAMEORIGIN' },
        }),
    );
    const response = await route(
      new NextRequest('https://agiworkforce.com/api/files/id?preview=pdf'),
    );

    expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('allows every header sent by the versioned desktop account client', async () => {
    const { handleCorsPreflightRequest } = await import('../cors');
    const clientHeaders = {
      authorization: 'Bearer test',
      'content-type': 'application/json',
      ...clientHandshakeHeaders({ surface: 'desktop', version: '0.0.1' }),
    };
    const response = handleCorsPreflightRequest(
      new NextRequest('https://agiworkforce.com/api/me?surface=desktop', {
        method: 'OPTIONS',
        headers: {
          origin: 'tauri://localhost',
          'access-control-request-method': 'GET',
          'access-control-request-headers': Object.keys(clientHeaders).join(', '),
        },
      }),
    );

    expect(response?.status).toBe(204);
    const allowed = response!.headers
      .get('Access-Control-Allow-Headers')!
      .toLowerCase()
      .split(',')
      .map((header) => header.trim());
    for (const header of Object.keys(clientHeaders))
      expect(allowed).toContain(header.toLowerCase());
    expect(response!.headers.get('Access-Control-Allow-Origin')).toBe('tauri://localhost');
  });

  it('rejects arbitrary origins without ALLOWED_ORIGINS', async () => {
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('https://evil.com')).toBe(false);
  });

  it('allows origins from ALLOWED_ORIGINS env var', async () => {
    process.env['ALLOWED_ORIGINS'] = 'https://myapp.com,https://staging.myapp.com';
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('https://myapp.com')).toBe(true);
    expect(isOriginAllowed('https://staging.myapp.com')).toBe(true);
    expect(isOriginAllowed('https://other.com')).toBe(false);
  });

  it('allows NEXT_PUBLIC_APP_URL as origin', async () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.agiworkforce.com';
    const { isOriginAllowed } = await import('../cors');
    expect(isOriginAllowed('https://app.agiworkforce.com')).toBe(true);
  });
});
