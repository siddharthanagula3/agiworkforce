# R26-PARITY Master Synthesis

**Date:** 2026-05-22
**Auditor:** team-lead (supervisor) — code-centric Wave 2 synthesis
**Round:** R26-PARITY (10 surface/runtime lanes + 1 visual lane = 11 reports)
**Methodology:** Code-centric per user directive 2026-05-22 — verification via source reading + static analysis + (one lane) Playwright + curl probes. NO simulators, NO computer-use. Findings only reachable by running the app are tagged `NEEDS_USER_MANUAL_TEST`.
**Output:** This synthesis. No implementation lanes spawned. Implementation phase is **proposed** at §11; awaits user OK.

---

## TL;DR

**Headline finding (empirically verified):** The installed `/Applications/AGI Workforce.app` (binary mtime 2026-04-29) cold-boots into a permanent loading skeleton on the audit machine — never advances to a usable surface in ≥10 minutes of observation. Root cause is **not** a React mount failure: it is a missing `Promise.race([init, timeout])` + error-state UI in the boot sequence, awaiting provider-status from `localhost:11434` (Ollama) and `localhost:9999` (hardcoded in `desktop-core-Bct2rNh5.js`), both of which `curl` confirmed unreachable at audit time. Every other "broken" finding below is code-inferred; this one is runtime-confirmed.

**Production blockers (ranked by severity tier):**

1. **R-DESKTOP-001** — Desktop boot hang (runtime-confirmed, two unreachable localhost endpoints, no timeout fallback). Single biggest user-facing fix.
2. **W2a PRO-00A** — Local-only desktop users cannot send messages (`TauriRuntime.getCurrentUserId()` returns `''` when no Supabase session; `conversation.rs:35-41` hard-rejects empty user_id; `TauriRuntime.ts:182` throws "Please sign in to send messages.").
3. **W2a PRO-00B** — Desktop file attachments fail silently (frontend calls `invoke('upload_file', ...)` at `TauriRuntime.ts:524` but only `browser_upload_file` is registered in `lib.rs:1394`).
4. **W3 mobile model download stub** — `onboarding.tsx:231-247` runs a `setInterval` fake progress bar, then `finishOnboarding()` without fetching any model file. M1 alpha blocker.
5. **W3 mobile StoreKit IAP wrong** — `billing/index.tsx` `handleUpgrade` opens a web Stripe checkout via `openExternalUrl`; no `expo-in-app-purchases`/`react-native-purchases`. App Store submission blocker (M3).
6. **W1 web — new-signup 403 in /chat** — `WebChatPage.tsx` renders unconditionally; `auth-gate.ts:89-105` returns HTTP 403 `subscription_required` on first send. No waitlist redirect.
7. **W4 CLI — 9 hook events defined but no fire site** — `UserPromptSubmit`, `AfterMessage`, `PlanModeChanged`, `PermissionRequest`, `Notification`, `Stop`, `WebhookReceived`, `FileChanged`, `DaemonStopped` are dead code at runtime. `UserPromptSubmit` is the most-used Claude Code hook.

**Lock violations / drift (numbered):**

1. **R-WEB §3.2** — `SurfaceShowcase.tsx:63` hardcodes `Claude Opus 4`, a model ID that does not exist in `packages/types/src/models.json`. Hard violation of `rule-models-json-canonical.md`.
2. **R-WEB §3.3** — `marketing-constants.ts:20-25` `MARKETING_MODEL_PILLS` ships `gpt-5.4` while catalog default is `gpt-5.5`. Catalog drift.
3. **R-DESKTOP §3** — Installed binary `settings.json` ships `defaultProvider: "managed_cloud"` and `ollama: "llama4-maverick"` — both contradict `v1-local-only-cloud-waitlist-2026-05-18.md` and `v1-model-selection-final-2026-05-18.md`. **Caveat:** binary predates both locks by 19 days; most likely "rebuild + reinstall" not "patch main".
4. **R-DESKTOP §3** — Bundle still exports `cloud_get_conversations`, `cloud_create_conversation`, `listCloudConversations`, `handleCloudWebCommand` — full cloud IPC plumbing present. Same caveat.
5. **W4 lock drift** — `apps/cli/src/features/hooks/hooks.rs:74-134` defines 22 `HookEvent` variants; AGENTS.md / system prompt assert "19 canonical hook events." Lock vs code disagree by 3.
6. **R-DESKTOP §3** — `Info.plist` `CFBundleDisplayName = "AGI Workforce"` + menu bar "AGI Workforce" contradicts `brand-agi-2026-05-15.md` public brand = "AGI". Predates lock; needs product decision (rename binary or update lock).
7. **W6 VSCODE-06** — Recommendation proposes Local/Cloud tab scaffolding in v1; flagged by W6 author as needing supervisor clearance against `v1-local-only-cloud-waitlist-2026-05-18.md` even though purely additive.

**Total ranked recommendations:** 11 reports produced ~120 numbered recs (44 P0, 56 P1, 20+ P2). Ranked unified P0 backlog at §10 retains the 22 highest-impact items.

---

## §1. Layer 1 — Visual gaps (what user SEES is different from Claude)

V-WEB-VISUAL lane is the primary L1 source. Where mobile / desktop UI gaps were already cited by W2a/W2b/W3, they're folded in here. Token-based fixes only — no hex literals.

### P0 — first-impression / trust impact

| ID              | Surface             | Claude ref                                                                                                                    | Our path:line                                                     | Gap                                                                              | Token-based fix                                                                                                                                         | Est   | NEEDS_USER_MANUAL_TEST?                       |
| --------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --------------------------------------------- |
| V-WEB-VISUAL-01 | web `/login`        | `claude-auth/2026-05-15/030_claude-auth_logged-out_signin-entry.png`                                                          | `apps/web/app/login/page.tsx`                                     | No right-pane marketing preview; sans H1 instead of serif                        | Add right-pane reusing `AgiChatDemo`; bind H1 to `--font-heading` (`--font-newsreader`)                                                                 | 6-8h  | no                                            |
| V-WEB-VISUAL-02 | web `/pricing`      | `claude-public/2026-05-15/011_claude-support_choose-plan_table.png` + live `014_claude-live_pricing_team-enterprise_full.png` | `apps/web/app/pricing/page.tsx`                                   | No bottom feature-comparison matrix                                              | Drive rows from `BILLING_PLAN_PRICING` + new `MARKETING_FEATURE_MATRIX`; cells use shadcn semantic tokens                                               | 6-8h  | no                                            |
| V-WEB-VISUAL-03 | web `/providers`    | `claude-public/2026-05-15/015_claude-public_pricing_api_latest-models.png`                                                    | `apps/web/app/providers/page.tsx`                                 | No `$/MTok` pricing rendered anywhere                                            | Render from `packages/types/src/models.json` `defaultPricing.inputPerMillion` / `outputPerMillion`; chips use `--color-warm-peach-500` token            | 3-4h  | no                                            |
| V-WEB-VISUAL-04 | web `/projects`     | (no Claude equiv — Claude gates this surface)                                                                                 | `apps/web/app/projects/page.tsx`                                  | Renders **dark** on otherwise light marketing site (inconsistent surface tokens) | Rebind background utility from `--color-paper`/`--color-chat-bg-dark` to `--color-cream-100`/`--color-chat-bg-light`, OR move route into chat-app shell | 1-2h  | no (V-WEB-VISUAL Playwright already verified) |
| R-WEB-01        | web homepage        | n/a                                                                                                                           | `apps/web/components/SurfaceShowcase.tsx:63`                      | Hardcoded `Claude Opus 4` (model ID not in catalog)                              | Replace with `getModelById('claude-opus-4.7')?.displayName ?? 'Claude Opus'` or strip version                                                           | 0.25h | no                                            |
| R-WEB-02        | web homepage        | n/a                                                                                                                           | `apps/web/lib/marketing-constants.ts:20-25`                       | `MARKETING_MODEL_PILLS` ships stale `'gpt-5.4'` (catalog default is `gpt-5.5`)   | Bump to `'gpt-5.5'`; same file's TODO already noted                                                                                                     | 0.1h  | no                                            |
| W3-03           | mobile `/artifacts` | `06_artifacts_gallery-loading-skeleton.png`, `07_artifacts_gallery-loaded-card-grid.png`                                      | `apps/mobile/app/(app)/artifacts/index.tsx`                       | Confirm 2-col grid + skeleton + "Get inspired" banner present                    | NativeWind tokens; verify against ref                                                                                                                   | 2-3h  | yes                                           |
| W3-06           | mobile chat         | `01_app-shell_splash-opus-extended-faded-greeting.png`                                                                        | `apps/mobile/src/features/chat/components/ContextWarningChip.tsx` | No model-tier usage warning banner above composer                                | Add tier-rate warning chip using existing chip tokens                                                                                                   | 1-2h  | no                                            |

### P1 — visible after attention; brand/conversion impact

| ID              | Surface                 | Claude ref                                                       | Our path:line                                                        | Gap                                                                                                          | Token-based fix                                                                                  | Est   | NEEDS_USER_MANUAL_TEST? |
| --------------- | ----------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----- | ----------------------- |
| V-WEB-VISUAL-05 | web all marketing pages | every Claude H1 (010, 014, 015, 030, 031, 032)                   | `apps/web/app/layout.tsx` + every marketing page                     | `--font-newsreader` registered but H1s render sans (wire-up bug, NOT design choice — token chain is correct) | Diagnose: `next/font` `Newsreader` registration → `<html>` className → per-element override hunt | 2-4h  | no                      |
| V-WEB-VISUAL-06 | web `/pricing`          | `010` + `014` + `015` (three-segment pill tab)                   | `apps/web/app/pricing/page.tsx`                                      | No Individual / Team & Enterprise / API tabs                                                                 | shadcn `Tabs` component; preserve six-tier model under Individual                                | 4-6h  | no                      |
| V-WEB-VISUAL-07 | web `/enterprise`       | `014_claude-live_pricing_team-enterprise.png`                    | `apps/web/app/enterprise/page.tsx`                                   | Long-form essay vs Claude's card-based comparison                                                            | Card-led layout using `--color-cream-50`/`--color-cream-100` surfaces                            | 4-6h  | no                      |
| V-WEB-VISUAL-08 | web `/login`            | `030_claude-auth_logged-out_signin-entry.png`                    | `apps/web/app/login/page.tsx` or `OAuthButtons.tsx`                  | Vendor OAuth icons missing (Google G, GitHub mark)                                                           | `lucide-react` Google/GitHub icons; mark color = brand glyph palette tokens                      | 0.5h  | no                      |
| V-WEB-VISUAL-09 | web header              | `locks/brand-agi-2026-05-15.md`                                  | `apps/web/components/layout/Header.tsx` + SVG mark                   | Wordmark shows `agi.workforce` (internal slug exposed); lock says public brand = `AGI`                       | Replace wordmark with `AGI` lockup matching the lock                                             | 1-2h  | no                      |
| V-WEB-VISUAL-10 | web header              | every Claude marketing ref nav                                   | `apps/web/components/layout/Header.tsx`                              | No "Contact sales" in top nav                                                                                | Add `{ href: '/contact-sales', label: 'Contact sales' }` to NAV; outline pill right of Sign in   | 0.5h  | no                      |
| W3-01           | mobile drawer           | `03_sidebar_chats-projects-artifacts-code-dispatch-recents.png`  | `apps/mobile/src/features/drawer/components/DrawerContent.tsx:270`   | Recents shows 5 vs Claude's ~10                                                                              | Increase slice to 10                                                                             | 0.25h | no                      |
| W3-02           | mobile drawer           | `03_sidebar_...png`                                              | `apps/mobile/src/features/drawer/components/DrawerContent.tsx:50-55` | No "New" badge on Dispatch nav item                                                                          | Add badge field using existing chip color tokens                                                 | 0.5h  | no                      |
| W3-05           | mobile chat composer    | `24_chat_thread-reasoning-chip-reply-composer.png`               | `apps/mobile/src/features/chat/components/ChatInput.tsx`             | Static placeholder; should be "Chat with AGI" empty / "Reply to AGI" during active thread                    | Context-aware placeholder via prop                                                               | 1h    | no                      |
| W3-12           | mobile drawer           | `03_sidebar_...png`                                              | `apps/mobile/src/features/drawer/components/DrawerContent.tsx:37`    | Label "Chat" should be "Chats" (plural matches Projects / Artifacts)                                         | 1-char change                                                                                    | 0.1h  | no                      |
| W2b-01          | desktop PlusMenu        | `105_claude-max20x_skills-submenu_installed.png`                 | `apps/desktop/src/features/v3/PlusMenu.tsx:30-35`                    | Skills flyout hardcoded `[translate,summarize,proofread,explain]` — not from `skillMarketplaceStore`         | Wire to live store; reuse `SkillsView.tsx` reader                                                | 1-2h  | no                      |
| W2b-02          | desktop PlusMenu        | `104_claude-max20x_connectors-submenu_connected.png`             | `apps/desktop/src/features/v3/PlusMenu.tsx:37-43`                    | Connectors flyout hardcoded `{gdrive,github,notion}` — not from `connectorsStore`                            | Wire to live store                                                                               | 1-2h  | no                      |
| W5-04           | chrome ext              | `2026-05-15/406_claude-chrome_site-permission-action-prompt.png` | `apps/extension/src/side_panel.ts:629`                               | No batch progress counter / error-stopped state on tool-call stack                                           | Add `Batch N/M` group label using existing chip tokens                                           | 2-3h  | no                      |

### P2 — polish, brand warmth, density

| ID              | Surface             | Claude ref                                                               | Our path:line                                                                           | Gap                                                         | Token-based fix                                                                       | Est  | NEEDS_USER_MANUAL_TEST?  |
| --------------- | ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---- | ------------------------ |
| V-WEB-VISUAL-11 | web `/pricing`      | 010, 010b, 014, 031                                                      | `apps/web/public/illustrations/` (new) + `apps/web/app/pricing/page.tsx`                | No decorative plant illustrations on plan cards             | Ink-pen line-art SVG; stroke color binds to `--color-ink` / `--color-terra-cotta-700` | 3-6h | no                       |
| V-WEB-VISUAL-12 | web `/pricing` 1920 | `010b_claude-public_pricing_top_maximized.png`                           | `apps/web/app/pricing/page.tsx`                                                         | No breadcrumb + "Explore here" anchor at 1920               | Sticky secondary nav using shadcn `NavigationMenu` semantic tokens                    | 2h   | no                       |
| W2a-09          | desktop composer    | `P33` (mic area visible)                                                 | `apps/desktop/src/App.tsx:1290,1317` `onVoiceClick` prop                                | Voice input wiring unverified end-to-end                    | Read VoiceInput component if exists                                                   | 1h   | yes (depends on runtime) |
| W2c-08          | desktop connectors  | `claude-connectors/03_connector-page-2.png` to `05_connector-page-4.png` | `apps/desktop/src/features/connectors/connectorDefinitions.ts` + `ConnectorGallery.tsx` | No `Popular/Interactive/New/Trending` badge labels on cards | Add `badge?` field to `ConnectorDef`; render as chip using existing chip color tokens | 1-2h | no                       |
| W3-13           | mobile projects     | `05_projects_list-research-claude-prompt.png`                            | `apps/mobile/src/features/projects/components/ProjectCard.tsx`                          | Verify last-updated relative timestamp visible              | If absent, add using NativeWind body tokens                                           | 1h   | yes                      |
| W3-14           | mobile artifacts    | `06_artifacts_gallery-loading-skeleton.png`                              | `apps/mobile/app/(app)/artifacts/index.tsx`                                             | No "Get inspired" banner with example cards                 | Banner using NativeWind elevated surface tokens                                       | 2-3h | no                       |

---

## §2. Layer 2 — Runtime gaps (code exists, doesn't work)

These are flow-level failures where the code path is wired but the user cannot complete the flow. Source-reasoning evidence: "user does X → Y fails → user sees Z."

### P0 — production blockers (must fix before launch claim)

| ID                       | Surface            | User flow that breaks                                                                                             | Our path:line                                                                                                                                          | Source-reasoning                                                                                                                                                                                                                                                           | Est                                 | NEEDS_USER_MANUAL_TEST?                          |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| R-DESKTOP-001            | desktop boot       | User launches AGI Workforce.app → permanent loading skeleton                                                      | `desktop-core-Bct2rNh5.js` (hardcoded `http://localhost:9999`) + `settings.json` ships `ollamaUrl: "http://localhost:11434"`                           | `curl` confirmed BOTH endpoints unreachable; bundle has `orchestrator_init_default` + `llm_check_provider_status` IPC names; boot awaits provider-status with NO `Promise.race`/timeout, so React holds suspense fallback forever. **Empirically verified**, not inferred. | 0.5-1d                              | no (runtime-confirmed via curl)                  |
| W2a-PRO-00A              | desktop chat       | Local-only user (no Supabase session) tries to send first message → "Please sign in to send messages." error      | `apps/desktop/src/runtime/TauriRuntime.ts:168,182` + `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs:35-41`                              | `getCurrentUserId()` returns `''`; `chat_get_conversations(user_id)` hard-rejects empty; `ensureBackendConversation()` throws. Fix: generate stable UUID via `machine_key::get_install_id()` at onboarding, set as synthetic `user.id`.                                    | 1-2d                                | no                                               |
| W2a-PRO-00B              | desktop chat       | User drops file in composer → silent "command not found" IPC error                                                | `apps/desktop/src/runtime/TauriRuntime.ts:524` + `apps/desktop/src-tauri/src/lib.rs:1394`                                                              | Frontend calls `invoke('upload_file', ...)`; only `browser_upload_file` registered. Fix: register `upload_file` Tauri command that stores payload locally and returns `FileRef`.                                                                                           | 1d                                  | no                                               |
| W3-mobile-model-download | mobile onboarding  | User taps "Download model" → convincing 7s progress bar → enters app with NO model installed                      | `apps/mobile/app/(public)/onboarding.tsx:231-247`                                                                                                      | `setInterval` `+1.2%` every 80ms then `finishOnboarding()`; TODO comment explicit — `downloadUrl`, `checksum`, `format` not yet in `OnDeviceModel`. M1 alpha blocker per W3.                                                                                               | 2-3d                                | no                                               |
| W3-mobile-storekit       | mobile billing     | User taps Upgrade → opens web Stripe checkout (Apple rejects this)                                                | `apps/mobile/app/(app)/billing/index.tsx` `handleUpgrade` calls `api.post('/api/checkout')` + `openExternalUrl`                                        | No `expo-in-app-purchases` / `react-native-purchases`; product strategy mandates StoreKit IAP at 15% via Apple Small Business Program. M3 App Store blocker.                                                                                                               | 4-6d                                | no                                               |
| W1-WEB-00A               | web signup→chat    | New user signs up → lands on `/chat` → types message → HTTP 403 `subscription_required` error, no waitlist screen | `apps/web/features/chat/pages/WebChatPage.tsx` + `apps/web/.../auth-gate.ts:89-105`                                                                    | Chat renders unconditionally; subscription check only at LLM send. Lock `v1-local-only-cloud-waitlist-2026-05-18.md` requires pre-emptive waitlist gate. Fix: redirect to `/byok` if no `plan_tier`.                                                                       | 2-3h                                | no                                               |
| W1-WEB-00B               | web checkout       | `billingInterval: 'annual'` vs `'yearly'` key mismatch silently degrades tier assignment                          | `apps/web/lib/pricing.ts:40-41` (uses `annual`) vs `apps/web/lib/price-tier-mapping.ts:33-34` + `lib/services/subscription-service.ts` (uses `yearly`) | Reverse-mapping from Stripe price ID to tier fails for the wrong spelling.                                                                                                                                                                                                 | 1h                                  | no                                               |
| W2c-OAUTH                | desktop connectors | User clicks Connect on OAuth connector → silent fail or error (no Node, no client creds)                          | `apps/desktop/src/features/connectors/ConnectorGallery.tsx:198-219` → `connectorsStore.ts:66-116` → `mcp_oauth.rs:774-830` + `mcp_oauth.rs:1562`       | `GITHUB_CLIENT_ID`/`GOOGLE_CLIENT_ID`/`SLACK_CLIENT_ID` not bundled; `npx -y @modelcontextprotocol/server-X` requires user-installed Node.js. First-connection UX is fragile.                                                                                              | 4-8h                                | yes (need to confirm bundled env vars per build) |
| W4-CLI-hooks-dead        | CLI hooks          | User configures `UserPromptSubmit` hook in `~/.agiworkforce/hooks.json` → never fires                             | `apps/cli/src/features/hooks/hooks.rs:74-134` + grep for `run_hooks(HookEvent::...)`                                                                   | 9 events declared, 13 wired — `UserPromptSubmit`, `AfterMessage`, `PlanModeChanged`, `PermissionRequest`, `Notification`, `Stop`, `WebhookReceived`, `FileChanged`, `DaemonStopped` have NO fire site. Breaks core Claude Code hook compatibility.                         | 2-4d (each event needs a fire site) | no                                               |

### P1 — degraded flows (works partially or with wrong UX)

| ID                       | Surface          | User flow that breaks                                                                                                                               | Our path:line                                                                                         | Source-reasoning                                                                                                                                                                                                                | Est   | NEEDS_USER_MANUAL_TEST?                     |
| ------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------- |
| W2a-FREE-TIER            | desktop billing  | Free user exceeds tier limit → backend doesn't block                                                                                                | `apps/desktop/src-tauri/src/.../send_message.rs:57-65`                                                | Under `#[cfg(not(feature = "billing"))]` (default dev/local build), subscription gate is skipped. CapModal is cosmetic for typical app builds. v1 LOCAL ONLY by design, but UX implication exists if user ever sees the cap UI. | 4-8h  | no                                          |
| W2a-HOTKEY               | desktop settings | User changes global hotkey combo → not registered until restart, no warning                                                                         | `apps/desktop/src/App.tsx:918` (registered once at startup) + `settingsStore.ts:1327` (saves to disk) | New combo persists but OS registration is one-shot. Silent degraded UX.                                                                                                                                                         | 2-4h  | no                                          |
| W2b-MULTI-TAB            | desktop chat     | Conversation A streams → user switches to B → sends → globally disabled                                                                             | `apps/desktop/src/.../chatExecutionStore.ts:18-20`                                                    | `isLoading`, `isStreaming`, `currentStreamingMessageId` are single global booleans. Background streams continue but UI disables global send button.                                                                             | 6-8h  | no                                          |
| W2b-SKILLS-PERSIST       | desktop composer | User toggles skill active → resets on restart                                                                                                       | `apps/desktop/src/.../skillMarketplaceStore.ts` `toggleSkillActive(name)`                             | Frontend-only in-memory state; no Tauri persist call.                                                                                                                                                                           | 2-3h  | no                                          |
| W4-CLI-effort            | CLI REPL         | User types `/effort high` → message says "recognized" but effort is NOT applied to model call in REPL mode                                          | `apps/cli/src/claude_parity.rs:714-722`                                                               | Returns `SystemMessage(String)` informational text only; no session-state mutation in REPL path. TUI mode does apply.                                                                                                           | 2-3h  | no                                          |
| W4-CLI-resume            | CLI sessions     | User runs `/resume <id>` → message history rehydrates but plan_mode / permission_mode / output_style / fallback_chain all default to initial values | `apps/cli/src/.../repl/registry.rs:42-54` + `agent/mod.rs:268-272`                                    | Non-message session state is not persisted in JSONL format.                                                                                                                                                                     | 1-2d  | no                                          |
| W4-CLI-routing           | CLI provider     | User expects auto-balanced task-type routing → gets configured default for every task                                                               | `apps/cli/src/routing/strategy.rs:1` `#![allow(dead_code)]`                                           | `RoutingStrategy` impls exist but never called from `AgentSession`. Documented as `PHASE2`.                                                                                                                                     | 2-3d  | no                                          |
| W4-CLI-plugin-hooks      | CLI plugins      | User installs plugin with `manifest_hooks` → hooks silently don't fire                                                                              | `apps/cli/src/.../plugins.rs:472-513` + `repl/mod.rs` + `tui/tui_app.rs`                              | `merge_plugin_hooks()` is referenced in comments but session-load reads `~/.agiworkforce/hooks.json` only; plugin hooks not merged. Project-local plugin hooks explicitly blocked (HIGH-2 security).                            | 1d    | no                                          |
| W5-CHROME-BRIDGE-OFFLINE | chrome ext       | User installs ext without desktop app → side panel shows "Disconnected" with no guidance                                                            | `apps/extension/src/background.ts:311-356,383,2900,2838`                                              | Native bridge requires `localhost:8787` desktop; no graceful "open the desktop app" first-run screen. Claude degrades to cloud; we hard-fail.                                                                                   | 4-6h  | no                                          |
| W5-CHROME-COOKIES        | chrome ext       | CWS submission risk                                                                                                                                 | `apps/extension/manifest.json:17`                                                                     | `cookies` permission listed; `grep chrome.cookies` returns no callers. Speculative over-grant.                                                                                                                                  | 0.25h | no                                          |
| W6-VSCODE-rewind         | vscode ext       | User clicks Rewind in action menu → "coming soon" toast                                                                                             | `apps/extension-vscode/src/core/commandSetup.ts:925-928`                                              | `agi-workforce.rewindLast` registered as a stub `showInformationMessage`. Visible UX gap vs Claude Code.                                                                                                                        | 1-2d  | no                                          |
| W1-WEB-OTEL              | web telemetry    | OTel attributes computed but never exported unless `instrumentation.ts` is present                                                                  | `apps/web/.../stream-transform.ts:10` + `cost-tracker.ts:27`                                          | `toOtelAttributes()` produces attributes; no SDK span import.                                                                                                                                                                   | 4-6h  | yes (depends on deployment instrumentation) |
| W1-WEB-i18n              | web pages        | Spanish locale user gets English login/signup/pricing/header                                                                                        | `apps/web/app/{login,signup,pricing}/page.tsx` + `Header.tsx`                                         | `I18nextProvider` mounted globally; pages hardcode English strings; settings pages do call `useTranslation()`. Dead locale for first-touch pages.                                                                               | 4-6h  | no                                          |

### P2 — silent or rare-path degradations

| ID                    | Surface            | User flow                                                                       | Our path:line                                                                       | Source-reasoning                                                                                                      | Est                | NEEDS_USER_MANUAL_TEST? |
| --------------------- | ------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------- |
| W2a-OTEL-SDK          | desktop            | OTel span emission depends on deployment                                        | n/a                                                                                 | Parallel to W1-WEB-OTEL                                                                                               | 4-6h               | yes                     |
| W2c-CONNECTOR-CATALOG | desktop connectors | User expects 250+ connectors → sees 15 active (60 `comingSoon`)                 | `apps/desktop/src/features/connectors/connectorDefinitions.ts`                      | Hardcoded TS catalog; Claude appears server-fetched. Scale gap.                                                       | 2-3w (incremental) | no                      |
| W2c-OAUTH-TYPE        | desktop connectors | Non-canonical OAuth providers (figma/notion/jira) → silent expiry status errors | `apps/desktop/src/types/mcp.ts:383` (3-provider union) + `mcp.ts:891` (3 hardcoded) | TS type covers 3 providers; connector registry covers 13. Cast `id as McpOAuthProvider` compiles but Rust may reject. | 4-6h               | no                      |
| W2c-REACT-PREVIEW     | desktop artifacts  | React artifact in offline / air-gapped → silent failure (CDN unreachable)       | `apps/desktop/src/.../ReactPreview.tsx` `buildReactPreviewDocument()`               | Loads Babel + Tailwind from unpkg CDN. No offline fallback.                                                           | 1-2d               | yes                     |

---

## §3. Layer 3 — Flow / connection / wiring gaps

Deep wiring: IPC chains, store hydration, API call chains, lock alignment, persistence, error propagation, cross-surface integration.

### P0 — wiring breaks user-facing promises

| ID                | Surface          | Wiring break                                                                                                                                                      | Path:line                                                                                                                                                                                                    | Impact                                                                                                                                                                                                                | Est                                    | NEEDS_USER_MANUAL_TEST? |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------- |
| R-DESKTOP-002     | desktop signing  | `codesign -dv` reports `adhoc, linker-signed` — no Developer ID, no notarization, no hardened runtime                                                             | `/Applications/AGI Workforce.app`                                                                                                                                                                            | Causes concrete WebKit sandbox errors at boot (`coreservicesd`, pasteboard, TCC) — likely contributes to the boot hang. Compare Claude `Developer ID Application: Anthropic PBC (Q6L2SF6YDW)` + notarized + hardened. | 0.5-1d (cert provisioned) to multi-day | no                      |
| R-DESKTOP-003     | desktop menu bar | Native menu bar has no `Settings…`, no `Restart to update`, no version string, File menu has no `New Conversation`, View menu has no `Reload`, Help menu is empty | `apps/desktop/src-tauri/` menu config                                                                                                                                                                        | Power-user keyboard nav broken from day 1; no in-app updater.                                                                                                                                                         | 0.25d                                  | no                      |
| R-DESKTOP-004     | desktop updater  | No in-app updater visible                                                                                                                                         | `apps/desktop/src-tauri/`                                                                                                                                                                                    | Claude updates weekly; AGI on 1.1.5 with no in-app path. Adopt `tauri-plugin-updater`.                                                                                                                                | 1-2d                                   | no                      |
| R-DESKTOP-005     | desktop security | `Info.plist` ATS allows plaintext HTTP to **all** domains via `NSExceptionAllowsInsecureHTTPLoads = 1` with empty-string exception domain                         | `Info.plist` `NSAppTransportSecurity.NSExceptionDomains`                                                                                                                                                     | Privacy/security smell. Narrow to `localhost`, `127.0.0.1`, `[::1]`.                                                                                                                                                  | 0.1d                                   | no                      |
| R-DESKTOP-006     | desktop locks    | Bundle ships full cloud IPC plumbing in v1-local-only binary                                                                                                      | `desktop-core-Bct2rNh5.js` exports `cloud_get_conversations`, `cloud_create_conversation`, `cloud_delete_conversation`, `cloud_update_conversation_title`, `listCloudConversations`, `handleCloudWebCommand` | Contradicts `v1-local-only-cloud-waitlist-2026-05-18.md`. **Caveat:** binary mtime predates lock by 19 days. Verify against current `main`.                                                                           | 1d                                     | no                      |
| R-DESKTOP-009     | desktop privacy  | Filesystem MCP auto-attached at boot with all of `~/Desktop`, `~/Documents` writable, no consent UI                                                               | `mcp-servers-config.json` + `ps -ef` confirms `npm exec @modelcontextprotocol/server-filesystem` running                                                                                                     | Material privacy concern. Claude `213_…png` requires per-action `Always allow / Deny`. AGI has the IPC names (`auto_approve_tools`, `mcp_list_connected_providers`) but no surfaced dialog.                           | 2-3d                                   | no                      |
| W4-CLI-LOCK-DRIFT | CLI hooks lock   | Code has 22 `HookEvent` variants; system prompt asserts 19 canonical                                                                                              | `apps/cli/src/features/hooks/hooks.rs:74-134` vs system-prompt locked fact                                                                                                                                   | Lock drift. Supervisor must decide: update lock to 22, or narrow definition of "canonical" with explicit boundary.                                                                                                    | n/a (decision)                         | no                      |
| W6-VSCODE-06      | vscode ext IA    | Recommendation proposes Local/Cloud tab UI in v1                                                                                                                  | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`                                                                                                                                       | Author flagged as lock conflict with `v1-local-only-cloud-waitlist-2026-05-18.md`. **Route to user** even though purely additive scaffolding.                                                                         | n/a (decision)                         | no                      |

### P1 — wiring degrades feature reliability

| ID                  | Surface              | Wiring break                                                                                                                                                                 | Path:line                                                                                                                     | Impact                                                                                                                                              | Est            | NEEDS_USER_MANUAL_TEST? |
| ------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------- |
| R-DESKTOP-007       | desktop settings     | `defaultProvider: "managed_cloud"` + `defaultModels.ollama: "llama4-maverick"` literal vs `v1-model-selection-final-2026-05-18.md` (Qwen3-4B + `llama.cpp via callstack/ai`) | installed `settings.json`                                                                                                     | Wrong default routing; hardcoded model ID violates `rule-models-json-canonical.md`. Same 19-day caveat.                                             | 0.5d           | no                      |
| R-DESKTOP-008       | desktop brand        | App bundle ships as "AGI Workforce"; lock says public brand = "AGI"                                                                                                          | `Info.plist` `CFBundleDisplayName`, menu bar                                                                                  | Predates lock by 19 days. Product decision: rename binary OR update lock.                                                                           | 0.25d or 0     | no                      |
| W2a-PROJECT-DEPTH   | desktop projects     | Project detail (knowledge upload, system prompt editor) unverified against P04/P05                                                                                           | `apps/desktop/src/features/projects/`                                                                                         | Confidence gap, not confirmed broken                                                                                                                | 1d (audit)     | yes                     |
| W2b-CODE-MODE-STATS | desktop Code mode    | Heatmap uses `Math.random()` + fixture stats                                                                                                                                 | `apps/desktop/src/features/v3/CodeModeHome.tsx`                                                                               | Plausible-but-fake; ranks high under cross-surface anti-pattern §4                                                                                  | 1-2d           | no                      |
| W2c-MCP-DISCOVERY   | desktop MCP          | No auto-discovery of user's existing `~/.mcp.json` or Claude Code MCP setup                                                                                                  | `apps/desktop/src/.../mcp_oauth.rs:1440` + `mcp_get_config`                                                                   | Users with existing MCP setups start with zero connectors.                                                                                          | 2-3d           | no                      |
| W3-ONBOARDING-INIT  | mobile MMKV          | Verify `initMmkvEncryption()` is called early enough in `app/_layout.tsx`                                                                                                    | `apps/mobile/app/_layout.tsx` (first effect required)                                                                         | If late, proxy no-op MMKV → stores return null. Degraded state, not crash.                                                                          | 0.5h verify    | yes                     |
| W3-PUSH-BACKEND     | mobile notifications | Token sent to `/api/mobile/push-token`; backend endpoint + EAS project ID must exist                                                                                         | `apps/mobile/services/notifications.ts` `sendTokenToBackend(token)`                                                           | Catch block swallows as "non-critical". Local notifications work; remote pushes won't deliver without backend wiring.                               | 2-3d (backend) | yes                     |
| W4-CLI-PLUGIN-MCP   | CLI plugin MCP       | SSE plugin entries with non-flat `url` fields silently skipped                                                                                                               | `apps/cli/src/.../plugins.rs:355-434` `cfg.extra.get("url")`                                                                  | Manifests that nest `url` get a warning + drop.                                                                                                     | 2-3h           | no                      |
| V-WEB-VISUAL-13     | web auth wiring      | R-WEB §4 concluded "no middleware → empty SSR for /chat"; V-WEB-VISUAL captured a `307` redirect to `/login`                                                                 | `apps/web/middleware.ts` (claimed absent) + actual mechanism (route handler? `vercel.json` rewrite? page-level `redirect()`?) | R-WEB's filesystem-only finding is overturned by V-WEB-VISUAL's primary-source network log. Identify the mechanism + correct R-WEB Section 4 row 1. | 0.5h           | no                      |

### P2 — wiring polish

| ID                   | Surface            | Gap                                                                                                                              | Path:line                                                                                                                                          | Impact                                                                 | Est  | NEEDS_USER_MANUAL_TEST? |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---- | ----------------------- |
| R-DESKTOP-011        | desktop overlay    | `.window-state.json` declares 2nd "overlay" window but `osascript count of windows` returns 1                                    | `~/Library/Application Support/com.agiworkforce.desktop/.window-state.json` + bundle chunks `floating-chat-D_4GRZrd.js`, `quick-query-BO2XwMgg.js` | Overlay never spawns despite `globalHotkeyPreferences.enabled = true`. | 2d   | yes                     |
| W2c-MCP-NPX-DOWNLOAD | desktop connectors | `npx -y @modelcontextprotocol/server-X` first-connection downloads npm package; 10-30s with no progress UX                       | `apps/desktop/src-tauri/src/.../mcp_oauth.rs:66-178`                                                                                               | No bundling, no version pinning. Fragile.                              | 1-2d | no                      |
| W4-CLI-text-stubs    | CLI TUI            | `/chrome`, `/ide`, `/effort`, `/color`, `/heapdump`, `/stickers`, `/statusline` render text in TUI instead of structured widgets | `apps/cli/src/claude_parity.rs` shared path                                                                                                        | TUI gets string output, not widget                                     | 2-3d | no                      |

---

## §4. Cross-surface patterns (root causes)

The "plausible-but-broken" pattern dominates: code exists, screens render, but the underlying data is fake / the IPC dangles / the lock is violated. Each pattern below has ≥2 surface examples and a proposed prevention.

### Pattern A — Hardcoded arrays where live stores exist

**Surfaces:** desktop (W2a, W2b), chrome ext.
**Examples:**

- `apps/desktop/src/features/v3/PlusMenu.tsx:30-35` skills flyout: `SKILLS_LIST = [translate,summarize,proofread,explain]` (hardcoded); should read `useSkillMarketplaceStore`.
- `apps/desktop/src/features/v3/PlusMenu.tsx:37-43` connectors flyout: `CONNECTORS.connected = [gdrive,github,notion]` (hardcoded); should read `connectorsStore.connectedIds`.
- `apps/desktop/src/features/v3/PlusMenu.tsx:163-213` plugins flyout: `INSTALLED_PLUGINS` hardcoded.
- `apps/desktop/src/features/connectors/connectorDefinitions.ts` connector directory: ~75 entries (15 active) hardcoded vs Claude's ~250+ server-fetched catalog.

**Root cause:** Composer/sidebar surfaces shipped before the live stores were wired, with placeholder arrays as scaffolding. The store layer was completed (`SkillsView.tsx`, `ConnectorsView.tsx` both read live) but the composer references never updated.

**Prevention:**

- ESLint rule: any file containing `export const SKILLS_LIST = [` / `CONNECTORS = {` etc. must import from `@agiworkforce/stores` (or appropriate package), not declare inline.
- Code-search CI gate: `grep -RE "(SKILLS|CONNECTORS|PLUGINS|MODELS)_LIST\s*=" apps/desktop/src/features` → fail if any match outside `.test.ts(x)`.
- Pre-commit hook: any TSX/TS file that mutates a UI menu must touch at least one `*Store.ts` file in the same PR (heuristic — not strict).

### Pattern B — Hardcoded model IDs (violates `rule-models-json-canonical.md`)

**Surfaces:** web (R-WEB §3.2, §3.3), desktop runtime (R-DESKTOP §3).
**Examples:**

- `apps/web/components/SurfaceShowcase.tsx:63` — `<span>Claude Opus 4</span>` (model ID **not in** `packages/types/src/models.json` — phantom).
- `apps/web/lib/marketing-constants.ts:20-25` — `MARKETING_MODEL_PILLS` ships `'gpt-5.4'` while catalog `defaultModel = 'gpt-5.5'`.
- `apps/web/components/agi/AgiChatDemo.tsx` — `model: 'Claude Opus'` + switch `from: 'Claude Opus', to: 'GPT'` hardcoded.
- Installed `settings.json` ships `ollama: "llama4-maverick"` literal.

**Root cause:** Marketing copy and demo screens treat model names as "display strings" decoupled from the catalog. Drift is inevitable: catalog ships at sub-month cadence; marketing strings change on PR cadence.

**Prevention:**

- New CI script (per R-WEB R26-PARITY-RUNTIME-WEB-11): `apps/web/scripts/check-marketing-models.ts` greps every model-ID-like string in `apps/web/components/` and `apps/web/lib/marketing-constants.ts`, diffs against `packages/types/src/models.json`. Fail CI if any string is not a valid catalog ID or an allow-listed brand-only display name.
- Pair with `pnpm check:agent-context` / `check:repo-organization` existing harness.
- Decide once and document: marketing surfaces use **brand-only names** (`Claude Opus`, `GPT`) OR **catalog-derived** names (`getModelById('claude-opus-4.7')?.displayName`). Codify in `apps/web/lib/marketing-constants.ts` header comment.

### Pattern C — Plausible-but-fake UX (cosmetic data, fake progress, mock heatmaps)

**Surfaces:** mobile (W3), desktop (W2b).
**Examples:**

- `apps/mobile/app/(public)/onboarding.tsx:231-247` — `setInterval` `+1.2%`/80ms fake progress bar; `finishOnboarding()` fires regardless of any real download. TODO comment is explicit.
- `apps/desktop/src/features/v3/CodeModeHome.tsx` — heatmap uses `Math.random()`; stats are fixtures (`sessions: '612'`, `tokens: '134.6M'`).
- `apps/desktop/src/features/v3/DesktopShellV3.tsx:117-130,132-145` — Cowork mode and Code mode render placeholder "coming" `<div>`s.

**Root cause:** Surfaces shipped to "look complete" before backend pipelines existed. Users see convincing UX → assume it's real → discover later that no work happened.

**Prevention:**

- Lint rule: any `useEffect` or `setInterval` that mutates a UI progress value must reference a known IO call (`fetch`, `invoke`, `streamRequest`) in the same closure — otherwise flag.
- New repo rule: any `Math.random()` in `apps/*/src/features/*.tsx` must have a sibling `// FIXTURE` comment AND a tracking issue link. Default-deny commit.
- Storybook fixture mandate: fake data lives in `.stories.tsx`, not `.tsx`.

### Pattern D — Missing timeout/error fallback in async boot promises

**Surfaces:** desktop (R-DESKTOP-001).
**Examples:**

- Desktop boot awaits `orchestrator_init_default` + `llm_check_provider_status` against unreachable `localhost:11434` and `localhost:9999` with no timeout → permanent skeleton.

**Root cause:** Boot path assumed local LLM runtime would always be reachable. No "degraded but usable" boot mode designed.

**Prevention:**

- Repo rule: any `Promise` reaching React render via Suspense MUST be wrapped in `Promise.race([promise, timeout(N)])` with an explicit error-state UI. CI check: grep for `useSuspenseQuery`, `<Suspense>` in source — confirm a sibling `ErrorBoundary` or timeout pattern.
- Boot-time checklist (markdown in `docs/engineering/`): every IPC the boot sequence awaits must be enumerated with a timeout + error UI + retry-with-backoff pattern.

### Pattern E — Lock violations baked into installed binary (rebuild + reinstall lag)

**Surfaces:** desktop (R-DESKTOP §3 — 4 lock-vs-binary findings).
**Examples:**

- `defaultProvider: "managed_cloud"` vs `v1-local-only-cloud-waitlist-2026-05-18.md`
- `ollama: "llama4-maverick"` vs `v1-model-selection-final-2026-05-18.md` (Qwen3-4B)
- Bundle exports `cloud_get_conversations` etc. vs v1-local-only lock
- `CFBundleDisplayName = "AGI Workforce"` vs `brand-agi-2026-05-15.md` (`AGI`)

**Root cause:** Installed binary mtime = 2026-04-29; multiple locks dated 2026-05-15/16/18 postdate the binary by 11-19 days. User experiences the pre-lock state until a fresh build is shipped.

**Prevention:**

- Build-time lock checks: a `scripts/check-locks.ts` that fails the build if `settings.json` defaults, `packages/types/models.json` defaults, or `Info.plist` `CFBundleDisplayName` contradict the latest dated lock file.
- Add a `LOCK_VERSION` constant baked into the app bundle; show as `Settings → About → Built against locks vX (date)`. Lets ops/QA verify a deployed binary against current locks.
- CI: when a lock file is added/modified, require a touch on `apps/desktop/src-tauri/tauri.conf.json` OR a comment explaining why no rebuild is needed.

### Pattern F — IPC client-side without server-side handler

**Surfaces:** desktop (W2a-PRO-00B), partially CLI (W4-FG-01).
**Examples:**

- `apps/desktop/src/runtime/TauriRuntime.ts:524` calls `invoke('upload_file', ...)` — only `browser_upload_file` registered in `lib.rs:1394`.
- CLI: 9 `HookEvent` variants defined; no `run_hooks(HookEvent::X, ...)` fire site.

**Root cause:** Frontend / TS scaffolding ships ahead of Rust IPC registration. Symbol-level type checking doesn't catch "frontend calls IPC name 'X', backend never registers 'X'".

**Prevention:**

- Cross-language type generator: extend `packages/types` to emit a `tauri-commands.ts` that lists all registered Rust commands at build time. Add CI gate: `grep -E "invoke\(['\"]([a-z_]+)['\"]" apps/desktop/src/**/*.ts` → diff against generated list → fail if any caller references an unregistered name.
- Same pattern for hook events: enum is the source-of-truth; emit a `cli-hook-events.json` from Rust; lint that every variant has a `run_hooks(HookEvent::X, ...)` call somewhere in `apps/cli/src/`.

### Pattern G — Connectors defined but `comingSoon`-gated

**Surfaces:** desktop (W2c).
**Examples:**

- `apps/desktop/src/features/connectors/connectorDefinitions.ts` — 75 entries defined, 15 active (`comingSoon: false`), 60 disabled.
- Claude's directory: ~250+ entries.

**Root cause:** Catalog is hardcoded TS; activation requires PR + reviewer + ship cycle.

**Prevention:**

- Decide post-v1: move to a server-fetched manifest (slow path) or aggressively prune the 60 dead entries (quick path).
- For v1: every `comingSoon: true` connector must have a tracking issue link. Default-deny in lint.

### Pattern H — npx-spawned MCP needing unbundled Node.js

**Surfaces:** desktop (W2c).
**Examples:**

- Every OAuth connector + API-key connector spawns `npx -y @modelcontextprotocol/server-X` at connect time. Requires user-installed Node.js. First-connection downloads npm package (10-30s no progress UX). No bundling, no version pinning (`-y` with no `@version`).

**Root cause:** Choice of MCP transport (stdio + npm package) leaks Node.js dependency to end users.

**Prevention:**

- Bundle a known-good Node runtime with the Tauri sidecar (Tauri supports sidecars).
- Pin every MCP server to `@version` in `connectorDefinitions.ts`.
- Show download progress UI on first connect.

### Pattern I — Dead i18n provider mounted but never called

**Surfaces:** web (W1 §3.5).
**Examples:**

- `apps/web/app/providers.tsx:27` mounts `I18nextProvider`.
- `app/login/page.tsx`, `app/signup/page.tsx`, `app/pricing/page.tsx`, `components/layout/Header.tsx` hardcode English strings.
- `app/i18n/locales/es/*.json` exists but never consumed by these pages.
- Settings pages DO call `useTranslation()`.

**Root cause:** Marketing pages built before i18n was wired; never retrofitted.

**Prevention:**

- ESLint rule: any string literal longer than 4 chars in a `.tsx` file under `apps/web/app/{login,signup,pricing}/` must come from `t('key')`. Allow-list for technical strings.

### Pattern J — Hardcoded localhost ports / endpoints

**Surfaces:** desktop (R-DESKTOP-001).
**Examples:**

- `desktop-core-Bct2rNh5.js` contains literal `"http://localhost:9999"`.
- `settings.json` `ollamaUrl: "http://localhost:11434"`.

**Root cause:** Convenience defaults baked in source vs config.

**Prevention:**

- Repo rule: every `localhost:NNNN` in source must come from a centralized `apps/*/config/endpoints.ts` file that names the port. Bridge port `8787` is already centralized; this is the model.

---

## §5. Where we're ahead of Claude (~85+ items, by surface)

Numbers reflect counts of distinct AGI advantages identified across the 11 reports.

**Web (W1 §4 + R-WEB §5):** GitHub OAuth, magic-link sign-in, SendPreview privacy disclosure, local-to-BYOK handoff dialog, ghost-text completion, slash-command menu, agent mode switcher, token analytics dashboard, conversation branching, enhanced export dialog, voice settings + voice input, memory settings, BYOK key manager, MCP connector directory, multi-agent (workforce) chat, inline tool result cards, thinking accordion, Spanish localization scaffolding, `/byok` first-class surface, `/local` first-class surface, `/compare` page, `/connectors/mcp-directory` public, `/enterprise` candor (SOC 2 honesty), explicit data-residency claim, per-surface marketing pages (Desktop/Mobile/CLI/Chrome/VS Code), "We do not train on your data" footer signal. **~26 items.**

**Desktop (W2a §4 + W2b §4 + W2c §3):** Master password (Argon2id), GDPR compliance section, Governance & Safety Policies workspace, Allowed directories sandbox control, SVG artifact sanitization, 6-tier model (local-only / BYOK / hobby / pro / max / enterprise), multi-provider connector permissions (3-state cycle per-tool), built-in Python sandbox + TS REPL, multi-provider model catalog in popover (10+ providers vs Claude's Anthropic-only), full MCP server management UI (server browser + log viewer + tool explorer + credential manager), agent task orchestration, computer-use host UI, multi-agent collaboration panel, voice mode, analytics/cost dashboard, memory manager with browser modal, BridgeStatusCard for Chrome + VSCode extensions, structured MCP transport/package metadata, per-connector token expiry tracking + refresh, artifact version history with rollback, richer artifact toolbar (Edit/Copy/Download/History/Refresh/Share/Publish), InlineArtifactEditor, Chart + Presentation artifact renderers. **~22 items.**

**Mobile (W3 §4):** Multi-provider model picker (9 cloud + local LLMs), Add to Chat sheet richness (Agent mode, Effort axis, Auto-approve, Temp chat, Image gen, Computer use, Skills), Dispatch / Companion (QR pairing + heartbeat latency + execution stream vs Claude's bare connecting screen), Local Mode status card, Appearance: System theme (Dark/Light/System), Skills drawer item, voice on-device banner, Auto-approve controls (Ask/Smart/Full cycle), edge-case modals (BatteryLow/ThermalThrottle/StorageFull/FileTooLarge), memory import/export, OCR scan, widget setup, schedules, messaging integrations, biometric gate (Argon2id keychain, fail-closed), MMKV+secure storage chain (production-grade). **~16 items.**

**CLI (W4 §6):** 83 slash commands vs Claude's ~60 (28 AGI-exclusive incl. `/a2a`, `/batch`, `/ecosystem`, `/sync`, `/fallback`, `/replay`, `/think-back`, `/fork-byok`); 22 hook events vs ~11; 3 plugin manifest formats (`.agiworkforce-plugin/`, `.claude-plugin/`, `.codex-plugin/`); 5-step permission mode cycle (Default→Plan→AcceptEdits→Bypass→FullAuto); diff review TUI widget; MCP elicitation overlay; A2A protocol full client+server; multi-model fallback routing; multi-provider auth (9 cloud + ollama + LM Studio); context window visualization. **~10 items.**

**Chrome extension (W5 §5):** Multi-provider local bridge (10+ providers vs Claude's Anthropic cloud-only), job autofill (LinkedIn/Lever), platform-specific context prompts (10 platforms — Slack, Gmail, GCal, Docs, GitHub, Notion, Linear, Figma, Atlassian, Teams), in-page floating panel injection, memory CRUD editor in popup, tab grouping (`tabGroups` API), developer console log viewer, NLWeb / WebMCP tool discovery, extended-thinking per-message toggle, session timer. **~10 items.**

**VS Code extension (W6 §4):** Multi-provider grouped model picker (10+ vs single-provider), diff batch operations with confidence indicators, patch engine with undo, desktop bridge, memory tree, checkpoint system, workspace trust gating (LITL), code lens above functions, hover provider, 4-level effort axis (vs Claude's 3). **~10 items.**

**Total: ~94 distinct AGI advantages across all surfaces.**

---

## §6. Lock conflicts requiring user decisions

Three items need a user decision; the supervisor cannot resolve unilaterally.

**LC-01 — W6 VSCODE-06 cloud-history tab in v1**

- **Where:** `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`
- **Recommendation:** add Local/Cloud tab structure to webview history dropdown now, Cloud tab showing "Coming soon — join the waitlist" content.
- **Lock conflict:** `v1-local-only-cloud-waitlist-2026-05-18.md` is authoritative; even purely additive "coming soon" UI scaffolding that references a cloud session concept may need product sign-off.
- **Author flag (W6):** "LOCK CONFLICT — ESCALATE TO SUPERVISOR. Do not implement without supervisor clearance."
- **Recommended user options:**
  - (a) Approve — additive scaffolding is harmless, fast on-ramp when cloud opens.
  - (b) Reject — keep v1 surfaces lock-pure; defer until cloud ungating.
  - (c) Approve with narrow scope — only allow if Cloud tab content reads from a single waitlist endpoint AND has no cloud-data fetch path.

**LC-02 — W4 CLI hook events lock drift (22 vs 19)**

- **Where:** `apps/cli/src/features/hooks/hooks.rs:74-134` (22 variants) vs AGENTS.md / system prompt (19 canonical).
- **Author flag (W4 Appendix A):** "THIS REQUIRES SUPERVISOR ESCALATION."
- **Three extras potentially excluded by "canonical":** `SessionStart`, `SessionEnd`, or a different partition between "Claude Code-aligned" and "AGI-exclusive".
- **Recommended user options:**
  - (a) Update lock to 22 — code is source-of-truth; lock catches up.
  - (b) Update lock with narrowed definition — "canonical = shared with Claude Code" (which is ~11). The number 19 becomes wrong and must be replaced.
  - (c) Remove events from code — unlikely; W4 §5.2 confirms 13 events ARE wired with fire sites. Removing 11 unwired events shrinks count to 11, matching Claude Code, but breaks documented AGI extensions like `WebhookReceived`, `CronTriggered`.

**LC-03 — Public brand naming (R-DESKTOP §3)**

- **Where:** `Info.plist` `CFBundleDisplayName = "AGI Workforce"`, menu bar "AGI Workforce".
- **Lock:** `brand-agi-2026-05-15.md` — public brand = "AGI"; repo path stays `agiworkforce`.
- **Caveat:** installed binary predates lock by 16 days; couldn't reflect it. Current `main` may already have been changed. Verify before acting.
- **Recommended user options:**
  - (a) Rename binary to "AGI" — `Info.plist` + Tauri menu bar + App Store / Play Store display name + marketing copy alignment. Multiple-surface change.
  - (b) Update lock to "AGI Workforce" — accept the current binary name as canonical public brand.
  - (c) Hybrid — internal display = "AGI Workforce", marketing = "AGI". This is fragile (search-discoverability, OS app-switcher labels).

---

## §7. Ranked unified P0 backlog (top 22 by impact)

Sort: runtime-confirmed blockers → code-confirmed blockers → lock violations → first-impression visual gaps → cross-cutting wiring fixes. Effort estimates are single-engineer.

| Rank | Surface | ID                           | Layer | What it fixes                                                                                                        | Effort                    | Dependencies                                     | NEEDS_USER_MANUAL_TEST? |
| ---- | ------- | ---------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------ | ----------------------- |
| 1    | desktop | R-DESKTOP-001                | L2    | Boot hang on user machine; add `Promise.race([init, timeout(5s)])` + error UI                                        | 0.5-1d                    | none                                             | no                      |
| 2    | desktop | W2a-PRO-00A                  | L2    | Local-only users can't send messages; synthesize `user.id` from `machine_key::get_install_id()`                      | 1-2d                      | none                                             | no                      |
| 3    | desktop | W2a-PRO-00B                  | L2    | File attachments fail silently; register `upload_file` Tauri command                                                 | 1d                        | none                                             | no                      |
| 4    | mobile  | W3-mobile-model-download     | L2    | Onboarding stub progress bar; wire real `downloadModel()` service with checksum                                      | 2-3d                      | M0 spike model files                             | no                      |
| 5    | web     | W1-WEB-00A                   | L2    | New signup → 403 inside `/chat`; redirect to `/byok` waitlist pre-emptively                                          | 2-3h                      | none                                             | no                      |
| 6    | CLI     | W4-CLI-hooks-dead (9 events) | L2    | Add `run_hooks(HookEvent::UserPromptSubmit, ...)` etc. at correct fire sites; restore Claude Code hook compatibility | 2-4d                      | none                                             | no                      |
| 7    | desktop | R-DESKTOP-002                | L3    | Promote to Developer ID + notarization + hardened runtime; eliminates WebKit sandbox errors                          | 0.5-1d (cert provisioned) | Apple Dev cert                                   | no                      |
| 8    | desktop | R-DESKTOP-006                | L3    | Strip cloud-mode IPC from v1 binary OR tree-shake via feature flag; rebuild + reinstall                              | 1d                        | verify against current `main`                    | no                      |
| 9    | web     | R-WEB-01                     | L1    | Drop or fix `Claude Opus 4` literal in `SurfaceShowcase.tsx:63` (phantom model ID)                                   | 0.25h                     | none                                             | no                      |
| 10   | web     | R-WEB-02                     | L1    | Bump `MARKETING_MODEL_PILLS` `gpt-5.4` → `gpt-5.5`                                                                   | 0.1h                      | none                                             | no                      |
| 11   | web     | V-WEB-VISUAL-04              | L1    | `/projects` renders dark on light site; rebind to marketing surface tokens or move into chat shell                   | 1-2h                      | none                                             | no                      |
| 12   | web     | V-WEB-VISUAL-01              | L1    | Split-pane login with right-pane preview; serif H1                                                                   | 6-8h                      | depends on V-WEB-VISUAL-05 typography wiring fix | no                      |
| 13   | web     | V-WEB-VISUAL-03              | L1    | Surface `$/MTok` pricing visually on `/providers`; pull from `models.json.defaultPricing`                            | 3-4h                      | none                                             | no                      |
| 14   | web     | V-WEB-VISUAL-02              | L1    | `/pricing` bottom feature-comparison matrix; drive from `BILLING_PLAN_PRICING` + new `MARKETING_FEATURE_MATRIX`      | 6-8h                      | none                                             | no                      |
| 15   | web     | W1-WEB-00B                   | L2    | `annual` vs `yearly` billing key mismatch                                                                            | 1h                        | none                                             | no                      |
| 16   | desktop | R-DESKTOP-003                | L3    | Native menu bar items (Settings…, New Conversation, Reload, Find, Help)                                              | 0.25d                     | none                                             | no                      |
| 17   | desktop | R-DESKTOP-004                | L3    | In-app updater via `tauri-plugin-updater`                                                                            | 1-2d                      | none                                             | no                      |
| 18   | desktop | R-DESKTOP-005                | L3    | Narrow ATS exception to `localhost`/`127.0.0.1`/`[::1]`                                                              | 0.1d                      | none                                             | no                      |
| 19   | mobile  | W3-mobile-storekit           | L2    | StoreKit IAP wiring (`expo-in-app-purchases` or RevenueCat)                                                          | 4-6d                      | App Store Connect setup                          | no                      |
| 20   | desktop | R-DESKTOP-007                | L3    | Default `settings.json` to local provider + Qwen3-4B; drop `llama4-maverick` literal                                 | 0.5d                      | verify against current `main`                    | no                      |
| 21   | desktop | R-DESKTOP-009                | L3    | Per-tool consent UI for filesystem MCP (match `213_…png`); surface inline in chat                                    | 2-3d                      | none                                             | no                      |
| 22   | mobile  | W3-06                        | L1    | Model-tier usage warning banner above composer                                                                       | 1-2h                      | none                                             | no                      |

**P1 backlog (next 30 items, by surface — not enumerated in detail here; cite the individual reports for spec):**

- Web (W1): 5 items — split-screen login (W1-01), pricing tabs IA (W1-02), pricing plan illustrations (W1-03), API token pricing tab (W1-04), plan comparison table (W1-05).
- Desktop (W2a/W2b/W2c): ~14 items — Cowork mode UI (W2a-03), Code mode UI (W2a-04), notify-when-done banner (W2b-03), artifact creation wizard (W2b-04), effort picker (W2b-05), permission-mode menu (W2b-06), usage popover (W2b-07), repo selector (W2b-08), skills directory modal (W2b-09), connectors directory modal (W2b-10), bulk-select chats (W2b-11), open in system app (W2c-03), download all (W2c-04), PDF renderer (W2c-06), per-tool consent surface (R-DESKTOP-009 cross-listed P0).
- Mobile (W3): 5 items — Usage dual progress bars (W3-07), Shared links screen (W3-08), Capabilities 6 toggles (W3-09), Speech language picker (W3-10), composer placeholder branding (W3-11).
- CLI (W4): 4 items — `/debug` (W4-01), `/remote-control` (W4-02), `/tui` toggle (W4-03), `/powerup` (W4-04). Plus W4-FG-02/03/04/05 wiring fixes.
- Chrome ext (W5): 5 items — Act/Ask toggle (W5-01), inline permission prompt (W5-02), offline onboarding (W5-02b), Tasks concept (W5-03), Options page (W5-05), cookies permission removal (W5-05b), Quick mode (W5-06).
- VS Code ext (W6): 3 items — `rewindLast` real impl (W6-00), Thinking toggle (W6-01), Account & usage entry (W6-02).

---

## §8. Anti-patterns to enforce going forward

These are the operating principles that should be added to `AGENTS.md` and the per-surface `AGENTS.md` files, enforced via CI gates where possible.

### AP-01 — Code-centric verification (no simulators, no computer-use for routine audits)

- **Rule:** Static analysis + source reading + (where needed) cloud-deployed Playwright is sufficient for parity audits. Reserve computer-use for runtime-blocker hunts only (like R-DESKTOP-001 boot probe).
- **Why:** R26-PARITY round confirmed code-centric is more reliable; computer-use lanes hit MCP availability issues mid-round.
- **How to apply:** Default to Read + Grep + Playwright cloud-fetch. Computer-use needs explicit user authorization for the lane.

### AP-02 — No hardcoded colors → design tokens

- **Rule:** No hex literals (`#hex`), `rgb()`, `hsl()`, or CSS named colors in `apps/web/`, `apps/desktop/`, `apps/mobile/`. Every color must reference a named token (`--color-cream-100`, `--color-terra-cotta-*`, NativeWind tokens, Ratatui palette names).
- **CI gate:** Existing per-feedback memory `feedback_no_hardcoded_colors.md` is AUTHORITATIVE. Add explicit ESLint + clippy + `pnpm check:no-hex-literals` script.

### AP-03 — No hardcoded model IDs → `packages/types/src/models.json`

- **Rule:** Every model-ID-like string in any `apps/*/src/` or `apps/*/lib/` file must resolve through `getModelById()` / `getCoreManualModelOptions()` / catalog helpers.
- **CI gate:** New `apps/web/scripts/check-marketing-models.ts` (proposed in R-WEB R26-PARITY-RUNTIME-WEB-11). Extend to `apps/desktop/src/` and `apps/mobile/src/`.
- **Allowlist:** Brand-only display names (`Claude Opus`, `GPT`) declared explicitly in a single `BRAND_ONLY_MODEL_NAMES` const.

### AP-04 — All boot promises require `Promise.race([init, timeout])` + error UI

- **Rule:** Any IPC, `fetch`, or other async call reaching React/Vue/Native render via Suspense must be wrapped in a timeout with an explicit error-state fallback.
- **CI gate:** Lint rule that catches `<Suspense>` without a sibling `ErrorBoundary` or timeout pattern in the closure.
- **Documentation:** Add a `docs/engineering/boot-checklist.md` enumerating every boot IPC across surfaces with mandatory timeout + retry + error-UI columns.

### AP-05 — Cloud-first verification (don't run heavy builds locally)

- **Rule:** Per existing `feedback_cloud_first_verification.md`. Heavy builds (`pnpm build`, `cargo build --release`) and parallel-agent dispatch run in CI/cloud. Local CLI used only when work touches `~/Desktop/reference/`.
- **How to apply:** Future audits push to CI; trigger `/ultrareview`, `vercel:deploy`, `/schedule`. Do not invoke `pnpm dev` ad-hoc.

### AP-06 — No placeholder/fixture data in production surfaces

- **Rule:** Any `Math.random()` in `apps/*/src/features/*.tsx` requires a `// FIXTURE` sibling comment + tracking issue link. Same for fake `setInterval` progress bars.
- **CI gate:** `grep -RE "Math\.random\(\)" apps/*/src/features/` → fail if no `// FIXTURE` comment within 3 lines.

### AP-07 — IPC client name must match server registry (cross-language type guard)

- **Rule:** Extend `packages/types` to emit a `tauri-commands.ts` listing all registered Rust commands at build time. Frontend `invoke('X', ...)` calls are type-checked against this list.
- **Same pattern for CLI:** every `HookEvent` variant must have a `run_hooks(HookEvent::X, ...)` call site.

### AP-08 — Plugin/skill catalog cannot be hardcoded arrays in UI files

- **Rule:** Composer-level menus (PlusMenu, AddToChat sheet, etc.) MUST read from a live store. Hardcoded `SKILLS_LIST = [...]` / `CONNECTORS = {...}` is forbidden outside of `.stories.tsx` / `.test.tsx`.
- **CI gate:** Code-search for `(SKILLS|CONNECTORS|PLUGINS|MODELS)_LIST\s*=` outside test files → fail.

### AP-09 — Lock files are source-of-truth at build time

- **Rule:** Build artifacts (`settings.json` defaults, `Info.plist`, `app.config.js`) cannot contradict the latest dated lock file.
- **CI gate:** A `scripts/check-locks.ts` that diffs build artifacts against `memory/locks/*.md` and fails the build on contradiction. Add a `LOCK_VERSION` constant bundled into binaries for runtime QA verification.

### AP-10 — Single source of truth for product/locks/agent context

- **Rule:** Per existing `CLAUDE.md` and `AGENTS.md` — repo `AGENTS.md` + scoped `AGENTS.md` + `docs/agent-context/` are canonical. Memory files are durable user preferences, not product specs.
- **How to apply:** Reports cite paths to repo files; do not store findings in agent memory.

---

## §9. Methodology notes

### Mid-round methodology shift (2026-05-22)

This round began with computer-use lanes (R-DESKTOP, V-WEB-VISUAL). Mid-round, the user directed a **code-centric methodology** for Wave 2+:

- All verification via source reading + typecheck (cloud CI) + static analysis
- NO computer-use, NO browser-driving (chrome-mcp/playwright), NO simulators for routine parity work
- User manually tests deployments and reports gaps
- Findings only verifiable by running the app → tag `NEEDS_USER_MANUAL_TEST`

**What was done with computer-use (this round only):**

- R-DESKTOP empirically verified the boot hang via macOS `screencapture` + `osascript` + `curl` probes. This is the single most load-bearing finding of the round.
- V-WEB-VISUAL used Playwright (a code-centric DOM tool, not computer-use) to capture pixel-level screenshots for L1 visual analysis. The teammate flagged this lane as borderline; the value (G11 dark `/projects` would have been invisible to text-only audit; the 307 redirect at `/chat` overturns the R-WEB filesystem-only finding) justifies the trade-off.

**What Wave 3+ will be:**

- Code-only. Implementer lanes work from this synthesis. Each implementer touches a single surface or a single pattern (AP-XX) at a time.
- Verification gates remain: `cargo check --workspace`, `pnpm typecheck`, `cargo test` after each round.

### R-WEB vs V-WEB-VISUAL contradiction (load-bearing)

V-WEB-VISUAL §A6 and §V-WEB-VISUAL-13 found:

- Network capture for `[GET] https://agiworkforce.com/chat` returns **`307` Temporary Redirect** to `/login?redirectTo=%2Fchat`.
- R-WEB Section 4 row 1 concluded: "no `middleware.ts` → empty SSR for `/chat`."

V-WEB-VISUAL's evidence is primary-source (live network log). R-WEB's reading is filesystem-only and may still be technically correct (no `apps/web/middleware.ts` file exists), but the _conclusion_ ("logged-out visitors see empty SSR") is wrong — some server-side mechanism (route handler, `vercel.json` rewrite, or page-level `redirect()`) IS issuing the 307.

**Action:** R-WEB Section 4 row 1 must be corrected. V-WEB-VISUAL-13 (0.5h) identifies the mechanism. Both audits remain valid as-written for everything else; this row alone needs a follow-up edit.

### Confidence labels per report

- **R-DESKTOP-001 (boot hang)** — empirically verified (curl + screencapture). Highest confidence.
- **W2a/W2b/W2c desktop** — source-reading + IPC registry diff. High confidence; runtime not verified (no `pnpm tauri dev` per cloud-first rule).
- **W3 mobile** — source-reading + native file inspection. High confidence on `feedback_cloud_first_verification` items. Some items tagged `NEEDS_USER_MANUAL_TEST` for runtime confirmation on TestFlight.
- **W4 CLI** — source-reading + IPC fire-site grep. High confidence; the 9 dead hook events are an unambiguous empirical claim.
- **W5 chrome ext** — source-reading + manifest inspection. High confidence.
- **W6 VSCode ext** — source-reading + command-registry inspection. High confidence.
- **W1 web (source)** — source-reading + i18n consumer grep. High confidence.
- **R-WEB (runtime)** — WebFetch text-only. Medium confidence on visual claims; high on text content. V-WEB-VISUAL fills the visual gap.
- **V-WEB-VISUAL** — Playwright fresh-browser + side-by-side PNG comparison. High confidence on every visual axis except where claude.ai live capture differs from the 2026-05-15 reference (the chat-input teaser regression on Claude's side).

---

## §10. NEEDS_USER_MANUAL_TEST inventory

These items cannot be verified by source reading alone; the user must run the deployed surface and report.

| ID                       | Surface                   | What to test                                                                                           | Why source-reading isn't enough                                      |
| ------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| W3-03                    | mobile artifacts          | Is the 2-col grid + skeleton + "Get inspired" banner actually rendered?                                | Layout depth not confirmed in W3 audit; need to see runtime          |
| W3-13                    | mobile projects           | Does each project card show last-updated relative timestamp?                                           | Data exists; UI consumption unverified                               |
| W2a-09                   | desktop composer voice    | Does the mic button actually capture audio + transcribe via on-device STT?                             | `voiceInput.ts` not directly read; depends on installed speech model |
| W2a-06                   | desktop connectors OAuth  | Does the OAuth consent dialog match `P20` Slack-grant-access fidelity?                                 | Pixel-level only                                                     |
| W2a-07                   | desktop plugins           | Does `.mcpb` drag-to-install actually install?                                                         | UX flow not source-readable                                          |
| W2a-08                   | desktop artifacts         | Does ArtifactsGallery render the expected list/filter/open UI?                                         | Not fully traced in W2a                                              |
| W2b-PROJECT-FILE-PREVIEW | desktop projects          | Does inline file preview modal exist (P161 `claude-max20x`)?                                           | Component existence not confirmed                                    |
| R-DESKTOP-011            | desktop overlay           | Does Cmd+Shift+Space trigger the floating overlay window? (Audit did not test to avoid stealing focus) | Hotkey behavior not source-verifiable                                |
| W3-ONBOARDING-INIT       | mobile MMKV               | Is `initMmkvEncryption()` called early enough in `_layout.tsx`?                                        | Runtime ordering only                                                |
| W3-PUSH-BACKEND          | mobile notifications      | Do remote push tokens actually reach `/api/mobile/push-token`?                                         | Backend endpoint existence + EAS project ID configuration            |
| W1-WEB-OTEL              | web telemetry             | Are OTel spans actually emitted?                                                                       | Depends on production `instrumentation.ts` presence                  |
| W2a-OTEL-SDK             | desktop telemetry         | Same as W1-WEB-OTEL                                                                                    | Same                                                                 |
| W2c-REACT-PREVIEW        | desktop artifacts offline | Does React artifact preview fail gracefully offline (CDN unreachable)?                                 | Offline behavior not source-verifiable                               |
| W2c-OAUTH                | desktop connectors        | Does any OAuth connector actually complete on a fresh machine without `GITHUB_CLIENT_ID` etc?          | Build-environment dependency                                         |

---

## §11. Implementation phase (PROPOSED — awaits user OK)

Surface-by-surface batches. Effort = wall-clock for a single subagent per surface; assumes parallel dispatch. NO implementation lanes spawned by this synthesis.

### Batch 1 — Production blockers (target: 5-7 days, parallel)

| Subagent              | P0 items                                                                                                                                                                                                                                                                                                                                                               | Wall-clock |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `desktop-engineer`    | R-DESKTOP-001 (boot timeout), W2a-PRO-00A (synthetic user_id), W2a-PRO-00B (`upload_file` IPC), R-DESKTOP-002 (signing — depends on Dev cert), R-DESKTOP-003 (menu bar), R-DESKTOP-005 (ATS narrow), R-DESKTOP-006 (cloud IPC strip), R-DESKTOP-007 (settings defaults), R-DESKTOP-009 (filesystem consent)                                                            | 5-7 days   |
| `mobile-engineer`     | W3-mobile-model-download (real downloader), W3-06 (model-tier warning banner), W3-01 (recents=10), W3-02 (New badge), W3-05 (placeholder), W3-12 ("Chats" plural)                                                                                                                                                                                                      | 4-5 days   |
| `web-engineer`        | W1-WEB-00A (waitlist gate), W1-WEB-00B (annual/yearly), R-WEB-01 (SurfaceShowcase fix), R-WEB-02 (gpt-5.5 bump), V-WEB-VISUAL-04 (`/projects` theme fix), V-WEB-VISUAL-05 (Newsreader font wiring), V-WEB-VISUAL-01 (split-pane login), V-WEB-VISUAL-03 (`$/MTok` on `/providers`), V-WEB-VISUAL-02 (feature-comparison matrix), V-WEB-VISUAL-10 ("Contact sales" nav) | 5-6 days   |
| `cli-engineer`        | W4-CLI-hooks-dead (9 fire sites: `UserPromptSubmit`, `AfterMessage`, `PlanModeChanged`, `PermissionRequest`, `Notification`, `Stop`, `WebhookReceived`, `FileChanged`, `DaemonStopped`)                                                                                                                                                                                | 4-5 days   |
| `chrome-ext-engineer` | (no P0 production blockers — P1 work batches later)                                                                                                                                                                                                                                                                                                                    | n/a        |
| `vscode-ext-engineer` | (no P0 production blockers — P1 work batches later)                                                                                                                                                                                                                                                                                                                    | n/a        |

### Batch 2 — App Store / TestFlight readiness (target: 5-7 days, sequential after Batch 1)

| Subagent           | Items                                                                           | Wall-clock |
| ------------------ | ------------------------------------------------------------------------------- | ---------- |
| `mobile-engineer`  | W3-mobile-storekit (StoreKit IAP wiring, RevenueCat or `expo-in-app-purchases`) | 4-6 days   |
| `desktop-engineer` | R-DESKTOP-004 (in-app updater)                                                  | 1-2 days   |

### Batch 3 — Cross-surface pattern enforcement (target: 3-5 days, parallel)

Per anti-patterns AP-01 through AP-10:

| Subagent              | CI/lint work                                                                                                | Wall-clock |
| --------------------- | ----------------------------------------------------------------------------------------------------------- | ---------- |
| `web-engineer`        | AP-03 model ID drift CI (`apps/web/scripts/check-marketing-models.ts`), AP-08 PlusMenu hardcoded-array lint | 2 days     |
| `desktop-engineer`    | AP-07 Tauri command type guard (extend `packages/types`), AP-09 lock-vs-build CI script                     | 2-3 days   |
| `mobile-engineer`     | AP-02 no-hex-literals NativeWind audit, AP-06 fixture-data lint                                             | 1-2 days   |
| `cli-engineer`        | AP-07 `HookEvent` fire-site CI gate                                                                         | 1 day      |
| `vscode-ext-engineer` | W6-00 `rewindLast` real impl                                                                                | 1-2 days   |
| `chrome-ext-engineer` | W5-04 batch counter, W5-05b cookies permission removal                                                      | 0.5 day    |

### Batch 4 — P1 parity (target: 2-3 weeks, mostly parallel)

Driven by the per-surface report P1 sections:

- `web-engineer` — V-WEB-VISUAL-06/07/08/09/11/12 (pricing tabs, enterprise card layout, OAuth icons, wordmark, plant illustrations, breadcrumb). Plus W1-01 thru W1-08.
- `desktop-engineer` — W2a-03/04 (Cowork+Code mode UIs), W2b-03/04/05/06/07/08/09/10/11/12, W2c-03/04/05/06.
- `mobile-engineer` — W3-07/08/09/10/11, W3-PUSH-BACKEND (needs backend coordination).
- `cli-engineer` — W4-01 (`/debug`), W4-02 (`/remote-control`), W4-03 (`/tui`), W4-04 (`/powerup`), W4-FG-02/03/04/05.
- `chrome-ext-engineer` — W5-01 (Act/Ask toggle), W5-02 (inline permissions), W5-02b (offline onboarding), W5-03 (Tasks), W5-05 (Options page), W5-06 (Quick mode).
- `vscode-ext-engineer` — W6-01 (Thinking toggle), W6-02 (Account & usage), W6-07 (Shift+Tab mode cycle).

### Gating before any Batch starts

1. **User decisions on LC-01 (W6 cloud history), LC-02 (CLI hook lock 22 vs 19), LC-03 (brand naming).**
2. **Verify R-DESKTOP §3 lock-violation findings against current `main`** — installed binary predates locks by 19 days. If `main` already complies, skip R-DESKTOP-006/007 source patches and run rebuild-only.
3. **V-WEB-VISUAL-13** — identify the `/chat` 307 mechanism and correct R-WEB §4 row 1.

---

## §12. File summary

This synthesis was produced from 11 audit reports totaling ~530KB:

| Report                                             | Size  | Lane                             |
| -------------------------------------------------- | ----- | -------------------------------- |
| `2026-05-22-claude-parity-w1-web.md`               | 42 KB | W1 source web                    |
| `2026-05-22-claude-parity-w2a-desktop-pro.md`      | 79 KB | W2a desktop pro/free             |
| `2026-05-22-claude-parity-w2b-desktop-max.md`      | 40 KB | W2b desktop max20x               |
| `2026-05-22-claude-parity-w2c-desktop-platform.md` | 38 KB | W2c desktop connectors+artifacts |
| `2026-05-22-claude-parity-w3-mobile.md`            | 37 KB | W3 mobile iOS                    |
| `2026-05-22-claude-parity-w4-cli.md`               | 96 KB | W4 CLI                           |
| `2026-05-22-claude-parity-w5-chrome-ext.md`        | 35 KB | W5 chrome extension              |
| `2026-05-22-claude-parity-w6-vscode-ext.md`        | 38 KB | W6 vscode extension              |
| `2026-05-22-claude-parity-r-web.md`                | 26 KB | R-WEB runtime web                |
| `2026-05-22-claude-parity-r-desktop.md`            | 36 KB | R-DESKTOP runtime desktop        |
| `2026-05-22-claude-parity-v-web-visual.md`         | 50 KB | V-WEB-VISUAL pixel-level visual  |

Per-surface report paths (absolute):

- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w1-web.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w2a-desktop-pro.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w2b-desktop-max.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w2c-desktop-platform.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w3-mobile.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w4-cli.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w5-chrome-ext.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-w6-vscode-ext.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-r-web.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-r-desktop.md`
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/2026-05-22-claude-parity-v-web-visual.md`

Screenshot artifact directories:

- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-r-desktop-screenshots/` (runtime AGI vs Claude)
- `/Users/siddhartha/Desktop/agiworkforce/docs/audit/r26-parity-v-web-screenshots/` (visual web side-by-side)

Lock files consulted:

- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks/v1-local-only-cloud-waitlist-2026-05-18.md`
- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks/rule-models-json-canonical.md`
- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks/v1-model-selection-final-2026-05-18.md`
- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks/brand-agi-2026-05-15.md`

Feedback memories (authoritative):

- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/feedback_code_centric_verification.md` (referenced)
- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/feedback_no_hardcoded_colors.md` (referenced)
- `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/feedback_cloud_first_verification.md` (referenced)

---

_Synthesis grounded in 11 source reports + lock cross-reference + V-WEB-VISUAL Playwright screenshots + R-DESKTOP curl probes. No new findings introduced beyond what the per-lane reports established, except (a) the cross-surface pattern naming (§4 patterns A-J), (b) the R-WEB ↔ V-WEB-VISUAL reconciliation flag (§9), (c) the proposed CI/anti-pattern gates (§8 AP-01 through AP-10). All implementation phase items in §11 await user authorization; no subagents were dispatched._
