---
id: "SYS-connectors-plugins-and-skills"
type: "system"
title: "Connectors, plugins, skills and MCP"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Connectors, plugins, skills and MCP

Outside apps plug in through the web app's connector broker: OAuth with PKCE, tokens sealed with AES-256-GCM in Postgres, and MCP servers from a directory or a custom URL. Today 13 connectors are released; the full launch is switched to coming_soon. Plugins and skills install from a directory, and the skills folder is also customer content. Desktop and CLI run MCP through a Rust crate with local token stores. Slack is a separate app.

## What it is and why it exists

This page covers how outside apps and extensions plug into AGI Workforce. There are five parts.

- **Connectors.** A connector lets the assistant read or act in an outside app such as Notion or Linear. Most are remote MCP servers. MCP (Model Context Protocol) is the open standard for giving an AI tools and data. [code] (apps/web/lib/connectors/catalog.ts:161-275)
- **The MCP directory and custom MCP servers.** The directory lists many vendor servers. A user can also add any HTTPS MCP server by URL.
- **Plugins.** A plugin is a bundle, mostly skills. It installs from a built-in registry, a public directory, or a marketplace the user registers.
- **Skills.** A skill is a folder with a `SKILL.md` file that teaches the assistant a procedure. The folder `.agents/skills` is both developer tooling and customer content. [requirement] (AGENTS.md section 5) [code] (apps/web/lib/services/skill-catalog-service.ts:192)
- **The Slack app.** One Slack app installs per Slack workspace so people can message the assistant in Slack. It is separate from the `slack` connector, which signs in to Slack's own MCP server. [requirement] (docs/runbooks/connector-oauth-apps.md:275-320)

The goal is parity with the leaders: sign-in works in one click. Claude's and ChatGPT's connectors are the stated reference. [requirement] (docs/runbooks/connector-oauth-apps.md:11-60)

Execution boundary. Web connectors run on our servers: the server holds the tokens and calls the outside service. [code] (apps/web/app/api/connectors/[connectorId]/mcp/route.ts:23-100) Desktop and CLI run MCP clients on the device through the Rust crate `agiworkforce-mcp`. [code] (apps/cli/Cargo.toml:44, apps/desktop/src-tauri/Cargo.toml:36) Device-local connectors (filesystem, terminal, browser automation, screen vision, Ollama) are marked desktop-only, and the cloud does not run them. [code] (apps/web/lib/connectors/catalog.ts:207-211)

## How it works today

### 1. What is released

- The full-launch switch `CONNECTOR_RELEASE_STATE` is `coming_soon`. [code] (packages/contracts/types/src/connector-release.ts:14)
- Only 13 connector ids are released, through `SELECTIVELY_RELEASED_CONNECTOR_IDS`: airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist. [code] (connector-release.ts:16-30)
- `connectorReleased(id)` is true only for that exact set while the switch stays `coming_soon`. A directory alias or a custom server does not inherit it. [code] (connector-release.ts:52-58) [requirement] (docs/runbooks/connector-oauth-apps.md:11-30)
- The 13 ids work in ordinary account chat and Settings (the `allowSelective` path). Agent, voice, schedule, artifact and generic custom/plugin setup keep the full-launch restriction. [requirement] (docs/runbooks/connector-oauth-apps.md:19-22) [code] (apps/web/lib/connectors/connector-capability.ts:44-55)

### 2. The catalog

`CONNECTOR_CAPABILITIES` has about 90 records. There are three kinds.

| Kind | Meaning | Examples |
|---|---|---|
| first-party | We implement a fixed tool list. | github (3 tools), outlook, onedrive, teams, sharepoint, bank-accounts |
| operator-configurable | A generic remote-MCP client. The vendor's server decides the tools, discovered at connect time. | notion, linear, gmail, slack |
| device-local | The desktop runtime owns the tools. | local-filesystem, terminal, ollama |

[code] (apps/web/lib/connectors/catalog.ts:12-65, 161-275)

The catalog also ranks execution channels: a structured connector beats browser automation, which beats screen control. [code] (catalog.ts:298-319)

### 3. Directory

- `GET /api/connectors/directory` serves a snapshot built by the ingest. [code] (apps/web/app/api/connectors/directory/route.ts)
- The ingest crawls the official MCP registry at `registry.modelcontextprotocol.io`. [code] (apps/web/lib/connectors/directory/registry-client.ts:3)
- It merges in three checked-in source files. `first-party.json` has 32 entries, `vendor-directory.json` has 401, and `hand-checked.json` is empty. [code] (apps/web/lib/connectors/directory/sources/*.json, counted)
- The ingest probes each server's auth mode and its site icon. [code] (apps/web/lib/connectors/directory/ingest.ts:1-60)

A directory entry connects in one of these modes. [requirement] (docs/development/connectors-setup.md:17-30)

| Mode | What happens |
|---|---|
| connect, open | Lists the server's tools and saves a custom row. |
| connect, OAuth | `POST /api/connectors` answers 409 with `oauthStartPath`. |
| api-key-form | `POST /api/connectors/<id>/credentials` tests the tools list, then saves. |
| needs-setup | The entry names the missing environment variables. |
| desktop-and-cli | Nothing on the web. |

### 4. Sign-in (OAuth 2.1 with PKCE)

1. The browser opens `GET /api/connectors/oauth/start?connectorId=...`. It checks sign-in, the region, token-storage readiness and the workspace connector policy. [code] (apps/web/app/api/connectors/oauth/start/route.ts:187-198)
2. Discovery picks a client identity in this order: a pre-registered app, then a client-ID metadata document hosted by us, then dynamic registration. [requirement] (docs/development/connectors-setup.md:94-110)
3. PKCE `S256` is mandatory. A server that does not advertise it is refused. [requirement] (connectors-setup.md:111-118)
4. A pending row stores the state hash and the sealed code verifier. It expires after 600 seconds. [code] (apps/web/lib/connectors/oauth-store.ts:11, 52-80)
5. The vendor redirects to `/api/connectors/oauth/callback`. The callback checks `iss` and exchanges the code, in `finishConnectorAuthorization`. [code] (apps/web/app/api/connectors/oauth/callback/route.ts:61-70)
6. If a native app started the flow, the callback hands `state`, `code` and `iss` back to the app. The app then calls `POST /api/connectors/oauth/complete`. [code] (callback/route.ts:35-45; apps/mobile/app/(app)/connectors/oauth.tsx)
7. Refresh is single-flight: an in-process map plus a row lock (`for update`). [code] (apps/web/lib/connectors/oauth-access.ts:37, 145, 173; oauth-store.ts:476)
8. Scopes above a per-connector ceiling are dropped. [code] (apps/web/lib/connectors/oauth-scope-allowlist.ts:20-30)

### 5. Custom MCP servers

- The user gives an HTTPS URL. [code] (apps/web/lib/mcp-url-validation.ts:6-27)
- The URL must resolve to a public host, and embedded credentials are refused. [code] (mcp-url-validation.ts:19-26)
- The server probes the URL and lists its tools. If the server answers with an auth challenge, the row is saved as `sign_in_required` and OAuth starts. [requirement] (connectors-setup.md:32-53)
- A custom row carries either a bearer or header credential, or an OAuth client. Never both. [requirement] (connectors-setup.md:46-50)
- The number of custom servers is capped per plan. [code] (apps/web/lib/connectors/mcp-custom-connections.ts:212-225)

### 6. Calling a tool

- `POST /api/connectors/<id>/mcp` takes `callTool`, `readResource`, `getPrompt` and the task operations.
- It checks per-tool permission levels (allow, ask, deny) and a critical-risk tier. A call that is not allowed, or is critical, returns `approvalRequired` until the client sends `approved`.
- It writes an audit event. [code] (apps/web/app/api/connectors/[connectorId]/mcp/route.ts:36-135)
- MCP text used as chat context is fenced as untrusted. [code] (apps/web/lib/connectors/mcp-context-service.ts:13-14)

### 7. Plugins and skills

There are three install paths. [requirement] (docs/development/plugins-directory.md:152-160)

| Path | Route | Table |
|---|---|---|
| built-in pack | `POST /api/plugins/installations` | table:plugin_installations |
| public directory plugin (an inspected official or public marketplace entry) | `POST /api/plugins/marketplace-installations` with `pluginId` | table:plugin_marketplace_installations |
| account's own marketplace entry | the same route with `entryId` | table:plugin_marketplace_installations |

- A directory plugin is web-installable only if it ships at least one skill and declares no hooks, no language server and no stdio MCP server. Otherwise the entry points to the desktop app or CLI. [requirement] (plugins-directory.md:41-60)
- The directory is refreshed by cron `/api/cron/refresh-plugin-directory`. [code] (vercel.json:158)
- Installs resolve declared dependencies, up to 8 levels and 32 plugins. [requirement] (plugins-directory.md:228-260)
- Skills reach chat through `loadSelectableSkillCatalog`. It merges managed skills, the account's own skills (table:user_skills), installed directory skills and plugin-enabled skills. [code] (skill-catalog-service.ts:597-627)

### 8. Slack app

- An admin installs the app per workspace through `/api/slack/install` and `/api/slack/oauth/callback`. The bot token is stored sealed with purpose `slack-bot-token`. [code] (apps/web/lib/slack/slack-installations.ts:11; db/neon/0330_slack_app.sql:31-42)
- Slack events arrive at `/api/webhooks/slack`. The route verifies the Slack signing secret, answers the URL handshake, then hands assistant events to `after()` so it acknowledges in under 3 seconds. [code] (apps/web/app/api/webhooks/slack/route.ts:36-90)
- Each person links their Slack user to their account through `slack_link_requests`. [code] (0330_slack_app.sql:63,82)
- Approvals for risky actions expire after 24 hours. [code] (slack-config.ts:30)

## Implementation map

| Concern | Where | Basis |
|---|---|---|
| Connector HTTP API | apps/web/app/api/connectors/ (`route.ts`, `custom`, `directory`, `oauth/{start,callback,complete}`, `[connectorId]/{mcp,capabilities,credentials,accounts}`, `permissions`, `health`, `calls`, `account-state`, `bank-accounts`, `google-drive/picker`) | [code] |
| Catalog and release gate | apps/web/lib/connectors/catalog.ts; packages/contracts/types/src/connector-release.ts | [code] |
| Plan gate | apps/web/lib/connectors/connector-capability.ts; packages/contracts/types/src/billing-catalog.ts:351 | [code] |
| Workspace policy gate | apps/web/lib/services/connector-policy-gate.ts | [code] |
| OAuth store and sealing | apps/web/lib/connectors/oauth-store.ts; apps/web/lib/custom-connector-crypto.ts; apps/web/lib/crypto/connector-secret-reseal.ts | [code] |
| OAuth registry (pre-registered apps) | apps/web/lib/connectors/oauth-registry.ts (`CONNECTOR_OAUTH_PROVIDERS_JSON`) | [code] |
| Discovery, refresh, revoke | mcp-discovery.ts, oauth-access.ts, mcp-oauth-fetch.ts, mcp-oauth-clients.ts | [code] |
| Custom servers | mcp-custom-connections.ts, custom-connector-creation.ts, apps/web/lib/mcp-url-validation.ts | [code] |
| Directory | apps/web/lib/connectors/directory/ (ingest, merge, sources/*.json) | [code] |
| Plugins | apps/web/features/plugins/server/directory/; apps/web/app/api/plugins/ | [code] |
| Skills | apps/web/lib/services/skill-catalog-service.ts; apps/web/app/api/skills/; .agents/skills; skills-lock.json; scripts/verify-skills-lock.mjs; packages/tools/skills/src/integrity.ts | [code] |
| Slack app | apps/web/lib/slack/; apps/web/app/api/slack/; apps/web/app/api/webhooks/slack | [code] |
| Device MCP client | crates/agiworkforce-mcp (client, oauth/flow, transport/{http,sse,stdio}, security); consumers apps/cli/src/mcp/, apps/desktop/src-tauri/src/core/mcp/ | [code] |
| Mobile | apps/mobile/services/connectors.ts; apps/mobile/src/features/plugins/ | [code] |
| Desktop UI | apps/desktop/src/api/cloudConnectors.ts; apps/desktop/src/features/connectors/ | [code] |
| Tests | apps/web/app/api/connectors/route.test.ts; apps/web/lib/connectors/__tests__; crates/agiworkforce-mcp/tests | [code] |

## Data and state

### Tables (all Postgres on Neon)

| Table | Holds | Source |
|---|---|---|
| table:connector_oauth_authorizations | In-flight sign-ins: state hash, sealed code verifier, issuer, endpoints, 10-minute expiry. | oauth-store.ts:52-80 |
| table:connector_oauth_grants | Settled grants: sealed access and refresh token, scopes, expiry, account key, default flag, revoked_at. Row-level security by user. | 0097_connector_oauth_broker.sql:92-132 |
| table:mcp_oauth_clients | Dynamic client registrations, one per issuer. | 0115_mcp_oauth_discovery.sql:49; connectors-setup.md:103-107 |
| table:user_custom_connectors | Custom server rows, with a sealed auth header, `sign_in_required` and an optional sealed OAuth client secret. | 0052; 0313 |
| table:connector_tool_permissions | Per-tool allow, ask or deny. | 0069 |
| table:plugin_registry_entries, table:plugin_installations | Built-in packs and their installs. | 0096 |
| table:plugin_marketplace_sources, table:plugin_marketplace_entries, table:plugin_marketplace_installations | Marketplaces and their installs. Directory installs use shadow rows. | 0159 |
| table:user_skills | Skills the user authored. | 0157 |
| table:slack_installations, table:slack_link_requests, table:slack_account_links, table:slack_assistant_runs | The Slack app. | 0330 |
| table:slack_channel_policies | Per-channel rules. | 0374 |

The column and constraint details come from the migration files above; I did not open every one.

### Token storage

- Tokens are sealed with `sealEnvelope(..., 'hex-triple', purpose)`, which is AES-256-GCM. The key ring comes from `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` (64 hex characters). [code] (custom-connector-crypto.ts:49; apps/web/lib/crypto/envelope.ts:8)
- The purpose is bound into the auth tag. The purposes are: custom-connector-auth-header, oauth-client-secret, oauth-code-verifier, oauth-access-token, oauth-refresh-token, slack-bot-token, plaid-access-token. [code] (connector-secret-reseal.ts:13-21)
- Without the key, connecting is refused with a clear message. [code] (custom-connector-crypto.ts:34-41)
- A revoked grant must hold no secret, and a live grant must hold a token. These are database constraints. [code] (0097 migration:117-120)
- Disconnect revokes the token at the vendor where possible. [code] (oauth-access.ts:284-460)

### Device stores

- store:cli-keyring. The CLI keeps MCP OAuth tokens in the OS keyring. The old file `~/.agiworkforce/mcp-oauth.json` is read only for migration. [code] (apps/cli/src/mcp/oauth_store.rs:1-5)
- store:cli-mcp-registry. The CLI registry is `~/.agiworkforce/mcp.json`. Disabled servers are parked in a `disabledServers` object that the loader ignores. [code] (apps/cli/src/mcp/registry.rs:1-50)
- store:desktop-settings-db. Desktop encrypts MCP OAuth credentials with `encrypt_oauth_token` into its settings database. [code] (apps/desktop/src-tauri/src/core/mcp/oauth.rs:42-57)
- store:cli-skills. CLI skills load from the project `.agiworkforce/skills/`, `~/.agiworkforce/skills/` and `~/.agiworkforce/account-skills/`. [code] (apps/cli/src/skills.rs:1-8)
- store:cli-plugins. CLI plugins are tracked in `~/.agiworkforce/plugins/installed.json`. [code] (apps/cli/src/marketplace.rs:4)

### Skills integrity

- `skills-lock.json` (version 2, algorithm `agiskill-sha256-v1`) lists 113 skills: 64 `product` and 49 `developer`. [code] (skills-lock.json, counted)
- Any edit to a skill fails CI until `node scripts/verify-skills-lock.mjs --regenerate` runs. [requirement] (CLAUDE.md)
- `getManagedSkillDirectory` filters by audience, so only `product` skills reach customers. It caches the result. [code] (skill-catalog-service.ts:239-259)

## Rules: access, plans, modes

### Plans (internal tier ids)

The plan table is `BILLING_PLAN_CAPABILITY_TIERS`. [code] (packages/contracts/types/src/billing-catalog.ts:343-362)

| Capability | Tiers allowed |
|---|---|
| connectors | basic, pro, max, max_15x, team, team_premium, enterprise. Not free. |
| skills | free and every paid tier. |
| slack_app | pro and above. |
| artifact_connectors | pro and above. |
| agi_work | pro and above. |

- Plugin installs pass the workspace feature gate `plugins`, and authored skills also pass `skills`. [code] (apps/web/features/plugins/server/directory/install-gate.ts:11-12, 29-40)
- Custom MCP server count comes from `customMcpServers` in the plan limits: a number, `unlimited` or `custom`. [code] (billing-catalog.ts:526-717; free-plan-entitlements.ts:14)
- I did not map each number to its plan name. Read billing-catalog.ts. [unknown]
- A limit of 0 refuses custom servers. [code] (mcp-custom-connections.ts:218)
- A single user may have at most 32 connector tools. [code] (apps/web/lib/user-connector-tools.ts:135)
- Plan names shown to people were renamed. The code ids above are internal. [requirement] (memory: product-direction)

### Order of checks when connecting

1. Sign-in, rate limit and CSRF. [code] (apps/web/app/api/connectors/route.ts:533-539)
2. The workspace access gate. [code] (route.ts:239, 539)
3. The release check, then plan, then the kill switch `canUseConnectors`. A kill-switch read failure withholds tools. [code] (connector-capability.ts:23-60)
4. The workspace connector policy. A policy read failure refuses the connection. [code] (connector-policy-gate.ts:78-110)
5. Region refusal for sensitive-data connectors and token-storage readiness. [code] (oauth/start/route.ts:169-172)

### Modes

- mode:cloud. Web connectors, the Slack app and directory plugin installs are server-side and need an account. [code]
- mode:own-key and mode:local. Connectors are a cloud feature and need a paid account. But desktop and CLI MCP servers (stdio, HTTP, SSE) are configured and run on the device. Whether that needs sign-in or a subscription I did not establish. [unknown]
- Local inference is free of subscription. Nothing in the connector path makes it depend on one. [inferred]

### Trust boundaries

- Custom URLs must be HTTPS and public. [code] (mcp-url-validation.ts)
- OAuth fetches run through an egress guard. [code] (mcp-oauth-fetch.ts) In Rust the OAuth flow always validates endpoints. [code] (crates/agiworkforce-mcp/src/security.rs:1-9)
- The directory page says no Local session routes silently to the cloud. A device-local connector is never run by the cloud. [requirement] (AGENTS.md section 6)
- An own-marketplace plugin entry never enables a first-party pack. [requirement] (plugins-directory.md:217-227)

## Differences between apps

| App | Connectors | MCP | Skills | Plugins | Basis |
|---|---|---|---|---|---|
| surface:web | Full: directory, OAuth, custom, permissions | Server-side client | Managed, authored and installed | Directory, registry, own marketplace | [code] |
| surface:desktop | Cloud connectors via `cloudConnectors.ts`, plus a local MCP editor | Rust crate `agiworkforce-mcp`, with its own OAuth store | Cloud skills API | Cloud plugins section | [code] (apps/desktop/src/api/cloudConnectors.ts; src-tauri Cargo.toml:36) |
| surface:mobile | Directory, OAuth with app return (`oauth.tsx`), custom, bank accounts | Through the cloud only | Skills screen, new-skill sheet | Screens, installed list and marketplace sources | [code] (apps/mobile/services/connectors.ts; apps/mobile/src/features/plugins/sourcesService.ts:80-91) |
| surface:cli | None in the web sense. Third parties reach it through MCP. | Rust crate with keyring tokens; commands add, remove, enable, disable | `skills.rs` with local folders | `agi plugin install` from a path or git | [code] (apps/cli/src/mcp/*; marketplace.rs) |
| surface:vscode | A connectors tree view | MCP actions delegated to the CLI (`listMcpServers`, `loginMcpServer`) | Absent | Absent | [code] (apps/extension-vscode/src/features/surfaces/cliCapabilities.ts:21-27) |
| surface:chrome | Reads only the `canUseConnectors` capability and the coming-soon state | Exposes page-declared WebMCP tools with name and size limits. It is not a connector client. | Absent | Absent | [code] (apps/extension/src/features/cloud-bridge/capabilityDocument.ts:80-84; apps/extension/src/webmcp.ts) |

The Slack app is web-only and has no client in the other apps. [inferred]

Mobile and desktop native OAuth: the native app opens the browser, the web callback redirects back to the app, and the app calls `oauth/complete`. [code] (callback/route.ts:35-45)

Native clients use separate hosted metadata documents (`/.well-known/oauth-client-metadata/cli` and `/desktop`) with loopback redirects, so no local process can pose as the hosted web app. [requirement] (connectors-setup.md:80-92)

## Failure handling

- **Token storage not configured.** Connecting returns 503 with `CONNECTOR_TOKEN_STORAGE_UNAVAILABLE`. [code] (custom-connector-crypto.ts:28-29; oauth/start/route.ts:171)
- **Lost key.** Grants sealed with a lost key cannot be opened. The user must reconnect. [requirement] (connectors-setup.md:73-76) [code] (`ConnectorGrantDecryptionError`, oauth-store.ts:441)
- **Refresh failure.** The outcomes are `reauthorization-required` (expired, refresh-failed, undecryptable) or a transient 'unreachable' state that leaves the grant intact. [code] (oauth-access.ts:56-75)
- **Authorization server changed.** The start route answers `reauthorize`. A server without `S256` returns `error`. A refused registration returns `registration_rejected`. [code] (oauth/start/route.ts:67-76, 256-270)
- **Callback problems.** A malformed state redirects with `invalid_state`. A vendor denial redirects with `denied`. A wrong or missing `iss` is rejected. [code] (callback/route.ts:61-70; connectors-setup.md:123-126)
- **Policy unreadable.** The connection is refused with 503, never allowed. [code] (connector-policy-gate.ts:101-109)
- **Probe failure on add.** The add path returns `McpProbeError` codes: unreachable or edge-blocked. [code] (route.ts imports `CONNECTOR_BLOCKED_CODE`, `CONNECTOR_UNREACHABLE_CODE`)
- **Disconnect.** Vendor revocation is attempted and the result is reported to the user and logged in the audit trail. [code] (route.ts:883-960; oauth-access.ts:476-495)
- **Connectors not released.** Reads show 'Coming soon' for ids outside the released set. [code] (connector-release.ts:36-44)
- **Plugins.** A blocked install answers 409 with the runtime note and the CLI command. If migration 0159 is missing, install routes answer 503. [requirement] (plugins-directory.md:140-150) I did not recheck this against the code.
- **Truncated GitHub tree.** A truncated tree with no skill counts as a failed inspection, not as an empty plugin. [requirement] (plugins-directory.md:57-62)
- **Slack.** A missing signing secret returns 503. A bad signature returns 401. A payload over 256 KB returns 413. Settings says the app is not set up until the three variables exist. [code] (webhooks/slack/route.ts:36-62) [requirement] (connector-oauth-apps.md:316-319)
- **Skill catalog unreadable.** `SkillCatalogUnavailableError`. Optional sources (plugins, user skills) degrade to empty with a warning. [code] (skill-catalog-service.ts:161, 576-620)

## How it should work

- Registering our own OAuth apps for the 37 vendors that need one, and getting them verified, is the stated plan. It makes each connect a single click, as in Claude and ChatGPT. [requirement] (docs/runbooks/connector-oauth-apps.md:60-67) It is owner-only work and is not done. [unknown]
- The founder's checklists list the apps to create for GitHub, Google, Microsoft 365, Slack and others. [requirement] (connectors-setup.md:144-700)
- Google Gmail, Drive and Calendar sit on Google MCP services in Developer Preview. Google bars preview features in public apps before general availability. Eligibility and live connection are unverified. [requirement] (connectors-setup.md:165-185)
- Per the product direction, parity is required on all six apps. [requirement] (memory: product-direction) [proposed] Connectors on mobile and desktop stay cloud-routed, with an explicit consent step for any move from a local session. This matches AGENTS.md section 6, but I did not check that every path enforces it.
- Surface-matrix status should be regenerated, because it is stale (see outdated documents). [proposed]

## Gaps

- **Release scope.** The full launch is `coming_soon`, with 13 ids released. Most of the ~90 catalog ids cannot be connected. [code] (connector-release.ts:14-30)
- **Verification.** No document I read records a real connect, a vendor-accepted callback or a successful read for any connector. The runbook itself says so. [requirement] (connector-oauth-apps.md:25-30) The probe of vendor servers dated 2026-09-27 is the only dated evidence. [requirement] (connector-oauth-apps.md:50-58)
- **Own-marketplace limit.** A third-party marketplace that nests its plugins and is not in the snapshot resolves skills only from the root `skills/` folder. Fixing it needs a founder-gated migration. [requirement] (plugins-directory.md:200-210)
- **Plugin install by dependency.** The web installs only the version the marketplace lists, not the highest satisfying tag. [requirement] (plugins-directory.md:285-296)
- **Local MCP gating.** I did not establish how desktop, CLI and VS Code MCP relate to account sign-in or plan. [unknown]
- **Chrome and CLI.** Neither has a connector surface. Chrome has no MCP client for outside servers. [code]
- **Slack.** No test in the app tree was run, and I did not read the channel allow-list, credit-cap or approval code paths in depth. [unknown]
- **Legacy rows.** Rows sealed before purposes existed open under any context until re-sealed. A re-seal walk exists. [code] (connector-secret-reseal.ts:32-45)

## How to verify

Nothing here was run. These are the commands and checks to use (inventory in docs/agent-context/commands.json; heavy jobs go through scripts/dev/heavy-job.sh).

- **Skills lock.** `node scripts/verify-skills-lock.mjs`. CI runs it in .github/workflows/repo-operability.yml. [code] (skills-lock.json notes)
- **Connector scopes.** `pnpm check:connector-scopes`. [requirement] (connectors-setup.md:141)
- **Web tests.** Run them from apps/web with `pnpm exec vitest`, never the root binary. Relevant: apps/web/app/api/connectors/route.test.ts, apps/web/lib/connectors/__tests__, apps/web/lib/slack/*.test.ts, apps/web/features/plugins/server/__tests__. [requirement] (AGENTS.md section 12)
- **Rust.** The MCP crate has integration tests for OAuth, stdio, SSE reconnect, hardening and tools in crates/agiworkforce-mcp/tests.
- **Deployment readiness.** `GET /api/connectors` returns `setup` with the missing variables per connector. Readiness is not the same as a working sign-in. [requirement] (connectors-setup.md:11-15; connector-oauth-apps.md:25-30)
- **Human check.** Connect a released connector end to end (for example notion): start, consent, callback, tool list, one read. Then disconnect and confirm the vendor revoked the token. Then repeat on mobile for the app-return path. [proposed]
- **Plugin directory.** `GET /api/plugins` and the cron `/api/cron/refresh-plugin-directory`. The summary reports `inspectionsPending`. [requirement] (plugins-directory.md:75-92)
- **Slack.** Open Settings > Slack, install into a test workspace, DM the app, and confirm that a Free account gets the `slack_plan_required` reply. [code] (slack-assistant-turn.ts:415-421)

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Full connector launch is switched off: CONNECTOR_RELEASE_STATE is coming_soon. | read in the code | `packages/contracts/types/src/connector-release.ts:14` |
| Exactly 13 connector ids are selectively released: airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist. | read in the code | `packages/contracts/types/src/connector-release.ts:16-30`; `docs/runbooks/connector-oauth-apps.md:11-22` |
| The connector catalog has about 90 records of three kinds: first-party declared tools, operator-configurable remote MCP with runtime-discovered tools, and desktop-only device-local. | read in the code | `apps/web/lib/connectors/catalog.ts:12-65`; `apps/web/lib/connectors/catalog.ts:161-275` |
| Connectors need a paid plan: free is not in the connectors tier list. slack_app, agi_work and artifact_connectors need pro or above. Skills are open to free. | read in the code | `packages/contracts/types/src/billing-catalog.ts:332-362`; `apps/web/lib/connectors/connector-capability.ts:23-25` |
| Connector OAuth uses mandatory PKCE S256. A discovered server that does not advertise S256 is refused. | stated requirement | `docs/development/connectors-setup.md:111-118` |
| Pending authorizations live 600 seconds and store a hash of the state and a sealed code verifier. | read in the code | `apps/web/lib/connectors/oauth-store.ts:11`; `apps/web/lib/connectors/oauth-store.ts:52-80` |
| Access and refresh tokens are sealed with AES-256-GCM, with a purpose bound into the auth tag. The key ring is read from CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY. | read in the code | `apps/web/lib/custom-connector-crypto.ts:49`; `apps/web/lib/crypto/envelope.ts:8`; `apps/web/lib/crypto/connector-secret-reseal.ts:13-21` |
| Grants are stored in table connector_oauth_grants, which has row-level security, and a revoked row must hold no secret. | read in the code | `apps/web/db/neon/0097_connector_oauth_broker.sql:92-132` |
| Token refresh is single-flight per grant: an in-process map plus a row lock. | read in the code | `apps/web/lib/connectors/oauth-access.ts:37`; `apps/web/lib/connectors/oauth-access.ts:145`; `apps/web/lib/connectors/oauth-store.ts:476` |
| Custom MCP servers must use HTTPS and resolve to a public host, with no embedded credentials. The count is limited by the plan's customMcpServers limit. | read in the code | `apps/web/lib/mcp-url-validation.ts:6-27`; `apps/web/lib/connectors/mcp-custom-connections.ts:212-225` |
| A tool call through /api/connectors/<id>/mcp checks allow, ask or deny and a critical risk tier, returns approvalRequired until approved, and writes an audit event. | read in the code | `apps/web/app/api/connectors/[connectorId]/mcp/route.ts:36-135` |
| A user can have at most 32 connector tools. | read in the code | `apps/web/lib/user-connector-tools.ts:135` |
| The workspace connector policy is checked at connection time. If the policy cannot be read, the connection is refused. | read in the code | `apps/web/lib/services/connector-policy-gate.ts:78-110`; `apps/web/app/api/connectors/oauth/start/route.ts:187-198` |
| The directory snapshot merges the official MCP registry crawl with first-party.json (32 entries) and vendor-directory.json (401 entries); hand-checked.json is empty. | read in the code | `apps/web/lib/connectors/directory/registry-client.ts:3`; `apps/web/lib/connectors/directory/sources/first-party.json`; `apps/web/lib/connectors/directory/sources/vendor-directory.json` |
| Plugins install through three paths. Built-in packs go to plugin_installations. Directory and own-marketplace plugins go to plugin_marketplace_installations. | stated requirement | `docs/development/plugins-directory.md:152-160`; `docs/development/plugins-directory.md:297-312` |
| A directory plugin is web-installable only if it ships a skill and declares no hooks, language server or stdio MCP server. | stated requirement | `docs/development/plugins-directory.md:41-60` |
| skills-lock.json lists 113 skills (64 product, 49 developer). Only product skills reach customers through the managed skill catalog. | read in the code | `skills-lock.json`; `apps/web/lib/services/skill-catalog-service.ts:239-259` |
| Editing any skill file fails CI until the lock is regenerated with node scripts/verify-skills-lock.mjs --regenerate. Skills must not be installed with npx skills add. | stated requirement | `CLAUDE.md`; `skills-lock.json notes` |
| The Rust MCP crate speaks protocol 2026-07-28 and four legacy versions, over stdio, SSE and HTTP. It is used by desktop (Tauri) and CLI. | read in the code | `crates/agiworkforce-mcp/src/protocol.rs:5-8`; `crates/agiworkforce-mcp/src/config.rs:23-51`; `apps/cli/Cargo.toml:44`; `apps/desktop/src-tauri/Cargo.toml:36` |
| CLI MCP OAuth tokens go in the OS keyring; the old JSON file is read only for migration. Desktop encrypts them into its settings database. | read in the code | `apps/cli/src/mcp/oauth_store.rs:1-5`; `apps/desktop/src-tauri/src/core/mcp/oauth.rs:42-57` |
| The Slack app is installed per workspace. The bot token is sealed with purpose slack-bot-token. Events arrive at /api/webhooks/slack, verified by signing secret. | read in the code | `apps/web/lib/slack/slack-installations.ts:11`; `apps/web/db/neon/0330_slack_app.sql:31-42`; `apps/web/app/api/webhooks/slack/route.ts:36-62` |
| The Slack assistant refuses a user whose plan lacks slack_app (reply slack_plan_required) and refuses task mode without agi_work. | read in the code | `apps/web/lib/slack/slack-assistant-turn.ts:415-426` |
| Slack bot scopes the code requests: app_mentions:read, channels:history, chat:write, groups:history, im:history, reactions:write, users:read. Approvals expire after 24 hours. | read in the code | `apps/web/lib/slack/slack-config.ts:13-30` |
| The Slack app is configured only when the signing secret, client id and secret, app origin and token storage are all present. | read in the code | `apps/web/lib/slack/slack-config.ts:73-80` |
| Mobile finishes connector OAuth through an app-return route that calls oauth/complete. The web callback hands state, code and iss to the app when the app started the flow. | read in the code | `apps/web/app/api/connectors/oauth/callback/route.ts:35-45`; `apps/mobile/app/(app)/connectors/oauth.tsx` |
| The Chrome extension has no connector client. It reads the canUseConnectors capability and shows the coming-soon state, and it exposes page-declared WebMCP tools. | read in the code | `apps/extension/src/features/cloud-bridge/capabilityDocument.ts:80-84`; `apps/extension/src/webmcp.ts` |
| Setup readiness is not authorization: no connector may be marked connected from a redirect alone. | stated requirement | `docs/runbooks/connector-oauth-apps.md:25-30` |
| No document I read records a real run of a connector connect. | unknown | `docs/development/connectors-setup.md`; `docs/runbooks/connector-oauth-apps.md` |

## Open questions

- Do desktop, CLI and VS Code MCP servers work with no account and no subscription? I did not check sign-in or plan gating in the Rust and Tauri code.
- Which plan has which customMcpServers number (0, 5, 25, unlimited or custom)? I did not map them to plan names.
- Has any released connector ever been connected end to end on production? No document records a run.
- When will the full launch switch leave coming_soon, and what decides which ids join the 13? The code leaves that open.
- Are the Google Developer Preview eligibility and the owner-registered OAuth apps (37 vendors) in place? The documents say these are unknown or owner-only.
- Does the Slack assistant's channel allow-list and agent credit cap enforce what migrations 0374 and 0385 imply? I read only the plan gates.
- Should the Chrome extension get a connector client, or stay limited to WebMCP page tools? The code does not say.
- How does the CLI or desktop MCP trust boundary keep a Local session from reaching cloud connectors, given AGENTS.md section 6? I did not trace it.
- I did not open the Slack interaction and approval routes, plugin scan and signature code (migrations 0232, 0289), org-shared plugins, or the Plaid and health connectors in depth.

## Project documents found out of date

- `docs/product/surface-feature-matrix.md (last updated 2026-09-20)`: Says plugins are absent on mobile ('canUsePlugins false for mobile'). Says MCP is absent on desktop. The code says: canUsePlugins is true in the mobile capability row. Mobile has plugin screens and installs through the marketplace-installations route. Desktop has a Tauri MCP module with its own OAuth store, and an MCP config editor. (packages/contracts/types/src/capabilities.ts:54,87,120; apps/mobile/src/features/plugins/sourcesService.ts:80-91; apps/mobile/app/(app)/plugins/index.tsx; apps/desktop/src-tauri/src/core/mcp/oauth.rs; apps/desktop/src/features/mcp/MCPConfigEditor.tsx)
- `docs/product/surface-feature-matrix.md`: Lists Connectors as general_availability. The code says: Connector release is coming_soon, with 13 ids selectively released. (packages/contracts/types/src/connector-release.ts:14-30)
