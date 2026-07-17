# AGI Runtime — Volume 32 — Accessibility

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; the nearest surface guides (`apps/desktop/AGENTS.md`, `apps/mobile/AGENTS.md`, `services/AGENTS.md`); and the real repo paths this volume grounds in — `apps/desktop/src/hooks/useReducedMotion.ts`, `apps/desktop/src/styles/globals.css`, `apps/desktop/src/providers/I18nProvider.tsx`, `apps/desktop/src/i18n/index.ts`, `apps/desktop/src/i18n/locales/`, `apps/desktop/src/features/chat/CommandPalette.tsx`, `crates/agiworkforce-protocol/src/protocol.rs`, `crates/agiworkforce-app-server/src/lib.rs`, `services/signaling-server/src/index.ts`, `apps/mobile/lib/v1FeatureFlags.ts`, `apps/mobile/app/(app)/account.tsx`.

## Overview & stance

AGI Runtime is the internal shared execution layer — it has no pixels of its own. So "runtime accessibility" is not about a screen; it is the **contract** between the runtime (which emits typed, labeled, localizable lifecycle events) and the six surfaces (which render those events into accessible UI). This volume covers the runtime-facing UI that surfaces build directly from runtime state: approval prompts, tool-call timelines, pairing/connection status, presence, and the remote-control window.

Trust modes make accessibility a **security** property here, not a nicety. The runtime's approval gates (`ExecApprovalRequest`, `ApplyPatchApprovalRequest`, `RequestPermissions` in `crates/agiworkforce-protocol/src/protocol.rs`) decide what a Local session is allowed to do and whether a Local→BYOK fork proceeds. A screen-reader or keyboard user must be able to read the provider label, the secret-scan result, and the payload preview, then approve or deny — without that, an inaccessible prompt becomes a coerced "approve blind," which is a trust-boundary failure. Remote Control is a window over a session that keeps running locally; accessibility of that window must never leak Local/BYOK payload into a Cloud sink to satisfy an assistive-technology (AT) request. Because the runtime is headless and most cross-surface a11y plumbing is unbuilt, many contract-level requirements below are 🔭.

## Keyboard Accessibility — full keyboard operation of runtime-facing UI

The runtime app-server is a headless JSON-RPC/WS host (`crates/agiworkforce-app-server/src/lib.rs`); it has no keyboard surface of its own. Keyboard operability lives where surfaces render runtime state. ✅ Built — the desktop command palette (`apps/desktop/src/features/chat/CommandPalette.tsx`) is fully keyboard-driven over runtime data: `ArrowUp`/`ArrowDown` navigate results, `Escape` closes, focus is trapped via `role="dialog"` + `aria-modal="true"`, and the input carries `role="searchbox"` with `aria-activedescendant`. This is the reference pattern.

Requirements: every runtime-facing dialog surfaces render — approval gates, pairing consent, tool-timeline entries — must be reachable and operable by keyboard alone, with a visible focus ring, a logical tab order, and `Escape`-to-dismiss that maps to **deny/cancel** (never a silent approve). 🔭 Planned — a runtime-wide contract requiring approval events to carry a default-focus target (default-deny) and stable focus keys so surfaces can wire keyboard traversal uniformly. 🔭 Planned — keyboard operation of the remote-control window (approve/deny/cancel from a paired phone or web client) over the signaling relay verbs (`services/signaling-server/src/index.ts`).

## Screen Readers — runtime accessibility hooks

"Runtime accessibility hooks" = the structured semantics the runtime emits so surfaces can build AT announcements. ✅ Built — the protocol event union (`crates/agiworkforce-protocol/src/protocol.rs`) is fully typed and correlated (`Event { id, msg }`), so each tool begin/end, approval request, and session-lifecycle change arrives as a discrete, machine-identifiable variant — the raw material for a live-region announcement. ✅ Built — desktop already renders those into AT-visible UI: `CommandPalette.tsx` uses `role="listbox"`/`role="option"` with `aria-selected`, and a `role="status"` empty state. ✅ Built — mobile screens use React Native accessibility props (`accessibilityLabel`, e.g. `apps/mobile/app/(app)/account.tsx`).

Gaps: 🔭 Planned — the runtime emits **no** a11y metadata itself (no announcement priority, no politeness hint, no human-readable summary field on events); surfaces must hand-author every announcement. A runtime-level "accessibility hint" contract — each lifecycle event carrying an optional localizable summary key + `live`/`assertive` politeness — is 🔭. 🔭 Planned — the security-critical rule that an approval event must expose provider label, secret-scan verdict, and payload preview to AT as first-class, non-visual-only fields (so a screen-reader user approves with the same information a sighted user sees) is a design requirement, not yet enforced by the protocol schema.

## Localization Support — runtime localization

✅ Built — desktop ships real i18n: `apps/desktop/src/providers/I18nProvider.tsx` + `apps/desktop/src/i18n/index.ts` wire `react-i18next` across twelve locales (`en, es, zh, ja, ko, fr, de, pt, it, ru, ar, hi`), each with `common.json` and `errors.json` namespaces (`apps/desktop/src/i18n/locales/`), with the active language persisted in the settings store. This includes a right-to-left locale (`ar`) and Hindi (`hi`).

The runtime core, however, is **not** localized. 🟡 Partial — protocol events and error variants (`crates/agiworkforce-protocol/src/protocol.rs`) are English enum identifiers and codes, consumed as-is; there is no shared runtime string-catalog that maps stable machine codes → localized strings across all six surfaces, so each surface re-authors translations (desktop has 12 locales; other surfaces lag). 🔭 Planned — a runtime i18n contract where every user-visible runtime string is emitted as a stable key + parameters (never pre-formatted prose), letting surfaces localize consistently, and RTL/pluralization/date-number formatting is handled at render. 🔭 Planned — mobile has no i18n framework wired (`apps/mobile` ships no `react-i18next`/`expo-localization` integration found); runtime-facing strings there are English-only.

## Reduced Motion — accessible animations

✅ Built — desktop honors the OS reduced-motion preference: `apps/desktop/src/hooks/useReducedMotion.ts` reads `matchMedia('(prefers-reduced-motion: reduce)')` and reacts to changes, and `apps/desktop/src/styles/globals.css` has `@media (prefers-reduced-motion: reduce)` blocks that disable smooth-scroll and message-bubble animation. This covers the two motion-heavy runtime surfaces: streaming token render and tool-stream lifecycle transitions.

Requirements: any animation driven by runtime events — token streaming, tool begin/end pulses, approval-prompt entrance, pairing spinners, presence dots — must degrade to an instant state change when reduced motion is set, with no loss of information (a spinner conveying "tool running" must have a static equivalent). 🟡 Partial — on mobile, animation libraries respect the system reduce-motion flag at the framework level (React Native `AccessibilityInfo`), but there is no audited runtime-facing gate ensuring streaming/companion animations degrade; the companion path itself is flagged off (`apps/mobile/lib/v1FeatureFlags.ts` `companion: false`). 🔭 Planned — a runtime contract that streaming/tool-stream emitters expose a "motion-optional" flag so every surface can suppress non-essential animation uniformly.

## Repository map

- `apps/desktop/src/hooks/useReducedMotion.ts` — `prefers-reduced-motion` hook.
- `apps/desktop/src/styles/globals.css` — reduced-motion media-query blocks.
- `apps/desktop/src/providers/I18nProvider.tsx`, `apps/desktop/src/i18n/index.ts`, `apps/desktop/src/i18n/locales/` — desktop localization (12 locales, `common`/`errors`).
- `apps/desktop/src/features/chat/CommandPalette.tsx` — keyboard + ARIA reference for runtime-facing UI.
- `crates/agiworkforce-protocol/src/protocol.rs` — typed event/approval union (a11y-hook source of truth).
- `crates/agiworkforce-app-server/src/lib.rs` — headless JSON-RPC/WS host (CLI-only).
- `services/signaling-server/src/index.ts` — remote-control verb relay (approval accessibility target).
- `apps/mobile/app/(app)/account.tsx` — RN accessibility-prop usage example.
- `apps/mobile/lib/v1FeatureFlags.ts` — companion/dispatch flags (off).

## Competitor notes

Claude Code, ChatGPT, and Codex handle accessibility at the app layer (web ARIA, native iOS/Android AT) and localize their own first-party UIs; their remote-control/on-the-web flows announce host events from a cloud-rendered surface. AGI's deliberate divergence: accessibility is a **trust-scoped runtime contract**, not just per-app polish. Approval prompts are security-critical and must be fully accessible so no user is nudged into approving Local→BYOK forks or Cloud routing blind; announcements and localized strings must never carry Local/BYOK payload across the boundary to satisfy an AT request. Runtime strings are emitted as codes + params so multi-provider, multi-surface localization stays consistent, and model identifiers in any localized string come from `packages/contracts/types/src/models.json`, never hardcoded.

## Acceptance / Definition of Done

Production-ready when every runtime-facing dialog a surface renders is keyboard-operable with default-deny focus, screen-reader users receive the same provider-label/secret-scan/payload-preview detail as sighted users before any approval, runtime strings localize from stable keys, and reduced-motion suppresses non-essential animation without information loss.

- [ ] Build: desktop `useReducedMotion` + `@media (prefers-reduced-motion: reduce)` apply to streaming and tool-stream UI; i18n loads all 12 locales incl. RTL (`ar`); command-palette keyboard/ARIA path passes an AT smoke test.
- [ ] Trust: approval-gate prompts expose provider label + secret-scan + payload preview to AT; `Escape`/dismiss maps to deny; no announcement or localized string moves Local/BYOK data into Managed Cloud.
- [ ] Security: remote-control window keyboard/AT actions travel only allowlisted signaling verbs; a11y summaries are size-bounded and carry no session payload.

## Anti-patterns

- Do not treat an inaccessible approval prompt as acceptable — it coerces blind approval of Local→BYOK forks or Cloud routing (a trust-boundary violation).
- Do not leak Local/BYOK payload into announcements, localized strings, or AT snapshots that reach a Cloud sink.
- Do not claim a cross-surface runtime a11y/localization contract is shipped; the runtime emits typed English events today (🟡) and the shared hint/string-key contract is 🔭.
- Do not pre-format prose in runtime events; emit stable keys + parameters so surfaces localize.
- Do not hardcode or invent model IDs in any localized string; read `packages/contracts/types/src/models.json`.
- Do not reference Supabase, `middleware.ts` (use `proxy.ts`), or removed tiers ("Plus", `pro_plus`, "Hobby"); pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise, no top-ups (Pro/Max INR are TBD — do not invent).
