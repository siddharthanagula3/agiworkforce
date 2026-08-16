# W6 — Privacy, consent, erasure and legal obligations

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** This wave is grouped by regulator rather than by code path because the obligations interlock: an erasure path is worthless if telemetry survives it, a consent record is worthless if no server-side timestamp or policy version exists, and a privacy policy that omits ten collected categories cannot be corrected without knowing what W1–W5 actually enforce — which is why it runs after them. It also concentrates every duplicate filing so each is fixed once: desktop account deletion (DPDP-06/DESK-22), desktop telemetry defaults (DPDP-07/DESK-23), the extension privacy notice and permission disclosure (DPDP-18/EXT-07/SEC-63), the mobile privacy manifest and age gate (DPDP-19/MOB-04/MOB-05/DPDP-04/MOB-06), and support-bundle redaction (DESK-24/TEST-11). Several items are founder or counsel actions with long lead times (EU representative, Eighth Schedule translations, Significant Data Fiduciary determination, grievance officer identity) so they must be started here even though they close later.

**Size.** 61 items (7 critical, 31 high, 16 medium, 7 low); 54 open.

**Done when.** Account deletion enumerates every table and local store holding personal data (desktop SQLite emails, contacts, screenshots, OCR text included) and a test asserts zero rows and zero files remain for a deleted principal, including anonymous NULL-user_id rows in waitlist/consent/rights tables and propagation to object storage, vector/search indexes, caches and analytics under a written retention tier policy. Desktop telemetry is constructed disabled, respects the consent gate and does not survive Delete All Data; server and edge Sentry initialise only with consent and carry no stable user id. Cookie and training-preference consent are recorded server-side with timestamp and policy version and re-prompt on version change. The privacy policy 'what we collect' table matches an evidence list derived from code; subprocessor, recipient and Article 50 disclosures are consistent across web, mobile and desktop and the mobile legal page no longer claims provenance marks that do not exist. Waitlist unsubscribe works end to end; a named human is notified when a rights request arrives; retention crons are registered and observed to run. An EU representative is appointed and named; grievance officer is a named individual with a working mailbox reachable from inside the signed-in shell; SDF determination and DPDP annex are recorded as legal decisions with dates; the unqualified store compliance claim is corrected. Support-bundle redaction default is proven by a test that fails if conversation content appears.

| ID                  | Sev      | Item                                                                                                                                                                                                  | Effort |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [DPDP-04](#dpdp-04) | CRITICAL | No verifiable parental consent — web has no age gate at all and mobile's is self-declared and child-clearable                                                                                         | L      |
| [DPDP-06](#dpdp-06) | CRITICAL | Desktop 'delete my account' erases 7 of roughly 100 tables and leaves local emails, contacts, screenshots and OCR text untouched                                                                      | L      |
| [DPDP-19](#dpdp-19) | CRITICAL | Mobile shows no privacy notice at onboarding, its iOS privacy manifest under-declares collection, and store privacy declarations misstate what is shared                                              | L      |
| [DPDP-21](#dpdp-21) | CRITICAL | GDPR Article 27 EU representative has not been appointed — the product's own page says the obligation is live and unmet                                                                               | S      |
| [DPDP-41](#dpdp-41) | CRITICAL | Deleting an account from Settings > Privacy leaves the user fully signed in against an account scheduled for erasure — the Account tab's copy of the same flow signs them out                         | S      |
| [WEB-124](#web-124) | CRITICAL | Account deletion is implemented twice and the Privacy copy leaves the user fully signed in after erasure                                                                                              | M      |
| [WEB-51](#web-51)   | CRITICAL | Deleting your account from Settings > Privacy leaves you fully signed in against an account scheduled for erasure                                                                                     | M      |
| [DESK-22](#desk-22) | HIGH     | Desktop 'delete my account' erases 7 of ~100 tables and leaves local SQLite content behind                                                                                                            | M      |
| [DPDP-01](#dpdp-01) | HIGH     | Model-training preference copy and controls are inconsistent across surfaces and may reference a control that never existed                                                                           | M      |
| [DPDP-02](#dpdp-02) | HIGH     | EU AI Act Article 50 disclosure is enforced on one surface of six, and the web surface now relies on an unreviewed carve-out                                                                          | L      |
| [DPDP-03](#dpdp-03) | HIGH     | Mobile Article 50 legal page falsely claims exported chat text and audio carry provenance marks                                                                                                       | S      |
| [DPDP-05](#dpdp-05) | HIGH     | Third-party recipient disclosure across /subprocessors, /privacy and /terms — sources disagree on whether the omissions are corrected                                                                 | S      |
| [DPDP-07](#dpdp-07) | HIGH     | Desktop telemetry is constructed enabled with no privacy mode, bypasses the consent gate, and survives Delete All Data                                                                                | M      |
| [DPDP-08](#dpdp-08) | HIGH     | Anonymous rows with NULL user_id in waitlist, consent and data-rights tables are unreachable by any erasure path                                                                                      | M      |
| [DPDP-09](#dpdp-09) | HIGH     | 'Unsubscribe anytime' is promised in the waitlist UI but no unsubscribe path exists                                                                                                                   | M      |
| [DPDP-10](#dpdp-10) | HIGH     | Nobody is notified when a data-rights request arrives and nothing polls the admin queue                                                                                                               | S      |
| [DPDP-11](#dpdp-11) | HIGH     | Server and edge Sentry initialise for every request with no consent check and retain a stable user id                                                                                                 | M      |
| [DPDP-13](#dpdp-13) | HIGH     | Cookie consent has no server-side record, timestamp or policy version, and never expires when the notice changes                                                                                      | M      |
| [DPDP-14](#dpdp-14) | HIGH     | The privacy policy's 'what we collect' table omits roughly ten data categories the product provably collects                                                                                          | M      |
| [DPDP-16](#dpdp-16) | HIGH     | Retention has no maximum age for waitlist emails, support tickets or rights requests, and the two lifecycle crons are not registered so they never run                                                | M      |
| [DPDP-17](#dpdp-17) | HIGH     | Legal pages are hardcoded English JSX with no i18n, mechanically blocking the Eighth Schedule language requirement                                                                                    | XL     |
| [DPDP-18](#dpdp-18) | HIGH     | The Chrome extension injects into every page, requests debugger and cookie permissions, mirrors transcripts to the cloud with no opt-out, and shows no privacy notice                                 | L      |
| [DPDP-22](#dpdp-22) | HIGH     | Significant Data Fiduciary status is undetermined — if notified, a named India DPO, DPIA and independent audit are all required and none exist                                                        | XL     |
| [DPDP-23](#dpdp-23) | HIGH     | Grievance Officer is a role account not a named individual, the notice address is unconfirmed, and no privacy or grievance mailbox exists                                                             | S      |
| [DPDP-24](#dpdp-24) | HIGH     | Terms version was deliberately not bumped for the new data-protection section because bumping breaks every device session, and its arbitration carve-out is unreviewed                                | M      |
| [DPDP-25](#dpdp-25) | HIGH     | The DPA has no DPDP annex, uses controller/processor framing the Act does not share, and commits to no data-principal breach notification                                                             | M      |
| [DPDP-27](#dpdp-27) | HIGH     | Mobile store listings publish an unqualified DPDP compliance claim that overstates the actual position                                                                                                | S      |
| [DPDP-29](#dpdp-29) | HIGH     | No copyright or DMCA takedown execution path exists on any public share or artifact page                                                                                                              | M      |
| [DPDP-36](#dpdp-36) | HIGH     | Thirteen published legal and policy claims were audited but never verified against code, including whether tool approval is actually required by default                                              | L      |
| [DPDP-37](#dpdp-37) | HIGH     | Deletion and retention do not propagate to object storage, search and vector indexes, caches, backups or analytics, and no retention tiers are defined                                                | XL     |
| [DPDP-38](#dpdp-38) | HIGH     | EU AI Act Article 50 provenance-marker serialization silently strips every nested key, and web hand-restates the marker shape instead of importing it, so the two surfaces reject each other's output | M      |
| [DPDP-42](#dpdp-42) | HIGH     | Both live account-deletion flows have zero test coverage                                                                                                                                              | S      |
| [DPDP-53](#dpdp-53) | HIGH     | No designated incident commander and no on-call rota for data-breach response — the founder owns every incident by default                                                                            | S      |
| [DPDP-54](#dpdp-54) | HIGH     | No mass-notification path exists to email an arbitrary list of affected data principals, so individual intimation under DPDP §5 is manual and does not scale                                          | L      |
| [EXT-07](#ext-07)   | HIGH     | Chrome extension exposes no privacy notice anywhere in its UI while injecting into every page, requesting debugger and cookies permissions, and mirroring chats to the cloud with no opt-out          | M      |
| [MOB-05](#mob-05)   | HIGH     | Mobile presents no privacy notice during onboarding and requests a Contacts permission no code reads                                                                                                  | M      |
| [MOB-06](#mob-06)   | HIGH     | Mobile age gate is self-declared with no verifiable parental consent, and minor-safe mode is child-clearable                                                                                          | XL     |
| [TEST-18](#test-18) | HIGH     | Zero test coverage for either live account-deletion flow                                                                                                                                              | S      |
| [DESK-24](#desk-24) | MEDIUM   | Desktop support-bundle redaction default (no conversation content) is unverified                                                                                                                      | S      |
| [DPDP-12](#dpdp-12) | MEDIUM   | The signed-in app shell has no legal footer, so the grievance contact is unreachable from inside the product                                                                                          | S      |
| [DPDP-15](#dpdp-15) | MEDIUM   | No nomination field exists (DPDP s.14) — nominations are handled manually via the request form                                                                                                        | M      |
| [DPDP-20](#dpdp-20) | MEDIUM   | /trust and /security omit any Indian data-protection obligation                                                                                                                                       | S      |
| [DPDP-26](#dpdp-26) | MEDIUM   | Breach notification templates are engineer-drafted from statute and unreviewed by counsel                                                                                                             | S      |
| [DPDP-40](#dpdp-40) | MEDIUM   | Eleven legacy or dead database tables and an authored-but-unapplied drop migration are untracked as a group, so the erasure-only tables and the founder-gated 0058 drop will need re-discovery        | S      |
| [DPDP-43](#dpdp-43) | MEDIUM   | The unmounted UserSettings.tsx delete handler calls the data-only erasure endpoint while telling the user their account is deleted and signing them out                                               | S      |
| [DPDP-45](#dpdp-45) | MEDIUM   | The temporary-chat memory exclusion is enforced only on the live request path; the second web chat runtime injects saved memory with no isTemporary check                                             | S      |
| [DPDP-47](#dpdp-47) | MEDIUM   | No published commercial or enterprise legal-terms document exists distinct from the consumer Terms — enterprise terms are bespoke-negotiated only                                                     | M      |
| [DPDP-52](#dpdp-52) | MEDIUM   | Deleting a project permanently orphans its knowledge files — the soft delete never fires the ON DELETE CASCADE, there is no restore endpoint, and the dialog never mentions files                     | M      |
| [DPDP-55](#dpdp-55) | MEDIUM   | No breach-notice page and no in-product banner exist, so the delivery method the breach runbook assumes would have to be built during the incident                                                    | M      |
| [DPDP-56](#dpdp-56) | MEDIUM   | Security audit log 90-day retention is a routine an administrator runs by hand, not a schedule, so the retention actually applied is unknown and a late-discovered incident may have no trail         | S      |
| [DPDP-58](#dpdp-58) | MEDIUM   | Desktop native crash-dump upload was removed for consent reasons and has no consent-safe replacement — rebuilding it requires a typed runtime consent bridge that does not exist                      | L      |
| [MOB-04](#mob-04)   | MEDIUM   | Locked iOS privacy-manifest review copy has drifted from the real generated manifest and cites a deleted path                                                                                         | M      |
| [SEC-63](#sec-63)   | MEDIUM   | Chrome extension requests all-URLs content script, debugger and cookies permissions with no in-product disclosure of what they enable                                                                 | M      |
| [TEST-11](#test-11) | MEDIUM   | The support-bundle redaction default is unverified — nothing proves conversation content is excluded                                                                                                  | S      |
| [DPDP-44](#dpdp-44) | LOW      | No disclosure of whether saved memory personalizes outbound tool or web-search queries, and nobody has established whether it does                                                                    | S      |
| [DPDP-46](#dpdp-46) | LOW      | No ad-personalization opt-out exists, and it has never been confirmed whether any advertising vendor receives account data                                                                            | S      |
| [DPDP-48](#dpdp-48) | LOW      | No commercial-tier dispute-resolution stance exists, so consumer arbitration terms apply by default to every paying tier absent a signed MSA                                                          | S      |
| [DPDP-49](#dpdp-49) | LOW      | The privacy notice says nothing about non-account-holder third parties whose personal data enters the product through a user's connectors or conversations                                            | S      |
| [DPDP-50](#dpdp-50) | LOW      | Consumer Terms and Privacy are a single worldwide document with Texas governing law and no EEA/UK/Switzerland variant                                                                                 | L      |
| [DPDP-51](#dpdp-51) | LOW      | No MCP marketplace listing policy — correctly not written, because no curated marketplace is operated                                                                                                 | S      |
| [DPDP-57](#dpdp-57) | LOW      | Vendor log retention (Vercel, Neon) is set by the vendors, so breach evidence may expire before the investigation reaches it                                                                          | M      |

---

### DPDP-04 — No verifiable parental consent — web has no age gate at all and mobile's is self-declared and child-clearable

`CRITICAL` · compliance/dpdp · effort L

**What.** O-2 / L-4, cited as the highest legal exposure in the audit. DPDP s.9 requires verifiable parental consent. Web has no age gate anywhere; mobile's age gate is self-declared (apps/mobile/app/(public)/age-gate.tsx:17) and its minor-safe mode is clearable by the child (parental-controls/index.tsx:36). The age-gate module's own contract states there is no parental-consent flow in v1 and that minor-safe mode is a content filter only. GAP-023 records family account linking as explicitly not planned for the current device-only scope, and GAP-037 records Parental Controls as limited to device age review.

Also recorded by a later audit (MS-19 Parental account linking — decided, not yet built): MS-19 (docs/current/parity-implementation-matrix.md#2026-08-01 Founder Scope Decisions) records that parental account linking is founder-approved as a Build item and names its blocker: 'Needs a new account-linking server contract.' This is the concrete missing mechanism behind DPDP-04's 'no verifiable parental consent' — the mobile self-declared, child-clearable gate (also MOB-06) cannot be fixed without it.

**Done when.** Legal counsel defines the verification standard required; then implement an age gate on web, make minor-safe mode server-authoritative and not child-clearable, and build a verifiable parental consent path for users below the statutory age.

**Where.** `apps/mobile/app/(public)/age-gate.tsx:17`, `apps/mobile/src/features/settings/parental-controls/index.tsx:36`

**Blocked by.** Legal definition of the verification standard

**From.** DPDP_PROGRESS.md O-2; DPDP_PROGRESS.md L-4; audit/ui-gaps.md GAP-023; audit/ui-gaps.md GAP-037; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** No verifiable parental consent (DPDP s.9)

### DPDP-06 — Desktop 'delete my account' erases 7 of roughly 100 tables and leaves local emails, contacts, screenshots and OCR text untouched

`CRITICAL` · compliance/dpdp · effort L

**What.** VERIFIED still present: apps/desktop/src-tauri/src/sys/commands/privacy.rs defines a PrivacyTable enum covering only messages, conversations, projects, message_drafts, custom_instructions, settings_v2 and usage_stats, and privacy_delete_account iterates only those — consistent with the audit's '8 of ~100' claim. Local SQLite retains emails, contacts, screenshots and OCR text that no erasure path reaches, and a second export command hard-fails on a non-existent table.

**Done when.** Enumerate every user-scoped local table and derive the erasure list from that enumeration rather than a hand-written enum, extend erasure to local file artefacts (screenshots, OCR text, mail and contact caches), and fix the failing export command.

**Where.** `apps/desktop/src-tauri/src/sys/commands/privacy.rs:16-53`, `apps/desktop/src-tauri/src/sys/commands/privacy.rs:231-260`, `apps/desktop/src-tauri/src/data/db/migrations.rs:1676`

**From.** DPDP_PROGRESS.md O-3

**Folded in.** O-3 Desktop 'delete my account' deletes almost nothing

### DPDP-19 — Mobile shows no privacy notice at onboarding, its iOS privacy manifest under-declares collection, and store privacy declarations misstate what is shared

`CRITICAL` · compliance/dpdp · effort L

**What.** O-17: mobile presents no privacy notice before or during onboarding; the iOS privacy manifest declares only Email and Name while omitting user content and device identifiers; and the app requests a Contacts permission no code reads. ExecutionPlan founder item 9 records both store listings declaring email plus name only and 'shares nothing' while the published subprocessors page names Anthropic, OpenAI, Google, xAI and DeepSeek and the cloud path uploads whole conversations. A separate drift record notes the locked App Store privacy-manifest review copy is missing the C56D.1 FileTimestamp required-reason code and NSPrivacyTrackingDomains that the real prebuild-generated manifest carries, and cites a deleted path as canonical.

**Done when.** Present a privacy notice during onboarding, regenerate the iOS manifest from actual collection and reconcile the locked review copy against it, remove the unread Contacts permission, and correct the App Store and Play data declarations to match the real recipient list.

**Where.** `apps/mobile/app/(public)/onboarding.tsx:1`, `apps/mobile/app.config.js:162`, `apps/mobile/src/deviceIntegrations.ts:104`, `apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy`

**Blocked by.** Founder must correct App Store Connect and Play Console privacy declarations

**From.** DPDP_PROGRESS.md O-17; ExecutionPlan.md Founder actions #9; docs/agent-context/known-flaws.md MOBILE-PRIVACY-MANIFEST-LOCKED-COPY-DRIFT-01

**Folded in.** O-17 Mobile presents no privacy notice; manifest under-declares; unread Contacts permission; App Store / Play privacy declarations misstate what data is shared; MOBILE-PRIVACY-MANIFEST-LOCKED-COPY-DRIFT-01

### DPDP-21 — GDPR Article 27 EU representative has not been appointed — the product's own page says the obligation is live and unmet

`CRITICAL` · compliance/dpdp · effort S

**What.** ExecutionPlan founder item 10: /legal/eu-representative states in the company's own words that the obligation is live and unmet, while the product has served EU users since 2026-06-27.

**Done when.** Founder appoints an Article 27 EU representative and updates the legal page with the appointed entity's details.

**Where.** `apps/web/app/legal/eu-representative`

**Blocked by.** Founder must appoint an EU representative

**From.** ExecutionPlan.md Founder actions #10

**Folded in.** GDPR Art. 27 EU representative not appointed

### DPDP-41 — Deleting an account from Settings > Privacy leaves the user fully signed in against an account scheduled for erasure — the Account tab's copy of the same flow signs them out

`CRITICAL` · compliance/dpdp · effort S

**What.** duplication audit settings-and-nav.md §3a, flagged in its README as 'The one to fix first' (audit/competitive-gap-2026-08-15/duplication/). AccountSection.handleDeleteSuccessContinue (lines 230-245) calls logout() then clerkSignOut({redirectUrl:'/'}). PrivacySection.handleDeleteAccount (lines 305-326) never calls logout() or clerkSignOut() anywhere in the file — it only sets deleteSuccess=true and renders a static message (lines 797-801). Two independently-written implementations of an irreversible operation, on the compliance/dpdp branch, with divergent post-conditions.

**Done when.** Collapse to one implementation (a shared hook or component rendered from both tabs), or cross-link Privacy's danger zone to Account's delete flow the way SecuritySection.tsx already cross-references session management.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx:194-245`, `apps/web/features/settings/sections/PrivacySection.tsx:156-160,305-326,797-801`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §3a; audit/competitive-gap-2026-08-15/duplication/README.md

### WEB-124 — Account deletion is implemented twice and the Privacy copy leaves the user fully signed in after erasure

`CRITICAL` · web · effort M

**What.** duplication/settings-and-nav.md §3a — the duplication audit's own 'fix first' item. AccountSection.handleDeleteSuccessContinue (lines 230-245) calls logout() then clerkSignOut({redirectUrl:'/'}). PrivacySection.handleDeleteAccount (lines 305-326) never calls logout() or clerkSignOut() anywhere in the file — it only sets deleteSuccess=true and shows a static message. A user who deletes their account from Settings > Privacy is left in a fully-authenticated client session against a server-side account now scheduled for erasure, with no forced sign-out. Neither flow has any test coverage (TEST-17).

**Done when.** Collapse to one implementation (a shared hook/component rendered from both tabs) or cross-link Privacy's danger zone to Account's delete flow, mirroring SecuritySection.tsx's existing cross-reference for session management. Land test coverage in the same change.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx:194-245`, `apps/web/features/settings/sections/PrivacySection.tsx:156-160,305-326,797-801`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §3a; audit/competitive-gap-2026-08-15/duplication/README.md

### WEB-51 — Deleting your account from Settings > Privacy leaves you fully signed in against an account scheduled for erasure

`CRITICAL` · web · effort M

**What.** duplication/settings-and-nav.md §3a (the audit's own 'the one to fix first'): AccountSection.handleDeleteSuccessContinue calls logout() then clerkSignOut({redirectUrl:'/'}); PrivacySection.handleDeleteAccount never calls logout() or clerkSignOut() anywhere in the file — it only sets deleteSuccess=true and shows a static message. A repo-wide grep of every apps/web .test.tsx for 'Delete account'/handleDeleteAccount/delete-account returns zero hits, so neither live flow has any test coverage.

**Done when.** Collapse the two flows into one shared hook/component rendered from both tabs (or cross-link Privacy's danger zone to Account's flow), and add coverage for both before or alongside the collapse.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx:194-245`, `apps/web/features/settings/sections/PrivacySection.tsx:156-160,305-326,797-801`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §3a; README.md 'The one to fix first'; all-axes.json#settings-and-nav[4]

### DESK-22 — Desktop 'delete my account' erases 7 of ~100 tables and leaves local SQLite content behind

`HIGH` · desktop · effort M

**What.** Verified: the PrivacyTable enum and its all() function cover only messages, conversations, projects, message_drafts, custom_instructions, settings_v2 and usage_stats, and privacy_delete_account iterates only these. Local SQLite retains emails, contacts, screenshots and OCR text that no erasure path reaches, and a second export command hard-fails on a table that does not exist. This is the desktop leg of the account-erasure obligation.

**Done when.** Derive the erasure table list from the schema rather than a hand-written enum, cover every user-scoped local table including capture/OCR artifacts, and fix the failing export command.

**Where.** `apps/desktop/src-tauri/src/sys/commands/privacy.rs:16-53,231-260`, `apps/desktop/src-tauri/src/sys/commands/chat/maintenance.rs:17`, `apps/desktop/src-tauri/src/data/db/migrations.rs:1676`

**From.** DPDP_PROGRESS.md (O-3)

### DPDP-01 — Model-training preference copy and controls are inconsistent across surfaces and may reference a control that never existed

`HIGH` · compliance/dpdp · effort M · **unclear**

**What.** Sources disagree. CRIT-006 and DOC-002 record privacy copy referencing a training preference or opt-in path that was deleted or never implemented, with no server-authoritative preference enforced across surfaces. GAP-032 and GAP-092 record the opposite framing as a deliberate decision: the platform constitution states AGI is not a foundation-model company and customer conversation data is not trained on, so a training toggle would be a cosmetic switch. GAP-160 confirms mobile cloud-privacy PRIVACY_ITEMS is static 'no-training' text with no Switch, by design. A grep of apps/web/app/privacy/page.tsx for 'training' returns no match, suggesting the false web copy may already be removed. PP-26 still lists the training-control mismatch as unresolved.

**Done when.** Establish one authoritative statement of the training position, verify no surface still advertises a control that does not exist, and if the position is 'never trained on' state that as a commitment in the notice rather than as a user-toggleable preference.

**Where.** `apps/web/app/privacy/page.tsx`, `apps/mobile/src/features/settings/cloud-privacy/index.tsx`

**From.** AuditRemediationLedger.md CRIT-006; AuditRemediationLedger.md DOC-002; AuditRemediationLedger.md PP-26; audit/ui-gaps.md GAP-032; audit/ui-gaps.md GAP-160; audit/ui-gaps.md GAP-092

**Folded in.** Privacy UI claims a training opt-in/control that does not exist; False training-preference copy not yet removed; No user-facing toggle to opt in/out of using chats to train AI models; Model-training opt-in is declined because customer-content training is always off

### DPDP-02 — EU AI Act Article 50 disclosure is enforced on one surface of six, and the web surface now relies on an unreviewed carve-out

`HIGH` · compliance/dpdp · effort L

**What.** VERIFIED still present: packages/contracts/compliance/src/llm-gate.ts documents itself as running in front of every /api/llm/\* request and names a web integration file that does not exist; the only production caller is apps/mobile/services/streaming.ts, so the Article 50(1) disclosure check and the Chinese-HQ provider opt-in are unenforced on web and desktop. apps/web/lib/compliance/ai-act.ts states in its own header that as of 2026-08-14 the web surface renders no explicit disclosure sentence and relies on the 'obvious from context' carve-out, and that streamed chat text is NOT marked on any surface and there is no web audio-generation route — both recorded as open gaps. L-12 flags that counsel has not confirmed the carve-out applies while the product has served EU users since 2026-06-27 and the Act has applied since 2026-08-02. ExecutionPlan #85 records a 2026-08-09 fix for the one-surface problem, which the 2026-08-14 removal partly reverses.

**Done when.** Have counsel confirm or reject the Article 50(1) carve-out for the web composer; wire the llm-gate to web and desktop request paths; and either mark streamed chat text and generated audio under 50(2) or document them as scoped-out with the legal basis.

**Where.** `packages/contracts/compliance/src/llm-gate.ts`, `apps/mobile/services/streaming.ts:19`, `apps/web/lib/compliance/ai-act.ts`

**Blocked by.** Legal review of the Article 50(1) carve-out before further EU shipping

**From.** docs/agent-context/known-flaws.md COMPLIANCE-LLM-GATE-SURFACE-COVERAGE-01; DPDP_PROGRESS.md L-12; ExecutionPlan.md #85

**Folded in.** COMPLIANCE-LLM-GATE-SURFACE-COVERAGE-01: EU AI Act / China-HQ disclosure gate only wired on mobile; EU AI Act Article 50 disclosure is wired on only one surface of six; L-12 Article 50(1) sentence removed from web chat composer

### DPDP-03 — Mobile Article 50 legal page falsely claims exported chat text and audio carry provenance marks

`HIGH` · compliance/dpdp · effort S

**What.** apps/mobile/app/legal/article-50.tsx:66-72 states that text and audio exports are marked, while apps/web/lib/compliance/ai-act.ts:14-17 states in code that streamed chat text is NOT marked on any surface and there is no web audio-generation route — a direct contradiction inside the codebase, on a page whose stated purpose is to show users the exact regulatory text being complied with.

Also recorded by a later audit (Mobile's Article 50 legal disclosure overclaims: says text and audio are provenance-marked, but neither is (and no audio-generation feature even exists)): VOICE-MEDIA-006 (audit/parity-2026-08-15) adds exact locations — apps/mobile/app/legal/article-50.tsx:66-72 versus apps/web/lib/compliance/ai-act.ts:1-30, whose own doc comment states 'Only the two web surfaces that actually produce synthetic artefacts are covered here: generated images and generated video. Streamed chat text is NOT marked on any surface and there is no web audio-generation route.' Adds the timing exposure: the same file states the EU obligation has applied since 2026-08-02 and AGI has served EU users since 2026-06-27. Fix is a copy edit naming only image and video.

**Done when.** Correct the mobile Article 50 page to describe only the marks that actually exist (generated images and video), and add a test pinning the claim to the set of surfaces buildAiGeneratedProvenance actually covers.

**Where.** `apps/mobile/app/legal/article-50.tsx:66-72`, `apps/web/lib/compliance/ai-act.ts:14-17`

**From.** docs/agent-context/phase4-capability-audit.md PP-18; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Mobile legal (Article 50) page overclaims that exported chat text and audio carry C2PA-style provenance marks

### DPDP-05 — Third-party recipient disclosure across /subprocessors, /privacy and /terms — sources disagree on whether the omissions are corrected

`HIGH` · compliance/dpdp · effort S · **unclear**

**What.** DPDP_PROGRESS §4 calls this the most serious finding: the legal pages omitted live third-party recipients (Resend, Runway ML, Nominatim, Apple/Google store APIs, GitHub, Perplexity, the full OpenRouter scope) and relied on a false 'no transactional email system' claim to justify not notifying users of breaches or changes. §8 still lists O-1 as open with a to-do to invert the BANNED test guard. But verification found subprocribers/page.tsx now carries a dated 'RE-ADDED 2026-08-14 — Resend' comment, lists Google/OpenStreetMap/GitHub with citations, and legal-policy-set.test.ts now asserts Resend MUST appear and that no file may claim 'there is no transactional email system' — the guard has been inverted. Two more instances of the false email claim in /dpa were separately recorded as fixed, as was the Expo subprocessor omission.

Also recorded by a later audit (/subprocessors page is incomplete — omits confirmed third-party recipients): BREACH_RUNBOOK.md open-gaps row 6 resolves the register's 'sources disagree' status decisively: recipients confirmed in code and missing from the page include the transactional email provider, the video-generation provider, the geocoding service, and the mobile store APIs, so §3's 'third parties involved' cannot be answered from the published page. DPDP_PROGRESS.md corroborates with a named tracking id O-1 and a fuller list (Resend live and receiving personal data; Runway; Nominatim; Apple/Google store APIs; GitHub; Perplexity; the true OpenRouter failover scope) — and records an active trap: a legal-policy-set test currently BANS relisting Resend on the false premise that no transactional email system exists (apps/web/app/subprocessors/page.tsx:14-29,172-177). Fix must invert that test in the same change and delete the 'no transactional email system' justification from /subprocessors, /privacy and /terms.

**Done when.** Re-read the three legal pages against the live vendor list one final time, confirm every recipient named in code appears, and close O-1 with the observed page content rather than the ledger row.

**Where.** `apps/web/app/subprocessors/page.tsx`, `apps/web/app/__tests__/legal-policy-set.test.ts`

**From.** DPDP_PROGRESS.md O-1; DPDP_PROGRESS.md §4; DPDP_PROGRESS.md §7.2; ExecutionPlan.md #92; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** O-1 subprocessors/privacy/terms omitted live third-party recipients

### DPDP-07 — Desktop telemetry is constructed enabled with no privacy mode, bypasses the consent gate, and survives Delete All Data

`HIGH` · compliance/dpdp · effort M

**What.** VERIFIED still present: apps/desktop/src-tauri/src/lib.rs:503-517 constructs CollectorConfig with enabled:true and privacy_mode:None unconditionally at startup. Two Tauri commands emit user-identified telemetry bypassing the consent gate; Delete All Data never deletes the persisted telemetry file; and the settings UI claims analytics are anonymous with no PII while a persistent pseudonymous id is minted before consent is given.

**Done when.** Construct the collector disabled with the user's stored privacy mode, route both bypassing commands through the consent gate, include the persisted telemetry file in Delete All Data, and mint the pseudonymous id only after consent — then correct the settings copy to match.

**Where.** `apps/desktop/src-tauri/src/lib.rs:503-517`, `apps/desktop/src-tauri/src/sys/commands/analytics.rs:535`, `apps/desktop/src-tauri/src/telemetry/collector.rs:289`, `apps/desktop/src/features/settings/AnalyticsSettings.tsx:92`

**From.** DPDP_PROGRESS.md O-4; DPDP_PROGRESS.md (O-4)

**Folded in.** O-4 Desktop telemetry is constructed enabled:true/privacy_mode:None; Desktop telemetry is constructed enabled by default, bypasses the consent gate, and survives 'Delete All Data'

### DPDP-08 — Anonymous rows with NULL user_id in waitlist, consent and data-rights tables are unreachable by any erasure path

`HIGH` · compliance/dpdp · effort M

**What.** O-5: delete_user_data() never touches cloud_managed_waitlist, and the same is now true of NULL-user_id rows in consent_records and data_rights_requests. An erase-by-email path is needed because there is no user id to key on.

**Done when.** Add an erase-by-email path covering the three tables, and make it the documented mechanism for erasure requests from people who never held an account.

**Where.** `apps/web/app/api/waitlist/public/route.ts:91`, `apps/web/db/neon/0020_functions.sql:1405`

**From.** DPDP_PROGRESS.md O-5

**Folded in.** O-5 Anonymous rows (NULL user_id) unreachable by any erasure path

### DPDP-09 — 'Unsubscribe anytime' is promised in the waitlist UI but no unsubscribe path exists

`HIGH` · compliance/dpdp · effort M

**What.** O-6: unsubscribe_token and unsubscribed_at columns exist but nothing consumes them, and the new consent ledger records withdrawal but nothing reads it before sending. The promise is made in WaitlistModal.tsx:203 and app/waitlist/page.tsx:63-65. A related unperformable promise ('we will email you the day it lands') was already removed.

**Done when.** Implement a token-based unsubscribe endpoint, consume unsubscribed_at and the consent ledger's withdrawal state before every send, and add a test that a withdrawn recipient cannot be sent to.

**Where.** `apps/web/db/neon/0016_misc.sql:68-69`, `apps/web/features/marketing/components/WaitlistModal.tsx:203`, `apps/web/app/waitlist/page.tsx:63-65`

**From.** DPDP_PROGRESS.md O-6; DPDP_PROGRESS.md §7.2

**Folded in.** O-6 'Unsubscribe anytime' is promised but no unsubscribe path exists

### DPDP-10 — Nobody is notified when a data-rights request arrives and nothing polls the admin queue

`HIGH` · compliance/dpdp · effort S

**What.** O-7: GET /api/admin/privacy/requests exists so the queue can be read, but working it is a human routine that does not exist yet, and no notification fires on arrival. Statutory response deadlines run from receipt regardless.

**Done when.** Send an operator notification on request creation and define the documented routine (owner, SLA, evidence trail) for working the queue within the statutory deadline.

**Where.** `apps/web/app/api/admin/privacy/requests/route.ts`

**From.** DPDP_PROGRESS.md O-7

**Folded in.** O-7 Nobody is notified when a data-rights request arrives

### DPDP-11 — Server and edge Sentry initialise for every request with no consent check and retain a stable user id

`HIGH` · compliance/dpdp · effort M

**What.** O-8, marked CONFIRMED: apps/web/instrumentation.ts:65-70 initialises Sentry unconditionally per request with no consent check while retaining a stable user id. Related already-fixed work centralised PII scrubbing and made Sentry default-disabled without a production DSN, but the consent gate and stable identifier remain.

**Done when.** Gate server and edge Sentry initialisation on the recorded consent state, and drop or rotate the stable user id for users who have not consented to error telemetry.

**Where.** `apps/web/instrumentation.ts:65-70`, `apps/web/shared/lib/sentry.ts`

**From.** DPDP_PROGRESS.md O-8; gap-audit-2026-08-08.md §8

**Folded in.** O-8 Server/edge Sentry initializes for every request with no consent check

### DPDP-13 — Cookie consent has no server-side record, timestamp or policy version, and never expires when the notice changes

`HIGH` · compliance/dpdp · effort M

**What.** O-10, marked CONFIRMED: apps/web/shared/lib/cookie-consent.ts stores consent client-side only with no timestamp and no policy version, so a changed notice does not re-prompt and no proof of consent exists. The new consent ledger has a product_analytics purpose ready to receive it.

**Done when.** POST cookie consent to /api/consent for signed-in users with a timestamp and policy version, and invalidate the stored consent when the notice version changes.

**Where.** `apps/web/shared/lib/cookie-consent.ts:34`, `apps/web/shared/lib/cookie-consent.ts:83`

**From.** DPDP_PROGRESS.md O-10

**Folded in.** O-10 Cookie consent has no server-side record, no timestamp, no policy version

### DPDP-14 — The privacy policy's 'what we collect' table omits roughly ten data categories the product provably collects

`HIGH` · compliance/dpdp · effort M

**What.** O-11, marked CONFIRMED: the table omits waitlist emails, feedback blobs, content reports containing conversation excerpts, support-handoff transcripts, search history, memories, phone number, download IP hash plus user agent and referrer, SCIM identities, and mobile push tokens.

**Done when.** Regenerate the collection table from an enumeration of what the code actually persists, and add a test that fails when a new user-scoped table or collection point is added without a matching notice entry.

**Where.** `apps/web/app/privacy/page.tsx:153`

**From.** DPDP_PROGRESS.md O-11

**Folded in.** O-11 Privacy policy 'what we collect' table omits ~10 proven data categories

### DPDP-16 — Retention has no maximum age for waitlist emails, support tickets or rights requests, and the two lifecycle crons are not registered so they never run

`HIGH` · compliance/dpdp · effort M

**What.** O-13: no maximum retention age is defined for waitlist emails, support tickets, billing rows or data_rights_requests, and two lifecycle cron routes exist in the codebase but are absent from vercel.json so they never execute. The billing-record half of this is tracked separately as BILL-35 because its driver is statutory record-keeping rather than minimisation.

Also recorded by a later audit (Restore deleted conversations — deleted rows were permanently unreachable and are retained indefinitely with no purge job): wire-or-cut.md#2026-08-06: DELETE only sets deleted_at with no purge job, so deleted conversations were simultaneously unreachable to the user AND retained indefinitely. A restore endpoint plus Settings > Privacy 'Recently deleted' now exists, and it deliberately makes no retention promise precisely because no purge job exists. Extends DPDP-16's 'no maximum age' finding from waitlist/support/rights-requests to soft-deleted conversations.

**Done when.** Define a maximum retention age per category, register both lifecycle crons in vercel.json, and add a test asserting every declared cron route is registered.

**Where.** `vercel.json:13`, `apps/web/db/neon/0011_waitlist.sql:50`

**From.** DPDP_PROGRESS.md O-13; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** O-13 Retention has no maximum age; two lifecycle cron routes are not registered

### DPDP-17 — Legal pages are hardcoded English JSX with no i18n, mechanically blocking the Eighth Schedule language requirement

`HIGH` · compliance/dpdp · effort XL

**What.** O-15: legal pages are hardcoded English JSX while the product ships other locales, which blocks L-6 (the Eighth Schedule regional-language requirement) mechanically rather than as a translation backlog. The i18n debt record separately notes that legal and policy pages (privacy, terms, dpa, security, trust) need per-locale legal review, not just translation, and F-5 records commissioning those translations as a founder action.

Also recorded by a later audit (Full-localization requirement — LanguageSelector is a false control; hi locale missing 4 of 7 bundles): docs/current/parity-implementation-matrix.md#2026-08-05 Founder Decisions quantifies what blocks the Eighth Schedule requirement beyond the legal pages themselves: the hi locale is missing 4 of 7 bundles (auth, chat, models, pricing); only 5 of 490 TSX component files use i18n at all, so the settings LanguageSelector 'currently changes a small fraction of visible text — a false control under the completion standard'; and pnpm check:i18n-parity is currently red on hi. Mobile and desktop i18n coverage is recorded as unaudited under the same requirement.

**Done when.** Extract legal page copy into locale bundles, commission Eighth Schedule translations with legal review per locale, and gate the page on a reviewed-translation manifest so an unreviewed locale falls back rather than shipping.

**Where.** `apps/web/app/privacy/page.tsx:77`

**Blocked by.** Founder commissioning of Eighth Schedule translations with per-locale legal review

**From.** DPDP_PROGRESS.md O-15; DPDP_PROGRESS.md L-6; DPDP_PROGRESS.md F-5; docs/agent-context/known-flaws.md 2026-08-05 i18n translation debt; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** O-15 Legal pages are hardcoded English JSX with no i18n; i18n translation debt includes legal/policy pages needing per-locale legal review

### DPDP-18 — The Chrome extension injects into every page, requests debugger and cookie permissions, mirrors transcripts to the cloud with no opt-out, and shows no privacy notice

`HIGH` · compliance/dpdp · effort L

**What.** O-16: manifest.json:22,37 injects a content script into every http/https page and requests debugger and cookies permissions; conversationSync.ts:15 mirrors chat transcripts to the cloud with no opt-out; and options.html exposes no privacy notice anywhere in the extension UI. The extension's own storage separately holds a full identity and employment profile in plaintext chrome.storage.local with no erasure path.

**Done when.** Add a privacy notice to the extension UI, give transcript mirroring an explicit opt-out, narrow the host permissions and justify debugger/cookies at the point of use, and add an erasure path for locally stored profile data.

**Where.** `apps/extension/manifest.json:22`, `apps/extension/src/features/content/cloud-bridge/conversationSync.ts:15`, `apps/extension/src/options.html:1`, `apps/extension/src/features/content/autofill/filler.ts:826`

**From.** DPDP_PROGRESS.md O-16; DPDP_PROGRESS.md §6

**Folded in.** O-16 Chrome extension privacy gaps

### DPDP-22 — Significant Data Fiduciary status is undetermined — if notified, a named India DPO, DPIA and independent audit are all required and none exist

`HIGH` · compliance/dpdp · effort XL

**What.** L-3: if the company is notified as a Significant Data Fiduciary under DPDP s.10 it must appoint a named India-based Data Protection Officer, complete a DPIA and undergo an independent audit, none of which exist today. Whether the threshold applies has not been determined.

Also recorded by a later audit (No Data Protection Officer and no Indian point of contact): BREACH_RUNBOOK.md open-gaps row 7 states it flatly ('No Data Protection Officer, and no Indian point of contact') and names the trigger: 'If AGI is ever notified as a Significant Data Fiduciary, a named India-based DPO becomes mandatory and does not exist.' Confirms the register's conditional framing is now a standing gap in the breach runbook too, and overlaps DPDP-23 (grievance officer is a role account, not a named individual).

**Done when.** Obtain a legal determination on Significant Data Fiduciary status; if it applies, appoint an India-based DPO, run a DPIA and commission the independent audit.

**Blocked by.** Legal determination of Significant Data Fiduciary status

**From.** DPDP_PROGRESS.md L-3; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** L-3 Significant Data Fiduciary status undetermined

### DPDP-23 — Grievance Officer is a role account not a named individual, the notice address is unconfirmed, and no privacy or grievance mailbox exists

`HIGH` · compliance/dpdp · effort S

**What.** F-1 and L-7: the Grievance Officer is published as a role account rather than a named individual, which DPDP requires the founder to confirm or designate. F-2: NOTICE_ADDRESS is founder-unconfirmed and is now printed on two more pages. F-4: a real privacy@ or grievance@ mailbox has not been provisioned, and it is unconfirmed whether subject-line routing on contact@ is intended to stand.

**Done when.** Founder designates a named Grievance Officer, confirms the notice address, and provisions a dedicated privacy/grievance mailbox or confirms the contact@ routing arrangement in writing.

**Where.** `apps/web/lib/legal-constants.ts`

**Blocked by.** Founder decisions F-1, F-2 and F-4

**From.** DPDP_PROGRESS.md F-1; DPDP_PROGRESS.md F-2; DPDP_PROGRESS.md F-4; DPDP_PROGRESS.md L-7

**Folded in.** F-1 Grievance Officer published as a role account; F-2 NOTICE_ADDRESS is founder-unconfirmed; F-4 Provision a real privacy@/grievance@ mailbox

### DPDP-24 — Terms version was deliberately not bumped for the new data-protection section because bumping breaks every device session, and its arbitration carve-out is unreviewed

`HIGH` · compliance/dpdp · effort M

**What.** F-3: POLICY_LAST_UPDATED was not bumped for the new Terms §19 Data protection section, deliberately, because device/token routes reject device tokens on a stale terms version, so bumping breaks every existing desktop, CLI and mobile session until re-acceptance on web. L-11: §19 carves data-protection complaints out of the arbitration clause and this needs confirmation that it is intended and legally effective.

**Done when.** Design a graceful re-acceptance flow so a terms bump does not hard-break device sessions, then bump the version; and have counsel confirm the arbitration carve-out is intended and enforceable.

**Where.** `apps/web/app/api/auth/device/token/route.ts:98`, `apps/web/app/api/auth/device/refresh/route.ts:120`

**Blocked by.** Founder decision F-3 (production-disrupting) and legal review L-11

**From.** DPDP_PROGRESS.md F-3; DPDP_PROGRESS.md L-11

**Folded in.** F-3 Terms POLICY_LAST_UPDATED not bumped for new §19; L-11 Terms §19 arbitration carve-out needs confirmation

### DPDP-25 — The DPA has no DPDP annex, uses controller/processor framing the Act does not share, and commits to no data-principal breach notification

`HIGH` · compliance/dpdp · effort M

**What.** L-10: the DPA's 'Applicable Data Protection Law' definition excludes DPDP and uses controller/processor framing the Act does not share, and its breach obligation runs only to the enterprise Customer with no commitment to notify data principals. Q-13 records the DPA DPDP annex as an unverified audit question. Two false 'no transactional email system' claims in /dpa were separately already corrected.

**Done when.** Have counsel draft a DPDP annex, extend the applicable-law definition, adopt Act-consistent terminology, and add a data-principal breach notification commitment.

**Where.** `apps/web/app/dpa/page.tsx:209`, `apps/web/app/dpa/page.tsx:513`

**Blocked by.** Legal/contract drafting

**From.** DPDP_PROGRESS.md L-10; DPDP_PROGRESS.md Q-13

**Folded in.** L-10 DPA lacks a DPDP annex

### DPDP-27 — Mobile store listings publish an unqualified DPDP compliance claim that overstates the actual position

`HIGH` · compliance/dpdp · effort S

**What.** F-6: the Android listing metadata publishes an unqualified DPDP compliance claim while the web privacy policy did not, at the time of audit, contain the word India — and the open items DPDP-04 (no verifiable parental consent), DPDP-15 (no nomination field) and DPDP-22 (SDF status undetermined) all remain unmet.

**Done when.** Qualify or remove the compliance claim from both store listings until the outstanding DPDP obligations are actually met, and keep the claim consistent with /trust (DPDP-20).

**Where.** `apps/mobile/store-listing/LISTING-METADATA-ANDROID.json:20`

**Blocked by.** Founder decision F-6

**From.** DPDP_PROGRESS.md F-6

**Folded in.** F-6 Mobile store listings publish an unqualified DPDP-compliance claim

### DPDP-29 — No copyright or DMCA takedown execution path exists on any public share or artifact page

`HIGH` · compliance/dpdp · effort M

**What.** A grep for report, copyright, abuse or dmca across all three public viewers (share, shared, shared-artifact) returns zero hits; DELETE /api/share/[token] is documented owner-only; and apps/web/app/api/admin/ contains only security, sso and directory-sync routes with no takedown route. A rights holder finding infringing content has no in-page control and must independently discover /copyright and email, and whoever receives that notice has no admin control to unpublish the share. PP-30 records the same absence of a DMCA and contact process for public content.

**Done when.** Add an in-page report control to all three public viewers, build an operator takedown route that can unpublish any share or artifact regardless of owner, and document the DMCA process and designated agent.

**Where.** `apps/web/app/api/share/[token]/route.ts:5`, `apps/web/app/shared-artifact/[token]/page.tsx`

**From.** docs/agent-context/phase4-capability-audit.md PP-30; AuditRemediationLedger.md PP-30

**Folded in.** No copyright/DMCA takedown execution path exists on any public share/artifact page; Help/legal/support: no DMCA/contact process for public content

### DPDP-36 — Thirteen published legal and policy claims were audited but never verified against code, including whether tool approval is actually required by default

`HIGH` · compliance/dpdp · effort L · **unclear**

**What.** DPDP_PROGRESS §7.3 records a queue Q-1..Q-13 explicitly labelled 'audited, NOT verified, do not act on without checking' because the verifier agents failed on API 529s. Q-1 is flagged as potentially the cardinal defect: does the product actually default every connector and MCP tool to requiring approval, as the AUP claims — a hand-trace was started but did not conclude, and 'a published enforcement claim the product does not enforce is the cardinal defect in this repo'. Q-2..Q-13 cover: whether Block is absolute, saved-ask verdict priority, per-tool permissions from the approval card, Desktop OAuth scope table completeness, published rate limits, sandbox description accuracy, the Chrome debugger permission claim, SLA target mechanisms, cancellation/renewal matching Stripe, mobile legal deletion/disclosure/export claims, the mobile children's statement versus the self-declared age gate, and the DPA DPDP annex. Supporting evidence that this class is real: a separate finding records per-tool connector permission levels as never enforced server-side, with server gating being a single coarse binary.

**Done when.** Work the queue one claim at a time, tracing each published sentence to the enforcing code path, and either correct the copy or build the enforcement — starting with Q-1.

**Where.** `apps/web/app/acceptable-use/page.tsx:32`, `apps/web/app/agent-permissions/page.tsx`, `apps/web/app/sla/page.tsx:48`, `apps/web/app/refund-policy/page.tsx:37`, `apps/web/app/mobile/legal/page.tsx:238`

**From.** DPDP_PROGRESS.md §7.3 Q-1..Q-13; docs/agent-context/known-flaws.md CONNECTOR-PERMISSIONS-CLIENT-ONLY-01

**Folded in.** Q-1 does the product default every connector/MCP tool to requiring approval; Q-2 through Q-13 unverified published-copy-vs-code queue

### DPDP-37 — Deletion and retention do not propagate to object storage, search and vector indexes, caches, backups or analytics, and no retention tiers are defined

`HIGH` · compliance/dpdp · effort XL

**What.** SCALE-GROW-002: the primary database, object storage, search and vector indexes, caches, backups and analytics may not all receive deletion propagation. SCALE-GROW-001: messages, events, tool logs, files, embeddings, audit, usage, notifications and media lack data-volume forecasts and retention tiers. A related fix already landed for one leg of this (restored PITR data being re-subjected to erasure via a suppression list), which shows the propagation problem is real; PP-09 separately records deletion propagation for files as unconfirmed.

Also recorded by a later audit (Delete-conversation confirmation does not name the specific data store or confirm generated media is included): MEDIA-DELETE-11 (competitive-gap-2026-08-15) at ConversationListItem.tsx:320-323. The valuable part is the fix instruction, which is a verification task, not a copy task: 'verify that is actually true server-side before claiming it in copy, especially given the active compliance/dpdp branch' — i.e. it is currently unknown whether deleting a conversation deletes its generated images/videos from object storage, which is exactly DPDP-37's propagation question narrowed to a concrete, testable case.

Also recorded by a later audit (No approved data-retention purge policy or purge path exists (the retention-days control was removed as a false privacy claim)): wire-or-cut.md#2026-08-06 'Controls that persisted nothing anyone read' records a CRITICAL finding: Settings > System rendered a validated, persisted 1-365 day retention input while retention_period had ZERO consumers anywhere in the API — nothing purged anything, so a user who set 30 days believed conversations were being deleted and they were not. The control was removed as a false privacy claim with an explicit replacement condition: 're-add when a purge path AND an approved policy both exist' — and this register shows neither exists. That is the sharpest statement yet of DPDP-37's missing retention tiers.

**Done when.** Enumerate every store holding user data, define a retention tier per data class, and make the erasure path fan out to all of them with verifiable completion rather than deleting only primary rows.

**From.** AuditRemediationLedger.md SCALE-GROW-002; AuditRemediationLedger.md SCALE-GROW-001; AuditRemediationLedger.md PP-09; ExecutionPlan.md #87; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** Archival/deletion propagation incomplete; No data-volume forecasts or retention tiers

### DPDP-38 — EU AI Act Article 50 provenance-marker serialization silently strips every nested key, and web hand-restates the marker shape instead of importing it, so the two surfaces reject each other's output

`HIGH` · compliance/dpdp · effort M

**What.** CROSS-SURFACE-005 / DEAD-CODE-020 (audit/parity-2026-08-15). packages/contracts/compliance/src/article50-marker.ts:137-138's serialiseClaim() does JSON.stringify(claim, Object.keys(claim).sort()) — an array replacer, which JSON.stringify applies as a global key allowlist at EVERY nesting depth, so nested assertions[].label/.action keys never survive; mobile's real emitted sidecar serializes assertions as [{}]. Separately, apps/web/lib/compliance/ai-act.ts:16-38,192-201 hand-restates the marker shape because @agiworkforce/compliance is not a declared web dependency, and web's own hasAiGeneratedProvenance() would reject mobile's real compliant output. Distinct from DPDP-02 (Article 50 disclosure enforced on one surface of six) — this is a correctness bug in the marker itself. The same web file independently re-confirms DPDP-02's evidence: streamed chat text is unmarked on any surface, there is no web audio-generation route, and the Article 50(1) explicit-disclosure sentence was removed from web's composer on 2026-08-14 on an unreviewed legal carve-out.

**Done when.** Fix serialiseClaim to apply the key allowlist at the top level only (or sort recursively via a custom replacer / deep-sort-then-stringify helper), add a cross-surface fixture-replay contract test, and collapse web's hand-restated duplicate onto the shared package once it is a declared dependency.

**Where.** `packages/contracts/compliance/src/article50-marker.ts:137-138`, `apps/web/lib/compliance/ai-act.ts:16-38,192-201`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface (CROSS-SURFACE-005); audit/parity-2026-08-15/gaps/domain-dead-code (DEAD-CODE-020)

**Folded in.** CROSS-SURFACE-005; DEAD-CODE-020

### DPDP-42 — Both live account-deletion flows have zero test coverage

`HIGH` · compliance/dpdp · effort S

**What.** duplication audit settings-and-nav.md §3a / README (audit/competitive-gap-2026-08-15/duplication/): grepping every .test.tsx under apps/web for 'Delete account' / handleDeleteAccount / delete-account returns zero hits, for both AccountSection.tsx and PrivacySection.tsx — each of which triggers an irreversible erasure on the compliance/dpdp branch.

**Done when.** Add test coverage for both delete-account flows (confirmation gating, subscription state, sign-out post-condition, erasure API call) before or alongside collapsing them into one implementation.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx`, `apps/web/features/settings/sections/PrivacySection.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §3a

### DPDP-53 — No designated incident commander and no on-call rota for data-breach response — the founder owns every incident by default

`HIGH` · compliance/dpdp · effort S

**What.** BREACH_RUNBOOK.md open-gaps table row 1: 'No designated incident commander or on-call rota. The founder owns every incident by default.' Stated consequence: 'The clock runs while someone works out who is responsible' — against DPDP's statutory Board-notification timing. Distinct from INFRA-24 (no alerting vendor pages anyone on a production outage): this is breach-response ownership, not outage paging.

**Done when.** Designate a named incident commander and an on-call rotation for security/privacy incidents specifically, and record it in the runbook and DPDP_PROGRESS.md.

**Blocked by.** founder action per the runbook's own framing

**From.** BREACH_RUNBOOK.md#open-gaps row 1

### DPDP-54 — No mass-notification path exists to email an arbitrary list of affected data principals, so individual intimation under DPDP §5 is manual and does not scale

`HIGH` · compliance/dpdp · effort L

**What.** BREACH_RUNBOOK.md open-gaps table row 2: 'No mass-notification path. Nothing can email an arbitrary list of affected users; the wired email provider serves support escalation and scheduled-task notifications only.' §5 of the same runbook confirms 'there is no account-lifecycle email path in this product today.' Consequence recorded: individual intimation 'is manual, which does not scale past a small breach.'

**Done when.** Build a mass-notification path for arbitrary affected-user lists on the existing transactional-email primitive, or formally accept the manual in-product-notice + public-notice-page + best-effort-direct-email fallback described in §5 and record that acceptance.

**Where.** `apps/web/lib/support/handoff/resend-client.ts`

**From.** BREACH_RUNBOOK.md#open-gaps row 2

### EXT-07 — Chrome extension exposes no privacy notice anywhere in its UI while injecting into every page, requesting debugger and cookies permissions, and mirroring chats to the cloud with no opt-out

`HIGH` · extension · effort M

**What.** manifest.json injects a content script into every http/https page and requests debugger and cookies permissions; conversationSync.ts mirrors chat transcripts to the cloud with no opt-out; and options.html contains no privacy notice. The legal-text and consent-record obligations overlap the compliance slice, but the missing in-product disclosure is an extension UI defect.

**Done when.** The extension shows its data-handling disclosure inside its own UI before first use, and cloud mirroring is something the user can see and decline.

**Where.** `apps/extension/manifest.json:22,37`, `apps/extension/src/features/content/cloud-bridge/conversationSync.ts:15`, `apps/extension/src/options.html:1`

**From.** DPDP_PROGRESS.md (O-16)

### MOB-05 — Mobile presents no privacy notice during onboarding and requests a Contacts permission no code reads

`HIGH` · mobile · effort M

**What.** apps/mobile/app/(public)/onboarding.tsx presents no privacy notice before or during onboarding; the iOS privacy manifest declares only Email and Name, omitting user content and device identifiers; and the app requests a Contacts permission that no code reads.

**Done when.** Add a privacy notice to onboarding, correct the manifest declarations, and remove the unused Contacts permission request.

**Where.** `apps/mobile/app/(public)/onboarding.tsx:1`, `apps/mobile/app.config.js:162`, `apps/mobile/src/deviceIntegrations.ts:104`

**From.** DPDP_PROGRESS.md (O-17)

### MOB-06 — Mobile age gate is self-declared with no verifiable parental consent, and minor-safe mode is child-clearable

`HIGH` · mobile · effort XL

**What.** The age-gate screen's own module contract states there is no parental-consent flow in v1 and that minor-safe mode is a content filter only; the gate is self-declared and the mode is clearable by the child. Web has no age gate at all. Cited as the highest legal exposure in the compliance audit (DPDP s.9). Family account linking is explicitly declined for the current device-only scope.

Also recorded by a later audit (MS-19 Parental account linking — decided, not yet built): Names the missing mechanism behind MOB-06's 'no verifiable parental consent': MS-19 (parental account linking) is a founder-approved Build item that requires a new account-linking server contract, which does not exist. This is the concrete construction that would replace the self-declared, child-clearable age gate.

**Done when.** Design a verifiable parental-consent path (or explicitly restrict the product's minimum age) and make minor-safe mode non-clearable by the account it protects.

**Where.** `apps/mobile/app/(public)/age-gate.tsx:17`, `apps/mobile/src/features/settings/parental-controls/index.tsx:36`

**Blocked by.** legal/product decision on the verifiable-consent mechanism

**From.** DPDP_PROGRESS.md (O-2 / L-4); audit/ui-gaps.md (GAP-023); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-023: Family account linking not planned for the current device-only age-settings scope

### TEST-18 — Zero test coverage for either live account-deletion flow

`HIGH` · testing · effort S

**What.** duplication/README.md and settings-and-nav.md §3a: grepping every .test.tsx under apps/web for 'Delete account' / handleDeleteAccount / delete-account returns zero hits, for both AccountSection.tsx and PrivacySection.tsx — each of which triggers an irreversible operation, on the compliance/dpdp branch, with a known behavioural divergence between them (see WEB-47).

**Done when.** Add coverage for both delete-account flows before or alongside collapsing them into one implementation.

**Where.** `apps/web/features/settings/sections/AccountSection.tsx`, `apps/web/features/settings/sections/PrivacySection.tsx`

**From.** audit/competitive-gap-2026-08-15/duplication/README.md; audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §3a

### DESK-24 — Desktop support-bundle redaction default (no conversation content) is unverified

`MEDIUM` · desktop · effort S · **in-progress**

**What.** 32 desktop modules reference diagnostics/support-bundle machinery, but nothing proves the generated bundle excludes conversation content by default. One test asserting no message text appears in a generated bundle is the missing evidence.

**Done when.** Add a test that generates a real support bundle from a session with known message text and asserts that text is absent.

**Where.** `apps/desktop/src-tauri/src/sys/commands`

**From.** AuditRemediationLedger.md (REL-010)

### DPDP-12 — The signed-in app shell has no legal footer, so the grievance contact is unreachable from inside the product

`MEDIUM` · compliance/dpdp · effort S

**What.** O-9: WebAppShell.tsx has no legal footer. It was deliberately left unedited because the file carries uncommitted changes from other work.

**Done when.** Add a legal footer to the signed-in shell linking the privacy notice, terms and the grievance contact, coordinating with whoever owns the in-flight changes to that file.

**Where.** `apps/web/shared/components/layout/WebAppShell.tsx:301`

**From.** DPDP_PROGRESS.md O-9

**Folded in.** O-9 Signed-in app shell has no legal footer

### DPDP-15 — No nomination field exists (DPDP s.14) — nominations are handled manually via the request form

`MEDIUM` · compliance/dpdp · effort M

**What.** O-12: the statutory nomination right is currently handled only through the general request form, and this is disclosed as unfinished on the notice page.

**Done when.** Add a nomination field and storage so a data principal can nominate another person to exercise their rights, and remove the interim disclosure once it works.

**From.** DPDP_PROGRESS.md O-12

**Folded in.** O-12 No nomination field (DPDP s.14)

### DPDP-20 — /trust and /security omit any Indian data-protection obligation

`MEDIUM` · compliance/dpdp · effort S

**What.** O-18: the /trust page has GDPR and CCPA rows but no DPDP row, and /security's 'what we have not done' list names the EU Art. 27 gap but no Indian obligation — while the mobile store listings simultaneously publish an unqualified DPDP compliance claim (DPDP-27).

**Done when.** Add a DPDP row to /trust reflecting the true position and name the outstanding Indian obligations in /security's gap list, so the public pages agree with the store listing.

**Where.** `apps/web/app/trust/page.tsx:33`, `apps/web/app/security/page.tsx:372`

**From.** DPDP_PROGRESS.md O-18

**Folded in.** O-18 /trust has GDPR and CCPA rows but no DPDP row

### DPDP-26 — Breach notification templates are engineer-drafted from statute and unreviewed by counsel

`MEDIUM` · compliance/dpdp · effort S

**What.** L-9: the two BREACH_RUNBOOK.md notification templates (Board and Data Principal) were drafted by an engineer from the statute text and have not been reviewed by counsel before any real send.

Also recorded by a later audit (Breach runbook and its notification templates have not been reviewed by counsel): BREACH_RUNBOOK.md status line ('Draft — not reviewed by counsel') and open-gaps row 8 ('The templates are drafted from the statute by an engineer. Have them reviewed before they are ever sent'), corroborated by DPDP_PROGRESS.md: 'no legal copy on this branch has been reviewed by counsel.' Scope is both the §4 Board-notification and §5 Data-Principal-notification templates.

**Done when.** Have counsel review and approve both templates before the runbook is used in a real incident.

**Where.** `BREACH_RUNBOOK.md`

**Blocked by.** Legal review

**From.** DPDP_PROGRESS.md L-9; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** L-9 BREACH_RUNBOOK.md notification templates unreviewed by counsel

### DPDP-40 — Eleven legacy or dead database tables and an authored-but-unapplied drop migration are untracked as a group, so the erasure-only tables and the founder-gated 0058 drop will need re-discovery

`MEDIUM` · compliance/dpdp · effort S

**What.** DEAD-CODE-006 and BACKEND-RUNTIME-013 (audit/parity-2026-08-15). Nine tables — agent_tools, agent_tool_executions, agent_approval_requests, chat_messages, chat_folders, message_bookmarks, message_reactions, user_shortcuts, messaging_connections — are touched only by the GDPR/DPDP account-erasure sweep (apps/web/lib/server/account-erasure.ts:60-91). Two more, referrals and cloud_waitlist, have zero application-code references at all. Migration 0058_drop_legacy_teams.sql for teams/team_members is fully written but its header states it is founder-gated and not applied. This is legitimate, correctly-managed debt, but nothing consolidates it, so the erasure sweep's dependency on these tables is invisible to anyone considering a drop.

**Done when.** Add one tracked line item (known-flaws.md or a schema-debt doc) listing all eleven tables and the pending 0058 migration together; add a schema-level comment on each of the nine recording that it is retained for erasure completeness; delete referrals and cloud_waitlist outright.

**Where.** `apps/web/lib/server/account-erasure.ts:60-91`, `apps/web/db/neon/0058_drop_legacy_teams.sql:1-30`, `apps/web/lib/services/waitlistService.ts:10-12`

**From.** audit/parity-2026-08-15/gaps/domain-dead-code (DEAD-CODE-006); audit/parity-2026-08-15/gaps/domain-backend-runtime (BACKEND-RUNTIME-013)

**Folded in.** DEAD-CODE-006; BACKEND-RUNTIME-013

### DPDP-43 — The unmounted UserSettings.tsx delete handler calls the data-only erasure endpoint while telling the user their account is deleted and signing them out

`MEDIUM` · compliance/dpdp · effort S

**What.** duplication audit settings-and-nav.md §3b (audit/competitive-gap-2026-08-15/duplication/). UserSettings.tsx (584 lines, self-flagged 'NOT MOUNTED BY ANY ROUTE') has a handleDeleteAccount at lines 259-283 that calls DELETE /api/user/data — a GDPR Art.17 erasure endpoint whose own doc comment states it explicitly retains the profile/auth account (retainProfile:true) — while the success toast at line 272 says 'Account data deleted. You will be signed out' and redirects to /login. If this dead page is ever resurrected on the compliance/dpdp branch it presents a 'Delete account' CTA that does not delete the account, immediately after a compliance-relevant confirmation flow.

**Done when.** Do not resurrect this file without rewriting it to call /api/user/delete-account with matching copy; preferably delete UserSettings.tsx outright as part of the dead-settings cleanup.

**Where.** `apps/web/features/settings/pages/UserSettings.tsx:259-283,272`, `apps/web/app/api/user/data/route.ts:16-52,189-195`, `apps/web/app/api/user/delete-account/route.ts:16-49`

**From.** audit/competitive-gap-2026-08-15/duplication/settings-and-nav.md §3b

### DPDP-45 — The temporary-chat memory exclusion is enforced only on the live request path; the second web chat runtime injects saved memory with no isTemporary check

`MEDIUM` · compliance/dpdp · effort S

**What.** MEMORY-010 (audit/parity-2026-08-15) plus the 'Temporary chat excludes memory — Partial' row in docs/current/parity-implementation-matrix.md#Memory And Personalization. apps/web/lib/runtime/WebChatRuntime.ts:181-189 unconditionally injects saved memory facts whenever Memory is enabled, with no isTemporary short-circuit, unlike the production path (request-processor.ts:976-996's enrichManagedMemoryContext, which correctly short-circuits). UnifiedChatPage.tsx:44-67 is currently unreachable (zero importers besides its own tests; /chat renders a different page), so the guarantee holds today only by accident of routing — any route change that makes it reachable silently breaks the temporary-chat promise on every surface that adopts it.

**Done when.** If UnifiedChatPage/WebChatRuntime remain on the roadmap, add the same isTemporary short-circuit before merging any route change that makes them reachable; otherwise delete both files. Add a cross-surface test asserting no runtime injects memory into a temporary chat.

**Where.** `apps/web/lib/runtime/WebChatRuntime.ts:181-189`, `apps/web/features/chat/pages/UnifiedChatPage.tsx:44-67`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:976-996`

**From.** audit/parity-2026-08-15/gaps/domain-memory (MEMORY-010); docs/current/parity-implementation-matrix.md#Memory And Personalization

**Folded in.** MEMORY-010; parity-matrix 'Temporary chat excludes memory'

### DPDP-47 — No published commercial or enterprise legal-terms document exists distinct from the consumer Terms — enterprise terms are bespoke-negotiated only

`MEDIUM` · compliance/dpdp · effort M

**What.** legal-trust-03 (competitive-gap-2026-08-15). apps/web/app/enterprise/page.tsx:109-112 and apps/web/app/terms/page.tsx:450-453 confirm the posture explicitly ('We negotiate against your procurement. No forced click-through.'), and no /enterprise-terms, /commercial-terms or MSA route exists. Distinct from DPDP-25 (the DPA's missing DPDP annex) — this is the absence of any standard-form commercial agreement.

**Done when.** Founder/legal decision per legal-constants.ts's own FOUNDER CONFIRMATION REQUIRED convention: either publish a standard-form commercial terms template, or state the bespoke-only posture explicitly on /enterprise so procurement is not left guessing.

**Where.** `apps/web/app/enterprise/page.tsx:109-112`, `apps/web/app/terms/page.tsx:450-453`

**From.** audit/competitive-gap-2026-08-15/domains/legal-policy-trust (legal-trust-03, claim legal-10)

### DPDP-52 — Deleting a project permanently orphans its knowledge files — the soft delete never fires the ON DELETE CASCADE, there is no restore endpoint, and the dialog never mentions files

`MEDIUM` · compliance/dpdp · effort M

**What.** PROJ-WS-03 (competitive-gap-2026-08-15). Project deletion soft-deletes (sets deleted_at) and moves conversations out (apps/web/app/api/projects/[id]/route.ts:283-337), but project_knowledge_files.project_id carries an 'on delete cascade' (apps/web/db/neon/0006_projects.sql:18) that can only fire on a hard DELETE, which never happens; no restore/undelete endpoint exists either, so the files are neither reachable nor removed. The confirmation dialog never mentions knowledge files at all. Distinct from DPDP-37 (deletion not propagating to object storage, indexes, caches, backups) — this is orphaned rows and uploaded user content inside the primary database, left by a delete the user believes completed.

**Done when.** Either add explicit knowledge-file cleanup (rows and stored objects) to the project delete path, or add a project-restore endpoint and update the dialog copy to describe the real retention behavior.

**Where.** `apps/web/app/api/projects/[id]/route.ts:283-337`, `apps/web/db/neon/0006_projects.sql:18`

**From.** audit/competitive-gap-2026-08-15/domains/projects-workspaces-notebooks-file-knowledge (PROJ-WS-03, claim projects-11)

### DPDP-55 — No breach-notice page and no in-product banner exist, so the delivery method the breach runbook assumes would have to be built during the incident

`MEDIUM` · compliance/dpdp · effort M

**What.** BREACH_RUNBOOK.md open-gaps table row 3: 'No breach-notice page or in-product banner exists.' Consequence: 'The delivery method §5 assumes has to be built during the incident.'

**Done when.** Build a dated public breach-notice page and an in-product sign-in banner ahead of any incident, so §5's delivery path exists before it is needed.

**From.** BREACH_RUNBOOK.md#open-gaps row 3

### DPDP-56 — Security audit log 90-day retention is a routine an administrator runs by hand, not a schedule, so the retention actually applied is unknown and a late-discovered incident may have no trail

`MEDIUM` · compliance/dpdp · effort S

**What.** BREACH_RUNBOOK.md open-gaps table row 4 and §2: 'Security audit log retention is manual. The 90-day purge is a routine an administrator runs, not a schedule.' Consequence: 'An incident discovered late may have no audit trail, and the retention actually applied is unknown.' Distinct from DPDP-16 (waitlist/support/rights-request retention with two unregistered lifecycle crons) — different table, different mechanism, and here the risk runs in both directions (evidence lost, or retained beyond policy).

**Done when.** Convert the manual 90-day purge of public.security_audit_logs into an enforced scheduled job with an auditable, provable retention guarantee.

**Where.** `public.security_audit_logs`, `cleanup_old_security_logs()`

**From.** BREACH_RUNBOOK.md#open-gaps row 4

### DPDP-58 — Desktop native crash-dump upload was removed for consent reasons and has no consent-safe replacement — rebuilding it requires a typed runtime consent bridge that does not exist

`MEDIUM` · compliance/dpdp · effort L

**What.** docs/adr/wire-or-cut.md#2026-07-30 Crash-reporting Runtime Boundary. The optional Rust Sentry feature was compiled out of every release and initialized before renderer-owned consent state was available, so both native egress paths were removed. The ledger records the preconditions for any future native uploader: a typed runtime consent bridge, Managed-mode enforcement, packaged configuration, symbol upload, and end-to-end release verification — none of which exists. Recorded so a future crash-reporting effort does not re-introduce pre-consent native egress. Distinct from DPDP-07 (desktop telemetry constructed enabled, bypassing the consent gate and surviving Delete All Data), which is a live defect in a different subsystem.

**Done when.** Do not re-enable native crash-dump upload until a typed runtime consent bridge exists and Managed-mode enforcement, packaged config, symbol upload and release verification are all proven; product crash reporting on Web/Desktop renderer already fails closed and is unaffected.

**From.** docs/adr/wire-or-cut.md#2026-07-30 Crash-reporting Runtime Boundary

### MOB-04 — Locked iOS privacy-manifest review copy has drifted from the real generated manifest and cites a deleted path

`MEDIUM` · mobile · effort M

**What.** The locked review copy is missing the C56D.1 FileTimestamp required-reason code and the NSPrivacyTrackingDomains that the real prebuild-generated manifest carries, and it cites a deleted path as canonical. Related and worse: the store listings declare only Email and Name and 'shares nothing' while the published subprocessors page names Anthropic, OpenAI, Google, xAI and DeepSeek and the cloud path uploads whole conversations.

**Done when.** Regenerate the locked review copy from the prebuild output in CI so it cannot drift, and correct the App Store and Play data declarations to match the real recipient list.

**Where.** `apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy`, `apps/mobile/app.config.js`

**Blocked by.** founder must correct App Store/Play Console declarations

**From.** docs/agent-context/known-flaws.md (MOBILE-PRIVACY-MANIFEST-LOCKED-COPY-DRIFT-01); ExecutionPlan.md (founder action #9)

**Folded in.** Founder action: App Store / Play privacy declarations misstate what data is shared

### SEC-63 — Chrome extension requests all-URLs content script, debugger and cookies permissions with no in-product disclosure of what they enable

`MEDIUM` · security · effort M

**What.** DPDP_PROGRESS O-16: the extension injects a content script into every http/https page, requests the `debugger` and `cookies` permissions, mirrors chat transcripts to the cloud with no opt-out, and exposes no privacy notice anywhere in its UI (options.html has none). F-scan finding F4-adjacent context confirms the debugger permission is used for real browser automation (cdpDriver), and the ExecutionPlan visual audit separately records that full DevTools-Protocol browser control has no elevated-risk gate or disclosure. Combined with SEC-04 (the public page claims nothing leaves the desktop) and SEC-15 (PII autofill with no allowlist check on that path), the extension's actual capability set is materially broader than anything the user is shown.

**Done when.** The extension's options and first-run surfaces disclose exactly what the all-URLs content script, debugger and cookies permissions enable and what is transmitted to the cloud, transcript mirroring is opt-out, and full-CDP control sits behind an explicit elevated-risk consent rather than the ordinary allowlist.

**Where.** `apps/extension/manifest.json:22,37`, `apps/extension/src/options.html`, `apps/extension/src/features/computer-use/cdpDriver.ts`, `apps/extension/src/features/content/cloud-bridge/conversationSync.ts:15`

**From.** DPDP_PROGRESS.md (O-16); ExecutionPlan.md (Chrome extension audit); phase4-capability-audit.md (PP-15)

### TEST-11 — The support-bundle redaction default is unverified — nothing proves conversation content is excluded

`MEDIUM` · testing · effort S

**What.** REL-010 triage (2026-08-09), PARTIALLY SATISFIED: 32 desktop modules reference diagnostics and support-bundle machinery, but nothing proves the generated bundle excludes conversation content by default — the fix is one test asserting no message text appears in the bundle. PP-30 records the same doubt from the product side: support diagnostics redaction and correlation-ID linkage are unconfirmed. Overlaps the compliance slice, since an unredacted bundle is a data-disclosure defect, but the missing artifact is a test.

**Done when.** A test asserts that a generated support bundle contains no conversation content by default, so the redaction claim is demonstrated rather than assumed.

**From.** AuditRemediationLedger.md

**Folded in.** REL-010 Support-bundle redaction default unverified; PP-30 support diagnostics redaction unconfirmed

### DPDP-44 — No disclosure of whether saved memory personalizes outbound tool or web-search queries, and nobody has established whether it does

`LOW` · compliance/dpdp · effort S · **unclear**

**What.** memory-05-gap (competitive-gap-2026-08-15). Grepping settings for 'search provider' / 'bing' / 'personalize.*quer' / 'outbound.*search' returns zero hits; whether memory actually feeds tool-call query construction server-side was not verified either way in that pass. The finding is specifically about absent disclosure, but it cannot be closed without first establishing the behavior — and if memory does shape outbound third-party queries, that is a recipient-disclosure question, not only a copy question.

**Done when.** Determine whether memory currently feeds tool-call/web-search query construction server-side; if it does, add a disclosure line to CapabilitiesSection and reconcile with /subprocessors and the privacy notice; if not, record the negative finding.

**From.** audit/competitive-gap-2026-08-15/domains/memory-personalization (memory-05-gap)

### DPDP-46 — No ad-personalization opt-out exists, and it has never been confirmed whether any advertising vendor receives account data

`LOW` · compliance/dpdp · effort S · **unclear**

**What.** settings-15-gap (competitive-gap-2026-08-15). Grepping every settings section for ads/Ads/advertis returns zero matches referring to an actual ad-personalization control, and no evidence was found of a program such a toggle would gate. Recorded because the absence of a control is only correct if the absence of a vendor relationship is verified — an unverified negative in a privacy-notice-relevant area.

**Done when.** Confirm whether AGI Workforce shares account data with any advertising vendor; if so, build the opt-out and disclose the recipient on /subprocessors, if not, record the negative finding so it is not re-raised.

**Where.** `apps/web/features/settings/sections`

**From.** audit/competitive-gap-2026-08-15/domains/settings (settings-15-gap)

### DPDP-48 — No commercial-tier dispute-resolution stance exists, so consumer arbitration terms apply by default to every paying tier absent a signed MSA

`LOW` · compliance/dpdp · effort S

**What.** legal-trust-04 (competitive-gap-2026-08-15). Because no commercial terms document exists (legal-trust-03), the consumer /terms dispute-resolution clause (arbitration with a 30-day opt-out, apps/web/app/terms/page.tsx:450-453) governs every tier unless a bespoke MSA overrides it — a default rather than a decision.

**Done when.** Decide the commercial-tier dispute-resolution stance deliberately at the same time the commercial terms document is written.

**Where.** `apps/web/app/terms/page.tsx:450-453`

**Blocked by.** DPDP-47 — no commercial terms document exists to carry the clause

**From.** audit/competitive-gap-2026-08-15/domains/legal-policy-trust (legal-trust-04, claim legal-04)

### DPDP-49 — The privacy notice says nothing about non-account-holder third parties whose personal data enters the product through a user's connectors or conversations

`LOW` · compliance/dpdp · effort S

**What.** legal-trust-05 (competitive-gap-2026-08-15). Grepping apps/web/app/privacy/page.tsx for 'non-user', 'third part(y|ies)', 'someone else', 'another person' returns only one unrelated organizational-data-retention note at line 709; no paragraph covers personal data about people who never created an account — e.g. contact details pulled in via a Gmail or calendar connector. Distinct from DPDP-14 (the 'what we collect' table omitting categories the product collects from its own users).

**Done when.** Add a short dedicated paragraph covering third-party personal data entering the product via a user's connectors and uploads, with the lawful-basis and rights position stated.

**Where.** `apps/web/app/privacy/page.tsx:709`

**From.** audit/competitive-gap-2026-08-15/domains/legal-policy-trust (legal-trust-05, claim legal-14)

### DPDP-50 — Consumer Terms and Privacy are a single worldwide document with Texas governing law and no EEA/UK/Switzerland variant

`LOW` · compliance/dpdp · effort L

**What.** legal-trust-07 (competitive-gap-2026-08-15). apps/web/lib/legal-constants.ts:40 fixes GOVERNING_LAW to Texas with no regional branch; terms/page.tsx and privacy/page.tsx are single global documents, and terms/page.tsx:585-591 honestly discloses that no EU/UK/India data residency is offered. The DPA (apps/web/app/dpa/page.tsx:400-430) does carry GDPR/UK-Addendum/Swiss-SCC transfer mechanics, but only for enterprise customers who sign it. Distinct from DPDP-17 (legal pages hardcoded English, blocking the Eighth Schedule language requirement).

**Done when.** Low priority; revisit only if EU/UK data residency becomes a real product commitment, at which point a regional Terms/Privacy variant is required rather than optional.

**Where.** `apps/web/lib/legal-constants.ts:40`, `apps/web/app/terms/page.tsx:585-591`, `apps/web/app/dpa/page.tsx:400-430`

**From.** audit/competitive-gap-2026-08-15/domains/legal-policy-trust (legal-trust-07, claim legal-21)

### DPDP-51 — No MCP marketplace listing policy — correctly not written, because no curated marketplace is operated

`LOW` · compliance/dpdp · effort S · **wontfix**

**What.** legal-trust-08 (competitive-gap-2026-08-15). apps/web/app/connectors/mcp-directory/page.tsx:120-125 states that AGI does not mirror, curate, or sign any MCP servers and points to the official MCP registry; apps/web/app/acceptable-use/page.tsx:214-224 already disclaims vetting responsibility for custom MCP servers. Recorded as wontfix so a future competitive pass does not re-raise it as a missing policy.

**Done when.** No action. A listing policy becomes required only if AGI builds a curated marketplace it does not currently operate — at which point re-open rather than reuse this entry.

**Where.** `apps/web/app/connectors/mcp-directory/page.tsx:120-125`, `apps/web/app/acceptable-use/page.tsx:214-224`

**From.** audit/competitive-gap-2026-08-15/domains/legal-policy-trust (legal-trust-08, claim legal-19)

### DPDP-57 — Vendor log retention (Vercel, Neon) is set by the vendors, so breach evidence may expire before the investigation reaches it

`LOW` · compliance/dpdp · effort M

**What.** BREACH_RUNBOOK.md open-gaps table row 5: 'Vendor log retention is not set by us. Vercel and Neon retain on their own schedules.' Consequence: 'Evidence may expire before the investigation reaches it.'

**Done when.** Confirm each vendor's current retention window and, where the plan allows, extend it or export logs to storage under our control so incident evidence outlives realistic investigation timelines.

**From.** BREACH_RUNBOOK.md#open-gaps row 5
