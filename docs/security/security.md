# Security

Status: Current
Owner: Platform lead, with Legal/compliance co-owning section 1
Last updated: 2026-09-07
Rotation cadence: every 12 months per key, plus immediately on suspected exposure

The single security document for this repository. Four live policies live here as
sections 1 to 4, and section 5 records reviews that are closed. Root `SECURITY.md`
holds the vulnerability reporting policy and points here. Three documents stay
outside this file on purpose: `apps/extension/docs/threat-model.md` is owned by
the extension surface, `docs/runbooks/incident-response.md` is an operational
procedure, and `docs/compliance/dpdp-audit-log.md` is regulation-specific.

| Section | Subject                              | Owner                              |
| ------- | ------------------------------------ | ---------------------------------- |
| 1       | Agent authority and connector scopes | Legal/compliance and Platform lead |
| 2       | Connector OAuth scope ceilings       | Platform lead                      |
| 3       | Encryption key rotation              | Platform lead                      |
| 4       | Tauri updater signing key custody    | Platform lead                      |
| 5       | Closed reviews                       | Platform lead                      |

---

## 1. Agent authority and connector scopes

The source-of-truth matrix that `/acceptable-use` and `/agent-permissions` are
written against. Every public sentence on those pages must trace to a row in this
section, and every row cites the implementing file. If you change the tool loop,
the approval gate, the connector surface, or an OAuth scope list, update this
section and the two pages in the same change.

### Why this section exists

A prior audit found that marketing copy described a permission model the code did
not implement. The fix is not "write more careful copy", it is to keep a single
matrix that copy is rendered against, so a behaviour change is visibly a copy
change. Do not add a row you cannot cite.

---

### 1.1 Managed Cloud, default tool authority

The gate is `resolveToolCallGate()` in
`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` (~L1466-1486).
Precedence, highest first:

| Rank | Condition                                         | Verdict | Machine reason               |
| ---- | ------------------------------------------------- | ------- | ---------------------------- |
| 1    | User saved `deny` for the tool                    | deny    | `blocked_by_user_permission` |
| 2    | User saved `allow`, and the trifecta triple holds | ask     | `lethal_trifecta`            |
| 3    | User saved `allow`                                | allow   | `always_allow`               |
| 4    | User saved `ask`                                  | ask     | `user_requires_approval`     |
| 5    | `approvalMode === 'manual'`                       | ask     | `manual_approval_mode`       |
| 6    | Trifecta triple holds                             | ask     | `lethal_trifecta`            |
| 7    | otherwise                                         | allow   | `auto_approval_mode`         |

`approvalMode` is set in `tool-loop-routing.ts` (L63):
`approvalMode: hasMcpTools ? 'manual' : 'auto'`.

**Consequence, and the single most important honest statement on the public
pages:** a turn that carries no connector/MCP tool runs in `auto` mode. In `auto`
mode, with no saved verdict, the built-in tools execute with no approval prompt.

| Tool                     | Runs without approval by default?       | Declared metadata (`tool-metadata.ts`)                           |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------- |
| `web_search`             | yes                                     | read, reversible, acceptsUntrustedContent, createsEgressPath     |
| `url_fetch`              | yes                                     | read, reversible, acceptsUntrustedContent, createsEgressPath     |
| `execute_code`           | yes                                     | execute, **not** reversible, createsEgressPath                   |
| `write_file`             | yes                                     | write, **not** reversible, no egress                             |
| `create_folder`          | yes                                     | write, reversible, no egress                                     |
| `create_office_file`     | yes                                     | write, reversible, no egress                                     |
| skill tool               | yes                                     | ,                                                                |
| any connector / MCP tool | **no**, forces `approvalMode: 'manual'` | per-tool; undeclared defaults to the conservative classification |

`write_file` / `create_folder` / `create_office_file` / `execute_code` act inside
the conversation's own E2B sandbox workspace, not on the user's device. Public
copy must say so in the same breath as "no approval", or the sentence reads worse
than the reality.

#### 1.1a Lethal-trifecta escalation and its published limits

Escalates auto-approval to a human ask when all three hold at once: untrusted
content in context (U) + a sensitive source reachable (S) + the pending call
creates an egress path (E). Documented in-file (`tool-loop.ts` ~L1418-1441) as a
mitigation, not a proof. The limits are published verbatim on `/agent-permissions`
because a security reviewer will find them anyway:

- U is raised by **tool-fetched** third-party content. Content the user **pasted
  or attached is not counted**, a real injection vector the heuristic does not see.
- S is derived from the offered catalog, not from what was actually read, so it
  over-triggers rather than under-triggers (deliberate).
- E is per-tool metadata, so an MCP server that exfiltrates through an undeclared
  channel is invisible. Undeclared tools are therefore classified as having egress.
- It gates auto-approval only. It cannot stop a user who approves.

#### 1.1b A Block is absolute, with the accurate scope of "absolute"

A saved `deny` is enforced server-side before any side effect, on the tool loop
(`tool-loop.ts` L2444) and on the approve/resume path
(`approve/route.ts` L267, `tool-loop.ts` L2078), so an approving client, or a
hand-rolled POST, cannot execute a blocked tool.

**Do NOT claim** blocked tools are withheld from the model's offered catalog. No
code filters the catalog by verdict; enforcement is at execution. Verified
2026-08-05: no caller of `isDenied` / `levelForConnectorTool` exists in the
catalog-assembly path.

---

### 1.2 What Managed Cloud can actually connect

`apps/web/lib/user-connector-tools.ts` (module header L1-51). Exactly four sources:

| Source                               | Gate                                                            | Credential location                                                                 |
| ------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GitHub App built-in                  | a usable GitHub App installation                                | `github_installations.access_token_enc`, resolved per request                       |
| Operator-mapped remote MCP servers   | active `user_connectors` row + `CONNECTOR_MCP_SERVERS_JSON`     | operator config, server-side                                                        |
| User's own custom remote MCP servers | `user_custom_connectors` row                                    | URL + optional bearer token, encrypted (`lib/custom-connector-crypto.ts`)           |
| Platform-OAuth directory connectors  | `connector_oauth_grants` row + `CONNECTOR_OAUTH_PROVIDERS_JSON` | per-user access/refresh tokens, AES-256-GCM (`lib/connectors/oauth-store.ts`, 0097) |

The fourth source is the only one where **the platform holds the OAuth client and
the user holds the grant**. Its authority is therefore bounded by the scopes the
user consented to at the provider, recorded on the grant row, not by operator
configuration. The client credentials live in
`CONNECTOR_OAUTH_<ID>_CLIENT_ID` / `_CLIENT_SECRET`, never in the descriptor
JSON. Grants are strictly personal: `connector_oauth_grants` is scoped by
`user_id` with no `organization_id`, so switching workspace never inherits
another member's tokens (migration 0097 header).

As of 2026-08-05 no provider is configured in production, so this source
contributes no connectors and every directory entry still reports unavailable.

`user_connectors` holds only `connector_id + auth_type + is_active`. **No tokens,
no endpoint URLs.** `POST /api/connectors` returns 501 for every branded catalog
connector and for device-local ids (`route.ts` L289, L306, L332).

GitHub built-in tools, complete list (`user-connector-tools.ts` L180-240):
`get_pull_request_diff`, `post_issue_comment`, `post_pull_request_review`.

The GitHub App's **installation permission set is configured on GitHub and is not
declared anywhere in this repository.** Public copy must say that rather than
guess a permission list.

Per-user connector tool count is capped per plan (`getPlanMaxConnectorTools`,
falling back to `MAX_CONNECTOR_TOOLS_PER_USER`). Remote endpoints pass
DNS-resolution SSRF validation (`assertResolvedPublicHostname`).

---

### 1.3 Desktop (Local), the only place real OAuth scopes are requested

User's **own** OAuth client id/secret, PKCE, tokens encrypted with a
machine-derived key into local SQLite.

| Provider         | File                                                                                 | Scopes requested                                                     |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Gmail            | `apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs` L46-49, L122-126 | `gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile` |
| Google Calendar  | `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs` L15-17, L34-36     | `calendar.readonly`, `calendar.events`                               |
| Outlook Calendar | `apps/desktop/src-tauri/src/features/calendar/outlook_calendar.rs` L15-17, L34-37    | `User.Read`, `Calendars.Read`, `Calendars.ReadWrite`                 |

As of 2026-09-03 Gmail and Google Calendar no longer request scopes broader
than the advertised capability. The Gmail client previously also requested
`gmail.modify`, which permits changing and deleting mail; it was dropped
because the desktop code only calls read and watch endpoints. The calendar
client previously also requested the unrestricted `auth/calendar` scope
alongside the two narrower scopes shown above, which made it redundant; it was
dropped because the desktop code only calls calendar-list and event endpoints.
See section 2 for the full rationale and the exact
API calls each scope covers.

---

### 1.4 Chrome extension, computer use

| Fact                                                                                                      | Citation                                                                                 |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Ask-before-acting defaults ON; autopilot is an explicit opt-out (only a stored `false` disables the gate) | `apps/extension/src/background.ts` L3905-3919                                            |
| Unanswered approval denies after 30 s (fail-closed)                                                       | `background.ts` L3943, L3964, L3990                                                      |
| Navigation destinations gated by the user's `agi_site_allowlist`                                          | `cdpDriver.ts`; `background.ts` L2542-2563                                               |
| Text egress (DOM summaries, field readbacks) is redacted by `cdpDriver`                                   | `agentLoop.ts` L20-22                                                                    |
| **Screenshots are NOT and cannot be redacted** and reach the cloud gateway                                | `agentLoop.ts` L24-35, "Do not claim screenshots are redacted anywhere in this codebase" |
| Computer use requires Managed Cloud auth and posts from the extension to the cloud gateway                | `background.ts` L3889-3902; `cloudAgentClient.ts`                                        |

---

### 1.5 Enforcement machinery a "what happens on violation" section may cite

| Control                                                                            | Value                                                     | Citation                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Suspend / ban enforced on every authenticated request, fail-CLOSED after one retry | `profiles.account_status` in (`suspended`,`banned`) → 403 | `apps/web/lib/api-auth.ts` L45-93                           |
| Admin actions that write that column                                               | suspend / ban / reinstate                                 | `apps/web/app/api/admin/security/route.ts` L240, L299, L367 |
| LLM requests per user                                                              | 30 / min, failClosed                                      | `apps/web/lib/rate-limit.ts` L233-236                       |
| LLM requests per IP (pre-auth abuse ceiling)                                       | 1500 / min, failClosed                                    | `rate-limit.ts` L228-231                                    |
| Conversation operations                                                            | 60 / min                                                  | `rate-limit.ts` L207-210                                    |
| Public API scopes, the complete set                                                | `models:read`, `inference:write`, `usage:read`            | `apps/web/lib/api-key-scopes.ts` L1                         |
| Crawler policy; Common Crawl blocked                                               | `CCBot: disallow /`                                       | `apps/web/app/robots.ts` L47                                |
| Connector add/remove audited                                                       | `connector_added` / `connector_removed`                   | `lib/security-audit.ts`, `api/connectors/route.ts` L437     |

---

### 1.6 Sandbox limits

`apps/web/lib/e2b/gate.ts`, fail-closed: provisioning requires **both**
`AGI_E2B_EXECUTION=1` and `E2B_API_KEY`.

`apps/web/lib/e2b/runtime.ts`:

- ephemeral sandbox timeout 60 s (`E2B_SANDBOX_TIMEOUT_MS` L56); conversation
  sandbox 10 min (`E2B_CONVERSATION_TIMEOUT_MS` L65); per-command 60 s (L66).
- per-plan concurrent sandbox allowance (`getPlanMaxSandboxes`, L97).
- network: none, or an allowlist of `TRUSTED_CODE_HOSTS` (L68-76).
  `github.com`, `api.github.com`, `raw.githubusercontent.com`,
  `objects.githubusercontent.com`, `registry.npmjs.org`, `npmjs.com`,
  `pypi.org`, `files.pythonhosted.org`.
- Cloud Code sessions may add up to 10 extra egress hosts
  (`apps/web/lib/e2b/egress-hosts.ts`). At session creation each host (and the
  base domain of a leading wildcard) is resolved with `node:dns/promises` and
  rejected if any A/AAAA answer is loopback, link-local, RFC1918/unique-local,
  the cloud metadata address, or unresolvable
  (`apps/web/lib/e2b/egress-host-resolution.ts`). This is a point-in-time
  check: a host that later rebinds its DNS to a private or metadata address
  after the session starts is not re-resolved server-side.
- **A raw managed provider key never enters a sandbox**, whatever the network
  preset. A coding harness is "proxy-covered" only when it has exactly one
  provider credential and a verified way to redirect its traffic through
  `provider-proxy/[...path]/route.ts` on a session-scoped, short-lived token,
  either an env var (`claude`, via `ANTHROPIC_BASE_URL`) or a config file the
  session bootstrap writes once at creation (`codex`, via `~/.codex/config.toml`'s
  `model_providers.<id>.base_url`/`env_key`); see `harnessIsProxyCovered` and
  `harnessProxyConfigFile` in `apps/web/lib/e2b/templates.ts`. For every other
  harness (`droid`, `amp`, `grok`, `opencode`, and any future addition with no
  verified override), `resolveHarnessEnvs` in `runtime.ts` withholds the
  managed key rather than injecting it, and `POST /api/code/sessions` refuses
  managed-mode session creation for it outright (`harness_credential_unavailable`)
  unless the caller supplies their own credential. `sessions/[sessionId]/provider-proxy/[...path]/route.ts`
  gates and meters every proxied inference call the same way the other
  platform-funded compute entry points under `api/code` do.

---

### 1.7 Revocation paths, the complete set

| Path                                             | Mechanism                                                                                                        | Also clears saved per-tool verdicts?                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Disconnect a connector                           | `DELETE /api/connectors?connectorId=`                                                                            | yes, `clearConnectorToolPermissions` (`route.ts` L436, L466) |
| Reset one tool's verdict, or a whole connector's | `DELETE /api/connectors/permissions`                                                                             | n/a, this _is_ the verdict store                             |
| Set a tool back to "ask"                         | `PUT /api/connectors/permissions` with `level: "ask"`                                                            | ,                                                            |
| Unlink GitHub                                    | `DELETE /api/connectors?connectorId=github` deletes the user's `github_installations` rows                       | yes                                                          |
| Fully uninstall the GitHub App                   | github.com/settings/installations, **the app stays installed on GitHub until you do this** (`route.ts` L428-430) | ,                                                            |
| Remove a custom MCP connector                    | `DELETE /api/connectors/custom?id=`                                                                              | ,                                                            |
| Extension: remove a site                         | `agi_site_allowlist` in extension options                                                                        | ,                                                            |
| Extension: re-enable the gate                    | turn ask-before-acting back on                                                                                   | ,                                                            |
| Desktop: per-tool policy                         | Always allow / Needs approval / Blocked in `ConnectorDetailView.tsx`                                             | ,                                                            |

---

### 1.8 Known gaps this file deliberately records rather than papers over

1. **A branded catalog connector can only be OAuth-connected where the operator
   configured it.** The hosted broker now exists end to end
   (`/api/connectors/oauth/start` → `/api/connectors/oauth/callback`, grants in
   `apps/web/lib/connectors/oauth-store.ts`), but
   `apps/web/lib/connectors/oauth-registry.ts` ships **zero** providers on
   purpose, a provider becomes connectable only when an operator supplies its
   endpoints and client credentials. `GET /api/connectors` reports the ids that
   are genuinely connectable in a given deployment, and the catalog labels every
   other entry from that answer, so an unconfigured connector renders as
   unavailable rather than offering a Connect button that 501s.
2. ~~`gmail.modify` and the full `auth/calendar` scope were broader than the
   advertised capability.~~ Fixed 2026-09-03: the desktop Gmail and Google
   Calendar clients now request only `gmail.readonly`, `gmail.send`,
   `calendar.readonly`, and `calendar.events`, matching the endpoints each
   client actually calls. See section 1.3 above and section 2.
3. **The GitHub App installation permission set is not declared in this repo**, so
   it cannot be documented from code.
4. **The standing per-tool permission UI on web is GitHub-only.**
   `ToolPermissionsPanel.tsx` is imported and rendered by
   `features/connectors/pages/ConnectorsPage.tsx`, but its "Tool permissions"
   button is gated on `hasWireToolNames(connector.id)`, true only for `github`,
   because only that catalog entry holds real wire tool names (see gap 5). For
   every other connector the sole web control remains the in-chat approval card
   (`ToolTimeline.tsx`), reachable only while a tool is asking. Marketing copy
   claiming a standing per-tool web UI across connectors is still unsupported.
5. **`CONNECTOR_TOOLS` in `features/connectors/config/connector-logos.ts`** lists
   tool names for connectors with no runtime implementation. Only the `github`
   entry (L564) mirrors real wire names.

---

## 2. Connector OAuth scope ceilings

The per-connector maximum set of OAuth scopes this platform may ever request, and
the enforcement point that drops anything above it. Companion to section 1, which
owns the wider agent-authority matrix. Section 1 stays the source of truth for
what the agent may do once a token exists; this section is only about how wide
the token is.

### Read this first: no scope string is hardcoded in this repository

`apps/web/lib/connectors/catalog.ts` records `scopes: []` for every entry on
purpose. The `ConnectorScopeSource` type at the top of that file names the
reason: for a cloud connector the scopes are `operator-defined`, so the
repository does not know them and does not guess. There is nothing to reduce in
the catalog, because nothing is declared there.

The scopes a Managed Cloud user is actually asked to consent to come from an
operator-supplied descriptor in the `CONNECTOR_OAUTH_PROVIDERS_JSON` environment
variable, parsed by `apps/web/lib/connectors/oauth-registry.ts` and written onto
the authorization URL by `buildAuthorizationUrl` in the same file. So the only
place this repository can enforce minimality is where that descriptor is loaded.
That is what the ceiling table below does.

**Current state: no OAuth provider is configured in production.** Section 2 of
Section 1.2 records this as of
2026-08-05 and it still holds. The enforcement described here is therefore
inert against live traffic today. It exists so that the first operator who
configures a provider cannot quietly request more than this file permits.

### The four connector sources, and which one has scopes at all

Mirrors section 1.2, which cites `apps/web/lib/user-connector-tools.ts`.

| Source                               | Who decides the authority                                       | Scope ceiling applies?                              |
| ------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------- |
| GitHub App built-in                  | the App's installation permission set, configured on github.com | No. External, not declarable from code.             |
| Operator-mapped remote MCP servers   | the vendor's own MCP server plus `CONNECTOR_MCP_SERVERS_JSON`   | No. The vendor server decides what a token unlocks. |
| User's own custom remote MCP servers | the URL and bearer token the user supplies                      | No. The user holds the credential.                  |
| Platform-OAuth directory connectors  | the descriptor in `CONNECTOR_OAUTH_PROVIDERS_JSON`              | Yes. This is the enforced path.                     |

Two consequences worth stating plainly rather than implying otherwise:

- Most branded connectors in the catalog (Slack, Notion, HubSpot, Asana, Jira,
  Figma, Vercel, Stripe and the rest listed in
  `apps/web/lib/connectors/mcp-endpoints.ts`) reach the vendor's own hosted MCP
  server. This repository implements none of their tools, so it cannot map a
  scope to an API call the way a first-party integration could. The ceiling
  below still applies when such a connector is configured through the
  platform-OAuth path, but the vendor grants the capability, not this code.
- GitHub is a GitHub App, not an OAuth-scope-string flow. Its permission set
  lives in the App's settings on github.com and appears in no manifest, no
  `apps/web/lib/github-app.ts` constant, and no `scripts/github-app-env.mjs`
  value. `github` is reserved in the OAuth registry
  (`RESERVED_CONNECTOR_IDS` in `oauth-registry.ts`), so it can never be
  configured through this path.

### Enforcement

`apps/web/lib/connectors/oauth-scope-allowlist.ts` holds
`CONNECTOR_OAUTH_SCOPE_CEILINGS`, one entry per connector id.
`filterConnectorScopes(connectorId, requested)` splits an operator's requested
list into the scopes on the ceiling and the ones above it.

`loadConnectorOAuthRegistry()` in `oauth-registry.ts` calls it for every
descriptor it admits. Scopes above the ceiling are dropped from the provider
record before it enters the registry, so they never reach the `scope` parameter
of the authorization URL, and a warning naming the connector and the dropped
scopes goes to the logger. Loading never throws on an excessive scope: the
provider still loads, only narrower. A descriptor with no scopes, or with only
on-ceiling scopes, is unaffected.

An entry may instead be the marker `needs-vendor-specific-review`. That means
nobody has yet established a defensible minimum for that provider, so the
requested scopes pass through unchanged. This is a deliberate fail-open for the
unreviewed case, so that an unresearched provider is visibly unreviewed rather
than silently broken by an empty ceiling. Turning a marker into a real list is a
security improvement, and the test below stops a new OAuth connector from
skipping the decision entirely.

`apps/web/lib/connectors/__tests__/oauth-registry.scope-allowlist.test.ts` pins
all of this: it asserts an over-ceiling scope is dropped and an on-ceiling one
survives, that the authorization URL carries only the survivors, that every
`oauth2` connector in the catalog has an entry, and that no enforced ceiling
admits a scope from `FORBIDDEN_CONNECTOR_OAUTH_SCOPES` in
`oauth-scope-allowlist.ts` (`admin`, `full`, `default`,
`https://mail.google.com/`, the bare Google `drive`, `calendar`, or
`cloud-platform` scopes, `Files.ReadWrite.All`, `Sites.FullControl.All`, and
`Mail.ReadWrite`). Removing the enforcement or widening a ceiling to include
one of those fails CI.

`pnpm check:connector-scopes` (`scripts/check-connector-scopes.mjs`, wired into
`pnpm check:llm-operability`) statically parses the manifest and
`scope-descriptions.ts` on every run, independent of the vitest suite, and
fails the build if a ceiling admits a forbidden scope, a ceiling scope has no
description in `SCOPE_DESCRIPTIONS`, or a scope literal from an enforced
ceiling is declared a second time anywhere else under
`apps/web/lib/connectors`, `apps/web/app/api/connectors`, or
`apps/web/lib/user-connector-tools.ts`. That last check is what keeps
"the manifest is the only place a scope may be added" true going forward
rather than as a one-time fact: nothing outside `oauth-scope-allowlist.ts` can
introduce a scope string without the guard catching the duplicate.

### Ceiling table

"Covers" describes what the scope buys at the provider. For a connector whose
tools are served by the vendor's hosted MCP server, the honest answer is that
the vendor's server decides, and the column says so.

| Connector id       | Provider                      | Requested-scope ceiling                                                                                                                                                            | What it covers                                                                                                                                                            |
| ------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gmail`            | Google                        | `gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile`, `openid`                                                                                                     | Read mail and send mail. Excludes `gmail.modify` and `mail.google.com`, which permit delete.                                                                              |
| `google-calendar`  | Google                        | `calendar.readonly`, `calendar.events`, identity scopes                                                                                                                            | Read calendars, create and edit events. Excludes the bare `calendar` scope.                                                                                               |
| `google-drive`     | Google                        | `drive.file`, `drive.metadata.readonly`, identity scopes                                                                                                                           | Files the app itself created or the user picked, plus metadata. Excludes full `drive`.                                                                                    |
| `google-sheets`    | Google                        | `spreadsheets.readonly`, `spreadsheets`, `drive.file`, identity scopes                                                                                                             | Read and write sheets the user grants. Sheets has no narrower write scope.                                                                                                |
| `google-analytics` | Google                        | `analytics.readonly`, identity scopes                                                                                                                                              | Report reads only. Excludes `analytics` and `analytics.edit`.                                                                                                             |
| `youtube`          | Google                        | `youtube.readonly`, `yt-analytics.readonly`, identity scopes                                                                                                                       | Channel and analytics reads. Excludes `youtube` (full manage) and `youtubepartner`.                                                                                       |
| `bigquery`         | Google                        | `bigquery.readonly`, `devstorage.read_only`, identity scopes                                                                                                                       | Query and read datasets. Excludes the write `bigquery` scope and `cloud-platform`.                                                                                        |
| `gcp`              | Google                        | `cloud-platform.read-only`, identity scopes                                                                                                                                        | Read project resources. Excludes the mutating `cloud-platform` scope.                                                                                                     |
| `outlook`          | Microsoft Graph               | `User.Read`, `Mail.Read`, `Mail.Send`, `offline_access`                                                                                                                            | Read and send mail. Excludes `Mail.ReadWrite` and any `.All` variant.                                                                                                     |
| `onedrive`         | Microsoft Graph               | `User.Read`, `Files.Read`, `Files.ReadWrite.AppFolder`, `offline_access`                                                                                                           | Read files, write only inside the app folder. Excludes `Files.ReadWrite.All`.                                                                                             |
| `teams`            | Microsoft Graph               | `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `Chat.Read`, `ChatMessage.Send`, `offline_access`                                                                      | List teams and channels, read chat, post a message. Excludes directory and group writes.                                                                                  |
| `sharepoint`       | Microsoft Graph               | `User.Read`, `Sites.Read.All`, `offline_access`                                                                                                                                    | Read site content. Excludes `Sites.ReadWrite.All` and `Sites.FullControl.All`.                                                                                            |
| `azure`            | Azure Resource Manager        | `https://management.azure.com/user_impersonation`, `offline_access`, OIDC                                                                                                          | ARM exposes no narrower delegated scope. Least privilege here is RBAC on the principal, not the scope string.                                                             |
| `slack`            | Slack                         | `channels:read`, `channels:history`, `groups:read`, `chat:write`, `users:read`, `users:read.email`, `team:read`, `files:read`                                                      | List and read channels, post a message, resolve users. Excludes every `admin.*` scope.                                                                                    |
| `notion`           | Notion                        | none                                                                                                                                                                               | Notion's OAuth takes no `scope` parameter. Capabilities are set on the integration in Notion. Any requested scope is dropped.                                             |
| `intercom`         | Intercom                      | none                                                                                                                                                                               | Permissions are set per app in Intercom's developer hub, not by a `scope` parameter.                                                                                      |
| `mailchimp`        | Mailchimp                     | none                                                                                                                                                                               | Mailchimp OAuth2 issues a single full-access token with no scope parameter. Treat the connector itself as the grant.                                                      |
| `basecamp`         | Basecamp                      | none                                                                                                                                                                               | Basecamp has no named scopes; the token inherits the user's own permissions.                                                                                              |
| `evernote`         | Evernote                      | none                                                                                                                                                                               | Permission level is fixed on the API key, not requested per authorization.                                                                                                |
| `linear`           | Linear                        | `read`, `write`, `issues:create`, `comments:create`, `app:assignable`, `app:mentionable`                                                                                           | Read and edit issues and comments. Excludes `admin`.                                                                                                                      |
| `jira`             | Atlassian                     | `read:me`, `read:jira-user`, `read:jira-work`, `write:jira-work`, `offline_access`                                                                                                 | Read and edit issues. Excludes every `manage:` and `admin:` configuration scope.                                                                                          |
| `confluence`       | Atlassian                     | `read:me`, `read:confluence-space.summary`, `read:confluence-content.all`, `write:confluence-content`, `offline_access`                                                            | Read spaces and pages, write page content. Excludes configuration management.                                                                                             |
| `asana`            | Asana                         | `tasks:read`, `tasks:write`, `projects:read`, `sections:read`, `stories:read`, `stories:write`, `teams:read`, `users:read`, `workspaces:read`, OIDC                                | Granular task and project access. Excludes the legacy `default` scope, which is full account access.                                                                      |
| `zoom`             | Zoom                          | `user:read:user`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:write:meeting`, `cloud_recording:read:list_user_recordings`                                       | Granular scopes only (Zoom's post-2024 format). Excludes every `account:` and admin scope.                                                                                |
| `hubspot`          | HubSpot                       | `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`, `crm.objects.companies.read`, `crm.objects.deals.read`, `crm.objects.deals.write`                              | CRM object access. Excludes `automation`, `content`, and every schema or settings write.                                                                                  |
| `salesforce`       | Salesforce                    | `api`, `id`, `refresh_token`, OIDC                                                                                                                                                 | REST API as the consenting user. Excludes `full` and `web`.                                                                                                               |
| `calendly`         | Calendly                      | needs vendor-specific review                                                                                                                                                       | Calendly grants nothing by default to a new app and requires scopes to be named, but the current scope catalog was not verified. Passes through unchanged until reviewed. |
| `adobe`            | Adobe IMS                     | needs vendor-specific review                                                                                                                                                       | The scope set depends on which Adobe product API the connector targets, and this repository does not say. Passes through unchanged until reviewed.                        |
| `shopify`          | Shopify                       | `read_products`, `read_orders`, `read_customers`, `read_inventory`, `write_products`                                                                                               | Catalog and order reads plus product writes. Excludes `write_orders`, `read_all_orders`, `write_customers`.                                                               |
| `linkedin`         | LinkedIn                      | `w_member_social`, OIDC                                                                                                                                                            | Member identity and posting as the member. Excludes organization admin and ads scopes.                                                                                    |
| `twitter`          | X                             | `tweet.read`, `tweet.write`, `users.read`, `offline_access`                                                                                                                        | Read and post. Excludes all `dm.*`, `block.write`, and moderation scopes.                                                                                                 |
| `discord`          | Discord                       | `identify`, `guilds`, `guilds.members.read`                                                                                                                                        | Identity and guild membership reads. Excludes `bot`, `webhook.incoming`, `guilds.join`.                                                                                   |
| `gitlab`           | GitLab                        | `read_user`, `read_api`, `read_repository`, OIDC                                                                                                                                   | Read-only API and repository access. Excludes `api`, `write_repository`, `sudo`, `admin_mode`.                                                                            |
| `bitbucket`        | Bitbucket                     | `account`, `repository`, `pullrequest`, `issue`                                                                                                                                    | Read repositories, pull requests, issues. Excludes every `:admin`, `:delete`, `:write` variant.                                                                           |
| `pipedrive`        | Pipedrive                     | `base`, `deals:read`, `contacts:read`, `activities:read`, `users:read`, `search`                                                                                                   | Read-only CRM. Excludes every `:full` scope and `admin`.                                                                                                                  |
| `figma`            | Figma                         | `current_user:read`, `files:read`, `projects:read`, `file_comments:write`, `file_dev_resources:read`                                                                               | Read files and projects, leave comments. Excludes `file_variables:write`, `webhooks:write`, `org:activity_log_read`.                                                      |
| `canva`            | Canva                         | `profile:read`, `design:meta:read`, `design:content:read`, `design:content:write`, `asset:read`, `asset:write`, `folder:read`                                                      | Read and write designs and assets. Excludes every `permission` scope and `app:write`. Canva does not imply read from write, so both are listed where both are needed.     |
| `quickbooks`       | Intuit                        | `com.intuit.quickbooks.accounting`, OIDC                                                                                                                                           | Accounting API. Excludes `com.intuit.quickbooks.payment`, which moves money.                                                                                              |
| `xero`             | Xero                          | `accounting.settings.read`, `accounting.contacts.read`, `accounting.transactions.read`, `accounting.reports.read`, `offline_access`, OIDC                                          | Read-only accounting. Excludes every write scope, `payroll.*`, `files`, and attachments.                                                                                  |
| `paypal`           | PayPal                        | `openid`, `email`, `https://uri.paypal.com/services/reporting/search/read`                                                                                                         | Transaction search only. Excludes payment capture, payouts, and subscription writes.                                                                                      |
| `dropbox`          | Dropbox                       | `account_info.read`, `files.metadata.read`, `files.content.read`, `files.content.write`                                                                                            | Read and write file content. Excludes `files.permanent_delete`, `sharing.write`, team scopes.                                                                             |
| `box`              | Box                           | `root_readonly`, `item_preview`, `item_download`, `item_upload`                                                                                                                    | Read and upload items. Excludes `root_readwrite` and every enterprise or user management scope.                                                                           |
| `instagram`        | Meta                          | `instagram_basic`, `instagram_manage_insights`, `instagram_content_publish`, `pages_show_list`                                                                                     | Profile and media reads, insights, publishing. Excludes `business_management` and `ads_management`.                                                                       |
| `facebook`         | Meta                          | `public_profile`, `email`, `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`                                                                                        | Page reads and posting. Excludes `business_management` and `ads_management`.                                                                                              |
| `epic-fhir`        | Epic (SMART on FHIR)          | `openid`, `fhirUser`, `launch/patient`, `offline_access`, and `patient/` read scopes for Patient, Observation, Condition, MedicationRequest, AllergyIntolerance, DocumentReference | Patient-context reads for the consenting patient only. Excludes every `user/` and `system/` scope and every `.write`.                                                     |
| `cerner`           | Oracle Health (SMART on FHIR) | same set as `epic-fhir`                                                                                                                                                            | Same rationale. Excludes every `user/` and `system/` scope and every `.write`.                                                                                            |

Connector ids not in this table have no reviewed ceiling and are not filtered.
That includes every `api-key`, `pat`, `connection-string`, and `device-local`
entry in the catalog, none of which use an OAuth scope parameter at all.

### Desktop native scopes

`apps/desktop` requests real, hardcoded OAuth scopes directly against Google
and Microsoft, using the user's own OAuth client. The ceilings above are the
web enforcement point and have no effect on the desktop client, so this table
is a second, separate record of what the desktop app actually requests.

| Connector        | File                                                                                 | Scopes requested                                                     |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Gmail            | `apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs` L46-49, L122-127 | `gmail.readonly`, `gmail.send`, `userinfo.email`, `userinfo.profile` |
| Google Calendar  | `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs` L15-17, L34-37     | `calendar.readonly`, `calendar.events`                               |
| Outlook Calendar | `apps/desktop/src-tauri/src/features/calendar/outlook_calendar.rs` L15-17, L34-37    | `User.Read`, `Calendars.Read`, `Calendars.ReadWrite`                 |

As of 2026-09-03 the Gmail and Google Calendar rows replaced a wider request.
The Gmail client had also requested `gmail.modify`, which permits deleting and
relabeling mail, but the desktop code only ever calls `users.getProfile`,
`users.watch`, `users.history.list` and `users.stop`, all of which
`gmail.readonly` alone authorizes. The calendar client had also requested the
unrestricted `auth/calendar` scope, but the desktop code only ever calls
`calendarList.list` and the events endpoints, which `calendar.readonly` plus
`calendar.events` together authorize without granting calendar deletion or
sharing changes. Neither client makes a message-send or event-delete call
through any other scope; sending mail goes through a separate IMAP/SMTP path
in `apps/desktop/src-tauri/src/sys/commands/email.rs` that does not use Google
OAuth at all.

The Outlook Calendar client requests `Calendars.ReadWrite`, not the narrower
`Calendars.Read`, and this is not over-broad: `outlook_calendar.rs` calls
`create_event`, `update_event`, and `delete_event` against the Graph API in
addition to `list_calendars` and `list_events`, so the write scope is used, not
requested speculatively. `User.Read` is Graph's standard identity baseline,
needed to resolve the signed-in account.

Section 1.3 and gap 2 of section 1.8 carry the same three rows and the same
rationale; both records were updated together and neither is stale relative to
the other.

---

## 3. Encryption key rotation

Cadence: every 12 months per key, plus immediately on suspected exposure.

How to rotate one of the AES-256-GCM keys that protect secrets at rest without
revoking every connector grant and re-enrolling every 2FA user.

### What is encrypted, and with which key

| Column                                             | Key env                                 | Key material  | Wire layout                   | `key_version` column       |
| -------------------------------------------------- | --------------------------------------- | ------------- | ----------------------------- | -------------------------- |
| `connector_oauth_grants.access_token_enc`          | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `token_key_version`        |
| `connector_oauth_grants.refresh_token_enc`         | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `token_key_version`        |
| `user_custom_connectors.auth_header_enc`           | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `auth_header_key_version`  |
| `github_installations.access_token_enc`            | `GITHUB_TOKEN_ENCRYPTION_KEY`           | 64 hex chars  | `iv:ciphertext:tag` (hex)     | `access_token_key_version` |
| `user_two_factor.totp_secret_enc`                  | `TOTP_ENCRYPTION_KEY`                   | ≥32 raw chars | base64(IV ‖ ciphertext ‖ tag) | `totp_secret_key_version`  |
| `connector_oauth_authorizations.code_verifier_enc` | `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 64 hex chars  | `iv:ciphertext:tag` (hex)     | none, expires in minutes   |
| `device_authorization_codes.access_token`          | `DEVICE_TOKEN_ENCRYPTION_KEY`           | 64 hex chars  | base64(IV ‖ ciphertext ‖ tag) | none, expires in minutes   |

The last two rows hold minutes-lived values. Rotating their key strands
in-flight flows only: a user retries the connect or the device pairing and it
works. They get no bookkeeping column and the rotation sweep does not touch
them.

`TOTP_ENCRYPTION_KEY` is not hex. `lib/crypto/totp-envelope.ts` takes the first
32 characters of the env value as raw bytes through
`loadKeyRing(_, { encoding: 'utf8' })`. Do not "fix" it to hex without
re-encrypting first. It would orphan every enrolled secret.

The desktop token minted by `apps/web/app/api/auth/desktop-token/route.ts` is
also AES-256-GCM under `TOTP_ENCRYPTION_KEY`, but it is never stored: rotating
that key invalidates outstanding desktop tokens and the desktop app re-pairs.

### The key ring

`apps/web/lib/crypto/envelope.ts` reads three env vars per key domain:

| Var              | Meaning                                            |
| ---------------- | -------------------------------------------------- |
| `<NAME>`         | active key, the one new ciphertext is sealed with  |
| `<NAME>_ID`      | id for that key, default `1`                       |
| `<NAME>_RETIRED` | `id:material` pairs, comma separated, newest first |

The default of `<NAME>_ID` and the default of every `*_key_version` column are
both `1`, so a deployment that has never set either is already consistent and
needs no backfill. Ids must match `^[A-Za-z0-9_-]{1,32}$`, the same shape the
column's CHECK constraint enforces, and no id may appear twice in one ring.

### Which readers understand the ring

| Column                                   | Reader                           | Ring-aware |
| ---------------------------------------- | -------------------------------- | ---------- |
| `connector_oauth_grants.*_token_enc`     | `lib/custom-connector-crypto.ts` | yes        |
| `user_custom_connectors.auth_header_enc` | `lib/custom-connector-crypto.ts` | yes        |
| `github_installations.access_token_enc`  | `lib/github-app.ts`              | yes        |
| `user_two_factor.totp_secret_enc`        | `lib/crypto/totp-envelope.ts`    | yes        |

A ring-aware reader decrypts against every key on the ring, so rows the sweep
has not reached yet are still readable with the retired key present. All four
columns rotate with **no downtime**. They keep WRITING the legacy `iv:ct:tag`
(or, for `totp_secret_enc`, `b64-iv-ct-tag`) layout so an instance of the
previous build can read what a new instance wrote during a rolling deploy;
`--format=versioned` is what moves them to the self-describing layout, and the
sweep refuses it for any column whose reader is not ring-aware
(`versionedReaderReady` in `scripts/reencrypt.mjs`).

`user_two_factor.totp_secret_enc` used to be the exception: the reader built one
WebCrypto key straight from `TOTP_ENCRYPTION_KEY` and never consulted
`_RETIRED`. `lib/crypto/totp-envelope.ts` now calls `sealEnvelope`/`openEnvelope`
from `lib/crypto/envelope.ts` directly, so it is ring-aware like the other three.
It could not simply be imported into `features/settings/services/user-preferences.ts`,
because that module is also bundled for the browser and `envelope.ts` needs
`node:crypto`; the seal/open calls live in the new server-only sibling instead,
and the four `/api/settings/2fa/*` routes call it directly.

### Rotation cadence

Scheduled rotation is the same procedure as an incident rotation, every row
below runs the `Rotating a key` procedure end to end, with `scripts/reencrypt.mjs` as the
sweep. Nothing here rotates itself; the date is a calendar obligation on the
Owner named in the header.

| Key env                                 | Interval  | Next due   | Sweep target                            | Downtime                         |
| --------------------------------------- | --------- | ---------- | --------------------------------------- | -------------------------------- |
| `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` | 12 months | 2027-08-17 | `connector-grants`, `custom-connectors` | none, ring-aware reader          |
| `GITHUB_TOKEN_ENCRYPTION_KEY`           | 12 months | 2027-08-17 | `github-installations`                  | none, ring-aware reader          |
| `TOTP_ENCRYPTION_KEY`                   | 12 months | 2027-08-17 | `two-factor`                            | none, ring-aware reader          |
| `DEVICE_TOKEN_ENCRYPTION_KEY`           | 12 months | 2027-08-17 | none, no durable column                 | in-flight device pairings re-run |

Rotate ahead of the date, not on it, whenever a key could have been read by
someone who should not have it: a leaked deployment env, a departing operator
who held it, a restored backup handled outside the sealed record, or any
finding that names the key. An unscheduled rotation resets the next-due date.

`DEVICE_TOKEN_ENCRYPTION_KEY` has no sweep because it seals nothing durable.
rotating it is an env swap and a redeploy, and its 12-month entry exists so the
key does not outlive every other one by default.

### Accepted risk: no KMS, no escrow

Accepted by: Platform lead
Reviewed: 2026-08-17
Next review: with the 2027-08-17 rotation

All four keys live only as deployment environment variables. There is no KMS,
no hardware-backed custody, and no escrow copy outside the deployment provider.

What this costs, precisely: a database restore taken before a rotation is
readable only if the key bytes active at backup time still exist. The ring
(`<NAME>_RETIRED`) is what preserves them, and it is preserved by an operator
pasting a value into a deployment env, not by a system. Lose those bytes and
the restored `connector_oauth_grants`, `user_custom_connectors`,
`github_installations` and `user_two_factor` ciphertexts are unrecoverable.
Connector grants and GitHub installations can be re-authorized by the user;
enrolled TOTP secrets cannot, and every affected user must re-enroll 2FA.

This is accepted rather than solved because the mitigations already in place.
per-key ids, a ring that reads retired keys, a resumable sweep, and the sealed
record required by step 6, bound the blast radius to "users re-authorize",
and because introducing a KMS moves custody to a vendor without removing the
operator step that actually fails. It is not accepted permanently: revisit it
at the next review, and revisit it immediately if a restore ever needs a key
the ring no longer carries.

The one obligation this acceptance creates is step 6's sealed record. A
rotation that drops `_RETIRED` without writing the old key somewhere durable
converts this accepted risk into a live one.

#### The seam a KMS adapter plugs into

`lib/crypto/envelope.ts` no longer reads env bytes directly. `loadKeyRing`
delegates to a `KeyProvider`, and the only provider wired up today is
`envKeyProvider`, which reproduces the env-backed behavior above byte for
byte. Nothing about this accepted risk has changed yet: no deployment sets
`AGI_KEY_PROVIDER` to anything other than the default, so every key still
lives only as a deployment environment variable.

A KMS-backed provider does not require touching `envelope.ts`, `sealEnvelope`,
or `openEnvelope`. It needs three things. First, a way to identify a wrapped
data key per key id, in the same `<NAME>` / `<NAME>_ID` / `<NAME>_RETIRED`
shape the env provider already uses, holding whatever the vendor SDK expects
instead of raw bytes: an ARN, a key id, or a ciphertext blob. Second, an
unwrap call that turns one of those references into 32 raw bytes, passed to
`createKmsKeyProvider(unwrap)`. Third, because `unwrap` runs synchronously,
an integrator backed by an async vendor SDK call must resolve the data key
before constructing the provider, for example by fetching it once at process
start rather than on every `resolveKeyRing` call. Adopting one moves this
risk from "an operator holds the only copy of the key" to "the KMS vendor's
availability and access controls hold it," which is a real change of risk,
not its removal, and should get its own review before it is treated as
closing this acceptance.

The same interface carries a per-tenant derivation hook: `deriveTenantKey`
runs HKDF over a provider's ring key with the organization id as the HKDF
info parameter, so customer-managed keys per organization become a provider
concern rather than a schema change. It is off by default. `loadKeyRing` and
the providers above never call it on their own; a caller must ask for it
explicitly through `resolveTenantKeyRing`, and nothing in this codebase does
that yet.

### Rotating a key

1. **Generate the new key.**

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Apply the migration** if the target database predates it:

   ```bash
   psql "$NEON_DATABASE_URL" -f apps/web/db/neon/0104_key_version.sql
   ```

3. **No maintenance window is required for any of the four keys.** Every
   reader, `TOTP_ENCRYPTION_KEY` included, is ring-aware: deploy the ring
   (step 4) and traffic keeps working while the sweep runs. Skip to step 4.

4. **Set the ring**: in the deployed environment as well as locally for the
   sweep. The old key moves to `_RETIRED` under the id it currently carries in
   the database, and the new key becomes active under a fresh id. Deploy this
   BEFORE the sweep: a ring-aware reader needs the retired key to read the rows
   the sweep has not reached, and needs the active key to read the ones it has.

   ```bash
   export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY=<new hex>
   export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID=2
   export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED=1:<old hex>
   ```

5. **Dry run, then apply.** The dry run reports what it would touch and writes
   nothing:

   ```bash
   node scripts/reencrypt.mjs --target=connector-grants
   node scripts/reencrypt.mjs --target=connector-grants --apply
   ```

   Targets: `connector-grants`, `custom-connectors`, `github-installations`,
   `two-factor`, or `all`. Interrupting the script is safe, it resumes from
   the `*_key_version` column, so a re-run picks up exactly the rows it had not
   reached. A completed target selects nothing on a second run.

   `plaintext=N` in the summary counts rows deliberately left alone:
   pre-encryption TOTP secrets still stored as plain Base32, which
   `openTotpSecret` refuses to decrypt and which belong to no key. They are
   reported, never stamped.

6. **Drop `_RETIRED`** from the deployed env once the sweep reports `scanned=0`
   for every target, and redeploy. Keep the old key in a sealed record until the
   next rotation, it is the only way back if a restore predates the sweep.

7. **Verify** a live read of each rotated surface (connect a connector, load a
   GitHub PR review, complete a 2FA challenge) before ending the window.

### Rehearsing a rotation before the scheduled date

`apps/web/db/neon/0104_key_version.sql:12` records that no key on the cadence
table above has ever actually been rotated. `scripts/key-rotation-drill.mjs`
is the rehearsal: it creates a disposable Neon branch from the current head
(the same branch-creation path `docs/runbooks/database-backup-restore.md`
uses for its restore drill), runs `reencryptTarget` from
`scripts/reencrypt.mjs` against that branch with the ring you export exactly
as step 4 above describes, decrypts a random sample of the rewritten rows
under the new active key to confirm the round trip, and deletes the branch
when it finishes.

```bash
export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY=<new hex>
export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_ID=2
export CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY_RETIRED=1:<old hex>
NEON_API_KEY=<api key, loaded from your shell's own env> \
NEON_PROJECT_ID=<project id> \
  node scripts/key-rotation-drill.mjs --target=connector-grants
```

Nothing it touches is production: the branch is disposable and deleted on
exit unless `--keep` is passed, and no target ever runs with `--apply` against
`NEON_DATABASE_URL`/`AGI_DATABASE_URL` itself. A nonzero exit or a `sample=`
count with any failures means the ring is wrong, not that production data is
at risk. Fix the ring and rerun before touching the real rotation in
`Rotating a key`.

Run this rehearsal once ahead of each date in the cadence table, and record
the result:

| Date       | Target(s) | Sample result | Operator |
| ---------- | --------- | ------------- | -------- |
| _unfilled_ |           |               |          |

`BLOCKED_BY_HUMAN`: no rehearsal has been run. It needs the same
`NEON_API_KEY` / `NEON_PROJECT_ID` provisioning gap recorded in
`docs/runbooks/database-backup-restore.md`'s restore-drill log.

### Restoring a database backup

A restore returns rows encrypted under whatever key was active when the backup
was taken. Put that key in `<NAME>_RETIRED` under the id the restored rows
carry in their `*_key_version` column, then run the sweep to bring them
forward. Without the old key bytes those rows are unrecoverable, that is the
accepted risk recorded above, and step 6's sealed record is the only thing
standing between a restore and permanent loss.

### Moving a column to the versioned layout

Once a rotation has settled, `node scripts/reencrypt.mjs --target=<name>
--format=versioned --apply` rewrites the column as `v1.<keyId>.<iv>.<ct>.<tag>`,
which names its key in the bytes instead of relying on trial decryption. Only
run it after the ring-aware reader is fully deployed, no instance of an older
build may still be serving that column. The sweep enforces the ready/not-ready
half of that itself; the "fully deployed" half is yours to confirm.

### Not yet done

`lib/device-token-crypto.ts` and `app/api/auth/desktop-token/route.ts` are not
on this list: neither writes a durable column. Rotating `DEVICE_TOKEN_ENCRYPTION_KEY`
invalidates minutes-lived pairing codes, and the desktop token is handed to the
client and never stored.

---

## 4. Tauri updater signing key custody

The minisign key pair behind `plugins.updater.pubkey` in
`apps/desktop/src-tauri/tauri.conf.json` is the highest-blast-radius credential
in this repository. Its public half is compiled into every shipped desktop
binary and is the only thing an installed client checks before applying an
update.

- Losing the private half permanently ends auto-update for every install that
  already pins the current public key. There is no server-side recovery: the
  pin lives in the installed binary.
- Leaking the private half lets anyone sign an archive that every install
  accepts and executes. Apple notarization does not help, the updater
  signature is a separate trust boundary from Developer ID.

### Custody inventory

Every location holding the private half must be listed here. A copy that is not
listed is an untracked liability; a listed location that no longer holds the key
must be removed in the same change that destroys it.

| Location                                               | Role               | Holder     |
| ------------------------------------------------------ | ------------------ | ---------- |
| `~/.tauri/agiworkforce.key` on the founder workstation | working copy       | founder    |
| GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`      | deployment copy    | CI         |
| _unfilled_, offline escrow                             | recovery authority | _unfilled_ |

The passphrase is a separate secret and must never be escrowed in the same
container as the key file.

`BLOCKED_BY_HUMAN`: the escrow row is unfilled. Both existing copies are
deployment copies on media the founder controls day to day, so a single lost
machine or a single deleted GitHub secret is still an unrecoverable event.
Until an offline escrow location and a named recovery holder exist, this
document describes the procedure but the key is not escrowed.

### Escrow

1. Export the key file and its passphrase separately. Never print either to a
   terminal that scrolls into a shared log.
2. Place the key file in the offline escrow location and the passphrase in a
   different one, each with a named holder recorded in the table above.
3. Run the restore drill below against the escrowed copy, not against the
   working copy.
4. Record the drill date and the reported key id in this document.

### Restore drill

The drill proves that an escrowed file plus its passphrase reconstruct exactly
the key whose public half is pinned in shipped binaries. It never prints key
material and never contacts the network.

```bash
TAURI_SIGNING_PRIVATE_KEY_PASSWORD='<escrowed passphrase>' \
  pnpm --filter @agiworkforce/desktop verify:updater-key /path/to/escrowed.key
```

The command reads `plugins.updater.pubkey` from the committed Tauri config,
decrypts the escrowed key with the supplied passphrase, and compares both the
key id and the Ed25519 public half. It exits non-zero when the file is the wrong
key, the passphrase is wrong, or the escrowed copy has been corrupted, the
three failure modes that make an escrow copy worthless at the moment it is
needed. It accepts either the raw minisign key file or the base64 form stored in
the GitHub secret.

Run the drill whenever the escrow copy is created, moved, re-encrypted, or
handed to a new holder, and at least once per release train.

### Compromise

Assume compromise if the key file or its passphrase reaches any location not in
the custody inventory, including a chat message, a screenshot, a CI log, or a
backup of the founder workstation restored elsewhere.

1. Treat every published updater artifact signed with that key as
   indistinguishable from an attacker's. Do not assume nothing was signed.
2. Rotate the GitHub Actions secrets first so CI cannot keep signing with the
   exposed key, then generate the replacement pair.
3. Follow Rotation below. There is no revocation list: installed clients keep
   trusting the exposed key until they are running a binary that pins the new
   one.

### Rotation

Tauri's updater pins exactly one public key. A rotated key therefore does not
reach installed clients through the updater it replaces, the release signed
with the new key fails signature verification against the old pinned key, and
those installs stop updating silently.

1. Generate the replacement pair and escrow it before it signs anything.
2. Ship one transition release **signed with the old key** whose bundled
   `tauri.conf.json` already pins the new public key. Installed clients accept
   this release because it is signed with the key they pin, and after installing
   it they pin the new key.
3. Only after the transition release has propagated may a release be signed with
   the new key.
4. Installs that never take the transition release are stranded and must
   reinstall from the download page. Count them before rotating, and publish a
   reinstall notice if the population is material.
5. If the old key is unavailable, lost, or withheld because it is compromised.
   step 2 is impossible and **every** install must reinstall. This is the
   scenario escrow exists to prevent.

Related: `apps/desktop/docs/macos-release-runbook.md` for the release-time trust
checks, and section 3 for the application encryption keys, which are a
separate key domain.

---

## 5. Closed reviews

Reviews that reached a verdict and are no longer separate documents. Git history
holds the full text of each.

**CAP-052 artifact runtime bridge, security design review (2026-08-05).** The
proposal gives a rendered artifact a runtime primitive that triggers billed model
inference and reads the answer, inside a sandbox whose current envelope is
`connect-src 'none'`, a cross-origin credential-free renderer, and a same-origin
refusal in `isThisAppsOwnOrigin()`. The review returned GO-WITH-CONDITIONS on
seven conditions: the bridge structurally absent from every anonymous published
surface, per-call consent rendered in parent chrome, server-side call and spend
caps that fail closed, exact origin validation with the capability default off,
the cross-origin invariant preserved, audit logging plus a kill switch, and
subresource integrity on the sandbox CDN loads. An adversarial pass the same day
returned needs-revision and added five items, the worst being that the natural
billing path charges the artifact publisher, which turns the public shared-artifact
surface into a wallet drain aimed at one named user. Verdict as it stands: the
precondition is unmet, so no build starts. The capability row is
`CAP-052` in `audit/capability-gaps.csv`.
