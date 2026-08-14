/**
 * @file Remote MCP endpoints published by connector vendors.
 *
 * WHAT MAKES THIS DIFFERENT FROM A MARKETING LIST
 * ----------------------------------------------
 * Every entry below was verified against the live endpoint on 2026-08-14 by two
 * independent checks, and only entries that passed both are here:
 *
 *   1. The URL behaves like an MCP endpoint — an unauthenticated `tools/list`
 *      draws either a `401` challenge or a JSON-RPC response. A vendor's
 *      marketing page also answers a request, so "it responded" is not enough.
 *   2. OAuth discovery resolves an authorization server for it (RFC 9728 →
 *      RFC 8414), and that server states how a client may identify itself.
 *
 * `clientRegistration` records the answer to (2), and it is the field that
 * decides whether a connector is usable without operator setup:
 *
 *   - `'cimd'`      — the authorization server accepts a Client ID Metadata
 *                     Document. We present our hosted document as the
 *                     `client_id`; nothing is registered anywhere. Works out of
 *                     the box.
 *   - `'dynamic'`   — the authorization server offers RFC 7591 dynamic client
 *                     registration. We register on first connect and cache the
 *                     result per issuer. Also works out of the box, but leaves
 *                     a registration at the vendor.
 *   - `'preregistered'` — the authorization server offers NEITHER. A human must
 *                     register an OAuth app and supply
 *                     `CONNECTOR_OAUTH_<ID>_CLIENT_ID/_SECRET`. The directory
 *                     must say so rather than showing a Connect button that
 *                     cannot complete.
 *
 * ADVERTISING DCR IS NOT THE SAME AS ALLOWING IT
 * ----------------------------------------------
 * Six vendors publish a `registration_endpoint` and then refuse the
 * registration. A live registration attempt on 2026-08-14 returned:
 *
 *   asana      400 invalid_redirect_uri — "One or more redirect URIs are not allowed"
 *   dropbox    403 registration_not_supported — "Only pre-registered MCP trusted partners"
 *   figma      403 Forbidden
 *   intercom   400 invalid_redirect_uri — "not in the allowlist, reach out to Intercom"
 *   square     400 invalid_redirect_uri — "domain not in allowlist"
 *   vercel     400 invalid_redirect_uri — "not approved for use by this authorization server"
 *
 * All six are therefore `preregistered` here, not `dynamic`. Trusting the
 * advertised capability would have put six Connect buttons in the directory that
 * fail the moment they are clicked — the precise defect audit CRIT-001 was about.
 * Every remaining `dynamic` entry completed a real registration (201/200).
 *
 * Clearing these is vendor paperwork, not code: each needs our callback URL
 * added to their allowlist. Tracked in `FoundersAssistance.md`.
 *
 * CIMD ENTRIES ARE CLASSIFIED FROM ADVERTISED SUPPORT
 * ---------------------------------------------------
 * The `cimd` entries carry `client_id_metadata_document_supported: true` in
 * their own RFC 8414 metadata, and each produces a well-formed authorization
 * request. End-to-end confirmation needs one more thing that is not a code
 * change: the authorization server fetches our document over the public
 * internet, so `MCP_CLIENT_METADATA_PATH` must be live on the production origin.
 * Until that deploy lands it 404s, and an authorization server that fetches a
 * 404 answers `invalid_client` — which is exactly what four of the eight did
 * when probed pre-deploy. Re-verify after the first production deploy; see
 * `FoundersAssistance.md`.
 *
 * WHY THE VERIFICATION DATE MATTERS
 * ---------------------------------
 * These are other companies' deployments. An endpoint can move, and an
 * authorization server can withdraw dynamic registration — the ecosystem is
 * actively deprecating it in favour of CIMD. So this table is a starting point
 * that discovery re-checks at connect time, never an authority: the flow reads
 * the live metadata and fails honestly if reality has changed. Nothing here is
 * used to claim a capability in the UI; it only decides which URL to dial.
 *
 * `pagerduty` and the Atlassian trio are deliberately marked `preregistered`
 * despite serving MCP: their authorization servers publish an `issuer` that does
 * not match the URL discovery reached them at, which fails the RFC 8414 §3.3
 * issuer-echo check. The SDK can be told to skip that check; doing so removes a
 * defense against authorization-server substitution, so we do not.
 */

/** How this vendor's authorization server lets a client identify itself. */
export type McpClientRegistrationMode = 'cimd' | 'dynamic' | 'preregistered';

export interface McpEndpointRecord {
  /** The connector id in `catalog.ts`. */
  readonly connectorId: string;
  /** The vendor's remote MCP endpoint. */
  readonly url: string;
  /**
   * `'sse'` marks the HTTP+SSE transport deprecated since protocol revision
   * 2025-03-26. Recorded from the URL the vendor actually documents — several
   * still publish only the `/sse` form.
   */
  readonly transport: 'streamable-http' | 'sse';
  readonly clientRegistration: McpClientRegistrationMode;
}

/**
 * Verified endpoints, keyed by connector id.
 *
 * Ordered by registration mode so the "works with no setup" group is readable
 * as a block.
 */
export const MCP_ENDPOINTS: Readonly<Record<string, McpEndpointRecord>> = {
  // ── Client ID Metadata Documents: no registration anywhere ────────────────
  airtable: {
    connectorId: 'airtable',
    url: 'https://mcp.airtable.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  canva: {
    connectorId: 'canva',
    url: 'https://mcp.canva.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  huggingface: {
    connectorId: 'huggingface',
    url: 'https://huggingface.co/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  linear: {
    connectorId: 'linear',
    url: 'https://mcp.linear.app/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  notion: {
    connectorId: 'notion',
    url: 'https://mcp.notion.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  posthog: {
    connectorId: 'posthog',
    url: 'https://mcp.posthog.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  sentry: {
    connectorId: 'sentry',
    url: 'https://mcp.sentry.dev/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },
  todoist: {
    connectorId: 'todoist',
    url: 'https://ai.todoist.net/mcp',
    transport: 'streamable-http',
    clientRegistration: 'cimd',
  },

  // ── Dynamic client registration: verified to actually register ───────────
  clickup: {
    connectorId: 'clickup',
    url: 'https://mcp.clickup.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },
  cloudflare: {
    connectorId: 'cloudflare',
    url: 'https://bindings.mcp.cloudflare.com/sse',
    transport: 'sse',
    clientRegistration: 'dynamic',
  },
  datadog: {
    connectorId: 'datadog',
    url: 'https://mcp.datadoghq.com/api/unstable/mcp-server/mcp',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },
  monday: {
    connectorId: 'monday',
    url: 'https://mcp.monday.com/sse',
    transport: 'sse',
    clientRegistration: 'dynamic',
  },
  paypal: {
    connectorId: 'paypal',
    url: 'https://mcp.paypal.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },
  plaid: {
    connectorId: 'plaid',
    url: 'https://api.dashboard.plaid.com/mcp/sse',
    transport: 'sse',
    clientRegistration: 'dynamic',
  },
  stripe: {
    connectorId: 'stripe',
    url: 'https://mcp.stripe.com',
    transport: 'streamable-http',
    clientRegistration: 'dynamic',
  },

  // ── Serve MCP, but require an operator-registered OAuth app ──────────────
  asana: {
    connectorId: 'asana',
    url: 'https://mcp.asana.com/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  box: {
    connectorId: 'box',
    url: 'https://mcp.box.com/',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  confluence: {
    connectorId: 'confluence',
    url: 'https://mcp.atlassian.com/v1/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  dropbox: {
    connectorId: 'dropbox',
    url: 'https://mcp.dropbox.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  figma: {
    connectorId: 'figma',
    url: 'https://mcp.figma.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  hubspot: {
    connectorId: 'hubspot',
    url: 'https://mcp.hubspot.com/anthropic',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  intercom: {
    connectorId: 'intercom',
    url: 'https://mcp.intercom.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  jira: {
    connectorId: 'jira',
    url: 'https://mcp.atlassian.com/v1/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  pagerduty: {
    connectorId: 'pagerduty',
    url: 'https://mcp.pagerduty.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  slack: {
    connectorId: 'slack',
    url: 'https://mcp.slack.com/mcp',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
  square: {
    connectorId: 'square',
    url: 'https://mcp.squareup.com/sse',
    transport: 'sse',
    clientRegistration: 'preregistered',
  },
  vercel: {
    connectorId: 'vercel',
    url: 'https://mcp.vercel.com',
    transport: 'streamable-http',
    clientRegistration: 'preregistered',
  },
};

/** The endpoint for a connector id, or null when no verified one exists. */
export function getMcpEndpoint(connectorId: string): McpEndpointRecord | null {
  return MCP_ENDPOINTS[connectorId] ?? null;
}

/**
 * True when a connector can be connected with no operator configuration —
 * the authorization server accepts either a metadata-document client id or a
 * dynamic registration.
 */
export function isSelfServiceConnector(connectorId: string): boolean {
  const record = MCP_ENDPOINTS[connectorId];
  return record !== undefined && record.clientRegistration !== 'preregistered';
}

/** Connector ids with a verified remote MCP endpoint. */
export function connectorIdsWithMcpEndpoint(): string[] {
  return Object.keys(MCP_ENDPOINTS);
}
