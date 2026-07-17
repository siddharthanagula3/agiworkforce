# AGI Chrome Extension — Volume 21 — Accessibility

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md` (repo root); `apps/extension/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); real repo paths cited inline and in the Repository map below.

## Overview & stance

This volume defines accessibility (a11y) requirements for the AGI Browser Companion — the side panel, in-page panel, options page, onboarding, approval prompts, and the thin bridged chat. Scope covers screen readers, keyboard access, shortcuts, high-contrast/forced-colors, reduced motion, and localization.

The Chrome surface is a permission-gated browser agent, not a standalone assistant. The extension holds **no provider keys and runs no inference** — chat streams through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`), and control can bridge to Desktop over native messaging or the localhost `8787` pairing bridge. Two consequences shape a11y. First, **approval-gated actions** (ask-before-acting plans, high-risk-action and high-risk-site interventions, CDP computer-use escalation) are the highest-stakes moments: an approval a screen-reader or keyboard user cannot perceive or reach is a trust-boundary failure, not a cosmetic bug. Second, the extension **never re-renders page content for a11y** — page DOM is untrusted data (prompt-injection defense), so a11y work applies to AGI's own chrome (panel/options UI), not the host page. History and memory stay `chrome.storage.local` (device-scoped, never synced), so no a11y setting leaves the device. This is trust-mode-invariant: Local, BYOK (unavailable on Chrome — Desktop/CLI/VS Code only), and Managed Cloud render the same accessible chrome.

## Screen Readers

The panel is a DOM UI built with an `el()` helper that already sets ARIA roles and labels: `role="dialog"`/`aria-modal="true"` on onboarding and the settings drawer, `role="tablist"`/`role="tab"`/`role="tabpanel"` on onboarding steps, `aria-label` on icon buttons (New chat, Open/Close settings, Copy response, Remove-origin), and `aria-hidden="true"` on decorative SVGs so they are not double-announced. ✅ Built — `apps/extension/src/side_panel.ts`, `apps/extension/src/options.ts`.

Requirements: every actionable control has an accessible name; decorative graphics are `aria-hidden`; message turns carry a programmatic role so assistant vs. user is distinguishable; approval dialogs (plan, high-risk-action, escalation) are modal and labeled with the action and target site.

Gap: streaming assistant output and connection-status changes are rendered visually (status pill `#sp-status-pill` toggles `connected`/`disconnected`/`cloud`) but there is **no `aria-live`/`role="status"`/`role="alert"` region**, so a screen reader is not notified when tokens stream, a tool call runs, connection drops, or a paywall (server `429 {kind:'paywall', requiredTier}`) is shown. 🟡 Partial — `apps/extension/src/side_panel.ts` (status pill has no live region). Add a polite live region for streaming/status and an assertive one for approval prompts and errors.

## Keyboard Navigation

Modals set initial focus on open (`nextBtn.focus()`, input `.focus()`), close on `Escape`, and expose keyboard-operable custom controls (the diagnostics bar uses `role="button"`, `tabindex="0"`, `aria-expanded`, and a `keydown` handler). Composer, token, shortcut-name, and memory inputs all bind `keydown` (Enter to send, Escape to dismiss). ✅ Built — `apps/extension/src/side_panel.ts`.

Requirements: all interactive elements reachable and operable by keyboard in a logical order; Enter/Space activate custom controls; `Escape` dismisses every overlay; focus returns to the invoking control on close. Modal dialogs (`aria-modal="true"`) MUST **trap focus** (Tab/Shift+Tab cycle within the dialog) — today focus is set on open but not trapped, so Tab can leak to background chrome. The onboarding `role="tablist"` needs roving-tabindex arrow-key navigation to meet the ARIA tabs pattern. 🟡 Partial — `apps/extension/src/side_panel.ts` (focus set, not trapped; no roving tabindex). A visible focus indicator exists via `:focus-visible { outline: 2px solid var(--agi-ext-focus) }` on inputs, send button, toggles, and shortcut buttons. ✅ Built — `apps/extension/src/side_panel.ts`, `apps/extension/src/options.ts`.

## Keyboard Shortcuts

The manifest declares two commands: `_execute_action` to open the side panel (`Ctrl+Shift+A` / `Command+Shift+A`) and `capture_page` (`Ctrl+Shift+C` / `Command+Shift+C`), each with a human-readable `description`. ✅ Built — `apps/extension/manifest.json`.

Requirements: every shortcut has a manifest `description` (shown at `chrome://extensions/shortcuts`); defaults avoid clobbering common browser/OS chords and page-level a11y keys; users rebind via Chrome's native shortcuts page (the source of truth), not an in-panel remapper. In-panel affordances (Enter-to-send, `Escape`-to-close) are documented in onboarding. An in-panel shortcut cheat-sheet and any remap UI are 🔭 Planned.

## High Contrast

Panel styling is injected via Constructable Stylesheets (`document.adoptedStyleSheets`) using CSS custom properties (`--agi-ext-bg`, `--agi-ext-accent`, `--agi-ext-success`, `--agi-ext-danger`, `--agi-ext-focus`), which keeps the CSP free of `unsafe-inline` and gives a single token layer to theme. ✅ Built — `apps/extension/src/side_panel.css`, `apps/extension/src/side_panel.ts` (`injectStyles`), `apps/extension/src/tokens.ts`.

Requirements: text and essential UI meet WCAG 2.1 AA contrast (4.5:1 body, 3:1 large text and UI/focus indicators); status is never color-only (the connection pill pairs a colored dot with a text label — keep that for approvals and errors); the UI honors OS high-contrast via a `@media (forced-colors: active)` / `prefers-contrast` block that maps to system colors and preserves focus outlines. Today there is **no `forced-colors`/`prefers-contrast` handling** and no audited AA palette. 🔭 Planned — no such media query exists in `apps/extension/src`.

## Reduced Motion

The panel animates: caret blink (`sp-blink`), tool-call spinner (`sp-spin`), typing dots (`sp-bounce`), a running-state pulse (`sp-pulse`), and numerous `transition`s on hover/focus. ✅ Built (animations exist) — `apps/extension/src/side_panel.ts` (`injectStyles`).

Requirements: wrap non-essential motion in `@media (prefers-reduced-motion: reduce)` to disable/shorten spinners, pulses, bounces, and transitions while keeping a static busy indicator (e.g., a "Working…" label). Motion MUST NOT be the only signal that a tool call or escalation is running. Today **no `prefers-reduced-motion` query exists**, so motion always runs. 🔭 Planned — none in `apps/extension/src`.

## Localization

The extension ships **English-only**: there is no `_locales/` directory, no `default_locale` in the manifest, and no `chrome.i18n.getMessage`/`__MSG_*` usage — all UI strings are hardcoded in TypeScript. Autofill reads page `aria-label`/`aria-labelledby`/`aria-required` to map fields, which is locale-agnostic input, not output localization. ✅ Built (field-label reading) — `apps/extension/src/jobAutofill.runtime.js`, `apps/extension/src/content.ts`.

Requirements (all 🔭 Planned — none in repo): add `default_locale` + `_locales/<lang>/messages.json`; route user strings through `chrome.i18n.getMessage`; set `dir`/`lang` on the panel root with RTL support; localize dates/numbers via `Intl`. Provider IDs stay out of scope — they come only from `packages/contracts/types/src/models.json` and are never hardcoded or translated.

## Repository map

- `apps/extension/manifest.json` — commands/shortcuts, CSP, entry points.
- `apps/extension/src/side_panel.ts` — panel UI: ARIA, focus, keydown, `injectStyles` (tokens, animations, focus-visible).
- `apps/extension/src/side_panel.css` — static host-page CSS (CSP-safe base).
- `apps/extension/src/options.ts`, `apps/extension/src/options.css` — options-page a11y (`focus-visible`, `aria-label`).
- `apps/extension/src/inPagePanel/{panel.ts,panelStyles.ts,launcher.ts}` — in-page panel surface.
- `apps/extension/src/tokens.ts` — design tokens (`--agi-ext-*`).
- `apps/extension/src/content.ts`, `apps/extension/src/jobAutofill.runtime.js` — ARIA-aware field/label reading (input only).

## Competitor notes

Claude for Chrome, ChatGPT/Atlas, and Codex ship polished but largely English-first browser UIs with standard keyboard/screen-reader support and limited public reduced-motion/forced-colors commitments. AGI's deliberate divergence: (1) accessibility is a **trust-safety requirement** — approval, escalation, and high-risk-site prompts must be perceivable and operable by assistive tech or the action is blocked; (2) a11y applies only to AGI's own chrome, since page DOM is untrusted (prompt-injection stance) — we never rewrite host pages "for accessibility"; (3) per-surface trust — Chrome runs no inference and holds no keys, so no a11y setting or transcript syncs off-device; (4) multi-provider/BYOK divergence is upstream (Desktop/CLI/VS Code) — Chrome's accessible chrome is identical across Local and Managed Cloud sessions.

## Acceptance / Definition of Done

Production-ready when: all panel/options/onboarding/approval flows pass an automated a11y scan (axe) and a manual screen-reader pass (VoiceOver + NVDA); every control is keyboard-operable with visible focus; modals trap focus and restore it on close; streaming, status, and approval events announce via live regions; the UI degrades under reduced-motion and forced-colors; a `default_locale` + `chrome.i18n` pipeline exists with one non-English locale and RTL verified.

- [ ] Build: axe scan clean; VoiceOver + NVDA manual pass; `pnpm --filter @agiworkforce/extension typecheck` and `test` green; `pnpm lint:extension` green.
- [ ] Trust: approval, escalation, and high-risk-site prompts announced (assertive) and fully keyboard-operable; no a11y state leaves `chrome.storage.local`; no page DOM rewritten for a11y.
- [ ] Security: live-region text carries no untrusted page content unescaped; no new permissions/host access added for a11y without a `THREAT_MODEL.md` update.

## Anti-patterns

- Echoing untrusted page text verbatim into an `aria-live` region — sanitize; treat page content as data.
- Color-only status (approval/error/connection) without a text label or icon.
- Focus that escapes an open modal, or focus not restored on close.
- Motion as the only "busy" signal; ignoring `prefers-reduced-motion`.
- Reintroducing inline `<style>`/`innerHTML` and breaking the CSP `unsafe-inline` removal.
- Hardcoding a model ID into any label or localized string — IDs come only from `packages/contracts/types/src/models.json`.
- Supabase references, or removed tiers ("Plus", `pro_plus`, "Hobby") / invented INR prices in paywall copy — tiers are Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise, no top-ups.
- Claiming localization, high-contrast, or reduced-motion is shipped — 🔭 Planned until a cited path proves otherwise.
