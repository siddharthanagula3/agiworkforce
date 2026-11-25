---
id: "F098-01"
type: "feature"
title: "Connect a service account"
aliases: ["Connectors", "Connector directory", "Connect a service", "OAuth connector broker", "Connected accounts", "Multi-account connectors", "Needs setup / Coming soon connectors"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.01", "S98.02", "S98.03", "S98.06", "S98.11"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-data-model-and-migrations", "SYS-execution-boundaries", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:desktop", "mode:cloud", "table:connector_oauth_grants", "table:connector_oauth_authorizations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-01 Connect a service account

Lets a signed-in person on a paid plan link an outside service (mail, files, tickets) to AGI Workforce through that service's own sign-in page. The server keeps the grant. In code today only 13 services are released, and a second account of the same service still overwrites the first.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.01](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9801), [S98.02](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9802), [S98.03](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9803), [S98.06](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9806), [S98.11](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9811).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** A server-side registry lists every connector with its sign-in scheme, risk class and release state. The person starts a sign-in, approves the outside service's consent screen, and returns to the app. The server checks the one-time state value, exchanges the code, and stores an encrypted grant. A database schema also exists to hold several accounts per service, each with a label, a scope (personal, work, service) and one default.

**Why it exists.** The assistant can only act in a person's mail, files or tickets with that person's own consent. The server holds the grant so every app uses one sign-in instead of each app keeping its own token (S98.01, S98.02, S98.03).

**Who uses it.** A signed-in person on a plan that includes connectors, on the web app (Settings, Connectors). Mobile, CLI, Desktop and VS Code are clients of the same server routes (see user_experience).

**Problems it solves**

- One sign-in per service instead of pasting keys into each app.
- The consent scope is capped per service, so a connector cannot quietly ask for more than reviewed.
- A work mailbox and a personal mailbox could be kept apart (schema only today; the connect flow does not create a second account).

**Use cases**

- Connect a project-tracker service so the assistant can read tickets in chat.
- Reconnect a service after its authorization expired.
- See which account a connector is signed in as (the account label).
- Link a work and a personal account of one service (not working end to end today; see gaps).

## 2. User experience

**Where to find it**

- Web: /connectors redirects a signed-in person to the Settings modal section 'connectors'; a signed-out visitor sees 'Connectors bring your own tools into a thread' with a sign-in button and a 'Browse the MCP directory' link (apps/web/app/connectors/page.tsx:1-40).
- Web directory states: 'Needs setup', 'Desktop and CLI', 'Not available yet'; tabs 'Official' and 'Community'; toggle 'Include desktop and CLI connectors' (apps/web/features/directory/constants.ts:186-215).
- Web account list: heading 'Connected account', shows the account label or 'The provider did not share the account name.', and 'Needs reconnecting' (apps/web/features/connectors/components/ConnectorAccountSummary.tsx:22-30).
- Mobile: cloud connectors settings screens (apps/mobile/src/features/settings/cloud-connectors/index.tsx, ConnectorDetailScreen.tsx) and a connect card in chat (apps/mobile/src/features/chat/components/ConnectorConnectCard.tsx); exact labels unknown (not read).
- CLI: 'agi connectors' lists connections ('Your account's connectors'), prints a browser link to connect, and 'agi connectors disconnect <connector>' (apps/cli/src/cloud/connectors.rs:176-230).
- VS Code: commands 'Code: Show Connectors', 'Code: Refresh Connectors', 'Code: Manage Connectors'; manage opens the web (apps/extension-vscode/package.json:723-734, src/features/surfaces/index.ts:245-249).
- Desktop: the Tauri settings modal has a 'connectors' section driven by the web /api/connectors, not local state (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:7-21). The public Electron Desktop shows the hosted web app (AGENTS.md section 5).
- Chrome extension: unknown; no connector client found in a search (apps/extension).

**Before you start**

- Signed in (Clerk session) (callback/route.ts:54-64).
- Confirmed account email (connector-policy-gate.ts:118-137).
- A plan that includes the 'connectors' capability: basic, pro, max, max_15x, team, team_premium or enterprise; Free is not in the list (packages/contracts/types/src/billing-catalog.ts:332-351; connector-policy-gate.ts:176-186).
- The connector id is released: all connectors are 'coming_soon' except 13 listed ids (packages/contracts/types/src/connector-release.ts:17-34).
- The deployment has secure token storage and, for OAuth, a redirect base URL and the vendor's client settings (oauth/start/route.ts:222-224; docs/development/connectors-setup.md).

**Screens and controls**

- Directory entry with a connectable mode: connect, needs-setup, api-key-form, desktop-and-cli, unavailable (lib/connectors/directory/connectable.ts:9-24).
- Vendor consent screen (outside service).
- Account summary list with 'Needs reconnecting'.
- No control to choose a default account or to pick an account for a task was found in the web code (searched for setDefault/isDefault in features and app).

**Journey**

1. 1. Open Settings, Connectors and pick a service in the directory.
2. 2. Choose Connect. The web calls GET /api/connectors/oauth/start with the connector id; the server checks release, workspace access and policy, then returns an authorize URL (oauth/start/route.ts:222-300).
3. 3. The browser goes to the outside service and the person approves consent.
4. 4. The service redirects to /api/connectors/oauth/callback with state and code.
5. 5. The server validates state, consumes the pending record, checks the policy again, exchanges the code and stores the encrypted grant (finish-authorization.ts:43-224).
6. 6. The person is sent back to the return path (default /connectors) with a connector id and a status such as 'connected' (callback/route.ts:32-41, 79).
7. 7. Mobile: the app opens the sign-in in an in-app browser session and posts state and code to /api/connectors/oauth/complete (apps/mobile/services/connectors.ts:272-303; callback/route.ts:43-52).

**What the person sees and gets**

- Redirect status codes: connected, denied, failed, invalid_state, unavailable, reauthorize, registration_rejected (finish-authorization.ts:29-35, 65-80).
- Start statuses: not_configured, policy_blocked, scope_reconsent, credential, open, unavailable, error (oauth/start/route.ts:67-76).
- When a wider scope set is requested than a stored grant holds, the start response carries status scope_reconsent and the added scopes; the flow still proceeds to the consent screen (oauth/start/route.ts:318-323, 381-386).
- An audit event 'connector_added' is recorded on success (finish-authorization.ts:128-139, 211-222).

**Settings**

- CONNECTOR_OAUTH_PROVIDERS_JSON, CONNECTOR_OAUTH_<ID>_CLIENT_ID and _CLIENT_SECRET, CONNECTOR_OAUTH_REDIRECT_BASE_URL, CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY (names only) (apps/web/.env.example:405-420; docs/development/connectors-setup.md).
- Workspace connector policy and the 'canUseConnectors' kill switch (connector-capability.ts:31-42).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Registry of about 90 connector records with auth scheme, risk class, release state and surfaces (apps/web/lib/connectors/catalog.ts:161-275).
- OAuth start with PKCE and a random 64-hex state, pending record with a 600-second life (pkce.ts:12-26; oauth-store.ts:11, 52).
- Callback rejects a missing or malformed state with status invalid_state and returns to /connectors (callback/route.ts:66-69).
- Callback hands an app-originated state to the mobile app instead of processing it in the browser (callback/route.ts:43-52).
- Code exchange and grant storage happen inside one transaction that checks the pending authorization was consumed (oauth-store.ts:254-277).
- Scope ceilings per connector drop requested scopes that are not on the reviewed list (oauth-scope-allowlist.ts:24-40; scopes-escalation.ts:23-41).
- Schema for several accounts per connector exists: account_key, account_label, account_scope (personal, work, service), is_default, one live default per connector (db/neon/0253_connector_accounts.sql:30-67).
- A scoped read only returns the named account; an unscoped read returns the default first (oauth-store.ts:492-514).
- Account label is taken from the id token claims email, preferred_username or upn when present (lib/connectors/accounts.ts:13-31).
- GET /api/connectors/{connectorId}/accounts lists accounts (accounts/route.ts:30-40).

**Incomplete**

- Multi-account connect is not wired. createPendingAuthorization is called without an account key from the start route and from MCP discovery (oauth/start/route.ts:353-370; mcp-discovery.ts:242), and the callback stores the grant with only an account label, so the key falls back to 'default' and a second sign-in to the same service overwrites the first (finish-authorization.ts:171-185; oauth-store.ts:294-320, normalizeConnectorAccountKey in accounts.ts:5-9). The brief marks S98.11 as done; the code does not support that.
- The 'unqualified call uses the default, a scoped call never resolves to another account' rule is implemented in the store read (oauth-store.ts:492-514), but resolveConnectorAccessToken takes no account argument and always reads the unscoped default (oauth-access.ts:84-97), so no caller can scope a call.
- grantRequiresReconsent exists but has no non-test caller; the start route uses scopeEscalation directly and only reports scope_reconsent (scopes-escalation.ts:48-55; oauth/start/route.ts:318-323).
- No set-default route or control was found.

**Present but disconnected or switched off**

- Connectors are switched off by default: CONNECTOR_RELEASE_STATE is 'coming_soon' and only airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry and todoist are released (connector-release.ts:14-34). The callback returns 'unavailable' for any other id (finish-authorization.ts:65).
- Each OAuth connector also stays off until the deployment has its client settings (oauth/start/route.ts:304-312; docs/development/connectors-setup.md).
- Free plan: policy returns plan_upgrade_required (connector-policy-gate.ts:176-186).

**Not available**

- Chrome extension: no connector client found (unknown).
- Local mode: none; connectors need our servers and the outside service.
- Private-network bridge (S98.15) and connector search/index worker (S98.08) are marked missing in the brief.

## 4. Required behaviour

**Established requirements**

- A server-side registry defines every connector: id, auth scheme, endpoint, risk class and release state (S98.01). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.01)
- A store keeps each user's connected accounts and grants per connector (S98.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.02)
- The OAuth callback validates state, exchanges the code and stores the grant (S98.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.03)
- Requested scopes are capped per provider and a wider scope set forces fresh consent (S98.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.06)
- When several accounts exist for a connector, the runtime selects the right one per task (S98.11). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.11)
- A request scoped to a personal account must never resolve to a work account. (source: apps/web/db/neon/0253_connector_accounts.sql:11-17)
- Setup readiness is distinct from authorization; never mark a provider connected from a redirect alone. Connectors stay at coming_soon except the exact released ids. (source: doc: docs/runbooks/connector-oauth-apps.md (Current release boundary))

**Acceptance criteria**

1. A callback with no state or a state that is not 64 hex characters redirects to /connectors with status invalid_state and stores nothing.
2. A state that was already used, expired (600 s) or belongs to another user returns invalid_state.
3. A released connector with valid consent ends with status connected and one encrypted grant row; the account label shows in 'Connected account'.
4. A connector id not in the released list returns status unavailable and no code is exchanged.
5. A Free-plan account is refused with plan_upgrade_required before any credential is exchanged.
6. Requested scopes outside the reviewed ceiling are dropped from the authorize URL.
7. Connecting a second account of the same service keeps both (currently fails: see gaps).
8. Cancelling at the consent screen returns status denied.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The mobile in-app flow must produce the same stored result as the browser flow, since /oauth/complete reuses finishConnectorAuthorization.
- [inferred] Account selection per task needs the model or the person to name an account; the contract has no such argument today.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pass accountKey and accountScope from the start route into createPendingAuthorization and from the pending record into the upsert, with a stable key such as the provider account id.
- [proposed] Add an accountKey option to resolveConnectorAccessToken and the tool executor, plus a set-default route and control.
- [proposed] Call grantRequiresReconsent where a stored grant is used, or delete it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| other | Connector catalog | `apps/web/lib/connectors/catalog.ts` | Registry of connectors: auth scheme, scope source, risk class, release state, surfaces, declared actions (lines 161-275). |
| config | Release gate | `packages/contracts/types/src/connector-release.ts` | coming_soon state and the 13 released ids; connectorReleased(). |
| endpoint | api:GET /api/connectors/oauth/start | `apps/web/app/api/connectors/oauth/start/route.ts` | Checks policy, builds the authorize URL, writes the pending record, reports scope_reconsent. |
| endpoint | api:GET /api/connectors/oauth/callback | `apps/web/app/api/connectors/oauth/callback/route.ts` | Validates state, hands app flows to the app, redirects with a status. |
| endpoint | api:POST /api/connectors/oauth/complete | `apps/web/app/api/connectors/oauth/complete/route.ts` | Lets the mobile app finish an authorization it ran in an in-app browser. |
| service | finishConnectorAuthorization | `apps/web/lib/connectors/finish-authorization.ts` | Consume pending state, release and policy checks, code exchange, grant upsert, audit event. |
| service | Connector OAuth store | `apps/web/lib/connectors/oauth-store.ts` | Pending authorizations, encrypted grants, account list, locked read, revoke. |
| service | OAuth client | `apps/web/lib/connectors/oauth-client.ts` | Token endpoint calls: exchange code, refresh, revoke. |
| config | OAuth provider registry | `apps/web/lib/connectors/oauth-registry.ts` | Provider descriptors, redirect URI check, return-path sanitizer, authorize URL builder. |
| service | MCP discovery authorization | `apps/web/lib/connectors/mcp-discovery.ts` | Begin and complete sign-in for directory and custom MCP servers. |
| service | Scope ceiling filter | `apps/web/lib/connectors/oauth-scope-allowlist.ts` | Filters requested scopes against the reviewed ceiling. |
| service | Scope escalation | `apps/web/lib/connectors/scopes-escalation.ts` | Finds scopes beyond what was consented; grantRequiresReconsent (unused). |
| service | Account helpers | `apps/web/lib/connectors/accounts.ts` | Default account key 'default' and id-token account label. |
| service | Connector policy gate | `apps/web/lib/services/connector-policy-gate.ts` | Release, confirmed email, plan, kill switch and workspace policy before a connection. |
| endpoint | api:GET /api/connectors/{connectorId}/accounts | `apps/web/app/api/connectors/[connectorId]/accounts/route.ts` | Lists connected accounts for one connector. |
| endpoint | api:GET /api/connectors/directory | `apps/web/app/api/connectors/directory/route.ts` | Paged directory with connectable modes. |
| service | Connectable mode | `apps/web/lib/connectors/directory/connectable.ts` | Chooses connect, needs-setup, api-key-form, desktop-and-cli or unavailable. |
| table | table:connector_oauth_grants | `apps/web/db/neon/0097_connector_oauth_broker.sql` | Settled grants; account columns added in 0253. |
| table | table:connector_oauth_authorizations | `apps/web/db/neon/0097_connector_oauth_broker.sql` | In-flight authorizations (state, verifier, scopes). |
| schema | Connector accounts migration | `apps/web/db/neon/0253_connector_accounts.sql` | Adds account_key, account_label, account_scope, is_default and one-default index. |
| component | ConnectorAccountSummary | `apps/web/features/connectors/components/ConnectorAccountSummary.tsx` | Read-only account list with 'Needs reconnecting'. |
| service | Mobile connector service | `apps/mobile/services/connectors.ts` | Mobile client: start, in-app authorize, complete, accounts. |
| service | CLI connectors client | `apps/cli/src/cloud/connectors.rs` | List, disconnect and connect link for the CLI. |
| component | Desktop cloud settings modal | `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx` | Tauri build connectors section backed by web /api/connectors. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses Connect in the directory; the app calls the start route. | device and our servers | apps/web/app/api/connectors/oauth/start/route.ts:222-300 |
| Server checks release, region, token storage, workspace access and connector policy (email, plan, kill switch, org policy). | our servers | oauth/start/route.ts:213-262; connector-policy-gate.ts:139-215 |
| Server filters scopes against the ceiling, makes PKCE and state, and stores a pending authorization (10 minutes). | our servers | oauth/start/route.ts:318-370; oauth-store.ts:52 |
| Person approves on the outside service's consent page. | outside service | oauth/start/route.ts:381-389 (redirect to authorizeUrl) |
| Outside service redirects to the callback; server validates state, consumes the pending record, re-checks release and policy. | our servers | callback/route.ts:23-80; finish-authorization.ts:52-103 |
| Server exchanges the code at the service's token endpoint and writes the grant with encrypted tokens. | outside service | finish-authorization.ts:160-186; oauth-store.ts:294-345 |
| Server records a connector_added audit event and redirects with status connected. | our servers | finish-authorization.ts:211-224 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending authorization (state hash, PKCE verifier, redirect URI, requested scopes, return path, issuer). | table:connector_oauth_authorizations | No; server only. | Consumed once; life 600 seconds unless a sensitive connector sets another (oauth-store.ts:11, 52-60). |
| Grant: encrypted access and refresh tokens, granted scopes, expiry, token endpoint, issuer, account fields. | table:connector_oauth_grants (tokens sealed with CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY ring) | Read through the server by every app; no copy on devices found. | Revoked on disconnect; a revoked row holds no secret (0097 constraint comments); account erasure names the table (lib/server/account-erasure.ts). |
| Audit event connector_added. | audit log (lib/security-audit.ts:202) | Server only. | Per audit retention; not read here. |

**Models and providers.** No model takes part in connecting. The outside service is the identity provider. The AI model provider is not involved until the assistant later calls a connector tool (see F098-03).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account and confirmed email (finish-authorization.ts:84-85; connector-policy-gate.ts:118-137). A signed-out callback redirects to /login (callback/route.ts:54-64). |
| Permissions | Workspace connector policy (allowed connector ids, custom servers, URLs) and workspace access are checked at start and again at callback (oauth/start/route.ts:241-262; finish-authorization.ts:84-103). Disconnect and policy admin rules not read. |
| Subscription | The 'connectors' capability needs a paid tier; Free is refused with plan_upgrade_required (billing-catalog.ts:332-351; connector-policy-gate.ts:176-186). How this ties to the single AGI Subscription system beyond resolveEntitledPlanTier is not verified. |
| Limits and metering | Default rate limit on the callback (callback/route.ts:24). No per-user connector count limit found. Scope ceilings cap permissions (oauth-scope-allowlist.ts:24-40). |
| Feature flags | CONNECTOR_RELEASE_STATE and SELECTIVELY_RELEASED_CONNECTOR_IDS (code constants), kill switch canUseConnectors (connector-capability.ts:31-42). |
| Model compatibility | Not model dependent; connecting does not call a model. |
| Provider restrictions | Each OAuth connector needs the deployment's client ID and secret for that vendor unless the vendor accepts the client metadata document or dynamic registration (docs/runbooks/connector-oauth-apps.md). Some sensitive-data connectors are region refused (oauth/start/route.ts:213-216). |
| Local mode | Not applicable. Connecting needs our servers and the outside service. Connectors marked desktop-local (local-filesystem, terminal, browser-automation, screen-vision, ollama) are not connected through this flow and the cloud neither enumerates nor runs them (catalog.ts:125-137, 207-211). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | ConnectorAccountSummary shows a spinner with 'Reading the connected account'. | features/connectors/components/ConnectorAccountSummary.tsx:26, 86-92 |
| Empty | No accounts and not loading: the section renders nothing. Directory shows services with connect or needs-setup mode. | ConnectorAccountSummary.tsx:84; lib/connectors/directory/connectable.ts:9-24 |
| Error | Bad state: invalid_state. Provider error: denied. Missing or over-long code: failed. Exchange failure: failed. Account list failure shows text and a Retry button. | callback/route.ts:66-69; finish-authorization.ts:75-80, 199-209; ConnectorAccountSummary.tsx:93-105 |
| Retry | Person starts the connect again; a new pending record replaces the old. Retry button for the account list. | oauth-store.ts:52; ConnectorAccountSummary.tsx:99-103 |
| Cancel | Cancel at the vendor returns an error param and status denied. Mobile reports 'dismissed' when the in-app browser closes. | finish-authorization.ts:75-77; apps/mobile/services/connectors.ts:272-281 |
| Timeout | A pending authorization older than 600 seconds is rejected as invalid_state. | oauth-store.ts:11; finish-authorization.ts:53-58 |
| Replay or other user's state | Rejected as invalid_state. | finish-authorization.ts:52-58 |
| Authorization replaced mid-flow | If the pending record was replaced or cancelled before saving, nothing is stored and status is invalid_state. | finish-authorization.ts:187-197; oauth-store.ts:254-277 |
| Policy unavailable | No credential is exchanged; status unavailable. | finish-authorization.ts:97-103 |
| Second account of same service | Overwrites the default grant today (see gaps). | oauth-store.ts:294-320 |
| Offline | not handled in the code for the connect flow beyond the generic errors above. | searched finish-authorization.ts and ConnectorAccountSummary.tsx |
| Accessibility | Account section uses aria-labelledby on its heading; spinner has an aria-label. Other controls not read. | ConnectorAccountSummary.tsx:86, 91 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/oauth/callback/route.test.ts`: Callback route behaviour.
- `apps/web/app/api/connectors/oauth/start/route.test.ts`: Start route, including scope reconsent status.
- `apps/web/app/api/connectors/oauth/start/route.directory.test.ts`: Start for directory servers.
- `apps/web/app/api/connectors/oauth/complete/route.test.ts`: App-side completion.
- `apps/web/lib/connectors/__tests__/finish-authorization.policy.test.ts`: Policy checks at callback.
- `apps/web/lib/connectors/__tests__/oauth-store.test.ts`: Store: account keys, scoped reads, upsert SQL, locked reads (mocked database).
- `apps/web/lib/connectors/__tests__/oauth-connector-lifecycle.contract.test.ts`: Connector lifecycle contract.
- `apps/web/lib/connectors/__tests__/oauth-scope-allowlist.test.ts`: Scope ceiling and escalation.
- `apps/web/lib/connectors/__tests__/connector-release.test.ts`: Release gate in connector code.
- `packages/contracts/types/src/__tests__/connector-release.test.ts`: connectorReleased exact-id matching.
- `apps/web/app/api/connectors/[connectorId]/accounts/route.test.ts`: Account list route.

**Test scenarios**

- **Malformed state**
  1. Sign in on a test deployment.
  2. Open /api/connectors/oauth/callback?state=abc&code=x.
  - Expected: Redirect to /connectors with status invalid_state; no grant row.
- **Released connector, full consent**
  1. Use a plan that includes connectors and a released id such as one of the 13.
  2. Start from the directory, approve consent, return.
  - Expected: Status connected; 'Connected account' shows the label; one row in connector_oauth_grants.
- **Unreleased connector**
  1. Start sign-in for a connector id not on the released list.
  - Expected: Start is blocked by policy (connectors_coming_soon) or the callback returns unavailable.
- **Free account**
  1. Sign in on Free and start a released connector.
  - Expected: policy_blocked with the upgrade message (plan_upgrade_required).
- **Second account**
  1. Connect a service as account A.
  2. Connect it again as account B.
  - Expected: Required: both kept, one default. Current code: A is overwritten (account key 'default'); record the result as a defect.
- **Scope widening**
  1. Connect with a narrow scope set, then raise the connector's declared scopes.
  2. Start again.
  - Expected: Start response status scope_reconsent with addedScopes; the consent page is shown.

**Where to look when it fails**

- Log lines: '[connector-oauth] callback rejected: malformed or missing state', '...unknown, expired, replayed, or another account state', '...authorization code exchange failed' (logger.warn).
- Tables: connector_oauth_authorizations, connector_oauth_grants (account_key, is_default, revoked_at).
- Audit event type connector_added.
- Redirect query param for status on /connectors.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Second account of a service cannot be created: no code passes an account key into the pending record or the grant write.** Affects: All apps that connect services; people with a work and a personal account.. Evidence: oauth/start/route.ts:353-370 and mcp-discovery.ts:242 call createPendingAuthorization with no account fields; finish-authorization.ts:171-185 passes only accountLabel; accounts.ts:5-9 maps an empty key to 'default'.. Work needed: Carry account key, label and scope through start, pending and upsert; add a test that two accounts survive; correct the brief status of S98.11.
- **No way to choose the default account or an account per task.** Affects: Web, Mobile, CLI, VS Code, Desktop.. Evidence: oauth-access.ts:84-97 has no account argument; no set-default route or control found.. Work needed: Add account argument to access resolution and tool calls, plus a set-default API and control.
- **Forced fresh consent on wider scopes is advisory only.** Affects: People with an existing grant when a connector widens its scopes.. Evidence: grantRequiresReconsent has no non-test caller (scopes-escalation.ts:48-55); start route only adds a status (oauth/start/route.ts:381-386).. Work needed: Call it on use of a stored grant, or document that the consent screen is the enforcement.
- **Most connectors are switched off by the release gate.** Affects: All apps; only 13 ids work for connect.. Evidence: connector-release.ts:14-34; docs/runbooks/connector-oauth-apps.md.. Work needed: Owner decision to release more ids; per-connector vendor app registration.
- **Chrome extension has no connector client found; mobile and Desktop labels unverified.** Affects: Chrome extension.. Evidence: search in apps/extension found no connector client.. Work needed: Confirm and, if required, build parity per docs/product.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-data-model-and-migrations
- SYS-execution-boundaries
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:desktop
- mode:cloud
- table:connector_oauth_grants
- table:connector_oauth_authorizations

## Unknown

- Exact visible button labels for Connect and Disconnect on web, mobile and desktop (not found in the files read).
- Whether the Chrome extension has any connector surface.
- Whether the Electron Desktop adds anything beyond the hosted web app for connectors.
- Which tier names the product shows for basic, pro, max (naming not read).
- How connect interacts with the AGI Subscription usage accounting beyond the plan check.
