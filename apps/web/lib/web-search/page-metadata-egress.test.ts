import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import { enrichWebSearchResultTitles } from './web-search-tool';

const PUBLIC_ADDRESS = '93.184.216.34';

/**
 * A search result is a URL a vendor chose and a page the vendor's crawler saw,
 * so the redirect it answers with now is not something this process picked.
 */
const HOSTILE_REDIRECTS: ReadonlyArray<readonly [string, string]> = [
  ['the cloud metadata endpoint', 'http://169.254.169.254/latest/meta-data/iam/'],
  ['loopback', 'http://127.0.0.1:8080/admin'],
  ['loopback by name', 'http://localhost:5432/'],
  ['IPv6 loopback', 'http://[::1]/'],
  ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/'],
  ['decimal IPv4 for loopback', 'http://2130706433/'],
  ['hex IPv4 for loopback', 'http://0x7f000001/'],
  ['a private address', 'http://10.0.0.5/internal'],
  ['a file url', 'file:///etc/passwd'],
  ['a gopher url', 'gopher://example.com:70/_'],
];

interface UntitledResult {
  url: string;
  title: string;
  snippet?: string;
  date?: string;
}

let counter = 0;

function untitled(): UntitledResult {
  counter += 1;
  return { url: `https://result-${counter}.example/story`, title: '' };
}

function metadataPage(title: string): Response {
  return new Response(`<html><head><title>${title}</title></head><body>x</body></html>`, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

/**
 * Stands in for the client, including the part that matters: when a caller does
 * not ask for manual redirects, the client follows the Location itself and this
 * process never sees the hop.
 */
function recording(plan: (call: number, url: string) => Response): {
  impl: typeof fetch;
  urls: string[];
} {
  const urls: string[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    let current = typeof input === 'string' ? input : input.toString();
    for (let hop = 0; hop < 20; hop += 1) {
      urls.push(current);
      const response = plan(urls.length, current);
      if (response.status < 300 || response.status >= 400) return response;
      if (init.redirect === 'manual') return response;
      if (init.redirect === 'error') throw new TypeError('unexpected redirect');
      const location = response.headers.get('location');
      if (!location) return response;
      current = new URL(location, current).toString();
    }
    throw new TypeError('too many redirects');
  }) as unknown as typeof fetch;
  return { impl, urls };
}

beforeEach(() => {
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);
});

describe('filling in a missing result title never becomes a reach inside', () => {
  it.each(HOSTILE_REDIRECTS)(
    'leaves the result untouched when the page redirects to %s',
    async (_label, target) => {
      const result = untitled();
      const { impl, urls } = recording((call) =>
        call === 1
          ? new Response(null, { status: 302, headers: { location: target } })
          : metadataPage('internal secret'),
      );

      const [enriched] = await enrichWebSearchResultTitles([result], { fetchImpl: impl });

      expect(enriched!.title).toBe('');
      expect(enriched!.snippet).toBeUndefined();
      expect(urls).toEqual([result.url]);
    },
  );

  it('still fills a title in from an ordinary public redirect', async () => {
    const result = untitled();
    const { impl, urls } = recording((call) =>
      call === 1
        ? new Response(null, { status: 302, headers: { location: 'https://moved.example/story' } })
        : metadataPage('The real headline'),
    );

    const [enriched] = await enrichWebSearchResultTitles([result], { fetchImpl: impl });

    expect(enriched!.title).toBe('The real headline');
    expect(urls).toEqual([result.url, 'https://moved.example/story']);
  });

  it('gives up rather than following a chain past the bound', async () => {
    const result = untitled();
    const { impl, urls } = recording(
      (call) =>
        new Response(null, { status: 302, headers: { location: `https://hop${call}.example/` } }),
    );

    const [enriched] = await enrichWebSearchResultTitles([result], { fetchImpl: impl });

    expect(enriched!.title).toBe('');
    expect(urls.length).toBeLessThanOrEqual(4);
  });

  it('refuses a result whose own host resolves private, before any request', async () => {
    dnsMocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const result = untitled();
    const { impl, urls } = recording(() => metadataPage('internal secret'));

    const [enriched] = await enrichWebSearchResultTitles([result], { fetchImpl: impl });

    expect(enriched!.title).toBe('');
    expect(urls).toEqual([]);
  });

  it('refuses the second hop when the host starts resolving private between them', async () => {
    dnsMocks.lookup
      .mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const result = untitled();
    const host = new URL(result.url).host;
    const { impl, urls } = recording((call) =>
      call === 1
        ? new Response(null, { status: 302, headers: { location: `https://${host}/moved` } })
        : metadataPage('internal secret'),
    );

    const [enriched] = await enrichWebSearchResultTitles([result], { fetchImpl: impl });

    expect(enriched!.title).toBe('');
    expect(urls).toEqual([result.url]);
  });

  it('sends no cookie or authorization header on any hop', async () => {
    const result = untitled();
    const seen: Array<string[]> = [];
    const impl = (async (_input: string | URL | Request, init: RequestInit = {}) => {
      seen.push([...new Headers(init.headers).keys()]);
      return seen.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://onward.example/', 'set-cookie': 'session=secret' },
          })
        : metadataPage('Public headline');
    }) as unknown as typeof fetch;

    await enrichWebSearchResultTitles([result], { fetchImpl: impl });

    expect(seen).toHaveLength(2);
    for (const names of seen) {
      expect(names).not.toContain('cookie');
      expect(names).not.toContain('authorization');
    }
  });
});
