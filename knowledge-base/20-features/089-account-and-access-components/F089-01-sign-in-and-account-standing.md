---
id: "F089-01"
type: "feature"
title: "Sign-in and account standing"
aliases: ["Account service", "Account status gate", "Account lifecycle check", "Identity-to-account resolution", "Authentication-provider adapter (S89.01, S89.02)", "ACCOUNT_UNAVAILABLE denial"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.01", "S89.02"]
depends_on: ["SYS-authentication-and-identity", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "table:identities", "table:profiles", "table:erasure_tombstones", "file:apps/web/lib/api-auth.ts", "file:apps/web/lib/server/identity-account.ts", "file:apps/web/lib/auth/account-status.ts"]
basis: "code inspection"
second_reader: "7 of 12 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-01 Sign-in and account standing

On authenticated web API requests, the server turns the verified sign-in subject into one AGI account id and then refuses the request if the account is locked, in recovery, suspended, banned, or deleted. A scheduled deletion is still allowed so the person can cancel it. Clerk is the only identity provider the code can select. The status gate is reached through assertAccountActive; the device refresh route applies the same decision separately.

Area: [89. Account and access components](README.md). Requirement items: [S89.01](../../10-requirements/capabilities/089-account-and-access-components.md#s8901), [S89.02](../../10-requirements/capabilities/089-account-and-access-components.md#s8902).

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

**What it does.** Maps a provider sign-in (a subject string) to one AGI account id, reads the account's standing, and either lets the request through or answers 403 with a reason and a recovery path. The provider sits behind one interface so the rest of the web app never talks to Clerk directly (apps/web/lib/server/identity.ts:1-53).

**Why it exists.** The account must outlive the sign-in method, and a closed account must stop working everywhere at once. One check at the API layer covers Web, Desktop, Mobile, CLI and both extensions because they all call the same API [inferred from the shared API layer]; account standing is enforced on several separate paths, so each auth path needs tracing before claiming full coverage (apps/web/lib/api-auth.ts:115-120,196-216,244-282; apps/web/app/api/auth/device/refresh/route.ts:181-188).

**Who uses it.** Every signed-in person, indirectly. Support and security staff rely on it to make lock, suspend and delete real.

**Problems it solves**

- A suspended or erased person cannot keep using a stale session or a stale provider callback (apps/web/lib/server/identity-account.ts:179-212).
- A locked person gets a path to fix it (password reset) and a suspended person gets an appeal path, instead of a bare error (apps/web/lib/auth/account-status.ts:72-100).
- Swapping the identity provider needs one adapter and an environment change, not edits at each call site (apps/web/lib/server/identity.ts comment on getIdentityProvider; packages/platform/identity/src/factory.ts:36-53).

**Use cases**

- A suspended person opens the web app and sees a suspension notice with an Appeal link instead of their chats.
- A person whose account was erased tries to sign in again through a leftover provider session and is turned away.
- A person with a scheduled deletion signs in and can still open Settings to cancel the deletion.
- An operator replaces the identity provider by adding an adapter in the factory switch.

## 2. User experience

**Where to find it**

- No control. It runs on the server for authenticated API requests through assertAccountActive, which is also called on the cookie path (apps/web/lib/api-auth.ts:115-120,196-216,244-282). The device refresh route applies the same decision separately (apps/web/app/api/auth/device/refresh/route.ts:181-188). Not every auth path has been traced.
- The denial notice titles come from ACCOUNT_DENIAL_NOTICE: 'This account is locked' (action 'Reset your password'), 'Finish recovering this account' ('Continue recovery'), 'This account is suspended' ('Appeal this suspension'), 'This account has been deleted' ('Back to sign-in') (apps/web/lib/auth/account-status.ts:32-37).
- Recovery pages named in code: /auth/reset-password and /appeal (apps/web/lib/auth/account-status.ts:27-28).

**Before you start**

- A verified sign-in through the hosted identity provider (the only selectable provider is 'clerk') (packages/platform/identity/src/types.ts:1).
- An account profile row; an identity row is linked on first sign-in if the account exists (apps/web/lib/server/identity-account.ts:158-168).

**Screens and controls**

- No screen owns this feature. Clients show the 403 body: message, reason, recoveryPath (apps/web/lib/api-auth.ts:111-117).
- On a device sign-in refresh the denial is returned as error 'account_unavailable' with an optional recovery_url (apps/web/app/api/auth/device/refresh/route.ts, account_unavailable branch).

**Journey**

1. The person acts in any app; the app sends a request with a session cookie or bearer token.
2. The server verifies the token with the identity provider and resolves the subject to an account id.
3. The server reads the account status (cache first, database second).
4. If the status is locked, recovery_pending, suspended, banned or deleted the server answers 403 ACCOUNT_UNAVAILABLE with the reason and recovery path.
5. Otherwise the request proceeds; a scheduled deletion does not block it.

**What the person sees and gets**

- 403 with code ACCOUNT_UNAVAILABLE, reason one of locked, recovery, suspended, deleted, and recoveryPath (apps/web/lib/api-auth.ts:111-117).
- 503 'Unable to verify account status. Please try again shortly.' when the lookup fails twice (apps/web/lib/api-auth.ts:279-282).
- Locked message names /auth/reset-password; suspended message cites section 11 of the Terms and says a person reviews every appeal (apps/web/lib/auth/account-status.ts:75-95).

**Settings**

- AGI_IDENTITY_PROVIDER selects the provider; unset means clerk; any other value throws a config error (packages/platform/identity/src/factory.ts:11-34).
- ACCOUNT_STATUS_FAIL_OPEN (1, true or on) allows requests when the status lookup fails; default is fail closed (apps/web/lib/api-auth.ts:269-278).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Subject-to-account resolution with a 5 minute key-value cache, database fallback, and an 'erased' outcome distinct from 'unknown' (apps/web/lib/server/identity-account.ts:179-212; apps/web/lib/server/request-context-cache.ts:10).
- Seven stored statuses; deletion_scheduled and deleted are derived from a deletion date and an erasure tombstone, and erasure outranks everything (apps/web/lib/auth/account-status.ts:1-9, 61-66; apps/web/lib/auth/account-lifecycle.ts:12-34).
- Denial decisions for locked, recovery_pending, suspended, banned (reported as 'suspended'), deleted (apps/web/lib/auth/account-status.ts:72-100).
- Status lookup is cached, tried at most twice (one retry), each try bounded to 2000 ms, and fails closed with 503 unless ACCOUNT_STATUS_FAIL_OPEN is set (apps/web/lib/api-auth.ts:109,120,250-266,279-282).
- The account-status cache lives 5 minutes (same constant as the identity cache) and is cleared by invalidateAccountStatusCache(userId); a lock or suspension written without that call takes up to 5 minutes to take effect (apps/web/lib/server/request-context-cache.ts:10,64-86).
- An erased subject is logged as an auth failure 'erased_account' and refused (apps/web/lib/api-auth.ts:293-303).
- An unattended-run query refuses owners whose status is a denying one, derived from the same vocabulary (apps/web/lib/auth/account-lifecycle.ts:46-52).

**Incomplete**

- The brief says adapters cover password, social, passkey and SSO (brief S89.02). The code has one adapter only, Clerk (packages/platform/identity/src/factory.ts:47-52; packages/platform/identity/src/types.ts:1). SSO connection code at apps/web/lib/server/sso/clerk-enterprise-connections.ts was not opened [unknown how it ties to the adapter].
- Sign-in-completion check (accountAccessForSignIn) allows the request on any lookup error, by design, leaving the route gate as the fail-closed layer (apps/web/lib/auth/account-lifecycle.ts:38-46).
- The workspace lockdown gate in assertAccountActive fails open: a failed or slow workspace lookup is logged as 'not locked' and the request continues, while the bindOrganizationScope path (mfaGateExemptForOwner) fails closed with 503 (apps/web/lib/api-auth.ts:196-208, 215-242).
- Account standing is enforced on several separate paths: assertAccountActive on the cookie path, and the device-token refresh route, which applies its own accountAccessDecision on owner_account_status and returns 403 account_unavailable (apps/web/app/api/auth/device/refresh/route.ts:181-188,281-295). Coverage of every bearer-token or other authenticated route was not traced.

**Present but disconnected or switched off**

- ACCOUNT_STATUS_FAIL_OPEN turns fail-closed into fail-open when set (apps/web/lib/api-auth.ts:269-278). Its production value is unknown.

**Not available**

- A second identity provider: not available in the code (packages/platform/identity/src/types.ts:1).
- Per-app behaviour: none recorded; the brief marks every app n/a (brief S89.01).

## 4. Required behaviour

**Established requirements**

- A server-side account service maps every authenticated identity to one AGI account record and enforces account state (active, locked, pending deletion) on each request. (source: brief S89.01)
- Authentication is delegated to identity-provider adapters (password, social, passkey, SSO) behind one server interface that verifies sessions and fetches users. (source: brief S89.02)
- Security behaviour fails closed. (source: doc: AGENTS.md section 6)
- A lockout is self-service and a suspension is not; they must not share a message; a scheduled deletion stays allowed. (source: apps/web/lib/auth/account-status.ts:68-71)

**Acceptance criteria**

1. A locked account gets 403 reason 'locked' with recoveryPath '/auth/reset-password' on any authenticated API route.
2. A suspended or banned account gets 403 reason 'suspended' with recoveryPath '/appeal'.
3. A deleted or erased account gets reason 'deleted' with recoveryPath null.
4. An account with a deletion date but status active is allowed.
5. When the status lookup fails twice, the request gets 503 unless ACCOUNT_STATUS_FAIL_OPEN is set.
6. After erasure, a stale provider session for the old subject is refused and logged as 'erased_account'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because every client calls the same web API, one check protects all six apps [inferred]; Local-mode work that never calls the API is not covered by it [inferred]. Coverage of each auth path (cookie, bearer, device token) has not been traced.
- A cached 'allowed' answer can outlive a new lock for the 5 minute cache window unless invalidateAccountStatusCache(userId) is called (apps/web/lib/server/request-context-cache.ts:10,64-86).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a second adapter behind the factory, or reword brief S89.02 to say Clerk is the single provider, so the brief and code agree.
- [proposed] Record which clients render the denial notice titles, per app, so the notice is checked on all six.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | resolveAuthenticatedAccount | `apps/web/lib/server/identity-account.ts` | Maps provider subject to account id; cache, database, link, erased outcome (lines 179-212). |
| service | invalidateIdentityAccountCache | `apps/web/lib/server/identity-account.ts` | Erasure calls it so a stale callback stops authenticating. |
| service | assertAccountLifecycleActive and withDeadline | `apps/web/lib/api-auth.ts` | Per-request status gate: cache, two attempts, 2000 ms deadline, fail closed (lines 244-282). |
| service | bindOrganizationScope | `apps/web/lib/api-auth.ts` | Binds workspace id with the same deadline; a failed or slow lookup throws 503 (lines 215-242). |
| service | accountForSubject | `apps/web/lib/api-auth.ts` | Turns an 'erased' resolution into an audit failure and a refusal (lines 293-303). |
| service | accountAccessDecision and effectiveAccountStatus | `apps/web/lib/auth/account-status.ts` | Status vocabulary, denial reasons, messages, recovery paths. |
| service | readAccountStatus and accountAccessForSignIn | `apps/web/lib/auth/account-lifecycle.ts` | Reads profiles.account_status, deletion date and tombstone; sign-in-completion variant fails open. |
| service | getIdentityProvider | `apps/web/lib/server/identity.ts` | Single place the web app obtains the identity provider port. |
| service | resolveIdentityProvider | `packages/platform/identity/src/factory.ts` | Chooses provider from AGI_IDENTITY_PROVIDER; only clerk exists. |
| service | ClerkIdentityProvider | `packages/platform/identity/src/adapters/clerk.ts` | The one adapter that implements the identity port. |
| service | request-context-cache | `apps/web/lib/server/request-context-cache.ts` | Cache TTL constant (5 minutes) and status cache helpers: getCachedAccountStatus, setCachedAccountStatus and invalidateAccountStatusCache(userId) (lines 10, 64-86). |
| table | public.identities | `apps/web/lib/server/identity-account.ts` | provider, subject, user_id, last_authenticated_at rows linking a subject to an account. |
| table | public.profiles | `apps/web/lib/auth/account-lifecycle.ts` | account_status and deletion_scheduled_for columns. |
| table | public.erasure_tombstones | `apps/web/lib/auth/account-lifecycle.ts` | Only record that an erased account existed. |
| component | ACCOUNT_DENIAL_NOTICE | `apps/web/lib/auth/account-status.ts` | Heading and button text for each denial. |
| event | identity_linked audit event | `apps/web/lib/server/identity-account.ts` | Written when a new identity row is linked at sign-in. |
| test | account-status tests | `apps/web/lib/auth/account-status.test.ts` | Covers the decision function. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A client sends a cookie or bearer token; the server verifies it with the identity provider. | our servers | apps/web/lib/server/identity.ts:35-43 |
| The subject is resolved to an account id: cache read, else a database join of identities and erasure_tombstones; an unmapped subject resolves only where the subject is the stored user id. | our servers | apps/web/lib/server/identity-account.ts:179-212 |
| If the identity row is missing but the account exists it is linked and an identity_linked audit event is written; otherwise last_authenticated_at is touched. | our servers | apps/web/lib/server/identity-account.ts:158-168, 203-206 |
| The account status is read from cache or from profiles plus tombstone, bounded to 2000 ms and retried once (two attempts in total). | our servers | apps/web/lib/api-auth.ts:244-266; apps/web/lib/auth/account-lifecycle.ts:12-34 |
| A denying status throws a 403 ACCOUNT_UNAVAILABLE error with reason and recovery path. | our servers | apps/web/lib/api-auth.ts:111-117 |
| The client shows the notice and the recovery link. | device | apps/web/lib/auth/account-status.ts:32-37 (copy); which client renders it per app is unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Identity link (provider, subject, account id, last authenticated time) | table public.identities (Neon Postgres) | Server only | Erasure removes the profile; the tombstone remains (apps/web/lib/auth/account-lifecycle.ts:12-14). |
| Account status and scheduled deletion date | table public.profiles | Server only; every app sees it through the API refusal | Deleted with the profile on erasure; tombstone in public.erasure_tombstones. |
| Cached identity resolution and cached status | key-value store keyed req-ctx:v1:identity:<provider>:<subject> | Shared across server instances | 5 minute TTL for both the identity cache and the account-status cache; identity cache invalidated on erasure (apps/web/lib/server/identity-account.ts:104-118); status cache cleared by invalidateAccountStatusCache(userId) (apps/web/lib/server/request-context-cache.ts:10,64-86). |

**Models and providers.** No AI model or inference provider takes part. The identity provider (Clerk) takes part as an outside service for token verification and user lookup (packages/platform/identity/src/adapters/clerk.ts).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | A signed-in AGI account is required; the feature is what decides whether the account may proceed. |
| Permissions | None found in the code; it applies to every account regardless of workspace role. |
| Subscription | none found in the code |
| Limits and metering | None for plans. Operational limits only: 2 attempts, 2000 ms per attempt (apps/web/lib/api-auth.ts:109-120). |
| Feature flags | ACCOUNT_STATUS_FAIL_OPEN and AGI_IDENTITY_PROVIDER (names and purposes only). |
| Model compatibility | Not model-dependent. |
| Provider restrictions | Identity provider fixed to clerk in code. No AI provider involved. |
| Local mode | Local mode (on-device inference) does not call this server code [inferred]. Whether Local mode needs a sign-in on each app is unknown here; this feature only decides standing for requests that reach our servers. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Not handled in the code for a visible spinner; the check is server side and adds up to 2 s per attempt. | apps/web/lib/api-auth.ts:109-120 |
| Timeout | A lookup over 2000 ms counts as a failed attempt; after 2 attempts the request gets 503 (fail closed). | apps/web/lib/api-auth.ts:252-282 |
| Workspace binding timeout | The workspace lookup that binds the request throws 503 'Unable to verify workspace scope'. | apps/web/lib/api-auth.ts:225-241 |
| Workspace lockdown lookup failure | The workspace lockdown gate in assertAccountActive fails open: a failed or slow workspace lookup is logged as 'not locked' and the request continues. | apps/web/lib/api-auth.ts:196-208 |
| Erased account | Refused as erased, with an audit failure 'erased_account'. | apps/web/lib/api-auth.ts:293-303 |
| Scheduled deletion | Allowed so the person can cancel while signed in. | apps/web/lib/auth/account-status.ts:68-71 |
| Banned | Shown as 'suspended' (same message and appeal path). | apps/web/lib/auth/account-status.ts:85-95 |
| Cache failure | A failed cache read or write is logged at debug level and the database is used. | apps/web/lib/server/identity-account.ts:80-100 |
| Lock or suspension while a cached status exists | The cached status lives 5 minutes; a lock or suspension written without calling invalidateAccountStatusCache(userId) takes up to 5 minutes to take effect. | apps/web/lib/server/request-context-cache.ts:10,64-86 |
| Second subject for the same account | The link write violates the (provider, user_id) uniqueness (migration 0174); linkIdentity catches it, logs 'Identity mapping could not be linked' at error level and returns null, the request continues with identityId null, and that null identity is cached for 5 minutes. The INSERT's ON CONFLICT (provider, subject) DO NOTHING covers only the same subject. | apps/web/lib/server/identity-account.ts:53-58,140-157,203-210 |
| Offline / reconnect / accessibility | Not handled in the code in these files; client rendering is unverified. | not found in files read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/auth/account-status.test.ts`: Account access decisions and the status vocabulary.
- `apps/web/lib/server/identity-account.test.ts`: Subject-to-account resolution.
- `apps/web/lib/auth/__tests__/account-lifecycle.single-source.test.ts`: Single source of the lifecycle vocabulary.
- `apps/web/lib/auth/__tests__/account-status.schema.test.ts`: Status values against the schema.
- `apps/web/lib/auth/__tests__/identity-objects.schema.test.ts`: Identity table shape.
- `apps/web/lib/server/unreadable-identity.test.ts`: Behaviour when identity data is unreadable.
- `apps/web/app/admin/__tests__/layout.account-status.test.tsx`: Admin layout refusing by account status.
- `apps/web/db/neon/identity-account-lifecycle-migration.test.ts`: Lifecycle migration.

**Test scenarios**

- **Suspended account refused**
  1. Set a test account's status to suspended in a test database
  2. Call GET /api/me with its token
  - Expected: 403 ACCOUNT_UNAVAILABLE, reason suspended, recoveryPath /appeal.
- **Locked account recovery path**
  1. Set status locked
  2. Call any authenticated route
  - Expected: 403 reason locked, recoveryPath /auth/reset-password.
- **Scheduled deletion still allowed**
  1. Set deletion_scheduled_for on an active account
  2. Call an authenticated settings route
  - Expected: Request succeeds.
- **Slow lookup fails closed**
  1. Make the status read exceed 2 s twice (test double)
  2. Call an authenticated route without ACCOUNT_STATUS_FAIL_OPEN
  - Expected: 503 'Unable to verify account status'.
- **Erased subject**
  1. Add a tombstone for the account
  2. Present the old provider session
  - Expected: Refused; an 'erased_account' auth failure is logged.

**Where to look when it fails**

- Log 'account_status lookup failed after retry; denying request (fail-closed)' (apps/web/lib/api-auth.ts:279).
- Log 'Identity mapping could not be linked' (apps/web/lib/server/identity-account.ts:152).
- Tables profiles, identities, erasure_tombstones; audit event identity_linked and auth failure erased_account.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says adapters cover password, social, passkey and SSO; the code has one provider adapter (Clerk).** Affects: All apps; provider independence. Evidence: packages/platform/identity/src/types.ts:1; factory.ts:47-52. Work needed: Add a second adapter or restate the requirement as 'one adapter behind the port'.
- **No record of how each app renders the denial notice.** Affects: Desktop, Mobile, CLI, VS Code, Chrome. Evidence: brief S89.01 lists status n/a for every app. Work needed: Trace each client's handling of ACCOUNT_UNAVAILABLE and add tests.
- **The status cache lives 5 minutes (apps/web/lib/server/request-context-cache.ts:10,64-86) and is cleared only by invalidateAccountStatusCache(userId); a lock or suspension written without that call takes up to 5 minutes to take effect. Which lock and suspend write paths call the invalidation was not traced.** Affects: Time between a lock and its effect. Evidence: apps/web/lib/api-auth.ts:245 uses getCachedAccountStatus; apps/web/lib/server/request-context-cache.ts:10,64-86. Work needed: Trace the lock/suspend writers for invalidateAccountStatusCache calls and test the delay.

**Depends on**

- SYS-authentication-and-identity
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- table:identities
- table:profiles
- table:erasure_tombstones
- file:apps/web/lib/api-auth.ts
- file:apps/web/lib/server/identity-account.ts
- file:apps/web/lib/auth/account-status.ts

## Unknown

- Whether sso/clerk-enterprise-connections.ts is part of the adapter surface the brief describes (file not opened).
- How each non-web app displays an ACCOUNT_UNAVAILABLE response.
- Which lock and suspend write paths call invalidateAccountStatusCache (the 5 minute TTL itself is known).
- Production value of ACCOUNT_STATUS_FAIL_OPEN.
- Whether Local mode requires sign-in on each app.
- Whether every bearer-token and other authenticated route reaches the status gate (only the cookie path via assertAccountActive and the device refresh route were traced).

## Second reader's check

A second reader checked 12 statements of this page against the code: 7 correct, 4 wrong or partly wrong, 1 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 3):** "Status lookup is cached, retried twice, each try bounded to 2000 ms, and fails closed with 503" The code shows: ACCOUNT_STATUS_ATTEMPTS = 2 is two attempts in total, i.e. one retry. Cache, 2000 ms deadline and 503 are right. Section 6 says 'retried once', so the page contradicts itself. (apps/web/lib/api-auth.ts:109,120,250-266,279-282). **Corrected:** Status lookup is cached, tried at most twice (one retry), each try bounded to 2000 ms, and fails closed with 503 unless ACCOUNT_STATUS_FAIL_OPEN is set.
- **Wrong (section 3 / 10 / 4 / Unknown):** "The status cache TTL ... not in the files read [unknown TTL]; Unknown: 'Length and invalidation of the account-status cache'" The code shows: The TTL is known. setCachedAccountStatus writes with REQUEST_CONTEXT_CACHE_TTL_SECONDS (5 minutes), and invalidateAccountStatusCache exists. Section 6 and section 5 already cite the 5 minute value for identity and status, so the page contradicts itself. A lock can therefore take up to 5 minutes to bite unless something calls invalidateAccountStatusCache. (apps/web/lib/server/request-context-cache.ts:10,64-76,78-86). **Corrected:** The account-status cache lives 5 minutes (same constant as the identity cache) and is cleared by invalidateAccountStatusCache(userId); a lock or suspension written without that call takes up to 5 minutes to take effect.
- **Partly wrong (section 2 / 7):** "It runs on every request on the server (apps/web/lib/api-auth.ts:244-282); applies to every account on every API request" The code shows: assertAccountLifecycleActive is reached through assertAccountActive. The code comment says it runs on every cookie-authenticated request. The page did not show that every bearer-token, device-token or other authenticated route calls it. The device refresh route does its own check with accountAccessDecision on owner_account_status. In assertAccountActive the workspace lockdown gate fails open (a lookup error is logged as 'not locked'), which the page omits. (apps/web/lib/api-auth.ts:115-120,196-216,244-282; apps/web/app/api/auth/device/refresh/route.ts:181-188). **Corrected:** The status gate runs for authenticated API requests through assertAccountActive, which is also called on the cookie path. The device refresh route applies the same decision separately. Do not claim every request is covered without tracing each auth path.
- **Partly wrong (section 8):** "Second subject for the same account: the link write conflicts, is logged as an error, and the request continues without an identity id" The code shows: linkIdentity catches the error, logs 'Identity mapping could not be linked' at error level and returns null, so identityId is null and the request continues; the comment attributes it to migration 0174's (provider, user_id) uniqueness. The INSERT uses ON CONFLICT (provider, subject) DO NOTHING, which handles only the same subject. The null identityId is also cached for 5 minutes via writeCache, so the missing link persists. Not stated on the page. (apps/web/lib/server/identity-account.ts:53-58,140-157,203-210). **Corrected:** A second subject for the same account violates the (provider, user_id) uniqueness; the failure is logged at error level, the request continues with identityId null, and that null identity is cached for 5 minutes.

**Facts the page missed**

- The status cache has a known 5 minute TTL and an invalidateAccountStatusCache(userId) function, so a lock or suspension can take up to 5 minutes to apply unless that function is called (apps/web/lib/server/request-context-cache.ts:10,64-86). The page says the TTL is unknown.
- The workspace lockdown gate fails open: a failed or slow workspace lookup is logged as 'not locked' and the request continues (apps/web/lib/api-auth.ts:196-208). Only the bindOrganizationScope path (mfaGateExemptForOwner) fails closed with 503 (api-auth.ts:215-242). The page lists only the fail-closed case.
- Sign-in completion uses accountAccessForSignIn, which allows the request on any lookup error (apps/web/lib/auth/account-lifecycle.ts:38-46). The device-token refresh route applies its own accountAccessDecision on owner_account_status and returns 403 account_unavailable (apps/web/app/api/auth/device/refresh/route.ts:181-188,281-295). The page's section 3 mentions them but its 'every request' framing hides that account standing is enforced on several separate paths.
