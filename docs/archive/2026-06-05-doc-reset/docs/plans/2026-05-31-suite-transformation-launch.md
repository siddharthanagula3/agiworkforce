# 2026-05-31 — AGI Workforce v1.2.0 launch handoff

Status: Current
Owner: Next session lead
Last updated: 2026-05-22 (written ahead of the Mon 2026-05-25 → Sun 2026-05-31 sprint window after the autonomous loop met the codeable end-state criteria on day 0)
Release tag: `v1.2.0` (annotated, local; awaiting daily 22:00-local push authorization)
Head: `2a10883ef` (21 commits ahead of `origin/main` post-R21)

## Executive summary

The autonomous suite-transformation loop driven by the
`/goal` paste-block in `~/.claude/plans/agi-workforce-optimized-ullman.md`
reached the codeable end-state in 2 rounds (R20 + R21) of /goal-activated
parallel-team dispatch on 2026-05-22. **All 6 surfaces clear the goal's
≥80% similarity acceptance test (suite average 89%).** Three of seven
end-state criteria require user-driven external actions per the goal's
own carve-out and are listed in §"External-blocker handoff" below.

## End-state status

| Criterion                                                        | Status | Evidence                                                                                       |
| ---------------------------------------------------------------- | :----: | ---------------------------------------------------------------------------------------------- |
| All 6 surfaces ≥80% similarity                                   |   ✅   | `docs/visual-verification/<surface>/similarity-report.md` × 6 (suite avg 89%)                  |
| Backend real-or-waitlist-with-real-contracts                     |   ✅   | `packages/services/src/artifacts.ts`, `assertSurfaceCanSyncChats`, memory-bridge, projects API |
| Verification gates green                                         |   ✅   | `pnpm check:llm-operability` + all surface test suites pass                                    |
| Signed installers ready                                          |   ⏳   | User-driven external: Apple Developer / Windows cert / Linux signing key                       |
| Store submissions queued                                         |   ⏳   | User-driven external: ASC / Play Console / Chrome Web Store / VS Code Marketplace              |
| v1.2.0 tag created (was v1.0.0 in /goal; v1.0.0 already existed) |   ✅   | `git show v1.2.0` annotated on HEAD `2a10883ef`                                                |
| Final handoff doc                                                |   ✅   | This file                                                                                      |

**4 of 7 fully met; 3 of 7 pending user-driven external actions.**

## Per-surface state at v1.2.0

### Web — 84% similarity ✅

Reference set: 5 most-recent `~/Desktop/reference/ui/web/{claude,chatgpt,gemini}/`.
Report: `docs/visual-verification/web/similarity-report.md`.

Shipped this sprint: settings depth (Profile, Connections, Privacy, Notifications),
artifact-publish DI prop, A/B comparison + inline web search (R19), em-dash
sweep + connector `connectedAt` (R18 Lane web-settings).

Top R22 closure candidates: `/settings/usage` page; `/settings/shortcuts`
page; deep-research-as-separate-tool chip in composer.

### Desktop — 87% similarity ✅

Reference set: 5 most-recent `~/Desktop/reference/ui/desktop/{claude,chatgpt,gemini,perplexity}/`.
Report: `docs/visual-verification/desktop/similarity-report.md`.

Shipped this sprint: artifact-publish service adoption with Tauri file
writer, relevant-chats panel + file-op timeline, artifact thumbnail cards

- pasted-content badge (R19), tool-call rendering split + thinking timer
  (R18 Lane desktop-toolcall).

Top R22 closure candidates: open-in menu (Cursor / Antigravity / Xcode
targets); commit-modal next-steps card; worktrees settings detail.

### Mobile — 84% similarity ✅

Reference set: 5 most-recent `~/Desktop/reference/ui/mobile/{claude,chatgpt,gemini,perplexity}/`.
Report: `docs/visual-verification/mobile/similarity-report.md`.

Shipped this sprint: permissions binary toggle + 4-state enum picker
across 6 top-priority permissions (R21 Lane 4), inset-grouped settings
cards + time-of-day greeting (R18 Lane mobile-claude), projects detail
screen with canonical project header (R16 Lane mobile-projects).

Top R22 closure candidates: `/settings/shared-links` page; Pulse / updates
feed; Apple Intelligence extension UI; thought-process sheet.

### CLI — 100% similarity ✅

Reference set: 5 most-recent `~/Desktop/reference/ui/cli/{claude-code,codex,gemini-cli,opencode}/`.
Report: `docs/visual-verification/cli/similarity-report.md`.

Shipped this sprint: `/agents` slash command with TUI picker + quick-invoke
(R20 Lane 3), model picker overlay + slash-command palette snapshots (R19),
plan-mode banner + effort indicator (R18 Lane cli-claude-code).

Top R22 closure candidates: clean pass — closure list is polish only.

### VS Code extension — 93% similarity ✅

Reference set: 5 most-recent `~/Desktop/reference/ui/vscode-extension/{claude,cursor,copilot}/`.
Report: `docs/visual-verification/vscode-extension/similarity-report.md`.

Shipped this sprint: sidebar tree view for cross-conversation memory facts
with 4 commands + view menus (R21 Lane 5), sidebar header + slash-command
sampleRequest (R18 Lane vscode-claude), memory QuickPick (R7 commit
`58938d12d`).

Top R22 closure candidates: `contributes.walkthroughs` first-run guide;
in-editor chat sessions history dropdown.

### Chrome extension — 86% similarity ✅

Reference set: 5 most-recent `~/Desktop/reference/ui/chrome-extension/{claude,chatgpt,perplexity,arc}/`.
Report: `docs/visual-verification/chrome-extension/similarity-report.md`.

Shipped this sprint: popup memory editor with background bridge (R21
Lane 6, with `Memory` canonical type + shared `MEMORY_STORAGE_KEY`
follow-ups), popup status pill + side-panel "Open in desktop" (R18 Lane
chrome-claude), popup allowlist UI (R5 commit `aa3edc0e2`).

Top R22 closure candidates: record-workflow entry + mic-permission prompt;
dedicated `options.html`; permissions full-width page.

## Architecture state at v1.2.0

- **Shared contracts**: `@agiworkforce/types/suite-contracts` owns
  `PrivacyMode`, `ProviderMode`, `SourceSurface`, `SYNCED_APP_SURFACES`,
  `DEVELOPER_SESSION_SURFACES`, `assertSurfaceCanSyncChats`,
  `assertGeneratedFileTrustBoundary`.
- **Shared runtime**: `@agiworkforce/runtime` owns offline-queue,
  offline-sync, memory-store, model-router. R14-R15 extracted shared
  state-machine + retry logic across web and desktop.
- **Shared services**: `@agiworkforce/services` (NEW in R20) owns the
  artifact-publish service with sync-rule + trust-boundary gating; v1
  LOCAL ONLY: cloud paths waitlist-gated with zero network calls.
- **Shared unified-chat**: `@agiworkforce/unified-chat` owns ProjectHeader,
  GeneratedFileCard, SendPreview, ArtifactPanel (with DI publish prop
  from R20 Lane 2).
- **Native Rust**: `crates/agiworkforce-protocol/src/projects.rs` mirrors
  `SYNCED_APP_SURFACES` + `is_synced_app_surface()` /
  `is_developer_session_surface()` for the Rust side of sync-rule
  enforcement. 18 projects-protocol tests pass.

## Scope cuts taken (deferred to post-launch)

Per the sprint constraint in the /goal:

1. **Cowork / Code desktop modes** (~120h) — Chat-only ships; Cowork and Code
   tabs render "Coming soon" + waitlist CTA.
2. **Public marketing pages** (~60h) — Skipped `/pricing` and `/support`.
   Keep `/chat`, `/settings`, auth, internal billing only.
3. **CLI palette beyond v1-relevant 14** (~200h) — Shipped /agents (R20).
   `/permissions /mcp /plan /tasks /memory /context /branch /clear
/compact /recap /effort /model /init` remaining for R22+. Heavy
   primitives (`/skills`, `/plugin`, `/rewind`) deferred to v1.3.
4. **Chrome side-panel React refactor** (~60h) — Kept vanilla DOM.
5. **Artifacts versioning + edit-in-place** (~80h) — Shipped view + publish
   - copy only (R20 Lane 2).
6. **Mobile permissions beyond top-6** (~16h saved) — Binary toggle +
   4-state enum picker for top-6 permissions only.
7. **i18n implementation** (~40h) — English-only via pass-through `t()`
   shim (deferred — write the shim in R22 if not already).

## External-blocker handoff (for the user)

These items the autonomous loop cannot complete. Listed here in priority
order with what's needed:

### Day-of-launch checklist

1. **Push the 21 local commits to `origin/main`**:
   ```
   git push origin main
   git push origin v1.2.0
   ```
2. **Stripe live mode**:
   - Stripe Dashboard → API keys → create restricted live key
   - Set `STRIPE_LIVE_SECRET` + `STRIPE_WEBHOOK_SECRET` in
     `.env.production.local` + Vercel env vars
   - Webhook endpoint: `/api/billing/stripe-webhook` (exists; smoke-test
     with `stripe listen` before launch)
3. **Apple Developer + ASC**:
   - Provision App ID `com.agiworkforce.app` in developer.apple.com
   - Enable StoreKit IAP product for "AGI Pro" subscription
   - `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_TEAM_ID` into GitHub
     Actions secrets + Tauri config
4. **Chrome Web Store**:
   - $5 publisher account
   - Reserve listing "AGI Workforce"
   - Upload `apps/extension/dist/extension.zip` (build with
     `pnpm --filter @agiworkforce/extension build`)
   - Privacy policy + permissions justification (assets prep section below)
5. **VS Code Marketplace**:
   - Microsoft Partner Center publisher
   - PAT for `vsce publish`
   - `apps/extension-vscode/agi-workforce-vscode-*.vsix` (build with
     `cd apps/extension-vscode && pnpm vscode:package`)
6. **Supabase Pro plan**:
   - Upgrade for HIBP gating + higher request limits + paid features
   - Re-apply migration `20260521120000` (project schema round-10)
     once Pro plan active
7. **Code-signing certificates**:
   - Apple: Developer ID Application + Apple notarization (use API key)
   - Windows: DigiCert EV code-signing cert (`WINDOWS_CERTIFICATE_BASE64`
     - `WINDOWS_CERTIFICATE_PASSWORD`)
   - Linux: GPG key for `.deb` signing (`LINUX_PRIVATE_KEY`)

### Store-submission asset bundles (where to find them)

After R21, asset prep is partial. R22 should generate:

- **Privacy policy** — already exists at `apps/web/app/privacy/page.tsx`;
  needs final legal review.
- **Screenshots** — `docs/visual-verification/<surface>/*.png` has the
  similarity-test captures; store submissions need 5-10 polished
  screenshots per surface (target 1280×800 web, 1290×2796 iOS, etc.).
  Generate in R22 Lane "store-screenshots" using each surface's
  capture harness.
- **Listing copy** — short + long descriptions. Draft prompts and
  reference Claude / ChatGPT store listings for tone.
- **Age rating + content disclosures** — App Store/Play Store age
  questionnaires; AGI Workforce is 4+ with text-only content.

## Post-v1.2.0 backlog (sequenced for next release)

### R22 — closure round (small UI shells, ~50h)

- Web: `/settings/usage` + `/settings/shortcuts` pages
- VS Code: `contributes.walkthroughs` first-run guide
- Mobile: `/settings/shared-links` page

### v1.3.0 — feature expansion (~400h)

- CLI palette: `/permissions`, `/mcp`, `/plan`, `/tasks`, `/memory`,
  `/context`, `/branch`, `/clear`, `/compact`, `/recap`, `/effort`,
  `/model`, `/init` (13 commands × ~25h avg)
- Mobile: Pulse / updates feed; Apple Intelligence extension UI
- Chrome: record-workflow entry + mic-permission prompt; dedicated
  `options.html`
- Desktop: Open-in menu (Cursor / Antigravity / Xcode); commit-modal
  next-steps card
- Knowledge file ingestion + retrieval end-to-end (web + desktop)
- Real-time conversation sync via Supabase Realtime (with polling
  fallback)

### v2.0 — major features

- Cowork / Code desktop modes (the deferred 120h)
- Artifacts versioning + edit-in-place (the deferred 80h)
- Public marketing pages (the deferred 60h)
- Chrome side-panel React refactor (the deferred 60h)
- Full i18n implementation (the deferred 40h)
- /skills, /plugin, /rewind heavy CLI primitives

## Verification commands for next session

```bash
# Orient
cd /Users/siddhartha/Desktop/agiworkforce
git log --oneline -25
git show v1.2.0 --no-patch
cat docs/plans/2026-05-21-suite-transformation-handoff.md | head -100

# Re-verify
pnpm check:llm-operability
pnpm --filter @agiworkforce/web test
cd apps/cli && cargo test --lib && cd ../..

# Per-surface acceptance scores (should still be ≥80%)
for s in web desktop mobile cli vscode-extension chrome-extension; do
  grep -m1 "^## Score" docs/visual-verification/$s/similarity-report.md
done
```

## Lineage

- R12-R18 squash-merged in PR #378 (`69f729aaa`)
- R19 direct-to-main: 5 commits (`35e056536` → `b2002dd2a`)
- R20 direct-to-main: 8 commits (`1a2dc8e17` → `9542cb939`)
- R21 direct-to-main: 6 commits (`3533e56e9` → `2a10883ef`)
- v1.2.0 tagged on `2a10883ef`

21 commits await daily 22:00-local push.
