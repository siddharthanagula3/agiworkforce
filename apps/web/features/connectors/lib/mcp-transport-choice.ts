/**
 * Which MCP transport to use for a URL a user pasted — and whether that
 * choice is a deprecated one we should say something about.
 *
 * WHY THIS EXISTS
 *
 * Two call sites in ConnectorsPage independently inferred the transport with
 * `parsedUrl.pathname.endsWith('/sse') ? 'sse' : 'streamable-http'` and then
 * said nothing. That is a silent downgrade onto the HTTP+SSE transport from
 * protocol version 2024-11-05, which has been **deprecated since 2025-03-26**
 * and is listed as eligible for removal in a future revision:
 *
 *   "New implementations SHOULD NOT adopt it; existing implementations SHOULD
 *    migrate to Streamable HTTP."
 *   — MCP 2026-07-28, Streamable HTTP § HTTP+SSE Transport (2024-11-05)
 *
 * The sniff is not WRONG — an `/sse` endpoint really does speak the old
 * transport, so forcing Streamable HTTP at it would simply fail. The defect is
 * that the product picked the dying path on the user's behalf without telling
 * them, when the same server almost always publishes a modern endpoint beside
 * it. Linear is the canonical example: `https://mcp.linear.app/mcp` is primary
 * and `https://mcp.linear.app/sse` is documented as "a deprecated fallback for
 * clients that do not support Streamable HTTP".
 *
 * So: still connect, but surface the modern URL and let the user choose. We
 * deliberately do NOT rewrite the URL silently — not every server mounts its
 * modern endpoint at `/mcp`, and a silent rewrite would turn a working
 * connection into a 404 the user cannot explain.
 */

export type McpTransportChoice = 'sse' | 'streamable-http';

export interface McpTransportResolution {
  /** The transport to send to the API for this URL. */
  transport: McpTransportChoice;
  /** True when the URL selects the deprecated 2024-11-05 HTTP+SSE transport. */
  deprecated: boolean;
  /**
   * The conventional modern endpoint for the same server, when one can be
   * derived by swapping the trailing `/sse` segment for `/mcp`. Null when the
   * URL is already modern, or when no such rewrite is well-defined.
   */
  suggestedUrl: string | null;
}

/** Path segment that identifies a legacy HTTP+SSE endpoint. */
const LEGACY_SSE_SUFFIX = '/sse';
/** The conventional Streamable HTTP path the same server usually exposes. */
const MODERN_SUFFIX = '/mcp';

/**
 * Resolve the transport for a parsed MCP server URL.
 *
 * @param url - an already-validated http(s) URL.
 */
export function resolveMcpTransportChoice(url: URL): McpTransportResolution {
  // Trailing slashes are common in pasted URLs and must not defeat the check.
  const pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.toLowerCase().endsWith(LEGACY_SSE_SUFFIX)) {
    return { transport: 'streamable-http', deprecated: false, suggestedUrl: null };
  }

  const suggested = new URL(url.toString());
  suggested.pathname = `${pathname.slice(0, -LEGACY_SSE_SUFFIX.length)}${MODERN_SUFFIX}`;

  return {
    transport: 'sse',
    deprecated: true,
    suggestedUrl: suggested.toString(),
  };
}

/** User-facing copy for the deprecated case. Kept here so both call sites agree. */
export function legacyTransportNotice(suggestedUrl: string | null): string {
  const base =
    'This endpoint uses the HTTP+SSE transport, deprecated since MCP 2025-03-26. It will keep working for now.';
  return suggestedUrl ? `${base} Most servers also publish ${suggestedUrl} — prefer that.` : base;
}
