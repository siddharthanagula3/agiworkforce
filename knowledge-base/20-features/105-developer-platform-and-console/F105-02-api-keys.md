---
id: "F105-02"
type: "feature"
title: "API keys"
aliases: ["API keys", "API Keys card", "New Key", "Generate New API Key", "Cloud API access keys", "sk_live key", "S105.02", "agi keys (CLI)"]
area: "105 Developer platform and console"
available_on: ["web", "desktop"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.02"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "table:api_keys", "SYS-authentication-and-identity", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-security-and-privacy", "F105-01", "F105-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-02 API keys

A person creates scoped API keys for the managed gateway, each with a name, one or more scopes, an optional expiry and an optional project. The full secret is shown once. Keys are listed masked with last use and expiry, and can be deleted. Creation needs a plan with Cloud API access and a fresh sign-in check.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.02](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10502).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates, lists and revokes personal API keys that authenticate calls to the OpenAI-compatible gateway at /api/llm/v1 (chat completions, audio transcriptions, model list, usage). Keys carry scopes models:read, inference:write, usage:read (apps/web/lib/api-key-scopes.ts:1). Only an argon2id hash of the secret is stored (apps/web/lib/services/api-key-service.ts:12-17, 116-123 region).

**Why it exists.** Developers need credentials for scripts, servers and tools that cannot use a browser session, with limited permissions and a way to stop them (doc: knowledge-base/data/area-briefs/105-developer-platform-and-console.md S105.02; decision doc: docs/decisions/wire-or-cut.md section 'Managed API Key Scopes').

**Who uses it.** A developer on a plan that includes Cloud API access (pro, max, max_15x, team, team_premium, enterprise in code: packages/contracts/types/src/billing-catalog.ts:341, 358), on the web app or the CLI.

**Problems it solves**

- Calling the gateway from code without sharing a login.
- Limiting what a leaked key can do and for how long.
- Stopping one integration without touching others.

**Use cases**

- Create a key with only 'Read model catalog' to let a tool list models.
- Create a 30 day key with 'Run inference' for a build job.
- List keys from the terminal with 'agi keys' and revoke one that leaked.

## 2. User experience

**Where to find it**

- Web: card 'API Keys' on /developers (first card, DeveloperConsolePage.tsx:68) and in the Account settings section (AccountSection.tsx mounts ApiKeysManager).
- Desktop: brief marks done; same hosted screens expected [inferred from doc: AGENTS.md section 5]; not opened.
- CLI: 'agi keys' (alias list), 'agi keys list [--json]', 'agi keys revoke <id or name> [-y]', 'agi keys create' (apps/cli/src/lib.rs:1061-1065, 2221-2235, 7687-7740). The brief did not list it; the code has it.
- Mobile, VS Code extension, Chrome extension: none found.

**Before you start**

- Signed in.
- A plan with Cloud API access; otherwise the card shows 'No API keys yet' with the upgrade message and the New Key button is replaced by an upgrade action (ApiKeys.tsx:195-241; server refuses with a 403 and recovery link, api-keys/route.ts:85-92).
- A fresh sign-in check (step-up) at creation (api-keys/route.ts:111-117).

**Screens and controls**

- Button 'New Key' (ApiKeys.tsx:195-207 region) opens the dialog 'Generate New API Key'.
- Fields: 'Key Name' (max 100), 'Scopes' checkboxes 'Read model catalog', 'Run inference', 'Read usage' (api-key-scopes.ts:10-24), 'Project' (choose a live project or default), 'Expires' with choices Never, 30 days, 90 days, 1 year (settings-validation.ts:43-52).
- After creation the dialog becomes 'API Key Generated' with the warning 'Save this key now. You will not be able to see it again!' and button 'Copy to Clipboard' (ApiKeys.tsx:300-318 region).
- Each list row: name, prefix followed by '...', project name or 'Default project', optional usage line, scope labels, 'Created: <date> - Last used: <date> - Expires/Expired: <date>' or 'Never expires' (ApiKeys.tsx:252-276).
- Trash button labelled 'Delete <name>' and confirm 'Delete Key' (ApiKeys.tsx:284, 734).

**Journey**

1. Open API Keys and choose 'New Key'.
2. Enter a name, tick at least one scope, pick an expiry and optionally a project.
3. Confirm the fresh sign-in check when asked (step-up dialog).
4. Copy the full key from the one-time screen and close it; the key is never shown again.
5. Use it as 'Authorization: Bearer <key>' against the gateway.
6. To stop it, choose the trash button on its row and confirm 'Delete Key'; the server marks it revoked.

**What the person sees and gets**

- Toast 'API key copied to clipboard' or 'Could not copy the API key' (ApiKeys.tsx:762-764).
- Toast 'API key deleted' (ApiKeys.tsx:745).
- Inline form error with role alert when creation fails (ApiKeys.tsx:441).
- Gateway responses for keys: 401 invalid_api_key, 403 insufficient_scope, 429 project_spend_limit_reached (auth-gate.ts:240-263, project-spend.ts:78).
- Webhook events api_key.created and api_key.revoked (api-keys/route.ts:147; [keyId]/route.ts:59).

**Settings**

- API_KEY_MAX_LIFETIME_DAYS environment setting (default 365) bounds a chosen expiry (api-key-service.ts:21-37).
- Maximum 20 active keys per account (api-keys/route.ts:26, 105).
- Rate limits api-keys-list, api-keys-create, api-keys-delete (delete 10 per minute, fail closed; rate-limit.ts:696-700).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create: validates name 1-100, at least one unique scope from the three, optional ISO expiry, optional project id (api-keys/route.ts:28-37); refuses without managed_api (85-92); refuses a missing or archived project (96-98); refuses the 21st active key (100-109); requires step-up (111-117); inserts the key in a transaction after admitting the project (api-key-service.ts:126-143).
- Secret format sk_live_<16 hex>_<48 hex>, argon2id hashed; the raw key is returned once in full_key (api-key-service.ts:50-57 region; api-keys/route.ts:156-162).
- List returns active keys only, masked, up to 100 (api-keys/route.ts:52-69).
- Revoke: DELETE /api/settings/api-keys/[keyId] checks ownership, returns 'API key was already revoked' for a revoked key, otherwise sets revoked_at, audits and queues api_key.revoked ([keyId]/route.ts:16-67).
- Verification refuses revoked, expired and archived-project keys (api-key-service.ts:244-262) and updates last_used_at in the background.
- Expiry must be in the future and within the configured maximum (api-key-service.ts:39-47); 'Never' stores no expiry and such a key keeps verifying (test: app/api/settings/api-keys/__tests__/key-expiry.test.ts 'is the default and still verifies...').
- CLI lists and revokes through the same routes (apps/cli/src/cloud/api_keys.rs:5, 27-35, 73); create opens the account settings page in the browser because creation needs the fresh sign-in check (lib.rs:7727-7739).
- A key rotate service exists, used by a support action (apps/web/lib/support/actions/executors/regenerate-api-key.ts:38-40).

**Incomplete**

- Revoking has no step-up check; only creation does (api-keys/[keyId]/route.ts has no requireStepUp; api-keys/route.ts:111). The earlier draft said both did; the code says creation only.
- The button and dialog say 'Delete', the route and brief say revoke; wording differs (ApiKeys.tsx:284, 734).
- No UI to edit a key's name, scopes or project after creation (not found in ApiKeys.tsx).

**Present but disconnected or switched off**

- rotateApiKey is reachable only from a support action, not from the Account settings card or the CLI (searched web app, lib and features; CLI has no rotate subcommand in the KeysSubcommand enum, lib.rs:2221-2235).

**Not available**

- Mobile, VS Code extension and Chrome extension: no key management found.
- CLI cannot create a key inline; it hands off to the browser (lib.rs:7727-7739).

## 4. Required behaviour

**Established requirements**

- A developer can create scoped API keys with expiry, see them masked with last-used time, and revoke them. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.02)
- New keys require one or more of models:read, inference:write, usage:read; the picker submits and shows those grants. (source: doc: docs/decisions/wire-or-cut.md section 'Managed API Key Scopes' (2026-07-30))
- At most 20 active keys per user; the 21st is refused with a validation error. (source: apps/web/app/api/settings/api-keys/route.ts:26, 105-109)
- Expired keys stop working. (source: apps/web/lib/services/api-key-service.ts:244-262)
- An expiry must be in the future and not beyond the configured maximum lifetime. (source: apps/web/lib/services/api-key-service.ts:39-47)
- Revoking an already revoked key returns 'API key was already revoked'. (source: apps/web/app/api/settings/api-keys/[keyId]/route.ts:44-46)
- Creating a key needs a plan with the managed_api capability. (source: apps/web/app/api/settings/api-keys/route.ts:85-92)

**Acceptance criteria**

1. Creating with no scope is refused ('Select at least one scope'); duplicate scopes are refused.
2. The full key appears once; reopening the list shows only the prefix.
3. A key with 'Expires: 30 days' stops verifying after that time; a past expiry is refused at creation.
4. The 21st active key is refused with the 20-key message.
5. On a plan without Cloud API access creation returns 403 and the card shows the upgrade message.
6. Deleting a key makes the next gateway call with it return 401; deleting it again returns 'API key was already revoked'.
7. A key without 'models:read' calling GET /api/llm/v1/models gets 403 insufficient_scope.
8. 'agi keys revoke <name>' asks for confirmation unless -y is given.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because only creation asks for step-up, a stolen session could revoke keys without a fresh check [inferred].
- Expiry 'Never' can exceed the configured maximum lifetime because the bound is applied only when an expiry is given (api-key-service.ts insertApiKey) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the word Delete with Revoke across the card, dialog and CLI.
- [proposed] Offer rotate in the card and the CLI.
- [proposed] Decide whether 'Never' should be allowed given a maximum lifetime setting.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ApiKeysManager / ApiKeysPanel | `apps/web/features/settings/components/Settings/ApiKeys.tsx` | Card, create dialog, one-time secret screen, delete confirm, upgrade state, project and usage labels. |
| screen | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Mounts the API keys manager in Account settings. |
| screen | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Mounts the same manager as the first console card. |
| endpoint | GET/POST /api/settings/api-keys | `apps/web/app/api/settings/api-keys/route.ts` | List and create keys; plan gate, limit, step-up, audit, webhook. |
| endpoint | DELETE /api/settings/api-keys/[keyId] | `apps/web/app/api/settings/api-keys/[keyId]/route.ts` | Revoke one key; audit and webhook. |
| service | ApiKeyService | `apps/web/lib/services/api-key-service.ts` | Generate, hash, insert, revoke, rotate, verify keys; expiry rules. |
| config | API_KEY_SCOPE_VALUES and options | `apps/web/lib/api-key-scopes.ts` | The three scopes, labels, empty-scope default. |
| config | API_KEY_EXPIRY_CHOICES | `apps/web/features/settings/schemas/settings-validation.ts` | Never, 30, 90, 365 days and the form schema. |
| service | requireStepUp | `apps/web/lib/server/step-up-auth.ts` | Fresh sign-in check for action api_credential.reveal. |
| component | step-up fetch and dialog | `apps/web/features/auth/step-up-fetch.ts` | Client side of the step-up prompt used by create. |
| service | entitlement plan gate | `packages/contracts/types/src/billing-catalog.ts` | managed_api capability and the plans that hold it (lines 315, 341-358, 416). |
| table | api_keys | `apps/web/db/neon/0321_developer_projects.sql` | Adds project_id; key rows hold prefix, hash, scopes, expiry, revoked_at (base table in earlier migration 0005 per migration header). |
| command | agi keys | `apps/cli/src/lib.rs` | CLI subcommands list, revoke, create (lines 1061-1065, 2221-2235, 7687-7740). |
| service | CLI api_keys module | `apps/cli/src/cloud/api_keys.rs` | Calls GET and DELETE on /api/settings/api-keys, selects by id or name, renders. |
| service | gateway auth gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Maps key failures to 401 invalid_api_key and 403 insufficient_scope. |
| service | regenerate-api-key support action | `apps/web/lib/support/actions/executors/regenerate-api-key.ts` | Only caller of rotateApiKey. |
| event | api_key.created / api_key.revoked webhooks | `apps/web/lib/services/developer-webhook-service.ts` | Queued after create and revoke. |
| test | api keys route tests | `apps/web/app/api/settings/api-keys/__tests__/route.test.ts` | List, create, expiry, upgrade refusal, ownership. |
| test | key expiry tests | `apps/web/app/api/settings/api-keys/__tests__/key-expiry.test.ts` | verifyKey and expiry bounds. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person fills the dialog; the browser validates with the form schema and starts the step-up prompt if needed. | device | ApiKeys.tsx:874; settings-validation.ts:54 |
| Browser sends POST /api/settings/api-keys with a CSRF token. | device and our servers | api-keys/route.ts:71-75 |
| Server checks plan capability, project, active-key count and step-up, then hashes a new secret and inserts the row. | our servers | api-keys/route.ts:84-129; api-key-service.ts:126-143 |
| Server returns api_key (masked) and full_key once, writes an audit event and queues a webhook. | our servers | api-keys/route.ts:131-162 |
| A later gateway call presents the key; the server looks up by prefix, checks revoked, expiry and project, verifies the hash, then checks scope and spend cap. | our servers | api-key-service.ts:244-262; auth-gate.ts:240-297 |
| CLI 'agi keys' calls the same list and delete routes with the saved sign-in. | device and our servers | apps/cli/src/cloud/api_keys.rs:27-35, 73 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Key row: name, prefix, argon2id hash, scopes, project, expiry, last_used_at, revoked_at | table api_keys | Server only; browser re-queries. | Revoked rows stay with revoked_at set; hidden from the list (api-keys/route.ts:58-66). |
| Full secret | Not stored; shown once in the browser and held in page state until dismissed (ApiKeys.tsx:762 uses lane.secret). | Never. | Lost when the dialog closes. |
| Audit events api_key_created and api_key_revoked | audit store | Server only. | Retention not established (unknown). |

**Models and providers.** Key management calls no model. A key authorizes calls that the gateway routes to models and providers by plan and policy (see SYS-model-catalog-and-routing, SYS-inference-providers).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; keys are scoped to the owner by user_id. |
| Permissions | Only the owner can list or revoke their keys ([keyId]/route.ts:40-42). Workspace roles: none found for personal keys; workspace keys are a separate feature (F105-03). |
| Subscription | Creation needs managed_api: plans pro, max, max_15x, team, team_premium, enterprise (billing-catalog.ts:341, 358). Use of existing keys is also refused by the gateway when the plan or subscription state does not allow it (auth-gate.ts:299-330 region; details unknown). |
| Limits and metering | 20 active keys; list returns up to 100; key usage in credits shown per key on the card from /api/developers/usage; per-key rate limits are in rate-limit.ts (api-keys-* and llm-completion). |
| Feature flags | none found in the code. |
| Model compatibility | A key can call whatever models the account's plan can run; the list is F105-04. |
| Provider restrictions | none found in the code at the key level. |
| Local mode | none found in the code. [inferred] Keys authenticate to our managed Cloud gateway only; Local inference needs no key. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Loading API keys...' spinner. | ApiKeys.tsx:212-217 |
| Empty | 'No API keys yet' and 'Generate your first API key to get started' (or the upgrade message). | ApiKeys.tsx:231-236 |
| Load error | Error text with 'Retry'; New Key disabled. | ApiKeys.tsx:201-224 |
| Plan refusal | Upgrade message replaces the button; server 403 with recovery upgrade link. | ApiKeys.tsx:705; api-keys/route.ts:86-91 |
| Step-up cancelled | A StepUpCancelledError path exists and creation does not proceed. | ApiKeys.tsx:72 |
| Possible lost response | If a write may have reached the server the card says it could not confirm and asks to check state. | ApiKeys.tsx:736-740 (UNCERTAIN path) |
| Copy failure | Toast 'Could not copy the API key'; key stays on screen. | ApiKeys.tsx:762-764 |
| Expired key | Row shows 'Expired: <date>'; gateway refuses it. | ApiKeys.tsx:273-275; api-key-service.ts:244-262 |
| Offline or timeout | not handled in the code beyond the generic error. | ApiKeys.tsx error paths |
| Accessibility | Delete button has aria-label 'Delete <name>'; errors use role alert; status role for notices. | ApiKeys.tsx:284, 441 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/api-keys/__tests__/route.test.ts`: Scoped list, insert, no-expiry, expiry carried, past expiry refused, upgrade refusal, ownership refusal on revoke, revoke.
- `apps/web/app/api/settings/api-keys/__tests__/key-expiry.test.ts`: Expired keys refused by verifyKey, never-expiring default, revoked refused, maximum lifetime and configuration fallback.
- `apps/web/features/settings/components/Settings/ApiKeys.test.tsx`: Card behaviour (by name; contents not read).
- `apps/web/features/settings/components/Settings/ApiKeys.ownership.test.tsx`: Ownership guards (by name; contents not read).
- `apps/web/features/settings/sections/AccountSection.api-keys.test.tsx`: Card inside Account settings (by name; contents not read).
- `apps/web/features/settings/sections/AccountSection.plan-gate.test.tsx`: Plan gate in Account settings (by name; contents not read).
- `apps/cli/src/cloud/api_keys.rs`: Rust unit tests for selecting a key by id or name (tests at lines 106-155).

**Test scenarios**

- **Create and use**
  1. On a Cloud API plan, create a key with 'Read model catalog'.
  2. Copy it.
  3. curl GET /api/llm/v1/models with Authorization Bearer.
  - Expected: 200 list; the same key on chat completions returns 403 insufficient_scope.
- **Expiry**
  1. Create a 30 day key.
  2. Check the row text.
  3. Set the server clock or the row expiry to the past and call the gateway.
  - Expected: Row shows 'Expires: <date>'; later 'Expired'; gateway returns 401.
- **Key cap**
  1. Create 20 keys.
  2. Create one more.
  - Expected: Refusal 'You may not have more than 20 active API keys at once'.
- **Revoke twice**
  1. Revoke a key from the card.
  2. Send DELETE for the same id again.
  - Expected: Second response message 'API key was already revoked'.
- **Free plan**
  1. Sign in on a plan without Cloud API access.
  2. Open the API Keys card.
  - Expected: Upgrade message, no New Key button; POST returns 403 managed_api_plan_required.
- **CLI**
  1. Run 'agi keys', then 'agi keys revoke <name>', then 'agi keys create'.
  - Expected: List table; confirmation then 'Revoked API key ...'; browser opens account settings.

**Where to look when it fails**

- Log line 'API key created' and 'API key revoked' (api-keys/route.ts:131; [keyId]/route.ts:50).
- Error code managed_api_plan_required; gateway codes invalid_api_key, insufficient_scope.
- Table api_keys (revoked_at, expires_at, last_used_at); audit event types api_key_created, api_key_revoked.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **Revoke does not require step-up while creation does.** Affects: Web, Desktop, CLI users' account security.. Evidence: api-keys/route.ts:111-117 vs [keyId]/route.ts:16-67.. Work needed: Decide the rule and add the check or document it.
- **No in-card rotate or edit; rotate is support-only.** Affects: Developers rotating leaked keys.. Evidence: regenerate-api-key.ts:38-40; no UI call found.. Work needed: Add rotate to the card and CLI.
- **Wording Delete versus Revoke.** Affects: Web users.. Evidence: ApiKeys.tsx:284, 734.. Work needed: Pick one word.
- **Never-expiring keys allowed although a maximum lifetime setting exists.** Affects: Security posture.. Evidence: key-expiry.test.ts line 170; api-key-service.ts:25-47.. Work needed: Decide policy.
- **Desktop not opened; mobile and extensions have no key management.** Affects: Desktop verification.. Evidence: Brief says done for desktop only.. Work needed: Verify Desktop; confirm others are out of scope.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- table:api_keys
- SYS-authentication-and-identity
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-security-and-privacy
- F105-01
- F105-04

## Unknown

- Whether the Desktop shows the same Account settings card.
- Retention of audit events.
- Which gateway checks apply to an existing key when the subscription lapses (auth-gate lines after 299 only partly read).
- Whether the Tauri desktop has its own key UI.
