---
id: "F089-04"
type: "feature"
title: "Profile, preferences, terms and consent"
aliases: ["Profile service", "User-preference service", "Consent and terms-version store", "/api/me", "Settings preferences", "Terms acceptance", "Consent records (S89.07, S89.08, S89.09)"]
area: "89 Account and access components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S89.07", "S89.08", "S89.09"]
depends_on: ["SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-sync-and-continuity", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud", "table:profiles", "table:user_settings", "table:consent_records", "api:GET /api/me", "api:PATCH /api/me", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "api:POST /api/terms/accept", "api:POST /api/consent", "F089-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F089-04 Profile, preferences, terms and consent

Stores the person's name and photo, their settings in named groups with version checks, the Terms version they accepted, and their consent choices. Web pages and chat refuse accounts that never accepted Terms. A newer Terms version currently only shows a notice.

Area: [89. Account and access components](README.md). Requirement items: [S89.07](../../10-requirements/capabilities/089-account-and-access-components.md#s8907), [S89.08](../../10-requirements/capabilities/089-account-and-access-components.md#s8908), [S89.09](../../10-requirements/capabilities/089-account-and-access-components.md#s8909).

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

**What it does.** GET and PATCH /api/me read and change display name and photo; GET and PUT /api/settings/preferences read and write per-namespace settings with a row version; POST /api/terms/accept records Terms acceptance; POST /api/consent records consent decisions per purpose.

**Why it exists.** Every app needs one shared place for who the person is, what they chose, and what they agreed to, with proof of the notice version.

**Who uses it.** All signed-in people, all six apps.

**Problems it solves**

- Two apps saving settings at once do not silently overwrite each other (version check returns 412) (apps/web/app/api/settings/preferences/route.ts:240-250).
- A failed profile read cannot blank a profile (apps/web/lib/server/user-identity.ts:88-93).
- Consent is a record per purpose with the notice version, not a loose flag (apps/web/lib/server/consent-records.ts:95-115).

**Use cases**

- A person changes their name in Settings, General and sees it on Mobile.
- A new person accepts Terms at sign-up and chat opens.
- A person turns marketing email off in Settings; a consent record stores the choice.
- Desktop saves a setting with the last version it saw and learns the setting changed elsewhere.

## 2. User experience

**Where to find it**

- Web: Settings, General has 'Full name' and photo buttons 'Upload photo' / 'Change photo' (apps/web/features/settings/sections/GeneralSection.tsx:204-242).
- Mobile: Settings personalization saves display name via PATCH /api/me (apps/mobile/src/features/settings/personalization/index.tsx:426) and photo (useCloudProfilePhoto.ts:76).
- Desktop: cloud account settings call /api/me (apps/desktop/src/api/cloudAccountSettings.ts:530-552) and safety preferences (CloudSafetySection.tsx).
- CLI: personalization reads and writes /api/settings/preferences (apps/cli/src/cloud/personalization.rs:7).
- Terms: sign-in completion page /login/complete and /welcome (apps/web/app/login/complete/page.tsx).

**Before you start**

- Signed in; writes need a CSRF token (me/route.ts:415; preferences/route.ts:178).
- Terms acceptance needs an adult-eligibility decision on file for web flows (apps/web/app/api/terms/accept/route.ts:60-67 comment).

**Screens and controls**

- Settings consent rows: MarketingEmailConsentRow, ProductAnalyticsConsentRow, AccountConsentRow (apps/web/features/settings/components).
- Terms gate page with a sign-out option: TermsReviewSignOut (apps/web/app/login/complete/TermsReviewSignOut.tsx).

**Journey**

1. Person signs up or signs in.
2. If no Terms acceptance is on record, pages redirect to /login/complete?redirectTo=<page> (apps/web/lib/server/require-current-terms.ts:12-15).
3. Person accepts; the server stores version, time and surface.
4. In Settings the person edits profile or settings; the app sends PATCH or PUT.
5. On a version clash the app shows the server's current value and asks the person to choose again.

**What the person sees and gets**

- PATCH /api/me returns id, display_name, avatar_url (me/route.ts:455-471).
- GET /api/me also returns plan, feature flags, limits and routing preferences (me/route.ts:300-360).
- Preferences conflict: 412 with code SETTINGS_VERSION_CONFLICT and message 'These settings changed elsewhere. Nothing was saved; reload and choose again.' (preferences/route.ts:236-250).
- Write error: generic 'Failed to save settings' (preferences/route.ts:213-218).
- A service-owned namespace write: 'The skills settings change only through their own endpoint, not preferences.' (shape from preferences/route.ts:203-208; the namespace name comes from SKILL_SETTINGS_NAMESPACE).

**Settings**

- Namespaces are free-form lowercase names matching ^[a-z][a-z0-9_-]{1,48}$ (preferences/route.ts:30-33).
- 'general' namespace holds preferredName, workDescription, instructions and primaryUseCase (user-identity.ts:19, 112-122).
- Consent purposes in code: enterprise_waitlist, platform_availability_waitlist, product_updates, product_analytics, marketing_email (apps/web/lib/consent-purposes.ts).
- Consent surfaces: web-waitlist-inline, web-waitlist-modal, web-consent-centre, web-cookie-banner, web-settings, mobile-settings, web-signup, web-login, email-unsubscribe (consent-purposes.ts:112-122).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- PATCH /api/me accepts only display_name (1 to 120 characters) and avatar_url and upserts profiles (me/route.ts:129-132, 409-471).
- Preferences GET with optional namespace; PUT with namespace plus patch or value, or a multi-namespace settings object; row-level version equals updated_at; locked read-modify-write in a transaction (preferences/route.ts:80-135, 178-232).
- Only the skills namespace is refused here as service-owned (preferences/route.ts:62, 196-208).
- Reading a failed settings namespace returns {} and logs a warning (user-identity.ts:40-60).
- Profile read throws on failure (user-identity.ts:88-93).
- Terms: acceptance stored on profiles with version, time, surface; standing computed as current, notice or required; refusal never cached (apps/web/lib/server/terms.ts:85-130, 186-212).
- Terms gates exist on page layouts (settings, chat, workspace, admin, code, billing, quick-ask), device sign-in token and approve, and the chat gateway auth gate (apps/web/app/*/layout.tsx; apps/web/app/api/auth/device/token/route.ts; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts).
- Consent records: insert-only rows per purpose with notice version; reads take the latest per purpose (apps/web/lib/server/consent-records.ts:77-175).
- Device refresh sends X-AGI-Terms-Notice headers when a newer version exists (terms.ts:164-176).

**Incomplete**

- The first draft says an account whose version is not current must accept again. Code: MIN_REQUIRED_TERMS_VERSION and its effective date are null, so only accounts with no acceptance are blocked; older versions get a notice (apps/web/lib/server/terms.ts:20-22, 93-117).
- If the terms read fails, the account is let through, logged and counted (terms.ts:148-160).

**Present but disconnected or switched off**

- Binding-revision mechanism (MIN_REQUIRED_TERMS_VERSION, MIN_REQUIRED_TERMS_EFFECTIVE_AT, 30 day grace) exists but is unset (terms.ts:20-23).

**Not available**

- Preferred name and work description are not writable through PATCH /api/me; they live in the 'general' preferences namespace (me/route.ts:129-132; user-identity.ts:112-120).
- Terms acceptance surfaces accept only web-signup, web-login, mobile-auth (terms.ts:25).

## 4. Required behaviour

**Established requirements**

- A profile service reads and updates the account profile (name, photo, preferred name, work description) for every client. (source: brief S89.07)
- A user-preference service stores per-namespace settings with versioned writes that every client can read and sync. (source: brief S89.08)
- A consent and terms store records which Terms version each user accepted and their consents, and blocks use until current Terms are accepted. (source: brief S89.09)
- A revision of Terms is announced ahead of time and continued use accepts it; only a material change with an effective date forces acceptance. (source: apps/web/lib/server/terms.ts:13-19 comment)
- Documentation availability and account availability are kept separate. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. PUT /api/settings/preferences with a stale expectedVersion returns 412 and changes nothing.
2. PUT with the service-owned namespace (skills) returns a validation error naming the endpoint rule.
3. PATCH /api/me with an empty body returns 'At least one field is required'.
4. A new account with no terms on record is redirected from /chat to /login/complete.
5. An account on an older accepted version still opens /chat and receives X-AGI-Terms-Notice on device refresh.
6. POST /api/consent writes a consent_records row with notice_version and surface.
7. GET /api/settings/preferences?namespace=general returns settings and version.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the version is the whole row's updated_at, a write to one namespace changes the version seen for all namespaces [inferred from preferences/route.ts:80-84 and 125].
- Mobile and desktop gate Terms through their own flows (mobile termsAcceptanceStore) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the first-draft sentence true or reword the brief: decide whether a newer Terms version should block, then set the binding revision values.
- [proposed] Move preferred name and work description to a documented profile field set so /api/me and preferences cannot disagree.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET and PATCH /api/me | `apps/web/app/api/me/route.ts` | Profile and account snapshot. |
| endpoint | GET and PUT /api/settings/preferences | `apps/web/app/api/settings/preferences/route.ts` | Versioned namespace settings. |
| endpoint | POST /api/terms/accept | `apps/web/app/api/terms/accept/route.ts` | Records Terms acceptance with age evidence. |
| endpoint | GET and POST /api/consent | `apps/web/app/api/consent/route.ts` | Reads and records consents. |
| service | user-identity | `apps/web/lib/server/user-identity.ts` | Profile and general-namespace reads. |
| service | terms | `apps/web/lib/server/terms.ts` | Standing, acceptance, notice headers. |
| service | require-current-terms | `apps/web/lib/server/require-current-terms.ts` | Page redirect gate. |
| service | consent-records | `apps/web/lib/server/consent-records.ts` | Consent writes and reads. |
| service | consent-purposes | `apps/web/lib/consent-purposes.ts` | Purpose and surface vocabulary. |
| service | user-settings-payload | `apps/web/lib/services/user-settings-payload.ts` | Validates settings content on write (serializeUserSettings). |
| screen | Login complete page | `apps/web/app/login/complete/page.tsx` | Terms acceptance step. |
| screen | GeneralSection | `apps/web/features/settings/sections/GeneralSection.tsx` | Web name and photo UI. |
| component | Consent rows | `apps/web/features/settings/components/MarketingEmailConsentRow.tsx` | Consent controls. |
| service | cloudAccountSettings profile calls | `apps/desktop/src/api/cloudAccountSettings.ts` | Desktop /api/me client. |
| store | cloudProfileStore | `apps/mobile/src/features/settings/cloud-account/cloudProfileStore.ts` | Mobile profile store. |
| store | termsAcceptanceStore | `apps/mobile/src/features/auth/store/termsAcceptanceStore.ts` | Mobile Terms status. |
| service | personalization.rs | `apps/cli/src/cloud/personalization.rs` | CLI preferences client. |
| schema | terms-acceptance contract | `packages/contracts/cloud-contracts/src/terms-acceptance.ts` | Request schema and path constant. |
| table | profiles, user_settings, consent_records | `apps/web/lib/server/terms.ts` | Terms columns on profiles; settings JSON with updated_at version; consent rows. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends GET or PATCH with credentials and CSRF for writes. | device and our servers | apps/web/app/api/me/route.ts:409-418 |
| The server validates the body and upserts profiles, or locks user_settings and merges the delta into the JSON. | our servers | me/route.ts:430-452; preferences/route.ts:100-135 |
| If the supplied expectedVersion differs from stored updated_at, the server returns 412 with the current value. | our servers | preferences/route.ts:124-128, 236-250 |
| For Terms, page layouts and the chat gateway call mustAcceptTerms, which reads profiles terms columns (cached 5 minutes unless refused). | our servers | terms.ts:121-160 |
| POST /api/terms/accept writes version, time and surface and clears the cached standing. | our servers | terms.ts:186-212 |
| POST /api/consent inserts a consent row with the notice version for the purpose. | our servers | consent-records.ts:77-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Display name, photo URL | table profiles | Server; every app reads it through /api/me | Deleted with the profile on erasure. |
| Settings by namespace (JSON) with row updated_at as version | table user_settings | Server; clients sync by reading | Kept until erasure. |
| Terms version, accepted time, surface | table profiles (terms_version, terms_accepted_at, terms_accepted_surface) | Server | Overwritten on a new version; older acceptances not kept in this row [inferred]. |
| Consent decisions | table consent_records (user id or hashed email, purpose, granted, notice version, surface) | Server | Insert-only history; latest per purpose is read. |

**Models and providers.** No AI model or provider takes part. GET /api/me also returns plan and routing information that belong to other features (me/route.ts:300-360).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account. Consent can also be recorded for an email-only subject for waitlists (consent-records.ts:70-72). |
| Permissions | The caller reads and writes only their own rows (scoped db). Workspace roles do not apply. |
| Subscription | none found in the code for profile, preferences, terms or consent. GET /api/me exposes plan data from the subscription system. |
| Limits and metering | Rate limits named 'me', 'settings-activity' (preferences GET), 'settings-org-patch' (preferences PUT); values unknown. Display name 120 characters; namespace pattern as above; custom instructions 2000 characters (user-identity.ts:19). |
| Feature flags | MIN_REQUIRED_TERMS_VERSION (null), MATERIAL_TERMS_GRACE_DAYS (30) as code constants. |
| Model compatibility | Not model-dependent. Preferences carry model-related choices, not model identifiers owned here. |
| Provider restrictions | None for this feature. |
| Local mode | Profile, preferences, terms and consent live on our servers; Local mode without a connection cannot read or write them. What each app caches locally is unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Conflict | 412 SETTINGS_VERSION_CONFLICT with current settings and version. | preferences/route.ts:236-250 |
| Unconfirmed write | If the saved row lacks settings or version the server throws 'Settings write was not confirmed'. | preferences/route.ts:224-231 |
| Namespace read failure | Returns {} with a warning log. | user-identity.ts:40-60 |
| Profile read failure | Throws so /api/me does not backfill over an existing profile. | user-identity.ts:88-93 |
| Terms read failure | Lets the account through, logs and counts terms_acceptance_unreadable. | terms.ts:148-160 |
| Terms refused | Never cached, so accepting in another tab takes effect at once. | terms.ts:121-130 |
| Unknown consent purpose or surface | recordConsent throws. | consent-records.ts:77-82 |
| Offline | not handled in the code read here for the server; client behaviour unknown. | not found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/__tests__/api/me.test.ts`: /api/me behaviour.
- `apps/web/app/api/me/__tests__/route.contract.test.ts`: /api/me response contract.
- `apps/web/__tests__/api/settings-preferences.test.ts`: Preferences route.
- `apps/web/app/api/settings/preferences/__tests__/concurrency.test.ts`: Concurrent writes and versions.
- `apps/web/app/api/settings/preferences/__tests__/service-owned-namespaces.test.ts`: Refusal of service-owned namespaces.
- `apps/web/app/api/settings/preferences/__tests__/rls-scoped.test.ts`: Row-level scoping.
- `apps/web/lib/server/terms-standing.test.ts`: Terms standing rules.
- `apps/web/lib/server/terms-acceptance.test.ts`: Recording acceptance.
- `apps/web/app/api/terms/accept/route.test.ts`: Terms accept route.
- `apps/web/lib/server/consent-records.test.ts`: Consent store.
- `apps/web/app/api/consent/__tests__/route.gpc.test.ts`: Consent with the global privacy signal.
- `apps/web/app/api/auth/device/refresh/terms-reacceptance.test.ts`: Device refresh Terms gate.

**Test scenarios**

- **Stale version**
  1. GET preferences and note version
  2. PUT a change (version moves)
  3. PUT another change with the first version
  - Expected: 412 SETTINGS_VERSION_CONFLICT; nothing saved.
- **New account Terms gate**
  1. Create an account without acceptance
  2. Open /chat
  - Expected: Redirect to /login/complete?redirectTo=%2Fchat.
- **Older Terms version**
  1. Set accepted version older than current
  2. Open /chat; call device refresh
  - Expected: No block; notice header on refresh.
- **Profile edit across apps**
  1. PATCH /api/me display_name on web
  2. Open Mobile and refresh
  - Expected: Mobile shows the new name.
- **Consent history**
  1. POST consent granted then not granted for marketing_email
  2. GET consents
  - Expected: Latest record is not granted; both rows exist.

**Where to look when it fails**

- Logs 'Failed to persist user settings', 'Failed to read settings namespace', '[terms] acceptance unreadable; letting the account through'.
- Metric failure terms_acceptance_unreadable.
- Tables profiles, user_settings, consent_records.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Brief says Terms block use until the current version is accepted; code blocks only never-accepted accounts.** Affects: All apps. Evidence: apps/web/lib/server/terms.ts:20-22, 93-117. Work needed: Decide the policy, then set the binding revision values or fix the brief.
- **Brief S89.07 lists preferred name and work description as profile fields, but /api/me PATCH cannot write them.** Affects: Clients wanting one profile call. Evidence: apps/web/app/api/me/route.ts:129-132. Work needed: Document the two-step write or extend the endpoint.
- **Terms read failure lets accounts through.** Affects: Terms enforcement during outages. Evidence: terms.ts:148-160 (comment calls it a notice requirement). Work needed: Confirm this is intended; it differs from the fail-closed rule in AGENTS.md section 6.
- **Per-app Terms and consent UI not traced for Desktop, CLI, VS Code, Chrome.** Affects: Those apps. Evidence: search found a Mobile store and a Desktop test only. Work needed: Trace and add tests.

**Depends on**

- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-sync-and-continuity
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud
- table:profiles
- table:user_settings
- table:consent_records
- api:GET /api/me
- api:PATCH /api/me
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- api:POST /api/terms/accept
- api:POST /api/consent
- F089-01

## Unknown

- Whether Desktop, VS Code and Chrome show a Terms screen.
- The model-improvement consent flow inside preferences (hasInvalidModelImprovementConsent) was not read in full.
- Retention of old Terms acceptances.
- Rate limit values.
- How the extension surfaces use /api/me.
