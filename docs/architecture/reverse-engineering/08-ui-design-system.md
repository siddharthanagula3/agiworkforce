# 8. UI & Design System

Status: Current
Owner: Web/Design lead
Last updated: 2026-07-14

The UI is a three-layer stack: **design tokens** (colors/type/spacing) → **`@agiworkforce/ui`** (pure primitives) → **`@agiworkforce/unified-chat`** (the chat experience + composed components). Web and desktop consume all three; extension/vscode/mobile consume tokens and pieces as their platforms allow. Claude reference images are the primary visual reference (`docs/research/claudeai-component-spec-2026-07-10.md`).

## 8.1 Design tokens — `packages/ui/design-tokens`

The canonical token source. Exports `"."` (JS tokens) + `"./chat.css"` (CSS vars):

- `agiPalette` (light/dark), radii, typography, shadows.
- Per-surface CSS-var maps: `agiChatCssVars`, `agiNativeColors` (RN), `agiExtensionCssVars` (Chrome), `agiVsCodeCssVars` (VS Code). Each surface themes the shared primitives with its own var map, so one component library renders correctly in every host.
- No dependencies — tokens are the root of the UI DAG. `packages/ui/ui` consumes tokens; nothing consumes upward.

## 8.2 Primitives — `packages/ui/ui`

`@agiworkforce/ui` is **pure presentation** (strict boundary: no store/IO/Next; only presentation + plain config data). Structure:

- `src/primitives/` — ~40+ shadcn/Radix components: `Button`, `Input`, `Dialog`, `AccessibleDialog`, `AlertDialog`, `DropdownMenu`, `Command`, `DataTable`, `Drawer`, `Popover`, `Progress`, `FormField`, `LoadingButton`, `EmptyState`, `Calendar`, `Carousel`, `Resizable`, etc. (18 shadcn primitives were ported in during P3; 25 web primitives were repointed here and deleted.)
- `src/settings-modal/` — the shared **settings modal shell** (`SettingsModal.tsx` + `types.ts`) and `settings-nav.ts` navigation config.
- `src/sidebar/` — shared sidebar.
- `cn.ts` (the `clsx`+`tailwind-merge` helper), `ProviderMark.tsx`/`AgiMark.tsx` (provider/brand marks), `toolIcon.ts` (tool icons).
- Ext deps: Radix suite, `@tanstack/react-table`, `cva`, `cmdk`, `sonner`, `vaul`. Peer `react`, `lucide-react`, `next-themes`.

**Residual forks (tracked, decision-gated):** ~8 web-divergent primitives whose a11y/error features `ui` should gain before their web forks migrate (`Button isLoading`, `Input hasError`, the `form.tsx` FormField collision, legacy-toast-vs-sonner retirement, bespoke/aceternity + sidebar components that stay web-local or move to a `ui/marketing` subpath). See `docs/plans/monorepo-restructure-2026-07-08.md` P3.

## 8.3 The chat experience — `packages/ui/unified-chat`

`@agiworkforce/unified-chat` composes `ui` + `design-tokens` into the actual chat product:

- **Components:** `ChatInterface.tsx` (the composer + message stream shell), `SettingsShell.tsx` + `SettingsModal.tsx` (settings composed on the `ui` shell), `ProjectCard.tsx`, message/markdown/tool-call renderers.
- **Rendering:** `react-markdown` + remark/rehype + `katex` for markdown/math; one shared markdown/tool-call renderer; sandboxed-artifact HTML (rendered cross-origin via `infrastructure/sandbox`).
- **Logic libs:** host-bridge/runtime/capabilities, prompt classifier + routing decision, cloud chat-persistence client, plus the shared stores (area 6).
- **Consumers:** web (~31 files) and desktop (~25 files) — both still carry parallel chat trees on top of it; adoption + deletion is P3/wave 6.

The settings modal shell is the "modal-first" baseline: common settings/connector/plugin/search/project-edit/file-preview flows open as focused overlays before escalating to full-screen workspaces (`docs/current/technical-architecture.md`). Desktop settings already implement the first pass (centered modal, searchable left rail, grouped sections); the locked settings IA target is in the parity matrix ("Settings IA").

## 8.4 The composer (claude.ai parity target)

Grounded in `docs/research/claudeai-component-spec-2026-07-10.md` (live claude.ai crawl + reference screenshots), the composer target is: one-row layout (no overflow), tools in the `+` plus-menu with a persistent web-search toggle, a Chat/AGI-Work (Cowork) segmented toggle, a model picker with latest + Effort/More-models flyouts, mic (dictation) + waveform (voice), assistant-always/user-hover message actions. Empty state stays simple on mobile new-chat (no starter cards — founder rule). This is **in flight** (master-plan wave 1; matrix "Chat Shell = Partial"); the single-line composer row was recently hardened (branch tip commit).

## 8.5 The marketing system — "Editorial Terminal"

The marketing site (22 marketing pages) uses a distinct **Editorial Terminal** design system, separate from the app UI — a terminal/CLI-retheme "operator-broadsheet" aesthetic defined in `apps/web/app/globals.css`:

- An `.editorial-shell` wrapper applied to every `EditorialPage` across all 22 marketing pages, with a layered noise overlay, editorial primitive kit, specimen drop-caps, and a dark-surface selection treatment.
- Applied via `apps/web/components/layout/Header.tsx` and the page wrappers. This is intentionally app-independent branding.

A site-wide marketing redesign rollout across ~105 pages is founder-gated on aesthetic sign-off (master-plan wave 7, "Founder-gated").

## 8.6 What's fully documented vs flagged

- Token → ui → unified-chat layering, settings modal shell, marketing Editorial Terminal system: **fully documented**, code-verified.
- Residual `ui` primitive forks (~8) + web-local bespoke components: **in progress** (P3). Composer/artifact-viewer claude.ai parity: **in flight** (master-plan waves 1–2; matrix Partial).
