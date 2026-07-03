# AGI Chrome Extension — Volume 26 — UI Component Library

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/extension/AGENTS.md`, plus the surface code cited per-section below and the shared token source `packages/design-tokens/src/index.ts`.

## Overview & stance

This volume defines the reusable UI primitives the AGI Browser Companion renders in Chrome MV3: side panel, in-page overlay, toolbar action, context menus, and the modals/cards/toasts supporting permission-gated automation. The stance constrains every component: the extension is a **permission-gated browser agent**, not a consumer assistant. It holds **no provider keys and runs no inference** — chat streams through the cloud gateway (`providerStreamClient.ts` → `/api/v1/providers/<id>/stream`), so the UI never renders a key field, BYOK label, or in-extension checkout. There is **no Local or BYOK trust mode here**; components render Managed-Cloud state plus device-scoped local history only. The UI must surface allowlist state, the "ask before acting" approval gate, high-risk-site intervention, and every CDP computer-use escalation. All styling uses design tokens (`--agi-ext-*`) injected via Constructable Stylesheets (`document.adoptedStyleSheets`), so the CSP keeps `style-src 'self'` without `unsafe-inline`.

## Side Panel

✅ Built — `src/side_panel.{html,ts}` + manifest `side_panel.default_path`. The primary chat/agent container, opened via the toolbar action or `Ctrl+Shift+A`. Requirements: host page carries only a minimal reset (`side_panel.css`); component CSS injects via `injectStyles()` adopted stylesheets; a tab switcher toggles Chat and Computer Use panels (`sp-tab-visible`); a blocked-site state (`#sp-blocked-*`) renders off-allowlist. Never expose a key field or provider-secret input.

## Chat Composer

✅ Built — composer in `src/side_panel.ts` (`#sp-input`, `ArrowUp` send, `sp-cmd-chip` chips) with voice capture from `src/features/side-panel/voice.ts`. Requirements: multiline input, send-on-Enter with newline modifier, a stop/`Square` control while streaming, mic toggle with recording-pulse state, command chips for scoped actions. The model label must come from `@agiworkforce/types` (`getModelMetadataById`) — never a hardcoded ID — and paywall state must render from a server `429 {kind:'paywall', requiredTier}`, not a client gate.

## Floating Assistant

✅ Built — `src/features/content/in-page-panel/launcher.ts` (48px circular FAB, bottom-right, Headroom-style hide/reveal on scroll, position persisted under `agi_panel_launcher_pos`) plus `panel.ts` / `panelStyles.ts` (Shadow DOM `mode:'open'`, `z-index:2147483647`). Requirements: Shadow-DOM isolation so page CSS cannot leak either way; the overlay treats page content as data, never instructions (prompt-injection defense); no auto-activation off-allowlist. Drag repositioning is 🔭 Planned (launcher locks to bottom-right per its doc comment).

## Popup

🔭 Planned — there is **no** discrete browser-action popup. The manifest `action` has no `default_popup`; clicking the toolbar icon opens the side panel directly (`manifest.json` `action` + `commands._execute_action`) — the side panel is the single canonical surface. A future compact popup (status, allowlist toggle, pairing state) would reuse these tokens and icons; until built it must not be described as shipped.

## Toolbar

✅ Built — `manifest.json` `action` (icons 16/32/48/128, `default_title:"AGI"`) and `commands` (`_execute_action`=`Ctrl+Shift+A`; `capture_page`=`Ctrl+Shift+C`). Requirements: badge/title reflects connection and allowlist state; commands stay the documented defaults; the toolbar opens the side panel (no popup indirection).

## Context Menus

✅ Built — `src/background.ts:setupContextMenu()` registers items (`capture-element`, `get-element-info`) via `chrome.contextMenus.create` with an `onClicked` dispatcher (`contextMenus` in manifest `permissions`). Requirements: idempotent rebuild (`removeAll` then recreate) on service-worker start; every menu action routes through the same allowlist + approval checks as panel actions — a menu click is not a trust bypass.

## Dialogs

🟡 Partial — a modal primitive exists (`src/features/cloud-bridge/InviteCodeModal.ts`: scrim, focus-trapped card, spinner button) but serves the **removed** invite/waitlist gate. Per canon and commit `0fe0598c3`, Managed Cloud is open by default for signed-in users, so this dialog's purpose is retired. Gap: extract a generic reusable dialog (confirm, sign-in prompt, high-risk-site intervention). Dialogs must never contain billing/checkout UI (out of scope).

## Approval Cards

✅ Built — `showApprovalCard()` in `src/features/side-panel/computerUsePanel.ts` (`sp-cu-approval`, allow/deny), driven by `AGI_CU_APPROVE_REQUEST` / `AGI_CU_APPROVE_RESPONSE` in `src/background.ts`. Requirements: **fail-closed** — no approval before timeout means deny; only responses carrying the exact server-generated `requestId` are honored so a prompt-injected page cannot forge approval; the card must describe the concrete pending action (tool + human-readable description) before allow. This is the core trust affordance for CDP computer-use escalation.

## Toasts

🟡 Partial — no in-panel toast queue. Transient confirmation exists as micro-state (`.copied` on copy buttons in `src/side_panel.ts`, auto-cleared ~1.5s); OS-level notices use `chrome.notifications` via `showNotification()` in `src/background.ts` (task completion, shortcut replay, chat error). Gap (🔭): a token-styled, dismissible in-panel toast with an accessible live region. OS notifications must respect the "Task notifications" preference (`agi_task_notifications`).

## Progress Indicators

✅ Built — `Loader2` icon (`src/assets/icons.ts`), keyframes `sp-spin`/`sp-blink`/`sp-pulse` in `src/side_panel.ts`, the live action log (`sp-cu-step`, kind-colored) and usage counter (`sp-cu-usage-steps`) in `computerUsePanel.ts`, and the `agi-spinner` button spinner. Requirements: streaming shows a caret/blink; multi-step runs show an incremental per-step log with tool icon + timestamp; spinners carry accessible labels.

## Icons

✅ Built — `src/assets/icons.ts` provides Lucide SVG path strings (viewBox `0 0 24 24`, stroke-only, `stroke-width 1.75`, round caps/joins) rendered as sanitized DOM (no React). Provider glyphs ship as `icons/providers/*.svg` via manifest `web_accessible_resources`; toolbar icons are 16/32/48/128 PNGs. Requirements: `currentColor` stroke so icons inherit token colors; new icons verified against canonical Lucide paths; no inline SVG event handlers.

## Typography

🟡 Partial — the type ramp is defined inline in `src/side_panel.ts:injectStyles` (UI stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`; code stack `'JetBrains Mono','SF Mono',Consolas,monospace`; sizes 10–16px). Gap: no shared typography token scale in `packages/design-tokens`, so sizes are hardcoded per component. Requirement: promote a named type scale (body/label/code/heading) to tokens so panel, overlay, and future popup stay consistent.

## Colors

✅ Built — `packages/design-tokens/src/index.ts` exports `agiExtensionCssVars` (dark + light), consumed via `src/tokens.ts:getExtensionTokensCss`. Component CSS uses `var(--agi-ext-*)` (surface, text, border, accent, danger/success/warning/info, scrim, shadows); `computerUsePanel.ts` mandates "DESIGN TOKENS ONLY — no hex colours." Requirements: no raw hex; danger/high-risk states use `--agi-ext-danger*`; light/dark parity; state colors reused across approval and escalation UI.

## Animations

🟡 Partial — keyframe/transition animations exist (`sp-spin`/`sp-blink`/`sp-bounce`/`sp-pulse`/`sp-record-pulse` in `side_panel.ts`; `agi-rec-pulse` in `content.ts`; `agi-blink` in `panelStyles.ts`). Gap: no `prefers-reduced-motion` guard exists in any extension stylesheet. Requirement (🔭): wrap non-essential motion in `@media (prefers-reduced-motion: reduce)`, keep durations short (existing transitions are 0.15s), and never animate approval/high-risk cards so they look auto-dismissed.

## Repository map

- `apps/extension/manifest.json` — action, side_panel, commands, icons, web_accessible_resources
- `apps/extension/src/side_panel.{html,css,ts}` — panel host, injected styles, composer, progress
- `apps/extension/src/features/side-panel/{computerUsePanel,voice,onboarding,markdown}.ts` — approval cards, step log, voice
- `apps/extension/src/features/content/in-page-panel/{launcher,panel,panelStyles}.ts` — floating overlay (Shadow DOM)
- `apps/extension/src/assets/icons.ts` — Lucide SVG icon set
- `apps/extension/src/tokens.ts` + `packages/design-tokens/src/index.ts` — token source (`agiExtensionCssVars`)
- `apps/extension/src/background.ts` — context menus, OS notifications, approval routing
- `apps/extension/src/features/cloud-bridge/InviteCodeModal.ts` — legacy dialog primitive (to be reworked)

## Competitor notes

Claude for Chrome centers a side panel with a plan/approval flow and site permissions; ChatGPT's browser surface leans on a popup + injected controls; Codex has no first-party Chrome UI (browser work runs host-side). AGI's divergence: (1) a **single canonical side panel** (no popup indirection) doubling as the computer-use action log; (2) **fail-closed approval cards** with server-issued request IDs for CDP escalation; (3) a **thin bridged chat** holding no keys and no BYOK UI — unlike Desktop/CLI/VS Code where BYOK is allowed, the extension is Cloud-only by design; (4) a **token-driven, hex-free** set shared through `packages/design-tokens`; (5) local-first history (`chrome.storage.local`, never synced), no Projects/global-memory UI.

## Acceptance / Definition of Done

Production-ready when every primitive renders from design tokens, injects CSS via adopted stylesheets (no inline `<style>`), and enforces trust affordances (allowlist, approval, high-risk intervention) without key/checkout UI.

- [ ] Build: side panel, overlay, toolbar, and context menus render with only `var(--agi-ext-*)` colors; no raw hex; icons inherit `currentColor`.
- [ ] Trust: no BYOK/key field, no provider host contacted from the UI, no checkout; model labels from `@agiworkforce/types`, never hardcoded; paywall only from server `429 {kind:'paywall'}`.
- [ ] Security: approval cards fail closed with server-issued `requestId`; overlay is Shadow-DOM isolated and treats page content as data; context-menu actions pass the same allowlist checks as panel actions.

## Anti-patterns

- Adding a BYOK/provider-key input, provider label, or checkout/billing UI (out of scope; keys and billing live on account/dev surfaces).
- Hardcoding a model ID in composer/model UI instead of reading `packages/types/src/models.json` via `@agiworkforce/types`.
- Auto-approving actions, animating an approval card so it looks auto-dismissed, or honoring an approval response without the exact server `requestId`.
- Raw hex colors, inline `<style>` blocks (breaks CSP `style-src 'self'`), or page-CSS leakage into the overlay.
- Surfacing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise only.
- Referencing Supabase, or renaming `proxy.ts` to `middleware.ts`.
- Claiming the popup, drag-repositioning, toast queue, or reduced-motion are shipped — they are Planned/Partial until a repo path proves otherwise.
