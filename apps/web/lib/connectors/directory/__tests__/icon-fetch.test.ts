import { beforeEach, describe, expect, it, vi } from 'vitest';

import chains from './recorded/favicon-redirect-chains.json';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  assertResolvedPublicHostname: vi.fn(async (..._args: unknown[]) => undefined),
  pinnedPublicFetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
  pinnedPublicFetch: (...args: unknown[]) => mocks.pinnedPublicFetch(...args),
}));

import {
  ICON_MAX_BYTES,
  MAX_REDIRECT_HOPS,
  PAGE_HEAD_MAX_BYTES,
  fetchPageHead,
  getIconForUrl,
} from '@/lib/connectors/directory/icon-fetch';

interface RecordedHop {
  readonly url: string;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly bodyBase64?: string;
}

function streamResponse(
  bytes: Uint8Array,
  headers: Record<string, string>,
  status = 200,
): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, { status, headers });
}

function redirectResponse(status: number, headers: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

function serveHops(hops: readonly RecordedHop[]): void {
  const byUrl = new Map(hops.map((hop) => [hop.url, hop]));
  mocks.pinnedPublicFetch.mockImplementation(async (url: string) => {
    const hop = byUrl.get(url);
    if (!hop) throw new Error(`unexpected fetch ${url}`);
    if (hop.bodyBase64 === undefined) return redirectResponse(hop.status, hop.headers);
    return streamResponse(Buffer.from(hop.bodyBase64, 'base64'), hop.headers, hop.status);
  });
}

function fetchedUrls(): string[] {
  return mocks.pinnedPublicFetch.mock.calls.map(([url]) => url as string);
}

function assertedUrls(): string[] {
  return mocks.assertResolvedPublicHostname.mock.calls.map(([url]) => url as string);
}

function recordedChain(name: string): readonly RecordedHop[] {
  const chain = chains.chains.find((candidate) => candidate.name === name);
  if (!chain) throw new Error(`missing recorded chain ${name}`);
  return chain.hops;
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

describe('getIconForUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('fetches, caches and returns an allowed icon within the size cap', async () => {
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(PNG_BYTES, {
        'content-type': 'image/png',
        'content-length': String(PNG_BYTES.byteLength),
      }),
    );

    const icon = await getIconForUrl('https://cdn.example.com/icon.png');

    expect(icon?.contentType).toBe('image/png');
    expect(Buffer.from(icon?.base64 ?? '', 'base64')).toEqual(Buffer.from(PNG_BYTES));
    expect(mocks.pinnedPublicFetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('rejects a disallowed content type', async () => {
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(new Uint8Array([1, 2, 3]), { 'content-type': 'application/octet-stream' }),
    );

    await expect(getIconForUrl('https://cdn.example.com/icon.bin')).resolves.toBeNull();
  });

  it('accepts an icon up to the raised cap and rejects a declared content-length over it', async () => {
    expect(ICON_MAX_BYTES).toBe(262_144);
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(new Uint8Array(ICON_MAX_BYTES).fill(1), {
        'content-type': 'image/x-icon',
        'content-length': String(ICON_MAX_BYTES),
      }),
    );
    await expect(getIconForUrl('https://cdn.example.com/large.ico')).resolves.toMatchObject({
      contentType: 'image/x-icon',
    });

    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(PNG_BYTES, {
        'content-type': 'image/png',
        'content-length': String(ICON_MAX_BYTES + 1),
      }),
    );
    await expect(getIconForUrl('https://cdn.example.com/huge.png')).resolves.toBeNull();
  });

  it('rejects a stream that exceeds the size cap even with no declared content-length', async () => {
    const oversized = new Uint8Array(ICON_MAX_BYTES + 1).fill(1);
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(oversized, { 'content-type': 'image/png' }),
    );

    await expect(getIconForUrl('https://cdn.example.com/oversized.png')).resolves.toBeNull();
  });

  it('never fetches when the egress guard rejects the hostname', async () => {
    mocks.assertResolvedPublicHostname.mockRejectedValueOnce(new Error('internal host'));

    await expect(getIconForUrl('https://169.254.169.254/icon.png')).resolves.toBeNull();
    expect(mocks.pinnedPublicFetch).not.toHaveBeenCalled();
  });

  it('reuses a cached icon instead of fetching again', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        value: JSON.stringify({ contentType: 'image/png', base64: 'AAAA' }),
        stamp: '1',
        expires_at_ms: String(Date.now() + 60_000),
        scope: 'public',
      },
    ]);

    const icon = await getIconForUrl('https://cdn.example.com/cached.png');

    expect(icon).toEqual({ contentType: 'image/png', base64: 'AAAA' });
    expect(mocks.pinnedPublicFetch).not.toHaveBeenCalled();
  });

  it('follows the recorded apex-to-www redirect, vetting and fetching each hop', async () => {
    const hops = recordedChain('appfolio apex to www');
    serveHops(hops);

    const icon = await getIconForUrl(hops[0]!.url);

    expect(icon?.contentType).toBe('image/x-icon');
    expect(icon?.base64).toBe(hops[hops.length - 1]!.bodyBase64);
    expect(fetchedUrls()).toEqual(hops.map((hop) => hop.url));
    expect(assertedUrls()).toEqual(hops.map((hop) => hop.url));
  });

  it('resolves the recorded relative location against the hop it came from', async () => {
    const hops = recordedChain('activecampaign relative then cross-host');
    serveHops(hops);

    const icon = await getIconForUrl(hops[0]!.url);

    expect(icon?.contentType).toBe('image/png');
    expect(fetchedUrls()).toEqual(hops.map((hop) => hop.url));
    expect(fetchedUrls()[1]).toBe(new URL(hops[0]!.headers['location']!, hops[0]!.url).href);
  });

  it('gives up after three redirect hops', async () => {
    const chain = Array.from({ length: MAX_REDIRECT_HOPS + 2 }, (_, index) => ({
      url: `https://hop-${index}.example.com/favicon.ico`,
      status: 302,
      headers: { location: `https://hop-${index + 1}.example.com/favicon.ico` },
    }));
    serveHops(chain);

    await expect(getIconForUrl(chain[0]!.url)).resolves.toBeNull();
    expect(fetchedUrls()).toHaveLength(MAX_REDIRECT_HOPS + 1);
  });

  it('stops the chain when a redirect target fails the egress guard', async () => {
    serveHops([
      {
        url: 'https://public.example.com/favicon.ico',
        status: 301,
        headers: { location: 'https://169.254.169.254/latest/meta-data' },
      },
    ]);
    mocks.assertResolvedPublicHostname
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('internal host'));

    await expect(getIconForUrl('https://public.example.com/favicon.ico')).resolves.toBeNull();
    expect(fetchedUrls()).toEqual(['https://public.example.com/favicon.ico']);
  });

  it('refuses a redirect to a non-http scheme', async () => {
    serveHops([
      {
        url: 'https://public.example.com/favicon.ico',
        status: 302,
        headers: { location: 'file:///etc/passwd' },
      },
    ]);

    await expect(getIconForUrl('https://public.example.com/favicon.ico')).resolves.toBeNull();
    expect(fetchedUrls()).toHaveLength(1);
  });
});

describe('fetchPageHead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
  });

  it('returns the html and the final url after a vetted redirect', async () => {
    const html = '<html><head><link rel="icon" href="/i.png"></head></html>';
    serveHops([
      {
        url: 'https://example.com/',
        status: 301,
        headers: { location: 'https://www.example.com/' },
      },
      {
        url: 'https://www.example.com/',
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        bodyBase64: Buffer.from(html).toString('base64'),
      },
    ]);

    await expect(fetchPageHead('https://example.com/')).resolves.toEqual({
      url: 'https://www.example.com/',
      html,
    });
    expect(assertedUrls()).toEqual(['https://example.com/', 'https://www.example.com/']);
  });

  it('keeps only the first 64 KB of a long page', async () => {
    const chunk = new Uint8Array(20_000).fill(120);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 5; index += 1) controller.enqueue(chunk);
        controller.close();
      },
    });
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }),
    );

    const head = await fetchPageHead('https://www.example.com/');

    expect(head?.url).toBe('https://www.example.com/');
    expect(Buffer.byteLength(head?.html ?? '')).toBe(PAGE_HEAD_MAX_BYTES);
  });

  it('rejects a page that is not html or not ok', async () => {
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(PNG_BYTES, { 'content-type': 'image/png' }),
    );
    await expect(fetchPageHead('https://www.example.com/')).resolves.toBeNull();

    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(new Uint8Array([60]), { 'content-type': 'text/html' }, 404),
    );
    await expect(fetchPageHead('https://www.example.com/missing')).resolves.toBeNull();
  });
});
