# 2026-05-21 — `packages/unified-chat` is the suite spine

Status: Locked
Owner: Platform lead
Last updated: 2026-05-21

## Decision

`packages/unified-chat` is the single source of truth for AGI Workforce's chat composer, settings shell, memory editor, attachment validation, design tokens, and any future user-facing UI primitive that must look the same across two or more consumer surfaces. Every consumer surface — `apps/web`, `apps/desktop`, `apps/extension`, `apps/extension-vscode`, and (where the React Native runtime permits) `apps/mobile` — inherits behavior from this package; surface-specific overrides are opt-in via component props, not forks.

## Context

The round-2 application-suite parity audit (`audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md`) confirmed that visible drift across surfaces was the single biggest pre-launch cost. Three coexisting token systems lived in `packages/unified-chat` (`--chat-*`, shadcn `hsl(var(--popover))`, hardcoded `ReactPreview` palette) — components used whichever happened to resolve at runtime in the host app, producing different visuals on web vs desktop vs extensions. The same shape appeared for composer drag-drop, attachment validation, memory editing, and the settings dialog: every host re-implemented its own.

The audit's P0 #2 (token alias path) and P0 #6 (shared settings shell) called this out explicitly: invest in `unified-chat` first because every per-surface fix downstream is a knock-on.

## What this means in practice

1. **New cross-surface UI primitives go to `packages/unified-chat`.** When a feature lands on two or more consumers (web + desktop, web + extensions, etc.), the implementation belongs in the shared package. Per-surface code only handles host-specific concerns: Tauri IPC for desktop, Next.js page wiring for web, manifest-driven popup HTML for chrome ext, VS Code webview HTML for vscode ext, expo-router screens for mobile.

2. **The package owns its own design tokens.** `packages/unified-chat/src/styles/globals.css` now exports a shadcn alias surface (`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--accent`, `--border`, `--ring`, `--radius`) aliased to the canonical `--chat-*` palette in both Dawn (light) and Dusk (dark) themes. Consumers that previously relied on whatever shadcn tokens the host defined now inherit a guaranteed surface from this package; no host can drift.

3. **Settings is a single shell + per-host section content.** `SettingsShell` from `packages/unified-chat` is the canonical modal IA (left-nav + right pane + Escape/click-outside close). Each consumer either uses the default sections (Profile / Capabilities / Memory / Connectors / Permissions / Appearance / Speech) or passes its own `sections` array. Desktop keeps its own `settingsDialogStore` for backward compat but pulls section content (e.g. `MemoryTab`) from the shared package.

4. **Shared contracts pair with shared components.** When a new shared component needs a contract (`MemoryFact`, `ChatAttachment`, `SignedUploadRequest`), the contract lives in `packages/types/src/<area>.ts`. The component imports from `@agiworkforce/types`; consumers import from both packages. This keeps the type wire 1:1 with the component shape.

## Alternatives considered

- **Per-surface implementations behind a coordination doc.** Cheap to start, but the round-1 + round-2 audits proved this is exactly how 3,778 hours of parity debt accrued. Rejected.
- **Web as the canonical surface; everyone else mirrors web.** Web is the most permissive runtime (full DOM, all browser APIs) so it's seductive — but desktop has Tauri-specific concerns (IPC, native menus) that shouldn't bleed into a generic shared package. Rejected.
- **shadcn/ui as the de-facto shared layer.** Would have made the Tailwind story trivial but doesn't cover non-Tailwind surfaces (Chrome ext popup is hand-written DOM + scoped CSS; VS Code webview is HTML strings). Rejected as the spine, kept as the in-package design system within `unified-chat`.

## Constraints worth knowing

- Mobile is React Native. It cannot directly mount React-DOM components from `unified-chat`; it implements its own native equivalents in `apps/mobile/src/features/*`. The audit reports keep mobile's separate implementation as a known exception, and we treat parity there as a contract match (does mobile's `MemoryScreen` cover the same operations as `MemoryEditor`?), not a code-sharing match.
- VS Code webview and Chrome ext popup don't run React in v1. Where they need shared behavior (allowlist UI, memory facts), they re-implement the contract in vanilla TS — `agi-workforce.memory` QuickPick in vscode mirrors `MemoryEditor`'s semantics without rendering the React component. This is acceptable as long as the contract (`MemoryFact` shape, max length, dedupe rules) comes from `@agiworkforce/types`.

## Verification of this decision

- Round-2 audit P0 #2 + #6 + composer drag-drop (P0 #3) all shipped during the 2026-05-21 session by editing only `packages/unified-chat` + `packages/types` and a thin consumer-side wire. See `docs/plans/2026-05-21-suite-transformation-handoff.md` for the per-commit trace.
- The same pattern will apply to the next big items: Artifacts versioning (P0 #9, 186h estimated), shared Projects component (32h), and the eventual Memory cloud-sync layer when Cloud Managed opens.

## Sources

- Round-2 parity synthesis: `audit/anthropic-apps-parity/team-2026-05-21/EXEC-SUMMARY-r2.md`
- Round-2 reconciliation: `audit/anthropic-apps-parity/team-2026-05-21/RECONCILE.md`
- Existing design-spec lock: `docs/design/design-spec-2026-05-15.md` (cross-competitor patterns that this decision operationalizes)
