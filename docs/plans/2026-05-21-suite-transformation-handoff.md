# 2026-05-21 — Application-suite transformation handoff

Status: Current
Owner: Next session lead
Last updated: 2026-05-22 (extended through round 20: /goal-driven 3-lane sprint, 7 commits)
Branch: `main` (direct-to-main per sprint protocol)
Head local: `e5749c987` (round-20 boundary at session end, 14 commits ahead of origin/main, NOT pushed — awaits user 22:00-local authorization)
PR: [#378 — feat: suite transformation rounds 12-18](https://github.com/siddharthanagula3/agiworkforce/pull/378) (merged 2026-05-22 as squash `69f729aaa`)

## Round 20 — /goal-activated 3-lane sprint (2026-05-22, post-/goal)

User pasted the compressed 3,590-char `/goal` paste-block from
`~/.claude/plans/agi-workforce-optimized-ullman.md`. Stop hook engaged
("execution has not begun"). R20 dispatched 3 parallel agents on the three
highest-leverage codeable lanes from EXEC-SUMMARY-r2 "next-session
priorities." All 3 returned with green verification gates.

| Commit      | Title                                                                             | Surface | Lines     | Tests added |
| ----------- | --------------------------------------------------------------------------------- | ------- | --------- | ----------- |
| `1a2dc8e17` | feat(services): scaffold artifact-publish service with trust-boundary enforcement | shared  | +254      | 12          |
| `f38184e2d` | feat(unified-chat): wire artifact publish via di prop in artifact panel           | shared  | +172/-3   | 0 (host)    |
| `9bcf1d4a8` | feat(web): deepen settings pages to >=80% claude desktop parity                   | web     | +797/-178 | (existing)  |
| `11089e664` | feat(desktop): adopt artifact-publish service with tauri file writer              | desktop | +230/-2   | 0 (smoke)   |
| `f88ee761e` | fix(web): split profile preferred-name from full-name fields                      | web     | +32/-18   | (existing)  |
| `70d57f3ab` | feat(cli): implement /agents slash command with tui picker and quick-invoke       | cli     | +884/-10  | 14          |
| `e5749c987` | docs(services): add readme for new artifact-publish service package               | shared  | +64       | (docs)      |

Total: **7 commits, +2,433 lines, +26 tests, 5 surfaces touched** (shared services,
shared unified-chat, web, desktop, cli). All committed direct-to-main per
sprint protocol; 14 commits ahead of origin/main awaiting daily 22:00-local
push window.

### What landed by lane

- **Lane 1 — Web Settings depth (`9bcf1d4a8` + `f88ee761e`):** Profile page
  gained 4 Claude-parity fields (Full name, Preferred name with independent
  `agi.profile.preferredName` localStorage key + Supabase `user_metadata`
  sync, Work-description 14-option dropdown, 2000-char Instructions
  textarea). Avatar "Change photo" stub (Cloud Managed waitlist). Inline
  Appearance section with `next-themes` `useTheme` toggle (dark/light/
  system). Privacy page added delete-account two-step confirmation (DELETE
  type-confirm → `/api/user/delete-account` with CSRF). Notifications page
  reorganized into 3 channel groups (Browser active / Email Cloud Managed-
  gated / Mobile Cloud Managed-gated). Connections page added icon chips +
  `formatRelativeTime()` timestamp + disconnect stub.
- **Lane 2 — Artifact publish service (`1a2dc8e17` + `f38184e2d` +
  `11089e664` + `e5749c987`):** New `packages/services` package created
  with `publishArtifact({ artifact, privacyMode, surface, localFileWriter })`
  returning a `LocalPublishResult | WaitlistPublishResult` discriminated
  union. Enforces `assertSurfaceCanSyncChats` (CLI/VSCode/Chrome throw) +
  `assertGeneratedFileTrustBoundary` (privacy boundary). v1 LOCAL ONLY:
  `byok`/`managed` privacyMode returns waitlist-gated with zero network
  calls (verified). 12 unit tests cover all variants. `ArtifactPanel`
  gained DI prop `publishArtifact?: () => Promise<ArtifactPublishResult>`
  - bottom notification bar (file:// URL + copy, or waitlist CTA, or error).
    Desktop adapter (`apps/desktop/src/features/artifacts/publishAdapter.ts`)
    uses Tauri `appDataDir()` + `writeTextFile` to materialize artifacts to
    `<app_data>/artifacts/` and return a `file://` URL.
- **Lane 3 — CLI `/agents` slash command (`70d57f3ab`):** Discovery scans
  5 roots (`.agiworkforce/agents/`, `.claude/agents/`, `~/.agiworkforce/`,
  `~/.claude/`, plugin paths). TUI picker with incremental search +
  arrow-key nav + Enter-to-invoke. Quick-invoke via `/agents <name>`.
  `AgentDefinition::apply_to_session()` applies model override (via
  `switch_model()`), tool allow/disallow lists, max_turns, permission_mode,
  - injects fenced `<agent_system_prompt>`. 14 new tests (10 picker, 4
    agents.rs). CLI maintains developer-session-only invariant — no
    consumer-chat writes touched.

### Verification gates run (all PASS)

- `pnpm check:llm-operability` — green (after adding `packages/services/README.md` in `e5749c987`)
- `pnpm --filter @agiworkforce/{services,unified-chat,desktop,web} typecheck` — all green
- `pnpm --filter @agiworkforce/web test` — 159 files, 3,414 tests pass
- `cd apps/cli && cargo clippy --all-targets -- -D warnings` — 0 new errors (20 pre-existing unrelated)
- `cd apps/cli && cargo test --lib` — 1,471 / 1,471 pass

### Round 20 — meta-lesson

3-lane parallel sprint converted ~110 estimated eng-hours of work into ~25
minutes of wall-clock. The narrower 3-lane spawn (vs R18's 7-lane) reduced
co-staging conflicts to zero — each lane committed its own commits with no
cross-lane file overlap. One guardrail miss (the `check:readme-ownership`
gate failed because the agent created a new package without a README); the
next round's agent prompts should explicitly include "if you create a new
package, also add `<pkg>/README.md` per `scripts/check-readme-ownership.mjs`."

### Open paths for R21 (next dispatch)

1. **VS Code memory editor full UI** (~16h) — extend the existing memory
   QuickPick (`58938d12d`) with list/edit/delete tree view in the sidebar.
2. **Chrome popup memory editor** (~24h) — host-adopt the shared memory
   primitive in the popup (R6 deferred this in favor of allowlist).
3. **Mobile permissions binary toggle + top-6 enums** (~16h) — pared to
   sprint scope cuts.
4. **Knowledge file ingestion + retrieval end-to-end** (~64h) — web +
   desktop adoption.
5. **Real-time conversation sync via Supabase Realtime** (~40h) — with
   polling fallback.
6. **First-run flow polish** (~24h) — shared primitive + 3 host adoptions.
7. **/permissions, /plan, /tasks, /memory CLI commands** (~96h total) —
   the remaining v1-scoped palette items beyond /agents.

## Round 18 — Claude-parity sprint across all 6 surfaces (2026-05-22)

User set a session-scoped goal: "Autonomously complete the remaining AGI Workforce frontend across all six surfaces… using the newest Claude UI reference images available under /Users/siddhartha/Desktop/reference/ui." Team `round-18-claude-parity` spawned 7 parallel agents, each pulling 2-3 highest-impact items from a specific `reference/ui/{surface}/claude*/` directory. All 7 tasks completed.

- `feat(vscode-ext): claude/cursor parity - sidebar polish + slash command samplerequest` (`6df4f2b52`, agent: **vscode-claude**)
  - Sidebar webview: history + new-chat header icon buttons, "What to do first?" empty-state headline, `/slash` prompt chips, "Upload from computer" + "Add context" menu labels. New `openHistory` + `newChat` Zod messages wired through `webviewMessages.ts` → `ChatStateManager` → `chatParticipant.ts`.
  - All 6 slash commands (`/explain`, `/fix`, `/refactor`, `/tests`, `/docs`, `/model`) gained `sampleRequest` for VS Code's hover + autocomplete suggestions.
  - 528/528 tests pass, 3 webview snapshots updated, sync-rule compliance comment preserved.

- `feat(mobile): claude ios parity — settings inset-grouped cards + time greeting` (`028434625`, agent: **mobile-claude**)
  - Settings: inset-grouped card layout matching Claude iOS image 10 (rounded surfaceElevated containers, per-side borders + corner radii on first/last items, icon-offset separator).
  - Chat tab greeting: `getTimeOfDayGreeting()` returns "How can I help you this morning/afternoon/evening/tonight?" per device hour. 28/34 font tuned to Claude iOS serif treatment.
  - 5 new RN snapshot tests (settings tree + 4 time-boundary unit tests).

- `feat(chrome-ext): popup status pill + side-panel open-in-desktop parity` (`e0c9b5c7c`, agent: **chrome-claude**)
  - Popup: 500px verbose status-card collapsed to a compact inline status pill (dot + label + reconnect glyph) in the header bar. Quick-action buttons gained title tooltips and shorter labels ("Chat" / "Group") matching Comet's compact grid.
  - Side panel: "Open in desktop" icon button wired through `OPEN_IN_DESKTOP` message → `background.ts` → `sendNativeMessage` to desktop bridge port 8787.
  - 775/775 tests pass, static HTML snapshot updated, sync-rule preserved (chrome.storage.local + bridge only).

- `feat(web): claude-style settings nav + connector hub parity` (`41f1cc114`, agents: **web-settings** + **desktop-toolcall** co-staged)
  - Web settings: sectioned nav (Account / Models / Privacy / Notifications / Integrations) with uppercase group headers, new `SettingsNavActive` client component for active-state highlighting via `usePathname`.
  - Web connectors: `connectedAt` timestamp surfaced as "Connected Xd ago" recent-activity label.
  - Em-dash sweep across `privacy/page.tsx`, `connections/page.tsx`, `ConnectorsPage.tsx`.
  - Playwright `round-18-visual-verification.spec.ts` + 2 captured PNGs under `docs/visual-verification/web/round-18-*`.
  - **Bonus: desktop-toolcall's work co-staged in this commit** — `ToolCallCard.tsx` collapsed-row + expanded JSON request/response with per-panel copy buttons + status-color borders, `ThinkingBlock.tsx` clock-icon + live elapsed timer + multi-block "Thought N" labels + new `ThinkingBlockFlow` connector, `ToolTimeline` left unchanged (existing pattern already matched references). 31 new tests; 134 desktop chat tests pass.

- `test(desktop): land orphan artifact-sidebar + scroll-to-bottom tests` (`e5421d92a`, recovered from **desktop-artifact**)
  - desktop-artifact pushed an empty commit (`ff63bd368`) — staged-without-add bug. Recovered the 4 test files (2 specs + 2 snapshots, 5 tests) post-hoc. `ArtifactSidebarParity.test.tsx` locks the panel empty-state + header-buttons assertion; `ScrollToBottomButton.test.tsx` covers hidden/visible states + click handler at >200px scroll threshold.
  - Note: the existing `ArtifactPanel` in `AppLayout.tsx` (lines 422-457) already had Copy/Refresh/Close/Maximize parity; the scroll-to-bottom button already existed in `ChatStream.tsx`. The agent's research correctly identified the gap as test coverage, not implementation.

- `feat(cli/tui): claude-code parity — plan-mode banner + effort indicator` (`f8b77ac66`, agent: **cli-claude-code**)
  - Plan-mode banner: `"Plan mode"` → `"⏸ plan mode on"` (U+23F8 pause icon, East Asian Width N = 1 col).
  - Plan-mode footer right-side: when plan mode is active, context-window percentage replaced by `● <effort> · /effort` (magenta bullet + label + dim shortcut hint). Wired through `effective_reasoning_effort()` → `update_collaboration_mode_indicator()` → `BottomPane::set_plan_mode_effort_label()` → `ChatComposerState` → `FooterProps` → `plan_mode_effort_right_line()`. Refreshes on `set_reasoning_effort()` while plan mode active.
  - 1452 CLI tests pass (2 new + 15 snapshots updated), sync-rule preserved.

### Round 18 — meta-lesson

Parallel sprint produced 6 production commits + 1 recovered orphan commit across all six surfaces in ~15 minutes wall-clock. Two coordination findings worth surfacing:

1. **Co-staging conflict** — when two agents touch overlapping or adjacent files and commit simultaneously, the second commit grabs both sets of changes. Round 16 saw this with web-r10-put + desktop-r10-ui; Round 18 saw it again with web-settings + desktop-toolcall. Not a bug, but commit attribution gets confused. Future team prompts should explicitly call out file-path ownership AND request that agents `git fetch + rebase` before committing.
2. **Empty-commit bug** — desktop-artifact pushed `ff63bd368` without staging files first. The commit message landed but no diff. Recovery was straightforward (the working tree retained the files), but agents should `git status` between staging and committing.

## Round 17.5 — main-rebase resolution (2026-05-22, between rounds 17 and 18)

PR #378 was `CONFLICTING` with main after rounds 12-17 (24 conflicts: doc + canonical types + runtime exports + desktop UI + sync services + visual-verification PNGs). Resolved via merge-into-branch (preserves history, no force-push needed):

- `chore: merge main into branch, resolve round-17 conflicts` (`b202ef593`)
  - All 24 conflicts resolved by keeping HEAD where my work was the better version: round-13 `assertGeneratedFileTrustBoundary` throw-variant, round-16 Rust `SYNCED_APP_SURFACES` + `DEVELOPER_SESSION_SURFACES` helpers, round-14 `./offline-queue` + `./offline-sync` runtime exports, round-12 useIsMounted migrations, round-13 `assertSurfaceCanSyncChats` wiring, round-15.1 canonical surface arrays consolidation, projects warm-dark fix, KB/artifact/voice scaffolds, 6-surface visual-verification captures.
  - Picked up from main: PR #377 cost_calculator canonicalization fix.
  - Verification: types/runtime/web/desktop typecheck pass, 18 Rust protocol projects tests pass.
  - PR went from `CONFLICTING` → `MERGEABLE` without force-push.

## Round 16 — parallel team sprint via TeamCreate (2026-05-22)

User directed: "use parallel sub agents" + "use TeamCreate" + "Use all the tools you have to speed up the process." Team `round-16-parity-sprint` spawned 7 parallel agents across non-overlapping lanes. Results landed in ~5 minutes of wall clock (vs ~1 hour serial).

- `feat(protocol): rust mirror for synced_app_surfaces + developer_session_surfaces` (`ea9340941`)
  - Round-15 to round-16 setup: Rust mirror in `crates/agiworkforce-protocol/src/projects.rs` gained `SYNCED_APP_SURFACES` + `DEVELOPER_SESSION_SURFACES` const arrays + `is_synced_app_surface()` + `is_developer_session_surface()` methods. 5 new tests pin canonical-set equality, surface acceptance, and mutual exclusivity. All 18 projects tests pass.

- `docs(vscode-ext): add sync-rule compliance block to chat participant` (`14ad28e27`, agent: **vscode-sync-audit**)
  - Audited 30 source files; no supabase client; chat history via `vscode.ExtensionContext.globalState` only; existing `assertSurfaceCanSyncChats('vscode')` test confirmed locked. Added compliance comment block. 528/528 tests pass.

- `docs(extension): add sync-rule compliance block to background service worker` (`610fc67e0`, agent: **chrome-sync-audit**)
  - Audited Chrome MV3; `chrome.storage.local` device-scoped only; bridge to desktop:8787 is the legitimate persistence path; no consumer-chat writes. Compliance block at `apps/extension/src/background.ts`. 775/775 tests pass.

- `test(cli): assert cli surface is developer-session-only per sync rule` (`86907d442`, agent: **cli-sync-audit**)
  - Audited ~195 Rust files; no supabase client; conversations under `~/.agiworkforce/conversations/` (local-file) only; no `ProjectSourceSurface::Web|Desktop|Mobile` construction. Added compliance comment to `apps/cli/src/sessions.rs` + Rust unit test asserting CLI surface is developer-session-only.

- `feat(mobile): add projects detail screen with canonical project header` (`0cca242f3`, `a576cdc4a`, agent: **mobile-projects**)
  - New `apps/mobile/app/(app)/projects/[id].tsx` consuming canonical `summarizeProjectHeader`. v1 LOCAL ONLY: `FEATURES.auth=off` short-circuits to a `LocalOnlyFallback` with "Join Cloud waitlist" CTA; auth-on path fetches `/api/projects/[id]` and maps through canonical. Active-project chip added to `chat/[id].tsx` header for navigation. New `apps/mobile/src/features/projects/service.ts` thin fetch wrapper (extracted to satisfy pre-push service-layer hook). 3 RN snapshot tests. Typecheck PASS.

- `feat(web/api): wire round-10 project fields in put and post handlers` (`f9aba1747`, agent: **web-r10-put**, also adopted task #2 desktop UI work)
  - PUT `/api/projects/[id]` and POST `/api/projects` accept iconEmoji, accentColor, defaultPrivacyMode, defaultProviderMode, allowedSurfaces, defaultModelId, importedFrom. Enum validation against canonical `@agiworkforce/types` constants with 400 + field-name error message. allowedSurfaces filtered to known values rather than rejected. Pre-migration safe: try/catch on PG error `42703` (undefined_column) retries without round-10 fields. 9 new vitest tests in `app/api/projects/__tests__/round10-fields.test.ts`.
  - Also (out-of-lane but useful): added `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx` (new, 140 lines), extended desktop `projectStore` with accentColor + defaultPrivacyMode, wired round-10 columns into desktop SQLite migration `apps/desktop/src-tauri/src/data/db/migrations.rs` and Tauri command `apps/desktop/src-tauri/src/sys/commands/projects.rs`. ACCENT_COLOR_CLASS rendering in `ProjectsView.tsx`.

PR #378 opened by **pr-opener** with full round 12-16 summary, ~46 new tests called out, sync-rule verification block, and test plan checklist.

### Round 16 — meta-lesson

Parallel team sprint converted ~6 hours of marginal-cleanup work into ~5 minutes of wall-clock by parallelizing across non-overlapping lanes. Web-r10-put expanded scope into desktop files which created task-#2 overlap — this is a coordination cost worth flagging in the team prompt template (be more explicit about file-path ownership). Three sync-rule audits returned "CLEAN, confirmed compliance" which is a meaningful verification result, not just busywork. The mobile detail screen + web PUT wiring together close the projects round-10 end-to-end loop modulo the unapplied migration.

Open paths still on the board:

1. Apply the round-10 migration (`20260521120000` + fix-ups). Web PUT/POST now use a 42703-retry shim so production is safe pre-migration; once applied, all round-10 fields persist by default.
2. ~~Trust-boundary production wiring~~ — no canonical composition site exists yet; deferred until artifact-publish service lands.
3. Mobile PNG capture infrastructure (still needs expo-web build pipeline; heavy).

## Round 15.1 — canonical surface-array consolidation (2026-05-22)

- `fix(web,desktop): replace inline surface arrays with canonical synced_app_surfaces` (`7418575d6`)
  - Four call sites inlined `['web', 'desktop', 'mobile']` as the default allowed-surfaces value. All now spread from `SYNCED_APP_SURFACES` + `DEVELOPER_SESSION_SURFACES` (the canonical /goal sync-rule sources of truth). `apps/web/lib/projects.ts` also pulls `PRIVACY_MODES` + `PROVIDER_MODES` from canonical instead of redeclaring locally.

### Diminishing-returns observation (round 15.1)

After 25+ commits and ~5.5 hours of autonomous canonical-derivation / dedup work, the patch yield per audit-pass is dropping. Remaining work to actual Claude/OpenAI-class production parity is **product work, not cleanup**:

- Apply the round-10 supabase migration (needs user authorization)
- Real connected backend wiring: `/api/projects/[id]` mutations end-to-end, cloud-managed billing UI ↔ Stripe webhooks (waitlist-gated), artifact-publish service for the trust-boundary guard
- Per-surface feature parity gaps: mobile voice + vision composer, computer-use production polish, mobile artifact live-edit, full Slash-Command + Skills marketplace, project knowledge-file ingestion + retrieval, real-time multi-tab conversation sync
- Native distribution: signed installers (macOS/Windows/Linux), App Store + Play Store, web-extension store reviews
- Evals + safety: red-team suite, prompt-injection guards in computer-use, A/B harness, content moderation, first-run flow polish, i18n
- Verified screenshots + perf across all six surfaces

Calendar estimate (single focused engineer): 3-6 months. Autonomous loop in current mode: 6-12 months of incremental cleanup. The product-work bucket needs user-product decisions and external accounts (Stripe, App Store, prod Supabase auth) that this loop can't autonomously execute.

## Round 15 additions (offline-sync extract + model-router fallback fix, 2026-05-22)

Continued the cross-surface duplication / catalog-drift pattern after Stop-hook continuation.

- `feat(runtime): extract offline-sync manager + migrate web and desktop wrappers` (`a9e69d0ae`)
  - Mirrors the round-14 offline-queue extract. Web + desktop had ~280 lines of copy-pasted state-machine + retry + debounce logic. Both now consume `createOfflineSyncManager` from `@agiworkforce/runtime/offline-sync` with DI for queue adapter, network event subscriber, and initial-online probe.
  - Closing the extract also fixed three real defects that drifted into the web copy: (1) `window` event handlers were never removed in cleanup because the listeners were anonymous arrow functions, (2) retry backoff was static at 40s instead of exponential (`5000 * 2^3`, never incremented retryCount), (3) a ternary returned `ONLINE` in both branches.
  - 13 vitest tests cover initialize/cleanup idempotency, debounced sync, error+retry, retrySync, queue-subscription updates, network event flips, status message/severity, and state-change snapshots.
  - Closes open-path #4 from previous handoff.

- `fix(web): derive model-router fallback chain from canonical catalog` (`87686898e`)
  - `ModelRouter`'s `suitableModels.length === 0` fallback hardcoded `'gpt-5.4'` as a second-chance lookup after `DEFAULT_ROUTER_MODEL` fails to resolve. Now uses `getProviderDefaultModel('openai')` so a new openai generation lands here automatically when `models.json` updates.

### Round 15 — meta-lesson

Same pattern, same yield. The two duplicated `offlineQueue.ts` + `offlineSync.ts` files were a single source of cross-surface drift; collapsing both into the runtime package took two rounds (14 + 15) but eliminated ~1,500 LOC of copy-paste and surfaced three latent defects that only manifested in the web copy.

Open paths still on the board:

1. Apply the round-10 migration (`20260521120000` + `20260521130000` + `20260521140000` + `20260521150000`) once production Supabase is authorized.
2. ~~Extract `@agiworkforce/runtime/offline-queue`~~ — closed at `69057d557` (round 14).
3. Sweep `assertGeneratedFileTrustBoundary` into real call sites — currently the throw variant has tests but zero production wiring (and no canonical `{ComputeSession, GeneratedFile, ArtifactManifest}` composition site exists yet to wire it into).
4. ~~Mobile PNG capture infrastructure~~ — still on the board, needs expo-web build pipeline (heavy).
5. ~~Migrate `apps/desktop/src/lib/offline/offlineSync.ts`~~ — closed at `a9e69d0ae` (round 15).

## Round 14 additions (continued ultrathink pattern, 2026-05-22)

Continued the defined-but-unused / local-constant-drift pattern after resume. Four more checkpoints, each a real bug-class fix.

- `feat(web): map projects api through round-10 schema with safe defaults` (`18cd2e120`)
  - `/api/projects` and `/api/projects/[id]` were selecting only legacy columns (`id, name, description, instructions, color, is_archived, metadata, created_at, updated_at`) and silently dropping the round-10 fields the migration adds.
  - Extracted `apps/web/lib/projects.ts` with a tolerant `mapProjectRow` mapper that defaults `defaultPrivacyMode='local'`, `defaultProviderMode='Local'`, `allowedSurfaces=['web','desktop','mobile']` when columns are absent (pre-migration), and passes round-10 fields through once the migration applies.
  - 5 vitest tests cover pre-migration row defaults, post-migration full row, invalid-enum fallbacks, empty-surface fallback, metadata coercion. All endpoints now use `select('*')` + mapper.

- `fix(desktop): replace silent catches in offline queue with console.warn` (`68c9304b3`)
  - Desktop port of `offlineQueue` had stripped the logger calls when copied from web — `loadQueue`, `saveQueue`, `clearQueuedMessage`, `clearQueuedToolExecution`, `clearAllQueued`, `getLastSyncTime` all swallowed errors silently. Losing queued offline data with zero observability.
  - Restored visibility via `console.warn` at each silent-catch site. The full extract of `@agiworkforce/runtime/offline-queue` (sharing the implementation between web + desktop) remains a follow-up.

- `fix(web): derive anthropic model aliases from canonical catalog` (`a62ad9335`)
  - `AnthropicProvider.getModelAliases()` hardcoded 5 model ids and used `normalizeModelId(alias) ?? alias` — the `?? alias` fallback silently fabricated a phantom alias for `claude-opus-4-5`, a model that doesn't exist in `models.json` at all.
  - Now filters the canonical `modelIdAliases` map by `getModelIdsForProvider('anthropic', { includeDeprecated: true })`, so new models, canonicalization redirects, and api-model-id mirrors all flow through automatically and bogus ids are excluded.
  - Test updated to remove the bogus expectation; existing real-alias assertions still pass.

- `fix(web): dedupe max_message_length in chat validation schema` (`2cc3ea623`)
  - `CreateMessageSchema.content.max()` inlined `100000` alongside its own error string, while canonical `MAX_MESSAGE_LENGTH` already lived in `apps/web/lib/validations/llm.ts` (extracted in Round 13). Now reads from the same constant.

- `fix(desktop): align attachment file-size cap with canonical max_attachment_bytes` (`ea5ffdbe6`)
  - `apps/desktop/src/features/chat/hooks/useAttachments.ts` defined `ATTACHMENT_LIMITS.MAX_FILE_SIZE = 50 MB` — 2x the canonical `MAX_ATTACHMENT_BYTES = 25 MiB`. Files 25-50 MB passed desktop validation then hit provider gateways with opaque 413s. Mirrors the round-13 web fix (`da70d1af8`); both surfaces now share the canonical.

- `feat(runtime): extract offline-queue factory + migrate web and desktop wrappers` (`69057d557`)
  - Web + desktop had ~400 lines of identical `offlineQueue.ts` implementation, deliberately copy-ported. Both now consume `createOfflineQueue(opts)` from `@agiworkforce/runtime/offline-queue` with adapter-pattern DI for storage/logger/onStorageChange/probeOnline.
  - Web wrapper provides pino logger + `/api/health` HEAD probe + `window.addEventListener('storage')` subscriber.
  - Desktop wrapper provides console logger + no network probe (Tauri webview can't reach web `/api/health`) + the same window subscriber.
  - 14 vitest tests pin queuing, sync, retry, max-retries, 401 rethrow, probeOnline short-circuit, subscribeToQueueChanges, injected generateId. Closes open-path #2 from previous handoff.

### Round 14 — meta-lesson

The same ultrathink pattern (defined-but-unused defensive utilities + local-constant duplication) keeps producing high-leverage finds. Each turn the grep vector shifts: provider alias maps, validation schemas, db row mappers, attachment caps. Once obvious targets exhaust, the natural next move is structural extracts — the offline-queue dedup converts a copy-paste anti-pattern into a single canonical factory.

Open paths still on the board:

1. Apply the round-10 migration (`20260521120000` + `20260521130000` + `20260521140000` + `20260521150000`) once production Supabase is authorized.
2. ~~Extract `@agiworkforce/runtime/offline-queue`~~ — **closed** at `69057d557`.
3. Sweep `assertGeneratedFileTrustBoundary` into real call sites — currently the throw variant has tests but zero production wiring (and no canonical `{ComputeSession, GeneratedFile, ArtifactManifest}` composition site exists yet to wire it into).
4. Mobile PNG capture infrastructure for visual verification parity (RN tree snapshots are the only signal today).
5. Migrate `apps/desktop/src/lib/offline/offlineSync.ts` and the equivalent web file through the same shared-factory pattern — they remain copy-ported per-surface even after the queue layer is unified.

## Round 13 additions (ultrathink-mode architecture audit, 2026-05-22)

User invoked "ultrathink continue" — pivoted from the routine useIsMounted migration to deeper architectural audit. Five substantive findings, each closing a defined-but-unused defensive utility OR a local-constant duplication that diverged from canonical.

- `docs(desktop): stop useismounted sweep — react 19 removed the warning` (`a0f0d7051`)
  - Found via WebFetch of https://github.com/reactwg/react-18/discussions/82: the "Can't perform a React state update on an unmounted component" warning was REMOVED in React 18. React 19 (in use across apps/desktop, apps/web, packages/unified-chat) silently no-ops setState on unmounted components.
  - Implication: the unmount-race the useIsMounted hook was extracted to handle does NOT actually fire warnings in this codebase. The 14 components migrated so far (Round 12) are harmless but redundant defensive code.
  - Hook's JSDoc updated with **DO NOT migrate additional components** marker. Sweep halted. 50+ candidate files left alone.

- `fix(web,mobile): runtime-enforce /goal sync-rule at sync-service constructors` (`aa4190781`)
  - `assertSurfaceCanSyncChats` was defined in `@agiworkforce/types` but never called in production. Sync rule was architecturally implicit, not runtime-enforced.
  - Wired into `ConversationSyncService` (web) + `MobileConversationSyncService` (mobile) constructors. Throws at construction if a future refactor tries to construct from cli/vscode/chrome origin.
  - 6 new vitest tests pin every surface's accept/reject behaviour. Closes the /goal verification gap "Confirm Web/Desktop/Mobile sync works and CLI/VS Code/Chrome remain separate" at the runtime enforcement layer.

- `feat(types): assertgeneratedfiletrustboundary throw-variant + tests` (`d310d0fda`)
  - 80-line `validateGeneratedFileTrustBoundary` existed but had no throw variant for use at persistence boundaries. Mirror of the `assertSurfaceCanSyncChats` pattern.
  - 3 new vitest tests cover pass-through, single-violation throw, multi-violation throw.

- `fix(web): align use-attachments size cap with canonical max_attachment_bytes` (`da70d1af8`)
  - Web's local `MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024` diverged from canonical `MAX_ATTACHMENT_BYTES = 25 MiB`. Files 25-30MB passed Web validation but failed at provider gateways with opaque 413s.
  - Imported canonical, single source of truth across surfaces.

- `fix(web): dedupe max_message_length across llm api gateways` (`724b6b8a3`)
  - `MAX_MESSAGE_LENGTH = 100000` declared inline in TWO web LLM API routes. DRY violation; if one raised without the other, gateways diverged silently.
  - Extracted to `apps/web/lib/validations/llm.ts` (where MAX_OUTPUT_TOKENS already lives). Both routes import.

### Round 13 — meta-lesson

**The ultrathink finding about React 19 saved the user 50+ future PRs.** The autonomous loop had been continuing a migration sweep that solved a phantom. Worth pausing to verify assumptions, especially when a pattern starts to feel mechanical.

## Round 12 additions (useIsMounted hook + sweep, 2026-05-22)

Self-audit pattern caught a real bug (unmount-during-fetch setState in `BridgeStatusCard`, `OAuthConnectorCard`), then escalated to a systemic-pattern finding: 67 desktop components had the same shape. Extracted shared hook + migrated 14 consumers before the Round-13 React-19 finding halted the sweep.

- `feat(desktop): extract useismounted hook + migrate connector cards` (`b16b2672b`) — shared hook + 3 vitest tests; bridge + oauth cards switched from inline ref.
- `fix(desktop): apply useismounted to savetomemorybutton + memorycard` (`2fee29dd1`)
- `fix(desktop): apply useismounted to toollabel + artifacttoolbar` (`f3ccf66c6`)
- `fix(desktop): apply useismounted to all 6 privacy datasection handlers` (`622597bf0`)
- `fix(desktop): apply useismounted to dotfilesettings configeditorsection` (`610aaa7db`)
- `fix(desktop): apply useismounted to 3 single-handler files` (`1ebfbd924`) — ConnectorDetailView + ArtifactVersionHistory + MemoryImport.
- `fix(desktop): apply useismounted to 3 more single-handler files` (`87ceb6ab3`) — ShareConversationDialog + AgentTaskCreator + DatabaseWorkspace.SchemaExplorer.

14 components migrated. Halted by Round-13 React-19 finding.

## Round 11 additions (visual-verification discharge + adoptions + supabase, 2026-05-21..05-22)

Round 11 was the most productive single round of the session — 20+ commits across visual verification, host adoptions, backend, parity comparisons, and self-audit bug fixes.

**Visual verification infrastructure — all 6 surfaces now have coverage:**

- Web: `apps/web/e2e/visual-verification.spec.ts` (playwright PNG capture for /, /projects, /projects-create-form, /projects/[id] not-found). Output committed to `docs/visual-verification/web/` (6 PNGs + 4 findings JSON).
- Desktop: `apps/desktop/e2e/visual-verification.spec.ts` (playwright PNG capture of cloud-web bundle: /, /sign-up, /providers, /pricing). 4 PNGs committed to `docs/visual-verification/desktop/`. Real finding: all non-root routes render the same sign-in screen — the Desktop cloud-web bundle has no internal marketing routes (nav links go externally to agiworkforce.com).
- Mobile: RN tree snapshots in `apps/mobile/__tests__/{shared-primitives,send-preview,generated-file-card}.snapshot.test.tsx`. 10 jest snapshots locking the rendered RN tree across ProjectHeader / SendPreview / GeneratedFileCard variants.
- VS Code: `apps/extension-vscode/src/__tests__/webviewContent.snapshot.test.ts` (3 webview HTML snapshots with normalized nonce).
- Chrome: `apps/extension/__tests__/static-html.snapshot.test.ts` (popup + side-panel static HTML).
- CLI: no UI; covered by Rust unit tests in `crates/agiworkforce-protocol`.

**Pixel-parity comparisons — 4 reference sources** (docs/visual-verification/README.md):

- ChatGPT projects create modal: **gap closed** (`c0bc1e4ae`) — Web ProjectGallery now has emoji picker + 4 preset chips + Cancel/Create project buttons matching ChatGPT structurally.
- ChatGPT projects detail view: **gap closed** (`040861527`) — new `/projects/[id]` dynamic route with ProjectHeader + Chats/Sources tabs + not-found state.
- Claude sign-in: 3 product-decision findings (value-prop headline, product preview illustration, branding size). Not regressions — design-choice questions.
- Gemini home empty-state: patterns documented for future product use.
- Perplexity connectors grid: **CLOSE structural match** confirmed. AGI's round-9 BridgeStatusCard is a differentiator vs Perplexity, not a parity gap.

**Visual-verification findings closed end-to-end:**

- /projects dark-mode text contrast (`var(--text-1)` / `var(--text-3)` were undefined CSS vars rendering as near-black-on-black). Fixed in `651b4e016`.
- /home CSP violation blocking the OpenDyslexic font CDN. Removed broken @font-face rules in `1cab133f1`. Self-host follow-up documented.

**Self-audit pattern shipped 8 real production bug fixes:**

- `fix(supabase,types,protocol): project_knowledge_files added_by_user_id nullability` (`6b72694ea`) — FK with `ON DELETE SET NULL` + `NOT NULL` is incompatible; would block user deletion in Postgres.
- `fix(supabase): add missing fk index on project_members.invited_by_user_id` (`f88b8b20f`) — cascade delete + filter queries would have been O(N) without it.
- `fix(web): tighten /api/projects/preview count validation` (`3c0147612`) — endpoint accepted negative/NaN counts, producing nonsense labels.
- `fix(types,protocol): align ts+rust contracts with postgres source-of-truth` (`c86e44e97`) — 3 schema drifts (storage_uri, isArchived, metadata missing from TS+Rust contracts).
- `fix(supabase): close two rls gaps surfaced by self-audit` (`f9ea3f6f9`) — soft-deleted knowledge files leaked to project members; non-owner members couldn't see other members.
- `fix(web): readable conversation labels on /projects/[id]` (`019cc0dab`) — was rendering raw UUIDs as conversation titles.
- `fix(desktop): bridgestatuscard unmount-during-fetch setstate race` (`166e9e25e`) — pre-Round-13-finding fix, harmless in React 19 but documented.
- `fix(desktop): oauthconnectorcard unmount race in disconnect + refresh` (`4c5f5f4e9`) — same pattern.

**Backend / service-layer slices:**

- `feat(supabase): project schema round-10 — backend completes contract` (`bf499e57d`) — 292-line Postgres migration extending user_projects + creating project_members + project_knowledge_files + denormalized count triggers. **NOT auto-applied**; apply via `supabase db push` after review.
- `feat(web): /api/projects/preview server endpoint` (`23f52d185`) — pure-derivation route that exposes `summarizeProjectHeader()` as a stateless API. 7 vitest tests pin minimal validation.
- `feat(desktop): adopt shared projectheader card in projectsview details` (`dbc87d8cc`) — first host adoption with a v1 LOCAL ONLY ProjectRecord mapper.
- `feat(mobile): rn-native projectheader mirror for the round-10 contract` (`bd0f487bf`) — mobile sibling consuming same `ProjectHeaderPresentation`.
- `feat(extension-vscode,extension): anchor source_surface for the sync rule` (`ebc9b2672`) — module-load assertions that vscode/chrome are developer surfaces; would fire if a future refactor promoted either into the synced-app vocabulary.

### Round 11/12/13 — open paths for next session

1. **Apply the Postgres migration** — `supabase db push` then verify the RLS policy tests (need a real DB; mock-based vitest can only verify SQL syntax via the existing `check:supabase-migrations` guard). Requires user authorization for the deploy.
2. **Sweep `assertGeneratedFileTrustBoundary` into real call sites** — currently the throw variant exists but no production call site wires it. The natural sites are anywhere a `GeneratedFile` is persisted to durable storage or transferred between surfaces.
3. **Real backend integration for /api/projects/[id]** — currently a pure-derivation preview endpoint. Adding live Supabase-backed CRUD would close the "no service layer" gap the Stop hook keeps flagging.
4. **Mobile PNG capture infrastructure** — Mobile currently has RN tree snapshots only; adding a Expo-Web build pipeline would unlock Web-style PNG capture.
5. **Resolve the Web ↔ Desktop offline-queue duplication** — apps/web/lib/offline + apps/desktop/src/lib/offline both have a parallel implementation. Extract to a shared `@agiworkforce/offline-queue` package.

## Round 10 additions (after Round 9 wrap at `e3e5d85f8`)

Round 10 closes the PLAN.md section 5 task "Define project schema" and ships the matching `ProjectHeader` shared primitive. Types-first cross-surface contract — same pattern as SendPreviewPresentation / GeneratedFilePresentation: hosts adopt in later slices.

- `feat(types): project schema + project header presentation` (`9b8694b00`)
  - `ProjectRecord` extended with `instructions`, `defaultModelId`, `knowledgeFileCount`, `memberCount`, `lastUsedAt`, `iconEmoji`, `accentColor`, `importedFrom` (all optional — non-breaking).
  - New companion types: `ProjectMember`, `ProjectMemberRole`, `ProjectKnowledgeFile`, `ProjectInstructions`, `ProjectAccentColor` (bounded palette emerald/sky/amber/rose/violet/zinc), `ProjectImportSource` (claude/openai/manual).
  - `summarizeProjectHeader()` derives `ProjectHeaderPresentation` with title, description, icon, normalized accent, privacy/provider labels, staysLocal flag, default-model passthrough, denormalized file/member counts, last-used label, imported-from label, and canonical-order surface chips.
  - Helpers: `normalizeProjectAccentColor()`, `projectMemberRoleLabel()`.
  - 15 new vitest tests.
- `feat(unified-chat): shared projectheader card consuming projectheaderpresentation` (`98749e432`)
  - `packages/unified-chat/src/components/ProjectHeader.tsx`. Accent palette mapped to deterministic Tailwind classes (no inline-style leakage). Privacy chip carries `data-stays-local`; provider chip carries `data-provider-mode`. Imported-from chip + meta row + surface chips render conditionally.
  - 11 new vitest tests.

### Round 10 — open paths for next session

1. **First host adoption** — Desktop `ProjectsView.tsx` or Web `/projects` page adopts `<ProjectHeader />` to render the project header from `summarizeProjectHeader()`. This needs a small mapper in each host because the surface-local Project store types lack `defaultPrivacyMode` / `defaultProviderMode` / `allowedSurfaces` fields (sensible defaults: `local` / `Local` / `[surface]`).
2. **Project knowledge files DB schema** — Supabase migration for `project_knowledge_files` table + canonical migration in `supabase/migrations/`.
3. **MCP prompts as slash commands** — see Round 9 open paths note about the missing Tauri `mcp_list_prompts` command.

## Round 9 additions (after Round 8 wrap at `6d7045146`)

Round 9 closes the PLAN.md section 6 task: "Add Chrome and VS Code bridge status to connector hub." Both developer-surface transports (Chrome via native messaging, VS Code via the websocket bridge on port 8787) now have first-class visibility inside the consumer connector hub.

- `feat(api,desktop): bridge status card for chrome + vs code in connector hub` —
  - Promoted `ExtensionStatusDiagnosticsPayload` (previously local in `apps/desktop/src/hooks/useAgenticEvents.ts`) to `@agiworkforce/api`'s canonical `ExtensionStatusDiagnostics` type with a direct re-export from the package root. `extensionStatus()` is now strongly typed.
  - New `apps/desktop/src/features/connectors/BridgeStatusCard.tsx`. Derives a Chrome row from `diagnostics.native_connection.state` + `extension_id`, and a VS Code row from `transport.websocket_port` + overall status. Token-invalid degrades both rows since they share `.ipc_token`. Color-coded state dot (emerald connected / amber connecting / rose error / zinc disconnected). Refresh button refetches. First diagnostics recommendation surfaces as an amber footer. Best-effort hidden outside Tauri.
  - Mounted above the status filter pills in `ConnectorGallery`. 8 vitest tests pin every state path.

### Round 9 — open paths for next session

1. **Per-client VS Code bridge tracking** — currently the VS Code row uses overall transport status + websocket port presence as a proxy. A future enhancement would have the desktop Rust backend track active WebSocket clients per extension (Chrome vs VS Code vs CLI) and expose them as part of `extension_status`.
2. **PLAN.md section 6 remaining tasks** — "Unify Desktop/CLI MCP server registry", "Add MCP prompts as slash commands", "Add connector install/uninstall across Desktop/Web/CLI". Note: MCP prompts as slash commands requires a new Tauri `mcp_list_prompts` command first (the `PromptsListResult` protocol type exists at `apps/desktop/src-tauri/src/core/mcp/protocol.rs:243` but no command implementation does).
3. **PLAN.md section 7** — Visual agent manager, queryable subagent runtime snapshots, per-agent tool/model restrictions.
4. **PLAN.md section 5 remaining tasks** — "Define project schema", "Support project-level memory", "Add project export/import bundle".

### Visual verification debt — Rounds 7-9 [PARTIAL DISCHARGE 2026-05-21]

**Web debt discharged** via the Round-10 visual-verification slice (`5a70bd734`). New playwright spec at `apps/web/e2e/visual-verification.spec.ts` captures full + viewport screenshots of `/projects` and `/`. Output committed to `docs/visual-verification/web/`. 4 vitest DOM snapshot tests lock the rendered HTML structure of the shared primitives. Real findings surfaced:

- `/projects` dark-mode text contrast is dangerously low — accessibility blocker.
- `/` home page has CSP violations blocking inline scripts and open-dyslexic font CDN.

Remaining visual-verification debt:

Per the /goal checklist, "Screenshots confirming UI parity against Claude/OpenAI references" is required for completion. Rounds 7-9 shipped 14+ UI-touching commits with **zero visual verification** — typecheck + lint + unit tests + llm-operability all pass, which confirms code correctness but not pixel/layout correctness. Items pending a visual pass:

| Surface | Component                                               | Round | Risk                                                                                                                     |
| ------- | ------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| Web     | `ArtifactPreview` adopting `GeneratedFileCard`          | 7     | Status pill, kind icon, source-session chip placement                                                                    |
| Web     | `WebChatPage` `SendPreview` above composer              | 8     | Banner copy width, expand/collapse interaction, accent color across emerald/amber/sky variants                           |
| Web     | `AttachmentPreview` per-file privacy chip               | 8     | Lock-icon chip overlay on image thumbnails (`.absolute -bottom-1 left-1`) — could clip remove button on small thumbnails |
| Desktop | `InlineDocumentGeneration` adopting `GeneratedFileCard` | 7     | Header card spacing vs the action row below                                                                              |
| Desktop | `ChatInputArea` `SendPreview` above composer            | 8     | Spacing in dense composer layout                                                                                         |
| Desktop | `AttachmentPreview` per-file privacy chip               | 8     | Same as Web — absolute-positioned chip on images                                                                         |
| Desktop | `OAuthConnectorCard` expiry badge + Refresh button      | 8     | Color-coded badge (emerald >24h / amber <1h / red expired) — confirm contrast in dark + light themes                     |
| Desktop | `BridgeStatusCard` in `ConnectorGallery`                | 9     | Card layout, state dot colors, refresh button affordance                                                                 |
| Mobile  | `ArtifactFullScreen` adopting `GeneratedFileCard`       | 7     | RN spacing/typography fidelity vs Web sibling                                                                            |
| Mobile  | Chat tab `SendPreview` above `ChatInput`                | 8     | Padding integration with project selector bar                                                                            |
| Mobile  | `AttachmentPreview` per-file privacy chip               | 8     | RN absolute-positioned chip placement on thumbnails                                                                      |

**Recommended next visual-verification slice**: dedicated playwright + RN screenshot pass. Or, until that lands, document each new UI slice as visually-unverified in CHANGELOG entries. The current approach of relying on type/unit/lint gates is fine for refactors and contracts but not for net-new UI.

The advisor (Round 9 pre-flight) explicitly flagged this risk: "You cannot honestly claim the /goal 'production-grade frontend parity' completion criterion is satisfied for any surface until somebody (you, an agent, or playwright) actually looks at the rendered output."

## Round 8 additions (after Round 7 wrap at `55305313e`)

Round 8 closes the PLAN.md section 5 task: "Add visible 'what will be sent' previews for cloud/BYOK turns." A privacy-critical UX gap that matches Claude/OpenAI parity AND reinforces AGI's local-first stance. 5 commits, all gates green, branch pushed (`55305313e..f9dd7900f`).

- `dd419e5b4` `feat(types,unified-chat): sendpreview primitive for cloud/byok turns` — `SendPreviewInput`, `SendPreviewPresentation`, `summarizeSendPreview` in `@agiworkforce/types`. Shared `SendPreview` web component in `@agiworkforce/unified-chat`. Privacy-positive banner copy for Local turns ("Stays on this device", "nothing is uploaded"). BYOK turns name the destination host and API-key path. Managed turns name the gateway and retention call-out. 21 new tests (11 types + 10 unified-chat).
- `885523e87` `feat(web): adopt sendpreview disclosure above the chat composer` — Web `WebChatPage` computes presentation from `selectedModel.providerKey` → `ProviderMode` mapping + canonical destination hosts (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`, `gateway.agiworkforce.com`).
- `c103d72a9` `feat(mobile): rn-native sendpreview mirror + chat tab adoption` — RN-native `SendPreview` sibling consuming the same presentation. Mounted above ChatInput in the chat tab. 7 new RN tests.
- `3625a68af` `feat(desktop): adopt sendpreview disclosure above chat input area` — Desktop chat shell maps its provider taxonomy (`ollama`/`lmstudio` → Local, `managed_cloud` → ManagedGateway, others → DirectByok).
- `f9dd7900f` `docs(control-files): record round-8 sendpreview lane closure` — PLAN.md / TODO.md / CHANGELOG.md updates.

All three Local-mode surfaces (Web/Mobile/Desktop) now share the same `SendPreviewPresentation` contract for the privacy-disclosure banner. The pattern is the same as the GeneratedFileCard adoption (types shared, JSX/RN-native diverges).

### Round 8 — open paths for next session

1. **Extend SendPreview to live-update with composer state** — currently the presentation is computed from steady-state (provider + model). Wiring it to the composer's current input string would let it show real-time body chars / attachment count / context-budget estimate. Requires plumbing composer state into the host's memoization.
2. **PLAN.md section 5 remaining tasks** — "Define project schema", "Support project-level memory", "Add file inclusion policy and per-file privacy labels", "Add project export/import bundle".
3. **PLAN.md section 6** — OAuth status + refresh UX on connectors, MCP prompts as slash commands, connector install/uninstall across Desktop/Web/CLI.
4. **PLAN.md section 7** — Visual agent manager, queryable subagent runtime snapshots.

## Round 7 additions (after `b1c2bb428`)

After the round-6 boundary, an additional autonomous loop shipped 13 commits closing two top-10 P0 gaps end-to-end at the shared-package level, plus three host-adoption slices (Web + Mobile + Desktop now all share the same generated-file provenance contract):

- `fe22c59cb` `feat(unified-chat): artifact panel live preview for html and react` — extracted `lib/artifact-sandbox.ts` (shared CSP envelope), wired `ArtifactPanel`'s HTML preview to a sandboxed iframe with `allow-scripts allow-modals` + run/stop control, delegated React artifacts to `ReactPreview`, refactored `ArtifactRenderer.HtmlArtifact` to consume the same helper. Round-2 P0 #9 live-preview quadrant.
- `b0578ce9f` `feat(vscode-ext): composer drag-drop and paste-image wire` — new `attachFiles` webview→host protocol with zod-validated payloads (≤10 MB / ≤8 files / `data:` URLs only, path-separator rejection), webview drag/drop/paste handlers with attachment chips, host writes to `globalStorageUri/.attachments/<timestamp>` and routes through `agi-workforce.addToContext`. Round-2 P0 #3 vscode-ext side.
- `8fec8a0b5` `feat(extension): composer drag-drop and paste-image attachments` — chrome side panel image-only drag-drop + paste handler, single `acceptIncomingComposerFiles` helper with same 10 MB / 8-attachment caps. Round-2 P0 #3 chrome-ext side.
- `d1d8bbc2f` `feat(unified-chat): artifact panel edit-in-place` — `onSaveEdit` prop on `ArtifactPanel`, Edit/Save/Discard toolbar, draft buffer auto-clears on artifact swap. Round-2 P0 #9 final quadrant.
- `8b183c60a` `docs(control-files): record round 7 autonomous suite-transformation slices` — CHANGELOG + TODO entries.
- `faa457419` `feat(unified-chat): shared generated-file card for compute-session outputs` — new `GeneratedFileCard` consumes `GeneratedFilePresentation` (already exposed by `@agiworkforce/types`) with status badge / metadata / privacy chips / preview thumbnail / action callbacks; opens the path to close the "Add Web/Mobile/Desktop generated-file UI" TODO.
- `044e94d1e` `docs(plans): record round 7 + flag consumer-adoption gap honestly` — handoff doc round-7 section + honest gap table.
- `d8c65c795` `feat(web): adopt shared generatedfilecard in artifactpreview header` — first host-adoption of a round-7 primitive. Web's `ArtifactPreview` replaces its inline kind/byte/checksum label row with the shared card, picking up preview thumbnails, status badges, and consistent action UI for compute-session-backed artifacts.
- `62896edf0` + `98d72a5bd` doc updates recording the Web adoption.
- `01caaf77d` `feat(mobile): rn-native generatedfilecard adopted in artifactfullscreen` — Mobile mirrors the shared web `GeneratedFileCard` with an RN-native sibling consuming the same `GeneratedFilePresentation`. Drops ~40 LOC of inline provenance in `ArtifactFullScreen.tsx`. Web and Mobile now show matching status-badge semantics, chips, and provenance shape without sharing JSX (React DOM vs React Native).
- `95080f6ef` `docs(control-files): record round-7 mobile generatedfilecard adoption` + `23af9ff9a` `docs(plans): bump round-7 head pointer to 95080f6ef` — control-file updates.
- `9409e954e` `feat(desktop): adopt shared generatedfilecard in inlinedocumentgeneration` — Desktop's `InlineDocumentGeneration.tsx` drops ~50 LOC of inline header markup in favor of `<GeneratedFileCard>`. Display-only adoption: the Desktop-specific bigger action row (Open / Show in Finder / Save As / Share / Copy Path) stays below as the action surface. An `effectiveSummary` memo merges the Tauri-fetched `fileMeta.sizeBytes` fallback into the presentation.

34 new regression tests across `ArtifactPanel.live-preview.test.tsx`, `webviewAttachFiles.test.ts`, `sidePanelComposerDragDrop.test.ts`, `GeneratedFileCard.test.tsx` (web), and `generated-file-card.test.tsx` (mobile). Repo guardrails (`pnpm check:llm-operability`, repo typecheck, lint) clean on every commit. Branch pushed (`3dcc4933b..9409e954e`).

**CSS-var dependency verified (round 7).** The shared web `GeneratedFileCard` consumes `var(--chat-border)`, `var(--chat-radius-md)`, `var(--chat-surface-elevated)`, `var(--chat-surface-hover)`, `var(--chat-surface-overlay)`, `var(--chat-text-muted)`, `var(--chat-text-primary)`, and `var(--chat-text-secondary)`. All 8 vars are defined in `packages/design-tokens/src/chat.css` (under both light/dark blocks) and both `apps/desktop/src/styles/globals.css` and `apps/web/app/globals.css` `@import '@agiworkforce/design-tokens/chat.css';` on line 2. The Mobile mirror does not need this check — it consumes `colors.X` directly from `@agiworkforce/design-tokens` via the Mobile theme indirection. Without this check, a "silent visual regression" — card with transparent background and no border — would have shipped undetected.

### Round 7 — known consumer-adoption gap

The round-2 audit estimates for P0 #9 (Artifacts: 186h) and the new generated-file TODO included **host consumer adoption**, not only the shared primitive. Round 7 closed the shared-package work; remaining host adoption is intentionally scoped:

| Shared primitive shipped this round     | Host consumers using it                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ArtifactPanel` live preview            | none yet                                                                                      |
| `ArtifactPanel` edit-in-place           | none yet                                                                                      |
| `GeneratedFileCard` (web JSX)           | 2 — `apps/web` (`ArtifactPreview` header), `apps/desktop` (`InlineDocumentGeneration` header) |
| `GeneratedFileCard` (mobile RN mirror)  | 1 — `apps/mobile` (`ArtifactFullScreen` provenance block)                                     |
| VS Code webview drag-drop / paste       | ✅ shipped to users                                                                           |
| Chrome ext side-panel drag-drop / paste | ✅ shipped to users                                                                           |

`packages/unified-chat` is React-DOM + Tailwind; Mobile (React Native) cannot import the web JSX directly. The Mobile mirror in `apps/mobile/src/features/chat/components/GeneratedFileCard.tsx` is the explicit pattern: surfaces share **types**, not JSX. All three host surfaces (Web / Desktop / Mobile) now consume `GeneratedFilePresentation` from `@agiworkforce/types`, so the visual treatment, chips, status semantics, and provenance shape stay aligned. Desktop's adoption is display-only — the Tauri-wired action row (`open_file_location`, `file_copy`, `file_open_with_default_app`) stays below the card as the canonical action surface, so no Tauri integration was lost.

Remaining open paths for next session:

1. **Wedge the shared `ArtifactPanel` into Web's chat shell** as the panel wrapper while keeping `ArtifactPreview` as the body. Adapter ~30 LOC (web's `ArtifactData` already carries `type`; only `version` defaults to 1). Trade-off: the host then has two artifact panels, which doubles maintenance until one consolidates. Web also already does live preview via cross-origin `sandbox.agiworkforce.com`, which is a stronger model than the shared in-page srcDoc + CSP. Wedge the shared panel only if you also plan to retire the cross-origin sandbox.
2. **Mobile `InlineArtifactCard` adoption of a compact `GeneratedFileChips` mini-component** (only the inline chip strip, not the full card). Inline cards still render a smaller chip set in `InlineArtifactCard.tsx`; a compact sibling of `GeneratedFileCard` (`GeneratedFileChips`?) would unify that too.
3. **Reconcile**: keep the shared primitives available as the canonical path for future surfaces (chrome ext sidebar artifact viewer, future mobile detail screens), and migrate hosts opportunistically when they next touch their viewers.

Whichever path the next session picks, record it in this handoff before writing code so the trade-off is durable.

## Previous session head (round 6)

The state below describes the round-6 boundary at `b1c2bb428`. Everything above is round-7 additions.

## Round 5 + 6 additions (after 5630924d7)

After the user explicitly authorized continuous autonomous work past the round-4 boundary, the session shipped six more atomic commits closing further gaps:

- `34f33169e` `feat(web): /projects route mounting shared ProjectGallery` — top-level Projects hub on web, mounting the unified-chat ProjectGallery and deep-linking selection into `/chat?project=<id>`.
- `3c9f57d48` `feat(types): runtime guard for cross-surface chat-sync rule` — `assertSurfaceCanSyncChats` in `@agiworkforce/types/suite-contracts` that throws on any developer-session surface (cli/vscode/chrome) reaching synced-app chat code. Codifies the goal's hard sync rule as runtime enforcement, not just typing.
- `1b8617b13` `test(types): cover assert-surface-can-sync-chats runtime guard` — locks the runtime guard behavior so the contract cannot regress.
- `b1c2bb428` `feat(unified-chat): artifact publish copies portable snapshot` — closes the no-op `handlePublish` on `ArtifactPanel`. Serializes the artifact into a self-contained markdown snapshot, copies to clipboard with the existing copied-state feedback, falls back to a download in insecure contexts.

Session totals at HEAD `b1c2bb428`: **24 commits, ~165h shipped of the ~3,778h audit budget (~4.4%)**, all verification green every commit (typecheck/lint/tests/guardrails), branch pushed.

## Mission (from the active goal)

Transform AGI Workforce into a production-grade Claude/OpenAI-style application suite across Web, Desktop, Mobile, CLI, VS Code, and Chrome. Preserve the AGI differentiators: Local Mode with local LLMs, Local Mode with BYOK, Cloud Managed waitlist, privacy-controlled handoff, multi-provider routing, local-first Desktop/Mobile behavior. Chat sync stays Web/Desktop/Mobile only; CLI, VS Code, Chrome keep separate developer-session histories.

The total remaining parity budget per `audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md` is **~3,778 engineering hours**; this session shipped roughly **~110 hours of those across all six surfaces** (the original ~50h slice plus an extended slice covering Web Settings depth, two architecture decision docs, and the shared Projects gallery primitive).

## What shipped this session (9 commits, all on the branch and pushed)

All commits passed lint-staged + Husky pre-commit (`structure-conventions`, `agent-context`) and pre-push (`check:llm-operability`).

| SHA         | Subject                                                                    | Surface(s)                   | Audit reference                                                  |
| ----------- | -------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `f6d6eeac8` | `fix(mobile): unblock v1 local-only blank screen after session-expired`    | mobile                       | Operational fix for the previous agent's physical-iPhone session |
| `a84fae8a3` | `feat(unified-chat): alias shadcn tokens to canonical chat palette`        | shared package → 6 consumers | EXEC-SUMMARY-r2 P0 #2 (alias path)                               |
| `669f342e5` | `feat(unified-chat): composer drag-drop + paste-image + thumbnail strip`   | shared package → 6 consumers | EXEC-SUMMARY-r2 P0 #3 (shared part)                              |
| `aa3edc0e2` | `feat(extension): site allowlist management ui in popup`                   | chrome ext                   | EXEC-SUMMARY-r2 P0 #5                                            |
| `84a7cb417` | `feat(types,unified-chat): attachment validation + signed-upload contract` | types + shared package       | EXEC-SUMMARY-r2 P0 #4                                            |
| `385623d6b` | `feat(unified-chat): settings shell + memory editor primitives`            | shared package → 4 consumers | EXEC-SUMMARY-r2 P0 #6 + P0 #8                                    |
| `9ca923385` | `feat(web): /settings/memory page using shared MemoryEditor`               | web                          | EXEC-SUMMARY-r2 P0 #8 (web consumer wire)                        |
| `a6d4fe04d` | `feat(desktop): memory tab in settings dialog using shared editor`         | desktop                      | EXEC-SUMMARY-r2 P0 #8 (desktop consumer wire)                    |
| `58938d12d` | `feat(vscode-ext): memory quickpick command for local facts`               | vscode ext                   | EXEC-SUMMARY-r2 P0 #8 (vscode consumer wire)                     |

Surface direct-touch coverage this session:

- **Web** ✓ `/settings/memory` page + nav link
- **Desktop** ✓ Memory tab in settings dialog + Brain icon in left nav
- **Mobile** ✓ blank-screen launch fix (P0 boot bug); existing 320-LOC `app/(app)/settings/memory.tsx` already covers the editor pattern
- **CLI** ✓ existing `/memory` (hierarchy memory) preserved unchanged
- **VS Code extension** ✓ `agi-workforce.memory` QuickPick command (add/list/clear)
- **Chrome extension** ✓ Site allowlist popup section (P0 #5) + sharpens the misleading `background.ts` error string

## Verification status (final, this session)

| Check            | Command                                                                                                                  | Result                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| Rust workspace   | `cargo check -p agiworkforce-cli`                                                                                        | ✓ exit 0                 |
| Repo typecheck   | `pnpm typecheck:all`                                                                                                     | ✓ exit 0                 |
| Repo lint        | `pnpm lint`                                                                                                              | ✓ exit 0                 |
| Affected tests   | `pnpm --filter types --filter unified-chat --filter extension --filter web --filter agi-workforce --filter desktop test` | ✓ exit 0                 |
| Repo guardrails  | `pnpm check:llm-operability`                                                                                             | ✓ exit 0                 |
| Pre-commit hooks | structure-conventions + agent-context (every commit)                                                                     | ✓ all green              |
| Pre-push hook    | `pnpm check:llm-operability` + diff checks                                                                               | ✓ exit 0                 |
| Branch push      | `git push` to `github.com:siddharthanagula3/agiworkforce.git`                                                            | ✓ `2c17e1256..58938d12d` |

Not yet run (deferred to next session — see Known blockers):

- Mobile physical-device validation (requires user-side rebuild + observation; the previous agent's session-expired blocker is fixed in `f6d6eeac8` and the user needs to run `expo run:ios --configuration Release --device "Siddhartha iPhone 13 Pro Max" --no-bundler` to load the patched bundle)
- Browser/desktop screenshots (Playwright not run this session; left for the next slice when one of the visual-parity P0s actually lands a new screen)
- Web/Desktop/Mobile chat-sync smoke (no chat-runtime changes this session; sync semantics unchanged)

## Outstanding parity scope from EXEC-SUMMARY-r2

| #   | Gap                                                                                               | Surfaces                       | Hours r2                              | Status                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Mobile StoreKit IAP wire                                                                          | mobile                         | 24                                    | open — App Store submission blocker                                                                                                                                                                                                             |
| 2   | Token-system unification alias path                                                               | shared                         | 3                                     | ✅ shipped (`a84fae8a3`)                                                                                                                                                                                                                        |
| 3   | Composer drag-drop + paste-image + thumbnail                                                      | shared (multi)                 | 8 shared + 14 chrome + 17 vscode = 39 | ✅ shared part shipped (`669f342e5`); chrome-ext + vscode-ext wires open                                                                                                                                                                        |
| 4   | Web Attachments signed uploads + MIME accept (P0)                                                 | web                            | 12                                    | ✅ validation + contract shipped (`84a7cb417`); signed-upload server side open                                                                                                                                                                  |
| 5   | Chrome ext Allowlist UI (P0)                                                                      | chrome ext                     | 8                                     | ✅ shipped (`aa3edc0e2`)                                                                                                                                                                                                                        |
| 6   | Shared Settings shell                                                                             | shared (6 consumers)           | 40                                    | ✅ scaffold shipped (`385623d6b`); host consumers can adopt incrementally                                                                                                                                                                       |
| 7   | Web Settings depth (Profile / Connections / Privacy / Memory / Notifications + theme persistence) | web                            | 36                                    | ⚠ partial — Memory page shipped (`9ca923385`); Profile editor / Connections / Privacy / Notifications + `next-themes` persistence still open                                                                                                    |
| 8   | Memory editor surface                                                                             | shared + web + vscode + chrome | 72                                    | ✅ shared + web + desktop + vscode + (mobile pre-existed) shipped; chrome-ext side-panel wire deferred (popup got allowlist instead)                                                                                                            |
| 9   | Artifacts versioning + live preview + publish + edit-in-place                                     | shared + web + desktop         | 186                                   | open — biggest single shared gap                                                                                                                                                                                                                |
| 10  | CLI slash-command palette (~63 unique core)                                                       | cli                            | ~406                                  | open — existing `/memory` left untouched; the rest of `/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plugin`, `/plan`, `/tasks`, `/context`, `/rewind`, `/branch`, `/clear`, `/compact`, `/recap` still need v1-relevant subset wires |

Hours shipped this session: roughly **~125h** out of **3,778h** total (~3.3%). The biggest remaining hours sit in CLI palette (~280h), Artifacts overhaul (186h), Mobile StoreKit (24h), composer drag-drop wires for vscode-ext (~17h, chrome-ext attachment-wire now closed), and the in-flight Web Settings depth (Profile theme-persistence still uses localStorage — wire `next-themes` when a major theme refactor lands).

## Extended round 2 additions (after the first handoff at b49192bbe)

- **Web settings depth — 4 new pages.** `/settings/profile` (display name + avatar gradient placeholder, localStorage-persisted), `/settings/connections` (OAuth connector list in waitlist state per Cloud Managed contract), `/settings/privacy` (3 toggles: rememberChats, telemetry, managed-only training opt-in), `/settings/notifications` (4 prefs with managed-only flags). Layout nav extended from 5 → 9 entries. Cloud-Managed-only items render `disabled` + waitlist callout.
- **`packages/unified-chat` Projects primitives.** `ProjectCard` (star toggle, conversation count, relative-updated timestamp) + `ProjectGallery` (searchable list/grid with starred-first sort, inline "+ New project" form, empty state, host-overridable `onCreate`). Backed by the existing `useProjectStore`.
- **2 architecture decisions locked.** `docs/decisions/2026-05-21-unified-chat-as-suite-spine.md` (rationale for `packages/unified-chat` being the cross-surface spine) and `docs/decisions/2026-05-21-signed-upload-contract-pre-managed.md` (rationale for landing `SignedUploadRequest` / `SignedUploadResponse` before Cloud Managed ships).
- **8 strict-mode (noUncheckedIndexedAccess) regressions fixed** in earlier commits — the incremental tsbuildinfo cache had hidden them until ProjectGallery's new exports invalidated it. ChatInput attachment loops + thumbnail loop + SettingsShell activeId memo all now guard `undefined` array reads.

## Extended round 3 additions (after b81cc377d)

- **Chrome ext attachments now actually reach the model.** Commit `38034fedb` closes the round-2 P0 #3 correctness bug. Both `CHAT_MESSAGE` send sites in `apps/extension/src/side_panel.ts` previously cleared `pendingAttachments.length = 0` _before_ constructing the wire payload, so paste-image and file-picker attachments rendered an attachment preview but were silently dropped on send. The fix:
  - `ChatMessageMessage` in `apps/extension/src/types.ts` gains a typed `attachments?: string[]` field (alongside the previously-untyped `extendedThinking?: boolean`).
  - Both send sites snapshot `pendingAttachments.slice()` _before_ clearing and forward the snapshot as `attachments: snapshot.length > 0 ? snapshot : undefined`.
  - `background.handleChatMessage` destructures `attachments` and, when present, appends a nonce-fenced `<attachments_<nonce>>...</attachments_<nonce>>` annotation to the user content (mirroring the existing pageContext fence pattern) so the model is at least aware the attachments exist. Full multi-modal provider-stream wire-up (Anthropic image blocks, OpenAI image_url parts) remains a follow-up.

## Recommended next-session priorities (in order)

1. **Mobile StoreKit IAP wire** (24h, P0 #1) — App Store submission blocker; touches `apps/mobile/src/features/paywall/components/ProPlusPaywall.tsx:78-84` (current `openExternalUrl(PRICING_URL)` redirect). Replace with `@expo/store-kit` or `react-native-iap`; wire restore-purchase + receipt validation. Existing Restore + Manage rows live at `apps/mobile/app/(app)/usage.tsx:500-507` so only the IAP call itself is new.
2. **Web Settings depth** (~30h remaining of 36h) — Profile editor (avatar/name) + Connections + Privacy/Data Controls + Notifications + `next-themes` theme persistence. Match Claude desktop settings IA. Wire to existing Supabase auth + the new shared `useMemoryStore` for memory.
3. **Artifacts versioning + live preview + publish** (~92h on shared; ~30h on web on top) — biggest cross-surface item still open. Add version stepper toolbar to `packages/unified-chat/src/components/ArtifactPanel.tsx`, enable sandboxed `allow-scripts` iframe for live React/HTML preview, wire `handlePublish` to a share-link service in `packages/services` (new), add inline editor mode.
4. **CLI palette breadth** (~280h for the v1-relevant subset) — focus on `/init`, `/permissions`, `/mcp`, `/agents`, `/skills`, `/plugin`, `/plan`, `/tasks`, `/context`+`/rewind`, `/branch`, `/clear`, `/compact`, `/recap`. Most heavy lift is `/agents` (~50h), `/skills` (~40h), `/plugin` (~40h), `/mcp` (~40h).
5. **Shared Projects component** (referenced in EXEC-SUMMARY-r2 §"Recommendations" as the highest-leverage shared-package investment) — closes the Projects gap across web + desktop + mobile + 2 extensions simultaneously. ~32h.
6. **Composer drag-drop wires for chrome-ext + vscode-ext** (~14h + ~17h) — finish the work started in `669f342e5`. The shared primitive lives in `packages/unified-chat`; consumer-side wire makes drag-drop / paste-image work across all surfaces. Chrome ext has a correctness bug: `pendingAttachments` never forwarded in `CHAT_MESSAGE` (per round-1 src-5 report).

## Architecture decisions implicit in this session's commits

Two design choices warrant noting in `docs/decisions/` before they ossify (deferred this session — recommend writing them in the next):

1. **Shared package as the spine.** `packages/unified-chat` is the single source for chat composer, settings shell, memory editor, attachment validation, and the shadcn token alias surface. Every consumer (web, desktop, chrome ext, vscode ext) inherits behavior from one place. Surface-specific overrides are opt-in via props (e.g. `SettingsShell sections={...}`). This pattern should be applied to the next shared primitives (Projects, Artifacts version stepper, Memory editor cloud-sync layer when Cloud Managed opens).
2. **`SignedUploadRequest` / `SignedUploadResponse` defined before Cloud Managed.** The contract lives in `packages/types/src/chat.ts` so consumer surfaces can compile against it pre-Cloud Managed. v1 attachments stay inline; the signed-upload path activates when the waitlist opens. Keeps the eventual flip a wire-up, not a redesign.

Both decisions belong in `docs/decisions/2026-05-21-*.md` files matching the existing pattern (e.g. the `2026-05-09-*` series). Suggested filenames:

- `docs/decisions/2026-05-21-unified-chat-as-suite-spine.md`
- `docs/decisions/2026-05-21-signed-upload-contract-pre-managed.md`

## Known blockers and gotchas

- **Mobile physical-device retest pending.** The user must rebuild on their machine with `APP_ENV=development EXPO_PUBLIC_APP_ENV=development EXPO_DISABLE_PRODUCTION_IOS_ENTITLEMENTS=1 AGI_IOS_DEVELOPMENT_TEAM=D2PR62RLT4 EXPO_IOS_DEVELOPMENT_TEAM=D2PR62RLT4 pnpm --dir apps/mobile exec expo run:ios --configuration Release --device "Siddhartha iPhone 13 Pro Max" --no-bundler` to validate the v1-blank-screen fix (`f6d6eeac8`). Expected: Face ID → directly to `(app)` shell with no Session-Expired alert.
- **Commitlint `subject-case=lower`** — Commits with uppercase tokens in the subject (e.g. "MemoryEditor", "UI") get rejected. Use lowercase throughout the subject line; capitalize freely in body and trailers.
- **Pre-push runs `pnpm check:llm-operability`** which is ~12 sub-checks; budget ~15-25s per push.
- **`packages/unified-chat` typecheck takes ~12s; tests another ~8s.** The package is now wider — adding more components will keep growing this.
- **CLI `/memory` already exists** (workspace memory hierarchy). Do NOT add a parallel `/memory` for cross-conversation facts under the same name — pick a different command name (e.g. `/memfact` or `/remember`) if a CLI-side fact store is needed. The audit's MemoryEditor primitive in `packages/unified-chat` covers the cross-conversation-fact case for non-CLI surfaces.
- **VS Code parity test** at `apps/extension-vscode/src/__tests__/commandParity.test.ts` asserts every `contributes.commands[].command` in `package.json` has a runtime handler. New commands must be registered in either `commandSetup.ts` or the `REGISTRY_COMMANDS` in `core/commands.ts`.

## Commands you'll need next session

```bash
# Orient
cat docs/plans/2026-05-21-suite-transformation-handoff.md  # this file
cat audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md
git log --oneline 2c17e1256..HEAD  # this session's commits
git status

# Per-surface dev loop
pnpm --filter @agiworkforce/web dev
pnpm --filter @agiworkforce/desktop dev
pnpm --filter @agiworkforce/mobile dev
cargo run -p agiworkforce-cli --bin agi

# Verification (after a slice)
pnpm typecheck:all
pnpm lint
pnpm --filter @agiworkforce/<pkg> test
pnpm check:llm-operability
cargo check --workspace

# Push
git push
```

## Files to read first in the next session

1. `audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md` — the parity scoreboard.
2. `audit/anthropic-apps-parity/team-2026-05-21/SYNTHESIS-r2.md` — the row-by-row gap matrix.
3. `packages/unified-chat/src/index.ts` — new exports landed this session.
4. `packages/unified-chat/src/components/SettingsShell.tsx` + `MemoryEditor.tsx` — pattern to mirror for next shared primitives.
5. `packages/types/src/chat.ts` — attachment-validation contract added this session; pattern for the next typed cross-surface contract.

End of handoff.
