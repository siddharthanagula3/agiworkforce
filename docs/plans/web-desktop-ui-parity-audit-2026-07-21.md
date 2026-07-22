# Web ↔ Desktop UI Parity Audit

Status: Analysis (2026-07-21)
Method: 6-agent source audit (settings, chat, sidebar/theme, shared packages,
arch/framework, desktop internal debt) + Playwright web screenshots + desktop
Vite (web-mode) screenshot + first-hand verification of load-bearing claims.

---

## TL;DR — "Is the UI difference because of the tech stack?"

**No.** Both surfaces are **React 19 + Tailwind 4**. Next.js (web) vs Vite+Tauri
(desktop) is the _shell_, not the UI layer, and it forces **zero UI divergence**.

Proof (irrefutable, in-repo):

- The **same** `@agiworkforce/ui` `SettingsModal` component compiles and runs
  under **Next.js** (`WebSettingsModal`) **and** under **Vite/Tauri**
  (`DesktopCloudSettingsModal`). If the stack forced divergence it couldn't.
- The **same** `@agiworkforce/unified-chat` `ChatInterface` orchestrator is
  **desktop's live chat shell** (`DesktopShellV3` → `ChatInterface`).
- The `--chat-*` design tokens are one shared source (`@agiworkforce/design-tokens/chat.css`),
  imported identically by both apps.

What genuinely _cannot_ be shared is **plumbing, not UI**:

- Data transport: web = 152 Next `route.ts` + fetch/react-query; desktop = 656
  `invoke()` sites (123 files) → Rust commands.
- Routing/nav model: file-based app-router + URL vs state-driven single window + Tauri.
- Web-only marketing/SEO SSR pages; native OS surfaces (terminal, computer-use,
  screen-capture, overlay, filesystem).

Everything else that looks different is **organizational debt**.

---

## Why they look different: two half-finished migrations, mirror-imaged

There are two big "adopt the shared component" migrations in flight. Each one
**landed on one surface and stalled on the other**, and neither surface deleted
the code it replaced:

| Shared shell                                            | Web                                                                          | Desktop                                                    |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Settings** (`@agiworkforce/ui` `SettingsModal`)       | ✅ adopted (live settings)                                                   | ⚠️ Cloud only; **Local still bespoke** `SettingsPanel.tsx` |
| **Chat** (`@agiworkforce/unified-chat` `ChatInterface`) | ⚠️ **parked/unrouted** (`WebShellV3`); live `/chat` is bespoke `WebChatPage` | ✅ adopted (live `DesktopShellV3`)                         |

Net effect:

- **Web** = shared-shell **settings** + bespoke **chat** (6,858 LOC live fork).
- **Desktop** = bespoke **settings** (`SettingsPanel` + ~18 local sections) + shared-shell **chat**.

Same components exist in the tree on both sides — each surface simply adopted
the _opposite half_. That mirror image is the entire "why."

---

## Maturity — per area (not one verdict)

- **Chat UX**: **web is canonical + feature-heaviest** (WebChatPage 2,487 +
  MessageBubble 1,489 + ChatComposerNew 2,076 + artifacts/research panels) — but
  it is a **bespoke fork**. Desktop is **architecturally cleaner** (consumes the
  shared `ChatInterface` with ~275 LOC glue) but is **behind web's UX** — which
  is exactly why the shared shell exists yet web never cut over.
- **Settings**: **desktop-Local is deepest** (18 sections, ~10k LOC incl.
  genuinely local ComputerUse/Dotfiles/MasterPassword) but forked. Web = 13
  sections in the shared shell (per-section self-persist). Desktop-Cloud = 10.
- **Theming**: **desktop is more mature** (15 editor presets + custom-theme
  registry vs web's plain light/dark).
- **Sidebar**: **web is on the shared component** (`@agiworkforce/ui <Sidebar>`,
  1,262 LOC, full pin/star/archive/temporal/projects); **desktop forked** an
  824-LOC `features/v3/Sidebar.tsx` reusing only the logo.
- **Primitives**: shared and fine on both (desktop consumes via thin re-export shims).
- **Native integration**: desktop far ahead (656 invoke sites, 13 Tauri plugins).

---

## The plan — biggest-cut-first (ponytail)

### 1. DELETE — dead, importer-verified (the big, safe wins)

- **Desktop old pre-v3 chat shell** — `features/chat/{AppLayout,DynamicSidecar,ChatStream,ChatMessageList,MessageBubble/,InlineToolResults/,Widgets/,Cards/,InlinePanels/,Sidecar/,Visualizations/,Timeline/}` + ~150 orphaned leaves. **~38,262 LOC (92% of features/chat)**, 0 live importers after the v3 default-on cutover. Keep only live `CommandPalette` + `SearchModal`. **[L]**
- **Desktop web/shared-overlap orphaned dirs** — `mcp, marketplace, agi, agi-work, roi-dashboard, governance, analytics, teams, calendar, git, code, database, file-upload, research, experimental, workflows`. **~40k LOC**, 100% unreachable, re-implement surfaces web/shared already own. **[L]**
- **Desktop duplicate pairs (both dead)** — `canvas + dynamic-canvas`, `tool-calling + tools`, `editing + editor`, `document + documents`, `reminders + scheduler + schedules`, `memory-panel + orphaned memory`. **[M]**
- **Desktop small fully-orphaned dirs** — `layout, agent-collaboration, productivity, agent, messaging, notifications, planning, background-tasks, feedback, outcomes, custom-instructions, agent-status-monitor, subscription, simple-mode`. ~7k LOC. **[M]**
- **Desktop stranded components inside live dirs** — `settings/{ModelComparison,CostEstimator,MCPToolsSettings,UsageProgressBars,GeneralSettings,FontSelector}`, `artifacts/{ArtifactsGallery,ArtifactVersionHistory,ArtifactToolbar,ArtifactCategoryFilter}`, `voice/{VoiceMode,VoiceMicButton}`. ~3k LOC. **[S]**
- **Desktop 38 legacy primitive stubs** under `src/components/ui/` (Phase-5 reorg residue; redirect Toaster/Tooltip importers to `src/ui/*`). **[M]**
- **Dead shared-package exports** — `@agiworkforce/ui` shadcn families with 0 importers repo-wide (`Menubar, NavigationMenu, Carousel, InputOTP, Drawer, RadioGroup, AspectRatio`); `unified-chat` `SettingsShell, DEFAULT_SETTINGS_SECTIONS, VideoGenCard, components/SettingsModal.tsx` (superseded by `@agiworkforce/ui` SettingsModal). **[S]**
- **Dead sidebars** — `apps/web/features/chat/v3/{WebSidebar,WebShellV3}.tsx` + `UnifiedChatPage.tsx` (unrouted), `apps/web/shared/ui/sidebar.tsx` (0 importers), `apps/desktop/src/features/chat/Sidebar.tsx` (1,443). ~4,400 LOC. **[M]** _(couples to §4 web-chat decision)_

> Reachability is a **complete static graph**: desktop has a single entry
> (`index.html` → `main.tsx` → `App.tsx`, one Tauri "main" window), no
> variable/registry dynamic imports, no `@features` alias. "Unreachable" =
> "not in the shipped bundle." Still: do a per-dir confirm pass before each
> delete PR.

### 2. CONVERGE forks onto the shared shell

- **Desktop-Local settings → shared `SettingsModal`** (mirror `DesktopCloudSettingsModal`). All 18 local sections are already prop-taking `tabs/*` components and Cloud already reuses 5 of them through the shell. **[L]** — _blocked only by §3._
- **Desktop sidebar → shared `@agiworkforce/ui <Sidebar>`** (`mode='local'` + `footerSlot`/`navItems` already exist for the folder-picker + Local/Cloud toggle); delete the 824-LOC fork. **[L]**
- **Web main `/chat` model picker → shared `unified-chat` `ModelSelector`** (web already uses it on the projects page; kills web's two-picker split-brain). **[M]**
- **Desktop artifacts → package artifact-components** (`SpreadsheetArtifact/PresentationArtifact/EmailArtifact/GeneratedFileCard/parseTabular`) web already consumes. **[M]**
- **Desktop tool-call card → shared `unified-chat` `ToolCallCard`** (a 2nd impl runs in the timelines). **[S]**

### 3. ADD to shared — the ONE capability the shell is missing

- **`SettingsModal` deferred-save footer** — optional `footer` render-prop /
  `onSave`+`isDirty`+`onRequestClose` props. This is the _single_ reason
  desktop-Local can't move onto the shared shell today (Local is built around a
  disk/IPC snapshot-diff save; web/cloud self-persist per section). Ship this
  first, then §2's Local migration unblocks. **[S–M]**
- **Consolidate the settings nav** — one source in `settings-nav.ts` consumed by
  web + desktop-local + the shell's flat path (kills a 3rd hardcoded nav copy +
  icon drift). **[S]**
- **App-chrome color scale** (cream/charcoal/terra, duplicated verbatim in both
  `globals.css`) → into `@agiworkforce/design-tokens` next to `chat.css`. **[S]**

### 4. WIRE — decide the parked paths (don't leave them dangling)

- **Web chat**: the correct direction is **upgrade the package FROM web** (fold
  WebChatPage/ChatComposerNew/MessageBubble deltas into `unified-chat`), then
  route web onto `ChatInterface` and retire the parked `WebShellV3`. Web-live is
  the feature-heavier canonical fork (6,858 vs 2,650 shared) — do **not** replace
  it with today's thinner shared shell. **[L]** Until then, at minimum delete the
  unrouted `WebShellV3`/`UnifiedChatPage` so the fork is honest.
- **Desktop double artifact panel**: `ChatInterface`'s internal `ArtifactPanel`
  (ChatInterface.tsx:715) is not suppressed while `DesktopShellV3:267` mounts a
  local panel on a different store — add a hide/slot prop or unify onto one
  `artifactStore`. **[S]**

### 5. VERIFY (possible regression, not just debt)

- **Native feature panels orphaned by the v3 cutover** — `terminal, browser,
computer-use, screen-capture, filesystem, vision, automation, media/images,
mobile-companion, execution-sidecar`. Their **Rust backends are real and mature**
  (`src-tauri/src/automation/{computer_use,browser,screen,input,uia}`, pty,
  screenshot, fs) but their **React panels are unreachable from the live shell**.
  Before deleting, confirm whether these capabilities are still reachable in the
  shipped app (e.g. surfaced as agent tools inside `ChatInterface` rather than as
  panels). If a user-facing entry point was dropped in the cutover, that is a
  **feature regression to re-wire**, not dead code to delete. **[L]**

### Keep divergent (legitimate, document — do not share)

- Desktop OS-local settings: `Dotfile, MasterPassword, ComputerUse,
AllowedDirectories, MCPServer, LocalRuntime, Keybindings`, plus
  models-keys/voice/appearance/agents/agi-code/agi-in-chrome/extensions/developer
  (BYOK/Ollama/TTS/native-messaging/app-update — no cloud-web analogue).
- Plumbing: Tauri `invoke` vs Next API; single-window state routing vs app-router;
  marketing/SEO SSR pages.
- `error-handling` (ErrorBoundary) **and** `errors` (ErrorToast) — looks like a
  dup, both live + distinct (App.tsx:63, App.tsx:173). Keep both.
- Per-app `@theme` blocks + desktop `themes/` preset registry (drive
  marketing/app-chrome; `chat.css` stays the shared SSOT).

---

## Rough scale

Desktop `features/` = **147,663 non-test LOC / 76 dirs**; only **~26% (38,545)**
reachable from the production entry. **~109k LOC (74%) is orphaned**, dominated
by the old pre-v3 chat shell (§1) and web-overlap forks. This is the single
largest cut available anywhere in the repo — but it must be staged per-dir with
importer re-verification, and §5's native panels triaged (rewire vs delete)
before removal.
