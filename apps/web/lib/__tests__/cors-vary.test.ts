import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { appendVary, withCorsAndSecurityHeaders } from '../cors';

function req(url = 'https://agiworkforce.com/api/models'): NextRequest {
  return new NextRequest(url, { headers: { origin: 'https://agiworkforce.com' } });
}

describe('appendVary', () => {
  it('sets the field when Vary is absent', () => {
    const res = new Response('{}');
    appendVary(res, 'Accept-Encoding');
    expect(res.headers.get('Vary')).toBe('Accept-Encoding');
  });

  it('keeps a field another route already declared', () => {
    // /api/pricing/localized varies on country; dropping that would serve one
    // country's prices to every country.
    const res = new Response('{}', { headers: { Vary: 'X-Vercel-IP-Country' } });
    appendVary(res, 'Accept-Encoding');
    expect(res.headers.get('Vary')).toBe('X-Vercel-IP-Country, Accept-Encoding');
  });

  it('does not duplicate a field that is already declared', () => {
    const res = new Response('{}', { headers: { Vary: 'Accept-Encoding' } });
    appendVary(res, 'Accept-Encoding');
    expect(res.headers.get('Vary')).toBe('Accept-Encoding');
  });

  it('matches case-insensitively, as header field names are', () => {
    const res = new Response('{}', { headers: { Vary: 'accept-encoding' } });
    appendVary(res, 'Accept-Encoding');
    expect(res.headers.get('Vary')).toBe('accept-encoding');
  });

  it('leaves Vary: * alone, which already means "vary on everything"', () => {
    const res = new Response('{}', { headers: { Vary: '*' } });
    appendVary(res, 'Accept-Encoding');
    expect(res.headers.get('Vary')).toBe('*');
  });
});

describe('withCorsAndSecurityHeaders', () => {
  it('declares Accept-Encoding on an API response', () => {
    const res = withCorsAndSecurityHeaders(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Cache-Control': 'public, max-age=300' },
      }),
      req(),
    );
    expect(String(res.headers.get('Vary'))).toContain('Accept-Encoding');
  });

  it('preserves a route-declared Vary alongside it', () => {
    const res = withCorsAndSecurityHeaders(
      new Response('{}', { headers: { Vary: 'X-Vercel-IP-Country' } }),
      req('https://agiworkforce.com/api/pricing/localized'),
    );
    const vary = String(res.headers.get('Vary'));
    expect(vary).toContain('X-Vercel-IP-Country');
    expect(vary).toContain('Accept-Encoding');
  });
});
