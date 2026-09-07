import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

import { GET } from './route';

const PATH = 'http://localhost/api/mcp-apps/sandbox';

function request(query = ''): NextRequest {
  return new NextRequest(`${PATH}${query}`);
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function directives(response: Response): Map<string, string> {
  const header = response.headers.get('Content-Security-Policy') ?? '';
  return new Map(
    header.split(';').map((part) => {
      const trimmed = part.trim();
      const space = trimmed.indexOf(' ');
      return space === -1
        ? ([trimmed, ''] as [string, string])
        : ([trimmed.slice(0, space), trimmed.slice(space + 1)] as [string, string]);
    }),
  );
}

afterEach(() => {
  delete process.env['NEXT_PUBLIC_APP_URL'];
});

describe('GET /api/mcp-apps/sandbox is a stateless relay document', () => {
  it('answers an anonymous request with the relay shell and no account data', async () => {
    const response = GET(request());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('sandbox-proxy-ready');
    expect(body).not.toMatch(/payload|token|authorization|cookie/i);
    expect(body).not.toContain('fetch(');
  });

  it('never lets the document be cached or sniffed', () => {
    const response = GET(request());

    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  });

  it('denies every fetch destination by default', () => {
    const csp = directives(GET(request()));

    expect(csp.get('default-src')).toBe("'none'");
    expect(csp.get('connect-src')).toBe("'none'");
    expect(csp.get('frame-src')).toBe("'none'");
    expect(csp.get('base-uri')).toBe("'none'");
    expect(csp.get('object-src')).toBe("'none'");
    expect(csp.get('form-action')).toBe("'none'");
  });

  it('only this deployment may frame it', () => {
    expect(directives(GET(request())).get('frame-ancestors')).toBe("'self'");
  });

  it('names the configured app origin so a dedicated sandbox origin can be framed', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'https://app.example.com/some/path';

    expect(directives(GET(request())).get('frame-ancestors')).toBe(
      "'self' https://app.example.com",
    );
  });

  it('ignores an app origin that is not a URL', () => {
    process.env['NEXT_PUBLIC_APP_URL'] = 'not a url';

    expect(directives(GET(request())).get('frame-ancestors')).toBe("'self'");
  });

  it('widens a fetch destination only to an https origin the caller names', () => {
    const query = `?csp=${encode({ connectDomains: ['https://api.example.com'] })}`;

    expect(directives(GET(request(query))).get('connect-src')).toBe('https://api.example.com');
  });

  it('refuses a caller-supplied source that could break out of a directive', () => {
    const query = `?csp=${encode({
      connectDomains: ["https://evil.example.com; script-src 'unsafe-inline'"],
      resourceDomains: ['http://plain.example.com', 'javascript:alert(1)'],
    })}`;
    const csp = directives(GET(request(query)));

    expect(csp.get('connect-src')).toBe("'none'");
    expect(csp.get('img-src')).toBe('data: blob:');
    expect(csp.get('default-src')).toBe("'none'");
  });

  it('ignores an oversized or unparseable csp parameter', () => {
    expect(directives(GET(request(`?csp=${'a'.repeat(9000)}`))).get('connect-src')).toBe("'none'");
    expect(directives(GET(request('?csp=not-base64-json'))).get('connect-src')).toBe("'none'");
  });
});
