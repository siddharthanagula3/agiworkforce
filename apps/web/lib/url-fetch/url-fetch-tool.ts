import {
  assertResolvedPublicHostname,
  EgressPolicyError,
  pinnedPublicFetch,
} from '@/lib/egress-policy';

export const URL_FETCH_TOOL = 'url_fetch';

export function isUrlFetchTool(name: string): boolean {
  return name === URL_FETCH_TOOL;
}

export const URL_FETCH_MAX_CALLS_PER_TURN = 5;
export const URL_FETCH_MAX_CALLS_PER_AGI_WORK_TURN = 15;

export function urlFetchBudgetExhaustedMessage(limit: number): string {
  return (
    `Fetch budget reached: this turn has already fetched its ${limit} allowed ` +
    'pages. No further fetches will run. Answer now using the pages you already ' +
    'read, and say plainly which parts you could not confirm.'
  );
}

export const URL_FETCH_TIMEOUT_MS = 10_000;
export const URL_FETCH_MAX_RESPONSE_BYTES = 1_572_864;
export const URL_FETCH_MAX_CONTENT_CHARS = 20_000;
export const URL_FETCH_MAX_EXTRACT_CHARS = 262_144;
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
  | 'cancelled'
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

const DROP_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'canvas'];
const CHROME_ELEMENTS = ['nav', 'header', 'footer', 'aside', 'form'];
const BLOCK_ELEMENTS = new Set([
  'p',
  'div',
  'section',
  'li',
  'ul',
  'ol',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
  'table',
  'blockquote',
  'pre',
  'figure',
  'figcaption',
  'dd',
  'dt',
]);
const LINE_BREAK_ELEMENTS = new Set(['br', 'hr']);

const NAME_CHAR = /[a-zA-Z0-9_]/;
const WHITESPACE_CHAR = /\s/;

// Every scanner below walks the document with indexOf instead of a lazy
// quantifier: `<tag ...>[\s\S]*?</tag>` over attacker-controlled HTML rescans to
// end-of-input from every unterminated opening delimiter (js/polynomial-redos).
function bound(html: string): string {
  return html.length > URL_FETCH_MAX_EXTRACT_CHARS
    ? html.slice(0, URL_FETCH_MAX_EXTRACT_CHARS)
    : html;
}

function findOpenTag(lower: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  for (let at = lower.indexOf(needle, from); at !== -1; at = lower.indexOf(needle, at + 1)) {
    const next = lower[at + needle.length];
    if (next === undefined || !NAME_CHAR.test(next)) return at;
  }
  return -1;
}

function findCloseTag(
  lower: string,
  tag: string,
  from: number,
): { start: number; end: number } | null {
  const needle = `</${tag}`;
  for (let at = lower.indexOf(needle, from); at !== -1; at = lower.indexOf(needle, at + 1)) {
    let cursor = at + needle.length;
    while (cursor < lower.length && WHITESPACE_CHAR.test(lower[cursor]!)) cursor += 1;
    if (lower[cursor] === '>') return { start: at, end: cursor + 1 };
  }
  return null;
}

function findRegion(
  html: string,
  lower: string,
  tag: string,
): { start: number; end: number } | null {
  const open = findOpenTag(lower, tag, 0);
  if (open === -1) return null;
  const gt = html.indexOf('>', open);
  if (gt === -1) return null;
  const close = findCloseTag(lower, tag, gt + 1);
  return close ? { start: gt + 1, end: close.start } : null;
}

function stripComments(html: string): string {
  let out = '';
  let cursor = 0;
  for (let open = html.indexOf('<!--'); open !== -1; open = html.indexOf('<!--', cursor)) {
    out += `${html.slice(cursor, open)} `;
    const close = html.indexOf('-->', open + 4);
    if (close === -1) return out;
    cursor = close + 3;
  }
  return out + html.slice(cursor);
}

function stripDoctype(html: string, lower: string): string {
  let out = '';
  let cursor = 0;
  for (
    let open = lower.indexOf('<!doctype');
    open !== -1;
    open = lower.indexOf('<!doctype', cursor)
  ) {
    out += `${html.slice(cursor, open)} `;
    const close = html.indexOf('>', open + 9);
    if (close === -1) return out;
    cursor = close + 1;
  }
  return out + html.slice(cursor);
}

function stripElement(html: string, tag: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const open = findOpenTag(lower, tag, cursor);
    if (open === -1) break;
    const close = findCloseTag(lower, tag, open + tag.length + 1);
    if (!close) break;
    out += `${html.slice(cursor, open)} `;
    cursor = close.end;
  }
  return out + html.slice(cursor);
}

function stripAllTags(html: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const lt = html.indexOf('<', cursor);
    if (lt === -1) return out + html.slice(cursor);
    out += html.slice(cursor, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) return out;
    if (gt === lt + 1) {
      out += '<';
      cursor = lt + 1;
      continue;
    }
    cursor = gt + 1;
  }
  return out;
}

function tagNameAt(html: string, lt: number, gt: number): { name: string; closing: boolean } {
  let start = lt + 1;
  const closing = html[start] === '/';
  if (closing) start += 1;
  let end = start;
  while (end < gt && NAME_CHAR.test(html[end]!)) end += 1;
  return { name: html.slice(start, end).toLowerCase(), closing };
}

function toText(html: string): string {
  let out = '';
  let cursor = 0;
  while (cursor < html.length) {
    const lt = html.indexOf('<', cursor);
    if (lt === -1) return out + html.slice(cursor);
    out += html.slice(cursor, lt);
    const gt = html.indexOf('>', lt + 1);
    if (gt === -1) return out;
    if (gt === lt + 1) {
      out += '<';
      cursor = lt + 1;
      continue;
    }
    const { name, closing } = tagNameAt(html, lt, gt);
    if (closing ? BLOCK_ELEMENTS.has(name) : LINE_BREAK_ELEMENTS.has(name)) out += '\n';
    else out += ' ';
    cursor = gt + 1;
  }
  return out;
}

export function extractHtmlTitle(html: string): string | undefined {
  const doc = bound(html);
  const region = findRegion(doc, doc.toLowerCase(), 'title');
  if (!region) return undefined;
  const title = decodeHtmlEntities(doc.slice(region.start, region.end)).replace(/\s+/g, ' ').trim();
  return title || undefined;
}

export function extractHtmlText(html: string): string {
  const bounded = bound(html);
  let doc = stripComments(bounded);
  doc = stripDoctype(doc, doc.toLowerCase());

  for (const tag of DROP_ELEMENTS) doc = stripElement(doc, tag);

  const lower = doc.toLowerCase();
  const article = findRegion(doc, lower, 'article');
  const main = findRegion(doc, lower, 'main');
  const region =
    article && main ? (article.start <= main.start ? article : main) : (article ?? main);
  const regionText = region ? doc.slice(region.start, region.end) : '';

  if (regionText && stripAllTags(regionText).trim().length >= 200) {
    doc = regionText;
  } else {
    const body = findRegion(doc, lower, 'body');
    const bodyText = body ? doc.slice(body.start, body.end) : '';
    if (bodyText) doc = bodyText;
  }

  for (const tag of CHROME_ELEMENTS) doc = stripElement(doc, tag);

  return decodeHtmlEntities(toText(doc))
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
  signal?: AbortSignal;
}

const CANCELLED_MESSAGE = 'The request was cancelled.';

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
  const fetchImpl = overrides.fetchImpl ?? pinnedPublicFetch;
  const timeoutMs = overrides.timeoutMs ?? URL_FETCH_TIMEOUT_MS;
  const maxResponseBytes = overrides.maxResponseBytes ?? URL_FETCH_MAX_RESPONSE_BYTES;
  const maxContentChars = overrides.maxContentChars ?? URL_FETCH_MAX_CONTENT_CHARS;
  const maxRedirects = overrides.maxRedirects ?? URL_FETCH_MAX_REDIRECTS;

  const callerSignal = overrides.signal;
  if (callerSignal?.aborted) return err('cancelled', CANCELLED_MESSAGE);

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
  const cancel = () => controller.abort();
  callerSignal?.addEventListener('abort', cancel, { once: true });

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
        if (callerSignal?.aborted) return err('cancelled', CANCELLED_MESSAGE);
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
      if (callerSignal?.aborted) return err('cancelled', CANCELLED_MESSAGE);
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
    callerSignal?.removeEventListener('abort', cancel);
  }
}
