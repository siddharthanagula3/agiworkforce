---
id: "SYS-security-and-privacy"
type: "system"
title: "Security and privacy"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Security and privacy

AGI Workforce guards secrets with a repo-wide scanner and encrypted key rings. Cloud-bound egress is blocked in Local mode by shared host rules and per-surface guards. Uploads get structural, credential and ClamAV checks that fail closed in production. Users get export (24-hour link), 24-hour delayed deletion, 30-day recovery, 2FA, passkeys and step-up. Public claims are tied to tests, and no SOC 2, ISO or pen-test is claimed.

## What it is and why it exists

This page covers the security model of AGI Workforce and the privacy controls a user can reach. It exists so that public copy, settings screens and engineering rules all say what the code does.

**Core idea.** Rules are enforced by guards (scripts that fail CI) and by claim ledgers (files that tie each public sentence to code and a test). A document that disagrees with code is a bug in the document. [requirement] (AGENTS.md section 2; docs/security/security.md:5-13)

**Three trust boundaries.** Local, BYOK (bring your own key) and Managed Cloud are separate. Nothing may silently move a Local chat, file or session to BYOK or cloud. [requirement] (AGENTS.md section 6)

**Why the claim ledgers exist.** An earlier audit found marketing copy that described a permission model the code did not implement. The fix was one matrix that copy is rendered against. [code] (docs/security/security.md:34-39)

**Honesty about certification.** The public trust page says no SOC 2 report, ISO 27001 certificate or third-party penetration test exists. [code] (apps/web/app/trust/page.tsx:87, 289). The ledger rows are in docs/compliance/trust-claims.json (39 rows: EVIDENCE, COMPLIANCE, POSTURE) and are reviewed on a 90-day cadence. [code] (docs/compliance/trust-claims.json:2-3)

Related pages: SYS-chat-turn-pipeline (tool loop that calls the approval gate), and any page on billing, connectors and the model catalog.

## How it works today

### 1. Secrets handling

- **Repository scan.** `pnpm check:secrets` runs scripts/check-secrets.mjs. It reads files tracked by git and matches named credential shapes: PEM private keys, Anthropic, OpenAI, Groq, xAI, Stripe live, Slack, GitHub, Google, AWS, Supabase, OpenRouter, Perplexity and generic `sk-` keys, plus Postgres/Redis URLs with passwords and JSON private keys. [code] (scripts/check-secrets.mjs:25-62). Obvious fakes are masked (words like EXAMPLE, counting runs of six or more characters). [code] (scripts/check-secrets.mjs:10-13, 64-120). Reviewed exceptions live in scripts/secret-scan-allowlist.json, keyed by path and credential format; stale entries are reported. [code] (scripts/secret-scan-allowlist.json:1-20). `--history` also scans git history objects with no allowlist. [code] (scripts/check-secrets.mjs:429-471; package.json:433). It runs inside `pnpm check:llm-operability`. [code] (package.json:397)
- **Other secret guards.** check-client-bundle-secrets (secrets in shipped client bundles), check-cli-local-secret (no literal credential in CLI local servers), check-connector-secret-reseal (every connector secret class has a re-seal column), check-crypto-context-binding. [code] (scripts/check-cli-local-secret.mjs:1-6; scripts/check-connector-secret-reseal.mjs; package.json:233,311)
- **Encryption at rest.** Connector tokens, GitHub installation tokens and TOTP secrets are AES-256-GCM sealed by a key ring: an active key, an id and a retired list (`<NAME>`, `<NAME>_ID`, `<NAME>_RETIRED`). [requirement] (docs/security/security.md:657-714). Three keys are on a 12-month rotation, next due 2027-08-17. [requirement] (docs/security/security.md:750-754). Keys live only in deployment environment variables; the doc records this as an accepted risk (no KMS, no escrow). [requirement] (docs/security/security.md:761-790). KMS adapters for AWS, GCP and Azure exist behind a provider seam but the default is `env`. [requirement] (docs/security/security.md:819-827)
- **Where each client keeps credentials.** CLI: OS keychain on macOS and Windows; owner-only files on Linux or when `AGIWORKFORCE_NO_KEYRING` is set. [code] (apps/cli/src/secure_store.rs:1-6). Mobile: the database key is held in expo-secure-store, accessible only when unlocked and this device only. [code] (apps/mobile/storage/db.ts:2,45-52). Chrome extension: `chrome.storage.local` holds settings such as the site allowlist. [code] (apps/extension/src/background.ts:4118-4138). Desktop: the hosted web session lives in an app-only browser profile; the CLI keeps the sign-in in the OS store; Desktop accepts no provider keys. [requirement] (apps/web/app/trust/page.tsx:179-182). VS Code: [unknown] where provider keys are stored (a providerSetup grep for `secrets.` returned nothing).

### 2. Egress rules

- **Local mode must never reach our cloud.** The shared package `@agiworkforce/trust-boundaries` holds `OUR_CLOUD_HOSTS` (agiworkforce.com, vercel.app, neon.tech and four Clerk domains) and `isOurCloudHost`, a suffix match. BYOK provider hosts are deliberately not on the list. [code] (packages/contracts/trust-boundaries/src/egress-policy.ts:33-72)
- **Per-surface chokepoints.** Desktop's `guardedFetch` throws before any network call when the workspace is Local and the host is ours. [code] (apps/desktop/src/lib/egressGuard.ts:1-60). Mobile has its own `apps/mobile/lib/egressGuard.ts` with a path allowlist (account deletion, data export, step-up and similar). [code] (apps/mobile/__tests__/trust-boundary.test.ts:21-37)
- **Guards that enforce it.** check-desktop-local-egress (every renderer outbound call must be `guardedFetch`, files enumerated from the tree), check-rust-egress-boundary (Rust HTTP use outside an allowlist of 22 files fails), check-security-egress-inventory (every server outbound target is a repo-chosen host or resolved and refused before the socket opens), check-mcp-dial-egress (every MCP dial names `MCP_EGRESS_POLICY`). [code] (scripts/check-desktop-local-egress.mjs; scripts/check-rust-egress-boundary.mjs:10-33; scripts/check-security-egress-inventory.mjs; scripts/check-mcp-dial-egress.mjs)
- **Server-side limits.** Remote MCP endpoints pass DNS-resolution SSRF validation. Code sandboxes (E2B) default to no network or a fixed allowlist of code hosts, and extra hosts are resolved and refused if private. A raw managed provider key never enters a sandbox. [requirement] (docs/security/security.md:309, 358-392)

### 3. Tool approval and the lethal-trifecta gate

`resolveToolCallGate` evaluates nine ranks: a saved `deny` wins, a saved `allow` is overridden by the trifecta, and an escalation never becomes an allow (unattended runs pause at a checkpoint or deny). [code] (apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:138-159). The trifecta is: untrusted content in context, plus a reachable sensitive source, plus a call that creates an egress path. Pasted user text is not counted as untrusted. [requirement] (docs/security/security.md:201-217). A saved Block is enforced at execution, not by hiding the tool from the model. [requirement] (docs/security/security.md:219-229). The website account default is `autonomous`. [code] (packages/contracts/types/src/tool-approval-policy.ts:13)

### 4. Upload scanning

Every route that materialises user-uploaded bytes runs the same three steps: structural inspection, credential scan, external scan. [requirement] (docs/security/upload-scanning.md:5-30). The external scanner is our own ClamAV service (services/upload-scanner). In production the scanner is required unless `UPLOAD_SCAN_REQUIRED=false`; with no `UPLOAD_SCAN_WEBHOOK_URL` and required, every upload is refused with `scan_unavailable`. [code] (apps/web/lib/security/upload-scan.ts:408-436). A non-OK scanner reply, a timeout (15 s on the web side) or an unsafe verdict all refuse the file. [code] (apps/web/lib/security/upload-scan.ts:442-480). Password-protected files are refused with a dedicated message. [requirement] (docs/security/upload-scanning.md:77-85)

### 5. Account security

Step-up (fresh reverification) is demanded for account deletion, 2FA changes, identity unlink, email change, password change, API-credential reveal, passkey enrolment and change, and workspace ownership transfer. The window is 300 s (120 s for revealing an API credential). [code] (apps/web/lib/server/step-up/actions.ts:15-58). Settings shows sessions, a log-out-everywhere action behind step-up, a session timeout, passkeys, 2FA and linked devices. [code] (apps/web/features/settings/sections/SecuritySection.tsx:49-130, 192-214; apps/web/features/settings/components/LinkedDevicesPanel.tsx:154-206). Suspended or banned accounts get 403 on every authenticated request, failing closed after one retry. [requirement] (docs/security/security.md:345)

### 6. Privacy controls (web settings)

The Privacy section offers: crash and error reports (default off), "Only use models that do not train on your chats" (default off), two model-improvement switches for chats and voice (default off; the screen says nothing is used for this today), product-analytics and marketing-email consent, named-provider consent rows, a US-only routing panel, shared links, archived chats, Recently deleted, bulk conversation controls, temporary-by-default chats, a privacy-requests page, a Library link for uploaded files, and data export. [code] (apps/web/features/settings/sections/PrivacySection.tsx:46-122, 560-870). A Lockdown mode panel stores a preference. [code] (apps/web/features/settings/components/LockdownModePanel.tsx:1-40); what lockdown enforces server-side is [unknown].

### 7. Export and deletion

- **Export.** `GET/POST /api/user/export` and `/api/user/export/archives` build a JSON export or a zip archive by background job; the download link works for 24 hours, then an expire job removes the archive. [code] (apps/web/app/api/user/export/route.ts:3456-3458; packages/contracts/cloud-contracts/src/data-export.ts:7; docs/architecture/RETENTION_MATRIX.md:84)
- **Deletion.** `DELETE /api/user/delete-account` requires step-up, refuses while the account is sole owner of a workspace (409), and schedules erasure 24 hours ahead; the user can cancel in that window. [code] (apps/web/app/api/user/delete-account/route.ts:440-481). Erasure sweeps rows, object-store bytes, caches and email-keyed tables, and reports `complete` only when every store cleared. [requirement] (docs/security/security.md:1158-1168)
- **Soft delete and temporary chats.** A deleted chat sits in Recently deleted for 30 days (`RESOURCE_RECOVERY_WINDOW_DAYS = 30`). Temporary chats and attachments are purged after 30 days (`RETENTION_DAYS = 30`). [code] (apps/web/lib/resources/deletion-policies.ts:8; apps/web/app/api/cron/purge-temporary-chats/route.ts:24). The soft-delete purge cron only deletes when `SOFT_DELETED_RESOURCE_PURGE_ENABLED` is `true`. [code] (apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:15)

### 8. Legal hold

The hold predicate sits inside every destructive WHERE clause; account and workspace erasure refuse outright when a hold applies. [requirement] (docs/security/security.md:1170-1180). A hold beats the temporary-chat promise. [requirement] (docs/security/security.md:1199-1202)

## Implementation map

| Concern | Where it lives | Basis |
|---|---|---|
| Secret scan | scripts/check-secrets.mjs, scripts/secret-scan-allowlist.json, scripts/check-secrets.test.mjs | [code] |
| Runtime secret patterns and redaction | apps/web/lib/security/secret-patterns.ts, secrets-audit.ts, outbound-content-inspection.ts (channels connector_write, share, artifact_publish, upload) | [code] (outbound-content-inspection.ts:12) |
| Key ring and sealing | apps/web/lib/crypto/envelope.ts, custom-connector-crypto.ts, totp-envelope.ts; scripts/reencrypt.mjs | [requirement] (security.md:701-740) |
| Shared egress host list | packages/contracts/trust-trust-boundaries... see packages/contracts/trust-boundaries/src/egress-policy.ts | [code] |
| Desktop egress | apps/desktop/src/lib/egressGuard.ts | [code] |
| Mobile egress | apps/mobile/lib/egressGuard.ts | [code] (via test import) |
| Rust egress | scripts/check-rust-egress-boundary.mjs, scripts/lib/rust-egress-boundary.mjs | [code] |
| Server egress and SSRF | apps/web/lib/egress-policy.ts, check-security-egress-inventory | [code] (trust-claims.json) |
| Tool gate | apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts, tool-loop.ts, tool-metadata.ts | [code] |
| Upload scan | apps/web/lib/security/upload-scan.ts, services/upload-scanner, docs/security/upload-scanning.md | [code] |
| Step-up | apps/web/lib/server/step-up/actions.ts, grant-token.ts, second-factor.ts | [code] |
| Passkeys and account security | apps/web/lib/server/account-security/*, apps/web/app/api/account-security/* | [code] |
| 2FA and sessions | apps/web/app/api/settings/2fa/*, apps/web/app/api/settings/sessions/* | [code] |
| Settings UI | apps/web/features/settings/sections/PrivacySection.tsx, SecuritySection.tsx, AccountSection.tsx; components DataExportRow, LockdownModePanel, UsOnlyRoutingPanel, ProductAnalyticsConsentRow, NamedProviderConsentRows, LinkedDevicesPanel | [code] |
| Export | apps/web/app/api/user/export/route.ts, archives/route.ts, lib/server/data-export-archive.ts | [code] |
| Deletion | apps/web/app/api/user/delete-account/{route,cancel,cancel-schedule}, lib/server/account-erasure.ts, organization-erasure.ts, erasure-tombstones.ts | [code] |
| Retention manifest | apps/web/lib/services/deletion-manifest.ts renders docs/architecture/RETENTION_MATRIX.md | [requirement] (RETENTION_MATRIX.md:7-12) |
| Retention crons | apps/web/app/api/cron/purge-deleted-accounts, purge-deleted-media, purge-soft-deleted-resources, purge-temporary-chats, purge-security-audit-logs | [code] |
| Claim ledgers | docs/security/security-claims.json (111 claims), docs/compliance/trust-claims.json (39 rows), apps/web/app/trust/page.tsx | [code] |
| Claim guards | scripts/check-security-claims.mjs, check-trust-claims.mjs, check-privacy-claims.mjs, check-support-claims.mjs | [code] |
| Trust-boundary tests | scripts/check-trust-boundaries.mjs runs per-surface tests (see Differences between apps) | [code] |

## Data and state

**Retention matrix.** docs/architecture/RETENTION_MATRIX.md lists every store (about 245 rows: tables, object stores and caches) with a data class, what erases it, and a maximum age. It is rendered from `deletion-manifest.ts`, and a test fails when file and code disagree. [requirement] (RETENTION_MATRIX.md:7-12). Data classes: customer_content, derived_content, operational_record, audit_trail, telemetry. [requirement] (RETENTION_MATRIX.md:14-15)

| Store | Maximum age | Notes | Basis |
|---|---|---|---|
| table:security_audit_logs | 90 days | purged by /api/cron/purge-security-audit-logs; survives account erasure | [requirement] (RETENTION_MATRIX.md:219) |
| table:usage_events | 730 days | also erased with the account | [requirement] (RETENTION_MATRIX.md:241) |
| table:credit_transactions | 2922 days (8 years) | financial retention | [requirement] (RETENTION_MATRIX.md:83) |
| table:organization_usage_ledger | 2922 days | subject detached at erasure | [requirement] (RETENTION_MATRIX.md:184) |
| table:credit_settlement_jobs | 90 days | | [requirement] (RETENTION_MATRIX.md:82) |
| table:signaling_sessions | 8 days | relay pairing ceiling | [requirement] (RETENTION_MATRIX.md:222) |
| data export archive objects | 24 hours after ready | | [code] (data-export.ts:7) |
| Deleted chats, messages, artifacts, projects | 30 days recovery | purge is off unless env switch is true | [code] |

**Stores that outlive an erased account on purpose** (reason stated in the matrix): table:erasure_tombstones (suppression list), table:copyright_notices, table:release_events, table:support_access_events (hash-chained audit), table:enterprise_audit_events, table:legal_hold_custodians, table:organizations, table:workspaces, billing disputes. [requirement] (RETENTION_MATRIX.md:44,46,65,80,107,109,126,185,205,230,267)

**Security tables.** table:account_security_credentials, account_security_enrollments, account_security_challenges, account_security_sessions, account_security_settings (cascade from profiles), table:user_two_factor, table:revoked_jwts, table:account_lockout_attempts, table:authentication_attempts, table:consent_records, table:data_rights_requests. [requirement] (RETENTION_MATRIX.md:22-28,73,85,210,254)

**Encrypted columns.** connector_oauth_grants.access_token_enc and refresh_token_enc, user_custom_connectors.auth_header_enc, github_installations.access_token_enc, user_two_factor.totp_secret_enc, plus bank, Slack, webhook and audit-destination secrets. Four connector-key columns have no key_version and are not swept, so the retired key must stay on the ring. [requirement] (security.md:657-687, 912-918)

**Device stores.** store:mobile secure store (database key), store:CLI OS keychain or owner-only files, store:chrome.storage.local (site allowlist), store:desktop app-only browser profile. [code] (see How it works today)

**Deletion graph guard.** scripts/check-retention-graph.mjs reads every live table from the migrations in apps/web/db/neon and requires each table with a subject reference to be reached by an erasure inventory, a cascade chain, or a written exemption. [requirement] (security.md:1136-1148)

## Rules: access, plans, modes

**Modes.**

| Mode | Rule | Basis |
|---|---|---|
| mode:local | Chats, files, telemetry and account data must not reach our cloud hosts; the guard blocks before the socket opens and fails closed when the mode is unknown | [code] (egress-policy.ts:1-20; egressGuard.ts:36-60) |
| mode:own-key | Client-direct to the user's own provider; provider hosts are not blocked; our servers never see the key traffic | [code] (egress-policy.ts:24-28) |
| mode:cloud | Server-side tool gate, sandbox limits, upload scan, connector grants and retention all apply | [code] |

The privacy screen says hosted Web and Desktop have neither Local nor BYOK, so everything sent there is a Cloud request. [code] (PrivacySection.tsx:486-500). A move from Local to BYOK must be an explicit fork with consent and a visible provider label. [requirement] (AGENTS.md section 6)

**Plans.**
- Free plan: the privacy screen warns that free-model providers may train on chats unless "Only use models that do not train on your chats" is on. [code] (PrivacySection.tsx:508-514)
- Connectors and Remote Control are paid capabilities (`BILLING_PLAN_CAPABILITY_TIERS`); `/api/pair/initiate` and `/api/pair/claim` refuse plans without `remote_control`. [requirement] (security.md:300-305)
- Per-plan caps: connector tool count, concurrent sandboxes, attachment size (every plan's max equals the scanner limit). [requirement] (security.md:307; upload-scanning.md:96-100)
- Rate limits: LLM 30 per minute per user, 1500 per minute per IP, both failClosed; conversation ops 60 per minute. [requirement] (security.md:347-349)

These are the same Subscription rules that apply on every app; security controls do not vary by plan, except the capability gates above.

**Claims the product may make.**
- Allowed: only what a ledger row proves. `check-security-claims` fails on a sentence with no entry or whose proof moved; `check-trust-claims` fails when text changes after review, a review is older than 90 days, or a proof moved. [code] (docs/security/security-claims.json:2-3; docs/compliance/trust-claims.json:2-3)
- Not allowed: SOC 2, ISO 27001, HIPAA, third-party pen-test claims; the ledger records none exist. [code] (trust/page.tsx:87)
- Must be said together: any claim about approval must also say write_file, execute_code and similar tools act in the conversation's own sandbox, not the user's device. [requirement] (security.md:192-199)
- Do not claim blocked tools are withheld from the model's offered catalog. [requirement] (security.md:225-229)
- Temporary-chat copy must carry the legal-hold exception. [requirement] (security.md:1199-1202)
- Public copy must not guess the GitHub App permission list; it is configured on GitHub and not declared in this repo. [requirement] (security.md:287-289)
- Local/BYOK public claims must be named by surface: the privacy screen assigns them to the CLI. [code] (PrivacySection.tsx:486-492)

## Differences between apps

| Surface | Egress and trust-boundary proof | Secret storage | Notable differences |
|---|---|---|---|
| surface:web | apps/web/__tests__/trust-boundary.test.ts imports local-runtime-contract helpers; server egress inventory and SSRF guards | Session via Clerk; no provider keys held | All settings UI above lives here; Desktop shows this hosted app [requirement] (AGENTS.md section 5) |
| surface:desktop | `guardedFetch` plus Rust egress policy; routing_logic_tests.rs and send_message_setup tests run by check-trust-boundaries | App-only browser profile; CLI sign-in in OS store | Public Desktop is Electron; the Tauri tree is retained internal code, not a shipped capability [requirement] (security.md:313-324) |
| surface:mobile | apps/mobile/__tests__/trust-boundary.test.ts; own egressGuard with path allowlist | expo-secure-store database key | Phone must have egress-guard entries for pre-Cloud calls [requirement] (memory note, unverified in repo) |
| surface:cli | Local mode isolation (Ollama and LM Studio on loopback); check-cli-local-secret | OS keychain or owner-only files | The only surface the privacy screen names for Local and BYOK |
| surface:vscode | apps/extension-vscode/src/__tests__/trust-boundary.test.ts; outboundContentGuard refuses untrusted workspaces and credential files | [unknown] | Contents are not sent from an untrusted workspace [code] (outboundContentGuard.ts:5-15) |
| surface:chrome | apps/extension/__tests__/trust-boundary.test.ts (origin validation, egress policy) | chrome.storage.local | Computer use needs Managed Cloud; screenshots cannot be redacted and reach the cloud gateway; unanswered approval denies after 30 s [requirement] (security.md:330-337) |

The orchestration script runs seven proofs: web, extension, mobile, extension-vscode, a types-package classifier, and two desktop Rust tests. There is no CLI entry in that list. [code] (scripts/check-trust-boundaries.mjs:11-44). It also fails if the desktop Cargo manifest or native diagnostics source gains Sentry. [code] (scripts/check-trust-boundaries.mjs:46-65)

The product requirement says local inference on mobile and desktop is free of any paid subscription. In the code read here, the trust page and privacy screen describe Local inference only in the CLI and local coding sessions Desktop runs through the CLI. Whether mobile ships on-device inference is [unknown] from the files read.

## Failure handling

| Situation | Behaviour | Basis |
|---|---|---|
| Scanner not configured in production | Every upload refused (`scan_unavailable`), unless `UPLOAD_SCAN_REQUIRED=false` | [code] (upload-scan.ts:408-436) |
| Scanner error, non-2xx, or timeout | Upload refused; file deleted, never registered | [code] (upload-scan.ts:442-480); [requirement] (upload-scanning.md:12-14) |
| Unknown app mode on a client | Treated as Local; our-cloud egress blocked | [requirement] (egress-policy.ts:12-14) |
| Tool gate escalation, nobody to ask | Pause at checkpoint if possible, else deny; never allow | [code] (tool-call-gate.ts:150-155) |
| Unreadable tool-policy data | Falls back to `ask_every_time` | [requirement] (security.md:75-79) |
| Chrome approval unanswered | Denied after 30 s | [requirement] (security.md:333) |
| Suspended or banned account | 403, fail-closed after one retry | [requirement] (security.md:345) |
| Sandbox needs E2B | Both `AGI_E2B_EXECUTION=1` and `E2B_API_KEY` required | [requirement] (security.md:358-359) |
| Account deletion with sole-owned workspace | 409, nothing deleted | [code] (delete-account/route.ts:452-465) |
| Workspace ownership or plan-renewal stop fails | 503, nothing deleted | [code] (delete-account/route.ts:440-446, 481-499) |
| Step-up missing or stale | Request refused with a step-up error; settings shows a dialog, cancel leaves state unchanged | [code] (delete-account/route.ts:461-475; SecuritySection.tsx:60-78) |
| Erasure of one store fails | Not reported as complete; object bytes deleted before rows so a failed delete leaves a retryable row | [requirement] (security.md:1158-1168) |
| Restored DB backup brings back erased rows | `erasure_tombstones` and `syncErasureLedger` re-arm suppression | [requirement] (security.md:1203-1209) |
| Scope above connector ceiling | Dropped with a warning; provider still loads. Marker `needs-vendor-specific-review` passes scopes through unchanged | [requirement] (security.md:527-541) |
| Lost key bytes | Restored TOTP secrets unrecoverable; users re-enrol 2FA | [requirement] (security.md:770-777) |
| Secret found by scanner | CI fails; rotate first because it is already in git history | [code] (check-secrets.mjs:498) |

## How it should work

These are the target behaviours stated by project documents, not new proposals.

- Every public sentence traces to a ledger row, and every row has a proof that fails when the behaviour changes. [requirement] (security.md:28-39)
- A user can undo or review what they delete: files go to the OS Trash, chats to Recently deleted, and permanent removal only follows an explicit user action that names what is lost. [requirement] (AGENTS.md section 9)
- A hold, once placed, must win over any purge or erasure. [requirement] (security.md:1172-1177)
- Key material should move from deployment env to a KMS-backed provider once provisioned, with its own review. [requirement] (security.md:791-827)
- A rotation on suspected exposure should take the exposed key out of service; today for `CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY` it does not, because six columns are not swept. [requirement] (security.md:912-918)
- [proposed] Finish re-sealing the six unswept connector columns and the two legacy-unbound call sites so `_RETIRED` can be dropped.
- [proposed] One page-level table per surface for where credentials are stored, including VS Code, so public copy can cite it.

## Gaps

Each item is recorded in the repository documents unless marked otherwise. Implementation status and verification status are kept apart.

| Gap | Implementation status | Verification status | Basis |
|---|---|---|---|
| Production malware scanner needs a vendor or our ClamAV service plus both env variables, or an explicit opt-out | Code complete and fails closed | Whether production has it set is [unknown] | [requirement] (security.md:443-454) |
| Soft-delete purge ships off | Cron exists and reports only unless `SOFT_DELETED_RESOURCE_PURGE_ENABLED=true`; media and knowledge files purge always | Production value [unknown] | [code] (purge-soft-deleted-resources/route.ts:15); [requirement] (security.md:1184-1191) |
| Key rotation never performed | Procedure, drill script and ring-aware readers exist | The rehearsal table is unfilled; `BLOCKED_BY_HUMAN` | [requirement] (security.md:923-960) |
| No KMS or escrow | Adapters written, default `env` | Not provisioned | [requirement] (security.md:761-827) |
| Tauri updater signing key compromised and quarantined; escrow unfilled; Tauri release paths disabled | Workflows disabled | Replacement not signed | [requirement] (security.md:1018-1024) |
| CLI release signing key pair does not exist yet; installs refuse | Verification code pinned | Blocked on owner | [requirement] (security.md:1113-1115) |
| Backups are not reached by erasure | Tombstone suppression exists | Restore path not shown to be tested here | [requirement] (security.md:1203-1209) |
| Hold cannot be amended | No route | n/a | [requirement] (security.md:1196-1198) |
| Screenshots in Chrome computer use cannot be redacted | Known | n/a | [requirement] (security.md:336) |
| GitHub App permission set not in repo | n/a | n/a | [requirement] (security.md:287-289) |
| Unreviewed OAuth scope ceilings (about 20 connectors pass scopes through) | Marker in manifest | Guard allows | [requirement] (security.md:596-619) |
| Lockdown mode: preference stored; server enforcement not traced | UI exists | [unknown] | [code] (LockdownModePanel.tsx) |
| Model-improvement switches: stored, but copy says nothing is used for this today | Consent rows live | Eligibility guard `check:model-improvement-eligibility` exists | [code] (PrivacySection.tsx:128; package.json:397) |
| Memory synced earlier to a device from a Google-marked chat stays on the device until cleared | Server stops serving it | Accepted risk | [requirement] (security.md:1224-1228) |
| Artifact AI bridge stays off until independent review signs off | Built behind `AGI_ARTIFACT_AI_ENABLED` | Review pending | [requirement] (security.md:1247-1273) |
| Rate-limit and spend values in doc | | | A fact about code state only as of 2026-11-13 |

No security test, guard or scan was run for this page. The project documents record no executed run that this page cites, so nothing here is [executed].

## How to verify

Nothing below was run for this page. These are the commands and files an engineer would use. [proposed] where a command is inferred from package.json.

| Question | Command or file |
|---|---|
| Does the tree contain a credential? | `pnpm check:secrets`; add `pnpm check:secrets:history` for git history [code] (package.json:432-433) |
| Does Local mode leak? | `pnpm check:trust-boundaries`, `pnpm check:desktop-local-egress`, `pnpm check:rust-egress-boundary` [code] (package.json:187,383) |
| Server egress and MCP dials | `pnpm check:security-egress-inventory`, `pnpm check:mcp-dial-egress` [code] |
| Is every upload scanned? | `pnpm check:upload-inspection`; read apps/web/lib/security/upload-scan.ts and run its test [code] |
| Does public copy match code? | `pnpm check:security-claims`, `pnpm check:trust-claims`, `pnpm check:privacy-claims`, `pnpm check:support-claims` [code] (package.json:272,277,314) |
| Is erasure complete over the schema? | `pnpm check:retention-graph`, `pnpm check:legal-hold-coverage`; the matrix test is deletion-manifest.test.ts [code] |
| Are connector scopes within ceilings? | `pnpm check:connector-scopes` [code] (package.json:148) |
| Crypto binding and key lifecycle | `pnpm check:crypto-context-binding`, `pnpm check:security-key-lifecycle`, `pnpm check:connector-secret-reseal` [code] |
| Settings behaviour | tests under apps/web/features/settings (sections/SecuritySection.2fa.test.tsx, AccountSection.delete.test.tsx, trust-boundary-copy.test.ts) |
| Whole guard chain | `pnpm check:llm-operability` (runs every guard and lists failures at the end) [code] (package.json:397; AGENTS.md section 12) |

A guard reads the working tree, not HEAD, so stage first and run second. [requirement] (AGENTS.md section 12). A guard that fails beside others counts as green only if it passes alone. [requirement] (AGENTS.md section 12)

**Live checks a human should do** (not yet recorded as run): set a temporary chat and confirm it is absent from history; request an export and confirm the link dies after 24 hours; schedule and cancel account deletion within 24 hours; upload a password-protected PDF and an EICAR test file against a configured scanner; in Local mode on Desktop and Mobile confirm a request to an our-cloud host is blocked.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| check:secrets scans git-tracked files for named credential shapes (PEM, Anthropic, OpenAI, Groq, xAI, Stripe live, Slack, GitHub, Google, AWS, Supabase, OpenRouter, Perplexity, generic sk-, DB URLs with passwords) and --history scans git history with no allowlist. | read in the code | `scripts/check-secrets.mjs:25-62`; `scripts/check-secrets.mjs:429-471`; `package.json:432-433` |
| The secret-scan allowlist is keyed by (path, credential format), not a wildcard; stale entries are reported and must be deleted. | read in the code | `scripts/secret-scan-allowlist.json:1-20` |
| OUR_CLOUD_HOSTS is the one shared list of our hosts (agiworkforce.com, vercel.app, neon.tech, four Clerk domains); BYOK provider hosts are deliberately excluded. | read in the code | `packages/contracts/trust-boundaries/src/egress-policy.ts:33-41` |
| Desktop guardedFetch throws before any network call when in Local mode and the host is ours; unknown mode is treated as Local. | read in the code | `apps/desktop/src/lib/egressGuard.ts:36-60`; `packages/contracts/trust-boundaries/src/egress-policy.ts:12-14` |
| check-trust-boundaries runs seven proofs (web, extension, mobile, vscode, types classifier, two desktop Rust tests) and fails if desktop gains Sentry; no CLI entry is in the list. | read in the code | `scripts/check-trust-boundaries.mjs:11-65` |
| In production the external upload scanner is required unless UPLOAD_SCAN_REQUIRED=false; with none configured every upload is refused with scan_unavailable. | read in the code | `apps/web/lib/security/upload-scan.ts:408-436` |
| The upload scanner is our own ClamAV service (services/upload-scanner), so user files do not go to a third party; password-protected files are refused. | stated requirement | `docs/security/upload-scanning.md:25-30`; `docs/security/upload-scanning.md:77-85` |
| Data export download link lasts 24 hours (DATA_EXPORT_DOWNLOAD_HOURS = 24). | read in the code | `packages/contracts/cloud-contracts/src/data-export.ts:7`; `docs/architecture/RETENTION_MATRIX.md:84` |
| Account deletion schedules erasure 24 hours ahead, requires step-up, and is refused with 409 when the account is sole owner of a workspace. | read in the code | `apps/web/app/api/user/delete-account/route.ts:440-481` |
| Step-up freshness is 300 seconds for most sensitive actions and 120 seconds for revealing an API credential. | read in the code | `apps/web/lib/server/step-up/actions.ts:15-58` |
| Deleted resources have a 30-day recovery window, and temporary chats and attachments are purged after 30 days. | read in the code | `apps/web/lib/resources/deletion-policies.ts:8`; `apps/web/app/api/cron/purge-temporary-chats/route.ts:24` |
| The soft-delete purge cron only deletes when SOFT_DELETED_RESOURCE_PURGE_ENABLED is 'true'; otherwise recovery windows do not end on schedule for conversations, messages, artifacts and projects. | read in the code | `apps/web/app/api/cron/purge-soft-deleted-resources/route.ts:15`; `apps/web/lib/validate-env.ts:1725-1732`; `docs/security/security.md:1184-1191` |
| security_audit_logs are kept at most 90 days, usage_events 730 days, credit_transactions 2922 days, signaling_sessions 8 days. | stated requirement | `docs/architecture/RETENTION_MATRIX.md:219`; `docs/architecture/RETENTION_MATRIX.md:241`; `docs/architecture/RETENTION_MATRIX.md:83`; `docs/architecture/RETENTION_MATRIX.md:222` |
| The tool gate never lets an escalation become an allow; unattended runs pause at a checkpoint or deny. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/tool-call-gate.ts:138-159` |
| The website account default tool-approval policy is 'autonomous'; the shared fail-closed default is ask_every_time. | read in the code | `packages/contracts/types/src/tool-approval-policy.ts:13`; `docs/security/security.md:71-79` |
| The trifecta check ignores text the user pasted, and a saved Block is enforced at execution, not by removing the tool from the model's catalog. | stated requirement | `docs/security/security.md:201-229` |
| Public pages claim no SOC 2, ISO 27001, HIPAA BAA or third-party pen test; the ledger records that none exists. | read in the code | `apps/web/app/trust/page.tsx:87`; `apps/web/app/trust/page.tsx:289`; `docs/compliance/trust-claims.json` |
| trust-claims.json has 39 rows and a 90-day review cadence; security-claims.json has 111 claims; guards fail when text, date or proof moves. | read in the code | `docs/compliance/trust-claims.json:2-3`; `docs/security/security-claims.json:1-3` |
| Encryption keys live only in deployment env vars (no KMS, no escrow); rotation is every 12 months, next due 2027-08-17, and no rotation has ever been run. | stated requirement | `docs/security/security.md:750-790`; `docs/security/security.md:923-960` |
| CLI secrets use the OS keychain on macOS and Windows and owner-only files on Linux or when AGIWORKFORCE_NO_KEYRING is set. | read in the code | `apps/cli/src/secure_store.rs:1-6`; `apps/cli/src/secure_store.rs:14-22` |
| Mobile stores its database key in expo-secure-store with WHEN_UNLOCKED_THIS_DEVICE_ONLY. | read in the code | `apps/mobile/storage/db.ts:2`; `apps/mobile/storage/db.ts:45-52` |
| Privacy screen defaults: crash reports off, do-not-train-provider filter off, both model-improvement switches off, and copy says nothing is used for model improvement today. | read in the code | `apps/web/features/settings/sections/PrivacySection.tsx:46-86`; `apps/web/features/settings/sections/PrivacySection.tsx:128` |
| The privacy screen assigns Local Mode and BYOK to the CLI only; hosted Web and Desktop send everything as Cloud requests. | read in the code | `apps/web/features/settings/sections/PrivacySection.tsx:486-500` |
| The Tauri updater signing key is treated as compromised (2026-10-17); Tauri release workflows are disabled and not cleared to resume. | stated requirement | `docs/security/security.md:1018-1024` |
| Backups are not reached by erasure; erasure_tombstones is the suppression list that re-arms erasure after a restore and itself outlives account deletion. | stated requirement | `docs/security/security.md:1203-1209`; `docs/architecture/RETENTION_MATRIX.md:109` |
| Chrome computer-use screenshots are not and cannot be redacted and reach the cloud gateway; an unanswered approval denies after 30 s. | stated requirement | `docs/security/security.md:330-337` |
| A legal hold predicate is inside every destructive statement, and a hold beats the temporary-chat purge. | stated requirement | `docs/security/security.md:1170-1180`; `apps/web/app/api/cron/purge-temporary-chats/route.ts:42` |
| Code sandbox network is none or an allowlist of code hosts; a raw managed provider key never enters a sandbox. | stated requirement | `docs/security/security.md:358-392` |

## Open questions

- Is the production upload scanner (UPLOAD_SCAN_WEBHOOK_URL and token) deployed, or is UPLOAD_SCAN_REQUIRED set to false? No repository file records production state.
- Is SOFT_DELETED_RESOURCE_PURGE_ENABLED set to true in production? The code ships it unset, so the published 30-day recovery window may not end on schedule.
- Where does the VS Code extension store provider keys? A grep of providerSetup.ts for secret storage returned nothing; not established.
- What does Lockdown mode enforce on the server, if anything? Only the preference panel was read.
- Does the mobile app ship on-device (local) inference? The trust page and privacy copy place Local mode in the CLI, but the product requirement says mobile and desktop local inference is free of any subscription. Not resolved from the files read.
- Does a CLI entry exist in the trust-boundary proof set? check-trust-boundaries.mjs lists none, though trust-claims.json has a CLI provider-key storage row.
- The HTTP method for /api/settings/sessions used by Log out of all devices was not read (SecuritySection.tsx:62-70 shows only the path).
- The web apps/web/__tests__/trust-boundary.test.ts begins with upgrade-tier and proration arithmetic tests; how much of it actually proves a trust boundary was not fully read.
- Product choice left open: whether to fill the key-rotation rehearsal table, escrow the updater key, and provision a KMS (all BLOCKED_BY_HUMAN or accepted risk).
- Product choice left open: whether to drop the 'needs-vendor-specific-review' scope pass-through for about 20 connectors.
- The US-only routing panel and the named-provider consent rows were seen only by name; their enforcement paths were not traced.
- Whether lethal-trifecta gating and the tool gate apply to local or own-key modes on any surface (the gate is in the Managed Cloud route).

## Project documents found out of date

- `docs/security/security.md section 3 (Accepted risk paragraph)`: Says 'All four keys live only as deployment environment variables', but the rotation cadence table and the first paragraph name three keys on the cadence (CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY, GITHUB_TOKEN_ENCRYPTION_KEY, TOTP_ENCRYPTION_KEY) and DEVICE_TOKEN_ENCRYPTION_KEY is stated to seal nothing. The code says: The same document states DEVICE_TOKEN_ENCRYPTION_KEY is read by no module, so only three live keys remain; the count of four is inconsistent within the file. (docs/security/security.md:689-691,750-754,767)
- `docs/security/security.md section 1.1 first sentence and 'Website account default'`: Describes the Free-plan and website default in terms of 'Skip approvals' wording; the code constant is the policy value 'autonomous'. Wording in the doc is a product label, not the code name. The code says: CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY = 'autonomous' and WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY aliases it. The document matches in behaviour; only the label differs. (packages/contracts/types/src/tool-approval-policy.ts:13; apps/web/shared/types/toolApprovalPolicy.ts:29)
- `docs/security/upload-scanning.md`: States the external scanner call timeout implicitly via the service's 14-second deadline; the web caller uses a 15-second abort, so the two numbers differ slightly. No functional contradiction found. The code says: runExternalScanner uses AbortSignal.timeout(15_000). (apps/web/lib/security/upload-scan.ts:452; docs/security/upload-scanning.md:73-77)
