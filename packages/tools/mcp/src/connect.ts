/**
 * Connect to an MCP server, list its tools, and return a typed handle.
 *
 * Usage:
 * ```ts
 * const handle = await connectMcpServer({ serverName: 'fs', config });
 * for (const tool of handle.catalog.tools) console.log(tool.toolName);
 * const result = await handle.callTool('read_file', { path: '/etc/hosts' });
 * await handle.close();
 * ```
 *
 * Catalog generation rules (mirrors OpenClaw):
 *   - `safeServerName`: lowercase, [a-z0-9_]-only, prefixed-on-collision
 *   - `fallbackDescription`: server-name-derived when the tool omits one
 */

import { Client, isInputRequiredResult } from '@modelcontextprotocol/client';

import { resolveMcpTransport } from './transport';
import type {
  McpCallToolResult,
  McpCatalogTool,
  McpServerCatalog,
  McpServerConfig,
  McpToolCatalog,
} from './types';

const CLIENT_NAME = 'agiworkforce';
const CLIENT_VERSION = '0.0.1';
const DEFAULT_CONNECTION_TIMEOUT_MS = 30_000;
const CATALOG_VERSION = 1;

/**
 * Protocol-version negotiation policy.
 *
 * The SDK defaults `versionNegotiation.mode` to `'legacy'`, which makes a v2
 * client byte-identical on the wire to a 2025 client — so upgrading the
 * dependency alone buys nothing. `'auto'` is the setting that actually adopts
 * the 2026-07-28 era: the client probes with `server/discover` at connect and
 * uses the modern era only on definitive modern evidence, falling back to the
 * legacy `initialize` handshake otherwise.
 *
 * `'auto'` rather than `{ pin: '2026-07-28' }` because pinning has no fallback
 * and almost every deployed MCP server today is still 2025-era; pinning would
 * turn "this server is a year old" into a hard connect failure.
 *
 * Stdio note: under `'auto'` the SDK runs the probe on a short-lived sibling
 * process spawned from the same parameters. That is a second spawn of a
 * command `resolveMcpTransport` has already gated behind the signed-manifest
 * check, so it introduces no new spawn authority — but it does mean a stdio
 * server's start-up side effects run twice.
 */
const VERSION_NEGOTIATION = { mode: 'auto' } as const;

/**
 * Canonical charset for MCP tool names: alphanumerics, underscore, hyphen,
 * dot. Mirrors the desktop-side `parse_mcp_envelope` charset.
 */
const MCP_TOOL_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MCP_TOOL_NAME_MAX_LENGTH = 128;

/**
 * Validate an MCP tool name at catalog-ingest time.
 *
 * FIX (audit 2026-05-20, §2): closes the catalog-side half of the
 * tool-name spoofing vector. The desktop tool_confirmation gate parses
 * `mcp__<server>__<tool>` strictly, but a hostile server could still
 * publish a base tool name like `read_file_but_exfiltrate` and rely on
 * downstream code mistaking it. Reject base names that:
 *   - exceed 128 chars (cost amplification),
 *   - contain `__` (the envelope-routing delimiter — confusable with the
 *     cross-server spoofing form),
 *   - fall outside [A-Za-z0-9_.-].
 */
export function isAcceptableMcpToolName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MCP_TOOL_NAME_MAX_LENGTH) return false;
  if (!MCP_TOOL_NAME_PATTERN.test(name)) return false;
  if (name.includes('__')) return false;
  return true;
}

/**
 * Walk an MCP tool's input schema with depth + ref caps.
 *
 * FIX (audit 2026-05-20, §2 / §5): the previous code cast `inputSchema`
 * straight to `Record<string, unknown>` with no validation. A hostile
 * server could ship a schema with deeply nested `$ref` chains that
 * expand exponentially when rendered into the LLM tool catalog — the
 * JSON-Schema analogue of an XML billion-laughs attack.
 *
 * We don't import a full JSON-Schema validator (no ajv dep here); the
 * defenses we need are bounded:
 *   - reject anything that isn't a JSON object
 *   - cap object depth at 16 (any legitimate tool schema is shallow)
 *   - cap total `$ref` count at 64 (most have 0–2)
 *   - cap total key count at 512 (any legitimate tool ~< 50)
 */
export interface SchemaValidationResult {
  ok: boolean;
  reason?: string;
}

const SCHEMA_MAX_DEPTH = 16;
const SCHEMA_MAX_REFS = 64;
const SCHEMA_MAX_KEYS = 512;

/**
 * `$ref` values that point off-box.
 *
 * MCP `2026-07-28` (Base Protocol § `$ref` Resolution) states that
 * implementations "**MUST NOT** automatically dereference `$ref` values that
 * resolve to a network URI", that any opt-in fetching mode "**MUST** be
 * disabled by default", and that a schema which fails to validate because of
 * an unresolved external `$ref` "**SHOULD** be rejected rather than silently
 * treated as permissive".
 *
 * We never dereference, so this is not a live SSRF today — but "we happen not
 * to call fetch" is an invariant held by absence, and absence is not enforced.
 * A server publishing `{"$ref":"http://169.254.169.254/latest/meta-data/"}`
 * only has to wait for one future consumer that does resolve refs. Rejecting
 * the schema where it is ADMITTED puts the rule at the boundary instead, and
 * costs a legitimate tool nothing: local refs (`#/$defs/...`) are untouched.
 */
const NETWORK_REF_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Schemes a `$ref` may legitimately carry. Anything else resolves off-box. */
const LOCAL_REF_PREFIXES = ['#'];

function isNetworkRef(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (LOCAL_REF_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) return false;
  // A relative path (`defs.json#/Foo`) has no scheme and stays local to
  // whatever base the consumer uses; only an absolute URI leaves the box.
  return NETWORK_REF_SCHEME.test(trimmed);
}

export function validateMcpInputSchema(schema: unknown): SchemaValidationResult {
  if (schema === null || typeof schema !== 'object') {
    return { ok: false, reason: 'schema is not an object' };
  }
  let totalRefs = 0;
  let totalKeys = 0;
  function walk(node: unknown, depth: number): SchemaValidationResult {
    // FIX (Codex P2, 2026-05-20): short-circuit on primitives BEFORE the
    // depth check. The previous order rejected primitive leaves at depth
    // SCHEMA_MAX_DEPTH+1, making the effective object cap shallower than
    // the documented 16-level limit. Depth is now spent only on
    // object/array recursion, matching the spec.
    if (node === null || typeof node !== 'object') return { ok: true };
    if (depth > SCHEMA_MAX_DEPTH) {
      return { ok: false, reason: `depth exceeded ${SCHEMA_MAX_DEPTH}` };
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        const r = walk(item, depth + 1);
        if (!r.ok) return r;
      }
      return { ok: true };
    }
    const obj = node as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      totalKeys += 1;
      if (totalKeys > SCHEMA_MAX_KEYS) {
        return { ok: false, reason: `key count exceeded ${SCHEMA_MAX_KEYS}` };
      }
      if (key === '$ref') {
        totalRefs += 1;
        if (totalRefs > SCHEMA_MAX_REFS) {
          return { ok: false, reason: `$ref count exceeded ${SCHEMA_MAX_REFS}` };
        }
        if (isNetworkRef(obj[key])) {
          return { ok: false, reason: 'network $ref is not resolvable and must not be fetched' };
        }
      }
      const r = walk(obj[key], depth + 1);
      if (!r.ok) return r;
    }
    return { ok: true };
  }
  return walk(schema, 0);
}

function toSafeServerName(name: string): string {
  // AUDIT-FIX: alert-397 — cap repetition counts to defeat polynomial-redos.
  // The trim regex `/^_+|_+$/g` is anchored so it can't grow unboundedly, but
  // CodeQL flags any unbounded `+` over a bounded character class. Bound it.
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9_]{1,128}/g, '_')
    .replace(/^_{1,128}|_{1,128}$/g, '')
    .slice(0, 48);
}

export interface McpServerHandle {
  serverName: string;
  safeServerName: string;
  catalog: McpServerCatalog;
  client: Client;
  /**
   * Which protocol era this connection negotiated. `'modern'` means the
   * server answered the `server/discover` probe and the 2026-07-28 semantics
   * (stateless requests, in-band `input_required`, cacheable results) are
   * live; `'legacy'` means we fell back to the 2025 `initialize` handshake.
   *
   * Surfaced because it changes what callers may assume — notably that a
   * `legacy` connection has no `input_required` channel at all.
   */
  protocolEra: 'modern' | 'legacy';
  callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult>;
  close(): Promise<void>;
}

export interface ConnectMcpServerParams {
  serverName: string;
  config: McpServerConfig;
}

export async function connectMcpServer(params: ConnectMcpServerParams): Promise<McpServerHandle> {
  const { serverName, config } = params;
  const safeServerName = toSafeServerName(serverName);

  const transport = resolveMcpTransport(config);
  const client = new Client(
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { versionNegotiation: VERSION_NEGOTIATION },
  );

  const timeoutMs = config.connectionTimeoutMs ?? DEFAULT_CONNECTION_TIMEOUT_MS;
  await withTimeout(client.connect(transport), timeoutMs, 'mcp.connect');

  // A `server/discover` result exists only when the probe succeeded, which is
  // exactly the condition for the modern era being live.
  const protocolEra: 'modern' | 'legacy' = client.getDiscoverResult() ? 'modern' : 'legacy';

  // Discover tools. If listTools throws (auth error, transport drop, or a
  // server that doesn't implement the tools/list method), close the client
  // before we propagate — otherwise we leak an open transport for every
  // failed connect.
  let listed: Awaited<ReturnType<Client['listTools']>>;
  try {
    listed = await client.listTools();
  } catch (err) {
    await client.close().catch(() => undefined);
    throw err;
  }
  // FIX (audit 2026-05-20, §2): the previous code accepted every tool the
  // server published without checking the name or the input schema. A
  // malicious MCP server could publish a tool named `terminal_execute` or
  // `read_file_but_exfiltrate` to spoof the desktop allowlist (see also
  // tool_confirmation.rs FIX). Closing both ends:
  //
  //   1. `isAcceptableMcpToolName` enforces an exact charset, length cap,
  //      and rejects double-underscores that look like cross-server
  //      spoofing of the `mcp__<server>__<tool>` envelope.
  //   2. `validateMcpInputSchema` walks the schema with a depth cap and a
  //      `$ref` count cap so a hostile server cannot ship a schema that
  //      blows up our LLM-side renderer (the same class of attack as
  //      billion-laughs / zip-bomb but for JSON-Schema expansion).
  const tools: McpCatalogTool[] = [];
  for (const t of listed.tools ?? []) {
    if (!isAcceptableMcpToolName(t.name)) {
      console.warn('[mcp] rejecting tool with non-canonical name', {
        serverName,
        toolName: t.name,
      });
      continue;
    }
    const rawSchema = (t.inputSchema as Record<string, unknown> | undefined) ?? {
      type: 'object',
      properties: {},
    };
    const schemaResult = validateMcpInputSchema(rawSchema);
    if (!schemaResult.ok) {
      console.warn('[mcp] rejecting tool whose inputSchema failed validation', {
        serverName,
        toolName: t.name,
        reason: schemaResult.reason,
      });
      continue;
    }
    tools.push({
      serverName,
      safeServerName,
      toolName: t.name,
      ...(t.title ? { title: t.title } : {}),
      ...(t.description ? { description: t.description } : {}),
      inputSchema: rawSchema,
      fallbackDescription: `Tool ${t.name} on MCP server ${serverName}`,
    });
  }

  const serverCatalog: McpServerCatalog = { serverName, safeServerName, tools };

  return {
    serverName,
    safeServerName,
    catalog: serverCatalog,
    client,
    protocolEra,
    async callTool(name: string, args: Record<string, unknown>): Promise<McpCallToolResult> {
      const res = await client.callTool({ name, arguments: args });

      // MCP 2026-07-28 replaced server→client JSON-RPC requests with in-band
      // `input_required` results (MRTR). We register no elicitation/sampling/
      // roots handlers, so auto-fulfilment is off and such a result reaches us
      // verbatim. Reporting it as an ordinary success would hand the model an
      // empty content array and look like a tool that did nothing; reporting
      // it as an error at least states the true reason.
      if (isInputRequiredResult(res)) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text:
                `Tool ${name} on MCP server ${serverName} paused for additional input ` +
                `(MCP input_required). This client cannot answer that request, so the ` +
                `call did not complete.`,
            },
          ],
        };
      }

      const isError = typeof res.isError === 'boolean' ? res.isError : undefined;
      return {
        ...(isError !== undefined ? { isError } : {}),
        content: (res.content as McpCallToolResult['content']) ?? [],
      };
    },
    async close(): Promise<void> {
      await client.close().catch(() => undefined);
    },
  };
}

/** Connect to many servers and produce a flat catalog across all of them. */
export async function buildMcpToolCatalog(
  servers: Record<string, McpServerConfig>,
): Promise<{ catalog: McpToolCatalog; handles: McpServerHandle[] }> {
  const handles: McpServerHandle[] = [];
  const serverEntries: Record<string, McpServerCatalog> = {};
  const flatTools: McpCatalogTool[] = [];

  for (const [serverName, config] of Object.entries(servers)) {
    try {
      const handle = await connectMcpServer({ serverName, config });
      handles.push(handle);
      serverEntries[serverName] = handle.catalog;
      flatTools.push(...handle.catalog.tools);
    } catch (err) {
      // Skip servers that fail to connect; surface the error but don't
      // poison the whole catalog. Caller can re-try with a single config.
      // We log to console.error so operators can spot mis-configured servers
      // — silently dropping these previously hid e.g. wrong-binary paths
      // and stdio transport breakages.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[mcp] failed to connect to server "${serverName}": ${message}`);
    }
  }

  const catalog: McpToolCatalog = {
    version: CATALOG_VERSION,
    generatedAt: Date.now(),
    servers: serverEntries,
    tools: flatTools,
  };

  return { catalog, handles };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
