# AGI Desktop — Volume 22 — Accessibility

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root), `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/desktop/AGENTS.md` (nearest surface rules), and the real Desktop paths cited in the Repository map below.

## Overview & stance

This volume defines accessibility (a11y) requirements for AGI Desktop — the Tauri v2 + React + Vite full-trust surface (Local + BYOK + Managed Cloud). Accessibility is not gated by plan: it is identical across Free, Basic ($8 / ₹399), Pro ($20), Max ($100 and $200), Enterprise, and across the free Local and BYOK access modes. A blind or motor-impaired user on Local-only must reach parity with a Max-tier Cloud user.

The trust boundary shapes a11y in one specific way: the **visible trust/provider label is a safety control**, not decoration. The mode selector (`apps/desktop/src/features/v3/LocalCloudToggle.tsx`) and any BYOK provider badge must be announced to assistive tech and never conveyed by color alone — otherwise a low-vision user cannot tell whether a chat is Local, BYOK, or Managed Cloud. The **Local→BYOK fork** (context selection, secret scan, payload preview, provider label, consent) must be keyboard-operable and screen-reader announced at every step, or the consent is not informed. Accessibility failures here are trust-boundary failures.

## Screen Readers

Requirement: all interactive controls expose an accessible name, role, and state; dialogs trap focus and restore it on close; async status (streaming, tool calls, secret-scan results) is announced via ARIA live regions; icon-only buttons carry `aria-label`.

- 🟡 Partial — `apps/desktop/src/ui/AccessibleDialog.tsx` implements the modal pattern (required `title`, optional `description`, `initialFocusRef`, `triggerRef` focus return, escape-to-close, focus trap via `modal`). ARIA roles/labels appear across the shared UI kit (`apps/desktop/src/ui/`: `Tabs.tsx`, `Switch.tsx`, `Slider.tsx`, `Checkbox.tsx`, `Table.tsx`, `Toast.tsx`, `AlertDialog.tsx`). Gap: there is no repo-wide screen-reader audit, no guaranteed live-region for streaming assistant output, and no verified announcement of the Local/BYOK/Cloud label. Track full NVDA/VoiceOver pass as 🔭.
- 🔭 Planned — VoiceOver (macOS) and Narrator/NVDA (Windows) certification matrix; live-region announcements for message start/stop, tool-call state, and fork consent outcomes.

## Keyboard Navigation

Requirement: every action reachable by pointer is reachable by keyboard; logical tab order; visible focus ring on all focusable elements; focus trapped inside modals and returned to the trigger; a documented "escape hatch" from the composer to the message list.

- 🟡 Partial — focus management exists in `apps/desktop/src/ui/AccessibleDialog.tsx` (trap + restore) and focus-visible styling lives in `apps/desktop/src/styles/globals.css`. Roving-tabindex list navigation and a "skip to conversation" affordance are not verified across the V3 shell (`apps/desktop/src/features/v3/DesktopShellV3.tsx`).
- 🔭 Planned — skip links, systematic roving tabindex for the conversation/sidebar lists, and an automated tab-order regression test.

## Keyboard Shortcuts

Requirement: a discoverable, remappable shortcut system with conflict detection, per-shortcut reset, and an in-app cheatsheet; shortcuts respect platform conventions (Cmd on macOS, Ctrl on Windows/Linux).

- ✅ Built — `apps/desktop/src/constants/shortcuts.ts` defines `DEFAULT_SHORTCUTS` across categories (`chat`, `navigation`, `model`, `agent`, `tools`, `window`) with stable IDs, modifiers, and dispatched actions.
- ✅ Built — `apps/desktop/src/features/settings/KeybindingsSettings.tsx` provides remapping via keydown capture, conflict detection, search/filter, and per-shortcut + global reset; custom bindings persist through `apps/desktop/src/stores/shortcutStore.ts`.
- ✅ Built — `apps/desktop/src/features/chat/KeyboardShortcutsOverlay.tsx` renders the full cheatsheet (Cmd/Ctrl+`/`), reading live from `DEFAULT_SHORTCUTS` and honoring custom keybindings.
- 🟡 Partial — the cheatsheet uses `framer-motion` entrance animation; see Reduced Motion for the gating gap.

## Dynamic Fonts

Requirement: user-adjustable text scaling and readable line-height; typography defined by tokens (not hardcoded px scattered through components) so scaling is single-source; scaling never clips or overlaps the composer, mode toggle, or trust label.

- 🟡 Partial — typography tokens exist in `apps/desktop/src/styles/globals.css` (`--font-sans`, `--font-mono`, `--line-height-chat: 1.6`), but many component font-sizes remain fixed px. There is no verified user-facing text-scale control.
- 🔭 Planned — an Appearance-tab "text size / UI scale" control (target home: `apps/desktop/src/features/settings/tabs/Appearance/index.tsx`) driving a single scale token, honoring the OS font-scale preference, with reflow tested at large sizes against the V3 shell.

## High Contrast

Requirement: a high-contrast theme meeting WCAG AA contrast (4.5:1 body text, 3:1 large text / UI), plus respect for OS forced-colors / high-contrast mode; trust labels and status must stay distinguishable without relying on hue.

- 🔭 Planned — no dedicated high-contrast theme and no `prefers-contrast` / `forced-colors` handling exist today. The themable foundation is real: `apps/desktop/src/themes/presets/` ships 15 presets (light/dark families) via `apps/desktop/src/themes/`, and theming is wired through `apps/desktop/src/features/settings/tabs/Appearance/index.tsx`. Add an `agi-high-contrast` preset plus a `@media (forced-colors: active)` pass; treat the trust/provider label as a color-independent element.

## Reduced Motion

Requirement: honor `prefers-reduced-motion: reduce` globally — disable or dampen all non-essential animation (message entrance, overlays, streaming shimmer, scroll smoothing) with no loss of function or state feedback.

- 🟡 Partial — `apps/desktop/src/styles/globals.css` gates specific animations under `@media (prefers-reduced-motion: reduce)` (message-bubble entrance disabled; smooth scroll reverts to `auto`). Gap: `framer-motion` animations (e.g. `KeyboardShortcutsOverlay.tsx`) are not centrally gated, so reduced-motion is inconsistent.
- 🔭 Planned — a single motion policy: a `useReducedMotion` hook feeding framer-motion variants, plus a Reduced-Motion toggle in Appearance that overrides the OS setting, and a lint/test that flags ungated animations.

## Localization

Requirement: full UI localization with runtime language switching, RTL support, and pluralization; provider/trust labels and consent copy are localized but model IDs and provider names are never translated.

- ✅ Built — i18n via `apps/desktop/src/i18n/index.ts` (i18next + react-i18next + browser language detector), 12 locales (`en, es, zh, ja, ko, fr, de, pt, it, ru, ar, hi`) under `apps/desktop/src/i18n/locales/`, split into namespaces (common, errors, auth, chat, …).
- ✅ Built — user-facing language selector in `apps/desktop/src/features/settings/GeneralSettings.tsx` (`SUPPORTED_LANGUAGES`); RTL is applied for Arabic in `apps/desktop/src/App.tsx` (sets `document.documentElement.dir = 'rtl'` when `i18n.language === 'ar'`).
- 🟡 Partial — `useTranslation` is adopted in ~27 files; newer V3 shell surfaces still contain hardcoded English. Gap: complete string extraction, RTL layout QA beyond `dir`, and a missing-key CI check.

## Repository map

- `apps/desktop/src/ui/AccessibleDialog.tsx` — accessible modal (focus trap/return, title/description).
- `apps/desktop/src/ui/` — shared UI kit carrying ARIA roles/labels (`Tabs`, `Switch`, `Slider`, `Checkbox`, `Table`, `Toast`, `AlertDialog`).
- `apps/desktop/src/styles/globals.css` — typography tokens, focus styling, reduced-motion media queries.
- `apps/desktop/src/constants/shortcuts.ts`, `apps/desktop/src/stores/shortcutStore.ts` — shortcut definitions + custom bindings.
- `apps/desktop/src/features/settings/KeybindingsSettings.tsx`, `apps/desktop/src/features/chat/KeyboardShortcutsOverlay.tsx` — remapping UI + cheatsheet.
- `apps/desktop/src/features/settings/tabs/Appearance/index.tsx`, `apps/desktop/src/themes/`, `apps/desktop/src/themes/presets/` — theming (future high-contrast + text-scale home).
- `apps/desktop/src/i18n/`, `apps/desktop/src/features/settings/GeneralSettings.tsx`, `apps/desktop/src/App.tsx` — localization + RTL.

## Competitor notes

Claude Desktop, ChatGPT desktop, and Codex offer shortcuts, screen-reader-labeled chat, and OS theme/motion respect, but as single-provider, cloud-first clients: no local-vs-cloud trust label to announce, no BYOK badge, no offline-only a11y guarantee. AGI's divergence: (1) the **trust/provider label is an accessibility-critical control** — announced to assistive tech, never hue-only — because Local, BYOK, and Managed Cloud run side by side; (2) the Local→BYOK fork is a fully keyboard/screen-reader-navigable consent flow; (3) a11y works fully offline on Local; (4) shortcuts are user-remappable with conflict detection, not a fixed vendor set.

## Acceptance / Definition of Done

Production-ready gate: every control has an accessible name/role/state; keyboard reaches all pointer actions with visible focus; `prefers-reduced-motion` and OS high-contrast/forced-colors are honored globally; a WCAG-AA high-contrast theme exists; text scaling reflows without clipping the composer or trust label; the Local/BYOK/Cloud label and fork consent are announced and keyboard-operable; primary locales (incl. Arabic RTL) render cleanly.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `pnpm --filter @agiworkforce/desktop test` pass; new a11y tests (tab order, focus return, live-region) added.
- [ ] Trust: mode/provider label announced to screen readers and distinguishable in high-contrast; fork consent steps keyboard + SR operable; no Local chat silently rendered without its trust label.
- [ ] Security/privacy: a11y instrumentation adds no telemetry of chat content; Local a11y works fully offline; secret-scan results in the fork are announced without leaking scanned secrets to logs.

## Anti-patterns

- Do not convey trust mode (Local / BYOK / Cloud) or status by color alone — it fails colorblind users and hides the trust boundary.
- Do not ship animations ungated by `prefers-reduced-motion`, or focus traps without focus return.
- Do not make the Local→BYOK fork consent reachable only by pointer.
- Do not translate model IDs or provider names; source model IDs only from `packages/types/src/models.json` — never hardcode or invent one.
- Do not reference removed tiers ("Plus", `pro_plus`, "Hobby"), invent INR prices for Pro/Max, or add credit top-ups; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
- Do not reference Supabase (fully migrated to Clerk + Neon + Stripe) or rename `proxy.ts` to `middleware.ts`.
- Do not claim shipped a11y state without a real repo path; mark unverified capabilities 🔭.
