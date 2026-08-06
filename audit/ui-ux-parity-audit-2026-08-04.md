<!-- Generated triage queue. Per CLAUDE.md this is NOT remediation on its own:
     open the cited source, confirm in implementation, patch, then record. -->

# Frontend UI/UX Parity Audit — ChatGPT/Claude comparison

Status: Partially remediated (see "Fixed in this pass" below)
Owner: Platform lead
Generated: 2026-08-04
Method: 9 parallel surface sweeps (vscode sidebar + settings, chrome side panel + options,
desktop electron shell, desktop tauri feature screens, mobile iOS, web chat/settings,
cross-surface consistency) calibrated against 375 reference screenshots from ChatGPT/Codex
(macOS, iOS, web, VS Code ext) and Claude (iOS, web, desktop). 96 candidates -> per-finding
adversarial verification -> 79 confirmed after dedupe.

## Fixed (2026-08-04 / 08-05, two passes)

PASS 1 — ship blockers. VSC-2, VSC-4, VSC-5, CHR-1, CHR-13, DEL-2, DTA-2, DTA-5,
MOB-1, MOB-2, MOB-3, MOB-4, WEB-2, SHR-1. Plus: VSC tool-call label overflow, CHR
model-badge truncation, CHR computer-use result/error expansion, CHR handoff-banner
and approval-desc overflow, DTA-6 file-tree indent cap, DEL white-flash on launch.

PASS 2 — the medium/low tail:
chrome-ext closed drawer is now `inert` (~30 off-screen controls left the tab order);
drawer history rows and the header quota badge are real <button>s with
focus rings; the quota badge routes through openDrawer instead of
hand-toggling classes (it was skipping refresh AND inert handling);
the ask-before-acting consent card describes actions in plain language
instead of rendering `click(selector="#submit-order")`; light-mode toggle
knobs got a definition ring; prefers-reduced-motion honoured; options page
responsive below 520px, dead "Add" button fixed, sign-in no longer dead-ends.
vscode-ext code blocks use the panel palette (theme-derived colours were being
composited onto the fixed-dark panel); composer chips truncate instead of
clipping; model popover bounded by the viewport; composer font follows
--vscode-font-size; provider badge yields to the header buttons; collapse
targets at 24px; duplicated section headings removed; Usage & billing leads
with the plan instead of a debug dropdown.
desktop schedule editor closes on Escape and has a close button (Cancel was below
the fold); schedule card error text wraps and clamps; description clamped to
match the prompt; conversation menu clamped to the viewport on both axes;
sidebar shows the active section and has aria-current; a BASE focus ring was
added to globals.css — the app previously had none outside prefers-contrast
and forced-colors; macOS traffic-light collision removed from the bundled
renderer; hardcoded palettes mapped to semantic tokens.
mobile markdown tables scroll horizontally with readable cell widths (cells were
flex:1 inside overflow:hidden); Dynamic Type no longer clips the settings,
chats and connector headers; email row uses available width; filter chips
and the send-destination disclosure meet tap-target minimums; style sheet
reads the real safe area.
web/shared the three right-hand panels shrink to a floor so the conversation column
can never reach zero; shared Menu is portalled to document.body (a
transformed ancestor was re-anchoring position:fixed); conversation actions
are reachable on touch; conversation title reserves absolute space for the
flanking controls; Team member name/email truncate properly (textOverflow
without nowrap never applied); usage bar follows the shared severity ladder;
keyboard hints are platform-correct via a new shared shortcutLabel helper.

Systemic patterns closed: P1 (missing min-width:0 / wrong flex-shrink) at ~15 sites,
P2 (mobile keyboard avoidance) fully, P3 (theme-derived colour on a fixed palette) at
4 sites, P4 (fixed heights around Dynamic Type) at 5 sites.

Verified after: web 5835, mobile 2633, desktop 2398, chrome 1431, vscode 843,
types 421, api-gateway 270, ui 75 — all passing; 0 type errors in every package.

STILL OPEN. The VS Code sidebar's fixed-dark palette is a documented founder decision
(design-tokens index.ts:401-408) and needs sign-off before it is made theme-derived —
note the settings webview in the SAME extension already adapts, so the two disagree.
Also open: vscode settings layout polish (nav scroller, control right-edges, model
preference width, "Open raw settings" hidden below 760px, account identity), Chrome's
raw IPC failure string, Electron quick-ask window chrome and tray hotkey editing,
SelectedContextReview's aria-modal scope, four primary-action colours across web,
the forked web/desktop model pickers, the three unrelated empty-chat concepts, and
i18n: 38 desktop sidebar strings plus the entire Settings surface are English-only
across all 11 non-English locales.

**Date:** 2026-08-04 · **Branch:** `fix/audit-remediation-2026-07-25`

**79 confirmed defects**, each independently verified by an adversarial pass against the source. Severity after verifier adjustment: **19 high · 44 medium · 16 low**.

Surfaces covered: `apps/extension-vscode` (sidebar webview + settings webview), `apps/extension` (Chrome side panel + options page + computer-use panel), `apps/desktop` (Electron cloud shell + Tauri feature screens), `apps/mobile` (Expo iOS), `apps/web` (Next.js chat + settings + connectors), and the shared `packages/ui` + `packages/ui/i18n` layer. `apps/cli` (Ratatui TUI) was excluded per brief.

Calibrated against 26 reference screenshots sampled from ChatGPT/Codex (macOS, iOS, web, VS Code extension) and Claude (iOS, web, desktop).

---

## 1. SHIP BLOCKERS

19 high-severity defects. Every one of these makes content unreadable, unreachable, or a control unusable.

| ID         | Surface          | Defect                                                                                                                      | When the user hits it                                                                                                                     |
| ---------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **VSC-2**  | vscode-ext       | Usage-meter banner children are all `nowrap` + `flex-shrink:0`; Upgrade CTA and collapse × are clipped outside the panel    | Any sidebar narrower than ~405px — i.e. the 300px default. Worst in the low-quota `.warn` state, the exact moment the upgrade CTA matters |
| **VSC-4**  | vscode-ext       | "Local runtime needs setup" banner: `#ececec` text on VS Code's pale-yellow warning background (~1.10:1)                    | Light+/Quiet Light theme, first-run when the AGI CLI is missing. User sees an empty yellow strip with a blue button                       |
| **VSC-5**  | vscode-ext       | Chat textarea is stuck at its ~150px intrinsic width — `flex:1` is inert because `.input-wrapper` is a block                | Always, every width, every theme. ~85% of the composer card is dead space in the editor panel                                             |
| **VSC-11** | vscode-ext       | Settings → "Usage & billing" has no plan, credits, meter or reset date — only a debug tier-override dropdown                | Any user who clicks Usage & billing                                                                                                       |
| **CHR-1**  | chrome-ext       | Computer Use / Workflows panels are a dead end: composer hidden, no control returns to chat                                 | ⋮ menu → Computer Use, or any browser-automation run. Only recovery is closing and reopening the side panel                               |
| **CHR-13** | chrome-ext       | Approval card never expires; after the 30s fail-closed deny its Allow/Skip buttons are dead and cards stack                 | Step away 30s during a Computer Use run with ask-before-acting (the default)                                                              |
| **DEL-2**  | desktop-electron | Launching with no network shows Chromium's raw "site can't be reached" page as the whole app                                | Offline, captive-portal wifi, or an agiworkforce.com outage, in the default remote renderer                                               |
| **DTA-2**  | desktop-tauri    | Code workspace header: long open-file name pushes Open Folder / Save All / Compare outside the clipped panel                | Unconditional at the app's own 1000px minimum window; hit at 1240–1400px with ordinary nested paths                                       |
| **DTA-5**  | desktop-tauri    | Unsaved-changes dialog: unbreakable absolute path widens the grid column, pushing "Save & Close" 170px outside the clip box | Code panel → edit a file → close its tab, with any path over ~68 chars                                                                    |
| **MOB-1**  | mobile           | Bottom search bar sits underneath the iOS keyboard on Chats, Library, Projects and Connectors                               | Drawer → Search glyph (auto-focus), or any tap-to-focus. User types blind                                                                 |
| **MOB-2**  | mobile           | Edit-message dialog's Cancel/Send row is behind the auto-raised keyboard, with no way to dismiss the keyboard               | Long-press your own message → Edit, on any message long enough to grow the input                                                          |
| **MOB-3**  | mobile           | Add-custom-connector sheet: keyboard covers all three fields and the Add button; no tap-outside dismiss                     | Settings → Connectors → Add custom connector → tap any field                                                                              |
| **MOB-4**  | mobile           | In-conversation header: the fixed 172px Local/Cloud toggle overlaps the project chip and steals taps from "New chat"        | Local Mode with an active project, on any iPhone under ~430pt (i.e. most of them)                                                         |
| **WEB-2**  | web              | Opening two right-hand chat panels collapses the conversation column to zero width                                          | Sources + Artifacts on a 1024px laptop; add Work-session on 1280px. Transcript and composer vanish                                        |
| **SHR-1**  | shared-ui        | Settings → Connectors "Add ▾" menu renders ~530px from its button, and vanishes entirely on ≥2532px displays                | Every desktop Settings → Connectors visit. On a 2560px monitor the only route to "Add custom connector" silently does nothing             |
| **SHR-2**  | shared-ui        | Conversation rename/pin/archive/delete are hover-only, and the invisible strip still steals taps                            | Mobile web sidebar drawer: tapping a row's right edge opens an unexplained menu instead of the chat                                       |
| **CRS-3**  | cross-surface    | Web and desktop ship two forked model pickers driven by the same store — visible stacked on one screen                      | `/chat/projects/<id>`: 320px "Model" picker in the header, 288px "Models" picker in the composer below it                                 |

Two further high-severity items are **conditional on a documented escape hatch** and listed here for completeness:

| ID        | Surface          | Defect                                                                                                                                  | When the user hits it                                                               |
| --------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **DEL-1** | desktop-electron | macOS traffic lights land on the sidebar brand mark; collapsed, the expand toggle is unclickable and the state persists across restarts | Only when launched with `AGI_CLOUD_RENDERER=bundled` (not the shipped default)      |
| **DEL-3** | desktop-electron | Quick Ask panel pins a stale `/login` page for the entire session, with no Escape and no close button                                   | First launch while signed out; the panel is created once at T+5s and never reloaded |

---

## 2. SYSTEMIC PATTERNS

Six root causes account for 47 of the 79 findings. Fixing the pattern is cheaper than fixing the instances.

### P1 · Missing `min-width:0` / `flex-shrink` on flex children holding variable-length text — 16 findings

The single most common defect in the codebase. A flex item defaults to `min-width:auto`, which resolves to its **min-content** width. With `white-space:nowrap` (or an unbreakable token like a file path, URL, model id or tool name) that item refuses to shrink, so it overflows its parent, pushes siblings out of the container, or forces a horizontal scrollbar.

**Closes:** VSC-2, VSC-3, VSC-6, VSC-8, VSC-16, CHR-2, CHR-3, CHR-8, CHR-16, DTA-1, DTA-2, DTA-5, DTA-6, WEB-4, WEB-6, SHR-4, CRS-6.

**One-line fix pattern:** on the text-bearing child add `min-width: 0; overflow: hidden; text-overflow: ellipsis;` and drop `flex-shrink: 0`; keep `flex-shrink: 0` **only** on icons, status dots and action buttons. Every one of these files already implements the correct pattern within a few lines of the broken one (`.progress-event .tool-call__label` in VSC-6, `.control-stack{min-width:0}` in VSC-8, the cloud Sources row in DTA-1, `.sp-cu-step-body` in CHR-16) — this is drift, not ignorance.

### P2 · No keyboard avoidance on bottom-anchored mobile surfaces — 3 findings, all high

React Native does not resize the root window for the iOS keyboard, and `Modal` renders in a separate native window so an ancestor `KeyboardAvoidingView` is inert. Four screens plus two modals put their primary control at the bottom with no handling.

**Closes:** MOB-1, MOB-2, MOB-3.

**Fix:** put the keyboard handling where it belongs, gated on iOS (Android's `adjustResize` already works and would double-handle). For `BottomSearchBar` change line 77 to derive `marginBottom` from a `Keyboard` listener's `endCoordinates.height`, fixing all four hosts at once. For the two modals, place `<KeyboardAvoidingView behavior="padding">` **inside** `<Modal>`, copying `InviteCodeModal.tsx:477,486` which already does this correctly.

### P3 · Hardcoded palette literals instead of theme tokens — 7 findings

Literal hex/`white`/`bg-blue-600`/`border-white/[0.06]` values that resolve identically in both grounds, or theme-derived values composited onto a fixed-palette surface. The mixed cases are the dangerous ones: a `--vscode-*` background under a hardcoded foreground yields 1.1:1 contrast.

**Closes:** VSC-1, VSC-4, VSC-7, VSC-15, CHR-6, CHR-14, DTA-3, WEB-3, WEB-8.

**Fix:** never pair a theme-derived background with a hardcoded foreground, or vice versa. In the VS Code sidebar (a deliberate fixed-dark panel per the 2026-07-27 founder decision) pin _both_ sides to `--agi-vscode-*`. Everywhere else swap literals for `var(--chat-*)` / semantic Tailwind tokens. Note the two toggle-knob findings (CHR-6, CHR-14) share a root cause: `background: white` on a `--agi-ext-hover` (`#f0f0f0`) track over a `#ffffff` card — 1.14:1 twice over.

### P4 · Fixed heights around text that scales with Dynamic Type — 4 findings

`height: 50` / `height: 52` / `height: 30` around labels with no `maxFontSizeMultiplier`. There is no `allowFontScaling` or `Text.defaultProps` override anywhere in `apps/mobile`, so every label scales unclamped while its box does not. RN Views default to `overflow: visible`, so the result is overlap with the next opaque element, not a clean crop.

**Closes:** MOB-7, MOB-8, MOB-10, and contributes to MOB-4.

**Fix:** `height: N` → `minHeight: N, paddingVertical: X`, plus `maxFontSizeMultiplier={1.3}` on the label — matching `ModeToggle.tsx:104,141`, the only two places in the app that already clamp.

### P5 · Every surface invents its own vocabulary, palette and component for the same concept — 12 findings

Four vocabularies for the same four quota buckets; five colour ladders (three different threshold sets plus two constants) for the same usage bar; two forked model pickers driven by one store; three unrelated empty-chat concepts; two paywall cards whose secondary buttons do opposite things; two "New chat" treatments; hardcoded `Ctrl+K` vs `⌘K` on platform-agnostic handlers.

**Closes:** CRS-1, CRS-2, CRS-3, CRS-4, CRS-5, CRS-6, CRS-9, CRS-10, WEB-7, DTA-3, VSC-12.

**Fix:** for each concept, promote one implementation into `packages/ui` (or a platform-neutral strings/formatters module for RN compatibility) and delete the forks. Highest leverage first: usage vocabulary + reset formatters (CRS-1, CRS-2 — four surfaces, pure strings), then the model picker (CRS-3 — two pickers visible on one screen today).

### P6 · Two i18n systems shipped and never connected — 2 findings, but they gate the 12-language promise

The language picker works. The corpus exists. Almost nothing consumes it. `de/v3.json` is 256/305 keys byte-identical to English; only `library`→"Bibliothek" and `tasks`→"Aufgaben" are actually German. Zero of 48 desktop settings components import `useTranslation`; 1 of 50 on web. Selecting Arabic mirrors the entire settings layout to RTL while 100% of its text stays English.

**Closes:** CRS-7, CRS-8, VSC-12 (adjacent).

**Fix:** (a) change `SettingsNavEntry.label` to `labelKey` resolved with `t()` in `NavButton`; (b) wire `useTranslation('settings')` through the section components; (c) author the ~16 missing nav keys × 12 locales; (d) add a CI check diffing flattened key sets against `en`. Note only `es` is a genuine translation today — adding 38 keys to `de`/`ja`/`zh` takes them from 96% English to 100% English.

---

## 3. FINDINGS BY SURFACE

### VS Code extension

**VSC-1 · MEDIUM · Whole sidebar is a hardcoded dark panel — it never adapts to a Light or High Contrast VS Code theme**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:110`

```css
:root {
  /* VS Code theme variables with AGI dark-mode fallbacks */
  ${cssVarsToString(agiVsCodeCssVars)}
  --bg-base: var(--agi-vscode-bg);
  --bg-elevated: var(--agi-vscode-surface);
  --bg-overlay: var(--agi-vscode-overlay);
  --text-primary: var(--agi-vscode-text);
  --text-secondary: var(--agi-vscode-text-muted);
  --border: var(--agi-vscode-border);
}
```

```ts
// packages/ui/design-tokens/src/index.ts:409
  '--agi-vscode-bg': agiCoolPalette.dark.surface.base,        // '#212121'
  '--agi-vscode-surface': agiCoolPalette.dark.surface.sidebar, // '#171717'
  '--agi-vscode-overlay': agiCoolPalette.dark.surface.overlay, // '#2a2a2d'
  '--agi-vscode-text': agiCoolPalette.dark.text.primary,       // '#ececec'
  '--agi-vscode-text-muted': agiCoolPalette.dark.text.secondary, // '#b4b4b4'
  '--agi-vscode-border': agiCoolPalette.dark.border.strong,    // 'rgba(255,255,255,0.16)'
```

**Symptom** — In Light+, Quiet Light, Solarized Light or either High Contrast theme the panel renders as a near-black `#212121` rectangle with `#ececec` text glued to a white editor. Grepping all 3,750 lines for `vscode-light` / `vscode-dark` / `vscode-high-contrast` / `prefers-color-scheme` returns **zero** hits, so no rule rescues it.

Two things make this reportable rather than a pure product decision. First, the file's own doc comment at lines 38-39 asserts the opposite of what the tokens do: _"Colors adapt to the active VS Code theme via `--vscode-_`variables with AGI palette fallbacks (dark defaults). Light/HC themes work automatically."* That is false. Second, the sibling webview in the same extension **does** adapt —`settingsWebviewContent.ts:70-76`sets`color-scheme: light dark; color: var(--vscode-foreground); background: var(--vscode-editor-background);`with 85`--vscode-\*` references. So in Light+ the AGI settings webview is white and the AGI sidebar is near-black: one extension, two theme policies.

**Context** — This is a **recorded founder decision**, not an oversight. `packages/ui/design-tokens/src/index.ts:401-408`: _"Panel palette. Fixed (not theme-derived) so the panel looks the same across VS Code + Cursor + Windsurf + Antigravity. Founder decision 2026-07-27…"_. Reversing it needs sign-off. Note the token set is not wholly fixed — `--agi-vscode-danger` (index.ts:424) and the four diff tokens (427-434) are already theme-derived chains.

**Reference** — `004-codex-vscode-ext-onboarding-intro-ask-codex-anything-step1.png`, `013-codex-vscode-ext-account-menu-profile-dropdown-settings-logout.png`: the Codex panel background is indistinguishable from the editor background — a continuation of the host chrome, not a foreign card.

**Fix** — Two options. (a) Keep the fixed palette and **delete the false claim at webviewContent.ts:38-39**, then fix the mixing bugs (VSC-4, VSC-7) that are the actual readability failures. (b) If the cross-editor rationale is dropped, theme-derive the base six tokens — but note a partial conversion is worse than either extreme: `--agi-vscode-hover` and `--agi-vscode-button-text` (`'#ffffff'`, index.ts:416) and every `.icon-btn:hover` / `.runtime-pill` rule assume a dark ground. Blast radius is contained: `agiVsCodeCssVars` has exactly one consumer (webviewContent.ts:11). Do **not** map `--agi-vscode-overlay` to `--vscode-toolbar-hoverBackground` — that borrows a hover-state token for a resting surface; use `--vscode-editorWidget-background`.

---

**VSC-2 · HIGH · Usage-meter banner: every child is `nowrap` + `flex-shrink:0`, so Upgrade and the collapse × are clipped off the right edge**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1054`

```css
.usage-text {
  white-space: nowrap;
  flex-shrink: 0;
}

.usage-reset {
  white-space: nowrap;
  color: var(--text-secondary);
  opacity: 0.7;
  flex-shrink: 0;
}

.upgrade-btn { … flex-shrink: 0; … }
.meter-dismiss-btn, .meter-restore-btn { … flex-shrink: 0; }
```

**Symptom** — `.usage-meter-banner` (line 1003) is `display:flex` with no wrap, no overflow and no max-width. Only `.usage-meter-bar-wrap` (1032) can shrink (`flex:1; min-width:0`) and it collapses to zero — the progress bar silently vanishes _before_ any text yields. The banner is a direct child of `<body>` (markup at 1670), which is `display:flex; flex-direction:column; height:100vh; overflow:hidden` (126-139), so overflowing children are **clipped, not scrollable**.

Real rendered strings (corrected — `buildManagedMeter` at `src/data/usageMeter.ts:50-70` never populates `usedTokens`/`limitTokens`, so the token-count branch is dead here and execution falls to `ChatStateManager.ts:353`):

- managed, quota known: `Usage: 12% of plan usage remaining` (34 chars)
- managed, quota unknown: `Usage: Managed usage unavailable` (32 chars)
- BYOK: `BYOK mode - no AGI-managed quota is active` (41 chars, asserted in `src/__tests__/usageMeter.test.ts:113-115`)
- local: `Local model - no quota tracking` (31 chars)

Non-shrinkable minimum at the banner's explicit 11px font: managed + Upgrade (the `.warn` state) ≈ **405px**; managed without Upgrade ≈ 345px; BYOK ≈ 315px. Against a 300px default sidebar, the collapse × — the _only_ control that dismisses the banner — and the Upgrade CTA sit outside the clipped panel. The `.warn` state is precisely when the user is being asked to upgrade.

No media query rescues it: the only breakpoints (1415, 1424) touch `.mode-chip`/`.effort-chip`/`.model-pill`/`.header-*`/`.composer-hint`/`.empty-state-copy`.

**Reference** — `010-codex-vscode-ext-plugins-menu-add-files-goal-plan-mode-plugins-list.png`: Codex's composer status row carries only short atoms ("Full access", "5.6 Sol") and never packs a sentence plus a timestamp plus a CTA into one non-shrinking row.

**Fix** —

```css
.usage-text {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.usage-reset {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}
.usage-meter-bar-wrap {
  flex: 0 1 60px;
  min-width: 40px;
} /* floor the bar so it doesn't vanish first */
.usage-meter-banner {
  overflow: hidden;
} /* backstop */
@media (max-width: 380px) {
  .usage-reset {
    display: none;
  }
}
```

Keep `flex-shrink: 0` only on `.upgrade-btn` and `.meter-dismiss-btn`.

---

**VSC-3 · MEDIUM · Streaming composer: the Queue/Steer send button is clipped outside the composer card at narrow sidebar widths**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:697`

```css
.composer-bottom {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 5px 7px 7px;
}
…
#sendBtn.follow-up { width: auto; min-width: 58px; padding: 0 9px; }
…
#stopBtn { display: none; width: 26px; height: 26px; flex-shrink: 0; … }
#stopBtn.visible { display: inline-flex; }
…
@media (max-width: 480px) {
  .mode-chip, .effort-chip { display: none !important; }
  .model-pill { min-width: 72px; max-width: min(150px, calc(100vw - 112px)); }
}
```

**Symptom** — The 480px media query (with its explanatory comment at 1409-1414) was written for this row but only accounts for the **idle** state. Measured by rendering the shipped stylesheet in an iframe at widths 400→170:

- **Idle:** fits cleanly at every width down to 170px. The media query genuinely works.
- **Streaming** (`setStreaming(true)` at 2196/2206 reveals `#stopBtn` and swaps `#sendBtn` to `.follow-up`): the row's right edge pins at 214px and refuses to shrink further. It crosses `.composer-card`'s border at ~222px and is clipped by `body{overflow:hidden}` below 214px. `documentElement.scrollWidth` stays 213 while `innerWidth` is 170 — **no horizontal-scroll escape**.
- At 200px: 47 of 61px of Send visible, drawn outside the card's rounded border. At 170px (VS Code's sidebar minimum): 17px visible, label cut mid-word — renders literally as `+  Model · Auto  ▪  + Qu|`.

Stop is **never** pushed out (measured at left 123 / right 149 at every width) — only `#sendBtn.follow-up`. The two dominant non-shrinkable terms are `.model-pill{min-width:72px}` (from the 480px query) and the send button's 58px floor, which renders 61px because the `+` pseudo-element plus the "Queue" label exceeds it.

**Reference** — `011-codex-vscode-ext-reasoning-effort-menu-light-medium-high-ultra-options.png`: Codex's send affordance stays a fixed circular icon regardless of state; the model/mode labels shrink around it. The primary action never leaves the card.

**Fix** — `flex-wrap: wrap; row-gap: 6px;` on `.composer-bottom` alone fixes it at all widths (`.composer-card` is `flex-direction: column` so it grows vertically). Optionally add `@media (max-width: 300px) { .model-pill { min-width: 0; max-width: 100%; } #sendBtn.follow-up { min-width: 26px; width: 26px; padding: 0; } #sendBtn.follow-up .send-action-label { display: none; } }`.

---

**VSC-4 · HIGH · "Local runtime needs setup" banner is invisible in every light theme**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:292`

```css
.runtime-status {
  margin: 8px 10px 0;
  padding: 10px;
  border: 1px solid var(--vscode-editorWarning-foreground, #cca700);
  border-radius: var(--radius-md);
  background: var(--vscode-inputValidation-warningBackground);
  color: var(--text-primary);
  display: none;
  …
}
```

**Symptom** — `background` is theme-derived (and has **no fallback**, so a theme omitting the token renders the bar transparent) while `color` resolves through `--text-primary` → `--agi-vscode-text` → the literal `#ececec`. In Light+/Quiet Light, `--vscode-inputValidation-warningBackground` is `#F6F5D2`, giving **~1.10:1**. The heading `<strong>Local runtime needs setup</strong>` (markup at 1663-1667) and the message set at line 3145 are unreadable — the user sees a gold-bordered pale-yellow strip that appears empty except for a blue "Open setup" button. The button stays legible because `.runtime-status button` (310-318) sets its own theme-derived fg/bg pair.

Triggered by `ChatStateManager.ts:1404-1411` posting `status: 'unavailable'` from the `catch` around `listLocalModels()` — i.e. any missing or misconfigured AGI CLI, the first-run failure path.

`.usage-meter-banner.warn` (1017-1020) has the identical bug, overriding only `background` and `border-bottom-color` while inheriting `color: var(--text-secondary)` → `#b4b4b4` on `#F6F5D2` ≈ **1.86:1**.

**Not taste** — the sibling webview does it correctly: `settingsWebviewContent.ts:274-276` pairs `--vscode-inputValidation-warningForeground` **with** `--vscode-inputValidation-warningBackground` (and again at 293-296 for the info variant). The sidebar is the lone outlier.

**Reference** — `009-codex-vscode-ext-permission-confirm-modal-turn-on-full-access-warning.png`: Codex's warning surface pairs its own background and foreground together.

**Fix** — Do **not** chain to `--vscode-inputValidation-warningForeground`; it is undefined in Dark+/Light+ and would fall through to `#cca700` gold on `#F6F5D2` (~2:1, still failing). Instead use the fixed warm tokens that already ship for exactly this banner and are currently unused: `background: var(--agi-vscode-warning-bg)` (`rgba(239,140,87,0.12)`, index.ts:422) and `border: 1px solid var(--agi-vscode-warning-border)` (index.ts:423). This keeps `#ececec` readable over the fixed `#212121` base and honours the cross-editor decision. Apply the same substitution to `.usage-meter-banner.warn` at 1017-1020. Update `src/__tests__/__snapshots__/webviewContent.snapshot.test.ts.snap` (three places).

---

**VSC-5 · HIGH · Chat textarea never fills the composer — `flex: 1` is inert because its parent is not a flex container**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:680`

```css
#userInput {
  flex: 1;
  background: transparent;
  border: 0;
  outline: 0;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  min-height: 46px;
  max-height: 140px;
  padding: 0;
  resize: none;
}
… .input-wrapper {
  position: relative;
  flex: 1;
} /* line 1100 */
```

**Symptom** — The DOM is `.input-row(flex) > .input-wrapper(block) > textarea#userInput` (1775-1787). `.input-wrapper`'s own `flex:1` **works** (`.input-row` is flex, so the wrapper is full width), but it declares no `display`, so it is a block box — the textarea's `flex:1` has no flex container to act on and is inert. No `width` is ever set: `#userInput` appears in CSS only at 680 and 694 (`::placeholder`), there is no `textarea` element selector anywhere (grep confirms), no `cols` attribute, and no JS assigns `style.width` (`autoResize()` at 2231-2232 sets height only). A `<textarea>` with no width falls back to its intrinsic ~20-column box (~150px at 13px).

The visual tell is unmistakable: `.composer-hint` (line 1101, `text-align: right`) is a block inside the same wrapper, so "Enter to send · Shift+Enter for newline" renders flush to the card's right edge while the caret is pinned to a ~150px strip on the left. Clicks in the dead area hit `.input-wrapper`, which has no focus handler (the only listeners on the card, 2896-2915, are dragover/dragleave/drop).

At VS Code's default 300px sidebar the card is ~254px wide with a ~150px input. There is no `max-width` on `.input-area` or `.composer-card` anywhere in the file, so in `ChatEditorPanel` (a full editor tab) the card exceeds 1000px with the same ~150px typing column — **~85% dead space**.

Shipped from both `features/sidebar-webview/sidebarProvider.ts:82` and `providers/chatEditorPanel.ts:106`.

**Reference** — `004-codex-vscode-ext-onboarding-intro-ask-codex-anything-step1.png`: the "Ask Codex to do anything" input spans the full width of its rounded card with the + and send buttons on the row below; the entire card body is a click target.

**Fix** — Line 124 already declares `* { box-sizing: border-box }`, so this is safe:

```css
#userInput {
  display: block;
  width: 100%;
  /* drop flex: 1 */
```

---

**VSC-6 · MEDIUM · Long tool names blow out the tool-call row and force a horizontal scrollbar on the chat log**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:1196`

```css
.tool-call__label {
  font-weight: 400;
  color: var(--text-secondary);
  flex-shrink: 0;
}
… .progress-event .tool-call__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

**Symptom** — `flex-shrink:0` with `flex-basis:auto` sizes the span to max-content, so it cannot wrap or shrink. `getToolLabel` (3529) title-cases the raw tool id; `ChatStateManager.ts:2142` forwards `event.name` unmodified, and MCP tools arrive as `mcp__<server>__<tool>` (documented at `tool-metadata.ts:281`, emitted at `apps/web/.../tool-loop.ts:1791`), so `mcp__filesystem__read_text_file` → "Mcp Filesystem Read Text File". Developer-session MCP is configured via the AGI CLI (`package.json:822`), so this is reachable.

Geometry: `.tool-call-stack` (1146) costs 21px (border-left 1 + margin-left 8 + padding-left 12), so the bar's content box is `sidebarWidth − 53`. Overflow begins once the label exceeds `sidebarWidth − 103` — about **24 characters at 250px, 32 at the 300px default**.

Three consequences, in order: `.tool-call__summary` (1198, `overflow:hidden`, default shrink) collapses to zero and the summary text silently disappears; the disclosure chevron is pushed off-screen; and because `#messages` (546) declares `overflow-y:auto` with overflow-x left visible (which computes to `auto`), the **entire chat transcript gains a horizontal scrollbar**.

The correct treatment already exists three rules later at line 1258 for progress events — this is an inconsistency inside one file. The disclosure still works (the whole `.tool-call__bar` is the button), so nothing is unusable.

**Reference** — `018-codex-vscode-ext-settings-mcp-servers-server-toggle-list.png`: Codex ellipsizes long row titles in its own narrow sidebar rather than overflowing.

**Fix** — Match the progress-label rule; keep `white-space: nowrap` (dropping `flex-shrink:0` without it would make the label wrap and clip against the bar's fixed `height:32px`):

```css
.tool-call__label {
  font-weight: 400;
  color: var(--text-secondary);
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tool-call__bar {
  overflow: hidden;
}
```

---

**VSC-7 · MEDIUM · Code blocks pull host theme colours onto our fixed dark panel**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:943`

```css
pre {
  background: var(--vscode-textCodeBlock-background, var(--bg-overlay));
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 12px;
}
pre code {
  color: var(--vscode-editor-foreground, var(--text-primary));
}
:not(pre) > code {
  background: var(--vscode-textCodeBlock-background, var(--bg-overlay));
  padding: 2px 5px;
  border-radius: 3px;
  color: var(--vscode-textPreformat-foreground, var(--text-primary));
}
```

**Symptom** — Two different failures depending on which light theme is active. `.message.assistant` is `background: transparent` (~596) so `pre` composites straight onto the fixed `#212121`, and these are the only pre/code colour rules in the file (line 956 sets margin/padding only; there is no syntax highlighter — `src/webview/render.ts:40` emits plain `<pre><code>`).

- **Light Modern** (the default light theme since VS Code 1.85) sets `textCodeBlock.background` to an **opaque `#F8F8F8`**. Result: a near-white rectangle glaring out of an otherwise `#212121` panel. Legible (~11:1), but a glaring design break.
- **Light+ / Light (Visual Studio)** leave it at the registry default `#dcdcdc66` (40% alpha). Composited over `#212121` → ≈`#6c6c6c`. Block code (`--vscode-editor-foreground` `#000000`) lands at **~4.0:1** — under AA for 12px. Inline code is worse: `--vscode-textPreformat-foreground` defaults to `#A31515` (dark red, _not_ `#0451a5`), giving **~1.5:1** — effectively camouflaged. This panel emits backticked file paths, symbols and commands constantly.

Dark themes are unaffected (`#0a0a0a66` over `#212121` → `#181818`).

**Reference** — `015-codex-vscode-ext-settings-configuration-config-toml-reasoning-efforts.png`: Codex renders code with the editor's own token colours on the editor's own background — one consistent ground.

**Fix** — Stop mixing; pin to our own surface so it composites predictably against the intentionally fixed dark panel:

```css
pre {
  background: var(--bg-overlay);
}
pre code {
  color: var(--text-primary);
}
:not(pre) > code {
  background: var(--bg-overlay);
  color: var(--text-primary);
}
```

---

**VSC-8 · LOW · Provider badge paints over the header icon buttons in a narrow width band**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:218` (root cause) and `:225`

```css
.header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }   /* :218 — no overflow */
.provider-badge { display: inline-flex; … white-space: nowrap; flex-shrink: 0; }  /* :225 */
.header-actions { display: flex; gap: 2px; align-items: center; flex-shrink: 0; }
…
@media (max-width: 340px) {
  .header-left { gap: 4px; max-width: calc(100% - 112px); overflow: hidden; }
  .runtime-pill { max-width: 66px; min-width: 0; overflow: hidden; flex-shrink: 1; }
  .provider-badge { max-width: 54px; min-width: 0; overflow: hidden; flex-shrink: 1; }
}
```

**Symptom** — The clamp exists only inside `@media (max-width: 340px)`. Above it, `.header-left` has `min-width:0` (so its _box_ shrinks) but no `overflow:hidden`, while its children are `flex-shrink:0; white-space:nowrap`. The ellipsis rule at line 211 (`.runtime-pill-label, .provider-badge > span:last-child`) is dead code above 340px because the badge itself never shrinks.

Measured in a browser across 200-700px with the real DOM: with the **default** badge label "Auto routing" (`package.json:707` defaults `agiWorkforce.model` to `auto`; `ChatStateManager.ts:1417-1425` posts `providerLabel: 'Auto routing'`), the badge overlaps the account codicon at **341-351px only** — max 11.4px at 341px, clear at ≥352px. Every real catalog label ("Anthropic", "OpenAI", "Perplexity", "AGI Cloud") produces **no overlap at any width** 200-700px.

The report's `ollama/llama3.1:70b-instruct` scenario is **not substantiated**: both cited fallbacks (`ChatStateManager.ts:1219`, `modelConstants.ts:274`) emit a short provider _id_, not a model id, and `ollama`/`lmstudio` are both in `PROVIDER_DISPLAY` so they take the `knownProvider.label` branch. Clicks in the overlapped strip land on the badge, but ~17px of the 28px account button stays hittable.

**Reference** — `004-codex-vscode-ext-onboarding-intro-ask-codex-anything-step1.png`: the "Codex" title and the panel-chrome buttons never touch; the title truncates before reaching them.

**Fix** — Move the clamp out of the media query so it always applies; this finally activates the ellipsis rule at 211:

```css
.header-left {
  min-width: 0;
  overflow: hidden;
}
.runtime-pill,
.provider-badge {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
}
```

Keep the tighter max-widths inside the 340px query. Update the snapshot test.

---

**VSC-9 · MEDIUM · Model popover's fixed 360px max-height clips the top of the list off-screen with no way to scroll to it**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:876`

```css
.model-popover {
  display: none;
  position: absolute;
  right: 10px;
  bottom: calc(100% + 6px);
  width: min(320px, calc(100vw - 20px));
  max-height: 360px;
  overflow-y: auto;
  …
  z-index: 24;
  padding: 6px;
}
```

**Symptom** — The popover is a child of `.input-area` (`position: relative`, 651) and grows **upward** with a viewport-independent cap. Baseline chrome is header 45px + `.input-area` ~122px ≈ **167px** (the usage meter ships `display:none` at 1670/1684 and only appears for cloud tiers, adding ~30px). Below a ~533px webview height the popover's top computes negative and is clipped by `body{overflow:hidden}`.

The clipped band is _outside_ the scroll container, so the popover's own `overflow-y:auto` cannot reach it: at `scrollTop=0` the visible window is content `[X..360]`; scrolling only moves content further up. Content in `[0..X]` is **never** visible. `ChatStateManager.ts:766-786` pushes the **Local** group first, so the first casualties are the `LOCAL` heading and on-device models (Auto is in the second group). No JS measures the viewport — grep for `maxHeight|getBoundingClientRect|innerHeight` returns nothing for the popover, and the only media queries are width-based.

Worse: `focusMenuItem(modelPopoverEl, activeIndex >= 0 ? activeIndex : 0)` at line 2328 scroll-into-views the selected model on open, which can land the keyboard cursor on an invisible row — opening the picker with a local model selected can look like nothing happened.

Reachable via dragging the AGI view into the bottom Panel, a short window, or the secondary sidebar sharing height with three other contributed views.

**`.plus-menu` (810-823) is worse, not milder**: `bottom: calc(100% + 6px)`, **no `max-height` at all**, and `overflow: hidden`. Its four items with descriptions run ~230px, so below a ~400px webview its top items are clipped with no scrollbar even in principle.

**Reference** — `011-codex-vscode-ext-reasoning-effort-menu-light-medium-high-ultra-options.png`: the Codex menu is anchored to the control that opened it and sized to the space actually available; every option is reachable.

**Fix** — Cap against the viewport:

```css
.model-popover {
  max-height: min(360px, calc(100vh - 180px));
}
.mention-dropdown {
  max-height: min(180px, calc(100vh - 200px));
}
.plus-menu {
  max-height: min(280px, calc(100vh - 180px));
  overflow-y: auto;
}
```

For `.plus-menu`, switching `overflow:hidden` → `overflow-y:auto` costs the border-radius clipping on the first/last item — add radius to those items or wrap the scroller. **Do not** add `left: 10px` alongside `right` and `width` — that is over-constrained and in LTR the `right` offset is simply dropped. For composer-width anchoring use `left: 10px; right: 10px; width: auto; max-width: 320px;`.

---

**VSC-10 · MEDIUM · Chat input font size is hardcoded 13px, defeating the file's own accessibility contract**

**Where** — `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:687`

```css
body {
  …
  /* VSCX-15: follow the editor's own typography. A hardcoded stack ignored
     the user's font choice and, more importantly, their font *size* —
     which is an accessibility setting, not a preference. */
  font-size: var(--vscode-font-size, 13px);
  …
}
…
#userInput {
  …
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  min-height: 46px;
  max-height: 140px;
```

**Symptom** — Repro is `"editor.fontSize": 20` (**not** `window.zoomLevel` — zoom scales the whole webview iframe including px literals, making the mismatch invisible). VS Code injects `editor.fontSize` as `--vscode-font-size`. Message body text scales (`.message` at 563-570 declares no font-size), but the one control the user types into stays pinned at 13px. `#userInput` appears only at 680 and 694; no media query touches it.

The contract is broken file-wide, not just here — headings and menus do **not** scale either: `h2{16px} h3{14px} h4{13px}` (951), `code{12px}` (944), `.message.system{11px}` (617), `.model-popover__label{12px}` (927), `.header-title{13px}` (154). Sub-11px literals: `.model-pill` 10px (:731), `.plus-menu-description` 10px (:867), `.composer-hint` 10px (:1103) with `kbd` at 9px (:1113), `.onboarding-eyebrow` 10px (:395), `.onboarding-disclosures span` 10.5px (:468), `.message.user[data-delivery-state]::after` 9px (:583). (`.usage-meter-banner` is 11px — at VS Code's floor, not under it.)

**Fix** — Frame as file-wide, and change `autoResize` in the **same** commit or it regresses for exactly the users it targets: `#userInput { font-size: inherit; }`, then replace the literals with `em` units off the inherited base, and change `autoResize()` at 2230-2233 (`Math.min(userInput.scrollHeight, 140)`) to a computed multiple of the measured line-height. At 20px the 140px cap yields ~4 visible lines instead of ~7. `min-height: 46px` (:689) needs the same treatment.

---

**VSC-11 · MEDIUM · Usage & billing has no plan, credits, or usage-meter surface at all — only a debug tier-override dropdown**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1344`

```html
<section class="section" id="section-usage" data-settings-section="usage" hidden>
  ...
  <div class="card">
    <div class="card-heading">
      <h3>Plan resolution</h3>
      <p>The override is intended for local testing; BYOK uses the live resolved account tier.</p>
    </div>
    ...
    <select class="select-input" id="setting-tier" data-setting="tier" data-kind="string">
      <option value="local">Local only</option>
      ...
      <option value="enterprise">Enterprise</option>
    </select>
  </div>
</section>
```

**Symptom** — A user clicks "Usage & billing" (nav button at line 773) and lands on a billing screen with **no billing information on it**. The section (1344-1404) contains exactly two cards: "Plan resolution" with a read-only pill and the tier `<select>` (1371-1381), and an `.empty-capability` card with three link-out buttons. No plan name, no credits balance, no Buy credits, no usage meter, no reset date.

The pill renders a raw enum: line 1679-1680 is `document.getElementById('currentTier').textContent = String(state.values.currentTier || 'unknown').replace(/_/g, ' ');` — the user sees **"max 15x"**, not "Max 15x plan".

`grep -n "progress\|meter\|credits\|balance"` over all 1,875 lines returns **zero** — there is no bar/meter CSS primitive to reuse. `.setting-row` (346-352) is `grid-template-columns: minmax(0, 1fr) minmax(168px, 42%)`, which forces a right-aligned single control and cannot express "label + subtitle + bar + right-aligned % + reset date".

Two mitigations keep this from being high: the data already exists (`core/commandSetup.ts:1352` `agi-workforce.showAccountUsage` fetches `fetchTierInfo(context.secrets)` and renders session requests / tokens / `$(credit-card) Est. cost`, plus `$(pulse) Cloud usage: ${pct}% used` when `usagePercentage !== undefined`), so the new row has a live percentage to bind to and no backend work is needed; and that data is one click away behind the section's own "Session usage" button, just in a QuickPick.

On the tier dropdown: it is a first-class contributed setting (`package.json:857` declares `agiWorkforce.tier` with enumDescriptions, listed at `package.json:56` among untrusted-workspace restricted configs), and the paywall reads a _different_ value — `platform/config.ts:275-280` `currentTier()` reads `inspect('currentTier').globalValue` only, commented "Workspace values are ignored to prevent untrusted-workspace tier spoofing". So frame this as "a control labelled 'intended for local testing' is presented to end users on the billing screen", not as an entitlement bypass.

**Reference** — `017-codex-vscode-ext-settings-billing-pro-plan-credits-usage-limits.png` shows exactly the target structure: **Your plan** → Pro plan / View plans; **Credits balance** → $0 / Current balance / Buy credits; **General usage limits** → "Weekly usage limit / Resets Jul 28" with a bar and "100% left"; a second per-model "GPT-5.3-Codex-Spark usage limits" group with its own meter; **Usage limit resets** → "No resets available" empty state. No tier-spoofing control anywhere.

**Fix** — Rebuild the section to that shape: (1) "Your plan" card with plan name + "View plans"; (2) "Credits balance" card reusing `.account-line` (581) with balance, "Current balance" subtitle and a right-aligned "Buy credits"; (3) a new repeatable `.usage-meter-row` primitive — `display:grid; grid-template-columns: minmax(0,1fr) minmax(120px,220px) auto; align-items:center; gap:16px` holding a name+reset stack, `<div class="meter"><div class="meter-fill" style="width:N%">` (`height:4px; border-radius:999px; background:var(--vscode-progressBar-background)` on a `var(--vscode-panel-border)` track), and a `% left` label — bound to the existing `usagePercentage`; (4) a "No resets available" empty row. Move `setting-tier` behind raw settings or a dev flag, and render the resolved tier as a human plan name.

---

**VSC-12 · MEDIUM · Every settings section renders its title and description twice, stacked**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:791`

```html
<header class="page-header">
  <div>
    <p class="page-kicker">Workspace-scoped developer tools</p>
    <h1 class="page-title" id="pageTitle">Settings</h1>
    <p class="page-description" id="pageDescription">...</p>

    ... line 809:
    <div class="section-heading">
      <h2 tabindex="-1">General</h2>
      <p>Choose the default model, autonomy, and reasoning behavior for new sessions.</p>
    </div>

    ... line 1566 (sectionCopy): general: { title: 'General', description: 'Configure the model,
    autonomy, reasoning, and session defaults used by AGI in VS Code.' },
  </div>
</header>
```

**Symptom** — Visible on **all 8 sections, always, at every width**. `setSection` (1652-1653) populates `#pageTitle`/`#pageDescription` from `sectionCopy` and runs on load (1869), while every section still contains a hardcoded `<div class="section-heading">` (809-812, 965-968, 1133-1136, 1345-1348, 1407-1410, 1451-1454, 1471-1474, 1503-1506 — `grep -c "<h2"` returns exactly 8). Each title prints twice ~26px apart with two near-duplicate descriptions. On Usage they differ by **one word**: line 1348 "...account-level usage **or** billing." vs line 1580 "...account-level usage **and** billing."

Nothing suppresses either: `.section-heading` (304-318) sets only margin/font, and the only `display:none` rules in the whole style block are `.section[hidden]` (300-302) and the `.nav-label, .sidebar-footer` pair inside the 760px query. Cost is roughly **60-65px** of duplicated space per page (h2 18px ≈22px box + p ~21px + 14px margin-bottom).

The `page-kicker` at line 793 is a **static** string that `setSection` never updates — it is redundant chrome above the H1, not a third copy of the section name.

**Reference** — `014-codex-vscode-ext-settings-general-language-speed-composer.png`, `018-codex-vscode-ext-settings-mcp-servers-server-toggle-list.png`: one H1 plus at most one one-line subtitle, then straight into cards.

**Fix** — Delete all 8 `<div class="section-heading">` blocks and keep the single JS-driven `page-header`. Move `tabindex="-1"` onto `#pageTitle` and change `setSection`'s focus query from `'[data-settings-section="' + section + '"] h2'` (1655-1657) to `document.getElementById('pageTitle')` — safe, because cards use `<h3>` (16 of them), so that selector matches only the headings being deleted. Also drop the `page-kicker`.

---

**VSC-13 · MEDIUM · Plugins capability rows: the secondary "Available in…" column out-widths the capability name, and the row title fails contrast**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:626`

```css
.capability-availability-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(170px, auto);
  ...
}

.capability-availability-row.is-unavailable .capability-availability-name {
  color: var(--vscode-disabledForeground, var(--vscode-descriptionForeground));
}
```

**Symptom** — Verified by rendering the real generated HTML in headless Chromium at 9 widths with Dark/Light Modern token values.

The `auto` track sizes to the string's max-content and the `1fr` track absorbs the shortfall. Each row is its own grid container, so tracks size per row:

- **managed-plugins** renders "Available in Web and Desktop app." (mobile `canUsePlugins` is false — `capabilities.ts:366`, asserted in `packages/contracts/types/src/__tests__/capabilities.test.ts:191`), pinning its right track at the 170px floor. At vw=800 that row is copy=261.2 / avail=170.8 — the primary column wins.
- **browser-control** and **computer-use** render "Available in Desktop app and Chrome extension." → right track 237.7px. Measured: vw=761 copy=**159.2** / avail=**237.7** (secondary 49% wider); vw=800 copy=194.3 / avail=237.7; crossover at vw=860.

So the inversion band is **761px up to ~845px** — below 760px the media query at line 716 collapses to `minmax(0,1fr)` and the layout is correct. Reaching that band needs a split editor on a ≥1920px display (~786px), a ~1152-1280px window with the sidebar open, or a hand-dragged group. (A 2-up split on a 1440px display is ~546-696px and stacks correctly — the report's cited scenario does not reproduce.)

At vw=761 the description wraps to 3 lines (descH=52.2, rowH=120.2) and the heading also wraps, so a ~120px-tall left stack sits beside a single 13px line of right-column text — **~90px of dead space**.

Contrast, measured: Dark Modern name = `rgba(204,204,204,0.5)` over card `rgb(32,32,32)` = effective `#767676` = **3.59:1**, while its own description below is `rgb(157,157,157)` = 6.01:1 — the title is visibly fainter than its subtitle. Bold 13px is not WCAG "large text", so this fails AA. **Light Modern is worse and was unreported**: `#61616180` over `#f8f8f8` = effective `#adadad` = **2.11:1**, below even the 3:1 non-text floor, against a 4.60:1 description.

**Reference** — `018-codex-vscode-ext-settings-mcp-servers-server-toggle-list.png`: each row is `name (full foreground, left) … gear + toggle (right)`. Disabled servers keep a full-contrast name; only the toggle changes state.

**Fix** — Layout: raise the breakpoint that collapses `.capability-availability-row` from 760px to ~900px, **or** set the second track to `minmax(0, max-content)` with a max-width permitting wrap, **or** drop the third column and render availability as a pill beside `.capability-availability-status`. Note `.surface-availability { max-width: 200px }` does nothing for row 1 (already at its floor). Contrast: keep `.capability-availability-name` at `var(--vscode-foreground)` (10.15:1 dark) and carry the disabled signal only on the status badge.

_Evidence: `scratchpad/adv-caps-761.png`, `adv-caps-800.png`, `adv-caps-1400.png`, `adv-measure.mjs`._

---

**VSC-14 · MEDIUM · "Open raw settings" is hidden below 760px while the override banner tells the user to click it**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:676` (breakpoint) / `:694-697` (hide rule)

```css
@media (max-width: 760px) {          /* :676 */
  ...
  .nav-label,
  .sidebar-footer {                   /* :694-697 */
    display: none;
  }
```

```js
// :1693-1696
overrideNotice.textContent =
  'Workspace settings currently override these user values: ' +
  labels.join(', ') +
  '. Use Open raw settings to inspect or remove those overrides.';
```

**Symptom** — `.sidebar-footer` (markup 779-787) contains exactly one child, the **sole** raw-settings affordance: `<button class="raw-settings-button" data-command="openRawSettings">Open raw settings</button>`. A repo grep for `openRawSettings` returns only this markup, the protocol enum (`settingsProtocol.ts:26`), the handler (`SettingsPanel.ts:204`) and two tests — there is no second in-panel entry point.

Only two media queries exist in the file (676, and 748 for `prefers-reduced-motion`), so nothing re-shows the footer at any width, and `.nav` (700-705) becomes a horizontal scroller — the footer is simply dropped, not relocated. Meanwhile `#overrideNotice` (markup 806) is in the always-visible content column and renders whenever `state.workspaceOverrides.length > 0`.

Result: with any `.vscode/settings.json` override, viewed under 760px (a 2-up editor split on a 1440px window leaves ~570-700px), the banner instructs the user to click a control that has been removed from the layout.

Two things keep this at medium: widening or unsplitting the tab restores the button instantly, and VS Code always offers native access via ⌘, / the command palette. The defect a user actually notices is the **false instruction**.

**Fix** — Inline a real `<button data-command="openRawSettings">` into the banner so the affordance travels with the message, **or** append the button as the last item in the `.nav` horizontal scroller. Do **not** use the absolute-positioned variant (`position:absolute; right:14px; top:12px`) — `.brand` (128-133) occupies that row in the narrow branch, re-introducing an overlap at ~320px.

---

**VSC-15 · MEDIUM · Narrow-width nav is a 717px horizontal scroller in a 432px box with no affordance**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:699`

```css
.nav {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  padding-bottom: 2px;
}
```

**Symptom** — Measured in headless Chromium with the exact shell/sidebar/nav CSS at VS Code's default 13px system font, vw=460:

```
nav scrollWidth 717, clientWidth 432, navRight 446, scrollLeft 0
button lefts: General 14, Configuration 86, Personalization 193.4, Usage & billing 310.7,
              MCP servers 426.5, Hooks 528.4, Plugins 591.6, Account 660.7
```

The rendered screenshot shows only "General Configuration Personalization Usage & billing M" — **MCP servers, Hooks, Plugins and Account are off-canvas** with no fade, no chevron and no resting scrollbar (macOS overlay scrollbars are invisible until a gesture). Account holds sign-in. There is no `::-webkit-scrollbar`, `mask-image`, or `scroll-snap` anywhere in the file. Overflow persists all the way down: at vw=320 scrollWidth is still 717 vs clientWidth 292.

Reachable because `SettingsPanel.ts:58` opens this via `createWebviewPanel(..., column, ...)` in an editor ViewColumn, so any split or narrow window goes under 760px.

The visible sliver of "MCP servers" is ~19.5px (426.5 → 446), enough to render a full "M" — a weak but nonzero hint.

**The deep-link half of the original claim is refuted.** Every shipped `agi-workforce.openSettings` call site targets an early section: `commandSetup.ts:1495` → 'general'; `desktopBridge.ts:435`, `:582` and `ChatStateManager.ts:504` → 'configuration'; `contextPanelProvider.ts:227/246/278` → 'personalization'. Those occupy x=14..305.7, entirely inside the 432px viewport. `SettingsPanel.createOrShow` defaults to 'general' (46-48) and there is no serializer/revive path restoring a late section. Adding `scrollIntoView` in `setSection` is defensive hardening, not a fix for a reproducible symptom.

**Fix** — The affordance is what matters: either allow `flex-wrap: wrap` on `.nav` under 760px, or add a right-edge gradient over `var(--vscode-sideBar-background)`:

```css
.nav {
  mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
  scroll-snap-type: x proximity;
}
.nav-button {
  scroll-snap-align: start;
}
```

---

**VSC-16 · MEDIUM · Toggles, number inputs, selects and buttons sit on three different right edges inside one card**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:522` and `:395`

```css
.toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
}

.number-input {
  max-width: 130px;
}
```

**Symptom** — Reproduced with Playwright against the real template (CSP meta stripped so the inline `<style nonce="">` applied), viewport 860px:

```
#setting-agent-mode   L=586.3 R=798.0 (W=211.7)
#setting-agent-effort L=586.3 R=798.0 (W=211.7)
label.toggle          L=586.3 R=624.3 (W=38)
row right edge = 816
```

**173.7px of misalignment inside the "Model and reasoning" card.** Root cause is grid alignment: `.setting-row` is `grid-template-columns: minmax(0, 1fr) minmax(168px, 42%)` (346-352), and a grid item with a _definite_ used width (38px toggle, or `width:100%` capped by `max-width:130px`) does not stretch — it falls back to `start` and pins to the **left** of the 211.7px control track, while `.select-input`/`.text-input` at `width:100%` fill to the right edge.

Not taste: the file's own `.control-stack { justify-content: flex-end; }` (375-381) proves a right rail is intended, and the "Model preference" row (826) uses it — its Choose button lands at 798. So three right edges coexist on one page: 798 (selects/control-stack), 716.3 (number inputs), 624.3 (toggles).

**Two corrections to the original report.** (1) "Visible at every width" is **false** — `@media (max-width: 760px)` contains `.setting-row { grid-template-columns: 1fr; }` (734-737), `.control-stack { justify-content: flex-start; }` (739-741) and `.number-input { max-width: none; }` (743-745). Measured at 700px, every control stacks and left-aligns at L=36.0. The defect appears only **above** 760px — which is the normal case, since settings opens as a full editor tab. (2) The Personalization "Inline completions" card (1248-1304) has **no text input** — it is one toggle plus two number inputs; measured at 860px the toggle is R=624.3 and _both_ number inputs are R=716.3. Two edges 92px apart, not three.

Bare `.number-input` grid children left-align for the same reason — `#setting-context-lines` (940, General → Session behavior) measures L=586.3 R=716.3. A fix targeting only `.toggle` leaves the number inputs 81.7px short.

**Reference** — `014-codex-vscode-ext-settings-general-language-speed-composer.png`: the "Auto detect" dropdown, the Inline/Detached segmented control, the "Fast" dropdown, the context-window switch, the "Enter" dropdown and the Queue/Steer segment all terminate on one right rail.

**Fix** — `.setting-row > *:last-child { justify-self: end; }` is sufficient and also correct for `.control-stack`. **Must** be paired with `.setting-row > *:last-child { justify-self: start; }` inside the 760px query, or the narrow single-column layout starts right-aligning controls that currently left-align.

---

**VSC-17 · LOW · Safety warning text has no theme fallback and renders as ordinary body text in all ten built-in themes**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:371`

```css
.setting-description.danger {
  color: var(--vscode-inputValidation-warningForeground);
}
```

**Symptom** — `.setting-description.danger` (specificity 0,2,0) beats `.setting-description`'s `color: var(--vscode-descriptionForeground)` (0,1,0), so when the var is undefined the winning declaration is invalid-at-computed-value-time and `color` falls back to `inherit` — plain body foreground. Measured in Dark+: `rgb(204,204,204)`, identical to `--vscode-foreground`, while the neutral sibling description is `rgb(157,157,157)`.

The two riskiest warnings in the panel carry no warning colour at all: **"Bypass Permissions requires a separate risk confirmation before it can activate."** (847-849, General → Agent mode) and **"Applies AI-suggested fixes without opening a review diff."** (1072-1073, Configuration → Auto-apply fixes). Neither span has a background, border or icon, so colour is the _sole_ warning affordance.

Scope is broader than Dark+/Light+. Parsing all ten built-in themes in `.vscode-test/vscode-darwin-arm64-1.131.0/`: **eight** leave the token undefined (dark_plus, dark_modern, dark_vs, light_plus, light_modern, light_vs, **hc_black, hc_light** — both High Contrast themes, where a missing warning cue matters most). The registry itself reads `"inputValidation.warningForeground",{dark:null`.

**Fix** — A `var()` fallback chain does **not** fully work here: `2026-dark.json` sets the token to `#bfbfbf` and `2026-light.json` to `#202020` — byte-identical to each theme's own `foreground`, so the fallback never engages and the text still renders as body colour. Across all 10 built-in themes this line never gets a warning hue. The root cause is token misuse: `inputValidation.*Foreground` means "text colour for a validation box that already has the matching warning background", not "warning-coloured text". Correct fix:

```css
.setting-description.danger {
  color: var(--vscode-editorWarning-foreground);
}
```

`editorWarning.foreground` resolves in every theme via its registry default (`{dark:"#CCA700"}`), and the repo already relies on it at `sidebar-webview/webviewContent.ts:295`.

**Do NOT apply this to lines 274 (`.pill.warning`) and 296 (`.override-notice`)** as the original report suggested. Those set `background: var(--vscode-inputValidation-warningBackground)` / `infoBackground` plus matching borders — the token's _intended_ fg-on-matching-bg usage, which degrades gracefully today. Injecting a `#CCA700` fallback there would paint yellow text on the pale-yellow `#FDF6E3` warning background used by the light themes, creating a readability failure where none exists.

---

**VSC-18 · MEDIUM · Model preference is a free-text box squeezed to ~103px, truncating the model id it exists to show**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:826`

```html
<div class="control-stack">
  <input
    class="text-input"
    id="setting-model"
    data-setting="model"
    data-kind="string"
    type="text"
    autocomplete="off"
    spellcheck="false"
  />
  <button class="secondary-button" type="button" data-command="selectModel">Choose</button>
</div>
```

**Symptom** — Reproduced empirically by rendering the real webview HTML with VS Code theme vars injected. `.setting-row` caps the control track at `minmax(168px, 42%)` and `.control-stack` shares it with a 70.1px nowrap "Choose" button, so the input measures exactly **133.6px at 860px** and **103.3px at 780px**.

Real catalog ids clip mid-token: `claude-sonnet-5` → `claude-sonne` at 780px; `gemini-3.1-flash-image` → `gemini-3.1-fla` at 780px, `gemini-3.1-flash-i` at 860px. `applySnapshot` sets only `control.value` and never a `title`, so there is **no tooltip fallback**. `Config.update` writes `model` to `ConfigurationTarget.Global` with no catalog validation, so a typo is accepted silently.

**Bounded**: `@media (max-width: 760px)` sets `.setting-row { grid-template-columns: 1fr; }` (734-737), expanding the input to 548-603px. The broken band is **761px to ~950px** only.

**Trigger corrected**: not "anything but auto". The default `auto` (26.8px of text) never clips at any width, and `gpt-5.6-sol` survives to 780px. The condition is **id ≥ ~13 characters AND viewport in 761-950px**. Since `auto` is the shipped default (`package.json:705-709`), most users only hit this after running Select Model. The example `claude-opus-4-5-2…` in the original report is fabricated — no such id exists in `packages/contracts/types/src/models.json`; the longest chat ids are 22 chars.

Recoverable (click + End scrolls the value; the quick-pick shows `placeHolder: \`Current: ${currentModel}\``at`core/commandSetup.ts:578`), hence medium not high.

**`min-width: 0` is already set** on `.control-stack` (line 380) — the input shrinks correctly; this is not a min-width bug and that clause of the original fix is a misdiagnosis.

**Reference** — `014-codex-vscode-ext-settings-general-language-speed-composer.png`: Codex renders every General value as a dropdown or segmented control, never a raw text field.

**Fix** — Replace the free-text input with a read-only value button that opens the existing `selectModel` quick-pick: a single full-width `.secondary-button` showing the resolved model with `overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0` plus a `title` carrying the full id. If the raw field must stay, give the row its own layout: `.setting-row.is-wide { grid-template-columns: minmax(0,1fr); }`.

---

**VSC-19 · LOW · Capability rows carry a `title` tooltip that duplicates the visible text and replaces the row's accessible name**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:46`

```html
role="listitem" title="${escapeHtml(presentation.tooltip)}" > ...
<span class="surface-availability">${escapeHtml(presentation.tooltip)}</span>
```

**Symptom** — Settings → Plugins. Hovering any of the three rows pops a native OS tooltip containing the exact sentence already printed in the row's right-hand column, rendered on top of the text it duplicates. The span is never hidden or truncated: `.surface-availability` (664-668) sets only colour/font-size/text-align, and the `@media (max-width:760px)` block (716-723) merely collapses the row to one column — so the text never ellipsizes and a tooltip is never informative.

For screen readers, `role="listitem"` is name-from-author, so `title` becomes the element's **accessible name** and suppresses the capability label and description from the name computation.

Actual strings (the original report's "Available in Web, Desktop app, and Mobile app." is wrong — `MOBILE.canUsePlugins` is false at `packages/contracts/types/src/capabilities.ts:155`): Managed Cloud plugins → **"Available in Web and Desktop app."**; browser-control and computer-use → **"Available in Desktop app and Chrome extension."** All three rows affected.

**Fix** — Delete the `title` attribute at line 46. The visible span at line 55 already carries the whole string, and removing `title` restores the listitem's name-from-content reading of the capability label and description.

---

**VSC-20 · LOW · Account section shows no signed-in identity — no email, plan, or organization**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1507`

```html
<div class="account-summary">
  <div class="account-line">
    <div class="account-state">
      <span class="status-dot" id="accountDot" aria-hidden="true"></span>
      <span id="accountStatus">Checking AGI Cloud connection…</span>
    </div>
  </div>
</div>
```

**Symptom** — The entire signed-in rendering is `accountStatus.textContent = 'Connected to AGI Cloud'` plus a green dot and a Sign out button (1713-1716). No email, plan, org or avatar. `SettingsPanel.ts:124-127` only derives `accountConnected: accountToken !== undefined`, so no identity ever reaches the webview. A user with two accounts cannot tell which one this host is authenticated as before clicking "Sign out".

Inconsistent with the rest of the same extension: `fetchAccountIdentity` (`utils/api.ts:822-853`) already returns `{displayName, email, accountType, planName, tier}` and is already rendered in the account quick pick (`features/account-auth/accountPresentation.ts:19-24`) and in the sidebar webview (`sidebar-webview/webviewContent.ts:1934, 3157`).

Low rather than medium: nothing is clipped or unusable, Sign out works, the resolved plan tier renders elsewhere in the same panel (line 1361, Usage & billing → "Current resolved tier"), and full identity is one click away via the "Account & usage" button in the same card (1543).

_(Note: the original report's innerText evidence — "Local workspace mode — AGI Cloud not connected | Sign in | …" — is the **signed-out** rendering at 1718-1720, not the signed-in screen described. The substance holds; the evidence was from the wrong state.)_

**Reference** — `013-codex-vscode-ext-account-menu-profile-dropdown-settings-logout.png` shows the account entry point carrying the signed-in identity (email line + "Personal account") before any Settings/Logout action.

**Fix** — Add `fetchAccountIdentity(this.context.secrets)` (and optionally `fetchTierInfo`) to SettingsPanel's state refresh alongside the existing `getAccountToken` call — both are already awaited together at `core/commandSetup.ts:1355-1359`. Extend `SettingsPanelState` with the identity fields and render displayName/email/planName in `.account-state`: avatar initial, email as primary line with `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` plus a `title`, plan as a `.pill`. Keep the dot as a status accent. **Do not** use `getAccountToken` as the data source — it returns only a token string.

_Adjacent, not separately reportable: `getAccountAuthState` (`utils/api.ts:196-213`) distinguishes 'expired' from 'signed-out', but `SettingsPanel.ts:127` collapses both to `accountConnected: false`, so an expired session renders identically to never-signed-in._

---

**VSC-21 · LOW · Discovered instruction file paths are right-aligned, so long paths wrap ragged-left**

**Where** — `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:477` and `:487`

```css
.instruction-source {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  padding: 8px 10px;
  border: 1px solid var(--vscode-panel-border);
  border-radius: 5px;
}

.instruction-source span {
  color: var(--vscode-descriptionForeground);
  font-size: 11px;
  text-align: right;
}
```

**Symptom** — Settings → Personalization → "Runtime-discovered project sources". The list (`<ul id="instructionSources">` at 1200, populated 1759-1770 with the absolute `fsPath` from `customInstructions.ts:96`) right-aligns a path that reads left-to-right, so each wrapped line is flush-right and the user scans a staircase.

Measured in Chromium: at 456px inner width the path wraps to 3 flush-right lines — line 1 "Preview truncated", line 2 "/Users/siddhartha/Desktop/agiworkforce/apps/extension", line 3 "vscode/src/features/settings/AGENTS.md".

**Trigger corrected**: at the originally claimed 780px the 100-char path renders **576px on one line and does not wrap**. Wrapping begins below ~600px of row inner width, i.e. the settings tab under ~690px — a half-split editor column with the explorer open, or the single-column layout below the file's own 760px breakpoint.

**Two supporting claims are false**: Chromium _does_ break Windows paths at backslashes (the `C:\Users\...\CLAUDE.md` sample wrapped cleanly to 2 lines), and the missing `min-width:0` causes **no** overflow — `li.scrollWidth` equalled `clientWidth` (780/780 and 456/456) at every width tested, so `.card{overflow:hidden}` (325) never clips anything.

**Fix** — The only load-bearing change is at line 487: replace `text-align: right` with `text-align: left`, plus `overflow-wrap: anywhere` as insurance against a single over-long segment. Splitting "Preview truncated" out of the concatenated string at line 1766 into its own pill is a real readability win at narrow widths, since it currently consumes the whole first wrapped line. The ellipsis-plus-`title` treatment (matching `.config-path` at 403, which uses `word-break: break-all`) is a reasonable redesign but not required.

---

### Chrome extension

**CHR-1 · HIGH · Computer Use / Workflows panels are a dead end — the composer is hidden and no control returns to chat**

**Where** — `apps/extension/src/side_panel.ts:6943`

```js
if (inputAreaEl) inputAreaEl.style.display = tab === 'chat' ? '' : 'none';
if (toolbarEl) toolbarEl.style.display = tab === 'chat' ? '' : 'none';
```

**Symptom** — Open ⋮ → "Computer Use" (or "Workflows"), or let a browser-automation run start. The chat transcript and the whole composer disappear (`#sp-chat-panel.sp-tab-hidden { display: none; }`, CSS at 2244) and the Computer Use log fills the panel. There is now no visible way back:

- The tab bar that owned the only `switchTab('chat')` button (built 6900-6924, listener 6953) is force-hidden by `#sp-tab-bar { display: none; }` (2584), with the comment "Phase 2: Tab bar hidden (Workflows / CU are drawer launchers now)".
- The drawer launchers only navigate _to_ the panels (5642-5645 Workflows, 5663-5666 Computer Use).
- Neither `#sp-cu-panel` (`features/side-panel/computerUsePanel.ts:547+`) nor `#sp-workflows` (7072+) has any back control — grep for `Back|switchTab|chat` in computerUsePanel.ts returns nothing.
- Boot resets to chat (8481) and the tab is not persisted, so **closing and reopening the panel is the only recovery**.

**Worse than a missing exit — three visible header controls silently do nothing.** `switchTab` hides only `#sp-input-area` and `#sp-toolbar`; `#sp-header` (built 4910, appended 5291) stays visible. So while trapped, the user can still click New chat (5262 — silently wipes the transcript behind the hidden panel), Recent chats (5245 — `void restoreHistoryEntry(entry.id).finally(closeDrawer)` at 5548-5549 closes the drawer and leaves the CU log on screen), and ⋮ (5282). All three appear broken.

During a run it is worse still: `switchTab('computer-use')` fires on **every** streamed step (7593), so any attempt to navigate away is yanked back.

One accidental, conditional route back exists and only from Workflows: `openStoredConversation` (5394-5406) calls `switchTab('chat')` at 5400, wired to the Workflows shortcut rows at 8762 and 8772-8774 ("View last result"). It requires a prompt-based shortcut with a stored result. **Computer Use has no path to it at all.**

**Reference** — `149-chatgpt-web-extension-panel-empty-state-new-task.png`: the ChatGPT side panel keeps the "Do anything" composer pinned at the bottom at all times; the header "New task ⌄" is a live control for changing surface. Codex/Claude never replace the composer with a log view that has no exit.

**Fix** — Give `#sp-cu-panel` and `#sp-workflows` a sticky header row with a `‹ Back to chat` button wired to `switchTab('chat')`. Make the header's New-chat handler (5262) call `switchTab('chat')` before `resetConversationView()`, and change the Recent-chats click (5548) to `void restoreHistoryEntry(entry.id).then(() => switchTab('chat')).finally(closeDrawer)`. Stop auto-switching on every step — only on the first `AGI_CU_STATE` running message, not inside the `AGI_CU_STEP` branch at 7593.

---

**CHR-2 · MEDIUM · Page-context chip collapses to a blank pill as the panel narrows — you cannot see which page you are attaching**

**Where** — `apps/extension/src/side_panel.ts:1896`

```css
#sp-composer-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 2px 0;
}
```

**Symptom** — Measured in headless Chromium with the exact CSS. The composer bar holds four children (appended 8174, 8228, 8349, 8389): the page-context chip, the autonomy chip ("Full access", nowrap), the effort button ("Advanced · Medium"), and the Quick toggle. It has no `flex-wrap`, and `body { overflow: hidden }` (770) means no scrollbar. There are **zero** `@media` queries in the entire 9,342-line file.

But `.sp-context-chip` has `overflow: hidden` (1917), which per spec gives it an automatic minimum size of 0 — so it shrinks freely and **absorbs 100% of the deficit**. The Quick toggle is _not_ clipped at any realistic width:

```
W=400 → toggle 333-377, fully visible
W=320 → toggle 261-305, fully visible (15px clearance)
W=280 → clipped 25px      W=240 → clipped 65px
```

Clipping only begins below ~305px total panel width, under Chrome's 320px minimum.

What actually breaks is the chip, whose whole job is to report which page will be attached and (via `.has-context` recolouring the dot, 1933-1937) whether context _is_ attached:

```
W=440 → chip 107px, 76px of text — hostname fully readable
W=400 → chip  92px, 61px of text — "docs.goog…"
W=360 → chip  52px, 21px of text — one or two characters
W=320 → chip  20px, -11px of text — NOTHING renders
```

At 320px the chip is padding + border only; the hostname **and** the `::before` status dot are both clipped away, leaving an anonymous 20px blob whose `scrollWidth` is 105px against a 20px box. Only the `title` tooltip (set at 4249, 4253) still carries the information.

**Reference** — `149-chatgpt-web-extension-panel-empty-state-new-task.png`: at the same ~380px width ChatGPT's composer control row carries only four compact icon-scale controls and every one is fully inside the frame. It never puts four text pills in one non-wrapping row.

**Fix** —

- **Do:** `#sp-composer-bar { flex-wrap: wrap; row-gap: 5px; }` (1896) and drop `margin-left: auto` from `#sp-effort-control` (1997).
- **Do:** add a readability floor — `.sp-context-chip { flex: 0 1 auto; min-width: 64px; }` — so it ellipsizes to something legible rather than to zero once the row can wrap.
- **Do NOT** add `min-width:0; flex-shrink:1` to `.sp-context-chip` — line 1917's `overflow:hidden` already does exactly that; the chip's problem is that it shrinks _too much_.
- **Do NOT** add it to `.sp-autonomy-chip` (1945) either — that chip reports the `agi_cu_ask_before_acting` security gate, and letting "Full access" truncate to "Ful…" degrades a security-relevant label. Keep it nowrap and unshrinkable.

---

**CHR-3 · MEDIUM · Header model pill has no truncation, so a long model name paints over the header icon buttons and steals their clicks**

**Where** — `apps/extension/src/side_panel.ts:2344`

```css
#sp-model-selector-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: color-mix(in srgb, var(--agi-ext-accent) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--agi-ext-accent) 30%, transparent);
  border-radius: 5px;
  padding: 3px 8px;
  color: var(--agi-ext-accent);
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.12s,
    border-color 0.12s;
  white-space: nowrap;
}
```

**Symptom** — `.sp-model-selector-wrap` (2343) sets only `position: relative` — no `min-width: 0` — so as a flex item its automatic minimum equals the nowrap pill's min-content width and it **cannot shrink**. `#sp-header-left`'s `min-width:0` (855) lets only the _box_ shrink while contents spill into `#sp-header-right`'s space (891, `flex-shrink: 0`). No media queries exist; `body{overflow:hidden}` (763-772).

Measured with a faithful repro at 320px: with "Sonar Reasoning Pro" or "Gemini 3.5 Flash-Lite" the pill spans x=74..211 while header-left's box ends at 151 (60px overflow) and header-right begins at 159 — a **52px overlap band**.

**The paint direction is the opposite of what the original report claimed, and worse.** `elementFromPoint` at the pill's vertical centre across x=160..190 (the full width of the first icon button, 159-189) returns `sp-model-badge` every time. `#sp-model-badge` is an inline-level span _with a background_, painted in the inline phase, landing above the block-level icon buttons whose backgrounds are `transparent`. So the pill paints **over** the icons and **steals their clicks**: at 320px with a long model name, clicking Recent chats opens the model dropdown instead.

**No clipping at the panel edge** — at 320px the pill's right edge is x=211 while the panel content edge is x=308; the entire overflow is absorbed by the ~150px icon strip.

Onset by width: 400px clean for every shipped label; ~360px = 12px overlap for 19-21 char names; 320px = 52px for long names and 9px even for the default "AI Assistant"; 280px = ~92px. A visible `#sp-quota-badge` adds ~47px to header-right, pushing onset from ~313px to ~360px.

**Custom OpenAI-compatible ids are unreachable here** (the original report's premise): `getManagedModelPickerOptions` (`features/cloud-bridge/managedModelPicker.ts:48`) `continue`s on any id without bundled metadata, and `reconcileManagedModelSelection` (:67) resets unknown ids to `'auto'`. The real worst case is the bundled catalog name — longest chat entries are 19-21 chars.

**Reference** — `179-claude-web-settings-panel-claude-in-chrome-permissions.png` sizes its narrow-column control to a fixed pill that ellipsizes; `149-chatgpt-web-extension-panel-empty-state-new-task.png` keeps its header title truncating, never overlapping the pin/close buttons.

**Fix** — The load-bearing piece is the first line; without it the others do nothing:

```css
.sp-model-selector-wrap {
  position: relative;
  min-width: 0;
} /* :2343 */
#sp-model-selector-btn {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
} /* :2344 */
#sp-model-badge {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
} /* :878 */
```

`overflow:hidden` on `#sp-header-left` (851) is a useful backstop but clips mid-glyph rather than ellipsizing, so it should not be the only change.

---

**CHR-4 · MEDIUM · Closed settings drawer keeps 20+ off-screen controls in the tab order**

**Where** — `apps/extension/src/side_panel.ts:5444`

```js
function closeDrawer(): void {
    drawerOverlay.classList.remove('open');
    drawer.classList.remove('open');
    drawerReturnFocus.focus();
  }
```

**Symptom** — `#sp-drawer` (2595-2611) is hidden **only** by `transform: translateX(100%)` — never `display:none`, `hidden`, or `inert`. A repo grep confirms: the only `inert` hit in the file is inside an unrelated comment at line 6003, and `side_panel.css` (21 lines) has no drawer rules. `closeDrawer()` does exactly what is quoted and nothing more.

**Tab order is worse than the original report suggested.** The drawer is appended to body at line 6865, _before_ `chatPanel` (7070), `toolbar` (7833) and `inputArea` (8429). So the dead tab stops come **between the header and the composer**. Repro: open the panel, open the ⋮ drawer, close it, then Tab forward — focus immediately walks into the off-screen drawer, and the user must press Tab ~20+ times with no visible focus before reaching the chat panel and composer at all.

The drawer is `position: fixed` on `document.body` with no transformed ancestor, so it contributes nothing to document scrollable overflow — the browser's scroll-focus-into-view cannot bring it back, and `body { overflow: hidden }` (770) is a second lock. There is no focus trap (the only drawer keydown is Escape, 5458-5463).

`role="dialog"` + `aria-modal="true"` are hardcoded at construction (5424-5426) and never removed, so AT is told a modal dialog is permanently present.

Genuinely stranded and tabbable: `#sp-drawer-close`, `#sp-drawer-history-btn`, `#sp-drawer-summarize-btn`, `#sp-drawer-clear-chat-btn`, `#sp-drawer-wf-btn`, `#sp-drawer-cu-btn`, `#sp-drawer-capture-btn`, `#sp-drawer-refresh-btn`, `#sp-drawer-group-btn`, `#sp-drawer-options-btn`, the pairing buttons, `#sp-drawer-in-page-toggle`, the allowlist toggle + per-item removes, the memory "Add" button, `#sp-drawer-bridge-input` + save, `#sp-cloud-signin-btn`, the `.sp-cloud-link-btn` row, the invite-code input + redeem, and the footer links. (The history search input and memory textareas are **not** — `#sp-drawer-history-list[hidden] { display: none }` at 2714 and `.sp-drawer-memory-editor { display: none }` at 2883 genuinely hide them.)

**Reference** — `177-claude-web-settings-panel-claude-code-appearance-prefs.png` / `179-claude-web-settings-panel-claude-in-chrome-permissions.png`: Claude's settings panel is mounted only while open; there is never a shadow copy of its controls in the tab order.

**Fix** — In `closeDrawer()` set `drawer.inert = true; drawer.setAttribute('aria-hidden', 'true');` and in `openDrawer()` (5432) clear both before `drawerClose.focus()`. Set the initial state to `inert` at construction (5423-5427), since it is never open on first paint. Keep the transform for the slide animation.

---

**CHR-5 · LOW · Page-context chip cannot ellipsize — long hostnames are hard-clipped mid-character**

**Where** — `apps/extension/src/side_panel.ts:1902`

```css
.sp-context-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      ...
      white-space: nowrap;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
```

**Symptom** — `text-overflow: ellipsis` applies to block containers with inline content. On an `inline-flex` element the raw text node becomes an anonymous flex item, and `text-overflow` is not inherited, so the anonymous block gets the initial value `clip`. The chip's content is set as a text node (`contextBtn.textContent = currentPageHostname || 'page'`, 8152; also 4250 and 4254).

With the global `box-sizing: border-box` (755), the text budget is `140 − 18 padding − 2 border − 6 ::before dot − 5 gap ≈ 109px`, i.e. **~21-22 characters** at font-size 10px. `console.cloud.google.com` (24), `eu-west-1.console.aws.amazon.com` (32) and deep corporate subdomains clip mid-letter with no ellipsis. `pageChipLabel()` (`utils.ts:366`) returns `parsed.hostname` unmodified, keeping `www.`, so nothing shortens it upstream.

The `title` attribute does **not** rescue it — it is set to 'Attach page content to next message' (8150) or 'Page context attached — click to detach' (4249), and line 4515 overwrites it with an availability message.

**Fix** — Wrap the label in its own span, matching the adjacent autonomy chip which already does this (`const autonomyLabel = el('span', { id: 'sp-autonomy-label' })`, line 8183):

```js
const chipLabel = el('span', { class: 'sp-context-chip-label' });
// set chipLabel.textContent instead of contextBtn.textContent at 8152 / 4250 / 4254
```

```css
.sp-context-chip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Remove `text-overflow: ellipsis` from the chip itself (inert there), and set `contextBtn.title` to the full hostname so hover recovers it.

---

**CHR-6 · MEDIUM · Light theme: toggle switches are ghosts — white knob on a `#f0f0f0` track on a `#ffffff` card**

**Where** — `apps/extension/src/side_panel.ts:2968` (and `:2505-2515`, `:2272`)

```css
.sp-drawer-toggle-switch::after {
  content: '';
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: white;
  top: 2.5px;
  left: 2.5px;
  transition: transform 0.2s;
}
```

**Symptom** — The panel follows the OS theme via `getExtensionTokensCssAuto()` (753 → `tokens.ts:24-35`, which emits the dark set at `:root` plus a `@media (prefers-color-scheme: light)` block). In light mode `--agi-ext-hover` resolves to `#f0f0f0` (`packages/ui/design-tokens/src/index.ts:90`, mapped at :370) and the knob is the literal `white` — **~1.14:1**. The track has `border: none` (2963).

**The track is invisible too, which the original report understated.** `#sp-drawer` has `background: var(--agi-ext-bg)` (2602) and `.sp-wf-task-item` has the same (2266); in light mode that is `#ffffff` (index.ts:87). So the `#f0f0f0` track is **also ~1.14:1 against its own container**. The correct symptom is not "a featureless gray pill" — in the OFF state the _entire control is a ghost_, neither track nor knob visible.

Three instances, all real rendered `<input type="checkbox">` with `appearance:none`: the drawer's "Page chat overlay" switch under the "In-Page Panel" section (5898-5903, CSS 2953-2978), the "Extended thinking" toggle in the model dropdown (5187-5192, CSS 2490-2515), and every scheduled-task toggle in Workflows (8860-8863, CSS 2270-2272). On the Workflows tab with several disabled tasks, those rows read as having empty space where the enable switch should be.

`rg -n "prefers-color-scheme" side_panel.ts` returns nothing — no later rule repaints these knobs. ON state is unambiguous (`--agi-ext-accent` blue track), which is why this is medium.

**Reference** — `061-chatgpt-ios-settings-safety-reduce-sensitive-content-toggle.png`: the OFF switch on a white card uses a mid-gray track with a clearly readable white knob. `066-chatgpt-ios-settings-general-app-language-toggles.png` for the ON comparison.

**Fix** — Both halves are needed. Track rules at **2270, 2490-2502, 2953-2965**: add `border: 1px solid var(--agi-ext-border-strong)` and a genuinely darker OFF value than `--agi-ext-hover` (which is correctly near-invisible by design — add a dedicated `--agi-ext-toggle-off` token to `packages/ui/design-tokens/src/index.ts`, roughly `#b7bbc0`). Knob rules at **2272, 2511, 2974**: `background: var(--agi-ext-toggle-off)` won't work either — `--agi-ext-surface` resolves to `#ffffff` in light mode, so the knob needs `box-shadow: 0 1px 2px rgba(0,0,0,0.25)` plus a border to read. Sweep `options.ts` and `features/cloud-bridge/InviteCodeModal.ts`, which also consume `getExtensionTokensCssAuto` and likely carry the same hardcoded white knob (see CHR-14).

---

**CHR-7 · MEDIUM · Message copy button is `opacity:0` and revealed only on hover, so keyboard focus lands on an invisible control**

**Where** — `apps/extension/src/side_panel.ts:1103`

```css
      opacity: 0;
      transition: opacity 0.15s, color 0.15s, background 0.15s;
    }
    .sp-msg:hover .sp-copy-btn { opacity: 1; }
```

**Symptom** — Only four `.sp-copy-btn` rules exist in the whole repo (1093, 1106, 1107, 1108) and none is a focus rule; the only `:focus-within` in the file targets `#sp-composer-shell` (1717). The button is a genuinely tabbable native `<button>` with no `tabindex="-1"` and no `visibility:hidden` (created at `features/side-panel/bubbles.ts:124-128` and again at `:572-576`). The global `button:focus-visible { outline: 2px solid var(--agi-ext-focus) }` (757-761) paints an outline on an `opacity:0` element — **invisible**. Focus appears to vanish once per assistant message: a WCAG 2.4.7 failure a sighted keyboard user notices directly.

**Scope is half what the original report claimed** — the button is **assistant-only**. Both render sites gate it (`if (!isUser)` at bubbles.ts:123, `if (msg.role === 'assistant')` at :571); user bubbles get only a `.sp-timestamp` span. And trackpads _do_ generate hover events, so only genuine touch input (Chrome OS tablet mode, touchscreen laptops) never reveals it.

There are two independent render paths (plain message at bubbles.ts:124, tool-call at :572) sharing the class, so one CSS rule fixes both.

Held at medium: the control retains `aria-label="Copy response"` so screen-reader users are unaffected, Enter/Space still activates it, and `.sp-copy-btn.copied { opacity: 1 }` (1108) briefly reveals it on success.

**Reference** — Claude and ChatGPT keep message actions permanently visible below the bubble rather than gating them behind hover.

**Fix** — Insert after line 1106:

```css
.sp-copy-btn:focus-visible,
.sp-msg:focus-within .sp-copy-btn {
  opacity: 1;
}
```

Better: resting `opacity: 0.55`, rising to `1` on hover/focus, so the affordance is discoverable without a pointer. _(Separate issue observed while verifying: the hit target is ~15px square — an 11px icon at bubbles.ts:129/:576 plus `padding: 2px` at side_panel.ts:1101 — well under the ~32px minimum.)_

---

**CHR-8 · MEDIUM · Drawer Recent-chats rows are click-handled `<div>`s — no keyboard access, no focus ring**

**Where** — `apps/extension/src/side_panel.ts:5517`

```js
const item = el('div', { class: 'sp-drawer-history-item' });
```

**Symptom** — The `el()` helper (`features/side-panel/dom.ts:15`) is a bare `createElement` + `setAttribute` loop that adds no role and no tabindex, so the row ships as a plain div. Its only activation path is the click listener at 5548 (`item.addEventListener('click', () => { void restoreHistoryEntry(entry.id).finally(closeDrawer); });`). CSS at 2734-2743 sets only `cursor: pointer` plus flex/padding/border/background; a grep for `focus-visible` returns 23 rules and none matches this class. The global ring at 757-758 is `button:focus-visible, [role="button"]:focus-visible` — a div with neither cannot match. The drawer's sole keydown listener (5459-5464) handles Escape only.

The nested delete button **is** a real `<button>` and calls `e.stopPropagation()` (5526-5527), so **Tab lands on the delete buttons while skipping every conversation label**. There is no alternate route: `restoreHistoryEntry` has exactly two callers (5396, reached only from notification clicks / Workflows rows, and 5549), and `historyBtn` (5580) opens this same list. **A keyboard-only user cannot open any saved conversation from the drawer.**

**Two of the three cited examples need correcting.** The shortcut rows at **8558 are not the same shape and should be dropped** — `const item = el('div', { class: 'sp-shortcut-item' })` has no click listener at all; the row is a label span plus two real `iconButton` `<button>`s (Replay 8561, Delete 8579), both covered by the global focus ring. Applying the button-conversion there would be a no-op at best and a nested-interactive regression at worst. The WebMCP tool row (4394, handler 4406) _is_ real but much lower impact — its handler only prefills the composer with `Use the ${tool.name} tool to `, which a keyboard user can type directly.

**Reference** — `082-codex-macos-sidebar-nav-toggle-tooltip-projects-chats.png`, `083-codex-macos-sidebar-nav-projects-recent-chats.png`: recent-chat rows are first-class focusable list items with a visible selected/focused treatment.

**Fix** — Build the row as `el('button', { class: 'sp-drawer-history-item', type: 'button' })` so the existing global `button:focus-visible` supplies the ring, and add `width: 100%; text-align: left; font: inherit;` to `.sp-drawer-history-item` (and `.sp-tool-item`). Because the delete button is nested, **flatten the row**: put the label button and the delete button side by side in a wrapper rather than nesting.

---

**CHR-9 · MEDIUM · No `prefers-reduced-motion` handling anywhere — five infinite animations plus smooth scroll always run**

**Where** — `apps/extension/src/side_panel.ts:919`

```css
scroll-behavior: smooth;
```

**Symptom** — `grep -rn "prefers-reduced-motion" apps/extension/` (minus node_modules/dist) returns **zero** hits. Users with "Reduce motion" enabled still get, in a narrow always-on side panel pinned beside their page, for the full duration of every response:

- streaming caret blinking forever — `.sp-cursor::after { animation: sp-blink 0.7s steps(1) infinite; }` (1169), toggled on the streaming bubble at 3679-3683
- three thinking dots bouncing — `.sp-dot { animation: sp-bounce 1.2s infinite; }` (1411), three nodes appended at 3662-3664
- every running tool icon spinning — `sp-spin 0.8s linear infinite` at 1252 and 1307, produced dynamically at `features/side-panel/bubbles.ts:199` and `:436`
- mic and record dots pulsing — `sp-pulse 1s infinite` (1454, `features/side-panel/voice.ts:50`), `sp-record-pulse 1.5s infinite` (2330)
- smooth-scroll animation on **every streamed token** — `scrollToBottom()` (3503-3506) is invoked at 3652, 3667, 3683 and 5372, so the scroll container animates per chunk

**Fix** — Append one block to the end of `cssText` (before the closing backtick at 3483). This covers `COMPUTER_USE_PANEL_CSS` too, because it is concatenated into the same sheet at 3491 (`sheet.replaceSync(cssText + '\n' + COMPUTER_USE_PANEL_CSS)`), and also covers the fallback branch at 3496-3499:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  #sp-messages {
    scroll-behavior: auto;
  }
  .sp-cursor::after {
    animation: none;
    opacity: 1;
  }
}
```

A **separate** copy is required in `features/cloud-bridge/InviteCodeModal.ts` `buildModalStyles()` — that CSS is scoped to a shadow root via `:host` with its own `animation: agi-spin 0.7s linear infinite` (line 194) and `@keyframes agi-spin` (197); a `*` rule in the document sheet does not cross the shadow boundary.

---

**CHR-10 · MEDIUM · Header quota badge is a `<div>` with a click handler — mouse-only, and the drawer it opens cannot be closed with Escape**

**Where** — `apps/extension/src/side_panel.ts:6534`

```js
const quotaBadgeEl = el('div', {
  id: 'sp-quota-badge',
  title: 'AGI Cloud plan',
  style: 'cursor:pointer',
});
```

**Symptom** — The free-prompts / Upgrade badge sits in `#sp-header-right` between New chat (5255-5266) and ⋮ (5282-5290). It renders visibly for real states: "Upgrade" at 6729-6732 for any signed-in sub-Pro user, "Billing" at 6683-6685, tier name at 6709-6711. It is a `<div>` with an inline `cursor:pointer` and a click handler (6539-6546) but **no `role`, no `tabindex`, no keyboard handler**, and `#sp-quota-badge` (3216-3239) has no `:focus-visible` rule — the global ring at 757-758 matches `button` / `[role="button"]`, neither of which this is.

**The stranded-focus mechanism in the original report is wrong, and the real symptom is worse.** A div with no tabindex does **not** take focus on click in Chrome — focus stays on `<body>`. The drawer's Escape handler is bound to the drawer element itself (`drawer.addEventListener('keydown', …)` at 5459-5464), so with focus never inside the drawer, **a drawer opened via the badge cannot be closed with Escape** (only by clicking ✕ or the overlay), and Tab continues through the still-tabbable background behind an `aria-modal="true"` dialog with no focus trap.

The stale-`drawerReturnFocus` point is correct but secondary (the handler bypasses `openDrawer()` and toggles classes directly at 6541-6545, so `closeDrawer()` returns focus to the ⋮ button at 5430).

**The upgrade path is not unreachable** — the ⋮ `menuBtn` (5282-5290) is a real `<button>` with `aria-label="Open AGI menu"` and calls `openDrawer(menuBtn)`, opening the same drawer and the same cloud/upgrade section. The badge is a redundant shortcut, which caps this at medium.

**Additional confirmed defect in the same CSS rule**: `font-size: 10px; padding: 2px 7px` (3220-3223) gives roughly a **17px-tall** hit target, well under the ~32px minimum.

**Fix** — `el('button', { id: 'sp-quota-badge', type: 'button', title: 'AGI Cloud plan' })`, drop the inline style (the button rule already sets `cursor: pointer`), replace the hand-rolled class toggling with `openDrawer(quotaBadgeEl)`, and add min-height/padding for the hit target. That single change resolves the focus ring, keyboard activation, AT exposure, Escape-to-close and focus return together.

---

**CHR-11 · MEDIUM · Browser-action consent card asks the user to approve a raw function-call signature**

**Where** — `apps/extension/src/background.ts:3960`

```js
description: `${toolName}(${Object.entries(args)
                .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
                .join(', ')})`,
```

**Symptom** — Side panel → Computer Use with "Ask before acting" on. That is the **default**, not an edge case: `background.ts:3919` treats an unset pref as ask. The string reaches the UI completely unformatted — `side_panel.ts:7618-7620` passes it through, and `features/side-panel/computerUsePanel.ts:987` does `cardDesc.textContent = description;` with the title at :983 being `Approve action: ${toolName}`. So the card reads `Approve action: navigate` over `navigate(url="https://boards.greenhouse.io/…?gh_src=…")` — a stringified JS call with escaped quotes, in the one dialog where comprehension matters most.

**The decisive evidence: the humanizing formatter already exists in the very same file.** `formatToolCallTitle(toolName, args)` at computerUsePanel.ts:911-932 returns `Click: <selector>`, `Type: "<text>"`, `Navigate to: <url>`, `Scroll to: …`, `Read page DOM`, `Find: "…"`, and `formatArgs()` at :934 renders `key: value` on separate lines. Those are used for the step log rows (:830, :832) — **directly below the approval card in the same scroll container**. During one run the user sees friendly phrasing for actions already taken and a raw JS signature for the action being approved.

**Second, purely visual break in the same card**: `.sp-cu-approval-desc` (356-360) is only colour / `font-size: 11px` / `margin-bottom: 8px` — no `word-break`, no `overflow-wrap`. Its sibling `.sp-cu-step-detail` (251-259) has `white-space: pre-wrap; word-break: break-word`. A `navigate` URL is a single unbreakable token; in a 320px panel it overflows the warning card, and because `#sp-cu-log` (198-202) sets `overflow-y: auto` with overflow-x left visible (computing to `auto`), the **entire action log becomes horizontally scrollable** and every step row shifts.

Allow/Skip (992-998) stay functional and `Approve action: navigate` still conveys the verb, so this is medium rather than high.

**Reference** — `009-codex-vscode-ext-permission-confirm-modal-turn-on-full-access-warning.png`: Codex enumerates the grant in plain language with per-category rows ("Files and folders — Read, create, modify, upload, or delete files anywhere on this computer") plus a risk sentence, never a call signature.

**Fix** — This is a **plumbing gap, not a missing formatter**. Do not write a new `describeAction()`; that duplicates `formatToolCallTitle`. `background.ts` sends only `toolName` + a pre-stringified `description`, so the panel never receives `args`. Add `args` to the `AGI_CU_APPROVE_REQUEST` payload (background.ts:3956-3963), widen the parse at side_panel.ts:7616-7620, change `showApprovalCard(toolName, description, resolve)` to accept args, and set the title from `formatToolCallTitle(toolName, args)` and the detail from `formatArgs(args)`. Also add `word-break: break-word` to `.sp-cu-approval-desc` at :356. Note there is **no existing click-to-expand on the approval card** to hide the raw signature behind (`showApprovalCard` at 973-1017 builds a plain div with no handler) — that would have to be built.

---

**CHR-12 · MEDIUM · Computer Use tool results and errors are clipped at 60px with no expand affordance**

**Where** — `apps/extension/src/features/side-panel/computerUsePanel.ts:251`

```css
.sp-cu-step-detail {
  font-size: 11px;
  color: var(--agi-ext-text-muted);
  margin-top: 2px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60px;
  overflow: hidden;
}

.sp-cu-step-detail.expanded {
  max-height: none;
}
```

**Symptom** — During a browser-automation run, any step over ~4.5 lines is cut with no ellipsis, no fade and no control. The detail block sets no `line-height` (the 1.45 at line 65 belongs to `.sp-cu-banner-text`), so it inherits `normal` (~1.2) → ~13.2px lines. Because 60 is not an integer multiple, **the 5th line is cut horizontally through the middle of the glyphs**, leaving a strip of half-rendered letters flush against the bottom edge — which is itself the only (accidental) hint that content continues.

Only the `tool_call` branch attaches the expander (`detailEl.title = 'Click to expand'` + toggle, 833-837). The two broken branches:

- `tool_result` (845): `detailEl.textContent = step.toolResult.slice(0, 300)` — clipped **and** pre-truncated in JS
- `error` (852): `detailEl.textContent = step.errorMessage ?? ''` — arbitrary-length thrown-error text from `features/computer-use/agentLoop.ts:706-712` (`errorMessage: \`Tool error: ${err.message}\``)

`case 'final'` is **exempt** — line 861 calls `detailEl.classList.add('expanded')`, so completion messages render in full (separately capped at 400 chars). `screenshot` sets no detail.

In a 320px side panel the detail column is ~270px, so ~45 chars/line at 11px: any tool error past ~200 characters loses its tail with zero indication. The panel auto-focuses itself (`side_panel.ts:7590-7594` calls `appendStep` then `switchTab('computer-use')`), so the user is looking straight at it. There is no copy/export control in the panel.

**Reference** — `080-codex-macos-right-panel-shortcuts-review-terminal-browser-files.png`, `081-codex-macos-terminal-panel-shell-prompt.png`: Codex's tool/terminal output blocks are scrollable with an explicit expand control; output is never clipped without an indicator.

**Fix** — The expand mechanism already exists (`.expanded` at 261-263); only the wiring is missing. Move the `title`/`cursor`/`click` block out of `case 'tool_call'` and apply it to `tool_result` and `error` too (those two branches only — `final` is already expanded). Add a bottom fade so truncation is visible: `.sp-cu-step-detail:not(.expanded)::after` gradient plus a "Show more" line, set from a `scrollHeight > clientHeight` check. **Also raise or remove the `slice(0, 300)` at line 845**, or expanding a tool result still silently drops everything past 300 chars.

---

**CHR-13 · HIGH · Approval card never expires — after the 30s fail-closed deny its Allow/Skip buttons are dead, and cards stack**

**Where** — `apps/extension/src/background.ts:3990`

```js
const timeout = setTimeout(() => {
  finish(false); // fail-CLOSED: deny if no approval arrives in time
}, 30_000);
```

**Symptom** — `cleanup()` (3967-3971) calls `chrome.runtime.onMessage.removeListener(listener)`, so after 30s nobody is listening for that `requestId`. On the panel side, `showApprovalCard` (`features/side-panel/computerUsePanel.ts:973-1017`) has no timer, no requestId and no external handle: the card is removed only inside `cleanup(allowed)` (1000-1003), wired solely to the two click handlers (1005-1006). Not even Stop clears it — `clearLog()` is reachable only from the Clear button (698-701).

Ask-before-acting is **on by default** (`askCheckbox.checked = true` at :599; :609 defaults true unless storage explicitly says false), so every action raises a card and the 30s window is hit routinely.

**Three things the original report missed, all of which make it worse:**

1. **Two racing 30s timers.** `agentLoop.ts:622` (`const APPROVAL_TIMEOUT_MS = 30_000`) and `:648` wrap the `onBeforeAction` callback with an identical fail-closed deadline. A fix that only broadcasts from `background.ts` still leaves zombie cards when agentLoop's timer wins.

2. **Cards stack, and this is the reliably reproducible broken screen.** `computerUsePanel.ts:1015-1016` does `logEl.insertBefore(card, logEl.firstChild); logEl.scrollTop = 0;` — each new approval card is inserted **above** the previous one and the log scrolls to the top to show it. Miss one deadline and the user is scrolled straight to two visually identical warning-yellow "Approve action: …" cards with live Allow/Skip buttons, one live and one dead, with nothing distinguishing them. Miss two and there are three.

3. **The feedback that exists is actively misleading.** `agentLoop.ts:666-673` _does_ emit a `tool_result` step with "Action skipped — no approval received (timeout or user denied)." But `computerUsePanel.ts:843` renders every `tool_result` as ``titleEl.textContent = `✓ ${step.toolName ?? 'result'}` `` — **a green success checkmark**, with the skip text demoted into the muted detail line. A denied, skipped action reads as if it succeeded.

**Reference** — `009-codex-vscode-ext-permission-confirm-modal-turn-on-full-access-warning.png` keeps the confirm modal blocking and explicit; there is no state where Confirm is present but inert.

**Fix** — Broadcast an `AGI_CU_APPROVE_EXPIRED` with the `requestId` from **whichever** timer fires (both background.ts:3990 and agentLoop.ts:648). In `showApprovalCard` keep a `Map<requestId, HTMLElement>`; on expiry replace `btns` with a static muted line ("Not approved in time — action skipped") and drop the warning styling. Add a visible 30s countdown so the deadline is not invisible. Clear outstanding cards in `requestCancellation` (676-693) so Stop does not leave live-looking buttons. Separately, branch the `tool_result` rendering (or emit a distinct `kind`) so a skip is not drawn with the success checkmark.

---

**CHR-14 · MEDIUM · Options page toggle is a ghost in light mode — white knob on `#f0f0f0` on `#ffffff`**

**Where** — `apps/extension/src/options.ts:132`

```css
    .opt-toggle::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: white;
```

**Symptom** — `options.ts:27` injects `getExtensionTokensCssAuto()`, and `tokens.ts:24-34` emits the light set under `@media (prefers-color-scheme: light)` — so light mode **is** reachable here (unlike the in-page panel). The OFF track is `background: var(--agi-ext-hover)` with `border: none` and no box-shadow (110-122), resolving to `#f0f0f0`; the `.opt-section` card is `--agi-ext-surface` = `#ffffff` (index.ts:87-90). Knob-vs-track = **1.14:1**; track-vs-card = **1.14:1**. Both far under the 3:1 WCAG 1.4.11 floor for non-text UI components.

`options.css` is a 15-line reset and `options.html` loads nothing else, so there is no escape hatch. The page ships (`manifest.json:79 "options_page": "src/options.html"`, `vite.config.ts:77`), and the toggle is a real `<input type="checkbox" class="opt-toggle">` in the Permissions section (499-516).

**Symptom scoped correctly:** `:checked` swaps the track to `--agi-ext-accent` `#0b84ff` (124), unmistakable against white with a white-on-blue knob. So on/off **is** distinguishable by colour — the original report's "cannot tell whether it is on or off" overstates it. The accurate symptom: with **Task notifications turned OFF in light mode**, the right side of the row looks empty, the knob gives no position cue, and re-enabling means clicking a target you cannot see. The default persisted state is ON (`options.ts:506` `chrome.storage.local.get({ agi_task_notifications: true })`), so the common first render is the visible blue toggle and the defect surfaces only after the user deliberately switches it off.

_(Also: "the only control in the Permissions section" is inaccurate — the same card holds the allowlist Add and per-origin Remove buttons at 549-556 and 573+, which render fine.)_

**Reference** — `055-chatgpt-ios-settings-data-controls-model-training-location-services.png`: the OFF "Include audio recordings" toggle uses a clearly mid-grey track against the white card plus a white knob with a drop shadow.

**Fix** —

```css
.opt-toggle {
  background: var(--agi-ext-hover);
  border: 1px solid var(--agi-ext-border-strong);
  box-sizing: border-box;
}
.opt-toggle::after {
  background: var(--agi-ext-surface);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}
```

`box-sizing` matters — the existing `height: 20px` is a content box, so the added border would otherwise grow the pill. Replace the literal `white` with the token so dark mode (`--agi-ext-surface` = `#2f2f2f`) stays correct, and verify `translateX(16px)` (138) still lands the knob inside the pill.

---

**CHR-15 · MEDIUM · "Add" — the options page's site-permission control — is permanently dead for single-window users**

**Where** — `apps/extension/src/options.ts:609`

```js
  chrome.tabs.query({ active: true }, (tabs) => {
    const siteTab = tabs.find((t) => {
      if (!t.url) return false;
      try {
        const proto = new URL(t.url).protocol;
        return proto === 'http:' || proto === 'https:';
```

**Symptom** — `options_page` always opens in a new tab of the current window and becomes that window's active tab. With one browser window, `chrome.tabs.query({active: true})` (unscoped, so it returns the active tab of _every_ window) returns just the `chrome-extension://` options tab, which the protocol filter drops. `currentOriginLabel` stays at its literal `'—'` seed (544-548) and `addBtn.disabled = true` (554) forever.

**Unrecoverable within the page**: there is exactly one `chrome.tabs.query` in the file and no `tabs.onActivated`/`onUpdated` listener — the only code that re-enables the button is the callback at 619-622 and `refreshAllowlist()` (594-601), which is itself gated by `if (currentOrigin && currentOrigin !== '—')`. Opening a site in another tab afterwards does not fix it. The user sees a greyed "Add" (`.opt-allowlist-toggle-btn:disabled { opacity: 0.4; cursor: not-allowed; }`, 186-189) next to an em-dash, directly under help text at 539 telling them to do the impossible: _"Add the current site, then reload it."_

`"tabs"` **is** in manifest permissions (9-21), so `t.url` is populated — this is purely the single-window case, not a permission artifact.

**The in-product entry path hits it too**, not just chrome://extensions: the side panel drawer's Settings button calls `chrome.runtime.openOptionsPage()` at `side_panel.ts:5776` (with a comment at 5765-5767 noting this was added because options was otherwise unreachable).

**The multi-window "working" case is itself buggy**, unreported: because the query is not window-scoped, with 2+ windows `tabs.find(...)` returns the active tab of an arbitrary _other_ window — not "the page the user came from" as the comment at 604-608 promises. Pressing Add then writes that wrong origin to `agi_site_allowlist` (626-638), silently granting automation to an unintended site.

**Medium, not high**, because a fully working duplicate exists: `side_panel.ts:5930-6075` implements the same allowlist correctly — `drawerCurrentTabOrigin()` uses `chrome.tabs.query({ active: true, currentWindow: true }, ...)` (6004), and `refreshDrawerAllowlist()` (6049-6055) even renders the empty state this page lacks: `allowlistOriginLabel.textContent = origin ?? 'No site to add on this page';` with the comment "Distinguish 'no tab' from 'this tab can never be automated'". Both write the same storage key. That makes this a **CONSISTENCY** finding too: two implementations of one control, one with a real state message and one with a bare `—`.

**Reference** — `032-codex-macos-settings-connections-control-this-mac-allow-toggle.png`: when there is nothing to list, Codex shows an illustrated empty state, the sentence "Add device to control this Mac remotely", and a live Add button — never a disabled control next to a placeholder dash.

**Fix** — Reuse the side panel's already-correct pattern rather than the report's cross-window `lastAccessed` sort (which re-introduces the wrong-origin bug in subtler form): query `{ active: true, lastFocusedWindow: true }` excluding the options tab itself, and when that yields nothing render the drawer's "No site to add on this page" copy **plus** a typed-origin input — the genuinely new part, and worth adding since options is often opened with no site in view.

---

**CHR-16 · MEDIUM · Approval-card text has no word-break, unlike the identical content one class away**

**Where** — `apps/extension/src/features/side-panel/computerUsePanel.ts:356`

```css
.sp-cu-approval-desc {
  color: var(--agi-ext-text-muted);
  font-size: 11px;
  margin-bottom: 8px;
}
```

**Symptom** — The sibling `.sp-cu-step-detail` (251-259) that renders the _same_ formatted args has `white-space: pre-wrap; word-break: break-word; max-height: 60px; overflow: hidden`. This one has none. The description comes from `background.ts:3960-3962` **with no truncation whatsoever**, and a `navigate(url="https://…")` value is one unbreakable token; at 11px only ~50 characters fit across a 320px panel while real URLs run 80-200.

`#sp-cu-log` (198-202) is `flex: 1; overflow-y: auto`, so overflow-x computes to `auto`.

**The mechanism in the original report is wrong.** `.sp-cu-approval` (341-348) is a **block-level** div and `#sp-cu-log` declares no `display: flex` (its `flex: 1` makes it a flex _item_ of the column-flex `#sp-cu-panel`). A block box cannot grow beyond its containing block, so the card stays at panel width and `.sp-cu-approval-btns` stays put and clickable. What the user actually sees: the description text **spills out of the card's warning-tinted rounded border** onto the bare panel background, is cut at the panel's right edge, and the log grows a horizontal scrollbar.

This is the **default** path — `askCheckbox.checked = true` (:599) and :609 treats anything other than explicit false as enabled — so a security consent gate whose text the user cannot read without horizontal scrolling.

*(Note: "data URIs" is inaccurate — screenshot base64 travels as a tool **result** (agentLoop.ts:479-480, :551-552), never as an approval arg. And `.join(', ')` gives break opportunities *between* args, so multi-arg descriptions wrap fine; the overflow is specifically a single long unbreakable value.)*

**Fix** — Only the wrap belongs here. **Do not** copy `max-height: 88px; overflow-y: auto` from the step detail — this is a human approval gate, and clipping the description into an inner scroller hides the very action being consented to.

```css
.sp-cu-approval-desc {
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}
```

`overflow-x: hidden` on `#sp-cu-log` is a reasonable backstop (screenshot thumbnails are already `max-width: 100%`). Separately, bound each value at the source (`background.ts:3960`) the way `formatArgs` does.

---

**CHR-17 · MEDIUM · Long error text in the Computer Use handoff banner is clipped and unrecoverable**

**Where** — `apps/extension/src/features/side-panel/computerUsePanel.ts:63`

```css
.sp-cu-banner-text {
  flex: 1;
  line-height: 1.45;
}
```

**Symptom** — Reproduced in a browser with the exact CSS/DOM. `.sp-cu-banner-text` is a flex child with default `min-width: auto`, so an unbreakable token forces it wider than the banner; `#sp-cu-panel` is `overflow: hidden` (33), so the tail is clipped with **no scrollbar**. Measured with a realistic spaceless gateway error body:

```
320px panel → text expands to 876px, 585px clipped
400px panel → 505px clipped
500px panel → 405px clipped
```

Roughly two-thirds of the message is invisible and unreachable. Applying `min-width: 0; overflow-wrap: anywhere` reduced it to 277/357/457px with **zero clipping at all three widths**.

**The trigger in the original report is the weakest path.** The cited `side_panel.ts:7658` (`Autofill failed: ${msg}`) carries a `chrome.tabs.sendMessage` rejection — Chrome-generated prose, never a URL, and it wraps fine. The real trigger is the **escalate** path: `background.ts:4054-4064` forwards any `runAgentLoop` rejection verbatim as `AGI_CU_ESCALATE.reason`, `side_panel.ts:7609-7610` passes it straight to `cuPanel.showHandoffBanner(reason)` **and force-switches the user to the Computer Use tab**, and `computerUsePanel.ts:955` sets `bannerSub.textContent = reason`. The worst upstream source is `cloudAgentClient.ts:384`: ``throw new Error(`callCloud: gateway returned ${response.status}: ${errText.slice(0, 300)}`)`` — a raw, up-to-300-char gateway body. A minified JSON body is what produces the 405-585px clip. (A short quoted origin, e.g. `background.ts:3868-3871`'s allowlist error, does **not** overflow — Chrome finds break opportunities in ordinary hostnames.)

Also: the message lands in `.sp-cu-banner-sub` (74-77), a _child_ of `.sp-cu-banner-text`, which also has no `word-break`. This matters for the fix — `min-width: 0` alone is insufficient; the fix works only because `overflow-wrap` is inherited.

_(The "sibling two rules away" is at 237-240, `.sp-cu-step-body { flex: 1; min-width: 0; }` — about seven rules away. Lines 246-249 are `.sp-cu-step-title`'s nowrap/ellipsis.)_

**Fix** —

```css
.sp-cu-banner-text {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  line-height: 1.45;
}
```

---

**CHR-18 · MEDIUM · Raw Chrome IPC internals shown to the user as the failure message**

**Where** — `apps/extension/src/side_panel.ts:7657`

```js
const msg = err instanceof Error ? err.message : String(err);
cuPanel.showHandoffBanner(`Autofill failed: ${msg}`, 'error');
```

**Symptom** — `computerUsePanel.ts:955` does `bannerSub.textContent = reason;` with no mapping. Computer Use is the **default-selected tab** (`side_panel.ts:6911-6919` builds `cuTabBtn` with `class: 'sp-tab sp-tab-active'` and `'aria-selected': 'true'`), so Run Autofill is the first button a user encounters — this is a first-run path, not a buried one.

On a tab whose content script is not present, the banner reads verbatim: **"Autofill could not run / Autofill failed: Could not establish connection. Receiving end does not exist."** Raw Chrome IPC jargon naming no cause and no fix, even though the fix ("reload the page") is known.

Common in practice: `manifest.json` declares the content script for `http://*/*` and `https://*/*` at `document_idle`, and Chrome does not retro-inject into tabs already open at install/update/reload, nor into `chrome://`, `chrome-extension://`, the Web Store, the PDF viewer, or `file://`. The side panel persists across tab switches, so landing on such a tab is easy.

**Correction to the cause list:** "not yet reloaded after allowlisting" is **not** a cause. The Options allowlist (`options.ts:533`) feeds `siteAllowlistCache`, which gates only the background CDP agent loop (`background.ts:3867`), not content-script presence — content scripts inject unconditionally per manifest.

**Scope understated** — three sibling paths leak raw strings identically: `side_panel.ts:7664` (raw `resp.error`), `:7711-7716` (raw `error.message`), `:7728-7731` (raw `startResponse?.error`).

The codebase already has the right pattern: `friendlyInviteError()` at `features/cloud-bridge/InviteCodeModal.ts:16-35`.

**Reference** — `128-chatgpt-web-settings-plugins-permissions-and-apps-top.png`, `154-claude-desktop-settings-claude-in-chrome-permissions.png`: failures are one human sentence with the recovery action; transport-layer strings never surface.

**Fix** — A shared mapper covering all four sites: if `/Receiving end does not exist|Could not establish connection/` → "AGI isn't running on this page yet. Reload the tab, then try again." If `/Cannot access|extension manifest/` → name the pages Chrome blocks (`chrome://`, `chrome-extension://`, the Web Store, the PDF viewer, `file://` without file access) and suggest a regular web page — **not** "Add the site under Options > Approved sites", which has no effect on this failure. Fall back to a generic sentence and log the raw message to console only. Also drop the `Autofill failed: ` prefix, which duplicates the banner headline already set at `computerUsePanel.ts:483-486`.

---

**CHR-19 · LOW · Autofill Profile's two-column grid silently clips its right-hand column (no scrollbar — content is hidden, not scrollable)**

**Where** — `apps/extension/src/options.ts:301`, with the clipping from `:66-71` and the missing width at `:324-336`

```css
.opt-profile-grid {
  padding: 14px 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
}
```

**Symptom** — `grep -n "@media" options.ts` returns **zero** hits. `1fr` resolves to `minmax(auto, 1fr)`, so each track's floor is the item's min-content size, and `.opt-field input, .opt-field textarea, .opt-field select` (324-336) sets no `width` and no `min-width`. Measured intrinsic input width: **143px** standalone, ~149px as a grid item. Grid floor = 149×2 + 16 gap + 32 padding = **346px**.

`.opt-section { …; overflow: hidden; }` (66-71) wraps the grid, so overflow is **clipped at the card edge**. Measured `document.documentElement.scrollWidth === window.innerWidth` at both 380px and 330px: `hasHorizontalPageScroll: false`. There is no scrollbar and **no way to reach the hidden pixels** — arguably worse than the horizontal-scroll symptom the original report described, but not that symptom.

Clipping begins at viewport ≈ **386px** (not ~450px). At 330px the right column loses 58px: labels truncate mid-word ("Years of experienc", "Work authorizatio", "State / Provinc") and the right-column inputs have their right border sliced off by the card's rounded corner.

Low severity: Chrome's own minimum window width is ~400px, so reaching <386px effectively requires page zoom (150% in a ~580px window, 200% in a ~770px window). Inputs remain clickable and typable (text scrolls inside them), so nothing is unusable.

**Fix** — `width: 100%; min-width: 0` alone fixes the clipping at every width and is the higher-value half; the media query is polish so fields do not become uselessly narrow. `box-sizing: border-box` is already global (`options.css`), so no padding compensation is needed.

```css
.opt-field input,
.opt-field textarea,
.opt-field select {
  width: 100%;
  min-width: 0;
}
@media (max-width: 420px) {
  .opt-profile-grid {
    grid-template-columns: 1fr;
  }
  .opt-page {
    padding: 24px 14px 40px;
  }
}
```

---

**CHR-20 · MEDIUM · Options page flashes "Sign in" at already-signed-in users; there is no loading state**

**Where** — `apps/extension/src/features/options/account-state.ts:18`

```js
  render({ signedIn: false, unavailable: false });
  return getToken().then(
    (token) => render({ signedIn: Boolean(token), unavailable: false }),
```

**Symptom** — The signed-out row is rendered **synchronously**, before `getToken()` is even called, and in the same task as `document.body.appendChild(page)` (`options.ts:955-960`) — so the **first paint** of the Options page always contains the signed-out row. `OptionsAccountState` has exactly two booleans (1-4), there is no third state, `renderAccountRow` has no loading branch, and nothing hides `.opt-row` until the promise settles.

The row is actionable, not a neutral placeholder: `options.ts:650-688` builds label "Sign in", hint "Use your AGI account for Managed Cloud chat and models." and an **enabled** `.opt-btn-primary` whose handler runs `openClerkSignIn()` → `chrome.tabs.create({url: WEB_SIGN_IN_URL})`. A user who clicks during the flash opens a pointless auth tab for an account they are already in.

**The delay is guaranteed to cross a paint.** `getToken` is **not** a direct Clerk round-trip as the original report stated — it is `getAuthToken` (`freeTrialClient.ts:235-237`) → `getFreshClerkAuthContext` (`clerkAuth.ts:166-170`), which for a non-service-worker page takes `return requestBackgroundAuthContext(forceRefresh)` → `chrome.runtime.sendMessage({ type: 'GET_CLOUD_AUTH_TOKEN' })` handled at `background.ts:2857`. That is an **MV3 service-worker wake** (often a cold start of a ~2,900-line bundle plus Clerk init plus a Clerk FAPI round-trip) — hundreds of ms normally, seconds on a slow network. This makes the finding stronger, not weaker.

**Offline is handled** — the reject branch (21-24) renders a distinct, correct row: "Account status is temporarily unavailable. Browser-local settings remain available." (`options.ts:663-665`). The defect is purely the interim window.

**Production-only misclick risk**: when Clerk is not configured the button reads "Unavailable" and is `disabled` (673-676).

**Reference** — `140-claude-desktop-settings-account-org-id-trusted-devices.png`: the account pane never shows a signed-out CTA to a signed-in user; unresolved fields render as placeholders.

**Fix** — Add a `loading` variant to `OptionsAccountState` and render a muted, button-less "Checking your account…" row until `getToken()` settles. This is compatible with the file's docstring ("None of those conditions may hide browser-local permissions, allowlists, shortcuts, or autofill settings behind a blank page") — that only requires the _rest_ of the page to render immediately, not that `signedIn: false` be asserted. The fix must also touch `options.ts:650` `renderAccountRow(signedIn: boolean, unavailable = false)`, whose two-boolean signature cannot express a third state, and `options.ts:714`, which calls `renderAccountRow(false)` after logout and must keep rendering the real signed-out row.

---

**CHR-21 · MEDIUM · Options sign-in button dead-ends on "Sign-in opened" and can never be used again**

**Where** — `apps/extension/src/options.ts:676-686` (the defect is line **678**)

```js
try {
  await openClerkSignIn();
  signInBtn.textContent = 'Sign-in opened';
} catch {
  signInBtn.textContent = 'Try again';
  signInBtn.disabled = false;
}
```

**Symptom** — `signInBtn.disabled = true` at line **678** (one line above the quoted region) is what strands the control; the success path never re-enables it. There is no recovery mechanism anywhere on the page: grepping all 963 lines for `chrome.storage.onChanged`, `visibilitychange`, focus listeners and polling returns **none**. The sole account refresh is a one-shot at page build (955-960) calling `beginOptionsAccountRefresh`, which (`features/options/account-state.ts:13-26`) resolves a single promise and returns without subscribing.

**Worse than the report described**: `openClerkSignIn` (`features/cloud-bridge/clerkAuth.ts:229-232`) is just `assertClerkExtensionAuthConfigured(); await chrome.tabs.create({ url: WEB_SIGN_IN_URL });` — it resolves **as soon as the tab is created**, before the user types anything. So "Sign-in opened" + disabled is reached instantly on every click, and **no path** (success, abandonment, or completion) returns the button to usable. Only a full page reload recovers. The error path is no better: a bare "Try again" with no reason.

Our own side panel solves this correctly at `side_panel.ts:6388-6409`: `signInAwaitingCompletion`, a "Check sign-in" relabel, the sentence "Finish sign-in in the new tab, then return here and click Check sign-in.", and a `finally` that always calls `removeAttribute('disabled')`.

**Reference** — `142-chatgpt-web-settings-security-login-codex-cli-connection-device-code-auth.png`: the pending-auth state keeps an actionable control and explains the next step rather than freezing the button.

**Fix** — Better than the side-panel pattern: `observeClerkAuth(onChange)` already exists at `clerkAuth.ts:280-283` and is **not** imported by options.ts (which imports only `isClerkExtensionAuthConfigured` and `openClerkSignIn` at line 14). Subscribing to it flips the row to "Log out" automatically on completion. Re-running `beginOptionsAccountRefresh` as the original fix suggested would first render `{signedIn:false}` (account-state.ts:18), flashing the signed-out row — the CHR-20 bug again. Regardless of approach, the **minimum** fix is to wrap the handler body in try/catch/finally and restore `signInBtn.disabled = false` in the `finally`, matching side_panel.ts:6405-6408. Put the failure reason in the `.opt-row-hint` instead of overwriting the button label.

---

### Desktop — Electron cloud shell

_Note on reachability: `electron/config.ts:22-23` defaults `RENDERER_MODE` to `'remote'`, so the shipped default loads `https://agiworkforce.com/chat` — most of what an Electron user sees belongs to the web lane. DEL-1 applies only to the documented `AGI_CLOUD_RENDERER=bundled` escape hatch._

**DEL-1 · MEDIUM · macOS traffic lights land on the sidebar brand mark — collapsed, the expand toggle is unclickable**

**Where** — `apps/desktop/electron/main.ts:359` and `apps/desktop/src/features/v3/Sidebar.tsx:439`

```ts
    ...(process.platform === 'darwin' && !isRemote
      ? { titleBarStyle: 'hiddenInset' as const }
      : {}),
```

```tsx
      {/* Window chrome */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '12px 12px 8px',
          flexShrink: 0,
        }}
      >
```

**Symptom** — With `AGI_CLOUD_RENDERER=bundled` on macOS, `hiddenInset` floats the close/minimise/zoom buttons over the top-left of the web content at roughly x=13-75, y=12-32. Our first painted element is the sidebar's header row starting at exactly x=12, y=12 (`App.tsx:1854 <main>` → `:1884 <DesktopShellV3>` → `DesktopShellV3.tsx:624 <Sidebar>`; App.tsx has no isElectron branch).

Collapsed, the rail is 64px with 12px side padding = 40px of content box for a 20px AgiMark + 6px gap + 23px button = **49px required** — so the header row already overflows its own rail and flex-shrinks. The `PanelLeftOpen` toggle ends up at roughly x=34-52, y=12-35, **under the yellow traffic light**. This is an OVERFLOW defect as well as an OVERLAP one.

Nothing reserves the inset: `grep -rn "app-region" apps/desktop/src` returns **zero** hits, and `src/features/layout/TitleBar.tsx` exists but is never rendered outside its own test.

**Two things make it unrecoverable.** `sidebarCollapsed` is persisted (`stores/ui.ts:986` in partialize, rehydrated at `:1024`), so a user who collapses the rail stays collapsed across restarts. And the keyboard route is dead: `constants/shortcuts.ts:196` declares `action: 'window.toggleSidebar'` (⌘⇧U, id `toggle-sidebar`), but that action string appears **nowhere else** in `apps/desktop/src` — no handler dispatches it.

The "window cannot be dragged at all" claim is unverified (`frame` is not false, and `hiddenInset` retains a normally-draggable native titlebar view) — but that cuts _against_ the app: if the band is draggable, drags anywhere in y 12-35 across the full window width are swallowed by window movement, a second independent reason the toggle is unclickable. Corroborating: `main.ts:228-230` reads `case 'startDragging':` / `// Dragging is CSS-driven in Electron (-webkit-app-region: drag).` / `return false;` — the bridge explicitly defers to CSS that exists nowhere.

**Reference** — `137-claude-desktop-home-launcher-cowork-mode-recents-list.png`: Claude reserves ~55px above the sidebar's first control row so the traffic lights never sit on a clickable element. Same in `083-codex-macos-sidebar-nav-projects-recent-chats.png`.

**Fix** — The correct minimal fix is the alternative: **delete the darwin/`!isRemote` spread at main.ts:359-361** so the bundled path matches remote and keeps a native title bar, since the renderer draws none of its own. If `hiddenInset` is kept, the shell needs `paddingTop: 'var(--titlebar-inset, 12px)'` on Sidebar.tsx's header row with `--titlebar-inset: 40px` set on `:root` when `window.agiHost.platform` starts with `electron-darwin`, plus `WebkitAppRegion: 'drag'` on that row and `no-drag` on the collapse button — and `main.ts:229`'s `startDragging` returning false must be fixed too.

---

**DEL-2 · MEDIUM · Launching with no network shows the raw Chromium "site can't be reached" page inside the app window**

**Where** — `apps/desktop/electron/main.ts:399`

```ts
if (isRemote) {
  void mainWindow.loadURL(`${CLOUD_APP_ORIGIN}/chat`);
} else {
  void mainWindow.loadURL(`${RENDERER_ORIGIN}/index.html`);
}
```

**Symptom** — Default (remote) mode loads `https://agiworkforce.com/chat` as the entire renderer. Start on a plane, on captive-portal wifi, or during an outage: `ready-to-show` (379) still fires for the error document, the window is shown, and the user sees Chromium's grey `ERR_INTERNET_DISCONNECTED` page — no AGI branding, no Retry, no explanation that this is a cloud-only shell. Combined with the default macOS title bar (remote mode skips `hiddenInset`), it reads as "a browser failed", not "our app is offline".

There is **no** handling: `grep -rn "did-fail-load|render-process-gone|unresponsive|crashed" apps/desktop/electron` returns zero matches (the only "offline" hit is a doc comment at main.ts:15). The only webContents listeners are `did-finish-load` (383, deep-link flush) and `will-navigate` (`windowPolicy.ts:78`).

Bundled mode loads `agi://cloud/index.html` from the local scheme (402) and is unaffected at launch.

**Not fully bricked**, which caps this at medium: `Menu.setApplicationMenu(null)` is never called, so View → Reload (⌘R) re-issues the load, and the tray offers a retry — `tray.ts:56` `{ label: 'New Chat', click: handlers.onNewChat }` routes to `openNewChat()` (421-426), which calls `void mainWindow?.loadURL(target)`.

**Reference** — `084-codex-macos-pull-requests-list-empty-error-state.png` is a branded in-app state, not a browser error page.

**Fix** —

```ts
mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
  if (isMainFrame && code !== -3) mainWindow.loadFile(offlinePath);
});
mainWindow.webContents.on('render-process-gone' /* … */);
```

carrying the app mark, the failure reason and a Retry that re-issues `loadURL(CLOUD_APP_ORIGIN + '/chat')`. **The offline page must ship under `electron/assets/`** — `build-main.mjs` only emits the esbuild bundles plus a `cpSync` of `electron/assets/`, so an `offline.html` at the electron root would never reach `dist/` and the `loadFile` would itself fail. Guard against re-entering the handler when the offline page's own Retry fails. Apply to the quick-ask window too (`quickAsk.ts` shares `applyRemoteWindowPolicy` and has the same zero-error-handling exposure); note `render-process-gone` is a distinct symptom (blank window mid-session).

---

**DEL-3 · MEDIUM · Quick Ask is a frameless, immovable panel with no close button and no Escape — and it can pin the login page for the whole session**

**Where** — `apps/desktop/electron/quickAsk.ts:24`

```ts
const PANEL_WIDTH = 480;
const PANEL_HEIGHT = 620;
...
  const win = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    show: false,
    frame: false,
    resizable: false,
...
  void win.loadURL(`${CLOUD_APP_ORIGIN}/chat`);
```

**Symptom** — Press ⌥⇧Space (`garnishCore.ts:21`) or use the tray item (`tray.ts:59-65`). Two real defects:

**(1) No chrome, no move, no Escape.** `frame: false` with no drag region in the hosted page — grepping `-webkit-app-region` across `apps/web/`, `packages/ui/` and `apps/desktop/electron/` returns exactly **one** hit, a comment at `main.ts:229` inside a `startDragging` IPC case that returns false. The remote renderer gets no preload (`main.ts:366-372` passes only `partition`), so there is no bridge fallback. No `before-input-event` or Escape handler exists anywhere in `apps/desktop/electron/`. And even a hypothetical drag would be undone: `reposition()` (81) hard-sets bounds on every summon. _(Dismissal does work via blur (53-55), the hotkey, and the tray — the accurate statement is that the window offers no close or move affordance, and no Escape.)_

**(2) Signed-out state pins `/login` for the session — the stronger defect.** `apps/web/app/chat/layout.tsx:12-17` redirects to `/login` when `userId` is null. The panel is created **exactly once** and never reloaded: `warmUpQuickAsk` fires at `main.ts:481` (`QUICK_ASK_WARMUP_MS = 5000`, main.ts:64), `ensurePanel()` returns the cached window thereafter, and `loadURL` appears only inside `createPanel`. So on a first launch while signed out, the panel loads `/login` at T+5s and **keeps showing that login page for the entire session even after the user signs in in the main window**. OAuth cannot complete there either: `windowPolicy.ts:72-75` `setWindowOpenHandler` denies popups and hands the URL to the OS browser, which blurs the panel, which fires the hide handler.

`composerFocus.ts` already documents the failure ("`false` means the page had no composer to focus (signed out...)") but `toggleQuickAsk` shows the panel anyway.

**The "mobile layout" sub-claim is dropped.** At 480px the web app renders its _designed_ narrow path — off-canvas drawer with backdrop (`WebChatPage.tsx:2868-2882`) and a hamburger (`:2944-2955`), nothing clipped or overlapping. "Should be a compact ask box" is a product-shape preference, not a defect. (The breakpoint is `WebChatPage.tsx:430`, not 431.)

Medium: the main window is unaffected (`frame: true` in remote mode), Quick Ask is a secondary garnish, and the stale-login state clears on restart.

**Fix** — Highest value first: **on show, if the panel's URL is `/login` (or `focusPageComposer` returns false), hide the panel and raise the main window, and reload the panel after a successful sign-in** so it does not stay pinned to a stale document. Then add a 32px header strip with `-webkit-app-region: drag` and a close button (or keep `frame: true`), and register `win.webContents.on('before-input-event', …)` to hide on Escape.

---

**DEL-4 · MEDIUM · Conversation "⋯" menu opens above the top of the window, and detaches from its trigger on every upward flip**

**Where** — `apps/desktop/src/features/v3/ConversationRow.tsx:106`

```ts
const left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
const openUp = rect.bottom + MENU_EST_HEIGHT > window.innerHeight;
const top = openUp ? rect.top - MENU_EST_HEIGHT - 4 : rect.bottom + 4;
setMenuPos({ top, left });
```

**Symptom** — `left` is clamped to the viewport but `top` is not, and the portaled menu (264-282) is `position: fixed` with no `maxHeight` and no scroll. Portal target is `document.body`, so no transformed ancestor is involved and no global `[role=menu]` CSS supplies a scroll.

**Measured menu heights** (each `MenuItem` is `padding: '7px 9px'` + a 14px icon / 13px text ≈ 30px): no-projects menu = Pin+Rename+Archive+Delete ≈ **133px**; maximum menu (projects present, conversation already in one) = 3 items + separator + 20px header + the 132px project scroller + Remove + Delete ≈ **296px**. `MENU_EST_HEIGHT = 340` therefore **always over-estimates and is never exceeded** — the original report's claim that projects push past the estimate is backwards.

Two symptoms follow:

**(a) Clipping** (needs the 600px minimum window, `electron/main.ts:357`). In cloud mode with no projects, the sidebar stacks chrome 40 + new-chat 40 + search 36 + 4 nav rows 120 (`Sidebar.tsx:156-163`) + projects header ~30 + recents padding 8 + header 28 + group label 21, putting the first row's ellipsis trigger at rect.top ≈326, rect.bottom ≈348. `348 + 340 > 600` → flips up → `top = 326 − 344 = −18`. The 133px menu spans y −18 to 115, so **the Pin row (y −13 to 17) is cut in half** — its glyphs sliced and its click target shrunk to ~15px. Rename is fully visible.

**(b) Detachment — the more common break, needing no minimum window size.** Because the estimate overshoots the real height by 44-207px, **every** upward flip parks the menu that far above where it belongs. On a default 800px window, clicking ⋯ on a Recents row in the bottom third opens a 133px menu whose bottom edge sits ~211px above the button, floating over unrelated conversation rows — a menu visibly detached from its trigger and overlaying other content.

**Fix** — `const top = Math.max(8, openUp ? rect.top - MENU_EST_HEIGHT - 4 : rect.bottom + 4);` plus `maxHeight: 'calc(100vh - 16px)', overflowY: 'auto'` on the portaled div (:267) is a correct backstop for (a) but does **not** fix (b). The actual fix is to **measure `menuRef` in a layout effect after mount and position from the real height**, because the constant errs in the over-estimating direction.

---

**DEL-5 · MEDIUM · Sidebar nav rows never show which section you are in**

**Where** — `apps/desktop/src/features/v3/Sidebar.tsx:561`

```tsx
              <button
                key={item.id}
                data-nav-id={item.id}
                onClick={() => handleNavClick(item.id)}
                style={{
                  width: '100%',
                  ...
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--chat-text-secondary)',
```

**Symptom** — Click Library, Tasks, Scheduled or Customize. The panel changes but every nav row keeps identical transparent background and `--chat-text-secondary` — no selected state, no `aria-current`, and **no hover feedback either** (the rows carry no `className` at all, so they do not respond to pointer hover, which reads as "not clickable"). New chat two blocks above carries `transition-colors hover:bg-[var(--chat-surface-hover)]` (:490).

Nothing else styles these rows: the only `data-nav-id` references in the repo are the two render sites (:563 expanded, :821 collapsed rail) and three test files; there is no `[data-nav-id]` CSS selector anywhere in `apps/desktop/src`, `apps/desktop/electron`, or `packages/ui`. The collapsed rail is identical, where the icon is the only label. `DesktopShellV3.tsx:624` passes no active-panel prop at all, so the component _could not_ highlight the active row — even though the shell's own `handleNavigateView` (560-614) calls `setActivePanel('projects'|'library'|'tasks'|'artifacts'|'code'|'scheduled'|'cloud-schedules')`, so a real "you are here" state exists and is simply never reflected.

Not taste: the same file already proves the pattern matters — `ProjectRow` receives `active={p.id === activeProjectId}` (:658) and uses it (`ProjectRow.tsx:92`). Nav sections are the only sidebar rows with no selected state.

**The "no focus ring at all" claim is false and should be dropped.** There is no global outline reset — `grep -n "outline"` over `styles/globals.css` returns only lines 1217-1218, 1237-1238, 1242, all inside `@media (prefers-contrast: more)` / `(forced-colors: active)`; Tailwind v4's preflight contains no outline removal. Chromium's UA `:focus-visible` ring **does** render. The accurate symptom is CONSISTENCY: tabbing shows the custom teal `focus-visible:ring-2 ring-[var(--chat-accent-primary)]` on the collapse toggle (:468), New chat (:490) and Search (:519), then switches to the browser-default blue for the five nav rows and the collapsed rail, then back to teal on the footer.

Supporting: `globals.css:1241` already ships `:where([aria-current='page'], [aria-selected='true'], [data-state='active']) { outline: 2px solid Highlight; }` under `forced-colors` — the design system expects `aria-current` on nav rows, so Windows High Contrast users get no active indicator either.

**Reference** — `137-claude-desktop-home-launcher-cowork-mode-recents-list.png` fills the active destination ("Home" pill, "New" row); `083-codex-macos-sidebar-nav-projects-recent-chats.png` fills the active project row.

**Fix** — Pass `activePanel` from `DesktopShellV3` into `Sidebar`, and in the nav/rail buttons set `background: active ? 'var(--chat-surface-hover)' : 'transparent'`, `color: active ? 'var(--chat-text-primary)' : 'var(--chat-text-secondary)'`, plus `aria-current={active ? 'page' : undefined}`. Add the same `className="transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"` the New chat / Search / footer buttons already use.

---

**DEL-6 · MEDIUM · The browser-context review dialog claims `aria-modal` but only covers the content pane**

**Where** — `apps/desktop/src/features/context-handoff/SelectedContextReview.tsx:288`

```tsx
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="selected-context-review-title"
        className="w-full max-w-xl rounded-2xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] p-5 shadow-2xl"
      >
```

**Symptom** — Mounted at `DesktopShellV3.tsx:775`, inside `<div className="relative min-h-0 flex-1 overflow-hidden">` (:639), which is itself inside a flex column (:638) that is a **sibling** of `<Sidebar>` (:624, `width: collapsed ? 64 : 240`). So `absolute inset-0` dims only the chat column: the 240px sidebar is undimmed and fully clickable, and the user can switch conversations or start a new chat underneath a dialog that announces `aria-modal="true"`. The terminal dock (:815, `h-80`) is also an uncovered sibling. There is no Escape handler, no backdrop click-to-dismiss and no focus trap (the only handlers are the two button `onClick`s at 352/360).

Second, the `<section>` has no `max-height` and the overlay has no `overflow-y-auto`; only the preview `<pre>` is capped (`max-h-56` = 224px, :332). The parser allows up to 2,000 chars (:8), so the preview always hits the cap and the card's intrinsic height is roughly **580-620px** (40px padding + ~102px header + the `break-all` URL `<dd>` at :324 wrapping to 3-5 lines + ~270px preview + the `!isLocal` warning at :344 + 48px buttons, plus 32px overlay padding). Because the overlay is `flex items-center justify-center` with no scroll, overflow splits top **and** bottom — the h2 title and Discard/Accept leave the pane simultaneously and cannot be scrolled to.

**Two corrections.** (1) **This is Tauri, not Electron.** The queue is populated only inside an effect guarded by `if (!isTauri) return undefined;` (:156), and `isTauri` is false in the Electron shell (`lib/runtimeEnvironment.ts` sets it from `__TAURI_INTERNALS__`/`__TAURI__`; Electron is flagged separately via `isElectronHost`). With an empty queue the component returns null at :285. **File under desktop-tauri.** (2) The 600px minimum is `electron/main.ts:357` — the wrong window. Tauri is `"minWidth": 1000, "minHeight": 700` (`src-tauri/tauri.conf.json:21-22`), where the card is borderline. The **dependable** trigger for the overflow leg is the terminal dock: in Local mode with it open, `h-80` (320px) plus the collapsed strip leaves ~330-350px of pane for a ~600px card.

**Adjacent identical bug**: `McpToolConfirmationPrompt.tsx:124` uses `className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"` and is mounted at `DesktopShellV3.tsx:809` in the same container — same defect, same fix.

**Reference** — `139-claude-desktop-settings-general-profile-name-instructions.png`: Claude's settings modal dims the **entire** window — the sidebar's Home/Code tabs and recents are visibly greyed out behind it — and the panel scrolls internally.

**Fix** — `fixed inset-0 z-50` (matching `CapModal.tsx:44` and `CloudVoiceActionDialog.tsx:96`, both siblings in the same container; the shell root at :619 has no transform, so `fixed` resolves to the viewport), plus `overflow-y-auto` on the overlay and `max-h-[calc(100vh-2rem)] overflow-y-auto` on the `<section>`.

---

**DEL-7 · MEDIUM · The tray advertises hotkeys the user has no way to change**

**Where** — `apps/desktop/electron/tray.ts:58`

```ts
    {
      label: 'Quick Ask',
      // Displayed only: the combo is already owned by globalShortcut, and
      // registering it again here would double-fire the handler.
      accelerator: quickAskShortcut,
      registerAccelerator: false,
      click: handlers.onQuickAsk,
    },
```

**Symptom** — Launch with Raycast/Alfred/an IME switcher owning ⌥⇧Space. A system notification says the combo is taken and to use the tray instead — and the tray then shows "Quick Ask ⌥⇧Space", macOS-rendered from the still-passed accelerator string. A keyboard hint for a hotkey that does nothing, with no control anywhere in the product to change it.

Neither `apps/desktop/electron/settingsStore.ts#saveSettings` nor `apps/desktop/electron/tray.ts#refreshTrayMenu` has any caller in `apps/desktop/electron` (both are exported; the only other repo matches are an unrelated Playwright page-object method and an unrelated Tauri Zustand store). `grep -n "shortcut" apps/desktop/electron/preload.ts` returns nothing, so there is no IPC bridge a cloud-hosted settings pane could call. The only rebind path is hand-editing `settings.json` in userData.

The tray is shipped: `createTray(garnishHandlers)` at `main.ts:473`, `registerGarnishShortcuts` at `:474`, `"main": "electron/dist/main.cjs"`.

_(Copy correction: the notification body is a template literal at `shortcuts.ts:27` interpolating the raw Electron accelerator — it reads "**Alt+Shift+Space** is already in use by another app. Use the AGI Cloud tray menu instead." The ⌥⇧Space glyph form appears only in the tray. Shipping the raw token in notification copy while the adjacent tray menu shows glyphs is itself a small consistency wart.)_

Medium: Quick Ask and Screenshot to Chat remain reachable by clicking the tray items, so nothing is unusable — it misinforms rather than blocks.

**Reference** — `155-claude-desktop-settings-desktop-general-shortcuts.png` shows "Quick access shortcut" bound to a dropdown and a "Voice shortcut" settable to "No shortcut" — both rebindable and both able to represent the unbound state. Codex ships the same across `101-…-108-codex-macos-settings-keyboard-shortcuts-*.png`.

**Fix** — The cheaper half removes the false affordance on its own and should ship first: have `registerGarnishShortcuts` return per-shortcut success and thread it into `buildMenu`, so a failed combo renders **without** an accelerator label. The full fix is an IPC bridge command that calls `saveSettings`, then `unregisterGarnishShortcuts(); registerGarnishShortcuts(...); refreshTrayMenu(...)`.

---

**DEL-8 · LOW · Top-level navigation flashes a full-window white rectangle for dark-theme users**

**Where** — `apps/desktop/electron/main.ts:353`

```ts
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
```

**Symptom** — No `backgroundColor` on either window — a repo grep of `apps/desktop/electron/*.ts` for `backgroundColor|nativeTheme|setBackgroundColor|transparent` returns **nothing**, so Electron's documented `#FFF` default stands. Startup itself is fine (`show:false` at 358 + `ready-to-show` at 379), but two paths re-navigate a visible window: `openNewChat()` (421-426) calls `showMainWindow()` on line 422 _before_ `loadURL` on 425, so the tray "New Chat" always runs on a visible window; and `windowPolicy.ts:15-23` allows `accounts.google.com` / `appleid.apple.com` / `login.microsoftonline.com` as in-window top-level navigations during OAuth.

**The theme reasoning in the original report is wrong twice.** (a) `cool` is not a dark palette — `packages/ui/design-tokens/src/chat.css:127` sets `--chat-surface-base: #ffffff` for `[data-chat-theme='cool']`; only line 166 (`.dark[data-chat-theme='cool']`) sets `#212121`. (b) `apps/desktop/index.html` is never loaded in the shipping config — `config.ts:22-23` defaults to `'remote'`, so `main.ts:400` loads the hosted app, which defaults to `system` theme (`apps/web/shared/components/ThemeConstants.ts:9`). Correct statement: **users whose OS/app theme resolves dark** see a white flash on tray → New Chat and on each in-window OAuth redirect; light-mode users see nothing. The "at least three flashes per login" count is unsupported — state it as once per in-window OAuth redirect.

**Fix** — On `main.ts:353` only:

```ts
backgroundColor: nativeTheme.shouldUseDarkColors ? '#212121' : '#ffffff',
// plus nativeTheme.on('updated', () => win.setBackgroundColor(...))
```

(values from `chat.css:166` and `:127`; `#0d0d0d` is not one of our tokens and would give light-mode users a _black_ flash). **Skip `quickAsk.ts:24`** — the panel is created hidden (:27), pre-warmed at `main.ts:481`, calls `loadURL` exactly once (:61), and thereafter is only `show()`/`hide()`, so it cannot flash repeatedly; and it sets `vibrancy: 'sidebar'` (:36) on macOS, which an opaque `backgroundColor` would defeat.

---

### Desktop — Tauri feature screens

**DTA-1 · MEDIUM · Project Settings → Files: the absolute path blows the row out of its scroll box and displaces the delete button**

**Where** — `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1010`

```tsx
<div className="flex items-center justify-between p-2 bg-muted rounded-md group">
  <div className="flex items-center gap-2">
    <File className="w-4 h-4 text-muted-foreground" />
    <span className="text-sm text-foreground">{file.name}</span>
    <span className="text-xs text-muted-foreground">{file.path}</span>
  </div>
```

**Symptom** — `handleAddFile` (:310) does `name: filePath.split('/').pop() ?? filePath, path: filePath` from the Tauri picker, so name **and** full absolute path print side by side. The inner div (:1012) has no `min-w-0`, neither span has `truncate`, and the `<File />` icon (:1013) has no `shrink-0`. Because flex items default to `min-width:auto` and a path is one unbreakable token, the inner div cannot shrink: text spills past the `bg-muted` pill onto the dialog background (`justify-between` degrades to flex-start under overflow), a horizontal scrollbar appears inside the 220px box, and the Trash button (:1017-1024 — the only way to remove a file) is laid out beyond the visible right edge.

The scroll box is `<ScrollArea className="h-[220px] border border-border rounded-lg p-2">` (:998), resolving through `@/components/ui/ScrollArea` (import :14) → `apps/desktop/src/ui/ScrollArea.tsx` → `@agiworkforce/ui` → `packages/ui/ui/src/primitives/ScrollArea.tsx:16` `'relative overflow-auto ...'`.

**Trigger, precisely**: DialogContent is `max-w-2xl` (:707) = 672px, minus `px-6` = 624px, minus ScrollArea `p-2` and the `pr-2` gutter on the tab body (:758) ≈ a **590px** row. A deep dev path (~95 chars) blows past it; `/Users/sid/notes.txt` will not. Repro is "Files tab → Add Files → pick a file nested several directories deep", not "any file".

Medium not high: after horizontally scrolling the inner list the Trash is still clickable.

**Two more defects in the same row, worth folding into one patch**: the Trash `<Button>` (:1017-1024) is `opacity-0 group-hover:opacity-100` with **no `focus-visible:opacity-100`**, so it is invisible and undiscoverable to keyboard users — combined with being scrolled off-screen, this is what makes removal feel impossible; and it has **no `aria-label`**, whereas the cloud sibling at :1141 correctly sets `aria-label={\`Remove ${file.fileName}\`}`.

**Consistency**: this file solves the same problem three ways — no handling (Files, :1012), `min-w-0` + `truncate` (cloud Sources, :1126-1155, though that renders only when `isManagedCloud` is true, the exact mode in which the Files tab is hidden per :741/:983), and `truncate max-w-[300px]` (conversations, :1305-1310).

**Reference** — `102-claude-desktop-cowork-agent-task-view-folder-access-modal.png`: Claude's folder-access modal wraps long absolute paths onto multiple lines rather than letting them escape the panel, and its composer folder chips ellipsize.

**Fix** — Converge all three on the cloud sibling's pattern: `<div className="flex items-center gap-2 min-w-0 flex-1">`, `shrink-0` on `<File />`, wrap name/path in `<div className="min-w-0">` with `<span className="block truncate …">` on each (use `truncate`, not `break-all`, so the 220px box never grows a horizontal scrollbar), `title={file.path}`, and `shrink-0` + `focus-visible:opacity-100` + `aria-label` on the Trash.

---

**DTA-2 · HIGH · Code workspace: a long open-file name pushes Open Folder / Save All / Compare outside the clipped panel**

**Where** — `apps/desktop/src/features/code/CodeWorkspace.tsx:476`

```tsx
<div className="flex flex-1 flex-col">
  {/* Header */}
  <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
    <div className="flex items-center gap-2">
      …
      <span className="text-sm font-medium">
        {activeFilePath ? activeFilePath.split(/[/\\]/).slice(-2).join('/') : 'No file selected'}
      </span>
```

**Symptom** — Neither the main column (:476), nor the left group (:479), nor the label span carries `min-w-0`/`truncate`, so all three size to min-content. The workspace root (:447) is `flex h-full overflow-hidden ... min-h-0 min-w-0` (its own `min-w-0` applies to the root as a flex item, not its children), the file-tree sidebar (:455-460) is `shrink-0` at a hardcoded 280px (`useState(280)` at :79), and the shared Button primitive is `whitespace-nowrap` (`packages/ui/ui/src/primitives/Button.tsx:21`). Nothing can compress.

Rendered from `DesktopShellV3.tsx:743` inside `<div className="h-full p-3">` under `relative min-h-0 flex-1 overflow-hidden` (:639) — **no horizontal scroll anywhere**, so the overflow is clipped and the buttons are genuinely unreachable.

Measured in Chromium with the exact flex structure. Chromium does **not** break at `/`, so the joined two-segment path is one unbreakable token:

| Label                                 | @1200         | @1100 | @1000 |
| ------------------------------------- | ------------- | ----- | ----- |
| `v3/ComposerContextControls.test.tsx` | 41px overhang | 141px | 241px |
| `src/App.tsx`                         | —             | —     | 65px  |

At 1100px the screenshot shows "Save All (2)" cut mid-label and "Compare" gone entirely. `tauri.conf.json:21` sets `minWidth: 1000`, so **at the smallest window the app itself permits, this is unconditional**. Clipping starts at ~1240px for a typical `v3/Something.test.tsx` and at ~1400px (the default window width) for a 56-char two-segment path. Everything fits at 1600px, so "immediately at any width" is wrong — the correct framing is: unconditional at 1000px, and hit at ordinary widths (half-screen tiling, 1280×800 laptops).

**No fallback entry point.** Save All has no shortcut (the only keydown handler, :118-140, is ⌘/Ctrl+1-9 tab switching); per-file "Save tab" exists only in the tab right-click menu (:421-428); Switch Folder / Compare exist nowhere else once a root folder is set (the empty-state "Open Folder" button disappears). Two workarounds exist but are not fixes: collapsing the v3 shell sidebar (240→64, `Sidebar.tsx:427`) and collapsing the in-panel file tree via the chevron at :480-490 (frees the 280px).

**Reference** — `098-claude-desktop-cowork-agent-task-view-tool-call-timeline.png`: Claude Desktop truncates the conversation title and keeps the right-hand panel toggle pinned and visible at every width.

**Fix** — `min-w-0` on the main content column (:476) and on the left header group (:479); `truncate` + `title={activeFilePath}` on the filename span; `shrink-0` on the right-hand `<div className="flex items-center gap-2">` action group so the buttons always win the space contest.

---

**DTA-3 · MEDIUM · "Schedule new task" modal is hardcoded to a dark navy palette — a black slab with teal buttons in light theme**

**Where** — `apps/desktop/src/features/scheduler/CreateTaskModal.tsx:158`

```tsx
className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0c14] shadow-2xl"
…
<h2 id="create-task-title" className="text-sm font-semibold text-white">
…
<label htmlFor="task-name" className="mb-1.5 block text-sm font-medium text-slate-300">
…
'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white',
'placeholder-slate-500 outline-none transition',
'focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/30',
…
: 'bg-teal-600 text-white hover:bg-teal-500',
```

**Symptom** — Local mode → Scheduled → "Schedule new task" (`AgiWorkScheduled.tsx:88`) or the empty-state CTA (:161). `settingsStore.ts:352` defaults theme to `'system'` and `:946-955` adds `.dark` only when the OS reports dark, so on a light-appearance machine the `:root` light tokens apply (`--chat-surface-elevated: #ffffff`, `--chat-bg: #faf9f7`, `--chat-text-primary: #1a1915`, `packages/ui/design-tokens/src/chat.css:12-33`). The host screen is fully token-driven (`AgiWorkScheduled.tsx:82,106,110,114`) and its CTA is `bg-primary` = `15 64.1% 59.6%` (`styles/globals.css:283,317`) — **terracotta**. This modal drops a `#0b0c14` near-black card with `text-white` headings, `text-slate-300` labels, `bg-white/5` inputs and a `teal-600` primary onto a cream page. Teal appears nowhere else in the shell.

It is genuinely the outlier: `CapModal.tsx:82,107` and `SearchModal.tsx:409,418,531` use `var(--chat-*)`.

Medium not high: the modal is internally self-consistent and fully legible — an off-theme dark slab on a cream page, which a user notices as wrong but not as broken.

_(The modal's own heading is "Create Scheduled Task" / "Edit Scheduled Task" at :166; "Schedule new task" is the invoking button.)_

**Reference** — `102-claude-desktop-cowork-agent-task-view-folder-access-modal.png` and `145-claude-desktop-settings-usage-plan-limits.png`: Claude Desktop's modals inherit the app surface — the same material as the window behind them.

**Fix — must include the child component or it gets worse.** `apps/desktop/src/features/scheduler/TaskScheduleInput.tsx` renders **inside** this modal (CreateTaskModal.tsx:261) and carries its own duplicate dark palette: `fieldClass` at :73-77 (identical to the parent's), teal segmented toggles at :89-91 and :104-106 (`'border-teal-500 bg-teal-500/20 text-teal-300'`), `text-slate-400` labels (:117, :129, :148), a `text-teal-400` clock icon and `text-slate-400` preview (:172-174), a forced `[color-scheme:dark]` on the datetime input (:122), and `className="bg-slate-900"` on the interval `<option>`s (:137). **Recolouring only CreateTaskModal would leave the entire Schedule section as white-on-white — genuinely unreadable.**

Convert both files together: `bg-[var(--chat-surface-elevated)] border-[var(--chat-border)]`, `text-[var(--chat-text-primary)]` / `text-[var(--chat-text-secondary)]`, `bg-[var(--chat-surface-base)]` for the field class, `bg-primary text-primary-foreground` for Save (matching `AgiWorkScheduled.tsx:87`). Drop the `[color-scheme:dark]` override and the `bg-slate-900` `<option>` classes (also at CreateTaskModal.tsx:247 and :251) so native controls follow the active theme.

---

**DTA-4 · MEDIUM · File tree: unbounded per-level indentation in a non-resizable 280px sidebar erases filenames at depth**

**Where** — `apps/desktop/src/features/code/FileTree.tsx:507`

```tsx
style={{ paddingLeft: `${level * 12 + 8}px` }}
```

**Symptom** — Indent grows 12px per level with no cap, in a sidebar hardcoded to 280px with no resize handle (`CodeWorkspace.tsx:79` `const [sidebarWidth] = useState(280);` — no setter; grepping the file for `resize|onMouseDown|cursor-col` returns nothing; consumed once at :460 on a `shrink-0` div).

Usable row width ≈ 280 − 1 (`border-r`, :542) − 8 (`p-1`, :560) ≈ 271px, less fixed chrome of 16 (chevron) + 8 + 16 (icon) + 8 = 48px. Remaining name width ≈ **199 − 12×level** px; at 14px `font-mono` (~8.4px/char): level 6 ≈ 15 chars (fine), level 10 ≈ 9 chars, level 14 ≈ 3 chars, level ≥17 → 0.

**Three mechanics in the original report are wrong.** The chevron/icon spans (:517-529) wrap 16px SVGs with `overflow: visible`, so their flex `min-width: auto` resolves to 16px — they **hold their width and never collapse**. The name span (:530) carries `truncate` (`overflow: hidden`), which is precisely what resolves _its_ minimum to 0 — the name is the only thing that disappears. At extreme depth the items overflow and `ScrollArea` (a plain div, `packages/ui/ui/src/primitives/ScrollArea.tsx:16`, `'relative overflow-auto …'`) grows a native horizontal scrollbar; it does not clip to an empty stripe. And `onClick` is on the padded row div itself (:502-514) with the indent as padding, so **the entire row stays clickable at any depth** — nothing becomes unreachable.

**The strongest part of the case, unreported: there is no `title` attribute anywhere in FileTree.tsx** (grep for `title=` returns nothing). So a truncated filename has no tooltip, and `truncate` means horizontal scrolling cannot recover it either. Combined with the non-resizable sidebar, a user at depth 10+ has **literally no way to read the full name**.

Reachability caveat: `dir_list` (`src-tauri/src/sys/commands/file_ops.rs:1107-1160`) is a bare `fs::read_dir` loop with no `node_modules` exclusion, but children are fetched lazily per expand (:90-101), so level 20 takes ~20 deliberate clicks. The realistic complaint band is **level 8-14** in a normal monorepo, where names shrink to 3-9 characters and siblings become indistinguishable (`settings-ia.test.ts` vs `settings-ia.test.tsx`).

**Fix** — Cheapest first: **`title={node.name}` on the name span (:530)** removes the unrecoverable-truncation symptom. Then cap the indent (`paddingLeft: Math.min(level, 8) * 12 + 8`) with VS Code-style guide lines for deeper levels, and make the sidebar resizable (give `sidebarWidth` a setter plus a drag handle with a `min-w-[180px]` clamp). `shrink-0` on :517-529 is harmless but addresses a failure that does not occur.

---

**DTA-5 · HIGH · Unsaved-changes dialog: an unbreakable path widens the grid column and pushes "Save & Close" outside the clip box**

**Where** — `apps/desktop/src/features/code/CodeWorkspace.tsx:655`, with the layout from `packages/ui/ui/src/primitives/Dialog.tsx:110`

```tsx
<p className="text-sm text-muted-foreground">
  {pendingCloseFile?.path
    ? `${pendingCloseFile.path} has unsaved changes. How would you like to proceed?`
    : 'This file has unsaved changes.'}
</p>
```

**Symptom** — Built a pixel-faithful repro of the shared `DialogContent` base (`grid w-[min(96vw,42rem)] max-h-[calc(100vh-2rem)] gap-4 overflow-hidden ... p-6`) plus the caller's `sm:max-w-lg space-y-4` (:652) and measured in Chromium at 1280×800.

Dialog box: 512px wide (x 384-896), 464px content box. `/Users/siddhartha/Desktop/agiworkforce/apps/desktop/src/features/chat/ProjectSettingsDialog.tsx` (95 chars) renders as **one unbreakable 633px line box** (x 409-1042) — computed `overflow-wrap` is `normal` and Chromium creates no break opportunity after `/`.

**The damage is worse than "the text tail is cut off".** Because DialogContent is `display: grid`, the auto column's min size is min-content, so the 633px token **widens the column 171px past the fixed 512px box**, dragging the right-aligned `flex justify-end` button row (:661) out with it. `overflow: hidden` then clips:

- path cut mid-token at ".../features/chat/Pro"
- **"Discard changes" clipped 51px** (cut in half)
- **"Save & Close" (:676-678, the primary action) sits 170px outside the clip box — completely invisible and unclickable**

The user can only Escape (= keep editing); they cannot save-and-close from the dialog at all.

Threshold measured: 24/56/63-char paths cause zero overflow; the blow-out starts around **68+ chars** (>464px at text-sm/14px). Below the `sm` breakpoint the dialog is 96vw — narrower — so it triggers sooner. Verified fix: `word-break: break-all` on that `<p>` drops column overflow from 171px to **0px** and brings "Save & Close" fully back inside.

_Engine caveat: verified in Chromium (Tauri's WebView2 on Windows, and the Electron shell). macOS Tauri uses WKWebView, which some builds break after `/` — the macOS symptom may be a wrapped-but-ugly path rather than a clipped one. Do not claim macOS-verified._

**Reference** — `102-claude-desktop-cowork-agent-task-view-folder-access-modal.png`: Claude renders four long absolute paths and hard-wraps each inside the card rather than clipping.

**Fix** — `break-all` (or `[overflow-wrap:anywhere]`, or `min-w-0` on the grid children) on the paragraph. State it as fixing **both** symptoms: it removes the oversized min-content contribution, restoring the column to 464px and un-clipping the buttons. The basename-bold / directory-truncate treatment is optional polish.

---

**DTA-6 · MEDIUM · Project detail header: a long project name paints under the Settings and New chat buttons**

**Where** — `apps/desktop/src/features/v3/AgiWorkProjects.tsx:145`

```tsx
<div className="min-w-0 flex-1">
  <h1 className="text-xl font-semibold text-[var(--chat-text-primary)]">
    {activeProject.name}
  </h1>
```

**Symptom** — The h1 sits in a non-wrapping `flex items-start gap-3` row (:139) beside the Settings icon (:154) and the "New chat" pill (:162). `min-w-0 flex-1` collapses its box to the leftover width, but the h1 has no `truncate` and no `break-words`, and there is no global `overflow-wrap` reset in `styles/globals.css` (base layers at 253 and 338 set only box-sizing/typography). Project names are unbounded — the create Input (`ProjectSettingsDialog.tsx:575`) and edit Input (:768) have no `maxLength`.

The card (:138) has no `overflow-hidden` and the pane (:126) is `overflow-y-auto`, so overflow-x computes from visible to `auto` and a horizontal scrollbar appears.

**Paint direction is inverted in the original report.** All four flex children are non-positioned, so in-flow content paints in tree order and the **buttons paint over the overflowing h1**, not the reverse. Actual symptom: the title's glyphs run _behind_ the transparent Settings icon (glyphs and icon visibly collide, both illegible in that patch) and then disappear entirely under the opaque `bg-[var(--chat-accent-primary)]` "New chat" pill. Both buttons remain clickable, and because horizontal scrolling moves the buttons along with the text, **the covered portion of the name is permanently unreadable**.

Also **CONSISTENCY**, not only overlap: the same string is truncated everywhere else in this very file — grid card at :371 (`min-w-0 flex-1 truncate`), chat rows at :221/:225.

**Reference** — `098-claude-desktop-cowork-agent-task-view-tool-call-timeline.png`: Claude truncates the header title with an ellipsis and never lets it reach the trailing controls.

**Fix** — `truncate` on line 145 plus `title={activeProject.name}` (or `break-words` to wrap to two lines). `shrink-0` on :154/:162 is **not** load-bearing — the title wrapper is `flex-1` (`flex: 1 1 0%`), so the row has positive free space distributed by grow and the buttons never enter shrink distribution; the overflow comes solely from the h1's min-content width exceeding its `min-w-0` parent. Keep it only as defence.

---

**DTA-7 · LOW · Cloud Schedules: server error strings are rendered unclamped, so one failed run swells its card into a wall of red text**

**Where** — `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:988` (and `:1045`, `:1003`)

```tsx
<p className="mt-3 rounded-lg bg-[var(--chat-destructive)]/5 px-3 py-2 text-xs text-[var(--chat-destructive)]">
  Last error: {schedule.lastError}
</p>
```

**Symptom** — `schedule.lastError` is stored up to **2,000 characters** (`apps/web/lib/services/schedule-service.ts:29` `MAX_ERROR_LENGTH = 2_000`, truncated by `boundedError()` at :949, fed by `errorMessage(error)` and `toGenericUpstreamError`'s `${providerId} API error (${status}): ${chunk.message}`). Neither render site clamps.

The give-away that this is unintended: the sibling run-result paragraph **one line above** at :1040 already uses `mt-2 line-clamp-3`. The name at :875 uses `truncate` and the prompt at :891 uses `line-clamp-2`. Only the errors are unbounded.

Geometry: the list is `mx-auto max-w-4xl` (:717, 896px) minus `px-6`, `p-4` and the five-button action column → a ~470-500px text column. At `text-xs` that is ~80-85 chars/line, so a full 2,000-char description is ~24 lines / ~380px of red text, making the card ~480-520px tall and burying every other schedule.

**The horizontal-overflow claim is dropped.** Tauri `minWidth` is 1000 (`src-tauri/tauri.conf.json:21`) and Electron 800 (`electron/main.ts:356`), so the error column is never below ~440px; the cited ~55-char URL wraps as a whole word and cannot overflow at any supported size, and no error path produces the ~70-140 char unbroken token that would be required. At :1003 the flex row simply wraps.

**Fix** — Apply `line-clamp-3` plus a show-more toggle to **:988 and :1045** (matching :1040), and add `break-words` as cheap insurance on all three. **Fix :1045 first if only one** — `run.error` carries provider error bodies, which are longer and far less user-controlled than a typed description.

---

**DTA-8 · MEDIUM · Create/Edit schedule modal cannot be dismissed with Escape and has no close button**

**Where** — `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:1088`

```tsx
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--chat-surface-overlay)]/80 p-4"
  role="presentation"
  onMouseDown={(event) => {
    if (event.currentTarget === event.target && !saving) setEditorOpen(false);
  }}
>
  <section role="dialog" aria-modal="true" … className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl …">
```

**Symptom** — Grepping all 1,441 lines for `Escape|keydown|onKeyDown` returns **zero** matches; the three useEffects (370, 463, 499) are abort-controller cleanup, a `schedulesEnabled` reset, and initial data load. No `autoFocus`, no `.focus()` (useRef only at 368/434 for abort controllers), so nothing focuses or traps focus. The header (1101-1108) is an h2 and a p with no close button, and the Cancel/Save footer (1371-1394) sits inside the `overflow-y-auto` region, not sticky.

**Decisive corroboration:** the Local-mode sibling in the same directory, `ScheduleEditor.tsx:133-141`, installs a window keydown listener (`if (e.key === 'Escape' && !isSaving) onClose();`) and has an `aria-label="Close"` X button at :253-262; `CreateTaskModal.tsx:135-139` does the same. **Escape closes the Local schedule editor and silently does nothing in the Cloud one** — a mode-to-mode inconsistency the user notices directly.

Three symptoms, in order of what a user hits: (1) Escape does nothing where it works one screen over; (2) nothing focuses the dialog and there is no focus trap, so Tab walks a keyboard user back out into the schedule list behind the overlay; (3) selecting Cadence = Weekly renders the days-of-week fieldset (1277-1310), pushing Cancel/Save below the fold of the `max-h-[90vh]` panel.

Not high: the panel is `max-w-2xl` (672px) centred in a window normally wider than 1000px, so backdrop-click is a **large** target — the user is never trapped and can always exit.

**Fix** — Copy `ScheduleEditor.tsx`'s window keydown effect (133-141) and its `aria-label="Close"` X button (253-262) into this dialog, and make the footer `sticky bottom-0` within the scroll region.

---

**DTA-9 · LOW · Cloud schedule card: description renders unclamped while the prompt right below it is clamped**

**Where** — `apps/desktop/src/features/schedules/DesktopCloudSchedules.tsx:886`

```tsx
{
  schedule.description ? (
    <p className="mt-1 text-xs text-[var(--chat-text-muted)]">{schedule.description}</p>
  ) : null;
}
<p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--chat-text-secondary)]">
  {schedule.prompt}
</p>;
```

**Symptom** — The editor accepts a 2,000-char description (`maxLength={2_000}`, :1130) and a 10,000-char prompt. The prompt is capped at two lines; the description immediately above is not capped at all, and the description is never revealed elsewhere (the row expansion at :995+ renders only run history). The enclosing column is `min-w-0 flex-1` (:873), which constrains width only; no ancestor has a max-height or overflow-hidden.

The inconsistency is visible **inside one card**: name `truncate` (:875), prompt `line-clamp-2` (:891), run output `line-clamp-3` (:1040), description unbounded.

Trigger is a **paste**, not typing — the description editor is a single-line `<input>` (:1128), so the realistic case is a 1-3 sentence paste (3-6 lines). A full 2,000 chars at `text-xs` in the ~470-500px text column is ~24 lines / ~380px of description, making the card ~480-520px — tall, but the text stays readable and the list scrolls (`h-full overflow-y-auto`, :715). Low, not medium.

**The sharper break in this same paragraph, uncovered by the original claim: there is no `break-words`.** With the parent at `min-w-0`, a description containing a long unbroken token (a pasted URL, ID or file path) overflows horizontally out of the `<p>` and runs past the card's rounded border, under the action-button column — actual visual breakage rather than just a tall card.

**Fix** — `line-clamp-1` + `title={schedule.description}` is the minimal correct change; add `break-words` alongside. (The original fix's "expose the full text on row expansion" implies an expansion panel that shows the description — that panel renders history only today, so it is new work.)

---

**DTA-10 · MEDIUM · Artifact card title has no clamp or break rule — a long generated filename escapes the card**

**Where** — `apps/desktop/src/features/v3/AgiWorkArtifacts.tsx:139`

```tsx
<div className="text-sm font-medium text-[var(--chat-text-primary)] leading-snug">{a.title}</div>
```

**Symptom** — No `truncate`, no `line-clamp`, no `break-words`, no `title` attribute. The parent card (:106-113, `'group flex flex-col gap-3 rounded-xl border p-4 transition'`) has no `overflow-hidden`. Tailwind v4 (`package.json:167`) emits `repeat(3, minmax(0,1fr))` for `lg:grid-cols-3`, so the column cannot stretch to absorb a long token. No global `overflow-wrap` rule exists in `styles/globals.css`.

Width: `max-w-3xl` (768px) − `px-6` (48) = 720px, minus two 12px gaps = 696/3 ≈ 232px per card, minus `p-4` ≈ **200px** of text width — ~26-28 characters at 14px/500.

Titles are fully model-supplied and never length-capped (`src-tauri/src/core/llm/tool_executor/artifact_tools.rs:155` trims but does not truncate; the tool schema at `core/agi/tools/mod.rs:2279` asks only for a "Short, descriptive title", which models satisfy with filenames for code and spreadsheet artifacts).

Two symptoms:

**(a)** For cards 1 and 2 in a row, the next card's opaque background (`bg-[var(--chat-surface-elevated)]` or the fresh accent tint at :111-112) **paints over** the overflow — the user sees the title chopped mid-character at the card's right border with no ellipsis and no explanation. Only the rightmost card in each row (and the single-column layout below `sm`) shows text genuinely escaping into the page background.

**(b)** The more obvious one, unreported: the scroll container at :60 is `className="h-full overflow-y-auto ..."`, so overflow-x computes to `auto` and **the whole Artifacts pane gains a horizontal scrollbar** and can be dragged sideways.

Threshold: any unbroken token past ~28 characters. `quarterly_revenue_analysis_2026_final_v3.xlsx` (45) is well past it, but so is the routine code-artifact case `ConversationStreamController.tsx` (32).

Not taste: the same field is explicitly truncated at `ArtifactsGallery.tsx:212`, and every sibling v3 list uses truncate/line-clamp.

**Reference** — `183-claude-web-cowork-task-outputs-benchmark-spec-files.png`: Claude web's Outputs rail ellipsizes exactly these model-generated filenames (`05-chrome-extension-benchmark…`, `07-shared-platform-benchmark-s…`) on one line at a narrow width.

**Fix** — `<div className="line-clamp-2 break-words text-sm font-medium …" title={a.title}>`. `break-words` works (`overflow-wrap: break-word` breaks an otherwise-unbreakable token when it would overflow); `break-all` is not needed and produces uglier mid-word breaks on prose titles. Whichever is chosen, match `ArtifactsGallery.tsx:212`, which already applies `truncate` to the same field.

---

**DTA-11 · MEDIUM · Project Settings dialog uses a hardcoded blue palette and two different primary buttons in one component**

**Where** — `apps/desktop/src/features/chat/ProjectSettingsDialog.tsx:1336`, `:695`, `:1238-1239`, `:1263-1264`

```tsx
className="bg-blue-600 hover:bg-blue-700 text-white"   // edit-mode Save Changes, line 1336
className="bg-foreground px-5 text-background hover:bg-foreground/90"   // create-mode Create project, line 695
<div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
  <p className="text-xs text-blue-300">   // lines 1238-1239 and 1263-1264
```

**Symptom** — Line 495 (`if (mode === 'create')`) returns an entirely separate dialog whose footer button is `bg-foreground` (:695); the edit-mode return at :705 ends in a footer whose button is `bg-blue-600` (:1336). Same file, same dialog family, **two different primary colours** — and neither matches the shell, which uses `bg-[var(--chat-accent-primary)]` (`AgiWorkProjects.tsx:272`) or `bg-primary text-primary-foreground` (`AgiWorkScheduled.tsx:87`). User path: Projects → "New project" (neutral black/white primary), then the gear on any project → Settings (saturated blue primary).

The callouts are a readability break in light theme: `#93C5FD` on `rgba(59,130,246,0.10)` over white ≈ `#E8F1FE` = **~1.58:1** at `text-xs` (12px) — unreadable, and _worse_ than the 2:1 the original report estimated.

**Decisive: the same file already has the correct pattern.** Lines 625 and 906 use `rounded-xl border border-blue-500/20 bg-blue-500/[0.06]` with `text-sm font-medium text-foreground` + `text-xs leading-5 text-muted-foreground`. So 1238/1263 are demonstrably the stale unmigrated pair inside a file that has already established the theme-safe treatment.

**Trigger corrected — this is light-theme-only, not default-state.** The desktop default is **dark** (`NormalApplication.tsx:50` `<ThemeProvider defaultTheme="dark" …>`, `ThemeProvider.tsx:29`). In dark theme `#93C5FD` reads fine. The bug is reachable via Settings → General → Theme → **Light** (`GeneralSettings.tsx:113`) or the `settingsStore` default `theme: 'system'` (:352) on a Mac in Light appearance (`settingsStore.ts:951-953`).

Of the secondary colours, only `text-green-400` on line 1212 (the knowledge-base file icon) genuinely degrades — `#4ADE80` on white ≈ **1.74:1**, so the icon nearly disappears next to readable filenames. `hover:text-red-400` (1021, 1146, 1228) is ~2.8:1 — weak but visible, hover-only. `bg-blue-500 text-white` on the "Linked" badge (:1313) has fine contrast; its problem is palette drift. Also unreported: line 1302 `'bg-blue-500/20 border border-blue-500/50'`, the selected state for linked conversations.

_"ResearchSettings.tsx:239 and :304 have the identical bug" overstates it — both are `text-green-600`, ~5.5:1 dark and ~3.3:1 on white. Same token drift, not the same contrast failure._

**Reference** — `145-claude-desktop-settings-usage-plan-limits.png`: one accent for every affirmative control, semantic red/blue only for status meters.

**Fix** — Line 1336 → the create path's primary or `bg-primary text-primary-foreground`. Lines 1238/1263 → copy the pattern already used at **625 and 906 in this same file** (smallest, most defensible diff). Line 1212 → `text-[var(--chat-success)]`.

---

### Mobile (Expo iOS)

**MOB-1 · HIGH · Bottom search bar is hidden underneath the iOS keyboard on Chats, Library, Projects and Connectors**

**Where** — `apps/mobile/src/features/chat/ChatsListScreen.tsx:503`

```tsx
<BottomSearchBar
  value={query}
  onChangeText={setQuery}
  placeholder="Search"
  accessibilityLabel="Search chats, projects, files, library, and artifacts"
  inputRef={searchInputRef}
  autoFocus={autoFocusSearch}
/>
```

**Symptom** — `DrawerContent.tsx:324` navigates with `focusSearch: '1'` → `ChatsListScreen.tsx:133-135` parses it → `:177 searchInputRef.current?.focus()` (plus the declarative `autoFocus` on :509). The keyboard slides up and the search pill — the **last child** of the root `<SafeAreaView edges={['top']} style={{ flex: 1, … }}>` (:393) — is completely covered.

The shared component has no keyboard awareness at all: its only bottom offset is `BottomSearchBar.tsx:77` `marginBottom: insets.bottom + BOTTOM_SEARCH_BAR_MARGIN` (~34pt home indicator + 10pt), a static value that cannot clear a ~300pt keyboard. No ancestor mitigates it — grepping `KeyboardAvoidingView|KeyboardProvider` across all six `app/**/_layout.tsx` returns nothing, there is no `react-native-keyboard-controller` provider, and the bar is outside the FlatList so `automaticallyAdjustKeyboardInsets` cannot apply.

The user types blind: no field, no query text, no clear button.

Same defect on tap-to-focus in Library (`src/features/library/index.tsx:301`), Projects (`app/(app)/(tabs)/projects.tsx:483`) and the connectors directory (`src/features/settings/cloud-connectors/index.tsx:1097`, wrapped at :1095 in `style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}`).

**iOS only** — Expo's default `softwareKeyboardLayoutMode: resize` already lifts it on Android, and the repo documents this at `chat/[id].tsx:1106-1108`. Any fix must be gated on `Platform.OS === 'ios'` or it will double-handle.

**Reference** — ChatGPT iOS keeps the bottom composer pill riding directly on top of the keyboard (`new-latest-chatgpt-mobile-images/IMG_0684.PNG`). ChatGPT's Projects search (`IMG_0691.PNG`) and Claude's Connectors search (`new-latest-claude-mobile-ios-images/IMG_0753.PNG`) use the same bottom-anchored pill we copied — and both lift it.

**Fix** — Cleanest single-point fix is inside `BottomSearchBar.tsx` itself, which fixes all four hosts at once and avoids reworking each host's flex layout. There is **no** `useKeyboardHeight` hook in `apps/mobile` (grep returns zero); copy the raw listener pattern from `src/features/chat/components/ChatInput.tsx:332-341`, which carries the height in `e.endCoordinates.height`:

```ts
// BottomSearchBar.tsx:77
marginBottom: (kbHeight > 0 ? kbHeight : insets.bottom) + BOTTOM_SEARCH_BAR_MARGIN;
```

The same dynamic height must feed `useBottomSearchBarSpace()` (`BottomSearchBar.tsx:24-27`), which derives the trailing list spacer from the same static value, or the spacer and pill will disagree while the keyboard is up. (Compare `app/(app)/chat/[id].tsx:1110`, which already does this correctly for the composer.)

---

**MOB-2 · HIGH · Edit-message dialog's Cancel/Send row sits behind the auto-raised keyboard, with no way to dismiss it**

**Where** — `apps/mobile/src/features/chat/components/MessageEditModal.tsx:104`

```ts
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
```

**Symptom** — Long-press your own message → "Edit message" (`MessageBubble.tsx:461`, rendered at `:1009`). The dialog is vertically centred in the full screen and the TextInput has `autoFocus` (:73), so the keyboard opens immediately. The file imports only View/Pressable/Modal/TextInput/StyleSheet (:6) — no `KeyboardAvoidingView`, no ScrollView, no `keyboardVerticalOffset`. RN `Modal` renders into a separate native window, so no ancestor can pad it, and no global keyboard handling exists in `apps/mobile`.

**Corrected geometry**: the minimum dialog is ~203pt (padding 40 + title ~33 + input `minHeight: 80` + margin 16 + buttonRow ~34), not ~300pt. A two-line message does not exceed `minHeight: 80`, so centred at 422 on an iPhone 14 (keyboard top ~508pt) the dialog spans ~320-523pt and only the bottom ~15pt of the 34pt buttonRow clips — cut, but still tappable.

**The genuinely broken case is a longer message**, where the multiline input auto-grows toward `maxHeight: 200` (:126): dialog ≈323pt spanning ~260-583pt, so the **entire buttonRow sits 40-75pt below the keyboard top** and Cancel/Send are unreachable.

**Worse than claimed: there is no way to dismiss the keyboard without losing the edit.** Tapping the backdrop fires `onClose` (:37, discards the edit); tapping the dialog body hits `onPress={() => undefined}` (:57), which does not blur; a multiline keyboard has no Done/Return dismissal; there is no `keyboardDismissMode`. **On a long message the user is trapped with no path to submit.**

The Rename Conversation modal (`app/(app)/chat/[id].tsx:1408`, backdrop style 1417-1424) has the same shape — it _is_ nested inside a KeyboardAvoidingView (:1109) but that is inert for Modal content. Its input is single-line so the dialog is ~180pt with ~4pt clipped: marginal.

_(Android note: `AndroidManifest.xml:35` sets `windowSoftInputMode="adjustResize"` on MainActivity, but RN Modal renders in its own Dialog window so this does not reliably rescue it. iOS is the confirmed failure.)_

**Fix** — The in-repo pattern to copy is `src/features/cloud-bridge/InviteCodeModal.tsx:477`, which uses `<View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim }}>` with `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>` at :486 **inside** `<Modal>`. Placing it outside (as `chat/[id].tsx` does) does nothing. Alternatively switch `backdrop` to `justifyContent: 'flex-end'` with `paddingBottom: insets.bottom` so it presents as a bottom sheet the keyboard pushes up.

---

**MOB-3 · HIGH · Add-custom-connector sheet: keyboard covers all three fields and the Add button, with no tap-outside dismiss**

**Where** — `apps/mobile/src/features/settings/cloud-connectors/AddCustomConnectorModal.tsx:136`

```tsx
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <View
          style={{
            backgroundColor: colors.surfaceBase,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            gap: 12,
          }}
        >
```

**Symptom** — Line 11 imports only Modal, View, TextInput, Pressable, ActivityIndicator: **no KeyboardAvoidingView, no Platform, no useSafeAreaInsets**. There is no global keyboard handling in `apps/mobile`, and RN Modal does not keyboard-avoid on iOS. The sheet's content is ~320-330pt tall (title + 2-line description + three ~40pt inputs + 12pt gaps + ~44pt button row + 40pt padding) and bottom-anchored via `justifyContent: 'flex-end'`; an iOS portrait keyboard is ~300-345pt. Tapping any field hides the field being typed into, the validation error Text at :185, and the Add button.

High severity because the URL field must be a valid https URL that the server validates strictly, and **the user types it blind with the server's verbatim error message also hidden**.

**Aggravating factor, unreported: no tap-outside dismiss.** The backdrop View at :136 has no `onPress` (unlike `AddMemorySheet`, which wraps its scrim in a Pressable), so the only escape from the covered state is the keyboard's own return key. Until the user finds that, **Cancel is unreachable too**.

The app's own convention proves this file is the outlier — the nearest sibling sheet, `src/features/settings/components/AddMemorySheet.tsx:89`, uses `<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>`, as do 15+ other sheets.

**The home-indicator claim is dropped**: `padding: 20` places the button row's bottom edge 20pt above the screen edge; the indicator's visual band tops out ~13pt and the bottom gesture strip is ~20pt, so the buttons neither overlap nor swallow the swipe. Tighter than the 34pt safe area, but the sibling `AddMemorySheet` ships the identical flat `paddingBottom: 20`.

**iOS only** — `app.config.js` sets no `softwareKeyboardLayoutMode`, so Expo's default `resize` shrinks the Android window and the flex-end sheet rides up correctly.

**Fix** — The KeyboardAvoidingView wrap is correct and sufficient:

```tsx
<KeyboardAvoidingView
  behavior={Platform.OS === 'ios' ? 'padding' : undefined}
  style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}
>
```

The `paddingBottom: 20 + insets.bottom` portion is optional polish.

---

**MOB-4 · HIGH · In-conversation header: the fixed-width Local/Cloud toggle overlaps the project chip and steals taps from "New chat"**

**Where** — `apps/mobile/app/(app)/chat/[id].tsx:1178`

```tsx
          <View style={{ flex: 1, alignItems: 'center' }}>
            <ModeToggle
              mode={currentAppMode}
```

**Symptom** — The header row (1118-1128) is `flexDirection:'row', paddingHorizontal:12, height:48` with **no gap** and **no overflow**. It holds a 32pt hamburger + a project chip capped at `maxWidth: 120` with no `flexShrink` (1155-1164) + this `flex:1` slot + a 68pt right group (1191-1222: two 32pt Pressables + `gap: 4`). `ModeToggle.tsx:37` is `const toggleWidth = compact ? 172 : 216;` applied at :75 as a **hard, definite width**.

`flex: 1` expands to grow 1 / shrink 1 / basis 0, so the centre slot receives exactly the leftover. On a 375pt screen: `375 − 24 − 32 − 120 − 68 = 131pt`. The wrapper is a default _column_-direction View, so `alignItems:'center'` centres the 172pt child on the **cross axis where flexShrink cannot apply**, and Yoga lets it spill ~20.5pt past each edge. Nothing clips it (neither the wrapper nor the row sets overflow), and both backgrounds are opaque (`surfaceElevated` = `#ffffff` light / `#212121` dark, `tokens.ts:8/71`).

**Paint direction is backwards on the right side, and the consequence is functional.** In RN, later siblings paint above and win hit-testing. The right-hand group (:1191) renders **after** the toggle (:1178), so the new-chat button paints over the toggle's right edge and **captures those taps: tapping the right ~20pt of the Cloud segment fires `handleNewChat` and navigates the user out of the conversation they are reading.** The left side is as claimed — the chip (:1147) is an earlier sibling, so the toggle paints over the project name's trailing text and steals taps there.

**Not an SE edge case.** The header needs 220pt of fixed content, so the toggle overflows on **every iPhone below ~430pt**: 375pt → 41pt overflow, 390pt (iPhone 14/15/16/17 base) → 26pt, 402pt (16/17 Pro) → 14pt. Only Plus/Pro Max escapes.

**The chip need not hit its 120pt cap.** Overflow begins once the chip exceeds `351 − 32 − 68 − 172 = 79pt` on a 375pt screen — with `paddingHorizontal: 12`, that is ~55pt of 12pt text, roughly **9 characters**. A project named "Onboarding" already breaks it (11 chars at 390pt, 13 at 402pt).

Reachable via `useProjectStore.setActiveProject` from `projects.tsx:258`, `ProjectSelectorBar.tsx:162` and `ProjectChatsTab.tsx:84`; the chip renders whenever `conversationExecutionMode === 'local' && activeProject` (:1147).

_(Android caveat: ViewGroup child clipping may truncate the spill instead, showing the pill with its ends sliced off. Same root cause.)_

**Fix — the proposed fix does not work as written.** Swapping `width` for `maxWidth + flexShrink: 1` at `ModeToggle.tsx:74-78` is **inert**, because the toggle root is the cross-axis child of a column wrapper. And the suggested `minWidth: compact ? 132` is unreachable: the pill has an intrinsic floor of ~168pt (two segments at `minWidth: 80` (:56) + `padding: 3`×2 + `borderWidth: 1`×2). A correct fix must **also** relax `minWidth: 80` on `segmentStyle` (:56) and the inner rows' `minWidth: 58` (:98) and `minWidth: 62` (:135) — otherwise the root's `overflow: 'hidden'` (:77) simply clips the "Local"/"Cloud" labels instead, a different visible break. Give the chip `flexShrink: 1` at `[id].tsx:1163`.

Lower risk, and what the references do: **stop competing for the 48pt row**. ChatGPT and Claude keep one centred control in the conversation header and put project/context attribution on its own line beneath it.

---

**MOB-5 · MEDIUM · Markdown tables shred their cell text — equal-width `flex:1` cells with no horizontal scroll**

**Where** — `apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:428`

```tsx
                      <View
                        key={`${keyBase}-td-${idx}-${rowIdx}-${colIdx}`}
                        style={{
                          flex: 1,
                          borderRightWidth: colIdx < numCols - 1 ? 1 : 0,
                          borderRightColor: renderColors.border,
                          paddingHorizontal: 8,
                          paddingVertical: 6,
                          justifyContent: 'center',
                        }}
                      >
```

**Symptom** — Ask anything that answers with a comparison table (model comparison, pricing, feature matrix — a very common reply shape). The table container (:405-414) has `overflow: 'hidden'` and no horizontally scrolling parent, and every cell is `flex: 1`, hard-locking the table to the message column and forcing equal columns regardless of content. Assistant messages render full-width (`MessageBubble.tsx:553` `px-4 py-4`, assistant branch at :600 `{ width: '100%' }` — the `maxWidth: '85%'` at :594 is the _user_-bubble branch), so on a 375pt device that is ~343pt: a 4-column table gives ~68pt of text per cell at fontSize 13, roughly **8-10 characters per line**.

**It wraps; it does not clip.** RN `Text` without `numberOfLines` is unbounded vertically and wraps, falling back to character wrapping for long tokens. Since cells are `flex: 1` they never exceed their track, so the container's `overflow: 'hidden'` never actually clips. The real symptom: each cell becomes a tall vertical stack of 8-10-character fragments (`gpt-5.2-` / `codex-hi` / `gh`), rows grow to 4-6 lines, and a 4+ column table reads as **a wall of shredded text**. No content is lost — unreadable-looking, not unreachable, hence medium.

Fenced code blocks in the same renderer already get the right treatment (`:580 <ScrollView horizontal …>`); tables were missed.

**Second confirmed defect in the same block, unreported**: line 447 renders `{row[colIdx] || ''}` raw, **bypassing `renderInlineMarkdown`** (which every other block calls — :342, :485). So `**Bold**`, `` `code` `` and `[link](url)` inside a cell display their literal asterisks, backticks and brackets. Assistant replies routinely bold the header row or first column, so this is visible on most tables.

Shipped: `renderMarkdownContent` is consumed by `MessageBubble.tsx:538` (every assistant turn), `ArtifactFullScreen.tsx:578`, `artifacts/index.tsx:549`.

**Fix** — Wrap the table View (the node pushed at :404) in the same horizontal ScrollView the code block uses, keeping `borderRadius: 4` + `overflow: 'hidden'` on an inner View **inside** the ScrollView (otherwise the rounded edge applies to the viewport and the right border disappears when scrolled). Change the cell from `flex: 1` to `minWidth: 110, flexShrink: 0, flexGrow: 1` (plain `flexShrink: 0` alone means a 2-column table stops filling the bubble). Set `nestedScrollEnabled` for Android parity. **Do not** add `numberOfLines` — that turns wrapping into genuine truncation. Separately, route cell content through `renderInlineMarkdown`.

---

**MOB-6 · MEDIUM · The send-destination disclosure above the composer is an ~18pt tap target**

**Where** — `apps/mobile/src/features/chat/components/SendPreview.tsx:165-191` (style block starts at :173)

```tsx
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 2,
            paddingHorizontal: 4,
          }}
        >
          <DestinationIcon presentation={presentation} colors={colors} />
          <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textMuted }}>
```

**Symptom** — The compact SendPreview renders directly above the composer (`ChatInput.tsx:692`, unconditional except during voice capture; both chat entry points always supply the prop — `(tabs)/chat.tsx:770` and `chat/[id].tsx:1310`). The Pressable sets only `paddingVertical: 2, paddingHorizontal: 4` with no `hitSlop`, no `minHeight`, no `minWidth` — `grep -n "minHeight\|hitSlop" SendPreview.tsx` returns nothing, and RN Pressable has no implicit hit area beyond its box.

Row height = max(14pt icon, ~12pt line box) + 2+2 = **~18pt**, far under the 44pt iOS minimum and under the 32pt bar.

**The decisive evidence is internal inconsistency, not an abstract HIG number**: every other Pressable in the same composer sets a hit area — `ChatInput.tsx:790 hitSlop={6}`, `:836 hitSlop={10}`, `:862 hitSlop={8}`, `:982/:1035/:1060/:1082 hitSlop={6}`. This one control, sitting a few points above a full-width TextInput, is the one that eats near-misses and focuses the keyboard instead of expanding.

**Corrections that lower the severity framing**: the destination icon is `size={14}` (:47, :49), not 10 — only the chevron is 10 (:187/:189). Width is ~115-130pt, not ~90pt, and is not the failing dimension. And the label is **static text, always visible without tapping** (:183-185) — only the _expanded detail panel_ requires the tap, so no information becomes unreachable. This is a missable-target/consistency defect, not an unusable control.

_(The `fontSize: 9` uppercase labels at :226-232 and :288-294 are static labels inside the expanded panel and the `card` variant, not tap targets — a legibility nit, not part of this finding.)_

**Reference** — ChatGPT iOS keeps every composer-adjacent affordance at full pill size — the +, mic and voice buttons in `new-latest-chatgpt-mobile-images/IMG_0684.PNG` are all ~44pt circles.

**Fix** — Add `minHeight: 32` to the style object at :173-180 and `hitSlop={8}` on the Pressable, matching the 6-10 values already used throughout ChatInput.tsx. Bumping `fontSize: 10` → 12 at :183 is a defensible legibility improvement but is taste; ship the hit-area fix independently.

---

**MOB-7 · MEDIUM · Chats list header overlaps the first section header at large text sizes**

**Where** — `apps/mobile/src/features/chat/ChatsListScreen.tsx:396`

```tsx
      <View
        style={{
          height: 52,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
```

**Symptom** — The header stacks a 20pt/700 "Chats" over an 11pt "Managed Cloud" / "Local on this device" subtitle (:404-409) inside `<View style={{ flex: 1 }}>`, in a row pinned to `height: 52` with `alignItems: 'center'`. A repo-wide grep for `allowFontScaling` / `maxFontSizeMultiplier` / `Text.defaultProps` returns only two hits, both in `ModeToggle.tsx` (:104, :141), so every Text here scales with Dynamic Type. The siblings cannot absorb it — `DrawerButton` is pinned 36×36 (`shared/components/DrawerButton.tsx:10,36`) and the filter Pressable is 36×36 (:416-417), so the `flex:1` text column is the only thing that grows.

**It is OVERLAP, not clipping.** RN Views default to `overflow: 'visible'` and this one sets none, so the oversized stack **overdraws** outside the 52pt box. Upward it lands in the SafeAreaView top inset (colliding with the status-bar area); downward it lands in the sibling SectionList region (:431), which paints after the header and whose first section header sets an opaque `backgroundColor: colors.surfaceBase` (:443) — **so the "Managed Cloud" / "Local on this device" line collides with and is covered by the "PINNED"/"TODAY" section header.** The user loses the one thing that row exists to say: which trust boundary the list is showing.

**Threshold is much lower than "accessibility sizes".** The stack is ~24pt (20pt title) + ~13pt (11pt subtitle) ≈ 37pt with no gap on the inner View, so it exceeds 52 at **fontScale ≈ 1.40** — reached at the largest ordinary Dynamic Type step (xxxLarge, ~1.35 already flush), i.e. by the plain Larger Text slider without ever enabling the Accessibility sizes.

`src/features/library/index.tsx:232` uses the same header pattern (`className="h-12 flex-row items-center px-3 gap-2"`) but with a single 17pt line, surviving to ~2.4. ChatsListScreen is the outlier because it is the only one of these headers with a **two-line title stack in a fixed-height row**.

**Fix** — `height: 52` → `minHeight: 52, paddingVertical: 6`, and cap the subtitle with `maxFontSizeMultiplier={1.3}` (matching `ModeToggle.tsx:104` — which is 1.3, not the 1.6 the original report suggested).

---

**MOB-8 · MEDIUM · Shared settings screen header collides with the first content card on long or dynamic titles**

**Where** — `apps/mobile/src/features/settings/common.tsx:42`

```tsx
      <View
        style={{ height: 50, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 }}
      >
        <Pressable
          onPress={goBack}
          …
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>{title}</Text>
```

**Symptom** — The title Text has no `flex: 1`, no `numberOfLines` and no `maxFontSizeMultiplier`, inside a container locked to `height: 50`. The shared `Text` wrapper (`components/ui/text.tsx`) adds none either — it only injects `lineHeight: Math.ceil(fontSize * 1.24)` = 22. Available width on a 393pt iPhone is `393 − 8 − 8 − 40 ≈ 337pt`.

**As with MOB-7, this is overlap, not clipping.** With `overflow: 'visible'` and `alignItems: 'center'`, an over-tall title spills ~10pt above (into the SafeAreaView top inset) and ~10pt below — into the sibling `<ScrollView>`, whose first opaque `SettingsGroup` card (`common.tsx:69-79`, `backgroundColor: colors.surfaceElevated`) sits only 8pt below the header edge via `contentContainerStyle.paddingTop: 8` and **covers the bottom of the second line**.

Two real triggers:

1. **Dynamic titles, at default text size.** `ConnectorDetailScreen.tsx:368` passes `title={connectorName || 'Connector'}` where `connectorName = connection?.name` (:211) — a server/user-supplied display name — and `NotificationCategoryDetailScreen.tsx:35` passes `title={copy.label}`. A long connector name wraps to 3+ lines (3 × 22 = 66 > 50), and a single long unbroken token runs off the right edge with **no ellipsis**, because there is no `numberOfLines`.
2. **Accessibility text sizes** on the longer static titles: "Notification Preferences" at fontScale 1.6 ≈ 360pt > 337pt → 2 lines of 35pt = 70pt in a 50pt box.

The team already knows the pattern: `settings/index.tsx:130-150` (the Settings root list) uses `minHeight: 50` plus `<Text numberOfLines={1} style={{ flex: 1, … }}>`, and `SettingsRow`/`SettingsSwitchRow` in **this same file** (:273, :346-352) use `flex: 1` + `minWidth: 0` + `numberOfLines`. Only the shell header is missing it.

**Two corrections.** (a) `SettingsScreenShell` is used at **29 render sites across 34 files** (~25 distinct screens), not 85 routes. (b) The i18n argument does **not** apply — shell titles are hardcoded English literals at every call site except two (`general/index.tsx:39`, `app-language/index.tsx:71`). "Account Security" and "Parental Controls" are literals (`account-security/index.tsx:228,238`; `parental-controls/index.tsx:16`) and do not translate, so de/ru/pt expansion is irrelevant. (That non-localization is a separate defect — see CRS-8.) The specific example also fails the math: "Account Security" at 1.6 is ~240pt against ~337pt available and stays on one line at 35.2pt, which fits.

**Reference** — `new-latest-claude-mobile-ios-images/IMG_0748.PNG` (Privacy screen): Claude iOS keeps a single-line centred title in a header that grows with text size.

**Fix** — `height: 50` → `minHeight: 50, paddingVertical: 6`, and `<Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: 17, fontWeight: '700' }}>` — matching `SettingsRow` (:273) and the Settings root row (`settings/index.tsx:141-150`).

---

**MOB-9 · MEDIUM · Settings Email row truncates the address to a hard 130pt**

**Where** — `apps/mobile/src/features/settings/index.tsx:152`

```tsx
<Text numberOfLines={1} style={{ color: colors.textMuted, fontSize: 13, maxWidth: 130 }}>
  {row.value}
</Text>
```

**Symptom** — `app/(app)/(tabs)/settings.tsx:21` re-exports this as the Settings tab; the Email row (:404-412) feeds `clerkUser?.primaryEmailAddress?.emailAddress` into this slot. The row is `flexDirection: 'row'`, the label Text has `flex:1` (so it shrinks) and the value Text has **no flex/flexShrink**, making `maxWidth: 130` an absolute cap the row's spare space cannot fill; `numberOfLines={1}` then ellipsizes. There is no breakpoint or percentage width, and no global `allowFontScaling={false}` exists in `apps/mobile/src` or `apps/mobile/app`, so the 13pt text scales up while the 130pt cap does not.

A user signed in as `agiautomationllc@gmail.com` sees `agiautomationllc@g…` — **the domain, the part that distinguishes work from personal, is always cut**.

**Corrected geometry**: ScrollView `paddingHorizontal: 16` (:749) + row `paddingHorizontal: 14` (:132) → a 315pt content box on a 375pt screen. Fixed cost = Icon 19 (:140) + ChevronRight 17 (:173) + three 12pt gaps (:135) = 72pt, leaving ~243pt for label + value. "Email" at 15pt is ~38pt, so the value slot could be **~205pt** — the cap wastes ~75pt, not the ~180pt originally claimed. `agiautomationllc@gmail.com` needs ~177pt: fits in 205, cut at 130.

Medium, not high: the local part is legible, the row is still tappable, and the full address is on the screen it pushes to (`/(app)/settings/cloud-account`, :411). The same cap also clips the Subscription row (:425) and version row (:652), though those strings are short enough today.

**Reference** — `new-latest-chatgpt-mobile-images/IMG_0705.PNG`: ChatGPT iOS shows the full account email on its own line rather than truncating it into a trailing value slot.

**Fix** — `maxWidth: '55%'` would be ~173pt of the 315pt content box — **still under the ~177pt this exact address needs**, so it would keep truncating. Use:

```tsx
style={{ color: colors.textMuted, fontSize: 13, flexShrink: 1, maxWidth: '70%' }}
ellipsizeMode="middle"
```

The label already carries `flex: 1`, so it absorbs the remainder and a pathologically long value cannot squeeze it out; adding `flexShrink: 2` to the label is unnecessary.

---

**MOB-10 · MEDIUM · Connector "Connect" pill label bleeds out of its fixed 30pt background at Accessibility text sizes**

**Where** — `apps/mobile/src/features/settings/cloud-connectors/index.tsx:569`

```tsx
              <View
                style={{
                  height: 30,
                  paddingHorizontal: 16,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.textPrimary,
                }}
              >
                <Text style={{ color: colors.background, fontSize: 13, fontWeight: '700' }}>
                  {busy ? 'Connecting…' : 'Connect'}
                </Text>
```

**Symptom** — The pill is a fixed-height column container whose only child is an unclamped 13pt Text with `flexShrink: 0`, so once the line box exceeds 30pt it **overflows** the pill's bounds (RN does not clip; `overflow: 'hidden'` at :1044 is on the outer card).

The label is `color: colors.background` on a `colors.textPrimary` pill, and the row sits on `colors.surfaceElevated`. In light theme the spill is `#ffffff` on `#ffffff` (`tokens.ts:6,8`); in dark, `#0f0f0f` on `#212121` (`:69,71`). **The protruding glyph slivers disappear**, so the button reads as a shaved-off word inside a too-small capsule. The ellipsis survives (it sits on the baseline); cap-height tops and descenders are what is lost.

**Threshold corrected.** RN iOS scales via RCTFont's content-size-category table (L=1.0, XXXL=1.353, AX-M=1.786, AX-L=2.143, AX-XL=2.643, AX-XXXL=3.571). At the largest **non**-accessibility size (XXXL) the label is 17.6pt with a ~21pt line box — fits. Even AX-Medium (23.2pt, ~28pt box) fits. Breakage starts at **Accessibility Large** (27.9pt, ~33.5pt box, ~1.7pt each edge) and is gross at AX-XL and above (~5.5pt, then ~12.8pt each edge). This is an accessibility-size defect, not a "Larger Text" defect.

Affects **every available-but-not-connected row** (branch at :563), i.e. most of the directory on first visit — not just the transient `busy` state.

**The tap-target half of the original finding is false and should be dropped.** The pill is not the tap target: the entire row is one Pressable (:514) with `accessibilityRole="button"` and `accessibilityLabel={\`${entry.name}. ${status}\`}`, wrapping a View with `paddingVertical: ROW_PADDING_Y` (13, :469) around a 40pt logo tile (:470). Minimum hit area is full screen width × ~66pt — comfortably over 44pt.

Medium: the connector name and status stay legible in the adjacent `flex:1` column (which correctly sets `minWidth: 0` and `numberOfLines={1}` at :531-543), and VoiceOver announces full state from the row label.

**Reference** — `new-latest-claude-mobile-ios-images/IMG_0753.PNG`: Claude iOS Connectors uses a tall, generously padded black Connect pill on each row that grows with the row.

**Fix** — `height: 30` → `minHeight: 30, paddingVertical: 6` so the pill grows with its label, plus `maxFontSizeMultiplier={1.4}` on the Text at :577 (matching `ModeToggle.tsx:104,141`). Keep `borderRadius: 15` only if the pill can no longer grow past 30pt; otherwise raise it or use a large radius so the capsule stays a capsule.

---

**MOB-11 · LOW · Library filter chips are ~30pt tall — undersized against both the reference and our own sibling control**

**Where** — `apps/mobile/src/features/library/index.tsx:333`

```tsx
    <Pressable
      onPress={onPress}
      className="px-3 py-1.5 rounded-full"
      style={{
        backgroundColor: active ? c.accentSurface : c.surfaceElevated,
        borderWidth: 1,
        borderColor: active ? c.accentBorder : c.border,
      }}
```

**Symptom** — `py-1.5` (6pt) around `text-xs` (12pt, ~16pt line box) plus 1pt borders = a **30pt-tall** Pressable with no `hitSlop`. Below the 44pt Apple HIG minimum and below this app's own filter control one screen away — `ChatsListScreen.tsx:410-422` ships `width: 36, height: 36, borderRadius: 18` with `hitSlop={8}`, and `hitSlop` appears 63 times across `apps/mobile/src`, so this chip is an outlier from the app's own convention.

**Two of the stated symptoms are fabricated and should not be repeated.** (a) "Users hit the grid card behind them" — nothing is behind or beneath the chips. The row is a horizontal ScrollView with `style={{ flexGrow: 0, paddingBottom: 16 }}` (:253) in normal flow above a FlatList whose contentContainerStyle adds `paddingTop: 4` (:282). A low miss lands on ~20pt of inert padding; **no wrong action can fire.** (b) "The four chips crowd against each other" — line 254 is `contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}` on a `horizontal` ScrollView built precisely for overflow (the in-file comment at :240-245 says the four labels exceed a 375pt screen, which is why it scrolls). With `px-3` (12pt) each, adjacent targets are ~32pt apart. Nothing crowds or goes unreachable.

Corrected symptom: the chips render as 30pt pills — visually undersized against the reference and fiddly to hit, but usable and unable to trigger a wrong action.

**Reference** — `045-chatgpt-ios-library-grid-thumbnails-uploaded-screenshots-gallery.png` shows the identical All / Images / Documents row with a pill roughly 40pt tall (not "~56pt"). Our 30pt vs 40pt reference and vs our own 36pt sibling.

**Fix** — `minHeight: 36, justifyContent: 'center'` plus `hitSlop={6}`, matching `ChatsListScreen.tsx:410-422`. Raising the label from `text-xs` to 14pt is a taste call, not part of the defect.

---

**MOB-12 · LOW · Style-selector sheet hardcodes a 34pt home-indicator inset instead of reading the safe area**

**Where** — `apps/mobile/src/features/chat/components/StyleSelector.tsx:84`

```tsx
          style={{
            backgroundColor: themeColors.surfaceElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 8,
            paddingBottom: 34,
            borderTopWidth: 1,
            borderColor: themeColors.border,
          }}
```

**Symptom** — The sheet is the last child of a `justifyContent: 'flex-end'` View inside a bare `<Modal statusBarTranslucent>`; `useSafeAreaInsets` appears nowhere in the file, so the literal 34 is the only bottom spacing. Reachable via the composer sheet's "Choose style" row (`AddToChatSheet.tsx:547-553`), rendered at `(tabs)/chat.tsx:~790` and `chat/[id].tsx:1338`.

On any device where `insets.bottom !== 34` — iPhone SE/8, most Android hardware, iPad without a home indicator — the sheet ends with ~34pt of empty `surfaceElevated` below the last "Creative" row. On the common modern iPhone-portrait case (inset exactly 34) the render is **pixel-identical** to the proposed fix.

**The "every sibling reads the real inset" claim is false and should not be repeated.** Hardcoded bottom padding is the _more common_ pattern here: `ReportFlagButton.tsx:402` (`padding: 24, paddingBottom: 40`, no insets referenced), `FirstRunDisclosureModal.tsx:172` (`paddingBottom: 32`, inset-free), `ConversationExportSheet.tsx:319` (`paddingBottom: 8`, getting its inset from a `SafeAreaView` wrapper rather than a hook). The two inset-aware sheets cited are real — `ProjectSelectorBar.tsx:256` `Math.max(insets.bottom, 10)` and `apps/mobile/src/features/voice/components/VoicePickerSheet.tsx:130` `insets.bottom + 20` (**not** under `features/chat` as the original path implied). StyleSelector is not a lone outlier.

**Fix** — Fix as a sweep across `ReportFlagButton`, `FirstRunDisclosureModal` and `StyleSelector`, not as a single-file inconsistency. The minimal change is `const insets = useSafeAreaInsets();` plus `paddingBottom: Math.max(insets.bottom, 12)`. **Not** `Math.max(insets.bottom, 12) + 8` as originally proposed — that renders 42pt on a modern iPhone, _more_ dead space than today on exactly the devices where today's value is already correct, and it does not match `ProjectSelectorBar`.

---

### Web (Next.js)

**WEB-1 · HIGH · Settings → Connectors "Add ▾" menu opens ~530px from its button, and vanishes entirely on wide displays**

_See SHR-1 — the defect lives in the shared `packages/ui/ui/src/sidebar/Menu.tsx` and manifests on the web Settings surface._

---

**WEB-2 · HIGH · Opening two right-hand chat panels collapses the conversation column to zero width**

**Where** — `apps/web/features/chat/pages/WebChatPage.tsx:2933`

```tsx
<div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
  <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
```

**Symptom** — The three panels are direct flex siblings of the conversation column inside that row (:3162-3170: WorkSessionPanel, ResearchPanel, ArtifactsPanel), and all three are non-shrinking on desktop:

- `features/chat/components/artifacts/ArtifactsPanel.tsx:381` `'sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px] sm:shrink-0'`
- `features/chat/components/research/ResearchPanel.tsx:148` `'sm:relative sm:inset-auto sm:z-auto sm:w-[360px] sm:shrink-0'`
- `features/chat/components/work-session/WorkSessionPanel.tsx:492` `'sm:relative sm:inset-auto sm:z-auto sm:w-[380px] sm:shrink-0'`

The conversation column is the only `min-w-0` child, so it absorbs the entire deficit down to 0. **No mutual exclusion exists** — the three panels live in three independent stores (`research-panel-store.ts togglePanel`, the artifacts store `togglePanel`, and a local `useState workSessionPanelOpen` at :440) and nothing closes one when another opens. Both the Sources and Artifacts toggles render unconditionally in the header (:2998-2999), so two panels are always reachable. `ResearchPanel` renders even with zero sources (only `if (!panelOpen) return null` at :129, plus an EmptyState), so this is triggerable on a chat that never ran a search.

**Corrected arithmetic** (the artifacts panel is **400px**, not 480 — the Tailwind classes are overridden on desktop by an inline style, `ArtifactsPanel.tsx:373` `style={layout === 'desktop' ? { width: panelWidth } : undefined}` with `panelWidth` defaulting to 400 at `packages/ui/unified-chat/src/stores/uiStore.ts:38`; sidebar is 260px, `packages/ui/ui/src/sidebar/Sidebar.tsx:140`):

| Window | Main area | Sources+Artifacts    | Result                                                                       |
| ------ | --------- | -------------------- | ---------------------------------------------------------------------------- |
| 1280px | 1020      | 760                  | conversation 260px (cramped)                                                 |
| 1280px | 1020      | +Work-session = 1140 | **conversation 0px** — transcript and composer gone, artifacts panel clipped |
| 1024px | 764       | 760                  | **conversation 4px** — two panels is enough here                             |

The 640-767px band also breaks, but for a different reason than `sm:w-full`: the sidebar is off-canvas below 768px (`:430`), so main ≈ viewport; at 700px, 400 + 360 = 760 > 700 → conversation 0.

**A worse path the original claim missed**: the artifacts panel width is user-draggable and persisted with **no viewport awareness** — `ArtifactsPanel.tsx:327 setPanelWidth(window.innerWidth - move.clientX);` and `uiStore.ts:56 set({ artifactPanelWidth: Math.max(280, Math.min(900, width)) })`, persisted via `partialize` (:74). Drag to 900px on a wide monitor, then resize to 1280px or reopen on a laptop: **120px conversation column with Artifacts alone**, surviving reload.

**Reference** — `122-chatgpt-web-settings-general-appearance-intelligence-dictation.png`, `183-claude-web-cowork-task-outputs-benchmark-spec-files.png`: both products show **at most one** right-hand side panel at a time and never let the transcript column disappear.

**Fix** — Primary: make the panels mutually exclusive (opening one closes the others), plus `min-w-[360px]` on the conversation column at :2934. Note the proposed `sm:min-w-[280px] sm:shrink` will **not** help ArtifactsPanel — its width comes from the inline style, not the class; that panel needs `maxWidth` clamped against the container in the inline style, or the clamp in `setArtifactPanelWidth` made viewport-aware.

---

**WEB-3 · MEDIUM · Connectors page is hardcoded dark: in Light appearance every card border and panel background disappears**

**Where** — `apps/web/features/connectors/pages/ConnectorsPage.tsx:766`

```tsx
<div className="border-b border-white/[0.06] bg-black/20 px-6 py-6">
```

**Symptom** — The page root one line above is `<div className="min-h-full bg-background">` — a token resolving to the **light** value `--background: 40 23% 97%` (#faf9f7) at `app/globals.css:569`, with dark values only under `.dark` (:686+). The literal-alpha classes are widespread: 246, 261, 269, 330, 342, 402, 447, 550, 559, 776, 779, 800, 825, 840, 906, 958, 970, 1018, 1033, 1062. No parent forces a dark class — `/connectors` has no `layout.tsx`, and the root ThemeProvider (`shared/components/ThemeProvider.tsx:53-60`) sets `attribute="class"` with `enableSystem` and **no `forcedTheme`**.

**The repro path in the original report does not reproduce.** Signed-in users never see this component: `app/connectors/page.tsx:27-30` returns `<SettingsModalRedirect section="connectors" />` when `isLoaded && isSignedIn`, which immediately calls `openSettings(section); router.replace('/chat')`. ConnectorsPage renders **only for signed-out visitors**.

**The real (and broader) repro**: `shared/components/ThemeConstants.ts:9` is `export const DEFAULT_THEME: Theme = 'system';` with `enableSystem`. So **any signed-out visitor whose OS is in Light appearance** — the public/marketing entry point the route comment explicitly supports ("Unauthenticated visitors still see the public ConnectorsPage directory (so marketing links work)") — gets the broken rendering with zero settings changes.

**Text does not become unreadable** (every text node uses `text-foreground` / `text-muted-foreground`, which stay dark). What breaks is structural chrome:

- **Search field loses its box entirely.** `:825 className="h-9 border-white/[0.08] bg-white/[0.04] pl-9 text-sm …"` — `twMerge` drops the Input primitive's `border border-input bg-background` (`packages/ui/ui/src/primitives/Input.tsx:37`) in favour of the alpha-white pair, so the connector search renders borderless and fill-less; only the magnifier and placeholder mark it.
- **Status-filter segmented control loses its container.** `:800 <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.03] p-0.5">` — invisible track; only the active `bg-primary` pill shows, so a tri-state control reads as one floating button.
- **Header-band contrast failure.** `bg-black/20` over #faf9f7 composites to ≈#c8c7c6; the badges at 776/779 (`text-muted-foreground`, `text-xs`) land at **≈3.2:1** — below AA for 12px.
- **No hover affordance.** `:402` and `:840` use `hover:bg-white/[0.04]` / `[0.06]`, both no-ops on a near-white ground, so list rows and category tabs give no hover feedback.
- Tools panel (:550), "more planned" panel (:1033) and the empty-state icon chip (:1018) disappear completely.
- Detail card (:447) is `border border-white/[0.06] bg-card` — `--card: 0 0% 100%` against `--background: #faf9f7` leaves a barely-perceptible 5-value step with a fully invisible border.

**The dialog sub-claim is dropped.** Line 234 is `InspectMcpServerDialog`, whose only trigger is gated at :784 on `isSignedIn` — which is never true while ConnectorsPage is mounted. The `bg-[#0f0e0d]` box is dead code on this page. (The `twMerge` analysis was right — `packages/ui/ui/src/cn.ts` uses `twMerge(clsx(...))`, so `bg-[#0f0e0d]` really would strip `Dialog.tsx:110`'s `bg-background/95` — it just never renders.)

**Reference** — `163-claude-web-connector-directory-browse-popular-and-community-cards.png`: the connector directory cards keep visible borders and surface separation because they are token-driven.

**Fix** — Scope to the page body: `border-white/[0.06]`→`border-border/60`, `bg-white/[0.02]|[0.03]|[0.04]`→`bg-muted/30` or `bg-card`, `bg-black/20`→`bg-muted/30`, and **remove the `border-white/[0.08] bg-white/[0.04]` overrides on the Inputs entirely** so they inherit `border-input bg-background`. Then re-check in both themes.

---

**WEB-4 · MEDIUM · Long conversation title runs under the header icon buttons and steals the dropdown's clicks**

**Where** — `apps/web/features/chat/components/ConversationTitleMenu.tsx:66`

```tsx
<div className="absolute left-1/2 flex max-w-[46%] -translate-x-1/2 items-center">
```

**Symptom** — The header (`WebChatPage.tsx:2935-2942`) is `relative flex h-11 shrink-0 items-center justify-between px-4`, so the abspos title's containing block is the full header padding box. `max-w-[46%]` + `left-1/2` + `-translate-x-1/2` makes the title box always span 27%-73% of the header **independent of what the sibling clusters need**, and it renders whenever `activeConversationTitle && !== 'New Chat' && displayedConversationId` (:2973-2975) — at every viewport.

Measured with a faithful static repro at a 390px column: `titleLeft=105.8, titleRight=284.2, rightClusterLeft=253, rightClusterWidth=120` → **31.2px of hard box overlap**. The dropdown chevron measures 260.2-274.2, i.e. **entirely inside the Approvals button's 253-290 footprint**.

**Not mobile-only, and not a "long" title.** The right cluster (:2987) always renders three buttons once there are messages — `ApprovalInbox` does **not** return null (`ApprovalInbox.tsx:142` returns `<Popover>` unconditionally), and both toggles are `h-9 w-9` and unconditional. But `ApprovalInbox.tsx:152` labels its text `className="hidden text-xs sm:inline"` — a **viewport** media query — so at ≥640px the word "Approvals" appears and the cluster grows to ~174px. The overlap condition is `clusterWidth + 16 > 0.27 × headerWidth`, so at 174px the chat column must exceed ~700px to be safe: **with the 260px sidebar expanded, that is a ~980px viewport. A 900px desktop browser window overlaps.** Opening Artifacts or Research shrinks the column and reintroduces it at any window size. And because the abspos box is shrink-to-fit growing from its own left edge outward via the translate, any title over roughly 135px (~18 characters at 14px/500) already pushes past x=253.

**The paint-order reason in the original report is wrong, though the conclusion is right.** DOM order alone would not win: the title is `position:absolute` (positioned-descendant layer) while a plain in-flow sibling would paint below. The right cluster wins because **all three buttons independently carry `relative`** — `ApprovalInbox.tsx:148 "relative h-8 gap-1.5 px-2"`, `ResearchPanel.tsx:212` and `ArtifactsPanel.tsx:552` `'relative flex h-9 w-9 …'` — so they are positioned elements later in tree order. Remove those and the title would paint **over** the icons instead. This matters: the fix cannot rely on stacking order.

**Functional symptom the original report missed**: because the Approvals button paints and hit-tests above the title, the dropdown chevron at x=260-274 **is not clickable** — tapping the visible chevron opens the Approvals popover instead of Rename/Move/Delete. These are ghost/transparent buttons, so the visual is title text and icon glyphs superimposed, not a clean cut-off. Held at medium only because the title button's text region (x=106-253) is still clickable, so the conversation menu remains reachable.

**Reference** — `123-chatgpt-web-settings-notifications-codex-groupchats-marketing-top.png`: ChatGPT's chat header keeps the title in flow between the left and right control groups so it truncates instead of sliding under them.

**Fix** — Stop absolutely positioning the title. `ConversationTitleMenu.tsx:66` → `<div className="flex min-w-0 flex-1 items-center justify-center px-2">`, and add `shrink-0` to the left group (`WebChatPage.tsx:2943`) and the right group (:2987). The inner `min-w-0` + `truncate` (:91/:93) then operate against real available space. Caveat: the title will centre in the leftover space rather than on the header midpoint, so it shifts a few px when the Share button or AGI Work toggle appears — if exact optical centring matters, use `grid grid-cols-[1fr_auto_1fr]` with the title in the middle cell.

---

**WEB-5 · MEDIUM · Team member email is clipped with no ellipsis, and a long name collides with the Role select**

**Where** — `apps/web/features/settings/sections/TeamSection.tsx:534`

```tsx
<div
  style={{
    color: 'var(--text-3)',
    fontSize: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }}
>
  {member.email}
</div>
```

**Symptom** — `text-overflow: ellipsis` is **inert without `white-space: nowrap`**, so the email is hard-clipped mid-character with no "…" — the user cannot tell the address is truncated. On the same row, `member.name` (:528, `<div style={{ color: 'var(--text-1)', fontSize: 13, fontWeight: 600 }}>`) has **no overflow handling at all**, and the row div has no `overflow`, so overflowing name text paints across the 135px Role `<select>` (:557) and the delete button — stopped only by the SectionCard's `overflow: 'hidden'` (:80).

All styling is inline; there is no white-space inheritance anywhere in the chain. The sibling sections prove the intended pattern — `ArchivedChatsSection.tsx:249-253` and `AccountSection.tsx:450-453` both set the full `overflow`/`textOverflow`/`whiteSpace: nowrap` trio. Reachable: TeamSection is wired at `WebSettingsModal.tsx:505` and `team` is a live nav item (`packages/ui/ui/src/settings-nav.ts:282`).

**Geometry corrected.** Desktop available width is **~295px**, not ~200px: the dialog is `w-[min(96vw,860px)]` with a 220px nav (`SettingsModal.tsx:1884, 1889`) → 640px pane; `px-8` → 576px (the `max-w-[672px]` cap at :1971 is never reached); card padding `12px 20px` → 536px; minus avatar 34 + select 135 + button 36 + three 12px gaps = 241px → **~295px** for the name/email column. At 12px that clips around 47+ characters.

**The example email does not reproduce it** — `firstname.lastname@engineering.acme-corporation.com` contains a **hyphen**, which is a line-break opportunity, so it wraps to two lines and the row grows (`minHeight: 66`, no fixed height). Reproduce with a hyphen-free address such as `firstname.lastname@engineeringplatform.acmecorporation.com`: dots and `@` are not break opportunities, so the whole run overflows and `overflow: hidden` shears it mid-character.

**The ≤768px case is the severe one, and the mechanism is flex math.** Below `md` the nav stacks and main goes full width (96vw). At a 390px viewport the card content is ~302px, and because the name/email column is `flex: 1` (basis 0) it receives only the leftover after the **fixed 241px** — about **61px**. There the email clips after ~10 characters, and ordinary display names ("Siddhartha" at 13px/600 is ~75px) overflow the 61px box and paint directly on top of the Role `<select>` and the trash button.

**Reference** — `145-chatgpt-web-settings-account-name-username-email-delete.png`: the account email ellipsises cleanly and never crosses the control on its right.

**Fix** — Add `whiteSpace: 'nowrap'` to the email block and the full trio to the name div. **This alone leaves the mobile row at a 61px text column showing ~"firstna…"** — a complete fix also needs the controls to yield below `md`: wrap the row (`flexWrap: 'wrap'`) or drop the select to `width: '100%'` on a second line at narrow widths.

---

**WEB-6 · MEDIUM · Long tool names blow out the tool-call row and force a horizontal transcript scrollbar**

_See SHR-4 — the defect lives in `packages/ui/unified-chat/src/components/InlineToolCall.tsx` and only apps/web consumes it._

---

**WEB-7 · MEDIUM · Four different colours are used as "the primary action" across chat and settings**

**Where** — `apps/web/features/chat/components/Composer/SendButton.tsx:94`

```tsx
canSend
  ? 'bg-terra-cotta-500 hover:bg-terra-cotta-600 text-white shadow-md'
  : 'bg-muted text-muted-foreground cursor-not-allowed',
```

**Symptom** — In a single session the user sees four unrelated hues for one role:

- composer **Send** = terra-cotta `#da7756` (`globals.css:115`)
- composer **Queue** one row away = `bg-amber-500` (`SendButton.tsx:72`)
- Settings → General **"Save profile"** and the active Appearance swatch = `bg-amber-600` `#d97706` (`apps/web/features/settings/sections/GeneralSection.tsx:393, 423`)
- Style-selector **Save** and image-edit **Apply** = `bg-primary`, resolving to blue `hsl(221.2 83.2% 53.3%)` (`globals.css:578` via `:169 --color-primary: hsl(var(--primary))`; dark override at `:696`)
- shared settings modal primaries ("Add", "Connect remote MCP server") = `bg-foreground text-background` (`packages/ui/ui/src/settings-modal/SettingsModal.tsx:1262, 1302`)

**A fifth hue the original claim missed**: `.agi-dashboard-theme` (`globals.css:1463`) sets `--primary: 200 98% 39%` at `:1545` — **cyan** — so the identical `bg-primary` button is blue in chat and cyan on the dashboard route.

**Stronger same-screen evidence**: `apps/web/features/chat/components/ImageGenerationCard.tsx:575` renders a rounded-full `h-7 w-7` lucide-Send confirm button as `'bg-primary text-primary-foreground hover:bg-primary/90'` (aria-label "Apply edit") **in the message stream**, directly above the terra-cotta rounded-full ArrowUp composer Send — same shape, same icon, same semantics, two hues, on screen simultaneously whenever a generated image is in the transcript. And `Composer/StyleSelector.tsx:299` puts a solid blue `bg-primary` Save about 40px from the terra-cotta Send.

All of it ships: `WebChatPage.tsx:3059/:3134` and `app/chat/projects/[id]/page.tsx:553` render `ChatComposerNew` → `SendButton` (:2761) → `ComposerFooter` → `StyleSelector` (:725); `WebSettingsModal.tsx:503/:521` mounts GeneralSection inside the shared SettingsModal.

**Reference** — `132-chatgpt-web-settings-billing-plan-history-billing-info.png`, `176-claude-web-sidebar-customize-modal-artifacts-routines-dispatch.png`: one primary fill across composer, settings and modals in each product.

**Fix — narrower than the original proposal.** **Do NOT** convert SettingsModal's `bg-foreground text-background` to `bg-primary`: references `161-claude-web-settings-plugins-empty-state-browse-cta.png` and `177-claude-web-settings-panel-claude-code-appearance-prefs.png` show Claude's own settings modal using exactly that neutral high-contrast fill for Browse / Add, with the accent reserved for toggles — our shared modal already matches the reference.

The actual drift is **inside chat**: terra-cotta (`SendButton:94`) + amber (`SendButton:72`, `GeneralSection:393/423`) + blue (`StyleSelector:299`, `ImageGenerationCard:575`, `ChatComposerNew:1844`) for one role. Two caveats before rebinding `--primary` to terra-cotta: it recolours roughly a hundred _informational_ `bg-primary/10` / `text-primary` tints (`ResearchPanel.tsx:62/160/222`, `ArtifactPreview.tsx:1408`, `ChatComposerNew.tsx:2083` unread badges) that are not primary actions; and it does not touch the `.agi-dashboard-theme` cyan at `globals.css:1545`, which must be removed separately.

_(Note: `apps/web/features/chat/components/Main/ChatHeader.tsx` is dead code — barrel-exported at `Main/index.ts:1`, rendered nowhere.)_

---

**WEB-8 · MEDIUM · Usage progress bar colour never changes on web, but changes at three different thresholds elsewhere**

_Cross-surface; see CRS-2. The web instance is `apps/web/features/settings/sections/UsageSection.tsx:96-102`._

---

### Shared UI (`packages/ui`)

**SHR-1 · HIGH · `Menu` is not portaled, so any menu opened inside a Dialog renders ~530px from its trigger — and vanishes on wide displays**

**Where** — `packages/ui/ui/src/sidebar/Menu.tsx:115-131` (root cause), triggered from `packages/ui/ui/src/settings-modal/SettingsModal.tsx:1253` and `:1624`

```tsx
<Menu
  align="end"
  trigger={({ toggle, open }) => (
    <button type="button" onClick={toggle} aria-haspopup="menu" ... >
      Add
      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
```

`Menu.tsx` renders the panel as a **direct inline child** of the trigger wrapper — no `createPortal` anywhere in the file:

```tsx
<div ref={containerRef} className={cn('relative', className)}>
  {trigger(...)}
  {open && (<div role="menu" style={menuStyle} className={cn('fixed z-[9999] min-w-[12rem] overflow-hidden rounded-md border p-1 shadow-lg', ...)}>
```

`computePosition` (:67-82) sets `style.top = rect.bottom + 4` and, for `align="end"`, `style.right = window.innerWidth - rect.right` — pure **viewport** coordinates.

**Symptom** — `packages/ui/ui/src/primitives/Dialog.tsx:110` is `'fixed left-[50%] top-[50%] z-[var(--z-modal,300)] grid w-[min(96vw,42rem)] max-h-[calc(100vh-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-hidden rounded-2xl …'`, and `SettingsModal.tsx:1886` passes `className="flex h-[min(94vh,680px)] w-[min(96vw,860px)] max-w-none flex-col gap-0 overflow-hidden …"` — overriding width/height/padding but **not** the translate, and adding a **second** `overflow-hidden`.

A non-`none` `translate`/`transform` ancestor becomes the containing block for `position: fixed`, so the viewport coordinates are re-anchored to the dialog's padding box, and both `overflow-hidden` declarations clip whatever falls outside. _(Tailwind v4 — `apps/web/package.json:169 "^4.2.2"` — compiles `translate-x-[-50%]` to the standalone `translate:` property, not `transform:`. Individual transform properties establish a containing block exactly like `transform`, so a reviewer grepping the compiled CSS for `transform:` must not wrongly refute this.)_

**Displacement is down-and-left.** `top = rect.bottom + 4` (a viewport y) is re-read as an offset from the dialog's **top** edge → the menu lands `dialogTop` pixels _below_ correct. `right = window.innerWidth - rect.right` is re-read from the dialog's **right** edge → `dialogLeft` pixels to the left. At 1920×1080 the Add button sits around `rect.right≈1366, rect.bottom≈340`; the menu is written as `top:344 / right:554` but resolves to viewport x 628-836, y 544 — a 208px-wide popover floating in the middle-left of the connectors table, ~530px left and ~204px below where it belongs.

**Total disappearance happens on LARGE viewports, not small ones** (the original report inverted this). Full horizontal clipping needs `dialogRight − (vw − rect.right) < dialogLeft`; with `rect.right ≈ dialogRight − 24` that reduces to `836 < (vw − 860)/2`, i.e. **vw > ~2532px**. So "click Add and nothing happens" appears on any 2560px display (27" QHD, Studio Display at default scaling) — a common developer setup. Below ~900px viewport the dialog is 96vw, `dialogLeft` collapses to ~2vw, and the menu renders very nearly in the right place.

**No alternate path when clipped.** `setView('add-custom')` is reachable from only two places: the Menu item at :1277, and the button at :1299 which lives inside the `connectors.length === 0` empty-state branch (:1288). A user who already has one connector has **the Menu as the sole route** to "Add custom connector".

Shipped: `apps/web/features/settings/components/WebSettingsModal.tsx:33` imports `{ SettingsModal, SETTINGS_NAV_GROUPS_WEB }` and renders it at :523; `app/settings/page.tsx` and `app/connectors/page.tsx` both mount `SettingsModalRedirect` opening this modal.

**Reference** — `180-claude-web-settings-panel-connectors-list.png`: the "Add ⌄" control drops its menu directly beneath the button, inside the modal, never detached.

**Fix** — Portal the open panel to `document.body`:

```tsx
createPortal(<div role="menu" style={menuStyle} …/>, document.body)
```

This escapes both the containing block and both `overflow-hidden` clips while leaving the `getBoundingClientRect` math valid.

**Two things the fix must also handle.** (1) The outside-click handler at `Menu.tsx:93-97` closes when the pointerdown target is not inside `containerRef` — once portaled, **every click on a menu item becomes "outside"** and the panel would close before `MenuItem`'s `onClick` fires. Include the panel's own ref in the containment test (or invert the check). (2) `Menu.tsx:12-16` carries a doc comment asserting the exact premise this bug violates — _"the panel uses `position: fixed` with coordinates computed from the trigger's getBoundingClientRect so the menu always escapes any `overflow-hidden` or `overflow-y-auto` ancestor"_. Correct it alongside the code, or the next reader will re-introduce the assumption.

This single fix also prevents the same failure for every `Menu` opened inside any future dialog on any surface — the highest-leverage change in this audit.

---

**SHR-2 · HIGH · Conversation row actions are hover-only, and the invisible strip still steals taps**

**Where** — `packages/ui/ui/src/sidebar/SessionItem.tsx:150`

```tsx
<div className="flex items-center gap-0.5 pr-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
```

```tsx
// packages/ui/ui/src/sidebar/Sidebar.tsx:143
isMobile: _isMobile = false,
```

**Symptom** — `apps/web/features/chat/pages/WebChatPage.tsx:429-430` sets `isNarrowViewport` from `window.matchMedia('(max-width: 768px)')`, lines 2875-2884 wrap the shared `Sidebar` in a `fixed inset-y-0 left-0 z-50 w-[280px]` off-canvas drawer at that width, and line 2890 passes `isMobile={isNarrowViewport}` into **the prop that is discarded**. There is no `onContextMenu`, no long-press handler, and no `@media (hover: hover)` guard anywhere — I grepped `apps/web/app`, `apps/web/features`, `packages/ui/ui/src` and `packages/ui/unified-chat/src` for `hover: none` / `pointer: coarse` / `hover: hover`: **zero hits**.

**The real symptom is worse than "unreachable".** `opacity: 0` does not remove an element from hit-testing — `pointer-events` is untouched. The actions div is a flex **sibling** of the title button (:127-148 is the title button with `min-w-0 flex-1`; :150-281 is the actions div with `pr-1.5` and two `h-6 w-6` buttons). So there is a live, **completely invisible ~30px strip** at the right edge of every conversation row in the mobile drawer. Tapping it does **not** select the conversation — it opens the pin/star/rename/share/archive/delete menu the user never saw.

**"Every per-conversation action is unreachable" is too strong.** `WebChatPage.tsx:2973-2985` always renders `ConversationTitleMenu` in the chat header, and that component has no responsive hiding (`absolute left-1/2 flex max-w-[46%] …`), so **Rename, Move to project and Delete do work on mobile** — via opening the chat first. `:2955-2967` renders Share in the same header. What is genuinely unreachable on mobile web is **Pin, Star, Archive/Restore, and the custom-instructions shortcut**, plus performing any action without first opening the conversation.

**Reference** — `077-chatgpt-ios-sidebar-nav-recents-chat-history-fab.png` and `118-claude-ios-nav-drawer-chats-recents-new-chat-button.png` show that neither reference product puts a visible per-row `…` in the mobile drawer either — both keep the drawer to plain title rows and route management to a dedicated Chats/Library screen or a long-press.

**Fix** — The minimum correct fix is **to stop rendering an invisible-but-tappable control**. Note that wrapping the hide in `@media (hover: hover)` does _not_ automatically remove the phantom hit strip — the div would then be visible; if it should stay hidden on touch it must be `pointer-events-none` or unmounted, otherwise the mis-tap survives. Either:

```tsx
className={cn('flex items-center gap-0.5 pr-1.5 transition-opacity',
  !isMobile && 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100')}
```

(threading `isMobile` down from `Sidebar.tsx:143`), or follow the references and give mobile a dedicated long-press/management surface.

---

**SHR-3 · MEDIUM · Settings is English-only while the same panel offers 12 display languages**

_See CRS-8 — the nav array is `packages/ui/ui/src/settings-nav.ts:89-99` and the gap spans both web and desktop._

---

**SHR-4 · MEDIUM · Long tool names blow out the tool-call row — `.inline-tool-call__label` is `shrink-0` with no ellipsis**

**Where** — `packages/ui/unified-chat/src/components/InlineToolCall.tsx:409`

```tsx
<span className={cn('inline-tool-call__label text-sm font-normal shrink-0', colorClass)}>
  {label}
</span>
```

**Symptom** — The bar (:400-406) is `'inline-tool-call__bar flex items-center gap-2 select-none', 'h-7 px-1 rounded-md'` — no `min-width:0`, no `truncate`, no `overflow-hidden`. A flex item with `flex-shrink: 0` and `width: auto` is sized at max-content and will not wrap or shrink, so a long label overflows the bar. `grep -rn "inline-tool-call" --include="*.css"` over `apps/web/app`, `apps/desktop/src` and `packages/ui` returns **nothing** — no stylesheet, media query or utility rescues it.

Cascade of consequences: the sibling summary (:413-422) already has `max-w-[360px] min-w-0 flex-1` with `whitespace-nowrap overflow-hidden text-ellipsis`, so **it collapses to zero and the duration silently disappears** (it is not pushed off the edge). Then `<StatusIndicator>` (:431) and the `shrink-0` chevron (:437) are pushed past the right edge of the message column. There is no `overflow-hidden` between the bar and `.message-inner`, so the overflow either extends past the viewport or turns the scroll container's overflow-x to `auto`, **giving the transcript a sideways scroll**.

Production path: `apps/web/features/chat/components/messages/MessageBubble.tsx:961/978/1029` → `ToolTimeline.tsx:582` → `packages/ui/unified-chat/src/components/ToolCallCard.tsx:371-382` renders `<InlineToolCall label={name} iconStyle="badge" …/>`. So **line 409 is the shipped branch**; line 513 (lucide mode) is only reached by `apps/web/app/dev/inline-toolcall-demo/page.tsx`.

Long labels are real: `ToolTimeline.tsx:556` passes `humanizeToolName(...)`, which for any connector call returns `describeMcpTool(name).label` from `apps/web/features/connectors/lib/mcp-tool-name.ts:62/66` — `` `Custom connector · ${toolName}` `` or `` `${displayName} · ${toolName}` ``. The repo's own catalog carries `post_pull_request_review` and `get_pull_request_diff` (`config/connector-logos.ts:564`), producing "GitHub · post_pull_request_review" (33 chars) and "Custom connector · get_pull_request_diff" (40).

Width: `.message-row { @apply relative py-3 px-4 }` and `.message-inner { @apply max-w-3xl mx-auto flex gap-3 }` (`apps/web/app/globals.css:875-888`). On a 390px viewport the assistant column is ~358px; ToolTimeline's icon column takes ~26px and the bar's `px-1` another 8px, leaving ~324px, of which the badge + gaps + status + chevron consume ~76px. **Overflow begins past roughly 35 characters** — a narrow-viewport / mobile-web defect; at desktop `max-w-3xl` (768px) these labels fit.

Medium, not high: the whole bar carries `role="button"`, `tabIndex=0`, `onClick={toggle}` and `onKeyDown` (:392-399), so tapping the visible label still expands the row and keyboard Enter/Space still works. The damage is a tool name cut off by the viewport with no ellipsis, an invisible running-spinner/error icon, a silently-gone duration, and a sideways-scrolling transcript.

_(Scope: only apps/web consumes this — `grep -rln "ToolCallCard|InlineToolCall" apps/desktop/src` returns nothing, and mobile explicitly replaced it per `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:11`.)_

**Reference** — `183-claude-web-cowork-task-outputs-benchmark-spec-files.png`: Claude truncates the tool label and keeps status/chevron pinned to the right edge of the row.

**Fix** —

```tsx
className={cn('inline-tool-call__label text-sm font-normal min-w-0 shrink truncate', colorClass)}
```

plus `title={label}` so the full name is available on hover. Add `shrink-0` to `StatusIndicator`'s icons (:266-292) — they currently have none, so once the label can shrink the SVGs would squash before the label ellipsizes.

---

**SHR-5 · MEDIUM · The quota-refusal card offers "Retry" on desktop and "Try later" on web — same-looking card, opposite actions**

**Where** — `packages/ui/unified-chat/src/components/MessageLimitCard.tsx:153-162`

```tsx
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                aria-label="Retry this response"
                className="rounded-lg border border-[var(--chat-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--chat-text-primary)] transition-colors hover:bg-[var(--chat-surface-hover)]"
              >
                Retry
              </button>
```

**Symptom** — Two independently-styled cards exist for the same managed-quota refusal. Desktop reaches `MessageLimitCard` via `DesktopShellV3.tsx:641` → `ChatInterface.tsx:891` → `MessageList.tsx:197` → `MessageBubble.tsx:861-864`, and the Retry button does render (ChatInterface wires `onRegenerateMessage` only when `runtime.deleteMessages` exists, which desktop's `CloudRuntime.ts:1677` implements). Web ships `apps/web/features/chat/components/InlinePaywallCard.tsx` via `app/chat/page.tsx:12` → `WebChatPage.tsx:101` → `ChatMessageList.tsx:599-613`, whose secondary is `<Button variant="ghost" size="sm" onClick={onDismiss}>Try later</Button>` (:241-243). Web also wraps its icon in a 32px amber circle (:277-279) and appends a `TierBadge` to the title (:287, defined 206-213); desktop renders a bare 20px icon with no badge.

**Low, not medium**: both cards are legible, complete (headline, reason, reset line, upgrade CTA) and internally coherent, and **no user ever sees both** — the divergence is observable only by reading two codebases. Polish/consolidation, not a broken screen.

**Corrections to the original claim.** (1) **Drop mobile.** `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` is not the same card — it is a `@gorhom/bottom-sheet` **modal** with a `BottomSheetBackdrop` and an X close (:29-34). A modal must have a dismiss, so its "Try later" (:281) is required behaviour, not divergence. (2) **Retry is not paywall-specific**: `MessageBubble` passes the host's _generic_ regenerate handler — the same one used for every failed turn (`:863 {...(onRetry ? { onRetry: () => onRetry(message.id) } : {})}` vs the failure block's identical call at :894). Within desktop, Retry on a refusal is consistent. (3) **"Straight back into the same limit" is only partly true**: `MessageLimitCard.tsx:35` maps feature `request_rate` to "You are sending requests too quickly", where Retry after a pause is correct. The dead-end case is narrow — a hard `token_cap` with no upgrade tier. (4) **The lifecycles genuinely differ, which justifies the label split**: web's card _replaces_ the assistant message slot and is ephemeral (`ChatMessageList.tsx:599 if (paywall) { return <InlinePaywallCard … onDismiss={handlePaywallDismiss} /> }`), so dismiss is meaningful; desktop's is rendered **inside the persisted bubble** from `message.metadata.paywall` (`MessageBubble.tsx:637 readMessagePaywall(message.metadata)`), which survives reload — there is nothing to dismiss, and adding one would be the wrong semantic.

**Fix** — The consolidation direction is already half-built and deliberately unrouted: `apps/web/features/chat/pages/UnifiedChatPage.tsx` → `v3/WebShellV3.tsx:152` → `ChatInterface` already renders `MessageLimitCard` on web, but `/chat` deliberately renders `WebChatPage`, and `apps/web/features/chat/pages/__tests__/chat-route.test.tsx:49-56` asserts that (`expect(screen.queryByTestId('unified-chat-page')).toBeNull()`). So consolidating means **finishing the WebShellV3 cutover and updating that test**, not swapping a component inside `ChatMessageList`. Reconcile the lifecycles first (persisted vs ephemeral), then unify the icon chip, tier badge and secondary-action semantics, exposing Retry only when the refusal is retryable.

---

**SHR-6 · LOW · Conversation row action buttons are 24×24px targets**

**Where** — `packages/ui/ui/src/sidebar/SessionItem.tsx:175`

```tsx
className =
  'flex h-6 w-6 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]';
```

**Symptom** — Both the `…` actions button (:175) and the sparkle custom-instructions button (:159) are `h-6 w-6` with **zero padding**, so 24×24px is the entire hit area (the wrapper's `pr-1.5` is container padding, not clickable). Container gap is `gap-0.5` (2px). Nothing compensates: `apps/web/app/globals.css:1102` styles `button/[role=button]` with `transition-all` only; the `.touch-target` helper (:1096) is opt-in and unused here; `min-h-[44px]` exists only in `ResponsiveContainer.tsx:219`, which this component does not use.

24px is under the ~32px pointer threshold, and a near-miss has a concrete consequence: it lands on the row select button (`min-w-0 flex-1`, :132) and **navigates into a different conversation**.

**"Two of them side by side" is the uncommon case** — the sparkle renders only when `session.hasCustomInstructions && onOpenCustomInstructions` (:151), so nearly every row shows a single 24px `…`. The reproducible symptom is the single-target miss, not hitting the wrong one of two.

**The 44px touch framing is wrong and hides a bigger fact**, which is SHR-2: line 150 is `opacity-0 …group-hover:opacity-100` with **no `pointer-events-none`**, so on the mobile drawer these controls are invisible yet still tappable. The applicable standard for the desktop hover affordance is the ~28-32px pointer target.

Shipped via `Sidebar.tsx:438` → `WebChatPage.tsx:2885` (both the desktop rail and the 280px mobile drawer at :2879).

**Fix** — `className="flex h-8 w-8 items-center justify-center rounded-md ..."`, keeping the icons at their current sizes (`h-3.5 w-3.5` MoreHorizontal at :177, `h-3 w-3` Sparkles at :161), and widen the gap to `gap-1`. **Add `pointer-events-none` alongside `opacity-0` at :150 in the same change** — otherwise raising the hit area to 32px merely enlarges the invisible tap trap on mobile.

---

### Cross-surface

**CRS-1 · MEDIUM · Plan usage is described with four different vocabularies across web, mobile, desktop and the Chrome side panel**

**Where** — `apps/web/features/settings/sections/UsageSection.tsx:218-241`

```tsx
<UsageBar
            label="Rolling 5 hours"
            percent={sessionUsedPercent}
            value={`${sessionUsedPercent}% used`}
            detail={`${100 - sessionUsedPercent}% remaining · ${formatReset(usage?.session_reset_at ?? null, 'rolling', nowMs)}`}
          />
          <UsageBar
            label="Rolling 7 days"
...
          <UsageBar
            label="Most capable models · 7 days"
...
          <UsageBar
            label="Account month"
```

**Symptom** — The same four server fields (`session_`, `weekly_`, `flagship_weekly_`, `usage_percentage` + `*_reset_at` from the CloudUsage contract) are labelled differently on **four** surfaces, with **five** reset formats:

| Surface                                                                                        | Labels                                                                                                      | Reset format                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Web** (UsageSection.tsx:218-241)                                                             | Rolling 5 hours / Rolling 7 days / Most capable models · 7 days / Account month                             | "Capacity refreshes in 3 hours (Jul 26, 4:00 PM)" (`formatReset`, :56-62) |
| **Mobile** (`apps/mobile/src/features/settings/cloud-usage/index.tsx:328,351,365,379,430`)     | Current session / Weekly limits → All models / Flagship models / This period                                | "in 3 hr 27 min" (:73-84), "Sat, 10:00 AM" (:65-69)                       |
| **Desktop cloud** (`apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:408-430`) | `${PLAN_DISPLAY_NAMES[tier]} plan` / **Current 5-hour window** / Weekly usage / Flagship model weekly usage | "Resets Jul 26, 2026, 4:00 PM" (`formatUsageReset`, :140-148)             |
| **Chrome side panel** (`apps/extension/src/side_panel.ts:6707`)                                | one line, no bar: ``quotaLabelEl.textContent = `Cloud usage: ${usage}${resetLabel}`;``                      | `toLocaleDateString()` (:6704)                                            |

So the same 5-hour window is "Rolling 5 hours" / "Current session" / "Current 5-hour window" / unnamed. Layout differs too — desktop uses a 2-up `sm:grid-cols-2` grid of cards, web a single stacked column, so even the session-vs-weekly grouping is lost.

**Corrections to the original claim.** The cited `apps/desktop/src/features/settings/UsageProgressBars.tsx` is **not** the desktop view of these buckets and is **not shipped** — it has no importer anywhere in `apps/`/`packages/` (the only other repo hit is a prose comment at `stores/billing/usageSlice.ts:21`), and it renders a different data source entirely (the local BYOK token budget: "Token Budget Usage", `{budget.currentUsage} / {budget.limit} tokens`, `Estimated cost: $…`). Citing it as a competing vocabulary for the same server quota is a category error. The correct desktop evidence is `DesktopCloudSettingsModal.tsx:408-430`, which makes the finding **stronger** — a genuine fourth vocabulary.

Also: web prints a redundant `${100 - pct}% remaining` next to `${pct}% used` on every bar (:222, 228, 234, 240) — no reference surface does this, and it doubles the sub-line length.

**Reference** — Claude ships one vocabulary everywhere: `123-claude-ios-settings-usage-session-and-weekly-limits-fable.png` ("Current session · 2% used · Resets in 4 hr 28 min" / "Weekly limits" → "All models" / "Fable only") is word-for-word the same screen as `145-claude-desktop-settings-usage-plan-limits.png`.

**Fix** — Adopt one labelled set (the mobile/Claude wording) and one reset format. **The delivery mechanism needs adjusting**: there is no existing shared usage component (the only `packages/ui` hit for `UsageMeter`/`UsageBar` is `unified-chat/src/components/UserProfile.tsx`, unrelated), and `apps/mobile` is React Native so it cannot import a DOM component. Share the **strings and formatters** (bucket labels + `formatSessionReset`/`formatWeeklyReset`/`formatPeriodReset`) from a platform-neutral module alongside the CloudUsage contract, then build one DOM `UsageMeters` in `packages/ui/unified-chat` consumed by web's `UsageSection` and `DesktopCloudSettingsModal`, plus a thin RN renderer in mobile over the same labels. Replace the extension's plain text with the same three-bucket bar block, and drop the redundant "% remaining".

---

**CRS-2 · LOW · Usage bar colour never changes on web, but changes at three different thresholds elsewhere**

**Where** — `apps/web/features/settings/sections/UsageSection.tsx:96-102`

```tsx
<Progress
  value={percent}
  aria-label={`${label} usage`}
  className="h-2"
  indicatorClassName="bg-[var(--chat-accent-primary)]"
  style={{ background: 'var(--bg-hover, rgba(255,255,255,0.08))' }}
/>
```

**Symptom** — `packages/ui/ui/src/primitives/Progress.tsx:43` applies `indicatorClassName` to the indicator with no threshold logic, so the fill is a **constant colour at every percentage** across all four bars (:218-241). Five behaviours for one number:

| Surface                                                                  | Ladder                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| web Settings → Usage (:100)                                              | constant `--chat-accent-primary`                                                                            |
| web Billing → Usage (`features/billing/components/Billing/Usage.tsx:84`) | **also constant** — `<Progress value={usagePercent} className="h-3" />` with no `indicatorClassName` at all |
| desktop Cloud settings (`DesktopCloudSettingsModal.tsx:335`)             | constant `bg-primary`                                                                                       |
| desktop Local settings (`UsageProgressBars.tsx:25-29`)                   | blue → amber @80 → red @95                                                                                  |
| desktop Usage dashboard (`UsageDashboard.tsx:28-33`)                     | green → blue @50 → amber @80 → red @>95                                                                     |
| mobile (`cloud-usage/index.tsx:101, 118`)                                | `const isNearLimit = clamped >= 90;` … `backgroundColor: isNearLimit ? colors.agentError : colors.teal`     |

**"A user at their cap gets no colour warning at all" on web is wrong as stated.** The same web app already colour-codes the same number elsewhere: `packages/ui/ui/src/sidebar/Sidebar.tsx:1013-1017` does `budgetPercent >= 95 ? 'bg-red-500' : budgetPercent >= 80 ? 'bg-amber-500' : 'bg-blue-500'`, fed by `WebChatPage.tsx:2905 budgetPercent={managedBudgetPercent}` = `getWorstUsagePercent(managedUsageSummary)` (:810-812) — the worst of the exact four windows UsageSection renders. So the accurate symptom is a contradiction **inside web**: the chat sidebar bar goes amber at 80 and red at 95, and clicking through to Settings → Usage shows the identical percentage as a flat brand-accent bar.

Low: each bar prints its own state in text immediately above and below (`${pct}% used` at :221 and `${100-pct}% remaining · …reset…` at :222), so no information is lost — only the redundant colour cue.

**Reference** — Claude uses one ladder on every surface (blue → amber at 83% → red at 100%), visible side by side in `123-claude-ios-settings-usage-session-and-weekly-limits-fable.png` and `145-claude-desktop-settings-usage-plan-limits.png`.

**Fix** — One `usageBarTone(pct)` helper in `packages/ui/unified-chat`, driving every bar. **The proposed "<80 accent, 80-99 amber, ≥100 red" ladder would be invisible on web** — `--chat-accent-primary` is `#c8892a` (`app/globals.css:646, :765, :782`), an amber/gold, and `:673` even aliases `--amber: var(--chat-accent-primary)`. The ladder needs a resting colour distinct from amber (or must escalate straight to a destructive token), and thresholds should match the sidebar widget's existing **80/95** so the two web surfaces stop disagreeing. Then delete the local ladders in `UsageProgressBars.tsx:25-29`, `UsageDashboard.tsx:28-33` and `cloud-usage/index.tsx:101`, and give `Billing/Usage.tsx:84` an `indicatorClassName`.

---

**CRS-3 · MEDIUM · Web and desktop ship two forked model pickers — visible stacked on one screen**

**Where** — `apps/web/features/chat/components/Composer/ComposerFooter.tsx:779-783`

```tsx
<PopoverContent align="end" sideOffset={6} className="w-72 p-0">
                {/* Header · model count badge removed per Claude reference */}
                <div className="flex items-center border-b border-border/40 px-3 py-2">
                  <span className="text-xs font-medium text-foreground">Models</span>
                </div>
```

**Symptom** — The primary evidence is **same-screen**, not cross-device. `apps/web/app/chat/projects/[id]/page.tsx:363` renders the shared `<ModelSelector onSettingsClick={() => router.push('/settings/general')} …/>` in the project header, and `:553` renders `<ChatComposerNew …/>` directly below it, which renders ComposerFooter's bespoke popover. **Both drive the same `useChatModelStore`.** On `/chat/projects/<id>` a user sees two model dropdowns stacked in one viewport:

|             | Web fork (ComposerFooter)                                                | Shared `ModelSelector`                                    |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Width       | `w-72` = 288px                                                           | `w-80` = 320px (:662)                                     |
| Title       | "Models"                                                                 | "Model" + provider-count pill (:669-680)                  |
| Grouping    | flat Available / "More models"                                           | collapsible per-provider groups with brand logos          |
| Hero row    | none                                                                     | "Best (auto)" `BestAutoRow` with routing badge (:714-724) |
| Row anatomy | logo + capability badges + Coming soon/Beta/Pro/Upgrade pills (:425-483) | `TierBadge` fast/premium/standard (:820) + "128K ctx"     |
| Footer      | none                                                                     | "Manage API Keys" (:862-878)                              |

Desktop renders the shared one (`DesktopShellV3.tsx:641` → ChatInterface → `ChatInput.tsx:1093 <ModelSelector className="min-w-0 max-w-[12rem]" />`); web's main chat never renders shared ChatInput.

**Two claims corrected.** (1) **"Best (auto) simply does not exist on web" is false** — `ComposerFooter.tsx:282-296` defines `const isAuto = (m: AIModel) => m.providerKey === 'managed_cloud';` and `orderAutoFirst` places them first in both groups; the locked free-trial trigger at :735 is aria-labelled "Auto Economy is selected for the free web trial". Web lacks the _hero-row treatment_, not the option. (2) **"No tier badges" overstates it** — web rows carry a ProviderLogo (:425), capability badges (:445-456) and Coming soon / Beta / Pro / Upgrade pills (:458-483). What is missing is the fast/premium/standard `TierBadge` chip and the context label.

**Reference** — `107-claude-ios-cowork-select-model-modal-fable-5-opus-sonnet-haiku.png` and `073-chatgpt-ios-chat-model-picker-intelligence-tier-popover.png`: the same list with the same one-line descriptions on every surface.

**Fix — a straight swap is unsafe.** The popover block ends at **line 935**, not 950 (938-963 are the "Switch model mid-conversation?" AlertDialog, which must be preserved). More importantly, replacing it with `<ModelSelector>` would regress web-only behaviour the shared component does not implement: the model search field (788-800), the "More models" collapsible with tier-locked upgrade CTAs (887-925), the high-usage-rate tooltip (490-499), the extended-thinking Switch + reasoning-effort Slider (805-861), and the `lockModelSelector` free-web-trial button (730-740). Lift those into the shared `ModelSelector` behind props (search, tier-lock/upgrade rows, locked-trial mode), then converge. At minimum, unify header label, width, provider grouping and row anatomy so the two pickers on `/chat/projects/[id]` stop reading as different controls.

---

**CRS-4 · LOW · Sidebar account footer paints two chevrons, and its click bounces the user out of the Code workspace**

**Where** — `apps/web/features/chat/v3/WebSidebar.tsx:619-623`

```tsx
                  {planDisplayName}
                  <ChevronDown size={9} />
                </div>
              </div>
              <ChevronDown size={12} style={{ color: 'var(--chat-text-muted)', flexShrink: 0 }} />
```

**Symptom** — **Two** ChevronDown icons render inside the same footer button — one at 9px beside the plan line (:620), one at 12px at the row end (:623). Both always render when the sidebar is expanded, because `planDisplayName` has a hard fallback (`const planDisplayName = subscription?.display_name ?? 'Free'`, :170) and both sit inside the same `{!collapsed && (<>…</>)}` block. The affordance reads as a menu twice over.

**Desktop is not the same markup** (so the "pixel-identical" premise is wrong): `apps/desktop/src/features/v3/Sidebar.tsx:985` renders `{isSignedIn && <ChevronDown size={9} />}` — a single chevron, only when signed in — and puts a distinct 36×36 Settings gear at the row end (:989-1011, `<Settings size={15} />`). The reference confirms desktop is correct: `165-claude-web-home-chats-and-tasks-recents-list-with-tasks.png` shows Claude web's footer as `S  Siddhartha · Max  ⌄` — exactly one chevron adjacent to the plan label, with an unrelated download icon at the row end. **Web is the only surface painting two.**

**The navigation half of the original claim is refuted.** The cited `apps/web/features/chat/v3/WebShellV3.tsx:147` (`onOpenAccountMenu={() => handleNavigateView('account')}`) is **not shipped UI** — WebShellV3's only chat consumer is `UnifiedChatPage.tsx:63`, and UnifiedChatPage is not mounted on any Next.js route (both `app/chat/page.tsx` and `app/chat/[sessionId]/page.tsx` dynamically import `WebChatPage`, which does not use WebSidebar at all). The one route that renders this footer is **`/chat/code`** via `apps/web/features/code/CloudCodePage.tsx:274-280`: `<WebSidebar mode="code" … onOpenAccountMenu={() => router.push('/settings/account')} />`.

And that click does **not** throw the user into a dead-end "account view": `app/settings/account/page.tsx` is only `<SettingsModalRedirect section="account" />`, and `features/settings/components/SettingsModalRedirect.tsx:42-43` does `openSettings(section); router.replace(returnTo)` with `returnTo = '/chat'`. So the user lands on `/chat` with the settings modal open at Account — the same destination desktop's AccountMenu "Privacy & security" reaches (`AccountMenu.tsx:71 openSettings('account')`). **Log out is reachable there** (`WebSettingsModal.tsx:12` documents `account -> AccountSection (sessions, user ID, logout)`, wired at :504) and **Language is reachable** (`features/settings/components/LanguageSelector.tsx`). The only genuine navigation complaint is narrower: because the shipped mount is `/chat/code`, clicking your avatar in the Code workspace **bounces you out of Code onto /chat** — a recoverable context loss.

**Fix** — Delete the 9px chevron at `WebSidebar.tsx:620` (or replace the 12px one at :623 with the Settings gear the desktop shell uses) so the row matches `Sidebar.tsx:985-1011` and the Claude web reference. Extracting `AccountMenu` into `packages/ui/unified-chat` is a product decision (popover vs. modal-first settings), not a defect remediation — web already reaches every item the desktop menu offers.

---

**CRS-5 · LOW · "New chat" is a boxed elevated button on web and a borderless ghost row on desktop — and the web sidebar has no hover state at all**

**Where** — `apps/web/features/chat/v3/WebSidebar.tsx:330-340`

```tsx
            borderRadius: 8,
            border: '1px solid var(--chat-border)',
            background: 'var(--chat-surface-elevated)',
            cursor: 'pointer',
            color: 'var(--chat-text-primary)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Plus size={14} />
```

**Symptom** — Both shells put "New chat" in the same slot, but web draws a filled, bordered, elevated control while `apps/desktop/src/features/v3/Sidebar.tsx:499-509` draws `border: 'none', background: 'transparent'` with `SquarePen`, its own comment reading _"Claude-style ghost row: transparent, borderless, hover-fill — not a boxed elevated form control"_. Search directly beneath is a ghost row on both, so on web New chat is the only boxed control in an otherwise borderless nav.

`WebSidebar.tsx` has zero `className` attributes and no source CSS in `apps/web` targets it, so the inline styles are final.

**The icon half of the fix is wrong and reference-contradicted.** `165-claude-web-home-chats-and-tasks-recents-list-with-tasks.png` shows Claude web's sidebar primary action as a **borderless ghost row labelled "New" with a `+` glyph** — which is what web already renders. Swapping to `SquarePen` would move web _away_ from the reference; desktop's `SquarePen` is the outlier.

**A stronger defect lives in the same component and should displace this one in the queue.** `WebSidebar.tsx` has **zero hover handling anywhere** — 0 occurrences of `hover`, 0 `className`, no `onMouseEnter`, and `grep -rn "chat-surface-hover" apps/web --include="*.css" --exclude-dir=.next` returns nothing, so no stylesheet supplies it either. Every row is a permanently static background: conversation rows at :502 `background: 'transparent'` **with no active/selected variant** (the only `data-active` styling in the file is the mode segmented control at :294), Search at :359-360, nav rows at :403-404, collapsed rail at :541-542. Desktop's equivalents do have it — `Sidebar.tsx:490 className="transition-colors hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"` and :519 for Search.

**User-visible symptom of the stronger defect:** on web chat (`/chat`, and Cloud Code via `CloudCodePage.tsx:274`), moving the pointer down a recents list — which grows to 30 items before the "Show all" cutoff at :495 — produces **no row highlight**, and the currently open conversation is **not marked**, so the user cannot tell which row they are about to click or which chat they are in. _Suggested severity: medium._

**Reference** — `083-codex-macos-sidebar-nav-projects-recent-chats.png`: Codex renders "New chat" as a borderless ghost row.

**Fix** — For the cosmetic half: `WebSidebar.tsx:332-333` → `border: 'none', background: 'transparent'`, **keeping `Plus`**. For the stronger half: add hover fill and an active/selected treatment to the conversation rows, Search, nav rows and collapsed rail, matching `apps/desktop/src/features/v3/Sidebar.tsx:490`.

---

**CRS-6 · MEDIUM · Chrome side-panel model badge has no truncation, so a long model name paints over the header icon buttons**

_This is the same root cause and file as CHR-3, verified independently in the cross-surface pass with browser measurement. Consolidated there._ The cross-surface point worth preserving: **every other surface truncates this exact string** — web `max-w-[140px] truncate` (`apps/web/features/chat/components/Composer/ComposerFooter.tsx:768` uses `<span className="min-w-[3.5rem] max-w-[140px] shrink truncate">`), the shared `ModelSelector` `max-w-[140px] truncate`, mobile `numberOfLines={1}`. The Chrome side panel is the lone surface that does not.

---

**CRS-7 · MEDIUM · 38 desktop sidebar strings are missing from all 11 non-English locales**

**Where** — `packages/ui/i18n/locales/de/v3.json:1`

```jsonc
// en/v3.json defines these; de/es/fr/it/pt/ru/ar/hi/ja/ko/zh all omit them:
  "sidebar.mode.local": "Local",
  "sidebar.mode.cloud": "Cloud",
  "sidebar.pinned": "Pinned",
  "sidebar.actions.rename": "Rename",
  "sidebar.actions.archive": "Archive",
  "sidebar.actions.delete": "Delete",
  "sidebar.noConversations": "No conversations yet",
  "emptyChat.neutralHeadline": "How can I help you today?"
```

**Symptom** — Flattening every `v3.json`: **en has 305 keys, all 11 non-English locales have exactly 267** — the same 38 keys absent from ar/de/es/fr/hi/it/ja/ko/pt/ru/zh (`sidebar.pinned`, `sidebar.actions.*`, `sidebar.projects.*`, `sidebar.mode.*`, `sidebar.signIn`, `sidebar.cloudSync`, `sidebar.archived`, `sidebar.noArchived`, `sidebar.noConversations`, `sidebar.showActive`, `sidebar.showArchived`, `emptyChat.neutralHeadline`, `emptyChat.modeLabel`, `emptyChat.cloudSync*`, `agiWork.projects.*`, `agiWork.scheduled.*`).

Consumers are shipped desktop UI: `Sidebar.tsx:100 result.push({ label: t('sidebar.pinned'), … })`, `Sidebar.tsx:780 {showArchived ? t('sidebar.noArchived') : t('sidebar.noConversations')}`, `LocalCloudToggle.tsx:97-98`. `baseInitOptions` in `packages/ui/i18n/src/index.ts:73` sets `fallbackLng: DEFAULT_LANGUAGE`, so misses render English rather than raw keys. Language is user-selectable from three places (`GeneralSettings.tsx:130`, `tabs/General/index.tsx:342`, `UserProfile.tsx:197`), and no existing guard covers this: `apps/desktop/src/i18n/__tests__/v3CorpusCoverage.test.ts` only asserts against `enV3` and never compares locale key sets.

**The stated symptom is false for 10 of the 11 locales.** German — the language the write-up picks — does not behave as described. `de/v3.json` still reads `"newChat": "New chat"`, `"searchKbd": "Search (⌘K)"`, `"recents": "Recents"`, `"nav": { "projects": "Projects", "artifacts": "Artifacts", "customize": "Customize", "scheduled": "Scheduled" }` and `"greetDay": "What can I help with, {{name}}?"`. There is no "Neuer Chat" and no "Suchen". **256 of de's 267 v3 values are byte-identical to English (96%)** — the same for fr, it, pt, ru, ar, hi, ja, ko, zh (`ja/v3.json`'s sidebar is likewise `"New chat"`, `"Recents"`, `"Projects"`, with only ライブラリ and タスク translated). So in German the sidebar is **not bilingual — it is already all-English**, and the 38 absent keys are indistinguishable from the 256 present-but-untranslated ones.

**Spanish is the only locale where the claimed symptom is visible.** `es/v3.json` is a real translation (10/267 identical to en): "Nuevo chat", "Buscar (⌘K)", "Recientes", "Proyectos", "Artefactos", "Personalizar", "Programado", "¿En qué puedo ayudarte, {{name}}?". Set the desktop language to Español and the 38 gaps stand out inside otherwise-Spanish chrome: an English "Pinned" group header once a chat is pinned, an English Local|Cloud toggle at the sidebar foot, English "Rename / Archive / Delete / Pin / Unpin" in every row menu, English "No conversations yet" / "No archived chats", and an English "How can I help you today?" empty-chat headline.

_(Line cite: the Local/Cloud labels are `LocalCloudToggle.tsx:97-98`, not 91-92.)_

**The larger defect this walked past:** the picker advertises 12 languages (`SUPPORTED_LANGUAGES`, `packages/ui/i18n/src/index.ts:27-40`), but for the v3 desktop shell **only English and Spanish are translated at all**. Picking Deutsch/日本語/中文/Русский/العربية changes the settings and chat namespaces while the entire shell stays English.

**Fix** — Adding 38 keys to de/ja/zh only takes them from 96% English to 100% English. The fix worth queuing is translating the 256 English-passthrough keys for the other ten locales. Regardless, add a CI check diffing the flattened key sets of every locale against `en` so the gap cannot regress.

---

**CRS-8 · MEDIUM · The Settings surface is 100% English on desktop and web despite both shipping a 12-language picker**

**Where** — `packages/ui/ui/src/settings-nav.ts:89-99`

```ts
export const SETTINGS_NAV: SettingsNavEntry[] = [
  {
    key: 'general',
    label: 'General',
    icon: Settings2,
    keywords: ['mode', 'keybindings', 'shortcuts'],
  },
  {
    key: 'account',
    label: 'Account',
```

**Symptom** — `label: string` (:77) is a plain hardcoded English string for all 20 entries, consumed by both surfaces: `apps/desktop/src/features/settings/SettingsPanel.tsx:10-11,107-108`, `apps/web/features/settings/components/WebSettingsModal.tsx:33,529`, `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:52,150,1105`. `grep -rl useTranslation apps/desktop/src/features/settings` returns **0 matches across 48 `.tsx` files**; on web, **1 of 50** (`LanguageSelector.tsx`).

The picker genuinely works: `GeneralSettings.tsx:122-136` Select → `onLanguageChange` → settingsStore → `I18nProvider.tsx:32-34,41` calls `i18n.changeLanguage()`.

**Corrected symptom** (the original's mixed-language contrast does not occur — see CRS-7): a user picks Deutsch and **almost nothing changes anywhere**. The v3 shell stays English because `de/v3.json` is 83% English passthrough; only "Bibliothek" and "Aufgaben" render in German, leaving two German words in an otherwise English sidebar. The Settings modal is then 100% English. Same in fr/ja/ar; es is the only genuinely translated locale.

**Tightest demonstrable instance, unreported:** `apps/desktop/src/features/settings/GeneralSettings.tsx:121` hardcodes `<Label htmlFor="language">Language</Label>`, and :113-115 hardcode `<SelectItem value="light">Light</SelectItem>` / Dark / System — even though `settings:language` ("Sprache"), `settings:theme`, `settings:light`, `settings:dark`, `settings:system` all exist **translated in all 12 locales**. **The control you use to select German is itself labelled in English while its German translation sits unused one file away.**

**RTL amplifier, also unreported:** `apps/desktop/src/i18n/index.ts:60` and `apps/web/app/i18n/index.ts:82` set `document.documentElement.dir = languageFor(code)?.rtl ? 'rtl' : 'ltr'`. Selecting Arabic **mirrors the entire settings modal layout** (nav rail, icon/label order, alignment) while 100% of its text remains English — right-aligned LTR English in a mirrored chrome. The most visually broken variant, and the best primary repro.

**The "existing translations" premise is largely wrong.** `settings.json` has only 63 keys and covers **3 of the 20** desktop nav labels: general ("Allgemein"), appearance ("Erscheinungsbild"), privacy ("Datenschutz"). There is **no key** for account, billing, usage, capabilities, agents, connections, cowork, connectors, agi-code, agi-in-chrome, plugins, memory, notifications, voice, extensions, or developer — **16 of 20 labels have no translation in any locale**. The cited "Modelleinstellungen" is not a nav label at all; that corpus targets an older settings layout (checkpointing, allowedDirectories, maxTimeout) that no longer matches the shipped IA. It is also semantically mismatched: the nav label for key `appearance` is "Personalization", but `de/settings.json` maps appearance → "Erscheinungsbild" ("Appearance").

Medium, not high: nothing is clipped, mispositioned or unreachable; every control works and all text is legible English. This is an i18n coverage gap and a broken product promise, not a rendering break.

**Fix** — (a) change `SettingsNavEntry.label` to `labelKey` resolved with `t()` in `SettingsModal.tsx`'s `NavButton`; (b) wire `useTranslation('settings')` through the desktop and web section components; (c) **author the ~16 missing nav keys × 12 locales** (this is not merely "wire up the existing corpus"); (d) retranslate the 256 English-passthrough v3 keys for de/fr/ja/ar.

---

**CRS-9 · LOW · The empty-chat state is three unrelated concepts across web and desktop**

**Where** — `apps/web/features/chat/components/GreetingBanner/GreetingBanner.tsx:26-52`

```tsx
const CHIPS: SuggestionChip[] = [
  {
    label: 'Code',
...
  {
    label: 'Life stuff',
    prompt: 'Help me with ',
    icon: <Coffee size={13} />,
  },
  {
    label: "AGI's pick",
```

**Symptom** — New-chat screens do not resemble each other.

**Web** (`app/chat/page.tsx:12,18` → `WebChatPage.tsx:3057 <GreetingBanner onSendMessage={setComposerPrefill} />`): serif time-aware headline over **5 pills that prefill the composer** — Code / Write / Learn / Life stuff / AGI's pick.

**Desktop shows TWO different starter systems stacked on one screen**, which the original claim understated:

- `DesktopShellV3.tsx:684 emptyStateSlot={<EmptyChat … />}` → `EmptyChat.tsx:19-30` renders BrandedGreeting plus large **prefill cards**:
  ```ts
  const STARTERS = [
    {
      label: 'Create a file or build a site',
      prompt: 'Create a file or build a site that ',
      icon: FilePlus2,
    },
    {
      label: 'Research and plan next steps',
      prompt: 'Research this topic and plan the next steps: ',
      icon: BookOpen,
    },
  ] as const;
  ```
  (plus a conditional third "scheduled" card)
- `packages/ui/unified-chat/src/components/ChatInterface.tsx:946` renders `<QuickChips … />` below the composer — **mode TOGGLES** (`QuickChips.tsx:23-30`, clicking sets `activeMode` at :41-45): Code / Write / Research / Image / Video / Computer

So one desktop screen shows greeting + 2-3 prefill cards + up to 6 mode-toggle chips — two visually distinct affordances with two different meanings for a tap. `QuickChips.tsx:37-39` also filters by `availability`, so the count is **not always six** — a runtime without video/computer support silently shows four, changing the chip row's size between hosts.

**The mobile leg is refuted and must be removed.** `apps/mobile/src/features/chat/components/ConversationStarters.tsx` is **dead code** — grep across `apps/mobile` finds zero app-code imports; only its own file, an unused barrel re-export at `src/features/chat/index.ts:14`, and a stale mock at `__tests__/chat-tab-mode-toggle.test.tsx:96`. **No user has ever seen "SwiftUI Auth" or "Tokyo Itinerary" cards.** What mobile actually shows: the Chat tab (`app/(app)/(tabs)/chat.tsx`) renders the AGI lockup + `{getTimeOfDayGreeting()}` (:727, defined 69-75) and **no chips and no cards at all** (`TaskChips` is imported at :22-23 but never rendered); an empty _existing_ conversation renders `ChatEmptyState.tsx:52 const headline = displayName ? \`Hi, ${displayName}\` : 'Ask anything';`from`MessageList.tsx:131` — headline + optional subtitle, again no chips.

_(Latent, not shipped: `WebShellV3.tsx:152` passes `emptyStateSlot={<WebEmptyChat />}` → `GreetingBanner` into ChatInterface, which **also** renders QuickChips at :946. If `UnifiedChatPage` were ever routed, web would show **both** chip rows with duplicate "Code"/"Write" labels and opposite semantics. Today `/chat` routes to WebChatPage.)_

**Reference** — `079-codex-macos-chat-empty-state-agiworkforce-quick-actions.png` / `083-codex-macos-sidebar-nav-projects-recent-chats.png`: Codex macOS and the Codex VS Code panel show the same four intent cards in both surfaces.

**Fix** — "Render `QuickChips` on all three" is **not implementable on mobile**: QuickChips is a DOM component bound to the unified-chat web Zustand store, not React Native. Mobile already has a native equivalent, `apps/mobile/src/features/chat/components/TaskChips.tsx:36-40` (Code / Write / Research), imported by the chat tab but not rendered. Corrected fix: (a) **delete `ConversationStarters.tsx` and its barrel export** — unreachable code that misleads audits; (b) on desktop, drop `EmptyChat`'s STARTERS cards **or** drop QuickChips for that host, so one screen offers one starter affordance; (c) align web's chip set and semantics with whichever model is chosen; (d) render mobile's existing `TaskChips` on the chat tab so mobile has a starter affordance at all.

---

**CRS-10 · MEDIUM · Keyboard hint is hardcoded per surface: web always prints "Ctrl+K", desktop always prints "⌘K"**

**Where** — `apps/web/features/chat/v3/WebSidebar.tsx:350, 379`

```tsx
            title="Search (Ctrl+K)"
...
                  Ctrl+K
```

**Symptom** — Web's sidebar Search row is labelled `Ctrl+K` (visible badge at :379, tooltip at :350); desktop's is `⌘K` (visible badge at `apps/desktop/src/features/v3/Sidebar.tsx:548`). Neither is platform-detected, so the web hint is wrong for every macOS user and the desktop hint is wrong for every Windows/Linux Tauri user.

Not taste — the same web app already does it correctly elsewhere: `apps/web/features/chat/components/dialogs/KeyboardShortcutsDialog.tsx:32 const isMac = safePlatform.isMac();` and `:38 keys.push(isMac ? '⌘' : 'Ctrl');` (also :126).

**The claim's load-bearing sentence — "the shortcut the badge names does not exist on their keyboard" — is FALSE.** Both handlers accept either modifier: `apps/web/features/chat/v3/WebShellV3.tsx:74 if ((e.metaKey || e.ctrlKey) && e.key === 'k')` and `apps/desktop/src/App.tsx:1051 if ((event.metaKey || event.ctrlKey) && key === 'k')`. A macOS web user pressing Ctrl+K does open search; a Windows desktop user pressing Ctrl+K does open search. This is a deterministic wrong-glyph defect hitting 100% of macOS web users and 100% of Windows/Linux Tauri users — medium, not high.

**Scope narrowing**: `apps/web/features/code/CloudCodePage.tsx:274` mounts WebSidebar with `mode="code"`, and `WebSidebar.tsx:346` gates the Search row on `mode !== 'code'` — so `/code` never shows the badge. Also hidden when collapsed. The symptom is limited to the expanded chat-mode sidebar on `/chat`.

**Desktop's i18n key only feeds the tooltip**, not the visible badge: `Sidebar.tsx:518 title={t('sidebar.searchKbd')}` vs the hardcoded literal at :548. **Both must change.** And all 12 locales bake ⌘ into that string — `packages/ui/i18n/locales/es/v3.json:39 "searchKbd": "Buscar (⌘K)"`, and en/de/fr/ja/… `"Search (⌘K)"` (mirrored under `apps/desktop/src/i18n/locales/*/v3.json:39`) — so the desktop tooltip is wrong for every non-Mac user **in every language**, and the string is additionally untranslated in 10 of 12 locales.

_(Do not cite `apps/web/features/chat/components/Main/ChatHeader.tsx:310` as corroboration — ChatHeader is dead code, barrel-exported at `Main/index.ts:1` and rendered nowhere, so the two spellings are never on screen simultaneously within apps/web.)_

**Reference** — `083-codex-macos-sidebar-nav-projects-recent-chats.png`: Codex shows ⌘-prefixed hints throughout its sidebar (⌘1…⌘6 on the pinned/recent rows) because it resolves the platform modifier at render.

**Fix — do not write a new helper.** `safePlatform.isMac()` already exists in `apps/web/shared/utils/browser-utils.ts`, is consumed by `KeyboardShortcutsDialog.tsx:32` and `hooks/use-keyboard-shortcuts.ts`, and **deliberately avoids `navigator.platform`** (`KeyboardShortcutsDialog.tsx:31` comments "Use modern platform detection instead of deprecated navigator.platform"). Promote it to a shared package and consume it at `WebSidebar.tsx:350` + `:379` and `Sidebar.tsx:518` + `:548`. Change the i18n string to `"Search ({{mod}}K)"` and interpolate.

---

## 4. COVERAGE GAPS

### Not examined at all

- **`apps/cli`** (Rust Ratatui TUI) — excluded per brief; the visual references do not cover terminal UI.
- **`apps/web` marketing routes**, `/gallery`, `/agi-work` views, the projects feature internals, and `ArtifactPreview.tsx` (1,698 lines) internals.
- **The share/public-transcript viewer** — `SharedSessionViewer.tsx` is hardcoded `bg-gray-950 text-white` and very likely has the same light-theme problem as WEB-3 (ConnectorsPage). **Worth a dedicated follow-up pass.**
- **Chrome extension in-page panel** (`inPagePanel/`) — pins itself light against arbitrary host pages, an entirely different theme-collision surface.
- **Chrome extension popup**, and `features/cloud-bridge/InviteCodeModal.ts` layout at narrow panel widths (only its CSS was read, for the reduced-motion and toggle-knob sweeps).
- **`apps/extension/src/side_panel.ts` chat/history/model-picker rendering** — only the computer-use, sign-in, header and composer regions of the 9,342-line file were read in the options lane.
- **VS Code extension QuickPick-based pickers** (model/mode/effort) — these render as native VS Code UI rather than in the webview.
- **The shared `SettingsModal` shell in `packages/ui`** was audited only for the `Menu` portal bug and nav labels; its internal section layouts (which `DesktopCloudSettingsModal` merely configures) were not swept.
- **Electron cloud shell chrome** in `apps/desktop/electron/**` beyond main/window/tray/shortcuts/quickAsk.

### Requires a running app or device to confirm

- **VSC-5** (textarea width) is a static-CSS certainty derived from the DOM structure at 1775-1786 and the absence of any `width` rule anywhere in the style block — but it implies the composer has been shipping with a ~150px input, which is the one finding worth re-confirming first by simply opening the panel.
- **VSC-9** severity depends on VS Code's default height split across the four contributed views in the secondary sidebar. If the default puts the webview near ~400px on a 900px sidebar — plausible but unconfirmable without the host — this becomes a default-state high rather than medium.
- **DTA-5** was verified in Chromium (Tauri's WebView2 on Windows, and the Electron shell). **macOS Tauri uses WKWebView**, which was not driven — no WebKit browser was available. Some WebKit builds break after `/`, so the macOS symptom may be a wrapped-but-ugly path rather than a clipped one.
- **MOB-4** the confirmed overlap is the **iOS** rendering. On Android, ViewGroup child clipping may truncate the spill instead, showing the Local/Cloud pill with its ends sliced off rather than as an overlap. Same root cause, different visual.
- **All mobile layout math** is derived from source dimensions against 375pt/393pt device widths and iOS `fontScale` values from RCTFont's content-size-category table. No simulator was run.
- **Android keyboard behaviour** (`adjustResize`) was out of lane for MOB-1/2/3; the iOS failure is confirmed, and each fix must be `Platform.OS === 'ios'`-gated to avoid double-handling.
- **DEL-1/DEL-3** apply to the `AGI_CLOUD_RENDERER=bundled` path and the quick-ask panel respectively; neither was exercised with a running Electron build.

### Analysis that is masked by another finding

**German/Russian string-expansion risk** could not be assessed, because so little is translated (CRS-7, CRS-8): the QuickChips, GreetingBanner chips and all settings labels are hardcoded English, so expansion risk is _masked_ rather than absent. **Once settings and chips are localized, re-check the `h-[34px]` chips** (`QuickChips.tsx:56-57`, `GreetingBanner.tsx:109`), which have a fixed height and no `whitespace-nowrap`.

### Dropped as unreachable (evidence rule — real defects, no user-visible symptom today)

These are worth fixing **before** the surfaces are switched on, but are not shipped defects:

- `apps/mobile/src/features/sidebar/components/{ConversationItem,ConversationList,TagFilter}.tsx` — riddled with dark-only hardcoded colours (`rgba(255,255,255,0.8)` titles that would be invisible on the light theme's `#f7f7f7` surface). Nothing outside that folder imports them.
- `apps/mobile/app/(app)/agents/[id].tsx` — same hardcoded-white problem, gated off by `FEATURES.agents: false` (`lib/v1FeatureFlags.ts:80`).
- `apps/web/features/chat/chat-interface.css` — dead (never imported, `.chat-scroll-area` never applied), so its mis-anchored `::after` fade is not shipped.
- `BudgetTrackerDisplay`'s hardcoded `border-white/[0.06] bg-white/[0.02]` — never renders on web because ComposerFooter is always mounted with `inline` (`ChatComposerNew.tsx:2633`).
- `packages/ui/ui/src/sidebar/SessionItem.tsx` and `Sidebar.tsx` are **shared but currently unrendered by desktop** — desktop uses its own `v3/ConversationRow.tsx`. SHR-2 and SHR-6 are reported because these ship to **web** via `WebChatPage.tsx:2885`, but treat any desktop-side impact as latent.
- `apps/extension/src/side_panel.ts` hidden surfaces — `#sp-toolbar`, `#sp-tab-bar`, `#sp-auth-bar`, `#sp-prompt-chips` are `display: none`. Only the two cases where that hiding causes a _visible_ failure were reported (CHR-1, and the blank empty state). The unreachable `#sp-shortcuts-dropdown` / `#sp-tools-dropdown` min-widths of 240px/220px live inside the hidden toolbar and can never be seen.
- `apps/extension-vscode/.../settingsWebviewContent.ts:234` `InspectMcpServerDialog` — black `bg-[#0f0e0d]` box with light-theme `text-foreground` labels, gated on `isSignedIn`, which is never true while ConnectorsPage is mounted.
- `apps/web/features/chat/components/Main/ChatHeader.tsx` — barrel-exported, rendered nowhere.
- `apps/mobile/src/features/chat/components/ConversationStarters.tsx` — dead code; recommend deletion (CRS-9).

### Verified-clean, deliberately not reported

Recorded so a future pass does not re-litigate them:

- **VS Code sidebar**: `.attachment-chip max-width: 220px` shrinks correctly (has `overflow:hidden` → min-width resolves to 0); `.tool-call__body word-break: break-all` is overridden by `.tool-call__payload word-break: break-word` for the `<pre>` children that carry JSON; z-index layering (mention-dropdown 10 / plus-menu 20 / model-popover 24 / onboarding 50) has no reachable collision because the pairs are never open simultaneously (2622-2704); `.empty-state::before` correctly stays behind its content.
- **VS Code settings**: `.card { overflow: hidden }` does not clip controls (inputs shrink rather than overflow at every width tested); controls re-enable after save (`SettingsPanel.ts:163-164` posts `settings.saved` then `refresh()`); sticky sidebar leaves no background gap. _One item below the bar: setting the status line causes an 8px layout shift of everything below it on every save — `.status { min-height: 20px }` at :280 reserves one line, a two-line error needs 42px._
- **Chrome side panel**: `.sp-bubble-assistant pre` already has `overflow-x: auto` (:1125) and `.sp-msg { max-width: 88% }` caps the bubble, so long code lines scroll correctly; no markdown table renderer exists; `#sp-messages` is `flex: 1` with `overflow-y: auto`, so its automatic minimum size is 0 per spec — the classic missing-`min-height:0` scroll bug is **not** present; `#sp-drawer` has a permanent transform that would break `position: fixed` descendants, but every fixed overlay is appended to `document.body`, so no broken containing block; the manifest CSP includes `style-src 'self' 'unsafe-inline'`, so the runtime `element.style` writes in `computerUsePanel.ts:834/853/863` do apply (the comment at `side_panel.ts:2706` claiming otherwise is stale but harmless).
- **Chrome options / computer-use**: the options page does honour `prefers-color-scheme`; `.opt-allowlist-origin` and `.opt-allowlist-item-origin` ellipsize correctly; `.sp-cu-step-body` and `.sp-cu-step-title` correctly carry `min-width:0` / ellipsis; the manifest **does** declare `tabs`, so CHR-15 is an active-tab-query bug, not a permission bug; the `el()` helper's CSSOM workaround for the `style-src 'self'` CSP is sound.
- **Electron shell**: `ConversationRow`/`ProjectRow` menus correctly `createPortal` to `document.body` so the sidebar's `overflow: hidden` does not clip them (only the top-clamping bug in DEL-4 remains); `ComposerContextControls` does `min-w-0` + `truncate` + `max-w` on every chip; `LocalByokHandoffDialog` and the shared `SettingsModal` both use `max-h-[calc(100vh-2rem)]` / `h-[min(94vh,680px)]` with internal scroll, so neither exceeds the 600px minimum window; `shortcuts.ts` surfaces registration failures rather than leaving a silently dead hotkey.
- **Desktop feature screens**: `ConnectorGallery`'s `ConnectedConnectorRow` and `AvailableConnectorCard` are correctly built (`min-w-0` + `truncate` + `line-clamp-2` + `shrink-0`); `DesktopCloudSchedules`' `<h2 className="truncate">` works because `truncate`'s `overflow:hidden` resolves flex `min-width:auto` to 0; `FileTree`'s context-menu height estimate (`node.isDirectory ? 176 : 130`, :452) over-corrects for the ~76px file menu so the menu floats above the cursor near the viewport bottom — cosmetic only.
- **Mobile**: the chat composer **is** correctly keyboard-avoiding and bottom-inset aware (`ChatInput.tsx:684 Math.max(insets.bottom + 6, 16)` + KeyboardAvoidingView at `chat/[id].tsx:1110`); fenced code blocks already scroll horizontally (`MessageContentRenderer.tsx:580`); `FloatingPrimaryAction`/`BottomSearchBar` derive list padding from shared constants so the FAB never covers the last row; reduced-motion is respected across all Reanimated entrances; `ModelRow`/connector rows/drawer rows all set `numberOfLines` + `minWidth: 0`.
- **Web**: reduced-motion is already covered by a global `@media (prefers-reduced-motion: reduce)` reset in `globals.css:1768`; the empty-chat `h-full … justify-center` container could clip on very short viewports but no concrete trigger could be pinned, so it is omitted.
- **Cross-surface**: mobile has no toast system at all (only `ToastAndroid` for a back-press hint at `apps/mobile/app/_layout.tsx:830`) and uses inline "Copied" state instead — judged a legitimate platform convention rather than a defect.
