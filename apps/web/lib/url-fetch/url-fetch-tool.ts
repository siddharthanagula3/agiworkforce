
import { assertResolvedPublicHostname, EgressPolicyError } from '@/lib/egress-policy';

export const URL_FETCH_TOOL = 'url_fetch';

export function isUrlFetchTool(name: string): boolean {
  return name === URL_FETCH_TOOL;
}

export const URL_FETCH_TIMEOUT_MS = 10_000;
export const URL_FETCH_MAX_RESPONSE_BYTES = 1_572_864;
export const URL_FETCH_MAX_CONTENT_CHARS = 20_000;
export const URL_FETCH_MAX_REDIRECTS = 5;
const MAX_URL_LENGTH = 2_048;

const ALLOWED_CONTENT_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/json',
]);

export type UrlFetchErrorCode =
  | 'invalid_tool_input'
  | 'url_not_allowed'
  | 'url_not_accessible'
  | 'timeout'
  | 'response_too_large'
  | 'unsupported_content_type'
  | 'too_many_redirects';

export type UrlFetchOutcome =
  | {
      ok: true;
      url: string;
      title: string;
      content: string;
      truncated: boolean;
    }
  | { ok: false; errorCode: UrlFetchErrorCode; error: string };

export function urlFetchToolDef(): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: URL_FETCH_TOOL,
      description:
        'Fetch a public web page (http/https URL) and return its extracted text content. ' +
        'Use when the user provides a URL or when you need the contents of a specific page. ' +
        'Supports HTML, plain text, Markdown, and JSON pages; binary content is not supported. ' +
        'Only fetch URLs that appear in the conversation or in prior tool results.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The absolute http(s) URL of the page to fetch.',
          },
        },
        required: ['url'],
      },
    },
  };
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  copy: '©',
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : '';
    })
    .replace(
      /&([a-zA-Z]+);/g,
      (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match,
    );
}

export function extractHtmlTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m?.[1]) return undefined;
  const title = decodeHtmlEntities(m[1]).replace(/\s+/g, ' ').trim();
  return title || undefined;
}

const DROP_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas'];
const CHROME_ELEMENTS = ['nav', 'header', 'footer', 'aside', 'form'];

function stripElement(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}\\s*>`, 'gi');
  return html.replace(re, ' ');
}

export function extractHtmlText(html: string): string {
  let doc = html
    // Comments and doctype first so nothing inside them survives.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!DOCTYPE[^>]*>/gi, ' ');

  for (const tag of DROP_ELEMENTS) doc = stripElement(doc, tag);

  const region = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1\s*>/i.exec(doc);
  if (region?.[2] && region[2].replace(/<[^>]+>/g, '').trim().length >= 200) {
    doc = region[2];
  } else {
    const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(doc);
    if (body?.[1]) doc = body[1];
  }

  for (const tag of CHROME_ELEMENTS) doc = stripElement(doc, tag);

  const text = doc
    // Block-level closers and <br>/<hr> become line breaks so structure survives.
    .replace(
      /<\/(p|div|section|li|ul|ol|h[1-6]|tr|table|blockquote|pre|figure|figcaption|dd|dt)\s*>/gi,
      '\n',
    )
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    // Everything else: strip the tag, keep the text.
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(text)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleFromUrl(url: URL): string {
  const segment = url.pathname.split('/').filter(Boolean).pop();
  return segment ? `${url.hostname}/${segment}` : url.hostname;
}

export interface UrlFetchOverrides {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxContentChars?: number;
  maxRedirects?: number;
}

function err(errorCode: UrlFetchErrorCode, error: string): UrlFetchOutcome {
  return { ok: false, errorCode, error };
}

async function readBodyCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const body = response.body;
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => undefined);
          return null;
        }
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function executeUrlFetch(
  args: Record<string, unknown>,
  overrides: UrlFetchOverrides = {},
): Promise<UrlFetchOutcome> {
  const fetchImpl = overrides.fetchImpl ?? fetch;
  const timeoutMs = overrides.timeoutMs ?? URL_FETCH_TIMEOUT_MS;
  const maxResponseBytes = overrides.maxResponseBytes ?? URL_FETCH_MAX_RESPONSE_BYTES;
  const maxContentChars = overrides.maxContentChars ?? URL_FETCH_MAX_CONTENT_CHARS;
  const maxRedirects = overrides.maxRedirects ?? URL_FETCH_MAX_REDIRECTS;

  const rawUrl = args['url'];
  if (typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
    return err('invalid_tool_input', 'url_fetch requires a non-empty string "url" argument.');
  }
  if (rawUrl.length > MAX_URL_LENGTH) {
    return err(
      'invalid_tool_input',
      `URL exceeds the maximum length of ${MAX_URL_LENGTH} characters.`,
    );
  }

  let current: URL;
  try {
    current = new URL(rawUrl.trim());
  } catch {
    return err('invalid_tool_input', `Malformed URL: ${rawUrl}`);
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response: Response | null = null;

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (current.protocol !== 'http:' && current.protocol !== 'https:') {
        return err(
          'invalid_tool_input',
          `Unsupported URL scheme "${current.protocol}" — only http/https.`,
        );
      }
      if (current.username !== '' || current.password !== '') {
        return err('url_not_allowed', 'URLs with embedded credentials are not allowed.');
      }

      try {
        await assertResolvedPublicHostname(current.href);
      } catch (guardErr) {
        if (guardErr instanceof EgressPolicyError) {
          return err(
            'url_not_allowed',
            `URL blocked: ${current.hostname} is not a resolvable public host.`,
          );
        }
        throw guardErr;
      }

      try {
        response = await fetchImpl(current.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            Accept: 'text/html, text/plain, text/markdown, application/json;q=0.9, */*;q=0.1',
            'User-Agent': 'AGIWorkforce-URLFetch/1.0 (+https://agiworkforce.com)',
          },
        });
      } catch (fetchErr) {
        if (controller.signal.aborted) {
          return err('timeout', `Fetch timed out after ${timeoutMs}ms: ${current.href}`);
        }
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        return err('url_not_accessible', `Failed to fetch ${current.href}: ${msg}`);
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        await response.body?.cancel().catch(() => undefined);
        if (!location) {
          return err(
            'url_not_accessible',
            `Redirect (${response.status}) without a Location header.`,
          );
        }
        let next: URL;
        try {
          next = new URL(location, current);
        } catch {
          return err('url_not_accessible', `Redirect to a malformed URL: ${location}`);
        }
        if (hop === maxRedirects) {
          return err(
            'too_many_redirects',
            `Exceeded ${maxRedirects} redirects fetching ${rawUrl}.`,
          );
        }
        current = next;
        response = null;
        continue;
      }
      break;
    }

    if (!response) {
      return err('too_many_redirects', `Exceeded ${maxRedirects} redirects fetching ${rawUrl}.`);
    }
    if (!response.ok) {
      return err('url_not_accessible', `HTTP ${response.status} fetching ${current.href}.`);
    }

    const contentTypeHeader = response.headers.get('content-type') ?? '';
    const mime = contentTypeHeader.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!ALLOWED_CONTENT_TYPES.has(mime)) {
      await response.body?.cancel().catch(() => undefined);
      return err(
        'unsupported_content_type',
        `Content type "${mime || 'unknown'}" is not supported. ` +
          'Supported: text/html, text/plain, text/markdown, application/json.',
      );
    }

    const declaredLength = Number(response.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
      await response.body?.cancel().catch(() => undefined);
      return err(
        'response_too_large',
        `Response is ${declaredLength} bytes — exceeds the ${maxResponseBytes}-byte limit.`,
      );
    }

    let bytes: Uint8Array | null;
    try {
      bytes = await readBodyCapped(response, maxResponseBytes);
    } catch (readErr) {
      if (controller.signal.aborted) {
        return err('timeout', `Fetch timed out after ${timeoutMs}ms: ${current.href}`);
      }
      const msg = readErr instanceof Error ? readErr.message : String(readErr);
      return err('url_not_accessible', `Failed reading response body: ${msg}`);
    }
    if (bytes === null) {
      return err(
        'response_too_large',
        `Response exceeded the ${maxResponseBytes}-byte limit while downloading.`,
      );
    }

    const raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const isHtml = mime === 'text/html' || mime === 'application/xhtml+xml';
    const extracted = isHtml ? extractHtmlText(raw) : raw.trim();
    const title = (isHtml ? extractHtmlTitle(raw) : undefined) ?? titleFromUrl(current);

    if (extracted.length === 0) {
      return err('url_not_accessible', `No readable text content at ${current.href}.`);
    }

    let content = extracted;
    let truncated = false;
    if (content.length > maxContentChars) {
      truncated = true;
      content =
        content.slice(0, maxContentChars) +
        `\n\n[Content truncated: showing the first ${maxContentChars.toLocaleString('en-US')} of ` +
        `${extracted.length.toLocaleString('en-US')} extracted characters.]`;
    }

    return { ok: true, url: current.href, title, content, truncated };
  } finally {
    clearTimeout(deadline);
  }
}
