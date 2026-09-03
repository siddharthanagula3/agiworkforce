type HeaderValue = string | number | boolean;

interface ServerEntry {
  name?: string;
  url?: string;
  transport?: 'sse' | 'streamable-http';
  headers?: Record<string, HeaderValue>;
  authToken?: string;
  command?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A trimmed string of bounded length, or `undefined` when absent. Rejects any other type. */
function optionalString(
  value: unknown,
  { max }: { max?: number } = {},
): { ok: true; value: string | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string') return { ok: false };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { ok: false };
  if (max !== undefined && trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

function parseHeaders(
  value: unknown,
): { ok: true; value: Record<string, HeaderValue> | undefined } | { ok: false } {
  if (value === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(value)) return { ok: false };
  const out: Record<string, HeaderValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      return { ok: false };
    }
    out[key] = raw;
  }
  return { ok: true, value: out };
}

/** Validate one server entry. Returns null when the value is not entry-shaped. */
function parseServerEntry(value: unknown): ServerEntry | null {
  if (!isPlainObject(value)) return null;

  const name = optionalString(value['name'], { max: 200 });
  if (!name.ok) return null;
  const url = optionalString(value['url']);
  if (!url.ok) return null;
  const authToken = optionalString(value['authToken']);
  if (!authToken.ok) return null;

  const transportRaw = value['transport'];
  if (transportRaw !== undefined && transportRaw !== 'sse' && transportRaw !== 'streamable-http') {
    return null;
  }

  const headers = parseHeaders(value['headers']);
  if (!headers.ok) return null;

  return {
    ...(name.value !== undefined ? { name: name.value } : {}),
    ...(url.value !== undefined ? { url: url.value } : {}),
    ...(transportRaw !== undefined ? { transport: transportRaw } : {}),
    ...(headers.value !== undefined ? { headers: headers.value } : {}),
    ...(authToken.value !== undefined ? { authToken: authToken.value } : {}),
    ...('command' in value ? { command: value['command'] } : {}),
  };
}

/** Validate the `{ mcpServers: { name: entry } }` wrapper. Null when not that shape. */
function parseWrappedConfig(value: unknown): Record<string, ServerEntry> | null {
  if (!isPlainObject(value)) return null;
  const servers = value['mcpServers'];
  if (!isPlainObject(servers)) return null;
  const out: Record<string, ServerEntry> = {};
  for (const [key, raw] of Object.entries(servers)) {
    const entry = parseServerEntry(raw);
    if (!entry) return null;
    out[key] = entry;
  }
  return out;
}

export interface ParsedCustomMcpConfig {
  name: string | null;
  url: string;
  transport: 'sse' | 'streamable-http' | null;
  authToken: string | null;
  droppedHeaderNames: string[];
}

export type CustomMcpJsonImportError =
  | { kind: 'invalid_json' }
  | { kind: 'invalid_shape'; message: string }
  | { kind: 'stdio_unsupported'; serverName: string | null }
  | { kind: 'multiple_servers'; count: number }
  | { kind: 'no_servers' }
  | { kind: 'invalid_url'; message: string };

export type CustomMcpJsonImportResult =
  | { ok: true; value: ParsedCustomMcpConfig }
  | { ok: false; error: CustomMcpJsonImportError };

function extractBearerToken(headers: Record<string, unknown> | undefined): {
  token: string | null;
  droppedHeaderNames: string[];
} {
  if (!headers) return { token: null, droppedHeaderNames: [] };
  let token: string | null = null;
  const droppedHeaderNames: string[] = [];
  for (const [key, rawValue] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
      const value = String(rawValue).trim();
      const match = /^Bearer\s+(.+)$/i.exec(value);
      token = match ? match[1]!.trim() : value;
      continue;
    }
    droppedHeaderNames.push(key);
  }
  return { token, droppedHeaderNames };
}

function toResult(fallbackName: string | null, entry: ServerEntry): CustomMcpJsonImportResult {
  if (entry.command !== undefined) {
    return { ok: false, error: { kind: 'stdio_unsupported', serverName: fallbackName } };
  }
  if (!entry.url) {
    return {
      ok: false,
      error: {
        kind: 'invalid_shape',
        message: 'Expected a "url" field naming a remote MCP server.',
      },
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(entry.url);
  } catch {
    return {
      ok: false,
      error: { kind: 'invalid_url', message: 'Enter a valid HTTP or HTTPS URL.' },
    };
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return {
      ok: false,
      error: { kind: 'invalid_url', message: 'MCP server URL must use HTTP or HTTPS.' },
    };
  }

  const { token: headerToken, droppedHeaderNames } = extractBearerToken(entry.headers);
  const authToken = entry.authToken?.trim() || headerToken;

  return {
    ok: true,
    value: {
      name: entry.name?.trim() || fallbackName,
      url: parsedUrl.toString(),
      transport: entry.transport ?? null,
      authToken: authToken || null,
      droppedHeaderNames,
    },
  };
}

export function parseCustomMcpJsonConfig(raw: string): CustomMcpJsonImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: { kind: 'invalid_json' } };
  }

  const wrapped = parseWrappedConfig(parsed);
  if (wrapped) {
    const entries = Object.entries(wrapped);
    if (entries.length === 0) return { ok: false, error: { kind: 'no_servers' } };
    if (entries.length > 1) {
      return { ok: false, error: { kind: 'multiple_servers', count: entries.length } };
    }
    const [name, entry] = entries[0]!;
    return toResult(name, entry);
  }

  const bare = parseServerEntry(parsed);
  if (bare) {
    return toResult(null, bare);
  }

  return {
    ok: false,
    error: {
      kind: 'invalid_shape',
      message: 'Expected either {"url": "..."} or {"mcpServers": {"name": {"url": "..."}}}.',
    },
  };
}

/** User-facing message for a `CustomMcpJsonImportError`. */
export function describeCustomMcpJsonImportError(error: CustomMcpJsonImportError): string {
  switch (error.kind) {
    case 'invalid_json':
      return 'That is not valid JSON.';
    case 'invalid_shape':
      return error.message;
    case 'stdio_unsupported':
      return `${
        error.serverName ? `"${error.serverName}"` : 'This config'
      } runs a local command (stdio transport), which a browser session cannot spawn. Only remote url-based MCP servers can be imported here.`;
    case 'multiple_servers':
      return `This config declares ${error.count} servers. Paste one server's config at a time.`;
    case 'no_servers':
      return 'No servers found in this config.';
    case 'invalid_url':
      return error.message;
  }
}
