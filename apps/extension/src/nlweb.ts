import { logger } from './utils';
import { safeJsonParse, MAX_NLWEB_PROBE_BYTES, MAX_JSON_LD_BYTES } from './background/policy';

export interface NLWebEndpoint {
  url: string;
  type: 'ask' | 'mcp' | 'wellknown';
  status: 'available' | 'unknown';
}

export interface NLWebDetectionResult {
  supported: boolean;
  endpoints: NLWebEndpoint[];
  schemaTypes: string[];
  url: string;
}

interface NLWebProbeMessage {
  type: 'NLWEB_PROBE';
  probeUrl: string;
  method: 'GET' | 'HEAD';
}

interface NLWebProbeResponse {
  success: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  error?: string;
}

const NLWEB_SCHEMA_TYPES: ReadonlySet<string> = new Set([
  'SearchAction',
  'AskAction',
  'WebAPI',
  'EntryPoint',
]);

function isSameOrigin(targetUrl: string): boolean {
  try {
    const target = new URL(targetUrl);
    return target.origin === window.location.origin;
  } catch {
    return false;
  }
}

async function probeFetch(url: string, method: 'GET' | 'HEAD'): Promise<NLWebProbeResponse> {
  if (isSameOrigin(url)) {
    return sameOriginFetch(url, method);
  }
  return backgroundFetch(url, method);
}

async function sameOriginFetch(url: string, method: 'GET' | 'HEAD'): Promise<NLWebProbeResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, {
      method,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    const headers: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    let body: string | undefined;
    if (method === 'GET' && resp.ok) {
      try {
        body = await resp.text();
      } catch (err) {
        void err;
      }
    }

    return { success: true, status: resp.status, headers, body };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function backgroundFetch(url: string, method: 'GET' | 'HEAD'): Promise<NLWebProbeResponse> {
  try {
    const message: NLWebProbeMessage = {
      type: 'NLWEB_PROBE',
      probeUrl: url,
      method,
    };

    const response = await chrome.runtime.sendMessage(message);
    if (response && typeof response === 'object') {
      return response as NLWebProbeResponse;
    }

    return { success: false, error: 'No response from background script' };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function checkWellKnown(origin: string): Promise<NLWebEndpoint | null> {
  const url = `${origin}/.well-known/nlweb`;
  logger.debug('NLWeb: probing well-known endpoint', url);

  const resp = await probeFetch(url, 'GET');
  if (!resp.success || !resp.status || resp.status >= 400) {
    return null;
  }

  if (resp.body) {
    if (safeJsonParse(resp.body, MAX_NLWEB_PROBE_BYTES) === undefined) {
      return null;
    }
  }

  return { url, type: 'wellknown', status: 'available' };
}

async function probeEndpoint(
  origin: string,
  path: string,
  type: 'ask' | 'mcp',
): Promise<NLWebEndpoint | null> {
  const url = `${origin}/${path}`;
  logger.debug(`NLWeb: probing ${type} endpoint`, url);

  const resp = await probeFetch(url, 'HEAD');
  if (!resp.success || !resp.status) {
    return null;
  }

  if (resp.status < 400 || resp.status === 405) {
    return { url, type, status: 'available' };
  }

  return null;
}

function parseJsonLdSchemaTypes(): string[] {
  const types: string[] = [];

  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    const text = script.textContent;
    if (!text) continue;

    const data = safeJsonParse<unknown>(text, MAX_JSON_LD_BYTES);
    if (data !== undefined) {
      collectSchemaTypes(data, types);
    }
  }

  return types;
}

const MAX_JSONLD_RECURSION_DEPTH = 10;

function collectSchemaTypes(data: unknown, out: string[], depth = 0): void {
  if (depth > MAX_JSONLD_RECURSION_DEPTH) return;
  if (data === null || data === undefined) return;

  if (Array.isArray(data)) {
    for (const item of data) {
      collectSchemaTypes(item, out, depth + 1);
    }
    return;
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const typeVal = obj['@type'];

    if (typeof typeVal === 'string') {
      const shortType = typeVal.replace(/^https?:\/\/schema\.org\//, '');
      if (NLWEB_SCHEMA_TYPES.has(shortType) && !out.includes(shortType)) {
        out.push(shortType);
      }
    } else if (Array.isArray(typeVal)) {
      for (const t of typeVal) {
        if (typeof t === 'string') {
          const shortType = t.replace(/^https?:\/\/schema\.org\//, '');
          if (NLWEB_SCHEMA_TYPES.has(shortType) && !out.includes(shortType)) {
            out.push(shortType);
          }
        }
      }
    }

    for (const key of Object.keys(obj)) {
      if (key !== '@type') {
        collectSchemaTypes(obj[key], out, depth + 1);
      }
    }
  }
}

function checkResponseHeaders(): { hasNLWebHeader: boolean; hasMCPHeader: boolean } {
  let hasNLWebHeader = false;
  let hasMCPHeader = false;

  const metaTags = document.querySelectorAll('meta[http-equiv]');
  for (const meta of metaTags) {
    const name = (meta.getAttribute('http-equiv') ?? '').toLowerCase();
    if (name === 'x-nlweb') hasNLWebHeader = true;
    if (name === 'mcp-server') hasMCPHeader = true;
  }

  return { hasNLWebHeader, hasMCPHeader };
}

async function probeCurrentPageHeaders(): Promise<{
  hasNLWebHeader: boolean;
  hasMCPHeader: boolean;
}> {
  let hasNLWebHeader = false;
  let hasMCPHeader = false;

  const resp = await probeFetch(window.location.href, 'HEAD');
  if (resp.success && resp.headers) {
    if (resp.headers['x-nlweb']) hasNLWebHeader = true;
    if (resp.headers['mcp-server']) hasMCPHeader = true;
  }

  return { hasNLWebHeader, hasMCPHeader };
}

export async function detectNLWeb(pageUrl: string): Promise<NLWebDetectionResult> {
  const result: NLWebDetectionResult = {
    supported: false,
    endpoints: [],
    schemaTypes: [],
    url: pageUrl,
  };

  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    logger.warn('NLWeb: invalid page URL', pageUrl);
    return result;
  }

  logger.debug('NLWeb: starting detection for', origin);

  result.schemaTypes = parseJsonLdSchemaTypes();
  const metaHeaders = checkResponseHeaders();

  const [wellKnown, askEndpoint, mcpEndpoint, pageHeaders] = await Promise.all([
    checkWellKnown(origin).catch((): null => null),
    probeEndpoint(origin, 'ask', 'ask').catch((): null => null),
    probeEndpoint(origin, 'mcp', 'mcp').catch((): null => null),
    metaHeaders.hasNLWebHeader || metaHeaders.hasMCPHeader
      ? Promise.resolve(metaHeaders)
      : probeCurrentPageHeaders().catch(() => ({
          hasNLWebHeader: false,
          hasMCPHeader: false,
        })),
  ]);

  if (wellKnown) result.endpoints.push(wellKnown);
  if (askEndpoint) result.endpoints.push(askEndpoint);
  if (mcpEndpoint) result.endpoints.push(mcpEndpoint);

  if (pageHeaders.hasMCPHeader && !mcpEndpoint) {
    result.endpoints.push({
      url: `${origin}/mcp`,
      type: 'mcp',
      status: 'unknown',
    });
  }

  result.supported =
    result.endpoints.length > 0 ||
    result.schemaTypes.length > 0 ||
    pageHeaders.hasNLWebHeader ||
    pageHeaders.hasMCPHeader;

  if (result.supported) {
    logger.info('NLWeb: support detected', {
      endpoints: result.endpoints.length,
      schemaTypes: result.schemaTypes,
      url: origin,
    });
  } else {
    logger.debug('NLWeb: no support detected', origin);
  }

  return result;
}
