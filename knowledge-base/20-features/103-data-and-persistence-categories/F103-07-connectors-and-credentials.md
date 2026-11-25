---
id: "F103-07"
type: "feature"
title: "Connectors and credentials"
aliases: ["Connectors and connected accounts", "Encrypted credential references", "Connector OAuth broker", "API key service", "Settings > Account > API keys", "user_connectors", "connector_oauth_grants", "user_custom_connectors"]
area: "103 Data and persistence categories"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S103.26", "S103.27"]
depends_on: ["SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "surface:web", "mode:cloud", "table:connector_oauth_grants", "table:api_keys"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F103-07 Connectors and credentials

Server-side storage of the outside accounts a person connects and the secrets behind them. OAuth tokens and custom-connector bearer values are kept encrypted. OAuth sign-in state is kept as a hash with an encrypted verifier. AGI API keys are kept only as argon2 hashes with a lookup prefix. Disconnecting revokes the grant and wipes its tokens.

Area: [103. Data and persistence categories](README.md). Requirement items: [S103.26](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10326), [S103.27](../../10-requirements/capabilities/103-data-and-persistence-categories.md#s10327).

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

**What it does.** Holds which connectors a person switched on, the OAuth grants that let AGI act in their outside accounts, user-added custom connector endpoints with an encrypted bearer value, per-connector on/off states, and the person's AGI API keys. No usable secret is stored in plain text (apps/web/lib/custom-connector-crypto.ts:49; apps/web/db/neon/0097_connector_oauth_broker.sql:92; apps/web/lib/services/api-key-service.ts:53).

**Why it exists.** Managed Cloud had no per-user OAuth path: only an enablement flag and a typed-in bearer value. The broker tables hold the state for 'platform runs its own OAuth app, the person clicks Connect, AGI holds their tokens' (apps/web/db/neon/0097_connector_oauth_broker.sql:1-40). API keys let outside code call the AGI cloud API.

**Who uses it.** Signed-in people on a paid plan who connect tools; developers who create API keys (needs a plan with managed API access, apps/web/app/api/settings/api-keys/route.ts:85); workspace admins via shared connectors [inferred from table organization_shared_connectors in apps/web/lib/services/deletion-manifest.ts:212].

**Problems it solves**

- A database read cannot replay a live OAuth flow because only the SHA-256 of state is stored (apps/web/db/neon/0097_connector_oauth_broker.sql:55-60).
- A revoked grant physically cannot return a token: a check constraint forces both ciphertext columns to null when revoked_at is set (apps/web/db/neon/0097_connector_oauth_broker.sql:120-124).
- A raw API key cannot be recovered from the database; only a hash and the 16-hex key id are stored (apps/web/lib/services/api-key-service.ts:53-60).
- More than one account per connector: personal and work accounts are kept apart (apps/web/db/neon/0253_connector_accounts.sql header).

**Use cases**

- Connect a mailbox through Connect, then let chat read it with approval.
- Add a custom connector URL with a bearer value the person typed.
- Create an API key named for a script, copy it once, revoke it later.
- Disconnect a connector and have its tokens wiped, with a notice if the provider did not confirm revocation (apps/web/lib/connectors/oauth-access.ts:489-496).

## 2. User experience

**Where to find it**

- Web: signed-in /connectors redirects to the Connectors section of the settings modal; signed-out it shows 'Connectors bring your own tools into a thread' and a 'Browse the MCP directory' link (apps/web/app/connectors/page.tsx:21-60).
- Web API keys: Settings > Account > row 'API keys', screen titled 'API Keys' (apps/web/features/settings/sections/AccountSection.tsx:433-460; apps/web/features/settings/components/Settings/ApiKeys.tsx:190).
- Mobile: screens under apps/mobile/app/(app)/connectors and apps/mobile/src/features/settings/cloud-connectors (exact labels not read).
- Desktop: cloud account settings adapter calls /api/settings/api-keys (apps/desktop/src/api/cloudAccountSettings.ts:437-480); visible labels not read.
- CLI: apps/cli/src/cloud/connectors.rs lists and disconnects connectors; apps/cli/src/cloud/api_keys.rs lists and revokes keys. A create function was not found there.
- VS Code and Chrome: not found in this pass.

**Before you start**

- Signed in.
- Connectors need a paid plan: capability 'connectors' is limited to basic, pro, max, max_15x, team, team_premium, enterprise (packages/contracts/types/src/billing-catalog.ts:351).
- API keys need pro or higher (managed_api, packages/contracts/types/src/billing-catalog.ts:358).
- Server must have the connector token encryption key configured, else connector authorization is refused (apps/web/lib/custom-connector-crypto.ts:32-41; apps/web/app/api/connectors/route.ts:415).

**Screens and controls**

- API Keys card: 'Key Name' field (placeholder 'e.g., Production API'), 'Scopes', 'Project', 'Expires'; per-key delete button labelled 'Delete <name>'; empty state 'No API keys yet'; loading text 'Loading API keys...' (apps/web/features/settings/components/Settings/ApiKeys.tsx:215-419).
- Key dialog titled 'Generate New API Key', then 'API Key Generated' with warning 'Save this key now. You will not be able to see it again!', 'Copy to Clipboard' and 'Done' (apps/web/features/settings/components/Settings/ApiKeys.tsx:303-469).
- Connectors: Connect and disconnect per connector, per-connector switch, tool permission panel, call log, health dashboard components under apps/web/features/connectors/components.

**Journey**

1. Connect: person picks a connector and presses Connect; the app calls GET /api/connectors/oauth/start, which stores a pending authorization and returns the provider URL.
2. Provider asks for consent; the browser returns to GET /api/connectors/oauth/callback, which exchanges the code and stores encrypted tokens (apps/web/app/api/connectors/oauth/callback/route.ts).
3. POST /api/connectors/oauth/complete finishes the hand-off with a CSRF check (apps/web/app/api/connectors/oauth/complete/route.ts:24).
4. API key: open API keys, press add, fill name, scopes, optional project and expiry, confirm step-up check, copy the key shown once, press Done.
5. Disconnect: DELETE /api/connectors?connectorId=...; grants are revoked, caches purged, tool permissions cleared, audit event written (apps/web/app/api/connectors/route.ts:880-925).

**What the person sees and gets**

- Disconnect result may include a notice such as 'Disconnected here, but ... did not confirm that it revoked access ...' (apps/web/lib/connectors/oauth-access.ts:489-496).
- Unreachable provider: 'Couldn't reach <label> just now. It is still connected, so try again in a moment.' (apps/web/lib/connectors/oauth-access.ts:480).
- API key list shows prefix, scopes, project, created, last used and expiry; never the hash (apps/web/app/api/settings/api-keys/route.ts:40-51).
- Plan refusal for API keys carries code managed_api_plan_required with an upgrade link (apps/web/app/api/settings/api-keys/route.ts:85-92).

**Settings**

- Per-connector account-wide switch (connector_account_states, migration 0381).
- Max API key lifetime configuration name API_KEY_MAX_LIFETIME_DAYS, default 365 days (apps/web/lib/services/api-key-service.ts:23-33).
- Connector token encryption key configuration name CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY (value never recorded).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- OAuth start stores a pending row with state hash and encrypted PKCE verifier, ten minute life (apps/web/lib/connectors/oauth-store.ts:11,52-90).
- Grants stored with encrypted access and refresh tokens; revoke sets revoked_at and nulls both ciphertexts in one statement (apps/web/lib/connectors/oauth-store.ts:720-745,792-796).
- Disconnect revokes locally first, then asks the provider to revoke (best effort), purges caches, clears tool permissions, audits (apps/web/lib/connectors/oauth-access.ts:444-461; apps/web/app/api/connectors/route.ts:880-925).
- API keys: sk_live_<16 hex id>_<secret>, argon2id hash (64 MB, 3 passes), lookup by key_prefix, revoke is soft (revoked_at) (apps/web/lib/services/api-key-service.ts:14-21,53-60,237-241,261-282).
- API key create: CSRF, plan check, 20 active key cap, step-up auth, rate limit, audit event, developer webhook event; full key returned once as full_key (apps/web/app/api/settings/api-keys/route.ts:71-160).
- Account erasure deletes user_connectors, user_custom_connectors, connector_oauth_grants, connector_oauth_authorizations and api_keys, and revokes tokens at the provider best effort (apps/web/lib/server/account-erasure.ts:93-100,122; apps/web/lib/connectors/oauth-access.ts:425-441).

**Incomplete**

- Per-app connect behaviour on desktop, mobile, CLI was not traced end to end; only that code and endpoints exist.
- Key expiry: bounded by API_KEY_MAX_LIFETIME_DAYS; keys with no expiry are allowed by the service signature (expiresAt default null, apps/web/lib/services/api-key-service.ts:131) while the route validation rule for null was not traced.

**Present but disconnected or switched off**

- Provider revocation is skipped when a provider has no revocation endpoint; the notice says access may remain (apps/web/lib/connectors/oauth-access.ts:489-496).

**Not available**

- API key creation on CLI: not found (apps/cli/src/cloud/api_keys.rs has list and revoke only).
- Connector and API key screens in the VS Code and Chrome extensions: not found.

## 4. Required behaviour

**Established requirements**

- Connectors and connected accounts are durably stored and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.26)
- Credentials are stored only encrypted or hashed (access_token_enc, key hashes) and classified. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S103.27)
- OAuth state is stored as a hash; the code verifier is encrypted; tokens are encrypted columns. (source: apps/web/db/neon/0097_connector_oauth_broker.sql:55-100)
- Revoking a grant is not a delete: revoked_at is set and both ciphertexts are nulled together. (source: apps/web/db/neon/0097_connector_oauth_broker.sql:120-124)
- Every sensitive store is classified in the retention matrix (api_keys, connector_oauth_grants, connector_oauth_authorizations, user_connectors, user_custom_connectors, connector_account_states). (source: apps/web/lib/services/deletion-manifest.ts:130,143-148,245-247)
- Never route Local data across a trust boundary silently; registry membership does not authorise it. (source: AGENTS.md section 6)

**Acceptance criteria**

1. After Connect, connector_oauth_grants.access_token_enc holds ciphertext, not the provider token.
2. connector_oauth_authorizations holds a 64-hex state_hash and an encrypted verifier, no raw state.
3. After Disconnect, the grant row has revoked_at set and both token columns null; chat can no longer call the connector.
4. A created API key shows full_key once; later lists show only prefix; api_keys.key_hash starts with an argon2id marker.
5. The 21st active API key is refused with a message naming the limit of 20.
6. A Free-plan account is refused API key creation with managed_api_plan_required.
7. Account erasure leaves no rows for the user in the six connector and key tables.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Connector features should be unavailable, not silently degraded, when the encryption key is missing [inferred from the refusal at apps/web/app/api/connectors/route.ts:415].
- Revoked grants should eventually be deleted; domain retention does this for workspace members when a window is set (apps/web/lib/services/domain-retention-service.ts:452-465) [inferred that personal accounts have no sweep].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a maximum age for revoked grants of personal accounts, since the manifest shows no age rule for connector_oauth_grants.
- [proposed] Add key creation to the CLI or state that creation is web-only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | oauth-store | `apps/web/lib/connectors/oauth-store.ts` | Create, consume and revoke pending authorizations and grants; encrypts tokens. |
| service | custom-connector-crypto | `apps/web/lib/custom-connector-crypto.ts` | Seal and open connector secrets with purpose-bound envelope encryption. |
| service | oauth-access | `apps/web/lib/connectors/oauth-access.ts` | Disconnect flow, provider revocation, erasure-time revocation. |
| endpoint | Connectors collection | `apps/web/app/api/connectors/route.ts` | GET list, POST enable, DELETE disconnect. |
| endpoint | OAuth start | `apps/web/app/api/connectors/oauth/start/route.ts` | Builds provider URL, stores pending authorization. |
| endpoint | OAuth callback | `apps/web/app/api/connectors/oauth/callback/route.ts` | Receives the provider redirect and stores the grant. |
| endpoint | OAuth complete | `apps/web/app/api/connectors/oauth/complete/route.ts` | POST hand-off with CSRF check. |
| table | user_connectors | `apps/web/db/neon/0048_user_connectors.sql` | Enablement gate per user and connector; no credentials. |
| table | connector_oauth_authorizations and connector_oauth_grants | `apps/web/db/neon/0097_connector_oauth_broker.sql` | In-flight and settled OAuth state with encrypted columns. |
| table | user_custom_connectors | `apps/web/db/neon/0052_user_custom_connectors.sql` | Custom connector URL and encrypted auth header. |
| schema | connector accounts | `apps/web/db/neon/0253_connector_accounts.sql` | Multiple accounts per connector (account_key, label, scope, default). |
| table | connector_account_states | `apps/web/db/neon/0381_connector_account_state.sql` | Account-wide on/off per connector. |
| service | ApiKeyService | `apps/web/lib/services/api-key-service.ts` | Generate, hash, verify, rotate, revoke API keys. |
| endpoint | API keys list and create | `apps/web/app/api/settings/api-keys/route.ts` | GET list (100 max), POST create. |
| endpoint | API key revoke | `apps/web/app/api/settings/api-keys/[keyId]/route.ts` | DELETE soft revoke with audit and webhook. |
| table | api_keys | `apps/web/db/neon/0005_api_keys.sql` | key_hash, key_prefix, scopes, expiry; revoked_at added in 0023. |
| component | ApiKeys | `apps/web/features/settings/components/Settings/ApiKeys.tsx` | Web API key screen and one-time key dialog. |
| component | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Row 'API keys' that opens the manager. |
| service | deletion-manifest | `apps/web/lib/services/deletion-manifest.ts` | Classifies each connector and key store and states how it is erased. |
| service | account-erasure | `apps/web/lib/server/account-erasure.ts` | Deletes user rows and purges connector response caches. |
| service | domain-retention-service | `apps/web/lib/services/domain-retention-service.ts` | Deletes revoked grants of workspace members past the window (connector_data). |
| command | CLI connectors and keys | `apps/cli/src/cloud/connectors.rs` | CLI list and disconnect; api_keys.rs lists and revokes keys. |
| screen | Mobile cloud connectors | `apps/mobile/src/features/settings/cloud-connectors` | Mobile connector screens using the shared contracts. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses Connect; the app asks the server to start an authorization. | device and our servers | apps/web/app/api/connectors/oauth/start/route.ts:143,391 |
| Server generates state and PKCE pair, stores state hash and encrypted verifier, returns the provider URL. | our servers | apps/web/lib/connectors/oauth-store.ts:52-90 |
| Person consents at the provider. | outside service | apps/web/lib/connectors/oauth-registry.ts (buildAuthorizationUrl imported at start/route.ts:24) |
| Provider redirects to the callback; server consumes the pending row (single use), exchanges the code, stores encrypted tokens. | our servers | apps/web/lib/connectors/oauth-store.ts:180-230,294-345 |
| On disconnect the server captures and revokes grants in one transaction, then asks the provider to revoke. | our servers | apps/web/lib/connectors/oauth-store.ts:770-810; apps/web/lib/connectors/oauth-access.ts:444-461 |
| API key create: server generates the key, hashes it with argon2id, inserts the hash, returns the raw key once. | our servers | apps/web/lib/services/api-key-service.ts:53-60,214-232; apps/web/app/api/settings/api-keys/route.ts:122-160 |
| API key use: caller sends the key; server finds rows by key_prefix, verifies the hash, updates last_used_at in the background. | our servers | apps/web/lib/services/api-key-service.ts:244-292 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| OAuth grants (encrypted tokens, scopes, expiry) | table connector_oauth_grants in the server database, row-level security by user | Server-held; every app reaches it through the cloud API | Revoke nulls tokens; row erased with the account; workspace members' revoked rows swept by domain retention when a window is set (apps/web/lib/services/domain-retention-service.ts:452-465) |
| Pending authorization (state hash, encrypted verifier) | table connector_oauth_authorizations | Server only | Single use, ten minute life; old rows deleted when a new one starts (apps/web/lib/connectors/oauth-store.ts:57) |
| API key hash and prefix | table api_keys | Server only; raw key exists only in the create response | Soft revoked; erased with the account (apps/web/lib/server/account-erasure.ts:122) |
| Custom connector URL and encrypted auth header | table user_custom_connectors | Server only | Erased with the account (apps/web/lib/server/account-erasure.ts:94) |

**Models and providers.** No model is involved in storing credentials. Outside providers are involved in OAuth consent and token revocation; the chat pipeline later uses the tokens when a tool call needs the connector. Provider-specific OAuth settings come from the connector registry, not from the model catalog.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Sign-in required for every route; pending-authorization owner is checked server-side (apps/web/lib/connectors/oauth-store.ts:125). |
| Permissions | Row-level security isolates each user's rows. API key revoke checks ownership (apps/web/app/api/settings/api-keys/[keyId]/route.ts:41-47). Workspace access gate runs on connector routes (apps/web/app/api/connectors/route.ts:239). |
| Subscription | Connectors: paid tiers only. API keys: pro tier and above. Both through the shared billing capability table (packages/contracts/types/src/billing-catalog.ts:351,358). |
| Limits and metering | 20 active API keys per user; list shows 100; rate-limit buckets on routes (apps/web/app/api/settings/api-keys/route.ts:26,64); pending authorization lives 600 seconds. No usage metering of connector tokens found. |
| Feature flags | Release gating of individual connectors exists in lib/connectors (connector-release tests); exact flags not read. |
| Model compatibility | None found in the code for credential storage. |
| Provider restrictions | Sensitive-data connectors can be refused by region (apps/web/app/api/connectors/oauth/start/route.ts imports sensitiveDataRegionRefusal); details not read. |
| Local mode | Connector credentials and API keys live on our servers only. Local mode on device does not use them; whether Local-mode mobile or desktop can hold a connector token on the device is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Encryption key missing | Connector authorization is refused with 'Connector authorization is unavailable because secure token storage is not configured. Contact your administrator.' | apps/web/lib/custom-connector-crypto.ts:32-35; apps/web/app/api/connectors/route.ts:415 |
| Provider unreachable on token refresh | Grant stays intact; person sees a try again message. | apps/web/lib/connectors/oauth-access.ts:480-490 |
| Provider does not confirm revocation | Local disconnect succeeds with a warning notice. | apps/web/lib/connectors/oauth-access.ts:489-496 |
| GitHub App uninstall fails | Connector left connected; 502 or 503 with retryable flag. | apps/web/app/api/connectors/route.ts:925-975 |
| Key already revoked | Returns 'API key was already revoked' without error. | apps/web/app/api/settings/api-keys/[keyId]/route.ts:49-51 |
| Generated key lost or action unconfirmed | Dialog text says it cannot be recovered; refresh before retrying. | apps/web/features/settings/components/Settings/ApiKeys.tsx:502 |
| Offline on the API keys screen | not handled in the code beyond generic error responses; not traced | not found in apps/web/features/settings/components/Settings/ApiKeys.tsx (searched for offline handling) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/connectors/__tests__/oauth-store.test.ts`: Pending authorization and grant storage.
- `apps/web/lib/connectors/__tests__/oauth-access.test.ts`: Disconnect and revocation paths.
- `apps/web/lib/connectors/__tests__/oauth-connector-lifecycle.contract.test.ts`: Connector lifecycle contract.
- `apps/web/lib/__tests__/custom-connector-crypto.test.ts`: Envelope encryption of connector tokens.
- `apps/web/app/api/connectors/route.test.ts`: Connectors route.
- `apps/web/app/api/connectors/oauth/start/route.test.ts`: OAuth start route.
- `apps/web/app/api/connectors/oauth/callback/route.test.ts`: OAuth callback route.
- `apps/web/app/api/settings/api-keys/__tests__/route.test.ts`: API key list and create route.
- `apps/web/app/api/settings/api-keys/__tests__/key-expiry.test.ts`: Key expiry rules.
- `apps/web/lib/services/__tests__/api-key-service.project-admission.test.ts`: Project admission on create.
- `apps/web/lib/services/__tests__/deletion-manifest.test.ts`: Retention matrix classification.
- `apps/web/features/settings/components/Settings/ApiKeys.ownership.test.tsx`: API keys screen ownership behaviour.

**Test scenarios**

- **Tokens are encrypted at rest**
  1. Connect a test connector on a local build with a test database.
  2. Read connector_oauth_grants for the user.
  3. Compare access_token_enc to the provider token.
  - Expected: Column holds an envelope ciphertext, never the plain token; state_hash is 64 hex.
- **Disconnect wipes tokens**
  1. Connect a connector.
  2. Press disconnect.
  3. Read the grant row.
  - Expected: revoked_at set, access_token_enc and refresh_token_enc null; audit event connector_removed written.
- **API key shown once**
  1. On a pro account create a key.
  2. Close the dialog.
  3. Reopen the list and read api_keys.
  - Expected: List shows prefix only; key_hash is an argon2id hash; no raw key.
- **Key cap and plan gate**
  1. Create 20 keys.
  2. Try a 21st.
  3. Repeat on a Free account.
  - Expected: 21st refused with the limit message; Free refused with managed_api_plan_required.
- **Erasure**
  1. Create grants and keys for a test user.
  2. Run account erasure.
  3. Query the six tables.
  - Expected: No rows remain; provider revocation attempted.

**Where to look when it fails**

- Log 'Account erasure could not revoke connector tokens upstream' (apps/web/lib/server/account-erasure.ts:1041).
- Log 'GitHub App installation was not revoked; connector left connected'.
- Errors ConnectorGrantDecryptionError and ConnectorGrantLockTimeoutError (apps/web/lib/connectors/oauth-store.ts:441-448).
- Tables: connector_oauth_grants, connector_oauth_authorizations, api_keys, security_audit_logs (event connector_removed, api_key_created, api_key_revoked).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No maximum age or sweep for revoked grants of personal (non-workspace) accounts is visible.** Affects: All users on the server; revoked rows hold no secret but stay until the account is erased.. Evidence: apps/web/lib/services/domain-retention-service.ts:452-465 only sweeps workspace members; manifest entry has no age.. Work needed: Decide a maximum age for revoked grants and add a sweep, or record why none is needed.
- **API key verification pattern accepts sk_test_ keys but the key-id regex only matches sk_live_, so a test-prefixed key can never verify.** Affects: Developers using API keys.. Evidence: apps/web/lib/services/api-key-service.ts:21,257-263 [inferred]. Work needed: Confirm whether sk_test_ keys are issued anywhere; align or simplify the pattern.
- **CLI cannot create an API key; desktop, mobile, VS Code, Chrome behaviour for connectors not verified end to end.** Affects: CLI, desktop, mobile, VS Code, Chrome users.. Evidence: apps/cli/src/cloud/api_keys.rs lists and revokes only.. Work needed: Trace each app against the endpoints and record status per app.
- **Brief marks revoke as 'not established'; the code does establish it, but the brief status is per platform, not per app.** Affects: Documentation.. Evidence: apps/web/db/neon/0097_connector_oauth_broker.sql:120-124. Work needed: Update the area brief.

**Depends on**

- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- surface:web
- mode:cloud
- table:connector_oauth_grants
- table:api_keys

## Unknown

- Whether the desktop, mobile, VS Code and Chrome apps complete the connect flow end to end.
- Whether any migration header marked not yet applied affects the connector tables in production; not recorded in the repository.
- Whether sk_test_ keys exist.
- Whether a Local-mode device may store a connector token on the device.
