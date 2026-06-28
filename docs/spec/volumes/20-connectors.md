# Volume 20 — Connectors

Status: Canonical (depth expansion of `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 20)
Authority: this manual · `docs/current/source-of-truth.md` (Settings → Connectors, P0 Gap 7) · `docs/strategy/01-competitive-teardown.md`, `02-gap-analysis.md` · `packages/unified-chat/src/lib/connectorPermissionStore.ts` · `packages/types/src/design-system/connector-permission.ts`

## Philosophy & Cloud/Local stance

A connector is a packaged, OAuth-or-key integration to a third-party data source (Gmail, Slack, GitHub, Notion, Drive, Postgres, Salesforce…) presented to the user through a **directory** with categories, search, per-tool permissions, per-conversation loading, and admin controls. Connectors sit on top of the tool + MCP layers (Vol 18/19): a connector is a curated bundle of tools with a recognizable brand, an auth flow, and a permission scope. The governing rule (source-of-truth P0 Gap 7): connectors read third-party data **only with explicit permission and a visible context label** — the user always knows a connector is reading their data and from which source.

Cloud/Local/Hybrid determines where the connector's data flows, never whether consent is required. In Local Mode, connectors that would carry data to a hosted model are not silently engaged; a local-only connector (e.g., a local Postgres) stays on the Local boundary. BYOK/Managed connectors operate with the user's keyed or managed access and a provider/source label. Connecting a source and _using its data in a hosted request_ are distinct consent events — loading a connector into a conversation is per-conversation and reversible, and admin policy can allowlist/denylist connectors for managed deployments. Connector tokens are secrets: OS keystore on Desktop/CLI/Mobile; Web holds account-scoped tokens server-side, never BYOK keys (Vol 25).

## Binding rules

1. Connectors read third-party data only with explicit user permission and a visible, persistent context label naming the source.
2. The connector directory exposes categories, search, per-tool permissions, per-conversation loading, and admin allow/deny controls (source-of-truth Settings IA).
3. Connecting a source and using its data in a hosted request are separate consent events; loading into a conversation is per-conversation and revocable.
4. Connector auth uses OAuth/PKCE or a user key; tokens live in the OS keystore (Desktop/CLI/Mobile) or account-scoped server storage (Web) — never in client logs.
5. A Local conversation never sends connector data to a hosted model without the explicit fork; local-only connectors stay on the Local boundary.
6. Connector tools inherit the Vol 18 fail-closed permission pipeline; write actions (send email, create issue, post message) require confirmation.
7. Connector content is untrusted data, never instructions (port odysseus O5, `docs/strategy/09`).
8. Respect per-user source permissions: a connector never returns data the signed-in user is not authorized to see in the source system.

## Repository map

- Connector permission state + UI contract: `packages/unified-chat/src/lib/connectorPermissionStore.ts` (+ `__tests__/connectorPermissionStore.test.ts`), `packages/types/src/design-system/connector-permission.ts`.
- Capability gating + settings IA: `packages/types/src/capabilities.ts`, `packages/types/src/design-system/settings-ia.ts`, `packages/ui/src/settings-nav.ts`, `packages/ui/src/settings-modal/`.
- Per-source connector APIs (tool layer): `packages/api/src/{email,calendar,messaging,database,cloudStorage,knowledge}.ts`.
- Transport: connectors ride the MCP layer (Vol 19, `packages/api/src/mcp.ts`) or a direct OAuth client; gateway config in `services/api-gateway/src/mcp/mcpConfig.ts`.
- Admin/enterprise controls: `packages/types/src/enterprise/index.ts`, `docs/enterprise/` (admin policy, allowlists).
- Secrets: OS keystore via `crates/agiworkforce-protocol/src/auth.rs` (CLI) / Desktop stronghold / Mobile SecureStore (Vol 25).

## Competitor notes

ChatGPT connectors/apps deliver search, deep research, sync, and write actions with confirmations and admin controls across Gmail/Drive/SharePoint/GitHub and more (`docs/strategy/01`, source-of-truth Competitive Baseline). Claude's connectors/MCP cover the same integration surface. AGI's target is directory + categories + search + per-tool permissions + per-conversation loading + admin controls (source-of-truth P0 Gap 7). AGI's deliberate divergence: every connector read is **explicit-permission + context-labeled + trust-scoped**, write actions are confirmation-gated, connector content is treated as untrusted, and managed deployments get admin allow/deny — a governance posture that is part of the privacy-first wedge (`docs/strategy/02`). Parity is the connector capability and workflow, never copied connector code or brand assets.

## Checklists

### Directory & discovery

- [ ] Directory lists connectors with category, search, and a clear "what it can access" summary.
- [ ] Each connector shows declared scopes and required auth before connect.
- [ ] Admin allow/deny list applies for managed/enterprise deployments.

### Auth & secrets

- [ ] OAuth/PKCE or user-key flow; tokens in OS keystore (Desktop/CLI/Mobile) or account-scoped server store (Web).
- [ ] Token refresh + revoke paths exist; revoke disconnects cleanly.
- [ ] No connector token/secret in client logs or telemetry (Vol 29).

### Permissions & consent

- [ ] Connecting a source and using it in a hosted request are separate consent events.
- [ ] Per-conversation loading: a connector is added to a conversation explicitly and is revocable.
- [ ] Per-tool permissions: read vs write separated; write actions confirmation-gated.
- [ ] A persistent context label names the active source in the conversation UI.

### Per-connector families

- [ ] Email (Gmail/Outlook): read scoped to consent; send is a confirmed write; body treated as untrusted (cf. odysseus O13).
- [ ] Chat (Slack/Discord): read scoped to channels the user can see; post is confirmed.
- [ ] Code (GitHub/GitLab): repo scope respected; PR/issue writes confirmed.
- [ ] PM (Jira/Linear): read/write separated; status changes confirmed.
- [ ] Docs/storage (Notion/Drive/Dropbox): per-user source permissions respected; no over-broad reads.
- [ ] CRM (Salesforce/HubSpot): field-level access respects source permissions.
- [ ] Databases (Postgres/MySQL/BigQuery/Snowflake): read vs write separated; writes destructive + gated; parameterized only.
- [ ] Generic (REST/GraphQL): SSRF allowlist enforced (Vol 18).

### Trust boundary

- [ ] A Local conversation does not send connector data to a hosted model without the fork (test-asserted).
- [ ] Local-only connectors stay on the Local boundary; no silent hosted egress.

### Admin & lifecycle

- [ ] Admin can enforce an allowlist and disable a connector org-wide.
- [ ] Connector updates re-check declared-vs-actual scope (no silent scope creep).

## Definition of Done

The connector directory ships categories/search/per-tool permissions/per-conversation loading/admin controls; every read is explicit-permission + context-labeled; connect and hosted-use are distinct consents; write actions are confirmation-gated; tokens live in the keystore and never in logs; connector content is untrusted; per-user source permissions are respected; and a trust-boundary test proves Local does not leak connector data to hosted models without the fork. Verified per Operating Law 4.

## Anti-patterns

- Reading a third-party source without explicit consent or without a visible source label.
- Collapsing connect and hosted-use into one silent consent.
- Auto-engaging a connector for a Local conversation and routing its data to a hosted model.
- Storing connector tokens in client logs or unencrypted state.
- Treating connector content as instructions.
- Returning data the signed-in user can't see in the source system.
