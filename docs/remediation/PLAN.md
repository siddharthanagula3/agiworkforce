# Remediation execution plan

Status: Current  
Owner: Platform lead  
Last updated: 2026-08-16

Generated from `docs/remediation/register.json`. Every task below is a real register item — nothing here is invented, and the counts are computed, not estimated by eye.

## The size of it

|                                 |                                        |
| ------------------------------- | -------------------------------------- |
| Open items                      | **811** of 826                         |
| Critical still open             | **30** of 36                           |
| Weighted size                   | **3885 points** (S=1, M=3, L=8, XL=20) |
| Confirmed founder/admin actions | **38**                                 |
| Waves                           | 12                                     |

This is not a sprint. At a sustained 40 points a day that is roughly **97 working days** of engineering. The founder count above is only what the register states outright; more will surface per item, because a defect is often discovered to need a credential or a decision only once someone opens it.

## How the work is shaped

- **Track F — founder actions.** Only you can do these. Hours of your time; they gate whole waves. W1 and W7 cannot close without them.

- **Track E — engineering.** W1 → W12 in order. Inside a wave, items are batched by the code area they touch, so a batch is one commit against one subsystem ending in green CI. Disjoint batches inside a wave can run in parallel; waves do not overlap.

- **Track G — gates.** CI and code scanning stay green throughout. A batch that reddens either is not done. Nearly closed already, and it is what makes every other claim checkable.

## Track F — founder actions

The founder answered every open question on 2026-08-16. Three items are closed,
eleven now carry a recorded decision and have become engineering work, and **four
still need something only the founder can supply**. Decisions live on each
register item under `founder_decision`.

### Still needs the founder

| #   | Item         | Sev  | What is still needed                                                                                                                                                                     |
| --- | ------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F2  | **SEC-39**   | CRIT | A named off-laptop escrow location and recovery holder for the Tauri signing key, plus a restore drill. The key itself is NOT lost — it is at `~/.tauri/agiworkforce.key` with its passphrase, and in GitHub Actions secrets. Every copy is on one machine plus CI, and neither is escrow. |
| F3  | **SEC-40**   | CRIT | Which KMS or vault. The five keys and the JWT secret now exist for local dev in `~/.agiworkforce/secrets.env`, which is not a KMS and has no rotation procedure.                          |
| F5  | **INFRA-17** | CRIT | Publishing credentials and environments for the five release surfaces that have none. Blocks F4's download path.                                                                          |
| —   | **env**      | HIGH | The real `NEXT_PUBLIC_API_URL`, and a go-ahead to write `CRON_SECRET`, `DEVICE_TOKEN_ENCRYPTION_KEY`, `TOTP_ENCRYPTION_KEY` and `LOG_SALT` into Vercel production. 2FA setup and desktop device pairing are broken in production until then. |

### Decided — now engineering work

| #   | Item         | Sev  | Decision                                                                                                    |
| --- | ------------ | ---- | ----------------------------------------------------------------------------------------------------------- |
| F1  | **SEC-38**   | CRIT | Make the repo public. Delete the retired `tauri-signing` pair from the working tree first.                   |
| F4  | **INFRA-15** | CRIT | Ship a real Desktop/CLI download path AND stop marketing them as Released until it exists.                    |
| F7  | **DPDP-21**  | CRIT | There is no EU representative and none is being appointed — remove the claim that the obligation is met.      |
| F8  | **DPDP-19**  | CRIT | Supply the mobile privacy notice, correct the iOS privacy manifest, fix the store privacy declarations.       |
| F9  | **DPDP-04**  | CRIT | Follow ChatGPT's parental-consent mechanism; read the live corpus before building.                            |
| F10 | **BILL-01**  | CRIT | Founder moves Stripe out of TEST once billing is correct — the gate is now on us, not them.                   |
| F11 | **DESK-02**  | CRIT | Desktop Cloud Mode ships now on both Electron and Tauri, downloadable, after a verification pass.             |
| F12 | **DESK-70**  | CRIT | Build the Desktop image/video generation surface.                                                             |
| F13 | **SEC-37**   | HIGH | Configure the ruleset on main. A public repo makes rulesets available on the free plan.                        |
| F14 | **SEC-41**   | HIGH | Founder is rotating the OpenRouter credential; awaiting confirmation.                                          |
| F15 | **DPDP-90**  | HIGH | Land the `web_artifact_index` erasure classification in the same commit as migration 0121. Ours, not theirs.   |
| —   | **DOC-200**  | MEDI | One home for audits, research and gaps; restructure the folders. New, from the same conversation.              |

### Closed

| #   | Item         | Outcome                                                                                                  |
| --- | ------------ | -------------------------------------------------------------------------------------------------------- |
| F6  | **SEC-89**   | Migration 0120 applied to production and verified live: `public_execute=false`, `app_rls_execute=false`.  |
| F16 | **SEC-01**   | Supabase PAT revoked — the account shows zero access tokens. The repo never depended on that project.      |
| F17 | **DESK-202** | All three desktop chat affordances built; all four E2E tests live, no `fixme` left.                        |

A further 21 open items name a founder decision, an escrow, or a store/publisher account in their own text. They are marked `HUMAN` in the wave tables below.

## Track E — the waves

### W1 — Live secret exposure and key custody

**13 open · 44 pts · 3C 6H 3M 1L**

_Why now._ Every item here is material an attacker can hold right now or a key whose loss is unrecoverable: a live Supabase PAT reachable from a public main, an exposed OpenRouter credential, the public repository itself, an unprotected main branch that lets anyone rewrite history, and the five AES keys / Tauri signing key that have no escrow, no KDF and (for at-rest data) are derived from a public machine identifier.

_Done when._ Supabase PAT and OpenRouter credential rotated at the provider and proven dead; git history rewritten or repo made private with the old token invalid either way; secret scanner has a Supabase pattern and scans full history in CI. Repository ruleset on main enforces review, required checks, no force-push/deletion, signed tags. Tauri signing key escrowed with a named recovery holder and a documented restore test. A KMS/vault is selected and the five application keys plus the JWT secret are loaded

**Batch W1.1 — `security/crypto`** · 6 items · 31 pts

| Item   | Sev  | Eff | Task                                                                                                                                         |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-39 | CRIT | M   | Tauri update-signing private key exists only as one unbackupable CI secret with no escrow `HUMAN`                                            |
| SEC-40 | CRIT | L   | No KMS, escrow or rotation for the five AES-256-GCM application keys; ENCRYPTION_KEY is only a boot warning `HUMAN`                          |
| SEC-14 | HIGH | L   | At-rest AES-256-GCM keys for OAuth tokens, MCP credentials and the JWT secret are derived entirely from a public machine identifier          |
| SEC-16 | HIGH | L   | Dispatch control-frame HMAC key is derived entirely from material the signaling relay receives, so relay-injected frames verify as authentic |
| SEC-42 | HIGH | M   | Legacy plaintext TOTP secrets are read and returned as-is, and the TOTP encryption key is derived from raw env characters with no KDF        |
| SEC-50 | LOW  | S   | Dead SecurityManager module with a deprecated XOR stream cipher is still shipped                                                             |

**Batch W1.2 — `security`** · 4 items · 8 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-38 | CRIT | S   | Repository is public, exposing every unpatched security finding with exact file and line `HUMAN`                                                       |
| SEC-37 | HIGH | S   | No repository ruleset is configured on main — no required review, no required CI check, no force-push or deletion protection, no signed tags `HUMAN`   |
| SEC-48 | MEDI | M   | Credentials and PII leak into logs and error reporting: Pino has no redaction, share capability tokens are logged, Sentry never scrubs exception messa |
| SEC-49 | MEDI | M   | Client-side credentials and PII stored in plaintext with no expiry or erasure path                                                                     |

**Batch W1.3 — `security/secrets`** · 2 items · 4 pts

| Item   | Sev  | Eff | Task                                                                                                                                                           |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-41 | HIGH | S   | Exposed local OpenRouter video credential must be rotated before any paid smoke test `HUMAN`                                                                   |
| SEC-01 | MEDI | M   | Supabase personal access token was committed to .mcp.json and is still reachable from history; the product does not use Supabase, so the exposure is t `HUMAN` |

**Batch W1.4 — `infra/ci`** · 1 items · 1 pts

| Item     | Sev  | Eff | Task                                        |
| -------- | ---- | --- | ------------------------------------------- |
| INFRA-04 | HIGH | S   | No repository ruleset is configured on main |

### W2 — Unauthenticated and pre-auth reachable endpoints

**25 open · 69 pts · 2C 9H 11M 3L**

_Why now._ These are the paths a party with no account can hit, plus the checks that decide whether a request is authenticated at all.

_Done when._ A single fail-closed account-status/revocation helper is used by the HTTP and WebSocket paths and the fail-open env var is removed (or documented, validated and default-off); a test proves a revoked JWT and a suspended account are rejected on both. /pair requires an out-of-band local secret before installing a native-messaging manifest and survives a fuzz corpus of multi-byte and truncated bodies without aborting. Clerk verification passes authorizedParties; cron secret uses timingSafeEqual; api

**Batch W2.1 — `security/auth`** · 11 items · 38 pts

| Item   | Sev  | Eff | Task                                                                                                                                                  |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-09 | HIGH | S   | Gateway WebSocket authentication skips the JWT revocation table and the account_status kill switch                                                    |
| SEC-10 | HIGH | S   | ACCOUNT_STATUS_FAIL_OPEN admits suspended and banned accounts when the status lookup fails, and is invisible to env validation                        |
| SEC-11 | HIGH | S   | Native-messaging manifest install on POST /pair is authorized by a token the same unauthenticated endpoint hands out                                  |
| SEC-44 | HIGH | M   | API keys minted with a 'Run inference' scope are rejected by the RLS layer and the failure is masked as a 503 billing outage                          |
| SEC-72 | HIGH | S   | /tasks is missing from the proxy protected-route matcher, so a signed-out visitor is served full authenticated app chrome instead of being redirected |
| SEC-87 | HIGH | XL  | Remote-control access is granted as ephemeral session keys, not revocable per-device grants                                                           |
| SEC-43 | MEDI | M   | Web chat-completions classifies the client surface by an advisory, spoofable header rather than a signed JWT claim                                    |
| SEC-45 | MEDI | S   | Clerk JWT verification omits authorizedParties                                                                                                        |
| SEC-66 | MEDI | M   | Reauthentication mid-turn does not stop before unauthorized side effects or resume the interrupted work                                               |
| SEC-73 | MEDI | M   | Two parallel device-pairing authentication flows exist on near-homograph routes with separately implemented code-format validation                    |
| SEC-46 | LOW  | S   | Cron bearer secret is compared non-constant-time                                                                                                      |

**Batch W2.2 — `security`** · 10 items · 18 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-04 | CRIT | M   | /chrome-extension page states inference and keys never leave Desktop while the extension POSTs whole conversations to the cloud gateway                |
| SEC-59 | HIGH | M   | Computer-use permission gate cannot resolve the foreground application, so unconfigured apps default to allow                                          |
| SEC-12 | MEDI | S   | Unauthenticated local HTTP POST /pair aborts the desktop app via a non-char-boundary string slice                                                      |
| SEC-13 | MEDI | S   | Remote search-result content is byte-sliced at a fixed offset, aborting the desktop app on multi-byte text                                             |
| SEC-27 | MEDI | S   | Middleware api-host bounce builds its redirect target from the raw request path, allowing a protocol-relative open redirect                            |
| SEC-47 | MEDI | M   | api-gateway hardening gaps: CORS defaults to localhost with credentials:true and no env guard, no sslmode=require, rate limiting fails open to in-memo |
| SEC-60 | MEDI | S   | Desktop voice controller auto-grants computer-use consent flags instead of showing the consent dialog                                                  |
| SEC-61 | MEDI | M   | No task-time BYOK consent ceremony for cloud vision picks from a Local workspace, leaving computer use restricted by workaround                        |
| SEC-62 | LOW  | S   | Chrome extension REPLAY_SHORTCUT remains reachable from any allowlisted tab pending security review                                                    |
| SEC-64 | LOW  | S   | CAPTCHA/bot protection on Clerk-gated sign-up is unverified in either direction                                                                        |

**Batch W2.3 — `desktop`** · 1 items · 8 pts

| Item    | Sev  | Eff | Task                                                                                               |
| ------- | ---- | --- | -------------------------------------------------------------------------------------------------- |
| DESK-08 | HIGH | L   | Computer-use permission gate cannot resolve the live foreground app, so most apps default to allow |

**Batch W2.4 — `docs`** · 1 items · 1 pts

| Item    | Sev  | Eff | Task                                                                                                                               |
| ------- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| DOCS-13 | CRIT | S   | The /chrome-extension page tells users no inference happens in Chrome while the extension posts conversations to the cloud gateway |

**Batch W2.5 — `web`** · 1 items · 1 pts

| Item   | Sev  | Eff | Task                                                                                                        |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------- |
| WEB-33 | HIGH | S   | /tasks renders full authenticated chrome to signed-out visitors — route missing from the proxy auth matcher |

**Batch W2.6 — `infra/ci`** · 1 items · 3 pts

| Item     | Sev  | Eff | Task                                                                                            |
| -------- | ---- | --- | ----------------------------------------------------------------------------------------------- |
| INFRA-52 | MEDI | M   | Two parallel device-pairing auth flows with near-homograph routes and separate validation logic |

### W3 — Build, CI, deploy and release-publishing integrity

**60 open · 185 pts · 5C 30H 18M 7L**

_Why now._ This is the wave that makes every later wave verifiable.

_Done when._ pnpm build succeeds for web from a clean worktree and main CI is green on three consecutive commits, with lanes split so an E2E failure does not mask unrelated checks. CodeQL default setup disabled and the advanced workflow analyses Rust on PRs; dependency and static-analysis gates block at documented severities; cargo deny, cargo fmt, clippy --all-targets and the full Rust workspace test policy are green. check:env-contract, check:ci-guardrails, check:licenses, check:repo-organization, conflict

**Batch W3.1 — `infra/ci`** · 14 items · 58 pts

| Item     | Sev  | Eff | Task                                                                                                                                  |
| -------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| INFRA-01 | CRIT | L   | main CI is red on essentially every run, so no commit is release-qualified                                                            |
| INFRA-03 | CRIT | L   | Production promotion has no recorded proof for any current head                                                                       |
| INFRA-15 | CRIT | L   | Desktop and CLI are marketed site-wide as Released while no user can download either `HUMAN`                                          |
| INFRA-17 | CRIT | M   | Publishing credentials and environments are missing for five of six release surfaces, and the Tauri signing key has no escrow `HUMAN` |
| INFRA-02 | HIGH | M   | One monolithic `check` job gates every independent E2E lane                                                                           |
| INFRA-05 | HIGH | M   | Security and dependency gates are not uniformly blocking by documented severity                                                       |
| INFRA-12 | HIGH | M   | api.agiworkforce.com /v1/\* rewrites are inert in production — every /v1 path serves the not-found page                               |
| INFRA-16 | HIGH | M   | CLI, VS Code and Chrome release workflows build artifacts but never publish them                                                      |
| INFRA-18 | HIGH | M   | No release is tested from a clean machine, and desktop ships without an SBOM or an upgrade path test `HUMAN`                          |
| INFRA-19 | HIGH | L   | Mobile release workflow has no privacy manifest, data-safety form, device matrix, phased rollout or crash telemetry                   |
| INFRA-20 | HIGH | S   | Hosting plan constraints block auto-deploy, cron cadence, rollback and further builds `HUMAN`                                         |
| INFRA-22 | HIGH | M   | No environment-variable drift detection or alerting; a production outage from env deletion has already recurred                       |
| INFRA-23 | HIGH | M   | Migrations reach production out of band, with no migration status recorded in any deployment                                          |
| INFRA-24 | HIGH | S   | Nothing pages a human on a production incident because no alerting vendor is provisioned `HUMAN`                                      |

**Batch W3.2 — `infra/ci`** · 14 items · 34 pts

| Item     | Sev  | Eff | Task                                                                                                                                                   |
| -------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| INFRA-33 | HIGH | M   | Scheduled tasks run once daily, claiming at most ten runs across the entire deployment                                                                 |
| INFRA-36 | HIGH | L   | No guards exist for route, role, plan, magic-number or design-token literals, and the guards that do exist are unproven                                |
| INFRA-41 | HIGH | S   | The skill-vetting security gate can be silently disarmed by a documentation sweep or a warm cache                                                      |
| INFRA-43 | HIGH | M   | No documented backup or restore policy, and the object bucket has no versioning `HUMAN`                                                                |
| INFRA-50 | HIGH | S   | VS Code design-token CI guard is release-blocking and currently red on a color-mix() false positive                                                    |
| INFRA-60 | HIGH | S   | check-agent-context.mjs does an unguarded readdirSync('.agents/skills') and throws ENOENT on a clean checkout, killing the first link of a 40-guard ch |
| INFRA-61 | HIGH | M   | A proven client-boundary guard is parked outside the repo and 63 latent 'use client' violations remain in packages/ui/unified-chat                     |
| INFRA-06 | MEDI | S   | CodeQL default setup is still enabled, suppressing Rust analysis on pull requests                                                                      |
| INFRA-07 | MEDI | L   | The full Rust workspace is not under one trustworthy test and lint policy                                                                              |
| INFRA-09 | MEDI | S   | Reachability guards may still carry stale allowlist entries for a now-wired module                                                                     |
| INFRA-10 | MEDI | S   | check:env-contract fails on an undocumented MODERATION_HASH_DENYLIST variable                                                                          |
| INFRA-11 | MEDI | S   | check:ci-guardrails asserts vercel.json owns a rewrite that has moved to next.config.ts                                                                |
| INFRA-13 | MEDI | S   | Prettier is not enforced repo-wide; 733 files fail format:check                                                                                        |
| INFRA-14 | MEDI | S   | check-no-conflict-markers.py walks the working tree instead of git ls-files, false-positiving on local artifacts                                       |

**Batch W3.3 — `infra/ci`** · 8 items · 26 pts

| Item     | Sev  | Eff | Task                                                                                                                  |
| -------- | ---- | --- | --------------------------------------------------------------------------------------------------------------------- |
| INFRA-21 | MEDI | M   | Deployment topology is undeclared; a vestigial domain alias and two undeployed services duplicate live routes `HUMAN` |
| INFRA-38 | MEDI | L   | Build-graph and cache correctness are unverified, with no build budgets and unbounded module sizes                    |
| INFRA-39 | MEDI | M   | Asset classes are not separated and regeneration does not produce a clean diff                                        |
| INFRA-40 | MEDI | S   | The workflow flow-bundle can break dev and build, and nothing in CI builds it                                         |
| INFRA-47 | MEDI | S   | CI failures were never classified as pre-existing versus remediation regressions                                      |
| INFRA-59 | MEDI | L   | reference-integrity CI gate is green only against a ratcheting debt list carrying 224 undeclared references           |
| INFRA-42 | LOW  | S   | R2 CORS policy cannot be re-applied from the repository because no account-scoped token is stored                     |
| INFRA-46 | LOW  | S   | check:repo-organization is red on untracked root artifacts from other in-flight work                                  |

**Batch W3.4 — `mobile`** · 6 items · 10 pts

| Item   | Sev  | Eff | Task                                                                                                             |
| ------ | ---- | --- | ---------------------------------------------------------------------------------------------------------------- |
| MOB-02 | HIGH | M   | Mobile store submission is blocked on the iOS Issuer ID and Android Play Console setup `HUMAN`                   |
| MOB-15 | HIGH | S   | Mobile cloud sign-in and iOS launch fixes are code-only; signed-build confirmation still pending                 |
| MOB-16 | MEDI | S   | expo run:ios fails on a React Native codegen build-order issue, blocking the Maestro real-UI smoke               |
| MOB-18 | MEDI | M   | Mobile iOS 27 and newest-Android on-device model matrix cannot be certified without hardware                     |
| MOB-17 | LOW  | S   | Mobile jest setup lacks an expo-secure-store mock, breaking any suite touching SecureStore-backed stores         |
| MOB-29 | LOW  | S   | Mobile store listing metadata contains a dangling review-notes reference and a literal founder-phone placeholder |

**Batch W3.5 — `cli`** · 5 items · 11 pts

| Item   | Sev  | Eff | Task                                                                                                              |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------------- |
| CLI-02 | HIGH | M   | CLI has a release workflow but no publish step, and the declared npm version cannot match the release tag         |
| CLI-03 | HIGH | M   | No published protocol-7 AGI CLI exists, so the VS Code extension composer stays disabled for every trust boundary |
| CLI-14 | HIGH | M   | Rust dependency policy is red: cargo deny rejects pre-existing unmaintained and yanked crates                     |
| CLI-05 | LOW  | S   | cargo fmt --all --check fails on apps/cli/src/models/streaming.rs, gating the CLI release workflow                |
| CLI-10 | LOW  | S   | CLI path_security test intermittently fails under parallel execution due to shared process-global state           |

**Batch W3.6 — `desktop`** · 4 items · 22 pts

| Item    | Sev  | Eff | Task                                                                                                                 |
| ------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------- |
| DESK-03 | CRIT | L   | Desktop and CLI are marketed as Released but have no reachable install path (download endpoint 404s)                 |
| DESK-25 | HIGH | L   | Desktop release lacks an SBOM, a clean-machine install test, and any upgrade-from-previous-version test `HUMAN`      |
| DESK-29 | MEDI | M   | Desktop optional-feature build: remote-databases does not compile, and an integration test blocks all-targets clippy |
| DESK-64 | MEDI | M   | Electron Cloud shell changes are source-only: no packaged, signed app has run the callback or update journey `HUMAN` |

**Batch W3.7 — `security`** · 2 items · 4 pts

| Item   | Sev  | Eff | Task                                                                                                                                        |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-36 | HIGH | M   | Security static analysis and dependency advisories are not uniformly blocking; CodeQL default setup suppresses Rust analysis on PRs         |
| SEC-91 | HIGH | S   | MCP slopsquatting allow-list never loads in any packaged release build and fails open, so any npm package can be installed as an MCP server |

**Batch W3.8 — `extension`** · 2 items · 11 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EXT-04 | HIGH | M   | Chrome extension is fully verified in CI but has never been published to the Web Store, and packaging is blocked on the stable public key              |
| EXT-17 | MEDI | L   | VS Code extension release workflow has a single publish reference and no marketplace CI, publisher identity, Restricted Mode, remote-host, rollback or |

**Batch W3.9 — `testing`** · 2 items · 2 pts

| Item    | Sev  | Eff | Task                                                                                                                            |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------- |
| TEST-13 | HIGH | S   | VS Code extension's Local/BYOK/Managed-Cloud trust-boundary regression suites are currently red (17 failing / ~845-862 passing) |
| TEST-16 | LOW  | S   | No confirmed CI gate runs both sides of the TS/Rust cloud-sync fixture-replay parity test together                              |

**Batch W3.10 — `security/supply-chain`** · 1 items · 3 pts

| Item   | Sev  | Eff | Task                                                                                                                                               |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-35 | HIGH | M   | The skill-vetting security gate can be silently disarmed by a documentation change, and its CI runner reuses a cached venv that hides the breakage |

**Batch W3.11 — `docs`** · 1 items · 1 pts

| Item    | Sev  | Eff | Task                                                                               |
| ------- | ---- | --- | ---------------------------------------------------------------------------------- |
| DOCS-01 | HIGH | S   | THIRD_PARTY_LICENSES.md was deleted and never restored, leaving check:licenses red |

**Batch W3.12 — `ui`** · 1 items · 3 pts

| Item  | Sev  | Eff | Task                                                                                                                               |
| ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| UI-78 | HIGH | —   | 63 latent 'use client' boundary violations in packages/ui/unified-chat, and the guard that catches them is parked outside the repo |

### W4 — Untrusted input: injection, egress, sandbox escape and resource abuse

**37 open · 208 pts · 2C 23H 10M 2L**

_Why now._ With the perimeter and the pipeline settled, this wave closes the paths where attacker-authored content — a filename, a redirect, a tool description, a skill bundle, a page the model reads — becomes execution or exfiltration.

_Done when._ One host-authoritative egress policy is enforced in Rust and in the Node/Edge layers, applied to redirects after DNS resolution, and a test proves an HTTP 302 to a hostname resolving to 169.254.169.254 or 127.0.0.1 is refused on the MCP, CLI web_fetch and desktop paths. Every model-supplied path or argument reaches the OS through argv, never a shell string; saved approvals are rejected when the candidate contains any shell metacharacter including newline, and a prefix rule cannot authorize a cha

**Batch W4.1 — `security`** · 12 items · 49 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-90 | CRIT | XL  | Local-to-BYOK fork flow is not end-to-end on every surface: context selection, secret scan, payload preview, provider label, consent and preserved Loc |
| SEC-02 | HIGH | S   | Arbitrary file write from an unsanitized email attachment filename in the desktop app                                                                  |
| SEC-03 | HIGH | M   | Unbounded JSON-Schema $ref expansion (billion-laughs) from client-supplied tool parameters pins the shared gateway event loop                          |
| SEC-15 | HIGH | S   | Autofill decides a page is a Greenhouse/Lever/LinkedIn/Ashby application from an unanchored URL substring, writing the stored PII profile into an atta |
| SEC-22 | HIGH | M   | Persisted 'Always Allow' exec-policy prefix rule authorizes chained shell commands                                                                     |
| SEC-23 | HIGH | S   | Saved command approval matches newline-chained commands because the metacharacter guard never sees a newline                                           |
| SEC-24 | HIGH | S   | agi sync import writes bundle files outside ~/.agiworkforce because the traversal check runs on an unnormalized path                                   |
| SEC-30 | MEDI | S   | Upload completion buffers the entire stored object into memory before any size check, on both the chat-attachment and project-knowledge paths          |
| SEC-34 | MEDI | S   | url_fetch runs quadratic lazy-quantifier regexes synchronously over up to 1.5 MB of attacker-controlled remote HTML                                    |
| SEC-58 | MEDI | L   | Malware and content scanning of publicly servable uploads: a narrow scan landed, but the quarantine state machine and archive-bomb/polyglot/traversal  |
| SEC-76 | MEDI | L   | No network-egress domain allowlist or user-facing egress control for sandboxed skill/code execution                                                    |
| SEC-92 | LOW  | S   | Desktop voice_inject_text remains registered and invokable with its documented unsafe precondition unaddressed                                         |

**Batch W4.2 — `security/sandboxing`** · 5 items · 26 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-17 | HIGH | S   | Artifact sandbox accepts postMessage from any attacker-registered agiworkforce-\*.vercel.app origin and renders it as executable HTML                  |
| SEC-18 | HIGH | M   | Artifact sandbox isolation silently degrades to same-origin because NEXT_PUBLIC_SANDBOX_ORIGIN is unset, and the three CSP copies have already diverge |
| SEC-20 | HIGH | XL  | CAP-052 artifact runtime bridge is security NO-GO; RT-1..RT-5 unresolved and the parity ledger cites a nonexistent finding as its precondition         |
| SEC-19 | MEDI | S   | Sandbox React/Babel/mermaid runtime scripts load from CDN with no subresource integrity                                                                |
| SEC-67 | LOW  | S   | Tauri isolation pattern deadlocks every IPC call in dev builds, creating pressure to disable a security control                                        |

**Batch W4.3 — `security/prompt-injection`** · 4 items · 15 pts

| Item   | Sev  | Eff | Task                                                                                                                                             |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-21 | HIGH | S   | Cloud Code list_files interpolates a model-supplied path into a shell command, bypassing the command-approval boundary                           |
| SEC-28 | HIGH | M   | Remote MCP server tool description/title is admitted verbatim into the LLM tool catalog (MCP tool poisoning)                                     |
| SEC-29 | HIGH | L   | No shared untrusted-content envelope across surfaces; browser DOM, page content, files, connector and terminal output reach the model unfenced   |
| SEC-33 | HIGH | M   | Attacker-authored skill content is embedded in the prompt that decides which security findings survive, so a skill can suppress its own findings |

**Batch W4.4 — `security/ssrf`** · 3 items · 24 pts

| Item   | Sev  | Eff | Task                                                                                                                                                  |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-05 | HIGH | XL  | No host-authoritative egress policy: native Rust, sidecar, MCP and tool traffic bypasses the WebView/guardedFetch guard, and the one org allowlist is |
| SEC-25 | HIGH | M   | MCP HTTP transports follow redirects with no egress policy, defeating both callers' pre-flight SSRF checks                                            |
| SEC-26 | HIGH | S   | CLI web_fetch redirect handler re-checks only the URL string, so a redirect to a hostname resolving to an internal IP is followed                     |

**Batch W4.5 — `desktop`** · 3 items · 26 pts

| Item    | Sev  | Eff | Task                                                                                            |
| ------- | ---- | --- | ----------------------------------------------------------------------------------------------- |
| DESK-01 | CRIT | XL  | Rust-side network egress bypasses every guard; no host-authoritative egress policy exists       |
| DESK-28 | HIGH | M   | Tauri isolation pattern deadlocks every IPC call in dev and in non-custom-protocol builds       |
| DESK-32 | MEDI | M   | Desktop agent-mode guardrail gap remains on the Rust egress/host-denylist path after the UI fix |

**Batch W4.6 — `cli`** · 3 items · 41 pts

| Item   | Sev  | Eff | Task                                                                                                                       |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------- |
| CLI-17 | HIGH | XL  | CLI has no OS-level command sandbox on Windows — the shell tool either fails closed or runs fully unsandboxed              |
| CLI-24 | HIGH | XL  | CLI has no OS-level command sandbox on Windows — the shell tool either fails outright or requires disabling all sandboxing |
| CLI-18 | MEDI | S   | Linux seccomp sandbox is implemented but not compiled into the release binary                                              |

**Batch W4.7 — `security/supply-chain`** · 2 items · 4 pts

| Item   | Sev  | Eff | Task                                                                                                                                             |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-32 | HIGH | S   | SkillSpector follows symlinks inside an untrusted skill bundle, reading arbitrary local files into the scan context and shipping them to the LLM |
| SEC-31 | MEDI | M   | Three catastrophic-backtracking regexes in SkillSpector let a scanned skill hang the supply-chain vetting gate                                   |

**Batch W4.8 — `billing`** · 1 items · 8 pts

| Item    | Sev  | Eff | Task                                                                                                                                                  |
| ------- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| BILL-57 | HIGH | L   | The artifact runtime bridge cannot ship until its billing preconditions are resolved — anonymous viewers would bill the publisher and no per-artifact |

**Batch W4.9 — `extension`** · 1 items · 3 pts

| Item   | Sev  | Eff | Task                                                                                                    |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------- |
| EXT-06 | MEDI | M   | Chrome extension drives full DevTools-Protocol browser control with no elevated-risk gate or disclosure |

**Batch W4.10 — `integrations`** · 1 items · 8 pts

| Item    | Sev  | Eff | Task                                                                                                       |
| ------- | ---- | --- | ---------------------------------------------------------------------------------------------------------- |
| CONN-12 | HIGH | L   | Connectors and MCP resources have no untrusted-content envelope, so tool output enters the prompt unfenced |

**Batch W4.11 — `infra/ci`** · 1 items · 3 pts

| Item     | Sev  | Eff | Task                                                                               |
| -------- | ---- | --- | ---------------------------------------------------------------------------------- |
| INFRA-44 | HIGH | M   | The desktop dev loop deadlocks on every IPC call under the Tauri isolation pattern |

**Batch W4.12 — `docs`** · 1 items · 1 pts

| Item    | Sev  | Eff | Task                                                                     |
| ------- | ---- | --- | ------------------------------------------------------------------------ |
| DOCS-04 | MEDI | S   | The parity ledger gates a capability on a finding ID that does not exist |

### W5 — Authorization, tenant isolation and enterprise governance controls

**31 open · 288 pts · 2C 13H 12M 4L**

_Why now._ The previous waves stop outsiders; this one stops the wrong insider.

_Done when._ One policy evaluator answers every owner/admin and per-tool authorization question; no hand-written role predicate remains in TypeScript or raw SQL, proven by a grep guard. Connector per-tool permission level, granted scopes, risk class and org browse-domain policy are checked server-side before execution, with a denial test per level. RLS is enabled on every tenant/user-owned table and a CI guard fails when a new table lands without an explicit isolation decision. Legacy uploaded/generated obje

**Batch W5.1 — `security`** · 10 items · 75 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-06 | HIGH | XL  | Stored security policy is display-only — connector per-tool permissions, granted scopes, risk class, org browse-domain policy and tenant restrictions  |
| SEC-07 | HIGH | L   | Row-level security coverage is incomplete across tenant/user-owned tables and no CI guard forces an isolation decision on new ones                     |
| SEC-08 | HIGH | L   | Legacy uploaded and generated files remain at permanent unauthenticated URLs; avatar/public-media policy and orphan-presign lifecycle are undecided    |
| SEC-88 | HIGH | M   | A blanket GRANT on all public-schema tables can silently re-grant UPDATE/DELETE on security_audit_logs to app_rls, undoing audit-log immutability with |
| SEC-53 | MEDI | L   | Admin console is a readiness dashboard, not an authoritative control plane                                                                             |
| SEC-54 | MEDI | L   | Audit export, SIEM delivery and trace correlation are effectively absent; the org audit route has zero clients                                         |
| SEC-56 | MEDI | L   | Procurement security evidence is essentially missing and published security-control claims are not derived from actual control state                   |
| SEC-65 | MEDI | L   | Moderation has a scored platform classifier but no per-organization thresholds, appeal/review state, audit events or evaluation sets                   |
| SEC-77 | LOW  | M   | No account-wide default-approval policy for installed plugin/tool actions                                                                              |
| SEC-96 | LOW  | S   | Chrome extension site allowlist has no default-permission policy, only a static list                                                                   |

**Batch W5.2 — `security/auth`** · 7 items · 68 pts

| Item   | Sev  | Eff | Task                                                                                                                                                     |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-89 | CRIT | S   | delete_user_data(text) is SECURITY DEFINER with EXECUTE still open to public, so any grantee can purge any user's audit rows by passing their id `HUMAN` |
| SEC-51 | HIGH | XL  | SSO/SCIM identity lifecycle is incomplete: group→role mapping is never persisted, directory sync has no storage, domain verification fails open to dis   |
| SEC-71 | HIGH | L   | Workspace/org model-access policy and the whole enterprise local-policy runtime (MDM, managed overrides, model restrictions, defaults push) are define   |
| SEC-52 | MEDI | XL  | Authorization is four hardcoded roles in SQL and TypeScript with no extensible RBAC/ABAC, groups, delegated admin, service accounts or break-glass       |
| SEC-57 | MEDI | M   | owner/admin authorization predicate is hand-written across TypeScript and raw SQL rather than one policy evaluator                                       |
| SEC-75 | MEDI | L   | No enforced organization/tenant governance policy for skills or plugins — policy labels are duplicated and nothing scopes install or execution to a te   |
| SEC-85 | LOW  | L   | No scoped, per-session authorization tokens — only developer API keys carry scopes                                                                       |

**Batch W5.3 — `compliance/dpdp`** · 6 items · 67 pts

| Item    | Sev  | Eff | Task                                                                                                                                                           |
| ------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DPDP-28 | CRIT | L   | Legacy uploads, avatars and pre-change generated media remain at permanent unauthenticated URLs with no orphan-upload lifecycle                                |
| DPDP-30 | HIGH | L   | Zero-data-retention is not proven as an enforceable capability and secret scanning runs only at support handoff                                                |
| DPDP-32 | HIGH | XL  | Enterprise SSO is marketed as supporting SAML/OIDC but has never been verified against a live instance, and connections are instance-level rather than         |
| DPDP-34 | HIGH | XL  | Enterprise data-governance controls — legal hold, retention, residency, DLP, eDiscovery, CMEK, IP allowlist, compliance export, org analytics and tena `HUMAN` |
| DPDP-31 | MEDI | M   | Mobile content reports have an intake endpoint but nothing routes them to a human reviewer                                                                     |
| DPDP-39 | MEDI | L   | Enterprise/SSO/SCIM/Compliance-API depth was never audited: no domain-enterprise pass exists and nobody traced what writes or reads enterprise_audit_e         |

**Batch W5.4 — `integrations`** · 3 items · 24 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CONN-06 | HIGH | L   | Per-tool connector permission levels are never enforced server-side; scopes and risk class are display-only                                            |
| CONN-28 | HIGH | L   | Connector browse/connect/add/disconnect is implemented twice, has already drifted three ways, and a security hardening fix was not propagated to the s |
| CONN-20 | MEDI | L   | No enforced org/tenant governance policy for skills or plugins                                                                                         |

**Batch W5.5 — `infra/ci`** · 2 items · 23 pts

| Item     | Sev  | Eff | Task                                                                                                                                                           |
| -------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INFRA-35 | HIGH | XL  | No tenant isolation strategy, no database capacity testing, and no storage or transfer quotas                                                                  |
| INFRA-53 | LOW  | M   | Enterprise-Local licensing verification is fully built twice (TypeScript + Rust), wired into nothing, with no fixture-replay parity test between the t `HUMAN` |

**Batch W5.6 — `security/crypto`** · 1 items · 20 pts

| Item   | Sev  | Eff | Task                                                                                                               |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------ |
| SEC-55 | MEDI | XL  | Enterprise encryption and network controls are absent: CMEK/BYOK, key rotation, private endpoint/VPC, IP allowlist |

**Batch W5.7 — `mobile`** · 1 items · 3 pts

| Item   | Sev  | Eff | Task                                                                                     |
| ------ | ---- | --- | ---------------------------------------------------------------------------------------- |
| MOB-27 | MEDI | M   | Mobile content reports have an intake endpoint but no moderation workflow or reviewer UI |

**Batch W5.8 — `ai-routing`** · 1 items · 8 pts

| Item  | Sev  | Eff | Task                                                                                                       |
| ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------- |
| AI-42 | HIGH | L   | Workspace/organization model-access policy is defined in two separate contract layers and enforced nowhere |

### W6 — Privacy, consent, erasure and legal obligations

**58 open · 241 pts · 4C 32H 16M 6L**

_Why now._ This wave is grouped by regulator rather than by code path because the obligations interlock: an erasure path is worthless if telemetry survives it, a consent record is worthless if no server-side timestamp or policy version exists, and a privacy policy that omits ten collected categories cannot be corrected without knowing what W1–W5 actually enforce — which is why it runs after them.

_Done when._ Account deletion enumerates every table and local store holding personal data (desktop SQLite emails, contacts, screenshots, OCR text included) and a test asserts zero rows and zero files remain for a deleted principal, including anonymous NULL-user_id rows in waitlist/consent/rights tables and propagation to object storage, vector/search indexes, caches and analytics under a written retention tier policy. Desktop telemetry is constructed disabled, respects the consent gate and does not survive

**Batch W6.1 — `compliance/dpdp`** · 14 items · 54 pts

| Item    | Sev  | Eff | Task                                                                                                                                                           |
| ------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DPDP-04 | CRIT | L   | No verifiable parental consent — web has no age gate at all and mobile's is self-declared and child-clearable `HUMAN`                                          |
| DPDP-06 | CRIT | L   | Desktop 'delete my account' erases 7 of roughly 100 tables and leaves local emails, contacts, screenshots and OCR text untouched                               |
| DPDP-19 | CRIT | L   | Mobile shows no privacy notice at onboarding, its iOS privacy manifest under-declares collection, and store privacy declarations misstate what is shar `HUMAN` |
| DPDP-21 | CRIT | S   | GDPR Article 27 EU representative has not been appointed — the product's own page says the obligation is live and unmet `HUMAN`                                |
| DPDP-01 | HIGH | M   | Model-training preference copy and controls are inconsistent across surfaces and may reference a control that never existed                                    |
| DPDP-02 | HIGH | L   | EU AI Act Article 50 disclosure is enforced on one surface of six, and the web surface now relies on an unreviewed carve-out                                   |
| DPDP-03 | HIGH | S   | Mobile Article 50 legal page falsely claims exported chat text and audio carry provenance marks                                                                |
| DPDP-05 | HIGH | S   | Third-party recipient disclosure across /subprocessors, /privacy and /terms — sources disagree on whether the omissions are corrected                          |
| DPDP-07 | HIGH | M   | Desktop telemetry is constructed enabled with no privacy mode, bypasses the consent gate, and survives Delete All Data                                         |
| DPDP-08 | HIGH | M   | Anonymous rows with NULL user_id in waitlist, consent and data-rights tables are unreachable by any erasure path                                               |
| DPDP-09 | HIGH | M   | 'Unsubscribe anytime' is promised in the waitlist UI but no unsubscribe path exists                                                                            |
| DPDP-10 | HIGH | S   | Nobody is notified when a data-rights request arrives and nothing polls the admin queue                                                                        |
| DPDP-11 | HIGH | M   | Server and edge Sentry initialise for every request with no consent check and retain a stable user id                                                          |
| DPDP-13 | HIGH | M   | Cookie consent has no server-side record, timestamp or policy version, and never expires when the notice changes                                               |

**Batch W6.2 — `compliance/dpdp`** · 14 items · 97 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DPDP-14 | HIGH | M   | The privacy policy's 'what we collect' table omits roughly ten data categories the product provably collects                                           |
| DPDP-16 | HIGH | M   | Retention has no maximum age for waitlist emails, support tickets or rights requests, and the two lifecycle crons are not registered so they never run |
| DPDP-17 | HIGH | XL  | Legal pages are hardcoded English JSX with no i18n, mechanically blocking the Eighth Schedule language requirement `HUMAN`                             |
| DPDP-18 | HIGH | L   | The Chrome extension injects into every page, requests debugger and cookie permissions, mirrors transcripts to the cloud with no opt-out, and shows no |
| DPDP-22 | HIGH | XL  | Significant Data Fiduciary status is undetermined — if notified, a named India DPO, DPIA and independent audit are all required and none exist         |
| DPDP-23 | HIGH | S   | Grievance Officer is a role account not a named individual, the notice address is unconfirmed, and no privacy or grievance mailbox exists              |
| DPDP-24 | HIGH | M   | Terms version was deliberately not bumped for the new data-protection section because bumping breaks every device session, and its arbitration carve-o |
| DPDP-25 | HIGH | M   | The DPA has no DPDP annex, uses controller/processor framing the Act does not share, and commits to no data-principal breach notification              |
| DPDP-27 | HIGH | S   | Mobile store listings publish an unqualified DPDP compliance claim that overstates the actual position                                                 |
| DPDP-29 | HIGH | M   | No copyright or DMCA takedown execution path exists on any public share or artifact page                                                               |
| DPDP-36 | HIGH | L   | Thirteen published legal and policy claims were audited but never verified against code, including whether tool approval is actually required by defau |
| DPDP-37 | HIGH | XL  | Deletion and retention do not propagate to object storage, search and vector indexes, caches, backups or analytics, and no retention tiers are defined |
| DPDP-38 | HIGH | M   | EU AI Act Article 50 provenance-marker serialization silently strips every nested key, and web hand-restates the marker shape instead of importing it, |
| DPDP-42 | HIGH | S   | Both live account-deletion flows have zero test coverage                                                                                               |

**Batch W6.3 — `compliance/dpdp`** · 14 items · 29 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DPDP-53 | HIGH | S   | No designated incident commander and no on-call rota for data-breach response — the founder owns every incident by default                             |
| DPDP-54 | HIGH | L   | No mass-notification path exists to email an arbitrary list of affected data principals, so individual intimation under DPDP §5 is manual and does not |
| DPDP-90 | HIGH | S   | The in-flight web_artifact_index table has no account-erasure classification, so committing its migration will fail the erasure guard `HUMAN`          |
| DPDP-12 | MEDI | S   | The signed-in app shell has no legal footer, so the grievance contact is unreachable from inside the product                                           |
| DPDP-15 | MEDI | M   | No nomination field exists (DPDP s.14) — nominations are handled manually via the request form                                                         |
| DPDP-20 | MEDI | S   | /trust and /security omit any Indian data-protection obligation                                                                                        |
| DPDP-26 | MEDI | S   | Breach notification templates are engineer-drafted from statute and unreviewed by counsel                                                              |
| DPDP-40 | MEDI | S   | Eleven legacy or dead database tables and an authored-but-unapplied drop migration are untracked as a group, so the erasure-only tables and the founde |
| DPDP-43 | MEDI | S   | The unmounted UserSettings.tsx delete handler calls the data-only erasure endpoint while telling the user their account is deleted and signing them ou |
| DPDP-45 | MEDI | S   | The temporary-chat memory exclusion is enforced only on the live request path; the second web chat runtime injects saved memory with no isTemporary ch |
| DPDP-47 | MEDI | M   | No published commercial or enterprise legal-terms document exists distinct from the consumer Terms — enterprise terms are bespoke-negotiated only      |
| DPDP-52 | MEDI | M   | Deleting a project permanently orphans its knowledge files — the soft delete never fires the ON DELETE CASCADE, there is no restore endpoint, and the  |
| DPDP-55 | MEDI | M   | No breach-notice page and no in-product banner exist, so the delivery method the breach runbook assumes would have to be built during the incident     |
| DPDP-56 | MEDI | S   | Security audit log 90-day retention is a routine an administrator runs by hand, not a schedule, so the retention actually applied is unknown and a lat |

**Batch W6.4 — `compliance/dpdp`** · 7 items · 23 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DPDP-58 | MEDI | L   | Desktop native crash-dump upload was removed for consent reasons and has no consent-safe replacement — rebuilding it requires a typed runtime consent  |
| DPDP-44 | LOW  | S   | No disclosure of whether saved memory personalizes outbound tool or web-search queries, and nobody has established whether it does                     |
| DPDP-46 | LOW  | S   | No ad-personalization opt-out exists, and it has never been confirmed whether any advertising vendor receives account data                             |
| DPDP-48 | LOW  | S   | No commercial-tier dispute-resolution stance exists, so consumer arbitration terms apply by default to every paying tier absent a signed MSA           |
| DPDP-49 | LOW  | S   | The privacy notice says nothing about non-account-holder third parties whose personal data enters the product through a user's connectors or conversat |
| DPDP-50 | LOW  | L   | Consumer Terms and Privacy are a single worldwide document with Texas governing law and no EEA/UK/Switzerland variant                                  |
| DPDP-57 | LOW  | M   | Vendor log retention (Vercel, Neon) is set by the vendors, so breach evidence may expire before the investigation reaches it                           |

**Batch W6.5 — `mobile`** · 3 items · 26 pts

| Item   | Sev  | Eff | Task                                                                                                          |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------- |
| MOB-05 | HIGH | M   | Mobile presents no privacy notice during onboarding and requests a Contacts permission no code reads          |
| MOB-06 | HIGH | XL  | Mobile age gate is self-declared with no verifiable parental consent, and minor-safe mode is child-clearable  |
| MOB-04 | MEDI | M   | Locked iOS privacy-manifest review copy has drifted from the real generated manifest and cites a deleted path |

**Batch W6.6 — `desktop`** · 2 items · 4 pts

| Item    | Sev  | Eff | Task                                                                                       |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------ |
| DESK-22 | HIGH | M   | Desktop 'delete my account' erases 7 of ~100 tables and leaves local SQLite content behind |
| DESK-24 | MEDI | S   | Desktop support-bundle redaction default (no conversation content) is unverified           |

**Batch W6.7 — `testing`** · 2 items · 2 pts

| Item    | Sev  | Eff | Task                                                                                                 |
| ------- | ---- | --- | ---------------------------------------------------------------------------------------------------- |
| TEST-18 | HIGH | S   | Zero test coverage for either live account-deletion flow                                             |
| TEST-11 | MEDI | S   | The support-bundle redaction default is unverified — nothing proves conversation content is excluded |

**Batch W6.8 — `security`** · 1 items · 3 pts

| Item   | Sev  | Eff | Task                                                                                                                                  |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-63 | MEDI | M   | Chrome extension requests all-URLs content script, debugger and cookies permissions with no in-product disclosure of what they enable |

**Batch W6.9 — `extension`** · 1 items · 3 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EXT-07 | HIGH | M   | Chrome extension exposes no privacy notice anywhere in its UI while injecting into every page, requesting debugger and cookies permissions, and mirror |

### W7 — Billing, metering and entitlements

**76 open · 357 pts · 3C 29H 34M 10L**

_Why now._ Money correctness is one domain with one shared context — Stripe configuration, the plan/entitlement model, the usage ledger and the paywall surfaces all touch the same code — and it must be settled before feature waves add more billable surface area.

_Done when._ A real card is charged in live mode for each published plan and currency, the amount matches the published price to the cent, and no plan resolves to a missing Price ID; automatic tax returns a non-zero rate where due. One billing/entitlement domain package is the only source of plan identity (stable IDs separate from display labels), exposes a machine-readable effective-entitlement endpoint, and cross-surface contract tests prove web, desktop, mobile, VS Code and CLI agree. Every provider-cost

**Batch W7.1 — `billing`** · 14 items · 92 pts

| Item    | Sev  | Eff | Task                                                                                                                             |
| ------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| BILL-01 | CRIT | M   | Production Stripe runs in TEST mode — no real customer can be charged, and the live catalog contradicts published prices `HUMAN` |
| BILL-04 | CRIT | L   | Enterprise is unlimited at $0 and the entire feature-gate subsystem has zero production callers                                  |
| BILL-06 | CRIT | M   | Managed audio transcription incurs provider cost with no reservation, settlement or usage record                                 |
| BILL-02 | HIGH | M   | Stripe key mode and Price IDs are misaligned; four price env vars are missing so Team checkout fails closed `HUMAN`              |
| BILL-03 | HIGH | S   | Stripe automatic tax is enabled in code but its dashboard preconditions are unset, so VAT is collected at 0%                     |
| BILL-05 | HIGH | M   | Documented per-tier spend ceilings have zero runtime readers, and free-tier voice is contractually uncapped                      |
| BILL-07 | HIGH | XL  | Non-token provider costs are not metered anywhere, so no real COGS ledger exists                                                 |
| BILL-08 | HIGH | L   | No usage ledger attributes cost to run, task, user, project or tenant with idempotent event IDs                                  |
| BILL-09 | HIGH | L   | Spend caps and auto-reload are not enforced before execution and are not consent-gated                                           |
| BILL-10 | HIGH | L   | Provider and Stripe settlement data are never reconciled against internal usage                                                  |
| BILL-13 | HIGH | L   | No single billing and entitlement domain package — plan logic lives in Web-only ad hoc code                                      |
| BILL-15 | HIGH | L   | No machine-readable effective-entitlement endpoint and no cross-surface entitlement contract tests                               |
| BILL-16 | HIGH | L   | Enterprise custom/contract limits are only migrated on the web org path; other surfaces still use the old representation         |
| BILL-17 | HIGH | M   | Checkout is not proven idempotent and entitlement grant may not be strictly gated on authoritative payment confirmation          |

**Batch W7.2 — `billing`** · 14 items · 68 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BILL-18 | HIGH | L   | Upgrade/downgrade/proration policy is undefined and subscription state transitions are not proven monotonic                                            |
| BILL-19 | HIGH | M   | Webhook signature, timestamp, event-ID and API-version verification plus dedup are not fully confirmed                                                 |
| BILL-21 | HIGH | L   | No real self-serve Team purchase path, and Team subscriptions are not bound to organization ownership                                                  |
| BILL-23 | HIGH | M   | Credit top-ups have fulfillment and a route but no purchase surface — the 402 error tells users to add credits with nowhere to buy them                |
| BILL-24 | HIGH | M   | Subscription allowance is not separated from purchased credit balance                                                                                  |
| BILL-33 | HIGH | XL  | Payment-fraud controls are largely absent and blocks have no reason codes or appeal path                                                               |
| BILL-38 | HIGH | M   | RBI's Rs 15,000 e-mandate ceiling makes two published INR prices legally unable to auto-renew                                                          |
| BILL-44 | HIGH | L   | Mobile native IAP is fully built but dark, blocked on store products, migration 0112, credentials, listing copy and tax registration `HUMAN`           |
| BILL-45 | HIGH | S   | Pre-execution credit reservation landed in code but has no production migration or cron proof                                                          |
| BILL-46 | HIGH | S   | Managed video generation storage is configured but awaiting a production redeploy and verification                                                     |
| BILL-51 | HIGH | M   | Capability gates are not proven exhaustive across all plans and trust modes                                                                            |
| BILL-58 | HIGH | M   | The concurrency limiter and gateway rate limiter both fail open when Redis is unavailable, removing the backstop against cost amplification            |
| BILL-60 | HIGH | S   | Organization-invitation expiry cron is implemented and idempotent but was never added to vercel.json, so a lapsed invitation holds a paid seat forever |
| BILL-63 | HIGH | M   | Account deletion is not blocked by an active paid subscription, in either of two independently-built delete-account flows `HUMAN`                      |

**Batch W7.3 — `billing`** · 14 items · 65 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BILL-72 | HIGH | L   | No usage, budget, billing or security transactional email channels exist — only schedule-completion notifications were built on the new email transpor |
| BILL-11 | MEDI | M   | No quality-adjusted cost or accepted-task economics are tracked                                                                                        |
| BILL-12 | MEDI | M   | Prompt-cache and compression cost effects are not measured                                                                                             |
| BILL-14 | MEDI | M   | Plan identity is not separated from display labels, so renames and regional pricing break stable IDs                                                   |
| BILL-20 | MEDI | M   | Billing self-service is portal-redirect only — no in-app invoice history, payment method display, or cancel-plan control, and portal authorization is  |
| BILL-22 | MEDI | L   | Enterprise contract onboarding is incomplete and there are no delegated billing/admin roles with audit                                                 |
| BILL-25 | MEDI | M   | Refund-delta correctness is unconfirmed under replay, out-of-order delivery and partial refunds                                                        |
| BILL-26 | MEDI | M   | Rolling usage windows are imprecisely defined and reset times may not derive from authoritative windows                                                |
| BILL-27 | MEDI | L   | No per-project or per-team budgets, chargeback or showback despite it being advertised                                                                 |
| BILL-28 | MEDI | M   | Web-versus-store subscription ownership conflicts have no documented resolution policy                                                                 |
| BILL-29 | MEDI | L   | Gross margin is not computed from settled revenue, estimates are not separated from settled values, and no margin dashboards or alerts exist           |
| BILL-30 | MEDI | S   | A published '40% gross margin' claim has no live calculation behind it                                                                                 |
| BILL-32 | MEDI | M   | Gift and promo codes lack ledger-backed issuance and redemption                                                                                        |
| BILL-34 | MEDI | L   | Billing events are uncorrelated, there are no customer-safe diagnostics, and no operational billing alerts exist                                       |

**Batch W7.4 — `billing`** · 14 items · 53 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BILL-35 | MEDI | M   | No data-retention or audit policy for financial records                                                                                                |
| BILL-36 | MEDI | M   | Enterprise accounts are deliberately uncapped but have no spend observability at all                                                                   |
| BILL-37 | MEDI | S   | Basic tier displays $7 while the referenced Stripe price object is $8 `HUMAN`                                                                          |
| BILL-39 | MEDI | M   | Stripe's 26-hour India card renewal delay and mandate-decline codes are unhandled                                                                      |
| BILL-40 | MEDI | S   | INR pricing is published in code but not sellable — no active INR Stripe Prices exist                                                                  |
| BILL-41 | MEDI | M   | Currency support does not generalise — only USD and INR resolve, per-currency Price slots are missing for three plans, and the INR top-up rate is unde |
| BILL-43 | MEDI | L   | Razorpay integration has unanswered sales and tax questions that must be resolved before any code is written                                           |
| BILL-48 | MEDI | M   | AGI Work runs carry no per-task cost or usage, so a long autonomous run is unpriced to the user                                                        |
| BILL-49 | MEDI | M   | Three published pricing-page feature claims have no implementation behind them                                                                         |
| BILL-50 | MEDI | M   | VS Code shows no credit balance and only a single aggregate usage bar with no per-model limits or reset schedule                                       |
| BILL-52 | MEDI | M   | Gateway LLM rate limit may still be a flat 30/min for every tier including Pro and Max                                                                 |
| BILL-53 | MEDI | M   | Reasoning-effort access is not clamped server-side by entitlement and unavailable levels are not shown honestly                                        |
| BILL-54 | MEDI | L   | Plugin plan entitlements have no authoritative installation or execution lifecycle to attach to                                                        |
| BILL-55 | MEDI | L   | No storage or transfer quota exists per user, project or organization, and no surface shows account-level quota state                                  |

**Batch W7.5 — `billing`** · 14 items · 55 pts

| Item    | Sev  | Eff | Task                                                                                                                                                          |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BILL-56 | MEDI | S   | Stale and conflicting plan-pricing copy persists across docs and locale bundles                                                                               |
| BILL-61 | MEDI | M   | Enterprise-Local licensing verification is fully implemented twice (TypeScript package and Rust crate) with no runtime consumer and no fixture-replay `HUMAN` |
| BILL-68 | MEDI | XL  | No education-institution plan exists (no route, plan card, or billing-catalog entry)                                                                          |
| BILL-71 | MEDI | S   | Unswept consumers of `subscription?.tier ?? 'free'` without a billing-readiness guard may still misreport a paying customer as Free                           |
| WEB-62  | MEDI | S   | Unswept `subscription?.tier ?? 'free'` reads without a billing-readiness guard may still misrender plan state elsewhere                                       |
| BILL-31 | LOW  | M   | referral_code field is stored but entirely unwired                                                                                                            |
| BILL-42 | LOW  | S   | The 7-seat India Team threshold exists only as a documented decision, not a checkout check                                                                    |
| BILL-47 | LOW  | S   | isManagedComputePrivateBetaEnabled() asserts the opposite of its return value                                                                                 |
| BILL-62 | LOW  | S   | Three legacy-alias /api/usage/\* billing routes have zero callers anywhere in the monorepo                                                                    |
| BILL-64 | LOW  | M   | Usage bars are model-class-scoped only — no per-named-model usage row exists in the contract or the UI                                                        |
| BILL-65 | LOW  | L   | No named higher-usage seat SKU exists within the Team plan — Team models exactly one uniform $25/seat price                                                   |
| BILL-66 | LOW  | L   | No self-serve Enterprise checkout path — the Enterprise card's only CTA is contact-sales                                                                      |
| BILL-67 | LOW  | M   | No published per-model API pricing, cache-tier rates, named service tiers or batch discount, despite cache economics already being computed internally        |
| BILL-69 | LOW  | S   | No disclosed nonprofit discount program or FAQ entry                                                                                                          |

**Batch W7.6 — `billing`** · 1 items · 1 pts

| Item    | Sev | Eff | Task                                                                                                                        |
| ------- | --- | --- | --------------------------------------------------------------------------------------------------------------------------- |
| BILL-70 | LOW | S   | The in-app paywall shows the upgrade tier's name but never its price, though the price is already returned by the same call |

**Batch W7.7 — `infra/ci`** · 2 items · 4 pts

| Item     | Sev  | Eff | Task                                                                                                                        |
| -------- | ---- | --- | --------------------------------------------------------------------------------------------------------------------------- |
| INFRA-49 | HIGH | S   | Organization-invitation expiry cron is fully implemented but never scheduled — lapsed invitations never release paid seats  |
| INFRA-51 | HIGH | M   | Video-generation reconciliation sweep exists but is never scheduled — an abandoned job stays 'queued' forever, fully billed |

**Batch W7.8 — `security/auth`** · 1 items · 3 pts

| Item   | Sev  | Eff | Task                                                                                                            |
| ------ | ---- | --- | --------------------------------------------------------------------------------------------------------------- |
| SEC-68 | MEDI | M   | resolveAutoRoute grants any catalog model on an explicit selection without applying subscription-tier admission |

**Batch W7.9 — `mobile`** · 1 items · 8 pts

| Item   | Sev  | Eff | Task                                                                                                                              |
| ------ | ---- | --- | --------------------------------------------------------------------------------------------------------------------------------- |
| MOB-07 | HIGH | L   | Native iOS/Android in-app purchases are fully built but dark, blocked on store products, migrations and founder paperwork `HUMAN` |

**Batch W7.10 — `ai-routing`** · 1 items · 8 pts

| Item  | Sev  | Eff | Task                                                                        |
| ----- | ---- | --- | --------------------------------------------------------------------------- |
| AI-25 | MEDI | L   | Model service tiers and reasoning-effort access are not enforced end to end |

### W8 — Model routing, agent runtime, connectors and durable execution

**92 open · 607 pts · 0C 33H 47M 12L**

_Why now._ This is the engine every surface calls, so it is fixed once, centrally, before the surface waves build on it — otherwise web, desktop, mobile and CLI each grow another private copy of the same routing bug.

_Done when._ No provider endpoint or model ID literal exists outside the canonical registry and its generated mirrors — enforced by a guard that scans web, desktop, CLI, mobile and test fixtures; replacing a model requires no consumer edit. Routing slots exist for speech synthesis, transcription and realtime audio; no retired or deprecated model is served without a recorded successor decision. Every runtime profile resolves at least one candidate for desktop local-chat and cloud-chat, and the model badge rep

**Batch W8.1 — `ai-routing`** · 14 items · 99 pts

| Item  | Sev  | Eff | Task                                                                                                                                           |
| ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-01 | HIGH | L   | Provider endpoint literals bypass the canonical registry across web, desktop and CLI                                                           |
| AI-04 | HIGH | M   | No voice/TTS routing slot exists, so speech defaults are hardcoded and a retired model stayed live for 19 days                                 |
| AI-08 | HIGH | L   | Auto routing is only partially migrated off fake model records and hardcoded task maps                                                         |
| AI-09 | HIGH | M   | The model shown to the user is the model requested, not the model that actually ran                                                            |
| AI-12 | HIGH | XL  | Project knowledge is prompt-stuffed, not retrieved — no embeddings, ranking, ACL filtering or provenance                                       |
| AI-13 | HIGH | L   | Deep Research silently degrades: Anthropic bypasses the research loop, connector tools are stripped, project files are uncitable               |
| AI-14 | HIGH | L   | Agent checkpoints are not durably persisted, so a process or deploy failure cannot be recovered without duplicating completed effects          |
| AI-17 | HIGH | M   | The 'research' capability flag is decorative server-side — it is gated on 'search' instead                                                     |
| AI-19 | HIGH | XL  | No canonical cross-surface agent-runtime contract; the harness is implemented independently in Desktop and CLI                                 |
| AI-20 | HIGH | S   | The OpenAI Responses dialect for reasoning models has never been smoke-tested with a live key                                                  |
| AI-24 | HIGH | M   | Code execution silently no-ops on the OpenAI chat-completions path and under providers with no execution tool                                  |
| AI-26 | HIGH | L   | Memory has no project scope, no source suppression and no user-visible provenance or correction                                                |
| AI-29 | HIGH | M   | The Cloud Code approval state machine is write-only — a suspended turn can never be decided or resumed                                         |
| AI-37 | HIGH | M   | Durable (survives-connection-close) execution for initial AGI Work turns is off by default while CHANGELOG describes the flag as a kill-switch |

**Batch W8.2 — `ai-routing`** · 14 items · 85 pts

| Item  | Sev  | Eff | Task                                                                                                                 |
| ----- | ---- | --- | -------------------------------------------------------------------------------------------------------------------- |
| AI-38 | HIGH | M   | No way to steer or redirect an active agentic run without stopping it entirely                                       |
| AI-39 | HIGH | L   | Scheduled task execution has zero tool access — no web search, code execution, connectors, MCP, files or media       |
| AI-40 | HIGH | L   | Web chat never retrieves or references excerpts from the user's other past conversations at send time                |
| AI-58 | HIGH | XL  | No developer-session remote-control protocol exists end to end on any surface                                        |
| AI-02 | MEDI | M   | Retired and hardcoded model IDs persist in directories the model-ID guard never scans                                |
| AI-03 | MEDI | S   | Model registry still names a deleted google-batch adapter, and preview-only batch-tier code has no backend or caller |
| AI-05 | MEDI | L   | Catalog schema has no realtime/duplex audio model type, so realtime voice cannot be modelled at all                  |
| AI-06 | MEDI | S   | The only model served on the OpenAI TTS path carries a Deprecated badge with no published successor                  |
| AI-07 | MEDI | M   | Local-provider identity is hardcoded to 'ollama', misclassifying LM Studio, llama.cpp and vLLM                       |
| AI-10 | MEDI | XL  | The ExecutionPlan/CPST router contract is fully specified with zero implementation                                   |
| AI-15 | MEDI | S   | Anthropic pause_turn stop reason is mismapped to end_turn, telling callers a suspended turn completed cleanly        |
| AI-16 | MEDI | M   | Gemini thought-signature continuity across tool loops is mitigated but unresolved                                    |
| AI-21 | MEDI | M   | Runtime profiles resolve zero candidates for desktop local-chat and zero selectable models for desktop cloud-chat    |
| AI-22 | MEDI | M   | Media-generation model and aspect-ratio options are advertised beyond what the providers actually deliver            |

**Batch W8.3 — `ai-routing`** · 14 items · 92 pts

| Item  | Sev  | Eff | Task                                                                                                                                          |
| ----- | ---- | --- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-27 | MEDI | XL  | Connected files are not a synchronized knowledge source — no revision, permissions, cursor or tombstone state                                 |
| AI-28 | MEDI | L   | Condition-triggered and cloud-triggered automation lacks an authenticated durable trigger path                                                |
| AI-30 | MEDI | XL  | AGI Work has no durable pause/resume, no clarification round-trip, and a single-threaded cloud loop                                           |
| AI-31 | MEDI | M   | Managed-cloud SSE carries reasoning only as token counts, so the reasoning chip can never render                                              |
| AI-32 | MEDI | M   | Several catalog models remain unpriced or unverified against live provider APIs                                                               |
| AI-35 | MEDI | M   | Model retirement/migration logic is reimplemented per-surface instead of centralized in the shared model registry                             |
| AI-41 | MEDI | XL  | No vector storage or semantic retrieval anywhere; the fully-built, fully-billed embeddings endpoint has zero internal callers                 |
| AI-47 | MEDI | S   | Provider-outage / credit-downgrade fallback reason is computed but never reaches the streaming client                                         |
| AI-48 | MEDI | S   | Ultra/Pro reasoning-mode and reasoningDots catalog fields have zero product consumers (schema built ahead of product)                         |
| AI-49 | MEDI | S   | Opening a conversation whose persisted model has been retired silently substitutes the default with no notice                                 |
| AI-50 | MEDI | M   | No cross-provider memory import on Web or Desktop despite mobile already shipping a working on-device parser                                  |
| AI-51 | MEDI | M   | Web Memory settings lack search, pin and summary controls, and the pinned DB column is invisible to the CRUD API                              |
| AI-52 | MEDI | M   | Memory is only ever a flat/provenance-grouped fact list, never synthesized narrative, and its retrieval is never named in the reasoning trace |
| AI-54 | MEDI | M   | No approval/autonomy-mode picker on web, and the existing 4-tier picker is not reused by Cowork or scheduled tasks                            |

**Batch W8.4 — `ai-routing`** · 7 items · 40 pts

| Item  | Sev  | Eff | Task                                                                                                                                                   |
| ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AI-56 | MEDI | L   | Completed research reports are a dead end: no table of contents, no notify-on-done, no derivative formats, no suite export, no source scoping, no foll |
| AI-18 | LOW  | S   | allowToolUse and allowMCP documentation contradicts the tier values they document                                                                      |
| AI-23 | LOW  | S   | The web-search honesty guard does not cover native-provider models                                                                                     |
| AI-33 | LOW  | XL  | Inbound messaging-platform bot presence is undecided and outside current phases                                                                        |
| AI-45 | LOW  | S   | Provider request-shaping (OpenAI wire-compat, reasoning-effort normalization) is web-only with unverified parity on mobile and extension               |
| AI-53 | LOW  | L   | No personalization layer beyond chat memory: no forward-looking brief, no connector-fed personalization, no disclosure of whether memory personalizes  |
| AI-55 | LOW  | S   | Internal task-complexity classification is computed for routing but never narrated to the user                                                         |

**Batch W8.5 — `integrations`** · 14 items · 85 pts

| Item    | Sev  | Eff | Task                                                                                                                               |
| ------- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------- |
| CONN-01 | HIGH | XL  | The connector catalog is nonfunctional by default: branded connectors 501 and the OAuth registry ships with zero providers         |
| CONN-03 | HIGH | S   | The MCP client-metadata document 404s in production, blocking first authorization for eight CIMD connectors                        |
| CONN-07 | HIGH | L   | Custom MCP connectors are invisible on Desktop, and desktop Local mode runs an entirely separate connector system                  |
| CONN-09 | HIGH | M   | MCP OAuth discovery reportedly implements only pre-registration; contradicted by later CIMD and DCR evidence                       |
| CONN-17 | HIGH | M   | No surface offers automatic (progressive-disclosure) skill invocation — a working desktop matcher has zero callers                 |
| CONN-02 | MEDI | S   | GitHub connector requires a registered GitHub App (7 env vars) and silently disappears when any one is missing                     |
| CONN-04 | MEDI | M   | Six MCP vendors refuse dynamic client registration, keeping those connectors unlisted                                              |
| CONN-05 | MEDI | S   | An authorization-server change is undetectable because connector grants are not keyed by issuer (SEP-2352)                         |
| CONN-08 | MEDI | M   | CONNECTOR_OAUTH_START_PATH and its callback builder have multiple independent live definitions                                     |
| CONN-10 | MEDI | M   | Pivot to MCP protocol revision 2026-07-28 is blocked on the official SDK                                                           |
| CONN-11 | MEDI | XL  | MCP directory content is placeholder rather than a signed curated registry, and no install/publish lifecycle exists                |
| CONN-13 | MEDI | L   | Connector explicit invocation and discovery are absent from the composer on every surface                                          |
| CONN-22 | MEDI | L   | No skill-authoring path on web/BYOK/managed cloud: no AI-assisted authoring, no file upload, no GitHub import                      |
| CONN-23 | MEDI | M   | No connector-search toggle and no per-capability auto-invoke controls — connectors are always auto-searched with no way to disable |

**Batch W8.6 — `integrations`** · 6 items · 33 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CONN-29 | MEDI | S   | Confirm-before-destructive-action dialog copy-pasted three times while the live connector disconnect remains unconfirmed                               |
| CONN-21 | LOW  | M   | No product-catalog design/UI skill wired into artifact generation, so named-skill narration can never occur                                            |
| CONN-24 | LOW  | XL  | No self-serve non-MCP 'Custom API' connector authoring path                                                                                            |
| CONN-25 | LOW  | M   | No plugin provenance reaches the skill autocomplete, so no attribution or skill-load narration is possible                                             |
| CONN-26 | LOW  | M   | Connector and plugin catalog browsing gaps: no data-source category, no example prompts, no provider-bundle toggle, no ratings primitive, no storefron |
| CONN-27 | LOW  | M   | No context-load control (lazy vs always-loaded) for installed tools; the only such setting was dead and was deleted                                    |

**Batch W8.7 — `desktop`** · 9 items · 57 pts

| Item    | Sev  | Eff | Task                                                                                                                                  |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DESK-15 | HIGH | XL  | Desktop and CLI each hand-roll a separate agent, MCP and LLM harness with no shared crate                                             |
| DESK-16 | HIGH | L   | Desktop provider endpoints and image model IDs are hardcoded outside the registry; image generation calls three nonexistent model IDs |
| DESK-14 | MEDI | M   | Desktop TTS model IDs are hardcoded because no voice-synthesis routing slot exists in the catalog                                     |
| DESK-17 | MEDI | M   | Groq transcription endpoint and speech-provider config duplicated across the Desktop and CLI Rust binaries                            |
| DESK-20 | MEDI | L   | Desktop workspace semantic-embeddings indexer is implemented but unwired and not authorized to send Local content remotely            |
| DESK-21 | MEDI | L   | Desktop project RAG engine is unreachable and permanently non-semantic even if reached                                                |
| DESK-30 | MEDI | M   | Desktop/cloud-chat surface returns zero selectable models for every tier; desktop/local-chat profile has zero allowed harnesses       |
| DESK-31 | MEDI | M   | No installed Local model is certified for Desktop Local Tasks, so the feature stays disabled                                          |
| DESK-62 | MEDI | S   | Desktop OpenAI reasoning Responses dialect has no live-key smoke proof                                                                |

**Batch W8.8 — `infra/ci`** · 7 items · 51 pts

| Item     | Sev  | Eff | Task                                                                                               |
| -------- | ---- | --- | -------------------------------------------------------------------------------------------------- |
| INFRA-26 | HIGH | L   | Context, payloads and producer rates are not bounded, so nothing applies backpressure              |
| INFRA-28 | HIGH | XL  | Durable job execution has no retries, backoff, leases, dead-letter path or fair concurrency        |
| INFRA-29 | HIGH | L   | Mutations lack idempotency keys, expected-revision leases and out-of-order reconciliation          |
| INFRA-30 | HIGH | M   | Cancellation does not propagate from the client stop to downstream work                            |
| INFRA-31 | HIGH | L   | Four independent retry implementations and no protection against retry storms or refresh stampedes |
| INFRA-32 | MEDI | M   | Process-local job state remains on desktop and gateway surfaces                                    |
| INFRA-45 | MEDI | S   | A transient sandbox reconnect failure orphans a still-live paused sandbox                          |

**Batch W8.9 — `ui`** · 3 items · 36 pts

| Item  | Sev  | Eff | Task                                                                                                                                                   |
| ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-83 | HIGH | L   | Deep Research progress/plan UI and saved-report retrieval exist only on web; desktop parses the events and renders nothing, mobile and the extension h |
| UI-85 | HIGH | XL  | No surface offers genuinely full-duplex, interruptible spoken conversation — every voice implementation is turn-based dictation or absent              |
| UI-09 | MEDI | L   | Memory has no user-facing lifecycle controls: no disable, inspect, edit, delete, export, scope separation, or provenance                               |

**Batch W8.10 — `cli`** · 2 items · 23 pts

| Item   | Sev  | Eff | Task                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------ |
| CLI-04 | HIGH | M   | CLI provider fallback hardcodes the OpenAI chat-completions URL, bypassing trust mode and the registry |
| CLI-20 | MEDI | XL  | CLI has no durable detached-run/backgrounding contract, so subagent batches are foreground-only        |

**Batch W8.11 — `security`** · 2 items · 6 pts

| Item   | Sev  | Eff | Task                                                                                                                                                  |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-84 | MEDI | M   | Approval/autonomy-mode control does not reach the surfaces that most need it: no picker on Web chat, global-binary only on Desktop, none on Cowork or |
| SEC-78 | LOW  | M   | No configurable safety fallback (switch model vs pause) when a message is flagged                                                                     |

### W9 — Web application and shared UI surfaces

**178 open · 862 pts · 1C 29H 84M 64L**

_Why now._ The largest user-facing surface, batched as one pass because the items overwhelmingly touch the same trees — the composer, message list, artifact viewer, settings shell and the shared UI package.

_Done when._ A generated video plays in a browser from persisted storage (media-src present, no provider auth header needed) and can be stopped mid-generation from the UI; every advertised image aspect ratio produces a distinct output size or the label is removed. No reachable web control returns 501, toasts 'coming soon', or no-ops — verified by a repo scan plus a click-through of the enumerated stub list — and /integrations, /apps, /skills and /admin each have a coherent entry and exit. Developer API serve

**Batch W9.1 — `web`** · 14 items · 116 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WEB-02  | CRIT | M   | Generated videos cannot render on web — CSP has no media-src and the provider URI needs an auth header a browser cannot send                           |
| WEB-03  | HIGH | L   | Generated videos are never persisted — only an expiring provider URL is stored, so a paid generation is lost on tab close                              |
| WEB-04  | HIGH | S   | No way to stop a video generation — the fully implemented cancel route has zero client callers and Stop is suppressed in video mode                    |
| WEB-109 | HIGH | —   | One-chat flow does not support ordinary chat plus selected/reference files without forcing a separate experience                                       |
| WEB-11  | HIGH | XL  | Developer API is unusable as documented: structured outputs hard-rejected, retired /api/agents paths still referenced, no SDK/webhooks/Files API, no a |
| WEB-110 | HIGH | L   | Cloud Code's fully-built approval-gated agent-turn backend has no UI entry point; web only exposes a raw command shell                                 |
| WEB-118 | HIGH | M   | WebSidebar renders a second, incomplete and self-inconsistent nav rail on the live /chat/code route                                                    |
| WEB-12  | HIGH | L   | Reachable production web controls still return 501, toast 'coming soon', or silently no-op — roughly 20 stub markers remain                            |
| WEB-127 | HIGH | L   | Web-created artifacts never sync to the cloud (push path missing), the gallery falsely claims account-scoped storage, and Library renders artifact-cla |
| WEB-14  | HIGH | L   | Connector directory UI advertises providers that cannot connect, and its permission/scope surfaces are decorative                                      |
| WEB-15  | HIGH | XL  | Deep Research web: no plan approval, dead Report tab on Anthropic models, literal Markdown rendering, no server-side resume                            |
| WEB-31  | HIGH | XL  | Skills/Plugins directory is a preview catalogue with no install, permission-consent, publish or uninstall lifecycle                                    |
| WEB-34  | HIGH | —   | Web-created artifacts never push to the cloud — sync is pull-only, so artifacts live in one browser's localStorage                                     |
| WEB-35  | HIGH | —   | Artifacts gallery nav copy falsely claims 'account-scoped' storage for artifacts that are browser-local only                                           |

**Batch W9.2 — `web`** · 14 items · 44 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WEB-37  | HIGH | S   | Collapsed-sidebar 'Settings' gear does not open Settings — it routes to the dead-end /settings/voice sub-page                                          |
| WEB-38  | HIGH | —   | WebSidebar renders a second, incomplete 2-item nav rail on the live /chat/code route, and CloudCodePage bypasses WebAppShell                           |
| WEB-53  | HIGH | —   | Connector browse/connect/add/disconnect is implemented twice (ConnectorsPage vs settings-modal ConnectorsPanel) and has already drifted three ways     |
| WEB-06  | MEDI | S   | Image aspect-ratio labels lie: six advertised ratios collapse to three actual output sizes                                                             |
| WEB-07  | MEDI | M   | /integrations and /apps form a dead navigation loop                                                                                                    |
| WEB-08  | MEDI | S   | Public /skills page is sitemap-indexed and the CTA target of marketing pages but redirects anonymous visitors straight to /login with no explanation   |
| WEB-100 | MEDI | —   | Capabilities settings expose only three memory toggles — no Artifacts, code-execution, network-egress or tool-access-mode controls                     |
| WEB-101 | MEDI | —   | No accent colour or contrast control on web, though mobile and desktop both have one                                                                   |
| WEB-112 | MEDI | L   | Legacy apps/web/shared/ tree (~198 files, ~130 knip-flagged unused) carries a superseded 'AI employee marketplace' product framing                     |
| WEB-113 | MEDI | S   | A second, orphaned 'share a conversation' backend duplicates the live one, over its own table and public route                                         |
| WEB-114 | MEDI | M   | A materially complete conversation-export feature (Markdown/PDF/DOCX) is fully built and totally unreachable inside the dead v3 cascade                |
| WEB-116 | MEDI | L   | Dead second web chat-surface cascade (UnifiedChatPage/WebShellV3) still ships, injects memory with no temporary-chat guard, and carries a nav landmine |
| WEB-117 | MEDI | M   | Left-nav session and project CRUD handlers are hand-duplicated between WebChatPage and WebAppShell                                                     |
| WEB-120 | MEDI | M   | WorkSessionPanel and TaskDetailPanel independently map the same agent-activity events and render the same event differently                            |

**Batch W9.3 — `web`** · 14 items · 107 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WEB-122 | MEDI | M   | MessageMetadata TypeScript interface has three independently-diverged declarations in apps/web alone                                                   |
| WEB-123 | MEDI | S   | UserSettings.tsx is a dead 584-line full-page settings implementation whose delete handler mislabels data erasure as account deletion                  |
| WEB-125 | MEDI | S   | /skills/[name] is an orphaned, unreachable detail route with a category-label map that has diverged 4 of 5 buckets from the live one                   |
| WEB-129 | MEDI | L   | Schedules have no project/workspace association and no thread-automation concept                                                                       |
| WEB-130 | MEDI | M   | Project deletion soft-deletes, so knowledge files are permanently orphaned and the ON DELETE CASCADE never fires; there is no restore path             |
| WEB-131 | MEDI | L   | Web schedules surface parity gaps: no inline composer, no status filter, no running-state indicator, no auto-title, no close-vs-delete, recurring-by-d |
| WEB-16  | MEDI | L   | Projects: no templates, no export, no collaborators; Duplicate fires a toast but never refetches the list                                              |
| WEB-17  | MEDI | L   | Project knowledge silently truncates uploads at ~16,000 chars with no extraction state shown, stores summary as hard-coded null, and never OCRs images |
| WEB-18  | MEDI | L   | Schedules/Tasks UI: no starter templates, no timezone/DST preview, unmounted file-watch/cron/webhook surfaces, no exact-run deep links                 |
| WEB-19  | MEDI | XL  | AGI Work is a composer mode without a goal-intake or plan surface: clarification cards are hardcoded read-only, no pause/resume, no per-task cost, no  |
| WEB-23  | MEDI | L   | Web voice output is manual browser TTS only — no voice picker, no continuous turn-taking, no server TTS option                                         |
| WEB-24  | MEDI | L   | Office/document generation: no XLSX, no editing of existing Office files, and artifacts can download with the wrong Office MIME/extension              |
| WEB-25  | MEDI | XL  | File ingestion breadth is undecided: no Office/archive/audio/video/notebook handling, no OCR or table extraction, checksums computed but never compare |
| WEB-26  | MEDI | M   | 'Run code' toggle is lit for routed providers that have no execution tool, so it silently does nothing                                                 |

**Batch W9.4 — `web`** · 14 items · 69 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WEB-30 | MEDI | M   | Artifact publishing has no TTL, quota, view audit or per-viewer auth, and an ownership violation surfaces as a 500 instead of a 403                    |
| WEB-32 | MEDI | L   | Sharing has no scope choice, no expiry choice, and no revocation review — link expiry is hardcoded to 7 days                                           |
| WEB-39 | MEDI | —   | UnifiedChatPage/WebShellV3 dead chat-shell cascade (~30 files) still compiles, carries an unguarded memory injection and an artifacts→/gallery routing |
| WEB-42 | MEDI | —   | A materially complete conversation-export feature (Markdown/PDF/DOCX) is built, barrel-exported and totally unreachable                                |
| WEB-43 | MEDI | L   | Legacy apps/web/shared/ tree (~198 files, ~130 knip-unused) still ships an earlier 'AI employee marketplace' product framing                           |
| WEB-44 | MEDI | —   | A second, fully-implemented 'share a conversation' backend and public route duplicates the live one with zero UI callers                               |
| WEB-45 | MEDI | —   | Projects hub search box and Create control vanish outside the default sort and in the Archived view                                                    |
| WEB-46 | MEDI | —   | Two drifted, non-overlapping project-creation quick-start UIs (PROJECT_TEMPLATES vs PROJECT_PRESETS)                                                   |
| WEB-50 | MEDI | —   | /settings/byok and /settings/sync have real content but zero in-app discovery path                                                                     |
| WEB-54 | MEDI | —   | /skills/[name] is an orphaned, unreachable detail page whose hand-copied category-label map disagrees with the live one in 4 of 5 buckets              |
| WEB-61 | MEDI | XL  | Visual design workspace (artboards, layers, properties, prototype/deck preview, versioning, export) approved but unbuilt; the CanvasWorkspace whiteboa |
| WEB-67 | MEDI | —   | Library renders tool-generated artifact files through the plain file card, never the rich Artifact viewer                                              |
| WEB-69 | MEDI | —   | Schedules page has no inline/natural-language composer and no conversational-vs-manual creation choice                                                 |
| WEB-73 | MEDI | —   | No non-destructive Close versus destructive Delete for a task run — /tasks offers no delete at all                                                     |

**Batch W9.5 — `web`** · 14 items · 36 pts

| Item    | Sev  | Eff | Task                                                                                                                  |
| ------- | ---- | --- | --------------------------------------------------------------------------------------------------------------------- |
| WEB-74  | MEDI | —   | No follow-up composer for steering a run from the /tasks detail panel                                                 |
| WEB-76  | MEDI | —   | Completed research report reader has no nested table of contents                                                      |
| WEB-77  | MEDI | —   | A reopened or standalone research report is a dead end — no follow-up composer for grounded Q&A                       |
| WEB-81  | MEDI | —   | WorkSessionPanel has a static 'AGI Work session' header for every task and no options menu                            |
| WEB-82  | MEDI | —   | A conversation with a running task shows no status in the chat-history sidebar row                                    |
| WEB-84  | MEDI | —   | Delete-conversation dialog names no dependent objects (schedules, published artifacts, generated media)               |
| WEB-86  | MEDI | —   | Suggested-prompt chips were deliberately deleted from the empty-state composer, against 4-of-4 competitor convergence |
| WEB-89  | MEDI | S   | No per-message timestamp anywhere in web's response action row, though the weaker Chrome extension renders one        |
| WEB-05  | LOW  | S   | Video model picker lists a preview-only model as selectable, which 400s immediately on submit                         |
| WEB-09  | LOW  | S   | /admin console has no inbound navigation link anywhere in the app shell                                               |
| WEB-103 | LOW  | —   | No in-settings ad-personalization opt-out, and no confirmation that a program exists to gate                          |
| WEB-104 | LOW  | —   | No unified named settings destination covering cloud and local compute access                                         |
| WEB-105 | LOW  | —   | Developer console inside settings covers API keys but has no user-facing webhook management                           |
| WEB-106 | LOW  | —   | No centralized Deployments/Domains surface; the published-artifacts list has no custom-domain mapping                 |

**Batch W9.6 — `web`** · 14 items · 33 pts

| Item    | Sev | Eff | Task                                                                                                          |
| ------- | --- | --- | ------------------------------------------------------------------------------------------------------------- |
| WEB-108 | LOW | —   | In-conversation search has no per-match highlighting inside the message bubble                                |
| WEB-115 | LOW | S   | /dev/inline-toolcall-demo tracked source permanently embeds a stray local filesystem path                     |
| WEB-119 | LOW | S   | Two independent dynamic() wrappers around WebChatPage show different cold-load skeletons                      |
| WEB-121 | LOW | L   | Tasks and Schedules are presented as two unrelated nav lists over four disconnected backend types             |
| WEB-126 | LOW | S   | /apps page doc comment falsely claims a public marketing fallback that does not exist                         |
| WEB-128 | LOW | S   | qa-artifacts dev harness carries a stale 'Delete after QA' comment and was never removed                      |
| WEB-13  | LOW | M   | /connectors hangs the local dev server; root cause never found                                                |
| WEB-132 | LOW | M   | No 'promote this conversation or task to a recurring schedule' action anywhere                                |
| WEB-20  | LOW | S   | Popular searches stay empty in production — migration 0045 applied to dev only                                |
| WEB-21  | LOW | M   | Reflect produces no persisted or shareable recap artifact and no cross-device active-time aggregation         |
| WEB-22  | LOW | M   | Time-and-focus break counter is browser-local and the account namespace is not consumed by other surfaces     |
| WEB-27  | LOW | M   | Specialized verticals (health/legal/education/cyber/shopping/travel/maps/finance) are undecided or decorative |
| WEB-28  | LOW | S   | Two dead web modules (~1,500 lines) still ship, carrying their own duplicate upload-cap logic                 |
| WEB-29  | LOW | S   | Map card cannot draw a real route line or place photos, and has no dark-theme tiles                           |

**Batch W9.7 — `web`** · 14 items · 26 pts

| Item   | Sev | Eff | Task                                                                                                     |
| ------ | --- | --- | -------------------------------------------------------------------------------------------------------- |
| WEB-47 | LOW | S   | /skills, /connectors, /apps, /device-auth and /user render the app-wide default <title>                  |
| WEB-48 | LOW | S   | Marketing-nav mobile breakpoint hides the primary sign-in/CTA behind the hamburger                       |
| WEB-55 | LOW | S   | /apps page doc comment falsely claims a public marketing fallback for signed-out visitors                |
| WEB-57 | LOW | S   | /ai-skills redirects with a ?tab=agents query param that /skills never reads                             |
| WEB-58 | LOW | S   | qa-artifacts dev harness is still present with a stale 'Delete after QA' comment                         |
| WEB-64 | LOW | S   | No keyboard shortcut to toggle the Artifacts panel, and no row for it in the shortcuts dialog            |
| WEB-65 | LOW | —   | No embed-code or domain-allowlist option for published artifacts                                         |
| WEB-66 | LOW | S   | 'Live artifacts' nav item routes to the ordinary static Gallery — the labelled capability does not exist |
| WEB-70 | LOW | —   | Schedule list rows structurally cannot show that a run is in progress                                    |
| WEB-71 | LOW | —   | No status filter on the web schedules list, though the control is fully built twice elsewhere            |
| WEB-72 | LOW | —   | No auto-generated semantic title on either scheduling surface                                            |
| WEB-75 | LOW | S   | Create-schedule form opens pre-configured as a standing weekday-9am recurring task                       |
| WEB-78 | LOW | —   | No one-click transform of a completed research report into derivative formats                            |
| WEB-79 | LOW | —   | Active research run has no titled narration panel and no opt-in 'notify me when done'                    |

**Batch W9.8 — `web`** · 9 items · 21 pts

| Item   | Sev | Eff | Task                                                                                                               |
| ------ | --- | --- | ------------------------------------------------------------------------------------------------------------------ |
| WEB-80 | LOW | —   | No mid-flight steering of an active research run — the only interrupt is a full cancel                             |
| WEB-85 | LOW | S   | AUTO_TITLE_PLACEHOLDERS effect in WebChatPage races the new LLM title generator and re-truncates the title         |
| WEB-88 | LOW | S   | Per-response branch/fork is buried in a hover-only overflow menu with no reassurance copy                          |
| WEB-91 | LOW | —   | Composer '+' menu 'Connectors' entry navigates away to the settings modal rather than offering an in-composer flow |
| WEB-92 | LOW | —   | Composer has no discrete, named Canvas/artifact-creation entry                                                     |
| WEB-93 | LOW | —   | Artifacts gallery has no search, no filter-by and no shared-with-you tab                                           |
| WEB-94 | LOW | —   | No dedicated top-level Images/Videos generation surface (nav entry, composer, template gallery)                    |
| WEB-95 | LOW | —   | Image-generation entry points never disclose the underlying model name in first-party copy                         |
| WEB-98 | LOW | S   | StepsCard checklist persistence key collides for two byte-identical checklists in one conversation                 |

**Batch W9.9 — `ui`** · 14 items · 188 pts

| Item  | Sev  | Eff | Task                                                                                                                                                   |
| ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-03 | HIGH | M   | Model badge lies after server-side substitution, pin-to-model is unwired, and two ReasoningAccordion implementations coexist                           |
| UI-07 | HIGH | XL  | Web artifacts are read-only while the product calls them editable; version always reports 1 and there is no select-and-edit, restore, or comment path  |
| UI-11 | HIGH | XL  | Settings information architecture is incomplete: unmounted accessibility control, settings with readers but no writers, missing sections, and no Help  |
| UI-14 | HIGH | XL  | Accessibility coverage is five web routes and nothing else — no keyboard, screen-reader, focus, reduced-motion, high-contrast or zoom testing on any s |
| UI-26 | HIGH | —   | Large text pastes flood the composer instead of converting to a 'Pasted text' attachment (mobile already ships the fix)                                |
| UI-27 | HIGH | —   | The shared composer desktop renders has no image/video generation mode at all                                                                          |
| UI-28 | HIGH | XL  | Web's primary chat surface bypasses the shared chat UI package, running a 2.4–2.5x larger fork                                                         |
| UI-77 | HIGH | XL  | Headless transcript, event and approval state has never been extracted from the DOM renderers                                                          |
| UI-81 | HIGH | XL  | Four independently-authored composer implementations across web, shared unified-chat, mobile and the Chrome extension with no shared behaviour contrac |
| UI-82 | HIGH | XL  | Three independent, non-shared markdown rendering engines across web+desktop, mobile and the Chrome extension                                           |
| UI-94 | HIGH | XL  | Web's primary chat surface bypasses the shared unified-chat package, running a 2.4–2.5x larger fork with no structural mechanism to keep the two in sy |
| UI-01 | MEDI | M   | Three rich-format card parsers (Comparison/Steps/Calculation) are unaudited for the content-dropping bug proven in RecipeCard                          |
| UI-02 | MEDI | L   | Chat message surface gaps: no camera capture, no per-message report, no image carousel, no accessible interactive tables                               |
| UI-04 | MEDI | L   | Web search has no persistent on-screen indicator, no mode control, unimplemented filters, and no vertical result cards                                 |

**Batch W9.10 — `ui`** · 14 items · 104 pts

| Item  | Sev  | Eff | Task                                                                                                                                                   |
| ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-08 | MEDI | XL  | Live artifacts (refresh policy, connector binding, refresh worker) are approved but unbuilt                                                            |
| UI-10 | MEDI | L   | Personalization is fragmented across three incompatible vocabularies, the shared composer style is never persisted, and web lacks the tone controls mo |
| UI-12 | MEDI | L   | Keyboard shortcuts are read-only on web and defined by three disconnected default sets across surfaces                                                 |
| UI-13 | MEDI | L   | Notifications: preferences are grouped by channel instead of event, only one channel has a real sender, and stored push tokens are wired to nothing    |
| UI-15 | MEDI | L   | Loading, progress, error, retry and cancel states have never been swept across touched screens, and neither has dark/light consistency                 |
| UI-16 | MEDI | S   | Remaining composer popovers are not portalled and will clip at small viewports                                                                         |
| UI-17 | MEDI | M   | Shared mention menu is unmounted — file and skill pickers exist but are not wired to the composer                                                      |
| UI-18 | MEDI | L   | An expired session mid-turn loses the work: no preserved pending turn, no single-use resume after sign-in                                              |
| UI-21 | MEDI | XL  | Shared UI packages may still be unwired for i18n, re-injecting English into every consuming surface                                                    |
| UI-22 | MEDI | L   | Unmounted and duplicate production UI components are not inventoried or resolved                                                                       |
| UI-32 | MEDI | —   | No path to reuse an existing Library file in a new conversation on web or desktop — no Library attach action and no 'Add from Library' composer entry  |
| UI-47 | MEDI | —   | Accessibility component directory is entirely dead — no skip link in layout.tsx, and a mocked audit panel that always reports 'all checks passed'      |
| UI-51 | MEDI | —   | Web's follow-up message queue holds only one slot and cannot be edited in place                                                                        |
| UI-56 | MEDI | —   | No inline file-diff (red/green line) view in the chat transcript for file-edit tool results                                                            |

**Batch W9.11 — `ui`** · 14 items · 38 pts

| Item  | Sev  | Eff | Task                                                                                                                                                   |
| ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-57 | MEDI | —   | Citations render as a flat trailing chip row with only a native tooltip, and the Chrome extension has no citation UI at all                            |
| UI-58 | MEDI | —   | Two parallel, architecturally inconsistent mechanisms decide whether to render a rich message card                                                     |
| UI-71 | MEDI | —   | Two same-named artifactStore Zustand stores and two ArtifactPanel implementations, with no documented split                                            |
| UI-74 | MEDI | —   | Confirm-before-destructive-action dialog copy-pasted three times while the settings modal's connector disconnect still has no confirm step             |
| UI-79 | MEDI | —   | No context-window usage visibility in the web chat composer                                                                                            |
| UI-86 | MEDI | M   | Only Web has a Personal/Team workspace switcher; Desktop and Mobile have none                                                                          |
| UI-87 | MEDI | M   | Shared unified-chat settings store carries six remaining dead field/setter pairs after toolAccessMode was deleted                                      |
| UI-89 | MEDI | M   | No inline file-diff view for file-edit tool results in the chat transcript, though desktop already ships two diff viewers elsewhere                    |
| UI-91 | MEDI | M   | Web and Desktop Capabilities settings lack Artifacts, code-execution, network-egress and tool-access-mode controls, with desktop's tab self-documentin |
| UI-92 | MEDI | M   | Library has no 'reuse this file in a new conversation' action on web or desktop, though mobile already ships it                                        |
| UI-96 | MEDI | S   | Shared unified-chat settings store ships dead field/setter pairs with zero readers and zero writers                                                    |
| UI-05 | LOW  | M   | No typed weather or other vertical result card exists — only a generic tool timeline                                                                   |
| UI-06 | LOW  | S   | Tool-progress presentation is thin: one collapsed line instead of a step list, a double leading icon in the legacy fallback, and a generic 'M' badge f |
| UI-19 | LOW  | M   | Conversation branching is not uniform across surfaces                                                                                                  |

**Batch W9.12 — `ui`** · 14 items · 33 pts

| Item    | Sev | Eff | Task                                                                                                                     |
| ------- | --- | --- | ------------------------------------------------------------------------------------------------------------------------ |
| UI-20   | LOW | S   | Design-token adherence for z-index and other shared scales is unverified and unguarded                                   |
| UI-23   | LOW | L   | Learning mode (Socratic questions, understanding checks, uploaded materials) is undecided and its surface is unreachable |
| UI-24   | LOW | M   | Pagination page sizes and debounce intervals are independently redeclared across surfaces                                |
| UI-54   | LOW | —   | Web lacks the shared package's configurable send shortcut (Enter vs Cmd/Ctrl+Enter)                                      |
| UI-59   | LOW | —   | No native or interactive chart component — generated charts only ever reach the user as a static PNG                     |
| UI-67   | LOW | S   | The lighter WebAppShell omits the free-plan upgrade nudge WebChatPage shows                                              |
| UI-72   | LOW | S   | ArtifactsSidebar.tsx in the shared package is fully dead with zero non-test importers                                    |
| UI-73   | LOW | —   | ArtifactPanel self-admits its HTML rendering duplicates ArtifactRenderer.HtmlArtifact, kept in sync only by a comment    |
| UI-97   | LOW | S   | packages/ui/unified-chat carries a fully dead exported component and a self-admitted duplicate HTML-rendering path       |
| WEB-107 | LOW | —   | Settings search indexes only section-level keywords, not per-control body copy                                           |
| WEB-68  | LOW | S   | Library media grid does not visually distinguish video thumbnails from image thumbnails                                  |
| WEB-90  | LOW | —   | No user-triggered Run affordance on a plain code block in chat                                                           |
| WEB-96  | LOW | S   | Interactive checklist card description is line-clamped mid-word                                                          |
| WEB-97  | LOW | S   | Upgrade dialog close button overlaps and clips the Monthly/Annual toggle                                                 |

**Batch W9.13 — `ui`** · 1 items · 1 pts

| Item   | Sev | Eff | Task                                                                                       |
| ------ | --- | --- | ------------------------------------------------------------------------------------------ |
| WEB-99 | LOW | S   | Other panel-hosted components may still use viewport breakpoints inside fixed-width panels |

**Batch W9.14 — `design-system`** · 6 items · 10 pts

| Item  | Sev  | Eff | Task                                                                                                                                |
| ----- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------- |
| UI-41 | MEDI | —   | Design-token package exists but its two heaviest adopters bypass it with hundreds of hardcoded hex colours                          |
| UI-42 | MEDI | S   | apps/web's no-hardcoded-colour guard is not wired into CI and currently fails with 4 real violations                                |
| UI-44 | MEDI | S   | Chat response-format cards inject un-tokenized rainbow gradients per card type with no contrast pass                                |
| UI-45 | MEDI | S   | Chat top bar uses an off-palette purple/blue gradient CTA and raw Tailwind greys instead of tokens                                  |
| UI-46 | MEDI | —   | Shared EmptyState primitive is barely adopted, and local duplicates re-introduce the exact contrast bug it documents as fixed       |
| UI-50 | LOW  | S   | Shared Spinner primitive is unused on web; loading indicators fragmented across 60+ raw Loader2 usages plus a hand-rolled duplicate |

**Batch W9.15 — `ai-routing`** · 2 items · 23 pts

| Item  | Sev  | Eff | Task                                                                                                  |
| ----- | ---- | --- | ----------------------------------------------------------------------------------------------------- |
| AI-57 | HIGH | XL  | No global search across chats, projects, artifacts, files, connectors, settings or developer sessions |
| AI-46 | MEDI | M   | No context-window usage visibility in the web chat composer; older turns are silently trimmed         |

**Batch W9.16 — `docs`** · 2 items · 2 pts

| Item    | Sev  | Eff | Task                                                                                            |
| ------- | ---- | --- | ----------------------------------------------------------------------------------------------- |
| DOCS-23 | MEDI | S   | AGI Work and the scheduling/task surfaces carry no maturity or beta disclosure anywhere `HUMAN` |
| DOCS-25 | LOW  | S   | /features/plugins and /plugins tell contradictory 'is this real yet' stories with no cross-link |

**Batch W9.17 — `security/auth`** · 1 items · 8 pts

| Item   | Sev  | Eff | Task                                                                                               |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------- |
| SEC-80 | MEDI | L   | Multi-factor authentication is TOTP-only — no passkey/WebAuthn, no SMS MFA, no trusted-device list |

**Batch W9.18 — `security`** · 1 items · 1 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-81 | HIGH | S   | Password-manager autofill hardening (CONNECTOR-FORM-PASSWORD-AUTOFILL-01) was never propagated to ConnectorsPage's MCP auth-token field, which would l |

**Batch W9.19 — `security/sandboxing`** · 1 items · 1 pts

| Item   | Sev | Eff | Task                                                            |
| ------ | --- | --- | --------------------------------------------------------------- |
| SEC-83 | LOW | S   | Opening an HTML artifact logs a CSP violation from about:srcdoc |

**Batch W9.20 — `infra/ci`** · 1 items · 1 pts

| Item     | Sev  | Eff | Task                                                                                       |
| -------- | ---- | --- | ------------------------------------------------------------------------------------------ |
| INFRA-57 | MEDI | S   | Unverified whether a schedule bound to a soft-deleted conversation keeps firing or orphans |

### W10 — Desktop application

**97 open · 421 pts · 6C 19H 51M 21L**

_Why now._ Desktop is the surface with the deepest structural debt and must be a single dedicated pass: roughly 35% of the app (20 feature directories, ~94k LOC) is unreachable from the shell, automation triggers can never fire because TriggerRegistry::start() has no caller, approval requests are emitted but not renderable, notification center is unmounted, voice output never runs, and settings expose controls wired to dormant subsystems.

_Done when._ A reachability inventory lists every desktop feature directory as wired, deleted, or explicitly deferred with an owner and date; the ~94k unreachable LOC count drops to the inventoried decision set and a guard prevents new orphans. A scheduled trigger fires end to end from a restarted app (registry started from a real caller, triggers persisted); an approval request renders, can be decided, and the turn resumes; a second app instance is refused by an OS-level single-instance guard. Cloud Mode is

**Batch W10.1 — `desktop`** · 14 items · 100 pts

| Item     | Sev  | Eff | Task                                                                                                                                                           |
| -------- | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DESK-02  | CRIT | L   | Desktop Cloud Mode is gated behind a 'coming soon' toast contrary to the founder spec; DCL-4 unverifiable `HUMAN`                                              |
| DESK-04  | CRIT | L   | Desktop automation triggers can never fire: TriggerRegistry::start() has no non-test caller, and triggers are memory-only                                      |
| DESK-05  | CRIT | XL  | 20 desktop feature directories (~94,513 LOC, 537 modules, 35% of the app) are unreachable from the shell                                                       |
| DESK-105 | CRIT | L   | Desktop background agents are fully built in Rust but unreachable: 11 Tauri commands and 7 of 9 events have zero production callers and there is no pu         |
| DESK-66  | CRIT | L   | Desktop background-agent subsystem (BackgroundAgentManager, 11 Tauri commands, 9 events) is fully built but unreachable from any UI                            |
| DESK-70  | CRIT | L   | Desktop image and video generation is unreachable from the live chat composer, and the Rust media commands never absolutize the returned relative URLs `HUMAN` |
| DESK-06  | HIGH | L   | Desktop approval requests are emitted but not renderable or resumable; two competing approval UIs, one dead                                                    |
| DESK-07  | HIGH | M   | Desktop built-in browser cannot launch on stock macOS or Linux; computer-use hard-blocked on all Linux                                                         |
| DESK-09  | HIGH | S   | No OS-level single-instance guard: two desktop processes can corrupt the same encrypted DB                                                                     |
| DESK-10  | HIGH | L   | Desktop has zero settings-sync wiring in any app mode                                                                                                          |
| DESK-106 | HIGH | S   | Desktop 'teams' feature slice is fully orphaned, and the known-flaws.md entry claiming otherwise is stale and actively misleading                              |
| DESK-11  | HIGH | L   | Desktop in-app Notification Center is unmounted; group toggles and DND schedule are inert; only 2 of 4 groups can fire                                         |
| DESK-12  | HIGH | M   | Global Push-to-Talk (Fn key) has no event subscriber; wake-word detection discards its event channel                                                           |
| DESK-13  | HIGH | L   | Desktop voice output is unmounted: the conversational loop never runs, so barge-in and persona settings affect nothing                                         |

**Batch W10.2 — `desktop`** · 14 items · 97 pts

| Item     | Sev  | Eff | Task                                                                                                                                                          |
| -------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DESK-33  | HIGH | L   | Desktop artifacts: token streaming unwired, cloud publish a permanent 'coming soon', published version always 1                                               |
| DESK-40  | HIGH | L   | Desktop attachment docx/xlsx/pptx parsing unimplemented, and the knowledge-base picker offers PDFs it can never read                                          |
| DESK-68  | HIGH | S   | Desktop 'teams' feature slice is fully orphaned and the known-flaws.md entry that claims otherwise is stale                                                   |
| DESK-69  | HIGH | M   | Desktop Settings 'Connections' and 'Connectors' are a naming collision, and 'Connectors' stacks five unrelated subsystems in one scroll                       |
| DESK-71  | HIGH | M   | Desktop message action row is missing feedback, edit, share, read-aloud, branch and report — most already exist as dead code                                  |
| DESK-72  | HIGH | M   | Desktop shows no stdout/stderr console output for code-execution turns that only print text                                                                   |
| DESK-73  | HIGH | M   | Desktop Tauri composer has no reasoning-effort / extended-thinking control despite the runtime carrying the parameters end to end                             |
| DESK-96  | HIGH | L   | Desktop AGI Work views lack an onboarding checklist, customize hub and standalone task composer, and AGI Work subpanels plus AGI Code mounting/gating         |
| DESK-97  | HIGH | XL  | Desktop system-wide dictation capability remains unbuilt after the deceptive-availability UI was fixed                                                        |
| DESK-99  | HIGH | XL  | No remote developer-session control protocol exists end to end: desktop companion UI unmounted, CLI/VS Code host relay missing, mobile ships a static `HUMAN` |
| DESK-100 | MEDI | L   | Computer-to-computer pairing tab is not built — no authorized computer peer, target selection, persistent device identity or revocation lifecycle exis        |
| DESK-101 | MEDI | L   | Editing an existing Word document cannot preserve source content (docx_rs is write-only), so the editor is deliberately unregistered                          |
| DESK-103 | MEDI | S   | Desktop header falsely claims 'AGI Desktop · Released · v1.2.0'                                                                                               |
| DESK-104 | MEDI | M   | Desktop bypasses the shared design-token package with 252 hardcoded hex colour literals and no guard                                                          |

**Batch W10.3 — `desktop`** · 14 items · 68 pts

| Item     | Sev  | Eff | Task                                                                                                                                                  |
| -------- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| DESK-108 | MEDI | S   | Two independent CloudSyncClient structs exist in desktop Rust; the dead one targets a route that does not exist                                       |
| DESK-112 | MEDI | M   | Desktop settingsStore ships ~14 persisted setters with zero call sites: model routing, window/session, and agent checkpointing                        |
| DESK-119 | MEDI | L   | wiring-allowlist.json's ~65 self-tracked registeredWithoutReachableCaller commands still need individual WIRE/DELETE triage                           |
| DESK-120 | MEDI | S   | Desktop Local-mode scheduled-jobs list is rendered by two independent hand-coded renderers reading the same store                                     |
| DESK-123 | MEDI | L   | Project gallery duplicated: desktop independently rebuilt AgiWorkProjects instead of consuming the shared ProjectGallery                              |
| DESK-124 | MEDI | M   | Two ArtifactPanel implementations and two same-named artifactStore modules that do not share state                                                    |
| DESK-18  | MEDI | M   | Desktop timeout constants remain duplicated across layers; nested deadlines can outlive their parents                                                 |
| DESK-19  | MEDI | L   | Desktop keyboard shortcuts: three disconnected default sets and no reconciliation between renderer and native stores                                  |
| DESK-202 | MEDI | L   | Desktop chat has no message-statistics panel, no reachable message-edit affordance, and no AGI submission indicator `HUMAN`                           |
| DESK-34  | MEDI | M   | Desktop message Retry is a silent no-op and there is no one-click Regenerate, unlike web                                                              |
| DESK-35  | MEDI | L   | Desktop settings expose controls wired to dormant subsystems: checkpointing, auto-resume, prompt completion, zoom, Continue Generation, High Contrast |
| DESK-37  | MEDI | M   | Desktop AI-assisted git features and PR creation are backend-complete with zero callers, and PR creation fakes success                                |
| DESK-39  | MEDI | L   | Desktop DocumentWorkspace, PDFViewer, FilePreviewModal and spreadsheet viewing are built to the IPC boundary with no UI entry point                   |
| DESK-41  | MEDI | M   | Desktop Project Settings 'Memory' tab creates account-wide memories under a project heading with no scoping                                           |

**Batch W10.4 — `desktop`** · 14 items · 56 pts

| Item    | Sev  | Eff | Task                                                                                                                                                   |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DESK-42 | MEDI | M   | Desktop project archive and memory-category surfaces remain partly unwired; MemoryCategory is modeled three incompatible ways                          |
| DESK-43 | MEDI | S   | Desktop composer draft text is not cleared by 'New chat'                                                                                               |
| DESK-45 | MEDI | M   | Desktop Customize nav destination is translated in every locale but no such destination exists                                                         |
| DESK-50 | MEDI | L   | Desktop skill recorder: no macOS Screen Recording preflight, no per-step screenshots, no durable recording asset                                       |
| DESK-55 | MEDI | L   | Desktop plugin/extension manager has no enable-disable toggle, no configure/browse/drag-install, and no authoritative installed state                  |
| DESK-56 | MEDI | M   | Desktop billing surface has no invoice history, payment method, cancellation state, or credit top-up path                                              |
| DESK-58 | MEDI | L   | Desktop browser/agent settings have no per-site policy, cookie reset or single browser-runtime owner                                                   |
| DESK-60 | MEDI | M   | Desktop cloud-mode package reuse audit is incomplete and its prior negative findings were proven false                                                 |
| DESK-63 | MEDI | M   | Desktop settings IA converged on the locked spec but visual E2E is pending; OutcomeTracker is not called by normal task execution                      |
| DESK-67 | MEDI | L   | Desktop hooks\_\* subsystem (12 Tauri commands, Claude-Code-style hooks) is fully implemented with zero frontend callers                               |
| DESK-75 | MEDI | S   | Electron IPC bridge and deep-link SSO are dead in the shipped default (remote-renderer) configuration, so agiworkforce-cloud:// links are silently dro |
| DESK-76 | MEDI | S   | Local/Cloud mode toggle silently reverts instead of disabling itself when Local mode is unavailable in the Electron renderer                           |
| DESK-77 | MEDI | M   | Desktop Cloud skill 'download' produces a raw file save, not a working install — nothing writes it into the local skill directory                      |
| DESK-80 | MEDI | M   | Desktop model-routing setters (default provider, temperature, max tokens, task routing, favorites) have zero call sites                                |

**Batch W10.5 — `desktop`** · 14 items · 49 pts

| Item     | Sev  | Eff | Task                                                                                                                                                   |
| -------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DESK-81  | MEDI | M   | Desktop window/session setters (startup position, dock behavior, send shortcut, chat storage mode, feature flags) have zero call sites                 |
| DESK-82  | MEDI | M   | Desktop Cowork settings expose one control against a five-control benchmark, and neither Cowork nor scheduled-task creation has an approval-mode picke |
| DESK-83  | MEDI | S   | Superseded parallel MCP management UI (~2,000 lines) sits alongside the live MCPWorkspace in the same directory                                        |
| DESK-84  | MEDI | L   | Typed apps/desktop/src/api/\*.ts wrapper layer is largely bypassed by direct invoke() calls with string-literal command names                          |
| DESK-85  | MEDI | L   | ~1,777 lines of Discord/Signal/Telegram/WhatsApp messaging clients and a complete Gmail OAuth2 flow have zero frontend callers                         |
| DESK-86  | MEDI | M   | Two duplicated dead desktop backend subsystems: settings*v2*\_ (parallel settings store) and checkpoint\_\_ (duplicating coding*checkpoint*\*)         |
| DESK-87  | MEDI | M   | Electron global-shortcut customization and tray-menu refresh are fully built with zero callers, so shortcuts are permanently fixed at defaults         |
| DESK-89  | MEDI | S   | Desktop McpToolConfirmationPrompt has no keyboard handling despite advertising an 'Esc' hint                                                           |
| DESK-93  | MEDI | L   | Desktop rebuilt the project gallery from scratch (AgiWorkProjects.tsx) instead of consuming the shared ProjectGallery, with no documented rationale    |
| DESK-94  | MEDI | M   | Two artifactStore implementations and two ArtifactPanels coexist for desktop with an undocumented, runtime-unverified split                            |
| DESK-95  | MEDI | S   | Desktop SkillMarketplace.tsx vs the shared DirectoryBrowse skills tab — duplication flagged but never diffed                                           |
| DESK-98  | MEDI | M   | Desktop /git slash panel is archived and not actionable, pending an unmade product decision                                                            |
| DESK-102 | LOW  | M   | Shared slash-command reconciliation (Ticket 1D) left unfinished after the desktop execute-plan handler was cut                                         |
| DESK-110 | LOW  | S   | Orphaned legacy memory-browser component family on desktop — five dead files exported but never mounted                                                |

**Batch W10.6 — `desktop`** · 14 items · 28 pts

| Item     | Sev | Eff | Task                                                                                                                             |
| -------- | --- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| DESK-111 | LOW | S   | Dead local-llm Cargo feature (llama-cpp-2) in Desktop with zero call sites                                                       |
| DESK-121 | LOW | S   | Desktop legacy 'job-based' scheduler UI (SchedulerPanel, JobCreationDialog) is dead code with a self-declared legacy label       |
| DESK-122 | LOW | S   | Desktop ArtifactsGallery.tsx (580 lines) has zero live importers and still compiles into the shipped bundle                      |
| DESK-125 | LOW | M   | Shared slash-command reconciliation (Ticket 1D) was deferred during the execute-plan cut and never closed                        |
| DESK-126 | LOW | S   | checkpoint_store.rs and checkpoint_manager.rs were left orphaned after the AGI checkpoint command cut                            |
| DESK-36  | LOW | S   | Desktop background-task event listener writes continuously into a store whose only reader is unmounted                           |
| DESK-38  | LOW | M   | Desktop agent/automation templates ship 9 commands, a service and a store with zero consumers and fabricated metrics             |
| DESK-44  | LOW | S   | Desktop sidebar shows only the first 6 projects with no recency sort, so a 7th project can be invisible                          |
| DESK-46  | LOW | M   | Desktop maintenance mode is a QA checklist item with no implementation anywhere in the monorepo                                  |
| DESK-47  | LOW | M   | Desktop accessibility: icon-only buttons lack aria-labels, and no automated a11y coverage exists for the surface                 |
| DESK-48  | LOW | S   | Desktop reasoning-trace code blocks are unstyled because the shared renderer's CSS classes live only in the web stylesheet       |
| DESK-49  | LOW | M   | Desktop uses standard OS window decorations; an orphaned TitleBar.tsx exists but is never mounted                                |
| DESK-57  | LOW | M   | Desktop usage dashboard, profile and settings surface parity gaps                                                                |
| DESK-59  | LOW | M   | Desktop misc surface gaps: screen-capture settings, quick-query hotkey, list-panel triple states, licenses view, trace recording |

**Batch W10.7 — `desktop`** · 4 items · 6 pts

| Item    | Sev | Eff | Task                                                                                                                              |
| ------- | --- | --- | --------------------------------------------------------------------------------------------------------------------------------- |
| DESK-61 | LOW | M   | Desktop InlineArtifactEditor duplicates the existing Monaco/Canvas editor integration                                             |
| DESK-78 | LOW | S   | Orphaned legacy memory-browser component family on desktop — 5 dead files exported from a barrel but mounted nowhere              |
| DESK-91 | LOW | S   | Desktop legacy 'job-based' scheduler UI (SchedulerPanel, JobCreationDialog) is dead code self-labelled as backwards compatibility |
| DESK-92 | LOW | S   | Desktop ArtifactsGallery.tsx (580 lines) and ArtifactCategoryFilter are dead but still compile into the shipped bundle            |

**Batch W10.8 — `ui`** · 3 items · 7 pts

| Item  | Sev  | Eff | Task                                                                                                                                                   |
| ----- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-64 | MEDI | —   | Desktop Cowork settings expose one control against a five-control benchmark                                                                            |
| UI-70 | MEDI | —   | Project gallery is duplicated: web uses the shared ProjectGallery, desktop independently rebuilt AgiWorkProjects over an unrelated store with no docum |
| UI-76 | MEDI | S   | Desktop McpToolConfirmationPrompt advertises an 'Esc' hint it does not implement and has no Enter-to-approve                                           |

**Batch W10.9 — `security`** · 2 items · 4 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-94 | MEDI | M   | Desktop computer-use confirmation pause has no resume channel; real human-in-the-loop resume is unimplemented                                          |
| SEC-82 | LOW  | S   | voice_inject_text Tauri command stays registered and invokable with its documented safety precondition unmet, protected only by 'nothing currently cal |

**Batch W10.10 — `testing`** · 2 items · 2 pts

| Item    | Sev  | Eff | Task                                                                                                                            |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------- |
| TEST-15 | HIGH | S   | apps/desktop DesktopShellV3.test.tsx is 29/29 failing on a stale store mock, making every ledger row that cites it unverifiable |
| TEST-12 | MEDI | S   | apps/desktop DesktopShellV3.test.tsx is 29/29 failing on a stale store mock, invalidating GAP-064's completion evidence         |

**Batch W10.11 — `integrations`** · 2 items · 4 pts

| Item    | Sev  | Eff | Task                                                                                                       |
| ------- | ---- | --- | ---------------------------------------------------------------------------------------------------------- |
| CONN-18 | MEDI | M   | Desktop Cloud skill 'download' produces a raw file save, not a working install                             |
| CONN-30 | MEDI | S   | Desktop SkillMarketplace vs the shared DirectoryBrowse skills tab is an unverified third skill-browsing UI |

### W11 — Mobile, browser and editor extensions, and CLI surfaces

**82 open · 321 pts · 1C 14H 37M 30L**

_Why now._ The remaining client surfaces, batched together because each is a small independent codebase whose defects are internal to it and because they consume the contracts fixed in W7 and W8 — settings namespace, entitlement ladder, model registry, agent runtime — so doing them now avoids implementing against a moving target.

_Done when._ A custom instruction, nickname or occupation set on mobile appears on web without edits, proven on a device; mobile uses the shared managed-cloud client and the shared usage-summary schema rather than hand-rolled calls; adding sources to a cloud project works or the control is absent; dispatch acknowledges tasks and approvals with retry so none are silently dropped; streaming or status feedback appears within two seconds of send. Mobile drawer, composer, tasks, projects and settings expose every

**Batch W11.1 — `mobile`** · 14 items · 51 pts

| Item   | Sev  | Eff | Task                                                                                                                  |
| ------ | ---- | --- | --------------------------------------------------------------------------------------------------------------------- |
| MOB-41 | CRIT | S   | Every tap to open a completed generated video on mobile is a silent no-op in production                               |
| MOB-08 | HIGH | L   | Mobile shows no reasoning, status or streaming feedback for up to 60 seconds after send                               |
| MOB-09 | HIGH | M   | Mobile custom instructions, nickname and occupation never sync because mobile writes a different settings namespace   |
| MOB-10 | HIGH | M   | Mobile 'Add sources' to a project is a silent no-op for cloud projects; mobile has no cloud knowledge client at all   |
| MOB-12 | HIGH | L   | Mobile remote-control dispatch is fire-and-forget: tasks and approvals can be silently dropped                        |
| MOB-58 | HIGH | M   | Mobile sync flags and naming are not reconciled with actual Cloud sync behavior                                       |
| MOB-11 | MEDI | M   | Mobile hand-rolls its cloud chat calls instead of using the shared managed-cloud client                               |
| MOB-13 | MEDI | S   | Mobile Cloud auto-memory runs a client-side consolidation write before provider success, racing the server-owned fact |
| MOB-19 | MEDI | M   | Mobile media generation gaps: no reference images, unverified video aspect/quality, unverified file rendering         |
| MOB-20 | MEDI | M   | Mobile bottom sheets were dead until the library upgrade and their contents have never been audited                   |
| MOB-22 | MEDI | S   | Mobile Tasks screen has no timestamps and no way to dismiss a finished run                                            |
| MOB-28 | MEDI | L   | Mobile i18n covers only the two language-picker settings screens; Cloud sign-in and most surfaces are literal English |
| MOB-30 | MEDI | M   | Mobile chat-history, memory and data controls lack archive, delete-all, audio consent and web-search controls         |
| MOB-31 | MEDI | M   | Mobile settings information architecture: unreachable screens, missing identity rows, buried destinations             |

**Batch W11.2 — `mobile`** · 14 items · 75 pts

| Item   | Sev  | Eff | Task                                                                                                                                            |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| MOB-32 | MEDI | M   | Mobile drawer omits Code and Dispatch, caps recents at 8 with no overflow, and hides Work mode in the + sheet                                   |
| MOB-34 | MEDI | M   | Mobile composer and model controls: no empty-chat quick actions, effort slider instead of tiers, no dispatch/code model picker                  |
| MOB-43 | MEDI | M   | Mobile artifact viewer lacks version history and publish-to-link, both of which web has                                                         |
| MOB-44 | MEDI | M   | Mobile has no follow-up message queue; sending mid-response aborts the running turn instead of queuing                                          |
| MOB-45 | MEDI | S   | Mobile regex markdown parser silently drops nested-list structure and inline formatting inside table cells                                      |
| MOB-46 | MEDI | S   | Mobile's no-hardcoded-colour guard and its 640-entry baseline are not wired into CI despite explicit 'will fail CI' language                    |
| MOB-47 | MEDI | L   | Mobile has no automated accessibility testing and roughly half of its touch targets lack an accessibility label                                 |
| MOB-48 | MEDI | M   | Reduced-motion OS preference is respected in only 2 of 23 mobile animation-driving files                                                        |
| MOB-49 | MEDI | M   | Mobile edge-case UX library (9 copy-locked, tested modals) has zero import sites and no sensor ever triggers it                                 |
| MOB-52 | MEDI | L   | MS-20 trusted-contact flow is a dead announcement card with no real enrolment                                                                   |
| MOB-54 | MEDI | L   | MS-13 background / lock-screen voice decided but not built (needs UIBackgroundModes audio and a surviving session)                              |
| MOB-55 | MEDI | M   | MS-16 safety model fallback (retry path, then the toggle) decided but not built                                                                 |
| MOB-56 | MEDI | XL  | MS-4 live video / screen share in voice decided but not built; needs a streaming media contract with Local-Mode egress consent                  |
| MOB-57 | MEDI | L   | MS-2/MS-22 superseded: mobile may no longer treat Plugins and Skills as out of scope because Connectors exists, so real builds are now required |

**Batch W11.3 — `mobile`** · 11 items · 23 pts

| Item   | Sev  | Eff | Task                                                                                                                                         |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| MOB-59 | MEDI | M   | Mobile edge-case UX library ships 9 modals that are copy-locked, render-tested, and imported by nothing, with no sensor able to trigger them |
| MOB-24 | LOW  | S   | Mobile model chip may briefly show the wrong model immediately after selection                                                               |
| MOB-25 | LOW  | S   | Mobile legacy invite/waitlist UI is dead after public alpha and the waitlist store is misused as an entitlement mirror                       |
| MOB-26 | LOW  | M   | Mobile legacy voice screen diverges visually and lacks text fallback, mode preference and thinking label                                     |
| MOB-33 | LOW  | M   | Mobile pairing and dispatch onboarding: no stepped wizard, no troubleshooting checklist, no email-link path                                  |
| MOB-35 | LOW  | M   | Mobile projects, library and schedules lack search, filters, templates and identity affordances                                              |
| MOB-36 | LOW  | M   | Mobile settings gaps for approval policy, tool loading, cloud browser, connector discovery, voice and notifications                          |
| MOB-37 | LOW  | S   | Mobile has no in-app feature-announcement or education pattern for capability rollouts                                                       |
| MOB-50 | LOW  | S   | Pre-drawer sidebar implementation (7 files) is fully superseded and dead on Mobile                                                           |
| MOB-51 | LOW  | S   | Mobile widget-setup screen has no navigation entry point anywhere                                                                            |
| MOB-53 | LOW  | M   | MS-6 location capability (expo-location, coarse-location preference, excluded from Local Mode) decided but not built                         |

**Batch W11.4 — `extension`** · 14 items · 104 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| EXT-22 | HIGH | L   | Shared @agiworkforce/ui component library does not reach the Chrome or VS Code extensions (113/54/0/0 import split)                                    |
| EXT-23 | HIGH | M   | Chrome extension markdown renderer has no tables, no images, no math and no code syntax highlighting                                                   |
| EXT-24 | HIGH | M   | Chrome extension side panel exposes no response actions beyond a whole-message Copy button                                                             |
| EXT-33 | HIGH | L   | VS Code's static webview content is unmodularized and a second execution stack still needs removal or explicit isolation                               |
| EXT-40 | HIGH | L   | VS Code static webview content is unmodularized and a second execution stack remains unreconciled                                                      |
| EXT-01 | MEDI | XL  | Chrome side_panel.ts is a 10,933-line unbounded ownership hotspot and is still growing                                                                 |
| EXT-02 | MEDI | L   | Chrome extension residual defect bundle: dishonest toggle, dropped scheduled output that burns a paid turn, fake capture success, dead Console panel,  |
| EXT-10 | MEDI | L   | VS Code composer control parity: effort picker leaves the webview with no selected state, no thinking/model-switch in the actions menu, no plugins/ski |
| EXT-11 | MEDI | L   | VS Code session and history UX: history lives in a separate TreeView, no session browser, Rewind is permanently stubbed, no persistent Goal            |
| EXT-12 | MEDI | L   | VS Code account, usage and preference surfaces are thin: no credits balance, single aggregate usage bar, no memory controls, no language control, no s |
| EXT-25 | MEDI | L   | Chrome extension composer hand-mirrors the shared ChatInput via a comment instead of importing it, and has already drifted                             |
| EXT-27 | MEDI | L   | Chrome extension has no Skills, Plugins or Connectors management surface at all                                                                        |
| EXT-28 | MEDI | M   | Chrome extension has no manual web-search toggle and no Deep Research entry point                                                                      |
| EXT-30 | MEDI | M   | Chrome extension's AGI Work surface is a workflow UI, not real Cloud Work                                                                              |

**Batch W11.5 — `extension`** · 12 items · 34 pts

| Item   | Sev  | Eff | Task                                                                                                                             |
| ------ | ---- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| EXT-31 | MEDI | L   | VS Code developer-session checkpoint UI is not built and is contractually forbidden by the current command-parity contract       |
| EXT-34 | MEDI | S   | VS Code E2E: one spec fails with 'Language model unavailable' and may be a real regression                                       |
| EXT-03 | LOW  | S   | Chrome extension retains a vestigial cloud-unlock mechanism with no consumer                                                     |
| EXT-05 | LOW  | M   | Chrome composer and history UX gaps: no reasoning-effort control, history two clicks deep with no search, attach menu image-only |
| EXT-13 | LOW  | S   | VS Code CodeLens skips comments, so a TODO/FIXME cannot be turned into a task                                                    |
| EXT-14 | LOW  | M   | VS Code vscode.lm fallback setting was removed as dead and the underlying fallback remains unbuilt                               |
| EXT-15 | LOW  | M   | VS Code agent.maxIterations setting was removed; the cross-lane wiring into the CLI agent loop is still unbuilt                  |
| EXT-16 | LOW  | S   | VS Code re-declares a lenient subset of the shared usage-summary schema                                                          |
| EXT-19 | LOW  | M   | No web settings page manages the Chrome extension's enable state or site permissions                                             |
| EXT-29 | LOW  | S   | Chrome extension notification control is a single flat toggle with no per-category granularity                                   |
| EXT-32 | LOW  | L   | VS Code extension has no voice capability                                                                                        |
| EXT-39 | LOW  | S   | Chrome extension scheduled-task origin check fails open for legacy unstamped tasks                                               |

**Batch W11.6 — `cli`** · 10 items · 23 pts

| Item   | Sev  | Eff | Task                                                                                                        |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------- |
| CLI-01 | HIGH | M   | CLI lsp_diagnostics is a stub that always reports success with no diagnostics                               |
| CLI-21 | HIGH | M   | CLI MCP elicitation is implemented but never wired into the live TUI                                        |
| CLI-08 | MEDI | M   | 'agi marketplace search' silently returns an empty list because its registry is not deployed                |
| CLI-06 | LOW  | S   | apps/cli/src/subagent_v2.rs (862 lines) is declared but referenced by nothing outside itself                |
| CLI-07 | LOW  | S   | CLI '/task cancel' is rejected even though subagent.cancel() exists and a 'cancelled' state is advertised   |
| CLI-11 | LOW  | S   | Several CLI parity commands overstate their verb; /effort silently acknowledges without applying            |
| CLI-12 | LOW  | S   | CLI browser-control documentation overclaims capability                                                     |
| CLI-13 | LOW  | S   | CLI skills tool is built and tested but unavailable in production without a non-empty SKILLS_LAYERS catalog |
| CLI-16 | LOW  | L   | CLI exec_policy.rs rename to the shared execpolicy crate is unfinished restructure work                     |
| CLI-26 | LOW  | S   | CLI sandbox.rs uses a whole-file #![allow(dead_code, unused_imports)] instead of scoped allows              |

**Batch W11.7 — `security`** · 3 items · 5 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-79 | MEDI | M   | Trusted-contact crisis notification is explicitly declined on web, but mobile ships a dead announcement card and a founder-approved enrolment flow tha |
| SEC-74 | LOW  | S   | Chrome extension scheduled-task origin check fails open for legacy pre-origin-stamp tasks — the only fail-open branch in an otherwise fail-closed prov |
| SEC-86 | LOW  | S   | Chrome extension site allowlist has no default-permission policy — only a static approved-sites list with no stated behavior for sites not on it       |

**Batch W11.8 — `ui`** · 3 items · 5 pts

| Item  | Sev  | Eff | Task                                                                                                             |
| ----- | ---- | --- | ---------------------------------------------------------------------------------------------------------------- |
| UI-39 | HIGH | S   | Desktop pairing instructions name a mobile menu item ('Desktop Companion') that does not exist in the mobile app |
| UI-52 | MEDI | —   | Mobile has no follow-up queue while streaming — sending mid-response aborts the current turn instead of queuing  |
| UI-53 | LOW  | S   | Chrome extension send-button tooltip claims a Cmd+Enter shortcut that does not exist                             |

**Batch W11.9 — `security/auth`** · 1 items · 1 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-69 | HIGH | S   | VS Code Local/BYOK/Managed-Cloud trust-boundary regression suite is red (17 failing, 13 of them trust-boundary assertions) so nothing defends the boun |

### W12 — Observability, scale limits, published-claim accuracy, dead code and test integrity

**62 open · 282 pts · 1C 20H 33M 8L**

_Why now._ Last by design.

_Done when._ SLOs are published with captured p50/p95/p99 for the primary paths, tracing spans a full request across surfaces, and a load and a soak run are recorded with results; N+1 queries and per-call client construction are eliminated on the hot paths and large transfers stream; data-volume forecasts, retention tiers and partitioning exist for every unbounded table; an unreachable-code inventory is published and each entry is wired or deleted; an authoritative API contract artifact exists with tests com

**Batch W12.1 — `docs`** · 14 items · 48 pts

| Item    | Sev  | Eff | Task                                                                                                                          |
| ------- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------- |
| DOCS-06 | HIGH | M   | Unsupported quantified and traction claims remain published `HUMAN`                                                           |
| DOCS-07 | HIGH | M   | Enterprise capability claims are inaccurate in both directions at once                                                        |
| DOCS-09 | HIGH | M   | Twenty present-tense stub controls remain in production surfaces and no rule enforces against them                            |
| DOCS-11 | HIGH | M   | Audit ledgers are not kept current with code state, and the one-PR capability rule is a convention rather than a gate `HUMAN` |
| DOCS-12 | HIGH | L   | No single machine-readable capability registry exists, so every 'current' document disagrees                                  |
| DOCS-20 | HIGH | M   | Help, support and takedown process documentation describes processes that do not exist                                        |
| DOCS-02 | MEDI | M   | Dozens of documents cite paths that no longer resolve, and two guards cite deleted files to stay green                        |
| DOCS-03 | MEDI | L   | All eight expected spec artifacts are missing and their directory does not exist                                              |
| DOCS-05 | MEDI | M   | README and package metadata are not release-grade and contain several counted inaccuracies                                    |
| DOCS-08 | MEDI | M   | Capabilities that are permanently 'coming soon' or decorative are not downgraded in copy                                      |
| DOCS-10 | MEDI | S   | Fabricated metrics remain in production templates, demos and marketing paths                                                  |
| DOCS-14 | MEDI | S   | Marketing copy describes a manual web-search toggle that was deliberately deleted from the product                            |
| DOCS-15 | MEDI | M   | Surface-specific documentation overclaims what several clients can do                                                         |
| DOCS-16 | MEDI | M   | Product copy names labels, formats and behaviours the UI and services do not provide                                          |

**Batch W12.2 — `docs`** · 6 items · 25 pts

| Item    | Sev  | Eff | Task                                                                                                                                  |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DOCS-17 | MEDI | S   | SECURITY.md may misstate audit-log immutability status                                                                                |
| DOCS-18 | MEDI | S   | Retired tier names and a stale Team price persist in legal, policy and pricing copy                                                   |
| DOCS-19 | MEDI | XL  | Localization debt: sources disagree on whether the shared UI package is wired for i18n at all                                         |
| DOCS-24 | MEDI | S   | /agi-work marketing page describes a separate, unshipped Desktop dispatch product — a naming collision with the shipped composer mode |
| DOCS-26 | MEDI | S   | A doc-staleness sweep deleted four load-bearing files selected only by metadata                                                       |
| DOCS-22 | LOW  | S   | 'Chat is genuinely shared, not duplicated' is stated without its primary-vs-secondary qualifier in two headline documents             |

**Batch W12.3 — `testing`** · 13 items · 79 pts

| Item    | Sev  | Eff | Task                                                                                                                                      |
| ------- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TEST-01 | HIGH | M   | 75 skipped or ignored tests are uninventoried and unjustified, and the guard that counts them was itself broken                           |
| TEST-02 | HIGH | XL  | Per-surface E2E coverage is incomplete and was not executed at the last stop gate                                                         |
| TEST-03 | HIGH | M   | Tests that pass without testing anything: no assertions, hand-written mirrors, and redundant screenshots                                  |
| TEST-05 | HIGH | L   | No cross-language or cross-surface contract tests exist                                                                                   |
| TEST-06 | HIGH | L   | No fault-injection testing for any failure mode the system is expected to survive                                                         |
| TEST-14 | HIGH | L   | Essentially every COMPLETE verdict for authenticated product surfaces rests on reading source, never on observing a signed-in render      |
| TEST-20 | HIGH | L   | Wave 1+2 remediation residue: ~37 task IDs came back sound=false, including 45 inert-code findings and a false-reachability citation      |
| AI-11   | MEDI | L   | No router-quality eval corpus exists, and sources disagree on whether any evals harness landed                                            |
| TEST-07 | MEDI | M   | No cross-surface continuity tests for version skew or logout purge                                                                        |
| TEST-08 | MEDI | S   | No link or distribution-state tests, the exact guard that would stop false availability claims returning                                  |
| TEST-09 | MEDI | M   | Test infrastructure is flaky and environment-dependent across CLI, mobile and desktop                                                     |
| TEST-10 | MEDI | M   | Automated accessibility coverage exists for five web routes and no other surface                                                          |
| TEST-17 | MEDI | M   | No automated lock-step check that a shipped settings panel has a reachable nav entry — six historical instances of the same authoring bug |

**Batch W12.4 — `infra/ci`** · 9 items · 63 pts

| Item     | Sev  | Eff | Task                                                                                                                         |
| -------- | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------- |
| INFRA-25 | CRIT | XL  | No SLOs, no captured latency percentiles, near-absent tracing, and no load or soak testing                                   |
| INFRA-27 | HIGH | L   | Data-access efficiency is unverified: N+1 queries, unstreamed transfers and per-call client construction                     |
| INFRA-34 | HIGH | L   | No data-volume forecasts, retention tiers or partitioning for the tables that grow unbounded                                 |
| INFRA-37 | HIGH | XL  | Large volumes of unreachable code are never inventoried, wired or deleted                                                    |
| INFRA-58 | HIGH | S   | No external uptime monitor — every outage detector runs inside the deployment being measured                                 |
| INFRA-48 | MEDI | M   | No authoritative API contract artifact and no contract tests comparing routes to a published spec                            |
| INFRA-55 | MEDI | S   | Eleven legacy/dead database tables and an authored-but-unapplied drop migration are correctly gated but untracked as a group |
| INFRA-54 | LOW  | S   | No error-tracking or APM on the backend services, and api-gateway exposes no /metrics endpoint                               |
| INFRA-56 | LOW  | S   | packages/tools/browser-tool is dead code with a stale workspace dependency still declared by the Chrome extension            |

**Batch W12.5 — `mobile`** · 5 items · 9 pts

| Item   | Sev  | Eff | Task                                                                                                                                     |
| ------ | ---- | --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| MOB-01 | HIGH | M   | Mobile legal and help copy makes false App Store / Google Play availability and rating claims                                            |
| MOB-14 | MEDI | S   | Mobile connector catalog was faked once and needs a standing regression guard                                                            |
| MOB-21 | MEDI | S   | Mobile source-only patches awaiting device verification: prompt echo, table clipping, CSV card title, artifact thumbnails, settings exit |
| MOB-38 | MEDI | S   | Mobile capability handshake and code-execution defaults need standing regression guards                                                  |
| MOB-23 | LOW  | M   | Mobile UI parity pass against the 87 reference screenshots has not been rechecked since the source patches                               |

**Batch W12.6 — `extension`** · 4 items · 11 pts

| Item   | Sev  | Eff | Task                                                                                                                                        |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| EXT-36 | MEDI | L   | VS Code parity rows (editor context, diff review/apply, cloud-local continuation, settings) remain Partial with no per-row closure evidence |
| EXT-08 | LOW  | S   | Extension test file reimplements side-panel logic by hand instead of importing the real module, producing fake coverage                     |
| EXT-09 | LOW  | S   | VS Code marketplace description was reverted away from the locked provider-count copy                                                       |
| EXT-35 | LOW  | S   | packages/tools/browser-tool is dead code and apps/extension/package.json still declares it as a workspace dependency                        |

**Batch W12.7 — `desktop`** · 3 items · 12 pts

| Item    | Sev  | Eff | Task                                                                                                                                        |
| ------- | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| DESK-26 | HIGH | M   | Desktop visual-regression baseline captures a different app state than CI renders, and the threshold cannot catch a full-layout regression  |
| DESK-27 | HIGH | L   | Desktop native E2E has never honestly run: first real WDIO run passed 3 of 32 specs, surfacing raw i18n keys and a cold-start budget breach |
| DESK-65 | MEDI | S   | Desktop capability toggles and cloud-sync error handling need regression guards after their fail-open fixes                                 |

**Batch W12.8 — `cli`** · 3 items · 19 pts

| Item   | Sev  | Eff | Task                                                                                                                                                   |
| ------ | ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CLI-09 | MEDI | M   | TurnHostAdapter's MCP and subagent logic was verified only by verbatim-move comparison, never live-tested                                              |
| CLI-22 | MEDI | L   | CLI surface has structurally thin audit coverage — no dedicated inventory, no TUI-vs-benchmark comparison, and a gap count that reflects audit time ra |
| CLI-23 | MEDI | L   | CLI parity rows (REPL/TUI, slash commands, permissions, subagents, MCP/plugins/skills, sessions/worktrees, voice) all remain Partial with no per-row c |

**Batch W12.9 — `ui`** · 3 items · 7 pts

| Item  | Sev  | Eff | Task                                                                                                                                      |
| ----- | ---- | --- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| UI-63 | MEDI | —   | Recurring authoring pattern: settings panels ship with no nav entry, and no CI lock-step test exists outside the VS Code extension        |
| UI-88 | MEDI | M   | Recurring authoring pattern: settings panels shipped with no nav entry; only the VS Code schema/nav lock-step test defends against it     |
| UI-95 | MEDI | S   | Dedicated accessibility component directory is entirely dead code, including a mocked audit panel that always reports 'all checks passed' |

**Batch W12.10 — `compliance/dpdp`** · 1 items · 1 pts

| Item    | Sev | Eff | Task                                                                                                  |
| ------- | --- | --- | ----------------------------------------------------------------------------------------------------- |
| DPDP-33 | LOW | S   | The public /enterprise page understates SSO and SCIM readiness relative to the internal admin console |

**Batch W12.11 — `security`** · 1 items · 8 pts

| Item   | Sev  | Eff | Task                                                                                                              |
| ------ | ---- | --- | ----------------------------------------------------------------------------------------------------------------- |
| SEC-95 | MEDI | L   | Desktop native crash-dump upload was removed with no consent-safe replacement, so native crashes are unreportable |

## Cadence

One batch at a time, in wave order.

1. **Re-verify before fixing.** The register has a known false-positive rate — several items in it have already turned out to be stale, including two criticals. Open the cited code first.

2. **Make each test discriminate.** Revert the fix, watch it fail with real output, restore, watch it pass. A test that passes without the fix proves nothing.

3. **Commit the batch**, stating what was verified and what was not.

4. **Check both gates** — CI and code scanning — before the next batch.

5. **Update `register.json` in the same commit**: `status` plus a `resolution_note` with the evidence. The ledger drifting from the code is the failure mode this whole register exists to prevent.

An item that turns out already fixed is marked `resolved` with its evidence, never silently dropped. An item that needs you is marked and raised, never worked around.
