# Release Readiness — Single Source of Truth

Status: ACTIVE — release-execution session
Owner: Release lead (orchestrator)
Branch: `release/readiness-2026-08-25`
Last updated: 2026-08-25

This file is the **one** consolidated task list for taking every supported app to
public release. It supersedes the scattered control docs (PLAN.md, CHANGELOG.md,
ExecutionPlan.md, FoundersAssistance.md, docs/agent-context/known-flaws.md, and
the audit/parity markdown). Those are treated as stale leads only; every item
here is grounded in code, git, or a live run — not in a doc claim.

Supported release surfaces: **web, mobile, desktop, CLI, VS Code extension,
browser extension, backend services + shared packages.** `apps/slack-app` and
`apps/github-app` are future surfaces and are OUT OF SCOPE for this release.

Statuses: `TODO` `INVESTIGATING` `BLOCKED` `IMPLEMENTING` `FIXED` `VERIFIED`
`MANUAL` `NOT_APPLICABLE`. Once an item is `VERIFIED` it moves to the Done log.

Guiding lens (founder directive): ship functional, stable, polished, secure.
Fix what is **broken** (crashes, data loss, dead controls, security, false
success) before building what is merely **missing**. Do not chase speculative
architecture or unadvertised features; defer/document those.

---

## Build & health evidence (live runs, this session)

| Check                                                    | Result                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm build` (turbo, all but desktop)                    | GREEN — 40/40 tasks; web compiled in 60s                                     |
| `pnpm typecheck:all`                                     | GREEN — 0 TS errors                                                          |
| `pnpm check:llm-operability`                             | GREEN — 42 checks EXIT 0                                                     |
| `cargo check --workspace`                                | GREEN — 0 warnings                                                           |
| `cargo test -p agiworkforce-desktop --lib` (macOS local) | 5124 pass / 6 fail — all 6 macOS-keychain-local (REL-005); GREEN on Linux CI |
| CI rust lane (last executed, commit `22654e949`)         | success                                                                      |

---

## Gather status (inputs consolidated)

| Stream                         | State                                               |
| ------------------------------ | --------------------------------------------------- |
| Static health battery          | DONE — all green                                    |
| CI failure triage              | DONE — REL-001 root cause fixed                     |
| Deploy pipeline triage         | DONE — REL-002 MANUAL blocker                       |
| Turbo build (all but desktop)  | DONE — 40/40 green                                  |
| Desktop crate tests            | DONE — 6 macOS-local fails (REL-005)                |
| Stale-purge discovery          | DONE — purge wave pending                           |
| Release-gather (6 code scouts) | DONE — 61 findings folded in below                  |
| Security scan (adversarial)    | RUNNING — findings fold in on completion            |
| Machine trackers reconciled    | DONE — folded into gather (REL-065/066 corrections) |

---

## Tier 0 — Blockers (must clear before public release)

| ID      | Title                                                                                                                                                                       | Surface        | Sev  | Status        | Auto?  | Evidence                                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ---- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REL-001 | Migration 0145 unescaped apostrophe aborts every CI DB-prep step                                                                                                            | web/db         | crit | FIXED         | yes    | `apps/web/db/neon/0145_web_pack_example_prompts.sql`; committed `eeefe1d14`, verified by full-chain SQL lexer                                                     |
| REL-002 | GitHub-Actions production deploy dead since 2026-08-09 (invalid `VERCEL_TOKEN` in `production-web` env). Absorbs the "deploy pipeline cannot auth to Vercel" gather finding | release-infra  | crit | MANUAL        | no     | `vercel pull` → "Could not retrieve Project Settings"; 5/200 runs green, last 2026-08-09; same pull succeeds with founder local login                             |
| REL-010 | Chrome extension ships without a stable CRX key → production Clerk cloud sign-in breaks on every rebuild                                                                    | apps/extension | high | MANUAL        | no     | `apps/extension/scripts/manifest-config.mjs:130-152` only warns when `CHROME_EXTENSION_PUBLIC_KEY` unset; unstable extension ID rotates the OAuth origin          |
| REL-011 | Free-tier daily budget + managed rolling spend-cap depend on migrations 0065/0066 being applied in prod — financial exposure if not                                         | web/billing    | high | INVESTIGATING | manual | `apps/web/db/neon/0065_free_daily_usage_budget.sql`, `0066_managed_usage_rolling_caps.sql`; reservation path inactive until both applied. Needs prod schema check |

---

## Tier 1 — Major (ship-degraded; fix before or immediately at launch)

| ID      | Title                                                                                                                    | Surface        | Sev  | Status | Auto?  | Evidence                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------ | -------------- | ---- | ------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| REL-025 | Non-streaming chat completions never persist the assistant turn to `web_messages` (silent history loss for stream:false) | web/api        | med  | FIXED  | yes    | non-stream path now persists via the same upsert helper; committed `83b5c44db`, 151 web tests pass                                  |
| REL-020 | Excel edit tool silently no-ops DeleteRow/DeleteColumn/InsertColumn/UpdateStyle while reporting success                  | desktop        | high | FIXED  | yes    | `edit_excel.rs`/`edit_word.rs` unsupported ops now return Err (was false success); committed `da3556c13`, 34/34 tests               |
| REL-014 | Subagent spawn has no recursion depth limit — nested task-tool calls can spawn unbounded subagent trees                  | cli/core-agent | high | FIXED  | yes    | MAX_SUBAGENT_DEPTH=3 threaded through spawn path; committed `da3556c13`                                                             |
| REL-022 | No safety limit on subagent/task decomposition fan-out or size                                                           | core-agent     | med  | FIXED  | yes    | MAX_DECOMPOSED_SUBTASKS=64 reject-at-parse; committed `da3556c13`                                                                   |
| REL-021 | Shared-session viewer "Open in AGI" link is a dead end — no continuation of the shared chat                              | apps/web       | med  | TODO   | yes    | `apps/web/features/chat/components/share/SharedSessionViewer.tsx:~61` Link href="/" drops shared context                            |
| REL-018 | Managed-cloud turns can silently drop with no assistant reply and no failure UI                                          | web/chat       | high | FIXED  | yes    | server failure-marker + chrome msg identity + extension error-sync + client retry UI; committed `83b5c44db`, adversarially verified |
| REL-019 | Cross-origin artifact sandbox degrades to same-origin srcDoc in prod when `NEXT_PUBLIC_SANDBOX_ORIGIN` unset             | web/security   | high | MANUAL | manual | `lib/validate-env.ts:346-356` warns; weakens artifact isolation boundary. Needs prod env var                                        |
| REL-015 | Spawned subagents inherit parent's full permission mode with no independent tool scoping                                 | cli/core-agent | high | TODO   | no     | `apps/cli/src/subagent.rs:~509-513` copies skip_permissions to child                                                                |
| REL-013 | CLI plugin marketplace registry backend does not exist — search/browse returns empty with no error surfaced              | apps/cli       | high | TODO   | manual | `apps/cli/src/marketplace.rs:135` hardcodes registry URL with no deployment                                                         |
| REL-017 | Desktop Mobile Companion pairing calls a REST endpoint deleted with the Express api-gateway — feature dead               | apps/desktop   | high | TODO   | no     | `apps/desktop/src/api/config.ts:15-26` STB-8: gateway base removed                                                                  |
| REL-016 | Mobile native IAP path fully wired but disabled by unset store product IDs (config, not unbuilt)                         | apps/mobile    | high | MANUAL | manual | store product IDs unset; needs App Store / Play Console product setup                                                               |
| REL-023 | No self-update / version-check path in the CLI                                                                           | apps/cli       | med  | TODO   | yes    | `apps/cli/src/lib.rs` Command enum has no self-update                                                                               |
| REL-024 | No per-file undo for agent-made edits in the CLI (only whole-conversation rewind)                                        | apps/cli       | med  | TODO   | yes    | file-edit tools keep no pre-edit backup                                                                                             |

---

## Tier 2 — Minor (polish/cleanup; do not block launch)

| ID      | Title                                                                                              | Surface             | Sev | Status | Auto?  |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------- | --- | ------ | ------ |
| REL-026 | VS Code telemetry endpoint domain has no deployment — opt-in telemetry silently no-ops             | vscode-ext          | med | TODO   | manual |
| REL-027 | VS Code advertises `checkpoints: false` — no checkpoint/restore UI                                 | ide-ext             | med | TODO   | no     |
| REL-028 | Enterprise admin console shows compile-time default policy, not the org's saved policy             | apps/web            | med | TODO   | no     |
| REL-029 | No Windows sandbox isolation adapter — AppContainer probe diagnostic-only                          | permissions         | med | TODO   | no     |
| REL-030 | No PII detection/redaction scanner over free-form content                                          | safety              | med | TODO   | no     |
| REL-031 | No background/detached execution for long-running commands or subagents                            | cli/core-agent      | med | TODO   | no     |
| REL-032 | Hardcoded-provider-endpoint migration still incomplete across 10 files                             | desktop/cli/web     | med | TODO   | yes    |
| REL-033 | Chrome Web Store packaging ships unstable ID unless public key set (pairs with REL-010)            | apps/extension      | med | TODO   | manual |
| REL-034 | PATCH /api/me accepts unbounded/unrestricted avatar_url, bypassing presign controls                | web/api             | med | TODO   | yes    |
| REL-035 | Cloud-web invoke() shim fabricates success for most non-chat commands                              | desktop             | med | TODO   | manual |
| REL-036 | TLS cert pinning ships placeholder hashes, enforcement off                                         | mobile              | med | TODO   | manual |
| REL-037 | Remote device revocation unimplemented; only local sign-out                                        | desktop             | med | TODO   | no     |
| REL-038 | Orphaned unified-chat components (SettingsShell, CommandPalette, CheckpointManager)                | ui/unified-chat     | med | TODO   | manual |
| REL-039 | data-layer multi-provider factory used only for Database; Auth/Storage/Realtime unused throw-stubs | platform/data-layer | med | TODO   | manual |
| REL-040 | VS Code Marketplace description drifted to 'cloud-only' while BYOK still ships                     | vscode-ext          | low | TODO   | no     |
| REL-041 | Two doc links in shipped CLI UX point at undeployed subdomains (fixed `18c09706f`)                 | apps/cli            | low | FIXED  | yes    |
| REL-042 | Dead Hobby-tier quota-banner path in CLI startup hits unproven endpoint (fixed `18c09706f`)        | apps/cli            | low | FIXED  | yes    |
| REL-043 | Chrome content-script protocol guard doesn't special-case PDFs                                     | chrome-ext          | low | TODO   | yes    |
| REL-044 | Artifact panel has no inline/targeted edit — full replace only                                     | apps/web            | low | TODO   | no     |
| REL-045 | No cross-tab chat state sync on web                                                                | apps/web            | low | TODO   | yes    |
| REL-046 | No web service worker / browser push notifications                                                 | apps/web            | low | TODO   | yes    |
| REL-047 | First-party SAML runtime absent; admin route stores IdP metadata only                              | auth                | low | TODO   | no     |
| REL-048 | SCIM pre-existing-user link-timing gap (linked on next write, not at enable)                       | auth                | low | TODO   | no     |
| REL-049 | No passkey/WebAuthn support on any surface                                                         | auth                | low | TODO   | no     |
| REL-050 | Mobile has no force-upgrade / min-version prompt                                                   | apps/mobile         | low | TODO   | yes    |
| REL-051 | No OS home/lock-screen widget or Live Activity on mobile                                           | apps/mobile         | low | TODO   | no     |
| REL-052 | No JetBrains plugin exists                                                                         | ide-ext             | low | TODO   | no     |
| REL-053 | VS Code extension relies on bare `agi` PATH lookup, doesn't bundle CLI                             | ide-ext             | low | TODO   | yes    |
| REL-054 | MCP server-declared `instructions` field not parsed/surfaced                                       | tools/mcp           | low | TODO   | yes    |
| REL-055 | No MCP Apps (embedded UI) host — tool `_meta.ui.resourceUri` not rendered                          | tools/mcp           | low | TODO   | no     |
| REL-056 | No skill frontmatter glob-pattern matching in any skill loader                                     | extensibility       | low | TODO   | yes    |
| REL-057 | Plugin discovery resolves from raw cwd, never walks to git/worktree root                           | extensibility       | low | TODO   | yes    |
| REL-058 | Memory files have no @path import expansion                                                        | extensibility       | low | TODO   | yes    |
| REL-059 | No AWS Bedrock / GCP Vertex provider adapters                                                      | apps/cli            | low | TODO   | no     |
| REL-060 | Org-wide model-restriction policy exists in types but no runtime enforces it                       | permissions         | low | TODO   | no     |
| REL-061 | Mobile Android versionCode / iOS buildNumber are stale placeholders                                | apps/mobile         | low | TODO   | manual |
| REL-062 | Desktop CSP connect-src hardcodes raw Fly.io signaling hostname                                    | desktop             | low | TODO   | yes    |
| REL-063 | System TTS has no working implementation outside macOS                                             | desktop             | low | TODO   | manual |
| REL-064 | Shared ModelType contract has no 'realtime' member (blocks duplex voice models)                    | contracts/types     | low | TODO   | no     |

---

## Tier 3 — Deferred / informational / tracker corrections (not release work)

| ID      | Note                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REL-003 | Production serving commit 83 behind main — resolves automatically once REL-002 token rotated                                                                                  |
| REL-005 | Desktop lib tests: 6 macOS-keychain-local failures (`mcp_oauth`, `reflection`); GREEN on Linux CI, real app unaffected. Low-priority test-portability item, not a product bug |
| REL-065 | Org-level project sharing IS implemented — inventory "missing" verdict is stale (correct the tracker)                                                                         |
| REL-066 | Desktop single-instance lock IS implemented — inventory "missing" verdict is stale (correct the tracker)                                                                      |
| REL-067 | Lovable workflow-migration is backend+client-wired but has no UI entry point — product decision: wire or cut                                                                  |
| REL-068 | ~34 Zustand stores carry an unfinished migrate-to-client-runtime TODO — deliberate architecture migration, not release work                                                   |
| REL-069 | Dead cloud waitlist / invite-code UI never wired into any screen — delete or wire                                                                                             |
| REL-070 | Raw Postgres adapter is a documented, gated throw-only skeleton — informational                                                                                               |
| REL-004 | Stale agent-doc apparatus removed (committed `0dbae4f2b`)                                                                                                                     |

---

## Manual Release Checklist (actions that require the founder)

1. **Rotate the Vercel deploy token (REL-002).** Vercel dashboard → create a
   token scoped to team `siddharthanagula4`
   (`team_QAqU2q6NTV4xxn971rfTy1F4`); GitHub repo → Settings → Environments →
   `production-web` → update secret `VERCEL_TOKEN`. Unblocks REL-002, REL-003,
   and the deploy-all-apps step. Verify: re-run Deploy Production Surfaces;
   `scripts/verify-deployment.mjs https://agiworkforce.com <main-sha>` should
   report production serving main.
2. **Confirm migrations 0065/0066 applied in production (REL-011).** Query prod
   Neon for the function `extend_managed_usage_request_provider_step` and the
   free-daily-budget tables. If absent, apply `0065` then `0066` (in order).
   Unblocks: server-side spend ceilings for the publicly-open managed cloud.
   Verify: one request past the free daily cap and one past a rolling window
   both fail closed.
3. **Set a stable Chrome extension public key (REL-010 / REL-033).** Provide
   `CHROME_EXTENSION_PUBLIC_KEY` (base64 DER RSA public key from the CWS
   listing) to the extension build env so the extension ID — and thus the Clerk
   OAuth origin — is stable across rebuilds. Verify: rebuild twice, confirm the
   ID is identical and cloud sign-in works.
4. **Set `NEXT_PUBLIC_SANDBOX_ORIGIN` in production (REL-019).** Point it at the
   provisioned sandbox origin so artifact HTML/JS renders cross-origin, not
   same-origin srcDoc. Verify: production artifact iframe loads from the
   distinct origin.
5. **App Store / Play Console product IDs for mobile IAP (REL-016).** The native
   purchase path is wired but inert until store product IDs are configured.

---

## Done log (VERIFIED — kept for traceability)

_(empty until first items are verified end-to-end)_
