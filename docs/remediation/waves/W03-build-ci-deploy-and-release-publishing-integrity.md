# W3 — Build, CI, deploy and release-publishing integrity

[← all waves](../WAVES.md) · [register index](../README.md)

**Why now.** This is the wave that makes every later wave verifiable. The web production build is currently broken by an RSC barrel re-export (WEB-01/INFRA-08 are one defect), main CI is red on essentially every run, one monolithic check job gates all E2E lanes, several guards are themselves broken or asserting deleted files, and the skill-vetting security gate can be disarmed by a doc sweep or a warm cache. Until these are green, 'fixed' means nothing for any subsequent item. Deploy and publishing plumbing joins the same wave because it is the shared blocker under a long tail: migrations reaching production out of band block BILL-23/45, WEB-17/20 and CONN-03; the hosting plan blocks cron cadence and rollback; missing publishing credentials block DESK-02/64, MOB-07/15, EXT-18 and CLI-03; and the inert api.agiworkforce.com /v1 rewrite blocks WEB-11. Doing distribution here rather than inside each surface wave means the surface waves can actually confirm behaviour on a signed build.

**Size.** 62 items (7 critical, 30 high, 18 medium, 7 low); 54 open.

**Done when.** pnpm build succeeds for web from a clean worktree and main CI is green on three consecutive commits, with lanes split so an E2E failure does not mask unrelated checks. CodeQL default setup disabled and the advanced workflow analyses Rust on PRs; dependency and static-analysis gates block at documented severities; cargo deny, cargo fmt, clippy --all-targets and the full Rust workspace test policy are green. check:env-contract, check:ci-guardrails, check:licenses, check:repo-organization, conflict-marker and reachability guards all pass on tracked files only, and the skill-vetting gate fails CI when its scanner is removed and when the venv cache is cold. A curl to https://api.agiworkforce.com/v1/models returns a real response. Every release surface (desktop, CLI, VS Code, Chrome, iOS, Android) has credentials, an environment, a publish step, and one artifact actually downloadable from its public channel; desktop ships an SBOM and passes a clean-machine install plus an upgrade-from-previous test. Production migrations are applied through a recorded, versioned step whose status is visible in the deployment; env drift detection alerts on a deleted variable; a paid hosting plan (or documented alternative) restores auto-deploy, sub-daily cron and rollback; backup/PITR policy and bucket versioning are documented and enabled.

| ID                    | Sev      | Item                                                                                                                                                                                 | Effort |
| --------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| [DESK-03](#desk-03)   | CRITICAL | Desktop and CLI are marketed as Released but have no reachable install path (download endpoint 404s)                                                                                 | L      |
| [INFRA-01](#infra-01) | CRITICAL | main CI is red on essentially every run, so no commit is release-qualified                                                                                                           | L      |
| [INFRA-03](#infra-03) | CRITICAL | Production promotion has no recorded proof for any current head                                                                                                                      | L      |
| [INFRA-08](#infra-08) | CRITICAL | Web production build fails because an RSC barrel re-exports client-only React primitives                                                                                             | M      |
| [INFRA-15](#infra-15) | CRITICAL | Desktop and CLI are marketed site-wide as Released while no user can download either                                                                                                 | L      |
| [INFRA-17](#infra-17) | CRITICAL | Publishing credentials and environments are missing for five of six release surfaces, and the Tauri signing key has no escrow                                                        | M      |
| [WEB-01](#web-01)     | CRITICAL | Web production build fails: shared UI barrel re-exports client-only React.createContext primitives into RSC                                                                          | M      |
| [CLI-02](#cli-02)     | HIGH     | CLI has a release workflow but no publish step, and the declared npm version cannot match the release tag                                                                            | M      |
| [CLI-03](#cli-03)     | HIGH     | No published protocol-7 AGI CLI exists, so the VS Code extension composer stays disabled for every trust boundary                                                                    | M      |
| [CLI-14](#cli-14)     | HIGH     | Rust dependency policy is red: cargo deny rejects pre-existing unmaintained and yanked crates                                                                                        | M      |
| [DESK-25](#desk-25)   | HIGH     | Desktop release lacks an SBOM, a clean-machine install test, and any upgrade-from-previous-version test                                                                              | L      |
| [DOCS-01](#docs-01)   | HIGH     | THIRD_PARTY_LICENSES.md was deleted and never restored, leaving check:licenses red                                                                                                   | S      |
| [EXT-04](#ext-04)     | HIGH     | Chrome extension is fully verified in CI but has never been published to the Web Store, and packaging is blocked on the stable public key                                            | M      |
| [INFRA-02](#infra-02) | HIGH     | One monolithic `check` job gates every independent E2E lane                                                                                                                          | M      |
| [INFRA-05](#infra-05) | HIGH     | Security and dependency gates are not uniformly blocking by documented severity                                                                                                      | M      |
| [INFRA-12](#infra-12) | HIGH     | api.agiworkforce.com /v1/\* rewrites are inert in production — every /v1 path serves the not-found page                                                                              | M      |
| [INFRA-16](#infra-16) | HIGH     | CLI, VS Code and Chrome release workflows build artifacts but never publish them                                                                                                     | M      |
| [INFRA-18](#infra-18) | HIGH     | No release is tested from a clean machine, and desktop ships without an SBOM or an upgrade path test                                                                                 | M      |
| [INFRA-19](#infra-19) | HIGH     | Mobile release workflow has no privacy manifest, data-safety form, device matrix, phased rollout or crash telemetry                                                                  | L      |
| [INFRA-20](#infra-20) | HIGH     | Hosting plan constraints block auto-deploy, cron cadence, rollback and further builds                                                                                                | S      |
| [INFRA-22](#infra-22) | HIGH     | No environment-variable drift detection or alerting; a production outage from env deletion has already recurred                                                                      | M      |
| [INFRA-23](#infra-23) | HIGH     | Migrations reach production out of band, with no migration status recorded in any deployment                                                                                         | M      |
| [INFRA-24](#infra-24) | HIGH     | Nothing pages a human on a production incident because no alerting vendor is provisioned                                                                                             | S      |
| [INFRA-33](#infra-33) | HIGH     | Scheduled tasks run once daily, claiming at most ten runs across the entire deployment                                                                                               | M      |
| [INFRA-36](#infra-36) | HIGH     | No guards exist for route, role, plan, magic-number or design-token literals, and the guards that do exist are unproven                                                              | L      |
| [INFRA-41](#infra-41) | HIGH     | The skill-vetting security gate can be silently disarmed by a documentation sweep or a warm cache                                                                                    | S      |
| [INFRA-43](#infra-43) | HIGH     | No documented backup or restore policy, and the object bucket has no versioning                                                                                                      | M      |
| [INFRA-50](#infra-50) | HIGH     | VS Code design-token CI guard is release-blocking and currently red on a color-mix() false positive                                                                                  | S      |
| [INFRA-60](#infra-60) | HIGH     | check-agent-context.mjs does an unguarded readdirSync('.agents/skills') and throws ENOENT on a clean checkout, killing the first link of a 40-guard chain                            | S      |
| [INFRA-61](#infra-61) | HIGH     | A proven client-boundary guard is parked outside the repo and 63 latent 'use client' violations remain in packages/ui/unified-chat                                                   | M      |
| [MOB-02](#mob-02)     | HIGH     | Mobile store submission is blocked on the iOS Issuer ID and Android Play Console setup                                                                                               | M      |
| [MOB-15](#mob-15)     | HIGH     | Mobile cloud sign-in and iOS launch fixes are code-only; signed-build confirmation still pending                                                                                     | S      |
| [SEC-35](#sec-35)     | HIGH     | The skill-vetting security gate can be silently disarmed by a documentation change, and its CI runner reuses a cached venv that hides the breakage                                   | M      |
| [SEC-36](#sec-36)     | HIGH     | Security static analysis and dependency advisories are not uniformly blocking; CodeQL default setup suppresses Rust analysis on PRs                                                  | M      |
| [SEC-91](#sec-91)     | HIGH     | MCP slopsquatting allow-list never loads in any packaged release build and fails open, so any npm package can be installed as an MCP server                                          | S      |
| [TEST-13](#test-13)   | HIGH     | VS Code extension's Local/BYOK/Managed-Cloud trust-boundary regression suites are currently red (17 failing / ~845-862 passing)                                                      | S      |
| [UI-78](#ui-78)       | HIGH     | 63 latent 'use client' boundary violations in packages/ui/unified-chat, and the guard that catches them is parked outside the repo                                                   |        |
| [DESK-29](#desk-29)   | MEDIUM   | Desktop optional-feature build: remote-databases does not compile, and an integration test blocks all-targets clippy                                                                 | M      |
| [DESK-64](#desk-64)   | MEDIUM   | Electron Cloud shell changes are source-only: no packaged, signed app has run the callback or update journey                                                                         | M      |
| [EXT-17](#ext-17)     | MEDIUM   | VS Code extension release workflow has a single publish reference and no marketplace CI, publisher identity, Restricted Mode, remote-host, rollback or telemetry-disclosure coverage | L      |
| [INFRA-06](#infra-06) | MEDIUM   | CodeQL default setup is still enabled, suppressing Rust analysis on pull requests                                                                                                    | S      |
| [INFRA-07](#infra-07) | MEDIUM   | The full Rust workspace is not under one trustworthy test and lint policy                                                                                                            | L      |
| [INFRA-09](#infra-09) | MEDIUM   | Reachability guards may still carry stale allowlist entries for a now-wired module                                                                                                   | S      |
| [INFRA-10](#infra-10) | MEDIUM   | check:env-contract fails on an undocumented MODERATION_HASH_DENYLIST variable                                                                                                        | S      |
| [INFRA-11](#infra-11) | MEDIUM   | check:ci-guardrails asserts vercel.json owns a rewrite that has moved to next.config.ts                                                                                              | S      |
| [INFRA-13](#infra-13) | MEDIUM   | Prettier is not enforced repo-wide; 733 files fail format:check                                                                                                                      | S      |
| [INFRA-14](#infra-14) | MEDIUM   | check-no-conflict-markers.py walks the working tree instead of git ls-files, false-positiving on local artifacts                                                                     | S      |
| [INFRA-21](#infra-21) | MEDIUM   | Deployment topology is undeclared; a vestigial domain alias and two undeployed services duplicate live routes                                                                        | M      |
| [INFRA-38](#infra-38) | MEDIUM   | Build-graph and cache correctness are unverified, with no build budgets and unbounded module sizes                                                                                   | L      |
| [INFRA-39](#infra-39) | MEDIUM   | Asset classes are not separated and regeneration does not produce a clean diff                                                                                                       | M      |
| [INFRA-40](#infra-40) | MEDIUM   | The workflow flow-bundle can break dev and build, and nothing in CI builds it                                                                                                        | S      |
| [INFRA-47](#infra-47) | MEDIUM   | CI failures were never classified as pre-existing versus remediation regressions                                                                                                     | S      |
| [INFRA-59](#infra-59) | MEDIUM   | reference-integrity CI gate is green only against a ratcheting debt list carrying 224 undeclared references                                                                          | L      |
| [MOB-16](#mob-16)     | MEDIUM   | expo run:ios fails on a React Native codegen build-order issue, blocking the Maestro real-UI smoke                                                                                   | S      |
| [MOB-18](#mob-18)     | MEDIUM   | Mobile iOS 27 and newest-Android on-device model matrix cannot be certified without hardware                                                                                         | M      |
| [CLI-05](#cli-05)     | LOW      | cargo fmt --all --check fails on apps/cli/src/models/streaming.rs, gating the CLI release workflow                                                                                   | S      |
| [CLI-10](#cli-10)     | LOW      | CLI path_security test intermittently fails under parallel execution due to shared process-global state                                                                              | S      |
| [INFRA-42](#infra-42) | LOW      | R2 CORS policy cannot be re-applied from the repository because no account-scoped token is stored                                                                                    | S      |
| [INFRA-46](#infra-46) | LOW      | check:repo-organization is red on untracked root artifacts from other in-flight work                                                                                                 | S      |
| [MOB-17](#mob-17)     | LOW      | Mobile jest setup lacks an expo-secure-store mock, breaking any suite touching SecureStore-backed stores                                                                             | S      |
| [MOB-29](#mob-29)     | LOW      | Mobile store listing metadata contains a dangling review-notes reference and a literal founder-phone placeholder                                                                     | S      |
| [TEST-16](#test-16)   | LOW      | No confirmed CI gate runs both sides of the TS/Rust cloud-sync fixture-replay parity test together                                                                                   | S      |

---

### DESK-03 — Desktop and CLI are marketed as Released but have no reachable install path (download endpoint 404s)

`CRITICAL` · desktop · effort L

**What.** Header nav, /download and /cli claim 'Released · v1.2.0' / 'Released · v1.0.0' in present tense on every page. The desktop availability probe requires a .sig asset the v-desktop-1.2.0 GitHub release does not carry (only .rpm/.AppImage/.deb), so /api/releases/latest/linux-x86_64 returned 404 NOT_FOUND on a live probe. Verified still present: DesktopDownloadAvailability.tsx and the release route still gate strictly on a resolved signature asset. Desktop release manifests 404 on all four platforms, leaving 739 Rust files and 1,309 Tauri commands unreachable by any user. Publishing credentials are missing for 5 of 6 release surfaces (only Tauri signing secrets exist).

**Done when.** Either publish signed artifacts with the assets the probe requires and wire the four platform manifests, or downgrade every 'Released' claim to the real distribution state until they exist.

**Where.** `apps/web/lib/marketing-constants.ts:84-91`, `apps/web/app/download/DesktopDownloadAvailability.tsx:16-33,68-88`, `apps/web/app/api/releases/latest/[platform]/route.ts:89-93`

**Blocked by.** founder: Apple Developer account, publishing environments/secrets, GitHub release assets

**From.** docs/agent-context/phase4-capability-audit.md (PP-28); ExecutionPlan.md (founder actions #2, #3)

**Folded in.** PP-28: Platform distribution: many surfaces unpublished or falsely claimed; Founder action: desktop release manifests 404 on all four platforms; Founder action: publishing credentials missing for 5 of 6 release surfaces

### INFRA-01 — main CI is red on essentially every run, so no commit is release-qualified

`CRITICAL` · infra/ci · effort L

**What.** GAP-P0-001: the latest main CI run failed in 'Test (apps/desktop + apps/cli, default features)'; VS Code+CLI E2E, Clippy all-features, desktop E2E, web E2E/a11y, mobile iOS E2E, Windows/macOS Rust smoke and Chrome extension E2E were all skipped, and production and signaling deploy workflows were skipped for the same head. The gap-audit's own verification records that runs on 2026-08-13 (after the audit date) and 08-09 through 08-11 also failed. ExecutionPlan #3 contradicts this, claiming the class was fixed 2026-08-09 (68c8607f4) after 100/100 sampled runs failed — the later evidence wins, so this stays open. CI-RUST-REDS-01 adds that Desktop (4,639) and CLI (1,866) tests pass locally with strict clippy but a full CI rerun on the real pipeline was still pending. The Phase-9 stop-gate run concluded AUDIT_REMEDIATION_INCOMPLETE on commit 8af15d594.

**Done when.** main is green on a specific SHA with every required lane actually executed, and that SHA is the one promoted — with the underlying native-test failure fixed at the defect rather than by relaxing the assertion.

**Where.** `.github/workflows/ci.yml`

**From.** gap-audit-2026-08-08.md; ExecutionPlan.md; known-flaws.md; AuditRemediationLedger.md

**Folded in.** GAP-P0-001 main CI is red and the exact head is not release-qualified; ExecutionPlan #3 CI was red on essentially every run; CI-RUST-REDS-01; Phase 9 stop-gate AUDIT_REMEDIATION_INCOMPLETE

### INFRA-03 — Production promotion has no recorded proof for any current head

`CRITICAL` · infra/ci · effort L

**What.** GAP-P0-003: direct Vercel deployment from main is intentionally disabled and CI owns promotion, so a red CI leaves the deployed product behind the repo with no alternate verified path, no recorded deployment status (SHA, artifact digest, migration status, smoke results), and no visible failure when a deployment is skipped. VERIFIED: 'Deploy Production Surfaces' and 'Deploy Signaling Server' workflow_run runs on main completed as 'skipped' on 2026-08-14. ExecutionPlan #4 partially addresses this — scripts/verify-deployment.mjs now probes the real serving path after promotion (VERIFIED present), replacing a curl /api/health gate that never imported api-auth, and REL-011 confirms it self-tests in CI with 8 passing checks — but the promotion itself still does not happen and no deployment record is written. Phase-9 item 9D (the runtime acceptance matrix) was blocked for the same reason: it requires a deployed build, and nothing in it could be honestly claimed. REL-001 (web release evidence: production smoke, auth, checkout, billing, rollback) remains unconfirmed end to end.

Also recorded by a later audit (Production promotion failure — HEAD does not serve; the commit at agiworkforce.com is unconfirmed (GAP-P0-003)): Fresh 2026-08-15 evidence: the inspectable Vercel project's production alias serves 4bfc99dc1, ~4 days behind e15df56e3 HEAD, with 5 confirmed-missing routes and 5 of the last 20 deployments in ERROR. The apex domain agiworkforce.com is attached to a DIFFERENT Vercel account scope than the team-scoped project the audit could inspect, so which commit real users see is stated as 'Unknown'. Consequence for the whole register: essentially every COMPLETE/BROKEN verdict in all twelve parity deliverables describes the source tree at e15df56e3, not what agiworkforce.com serves, and no deliverable states this as a standing caveat. GAP-P0-003 was also excluded from GapMatrix.md's headline '3 P0' count with no footnote. Requires a human with Vercel production access. Refs: audit/parity-2026-08-15/inventory/deployment-state.md:125, prod-vs-source-drift.md.

**Done when.** Every promotion writes a durable record — source SHA, artifact digest, environment, deployment URL, migration status, smoke results — a skipped deployment fails visibly, and a route reports the deployed SHA so main-to-production lag can be alerted on.

**Where.** `.github/workflows/deploy-production.yml`, `scripts/verify-deployment.mjs`, `vercel.json`

**From.** gap-audit-2026-08-08.md; ExecutionPlan.md; AuditRemediationLedger.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-P0-003 Production promotion has no successful proof; REL-001 Web release evidence not confirmed; Phase-9 9D runtime acceptance matrix blocked; REL-011 store/marketplace listings inferred (web half)

### INFRA-08 — Web production build fails because an RSC barrel re-exports client-only React primitives

`CRITICAL` · infra/ci · effort M

**What.** BASE-003 finding 1, marked 'still present': `pnpm --filter @agiworkforce/web build` exits 1 with TypeError (0,o.createContext) is not a function. The chain is MarketingFooter → shared/components/agi/AgiMark.tsx → the @agiworkforce/ui barrel (packages/ui/ui/src/index.ts), which has no 'use client' directive and re-exports Carousel.tsx and ToggleGroup.tsx that call React.createContext at module scope. Listed here rather than in a web slice because its effect is a hard deploy blocker: no production artifact can be built at all.

**Done when.** The shared UI barrel does not pull client-only primitives into a server component graph, so the production build succeeds from a clean checkout.

**Where.** `packages/ui/ui/src/index.ts:187`, `packages/ui/ui/src/primitives/Carousel.tsx:1`, `packages/ui/ui/src/primitives/ToggleGroup.tsx:1`, `apps/web/shared/components/agi/AgiMark.tsx:6`, `apps/web/app/about/page.tsx:5`

**From.** AuditRemediationLedger.md

### INFRA-15 — Desktop and CLI are marketed site-wide as Released while no user can download either

`CRITICAL` · infra/ci · effort L

**What.** phase4 PP-28 (SHIP): header nav, /download and /cli claim 'Released · v1.2.0' and 'Released · v1.0.0' in present tense on every page, but the desktop availability probe requires a .sig asset the v-desktop-1.2.0 GitHub release does not have (only .rpm/.AppImage/.deb), so the live endpoint 404s — live curl proof at audit time: /api/releases/latest/linux-x86_64 → 404 NOT_FOUND. VERIFIED still present: DesktopDownloadAvailability.tsx and the release route still gate strictly on a resolved signature asset. No CLI download control exists anywhere on the site and `npm i -g @agiworkforce/cli` 404s; apps/cli/npm/package.json declares 1.7.1, a version that cannot match the v-cli-1.0.0 tag release-cli.yml's validate-version step requires, so the publish job could not have succeeded. ExecutionPlan founder item 3 confirms all four desktop platform manifests 404 and /api/releases/desktop-cloud/latest returns 'No cloud build', leaving 739 Rust files and 1,309 Tauri commands unreachable by any user. REL-011 and SCALE-VER-008 generalise it: store and marketplace listings are inferred from source configuration rather than measured. ExecutionPlan founder item 14 notes 45 lifetime downloads across every public release.

Also recorded by a later audit (PP-28: Desktop header falsely claims 'AGI Desktop · Released · v1.2.0' (HANDOFF.md §4, phase4-capability-audit.md)): An in-product instance of the site-wide false-availability claim: the desktop app's own header asserts a Released state and a version number while no user can download the product (DESK-03: download endpoint 404s). Fix must be consistent with the desktop-shell-release requirement of honest manual-installer behaviour, i.e. correct or remove the claim rather than back-fill a release.

**Done when.** Every surface advertised as Released has a probe-verified download that a new user can complete, and any surface without one is labelled unavailable until it does.

**Where.** `apps/web/lib/marketing-constants.ts:84-91`, `apps/web/app/download/DesktopDownloadAvailability.tsx:16-33,68-88`, `apps/web/app/api/releases/latest/[platform]/route.ts:89-93`, `apps/cli/npm/package.json:2-3`, `.github/workflows/release-cli.yml:55-57`

**From.** phase4-capability-audit.md; AuditRemediationLedger.md; ExecutionPlan.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PP-28 Platform distribution: many surfaces unpublished or falsely claimed; phase4 PP-28 Desktop and CLI marketed Released with no install path; phase4 PP-28 npm CLI version mismatch; ExecutionPlan founder item 3 desktop release manifests 404; REL-011 Store/marketplace listings inferred rather than measured; SCALE-VER-008 Release claims not verified from deployed artifacts

### INFRA-17 — Publishing credentials and environments are missing for five of six release surfaces, and the Tauri signing key has no escrow

`CRITICAL` · infra/ci · effort M

**What.** ExecutionPlan founder item 2: the GitHub org has two Actions secrets (both Tauri signing), zero Actions variables, and none of the four publishing environments the release workflows require; the only desktop release tag says 'defer macos to v1.2.1 — apple\_\* signing secrets not configured' (2026-05-04) while 532 desktop commits have landed since. Founder item 4: TAURI_SIGNING_PRIVATE_KEY's public half is baked into every shipped binary while the private half exists only as one unbackupable CI secret — losing it bricks auto-update for every install, and leaking it lets an attacker sign updates every install accepts. FoundersAssistance item 9 adds that Chrome release packaging correctly fails closed while CHROME_EXTENSION_PUBLIC_KEY is absent, because producing a different CRX identity would break the Clerk extension origin allowlist. FoundersAssistance item 23 records the mobile equivalents: the App Store Connect Issuer ID is not recorded anywhere so preflight stops at ascAppId, and Android needs a Play Console app plus service-account JSON.

**Done when.** Every release surface has its publishing environment and credentials provisioned, and the signing key is escrowed so neither loss nor leak is a single-point catastrophe.

**Where.** `apps/mobile/scripts/release/preflight.sh`, `apps/extension/CHROME_WEB_STORE_PUBLISH_RUNBOOK.md`

**Blocked by.** Founder must purchase an Apple Developer account, create publishing environments/secrets, escrow the Tauri key, supply the Chrome Web Store public key and the App Store Connect Issuer ID

**From.** ExecutionPlan.md; FoundersAssistance.md

**Folded in.** ExecutionPlan founder item 2 publishing credentials missing; ExecutionPlan founder item 4 Tauri signing key has no escrow; FoundersAssistance #9 Chrome Web Store public key; FoundersAssistance #23 mobile store credentials

### WEB-01 — Web production build fails: shared UI barrel re-exports client-only React.createContext primitives into RSC

`CRITICAL` · web · effort M

**What.** pnpm --filter @agiworkforce/web build exits 1 with TypeError: (0,o.createContext) is not a function. MarketingFooter -> shared/components/agi/AgiMark.tsx -> the @agiworkforce/ui barrel, which has no 'use client' directive and re-exports Carousel.tsx / ToggleGroup.tsx that call React.createContext at module scope. Verified during this merge: packages/ui/ui/src/index.ts still opens with a doc comment ('cross-surface PURE UI'), not a 'use client' directive.

**Done when.** Web production builds succeed: the shared UI barrel no longer pulls client-only context primitives into the RSC graph — either mark the client-only primitives 'use client' at their own module boundary or split the barrel so server components import only pure-presentation exports.

**Where.** `packages/ui/ui/src/index.ts:187`, `packages/ui/ui/src/primitives/Carousel.tsx:1`, `packages/ui/ui/src/primitives/ToggleGroup.tsx:1`, `apps/web/shared/components/agi/AgiMark.tsx:6`, `apps/web/app/about/page.tsx:5`

**From.** AuditRemediationLedger.md (BASE-003 finding 1)

### CLI-02 — CLI has a release workflow but no publish step, and the declared npm version cannot match the release tag

`HIGH` · cli · effort M

**What.** release-cli.yml contains no npm publish or cargo publish step, so no published CLI package exists despite a workflow that reads as a shipped channel; signatures, checksums and install/uninstall/upgrade tests are also absent. Compounding: apps/cli/npm/package.json declares @agiworkforce/cli@1.7.1, a version that cannot satisfy the v-cli-1.0.0 tag the workflow's validate-version step requires, and the npm registry returns 404 for the declared package and alternates. No CLI download control exists anywhere on the site.

**Done when.** Add a real publish step with signature and checksum generation, reconcile the declared package version with the release-tag contract, and add install/uninstall/upgrade tests against the published artifact.

**Where.** `.github/workflows/release-cli.yml:55-57`, `apps/cli/npm/package.json:2-3`

**From.** AuditRemediationLedger.md (REL-004); docs/agent-context/phase4-capability-audit.md (PP-28)

**Folded in.** Declared npm CLI package version does not match the release tag the CI workflow requires

### CLI-03 — No published protocol-7 AGI CLI exists, so the VS Code extension composer stays disabled for every trust boundary

`HIGH` · cli · effort M

**What.** A verified run installed agi-workforce-0.3.0.vsix cleanly and found an AGI CLI, but its developer-session handshake did not support protocol 7: the sidebar stayed on 'Route pending', showed upgrade and path recovery, opened Runtime Settings, and sent no prompt — with no extension-host error. A real turn, activity, approval, Stop and post-thread boundary transition all require a released protocol-7 CLI.

Also recorded by a later audit (VS Code signed-CLI-distribution/bootstrap release story missing): parity-implementation-matrix.md's 2026-08-05 Class-1 status states plainly that for VS Code 'the substantive gap is the signed-CLI-distribution/bootstrap story — release infrastructure, not extension code', which is the same root cause as CLI-03 (no published protocol-7 AGI CLI exists) and explains why EXT-18's composer is disabled for every trust boundary.

**Done when.** Publish a signed protocol-7 agi CLI (>=1.7.1) to every Marketplace platform with a documented install/update/rollback/uninstall path, then verify one real thread per trust boundary in a fresh profile.

**Where.** `apps/cli`, `apps/extension-vscode`

**Blocked by.** publishing a signed protocol-7 CLI (FoundersAssistance.md #19); depends on CLI-02

**From.** FoundersAssistance.md (#19); ExecutionPlan.md (VS Code extension manual release loop); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2); FoundersAssistance.md; ExecutionPlan.md

**Folded in.** FoundersAssistance #19: Publish and certify the developer-session protocol 7 AGI CLI; ExecutionPlan: VS Code extension real Local/BYOK/Managed turn needs a released protocol-7 CLI/runtime; VS Code composer is disabled for every trust boundary because no published protocol-7 CLI exists

### CLI-14 — Rust dependency policy is red: cargo deny rejects pre-existing unmaintained and yanked crates

`HIGH` · cli · effort M · **in-progress**

**What.** cargo audit is clean (0 vulnerabilities, one allowed unmaintained-crate warning), but `cargo deny check advisories` still exits 1 because the deny policy rejects several pre-existing unmaintained and yanked crate warnings. The Rust dependency-advisory step was also one of four non-blocking-but-required CI steps skipped at the last stop gate. Applies to the whole Rust workspace including desktop.

**Done when.** Upgrade or replace the unmaintained/yanked crates, or record time-bounded exceptions with owners in deny.toml, then make the advisory step blocking.

**Where.** `deny.toml`, `Cargo.lock`

**From.** docs/agent-context/known-flaws.md (RUST-DEPENDENCY-ADVISORIES-01); AuditRemediationLedger.md (Phase 9 stop-gate run)

### DESK-25 — Desktop release lacks an SBOM, a clean-machine install test, and any upgrade-from-previous-version test

`HIGH` · desktop · effort L

**What.** Signing and notarization is the strongest domain (release-desktop.yml has 10 signing references and the runbook fails the job unless each step is proven), but SBOM generation and a clean-machine install test are absent, and there is no upgrade-from-previous-version path at all — schema, config and model-cache migration on upgrade, plus rollback, are untested. Flagged as the item most likely to bite real existing users. Zero references to a clean-machine or fresh-install test exist in any workflow, so 'works from a clean checkout' is asserted, never demonstrated.

**Done when.** Emit an SBOM in the release job, add a clean-VM install test and an install-old-version-then-upgrade test that asserts schema/config/model-cache migration and rollback.

**Where.** `.github/workflows/release-desktop.yml`

**From.** AuditRemediationLedger.md (REL-002, REL-008, REL-009)

**Folded in.** REL-008: No release testing from a clean machine/account; REL-009: No upgrade-from-previous-version testing for Desktop

### DOCS-01 — THIRD_PARTY_LICENSES.md was deleted and never restored, leaving check:licenses red

`HIGH` · docs · effort S

**What.** BASE-003 unwired gate: the file was deleted in commit 906fe5cda while AGENTS.md, docs/legal/README.md:68 and docs/agent-context/known-flaws.md:2762 still describe it as the license-obligations record; the pre-deletion content is recoverable via git show. VERIFIED still absent from the repository root. scripts/check-licenses.mjs:146 fails on it. PP-30 records the related unmet obligation: model and provider license and resale constraints are not tracked in the registry or the release process.

**Done when.** The license-obligations record exists at the path every document cites, the licenses gate passes, and model/provider license constraints are tracked alongside it.

**Where.** `scripts/check-licenses.mjs:146`, `docs/legal/README.md:68`

**From.** AuditRemediationLedger.md

**Folded in.** BASE-003 check:licenses fails: THIRD_PARTY_LICENSES.md deleted; PP-30 model/provider license constraints not tracked

### EXT-04 — Chrome extension is fully verified in CI but has never been published to the Web Store, and packaging is blocked on the stable public key

`HIGH` · extension · effort M

**What.** release-chrome-extension.yml builds the store ZIP, installs Chromium, and exercises the exact packaged bytes in-browser — the hard part is done — but has zero store-publish steps. Packaging additionally fails closed when CHROME_EXTENSION_PUBLIC_KEY is absent, deliberately, to avoid creating a different CRX identity that would break the Clerk extension origin allowlist. All local checks pass up to that identity guard. Final signed-in cross-surface continuity and deletion proof against the exact packaged bytes is also outstanding for want of a real Chrome profile. Release-workflow mechanics overlap the infra/ci slice.

**Done when.** The exact packaged extension is published to the Chrome Web Store under the stable item ID, and the signed-in continuity and deletion journey is verified against those bytes.

**Where.** `.github/workflows/release-chrome-extension.yml`, `apps/extension/CHROME_WEB_STORE_PUBLISH_RUNBOOK.md`

**Blocked by.** FoundersAssistance.md #9 and #14 — founder must supply the stable Chrome Web Store public key and a real Chrome profile for the acceptance pass

**From.** AuditRemediationLedger.md; FoundersAssistance.md; ExecutionPlan.md

**Folded in.** REL-006: Chrome extension is verified but never published to the store; FoundersAssistance #9: Missing stable Chrome Web Store public key blocks release packaging; FoundersAssistance #14: Verify exact-package Chrome presentation and signed-in chat continuity

### INFRA-02 — One monolithic `check` job gates every independent E2E lane

`HIGH` · infra/ci · effort M

**What.** GAP-P0-002: every expensive E2E job declares `needs: check`, so a late native-test failure prevents web, mobile, desktop, Chrome, VS Code, Windows and macOS evidence from ever running. VERIFIED still present — grep of .github/workflows/ci.yml shows 8 jobs with `needs: check` at lines 469, 562, 598, 644, 722, 812, 890 and 931. This is the structural reason INFRA-01's red run produces no per-surface evidence at all, and why the Phase-9 stop gate could not execute per-surface E2E, release builds or the load suite.

**Done when.** Independent lanes (repo guards, JS lint/type/test/build, Rust desktop+CLI, security, per-surface E2E, smoke) run in parallel behind change detection with one final aggregate gate, so one lane's failure never suppresses another lane's evidence.

**Where.** `.github/workflows/ci.yml:469,562,598,644,722,812,890,931`

**From.** gap-audit-2026-08-08.md; AuditRemediationLedger.md

**Folded in.** GAP-P0-002; Phase 9 stop-gate: per-surface E2E and release builds not run

### INFRA-05 — Security and dependency gates are not uniformly blocking by documented severity

`HIGH` · infra/ci · effort M

**What.** CRIT-018: Rust and JS/TS dependency advisories, lockfile integrity, license policy and static-analysis findings are not uniformly blocking by documented severity, and shared crates excluded from Clippy or static analysis are not isolated or documented. GAP-P0-005 verification records real but partial progress: an in-file comment dated 2026-08-09 shows CI now runs `semgrep scan` directly, distinguishes a broken scanner (exit>=2, blocking) from findings (exit 1), and triaged 148 findings down to 18 accepted supply-chain-hardening items — but the job still never fails when findings>0 (the count is only written to $GITHUB_OUTPUT and never checked), so 'new high/critical findings block CI' is still not met. RUST-DEPENDENCY-ADVISORIES-01: cargo audit is clean but `cargo deny check advisories` still exits 1 on pre-existing unmaintained and yanked crate warnings. The Phase-9 stop gate recorded four non-blocking-but-required steps skipped or flaky: Semgrep, Rust dependency advisories, the Windows `cargo test --workspace --lib` lane, and the AP-09 lock-drift advisory.

Also recorded by a later audit (18 Semgrep supply-chain hardening items not landed (HANDOFF.md §6)): All 18 are real package-manager hardening items (dependabot cooldowns, pnpm/npm minimum release age, trust policy), deliberately not landed at the time because they change INSTALL behaviour while production was down — the ledger states they are safe to land now. Explicit follow-through: once the count reaches zero, add `--error` to the Semgrep step to make it blocking, which is exactly INFRA-05's 'not uniformly blocking' condition.

**Done when.** Each dependency and static-analysis gate has a documented blocking severity and fails the build at it, with every exclusion isolated and justified in one place.

**Where.** `.github/workflows/ci.yml`, `deny.toml`, `Cargo.lock`

**From.** AuditRemediationLedger.md; gap-audit-2026-08-08.md; known-flaws.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** CRIT-018 Dependency/security checks are not uniformly blocking; GAP-P0-005 Semgrep security analysis is advisory; RUST-DEPENDENCY-ADVISORIES-01; Phase 9 stop-gate: 4 non-blocking-but-required CI steps

### INFRA-12 — api.agiworkforce.com /v1/\* rewrites are inert in production — every /v1 path serves the not-found page

`HIGH` · infra/ci · effort M

**What.** WEB-API-HOST-REWRITES-INERT-01, explicitly Reopened 2026-08-09: Next's proxy.ts redirects raw /v1/\* before host rewrites run, so every /v1 path serves the Next.js not-found page in production, and the source and OpenAPI docs still document the API host as unavailable. ExecutionPlan #62 (BLOCKED, half inside and half outside its write set) records the mechanism: vercel.json duplicates rewrites Vercel ignores for Next.js projects, it was verified on 2026-07-17 that /v1 served /\_not-found, and the advertised api.agiworkforce.com 307 strips the host condition and lands on 404. MATCH-008's fix additionally emptied vercel.json's rewrites entirely including five host-scoped routes serving the whole OpenAI-compatible API on api.agiworkforce.com — caught by check:ci-guardrails and fixed in 8af15d594. ExecutionPlan #96 (BLOCKED) states the consequence: the developer API is unusable as documented, since only the internal chat/completions path works.

**Done when.** One owner declares the host routing, the advertised API host actually serves /v1/\*, and a deployment smoke asserts it against the real serving path.

**Where.** `apps/web/proxy.ts`, `apps/web/next.config.ts:98-99`, `vercel.json:13-39`, `apps/web/public/openapi.json`, `scripts/check-ci-guardrails.mjs:473`

**From.** known-flaws.md; ExecutionPlan.md; AuditRemediationLedger.md

**Folded in.** WEB-API-HOST-REWRITES-INERT-01; MATCH-008 Half the routing config in vercel.json is inert/duplicated; ExecutionPlan #62 vercel.json /v1/_ rewrites inert; ExecutionPlan #96 Developer API is unusable as documented; WEB-API-HOST-REWRITES-INERT-01: api.agiworkforce.com /v1/_ rewrites reopened as broken in Next.js proxy.ts; MATCH-008: Half the routing config in vercel.json is inert/duplicated; ExecutionPlan #62: vercel.json /v1/_ rewrites are inert and can silently diverge from actual behavior; BASE-003 finding 5: check:ci-guardrails asserts vercel.json owns a rewrite that moved to next.config.ts; api.agiworkforce.com /v1/_ rewrites are inert — every /v1 path serves the Next.js not-found page in production

### INFRA-16 — CLI, VS Code and Chrome release workflows build artifacts but never publish them

`HIGH` · infra/ci · effort M

**What.** REL-004 triage (2026-08-09): release-cli.yml contains no npm publish or cargo publish step, so no published CLI package exists despite a release workflow that reads as a shipped channel; signatures, checksums and install/uninstall/upgrade tests are also absent. REL-005: release-vscode-extension.yml has exactly one publish reference, with marketplace CI, publisher identity, Restricted Mode/Workspace Trust behaviour, remote-host tests, update/rollback and telemetry disclosure otherwise absent. REL-006: release-chrome-extension.yml builds the store ZIP, installs Chromium and exercises the exact packaged bytes in-browser — the hard part is done — but has zero store-publish steps, the easy part. Chrome publishing is additionally gated on a stable public key (see INFRA-17).

**Done when.** Each release workflow ends in a real publish to its channel with signatures and checksums, and an install/upgrade/uninstall test proves the published artifact works.

**Where.** `.github/workflows/release-cli.yml`, `.github/workflows/release-vscode-extension.yml`, `.github/workflows/release-chrome-extension.yml`

**From.** AuditRemediationLedger.md

**Folded in.** REL-004 CLI has a release workflow but no publish step; REL-005 VS Code extension release workflow has only one publish reference; REL-006 Chrome extension is verified but never published

### INFRA-18 — No release is tested from a clean machine, and desktop ships without an SBOM or an upgrade path test

`HIGH` · infra/ci · effort M

**What.** REL-008 triage: zero references to a clean-machine or fresh-install test exist in any workflow — every signal comes from a runner that already built the project, so 'works from a clean checkout' is asserted and never demonstrated. SCALE-BUILD-006 states the same risk from the build side: possible undeclared local files, generated outputs, hidden env or stale caches may be required to build. REL-002: desktop signing and notarization are strong (release-desktop.yml has 10 signing/notarization references and the runbook fails the job unless each step is proven) but SBOM and a clean-machine install test are still missing. REL-009, flagged as the item most likely to bite real existing users: release-desktop.yml has no upgrade-from-previous-version path, so schema, config and model-cache migration on upgrade — and rollback — are untested.

**Done when.** A release is proven by installing the published artifact on a clean machine and by upgrading from the previous published version, with an SBOM produced for each build.

**Where.** `.github/workflows/release-desktop.yml`

**From.** AuditRemediationLedger.md

**Folded in.** REL-008 No release testing from a clean machine/account; REL-002 Desktop release: SBOM and clean-machine install test missing; REL-009 No upgrade-from-previous-version testing for Desktop; SCALE-BUILD-006 Clean-checkout reproducibility unverified

### INFRA-19 — Mobile release workflow has no privacy manifest, data-safety form, device matrix, phased rollout or crash telemetry

`HIGH` · infra/ci · effort L

**What.** REL-003 triage (2026-08-09): release-mobile.yml has ZERO references to a privacy manifest or a data-safety form — both submission-blocking for iOS and Play respectively — and device-matrix E2E, phased rollout, and crash/ANR/battery/thermal telemetry are all absent. MOBILE-PRIVACY-MANIFEST-LOCKED-COPY-DRIFT-01 adds that the locked App Store privacy-manifest review copy is already stale against the real prebuild-generated manifest (missing the C56D.1 FileTimestamp required-reason code and NSPrivacyTrackingDomains) and cites a deleted path as canonical. FoundersAssistance item 13 records that the iOS 27 and newest-Android on-device model hardware matrix cannot be certified at all: this machine has Xcode 26.6 only and no attached iOS 27 hardware. Primary home is release/deploys; overlaps the mobile slice for the store-listing content itself.

**Done when.** The mobile release workflow produces and verifies the privacy manifest and data-safety declaration, runs a device-matrix E2E, and ships behind a phased rollout with crash and ANR telemetry.

**Where.** `.github/workflows/release-mobile.yml`, `apps/mobile/store-listing/ios/PrivacyInfo.xcprivacy`, `apps/mobile/app.config.js`, `scripts/screenshots/pipeline.ts`

**Blocked by.** Physical iOS 27 hardware and Xcode 27 for the certification half

**From.** AuditRemediationLedger.md; known-flaws.md; FoundersAssistance.md; AuditRemediationLedger.md (REL-003); docs/agent-context/known-flaws.md (MOBILE-IOS-SCREENSHOTS-INCOMPLETE)

**Folded in.** REL-003 Mobile release gaps; MOBILE-PRIVACY-MANIFEST-LOCKED-COPY-DRIFT-01; FoundersAssistance #13 iOS 27/Android hardware matrix; MOBILE-IOS-SCREENSHOTS-INCOMPLETE: iPhone 17 Pro Max and iPad Pro 13 screenshot classes never captured; Mobile release workflow has no privacy manifest or data-safety form, no device-matrix E2E, no phased rollout, no crash telemetry

### INFRA-20 — Hosting plan constraints block auto-deploy, cron cadence, rollback and further builds

`HIGH` · infra/ci · effort S

**What.** PROD-VERCEL-DEPLOY-TOPOLOGY-01: the Vercel project has no connected Git repository so pushes to main never auto-deploy despite vercel.json config, and the account is on the Hobby plan, capping crons at daily and rejecting the sub-daily reconcile-credits and run-schedules crons outright. ExecutionPlan founder item 1 adds that Hobby lacks instant rollback, spend caps and an SLA, and is the reason INFRA-33 (scheduled tasks) exists and why sandboxes can bill up to 24h before reclamation. FoundersAssistance item 7 records that the Hobby team hit 100% of its included 4 hours of Fluid Active CPU on 2026-08-11, blocking further production builds, and that the founder does not want to upgrade. FoundersAssistance item 3 notes the Vercel Git Comments toggle is still off, blocking preview deployments. User memory independently records that a sub-daily cron in vercel.json silently kills every deploy — pushes succeed and no build queues.

Also recorded by a later audit (Health-probe cadence is daily, giving up to 24h outage detection latency, because Vercel Hobby rejects sub-daily cron (docs/runbooks/incident-response.md; PROD-VERCEL-DEPLOY-TOPOLOGY-01)): Concrete cost of the hosting-plan constraint: 'The Vercel project is on the Hobby plan, which rejects the deploy outright for any cron more frequent than daily, so a tighter cadence would take the site down in order to improve its monitoring.' The remediation is explicitly ordered: tighten the vercel.json health-probe entry to a five-minute schedule the same day the project moves to Pro, and not before. Refs: apps/web/app/api/cron/health-probe/route.ts. Same root constraint as AGENTIC-WORK-004's scheduled-task ceiling (INFRA-33).

**Done when.** The hosting plan and Git connection support the deploy cadence, cron schedule, spend caps and instant rollback the product actually needs, or the product's cron and rollback design is explicitly rewritten to fit Hobby limits.

**Where.** `vercel.json`

**Blocked by.** Founder decision on a paid Vercel plan and connecting the Git repository

**From.** known-flaws.md; ExecutionPlan.md; FoundersAssistance.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** PROD-VERCEL-DEPLOY-TOPOLOGY-01; ExecutionPlan founder item 1 Vercel plan upgrade; FoundersAssistance #7 Hobby Fluid Active CPU exhausted; FoundersAssistance #3 Vercel Git Comments toggle

### INFRA-22 — No environment-variable drift detection or alerting; a production outage from env deletion has already recurred

`HIGH` · infra/ci · effort M

**What.** PROD-ENV-DRIFT-ALERTING-GAP-2026-07-11: UPSTASH_REDIS_REST_URL and TOKEN were missing from Vercel production a second time, causing every /api/\* route to 500 at module eval; it was fixed the same day, but no alerting exists to catch env-var drift before it causes an outage. DPDP_PROGRESS O-19a documents a second shape of the same gap: ACCOUNT_STATUS_FAIL_OPEN is an escape hatch that admits suspended and banned accounts when the account-status lookup fails, and VERIFIED it appears in neither apps/web/lib/validate-env.ts nor scripts/env-doctor.mjs, so a deploy left with it on gives no boot-time signal. The security consequence of that specific flag belongs to the security slice; the missing boot-time and drift signal is this item.

**Done when.** Production env is reconciled against the declared contract on a schedule and at boot, with alerting on drift, and every behaviour-changing flag — including fail-open escape hatches — is visible to the env validator.

**Where.** `apps/web/lib/rate-limit.ts`, `apps/web/lib/validate-env.ts`, `scripts/env-doctor.mjs`, `apps/web/lib/api-auth.ts:81-90`

**Blocked by.** Founder decision on env reconciliation/alerting tooling

**From.** known-flaws.md; DPDP_PROGRESS.md

**Folded in.** PROD-ENV-DRIFT-ALERTING-GAP-2026-07-11; DPDP O-19a ACCOUNT_STATUS_FAIL_OPEN invisible to env validation (boot-signal half)

### INFRA-23 — Migrations reach production out of band, with no migration status recorded in any deployment

`HIGH` · infra/ci · effort M

**What.** Multiple features are gated on migrations that were never applied: PROD-SEARCH-MIGRATION-0045-01 (get_popular_searches applied to DEV only, so popular searches stay empty in production behind a code-level fallback), WEB-PROJECT-KNOWLEDGE-MANIFEST-ONLY-01 (extraction remediated in code but production activation gated on 0064), and plugin marketplace 503s on undefined_table because 0096_plugin_registry.sql was never applied. PLAN.md's external release gates require applying and probing every unapplied migration from 0056 to the current head on production Neon before merging to main. The inverse failure has also happened: WEB-DEPLOY-SEQ-MIGRATION-AHEAD-OF-CODE-01 records migrations applied to the production DB roughly two days and 119 commits ahead of the deployed code. Billing overlap: FoundersAssistance items 11 and 12 gate top-ups and mobile IAP on unapplied 0111 and 0112.

**Done when.** Migration application is part of the deployment record (see INFRA-03) and ordered against code, so no feature ships gated on an unapplied migration and no migration lands ahead of the code that uses it.

**Where.** `apps/web/db/neon/0045_popular_searches.sql`, `apps/web/db/neon/0064_project_knowledge_extraction.sql`, `apps/web/db/neon/0096_plugin_registry.sql`, `apps/web/db/neon/0111_credit_top_up_carry.sql`, `apps/web/db/neon/0112_mobile_native_iap.sql`

**Blocked by.** Migration application on production Neon requires operator/founder execution

**From.** known-flaws.md; PLAN.md; ExecutionPlan.md; FoundersAssistance.md

**Folded in.** PROD-SEARCH-MIGRATION-0045-01; WEB-PROJECT-KNOWLEDGE-MANIFEST-ONLY-01 (migration gate); ExecutionPlan #94 plugin marketplace 503 on unapplied 0096; PLAN.md external release gate: apply 0056→head

### INFRA-24 — Nothing pages a human on a production incident because no alerting vendor is provisioned

`HIGH` · infra/ci · effort S · **in-progress**

**What.** ExecutionPlan #82: no PagerDuty, Opsgenie, Alertmanager or alert webhook exists anywhere; /api/health existed but nothing called it on a schedule and the 8 declared crons did not probe it. A health-probe cron and incident runbook were added 2026-08-09 (7aa633875), but ExecutionPlan founder item 8 records that no alerting vendor has been chosen, so there is still no rotation to page. BIZ-045 lists the billing-specific alerts that likewise have no sink (webhook lag, reconciliation drift, negative credits, duplicate grants, missing invoices, tax failure, high COGS) — that content belongs to the billing slice, but it depends on this item existing.

Also recorded by a later audit (No pager/on-call vendor wired to outage alerts, and no on-call rotation (docs/runbooks/incident-response.md)): Names the exact integration point and the two sub-gaps. 'No PagerDuty/Opsgenie/BetterStack account exists, so the alert is an email, not a page: nothing wakes anyone at 03:00 and nothing escalates if the first recipient does not acknowledge.' The wiring is already prepared: once a vendor is chosen, add its dispatch alongside the email in dispatchAlert() — the severity split and the undeliverable-is-a-failure behaviour already exist and should be reused. Second sub-gap: 'No on-call rotation. One mailbox, one person, no handoff' (apps/web/lib/support/handoff/config.ts). Both are founder actions tracked in ExecutionPlan.md §Founder.

**Done when.** A named on-call destination receives health-probe and error alerts, so a production incident reaches a human without someone happening to look.

**Where.** `apps/web/app/api/cron/health-probe/route.ts`

**Blocked by.** Founder must select and provision an alerting vendor/rotation

**From.** ExecutionPlan.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** ExecutionPlan #82 Nothing can page a human on production incidents; ExecutionPlan founder item 8 no alerting vendor chosen

### INFRA-33 — Scheduled tasks run once daily, claiming at most ten runs across the entire deployment

`HIGH` · infra/ci · effort M

**What.** GAP-P0-007: run-schedules runs once per day, claims at most ten due runs across the whole deployment per invocation, and the handler has a 60-second limit, so expired support handoffs may stay visible up to a day. VERIFIED still present — vercel.json's cron entry is "0 1 \* \* \*" and route.ts defines maxDuration = 60 and WAVE_CLAIM_LIMIT = 10, with an in-file comment acknowledging 'A single ten-row batch per day is an order of magnitude below what the tier [supports]'. SCALE-BILL-adjacent evidence from the ledger: tier quotas in billing-catalog.ts were sized for an hourly sweep (240 runs/day), so quotas exceed total cron capacity by roughly 10x — the product sells more scheduled runs than the platform can execute. ExecutionPlan #71 notes the claim query ordering also starves newer users. Root cause is INFRA-20 (Hobby plan cron cap).

Also recorded by a later audit (Scheduled-task recurrence cannot go finer than once-daily (AGENTIC-WORK-004, updates GAP-P0-007)): Partial fix landed: the sweep now drains up to 50 due runs per invocation and schedule creation honestly rejects any cadence tighter than 24h via assertDeliverableCadence (schedule-time.ts:305-411), so GAP-P0-007's 'ten runs across the entire deployment' half is closed. The architectural ceiling remains open and is now explicit product policy: vercel.json:13-50's single run-schedules cron on Vercel Hobby fires once daily, so the product structurally cannot deliver sub-daily monitoring schedules. Fix options: move run-schedules onto a durable Workflow trigger or an external scheduler (QStash/Inngest), or productize 'daily only' with honest UI copy. Refs: apps/web/app/api/cron/run-schedules/route.ts:1-94.

**Done when.** Recurring work runs on a durable queue or workflow system at the cadence the product sells, with leases, retry and backoff, a dead-letter path, per-tenant fairness and a latency SLO that is alerted on.

**Where.** `vercel.json:53-56`, `apps/web/app/api/cron/run-schedules/route.ts:19`, `packages/contracts/types/src/billing-catalog.ts:376-461`

**Blocked by.** Depends on INFRA-20 (hosting plan cron cadence)

**From.** gap-audit-2026-08-08.md; AuditRemediationLedger.md; ExecutionPlan.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** GAP-P0-007 Scheduled tasks degraded to one daily batch; ExecutionPlan #28 Scheduled-task tier quotas exceed cron capacity; ExecutionPlan #71 no requeue or continuation token; PP-21 Tasks/schedules runtime shortfall

### INFRA-36 — No guards exist for route, role, plan, magic-number or design-token literals, and the guards that do exist are unproven

`HIGH` · infra/ci · effort L

**What.** HARD-018 is now satisfied — scripts/check-no-hardcoded-endpoints.mjs exists (VERIFIED) — but its siblings do not: VERIFIED absent are scripts/check-route-literals.mjs (HARD-019), scripts/check-magic-numbers.mjs (HARD-021) and scripts/check-design-tokens.mjs (HARD-022); HARD-020 (raw role/plan/model comparisons outside canonical policy code) has no guard either. HARD-023: no positive/negative fixtures prove any checker catches a new violation and permits a legitimate declaration. SCALE-PURE-007 and SCALE-PURE-006 restate this as a class: parallel definitions of routes, roles, plans, timeouts, endpoints, prompts, shortcuts and components are not automatically detected, and nothing verifies apps consume shared contracts only through approved packages. HARD-008 names the hardest unaddressed instance: six independent 120-second deadlines exist and nothing prevents a timeout in one layer outliving or contradicting its parent deadline.

Also recorded by a later audit (apps/web's no-hardcoded-color guard (check:no-hex-web) is not wired into CI and currently fails with 4 real violations (DESIGN-SYSTEM-004)): Concrete instance of 'guards that do exist are unproven': check:no-hex-web is defined at apps/web/package.json:18 but grep across .github finds zero matches — never invoked by any workflow. Running it directly on the clean tree fails with 4 violations (2 in app/brand-assets.test.ts:21-22, 2 in app/manifest.ts:14-15 theme-color values). The equivalent guard for the Chrome extension IS wired into CI and passes clean, so the pattern to copy already exists in-repo.

Also recorded by a later audit (Mobile's no-hardcoded-color guard and its 640-entry baseline are not wired into CI despite explicit 'will fail CI' language (DESIGN-SYSTEM-005)): Second concrete instance: scripts/check-no-hex-colors-mobile.mjs is a ratchet-style guard whose baseline file (apps/mobile/scripts/.no-hex-baseline.json) has a \_description field stating 'New violations will fail CI', but grep across .github finds zero matches in any workflow. The script currently passes when run directly, so a regression tomorrow would ship undetected — a guard that looks like coverage and is not. Fix: add `pnpm check:no-hex-mobile` to whichever CI job already runs mobile lint/tests, gated on mobile-changed paths. Declared at package.json:116.

**Done when.** A guard exists for each literal class — routes, roles/plans/model IDs, magic numbers, design tokens, dependency boundaries — each proven by positive and negative fixtures, and nested timeouts are modelled as a hierarchy rather than as independent constants.

**Where.** `scripts/check-no-hardcoded-endpoints.mjs`, `scripts/check-no-hardcoded-model-ids.mjs`

**From.** AuditRemediationLedger.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** HARD-019 No route-literal guard; HARD-020 No role/plan/model-ID raw-comparison guard; HARD-021 No magic-number guard; HARD-022 No design-token guard; HARD-023 Hardcoding guard checkers themselves are unproven; HARD-008 120-second timeouts duplicated across 6 deadlines; SCALE-PURE-006 No dependency-boundary checks; SCALE-PURE-007 No duplicate-symbol/literal checks

### INFRA-41 — The skill-vetting security gate can be silently disarmed by a documentation sweep or a warm cache

`HIGH` · infra/ci · effort S

**What.** FoundersAssistance item 1: commit 7214d0c70 deleted tools/skill-vetting/README.md while pyproject.toml:9 still declares readme = "README.md", so `uv pip install` fails with OSError, verify.sh aborts under set -euo pipefail, and repo-operability.yml:188's vetting proof plus the scan-skills-with-vetting.mjs step are skipped — a security gate disarmed by deleting a documentation file. VERIFIED branch-specific: `git show chore/retire-stale-docs:tools/skill-vetting/README.md` fails while that branch's pyproject.toml still declares the readme. Item 2 compounds it: verify.sh reuses $TMPDIR/skill-vetting-venv when present, so a warm venv skips the install and the gate reports success even when the package cannot build — found only when the verifying agent deleted the venv and re-ran. The doc's own note records that check-executable-docs.mjs knows about Cargo readme and npm files[] but not hatchling readme=, so nothing in the guard chain knows this coupling exists.

**Done when.** The gate fails loudly when its package cannot build, does not reuse a cached venv in CI, and check-executable-docs.mjs understands hatchling readme= pointers the way it already understands the Cargo and npm equivalents.

**Where.** `tools/skill-vetting/pyproject.toml:9`, `tools/skill-vetting/verify.sh`, `.github/workflows/repo-operability.yml:188`, `scripts/check-executable-docs.mjs`

**From.** FoundersAssistance.md

**Folded in.** FoundersAssistance #1 Restore tools/skill-vetting/README.md; FoundersAssistance #2 Stop verify.sh reusing a cached venv; FoundersAssistance: hatchling readme= invisible coupling

### INFRA-43 — No documented backup or restore policy, and the object bucket has no versioning

`HIGH` · infra/ci · effort M

**What.** ExecutionPlan founder item 6: recovery relies on an undocumented Neon PITR window plus an object bucket with zero versioning and no lifecycle configuration, from which the media purge cron issues unconditional hard deletes. The database and object store have independent recovery points, so a restore yields rows pointing at deleted objects. This compounds DPDP O-14/§7.1's finding that restored (PITR) data is not re-erased — the compliance slice owns the erasure obligation, but the missing backup policy is the operational gap underneath it.

**Done when.** A documented backup and restore policy states the PITR window, enables bucket versioning and lifecycle rules, and defines a consistent recovery point across the database and object store.

**Blocked by.** Founder must set the PITR window, enable bucket versioning, and approve the documented policy

**From.** ExecutionPlan.md; DPDP_PROGRESS.md

### INFRA-50 — VS Code design-token CI guard is release-blocking and currently red on a color-mix() false positive

`HIGH` · infra/ci · effort S

**What.** DESIGN-SYSTEM-001. check-vscode-theme-tokens.mjs:34-36's regex flags any value not on a short allow-list; color-mix(…) starts with letters not on that list, so a fully token-driven declaration (background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated)) at webviewContent.ts:290) trips the rule. Running the script on the clean commit e15df56e3 prints FAIL, and it is invoked unconditionally in release-vscode-extension.yml:98, which triggers on the next real v-vscode-\* release tag.

**Done when.** Add color-mix( (and similar token-composing CSS functions) to the rule's negative-lookahead allow-list.

**Where.** `apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs:34-36`, `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:290`, `.github/workflows/release-vscode-extension.yml:98`

**From.** audit/parity-2026-08-15/gaps/domain-design-system.json DESIGN-SYSTEM-001; audit/parity-2026-08-15 DESIGN-SYSTEM-001; audit/parity-2026-08-15 — DESIGN-SYSTEM-001

**Folded in.** VS Code design-token CI guard is release-blocking and currently red on a color-mix() false positive

### INFRA-60 — check-agent-context.mjs does an unguarded readdirSync('.agents/skills') and throws ENOENT on a clean checkout, killing the first link of a 40-guard chain

`HIGH` · infra/ci · effort S · **unclear**

**What.** HANDOFF.md §5 trap 2: '.agents/ is entirely untracked, so it threw ENOENT on every clean checkout and killed the first link of a 40-guard && chain — while passing locally where those files exist on disk.' The source does not state whether this was subsequently fixed, so it needs re-verification against a fresh clone, not local state.

**Done when.** Guard the readdirSync call (or check .agents/skills existence first) so the script degrades gracefully on a fresh clone instead of throwing and masking the rest of the guard chain; verify against a fresh clone or CI, not the working tree.

**Where.** `check-agent-context.mjs`

**From.** docs/agent-context/HANDOFF.md §5 trap 2

### INFRA-61 — A proven client-boundary guard is parked outside the repo and 63 latent 'use client' violations remain in packages/ui/unified-chat

`HIGH` · infra/ci · effort M

**What.** HANDOFF.md §6 Open threads: the guard was 'written and proven to catch the bug that broke every marketing page, parked at scratchpad/check-client-boundaries.mjs (not in the repo). It reports 63 latent cases in packages/ui/unified-chat — components calling hooks with no 'use client'. Needs a scoping decision: enforce fatal-only and ratchet, or fix all 63 first.' Directly related to the failure mode behind INFRA-08/WEB-01.

**Done when.** Land check-client-boundaries.mjs in the repo and either fix all 63 latent cases before enforcing, or make the guard fatal-only with a shrink-only ratchet while burning down the backlog.

**Where.** `scratchpad/check-client-boundaries.mjs`, `packages/ui/unified-chat`

**Blocked by.** scoping decision: fatal-only + ratchet vs fix-all-63-first

**From.** docs/agent-context/HANDOFF.md §6

### MOB-02 — Mobile store submission is blocked on the iOS Issuer ID and Android Play Console setup

`HIGH` · mobile · effort M

**What.** apps/mobile/scripts/release/preflight.sh production now reaches the credential checks (the upstream React Native runtime mismatch that blocked it is fixed) and stops at '[err] iOS store submission requires the non-secret numeric ascAppId'. Apple Team ID, two App Store Connect API keys, an IAP key and a CSR are already on the machine, but the Issuer ID is recorded nowhere. Android needs a new Play Console app, a service account JSON and release permissions.

Also recorded by a later audit (Mobile remaining external-gated Class-1 items): Enumerates the full external-gate set blocking mobile Class-1 closure: StoreKit, HealthKit, the background-voice entitlement, the device-grants host-relay, and the connector OAuth backend — broader than MOB-02's iOS Issuer ID / Play Console framing.

**Done when.** Copy the Issuer ID from App Store Connect Integrations, run pnpm release:asc-probe for ascAppId, set it in eas.json, place the API key in apps/mobile/secrets/, and create the Play Console app and service account until release:preflight passes.

**Where.** `apps/mobile/scripts/release/preflight.sh`, `apps/mobile/eas.json`, `apps/mobile/src/features/release-state/mobileReleaseState.json`

**Blocked by.** founder: App Store Connect Issuer ID + Play Console app/service account (FoundersAssistance.md #23)

**From.** FoundersAssistance.md (#23); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

### MOB-15 — Mobile cloud sign-in and iOS launch fixes are code-only; signed-build confirmation still pending

`HIGH` · mobile · effort S · **in-progress**

**What.** Three coupled defects were fixed in code on 2026-07-18 but none has signed-build confirmation: the native Clerk AuthView close control did not reliably cross the Expo native boundary, trapping signed-out users in Cloud mode; useAuth()'s default pending-session behaviour could surface as signed-out mid-verification; and Metro's manual event-target-shim crashed the iOS dev app on launch with 'Super expression must either be null or a function' before Expo Router mounted. A related cold-start defect (Cloud mode resetting on cold start) was source-patched and also awaits a device recheck.

**Done when.** Run one signed iOS build through sign-in, dismissal, pending-session verification, cold start and launch, and record the evidence.

**Where.** `apps/mobile/app/_layout.tsx`

**Blocked by.** signed mobile build (see MOB-02)

**From.** docs/agent-context/known-flaws.md (MOB-CLOUD-SIGNIN-DISMISS-01, MOB-CLERK-PENDING-SESSION-01, MOB-IOS-WEBRTC-SHIM-01); ExecutionPlan.md (Mobile test pass 2026-08-13)

**Folded in.** MOB-CLERK-PENDING-SESSION-01; MOB-IOS-WEBRTC-SHIM-01; Cloud mode reset on cold start (source-patched, recheck pending)

### SEC-35 — The skill-vetting security gate can be silently disarmed by a documentation change, and its CI runner reuses a cached venv that hides the breakage

`HIGH` · security/supply-chain · effort M

**What.** FoundersAssistance #1 (verified still present): commit 7214d0c70 deleted tools/skill-vetting/README.md on branch chore/retire-stale-docs while pyproject.toml:9 still declares readme = "README.md"; hatchling install then fails with OSError, verify.sh aborts under `set -euo pipefail`, and the repo-operability workflow's vetting proof plus the scan-skills-with-vetting.mjs step are skipped — the gate reports nothing rather than failing. FoundersAssistance #2: verify.sh reuses $TMPDIR/skill-vetting-venv when present, so a warm venv skips the install and the gate reports success even when the package cannot build; this was found only because the verifying agent deleted the venv and re-ran. ExecutionPlan #2 records the same finding as DISMISSED on its own branch (README present there) while noting it is outstanding on chore/retire-stale-docs — the sources agree on the mechanism and differ only on which branch currently exhibits it. FoundersAssistance also records that check-executable-docs.mjs knows about Cargo `readme` and npm `files[]` but not hatchling `readme=`, so nothing in the guard chain knows this coupling exists. Compounds SEC-31: two independent ways to silence the same gate.

**Done when.** README.md is restored on chore/retire-stale-docs (git checkout 7214d0c70^ -- tools/skill-vetting/README.md), verify.sh uses a per-run TMPDIR or --no-cache in CI so the install step always executes, and check-executable-docs.mjs learns the hatchling readme= pointer the way it already knows the Cargo and npm equivalents — or the coupling is removed.

**Where.** `tools/skill-vetting/README.md`, `tools/skill-vetting/pyproject.toml:9`, `tools/skill-vetting/verify.sh`, `.github/workflows/repo-operability.yml:188`, `scripts/check-executable-docs.mjs`

**From.** FoundersAssistance.md (#1, #2, 'Not blocked but worth a decision'); ExecutionPlan.md (#2)

**Folded in.** verify.sh reuses a cached venv in CI (FoundersAssistance #2); hatchling readme= pointer is an invisible coupling not covered by the guard chain

### SEC-36 — Security static analysis and dependency advisories are not uniformly blocking; CodeQL default setup suppresses Rust analysis on PRs

`HIGH` · security · effort M · **in-progress**

**What.** gap-audit GAP-P0-005 (verified, partially remediated): CI once ran Semgrep with continue-on-error over ~41 pre-existing findings; an in-file comment dated 2026-08-09 shows it now runs `semgrep scan` directly, distinguishes a broken scanner (exit>=2, blocking) from findings (exit 1), and triaged 148 findings down to 18 accepted supply-chain-hardening items via --exclude-rule — but the job still never fails when findings>0; the count is written to $GITHUB_OUTPUT and never checked, so 'new high/critical findings block CI' is still unmet, and the file's own comment says it flips to blocking only once the remaining 18 reach zero. known-flaws RUST-DEPENDENCY-ADVISORIES-01: cargo audit is clean but `cargo deny check advisories` still exits 1 on pre-existing unmaintained/yanked crates. AuditRemediationLedger CRIT-018: Rust and JS/TS advisories, lockfile integrity, license policy and static-analysis findings are not uniformly blocking by documented severity, and shared crates excluded from Clippy are not isolated or documented. FoundersAssistance #4: GitHub CodeQL default setup is still enabled alongside the advanced config, and while it is, the advanced configuration's Rust analysis does not run on PRs — Rust findings surface only after merge. The Phase-9 stop-gate run recorded Semgrep and Rust dependency advisories as skipped rather than blocking.

Also recorded by a later audit (18 Semgrep supply-chain hardening items not landed): docs/agent-context/HANDOFF.md §6: the 18 findings are all package-manager hardening (dependabot cooldowns, pnpm/npm minimum release age, trust policy) and were deliberately not landed because they change INSTALL behaviour while production was down. Two actionable notes: they are safe to land now, and 'Once zero, add --error to the Semgrep step to make it blocking' — which is exactly SEC-36's 'not uniformly blocking' finding with a defined exit condition.

**Done when.** Semgrep fails the job on any new finding above a documented severity (not just on scanner crash), the remaining accepted exemptions carry an owner and expiry, cargo deny advisories reach exit 0 or every remaining warning is an explicitly recorded accepted risk, CodeQL default setup is disabled in repo settings so codeql.yml is the only configuration and Rust analysis runs on PRs, and every security gate's blocking status is documented in one place.

**Where.** `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `deny.toml`

**Blocked by.** Disabling CodeQL default setup requires a GitHub repo Settings change (founder/admin)

**From.** gap-audit-2026-08-08.md (GAP-P0-005); AuditRemediationLedger.md (CRIT-018, Phase-9 stop-gate); known-flaws.md (RUST-DEPENDENCY-ADVISORIES-01); FoundersAssistance.md (#4); audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** CRIT-018 Dependency/security checks are not uniformly blocking; RUST-DEPENDENCY-ADVISORIES-01 cargo deny warning-policy debt; Disable CodeQL default setup (FoundersAssistance #4)

### SEC-91 — MCP slopsquatting allow-list never loads in any packaged release build and fails open, so any npm package can be installed as an MCP server

`HIGH` · security · effort S

**What.** EXTENSIBILITY-003: install_bundle() loads mcp-allowlist.json via a CWD-relative PathBuf rather than the app's resource/config directory, and the file's own comment documents 'Absence of the file = open mode (dev).' tauri.conf.json's bundle block has no resources entry referencing it, so it is never packaged. In every shipped installer the lookup fails and the allow-list silently resolves to None — any npm package, including a typosquatted one, can be installed as an MCP server. Distinct from SEC-31/32/33/35, which concern the SkillSpector vetting gate.

**Done when.** Bundle mcp-allowlist.json as a Tauri resource, resolve its path via the app's resource-dir API, and fail closed (not open) in release builds when the file is missing.

**Where.** `apps/desktop/src-tauri/src/core/mcp/config.rs:1642-1668`, `apps/desktop/src-tauri/mcp-allowlist.json`, `apps/desktop/src-tauri/tauri.conf.json:50-86`

**From.** audit/parity-2026-08-15 EXTENSIBILITY-003; audit/parity-2026-08-15/gaps/domain-extensibility.json EXTENSIBILITY-003; audit/parity-2026-08-15/gaps/domain-extensibility (EXTENSIBILITY-003)

**Folded in.** MCP slopsquatting allow-list never loads in any packaged release build and fails open; MCP slopsquatting allow-list never loads in any packaged release build and fails open, so any typosquatted npm package can be installed as an MCP server

### TEST-13 — VS Code extension's Local/BYOK/Managed-Cloud trust-boundary regression suites are currently red (17 failing / ~845-862 passing)

`HIGH` · testing · effort S

**What.** CROSS-SURFACE-006 / red-test-suites.md §1. A real security-hardening commit (1e858a7f1) switched Config.model() to a globalValue-only read via .inspect() to stop a checked-out repo's .vscode/settings.json from silently moving a user's trust boundary. chatParticipant.test.ts and usageMeterTrustBoundary.test.ts mock only .get(), not .inspect(), so Config.model() silently falls back to 'auto' under test. 13 of 17 failures are on the trust boundary: usageMeterTrustBoundary.test.ts (6, local model reports as Local without an account lookup and re-pushes on model change), chatParticipant.test.ts (6, local-model authority, threads only start with CLI-discovered models, memory stays in distinct context boundaries), usageMeter.test.ts (1, local models treated as unbounded without fetching cloud usage). The remaining 4 (webviewContent snapshot ×3, panelPaletteConsistency ×1) are ordinary drift. Source-level review found the boundary handling itself sound — but nothing automated is defending it.

**Done when.** Update mockConfiguredModel()/configuredModel() in both test files to also stub .inspect() returning the intended globalValue; fix the 13 trust-boundary failures first, then the 4 drift failures. Add this suite to PriorityExecutionPlan.md, which currently only schedules the Desktop fix.

**Where.** `apps/extension-vscode/src/platform/config.ts:191-196`, `apps/extension-vscode/src/__tests__/chatParticipant.test.ts:64-73`, `apps/extension-vscode/src/__tests__/usageMeterTrustBoundary.test.ts:96-105`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-006; audit/parity-2026-08-15/gaps/red-test-suites.md §1; audit/parity-2026-08-15 CROSS-SURFACE-006; audit/parity-2026-08-15 gaps/red-test-suites.md §1

**Folded in.** CROSS-SURFACE-006; red-test-suites-§1; red-test-suites.md §1; VS Code extension's Local/BYOK/Managed-Cloud trust-boundary regression suite is red (17 failing / ~845-862 passing)

### UI-78 — 63 latent 'use client' boundary violations in packages/ui/unified-chat, and the guard that catches them is parked outside the repo

`HIGH` · ui · effort ?

**What.** HANDOFF.md §6 Open threads: check-client-boundaries.mjs is written and proven to catch the bug that broke every marketing page, but lives at scratchpad/check-client-boundaries.mjs and is not in the repo. It reports 63 latent cases in packages/ui/unified-chat — components calling hooks with no 'use client'. Same failure class as WEB-01/INFRA-08 (RSC barrel re-export), which is one instance of it.

**Done when.** Land the guard in the repo and take a scoping decision: enforce fatal-only with a ratchet, or fix all 63 first.

**Where.** `scratchpad/check-client-boundaries.mjs`, `packages/ui/unified-chat`

**Blocked by.** founder/eng-lead scoping decision: fatal-only+ratchet vs fix-all-63-first

**From.** docs/agent-context/HANDOFF.md §6 Open threads — client-boundary guard

### DESK-29 — Desktop optional-feature build: remote-databases does not compile, and an integration test blocks all-targets clippy

`MEDIUM` · desktop · effort M

**What.** bson 3.1 is incompatible with mongodb 3.5's BSON 2.x types; the MySQL/Postgres validators pass an extra generic argument; redis_client.rs calls get with an unsupported key-slice signature under Redis 1.1. Default-feature builds are unaffected, but remote-database support cannot be claimed. Separately, tests/mcp_integration_test.rs holds the process-wide ENV_LOCK standard mutex across three awaits, which Rust 1.94 rejects under -D clippy::await-holding-lock, so Desktop all-targets clippy cannot be called green.

**Done when.** Align the bson/mongodb versions and validator generics, fix the redis get signature, and replace ENV_LOCK with an async-aware mutex or restructure the test to drop the guard before awaiting.

**Where.** `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tests/mcp_integration_test.rs`

**From.** docs/agent-context/known-flaws.md (2026-07-17 Desktop optional-feature build gate)

**Folded in.** Desktop mcp_integration_test holds a lock across awaits, blocking all-targets strict clippy

### DESK-64 — Electron Cloud shell changes are source-only: no packaged, signed app has run the callback or update journey

`MEDIUM` · desktop · effort M

**What.** No Electron app, packaged DMG, signing/notarization job, or installed callback/update journey was run in the source-only reconciliation. Must not be described as release-verified until the signed artifact is installed and clicked through.

**Done when.** Package and sign the Electron shell, install it, and run the callback and auto-update journey end to end.

**Where.** `apps/desktop/electron`

**Blocked by.** signing credentials (see DESK-03)

**From.** ExecutionPlan.md (Electron Cloud shell source reconciliation)

### EXT-17 — VS Code extension release workflow has a single publish reference and no marketplace CI, publisher identity, Restricted Mode, remote-host, rollback or telemetry-disclosure coverage

`MEDIUM` · extension · effort L

**What.** Triaged 2026-08-09: release-vscode-extension.yml contains exactly one publish reference; marketplace CI, publisher identity, Restricted Mode / Workspace Trust behaviour, remote-host tests, update and rollback paths, and telemetry disclosure are otherwise absent. Release-workflow mechanics overlap the infra/ci slice; the extension-specific behaviours (Restricted Mode, Workspace Trust, remote hosts) are this slice's.

**Done when.** The VS Code extension has a real publish path plus tests for Restricted Mode, Workspace Trust, remote hosts, update and rollback, and a telemetry disclosure that matches what it sends.

**Where.** `.github/workflows/release-vscode-extension.yml`

**From.** AuditRemediationLedger.md (REL-005)

### INFRA-06 — CodeQL default setup is still enabled, suppressing Rust analysis on pull requests

`MEDIUM` · infra/ci · effort S

**What.** FoundersAssistance item 4: both default and advanced CodeQL setup are enabled, and while default setup is on, the advanced configuration's Rust analysis does not run on PRs — so Rust findings are only discovered after merge. Requires a GitHub repo Settings change (Code security → Code scanning → disable Default setup) so .github/workflows/codeql.yml is the only configuration.

**Done when.** CodeQL runs from one configuration that includes Rust on pull requests, so a Rust finding blocks the PR that introduced it rather than surfacing after merge.

**Where.** `.github/workflows/codeql.yml`

**Blocked by.** GitHub repository Settings → Code security (founder/admin action)

**From.** FoundersAssistance.md

### INFRA-07 — The full Rust workspace is not under one trustworthy test and lint policy

`MEDIUM` · infra/ci · effort L

**What.** GAP-P0-006: CI explicitly scopes tests and clippy to the shipped desktop and CLI packages only; numerous ported crates carry pre-existing fixture regressions and mid-port stubs; and the all-features lane sits downstream of the failing check job (see INFRA-02) so it was skipped on the audited head. Two named blockers: the remote-databases Cargo feature does not compile under strict all-features clippy (bson 3.1 incompatible with mongodb 3.5's BSON 2.x types, MySQL/Postgres validators pass an extra generic argument, redis_client.rs calls get with an unsupported key-slice signature under Redis 1.1), so remote-database support cannot be claimed; and apps/desktop/src-tauri/tests/mcp_integration_test.rs holds the process-wide ENV_LOCK standard mutex across three awaits, which Rust 1.94 rejects under -D clippy::await-holding-lock, blocking the default-feature all-targets gate. Separately, `cargo fmt --all -- --check` fails on a pre-existing diff at apps/cli/src/models/streaming.rs:578, gating the v-cli-\* release workflow.

Also recorded by a later audit (CI never runs the full Rust workspace test suite (BACKEND-RUNTIME-011)): Exact scope: the main Linux CI job runs only `cargo test -p agiworkforce-desktop --lib` and `cargo test -p agiworkforce-cli` (.github/workflows/ci.yml:396-433,929-981), citing a stale comment about '100+ crates' that Cargo.toml now records as pruned to 12 (2026-07-08). The referenced tracking issue FIX-021 does not appear in known-flaws.md, PLAN.md or CHANGELOG.md. Never-run suites include security/correctness-sensitive integration tests: crates/agiworkforce-mcp (OAuth PKCE flow) and crates/agiworkforce-protocol (SSE/JSON-RPC framing). Minimal fix: one CI step running `cargo test --workspace` (no --lib restriction) on the primary Linux runner, and update or remove the stale comment. Same defect is filed against CLI-15.

**Done when.** Every crate in the workspace is either under the blocking test and clippy policy or explicitly and visibly excluded with a reason, and the all-features and all-targets lanes both pass on a real CI run.

**Where.** `.github/workflows/ci.yml`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tests/mcp_integration_test.rs`, `apps/cli/src/models/streaming.rs:578`

**From.** gap-audit-2026-08-08.md; known-flaws.md; AuditRemediationLedger.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2); docs/current/gap-audit-2026-08-08.md (GAP-P0-006); docs/agent-context/known-flaws.md (CI-RUST-REDS-01)

**Folded in.** GAP-P0-006 Full Rust workspace is not under one trustworthy test/lint policy; Desktop optional-feature build: remote-databases feature does not compile; Desktop mcp_integration_test holds a lock across awaits; BASE-003 cargo fmt fails on apps/cli/src/models/streaming.rs; CI-RUST-REDS-01: Rust CI reds fixed locally, CI rerun still pending; The full Rust workspace is not under one trustworthy test and lint policy

### INFRA-09 — Reachability guards may still carry stale allowlist entries for a now-wired module

`MEDIUM` · infra/ci · effort S · **unclear**

**What.** BASE-003 findings 2 and 3 report that apps/desktop/src/constants/timeouts.ts is genuinely reachable (wired by be38f2cf4 into utils/ipc.ts, api/ollama.ts, api/mcp.ts and stores/chat/agentWorkflowEvents.ts) but two ratchet allowlists were never pruned, so both check:module-reachability and check:surface-reachability fail. Marked unclear because verification partially contradicts this: scripts/check-module-reachability.mjs:241 now carries the comment 'constants/timeouts.ts was here and is not any more: wave 4 pointed the...', indicating the module-reachability arm was pruned; the surface-reachability-allowlist.json arm could not be inspected in this pass.

**Done when.** Both reachability allowlists are pruned of entries for modules that are now genuinely wired, and both guards pass from a clean checkout.

**Where.** `scripts/check-module-reachability.mjs:241`, `scripts/config/surface-reachability-allowlist.json:58`

**From.** AuditRemediationLedger.md

**Folded in.** BASE-003 finding 2 check:module-reachability stale entry; BASE-003 finding 3 check:surface-reachability duplicate stale entry

### INFRA-10 — check:env-contract fails on an undocumented MODERATION_HASH_DENYLIST variable

`MEDIUM` · infra/ci · effort S

**What.** BASE-003 finding 4: apps/web/lib/moderation/hash-denylist.ts reads an env var not declared in the env contract, introduced by commit 7aa633875, so the gate is red. This is the same class as ExecutionPlan #24 (undocumented environment variables that fail silently — UPLOAD*SCAN_WEBHOOK_URL, ENCRYPTION_KEY, DESKTOP_TOKEN_SECRET in two spellings, STRIPE_PRICE_TEAM*_, CONNECTOR*OAUTH*_, RESEND_API_KEY plus 5 support vars with hardcoded defaults), which was fixed 2026-08-09 — this entry is the one that regressed after.

**Done when.** Every env var a production module reads is declared in the env contract, and the contract gate passes on the current head.

**Where.** `apps/web/lib/moderation/hash-denylist.ts`

**From.** AuditRemediationLedger.md

### INFRA-11 — check:ci-guardrails asserts vercel.json owns a rewrite that has moved to next.config.ts

`MEDIUM` · infra/ci · effort S

**What.** BASE-003 finding 5: commit 438e154d4 (MATCH-008) moved the /v1/chat/completions rewrite from vercel.json into next.config.ts, but scripts/check-ci-guardrails.mjs:473 still requires vercel.json to contain it, so pre-push is red on a stale guard rather than on a lost route. The same MATCH-008 change caused a real regression that was caught and fixed separately (see INFRA-12) — this item is only the stale-owner assertion left behind.

**Done when.** The guardrail asserts the rewrite exists at its canonical owner (next.config.ts), so a green pre-push reflects the real routing configuration.

**Where.** `scripts/check-ci-guardrails.mjs:473`, `apps/web/next.config.ts:98-99`

**From.** AuditRemediationLedger.md

### INFRA-13 — Prettier is not enforced repo-wide; 733 files fail format:check

`MEDIUM` · infra/ci · effort S

**What.** BASE-003 unwired gate: `pnpm format:check` fails on 733 files and no workflow or Claude post-save hook covers the whole repository. CLAUDE.md records that .claude/settings.json hooks auto-format saved files with Prettier, which formats what an agent touches but leaves the existing 733 untouched and unenforced in CI.

**Done when.** Formatting is enforced repo-wide in CI on a formatted baseline, so a formatting drift fails the build rather than accumulating.

**From.** AuditRemediationLedger.md

### INFRA-14 — check-no-conflict-markers.py walks the working tree instead of git ls-files, false-positiving on local artifacts

`MEDIUM` · infra/ci · effort S

**What.** BASE-003 unwired gate: 36 markers were found, all inside untracked local artifacts (tmp/uiref/agiw-full.tar and a downloaded VS Code test harness). The guard is green on a fresh CI checkout but red on any developer machine that has run the VS Code integration tests — the exact pattern that trains people to ignore a guard.

**Done when.** The guard enumerates tracked files via git ls-files, so its result is identical on CI and on a developer machine that has run the test harnesses.

**Where.** `scripts/check-no-conflict-markers.py:73-78`

**From.** AuditRemediationLedger.md

### INFRA-21 — Deployment topology is undeclared; a vestigial domain alias and two undeployed services duplicate live routes

`MEDIUM` · infra/ci · effort M

**What.** SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE: chat.agiworkforce.com has no code-level host routing and serves the homepage instead of the chat app; services/api-gateway and services/signaling-server are not deployed and cannot run on Vercel serverless under the Hobby plan, yet api-gateway's REST routes duplicate live Next.js routes — a second implementation of live behaviour with no deployment. A founder decision is pending on whether to retire api-gateway entirely or keep only its WebSocket/QR-pairing core. CAP-003 states the same gap abstractly: replica and region topology is not declared as an authoritative production object.

Also recorded by a later audit (services/api-gateway REST routes structurally duplicate apps/web's Next.js API with no clear live owner (BACKEND-RUNTIME-002 / CROSS-SURFACE-008)): Names the specific duplicated routers: agents, auth, chat, cloudChat, credits, desktop, deviceAuth, enterprise, llm, mobile, models, pair, providerStream, sync, usage (services/api-gateway/src/app.ts:5-20,140), deployed to Fly.io as of 2026-08-09. Key proof the gateway is likely unused for ordinary traffic: mobile's GATEWAY_URL default api.agiworkforce.com (apps/mobile/lib/constants.ts:18) is a Host-header rewrite onto the same Vercel deployment per apps/web/next.config.ts:94-115, not the Fly gateway. known-flaws.md:2475-2503 records this as a still-PENDING founder decision (SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE). Recommended resolution path: instrument api.agiworkforce.com and gateway.agiworkforce.com in production logs for one release cycle, then retire the unused half — either delete the gateway's duplicating routers (keeping pair/sync WebSocket + deviceAuth) or retire the Next.js routes and stop deploying Fly.

**Done when.** Deployment topology is a declared, authoritative object; every alias resolves to the surface it names, and no undeployed service carries a duplicate implementation of a live route.

**Where.** `services/api-gateway`, `services/signaling-server`, `vercel.json`

**Blocked by.** Founder decision on the fate of api-gateway and signaling-server

**From.** known-flaws.md; capability-gaps.csv; gap-audit-2026-08-08.md; audit/parity-2026-08-15 or audit/competitive-gap-2026-08-15 (wave 2)

**Folded in.** SVC-DEPLOY-TOPOLOGY-VERCEL-SINGLE; CAP-003 Declared deployment topology

### INFRA-38 — Build-graph and cache correctness are unverified, with no build budgets and unbounded module sizes

`MEDIUM` · infra/ci · effort L

**What.** SCALE-BUILD-001: Turborepo and Cargo dependency graphs are not verified to avoid skipping transitive consumers after a shared-contract change — the exact failure mode that lets a contract change ship without rebuilding its consumers. SCALE-BUILD-002: no tests prevent stale generated registry, schema or type outputs from a warm cache. SCALE-BUILD-004: there is no single model/route/schema generation pass feeding all required projections. SCALE-BUILD-005: nothing fails or warns on regressions in clean build, incremental build, bundle size, Rust binary size or release packaging. SCALE-BUILD-003 and P2-005: oversized modules are not split — apps/extension/src/side_panel.ts was recorded at ~9,359 lines and VERIFIED has since grown to 10,933, so the hotspot is worsening rather than being extracted.

**Done when.** Affected-only builds are proven to rebuild transitive consumers, cache correctness is tested, one generation pass feeds every projection, build budgets fail on regression, and the largest modules are split behind behaviour-preserving tests.

**Where.** `apps/extension/src/side_panel.ts`

**From.** AuditRemediationLedger.md; gap-audit-2026-08-08.md

**Folded in.** SCALE-BUILD-001 Affected-only build correctness unverified; SCALE-BUILD-002 No remote/local cache correctness tests; SCALE-BUILD-003 Oversized modules not split; SCALE-BUILD-004 Duplicate compilation/codegen; SCALE-BUILD-005 No tracked build budgets; P2-005 Chrome extension side_panel.ts ownership hotspot

### INFRA-39 — Asset classes are not separated and regeneration does not produce a clean diff

`MEDIUM` · infra/ci · effort M

**What.** SCALE-PURE-001: first-party, generated, vendored, build, fixture and audit asset classes are not fully separated, so metrics and searches may not exclude the correct classes — which silently corrupts every count an audit produces. SCALE-PURE-002: stale generated output and duplicate source-of-truth files are not fully removed, and regeneration may not produce a clean diff in all cases. This is why several counts across these ledgers disagree with each other (see DOCS-12).

**Done when.** Each asset class is identifiable by path convention, tooling excludes the right classes by default, and regenerating any generated artifact produces an empty diff.

**From.** AuditRemediationLedger.md

**Folded in.** SCALE-PURE-001 Asset classes not fully separated; SCALE-PURE-002 Stale generated output not fully removed

### INFRA-40 — The workflow flow-bundle can break dev and build, and nothing in CI builds it

`MEDIUM` · infra/ci · effort S

**What.** Workflow sandbox bundle fragility: the Workflow SDK's flow-bundle strip relies on swc eliding unreferenced imports, so any live non-step export in apps/web/lib/workflows/cloud-agent-workflow.ts keeps its import graph and fails the build with workflow-node-module-error. Nothing in CI builds the flow bundle, so the failure surfaces only at pnpm dev or next build time on a developer's machine, and no owner is assigned for a CI guard or lint rule.

**Done when.** CI builds the flow bundle so a non-step export fails in CI rather than on a developer's machine, or a lint rule rejects the export shape that breaks it.

**Where.** `apps/web/lib/workflows/cloud-agent-workflow.ts`

**From.** known-flaws.md

### INFRA-47 — CI failures were never classified as pre-existing versus remediation regressions

`MEDIUM` · infra/ci · effort S

**What.** BASE-004, explicitly left open: the ledger's own analysis already traces BASE-003 findings 1-6 to post-merge-base commits (be38f2cf4, 7aa633875, 438e154d4, 9f36c2d1a, c5d67f7be), but the classification task itself is unchecked — so there is no record of which red gates are inherited and which were introduced by the remediation work. BASE-001 adds the complicating context: two divergent baselines exist (audit branch chore/retire-stale-docs@7611c622b versus remediation branch @73648df8c) with 8 commits on the audit branch absent from HEAD that must be separately verified.

**Done when.** Each red gate is attributed to the commit that introduced it or marked as pre-existing at a named baseline, so remediation regressions are separable from inherited debt.

**From.** AuditRemediationLedger.md

**Folded in.** BASE-004 Failures not classified pre-existing vs regressions; BASE-001 two divergent baselines

### INFRA-59 — reference-integrity CI gate is green only against a ratcheting debt list carrying 224 undeclared references

`MEDIUM` · infra/ci · effort L

**What.** docs/adr/wire-or-cut.md Standing gates. The gate was already failing before that work (9 undeclared references); it is now green with the ratcheting debt list driven from 228 down to 224 — 224 remain outstanding, i.e. the gate certifies a debt count rather than integrity.

**Done when.** Drain the 224 remaining undeclared references and lower the ratchet each time, rather than treating a green gate at 224 as coverage.

**Where.** `scripts/check-reference-integrity`

**From.** docs/adr/wire-or-cut.md#2026-08-06 Standing gates

### MOB-16 — expo run:ios fails on a React Native codegen build-order issue, blocking the Maestro real-UI smoke

`MEDIUM` · mobile · effort S

**What.** xcodebuild exits 65 on a missing generated safeareacontext .mm file; needs expo prebuild --clean and a DerivedData reset before the Maestro smoke can run. Environmental rather than a product bug, but it blocks every real-UI verification.

**Done when.** Run expo prebuild --clean with a DerivedData reset and pin the working codegen order in the release script so it does not recur.

**Where.** `scripts/qa/maestro-dev-smoke.yaml`

**From.** docs/agent-context/known-flaws.md (MOBILE-IOS-BUILD-BLOCKED)

### MOB-18 — Mobile iOS 27 and newest-Android on-device model matrix cannot be certified without hardware

`MEDIUM` · mobile · effort M

**What.** The mobile workspace uses Expo 57 / RN 0.86 with real Apple Foundation Models and the ML Kit Prompt API over AICore, but the build machine has Xcode 26.6 only and no attached iOS 27 hardware, so physical-device certification for iOS 27 and the newest on-device model cannot honestly be claimed.

**Done when.** Install Xcode 27, run a clean Release archive on the iOS 27 SDK, validate Local Mode and prompt-quality fixtures on physical iOS 27 and Android AICore hardware, then regenerate store screenshots.

**Where.** `apps/mobile`

**Blocked by.** founder/QA: physical iOS 27 device, Xcode 27, Android AICore hardware (FoundersAssistance.md #13)

**From.** FoundersAssistance.md (#13)

### CLI-05 — cargo fmt --all --check fails on apps/cli/src/models/streaming.rs, gating the CLI release workflow

`LOW` · cli · effort S

**What.** A pre-existing formatting diff at apps/cli/src/models/streaming.rs:578 fails cargo fmt --all -- --check. It gates the v-cli-\* release workflow rather than PR CI, so it blocks releases silently. File confirmed present.

**Done when.** Run cargo fmt on the file and add the fmt check to PR CI so it cannot regress.

**Where.** `apps/cli/src/models/streaming.rs:578`

**From.** AuditRemediationLedger.md (BASE-003 unwired gate)

### CLI-10 — CLI path_security test intermittently fails under parallel execution due to shared process-global state

`LOW` · cli · effort S

**What.** validate_workspace_path_allows_registered_additional_root passes in isolation but fails under full-suite parallel execution because a sibling test mutates the shared process-global registered-roots state. Pre-existing test-infrastructure defect.

**Done when.** Scope the registered-roots state per test (or serialize the affected tests) so parallel runs are deterministic.

**Where.** `apps/cli/src (path_security tests)`

**From.** docs/agent-context/known-flaws.md (CLI-FLAKY-PATH-SECURITY-TEST)

### INFRA-42 — R2 CORS policy cannot be re-applied from the repository because no account-scoped token is stored

`LOW` · infra/ci · effort S · **in-progress**

**What.** FoundersAssistance item 21: on 2026-08-13 the private bucket had no CORS configuration at all, so every attachment upload failed at preflight — this had never worked in a browser on any origin, production included — and the public bucket was missing chat. and \*.vercel.app origins. Both buckets now carry a browser-direct-upload CORS rule, applied via the Cloudflare API and re-verified end to end. The residual gap is reproducibility: the object-scoped R2 key pair cannot call PutBucketCors (AccessDenied confirmed), so scripts/r2-apply-cors.mjs (VERIFIED present) needs an account-scoped Cloudflare API token to run unattended.

**Done when.** An account-scoped Cloudflare token is stored so the CORS policy is reproducible from the repository and drift can be detected with --check, rather than depending on a one-time manual application.

**Where.** `scripts/r2-apply-cors.mjs`

**Blocked by.** Founder must create a Cloudflare token scoped to Account · Workers R2 Storage · Edit

**From.** FoundersAssistance.md

### INFRA-46 — check:repo-organization is red on untracked root artifacts from other in-flight work

`LOW` · infra/ci · effort S

**What.** PLAN.md 2026-08-05: `pnpm check:repo-organization` fails on ten untracked root .png files created by other in-flight work. Same class as INFRA-14 — a guard whose result depends on uncommitted local state, which trains contributors to ignore it. User memory independently records that the working tree carries roughly 229 uncommitted files and that deploys and baselines must never be taken from it.

**Done when.** Repo-organization checks evaluate tracked state, so a guard's verdict is the same on CI and on a working tree carrying unrelated scratch files.

**From.** PLAN.md

### MOB-17 — Mobile jest setup lacks an expo-secure-store mock, breaking any suite touching SecureStore-backed stores

`LOW` · mobile · effort S

**What.** src/lib/time.test.ts fails independently of any product change because its module graph loads a SecureStore-backed store with no mock in jest.setup.js. Pre-existing test-infrastructure defect.

**Done when.** Add an expo-secure-store mock to apps/mobile/jest.setup.js.

**Where.** `apps/mobile/jest.setup.js`

**From.** docs/agent-context/known-flaws.md (MOBILE-TEST-INFRA-SECURESTORE)

### MOB-29 — Mobile store listing metadata contains a dangling review-notes reference and a literal founder-phone placeholder

`LOW` · mobile · effort S

**What.** LISTING-METADATA-ANDROID.json:94 still points play_console_review_notes_file at a non-existent REVIEWER-NOTES-ANDROID.md after the file was deleted without updating the JSON (the iOS equivalent was re-authored). Separately, a literal **FOUNDER_TO_FILL** placeholder remains for the contact phone in both listing metadata files — only the founder has this value and it must not be invented.

**Done when.** Re-author or drop the Android reviewer-notes reference, and have the founder supply the real contact phone number.

**Where.** `apps/mobile/store-listing/LISTING-METADATA-ANDROID.json:83,94`, `apps/mobile/store-listing/LISTING-METADATA-IOS.json`

**Blocked by.** founder must supply the contact phone number

**From.** docs/agent-context/known-flaws.md (MOBILE-STORE-LISTING-DANGLING-REFS, MOBILE-STORE-LISTING-FOUNDER-PHONE)

**Folded in.** MOBILE-STORE-LISTING-FOUNDER-PHONE

### TEST-16 — No confirmed CI gate runs both sides of the TS/Rust cloud-sync fixture-replay parity test together

`LOW` · testing · effort S · **unclear**

**What.** CROSS-SURFACE-011. packages/client/sync is the canonical TS delta-sync logic; desktop's cloud_sync.rs independently reimplements the same rules with parity nominally kept honest via shared golden fixtures replayed against both suites. Whether CI actually runs both the TS vitest suite and the Rust cfg(test) suite together on every relevant change was explicitly flagged NEEDS_VALIDATION and not confirmed. Refines TEST-05 (which states no cross-language contract tests exist) — one does exist here; the open question is whether it is gated.

**Done when.** Locate the workflow(s) running the Rust and TS suites; confirm both execute whenever either the fixtures or cloud_sync.rs change. If independent, add a path-based CI trigger requiring both to pass together.

**Where.** `packages/client/sync/src/index.ts:1-14`, `packages/client/sync/src/cursor.ts`, `apps/desktop/src-tauri/src/data/cloud_sync.rs`

**From.** audit/parity-2026-08-15/gaps/domain-cross-surface.json CROSS-SURFACE-011
