import { beforeEach, describe, expect, it, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import { pinnedAddressesFor } from '@/lib/egress-policy';
import { createDeadline, guardedFetch, type GuardedFetchOutcome } from './guarded-fetch';

const PUBLIC_ADDRESS = '93.184.216.34';

/** Every way a page has tried to name an address this process must not reach. */
const HOSTILE_TARGETS: ReadonlyArray<readonly [string, string]> = [
  ['the cloud metadata endpoint', 'http://169.254.169.254/latest/meta-data/iam/'],
  ['loopback', 'http://127.0.0.1:8080/admin'],
  ['loopback by name', 'http://localhost:6379/'],
  ['IPv6 loopback', 'http://[::1]/admin'],
  ['IPv4-mapped IPv6 loopback', 'http://[::ffff:127.0.0.1]/'],
  ['IPv4-mapped IPv6 metadata', 'http://[::ffff:169.254.169.254]/'],
  ['IPv6 unique local', 'http://[fd00::1]/'],
  ['IPv6 link local', 'http://[fe80::1]/'],
  ['decimal IPv4 for loopback', 'http://2130706433/'],
  ['hex IPv4 for loopback', 'http://0x7f000001/'],
  ['octal IPv4 for loopback', 'http://0177.0.0.1/'],
  ['decimal IPv4 for the metadata endpoint', 'http://2852039166/'],
  ['private class A', 'http://10.0.0.5/internal'],
  ['private class B', 'http://172.16.0.1/'],
  ['private class C', 'http://192.168.1.1/router'],
  ['shared address space', 'http://100.64.0.1/'],
];

const OTHER_SCHEMES: ReadonlyArray<readonly [string, string]> = [
  ['file', 'file:///etc/passwd'],
  ['gopher', 'gopher://example.com:70/_'],
  ['ftp', 'ftp://example.com/x'],
  ['data', 'data:text/html,<p>x</p>'],
  ['javascript', 'javascript:alert(1)'],
];

const HEADERS = { Accept: 'text/html', 'User-Agent': 'test' } as const;

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

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

function page(): Response {
  return new Response('<title>reached</title>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

async function fetchThrough(
  start: string,
  plan: (call: number, url: string) => Response,
  maxRedirects = 3,
): Promise<{ outcome: GuardedFetchOutcome; urls: string[] }> {
  const { impl, urls } = recording(plan);
  const deadline = createDeadline(5_000);
  try {
    const outcome = await guardedFetch(new URL(start), {
      deadline,
      maxRedirects,
      headers: HEADERS,
      fetchImpl: impl,
    });
    return { outcome, urls };
  } finally {
    deadline.release();
  }
}

beforeEach(() => {
  dnsMocks.lookup.mockReset();
  dnsMocks.lookup.mockResolvedValue([{ address: PUBLIC_ADDRESS, family: 4 }]);
});

describe('a redirect never reaches an address the policy refuses', () => {
  it.each(HOSTILE_TARGETS)('refuses %s offered by a redirect', async (_label, target) => {
    const { outcome, urls } = await fetchThrough('https://start.example/', (call) =>
      call === 1 ? redirectTo(target) : page(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('blocked_host');
    expect(urls).toEqual(['https://start.example/']);
  });

  it.each(HOSTILE_TARGETS)('refuses %s named as the first target', async (_label, target) => {
    const { outcome, urls } = await fetchThrough(target, () => page());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('blocked_host');
    expect(urls).toEqual([]);
  });

  it.each(HOSTILE_TARGETS)(
    'refuses %s at the last hop the budget allows',
    async (_label, target) => {
      const { outcome, urls } = await fetchThrough(
        'https://start.example/',
        (call) => redirectTo(call < 3 ? `https://hop${call}.example/` : target),
        3,
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.refusal).toBe('blocked_host');
      expect(urls).toHaveLength(3);
      expect(urls.some((url) => url.includes(new URL(target).hostname))).toBe(false);
    },
  );
});

describe('a redirect never changes what protocol is spoken', () => {
  it.each(OTHER_SCHEMES)('refuses a redirect to %s', async (_label, target) => {
    const { outcome, urls } = await fetchThrough('https://start.example/', (call) =>
      call === 1 ? redirectTo(target) : page(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('unsupported_scheme');
    expect(urls).toEqual(['https://start.example/']);
  });

  it('refuses a redirect that adds credentials to the target', async () => {
    const { outcome, urls } = await fetchThrough('https://start.example/', (call) =>
      call === 1 ? redirectTo('https://user:secret@second.example/') : page(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('embedded_credentials');
    expect(urls).toEqual(['https://start.example/']);
  });
});

describe('a chain is bounded', () => {
  it('stops one hop past the bound rather than following forever', async () => {
    const { outcome, urls } = await fetchThrough(
      'https://start.example/',
      (call) => redirectTo(`https://hop${call}.example/`),
      3,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('too_many_redirects');
    expect(urls).toHaveLength(4);
  });

  it('refuses a redirect loop back to the same host at the bound', async () => {
    const { outcome, urls } = await fetchThrough(
      'https://loop.example/',
      () => redirectTo('https://loop.example/'),
      2,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('too_many_redirects');
    expect(urls).toHaveLength(3);
  });

  it('reports a redirect with no destination rather than retrying it', async () => {
    const { outcome } = await fetchThrough(
      'https://start.example/',
      () => new Response(null, { status: 302 }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('missing_location');
  });
});

describe('the address that was vetted is the address that is used', () => {
  it('pins exactly the answers the policy accepted', async () => {
    dnsMocks.lookup.mockResolvedValue([
      { address: PUBLIC_ADDRESS, family: 4 },
      { address: '93.184.216.35', family: 4 },
    ]);
    const { outcome } = await fetchThrough('https://pinned.example/', () => page());
    expect(outcome.ok).toBe(true);
    expect(pinnedAddressesFor('pinned.example')).toEqual([
      { address: PUBLIC_ADDRESS, family: 4 },
      { address: '93.184.216.35', family: 4 },
    ]);
  });

  it('refuses the second hop when the same host starts resolving private', async () => {
    dnsMocks.lookup
      .mockResolvedValueOnce([{ address: PUBLIC_ADDRESS, family: 4 }])
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);

    const { outcome, urls } = await fetchThrough('https://rebind.example/a', (call) =>
      call === 1 ? redirectTo('https://rebind.example/b') : page(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('blocked_host');
    expect(urls).toEqual(['https://rebind.example/a']);
    expect(dnsMocks.lookup).toHaveBeenCalledTimes(2);
  });

  it('leaves no pin behind for a host that answered with a private address', async () => {
    dnsMocks.lookup.mockResolvedValue([
      { address: PUBLIC_ADDRESS, family: 4 },
      { address: '10.1.2.3', family: 4 },
    ]);
    const { outcome } = await fetchThrough('https://mixed.example/', () => page());
    expect(outcome.ok).toBe(false);
    expect(pinnedAddressesFor('mixed.example')).toBeNull();
  });

  it('re-resolves on every hop rather than trusting the first answer', async () => {
    const { outcome, urls } = await fetchThrough(
      'https://one.example/',
      (call) => (call < 3 ? redirectTo(`https://hop${call}.example/`) : page()),
      5,
    );
    expect(outcome.ok).toBe(true);
    expect(urls).toHaveLength(3);
    expect(dnsMocks.lookup).toHaveBeenCalledTimes(3);
  });
});

describe('nothing the caller holds travels to an unvetted host', () => {
  it('refuses to be given a cookie or authorization header at all', async () => {
    const deadline = createDeadline(1_000);
    for (const header of ['Cookie', 'authorization', 'Proxy-Authorization']) {
      await expect(
        guardedFetch(new URL('https://start.example/'), {
          deadline,
          maxRedirects: 1,
          headers: { [header]: 'secret' },
          fetchImpl: recording(() => page()).impl,
        }),
      ).rejects.toThrow(/refuses to send a/i);
    }
    deadline.release();
  });

  it('sends only the headers it was given, on every hop', async () => {
    const seen: Array<Record<string, string>> = [];
    const impl = (async (_input: string | URL | Request, init: RequestInit = {}) => {
      seen.push(Object.fromEntries(new Headers(init.headers).entries()));
      return seen.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: 'https://second.example/', 'set-cookie': 'a=b' },
          })
        : page();
    }) as unknown as typeof fetch;

    const deadline = createDeadline(5_000);
    await guardedFetch(new URL('https://first.example/'), {
      deadline,
      maxRedirects: 3,
      headers: HEADERS,
      fetchImpl: impl,
    });
    deadline.release();

    expect(seen).toHaveLength(2);
    for (const headers of seen) {
      expect(Object.keys(headers).sort()).toEqual(['accept', 'user-agent']);
    }
  });
});

describe('a caller can stop at a redirect target instead of fetching it', () => {
  it('hands back the first destination it was told not to follow', async () => {
    const { impl, urls } = recording((call) =>
      redirectTo(call === 1 ? 'https://router.example/b' : 'https://publisher.example/story'),
    );
    const deadline = createDeadline(5_000);
    const outcome = await guardedFetch(new URL('https://router.example/a'), {
      deadline,
      maxRedirects: 3,
      headers: HEADERS,
      fetchImpl: impl,
      followRedirect: (next) => next.hostname === 'router.example',
    });
    deadline.release();

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.kind).toBe('redirect');
      if (outcome.kind === 'redirect')
        expect(outcome.url.href).toBe('https://publisher.example/story');
    }
    expect(urls).toEqual(['https://router.example/a', 'https://router.example/b']);
  });

  it('still refuses a destination it was told not to follow when the scheme is wrong', async () => {
    const { impl, urls } = recording(() => redirectTo('gopher://publisher.example/_'));
    const deadline = createDeadline(5_000);
    const outcome = await guardedFetch(new URL('https://router.example/a'), {
      deadline,
      maxRedirects: 3,
      headers: HEADERS,
      fetchImpl: impl,
      followRedirect: () => false,
    });
    deadline.release();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.refusal).toBe('unsupported_scheme');
    expect(urls).toEqual(['https://router.example/a']);
  });
});
