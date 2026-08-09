/**
 * Client-side reader for the server's "connect required" tool result
 * (lazy authentication).
 *
 * SERVER CONTRACT. `apps/web/lib/connectors/connect-required.ts` builds a JSON
 * envelope keyed `agi_connector_authorization_required` and returns it as the
 * `content` of a `ConnectorExecResult` with `isError: true`. The chat tool loop
 * puts that string on the wire verbatim as
 * `delta.x_tool_result = { tool_call_id, name, content, is_error }`
 * (`toolResultEvent`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`),
 * where `name` is the qualified tool name `mcp__<serverId>__<toolName>`
 * (`tc.qualifiedName`). `useChatStream` copies `content` onto
 * `ToolEntry.result` and `name` onto `ToolEntry.name` — those are the only
 * writers of those fields for a server-executed tool.
 *
 * WHY THIS IS NOT LOOSE STRING MATCHING. The `content` of an `x_tool_result` is
 * ALSO whatever an arbitrary MCP server chose to return, so a connector could
 * try to forge a Connect card that points a user somewhere useful to it. Three
 * checks make a forged card useless:
 *
 *   1. STRUCTURE — the payload must be a JSON object whose discriminant is
 *      literally `true` and whose every field has the declared type, length and
 *      (for `reason`) closed-vocabulary value. `JSON.parse` failures and shape
 *      mismatches yield `null`, never a partially-trusted card.
 *
 *   2. TOOL BINDING — the envelope's `connectorId`/`toolName` must reconstruct
 *      the qualified name of the tool call the result arrived on:
 *      `mcp__${connectorId}__${toolName} === entry.name`. The tool loop always
 *      dispatches `mcp__<serverId>__<tool>` to the connector executor as
 *      `(serverId, toolName)` and `executeOAuthConnectorTool` passes those same
 *      two values into the payload, so a genuine envelope always satisfies it.
 *      A malicious connector, whose results only ever arrive under its OWN
 *      serverId, therefore cannot mint a card for a DIFFERENT connector — the
 *      worst it can do is ask the user to connect itself.
 *
 *   3. DESTINATION — `connectUrl` must be the same-origin broker start path
 *      `/api/connectors/oauth/start` carrying `connectorId=<the bound id>`, the
 *      only shape `buildConnectorOAuthStartPath` can produce. Absolute URLs,
 *      scheme-relative `//host`, the `\` variants browsers normalise to `/`,
 *      any other path, and a mismatched `connectorId` all reject the WHOLE
 *      envelope rather than downgrading it, because a genuine server envelope
 *      cannot produce them.
 *
 * A rejected envelope simply renders as the ordinary failed tool call it is.
 *
 * `connectUrl: null` is NOT a rejection — it is the server saying this
 * deployment has no OAuth application for the connector. That is the honest
 * state today (the registry ships with zero providers), and the card must say
 * so instead of offering a button that cannot work.
 */

/** Discriminant key. Mirrors `CONNECTOR_AUTHORIZATION_REQUIRED_KEY` server-side. */
export const CONNECTOR_AUTHORIZATION_REQUIRED_KEY = 'agi_connector_authorization_required';

/**
 * Mirrors `CONNECTOR_OAUTH_START_PATH` in `@agiworkforce/cloud-contracts`
 * (packages/contracts/cloud-contracts/src/connectors.ts), which is the single
 * declaration every other surface imports. This package deliberately has no
 * dependency on the cloud contracts — it is the shared chat renderer, used by
 * surfaces that never speak to the managed-cloud REST API — so the literal is
 * restated here and pinned to the contract by
 * `apps/web/__tests__/contracts/connector-oauth-paths.test.ts`, which fails if
 * the two ever differ.
 */
export const CONNECTOR_OAUTH_START_PATH = '/api/connectors/oauth/start';

/** Mirrors `ConnectorAuthorizationReason` in lib/connectors/connect-required.ts. */
export type ConnectorAuthorizationReason =
  | 'not_connected'
  | 'authorization_expired'
  | 'insufficient_scope'
  | 'authorization_unavailable';

const REASONS: readonly ConnectorAuthorizationReason[] = [
  'not_connected',
  'authorization_expired',
  'insufficient_scope',
  'authorization_unavailable',
];

/** Mirrors `CONNECTOR_ID_RE` in lib/connectors/oauth-registry.ts. */
const CONNECTOR_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Mirrors the `displayName` bound in the provider descriptor schema. */
const MAX_CONNECTOR_NAME_LENGTH = 120;

/**
 * Registry descriptors cap `scopes` at 64; a step-up challenge (RFC 9470) can
 * add more from a `WWW-Authenticate` header. This ceiling only rejects a list
 * no provider produces — display truncation is the card's job, not this one's.
 */
const MAX_SCOPES = 256;
const MAX_SCOPE_LENGTH = 512;

/** Mirrors the 512-char bound in `sanitizeConnectorReturnPath`. */
const MAX_RETURN_PATH_LENGTH = 512;

/**
 * A verified authorization request, safe to render. Every field is plain text
 * and must be rendered as text — the connector chose `connectorName` and
 * `scopes`, and this module deliberately does not sanitize markup because
 * nothing downstream is allowed to interpret markup in the first place.
 */
export interface ConnectorConnectRequest {
  connectorId: string;
  connectorName: string;
  /** Bare tool name, e.g. `search_issues`. */
  toolName: string;
  /** Wire name the result arrived on, e.g. `mcp__linear__search_issues`. */
  qualifiedToolName: string;
  reason: ConnectorAuthorizationReason;
  /** Verified same-origin broker start path, or null when unconnectable here. */
  connectUrl: string | null;
  scopes: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRelativeSameOriginPath(value: string): boolean {
  // `//host` and `/\host` both leave the origin (browsers normalise `\` to `/`
  // in special schemes), so they are rejected before the URL parser runs and
  // again by the origin comparison below.
  return /^\/[^/\\]/.test(value);
}

/**
 * The only destination a Connect button is ever allowed to point at: this
 * deployment's own broker start path, for the connector the envelope is bound
 * to.
 */
function isTrustedConnectUrl(value: string, connectorId: string): boolean {
  if (value.length > 2048) return false;
  if (!isRelativeSameOriginPath(value)) return false;
  const base = 'https://connector-connect-url.invalid';
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    return false;
  }
  if (url.origin !== base) return false;
  if (url.pathname !== CONNECTOR_OAUTH_START_PATH) return false;
  return url.searchParams.get('connectorId') === connectorId;
}

function readScopes(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_SCOPES) return null;
  const scopes: string[] = [];
  for (const scope of value) {
    if (typeof scope !== 'string') return null;
    if (scope.length > MAX_SCOPE_LENGTH) return null;
    const trimmed = scope.trim();
    if (trimmed.length > 0) scopes.push(trimmed);
  }
  return scopes;
}

/**
 * Verify a tool result against the trusted-path checks documented above.
 *
 * @param params.qualifiedToolName `ToolEntry.name` — the `x_tool_result.name`
 *   the server emitted, which is the model-visible qualified tool name.
 * @param params.result `ToolEntry.result` — the `x_tool_result.content`.
 * @param params.isError whether the result was marked a failure. The server
 *   always sets `isError: true` on this envelope so the model treats it as a
 *   failed call; a "successful" tool result carrying the envelope did not come
 *   from that path.
 */
export function readConnectorConnectRequest(params: {
  qualifiedToolName: string;
  result: string | undefined;
  isError: boolean;
}): ConnectorConnectRequest | null {
  const { qualifiedToolName, result, isError } = params;
  if (!isError) return null;
  if (typeof result !== 'string' || result.length === 0) return null;
  // Cheap reject before paying for JSON.parse on every completed tool result.
  if (!result.includes(CONNECTOR_AUTHORIZATION_REQUIRED_KEY)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return null;
  }
  if (!isPlainObject(parsed)) return null;
  if (parsed[CONNECTOR_AUTHORIZATION_REQUIRED_KEY] !== true) return null;

  const connectorId = parsed['connectorId'];
  const toolName = parsed['toolName'];
  const connectorName = parsed['connectorName'];
  const reason = parsed['reason'];
  const connectUrl = parsed['connectUrl'];

  if (typeof connectorId !== 'string' || !CONNECTOR_ID_RE.test(connectorId)) return null;
  if (typeof toolName !== 'string' || toolName.length === 0) return null;
  if (typeof connectorName !== 'string' || connectorName.length === 0) return null;
  if (connectorName.length > MAX_CONNECTOR_NAME_LENGTH) return null;
  if (typeof reason !== 'string') return null;
  if (!REASONS.includes(reason as ConnectorAuthorizationReason)) return null;

  // Check 2 — the envelope must describe the very tool call it arrived on.
  if (`mcp__${connectorId}__${toolName}` !== qualifiedToolName) return null;

  const scopes = readScopes(parsed['scopes']);
  if (scopes === null) return null;

  // Check 3 — destination. `null` is a legitimate "cannot be connected here".
  let verifiedConnectUrl: string | null;
  if (connectUrl === null || connectUrl === undefined) {
    verifiedConnectUrl = null;
  } else if (typeof connectUrl === 'string' && isTrustedConnectUrl(connectUrl, connectorId)) {
    verifiedConnectUrl = connectUrl;
  } else {
    return null;
  }

  return {
    connectorId,
    connectorName,
    toolName,
    qualifiedToolName,
    reason: reason as ConnectorAuthorizationReason,
    connectUrl: verifiedConnectUrl,
    scopes,
  };
}

/**
 * Add a `returnPath` to a verified connect URL so the broker sends the user
 * back to the conversation they were in instead of to `/connectors`. The server
 * re-sanitizes the value (`sanitizeConnectorReturnPath`), so this is a UX
 * convenience, not a trust boundary — a path this function refuses simply
 * yields the unmodified URL and the server's `/connectors` default.
 */
export function buildConnectHref(connectUrl: string, returnPath: string | null): string {
  if (!returnPath) return connectUrl;
  if (returnPath.length > MAX_RETURN_PATH_LENGTH) return connectUrl;
  if (!isRelativeSameOriginPath(returnPath)) return connectUrl;
  const separator = connectUrl.includes('?') ? '&' : '?';
  return `${connectUrl}${separator}returnPath=${encodeURIComponent(returnPath)}`;
}
