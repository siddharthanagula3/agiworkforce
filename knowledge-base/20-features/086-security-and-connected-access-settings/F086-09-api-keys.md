---
id: "F086-09"
type: "feature"
title: "API keys"
aliases: ["API keys", "Developer API keys", "Delete API Key", "Keys", "agi keys", "S86.14", "S86.15", "personal access tokens"]
area: "86 Security and connected-access settings"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "missing", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S86.14", "S86.15"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "mode:cloud", "plan:pro", "plan:max", "plan:team", "plan:enterprise", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-authentication-and-identity", "table:api_keys", "api:GET /api/settings/api-keys", "api:POST /api/settings/api-keys", "api:DELETE /api/settings/api-keys/[keyId]", "F086-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F086-09 API keys

A developer on a paid plan creates a key for AGI's public API, picks what it may do, sees it masked afterwards and revokes it. Web and Desktop create, list and delete; the CLI lists and revokes but sends creation to the browser. Personal access tokens do not exist.

Area: [86. Security and connected-access settings](README.md). Requirement items: [S86.14](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8614), [S86.15](../../10-requirements/capabilities/086-security-and-connected-access-settings.md#s8615).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Creates secret keys that authenticate calls to the public API with limited scopes, lists them with only a prefix, and revokes them (apps/web/app/api/settings/api-keys/route.ts:39-69, 71-163).

**Why it exists.** So outside programs can use the managed API without sharing the person's sign-in, and so access can be cut off at once.

**Who uses it.** Developers and teams on a plan that includes managed API access.

**Problems it solves**

- Sharing a password with a script.
- Leaving an unused key active.
- Limiting a key to read-only or usage-only work.

**Use cases**

- Create 'Production API' with the Run inference scope and an expiry.
- Revoke a key that leaked.
- Find from the CLI which key was last used and revoke it by name.
- See that a Free account is asked to upgrade before creating a key.

## 2. User experience

**Where to find it**

- Web: Settings, Account, row 'API keys' opens the 'API Keys' card, subtitle 'Manage API keys for external integrations' (apps/web/features/settings/sections/AccountSection.tsx:429-460; apps/web/features/settings/components/Settings/ApiKeys.tsx:188-194).
- Desktop: the same hosted web Settings.
- CLI: 'agi keys' (list), 'agi keys revoke <id-or-name> [--yes]', 'agi keys create' (opens browser) (apps/cli/src/lib.rs:1061-1065, 7687-7745).
- Phone, Chrome: nothing found; brief says missing.

**Before you start**

- Signed in.
- A plan with managed API access: pro, max, max_15x, team, team_premium or enterprise; Free and hobby are refused (packages/contracts/types/src/billing-catalog.ts:341, 358; apps/web/app/api/settings/api-keys/route.ts:84-92).
- Creating needs a fresh sign-in check, a step-up for api_credential.reveal (route.ts:111-117).

**Screens and controls**

- 'New Key' button; dialog with 'Key Name' (placeholder 'e.g., Production API'), 'Scopes' checkboxes (Read model catalog, Run inference, Read usage), 'Project', 'Expires' select (ApiKeys.tsx:325-440; apps/web/lib/api-key-scopes.ts:10-25).
- 'Copy to Clipboard' button on the one-time secret screen (ApiKeys.tsx:316-318).
- Row delete icon labelled 'Delete <name>' opening 'Delete API Key' with button 'Delete Key' (ApiKeys.tsx:284, 727-745).

**Journey**

1. Open Settings, Account, API keys.
2. Press New Key, type a name, tick scopes, pick expiry, create.
3. Pass the fresh sign-in check if asked.
4. Copy the full key shown once.
5. Later press Delete on a row, read the consequence, confirm.
6. From a terminal run agi keys to list and agi keys revoke to remove.

**What the person sees and gets**

- Toast 'API key copied to clipboard' / 'Could not copy the API key' (ApiKeys.tsx:762-764).
- Toast 'API key deleted' (ApiKeys.tsx:745-746).
- Empty state 'No API keys yet' and 'Generate your first API key to get started' or an upgrade message (ApiKeys.tsx:231-234).
- Expiry line 'Never expires', 'Expires: <date>' or 'Expired: <date>' (ApiKeys.tsx:273-275).
- CLI prints 'Revoked API key <name> (<id>, <prefix>…).' (apps/cli/src/lib.rs:7722-7723).
- Recovery text when a save cannot be confirmed: 'Refresh API keys before repeating it. A generated secret cannot be recovered.' (ApiKeys.tsx:502).

**Settings**

- Scopes: models:read, inference:write, usage:read (api-key-scopes.ts:1).
- Optional expiry and optional developer project (route.ts:35-36).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Create validates name, unique scopes, optional expiry and project, refuses non-entitled plans, caps at 20 active keys, requires step-up, stores a hash, returns the raw key once (route.ts:26-37, 84-163).
- List returns masked rows (prefix, scopes, last used, expiry), up to 100 non-revoked (route.ts:39-69).
- Revoke is soft (sets revoked_at), owner-checked, idempotent, audited and webhook-queued (apps/web/app/api/settings/api-keys/[keyId]/route.ts:30-66; apps/web/lib/services/api-key-service.ts:237-242).
- Verification refuses revoked or expired keys and keys whose project is archived (api-key-service.ts:244-275).
- CLI list, select by id or exact name with a refusal that lists ids when a name is shared, revoke with confirmation (apps/cli/src/cloud/api_keys.rs:35-76; apps/cli/src/lib.rs:7705-7727).
- UI confirms deletion with the consequence named (ApiKeys.tsx:730-735).

**Incomplete**

- Creating or revoking a key raises no security notice or email: api_key_created and api_key_revoked are catalogued but unraised (apps/web/lib/server/__tests__/security-event-coverage.test.ts:56-66).
- The web UI says 'Delete' while the API and CLI say 'revoke'; the effect is revocation (soft delete).
- CLI 'keys create' only opens the web settings page (apps/cli/src/lib.rs:7731-7742).

**Present but disconnected or switched off**

- ApiKeyService.rotateApiKey exists but no route or screen calling it was found in apps/web app or features (apps/web/lib/services/api-key-service.ts:145).

**Not available**

- Phone and Chrome: no key management (brief S86.14).
- VS Code: n/a.
- Personal access tokens: not applicable anywhere (brief S86.15); no code found.

## 4. Required behaviour

**Established requirements**

- The user can create, see (masked) and revoke their API keys. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S86.14)
- Personal access tokens distinct from API keys: not applicable anywhere. (source: S86.15 (same brief))
- Revoke checks the key belongs to the caller; another person's key returns forbidden. (source: apps/web/app/api/settings/api-keys/[keyId]/route.ts:40-42)
- Revoking an already revoked key returns a success message without a change. (source: apps/web/app/api/settings/api-keys/[keyId]/route.ts:44-46)
- Revoke writes an audit record and queues a developer webhook event. (source: apps/web/app/api/settings/api-keys/[keyId]/route.ts:50-64)
- Creation is limited to plans with managed API access and needs step-up. (source: apps/web/app/api/settings/api-keys/route.ts:84-92, 111-117)
- An irreversible user action asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. A Pro account creates a key with at least one scope and sees the full key exactly once.
2. Listing never returns the full key or hash, only the prefix.
3. A Free account creating a key gets a 403 with code managed_api_plan_required and an upgrade link.
4. The 21st active key is refused.
5. Revoking another user's key returns 403; a missing key returns 404; a second revoke of the same key returns 'API key was already revoked'.
6. A revoked or expired key is refused on the public API.
7. The CLI refuses an ambiguous name and lists the ids.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] No step-up on revoke is acceptable because revoking only reduces access; the route read does not require one.
- [inferred] Because verification matches on key_prefix then a hash check (api-key-service.ts:254-275), the prefix must be unique enough to avoid the LIMIT 2 ambiguity.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Raise api_key_created and api_key_revoked notices through F086-07.
- [proposed] Use one word (revoke) across web, CLI and API.
- [proposed] Wire or remove rotateApiKey.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/settings/api-keys | `apps/web/app/api/settings/api-keys/route.ts` | List and create. |
| endpoint | DELETE /api/settings/api-keys/[keyId] | `apps/web/app/api/settings/api-keys/[keyId]/route.ts` | Revoke. |
| service | ApiKeyService | `apps/web/lib/services/api-key-service.ts` | Create, revoke, verify, rotate (unused). |
| config | api-key-scopes | `apps/web/lib/api-key-scopes.ts` | Scope values and labels. |
| component | ApiKeysManager | `apps/web/features/settings/components/Settings/ApiKeys.tsx` | Keys card, dialog, delete confirmation. |
| component | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Hosts the API keys row. |
| service | step-up auth | `apps/web/lib/server/step-up-auth.ts` | requireStepUp for api_credential.reveal. |
| service | api-auth verifyApiKey | `apps/web/lib/api-auth.ts` | Authenticates bearer keys and checks scope per endpoint (lines 414-460). |
| config | billing capability managed_api | `packages/contracts/types/src/billing-catalog.ts` | Plans allowed to create keys. |
| service | entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | resolveEntitledPlanTier. |
| table | api_keys | `apps/web/lib/services/api-key-service.ts` | Hash, prefix, scopes, project, expiry, revoked_at, last_used_at. |
| service | developer webhook queue | `apps/web/lib/services/developer-webhook-service.ts` | api_key.created and api_key.revoked events. |
| service | security audit | `apps/web/lib/security-audit.ts` | api_key_created and api_key_revoked audit types. |
| service | cli api_keys | `apps/cli/src/cloud/api_keys.rs` | List, select, describe, revoke. |
| command | agi keys | `apps/cli/src/lib.rs` | Keys command (lines 1061-1065, 7687-7745). |
| test | api-keys route tests | `apps/web/app/api/settings/api-keys/__tests__/route.test.ts` | Create, list, revoke, plan refusal. |
| test | step-up coverage | `apps/web/lib/server/__tests__/step-up-action-coverage.test.ts` | api_credential.reveal only at creation. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person fills the New Key dialog and submits; the browser sends POST /api/settings/api-keys with CSRF. | device | ApiKeys.tsx:325-440; route.ts:72-73 |
| The server validates, resolves the entitled plan tier, checks project and the 20-key cap. | our servers | route.ts:77-109 |
| A step-up check requires recent sign-in proof, then rate limit api-keys-create applies. | our servers | route.ts:111-120 |
| A key is generated; only its hash and prefix are stored; the raw key is returned once with HTTP 201. | our servers | api-key-service.ts:199-235; route.ts:122-162 |
| Audit event and developer webhook event are written. | our servers | route.ts:133-154 |
| Revoke: DELETE with CSRF and rate limit api-keys-delete; owner check; revoked_at set. | our servers | [keyId]/route.ts:17-48 |
| A caller of the public API sends the key; the server checks format, hash, expiry, revocation and scope. | our servers | api-auth.ts:414-460; api-key-service.ts:244-275 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| API key record (hash, prefix, name, scopes, project_id, expires_at, last_used_at, revoked_at) | table api_keys | Account-wide; every surface reads the same list | Revoked rows are kept with revoked_at; removal policy unknown |
| Raw secret | Shown once in the browser; never stored on the server | No | Cannot be recovered (ApiKeys.tsx:502) |
| Audit and webhook events | audit log; developer webhook queue | Server | unknown |

**Models and providers.** Keys authorise public API calls. The inference:write scope allows chat completions and audio transcriptions (api-key-scopes.ts:19-21). Which model or provider answers is decided by the routing in SYS-model-catalog-and-routing, not by the key; the key code names no model or provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required; CLI needs sign-in through CloudClient::connect (apps/cli/src/lib.rs:7688). |
| Permissions | Owner-only; row-level scoped database connection (route.ts:56, 75; [keyId]/route.ts:23). Workspace-organization id is passed to step-up. |
| Subscription | Creation needs the managed_api capability, available to the pro, max, max_15x, team, team_premium and enterprise tiers (billing-catalog.ts:341, 358). Free is refused with SUBSCRIPTION_REQUIRED and an upgrade link (route.ts:84-92). Listing and revoking have no plan check in the routes read. |
| Limits and metering | At most 20 active keys per user (route.ts:26); list shows up to 100; rate limits api-keys-list, api-keys-create, api-keys-delete. Usage made with a key is metered by the managed usage system; not opened here. |
| Feature flags | none found in the code |
| Model compatibility | Not applicable to key management. |
| Provider restrictions | none found in the key code. |
| Local mode | Not applicable: keys belong to the Cloud account and call our managed API. A person using only Local inference needs no key. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| loading | 'Loading API keys...' with a spinner. | ApiKeys.tsx:211-215 |
| load error | Alert text with a Retry button. | ApiKeys.tsx:216-228 |
| empty | 'No API keys yet' or an upgrade message. | ApiKeys.tsx:231-241 |
| plan refused | 403 SUBSCRIPTION_REQUIRED, code managed_api_plan_required. | route.ts:85-91 |
| key limit reached | Validation error naming the maximum. | route.ts:105-109 |
| step-up needed | Request is refused until fresh sign-in proof; CLI sends the person to the web page. | route.ts:111-117; apps/cli/src/lib.rs:7731-7742 |
| unconfirmed outcome | Message says refresh before repeating; the secret cannot be recovered. | ApiKeys.tsx:502 |
| workspace changed | 'Reload this page to confirm the current workspace before managing API keys.' | ApiKeys.tsx:903 |
| already revoked | Success message, no change. | [keyId]/route.ts:44-46 |
| cancel | Cancelling the delete dialog leaves the key active. | ApiKeys.tsx:735-737; CLI lib.rs:7716-7719 |
| offline, timeout | not handled in the code beyond generic error toasts | looked in ApiKeys.tsx and the two routes; no offline or timeout branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/api-keys/__tests__/route.test.ts`: Create, list scoping, expiry, plan refusal, owner-only revoke.
- `apps/web/app/api/settings/api-keys/__tests__/key-expiry.test.ts`: Expiry validation.
- `apps/web/features/settings/components/Settings/ApiKeys.test.tsx`: Keys card behaviour.
- `apps/web/features/settings/components/Settings/ApiKeys.ownership.test.tsx`: Workspace ownership of key actions.
- `apps/web/lib/server/__tests__/step-up-action-coverage.test.ts`: api_credential.reveal is used only at creation.
- `packages/contracts/types/src/__tests__/billing-catalog.test.ts`: managed_api by plan tier.
- `apps/cli/src/cloud/api_keys.rs`: Rust tests: exact id wins, unique name selects, shared name refused with ids.

**Test scenarios**

- **Create on Pro**
  1. Sign in on a Pro account.
  2. Create 'Production API' with Run inference.
  3. Copy the key; reload.
  - Expected: Key shown once; afterwards only the prefix.
- **Free refusal**
  1. Sign in on a Free account.
  2. Open API keys.
  - Expected: Upgrade message instead of New Key; direct POST returns 403.
- **Revoke**
  1. Delete a key in the UI.
  2. Call a public endpoint with it.
  - Expected: Request refused; row gone from the list.
- **Cross-user revoke**
  1. As user B call DELETE for user A's key id.
  - Expected: 403 'You do not own this API key'.
- **CLI ambiguity**
  1. Create two keys with the same name.
  2. Run agi keys revoke <name>.
  - Expected: Refused; both ids listed.
- **Step-up**
  1. Wait until the sign-in proof is stale.
  2. Create a key.
  - Expected: Step-up prompt before creation.

**Where to look when it fails**

- Log 'API key created' and 'API key revoked'.
- Audit events api_key_created and api_key_revoked.
- Log 'Failed to update last_used_at'.
- Table api_keys: revoked_at, expires_at, last_used_at.
- Failed bearer attempts logged as invalid_api_key (api-auth.ts:459).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/086-security-and-connected-access-settings.md](../../70-qa/test-plans/web/086-security-and-connected-access-settings.md)
- Desktop: [70-qa/test-plans/desktop/086-security-and-connected-access-settings.md](../../70-qa/test-plans/desktop/086-security-and-connected-access-settings.md)
- CLI: [70-qa/test-plans/cli/086-security-and-connected-access-settings.md](../../70-qa/test-plans/cli/086-security-and-connected-access-settings.md)

## 10. Gaps and dependencies

- **No security notice or email when a key is created or revoked.** Affects: Web, Desktop, CLI users.. Evidence: apps/web/lib/server/__tests__/security-event-coverage.test.ts:56-66. Work needed: Call emitIdentitySecurityEvent from both routes.
- **Key rotation exists in the service but nothing reaches it.** Affects: Developers wanting rotation.. Evidence: apps/web/lib/services/api-key-service.ts:145. Work needed: Add a route and a control, or remove the code (AGENTS.md section 9).
- **Wording differs: web 'Delete', API and CLI 'revoke'.** Affects: All users of this feature.. Evidence: ApiKeys.tsx:730-746; [keyId]/route.ts:66. Work needed: Pick one term.
- **No API key view on phone or Chrome.** Affects: Phone and Chrome users.. Evidence: brief S86.14. Work needed: Decide whether needed; a developer feature may stay web and CLI only.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- mode:cloud
- plan:pro
- plan:max
- plan:team
- plan:enterprise
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-authentication-and-identity
- table:api_keys
- api:GET /api/settings/api-keys
- api:POST /api/settings/api-keys
- api:DELETE /api/settings/api-keys/[keyId]
- F086-07

## Unknown

- Whether Desktop Electron differs from hosted web for keys.
- How long revoked rows are kept.
- How usage by key is metered and shown (keyUsageLabel exists in ApiKeys.tsx:77 but its source was not opened).
- Current display names of paid plans versus the tier identifiers used in code.
- Which endpoints accept each scope.
