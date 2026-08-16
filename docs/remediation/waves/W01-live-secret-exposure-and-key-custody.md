# W1 — Live secret exposure and key custody

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** Every item here is material an attacker can hold right now or a key whose loss is unrecoverable: a live Supabase PAT reachable from a public main, an exposed OpenRouter credential, the public repository itself, an unprotected main branch that lets anyone rewrite history, and the five AES keys / Tauri signing key that have no escrow, no KDF and (for at-rest data) are derived from a public machine identifier. Nothing else in the register matters if the keys are already out. These are also almost entirely founder/admin actions and small code changes, so they run in parallel with no code-area contention. Log and client-side credential leakage (SEC-48/49) and the dead XOR cipher (SEC-50) join here because they are the same 'where do secrets live' context and would otherwise re-leak whatever is rotated.

**Size.** 13 items (4 critical, 6 high, 2 medium, 1 low); 12 open.

**Done when.** Supabase PAT and OpenRouter credential rotated at the provider and proven dead; git history rewritten or repo made private with the old token invalid either way; secret scanner has a Supabase pattern and scans full history in CI. Repository ruleset on main enforces review, required checks, no force-push/deletion, signed tags. Tauri signing key escrowed with a named recovery holder and a documented restore test. A KMS/vault is selected and the five application keys plus the JWT secret are loaded from it with a documented rotation procedure; ENCRYPTION_KEY absence fails boot instead of warning. At-rest keys derive from KMS material, not the machine identifier; TOTP secrets migrated off plaintext through a real KDF. Pino redaction and Sentry scrubbing verified by a test that asserts a known token never appears in output; SecurityManager XOR module deleted.

| ID                    | Sev      | Item                                                                                                                                                            | Effort |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| [SEC-01](#sec-01)     | CRITICAL | Live-format Supabase personal access token committed to .mcp.json and still reachable from main; secret scanner has no Supabase pattern and never scans history | M      |
| [SEC-38](#sec-38)     | CRITICAL | Repository is public, exposing every unpatched security finding with exact file and line                                                                        | S      |
| [SEC-39](#sec-39)     | CRITICAL | Tauri update-signing private key exists only as one unbackupable CI secret with no escrow                                                                       | M      |
| [SEC-40](#sec-40)     | CRITICAL | No KMS, escrow or rotation for the five AES-256-GCM application keys; ENCRYPTION_KEY is only a boot warning                                                     | L      |
| [INFRA-04](#infra-04) | HIGH     | No repository ruleset is configured on main                                                                                                                     | S      |
| [SEC-14](#sec-14)     | HIGH     | At-rest AES-256-GCM keys for OAuth tokens, MCP credentials and the JWT secret are derived entirely from a public machine identifier                             | L      |
| [SEC-16](#sec-16)     | HIGH     | Dispatch control-frame HMAC key is derived entirely from material the signaling relay receives, so relay-injected frames verify as authentic                    | L      |
| [SEC-37](#sec-37)     | HIGH     | No repository ruleset is configured on main — no required review, no required CI check, no force-push or deletion protection, no signed tags                    | S      |
| [SEC-41](#sec-41)     | HIGH     | Exposed local OpenRouter video credential must be rotated before any paid smoke test                                                                            | S      |
| [SEC-42](#sec-42)     | HIGH     | Legacy plaintext TOTP secrets are read and returned as-is, and the TOTP encryption key is derived from raw env characters with no KDF                           | M      |
| [SEC-48](#sec-48)     | MEDIUM   | Credentials and PII leak into logs and error reporting: Pino has no redaction, share capability tokens are logged, Sentry never scrubs exception messages       | M      |
| [SEC-49](#sec-49)     | MEDIUM   | Client-side credentials and PII stored in plaintext with no expiry or erasure path                                                                              | M      |
| [SEC-50](#sec-50)     | LOW      | Dead SecurityManager module with a deprecated XOR stream cipher is still shipped                                                                                | S      |

---

### SEC-01 — Live-format Supabase personal access token committed to .mcp.json and still reachable from main; secret scanner has no Supabase pattern and never scans history

`CRITICAL` · security/secrets · effort M

**What.** F3 (3/3 panel, HIGH): an `sbp_` + 40-hex Supabase PAT was hardcoded as a Bearer credential in tracked `.mcp.json:7`. A later commit (72da83757) substituted `${SUPABASE_ACCESS_TOKEN}`, but the blob is still retrievable via `git log --all -S sbp_ -p` from commits that are ancestors of `main` and pushed to origin. A Supabase PAT authenticates the Management API for the whole account — enumerate projects, read/rotate project API keys and DB connection strings, run SQL, delete projects, manage org members — so this is account-level compromise of project ref `xwmcvbgdyergfnvwbnap`. The scan also proved why it survived: `scripts/check-secrets.mjs` has no Supabase PAT pattern at all, and it scans only `git ls-files`, so history and untracked files are invisible to it. AuditRemediationLedger CRIT-017 recorded the scanner as 'resolved' (8366 files, 55 exemptions) — that closure was premature. CRIT-017's own residual (release bundles are not scanned as artifacts, REL-004/REL-010) is still open. Compounded by SEC-38: the repository is public.

**Done when.** The token is revoked at the Supabase account tokens page and the account audit log is reviewed for use since the 2026-02-03 commit; project anon/service*role keys and the Postgres password for ref xwmcvbgdyergfnvwbnap are rotated; the blob is purged from history (git-filter-repo/BFG) and all refs force-pushed, or the credential is formally treated as permanently compromised. check-secrets.mjs carries a Supabase PAT pattern (/sbp*[a-f0-9]{40}/) and scans git history and untracked files, not just git ls-files, and release bundles are scanned as artifacts.

**Where.** `.mcp.json:7`, `scripts/check-secrets.mjs`, `scripts/secret-scan-allowlist.json`

**From.** CLAUDE-SECURITY-RESULTS.md (F3); AuditRemediationLedger.md (CRIT-017)

**Folded in.** No CI secret scanner existed (CRIT-017)

### SEC-38 — Repository is public, exposing every unpatched security finding with exact file and line

`CRITICAL` · security · effort S

**What.** ExecutionPlan founder item 11: siddharthanagula3/agiworkforce is public. Findings such as the db_query allowlist bypass, the Safe/Plan mode gate, the local-mode prompt egress and the missing gateway usage caps were readable with exact locations while still exploitable. This register itself, and the security scan that fed it, describe currently-unfixed exploitable defects (SEC-01 through SEC-34) at file and line — every hour the repository stays public with them open is free reconnaissance. SEC-01 compounds it: a live account credential is recoverable from history by anyone who can clone.

**Done when.** The repository is made private until the open exploitable findings in this register are closed, or each is closed before publication; the decision is recorded either way.

**Blocked by.** Founder decision on repository visibility

**From.** ExecutionPlan.md (founder action 11)

### SEC-39 — Tauri update-signing private key exists only as one unbackupable CI secret with no escrow

`CRITICAL` · security/crypto · effort M

**What.** ExecutionPlan founder item 4: TAURI_SIGNING_PRIVATE_KEY's public half is baked into every shipped binary while the private half exists solely as a single CI secret with no backup and no escrow. Losing it bricks auto-update for every installed copy permanently; leaking it lets an attacker sign updates that every install accepts. This is the highest-blast-radius single credential in the repository and it currently has neither a recovery path nor a compromise-response plan.

**Done when.** The signing key is escrowed to a documented secure location with a named recovery holder, a key-compromise and key-rotation runbook exists (including how installed clients migrate to a new public key), and the escrow is tested by a restore drill.

**Blocked by.** Founder must establish key escrow and name a recovery holder

**From.** ExecutionPlan.md (founder action 4)

### SEC-40 — No KMS, escrow or rotation for the five AES-256-GCM application keys; ENCRYPTION_KEY is only a boot warning

`CRITICAL` · security/crypto · effort L · **in-progress**

**What.** ExecutionPlan founder item 5: five keys live only as environment variables, and a database restore without those exact bytes makes 2FA secrets, connector tokens and device tokens permanently undecryptable. ExecutionPlan #88 recorded that ciphertext envelopes carried no key id or version across 98 migrations, so rotating any key would silently invalidate every ciphertext and force a mass revoke of every connector grant, with no re-encryption script and no rotation runbook; the envelope half was fixed 2026-08-09 (key_version now travels inside the envelope, verified) but the KMS/escrow decision, the re-encryption job and the rotation runbook are still owed. DPDP_PROGRESS §6 adds that ENCRYPTION_KEY appears in neither the critical env list nor env-doctor — it is boot-warning-only, so a deploy missing it produces no hard failure. docs/security/ contains exactly one document, key-rotation.md.

**Done when.** A random root key lives in a managed KMS or credential store with documented escrow, purpose keys are derived from it, a re-encryption job can walk existing ciphertext by key_version, ENCRYPTION_KEY and its siblings are boot-critical rather than warnings, and a rotation runbook is exercised once end to end.

**Where.** `apps/web/lib/crypto/envelope.ts`, `apps/web/lib/validate-env.ts`, `docs/security/key-rotation.md`

**Blocked by.** Founder decision on KMS/vault selection

**From.** ExecutionPlan.md (founder action 5, #88); DPDP_PROGRESS.md (§6 fail-open/env table); AuditRemediationLedger.md (ENT-006)

**Folded in.** Ciphertext envelopes carry no key id or version (ExecutionPlan #88, envelope half resolved); ENCRYPTION_KEY is boot-warning-only, not critical (DPDP §6)

### INFRA-04 — No repository ruleset is configured on main

`HIGH` · infra/ci · effort S

**What.** GAP-P0-004: the repository rulesets endpoint returns an empty list — there is no main ruleset requiring PRs, the final CI aggregate check, resolved review conversations, no force-push or branch deletion, signed release tags, or a documented break-glass path. Overlaps the security slice, but its primary effect is that nothing enforces the CI gate this slice owns.

**Done when.** A main ruleset requires PR review, the final aggregate CI check, no force-push or delete, and signed tags, with a logged break-glass exception path.

**Blocked by.** Requires GitHub repository admin access

**From.** gap-audit-2026-08-08.md

### SEC-14 — At-rest AES-256-GCM keys for OAuth tokens, MCP credentials and the JWT secret are derived entirely from a public machine identifier

`HIGH` · security/crypto · effort L

**What.** F9 (3/3 panel, MEDIUM): `derive_key_for_machine_and_install` runs PBKDF2 with `machine_id` as the password and a salt that is itself `machine_id:bundle_id:install_id:purpose`; `install_id` is SHA256(machine_id || "install_id_fallback") because `set_install_id` has no production caller. Every byte of the AES-256 key is therefore a deterministic function of one publicly readable OS identifier (macOS IOPlatformUUID via ioreg, world-readable /etc/machine-id, or the Windows MachineGuid), and the 600,000 PBKDF2 iterations add no work factor because the input is not secret. Confidentiality of everything the app claims to store 'encrypted at rest' collapses to filesystem access: connector OAuth access/refresh tokens, MCP HTTP bearer tokens and API keys in mcp-servers-config.json and project .mcp.json, connector permission records, and the HMAC JWT secret. DPDP_PROGRESS §6 independently lists the same defect ('desktop machine-key PBKDF2 with no user secret'). A .mcp.json that lands in a repo, a backup, a synced folder, or a second local account all yield plaintext credentials.

**Done when.** A random 32-byte root key is stored in the OS credential store — the pattern already used correctly in data/db/key_management.rs and sys/account/mod.rs — and purpose keys are derived from it with HKDF; or the master-password vault is required for every credential purpose instead of silently falling back to machine_key::derive_key. Any machine-bound ciphertext retained for migration is marked legacy and re-encrypted on first unlock.

**Where.** `apps/desktop/src-tauri/src/sys/security/machine_key.rs:219-237,232`, `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`, `apps/desktop/src-tauri/src/core/mcp/config.rs`, `apps/desktop/src-tauri/src/data/settings/service.rs`

**From.** CLAUDE-SECURITY-RESULTS.md (F9); DPDP_PROGRESS.md (O-19 encryption-weaknesses table)

**Folded in.** Desktop machine-key PBKDF2 with no user secret (DPDP §6)

### SEC-16 — Dispatch control-frame HMAC key is derived entirely from material the signaling relay receives, so relay-injected frames verify as authentic

`HIGH` · security/crypto · effort L

**What.** F11 and F27 (both 3/3 panel, MEDIUM — the scan states they share one root cause and one fix). `deriveDispatchSecret` is HKDF(IKM = pairing code, salt = dispatchSalt); the mobile client sends the pairing code to the signaling server in the WebSocket register frame and in POST /pairings/{code}/claim, and sends the salt to the same server in register metadata (relayed onward as peer_ready.metadata.dispatchSalt). Both KDF inputs are therefore known to the relay — the exact party the module's own docstring says this layer defends against. A compromised or malicious relay, an insider, or a TLS-interception proxy (mobile JS pinning is disabled and pins are placeholders) can recompute the key and mint valid envelopes in both directions: forged approval_request cards that phish the user into approving a real desktop action, forged agents_update/dispatch.task.status state, and forged mobile→desktop approval_response {approved:true} frames the desktop treats as user consent for a risky tool execution. Fresh nonces and in-window timestamps mean replay checks provide no protection.

**Done when.** The control-channel key is established out of band — the desktop generates a random 32-byte secret embedded in the QR payload and never sent to the signaling service, or a PAKE (SPAKE2/OPAQUE) runs over the relay so the transcript does not reveal the key — and each envelope is bound to its direction via a role/from field in the canonical signing input; for manual code entry either a user-verified SAS from the DTLS fingerprints is added, or the 'application-layer authentication' claim is withdrawn.

**Where.** `apps/mobile/lib/dispatchHmac.ts:273,387`, `apps/mobile/stores/connectionStore.ts:585,991,1078`, `apps/mobile/lib/pinning.ts:96`

**From.** CLAUDE-SECURITY-RESULTS.md (F11, F27)

**Folded in.** F27 — Dispatch control-frame HMAC key derived from relay-visible values (mobile connect path)

### SEC-37 — No repository ruleset is configured on main — no required review, no required CI check, no force-push or deletion protection, no signed tags

`HIGH` · security · effort S

**What.** gap-audit GAP-P0-004: the repository rulesets endpoint returns an empty list. There is no main ruleset requiring pull requests, the final CI aggregate check, resolved review conversations, no force-push/branch deletion, signed release tags, or a documented break-glass path. Combined with SEC-38 (public repository) and SEC-39 (unescrowed signing key), a single compromised or careless push can rewrite main and ship signed artifacts with no gate.

**Done when.** A main ruleset requires PR review, the final CI aggregate check, and resolved conversations; force-push and branch deletion are denied; release tags must be signed; and a logged break-glass exception path is documented.

**Where.** `.github/workflows/ci.yml`

**Blocked by.** GitHub repository Settings change (founder/admin)

**From.** gap-audit-2026-08-08.md (GAP-P0-004)

### SEC-41 — Exposed local OpenRouter video credential must be rotated before any paid smoke test

`HIGH` · security/secrets · effort S

**What.** FoundersAssistance #8: the existing local OpenRouter credential was surfaced by an earlier broad local search and must be treated as exposed; no paid request has been sent with it. It blocks the paid Seedance end-to-end generation and the signed-webhook smoke test. Same class as SEC-01 (credential reachable beyond its intended holder) but caught before use.

**Done when.** The exposed credential is revoked at OpenRouter, a minimum-scope replacement is issued, OPENROUTER_API_KEY and OPENROUTER_WEBHOOK_SECRET are set from it, and only then is a single paid smoke test authorized.

**Blocked by.** OpenRouter dashboard credential rotation (founder action)

**From.** FoundersAssistance.md (#8)

### SEC-42 — Legacy plaintext TOTP secrets are read and returned as-is, and the TOTP encryption key is derived from raw env characters with no KDF

`HIGH` · security/crypto · effort M

**What.** DPDP_PROGRESS O-19b (verified still present): user-preferences.ts:134-135 contains a regex-gated legacy path — `if (/^[A-Z2-7]+$/.test(encryptedSecret)) { // Legacy unencrypted secret - return as-is }` — so any second-factor secret stored before encryption landed is still held and returned in plaintext, with no migration job to re-encrypt them. Separately the TOTP AES-256 key is derived from the raw first 32 UTF-8 characters of an env var with no KDF and no entropy check, while a sibling route on the _same_ env var uses scryptSync plus an entropy assertion — so the weaker derivation is a local inconsistency, not a platform constraint. DPDP names this one of the two O-19 items worth doing first.

**Done when.** A migration re-encrypts every legacy plaintext TOTP secret and the read-as-is branch is deleted, and TOTP key derivation uses the same scryptSync-plus-entropy-assertion path its sibling route already uses.

**Where.** `apps/web/features/settings/services/user-preferences.ts:67-75,131-138`, `apps/web/app/api/auth/desktop-token/route.ts:68-84`

**From.** DPDP_PROGRESS.md (O-19b)

### SEC-48 — Credentials and PII leak into logs and error reporting: Pino has no redaction, share capability tokens are logged, Sentry never scrubs exception messages

`MEDIUM` · security · effort M

**What.** DPDP*PROGRESS §6 (logging/leakage table, three rows): logger.ts:17 configures Pino with no redaction and logs emails verbatim; app/api/shared/route.ts:106 writes share capability tokens into error logs, so a log reader gains access to shared content; sentry-shared.ts:87's beforeSend never scrubs exception messages, so any credential or PII embedded in a thrown error's message reaches the error-tracking vendor. ExecutionPlan #11 fixed the *redaction pattern set* in packages/platform/utils/src/logger.ts (adding PEM blocks, ASIA…, aws_secret_access_key, gho*/ghu*/ghr*, variable-length AIza…), which is a different logger from the web Pino instance — the patterns exist but this sink does not apply them. gap-audit records the Sentry PII-scrubbing gap as fixed for the client SDK wrapper; the beforeSend exception-message path is the remaining half.

**Done when.** The web Pino instance applies the existing shared redaction pattern set to every field, capability tokens are never included in log or error payloads (log an opaque correlation id instead), and Sentry's beforeSend scrubs exception messages and stack frames through the same redactor before transmission.

**Where.** `apps/web/lib/logger.ts:17`, `apps/web/app/api/shared/route.ts:106`, `apps/web/lib/sentry-shared.ts:87`, `packages/platform/utils/src/logger.ts:40-161`

**From.** DPDP_PROGRESS.md (§6); ExecutionPlan.md (#11); gap-audit-2026-08-08.md (§8)

**Folded in.** Pino has no redaction and logs emails verbatim; Share capability tokens written into error logs; Sentry beforeSend never scrubs exception messages

### SEC-49 — Client-side credentials and PII stored in plaintext with no expiry or erasure path

`MEDIUM` · security · effort M

**What.** DPDP_PROGRESS §6: shared/lib/api.ts:92-115 keeps bearer credentials in plaintext localStorage indefinitely with no expiry, so any XSS or shared-device access yields a long-lived token; and the Chrome extension writes a full identity and employment profile (the same PII set SEC-15 exfiltrates) into plaintext chrome.storage.local with no erasure path, so account deletion cannot reach it. ExecutionPlan #35/#36 fixed the _logout_ leg on web and desktop (tokens cleared, query cache purged) and corrected a bug where ciphertext was sent as a bearer token, but the at-rest plaintext storage and indefinite retention remain, and no source records the extension profile being reachable by erasure.

**Done when.** Web bearer credentials move to a non-persistent or short-expiry store, the extension's stored profile is encrypted at rest and enumerated by the account-erasure path, and both carry an explicit retention bound.

**Where.** `apps/web/shared/lib/api.ts:92-115`, `apps/extension/src/features/content/autofill/filler.ts:826`, `apps/extension/src/options.ts:1357`

**From.** DPDP_PROGRESS.md (§6); ExecutionPlan.md (#35, #36)

**Folded in.** Extension stores full identity/employment profile in plaintext chrome.storage.local with no erasure path

### SEC-50 — Dead SecurityManager module with a deprecated XOR stream cipher is still shipped

`LOW` · security/crypto · effort S

**What.** DPDP_PROGRESS §6 flags a deprecated XOR stream cipher on the securityManager singleton in apps/web/shared/lib/security.ts. ExecutionPlan's audit-sweep TODO independently establishes that this module (~700 lines) has zero importers repo-wide and is dead code slated for deletion along with the 815-line ai-prompt-box.tsx second composer — deletion was deferred as a founder call. A homegrown XOR 'cipher' in the tree is a standing invitation for a future caller to use it, and it inflates the reviewable surface of every security audit.

**Done when.** The unreferenced SecurityManager module and its XOR cipher are deleted (zero-importer proof recorded in the commit), so no caller can adopt it.

**Where.** `apps/web/shared/lib/security.ts:141-215`

**From.** DPDP_PROGRESS.md (§6); ExecutionPlan.md (audit sweep TODO)
