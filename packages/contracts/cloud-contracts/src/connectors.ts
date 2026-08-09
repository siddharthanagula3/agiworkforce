/**
 * Cloud contracts — the connectors REST API served by apps/web:
 *
 *   GET    /api/connectors                list the user's connected services
 *   POST   /api/connectors                connect (or 409/501 when not connectable)
 *   DELETE /api/connectors                disconnect (?connectorId=)
 *   GET    /api/connectors/custom         list the user's custom remote-MCP connectors
 *   POST   /api/connectors/custom         add + persist a new custom connector
 *   DELETE /api/connectors/custom         remove one (?id=<row uuid>)
 *   GET    /api/connectors/oauth/start    begin a per-user OAuth grant
 *   GET    /api/connectors/oauth/callback the broker's registered redirect URI
 *
 * Mirrors `apps/web/app/api/connectors/route.ts` and
 * `apps/web/app/api/connectors/custom/route.ts` (both read in full for this
 * contract), plus `getUserCustomConnectorSummaries` in
 * `apps/web/lib/user-connector-tools.ts`.
 *
 * Wire conventions:
 *   - camelCase field names on both routes — unlike the snake_case sync/
 *     library/generated-files families, this mirrors the routes' actual JSON
 *     keys (`connectorId`, `authType`, `connectedAt`, `updatedAt`).
 *   - `connectedAt`/`updatedAt` are ISO strings, EXCEPT the synthetic
 *     github-app row (route.ts:167-172), which sets them to `''` when the
 *     connection state is derived from `github_installations` rather than a
 *     `user_connectors` row — schemas accept any string, including `''`.
 *   - Custom connectors are NEVER returned with a credential: the optional
 *     bearer `authToken` accepted on `POST /api/connectors/custom` is
 *     encrypted at rest (`lib/custom-connector-crypto.ts`) and never appears
 *     in any response — GET, POST, and DELETE all return the same
 *     secret-free row shape (`CustomConnectorSchema`).
 *
 * NAMESPACE (RESOLVED — was a real mismatch, fixed app-side since the last
 * reading of these routes): the chat tool loop's serverId for a user's custom
 * connector is `custom-<shortId>` — a 10-hex-char id, DELIBERATELY never the
 * row's full uuid (`user-connector-tools.ts:83-93`; the uuid alone would burn
 * 50 of the 64 chars providers allow in a qualified tool name — see the "Why
 * short_id" note at `user-connector-tools.ts:~563-574`).
 * `getUserCustomConnectorSummaries` now selects and returns `shortId`
 * (`user-connector-tools.ts:612-627, 634-657`), and `GET /api/connectors`
 * (route.ts:184-188) builds each custom row's `connectorId` as
 * `` `custom-${c.shortId}` `` — genuinely the SAME string the chat tool loop
 * uses as serverId. The row uuid stays in `id` (route.ts:183), which is the
 * key `/api/connectors/custom?id=` DELETE expects. So for a `source: 'custom'`
 * row: `connectorId` correlates with chat tool calls, `id` is the list/delete
 * key — two different, both-meaningful identifiers on the same row.
 * `shortId` itself is returned by BOTH `GET /api/connectors/custom`
 * (`getUserCustomConnectorSummaries`) and the `POST /api/connectors/custom`
 * 201 body (`saved.short_id`, custom/route.ts:257-269) — see
 * `CustomConnectorSchema` below, which requires it unconditionally.
 *
 * Enforcement anchor: none yet — no `__tests__/route.contract.test.ts` exists
 * for either route as of writing. These schemas are derived directly from
 * reading the route handlers, not from an asserted contract test.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// GET /api/connectors — route.ts:115-194 (handleGetConnectors)
// ---------------------------------------------------------------------------

/**
 * Provenance of a connection row. `'user'` = a `user_connectors` row
 * (route.ts:151-158); `'github-app'` = derived from `github_installations`,
 * no `user_connectors` row exists (route.ts:164-174); `'custom'` = a
 * `user_custom_connectors` row surfaced via `getUserCustomConnectorSummaries`,
 * `connectorId` namespaced `custom-<shortId>` (route.ts:180-194 — see the
 * NAMESPACE note in the file header).
 */
export const CONNECTOR_SOURCES = ['user', 'github-app', 'custom'] as const;
export type ConnectorSource = (typeof CONNECTOR_SOURCES)[number];

export const ConnectorConnectionSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().min(1),
  authType: z.string(),
  /** ISO string; `''` for the synthetic github-app row (route.ts:170-171). */
  connectedAt: z.string(),
  updatedAt: z.string(),
  source: z.enum(CONNECTOR_SOURCES),
  /** Display name — only populated for `source: 'custom'` (route.ts:147-148, 189); absent for every other source. */
  name: z.string().optional(),
});
export type ConnectorConnection = z.infer<typeof ConnectorConnectionSchema>;

export const ListConnectorsResponseSchema = z.object({
  connectors: z.array(ConnectorConnectionSchema),
  /** Connector ids connectable in this deployment (route.ts:108-113). */
  available: z.array(z.string()),
});
export type ListConnectorsResponse = z.infer<typeof ListConnectorsResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/connectors — route.ts:198-310 (handleCreateConnector)
// ---------------------------------------------------------------------------

export const ConnectRequestSchema = z.object({
  connectorId: z.string().min(1),
  /** Defaults server-side to 'oauth', or is forced to 'local' for local connectors (route.ts:228). */
  authType: z.string().optional(),
});
export type ConnectRequest = z.infer<typeof ConnectRequestSchema>;

/**
 * 201 success body (route.ts:295-309). The entry is now the SAME shape as a
 * `GET` row (`source: 'user' as const` was added server-side, route.ts:305) —
 * this endpoint only ever produces `source: 'user'` rows (github and
 * non-connectable providers short-circuit into `ConnectConflictResponseSchema`
 * below before reaching this branch), so reusing `ConnectorConnectionSchema`
 * is exact, not just compatible.
 */
export const ConnectSuccessResponseSchema = z.object({
  connector: ConnectorConnectionSchema,
});
export type ConnectSuccessResponse = z.infer<typeof ConnectSuccessResponseSchema>;

/**
 * 409/501 body when the connector cannot be toggled directly (route.ts:233-259):
 *   - github (409 when the App install flow is configured, else 501):
 *     `{ error, connectorId, installStartPath? }` — no `authType`.
 *   - any other non-local, non-operator-mapped connector (501):
 *     `{ error, connectorId, authType }` — no `installStartPath`.
 * Both optional fields are modeled here so one schema covers either variant.
 */
export const ConnectConflictResponseSchema = z.object({
  error: z.string(),
  connectorId: z.string(),
  installStartPath: z.string().optional(),
  authType: z.string().optional(),
});
export type ConnectConflictResponse = z.infer<typeof ConnectConflictResponseSchema>;

// ---------------------------------------------------------------------------
// DELETE /api/connectors?connectorId= — route.ts:314-365 (handleDeleteConnector)
// ---------------------------------------------------------------------------

export const DisconnectResponseSchema = z.object({
  success: z.boolean(),
});
export type DisconnectResponse = z.infer<typeof DisconnectResponseSchema>;

// ---------------------------------------------------------------------------
// /api/connectors/custom — custom remote-MCP connectors
// (apps/web/app/api/connectors/custom/route.ts)
// ---------------------------------------------------------------------------

export const CUSTOM_CONNECTOR_TRANSPORTS = ['sse', 'streamable-http'] as const;
export type CustomConnectorTransport = (typeof CUSTOM_CONNECTOR_TRANSPORTS)[number];

/**
 * A user's custom connector row. Returned by both
 * `GET /api/connectors/custom` (via `getUserCustomConnectorSummaries`,
 * user-connector-tools.ts:629-657) and the `POST /api/connectors/custom` 201
 * body (custom/route.ts:257-269) — the same shape either way. No
 * secrets/credentials on the wire, ever — `auth_header_enc` never leaves the
 * server.
 */
export const CustomConnectorSchema = z.object({
  /** Row uuid — the list/DELETE key (user-connector-tools.ts:613-614). */
  id: z.string().min(1),
  /**
   * 10-hex chat-facing id: the tool loop's serverId is `custom-<shortId>`
   * (user-connector-tools.ts:615-621). Required here because both routes
   * always return it — `getUserCustomConnectorSummaries`
   * (user-connector-tools.ts:643, 651) and `handlePost`'s `RETURNING` clause
   * + response body (custom/route.ts:232, 263).
   */
  shortId: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  transport: z.enum(CUSTOM_CONNECTOR_TRANSPORTS),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomConnector = z.infer<typeof CustomConnectorSchema>;

/** GET /api/connectors/custom (custom/route.ts:123-131). */
export const ListCustomConnectorsResponseSchema = z.object({
  connectors: z.array(CustomConnectorSchema),
});
export type ListCustomConnectorsResponse = z.infer<typeof ListCustomConnectorsResponseSchema>;

/**
 * POST /api/connectors/custom request body (custom/route.ts:135-140, 158-176):
 *   - `name`: required, 1-200 chars (custom/route.ts:158-161).
 *   - `url`: required; server validates https + resolves a public hostname
 *     (`validateHttpsMcpUrl`) before ever using it — not re-asserted here.
 *   - `transport`: OPTIONAL. When absent the server infers it from the url
 *     path (`.../sse` suffix -> 'sse', else 'streamable-http';
 *     custom/route.ts:165-170).
 *   - `authToken`: OPTIONAL bearer credential, max 4096 chars
 *     (custom/route.ts:172-175). Encrypted at rest; never echoed back in any
 *     response.
 */
export const CreateCustomConnectorRequestSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().min(1),
  transport: z.enum(CUSTOM_CONNECTOR_TRANSPORTS).optional(),
  authToken: z.string().max(4096).optional(),
});
export type CreateCustomConnectorRequest = z.infer<typeof CreateCustomConnectorRequestSchema>;

/**
 * POST /api/connectors/custom 201 body (custom/route.ts:257-272). `toolCount`
 * is the live tool count from the connect-and-list probe the server performs
 * before persisting (custom/route.ts:205-222) — a SIBLING of `connector`, not
 * nested inside it. `connector.shortId` is `saved.short_id` (custom/route.ts:263),
 * matching `CustomConnectorSchema` exactly — see that schema's doc comment.
 */
export const CreateCustomConnectorResponseSchema = z.object({
  connector: CustomConnectorSchema,
  toolCount: z.number().int().nonnegative(),
});
export type CreateCustomConnectorResponse = z.infer<typeof CreateCustomConnectorResponseSchema>;

/**
 * DELETE /api/connectors/custom?id=<row uuid> (custom/route.ts:276-314).
 * NOTE: the query param is `id` — the plain row uuid, the same value as
 * `CustomConnectorSchema.id` — NOT `connectorId` like the built-in
 * `/api/connectors` DELETE. Same `{ success }` response shape either way.
 */
export const DeleteCustomConnectorResponseSchema = DisconnectResponseSchema;
export type DeleteCustomConnectorResponse = DisconnectResponse;

// ---------------------------------------------------------------------------
// Per-user connector OAuth broker — the two addresses every surface must agree
// on (apps/web/app/api/connectors/oauth/{start,callback}/route.ts)
// ---------------------------------------------------------------------------

/**
 * Where a client sends the user to begin authorization for `connectorId`.
 *
 * This is a CROSS-SURFACE address, which is why it lives here rather than in
 * the (server-only) registry that used to own it. Three consumers read it and
 * none of them can be fixed by a build:
 *
 *   - apps/web builds the outgoing link (`buildConnectorOAuthStartPath`,
 *     `apps/web/lib/connectors/oauth-registry.ts`);
 *   - apps/mobile appends `&mode=json` and asks for the authorize URL instead
 *     of following the 302 (`apps/mobile/services/connectors.ts`);
 *   - the shared chat UI ACCEPTS a Connect button only when the server's
 *     `connectUrl` is exactly this path, so a drifted copy there does not
 *     produce a wrong link — it rejects a genuine card and the button vanishes
 *     (`packages/ui/unified-chat/src/lib/connector-connect-required.ts`, which
 *     restates the literal because the shared UI package has no dependency on
 *     this one; `apps/web/__tests__/contracts/connector-oauth-paths.test.ts`
 *     pins that copy to this constant).
 */
export const CONNECTOR_OAUTH_START_PATH = '/api/connectors/oauth/start';

/**
 * Where the hosted callback is mounted. The redirect URI registered with each
 * provider is this path on the operator's configured origin, so moving the
 * route without re-registering breaks every live provider — hence the contract
 * test that asserts a handler still exists here.
 */
export const CONNECTOR_OAUTH_CALLBACK_PATH = '/api/connectors/oauth/callback';
