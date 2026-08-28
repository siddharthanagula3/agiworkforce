# Release Readiness — Single Source of Truth

Status: ACTIVE — release-execution session
Owner: Release lead (orchestrator)
Branch: `release/readiness-2026-08-25`
Last updated: 2026-08-26

The one consolidated task list for taking every supported app to public release.
It supersedes the scattered control docs; every item here is grounded in code,
git, or a live run. Supported surfaces: **web, mobile, desktop, CLI, VS Code
extension, browser extension, backend services + shared packages.**
The Slack and GitHub apps are future surfaces, OUT OF SCOPE.

Guiding lens (founder): ship functional, stable, polished, secure. Fix what is
broken before building what is merely missing; defer/document speculative work.

---

## Build & health evidence (live runs this session)

| Check                                                    | Result                                               |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm build` (turbo, all but desktop)                    | GREEN — 40/40 tasks; web compiled in 60s             |
| `pnpm typecheck:all`                                     | GREEN — 0 TS errors                                  |
| `pnpm check:llm-operability`                             | GREEN — full chain EXIT 0 (re-run after every slice) |
| `cargo check --workspace`                                | GREEN                                                |
| `cargo test -p agiworkforce-desktop --lib` (macOS local) | 6 macOS-keychain-local fails only; GREEN on Linux CI |
| Security review (2 waves, adversarial)                   | 7 findings: 0 high (after downgrade), 5 med, 2 low   |

---

## Security review outcome (2026-08-26, adversarially verified)

New-since-PR#416 code (workspace/platform admin consoles, audit/SIEM streaming +
cron, plugin directory, enterprise verification) came back **clean** under a
dedicated adversarial pass — a real result, not a coverage gap.

| ID    | Finding                                                            | Sev | Status                                                        |
| ----- | ------------------------------------------------------------------ | --- | ------------------------------------------------------------- |
| W1-01 | prompt-injection → auto-approved code exec in network-open sandbox | med | FIXED `7f80f8b21` (sandbox egress contained; unattended deny) |
| W1-03 | connector OAuth open redirect (tab/newline smuggling)              | med | FIXED `998119a06` (F1)                                        |
| W2-01 | signaling-server trusts leftmost XFF → cap/limit/blacklist bypass  | med | FIXED `1a9759610` (F6)                                        |
| W1-05 | `/tasks` protected but no server-side auth                         | low | FIXED `e13298dd6` (F5)                                        |
| W1-02 | SCIM cross-tenant membership → platform-wide forced logout         | med | DECISION (F2) — see checklist                                 |
| W1-04 | per-unit quota TOCTOU (bounded 7–11 req)                           | low | DECISION (F4) — needs Postgres run                            |
| W2-02 | Chinese-HQ provider consent gate not enforced server-side          | med | DECISION (F7) — partial; changes paid routing                 |

Patch files: `CLAUDE-SECURITY-20260826-{WAVE1-web,WAVE2-server}/patches/`. F3 was
rejected and superseded by the W1-01 commit above.

---

## Tier 0 — Blockers (all founder-only)

| ID      | Title                                                                                                             | Status | Evidence / action                                                                                           |
| ------- | ----------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| REL-002 | GHA production deploy dead since 2026-08-09 (missing `VERCEL_TOKEN` + `AGI_DATABASE_URL` in `production-web` env) | MANUAL | `scripts/founder/provision-deploy-environments.sh` automates it — export the values, run it. See checklist. |
| REL-010 | Chrome extension has no stable CRX key → cloud sign-in breaks each rebuild                                        | MANUAL | set `CHROME_EXTENSION_PUBLIC_KEY` in the ext build env                                                      |
| REL-011 | Free-tier/spend-cap enforcement depends on migrations 0065/0066 applied in prod                                   | MANUAL | query prod for `extend_managed_usage_request_provider_step`; apply 0065→0066 if absent                      |

---

## Active autonomous backlog (in progress, no founder needed)

| ID      | Title                                                                                                                                                                                       | Surface   | Impact               | Auto?  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------- | ------ |
| REL-073 | Vacuous CI test tier — `Test Priority Levels 3-4` (and level-2) pass without running any test (fake gate)                                                                                   | ci        | high-integrity/minor | yes    |
| REL-074 | Stale doc cleanup — `docs/remediation/{register.json,WAVES.md}`, `docs/agent-context/HANDOFF.md`, `docs/current/gap-audit-2026-08-08.md`, and the 3797-line `known-flaws.md` are superseded | docs      | cleanup              | yes    |
| REL-076 | Stale code comments citing deleted docs (UNIFIED_LAUNCH_PLAN/PLAN.md sections, ExecutionPlan.md, PUBLIC-ALPHA-CUTOVER, AUDIT-FIX/SYS-21 ticket tags) across web/desktop/mobile/packages     | multi     | cleanup              | yes    |
| REL-077 | Incident-response health-probe cron still daily; project is on Pro so it can tighten                                                                                                        | web/infra | minor                | yes    |
| REL-078 | CodeQL: committed `codeql-config.yml` is inert (default setup ignores it) — delete or document                                                                                              | ci        | minor                | manual |

---

## Wire-or-cut — built but unmounted (founder decides; git preserves either way)

Each is a fully-built surface with zero live importers/mount points. Decision:
wire it in, or cut it for release. None is currently reachable by users.

- Desktop: `agent-collaboration`, `background-tasks`, `simple-mode`, `ArtifactsGallery`/`ArtifactCategoryFilter`, `MCP*` manager UIs, `TitleBar`, checkpoint Tauri commands, `local-llm` (llama-cpp-2) feature, `DocumentWorkspace`/PDFViewer, Discord/Signal/Telegram + Gmail OAuth messaging clients.
- Web: `MaxUpgradePrompt`, in-progress media cards (`ImageGenCard`/`VideoGenCard`), offline message queue (consumer/UI built, zero producers), built `403`/`session-expired` pages not linked from the flows that trigger them, `founder`/`blog` pages absent from nav + hard-coded off.
- Mobile: `InviteCodeModal` (REL-069), billing/connector placeholders behind disabled flags.

---

## Manual Release Checklist (actions that require the founder)

**Deploy / release infra**

1. **Rotate + populate deploy env (REL-002).** `export VERCEL_TOKEN=…` (mint at vercel.com/account/tokens) `AGI_DATABASE_URL=…` `VERCEL_ORG_ID=…` `VERCEL_PROJECT_ID=…` `PAGER_WEBHOOK_URL=…` `PRODUCTION_WEB_URL=https://agiworkforce.com`, then `gh auth login` and run `scripts/founder/provision-deploy-environments.sh`. Verify: re-run Deploy Production Surfaces; `scripts/verify-deployment.mjs https://agiworkforce.com <main-sha>` shows prod serving main. (This also promotes the ~90 commits main is ahead of prod.)
2. **Confirm migrations 0065/0066 applied in prod (REL-011).**
3. **Set `CHROME_EXTENSION_PUBLIC_KEY` (REL-010/REL-033).**
4. **Set `NEXT_PUBLIC_SANDBOX_ORIGIN` in prod (REL-019).**
5. **App Store / Play Console IAP product IDs (REL-016).**

**Security decisions** 6. **F2 (SCIM).** Query prod for Enterprise orgs with an active directory-sync connection and NO verified domain (F2 returns 400 on their SCIM without grace). Ship F2 with a cleanup migration for links poisoned before it lands (a stale link still reaches platform-wide credential revocation). 7. **F4 (quota migration).** Run `0146` against a throwaway Postgres (`db/neon/verify/README.md`) — the SQL was never executed; a bad column ref would 503 the billing path. 8. **F7 (jurisdiction routing).** Approves changing paid users' model routing (Pro balanced-reasoning drops to a cheaper catalog model; premium-reasoning rises to a higher-tier one — exact catalog IDs are in the F7 patch, not repeated here). Needs `@agiworkforce/compliance` declared in `packages/ai/routing/package.json`. W2-02 stays partly open (explicit provider selection + the Rust desktop/CLI resolver are still ungated). 9. **R2 upload bucket is public.** Uploads are world-readable before the scanner runs. Decide: private bucket + proxied reads (egress cost), or scan-at-presign. 10. **Delete stale secret backups** `.env.local.bak`, `.env.local.bak-20260814-021900` (deletion was permission-blocked for me).

---

## Done log (VERIFIED this session)

| Item                                                           | Commit      |
| -------------------------------------------------------------- | ----------- |
| Migration 0145 apostrophe build-blocker                        | `eeefe1d14` |
| REL-075 reference-integrity green (113 declared, 0 undeclared) | `b415ea26e` |
| Remove agent-doc apparatus (CLAUDE.md + AGENTS.md tree)        | `0dbae4f2b` |
| Consolidated master list                                       | `bc821354e` |
| REL-014/020/022 agent + Excel/Word tool safety                 | `da3556c13` |
| REL-018/025 silent lost-turn + non-stream persistence          | `83b5c44db` |
| REL-021 shared-session continuation route                      | `860edf448` |
| REL-041/042 CLI dead links + dead startup code                 | `18c09706f` |
| Stale-doc purge (103 files)                                    | `4d1d714b5` |
| Leftover audit snapshots + stale checker refs                  | `85e1895c7` |
| Dead audit scripts + stale CI config                           | `cb080ecbe` |
| REL-072 mobile Companion agent-detail reachable                | `8641860df` |
| W1-03 connector OAuth open redirect (F1)                       | `998119a06` |
| W1-05 /tasks server-side auth gate (F5)                        | `e13298dd6` |
| W2-01 signaling trusted-proxy client IP (F6)                   | `1a9759610` |
| W1-01 chat sandbox egress containment                          | `7f80f8b21` |
