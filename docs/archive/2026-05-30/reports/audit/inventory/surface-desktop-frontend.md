# Surface Inventory — Desktop Frontend (`apps/desktop/src`)

Auditor slice: Desktop frontend (React 19, Tauri v2). Read-only recon.
Date: 2026-05-29. Repo HEAD: `main` @ 867db867d.

Scope: `apps/desktop/src/**` (TS/TSX). The Rust backend (`apps/desktop/src-tauri`) and
the shared `@agiworkforce/unified-chat` package are OUT of this slice and were only
inspected to resolve reachability/ownership questions, not audited.

---

## 0. Headline (read this first)

1. **The slice premise about fabricated stats is STALE / already fixed.** The instructions
   call out `CodeModeHome.tsx` hardcoded `612 / 697587 + RNG heatmap` and `analyticsQueries.ts`
   fabricated data. Both have been **remediated**: `CodeModeHome.tsx` now renders `—`
   placeholders + an all-zero heatmap with an honest "not yet wired" comment
   (`CodeModeHome.tsx:7-45`), and `analyticsQueries.ts` returns honest-empty results for every
   metric with no backend command (`services/analyticsQueries.ts:74-99,154-184`). No
   `Math.random` activity data is rendered to users anywhere in non-test code.
   **BUT** `CodeModeHome.tsx` is now **dead code** (see §1), so this is moot for the shipping app.

2. **The v3 shell P0 #1 ("cowork/code route to placeholders") is OBSOLETE in a new way.**
   `DesktopShellV3.tsx` no longer has cowork/code modes at all — `V3Mode = 'chat'` is the only
   mode (`DesktopShellV3.tsx:15,19-22`). The shell renders only Sidebar + AccountMenu +
   package `ChatInterface` + CapModal. The Cowork/Code/ArtifactWorkspace components still exist
   in `features/v3/` but are **orphaned** (exported by the barrel, mounted nowhere).

3. **Largest finding: two big dead-code islands** — (a) most of `features/v3/` and
   (b) the entire legacy `UnifiedAgenticChat` rendering tree under `features/chat/`
   (`index.tsx → AppLayout → ChatStream → MessageBubble → ArtifactPanel`). The live chat/artifact
   UI is owned by the `@agiworkforce/unified-chat` package, not desktop src.

4. **P1 broken feature: 6 of 7 sidebar nav buttons in the live shell are dead** (no-op clicks)
   because Sidebar emits view strings the App.tsx handler does not recognize.

5. **Settings IA does not match the locked SoT P0 #2 IA** (no top-level Billing / Usage /
   Developer / AGI Code / AGI in Chrome; `billing→account`, `extensions→connectors` collapsed).

6. **Security posture of the LIVE shell is good**: API keys flow through Tauri
   `secret_manager_*` IPC (native secure store), never localStorage; onboarding BYOK is correct
   and respects the trust boundary; DOMPurify + sandboxed iframes guard artifact HTML (though the
   audited copies are in dead desktop code; the package owns the live path — not audited here).

---

## 1. Purpose & Architecture

`apps/desktop/src` is the React 19 + Vite frontend for the Tauri v2 desktop app. ~1,184 `.ts/.tsx`
files; 71 stores (Zustand), 37 hooks, 21 services, 41 lib modules, ~80 feature dirs.

Entry: `main.tsx` → `App.tsx` (~1,500 lines). `App.tsx` is the real shell. It lazy-mounts a
small set of roots; everything alive is in the import closure of one of these roots:

| Root (App.tsx) | Path | Live? |
| --- | --- | --- |
| `ChatInterface` | `@agiworkforce/unified-chat` (PACKAGE) | yes — owns live chat/artifact rendering |
| `DesktopShellV3` | `features/v3` | yes — feature-flagged `DESKTOP_CHAT_V3` (default-on), wraps `ChatInterface` |
| `SearchModal` | `features/chat/SearchModal` | yes |
| `CommandPalette` | `features/chat/CommandPalette` | yes |
| `FloatingChat` | `features/floating-chat` | yes — self-contained mini composer |
| `QuickQuery` | `features/quick-query` | yes |
| `VoiceInputOverlay` | `features/voice/VoiceInputOverlay` | yes |
| `SettingsPanel` | `features/settings/SettingsPanel` | yes |
| `PlansModal`, `OnboardingWelcome`, `AuthPage`, `StatusBanner`, `OfflineIndicator`, `UpdateChecker/Dialog`, `AutomationPermissionsModal`, `TimeoutWarningDialog`, `VisualizationLayer`, `ErrorToastContainer` | various | yes |

**Critical architecture fact**: the live in-thread chat UI (message stream, tool cards, artifact
panel, sidecars) is rendered by the PACKAGE `ChatInterface`, NOT by desktop `features/chat/*`.
The desktop `features/chat/` tree is a legacy `UnifiedAgenticChat` implementation that was
superseded by the package and is no longer mounted. This matches `docs/surfaces/desktop.md`
("the retired `UnifiedAgenticChat/` directory is removed and guarded") — except the code was
moved into `features/chat/`, not deleted, and large parts of it are now dead duplicates.

### v3 shell live closure (verified)
`DesktopShellV3` is the ONLY symbol imported out of `features/v3` (App.tsx:91-95). Its transitive
closure within v3 is exactly `{ EmptyChat, CapModal, Sidebar, AccountMenu }`
(`DesktopShellV3.tsx:8-11`; Sidebar/EmptyChat/CapModal/AccountMenu import nothing else from v3).
The live v3 shell composes: collapsible Sidebar (240/64px) + AccountMenu popover + package
`ChatInterface` (with `EmptyChat` as empty-state slot) + `CapModal` (hard budget cap).

---

## 2. Alive vs Dead

### ALIVE (verified reachable from an App.tsx root)
- v3 shell: `DesktopShellV3`, `Sidebar`, `AccountMenu`, `EmptyChat`, `CapModal`.
- `features/chat/SearchModal.tsx`, `features/chat/CommandPalette.tsx` (+ their store/hook deps).
- `features/floating-chat/index.tsx`, `features/quick-query/index.tsx`, `features/voice/VoiceInputOverlay.tsx`.
- `features/settings/SettingsPanel.tsx` + the 12 mounted tabs under `features/settings/tabs/`.
- `features/onboarding/OnboardingWizard.tsx`, `OnboardingWelcome.tsx`, `features/auth/*`.
- `features/pricing/PlansModal.tsx`, error-handling, updates, offline, status-banner, screen-capture.
- `services/analyticsQueries.ts` (used by `AnalyticsSettings`/analytics store path).

### DEAD / ORPHANED (exists, not in any live root closure)
- **`features/v3/` orphans** (exported by `features/v3/index.ts` but only `DesktopShellV3` ever
  leaves the barrel): `CodeModeHome`, `CoworkHome`, `CoworkProjects`, `CoworkScheduled`,
  `CoworkArtifacts`, `CoworkDispatch`, `ArtifactWorkspace`, `ActiveChat`, `Composer`,
  `ModelPopover`, `PlusMenu` (the v3 one), `Pricing` (v3 one), `PluginMarketplace`, `PluginDetail`,
  `PluginsHub`, `SkillsView`, `ConnectorsView`, `CustomizeHub`, `MicSettings`, `SpendStackImporter`,
  `SearchModalCmdK`, `InlineArtifactChip`, `ResponseActionRow`, `ThinkingPill`, `DowngradeFlow`,
  `CancelFlow`, `PauseFlow`. Verified: `grep "from '.../features/v3'"` outside v3 returns ONLY
  the App.tsx lazy import of `DesktopShellV3`.
- **Legacy `UnifiedAgenticChat` tree under `features/chat/`**: `features/chat/index.tsx`
  (the big container with risk-detection patterns) has **zero importers** and is never
  dynamically imported. `<AppLayout>` is rendered only inside `features/chat/index.tsx`
  (`index.tsx:1499`); `<ArtifactPanel>` is rendered only inside `features/chat/AppLayout.tsx`
  (`AppLayout.tsx:451`); `ChatStream.tsx` is imported only by `index.tsx`. So the chain
  `index.tsx → AppLayout → ChatStream → MessageBubble → ArtifactPanel/Sidecar` is all dead.
- **`features/artifacts/*` and `features/chat/artifacts/*`** (HtmlArtifact, SvgArtifact,
  MarkdownArtifact, ArtifactRendererView, etc.) are dead duplicates of the package's
  `ArtifactPanel`/`ArtifactRenderer`/`ReactPreview`. They are reachable only via the dead
  `AppLayout`. The package (`packages/unified-chat/src/components/ArtifactPanel.tsx`,
  `ArtifactRenderer.tsx`, `artifact-components/ReactPreview.tsx`) owns the live artifact path.

> Caveat on "dead": these are ES-module-level orphans (no live import edge). Vite tree-shaking
> would drop pure orphans from the bundle, but barrel re-exports (`features/v3/index.ts`,
> `features/chat/index.tsx`) can retain them. Either way they are user-unreachable. The risk is
> maintenance drift: bug-fixes and security hardening applied to these copies do not reach users.

> Caveat on completeness: I traced from all App.tsx lazy/static roots and resolved the
> high-value chains (artifact workbench, chat stream, v3 shell). I did NOT individually trace
> every one of the ~80 feature dirs. Dirs like `features/canvas`, `features/editing`,
> `features/agi`, `features/teams`, `features/marketplace` were not fully resolved and may be
> alive (e.g. via Settings/Plans/Canvas entry points) or dead. Treat unlisted feature dirs as
> "not resolved."

---

## 3. Test Coverage

- 151 `*.test.*/*.spec.*` files; 26 `__tests__` dirs.
- Densest coverage: `features/chat/__tests__` (21), `stores/__tests__` (20 + 7 chat + 6 root),
  `lib/__tests__` (18), root `__tests__` (24), `features/settings/__tests__` (6), `hooks` (6),
  `services` (5), `ui` (3), `connectors`/`mcp` (2 each).
- The package `@agiworkforce/unified-chat` carries the live-path tests (e.g.
  `ArtifactPanel.live-preview.test.tsx`, `artifactComponents.test.tsx`) — out of slice.
- Gap of note: the live v3 shell (`DesktopShellV3`, `Sidebar` nav routing, `AccountMenu`) has no
  visible dedicated test that would have caught the dead-nav-button bug (§7). Much of the tested
  `features/chat/__tests__` exercises the DEAD legacy tree, inflating apparent coverage.

---

## 4. Panic / Crash Sites (TS analog: uncaught throws on reachable render/hook paths)

- `throw new Error` count (non-test): 774. Spot-sampled: overwhelmingly input-validation guards,
  IPC error wrapping, and genuine invariants — not user-common-path crashes.
- The LIVE v3 shell (`DesktopShellV3`, `Sidebar`, `AccountMenu`, `EmptyChat`, `CapModal`) and
  `SettingsPanel` contain **no** `throw` in render/hook bodies. No reachable render-time crash
  found in the live shell.
- Non-null assertions in live `Sidebar.tsx` (`groups[0]!` … `groups[4]!`, lines 49-53) are SAFE:
  the `groups` array is constructed literally with 5 elements immediately above (`Sidebar.tsx:39-45`).
- No `panic!/unwrap/expect/todo!/unimplemented!` — those are Rust and out of slice.

No P0/P1 crash sites identified on user-reachable frontend paths.

---

## 5. TODO / FIXME / HACK

- 57 matches (non-test). ~40 are an identical benign banner: `// TODO(task-1.3): migrate to
  packages/runtime/state (see AppStateStore.ts domain mapping)` at the top of nearly every store
  in `stores/*.ts`. Tracking debt, not broken behavior.
- Notable: `features/pricing/PlansModal.tsx:136` — `{/* TODO(billing): replace above with real
  pricing once Stripe products are finalized */}` (PlansModal is ALIVE; pricing may be placeholder).
- A handful of `executionSidecarStore.ts:1`, `researchStore.ts:1`, `securityStore.ts:1` etc. share
  the task-1.3 banner.

No FIXME/HACK indicating active corruption in live paths.

---

## 6. Security-Sensitive Code (LIVE paths)

Posture is good. Concrete verifications:

- **Secret storage**: API keys are persisted via Tauri IPC `secret_manager_set` /
  `save_api_key` (native secure store), NOT localStorage. See `stores/securityStore.ts:73-99`,
  `api/mcp.ts:629`, and onboarding `features/onboarding/OnboardingWizard.tsx:140-143`.
- **localStorage** is used only for non-secret prefs (theme, voice persona, recent searches,
  memory settings, operator notes, dismiss flags, subscription cache). Sweep of
  `localStorage.*(key|token|secret|password)` found no raw credentials persisted in plaintext.
- **Onboarding trust boundary** (`OnboardingWizard.tsx`): Cloud = external waitlist link only
  (`:124-126` → `agiworkforce.com/waitlist`); Local/BYOK saves key to secret_manager then sets
  mode `'local'`. Consistent with the v1 local-only + cloud-waitlist lock. No silent cloud routing.
- **Artifact HTML/SVG XSS**: `utils/security.ts` provides real DOMPurify-based sanitizers
  (`sanitizeSvg`, `sanitizeMarkdownHtml`, with `addHook` afterSanitizeAttributes). HTML artifacts
  render in an iframe with `sandbox="allow-scripts allow-modals"` (NO `allow-same-origin`) and a
  CSP with `connect-src 'none'` + `frame-src 'none'` + `object-src 'none'`
  (`features/chat/artifacts/HtmlArtifact.tsx:73,466`). **Caveat**: these audited copies are in the
  DEAD desktop artifact tree. The LIVE artifact renderer is the package's
  `packages/unified-chat/src/components/ArtifactPanel.tsx` — NOT audited in this slice. The
  package must be confirmed to carry equivalent sandboxing.
- **IPC**: all `invoke(...)` calls are gated by `isTauri`; the non-Tauri branch returns mock/empty
  data (`lib/tauri-mock.ts`, `web-mock` mode) — dev/browser only, not the shipped desktop runtime.
- `dangerouslySetInnerHTML` usages all pass through a `sanitize*` function (verified call sites in
  ArtifactRendererView, SvgArtifact, MermaidArtifact, ToolResultCard, ArtifactPreview, LivePreview,
  BrowserDebugTabs). No raw-HTML injection found.

No P0/P1 security holes found in the LIVE desktop frontend slice. (The biggest residual security
question — the package's live artifact renderer — is out of slice.)

---

## 7. AI-Slop / Duplication / Stubs

- **Massive duplication**: desktop carries full duplicate implementations of components the
  `@agiworkforce/unified-chat` package now owns — `ArtifactPanel`, `ArtifactRenderer`,
  `ReactPreview`, `ThinkingBlock`, `ToolCallCard`, `AgenticLoopStatusBar`, `TaskPhaseTimeline`,
  and the whole `AppLayout/ChatStream` chat container. These are dead but maintained-in-parallel.
- **v3 duplicates of chat primitives**: `features/v3/Composer.tsx`, `ModelPopover.tsx`, `PlusMenu.tsx`,
  `Pricing.tsx` duplicate `features/chat/*` and `features/pricing/*` equivalents, all dead.
- **Dead no-op buttons in the LIVE AccountMenu** (`features/v3/AccountMenu.tsx`): "Language"
  (`:56`), "Apps & Extensions" (`:85`), "Gift AGI" (`:86`) render with a chevron (`chev: true`)
  but have NO `action` handler → clicking does nothing. User-reachable.
- **Hardcoded model string** `Opus 4.7 · 1M · Max` at `features/v3/CodeModeHome.tsx:191` (violates
  the never-hardcode-model-IDs rule) — but the file is dead, so P3.
- **Dead store action**: `SearchModal.tsx:210` calls `openArtifactPanel()` (flips desktop
  `artifactStore.panelOpen`), but the only live reader of that flag is the dead
  `features/artifacts/ArtifactPanel.tsx` (`:477 if (!panelOpen) return null`) which is only mounted
  by the dead `AppLayout`. So selecting an artifact result in search opens nothing.
- Honest-empty stubs (GOOD, not slop): `analyticsQueries.ts` and `CodeModeHome.tsx` were converted
  from fabricated data to explicit empty/placeholder states — a deliberate de-slopping.
- Browser-mode fake returns: `api/orchestrator.ts:128,153` return `mock-agent-${random}` IDs, but
  only under `if (!isTauri)` (dev/browser). Acceptable dev fallback; the shipped Tauri path uses IPC.

---

## 8. Broken / Half-Built Features (with evidence)

1. **Live Sidebar nav buttons are dead (6 of 7).** `features/v3/Sidebar.tsx:151-166`
   `handleNavClick` maps nav ids to view strings: `projects`, `artifacts`, `cowork-scheduled`,
   `cowork-artifacts`, `cowork-dispatch`, `customize-home`, `voice-settings`. These flow
   Sidebar → `DesktopShellV3.handleNavigateView` (`DesktopShellV3.tsx:66-74`, untyped string
   passthrough) → App.tsx `onNavigateView` (`App.tsx:1372-1384`), which only handles
   `customize`, `connectors`, `skills`, `projects`, `pricing`, `billing`, `byok`.
   Result: only `projects` matches (opens Account settings). `artifacts`, `scheduled` →
   `cowork-scheduled`, `live-artifacts` → `cowork-artifacts`, `dispatch` → `cowork-dispatch`,
   `customize` → `customize-home`, and the collapsed-rail `settings` → `voice-settings` ALL
   fall through to no-ops. The `(view: string)` typing means the compiler never flags it.
2. **Cowork / Code / live-artifacts views do not exist in the shell.** The Sidebar advertises
   Projects, Artifacts, Scheduled, Live artifacts, Dispatch, Customize (`Sidebar.tsx:70-77`), but
   the shell renders only chat. The would-be destination components (`CoworkScheduled`,
   `CoworkArtifacts`, `CoworkDispatch`, `ArtifactWorkspace`, `CodeModeHome`) are orphaned (§2).
   This is the live state of SoT P0 #1 — not "placeholders," but "advertised then dead."
3. **Settings IA does not match locked SoT P0 #2.** Live nav (`SettingsPanel.tsx:79-111`):
   General, Account, Appearance, Privacy, Models & Keys, Agents, MCP & Skills, Apps & Integrations,
   Capabilities, Memory, Notifications, Voice. Locked IA requires: General, Account, Privacy,
   Billing, Usage, Capabilities, Connectors, AGI Code, AGI in Chrome, Extensions, Developer.
   Missing top-level: **Billing, Usage, AGI Code, AGI in Chrome, Extensions, Developer**.
   `LEGACY_TAB_MAP` (`stores/settings/dialog.ts:33-52`) collapses `billing→account`,
   `extensions→connectors`, `analytics→privacy`. So AccountMenu "View all plans"
   (`AccountMenu.tsx:71 openSettings('billing')`) and App.tsx `onBuyTopUp`
   (`App.tsx:1385 openSettings('billing')`) actually land on the Account tab. `usage`, `developer`,
   `agi-code`, `agi-in-chrome` are not even valid `SettingsTab` values.
4. **AccountMenu no-op buttons** (`AccountMenu.tsx:56,85,86`) — Language, Apps & Extensions, Gift
   AGI do nothing on click.
5. **PlansModal pricing is placeholder** pending Stripe (`PlansModal.tsx:136` TODO). PlansModal is
   live; verify it does not present fabricated prices as real before launch.

---

## 9. Severity-Ranked Issues

### P1
- **[P1] Live sidebar nav: 6 of 7 destinations are dead no-op clicks.**
  `features/v3/Sidebar.tsx:151-166` emits `artifacts`, `cowork-scheduled`, `cowork-artifacts`,
  `cowork-dispatch`, `customize-home`, `voice-settings`; `App.tsx:1372-1384` ignores all of them.
  Fix: align the view-string contract (type `onNavigateView` to a literal union; map every Sidebar
  id to a handled view) or hide unimplemented nav items.
- **[P1] Settings IA does not converge to the locked SoT P0 #2 sections.**
  `SettingsPanel.tsx:79-111` + `stores/settings/dialog.ts:33-52`. Missing top-level Billing, Usage,
  Developer, AGI Code, AGI in Chrome, Extensions; billing/extensions collapsed into Account/Connectors.
  Fix: introduce the locked tabs (components like `UsageDashboard.tsx`, `ExtensionsSettings.tsx`,
  `DotfileSettings.tsx` already exist and can be surfaced as top-level nav).
- **[P1] Cowork/Code/live-artifacts advertised in sidebar but unimplemented (SoT P0 #1, live form).**
  Sidebar promises views with no shell destination; the candidate components in `features/v3/` are
  orphaned. Fix: either wire the views or remove the nav entries to avoid dead-button UX.

### P2
- **[P2] AccountMenu dead buttons.** Language / Apps & Extensions / Gift AGI have no handler
  (`features/v3/AccountMenu.tsx:56,85,86`). Fix: wire or remove.
- **[P2] Dead `openArtifactPanel()` from SearchModal.** `SearchModal.tsx:210` opens a panel no
  live component renders (the consuming `features/artifacts/ArtifactPanel.tsx` is mounted only by
  the dead `AppLayout`). Selecting an artifact search result does nothing visible. Fix: route to the
  package's artifact panel store, or remove artifact results from search until wired.
- **[P2] Large dead-code islands risk security/behavior drift.** `features/chat/index.tsx →
  AppLayout → ChatStream → ArtifactPanel` and ~25 `features/v3/*` files are orphaned but still
  maintained (and still tested, inflating coverage signal). Hardening applied here never reaches
  users. Fix: delete or clearly quarantine; ensure the live package path carries equivalent
  sanitization/sandboxing.
- **[P2] PlansModal placeholder pricing.** `PlansModal.tsx:136` — confirm no fabricated prices
  shown as real before launch.

### P3
- **[P3] Hardcoded model string** `Opus 4.7 · 1M · Max` at `features/v3/CodeModeHome.tsx:191`
  (dead file). Violates never-hardcode-model-IDs; low impact while orphaned.
- **[P3] ~40 identical `task-1.3` store-migration TODO banners** across `stores/*.ts`. Tracking debt.
- **[P3] Stale anchor docs.** `reports/frontend-parity-r1/surfaces/desktop.md` describes a
  `UnifiedAgenticChat/` component dir that no longer exists; `docs/surfaces/desktop.md` claims the
  legacy chat folder is "removed and guarded" but it was relocated to `features/chat/` and is now
  dead-but-present. Update docs to reflect the package-owned live path.

---

## 10. Open Questions / Uncertainty

1. **Package live path not audited (biggest gap).** The live chat + artifact rendering is
   `@agiworkforce/unified-chat`. Whether the package's `ArtifactPanel`/`ReactPreview` carries the
   same DOMPurify + iframe-sandbox hardening as the dead desktop copies is UNVERIFIED here.
   Recommend a dedicated package audit.
2. **Bundle inclusion of orphans.** I established module-graph orphan status, not bundler output.
   Whether Vite tree-shakes the `features/v3/index.ts` / `features/chat/index.tsx` barrels is
   unconfirmed; user-unreachability holds regardless.
3. **Unresolved feature dirs.** ~80 feature dirs exist; I fully traced the high-value chains only.
   `features/canvas`, `features/editing`, `features/agi`, `features/teams`, `features/marketplace`,
   `features/database`, `features/document(s)`, `features/research`, etc. were not individually
   resolved alive/dead.
4. **Billing/Usage content under Account tab.** I confirmed `billing→account` mapping but did not
   verify the Account tab actually renders billing/usage UI vs. being empty for those entry points.
5. **`features/floating-chat` correctness.** Confirmed it is self-contained (own composer, own
   `useUnifiedChatStore`), not part of the dead `AppLayout` tree, but its send/stream behavior was
   not functionally audited.
