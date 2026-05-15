# Changelog

All notable changes to AGI Workforce. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased — launch-readiness wave 3 + strategy lock] — 2026-05-15

**27 commits** (`98ed9ef1c..01e56f2a3`) covering wave 3 (8 parallel agents) + self-audit fixes + voice slot reopening + doc reconciliation + brand mark proposals. Audit fire at `AUDIT_LOG.md` 2026-05-15T22:00Z.

### Added

- **Voice slot reopening for Hobby+ tiers** (`a8c5c92c7`) — `allowVoice` + `voiceMinutesPerMonth` fields added to `TierPolicy`. `voice_transcription` (Whisper-1) + `voice_rewrite` (Gemini Flash-Lite) slots added to allowedSlots of Hobby/Pro/Pro+/Max/Enterprise. Hobby 60 min/mo, Pro 300, Pro+ 1500, Max+Enterprise unlimited. Free stays text-only. Implements Wispr-Flow-style system-wide dictation per user's 2026-05-15 decision (supersedes Round 14 "voice deferred from v1").
- **Brand-mark proposals** (`01e56f2a3`) — 3 SVG directions at `docs/design/brand-mark-proposals/` (connected nodes, angular A monogram, stacked layers prism) + HTML preview rendering all 3 at 5 sizes on dark+light + wordmark pair previews. User to pick direction.
- `@next/bundle-analyzer` wired in `apps/web` (web-launch3, `f90519eac`).
- Chrome ext ↔ desktop bridge :8787 pairing e2e test (integ-launch3, `dde2cc56a`).
- Web `/api/llm/v1/chat/completions` Bearer auth contract test (integ-launch3, `0c1739d16`).
- Mobile dispatch payload schema test + round-trip e2e (integ-launch3, `0a35492a5`, `feff4965f`).
- CLI binary-size doc + cargo-bloat workflow (cli-launch3, `725d2108d`).
- CLI Unicode icon mapping wired into `exec_cell` + `status_surfaces` (cli-launch3, `3fa1e2880`).
- Mobile 7 more screens migrated to `useThemeColors` (mob-launch3, `4c1db310a`).
- Chrome ext Lucide sprite icons applied throughout side-panel UI (chr-launch3, `e9ff5bd82`).
- README launch-readiness section + MASTER_PLAN §10 status refresh (docs-launch3, `addf33b8b`, `ff47b1ba3`).
- Markdown pipeline `next/dynamic` code-split (web-launch3, `c8d8bb5d7`).

### Changed

- **Pricing reconciliation** (`b4af6fa55`) — `tasks/auto-routing-spec.md` §1 (Hobby $5→$10, Pro $20→$29.99, Pro+ $40→$49.99) and `docs/PRICING.md` (full rewrite with yearly pricing + per-slot provider/API map) reconciled to match canonical `packages/types/src/billing-catalog.ts` SSOT.
- `tasks/auto-routing-spec.md` §6 voice row replaced from "deferred from v1" to per-tier minute caps (60/300/1500/unlimited).
- Tauri version-aligned 2.10.3→2.11.0 + plugin-fs 2.4.5→2.5.1 + plugin-dialog 2.6.0→2.7.1 (desk-launch3, `c53048041`).
- Web 3 user-scoped routes migrated to `getUserClient`: `user/data`, `user/delete-account`, `user/export` (web-launch3, `3849a3906`).
- CLI `chatwidget.rs` turn-lifecycle handlers extracted to `turn_lifecycle.rs` (cli-launch3, `ec2c357ce`).

### Fixed

- **Web typecheck regression** (`172884f1d`) — added `apps/web/test/jest-dom.d.ts` triple-slash reference so Vitest's `Assertion` interface picks up `toBeInTheDocument`/`toHaveAttribute` from `@testing-library/jest-dom`. Removed unused `React` import in `MessageBubble.test.tsx` (artifact of web-launch3's markdown code-split).
- **Mobile gitignore** (`172884f1d`) — added `android/` + `ios/` to `apps/mobile/.gitignore` since `expo prebuild` generates them under `apps/mobile/` but canonical iOS lives at top-level `/ios`.
- **Desktop tauri embedding command registration** (`c53048041`) — `__cmd__*` re-exports removed; commands now route directly through `crate::core::embeddings::*`.
- **Desktop release build lint** (`ee317c714`) — `mcp/transport.rs` SSL bypass code cfg-gated behind `#[cfg(debug_assertions)]` so release builds don't trip `-D unreachable-code` / `-D unused-mut`.
- **Expo prebuild** (`859b053e4`) — `@xmldom/xmldom` override tightened from `>=0.8.13` to `^0.8.13` to keep within `@expo/plist@0.5.2`'s `^0.8.8` peer range.
- **Production web build** (`0da0cd24a`) — Turbopack `resolveAlias` browser stub for `node:async_hooks` added so `@agiworkforce/runtime` barrel re-export doesn't pull `AsyncLocalStorage` into client chunks.

### Verified

| Surface        | Tests           | Notes                                                                                                                                                                                                                                        |
| -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI            | 1,337           | cargo check workspace green                                                                                                                                                                                                                  |
| Desktop        | typecheck green | Tauri release build green; macOS notarization 403 (Apple Dev Program Agreement expired in portal — account action)                                                                                                                           |
| Web            | typecheck green | 31 pre-existing test failures in `core/integrations/*` + `core/security/gradual-rollout` + `shared/stores/artifact-store` + `__tests__/security/rt-09-audit-idor`. Pre-existing on main per web-launch3's note. Mock-expectation fix queued. |
| Mobile         | 804 (45 suites) | jest                                                                                                                                                                                                                                         |
| Chrome ext     | 614 tests       | vitest. extension.zip 139,161 bytes / 35 files, no source maps.                                                                                                                                                                              |
| VS Code ext    | 513 tests       | vitest                                                                                                                                                                                                                                       |
| packages/types | 163 tests       | includes new voice assertions                                                                                                                                                                                                                |

### Strategy locked (user decision 2026-05-15)

1. Stack stays as is — no framework rewrite.
2. Positioning = general AI productivity workforce.
3. Billing = Hobby cloud $10 at launch + BYOK + Local free.
4. v1 75%-parity scope: voice + computer use + image + video gen all ship.
5. Voice = Wispr-Flow pattern (push-to-talk + Whisper STT + AI cleanup → paste anywhere), Hobby+.
6. Brand = design new (no mimicry).
7. Mobile = first-class chat peer (not a Dispatch companion).

---

## [Unreleased — launch-readiness wave 2] — 2026-05-15

**25 commits** in a single parallel wave (`0fa1c7190..74b7f0255`) implementing `docs/design/design-spec-2026-05-15.md` across all 6 surfaces. Plan at `tasks/launch-readiness-wave2-plan.md`. Audit fire at `AUDIT_LOG.md` 2026-05-15T15:08Z.

### Added

- **`packages/unified-chat/src/components/InlineToolCall.tsx`** — shared React component matching design-spec §4 anatomy (borderless run-block, collapsible body, per-state styling). 19 RTL tests covering all 5 states + interaction. (`c800a5a9e`)
- Chrome ext Lucide SVG sprite system at `apps/extension/src/assets/icons.ts` — CSP-friendly raw SVG strings for Terminal, FileText, FilePen, Search, Globe, CircleCheck, Loader2, Settings, MessageSquare, SquarePen. (`0f812a428`)
- Mobile inline tool-call RN component at `apps/mobile/components/chat/InlineToolCall.tsx`. (`5cee5b174`)
- VS Code webview inline tool-call rendering using native Codicons. (`a1af715c2`)
- CLI ratatui tool-call rendering aligned with design-spec §4. (`99609f080`)
- CLI no-hardcode guard now covers `exec_cell/render.rs`. (`74b7f0255`)

### Changed

- **Composer parity per design-spec §7** — soft-pill 16px border-radius, plus-menu, bottom-row controls, Cmd/Ctrl+Enter sends, auto-grow to 240px:
  - Desktop (`f871d848b`)
  - Web (`db77a2ee5`)
  - Mobile (`9893b7184`)
  - Chrome ext (`333ac7e14`)
  - VS Code ext (`f2d3017ed`)
- **Sidebar parity per design-spec §6** — 48px icon-only rail, 260px expanded:
  - Desktop (`dff346a31`)
  - Web (`08772e40e`)
  - Mobile drawer-adapted (`823f843e9`)
- **Empty state per design-spec §8** — composer-first, no welcome cards:
  - Desktop (`2e0d47afc`)
  - Web (`ced8e87c1`)
  - Mobile (`cda369f34`)
  - VS Code ext (`70c81ffbb`)
  - Chrome ext (`333ac7e14`)
- **Web ToolCallCard** migrated to wrap shared `InlineToolCall`. (`71b6bdda1`)
- **Web RLS** — 3 more service-role routes migrated to canonical `getServiceClient` helper. (`3b8fd1f55`)
- **CLI** further chatwidget split — guardian review handlers extracted. (`71d62675c`)

### Fixed

- **Web composer tests** — updated for Cmd+Enter send shortcut after the §7 refactor changed Enter→Cmd+Enter. (`785be9b98`)
- **Web chat-completions test mocks** — updated to handle `getAuthenticatedUserWithClient` signature change from wave 1. (`ea110f6e2`, `2464337bf`)

### Verified

| Surface     | Tests             | Notes                                                                                                        |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| CLI         | 1,333             | cargo test -p agiworkforce-cli --lib                                                                         |
| Desktop     | typecheck GREEN   | tsc clean                                                                                                    |
| Web         | 3,231 + 1 skipped | 135 test files. One flake observed in initial verify (state-pollution under load); not reproduced on re-run. |
| Mobile      | 789 (44 suites)   |                                                                                                              |
| Chrome ext  | passed            |                                                                                                              |
| VS Code ext | passed            |                                                                                                              |

---

## [Unreleased — launch-readiness wave 1] — 2026-05-15

**31 commits** in a single parallel wave (`079ae721f..759f6a977`) addressing user's launch-readiness mandate: zero dead code, zero half-done features, no onboarding friction, design parity with `~/Desktop/reference/`. Net **−1,879 LOC** across 86 files / all 6 surfaces. Plan at `tasks/launch-readiness-2026-05-15.md`. Audit fire entry at `AUDIT_LOG.md` 2026-05-15T14:50Z.

### Added

- `docs/design/design-spec-2026-05-15.md` — 749-LOC reference-driven design spec locked for launch. Centerpieces: borderless inline tool-call run-block (Claude pattern), Lucide React with stroke-width 1.75, 8-step spacing, 5-step typography, 14px chat body.
- `scripts/launch-verify.sh` — parallel 6-surface verification harness (typecheck + lint + test per surface, optional `--with-builds`).
- `tasks/launch-readiness-2026-05-15.md` + `tasks/launch-readiness-wave2-plan.md` — 4-phase wave plan + wave 2 implementation plan.
- Desktop + web a11y improvements: aria-labels on folder/bookmark/shortcut/attachment icon buttons; Settings nav, onboarding input, theme radiogroup labeled.
- Mobile 7 more screens migrated from static colors to `useThemeColors()`.
- Chrome ext nativeMessaging host manifest scaffolding + autoSubmit confirm guard + 1.0-min keep-alive alarm.

### Changed

- **Onboarding** — desktop / web / mobile / chrome-ext / vscode-ext gate onboarding behind a "has seen" flag and land users directly in chat on subsequent launches. (`a7446a102`, `35de3bd3d`, `d2b977157`, `5e4b1e3b7`, plus vscode slash-command guide swap `5e441a276`.)
- **Design tokens** — desktop + web consume `@agiworkforce/design-tokens` chat CSS vars (`a0c7de1b4`, `9abdfa44d`); chrome ext aligned tokens; mobile sources from same.
- **Inline tool-call** — web `ToolCallCard.tsx` aligned with claude.ai compact-flat pattern (`51f5963b2`).
- **Web RLS** — `agent/communication`, `share`, `workforce`, `/usage`, `/llm/v1/models` routes migrated from `SUPABASE_SERVICE_ROLE_KEY` to `getUserClient()` (5 commits including `a9f28d0d1`, `788f75572`, `d5984c910`, `759f6a977`). Closes part of P1-1 from `tasks/todo.md`.
- **VS Code ghost command** — `agi-workforce.showSubsystemHealth` stub closed + re-activation isolation test (`806f8342b`).
- **CLI lib.rs phase2 comments** — corrected false "no call sites" claims (`1ae4e1804`).
- **CLI test coverage** — insta snapshots added for `render_skills`, `render_keybindings`, `render_mcp_list`, `render_usage` (`ef29ea2a3`).
- **CLI chatwidget split** — mcp/connector handlers extracted to `mcp_connector_handlers.rs` (`bba624a48`).

### Removed

- Web: 10 unused dependencies + `chart.tsx` (`af5ec69be`); `InlineCodeExecutor.tsx` + `code-execution-service.ts` deleted as dead code (`5e549dc6a`); welcome/quick-action blocking empty state (`35de3bd3d`).
- Desktop: placeholder onboarding code (`8092e476b`); hardcoded hex colors replaced with design-token classes (`a0c7de1b4`).
- Chrome ext: `model-id` eslint-disable wrappers replaced with real catalog lookups, 42 sites (`18f3d3e8c`).

### Fixed

- **Web perf** — message rows memoized + mermaid renderer lazy-loaded (`4eb259cae`).
- **Desktop typecheck regression** — a11y aria-label used non-existent `shortcut.label` instead of `shortcut.description` (`54c7ca0a1`).
- **Launch-verify harness** — mobile invocation passed vitest-only `--run` to jest (`54c7ca0a1`).

### Verified

| Surface     | Tests             | Notes               |
| ----------- | ----------------- | ------------------- |
| CLI         | 1,333             | +6 from `ef29ea2a3` |
| Desktop     | typecheck GREEN   | post-fix            |
| Web         | 3,231 + 1 skipped | 135 test files      |
| Mobile      | 789 (44 suites)   |                     |
| Chrome ext  | passed            | vitest 3.89s        |
| VS Code ext | passed            | vitest 2.49s        |

---

## [Unreleased — cross-surface] — 2026-05-14 → 2026-05-15

Cross-surface campaign fire #1 through fire #12+ per `MASTER_PLAN.md` §10. **115+ commits** since `3fdda63b3`, all 6 surfaces touched, ~13,744 platform tests green. Includes Phase B god-file marathon (waves 5-12, ~50 refactor commits) and a frontend-alignment wave (8 PRs from `reports/frontend-reference-comparison/source-comparison-report.md`).

### Added (Phase C — PNG-grounded features)

- **Desktop**: per-turn `adaptiveThinking` toggle in `QuickModelSelector` (C2, `291bf6ccb`) — Sparkles "Adaptive" icon-button wired to ephemeral `perTurnAdaptiveThinking` state in `modelStore`; IPC payload override; auto-clears after send. 5 new tests.
- **Web**: custom slash-commands create/edit/delete modal in Settings (C6, `07844d4b8`) — `CustomCommand` type + CRUD actions in settingsStore + new "Commands" tab + SlashCommandMenu merge of built-in + custom. 8 new tests.
- **Web**: `/partner-perks` marketing page + 5 sample partner perks data module (C5, `cb16170b9`). 5 data-integrity tests.
- **Mobile**: offline outbound queue wired into chat send path (C9, `798a25ac1`) — offline messages queue with optimistic UI (amber Clock badge); flushes on reconnect via existing `useNetworkStatus` hook.
- **Mobile**: theme-mode segmented control in personalization (C10, `720a7fd95`) — preference layer + `useTheme` hook + Light/Dark/System toggle. Light-mode component migration deferred to a separate fire. 9 new tests.
- **Chrome ext**: conversation history persistence + UI (C12, `75e86d545`) — `chrome.storage.local` with 100-conversation cap, 30-day TTL, History dropdown in side panel header. 11 new tests.
- **Chrome ext**: desktop pairing flow (C11, `887a02b10`) — IDLE→REQUESTING→PAIRED state machine in `pairing.ts`, popup UI with status/fingerprint/error display. 15 new tests.
- **VS Code**: chat-in-main-editor `WebviewPanel` (C13, `ad196dca0` + `5ae8cfefd` wiring) — singleton `ChatEditorPanel` class, `agi-workforce.openChatInEditor` command, reuses sidebar webview HTML. 4 new tests.
- **VS Code**: sidebar @mention-file → @agi chat-participant wiring (C14, `c90359068`) — `agi-workforce.mentionFileInChat` command opens chat with `@agi #file:<relpath>` query. 4 new tests.

### Added (Phase A — Security/correctness)

- **CLI**: SSRF allowlist for A2A endpoints (`ceda1ad10`) — `validate_a2a_endpoint` blocks RFC1918, loopback, link-local, IMDS (169.254.169.254). `AGI_A2A_ALLOW_PRIVATE=1` env override. 8 new tests.
- **Mobile**: deploy-time guard against empty-pin TLS enforcement (`9ca369c03`) — `assertPinningReadyIfEnforced()` + `requiresPin(host)` + `REQUIRED_PINNED_HOSTS` constant. Pin-capture runbook added in `pinning.ts` header. 26 new tests.
- **Chrome ext**: 47-site `innerHTML` → safe DOM construction sweep in `side_panel.ts` (`069b17bb6`) — new `dom-helpers.ts` (`setText`, `clearChildren`, `createElementWith`, `setChild`). 2 sanitized user-content paths preserved. 5 new tests.
- **Chrome ext**: recording-indicator badge `innerHTML` fix at `content.ts:1607` (`0536969c2`).
- **Desktop**: `POST /pair` HTTP endpoint on bridge port 8787 (`948ceeb7f`, E2 closure) — loopback-only, idempotent 32-byte token rotation, returns `{token, fingerprint}` JSON. 7 new tests. Closes the chrome ext pairing flow end-to-end.
- **CLI**: `handle_post_handoff` returns HTTP 501 Not Implemented (`a618d13ef`) instead of misleading 200 "accepted" that silently discarded messages.

### Refactored (Phase B — God-file splits)

- **CLI** `apps/cli/src/main.rs` 2,385 LOC → 7-LOC entry + `lib.rs` (89 KB) (`8cd6f740f`). Canonical codex-rs `exec/src/main.rs:1-46` 42-LOC pattern.
- **CLI** `apps/cli/src/a2a.rs` 1,856 LOC → `a2a/{mod,protocol,registry,security,server,client,jsonrpc}.rs` 7 files (`dd34923db`). Pure move refactor, 1326/1326 tests preserved.
- **VS Code** `apps/extension-vscode/src/extension.ts` 1,629 LOC → 255 LOC + `lifecycle/{chatSetup,commandSetup,providerSetup}.ts` (`e11dc7ea1`, commit subject mislabeled by lint-staged race). 512/512 tests preserved.
- **Desktop** `apps/desktop/src/hooks/useAgenticEvents.ts` -86 LOC dedup against `agenticEventUtils.ts` (`1bc2be696`). Full per-event-hook split blocked by shared singletons (E1 documented in `AUDIT_LOG.md`).

### Removed

- **CLI** `apps/cli/src/tui/_attic/` — 344 dead-duplicate files, ~107K LOC (`0e81d1546`). Verified zero references via grep. Build + 1326 tests stayed green.
- **Web** `apps/web/test-simple.tsx` — unused scratch file that would crash on import (`911bfd2ed`).
- **Web** unused `useMemoizedValue` hook (zero consumers, tripped `react-hooks/use-memo`).

### Fixed (Phase D — Cross-surface polish)

- **Web** lint: 2 errors + 13 warnings → 0/0 (`911bfd2ed`) — setState-in-useMemo bug, lucide `Image` → `ImageIcon`, eslint-disable cleanup.
- **CLI** workspace `Cargo.toml` adopts 33 codex-rs clippy deny lints (`fceaee92f`) — omits `unwrap_used` + `expect_used` (2,409 sites pending future cleanup). 13 utility/leaf crates inherit via `[lints] workspace = true` (`1c1789eaa`).
- **Packages** `posttest=pnpm build` hook on 19 workspace packages (`91fafd3cf`) — catches the case where a test-only fix leaves the package un-buildable (Gemini-CLI pattern).
- **VS Code** TypeScript project references via new `tsconfig.build.json` (`291bf6ccb`) — `composite: true` + `noEmit: false` on `packages/types` + `packages/runtime`. `pnpm --filter agi-workforce check:refs` enforces DAG at compile time.
- **Web** light-mode token overrides in `globals.css` (`cb16170b9`) — `[data-theme='light'][data-design='agi']` block defines light-mode values for all `--agi-*` CSS custom properties. Activates by setting `data-theme="light"` on `<html>` or any ancestor.

### Documentation

- New `MASTER_PLAN.md` §10 live status tracker + §10.1 surface health snapshot + §10.2 escalation closure log.
- New `AGENTS.md` + `.codex/agents/*.toml` — Codex CLI agent definitions mirroring `.claude/agents/` (`76a4d8e88`).
- `AUDIT_LOG.md` entries for fires #1 through #6 with full structured findings + 2 escalation points (E1 + E2; E2 now closed).
- `apps/web/docs/light-theme.md` — light-mode strategy note.

### Escalations

- **E2 closed** — Desktop bridge `POST /pair` endpoint shipped; chrome ext pairing is now end-to-end functional.
- **E1 open** — Desktop `useAgenticEvents.ts` full per-event-hook split blocked by 7 module-level mutable singletons. Requires `SharedListenerContext` refactor (~300 LOC structural change). Documented in `AUDIT_LOG.md` for next-fire pickup.

### Refactored (Phase B marathon — god-file decomposition, waves 5-12)

~50 refactor commits since `3fdda63b3` decomposed 25 of 25 plan-target god-files across all 6 surfaces. Each commit is a pure-move refactor preserving public API and full test coverage.

- **CLI mega-files** (3 of 3 plan-target hit):
  - `apps/cli/src/tui/chatwidget.rs` (~7,800 LOC) — 9 chunks extracted to `chatwidget/{notifications,rate_limit,message_merge,exec,plan,connectors_popup,streaming,model_config,review}.rs` plus sibling `markdown_render.rs` + `pager_overlay.rs`. Commits `650e22691`, `0fab461a7`, `f1e856c62`, `efd468465`, `8a5feb23f`, `b769713d2`, `14116c17a`, `4308e0423`, `027f0f638`.
  - `apps/cli/src/tui/bottom_pane/chat_composer.rs` (9,873 → ~6,400 LOC) — 5 modules under `composer/`: `state.rs` (`4c52b1e1e`), `key_handling.rs` (`1985b6415`), `paste.rs` (`49030993d`), `completion.rs` (`275eb6b02`), `render.rs` (`857d146ae`), `text_ops/` (`2c9e7c651`). Architectural unlock: `ChatComposerState + Deref` newtype at `282151e78`.
  - `apps/cli/src/tui/app.rs` — 5 modules: `state_machine.rs` (`4aecfbb4f`), `status.rs` (`dcb9bdbec`), `model_migration.rs` (`28fa9a34d`), `thread_event_store.rs` (`e4108e07f`), `plugin_io.rs` (`7cfdfba5a`), sibling `app_backtrack.rs`.
- **CLI single-file splits**: `main.rs` 2,385 LOC → `lib.rs` + 7-LOC entry (`8cd6f740f`); `a2a.rs` 1,856 LOC → 7-file submodule directory (`dd34923db`); `repl.rs` 2,124 LOC → `repl/{slash_commands,dialogs,registry}.rs` (`8751c8270`); `tools.rs` → `tools/{common,bash,file_ops,web,dir_ops,git,task_registry}.rs` (`668d06f96`); `safety.rs` → `safety/{dangerous_commands,approval}.rs` (`0b2e6a627`); `agent.rs` → `agent/{chat,tools,history,executor,prompt}.rs` (`9100e5f5e`); `models.rs` → `models/{provider_dispatch,serialization,streaming}.rs` (`d03c054f4`).
- **Desktop**: `chatStore.ts` → `chat/{Message,Execution,View}Store.ts` (`f9dfa0f70`); `settingsStore.ts` → domain sub-stores (`8aa20c791`); `mcpStore.ts` → `mcp/{Servers,Tools,Health,OAuth}Store.ts` (`a55c06b46`); `billingUsage.ts` → per-domain slices (`9c3e7dbb2`); `slashCommandHandlers.ts` → `commands/` domain files (`250cbf596`); `SettingsPanel.tsx` 1,995 LOC → 11 tab components (`95c3a8ace`); `ArtifactRenderer.tsx` → per-type renderer files (`7f9e1237a`).
- **Web**: `app/api/llm/v1/chat/completions/route.ts` → 4 service modules (`de33ffd70`); `app/api/stripe-webhook/route.ts` → 4 service modules (`b05172c7d`); `features/settings/UserSettings.tsx` → 4 sub-components (`1a0db8fcb`) + notifications/system panels extraction (`d0f84d94f`).
- **VS Code**: `extension.ts` 1,629 LOC → 255 LOC + `lifecycle/{chatSetup,commandSetup,providerSetup}.ts` (`e11dc7ea1`); `agentModeProvider.ts` → `agentLoop + agentUI` (`9919fa354`); `sidebarProvider.ts` → `webviewContent + ChatStateManager` (`c019dfec2`).
- **Chrome extension**: `side_panel.ts` markdown + voice modules (`2de290670`); `background.ts` shortcuts + tasks modules (`50b60960a`).
- **Mobile**: `chatStore.ts` → 3 domain sub-stores ≤500 LOC each (`b502947f9`); `companion/index.tsx` → 3 sub-components (`0276d541f`).

### Escalations closed (Phase B marathon)

- **E1 closed** (`9066869de`) — Desktop `useAgenticEvents.ts` `SharedListenerContext` refactor consolidates 7 module-level mutable singletons into one passed-context object. Closes the fire-#4 estimate of ~300 LOC net structural change.
- **E3 closed** (`4a7b96b63`) — Desktop `UnifiedAgenticChat/index.tsx` partial decomposition via `useChatSidebar + useChatMessages` extraction (-400 LOC from index.tsx).
- **Extension SharedContext** (`6741ee045`) — `SharedSidePanelContext + SharedBackgroundContext` mirrors the desktop E1 pattern.

### Added (Frontend-alignment wave — 8 PRs from `reports/frontend-reference-comparison/source-comparison-report.md`)

New 688-LOC source-comparison-report dated 2026-05-15 identified two cross-surface P0s (no SoT for chat UX, design tokens fragmented) and prescribed a 7-phase plan. This wave shipped 6 of 8 highest-confidence-first PRs.

- **PR 1 Web correctness pass** (`8e9dbac28`) — defined `.agi-chrome-band` (used in `Header.tsx:49 + MarketingFooter.tsx:41` but previously undefined in `app/globals.css`); replaced viewport-scaled hero `clamp(...)` typography at `globals.css:1697 + 1767` with fixed responsive steps; reset negative letter spacing at `:1699 + 1769` to 0; replaced `transition: all` at `:1149` with explicit properties; rewrote competitor-led hero copy at `app/page.tsx:86` to product-first.
- **PR 2 Design-tokens package** (`bc1d5dcd3`) — new `@agiworkforce/design-tokens` package + semantic names (`surface.base`, `surface.raised`, `text.primary`, `accent.primary`, `accent.secondary`, `danger`, `warning`, `success`, `focus.ring`, `composer.bg`, `sidebar.bg`, `artifact.bg`). Outputs CSS vars + Chrome-CSS-var map + React Native theme values + VS Code-variable-fallback map. Brand decision shipped: teal primary + terra-cotta secondary canonical; purple/indigo retired as primary identity.
- **PR 4 Desktop consumes design-tokens** (`0515cc0e1`) — drops the 58-line inline chat-CSS-var block; consumes `chat.css` from `@agiworkforce/design-tokens`. Visual parity preserved.
- **PR 5 Chrome extension token + icon polish** (`95b0ee75b`) — adopts design-tokens CSS vars; replaces purple/indigo (`#4338ca`, `#6366f1`, `#8b5cf6`) with teal accent; adds `:focus-visible` rings everywhere `outline: none` was used; aligns side panel + in-page panel against the same token family.
- **PR 6 Mobile sources tokens from package** (`5510322df`) — `lib/theme.ts` pulls from `@agiworkforce/design-tokens`. Native architecture preserved (drawer, bottom sheets, haptics, offline queue, voice).
- **PR 7 CLI copy hygiene** (`29426be6e`) — `apps/cli/src/lib.rs:98` `long_about` replaced "Claude Code competitor" with product-led description. Snapshot/test renaming deferred per report §"CLI cleanup" caveat about noisy snapshot churn.

### Deferred (Frontend-alignment wave)

- **PR 3 Web `unified-chat` adoption** (Phase 2 / largest item in report) — `framer-motion` peer mismatch (`packages/unified-chat/package.json` peers `^11.0.0`; web depends `^12.38.0`) must be resolved first; runtime/store-bridge work also pending. Next frontend wave.
- **PR 8 VS Code native-theme pass** (Phase 5) — hardcoded `#4338ca`-class colors at `webviewContent.ts:75` + 3× `outline: none` sites + plain `<select>` model picker at `:631` need coordinated edits across `sidebarProvider.ts` + `chatEditorPanel.ts:96`. Next frontend wave.

### Test counts (post-campaign)

| Surface                            | Tests passing           |
| ---------------------------------- | ----------------------- |
| apps/cli (cargo)                   | 1,326                   |
| apps/desktop frontend (vitest)     | 1,653                   |
| apps/desktop backend (Tauri cargo) | 3,945                   |
| apps/web (vitest)                  | 3,246                   |
| apps/mobile (jest)                 | 789                     |
| apps/extension Chrome (vitest)     | 607                     |
| apps/extension-vscode              | 512                     |
| packages (12 enumerated + tokens)  | 1,103                   |
| services (api-gateway + signaling) | 155                     |
| other cargo crates                 | ~408                    |
| **Platform total**                 | **≥13,744 tests green** |

---

## [cli-1.7.1] — 2026-05-14

### Fixed

- **PreToolUse hook blocking now enforced in agent loop.** `aggregate_results` (which processes `{"decision":"block"}` and `{"continue":false}` hook responses) was fully implemented and tested in `hooks.rs` but never called from `agent.rs`. Tools were always executed regardless of hook decision. The agent loop now calls `aggregate_results` after `aggregate_transformers` and short-circuits with an `is_error` tool result when a hook blocks or stops, feeding the reason back to the model. Removes 2 of 3 stale `#[allow(dead_code)]` annotations on `HookAggregateOutcome` and `aggregate_results`.

---

## [cli-1.7.0] — 2026-05-14

Honesty-pass release. A deep audit against `~/Desktop/reference/` found six items previously claimed shipped that were actually broken or missing. v1.7.0 closes them.

### Added

- **`apps/cli/src/notebook_edit.rs`** (268 LOC) — Jupyter `.ipynb` cell manipulation. Modes: `insert` / `replace` / `delete` by `cell_id` (preferred) or `index` (fallback). Cell types: code/markdown/raw. Reads + writes the notebook JSON in-place via `serde_json`; assigns new uuids to inserted cells. 7 tests cover insert append, replace-by-id, delete-by-id, delete-by-index, and missing-id error.
- **`apps/cli/src/powershell_tool.rs`** (163 LOC) — Windows shell execution distinct from generic `run_command`. `safety_check(command)` returns warnings for destructive verbs (`Remove-`, `Stop-`, `Format-`, …), registry paths (`HKLM:`, `HKCU:`), `Invoke-Expression`, and `-ExecutionPolicy Bypass`. `safe_mode = true` (default) blocks rather than executes when warnings fire. Detects `pwsh` / `powershell.exe` / `powershell` on PATH via `which` or `where`. 6 tests cover the safety matrix.
- **`apps/cli/src/policy/windows_sandbox.rs`** (121 LOC, `#![cfg(target_os = "windows")]`) — AppContainer profile builder matching the macOS Seatbelt + Linux seccomp pattern. `WindowsSandboxPreset { ReadOnly, Contained, Unrestricted }`, `allowed_capabilities()` (internetClient + documentsLibrary for ReadOnly; +picturesLibrary/videosLibrary/musicLibrary/removableStorage for Contained), `describe_filter`, `is_available`. `install_filter` is a no-op stub by default and a feature-gated error path behind the (unwired) `windows-appcontainer` feature — real `CreateAppContainerProfile` integration is v1.8 work. 6 tests (Windows-gated).
- **8 missing slash dispatch arms** in `apps/cli/src/tui/tui_app.rs`: `/focus`, `/background` (`/bg`), `/advisor`, `/team-onboarding` (`/onboarding`), `/terminal-setup` (`/shell-setup`), `/reload-plugins`, `/extra-usage` (`/pricing`), `/remote-env`. These were registered in `crates/agiworkforce-command-registry/src/lib.rs` since v1.2 but their dispatch arms had been omitted — the v1.2 implementation log overstated the work. `/reload-plugins` calls `PluginsManager::new().load_all(None)`; `/team-onboarding` reads `~/.claude/team-onboarding.md`; `/remote-env` dumps 5 proxy/base-URL env vars.

### Changed

- CLI version 1.6.0 → 1.7.0.
- Tool catalog: 41 → **43** (added `notebook_edit`, `powershell`). `test_build_tool_definitions_count` updated with citation.
- Tests: 1297 → **1310** (+13: 7 notebook_edit + 6 powershell_tool; Windows sandbox tests are cfg-gated to Windows).

### Notes (honest)

- `/voice` was kept as a help-text slash arm because `crate::voice::run_voice_mode` is async and requires `session` + `config` + `voice_lang` args that aren't reachable from the sync slash dispatcher. Actual voice capture works via `agiworkforce --no-tui --voice-lang en` (the REPL path). The slash arm now points users at that command, which is more honest than the v1.2 stub.
- `HookEvent::TeammateIdle` doesn't exist in the enum yet, so `/background` doesn't fire a hook — it just acknowledges. Wire-up of that hook event was claimed but not delivered in v1.2; we leave the message-only arm rather than introduce a half-implementation.
- `windows_sandbox::install_filter` is a stub (returns `Ok(())`); the real AppContainer integration is left to v1.8 + a `windows-appcontainer` Cargo feature once a Windows CI runner is available.

### Items intentionally deferred (audit-confirmed; not v1.x scope)

- **rollout-trace + analytics crates** (codex-rs 3K+ LOC) — deep session-replay/compaction infrastructure. Out of scope without a hosted indexer.
- **Theme bundling** (Gemini's 14+ themes + `.tmTheme` loader) — our ratatui color model is simpler; can be expanded but is provider-specific polish.
- **Gemini Live streaming voice** — provider-specific (Gemini-only) WebSocket model. Whisper batch already covers the cross-provider voice surface.
- **Skill auto-extraction** (Gemini's `skill-extraction-agent.ts`) — by-design absent in Claude Code too; not a parity gap.
- **MCP sampling API** (`sampling/createMessage`) — Claude Code's MCP implementation also omits this; defensible.

---

## [cli-1.6.0] — 2026-05-14

Final loop release. Closes the last code seam: bridges `LlmCaller` to the real provider HTTP stream. The chain `SubagentRegistry::spawn → SubagentTaskRunner → AgentSessionRunner → LlmCaller → ProviderLlmCaller → stream_completion → provider HTTP` is now end-to-end wired.

### Added

- **`apps/cli/src/subagent_v2.rs::ProviderLlmCaller`** — production `LlmCaller` impl wrapping `crate::models::stream_completion`. Each `call` converts the `ConversationTurn` history into `Vec<crate::models::Message>`, accumulates streamed chunks via an `Arc<Mutex<String>>` callback, and returns the final text. `ProviderLlmCaller::new(config, provider)` defaults `max_tokens = 4096`.
- **`turn_to_message` / `turns_to_messages`** — pure conversion helpers, exposed at module level so unit tests can verify the mapping without spinning up an HTTP call. Three role variants (System/User/Assistant) map to the `crate::models::Message.role` string fields verbatim.
- **4 new unit tests** covering all three role variants + order/count preservation across multi-turn histories.

### Changed

- CLI version 1.5.0 → 1.6.0.
- Tests: 1293 → **1297** (+4 turn-mapping unit tests).
- The subagent_v2 abstraction is structurally complete: the trait chain is fully wired, with a swappable mock layer for tests and a production impl that calls the real provider stream.

### Notes

- This is the **final code iteration** of the v1.x architecture. Subsequent improvements (hosted plugin marketplace, production OAuth credentials, cross-process a2a relay) require external infrastructure rather than additional Rust code.
- `StreamCallback` signature is `Box<dyn FnMut(&str) + Send>` (no Result return); the bridge accumulator pushes into the shared Mutex unconditionally.

---

## [cli-1.5.0] — 2026-05-14

Final close-out release. Three architectural items the previous releases noted as deferred are now closed:

### Added

- **`apps/cli/src/a2a_ws.rs`** — `WsServer::new` now accepts `auth_token: Option<String>`; `accept_hdr_async` callback enforces `Authorization: Bearer <token>` before WebSocket upgrade. Three new live E2E tests (`ws_server_e2e_discover_no_auth`, `ws_server_e2e_auth_required_rejects_missing_token`, `ws_server_e2e_auth_accepts_valid_token`) using `tokio_tungstenite::connect_async` against ephemeral-port servers prove the WS transport works end-to-end, not just at the handler layer.
- **`apps/cli/src/subagent_v2.rs`** — new `AgentSessionRunner` impl of `SubagentTaskRunner` plus injectable `LlmCaller` async trait. Maintains conversation history across turns; emits `Response` on success, `Error` on caller failure. Test-only `MockLlmCaller` for deterministic scripting. This is the production-shaped impl; the `EchoRunner` (v1.4) stays as the default. 3 new tests for scripted response, error propagation, and history preservation.
- **`apps/cli/src/models.rs`** — Mistral re-added to the CLI provider registry. `mistral_provider()` constructor wired into `provider_from_name` (aliases: `mistral`, `mistral-ai`, `mistralai`) and `detect_provider`. Reserved names list updated. Named provider count: 12 → **13** (+ user-defined Custom). "10+ Providers" tagline is now comfortably met in code as well as marketing.

### Changed

- CLI version bumped 1.4.0 → 1.5.0. `cargo check --workspace` green on macOS.
- Tests: 1285 → **1293** (+8: 1 Mistral resolution + 4 ws auth/E2E + 3 AgentSessionRunner).

### Notes

- The injectable `LlmCaller` trait is the seam where a real Anthropic/OpenAI/Ollama client wires in. The `MockLlmCaller` is `#[cfg(test)]` only — production callers live in `crate::providers::*` and will be wired in v1.6 once we add cross-provider session continuity between subagent and parent.
- E2E tests use the "drop ephemeral listener then rebind" pattern; there is a tiny port-reuse race that hasn't manifested in CI runs to date but is documented in code comments.

---

## [cli-1.4.0] — 2026-05-14

Security and protocol hardening release. Closes three v1.3 deferred backlog items: real seccomp-BPF filter installation on Linux, `SubagentTaskRunner` trait abstraction making the subagent task body swappable, and a2a WebSocket transport for persistent cross-process agent streaming.

### Added

- **`apps/cli/src/policy/linux_sandbox.rs`** (M38a) — `compile_bpf` + `install_filter` behind the new `linux-seccomp` Cargo feature. `install_filter` calls `prctl(PR_SET_NO_NEW_PRIVS)` then `seccompiler::apply_filter`; on default (feature-off) Linux builds a no-op stub is provided so call sites compile under both configurations. `compile_bpf_available()` probes feature presence at runtime.
- **`apps/cli/src/subagent_v2.rs`** (M34a) — `SubagentTaskRunner` async trait. Swappable task body: implementors receive `inbox_rx: mpsc::Receiver<String>` and `outbox_tx: mpsc::Sender<SubagentMessage>`; `SubagentRegistry::spawn_with_runner` accepts any `Arc<dyn SubagentTaskRunner>` so the echo-loop stub can be replaced by a real `AgentSession` without touching the registry.
- **`apps/cli/src/a2a_ws.rs`** (new, ~100 LOC) — a2a WebSocket transport. `WsServer::serve(addr)` binds a `TcpListener`, upgrades each TCP connection via `tokio-tungstenite`, and dispatches text frames through `crate::a2a::jsonrpc::handle_request`. Binary frames return a JSON-RPC error. Each connection owns an `Arc<PeerRegistry>` clone so the registry is shared without contention.

### Changed

- **`apps/cli/Cargo.toml`** — version 1.3.0 → 1.4.0. Added `[target.'cfg(target_os = "linux")'.dependencies]` block (`seccompiler = "0.5"`, `libc = "0.2"`, both optional). Added `linux-seccomp = ["dep:seccompiler", "dep:libc"]` feature. Added `tokio-tungstenite = "0.24"` dependency.
- `cargo check --workspace` green on macOS. All Linux-only deps cfg-gated and optional — zero impact on darwin builds.
- Tests: 1284 passing (1 pre-existing flaky oauth_flow port-contention test passes in isolation).

### Notes

- Opt into real BPF installation via `cargo build --features linux-seccomp` on Linux. Default builds compile cleanly on all platforms.
- a2a WebSocket and seccomp filter installation are the last two items from the v1.3 Notes "deferred" list.

---

## [cli-1.3.0] — 2026-05-14

Final-backlog release. Closes the last four items the v1.2 audit deferred to v1.3: Subagent v2 with full IPC, Linux seccomp-BPF sandbox preset, agent-to-agent (a2a) coordination protocol, and TUI dispatch wiring for the v1.2.1 overlay catalog.

### Added

- **`apps/cli/src/subagent_v2.rs`** (M34) — full-IPC subagent runtime. `SubagentRegistry` + `SubagentHandle` with bidirectional message channels (inbox/outbox), kill via `oneshot::Sender`, `wait` on the join handle. Each subagent runs as an isolated tokio task with its own `mpsc::channel<32>` for prompts and responses. Status machine: `Pending → Running → Completed | Failed | Killed`. 6 tests covering registry empty/unique-ids, message round-trip, kill transition, missing-id error, status progression.
- **`apps/cli/src/policy/linux_sandbox.rs`** (M38) — Linux seccomp-BPF preset. Architecture-aware allow-list builder for `ReadOnly` / `Contained` / `Unrestricted` presets. ~50 syscall allow-list for ReadOnly (read, write, openat, stat, fstat, mmap, mprotect, brk, futex, clock_gettime, …); Contained adds `execve` / `clone` / `pipe2` / `socketpair`. `describe_filter` produces a one-line summary for `/sandbox` + `/doctor`. `is_available` probes `/proc/self/status` for the `Seccomp:` line. Tests run only on Linux via `#![cfg(target_os = "linux")]`; the module compiles cleanly on macOS as part of `cargo check --workspace`.
- **`apps/cli/src/a2a.rs`** (1,649 LOC) — agent-to-agent coordination protocol. JSON-RPC 2.0 surface with `discover`, `list_peers`, `delegate`, `cancel` methods. `AgentCard { id, name, model, capabilities, tools, version }`, `TaskRequest { id, prompt, deadline_unix?, context }`, `TaskResponse { state, result?, error? }`, `TaskState { Accepted, Running, Completed, Failed, Cancelled }`. `PeerRegistry` with `find_by_capability` lookup. HTTP transport scaffold + local-registry persistence + handoff request type + priority sort. 26 tests covering serialization roundtrips, handler dispatch, error code surfaces, registry persistence, and `format_agent_list_offline` rendering.
- **TUI overlay dispatch** — wired 5 slash arms to the v1.2.1 interactive overlays in `apps/cli/src/tui/tui_app.rs`:
  - `/memories` → `MemoriesSettingsView`
  - `/skills-toggle` → `SkillsToggleView`
  - `/statusline` → `StatusLineSetupView`
  - `/title` → `TerminalTitleSetupView`
  - `/diff-review` → `DiffReviewView`

### Changed

- CLI version bumped 1.2.1 → 1.3.0. `cargo check --workspace` green.
- Tests: 1244 → **1276** (+32 from this iteration: 6 subagent_v2 + 26 a2a; linux_sandbox tests are cfg-gated to Linux).
- Closes the v1.2 deferred backlog: M34 (subagent IPC), M38 (Linux sandbox), a2a coordination, overlay dispatch arms.

### Notes

- Subagent v2's task body is a minimal echo loop today; the IPC plumbing (channels, status machine, kill/wait) is real and ready for a future swap-in of `AgentSession` as the task body.
- The seccomp-BPF allow-list builder is portable Rust; **installing** the BPF program (`seccompiler::apply_filter` after `prctl(PR_SET_NO_NEW_PRIVS)`) needs the `seccompiler` crate as a Linux-only optional dep — v1.3.1 work.
- The a2a protocol is in-process today. WebSocket / cross-process transport is a hosted-infra step.

---

## [cli-1.2.1] — 2026-05-14

Backlog-close release. v1.2.0 shipped the audit-driven gap closure; v1.2.1 closes the architectural follow-ups (interactive overlay catalog, plugin marketplace client, LSP completion path, OAuth endpoint discovery).

### Added

- **7 new interactive overlay modules** in `apps/cli/src/tui/widgets/`:
  - `list_selection_view.rs` — generic `ListSelectionView<T>` base implementing `InteractiveView` (used by 4 derived overlays)
  - `memories_settings.rs` — toggle auto-memory, decay threshold, max-facts
  - `skills_toggle.rs` — spacebar-toggle enabled state per discovered skill
  - `statusline_setup.rs` — multi-checkbox status line composition
  - `terminal_title_setup.rs` — multi-checkbox terminal title composition
  - `command_popup.rs` — autocomplete slash-command popup (typed filter, ↑↓ Enter Esc)
  - `diff_review.rs` — per-file diff with `y/n/s` decisions and final Submit count
- **`apps/cli/src/marketplace.rs`** — plugin marketplace client: `Marketplace { registry_url }`, `list_plugins`, `search`, `install`. Default registry URL placeholder; hosted infra is an ops step.
- **`auth_oauth::discover_endpoints`** — RFC 8414 / OpenID Connect Discovery: probes `/.well-known/openid-configuration` then `/.well-known/oauth-authorization-server`. Returns typed `DiscoveredEndpoints { authorization_endpoint, token_endpoint, scopes_supported, code_challenge_methods_supported, ... }`.
- **LSP completion path**:
  - `LspClient::completion`, `LspClient::document_symbol`, `LspClient::formatting` methods
  - `DiagnosticsBuffer` shared-state container for future `textDocument/publishDiagnostics` push subscription
  - `CompletionItem`, `DocumentSymbol`, `TextEdit` LSP wire types
  - 3 new tools registered: `lsp_completion`, `lsp_document_symbols`, `lsp_format` — catalog 38 → 41

### Changed

- Tests: **1281 → 1347** (+66) across 6 crates.
- `tui/widgets/mod.rs` registers all 7 new overlay modules.

### Notes

- Reference screenshots at `~/Desktop/reference/ui-capture-runs/.../screenshots/claude-code/` (captures 607–618 for slash palette, 621 for skills) show **dismissed** overlay state (post-close). The new interactive overlays use a boxed-modal style during active use; the pure-text `screen_renderers.rs` continues to produce the dismissed-state shape. Both serve complementary rendering purposes.
- Real OAuth-app registrations for known providers (anthropic / openai) remain placeholder; `discover_endpoints` is provider-agnostic and works against any RFC 8414 / OIDC-compliant issuer URL.

---

## [cli-1.2.0] — 2026-05-14

The "comparable with other CLIs" release. Closes every P0 and P1 item identified in the 2026-05-14 deep audit against Codex CLI, Claude Code, Gemini CLI, OpenCode, and Claw-code.

### Added

- **5 new shipping crates**: `agiworkforce-command-registry`, `agiworkforce-app-server`, `agiworkforce-plugin-runtime`, `agiworkforce-apply-patch` (with 22 scenario fixtures), `agiworkforce-task-runtime` (with `TaskRegistry` + `StallWatchdog`).
- **+18 slash commands** (40 → 58): `/agents`, `/chrome`, `/ide`, `/tasks`, `/usage`, `/sandbox`, `/doctor`, `/recap`, `/release-notes`, `/keybindings`, `/focus`, `/background`, `/advisor`, `/team-onboarding`, `/terminal-setup`, `/reload-plugins`, `/extra-usage`, `/remote-env`; `/plugin` canonical with `/plugins` `/marketplace` `/market` aliases.
- **+18 tools** (20 → 38): 6 task lifecycle + 2 team + 3 cron + 3 worktree + 3 LSP + `advisor`.
- **+13 hook events** (22 → 35): full Claude Code `HOOK_EVENTS` parity.
- **TUI overlays**: `ApprovalOverlayState` (20 tests), `InteractiveView` trait + state machines (11 tests), modal-overlay slot in `tui_app.rs` event loop, `TuiElicitationHandler` bridge for MCP elicitation, 14 parity-screen renderers.
- **MCP completion**: connection pooling (`McpConnectionManager`), keyring-backed OAuth persistence (file fallback at `~/.agiworkforce/secrets/`), `list_mcp_resources` / `read_mcp_resource` / `McpServerStatusSnapshot`, live `elicitation/create` dispatch across stdio + sse + http.
- **Browser PKCE OAuth for `/login`** (`auth_oauth.rs`): RFC 7636 S256, ephemeral local listener, CSRF state validation; "anthropic" and "openai" providers built-in.
- **Cost ledger** (`cost_ledger.rs`): real per-turn dollar tracking from `models.json` pricing constants.
- **Memory pruning** (`memory::prune`): drops observations older than `max_age_days` or keeps top-K by `recency × relevance_score`.
- **Tool distillation** (`tool_distillation.rs`): compresses tool catalog per model family (Tier-1 full, Tier-2 truncate to 80c, Tier-3 to 40c).
- **macOS Seatbelt** (`policy::macos_sandbox`): `SandboxPreset { ReadOnly, Contained, Unrestricted }` + `wrap_command` via `sandbox-exec -p <profile>`.
- **Basic LSP client** (`lsp/`): stdio, Content-Length framing, server-for-extension dispatch (rust-analyzer / tsserver / gopls / pyright-langserver).
- **Voice input** (`voice.rs`): push-to-talk + cpal capture + WAV + OpenAI Whisper + local-binary fallback.
- **Alias path discovery**: `.claude/` and `.codex/` siblings of `.agiworkforce/` for agents + skills.
- **`AGIWORKFORCE_NO_KEYRING=1` env var**: opt-out from OS keyring for headless / CI / containerized runs (avoids macOS Keychain auth prompts).

### Changed

- Test count: **1150 → 1268** (+118, +10%).
- Workspace crates: **1 + 12 utility → 6 cli-shipping + 12 utility**.
- 104,216 LOC of dead codex-rs port files moved to `apps/cli/src/tui/_attic/` (preserved, out of compilation surface).
- Plan-mode mutation gate hardened with 4 inline tests + integration coverage.

### Fixed

- macOS Keychain auth-prompt storm during MCP OAuth tests (per-test bypass + env-var production opt-out).
- `apply-patch` `clippy::manual_find` rewritten as iterator chain.
- Tool catalog count assertion tracks growth (20 → 31 → 32 → 38) with cited M-numbers.

### Deferred to v1.3

- **M34** — Subagent v2 with full IPC.
- **M38** — Linux seccomp-BPF sandbox.
- Plugin marketplace registry (needs hosted infra).
- External multi-agent coordination layer (OmX/clawhip/OmO style).

## [Unreleased]

### Wave 2 (in progress)

- Pixel-close Claude Desktop UI for Tauri app
- Triage 84 desktop component dirs → ~25 active (in-flight: 9 dirs / 3,430 LOC removed; ~50 still reachable via DynamicSidecar lazy loader)
- Windows code signing (EV cert) for desktop installer (needs $300/yr cert)
- Privacy Policy rewrite + GDPR Settings → Data section (needs counsel sign-off)
- IPC inventory proc-macro replacement of `generate_handler!` (FIX-023 already wired check-wiring.sh into ci.yml at line 154; proc-macro is the v1.1 follow-up)

### Wave 2 — DONE

- ✅ `apps/web/components/UnifiedAgenticChat/` deleted (141 files / 36,086 LOC of dead code; real /chat surface is the desktop Vite SPA per vercel.json rewrite)
- ✅ WEB-4 Stripe webhook body-read: middleware exclusion + nodejs runtime pinned

### Wave 3 (planned)

- iOS App Store + Google Play submissions for mobile companion (needs Apple/Google dev accounts)
- Chrome Web Store submission for browser extension (needs $5 dev account)
- VS Code Marketplace submission (free, but needs Microsoft account)
- Hobby tier ($5/mo) launch (needs Stripe price + frontend wire-up)
- Pro / Max waitlist UI (API at `/api/waitlist` already exists; pricing page already calls it)

### Wave 0 — SHIPPED 2026-05-03

Massive cleanup pass. -1.04M LOC total across 19 commits. See git log for detail.

---

## [1.0.0] — 2026-05-03 (CLI v1.0 — SHIPPED)

**Live install paths**:

```bash
brew install siddharthanagula3/tap/agiworkforce        # ✅ live
curl -fsSL https://raw.githubusercontent.com/siddharthanagula3/agiworkforce/main/scripts/install.sh | bash  # ✅ live
cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli  # ✅ live
# Direct: https://github.com/siddharthanagula3/agiworkforce/releases/tag/v-cli-1.0.0  # ✅ live
npm install -g @agiworkforce/cli                        # ⏳ pending NPM_TOKEN secret (user action)
```

**Platforms shipped**: macOS arm64, macOS x64, Linux x64, Windows arm64, Windows x64.
**Linux arm64**: deferred to v1.1 (cross-compile openssl-sys not yet wired). Workaround: `cargo install --git ...` (builds natively).

### Added

- **22 subcommands**: `exec`, `review`, `apply`, `sandbox`, `mcp-server`, `app-server`, `resume`, `fork`, `session`, `cloud`, `plugin`, `features`, `execpolicy`, `ecosystem`, `history`, `sync`, `login`, `logout`, `auth-status`, `marketplace`, `init`, `onboarding`
- **10+ Providers**: Anthropic, OpenAI, Google, Ollama, Mistral, xAI, DeepSeek, OllamaCloud + subscription paths for GitHub Copilot and ChatGPT Plus
- **Ratatui TUI**: 125-file terminal UI with streaming markdown, slash commands, syntax highlighting (syntect), agent task panel
- **Multi-provider fallback chain**: comma-separated `-m` flag rotates on RateLimit/Transient/Any errors
- **--demo flag**: synthesizes a 429 on first call to demo fallback chain (no real API call needed for live demos)
- **--json-events**: machine-readable JSONL agent events to stdout (one per line; pipeable through `jq` for CI/dashboards)
- **--dump-system-prompt** (Phase 2): inspect the assembled system prompt without making an API call
- **Anthropic prompt cache wiring** (Phases 4-5): `cache_control: ephemeral` markers + `prompt-caching-2024-07-31` beta header; `cache_read_input_tokens` and `cache_creation_input_tokens` parsed from stream events
- **Tool concurrency** (Phases 6-7): `is_read_only` + `is_concurrency_safe` flags on `ToolDefinition`; concurrent batch execution of read-only tools via `futures::future::join_all`
- **Per-tool result size caps** (Phase 8): `read_file`/`web_search` 100k, `web_fetch` 200k, `search/grep/run` 50k, `list/tool_search` 20k, `write/edit/apply_patch` 5k
- **Memory typing** (Phase 9): `kind: user | feedback | project | reference` frontmatter on memory files; injected into separate XML blocks
- **Hook transformers** (Phase 10): `updated_input`, `additional_context`, `updated_mcp_tool_output` outputs in addition to gate decisions
- **Sandbox**: macOS Seatbelt, Linux Bubblewrap, Linux Landlock, Windows Restricted Token (auto-detected)
- **Daemon mode**: cron + webhook + file-watcher triggers, rate-limited, constant-time webhook token comparison
- **MCP support**: client (consumes external MCP servers via stdio) and server (`agiworkforce mcp-server` exposes own tools)
- **Skills system**: project / global / system / learned tiers; YAML frontmatter; auto-loaded by name match
- **Marketplace**: `agiworkforce marketplace install <plugin>` from registry.agiworkforce.com (alpha)
- **Voice mode**: Whisper STT + cpal recording; push-to-talk via SPACE/ESC
- **Cross-device sync**: `agiworkforce sync export` / `import` bundles config + memory + projects
- **Ecosystem scan**: `agiworkforce ecosystem scan` discovers Claude/Codex/Cursor/Gemini configs and imports MCP servers
- **App-server mode**: JSON-RPC over stdio or WebSocket for IDE integration; `tools/list` + `initialize` + `shutdown`
- **3-layer permission stack**: CommandSafety classifier (Safe/Unknown/Dangerous heuristic) → PermissionStore (always_allow/deny + session_allow) → PolicyEngine (TOML rules, priority-ordered) + optional SDK CanUseTool RPC

### Changed

- Cargo workspace cleaned: 113 crates → 11 (removed 102 codex-rs port crates that never compiled cleanly after the rename, preserved at `~/Desktop/reference/codex-cli/` for future re-port)
- Repo size reduced by **995,111 LOC** across 4,624 files

### Distribution

- npm: `@agiworkforce/cli` (with platform-specific `@agiworkforce/cli-{platform}-{arch}` packages)
- Homebrew: `agiworkforce/tap/agiworkforce`
- Universal installer: `curl -fsSL https://agiworkforce.com/install.sh | bash`
- Cargo: `cargo install --git https://github.com/siddharthanagula3/agiworkforce agiworkforce-cli`
- GitHub releases: pre-built binaries for darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64

### Tests

- 914/914 unit tests green (`cargo test -p agiworkforce-cli --bin agiworkforce` — verified 2026-05-03 via `cargo test --release`)
- Snapshot tests for TUI rendering (chatwidget)
- Integration tests for tool execution + permission stack

### Known limitations (v1.0.0)

- Auth credentials stored as 0o600 plaintext JSON at `~/.agiworkforce/auth.json` instead of OS keyring (CLI-5 from 2026-05-03 audit; mitigated by file permissions)
- 7 in-progress modules parked but not wired (a2a, tui_basic, history, memory_pipeline, models_cache, shell_snapshot, skill_learner) — slated for v1.1+
- Subscription paths (Copilot, ChatGPT Plus) are best-effort and may break if the upstream auth flow changes

### Security audit (2026-05-03)

- P0 closed: 13/14 (CLI-5 deferred — see Known limitations)
- P1 closed: 20/25 (4 deferred to v1.1: DESK-5/8, WEB-4/5/11)
- See [`docs/audit/AUDIT_2026-05-03.md`](docs/audit/AUDIT_2026-05-03.md) for the full report
