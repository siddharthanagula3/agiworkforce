---
id: "F089-09"
type: "feature"
title: "Service accounts and API keys"
aliases: ["Service-account management (S89.19)", "API-key management (S89.20)", "Personal-access-token management (S89.21, not applicable)", "Service principals", "Workspace API keys", "Admin API keys", "Personal API keys"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.19", "S89.20", "S89.21"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-authentication-and-identity", "surface:web", "mode:cloud", "table:api_keys", "table:organization_service_principals", "file:apps/web/lib/services/api-key-service.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-09 Service accounts and API keys

Two kinds of programmatic credentials. Workspace service principals are non-person identities with capped permissions and keys that an admin issues and can disable. Personal API keys belong to a person, are stored as a hash with a prefix, may expire, and can be revoked. Personal access tokens do not exist.

Area: [89. Account and access components](README.md). Requirement items: [S89.19](../../10-requirements/capabilities/089-account-and-access-components.md#s8919), [S89.20](../../10-requirements/capabilities/089-account-and-access-components.md#s8920), [S89.21](../../10-requirements/capabilities/089-account-and-access-components.md#s8921).

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

**What it does.** Issues, lists, scopes and revokes credentials for automation. A workspace key always belongs to a service principal whose scopes are a ceiling (apps/web/app/api/settings/organization/admin-api-keys/route.ts:203-250). A personal key is created for a user with scopes, optional expiry and optional project (apps/web/app/api/settings/api-keys/route.ts:71-163).

**Why it exists.** Automation must not borrow a person's identity, and a lost key must be stoppable at once (apps/web/lib/server/service-principal.ts:27-31,189-192). The brief requires bounded scopes, hashed expiring keys and revocation (S89.19, S89.20).

**Who uses it.** Workspace admins with 'identity.manage' (workspace keys); any signed-in person on a plan with the managed API capability (personal keys); the support assistant for key regeneration.

**Problems it solves**

- An automation acting for a person: refused by assertInteractiveMemberActor (service-principal.ts:87-95).
- A key with more power than its maker: scopes must be held by the creator (admin-api-keys/route.ts:122-131).
- Key theft: the raw key is shown once and only a hash and prefix are stored (api-key-service.ts:214-228).
- Too many keys: 20 active per person (api-keys/route.ts:26,105-109).

**Use cases**

- An admin creates a workspace key for a nightly compliance export with a narrow scope and 90-day expiry.
- An admin disables a service principal and all its keys stop.
- A developer creates a personal key with the allowed scopes to call the managed API.
- A person regenerates a leaked key; the old key is revoked and a new one issued in one step.

## 2. User experience

**Where to find it**

- Web workspace console: 'New workspace API key', fields 'Key name' and 'Workspace API key expiry', and 'Disable principal' (apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx:57,253-263; WorkspaceServicePrincipals.tsx:157).
- Web personal settings: the 'API keys' control in the Account section (apps/web/features/settings/sections/AccountSection.tsx:458); help link 'Sessions, email and API keys' (AccountSection.tsx:440).
- Other apps: no screen found [inferred from search]. Desktop, mobile, CLI, VS Code and Chrome can use a key as a client but the creation screens are on web.
- Personal access tokens: no screen; the service does not exist (S89.21 'not applicable anywhere').

**Before you start**

- Personal key creation needs a plan with the 'managed_api' capability, otherwise 403 SUBSCRIPTION_REQUIRED with an upgrade link (api-keys/route.ts:84-92).
- Creation needs a step-up check with action 'api_credential.reveal' (api-keys/route.ts:111-117; admin-api-keys/route.ts:133-139).
- Workspace keys need the 'identity.manage' permission (admin-api-keys/route.ts:112-117).

**Screens and controls**

- Error text: 'Could not create this API key. Try again.', 'Could not revoke this API key. Try again.', 'Could not load workspace API keys.' (WorkspaceApiKeys.tsx:165,331,340).
- Personal key list shows name, key_prefix, scopes, project, created, last used, expires (api-keys/route.ts:39-50).
- Workspace key limits: scopes 1 to 16, expiry in days or none (admin-api-keys/route.ts:49).

**Journey**

1. 1. Person opens API keys, enters a name, picks scopes and an optional expiry.
2. 2. The app posts to /api/settings/api-keys with a CSRF token; the server checks the plan, the project, and the 20-key cap.
3. 3. The server asks for step-up verification, then applies the 'api-keys-create' rate limit (api-keys/route.ts:111-120).
4. 4. The server stores the hash and prefix and returns the full key once with status 201.
5. 5. The server records an audit event 'api_key_created' and queues a webhook 'api_key.created' (api-keys/route.ts:133-154).
6. 6. Later: revoke with DELETE /api/settings/api-keys/{keyId}; already revoked returns a 'already revoked' message (api-keys/[keyId]/route.ts:44-66).
7. 7. Workspace path: POST /api/settings/organization/admin-api-keys makes or reuses a service principal and returns the key once; DELETE revokes it; PATCH on service-principals disables a principal.

**What the person sees and gets**

- 201 with api_key (masked) and full_key (once).
- Validation message 'You may not have more than 20 active API keys at once' (api-keys/route.ts:106-108).
- Refusal naming the missing scope: 'This workspace API key is not scoped for X. It carries Y.' (service-principal.ts:105-107).
- Audit events api_key_created, api_key_revoked, admin_api_key_created, admin_api_key_revoked, admin_policy_changed for principal disable.

**Settings**

- Idempotency-Key header on workspace key creation (admin-api-keys/route.ts:119,185-195).
- Principal scope ceiling (max_scopes) and disabled_at (service-principal.ts:41-50).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Service principal helpers: actor prefix 'service_principal:', interactive-actor refusal, scope check naming the missing scope, ceiling check, create, list, read, disable (apps/web/lib/server/service-principal.ts:14-211).
- Workspace key route: list, create (step-up, creator's own permissions bound the scopes, idempotent mint in one transaction), revoke (admin-api-keys/route.ts:104-296).
- Principals route: GET and PATCH only (service-principals/route.ts:88-89).
- Personal key route: list, create with plan gate, step-up, rate limit, 20-key cap, project check, audit and webhook (api-keys/route.ts:52-166).
- Hashing with argon2id and an 8-character-style public prefix pattern 'sk_live_<16 hex>' (api-key-service.ts:9-21,53-60).
- Verification skips revoked, expired or archived-project keys and updates last_used_at (api-key-service.ts:244-293).
- Rotation: transaction, lock the row, refuse if project or metadata changed, revoke old and insert new (api-key-service.ts:145-197).

**Incomplete**

- Personal key rotation has no settings route: the only caller found is the support assistant action (apps/web/lib/support/actions/executors/regenerate-api-key.ts:32-40; registry). The first draft listed rotation under /api/settings/api-keys, which is not what the code shows.
- There is no 'create service principal' route; a principal is created as a side effect of creating a workspace key without a principal id (admin-api-keys/route.ts:229-236).

**Present but disconnected or switched off**

- none found

**Not available**

- Personal access tokens: not available on any app (S89.21).
- Key creation screens on desktop, mobile, CLI, VS Code, Chrome: not found.

## 4. Required behaviour

**Established requirements**

- A service principal cannot perform an action that acts for a person. (source: apps/web/lib/server/service-principal.ts:87-95)
- A service principal may use only the scopes it holds; a call outside them is refused naming the missing scope. (source: apps/web/lib/server/service-principal.ts:97-110)
- Scopes requested for a principal above its ceiling are refused. (source: apps/web/lib/server/service-principal.ts:112-124; admin-api-keys/route.ts:243-250)
- Each person may have at most 20 active keys. (source: apps/web/app/api/settings/api-keys/route.ts:26,105-109)
- Creating a key needs step-up and a rate limit. (source: apps/web/app/api/settings/api-keys/route.ts:111-120)
- Keys are stored as a hash plus a prefix. (source: apps/web/lib/services/api-key-service.ts:214-228)
- A project that does not exist or is archived is refused. (source: apps/web/lib/services/api-key-service.ts:135-140)
- Admins can create service accounts with bounded scopes and credentials; the API-key service issues hashed, expiring, revocable keys; personal access tokens are not applicable. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S89.19, S89.20, S89.21)
- New personal keys require at least one managed API scope. (source: doc: docs/decisions/wire-or-cut.md:76-80)

**Acceptance criteria**

1. Creating a 21st active personal key returns a validation error.
2. Creating a personal key without a recent step-up is refused.
3. The create response includes full_key once, and the list never does.
4. A workspace key request for a scope the admin does not hold returns 403 listing the refused scopes.
5. Using an existing principal with a scope above its ceiling returns 403 naming the principal.
6. A disabled principal cannot receive a new key.
7. Rotating a key whose project was archived is refused and the old key stays active.
8. A key that is revoked or past expiry fails verification.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Disabling a principal stops all its keys because key verification joins the principal [inferred from service-principal.ts:189-192 comment; the verifying query was not opened].
- Local mode needs none of these credentials [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a settings route and button for personal key regeneration so it is not only reachable through the support assistant.
- [proposed] Apply the rate limit before the database count and step-up on personal key creation so refused callers cost less.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | service-principal | `apps/web/lib/server/service-principal.ts` | Principal model, scope checks, create, list, disable |
| service | service-principals/caller | `apps/web/lib/server/service-principals/caller.ts` | Resolves member or service-principal caller; refuses person-only actions |
| service | compliance-caller | `apps/web/lib/server/compliance-caller.ts` | Applies assertServicePrincipalScope on compliance routes |
| service | admin-api-keys | `apps/web/lib/server/admin-api-keys.ts` | Workspace key format 'agiadm_', create, verify, revoke |
| endpoint | /api/settings/organization/admin-api-keys (GET, POST, DELETE) | `apps/web/app/api/settings/organization/admin-api-keys/route.ts` | Workspace key lifecycle |
| endpoint | /api/settings/organization/service-principals (GET, PATCH) | `apps/web/app/api/settings/organization/service-principals/route.ts` | List and disable principals |
| endpoint | /api/settings/api-keys (GET, POST) | `apps/web/app/api/settings/api-keys/route.ts` | Personal key list and create |
| endpoint | /api/settings/api-keys/{keyId} (DELETE) | `apps/web/app/api/settings/api-keys/[keyId]/route.ts` | Revoke a personal key |
| service | ApiKeyService | `apps/web/lib/services/api-key-service.ts` | Create, rotate, revoke, verify, hash with argon2id |
| service | regenerate-api-key executor | `apps/web/lib/support/actions/executors/regenerate-api-key.ts` | Support assistant rotation |
| config | api-key-scopes | `apps/web/lib/api-key-scopes.ts` | API_KEY_SCOPE_VALUES and resolveApiKeyScopes |
| service | step-up-auth | `apps/web/lib/server/step-up-auth.ts` | requireStepUp for 'api_credential.reveal' |
| service | developer-project-service | `apps/web/lib/services/developer-project-service.ts` | Live project check for keys |
| table | api_keys | `apps/web/lib/services/api-key-service.ts` | Personal keys: key_hash, key_prefix, scopes, expires_at, revoked_at, project_id (SQL at lines 215-217,238-241) |
| table | organization_service_principals | `apps/web/lib/server/service-principal.ts` | Principal rows with max_scopes and disabled_at (SQL lines 145-148,203-207) |
| screen | WorkspaceApiKeys | `apps/web/features/workspace-console/components/WorkspaceApiKeys.tsx` | Workspace key screen |
| screen | WorkspaceServicePrincipals | `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx` | Principals screen |
| screen | AccountSection | `apps/web/features/settings/sections/AccountSection.tsx` | Personal API keys entry |
| hook | use-settings-queries | `apps/web/features/settings/hooks/use-settings-queries.ts` | Client calls for personal keys |
| test | api-key-service project tests | `apps/web/lib/services/__tests__/api-key-service.project-lifecycle.test.ts` | Create and rotate with projects |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app posts a create request with CSRF token and chosen scopes. | device and our servers | apps/web/app/api/settings/api-keys/route.ts:71-82 |
| The server checks plan capability, project, and active key count. | our servers | api-keys/route.ts:84-109 |
| The server requires step-up verification, then applies the rate limit. | our servers | api-keys/route.ts:111-120 |
| A new raw key is generated, hashed with argon2id, stored with its prefix; the raw key is returned once. | our servers | api-key-service.ts:53-60,214-234 |
| Audit event and webhook event are queued. | our servers | api-keys/route.ts:133-154 |
| A client later sends the key; the server finds the row by prefix, checks revoked, expiry and project, verifies the hash and updates last_used_at. | our servers | api-key-service.ts:244-293 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Personal key hash, prefix, scopes, expiry, project, last used | table api_keys | No | Revocation sets revoked_at; row kept (api-key-service.ts:238-241). Account erasure handling of api_keys: not traced. |
| Service principal and workspace key records | table organization_service_principals and a workspace key table (name not opened) | No | Disable sets disabled_at; keys revoked with revoked_at |
| Audit events and webhook queue entries | security audit log and webhook queue | Webhooks go to the owner's endpoints | unknown |

**Models and providers.** Keys authorize calls to the managed API. Which models or providers a key may reach is governed by scopes and the plan, not by the key service. No model identifier is stored in the key.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Personal keys: signed-in account. Workspace keys: member of the workspace with 'identity.manage'. |
| Permissions | identity.manage for workspace keys and principal disable; the creator can grant only permissions they hold and not Primary-Owner-only ones (admin-api-keys/route.ts:122-131). |
| Subscription | Personal key creation needs the 'managed_api' plan capability (api-keys/route.ts:84-92). Plan needed for workspace keys: not established. unknown. |
| Limits and metering | 20 active personal keys; rate limits 'api-keys-list', 'api-keys-create', 'settings-org-patch'; key expiry rules in apiKeyExpiryProblem (api-key-service.ts:189,211). Usage metering by key not traced. |
| Feature flags | none found in these routes. |
| Model compatibility | Not model specific. |
| Provider restrictions | none found. |
| Local mode | Local mode does not use these keys; keys are for Cloud API calls. Own-key mode uses the provider's key, which is separate from these credentials [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Over 20 keys | Validation error | api-keys/route.ts:105-109 |
| Plan without managed API | 403 with upgrade recovery | api-keys/route.ts:85-92 |
| Project missing or archived | Validation error 'That project does not exist or is archived.' | api-keys/route.ts:96-98; api-key-service.ts:135-140 |
| Rotation target changed during rotation | Refusal 'changed', old key untouched | api-key-service.ts:162-168,192-194 |
| Revoke an already revoked key | Returns message 'API key was already revoked' | api-keys/[keyId]/route.ts:44-46 |
| Disabled principal | New key refused with a re-enable message | admin-api-keys/route.ts:238-242 |
| Repeated workspace create with the same Idempotency-Key | Replays the first result with header Idempotency-Replayed true | admin-api-keys/route.ts:185-195 |
| Offline, loading, accessibility | not handled in the code at the route level | routes return JSON only |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/settings/api-keys/__tests__/route.test.ts`: Personal key route
- `apps/web/app/api/settings/api-keys/__tests__/key-expiry.test.ts`: Expiry rules
- `apps/web/lib/services/__tests__/api-key-service.project-admission.test.ts`: Project admission on create
- `apps/web/lib/services/__tests__/api-key-service.project-lifecycle.test.ts`: Project lifecycle during rotation
- `apps/web/app/api/settings/organization/admin-api-keys/__tests__/route.test.ts`: Workspace key route
- `apps/web/app/api/settings/organization/service-principals/__tests__/route.test.ts`: Principal list and disable
- `apps/web/lib/support/actions/__tests__/regenerate-api-key.test.ts`: Support rotation
- `apps/web/features/settings/sections/AccountSection.api-keys.test.tsx`: Account UI for keys

**Test scenarios**

- **Key cap**
  1. Create 20 personal keys
  2. Create a 21st
  - Expected: Validation error
- **Step-up required**
  1. Create a key without a recent step-up
  - Expected: Refused, no key stored
- **Ceiling**
  1. Create a principal with scope A
  2. Request a key with scopes A and B for it
  - Expected: 403 naming B
- **Disable**
  1. Disable a principal
  2. Call an endpoint with one of its keys
  - Expected: Call refused [verify in a live run; not recorded in a file]
- **Rotate**
  1. Rotate a key whose project is archived
  - Expected: Refused, old key still active
- **One-time reveal**
  1. Create a key
  2. List keys
  - Expected: Raw key only in the create response

**Where to look when it fails**

- Log lines 'API key created', 'API key revoked', 'Failed to update last_used_at', 'Error verifying API key hash'.
- Audit events api_key_created, api_key_revoked, admin_api_key_created, admin_api_key_revoked.
- Table api_keys columns revoked_at, expires_at.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Personal key rotation is reachable only through the support assistant** Affects: People on web wanting to rotate. Evidence: lib/support/actions/executors/regenerate-api-key.ts; no rotate route in api-keys/. Work needed: Add a settings route or confirm the assistant path is intended.
- **No route that creates a service principal alone** Affects: Admins. Evidence: service-principals/route.ts exports GET and PATCH only. Work needed: Decide whether principal-first creation is needed.
- **Rate limit on personal create runs after database and step-up work** Affects: Server cost and abuse. Evidence: api-keys/route.ts:84-120. Work needed: Move the rate limit earlier or confirm intent.
- **Key creation UI absent on desktop, mobile, CLI, VS Code and Chrome** Affects: Those apps. Evidence: Search found only web screens. Work needed: Confirm web-only is intended.

**Depends on**

- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-authentication-and-identity
- surface:web
- mode:cloud
- table:api_keys
- table:organization_service_principals
- file:apps/web/lib/services/api-key-service.ts

## Unknown

- Table name for workspace admin keys.
- Plan capability required for workspace keys.
- How disabling a principal is enforced at key verification (verify query not opened).
- Whether account erasure removes api_keys rows.
- Whether any scope list for workspace keys is documented to customers.
