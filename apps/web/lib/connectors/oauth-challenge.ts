/**
 * @file `WWW-Authenticate` challenge interpretation for connector MCP calls.
 *
 * Mirrors `crates/agiworkforce-mcp/src/oauth/flow.rs` rather than inventing a
 * parallel reading of the same RFCs:
 *   - `parseChallengeParam` is `parse_param` — best-effort extraction of a
 *     quoted or bare parameter value from a Bearer challenge, case-insensitive
 *     on the key, not attempting full escape handling (RFC 6750 §3).
 *   - `parseResourceMetadataUrl` is `parse_resource_metadata_url` — the
 *     RFC 9728 §5.1 `resource_metadata="<url>"` pointer at the protected
 *     resource's metadata document.
 *   - `parseInsufficientScope` is `parse_insufficient_scope` — the RFC 9470 /
 *     RFC 6750 §3.1 step-up signal, returning the demanded `scope` only when
 *     `error="insufficient_scope"`.
 *
 * WHAT THE WEB PATH CAN AND CANNOT SEE. The MCP TypeScript SDK's HTTP
 * transports do not surface the response headers on failure: with no
 * `authProvider` attached, a 401 arrives as `StreamableHTTPError`/`SseError`
 * carrying only `code` and a message, so the challenge string is usually
 * absent here even though the server sent one. `detectConnectorAuthChallenge`
 * therefore keys on the STATUS, and the parsers above run whenever a challenge
 * string is actually available (a header the caller captured, or an error whose
 * message embedded it). The fallback is the registry entry for the connector —
 * never a guessed authorization server.
 */

import 'server-only';

/** Extract one parameter from a `WWW-Authenticate` challenge. */
export function parseChallengeParam(header: string, key: string): string | null {
  const needle = `${key}=`;
  const index = header.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return null;
  const after = header.slice(index + needle.length);
  if (after.startsWith('"')) {
    const rest = after.slice(1);
    const end = rest.indexOf('"');
    if (end === -1) return null;
    return rest.slice(0, end);
  }
  const end = after.search(/[,\s]/);
  return end === -1 ? after : after.slice(0, end);
}

/** RFC 9728 §5.1 `resource_metadata` pointer, when the challenge carries one. */
export function parseResourceMetadataUrl(
  wwwAuthenticate: string | null | undefined,
): string | null {
  if (!wwwAuthenticate) return null;
  return parseChallengeParam(wwwAuthenticate, 'resource_metadata');
}

/** RFC 9470 step-up: the demanded scope, only for `error="insufficient_scope"`. */
export function parseInsufficientScope(wwwAuthenticate: string | null | undefined): string | null {
  if (!wwwAuthenticate) return null;
  const error = parseChallengeParam(wwwAuthenticate, 'error');
  if (!error || error.toLowerCase() !== 'insufficient_scope') return null;
  return parseChallengeParam(wwwAuthenticate, 'scope');
}

export interface ConnectorAuthChallenge {
  /** 401 — no/expired credential. 403 — credential accepted but under-scoped. */
  status: 401 | 403;
  /** The raw challenge, when the transport made it reachable. */
  wwwAuthenticate: string | null;
  /** RFC 9728 metadata pointer, when present. */
  resourceMetadataUrl: string | null;
  /** Scope demanded by a step-up challenge, when present. */
  requiredScope: string | null;
}

function readNumericField(error: Record<string, unknown>, field: string): number | null {
  const value = error[field];
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

/**
 * Classify a thrown MCP transport error as an authorization challenge.
 *
 * Deliberately narrow: a numeric 401/403 on the error object, or the SDK's
 * `UnauthorizedError`. A message that merely mentions "401" is NOT enough —
 * a tool that returns the string "401" in its output must never be mistaken
 * for a connector that needs reconnecting.
 */
export function detectConnectorAuthChallenge(error: unknown): ConnectorAuthChallenge | null {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;

  const status =
    readNumericField(record, 'code') ??
    readNumericField(record, 'status') ??
    readNumericField(record, 'statusCode');

  const isUnauthorizedError = record['name'] === 'UnauthorizedError';
  if (status !== 401 && status !== 403 && !isUnauthorizedError) return null;

  const header =
    typeof record['wwwAuthenticate'] === 'string'
      ? (record['wwwAuthenticate'] as string)
      : extractChallengeFromMessage(record['message']);

  const requiredScope = parseInsufficientScope(header);

  // A 403 is only an authorization challenge when it says so. Any other 403 is
  // an ordinary permission denial the user cannot fix by reconnecting.
  if (status === 403 && !requiredScope) return null;

  return {
    status: status === 403 ? 403 : 401,
    wwwAuthenticate: header,
    resourceMetadataUrl: parseResourceMetadataUrl(header),
    requiredScope,
  };
}

/**
 * Some servers echo their challenge into the error body the SDK stringifies.
 * Only accept a substring that actually looks like a Bearer challenge.
 */
function extractChallengeFromMessage(message: unknown): string | null {
  if (typeof message !== 'string') return null;
  const match = /Bearer\s+[^\n]*(?:realm|error|resource_metadata|scope)=/i.exec(message);
  if (!match) return null;
  return message.slice(match.index).split('\n')[0] ?? null;
}
