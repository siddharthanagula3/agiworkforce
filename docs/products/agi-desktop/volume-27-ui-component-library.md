# AGI Desktop — Volume 27 — UI Component Library

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/desktop/AGENTS.md`, and repo paths `packages/design-tokens/src/index.ts`, `packages/ui/src/`, `packages/unified-chat/src/components/`, `apps/desktop/src/ui/`, `apps/desktop/src/features/v3/`.

## Overview & stance

This volume specifies the reusable UI component library AGI Desktop renders. Per the shared-packages mandate, Desktop is **website UI plus desktop-only extras**: tokens in `@agiworkforce/design-tokens`, byte-identical presentation primitives and settings/sidebar config in `@agiworkforce/ui`, chat surfaces in `@agiworkforce/unified-chat`, and only Tauri-native affordances (window controls, native pickers, keychain-backed key fields) Desktop-local. Nothing stateful belongs in `@agiworkforce/ui` (`packages/ui/README.md`).

Trust modes shape components, not just flows. Every model/provider affordance must render a **correct visible label** (`ProviderMark`, `LocalCloudToggle`, `ModelPopover`); a Local chat must never silently repaint as BYOK or Cloud. The Local→BYOK fork is a component obligation: a consent dialog with context selection, secret-scan result, payload preview, and provider label, composed from Dialog + FormField and gated behind explicit action. Desktop is full-trust (Local + BYOK + Managed Cloud), so its set is the superset; Web/Mobile reuse the subset their boundary permits.

## Buttons

Desktop ships a CVA-variant `Button` (`variant`: default/destructive/outline/secondary/ghost/link; `size`: default/xs/sm/lg/icon; Radix `Slot` `asChild`; React 19 ref-as-prop) — ✅ Built (`apps/desktop/src/ui/Button.tsx`); `LoadingButton` adds a pending spinner and disables during async work — ✅ (`apps/desktop/src/ui/LoadingButton.tsx`). Requirements: focus-visible ring, `disabled:pointer-events-none`, 4.5:1 contrast on both themes, min 32px hit target; destructive actions use the `destructive` variant. Promoting `Button` into `packages/ui` for web/desktop parity is 🔭 Planned.

## Inputs

Primitives: `Input`, `Textarea`, `Checkbox`, `Switch`, `Slider`, `Select`, `Label`, `FormField` — ✅ Built (`apps/desktop/src/ui/`); `FormField` wires label + description + error region with `aria-describedby` — ✅ (`apps/desktop/src/ui/FormField.tsx`). BYOK key entry must be a masked field written to the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service), never rendered plaintext or logged — masked field exists 🟡; keychain-only persistence for every provider field is flagged where gaps remain.

## Composer

The V3 composer is a standalone component wired to the shared Zustand stores (`useChatStore`, `useChatModelStore`), with send/stop, mic, attachment (`PlusMenu`), and inline `ModelPopover` — ✅ Built (`apps/desktop/src/features/v3/Composer.tsx`); the shared `ChatInput` + `ChatInputToolbar` remain the cross-surface baseline — ✅ (`packages/unified-chat/src/components/ChatInput.tsx`, `ChatInputToolbar.tsx`). Requirements: `Enter` sends, `Shift+Enter` newline, auto-grow textarea, streaming shows `Square` stop, active trust mode + provider label always visible. Composer reimplements rather than extending `ChatInput` (which lacks `composerActionsSlot`/`modelPopoverSlot`) — a reconciliation gap 🟡; convergence to one slotted composer is 🔭.

## Sidebars

The shared `Sidebar` renders session groups, temporal buckets, projects, and search — ✅ Built (`packages/ui/src/sidebar/Sidebar.tsx`, `SessionItem.tsx`, `ProjectsView.tsx`, `temporal.ts`); the V3 shell composes its own around it — ✅ (`apps/desktop/src/features/v3/Sidebar.tsx`). Requirements: collapsible, keyboard-navigable, per-item context menu, no cross-trust bleed (Local sessions visually distinct from Cloud). Collapse-width persistence is 🟡.

## Panels

AGI Work subpanels (Projects, Artifacts, Scheduled, Dispatch, Home) plus the artifact workspace mount in the V3 shell — ✅ Built (`apps/desktop/src/features/v3/AgiWork*.tsx`, `ArtifactWorkspace.tsx`; `packages/unified-chat/src/components/ArtifactPanel.tsx`). Upsell/cap panels (`CapBanner.tsx`, `CapModal.tsx`, `Pricing.tsx`) must render only the canonical ladder — Free $0; Basic $8/₹399; Pro $20; Max $100 and $200; Enterprise custom. Code still encodes older tiers (`packages/types/src/billing-catalog.ts`) — reconciliation is a separate tracked task — 🟡. The AGI Code panel exists but is not mounted — 🟡 (`apps/desktop/src/features/v3/CodeModeHome.tsx`).

## Split Views

`ResizeHandle` provides draggable pane splitting — ✅ Built (`apps/desktop/src/ui/ResizeHandle.tsx`); the chat/artifact split is the primary consumer — 🟡 (composed per-view, no shared split-pane primitive). Requirements: keyboard-resizable (`aria-valuenow`), min/max clamps, persisted ratio. A reusable `SplitPane` in `packages/ui` is 🔭.

## Dialogs

Full modal family: `Dialog`, `AlertDialog`, `ConfirmDialog`, `PromptDialog`, `AccessibleDialog` — ✅ Built (`apps/desktop/src/ui/`), Radix-backed with focus trap, `Esc`-to-close, and scrim; shared `SettingsModal` and `KeyboardShortcutsDialog` are cross-surface — ✅ (`packages/ui/src/settings-modal/SettingsModal.tsx`, `packages/unified-chat/src/components/KeyboardShortcutsDialog.tsx`). The Local→BYOK consent dialog (context selection + secret scan + payload preview + provider label + consent) must compose from these primitives — 🔭.

## Context Menus

`ContextMenu` (right-click), `DropdownMenu`, `Popover`, `HoverCard` — ✅ Built (`apps/desktop/src/ui/ContextMenu.tsx`, `DropdownMenu.tsx`, `Popover.tsx`, `HoverCard.tsx`). Requirements: full keyboard nav, `role=menu`, submenus, destructive items distinct, no trust-boundary crossing without confirm.

## Toolbars

Toolbars are composed, not a single primitive: chat input toolbar (`packages/unified-chat/src/components/ChatInputToolbar.tsx`; desktop `apps/desktop/src/features/chat/InputToolbar.tsx`) and artifact toolbar (`apps/desktop/src/features/artifacts/ArtifactToolbar.tsx`) — ✅ Built. Requirements: `role=toolbar`, roving tabindex, labeled icon buttons. A canonical `Toolbar` primitive in `packages/ui` is 🔭.

## Command Palette

The V3 `⌘K` search/command modal — ✅ Built (`apps/desktop/src/features/v3/SearchModalCmdK.tsx`); shared `CommandPalette` and `SlashCommandMenu` back cross-surface command entry — ✅ (`packages/unified-chat/src/components/CommandPalette.tsx`, `SlashCommandMenu.tsx`). Requirements: fuzzy filter, keyboard-only operation, grouped results; trust-boundary-crossing commands labeled and confirm-gated. Unifying the desktop modal onto the shared palette is 🔭.

## Toasts

`Toast` + `Toaster` provider with variants (success/error/info/warning) and auto-dismiss — ✅ Built (`apps/desktop/src/ui/Toast.tsx`, `Toaster.tsx`). Requirements: `aria-live=polite` (assertive for errors), stack + dedupe, action buttons. Trust-relevant events (sync applied, key saved, provider switched) surface as correctly labeled toasts.

## Progress Indicators

`Progress` (determinate bar), `Spinner`, `Skeleton`, streaming `ThinkingPill` / `AgentProgressFooter` — ✅ Built (`apps/desktop/src/ui/Progress.tsx`, `Spinner.tsx`, `Skeleton.tsx`, `apps/desktop/src/features/v3/ThinkingPill.tsx`, `packages/unified-chat/src/components/AgentProgressFooter.tsx`). Requirements: `role=progressbar` with `aria-valuenow` when determinate; long operations show progress, never a frozen UI.

## Typography

Token stacks — sans `Inter`, serif `IBM Plex Serif`, display `Crimson Pro`, mono `JetBrains Mono` — are exported and mirrored to `--chat-font-*` CSS vars — ✅ Built (`packages/design-tokens/src/index.ts` `agiTypography`, `agiChatCssVars`). Requirements: consume tokens (never hardcode families), mono for code/tool output. A first-class exported numeric type-scale is 🟡 (sizes applied via Tailwind utilities today).

## Icons

`lucide-react` is the icon set; `ProviderMark` renders official provider marks via `simple-icons` (monochrome `currentColor`, theme-adaptive, null-safe), `AgiMark` is the 12-spoke brand mark, and `toolIcon.ts` maps tool names to icons — ✅ Built (`packages/ui/src/ProviderMark.tsx`, `AgiMark.tsx`, `toolIcon.ts`). Requirements: icon-only controls have accessible labels; marks must match the routing provider — no stale/fake marks.

## Colors

Light (warm off-white) and dark (warm charcoal) palettes, accents (teal `#21808d`, terracotta `#da7756`), state colors (danger/info/success/warning), radii, and shadows are exported and projected to `--chat-*` CSS vars — ✅ Built (`packages/design-tokens/src/index.ts` `agiPalette`, `agiRadii`, `agiShadows`, `agiChatCssVars`; native mirror `agiNativeColors`). Requirements: WCAG AA contrast in both themes, semantic tokens only (no raw hex), consistent trust/status color semantics across surfaces.

## Spacing

Spacing uses the Tailwind scale plus exported radii tokens (`agiRadii` sm 6 / md 8 / lg 12 / xl 16 / 2xl 24 in `packages/design-tokens/src/index.ts`) — 🟡: no dedicated numeric spacing-scale export, so consistency relies on Tailwind + review. A shared spacing-token export is 🔭.

## Animations

`AgiMark` spin relies on `@keyframes agi-mark-spin` + the `--agi-amber` token; buttons/menus use `transition-colors`; `ThinkingPill` animates streaming state — ✅ Built (`packages/ui/src/AgiMark.tsx`, `apps/desktop/src/ui/Button.tsx`, `apps/desktop/src/features/v3/ThinkingPill.tsx`). Requirements: honor `prefers-reduced-motion`, keep interactive transitions ≤200ms. A tokenized motion/duration/easing export is 🟡 (durations inline today).

## Repository map

- `packages/design-tokens/src/{index.ts,chat.css}` — colors, radii, typography, shadows, CSS vars, native mirror.
- `packages/ui/src/` — `ProviderMark`, `AgiMark`, `toolIcon.ts`, `cn.ts`, `settings-nav.ts`, `sidebar/`, `settings-modal/`.
- `packages/unified-chat/src/components/` — `ChatInput`, `ChatInputToolbar`, `CommandPalette`, `SlashCommandMenu`, `ArtifactPanel`, `KeyboardShortcutsDialog`.
- `apps/desktop/src/ui/` — Radix/shadcn primitives (Button, Input, Dialog family, ContextMenu, Popover, Progress, Spinner, Toast/Toaster, ResizeHandle, FormField).
- `apps/desktop/src/features/v3/` — `DesktopShellV3`, `Composer`, `Sidebar`, `SearchModalCmdK`, `ModelPopover`, `LocalCloudToggle`, `AgiWork*`, `CapBanner`/`CapModal`, `Pricing`, `CodeModeHome`.

## Competitor notes

Claude, ChatGPT, and Codex each ship a single-provider component library tuned to their own model family and cloud. AGI diverges deliberately: components are **multi-provider** (`ProviderMark` renders whichever provider served the turn), **trust-aware** (visible Local/BYOK/Cloud labels, `LocalCloudToggle`, consent-gated Local→BYOK fork), and **local-first** on Desktop (BYOK fields bind to OS keychains; local files stay local). Primitives are shared across surfaces via `packages/`, so Web and Desktop stay consistent while Desktop adds native-only extras — a composition competitors do not need spanning one surface each.

## Acceptance / Definition of Done

Production-ready when: desktop primitives and shared packages render consistently in light/dark; every component meets WCAG AA (contrast, focus-visible, keyboard, `aria`); trust labels are always correct; pricing components show only the canonical ladder.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `test` pass; `packages/{ui,unified-chat,design-tokens}` typecheck clean.
- [ ] Trust: provider/trust labels verified on Composer, ModelPopover, Sidebar; Local→BYOK fork shows context selection + secret scan + payload preview + consent.
- [ ] Security/a11y: no raw hex or hardcoded fonts; icon-only controls labeled; `prefers-reduced-motion` honored; BYOK fields keychain-only, never logged.

## Anti-patterns

- Forking a primitive into Desktop when it belongs in `packages/ui`/`unified-chat` (web/desktop drift).
- Any component that silently routes/relabels a Local chat as BYOK/Cloud, or shows a provider mark not matching the real routing provider.
- Hardcoding model IDs in a selector/popover — read from `packages/types/src/models.json` only.
- Rendering removed tiers (Plus, pro_plus, Hobby), credit top-ups, or invented Pro/Max INR in pricing/cap components.
- Raw hex, ad-hoc font families, or magic spacing instead of tokens; referencing Supabase; renaming `proxy.ts` to `middleware.ts`.
- Claiming a shipped component without a repo path, or labeling a 🔭/🟡 capability as ✅.
