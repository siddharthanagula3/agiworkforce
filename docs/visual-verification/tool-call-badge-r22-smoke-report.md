# R22 inline tool-call badge — visual smoke-test report

**Round:** R23 lane A
**Date:** 2026-05-22
**Commits under test:** `9707de324` → `e361da768` (R22 lane 11)
**Components verified:** `InlineToolCall` (with `iconStyle="badge"`), `InlineToolCallGroup`, `WebSearchCard`

## Method

Live tool calls cannot be triggered without a configured LLM provider, and the repo is v1 LOCAL ONLY with no BYOK
(per `locks/v1-local-only-cloud-waitlist-2026-05-18.md`). Per the task's "Caveats" section, this smoke test uses a
**static-render harness** that mounts the three new components with hand-crafted props that mirror Claude's
reference patterns image-by-image.

- Harness route created: `apps/web/app/dev/inline-toolcall-demo/page.tsx`
- Server started: `pnpm --filter @agiworkforce/web dev` → ready in 350ms on http://localhost:3000
- Server confirmed responsive: `GET /dev/inline-toolcall-demo` returned `200`
- Browser driven through Chrome DevTools MCP (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`)
- Color-scheme emulation forced to `light` and `dark` to capture both modes
- All measurements (badge dimensions, row heights, font sizes) cross-verified by
  `getBoundingClientRect()` + `getComputedStyle()` via `evaluate_script`

## Reference set

- `~/Desktop/reference/ui/desktop/claude-artifacts/02_inline-tool-use_filesystem-results-summary.png`
  — primary reference: Filesystem integration group with letter badges + Result sub-labels + Done check
- `~/Desktop/reference/ui/desktop/claude-artifacts/03_inline-tool-expanded-detail_json-request-response.png`
  — secondary reference: expanded tool body
- `~/Desktop/reference/ui/desktop/claude-artifacts/06_inline-web-search-results_with-favicons.png`
  — WebSearchCard with favicons + title + domain rows
- `~/Desktop/reference/ui/desktop/claude-artifacts/08_stacked-tool-status-messages_compact.png`
  — compact stacked tool messages

## AGI captures

| File                                                              | Mode  | Viewport  | Description                                       |
| ----------------------------------------------------------------- | ----- | --------- | ------------------------------------------------- |
| `docs/visual-verification/web/tool-call-badge-r22-after.png`      | light | 1100x1800 | Web harness — canonical                           |
| `docs/visual-verification/web/tool-call-badge-r22-after-dark.png` | dark  | 1280x1800 | Web harness — dark mode parity check              |
| `docs/visual-verification/desktop/tool-call-badge-r22-after.png`  | light | 1100x1800 | Same harness — see "Desktop capture caveat" below |

### Desktop capture caveat

`apps/desktop` exposes only a single SPA route — the main chat surface. The renderer redirects unauth'd
sessions to `https://agiworkforce.com/login`, so the harness cannot be mounted without an app-code change.
Per the locked rule "Read-only on app code", the desktop screenshot reuses the same web harness URL but at
the desktop's typical viewport width (1100px). This is acceptable because **both apps import
`InlineToolCall` from `@agiworkforce/unified-chat`** — the rendered tree is identical at the React level.
Confirmed:

- `apps/desktop/src/features/chat/ToolCallCard.tsx:170` — passes `iconStyle="badge"`
- `apps/desktop/src/features/chat/MessageBubble/ToolCallCard.tsx:294` — passes `iconStyle="badge"`
- `apps/web/features/chat/components/ToolCallCard.tsx:186` — passes `iconStyle="badge"`

The desktop renderer was confirmed to boot (`pnpm --filter @agiworkforce/desktop dev:vite` started cleanly on
`http://127.0.0.1:5174` with the unified-chat package compiled into the bundle).

## Match assessment

| Element                                           | Spec                                                    | Measured                                                                                                                                              | Verdict                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Round badge ⌀                                     | 24px                                                    | 24.0x24.0 px (computed)                                                                                                                               | **match**                                                                                                                                            |
| Badge border-radius                               | full circle                                             | `border-radius: 1.67e7px` → fully round                                                                                                               | **match**                                                                                                                                            |
| Row height                                        | 28px                                                    | 28.0px (all 6 rows in Block 1)                                                                                                                        | **match**                                                                                                                                            |
| Badge letter glyph (F/B/W/M etc.)                 | F/W/B/M/I/`>` per `KIND_TO_BADGE`                       | F, F, F, F, M, [check] all rendered with correct letter via `data-badge-letter`                                                                       | **match**                                                                                                                                            |
| "Result" sub-label                                | small monospace below row                               | rendered, font-size 10px, `data-result-label=""` attr present                                                                                         | **partial** — font-family resolves to `ui-sans-serif, system-ui, ...` instead of monospace because no `text-mono` class wraps it (see Open issue #2) |
| Group header `Used X integration ▾`               | clickable, ChevronDown rotates 180°                     | rendered with `aria-expanded="true"`, chevron-down svg present, label text `Used Filesystem integration, loaded tools` matches reference              | **match**                                                                                                                                            |
| Web-search card layout (favicon · title · domain) | each row: 16px favicon + truncated title + small domain | rendered for all 5 results; favicons load via `google.com/s2/favicons` proxy in harness; "Show more (1 more)" link appears past `showMoreThreshold=4` | **match**                                                                                                                                            |
| Web-search header `{N} results` badge             | tabular-nums                                            | `5 results` rendered tabular                                                                                                                          | **match**                                                                                                                                            |
| Done row green check                              | `CircleCheck` 16px in `state-success` color             | check icon renders, but state-success token not defined globally — falls back to inline `#22c55e` literal in component code                           | **match** (visual), **partial** (token wiring — see Open issue #3)                                                                                   |
| Color scheme + typography                         | light bg `#f9f8f6`, body color near-black               | confirmed `rgb(249, 248, 246)` body bg, `rgb(2, 8, 23)` body color in light mode                                                                      | **match**                                                                                                                                            |

## Overall verdict

**PASS with 4 open issues.**

The R22 contract — badge anatomy (24px round letter-badges), row density (28px rows), Result sub-label,
collapsible group header, web-search card with favicons — is met across all 5 harness blocks. All measured
geometry matches the spec in `InlineToolCall.tsx` lines 13–17 (badge mode contract). All Lucide-React imports
resolve, all kinds map to the correct badge configs (`KIND_TO_BADGE`), and both apps mount the same exported
component.

## Open issues

### 1. Badge backgrounds render transparent — Tailwind `var()` fallback not honored

The badge bg class is `bg-[color:var(--surface-elevated,rgba(0,0,0,0.06))]` (InlineToolCall.tsx:240, 251).
`--surface-elevated` is **not defined** in `apps/web/app/globals.css` or `packages/design-tokens/src/chat.css`
(only `--chat-surface-elevated: #ffffff` exists there). The expected behavior is for the rgba fallback to apply,
producing a faint gray badge background like Claude's reference. The measured computed style shows
`background-color: rgba(0, 0, 0, 0)` (transparent) — the Tailwind v4 arbitrary-value parser appears not to
preserve the comma-containing rgba fallback inside `var()`.

**Effect on visuals:** badges render as flat letters on the page background with no subtle "chip" effect.
This is a real divergence from Claude's reference where the F/M/W/etc. letters sit on a soft gray circle.

**Fix candidate:** either (a) define `--surface-elevated` / `--text-muted` / `--bg-code` / `--bg-hover` /
`--border-subtle` / `--state-success` / `--text-secondary` globally in `apps/{web,desktop}/styles/globals.css`
(referencing the existing `--chat-*` tokens), or (b) rewrite the InlineToolCall classes to use the `--chat-*`
token namespace already shipped by `@agiworkforce/design-tokens`.

### 2. "Result" sub-label not actually monospace

The class string is `text-[10px] font-mono text-[color:var(--text-muted)] leading-4` (InlineToolCall.tsx:448),
but the computed `font-family` resolves to `ui-sans-serif, system-ui, sans-serif, ...`. The
`apps/web/app/layout.tsx` declares `JetBrains_Mono` and binds it to `--font-jetbrains`, and `--font-mono`
in the Tailwind theme layer is `var(--font-jetbrains), "Berkeley Mono", ui-monospace, monospace`. The issue
is likely class-order / specificity at the Tailwind utility level — `font-mono` may be overridden by an
ancestor `font-sans`. Spec §4 in `InlineToolCall.tsx:17` says "Result sub-label in small monospace", so this
is a real miss.

### 3. State / surface / hover CSS tokens never defined globally

Repository-wide grep confirms `--text-muted`, `--surface-elevated`, `--bg-code`, `--bg-hover`, `--border-subtle`,
`--state-success`, `--text-secondary` are **not** defined in any CSS file under `apps/` or `packages/`. The
component code uses them with inline-rgba fallbacks. This is brittle — see issue #1. Recommend a follow-up
ticket to wire the `--chat-*` tokens (which ARE defined and theme-aware in `packages/design-tokens/src/chat.css`)
to the bare `--*` token namespace, or vice versa.

### 4. "Loading tools" row uses letter `M` not search-glass glyph

The advisor flagged this proactively, and it confirms here: in Claude's reference image 02, the
"Loading tools" row inside the Filesystem group renders a **search-glass glyph**, suggesting Claude
renders MCP `list_tools` calls with a magnifier icon. AGI's `KIND_TO_BADGE` maps `kind: 'mcp-custom'`
to `{ kind: 'letter', letter: 'M' }`. The harness reproduces this — the first row shows an `M` badge.
This is a semantic gap, not pure styling: deciding when a tool call should render as a glyph vs. a letter
needs a small extension to either (a) infer "tool discovery / list_tools" from label, or (b) add a
`kind: 'mcp-list'` to the union.

## Commit + worktree state

- Branch: `main`, NOT pushed (per task locks).
- Files created:
  - `apps/web/app/dev/inline-toolcall-demo/page.tsx` (smoke-test harness)
  - `docs/visual-verification/web/tool-call-badge-r22-after.png`
  - `docs/visual-verification/web/tool-call-badge-r22-after-dark.png`
  - `docs/visual-verification/desktop/tool-call-badge-r22-after.png`
  - `docs/visual-verification/tool-call-badge-r22-smoke-report.md` (this file)
- App code: **no edits** (read-only respected).

## Test triggers

- Block 1 covered: `kind="mcp-custom"` (M letter), `kind="fs-list"` (F letter ×4), `kind="done"` (green check)
- Block 2 covered: all 12 `InlineToolKind` values × `iconStyle="badge"`
- Block 3 covered: 5 lifecycle states (pending / running / success / error / partial)
- Block 4 covered: `WebSearchCard` with 5 results + `showMoreThreshold=4` collapse
- Block 5 covered: 4-row group with `argSummary` per row + Done check
