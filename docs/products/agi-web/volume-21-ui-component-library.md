# AGI Web — Volume 21 — UI Component Library

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/web/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`. Grounded in real repo code: `apps/web/components/ui/*`, `packages/unified-chat/src/components/*` (+ `components/ui/*`), `packages/ui/src/*` (`sidebar/`, `toolIcon.ts`, `ProviderMark.tsx`, `AgiMark.tsx`), `packages/design-tokens/src/index.ts` + `chat.css`, `apps/web/app/globals.css`.

## Overview & stance

This volume specifies AGI Web's UI component library: the primitives (buttons, inputs, dialogs, menus, tooltips, toasts, cards, tables) plus the shared chat surface (composer, sidebar) and the design foundations (icons, typography, colors, spacing, animation). AGI Web is the **cloud-only** surface — no Local, no BYOK affordances ever appear here — so no component may render a provider-key field, a "run locally" toggle, or a BYOK fork control. Cloud is public alpha, open by default: components present managed features as available, never behind a waitlist gate.

The binding architectural rule is the **shared-packages mandate**: primitives and the chat surface live in `packages/` so Desktop and Mobile reuse them. Cross-surface pure presentation lives in `@agiworkforce/ui`; the chat surface lives in `@agiworkforce/unified-chat`; tokens live in `@agiworkforce/design-tokens`. Web-specific Radix/CVA primitives live in `apps/web/components/ui`. Website == Desktop minus desktop-only extras — Web must not fork a divergent look. Model IDs never appear in component code; the `ModelSelector` reads the catalog, never a hardcoded ID.

## Buttons

✅ Built — `apps/web/components/ui/Button.tsx` (CVA variants `default`/`destructive`/`outline`/`secondary`/`ghost`/`link`; sizes `xs`/`sm`/`default`/`lg`/`icon`; React 19 ref-as-prop, `asChild` via `@radix-ui/react-slot`) and cross-surface `packages/unified-chat/src/components/ui/Button.tsx`. `apps/web/components/ui/LoadingButton.tsx` covers pending state. Requirements: every button exposes a visible focus ring (`focus-visible:ring-2`), `disabled` disables pointer events, icon-only buttons carry an `aria-label`, and one primary action per view. New buttons must extend the CVA variants, never re-style ad hoc.

## Inputs

✅ Built — `apps/web/components/ui/{Input,Textarea,Checkbox,Select,Switch,Slider,Label,FormField}.tsx`. Requirements: each field pairs with a `<Label>` (`FormField.tsx` enforces id association), invalid state is announced (`aria-invalid` + description), and no input may collect a provider key or Local-mode secret on Web. Placeholder text is not a label substitute.

## Composer

✅ Built — `packages/unified-chat/src/components/ChatInput.tsx` plus `ChatInputToolbar.tsx`, `AttachmentMenu.tsx`, `ModelSelector.tsx`, `AgentControl.tsx`, `SendPreview.tsx`. The composer is the reused chat entry across surfaces. Requirements: auto-growing textarea, Enter-to-send / Shift+Enter newline, an attach affordance gated by `ALLOWED_ATTACHMENT_ACCEPT`/`validateAttachmentFile` from `@agiworkforce/types`, a Stop control while streaming (`Square` icon), and a model picker that sources IDs from the catalog store. On Web the composer never offers a BYOK/Local switch; it targets Managed-Cloud subscription-backed chat only.

## Sidebar

✅ Built — `packages/ui/src/sidebar/Sidebar.tsx` (+ `Menu.tsx`, `ProjectsView.tsx`, `SearchOverlay.tsx`, `SessionItem.tsx`, `temporal.ts`), exported from `packages/ui/src/index.ts` as pure presentation. Requirements: temporal grouping (`getTemporalGroup`/`TEMPORAL_LABELS`), keyboard-navigable session list, project navigation, and search overlay. Sidebar is pure UI — it takes data via props and must not call `fetch`/`invoke` or read Next/RSC state (boundary rule in `packages/ui/src/index.ts`). Only Managed-Cloud synced chats appear; no Local/BYOK rows exist on Web.

## Dialogs

✅ Built — `apps/web/components/ui/{Dialog,AlertDialog,AccessibleDialog,ConfirmDialog,PromptDialog}.tsx` (Radix-backed). Requirements: focus is trapped and restored to the trigger on close, Escape and overlay-click dismiss non-destructive dialogs, destructive confirmations require an explicit action button, and each dialog has an accessible title/description. Use `ConfirmDialog`/`PromptDialog` rather than `window.confirm`.

## Menus

✅ Built — `apps/web/components/ui/{DropdownMenu,ContextMenu,Popover}.tsx`, plus `packages/ui/src/sidebar/Menu.tsx` and command surfaces `packages/unified-chat/src/components/{CommandPalette,SlashCommandMenu}.tsx`. Requirements: full keyboard operation (arrow/Home/End/type-ahead), `role="menu"`/`menuitem` semantics via Radix, and no menu item that surfaces a removed capability (BYOK/Local on Web) or a removed plan.

## Tooltips

✅ Built — `apps/web/components/ui/Tooltip.tsx` and cross-surface `packages/unified-chat/src/components/ui/Tooltip.tsx`. Requirements: tooltips supplement, never replace, an accessible name; they are keyboard-reachable (show on focus), dismiss on Escape, and never carry the only copy of an interactive control. Icon-only buttons pair a tooltip with an `aria-label`.

## Toasts

✅ Built — `apps/web/components/ui/Toast.tsx` + `Toaster.tsx`, driven by `apps/web/lib/hooks/use-toast`. Requirements: an ARIA live region announces toasts, variants map to semantic state colors, swipe-to-dismiss on touch, auto-dismiss for non-critical messages, and errors persist until acknowledged. Toasts must not be the sole channel for a blocking error (pair with inline messaging).

## Cards

✅ Built — `apps/web/components/ui/{Card,HoverCard}.tsx`; chat-domain cards `packages/unified-chat/src/components/{ProjectCard,DownloadCard,GeneratedFileCard,ImageGenCard}.tsx`. Requirements: consistent radius/elevation from tokens (below), a single clear affordance per card, and no fake availability/status badges — a card must reflect real state, never a decorative "available" pill.

## Tables

✅ Built — `apps/web/components/ui/Table.tsx`. Requirements: semantic `<table>`/`<thead>`/`<th scope>` markup, responsive overflow handling, and (for admin/billing usage tables) sortable headers announced to assistive tech. Data tables must not invent metrics; usage/billing rows render server-verified values only.

## Icons

✅ Built — `packages/ui/src/toolIcon.ts` (`lucideToolIcon`) resolves lucide-react components from names decided by the platform-agnostic registry `getToolIconName` in `@agiworkforce/types`; Mobile uses a lucide-react-native resolver against the **same names** so every surface shows one icon set. Brand marks: `packages/ui/src/{ProviderMark,AgiMark}.tsx`. Requirements: icons use `currentColor` (pure-UI boundary), decorative icons are `aria-hidden`, and connector/provider logos use official marks per `apps/web/AGENTS.md`. Never hardcode a model ID into an icon map — resolve by tool/provider name.

## Typography

✅ Built — `packages/design-tokens/src/index.ts` `agiTypography` (`sans`/`serif`/`display`/`mono`) and web font variables in `apps/web/app/globals.css` (`--font-sans`, `--font-mono`, `--font-display`, `--font-heading`, `--font-body`, `--font-ui`). Requirements: type scale and line-height (`--line-height-chat: 1.6`) come from tokens; components never hardcode a `font-family`. Web mirrors the Desktop/shared stack so the surfaces read identically.

## Colors

✅ Built — `packages/design-tokens/src/index.ts` `agiPalette` (light + dark: surface/text/border/accent/state) and `agiChatCssVars` (mirrored into `packages/design-tokens/src/chat.css`). Requirements: components consume semantic tokens (surface/text/border/accent/state), never raw hex; every foreground/background pair meets WCAG AA in both themes; state colors (danger/info/success/warning) come from `agiPalette.*.state`.

## Spacing

🟡 Partial — radii are tokenized (`agiRadii` in `packages/design-tokens/src/index.ts`), but there is **no shared spacing-scale export**; spacing today comes from Tailwind utilities and `apps/web/app/globals.css`. Gap: a cross-surface spacing token set is 🔭 Planned so Desktop/Mobile inherit identical rhythm. Until then, use Tailwind's scale consistently and avoid arbitrary pixel values.

## Animations

🟡 Partial — motion primitives live in `apps/web/app/globals.css` (`--dur-fast`/`--dur-base`/`--dur-slow`, `--ease-out-expo`, `--ease-in-quart`, `--stagger-tight`/`--stagger-loose`) and shadow ramps in `agiShadows` (`packages/design-tokens/src/index.ts`). Gap: these motion vars are web-local, not yet exported from `@agiworkforce/design-tokens` for Desktop/Mobile reuse (🔭 Planned to promote). Requirements: honor `prefers-reduced-motion`, keep durations token-driven, and never block interaction on an animation.

## Repository map

- `packages/ui/src/` — cross-surface pure UI: `sidebar/`, `toolIcon.ts`, `ProviderMark.tsx`, `AgiMark.tsx`, `cn.ts`, `settings-modal/`.
- `packages/unified-chat/src/components/` — shared chat surface: `ChatInput.tsx`, `Sidebar.tsx`, `ModelSelector.tsx`, `ui/{Button,Tooltip,Badge,ScrollArea}.tsx`.
- `packages/design-tokens/src/` — `index.ts` (`agiPalette`, `agiRadii`, `agiTypography`, `agiShadows`, `agiChatCssVars`), `chat.css`.
- `apps/web/components/ui/` — Radix/CVA web primitives (Button, Input, Dialog, DropdownMenu, Tooltip, Toast, Card, Table, …).
- `apps/web/app/globals.css` — web CSS variables (fonts, motion, semantic colors).

## Competitor notes

Claude, ChatGPT, and Codex each ship a single-vendor design system tied to one provider and one trust posture. AGI's deliberate divergence: **one component library, many trust modes** — the same `Button`/`ChatInput`/`Sidebar` render across six surfaces, but each surface only exposes the affordances its trust boundary allows. Web is intentionally cloud-only (no BYOK/Local controls) while Desktop/CLI/VS Code expose BYOK forks — the shared components must stay trust-mode-agnostic and let the host decide, rather than baking a single vendor's assumptions into the primitives. The icon registry being name-driven across web (lucide-react) and mobile (lucide-react-native) is the concrete payoff: one visual language, many runtimes.

## Acceptance / Definition of Done

Production-ready when every listed primitive is token-driven, accessible in light and dark themes, reused from `packages/` (not forked per surface), and free of any Local/BYOK affordance on Web.

- [ ] Build: all primitives consume `@agiworkforce/design-tokens`; no hardcoded hex/font/model ID; `pnpm --filter @agiworkforce/web typecheck` + `build` pass; `pnpm check:boundaries` passes.
- [ ] Trust: no component renders a BYOK/Local control, provider-key field, or waitlist gate on Web; only Managed-Cloud synced data appears in Sidebar/lists.
- [ ] Security/a11y: focus rings visible, dialogs trap/restore focus, menus keyboard-operable, toasts announced via live region, `prefers-reduced-motion` honored, all interactive controls have accessible names.

## Anti-patterns

- Adding a BYOK key input, "run locally" toggle, or Local→BYOK fork control to any Web component (trust-boundary violation).
- Forking a divergent Web look instead of reusing `packages/ui` / `packages/unified-chat` (breaks shared-packages mandate; Web should equal Desktop minus desktop-only extras).
- Hardcoding hex colors, font families, or **model IDs** in components — resolve colors/fonts from tokens and model IDs from the catalog only.
- Fake availability/status badges, or presenting Cloud as waitlist-gated (it is public alpha, open by default).
- Referencing removed plans (`Plus`, `pro_plus`, `Hobby`) or credit top-ups in any pricing/upgrade UI.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or bypassing `use-toast`/`ConfirmDialog` with native `alert`/`confirm`.
- Icon-only buttons without an `aria-label`; tooltips carrying the only copy of an interactive control.
