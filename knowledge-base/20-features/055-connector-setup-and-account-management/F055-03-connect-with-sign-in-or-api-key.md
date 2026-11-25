---
id: "F055-03"
type: "feature"
title: "Connect with sign-in or API key"
aliases: ["Connect", "Connect action", "Connect with sign-in or API key", "OAuth authorization", "API-key authorization", "Add API key", "Test and save", "S55.07", "S55.08", "S55.09"]
area: "55 Connector setup and account management"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S55.07", "S55.08", "S55.09"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "mode:own-key", "F055-01", "F055-02", "SYS-connectors-plugins-and-skills", "SYS-security-and-privacy", "SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-data-model-and-migrations", "SYS-execution-boundaries"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F055-03 Connect with sign-in or API key

Starts the real connection from a connector's page: either the provider's own sign-in (OAuth, with a consent dialog first) or an API key form whose key is tested against the service and stored encrypted. Built on Web, Desktop (opens the system browser), Mobile and, for own MCP servers, CLI. Currently refused for connectors not yet released.

Area: [55. Connector setup and account management](README.md). Requirement items: [S55.07](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5507), [S55.08](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5508), [S55.09](../../10-requirements/capabilities/055-connector-setup-and-account-management.md#s5509).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web: Connect posts to /api/connectors, which answers with the path for sign-in or for a key form; the client asks the person for consent, then goes to the provider and returns to Connectors. API key: the key is sent over HTTPS, tried against the server with a test call, sealed and saved. (apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:757-870; apps/web/app/api/connectors/[connectorId]/credentials/route.ts:110-250)

**Why it exists.** An assistant can only act in an app after the person authorizes it. The brief requires a real authorization or credential flow (doc: area brief S55.07-S55.09).

**Who uses it.** Any signed-in person on a plan with connectors; admins for workspace-policy limits.

**Problems it solves**

- Safe token handling: tokens and keys are stored encrypted and never in plain text; if token storage is not configured the connect is refused with 503. (route.ts:420-430; credentials/route.ts:127-129)
- Wrong keys: a rejected key gives '<service> rejected that API key.' and nothing is saved. (credentials/route.ts:160-175)
- Forbidden connectors: the workspace policy, plan, release and email checks run before any credential is exchanged. (apps/web/lib/services/connector-policy-gate.ts:139-215)

**Use cases**

- Connect a Notion-style connector with provider sign-in.
- Paste an API key for a key-based MCP server and see how many tools were found.
- Connect on Electron Desktop where the sign-in opens in the system browser.
- Connect on Mobile with an in-app browser and return to the app.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings, Connectors, open connector, press Connect or Add API key (packages/ui/ui/src/directory/constants.ts:123,364).
- Mobile: Settings, Connectors, open connector, button 'Connect' (shows 'Connecting...' while working) (ConnectorDetailScreen.tsx:1250-1280).
- CLI: `agi mcp add <name> --url <URL> --header "Name: value"` registers a remote MCP server with a key header; `agi mcp login <name>` runs OAuth; the CLI cloud list only prints a browser link to connect (apps/cli/src/lib.rs:2126-2160,5359-5367; apps/cli/src/cloud/connectors.rs:169-176,205-210).
- VS Code: Manage Connectors opens the web app; connecting happens in the browser (connectorPresentation.ts:68-69).
- Chrome: not covered by these items.

**Before you start**

- Signed in with a confirmed email (connector-policy-gate.ts:100-125).
- Plan with the connectors capability (billing-catalog.ts:332-351).
- Connector is released (connector-release.ts:14-58).
- Workspace connector policy allows it (connector-policy-gate.ts:230-245).
- Token storage configured on the deployment (route.ts:420).

**Screens and controls**

- Primary button Connect or Add API key.
- Consent dialog 'Connect <name>?' with Allow and Deny.
- API key form: field 'API key', button 'Test and save' (or 'Test and replace'), 'Testing the key', Cancel, 'Try again', link 'Where to find this key' (ConnectorApiKeyForm.tsx:26-41).
- Mobile API key sheet (ConnectorApiKeySheet.tsx).
- Electron: toast 'Finish connecting in your browser. This list updates when you come back.' (open-connector-authorization.ts:12-13).

**Journey**

1. Open the connector detail page.
2. Press Connect (or Add API key).
3. Web: client posts to /api/connectors; the 409 reply names oauthStartPath or credentialsPath.
4. OAuth: consent dialog; Allow; client calls /api/connectors/oauth/start?mode=json for authorizeUrl; the tab goes to the provider (Electron opens the system browser).
5. Approve on the provider page; the provider redirects to /api/connectors/oauth/callback.
6. Server checks state, policy and issuer, swaps the code for tokens, stores them, redirects to Connectors with result parameters.
7. API key: type the key, press Test and save; the server tests it and answers with tools discovered; the form shows 'Connected.' and the tool count.

**What the person sees and gets**

- Result parameters on the return URL: connector and status (connected, denied, failed, invalid_state, unavailable, reauthorize, registration_rejected) (finish-authorization.ts:41-106; oauth/callback/route.ts:35-45).
- Form text 'Connected.' and 'N tools discovered' or 'The server answered but lists no tools yet.' (ConnectorApiKeyForm.tsx:39-41).
- Error messages such as 'Connectors are coming soon.', 'Connectors are unavailable right now.', plan upgrade message, 'This connector is device-local. Connect it from the CLI instead.' (route.ts:585-595).
- Mobile alerts: 'Could not connect <name>', 'Could not open <name> authorization', '<name> is not connected yet' (ConnectorDetailScreen.tsx:600-625).

**Settings**

- Return path is kept so the person comes back to the same place (apps/web/lib/connectors/oauth-registry.ts sanitizeConnectorReturnPath).
- Per-tool permissions are set afterwards (not part of this feature).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/connectors dispatches by connector kind and returns 409 with oauthStartPath, credentialsPath, installStartPath or a Plaid path, 501 for device-local, 503 when token storage is off. (apps/web/app/api/connectors/route.ts:530-800)
- OAuth start builds PKCE state, stores a pending authorization and returns the authorize URL or redirects; supports discovered MCP servers and registered providers. (apps/web/app/api/connectors/oauth/start/route.ts:142-391)
- Callback consumes state, enforces release, issuer match and policy, exchanges the code and stores encrypted tokens. (apps/web/lib/connectors/finish-authorization.ts:41-230)
- API key route probes the server with the key before saving; rejection returns a validation error naming the service; key saved sealed in user_custom_connectors. (credentials/route.ts:110-250)
- Electron Desktop opens the provider in the system browser and reloads the list on window focus. (open-connector-authorization.ts:36-46)
- Mobile connect with in-app authorization and app-return completion via /api/connectors/oauth/complete. (apps/mobile/services/connectors.ts:285-300; apps/web/app/api/connectors/oauth/complete/route.ts)
- CLI can register MCP servers with headers and run OAuth login with the token stored in the OS credential store. (lib.rs:5359-5367)

**Incomplete**

- The CLI cannot connect an account connector end to end: it prints a browser link. The brief marks CLI done; code shows the own-MCP route instead. (cloud/connectors.rs:169-176)
- Pending authorization lifetime is set per connector by sensitive-data rules; the default value was not read. (oauth/start/route.ts:290)

**Present but disconnected or switched off**

- Every connector outside the 13-id list is refused: the gate returns connectors_coming_soon 'Connectors are coming soon.' (connector-policy-gate.ts:146-153; connector-release.ts:14-30).
- The OAuth callback returns status unavailable for an unreleased connector even after the provider approved. (finish-authorization.ts:69)

**Not available**

- Device-only connectors on web: refused with HTTP 501 and message to use the CLI. (route.ts:585-595) Whether the CLI actually offers those connectors was not found: unknown.
- VS Code and Chrome do not connect (browser only).

## 4. Required behaviour

**Established requirements**

- A Connect action starts the connector's real authorization or credential flow. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.07)
- Connecting an OAuth provider opens the consent page and stores the returned grant. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.08)
- An API-key connector offers a form, stores the key encrypted and connects. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S55.09)
- Connect is checked against workspace connector policy before any credential is exchanged. (source: apps/web/lib/services/connector-policy-gate.ts:20-34 (code comment of intent))
- A reconnected connector does not resume the interrupted turn; the person asks again. (source: doc: docs/decisions/2026-09-27-founder-decisions.md:353-359)

**Acceptance criteria**

1. Press Connect on a released OAuth connector: a consent dialog shows before leaving the app.
2. Press Deny in the dialog: no request to the provider is made and nothing is stored.
3. Decline on the provider page: the app returns to Connectors with status denied and no grant row.
4. Submit a wrong API key: error naming the service, no row saved.
5. Submit a correct key: the form shows connected and the tool count; a row exists with an encrypted credential.
6. With token storage disabled, Connect and key save answer 503 'token storage unavailable' text.
7. Connect a connector not released: refused with 'Connectors are coming soon.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The key is checked by an MCP connection and tool listing (probeMcpServer), not by a provider-specific auth ping.
- [inferred] Cancelling in the system browser on Electron leaves the list unchanged because the list reloads only on focus.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let the CLI complete cloud connector sign-in with a device flow instead of printing a link.
- [proposed] Name the 501 device-local connectors in the directory so people do not hit the refusal.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | api:POST /api/connectors | `apps/web/app/api/connectors/route.ts` | Entry for Connect; returns the next step or saves operator-mapped connectors. |
| endpoint | api:GET /api/connectors/oauth/start | `apps/web/app/api/connectors/oauth/start/route.ts` | Builds the provider authorize URL with PKCE and state. |
| endpoint | api:GET /api/connectors/oauth/callback | `apps/web/app/api/connectors/oauth/callback/route.ts` | Receives the provider redirect and finishes. |
| endpoint | api:POST /api/connectors/oauth/complete | `apps/web/app/api/connectors/oauth/complete/route.ts` | App-return completion for Mobile. |
| endpoint | api:POST /api/connectors/{connectorId}/credentials | `apps/web/app/api/connectors/[connectorId]/credentials/route.ts` | Tests and stores an API key; GET reports how a key is accepted. |
| service | finishConnectorAuthorization | `apps/web/lib/connectors/finish-authorization.ts` | Callback logic, policy re-check, token exchange, audit event. |
| service | connector policy gate | `apps/web/lib/services/connector-policy-gate.ts` | Release, email, plan, kill switch and workspace policy checks. |
| service | oauth store | `apps/web/lib/connectors/oauth-store.ts` | Pending authorizations and encrypted grants. |
| service | oauth client | `apps/web/lib/connectors/oauth-client.ts` | Code exchange and refresh calls to the provider. |
| service | MCP discovery | `apps/web/lib/connectors/mcp-discovery.ts` | Discovers authorization and registers the app for directory servers. |
| service | custom connector crypto | `apps/web/lib/custom-connector-crypto.ts` | Seals credentials and reports token storage availability. |
| hook | connectConnector | `apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx` | Web client logic for the 409 branches and consent. |
| component | ConnectorApiKeyForm | `apps/web/features/connectors/components/ConnectorApiKeyForm.tsx` | API key form with test and save. |
| service | openConnectorAuthorization | `apps/web/features/connectors/lib/open-connector-authorization.ts` | Browser redirect or Electron external open. |
| service | client-runtime connect | `packages/client/client-runtime/src/connectors/runtime.ts` | Shared connect logic used by Mobile. |
| service | Mobile connector service | `apps/mobile/services/connectors.ts` | connectConnector, startConnectorOAuth, key save. |
| component | ConnectorApiKeySheet | `apps/mobile/src/features/settings/cloud-connectors/ConnectorApiKeySheet.tsx` | Mobile key entry. |
| command | agi mcp add / login | `apps/cli/src/lib.rs` | CLI own-server registration and OAuth login. |
| table | table:connector_oauth_grants | `apps/web/db/neon/0097_connector_oauth_broker.sql` | Encrypted tokens, scopes, account label. |
| table | table:connector_oauth_authorizations | `apps/web/lib/connectors/oauth-store.ts` | Pending state and code verifier. |
| table | table:user_custom_connectors | `apps/web/db/neon/0086_org_shared_ecosystem.sql` | Directory and custom server rows with sealed credential. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Connect; the client posts {connectorId, authType} with a CSRF token to /api/connectors. | device and our servers | useConnectorsSettingsAdapter.tsx:772-786 |
| Server checks CSRF, rate limit, workspace access, then the policy gate (release, email, plan, kill switch, workspace policy). | our servers | route.ts:530-575; connector-policy-gate.ts:139-215 |
| Server answers 409 with oauthStartPath or credentialsPath (or 501/503/403). | our servers | route.ts:402-450,740-760 |
| Client shows the consent dialog; on Allow it requests oauth/start?mode=json. | device | useConnectorsSettingsAdapter.tsx:809-829 |
| Start route re-checks region, token storage, workspace policy; creates state and PKCE verifier; stores a pending row; returns authorizeUrl. | our servers | oauth/start/route.ts:206-340 |
| Browser (or system browser on Electron) goes to the provider; person approves. | outside service | open-connector-authorization.ts:36-46 |
| Provider redirects to the callback; our server consumes the pending row, exchanges the code at the provider, encrypts and stores tokens, writes an audit event. | our servers | finish-authorization.ts:41-230; oauth-store.ts:292-345 |
| API key path: our server probes the connector's MCP URL with the key as a header; on success seals and saves the key and caches tool names. | our servers | credentials/route.ts:152-232 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| OAuth access and refresh tokens, granted scopes, account label | table connector_oauth_grants, tokens encrypted | Server side, shared across the person's apps | Erased and marked revoked on disconnect or failed refresh (oauth-store.ts:715-760,780-800) |
| Pending authorization (state hash, code verifier, requested scopes) | table connector_oauth_authorizations | no | Consumed on callback; also deleted by cleanup (oauth-store.ts:57-70,285-292); TTL default unknown |
| API key header | user_custom_connectors.auth_header_enc, sealed | Server side | Replaced on a new key; removal on connector removal not traced |
| Audit event connector_added | security audit log | Server | unknown (audit retention not read) |

**Models and providers.** No language model takes part. Providers are the connector's own OAuth or key service. MCP discovery contacts the server's metadata endpoints (mcp-discovery.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in account; unconfirmed email is refused with a message (connector-policy-gate.ts:100-125). Mobile needs Clerk sign-in and Cloud mode. |
| Permissions | Workspace connector policy (admin 'these connectors only') is checked at start, callback and key save. Org admin not needed to connect personally. |
| Subscription | Plan check inside the gate returns plan_upgrade_required with the upgrade message for tiers not in the connectors list (connector-policy-gate.ts:180-195; billing-catalog.ts:332-351). |
| Limits and metering | Custom connector count and tool count limits by plan (assertCustomConnectorCapacity, assertConnectorToolCapacity; credentials/route.ts:154,184). Rate limit buckets on routes. No per-call metering at connect. |
| Feature flags | CONNECTOR_RELEASE_STATE and selective list; kill-switch canUseConnectors via connectorsAllowedWithoutRequest (connector-capability.ts:68-86). |
| Model compatibility | none found in the code. |
| Provider restrictions | Region refusal for sensitive-data connectors (route.ts:626-635). Providers with no registered OAuth app return 501 not configured (oauth/start/route.ts:317-325). |
| Local mode | Cloud connectors need the cloud account on every app; on Mobile Local mode blocks the screen. CLI own MCP servers (agi mcp add/login) work on the device with the token in the OS credential store; whether they need any sign-in to AGI is unknown. No payment is tied to local inference in this feature. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Consent denied | Client stops before any provider request; nothing stored. | useConnectorsSettingsAdapter.tsx:812-813 |
| Provider denied | Callback returns status denied; no grant written. | finish-authorization.ts:88-91 |
| Unknown or replayed state | Status invalid_state; logged as callback rejected. | finish-authorization.ts:50-56 |
| Wrong key | 400 '<name> rejected that API key.'; unreachable server gives 502 with a code. | credentials/route.ts:160-175 |
| Token storage off | 503 with the unavailable text. | route.ts:420-430; credentials/route.ts:127 |
| Device-local connector on web | 501 'This connector is device-local. Connect it from the CLI instead.' | route.ts:585-595 |
| Browser blocked on Mobile | Alert 'Could not open authorization'; nothing connected. | ConnectorDetailScreen.tsx:600-612 |
| Timeout of provider calls | Token calls have a deadline helper; exact timeouts unknown. | apps/web/lib/connectors/mcp-oauth-fetch.ts; test file mcp-oauth-fetch.deadline.test.ts |
| Scope widened since last grant | Start returns status scope_reconsent with added scopes; scopes above the reviewed ceiling are dropped. | oauth/start/route.ts:290-335,367-376 |
| Retry | Key form offers 'Try again'; OAuth is retried by pressing Connect again. | ConnectorApiKeyForm.tsx:31 |
| Accessibility | Consent dialog is an AlertDialog; Mobile buttons carry accessibilityLabel 'Connect <name>'. | ConnectorConsentDialog.tsx:30-45; ConnectorDetailScreen.tsx:1262 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/connectors/route.test.ts`: POST and GET /api/connectors (by file name).
- `apps/web/app/api/connectors/oauth/start/route.test.ts`: OAuth start (by file name); also route.directory.test.ts and route.credential-reconnect.test.ts.
- `apps/web/app/api/connectors/oauth/callback/route.test.ts`: OAuth callback (by file name); also route.directory.test.ts.
- `apps/web/app/api/connectors/oauth/complete/route.test.ts`: Mobile completion (by file name).
- `apps/web/app/api/connectors/[connectorId]/credentials/route.test.ts`: API key route (by file name).
- `apps/web/lib/services/__tests__/connector-policy-gate.test.ts`: Policy gate (by file name).
- `apps/web/lib/connectors/__tests__/oauth-connector-lifecycle.contract.test.ts`: OAuth lifecycle contract (by file name).
- `apps/web/lib/connectors/__tests__/oauth-store.test.ts`: Grant storage (by file name).
- `apps/mobile/__tests__/ConnectorOauthConnectScreen.test.tsx`: Mobile connect screen (by file name).
- `apps/mobile/__tests__/connector-oauth-app-return.test.ts`: Mobile app return (by file name).
- `packages/client/client-runtime/src/__tests__/connector-policy-propagation.test.ts`: Shared runtime policy (by file name).

**Test scenarios**

- **OAuth happy path**
  1. Use a released OAuth connector on Web.
  2. Press Connect, Allow.
  3. Approve at the provider.
  - Expected: Return to Connectors with status connected; connector shows Connected; a grant row exists with encrypted tokens.
- **Provider denies**
  1. Press Connect, Allow.
  2. Deny at the provider.
  - Expected: Back on Connectors with status denied; no grant.
- **Bad API key**
  1. Open a key connector, press Add API key.
  2. Enter a wrong key, Test and save.
  - Expected: Message '<service> rejected that API key.'; no row saved.
- **Token storage off**
  1. Run with storage keys unset.
  2. Press Connect.
  - Expected: 503 text about token storage; no pending row.
- **Electron external browser**
  1. In Desktop press Connect, Allow.
  2. Finish in the system browser, return to the app.
  - Expected: Toast tells to finish in the browser; list reloads on window focus.
- **Unreleased connector**
  1. Try to connect one outside the 13-id list (API call).
  - Expected: 403 'Connectors are coming soon.'

**Where to look when it fails**

- Logs '[connector-oauth] callback rejected: ...' and '[connector-policy] ...' lines.
- Tables connector_oauth_authorizations (stuck pending), connector_oauth_grants, user_custom_connectors.
- Result parameter status on the return URL.
- Audit event connector_added.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/055-connector-setup-and-account-management.md](../../70-qa/test-plans/web/055-connector-setup-and-account-management.md)
- Desktop: [70-qa/test-plans/desktop/055-connector-setup-and-account-management.md](../../70-qa/test-plans/desktop/055-connector-setup-and-account-management.md)
- Mobile: [70-qa/test-plans/mobile/055-connector-setup-and-account-management.md](../../70-qa/test-plans/mobile/055-connector-setup-and-account-management.md)
- CLI: [70-qa/test-plans/cli/055-connector-setup-and-account-management.md](../../70-qa/test-plans/cli/055-connector-setup-and-account-management.md)

## 10. Gaps and dependencies

- **Connect is refused for all but 13 connectors by the release constant, so most of the flow cannot be used in the current build.** Affects: All apps. Evidence: connector-release.ts:14-30; connector-policy-gate.ts:146-153. Work needed: Owner decision to release; per connector live checks.
- **CLI does not run cloud connector authorization; it prints a link.** Affects: CLI users. Evidence: cloud/connectors.rs:169-176. Work needed: Device sign-in flow or update the brief.
- **501 device-local connectors say 'connect from the CLI' but no CLI path for them was found.** Affects: Web users of local connectors. Evidence: route.ts:585-595. Work needed: Verify or reword.
- **Cancel inside Electron's external browser is not detected; list reloads only on focus.** Affects: Desktop users. Evidence: open-connector-authorization.ts:44. Work needed: Optional pending-state hint.
- **Brief says live checks were not run; no record exists of a live OAuth run.** Affects: All. Evidence: area brief S55.20 unfinished note; no test report found. Work needed: Run the live scenarios above.

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- mode:own-key
- F055-01
- F055-02
- SYS-connectors-plugins-and-skills
- SYS-security-and-privacy
- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-data-model-and-migrations
- SYS-execution-boundaries

## Unknown

- Whether the 13 released connectors have real OAuth apps configured in production (configuration not readable here).
- Pending authorization default lifetime.
- Whether CLI offers device-local connectors named in the web 501 message.
- How the Tauri internal desktop connect flow compares; not read.
- Whether CLI mcp login needs any AGI account.
- Whether audit events are retained and for how long.
