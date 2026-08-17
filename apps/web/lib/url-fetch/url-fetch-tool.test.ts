import { beforeEach, describe, it, expect, vi } from 'vitest';

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({
  default: { lookup: dnsMocks.lookup },
  lookup: dnsMocks.lookup,
}));

import {
  executeUrlFetch,
  extractHtmlText,
  extractHtmlTitle,
  decodeHtmlEntities,
  urlFetchToolDef,
  isUrlFetchTool,
  URL_FETCH_TOOL,
  URL_FETCH_MAX_EXTRACT_CHARS,
} from './url-fetch-tool';

function resolvePublic() {
  dnsMocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
}

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
    ...init,
  });
}

function fetchReturning(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

beforeEach(() => {
  dnsMocks.lookup.mockReset();
});

describe('tool identity and definition', () => {
  it('urlFetchToolDef exposes a function tool named url_fetch requiring url', () => {
    const def = urlFetchToolDef();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe(URL_FETCH_TOOL);
    expect((def.function.parameters['required'] as string[]).includes('url')).toBe(true);
  });

  it('isUrlFetchTool matches only the exact tool name', () => {
    expect(isUrlFetchTool('url_fetch')).toBe(true);
    expect(isUrlFetchTool('web_fetch')).toBe(false);
    expect(isUrlFetchTool('url_fetch_2')).toBe(false);
  });
});

describe('SSRF rejection matrix', () => {
  const neverFetch = vi.fn(async () => {
    throw new Error('fetch must not be called for blocked URLs');
  }) as unknown as typeof fetch;

  it.each([
    'http://localhost/admin',
    'http://127.0.0.1:8080/',
    'https://10.0.0.5/internal',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/',
    'https://192.168.1.1/router',
    'https://172.16.0.1/',
  ])('blocks %s without issuing a request', async (url) => {
    const outcome = await executeUrlFetch({ url }, { fetchImpl: neverFetch });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('url_not_allowed');
    expect(neverFetch).not.toHaveBeenCalled();
  });

  it('blocks a public-looking hostname whose DNS resolves to a private address', async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: '10.1.2.3', family: 4 }]);
    const outcome = await executeUrlFetch(
      { url: 'https://rebind.attacker.example/' },
      { fetchImpl: neverFetch },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('url_not_allowed');
    expect(neverFetch).not.toHaveBeenCalled();
  });

  it('blocks a redirect to a private address (per-hop validation)', async () => {
    resolvePublic();
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/creds' } }),
    ) as unknown as typeof fetch;

    const outcome = await executeUrlFetch({ url: 'https://example.com/page' }, { fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('url_not_allowed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('blocks URLs with embedded credentials', async () => {
    const outcome = await executeUrlFetch(
      { url: 'https://user:pass@example.com/' },
      { fetchImpl: neverFetch },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('url_not_allowed');
  });

  it('rejects non-http(s) schemes as invalid input', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'javascript:alert(1)']) {
      const outcome = await executeUrlFetch({ url }, { fetchImpl: neverFetch });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.errorCode).toBe('invalid_tool_input');
    }
  });

  it('rejects missing/non-string url arguments', async () => {
    for (const args of [{}, { url: 42 }, { url: '' }, { url: '   ' }]) {
      const outcome = await executeUrlFetch(args as Record<string, unknown>, {
        fetchImpl: neverFetch,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.errorCode).toBe('invalid_tool_input');
    }
  });
});

describe('redirect handling', () => {
  it('follows a public redirect chain and returns the final page', async () => {
    resolvePublic();
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return new Response(null, {
          status: 301,
          headers: { location: 'https://example.com/final' },
        });
      }
      return htmlResponse(
        '<html><title>Final</title><body><p>Landed here after redirect.</p></body></html>',
      );
    }) as unknown as typeof fetch;

    const outcome = await executeUrlFetch({ url: 'https://example.com/start' }, { fetchImpl });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.url).toBe('https://example.com/final');
      expect(outcome.title).toBe('Final');
      expect(outcome.content).toContain('Landed here after redirect.');
    }
  });

  it('fails honestly after too many redirects', async () => {
    resolvePublic();
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, { status: 302, headers: { location: 'https://example.com/loop' } }),
    ) as unknown as typeof fetch;

    const outcome = await executeUrlFetch(
      { url: 'https://example.com/a' },
      { fetchImpl, maxRedirects: 2 },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('too_many_redirects');
  });
});

describe('timeout', () => {
  it('returns a timeout error when the request exceeds the deadline', async () => {
    resolvePublic();
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;

    const outcome = await executeUrlFetch(
      { url: 'https://example.com/slow' },
      { fetchImpl, timeoutMs: 20 },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe('timeout');
      expect(outcome.error).toContain('20ms');
    }
  });
});

describe('size cap', () => {
  it('rejects via Content-Length before reading the body', async () => {
    resolvePublic();
    const fetchImpl = fetchReturning(
      new Response('x', {
        status: 200,
        headers: { 'content-type': 'text/plain', 'content-length': '99999999' },
      }),
    );
    const outcome = await executeUrlFetch({ url: 'https://example.com/big' }, { fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('response_too_large');
  });

  it('rejects when the streamed body exceeds the byte cap', async () => {
    resolvePublic();
    const chunk = new TextEncoder().encode('a'.repeat(1024));
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
    });
    const fetchImpl = fetchReturning(
      new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const outcome = await executeUrlFetch(
      { url: 'https://example.com/stream' },
      { fetchImpl, maxResponseBytes: 4096 },
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('response_too_large');
  });
});

describe('content-type allowlist', () => {
  it.each(['image/png', 'application/pdf', 'application/octet-stream', 'video/mp4', ''])(
    'rejects unsupported content type %s honestly',
    async (contentType) => {
      resolvePublic();
      const headers: Record<string, string> = {};
      if (contentType) headers['content-type'] = contentType;
      const fetchImpl = fetchReturning(
        new Response(new TextEncoder().encode('binarydata'), { status: 200, headers }),
      );
      const outcome = await executeUrlFetch({ url: 'https://example.com/file' }, { fetchImpl });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.errorCode).toBe('unsupported_content_type');
        expect(outcome.error).toContain('not supported');
      }
    },
  );

  it.each([
    ['text/plain', 'plain text body'],
    ['text/markdown', '# heading\n\nbody'],
    ['application/json', '{"key":"value"}'],
  ])('accepts %s as-is', async (contentType, body) => {
    resolvePublic();
    const fetchImpl = fetchReturning(
      new Response(body, { status: 200, headers: { 'content-type': contentType } }),
    );
    const outcome = await executeUrlFetch({ url: 'https://example.com/doc' }, { fetchImpl });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.content).toBe(body.trim());
  });
});

describe('HTTP errors', () => {
  it.each([404, 403, 500, 503])('maps HTTP %s to url_not_accessible', async (status) => {
    resolvePublic();
    const fetchImpl = fetchReturning(
      new Response('err', { status, headers: { 'content-type': 'text/html' } }),
    );
    const outcome = await executeUrlFetch({ url: 'https://example.com/missing' }, { fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.errorCode).toBe('url_not_accessible');
      expect(outcome.error).toContain(String(status));
    }
  });

  it('maps network failure to url_not_accessible (never throws)', async () => {
    resolvePublic();
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const outcome = await executeUrlFetch({ url: 'https://example.com/x' }, { fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('url_not_accessible');
  });
});

describe('HTML extraction', () => {
  it('strips scripts, styles, and nav chrome; keeps article prose', () => {
    const html = `
      <html><head><title>My Page</title><style>.x{color:red}</style></head>
      <body>
        <nav><a href="/">Home</a><a href="/about">About</a></nav>
        <article>
          <h1>Real Heading</h1>
          <p>First paragraph of meaningful content that should definitely survive extraction because it carries the substance of the page.</p>
          <p>Second paragraph with &amp; entities &lt;escaped&gt; and a &#39;quote&#39;.</p>
          <script>alert("do not include me")</script>
        </article>
        <footer>Copyright boilerplate</footer>
      </body></html>`;
    const text = extractHtmlText(html);
    expect(text).toContain('Real Heading');
    expect(text).toContain('First paragraph of meaningful content');
    expect(text).toContain("& entities <escaped> and a 'quote'");
    expect(text).not.toContain('alert(');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('Copyright boilerplate');
    expect(text).not.toContain('Home');
  });

  it('falls back to body text when there is no article/main region', () => {
    const html = '<html><body><div><p>Just a bare page.</p></div></body></html>';
    expect(extractHtmlText(html)).toBe('Just a bare page.');
  });

  it('extracts and entity-decodes the title', () => {
    expect(extractHtmlTitle('<html><head><title>A &amp; B</title></head></html>')).toBe('A & B');
    expect(extractHtmlTitle('<html><head></head></html>')).toBeUndefined();
  });

  it('decodes numeric entities and leaves unknown named entities intact', () => {
    expect(decodeHtmlEntities('&#72;&#x69; &amp; &notarealentity;')).toBe('Hi & &notarealentity;');
  });

  it('derives a title from the URL when the page has none', async () => {
    resolvePublic();
    const fetchImpl = fetchReturning(
      htmlResponse('<html><body><p>No title here but plenty of text content.</p></body></html>'),
    );
    const outcome = await executeUrlFetch({ url: 'https://example.com/docs/intro' }, { fetchImpl });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.title).toBe('example.com/intro');
  });

  it('returns an honest error for pages with no readable text', async () => {
    resolvePublic();
    const fetchImpl = fetchReturning(
      htmlResponse('<html><body><script>window.app()</script></body></html>'),
    );
    const outcome = await executeUrlFetch({ url: 'https://example.com/spa' }, { fetchImpl });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.errorCode).toBe('url_not_accessible');
  });
});

describe('extraction is linear in hostile HTML (no polynomial ReDoS)', () => {
  const BUDGET_MS = 1_000;

  function elapsed(run: () => void): number {
    const started = Date.now();
    run();
    return Date.now() - started;
  }

  it.each([
    ['unterminated comments', () => '<!--'.repeat(75_000)],
    ['unterminated drop elements', () => '<script '.repeat(40_000)],
    ['unterminated chrome elements', () => '<form '.repeat(50_000)],
    ['unterminated region elements', () => '<article '.repeat(35_000)],
    ['unterminated doctypes', () => '<!DOCTYPE '.repeat(30_000)],
    ['unclosed angle brackets', () => '<'.repeat(300_000)],
  ])(
    'extractHtmlText survives %s within the time budget',
    (_label, build) => {
      const html = build();
      expect(html.length).toBeGreaterThan(URL_FETCH_MAX_EXTRACT_CHARS);
      const ms = elapsed(() => extractHtmlText(html));
      expect(ms).toBeLessThan(BUDGET_MS);
    },
    120_000,
  );

  it('extractHtmlTitle survives unterminated title tags within the time budget', () => {
    const html = '<title>'.repeat(50_000);
    expect(html.length).toBeGreaterThan(URL_FETCH_MAX_EXTRACT_CHARS);
    const ms = elapsed(() => extractHtmlTitle(html));
    expect(ms).toBeLessThan(BUDGET_MS);
  }, 120_000);

  it('executeUrlFetch survives a hostile page inside the request deadline', async () => {
    resolvePublic();
    const hostile = `<html><body><p>${'<!--'.repeat(120_000)}</p></body></html>`;
    const fetchImpl = fetchReturning(htmlResponse(hostile));
    const started = Date.now();
    const outcome = await executeUrlFetch({ url: 'https://example.com/hostile' }, { fetchImpl });
    expect(Date.now() - started).toBeLessThan(BUDGET_MS);
    expect(outcome.ok).toBe(false);
  }, 120_000);

  it('bounds extraction input so bytes past the cap cannot be scanned', () => {
    const padding = '<p>filler</p>'.repeat(30_000);
    expect(padding.length).toBeGreaterThan(URL_FETCH_MAX_EXTRACT_CHARS);
    const text = extractHtmlText(`<html><body>${padding}<p>PAST_THE_CAP</p></body></html>`);
    expect(text).toContain('filler');
    expect(text).not.toContain('PAST_THE_CAP');
  });
});

describe('truncation', () => {
  it('caps extracted text and appends an explicit truncation note', async () => {
    resolvePublic();
    const longText = 'word '.repeat(2000);
    const fetchImpl = fetchReturning(
      new Response(longText, { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const outcome = await executeUrlFetch(
      { url: 'https://example.com/long' },
      { fetchImpl, maxContentChars: 500 },
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.truncated).toBe(true);
      expect(outcome.content).toContain('[Content truncated: showing the first 500 of');
      expect(outcome.content.length).toBeLessThan(700);
    }
  });

  it('does not add a note below the cap', async () => {
    resolvePublic();
    const fetchImpl = fetchReturning(
      new Response('short body', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const outcome = await executeUrlFetch({ url: 'https://example.com/short' }, { fetchImpl });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.truncated).toBe(false);
      expect(outcome.content).not.toContain('[Content truncated');
    }
  });
});
