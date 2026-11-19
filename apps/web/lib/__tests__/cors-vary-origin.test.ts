import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { getCorsHeaders, handleCorsPreflightRequest, withCorsAndSecurityHeaders } from '../cors';

const ALLOWED_CROSS_ORIGIN = 'tauri://localhost';

function request(origin: string | null, method = 'GET'): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/connectors/directory', {
    method,
    headers: origin ? { origin } : {},
  });
}

function varyFields(response: Response): string[] {
  return (response.headers.get('Vary') ?? '')
    .split(',')
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);
}

describe('CORS responses vary on Origin', () => {
  it('declares Origin in Vary when the allow-origin header reflects the caller', () => {
    const headers = getCorsHeaders(request(ALLOWED_CROSS_ORIGIN));
    expect(headers['Access-Control-Allow-Origin']).toBe(ALLOWED_CROSS_ORIGIN);
    expect(headers['Vary']).toBe('Origin');
  });

  it('declares Origin in Vary on a same-origin answer a shared cache could replay cross-origin', () => {
    const headers = getCorsHeaders(request(null));
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(headers['Vary']).toBe('Origin');
  });

  it('keeps a route-declared Vary field when decorating a cacheable response', () => {
    const response = new Response('{}', {
      headers: {
        'Cache-Control': 'public, max-age=60',
        Vary: 'X-Vercel-IP-Country',
      },
    });
    withCorsAndSecurityHeaders(response, request(ALLOWED_CROSS_ORIGIN));
    expect(varyFields(response)).toEqual(['x-vercel-ip-country', 'accept-encoding', 'origin']);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(ALLOWED_CROSS_ORIGIN);
  });

  it('declares Origin in Vary on a preflight answer', () => {
    const response = handleCorsPreflightRequest(request(ALLOWED_CROSS_ORIGIN, 'OPTIONS'));
    expect(response?.status).toBe(204);
    expect(varyFields(response!)).toContain('origin');
  });
});
