# @agiworkforce/ui

Status: Current
Owner role: Frontend platform
Last updated: 2026-06-14
Kind: ts-package
Criticality: medium

## Purpose

`@agiworkforce/ui` is the cross-surface home for **pure presentation primitives and shared
UI configuration** that must stay byte-identical between the web and desktop chat surfaces —
so brand/provider marks and the settings information architecture cannot drift between them.

It deliberately holds only stateless presentation + plain config. Anything stateful (data IO,
`invoke()`/`fetch()`, stores, RSC boundaries) stays in the consuming surface.

## Consumers

- **Web** (`apps/web`) — via the `@shared/components/ProviderMark` / `@/components/agi/AgiMark`
  re-export shims.
- **Desktop** (`apps/desktop`) — `ModelPopover`, `ComposerFooter`, and `SettingsPanel`
  (settings nav config).
- Not React Native — mobile renders its own native equivalents.

## Public API / Exports

`package.json#exports` → `./src/index.ts`:

- `ProviderMark`, `hasProviderMark` — official, theme-adaptive provider marks (OpenAI / Claude /
  Gemini / DeepSeek / …) via `simple-icons`, monochrome `currentColor`. Null-safe on empty input.
- `AgiMark` — the AGI brand mark (12-spoke), with `mono` / `spinning` / `accent` variants. Relies
  on `@keyframes agi-mark-spin` + the `--agi-amber` token being present in each surface's globals.
- `SETTINGS_NAV`, `SETTINGS_NAV_GROUPS`, `SettingsNavKey`, `SettingsNavEntry`, `SettingsNavGroup`
  — the canonical settings tab keys + grouping (desktop `SettingsPanel` is the source of truth).

## Dependencies

- `simple-icons` (provider marks), `lucide-react` (peer), `react` (peer).
