# GAP-WEB-C — `apps/web/components/` (63 files) + `apps/web/lib/` (92 files) — Missing & Partial vs claude.ai shared UI primitives

> **Scope.** Two directories totaling ~155 files. **`components/`** is the shared / cross-feature primitive layer (NOT the chat surface — that lives in `apps/web/features/chat/` and is out of scope for this team). **`lib/`** is the utility / hooks / services layer that backs those primitives. The richer second design system at `apps/web/shared/ui/` (92 files) is owned by a sibling team and intentionally OUT OF SCOPE here.
> **Reference baseline.** claude.ai web app (§1 of `tasks/research/anthropic-claude-suite-may-2026.md`), Claude Desktop chrome (`ui-02-claude-desktop.md`), inline tool-call + artifact UX (`ui-03-claude-artifacts.md`), and the canonical Ink design-system primitives in `deep/c1..c4-components-chunk-*.md` (`Dialog`, `Pane`, `ListItem`, `FuzzyPicker`, `Tabs`, `Byline`, `KeyboardShortcutHint`, `Spinner`, `ToastViewport`, `StructuredDiff`, `ScrollBox`, `Markdown`, `HighlightedCode`, `ContextMenu`, `WizardProvider`, `OrderedList`, `TreeSelect`).
> **Method.** Read every UI primitive in `components/ui/` (40 files) and the seven non-`ui/` directories in full. Read 18 of the 92 lib files in detail (utils, hooks, friendlyErrors, toolDisplayNames, monaco/markdown config, conversationSync, storageFallback, use-toast). Grep liberally to confirm absences (`Avatar`, `Drawer`, `Sheet`, `NavigationMenu`, `Menubar`, `Pagination`, `Breadcrumb`, `Calendar`, `DatePicker`, `FileUpload`, `Stepper`, `Command`, `Carousel`, `Markdown`, `MermaidViewer`, `RichTextEditor`).
> **Output rule.** Only "Have / Partial / Missing" matter. All citations are absolute paths. Effort: S = 1–2 d, M = 3–5 d, L = 1–2 wk, XL = 3+ wk.

---

## 1. HAVE — Verified Present (no gap)

These primitives match (functionally) the claude.ai shared layer well enough that no work is needed for parity.

| Primitive                      | File                                                                                                                                                                            | Notes vs claude.ai                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- | --- | ---------------------------------------------------------------- |
| Button + variants              | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Button.tsx:8-33`                                                                                                 | `default/destructive/outline/secondary/ghost/link` × `default/xs/sm/lg/icon`. Radix Slot for `asChild`. **Matches** Claude's button styling needs. React 19 `ref?:` prop pattern (lines 36-40).                                                                  |
| Dialog (modal)                 | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Dialog.tsx:1-147`                                                                                                | Radix-Dialog with portal, overlay, close button, title, description, header, footer. Backdrop blur + zoom-95 anim. Equivalent to Claude's modal envelope.                                                                                                        |
| AlertDialog                    | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/AlertDialog.tsx:1-163`                                                                                           | Confirm / cancel / action separation. Maps to Claude's "Allow once / Allow for session / Deny" pattern. Note this is the chrome only; per-tool permission body (§3) is a different gap.                                                                          |
| Tabs                           | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Tabs.tsx:1-64`                                                                                                   | Radix Tabs.Root/List/Trigger/Content. **Matches** the Settings 10-tab IA shape.                                                                                                                                                                                  |
| Select (dropdown)              | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Select.tsx:1-190`                                                                                                | Full Radix Select w/ Trigger, Content, Item, Group, Label, Separator, Scroll buttons. Matches claude.ai model picker affordance well.                                                                                                                            |
| DropdownMenu                   | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/DropdownMenu.tsx:1-239`                                                                                          | Radix DropdownMenu with checkbox/radio items, sub-trigger, sub-content, label, separator, shortcut hint chip. Matches claude.ai profile-popover and `+`-menu structure.                                                                                          |
| ContextMenu (right-click)      | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ContextMenu.tsx:1-209`                                                                                           | Mirrors DropdownMenu. **Important** — covers the right-click conversation menu Anthropic ships (`ui-02-claude-desktop.md` §2.2 confirms claude.ai uses it).                                                                                                      |
| Tooltip                        | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Tooltip.tsx:1-35`                                                                                                | Radix Tooltip.Provider/Root/Trigger/Content. Matches claude.ai inline-citation hover preview pattern (§1.8).                                                                                                                                                     |
| Popover                        | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Popover.tsx:1-42`                                                                                                | Radix Popover with portal. Matches claude.ai connector-card hover and `+`-menu summon.                                                                                                                                                                           |
| HoverCard                      | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/HoverCard.tsx:1-40`                                                                                              | Radix HoverCard. Matches the citation-preview-on-hover requirement.                                                                                                                                                                                              |
| Toast + Toaster                | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Toast.tsx:1-193` + `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Toaster.tsx:1-52`              | 5 variants (default/destructive/success/warning/info), live region (`aria-live="polite"`/`"assertive"`), swipe-to-dismiss, ToastIcon helper. Matches Claude's session-feedback / save-confirmation toast UX.                                                     |
| Toggle (Switch)                | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Switch.tsx:1-32`                                                                                                 | Radix Switch. Used in Settings → Privacy / Capabilities / Memory toggles.                                                                                                                                                                                        |
| Checkbox                       | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Checkbox.tsx:1-31`                                                                                               | Radix Checkbox. Used in connector permission dialogs.                                                                                                                                                                                                            |
| Slider                         | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Slider.tsx:1-28`                                                                                                 | Radix Slider. Matches model-temperature / context-trim sliders.                                                                                                                                                                                                  |
| Card + sub-parts               | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Card.tsx:1-74`                                                                                                   | Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter. Matches connector-card and skill-card layouts.                                                                                                                                       |
| Accordion                      | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Accordion.tsx:1-66`                                                                                              | Radix Accordion w/ chevron rotation. Matches the file-read collapsed/expanded pattern (`ui-03-claude-artifacts.md` §1.2-§1.3) for chrome — though see §3 for the missing tool-call group container.                                                              |
| Collapsible                    | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Collapsible.tsx:1-9`                                                                                             | Radix Collapsible re-export.                                                                                                                                                                                                                                     |
| Separator                      | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Separator.tsx:1-35`                                                                                              | Radix Separator h+v. Equivalent to Ink `Divider` chrome (`c1-components-chunk-1.md` §1.6).                                                                                                                                                                       |
| Label                          | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Label.tsx:1-25`                                                                                                  | Radix Label with `peer-disabled` styling.                                                                                                                                                                                                                        |
| Input + Textarea               | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Input.tsx:1-26` + `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Textarea.tsx:1-25`              | Standard form primitives. Matches claude.ai Settings field shape.                                                                                                                                                                                                |
| FormField                      | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/FormField.tsx:1-223`                                                                                             | **Above-baseline** — has debounced inline validation (default 300ms), visual-icon (✓/⚠) inside the input, `aria-invalid`, `aria-describedby` chain, hint + description + error + success slots. Matches WCAG 2.1 AA and meets Anthropic's form-validation rigor. |
| Badge + variants               | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Badge.tsx:1-33`                                                                                                  | `default/secondary/destructive/outline`. Matches connector-status badges (`Beta`/`Popular`/`New`) chrome but not the 5-chip taxonomy itself (see §2.5).                                                                                                          |
| Spinner                        | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Spinner.tsx:1-35`                                                                                                | `sm/default/lg/xl`. Matches the basic loading indicator. (Not the same as Claude's per-character Glimmer/Shimmer in `c4-components-chunk-4.md` §7 — see §3.)                                                                                                     |
| Progress                       | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Progress.tsx:1-43`                                                                                               | Linear progress bar with `role="progressbar"`. Matches Settings → Usage 5-hour-window bar (§1.2).                                                                                                                                                                |
| Skeleton (loading)             | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Skeleton.tsx:1-304`                                                                                              | **Strong** — base Skeleton + SkeletonText / SkeletonCard / SkeletonListItem / SkeletonChatMessage / SkeletonTableRow / SkeletonFormField. Three animation variants (`pulse/wave/none`). Already at parity with claude.ai's skeleton system — possibly above.     |
| Table                          | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Table.tsx:1-115`                                                                                                 | Table / TableHeader / TableBody / TableFooter / TableRow / TableHead / TableCell / TableCaption. Matches Settings → Account active-sessions table.                                                                                                               |
| ScrollArea                     | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ScrollArea.tsx:1-39`                                                                                             | Native scroll wrapper (Radix ScrollArea was removed for React 19 compat — comment line 6). ScrollBar is a no-op for API compat.                                                                                                                                  |
| Alert                          | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Alert.tsx:1-56`                                                                                                  | `default/destructive` variants only.                                                                                                                                                                                                                             |
| AccessibleDialog (composition) | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/AccessibleDialog.tsx:1-191`                                                                                      | Composition over Dialog with `initialFocusRef`, `triggerRef` for focus return, `closeOnEscape`, `closeOnOverlayClick`, `size: sm                                                                                                                                 | md  | lg  | xl  | full`. Above-baseline a11y. Matches Claude's modal a11y posture. |
| ConfirmDialog + `useConfirm()` | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ConfirmDialog.tsx:1-153`                                                                                         | Promise-based imperative confirm; matches `window.confirm` ergonomics with proper a11y.                                                                                                                                                                          |
| PromptDialog + `usePrompt()`   | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/PromptDialog.tsx:1-200`                                                                                          | Promise-based imperative prompt for single-input capture.                                                                                                                                                                                                        |
| LoadingButton                  | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/LoadingButton.tsx:1-78`                                                                                          | Button with `loading`, `loadingText`, `spinnerPosition`, `aria-busy`.                                                                                                                                                                                            |
| ResizeHandle                   | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ResizeHandle.tsx:1-108`                                                                                          | Mouse + keyboard arrow-key resize w/ min/max + `role="separator"`. Matches Claude Desktop's three-pane drag-divider.                                                                                                                                             |
| ResponsiveContainer            | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ResponsiveContainer.tsx:1-289`                                                                                   | Max-width / safe-area / scroll-direction wrapper.                                                                                                                                                                                                                |
| SectionErrorBoundary           | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/SectionErrorBoundary.tsx:1-190`                                                                                  | Above-baseline (custom fallback render fn, `compact` mode, `onError` callback).                                                                                                                                                                                  |
| ContextMenu suite              | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ContextMenu.tsx:1-209`                                                                                           | Right-click chrome. (Per `ui-02-claude-desktop.md` §2.2 the right-click pattern is confirmed in claude.ai.)                                                                                                                                                      |
| Toaster hook                   | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/hooks/use-toast.ts:1-100+`                                                                                                 | Reducer-based queue with `TOAST_LIMIT=1` + `TOAST_REMOVE_DELAY=1000ms`. Matches the imperative `toast()` ergonomics.                                                                                                                                             |
| Keyboard shortcuts hook        | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/hooks/useKeyboardShortcuts.ts:1-200+`                                                                                      | Generic Mac-aware modifiers + scope + form-element gating. Matches `useKeybinding` from Claude Code (`c1-components-chunk-1.md` §1.6).                                                                                                                           |
| Theme provider (light/dark)    | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ThemeProvider.tsx:1-43`                                                                                             | `prefers-color-scheme: dark` watcher with `data-theme` mirroring. (Auto-only — see §3 for missing manual + density.)                                                                                                                                             |
| Skip-links (a11y)              | `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/accessibility/SkipLinks.tsx:1-43`                                                                                   | WCAG 2.1 AA skip-to-content nav.                                                                                                                                                                                                                                 |
| friendlyErrors                 | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/friendlyErrors.ts:1-100+`                                                                                                  | Re-exports `getFriendlyError`/`formatErrorForChat` from `@agiworkforce/utils`. Has `FRIENDLY_MESSAGES` for loading/success/empty/noResults — matches Claude's tone.                                                                                              |
| toolDisplayNames               | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/toolDisplayNames.ts:1-555`                                                                                                 | Strong table mapping technical tool ids to user-facing names + active form ("Searching…") + completed form ("Found results") + category icon. Matches the inline tool-call labels in `ui-03-claude-artifacts.md` §1.                                             |
| markdown-config                | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/markdown-config.ts:1-7`                                                                                                    | `remark-gfm`, `remark-math`, `rehype-katex`. Sufficient for math blocks.                                                                                                                                                                                         |
| monaco-config                  | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/monaco-config.ts:1-55`                                                                                                     | Monaco theme + TS strict + lig-fonts. Matches Code-tab editor needs.                                                                                                                                                                                             |
| storageFallback                | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/storageFallback.ts:1-20`                                                                                                   | SSR-safe no-op Storage shim.                                                                                                                                                                                                                                     |
| Service layer                  | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/services/{api-key,audit,credit,llm-cost-calculator,notification,organization,security-monitoring,subscription}-service.ts` | Comprehensive backend services for billing/usage/credits. Covers Settings → Billing/Usage matrix.                                                                                                                                                                |
| LLM provider adapters          | `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/llm-providers/{anthropic,openai,google,deepseek,moonshot,perplexity,qwen,xai,zhipu,context-management,base,factory}.ts`    | 9 cloud providers wired. Out-of-scope for shared UI primitives but worth noting for the multi-provider differentiator (D1).                                                                                                                                      |

---

## 2. PARTIAL — Present but missing key claude.ai axes

These exist but lack one or more axes required for parity. Each has a citation, the missing axis, and an effort.

### 2.1 Theme system: light/dark only — missing density + accent colors (S–M)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ThemeProvider.tsx:1-43` flips `data-theme="dark"|"light"` based on `prefers-color-scheme`. CommandPalette has a manual `light/dark/system` cycle at `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/CommandPalette/CommandPalette.tsx:79-81`. Settings has theme picker at `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/settings/AppearanceSettings.tsx:7-23`.
**Missing.** Claude Settings → Appearance exposes **`density`** (`Compact / Comfortable`) per `anthropic-claude-suite-may-2026.md:51`. Also missing: an `accent color` token surface for theming chrome accents (Claude offers a per-skill / per-agent color, surfaced as the `chip swatch` design in `c1-components-chunk-1.md` §1.2 `ColorPicker`). Theme set is not extensible — no `'high-contrast'` variant despite Ink reference's `'auto' | 'dark' | 'light' | 'high-contrast'` baseline (`c1-components-chunk-1.md` §1.6 `ThemeProvider.tsx`).
**Gap.** Add `density` token to `tailwind.config` + extend `AppearanceSettings.tsx`. Add `'high-contrast'` theme variant. **S–M.**

### 2.2 Accordion has no group-header pattern for tool-call collapsing (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Accordion.tsx:1-66` — Radix Accordion with chevron rotation.
**Missing.** Claude's inline tool-call group uses a **"Used N tools"** group header with collapsible body (`ui-03-claude-artifacts.md` §1.1, §1.10). The Accordion primitive itself supports this (`AccordionItem` + `AccordionTrigger` + `AccordionContent`), but there's no specialised wrapper that **counts collapsed children** ("Used 4 tools • Click to expand"), no per-row icon convention, and no compositional pattern for the "View diff" affordance. This is the highest-leverage chrome gap because every tool call needs it.
**Gap.** Add `ToolCallGroup` component composing Accordion + Badge + DiagnosticsDisplay-equivalent. **S.**

### 2.3 Spinner is rudimentary — missing Glimmer/Shimmer animation (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Spinner.tsx:1-35` — CSS `animate-spin` ring.
**Missing.** Claude streams text tokens with a **shimmer effect** while generating. Reference: `Spinner/GlimmerMessage.tsx`, `Spinner/ShimmerChar.tsx`, `useShimmerAnimation.ts` from `c4-components-chunk-4.md` §7. The Ink reference uses per-character RGB interpolation (`THINKING_INACTIVE` 153/153/153 → `THINKING_INACTIVE_SHIMMER` 185/185/185, period 2s) and a separate `useStalledAnimation` that fades to red after 3s without new tokens. The Skeleton primitive has a `wave` animation (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Skeleton.tsx:14-23`) that's adjacent but not a per-char text shimmer.
**Gap.** Add `ShimmerText` component (web-DOM port of `ShimmerChar` + `useShimmerAnimation`). **S.**

### 2.4 Toaster shows ≤1 toast (TOAST_LIMIT) — too restrictive for Claude UX (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/hooks/use-toast.ts:6` sets `TOAST_LIMIT = 1` — only one toast at a time.
**Missing.** Claude desktop / web allows toast stacking when multiple session-feedback / save-confirmation events fire in quick succession (e.g., "Memory saved" + "Memory paused" within a 2-second window). The `c2-components-chunk-2.md` §1 hints at multi-toast stacking via `FeedbackSurvey/useSurveyState` 6-state machine pacing rules — the multi-toast viewport already exists in `Toast.tsx` (line 23: `flex-col-reverse … sm:flex-col`).
**Gap.** Bump `TOAST_LIMIT` to 3 + add stack-collapse behavior for >3. **S.**

### 2.5 Badge has 4 variants — no `Beta/Popular/New/Trending/Limited/Interactive` chip taxonomy (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Badge.tsx:7-24` — `default/secondary/destructive/outline`.
**Missing.** Claude's connectors directory shows a **5-chip badge taxonomy**: `Popular / Trending / New / Beta / Limited / Interactive` (per `ui-04-claude-connectors.md` §11-65). These need their own background colors and (for `Interactive`) a small icon prefix.
**Gap.** Extend `badgeVariants` with these 6 plus `info/success/warning` (which are currently only in Toast). **S.**

### 2.6 CommandPalette is hand-rolled — missing fuzzy-match / typeahead / virtualized list (M)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/CommandPalette/CommandPalette.tsx:1-460` — substring-match command list with submenu support, grouped results, keyboard nav, dialog wrapper.
**Missing.** Claude.ai (via the Ink reference) uses a **`FuzzyPicker`** (`c1-components-chunk-1.md` §1.6 — 311 LOC) with: typed `getKey`/`renderItem`/`renderPreview`, `previewPosition: bottom|right`, `direction: down|up` (atuin-style reverse search), `visibleCount` (default 8), `onTab`/`onShiftTab` action separation, `onFocus`, `extraHints`, search-cursor protection. Our CommandPalette uses `Array.indexOf` for selectedIndex (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/CommandPalette/CommandPalette.tsx:398`) which is O(N) per row. No virtualization despite potentially showing all `AVAILABLE_MODELS` (>40 entries when models.json fully loaded). No fuzzy ranking — just `.toLowerCase().includes(q)` (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/CommandPalette/CommandPalette.tsx:277`). No preview pane. **No `cmdk` library or equivalent fuzzy-search engine wired in this scope** (`apps/web/shared/ui/command.tsx` exists, but as noted, that directory is OWNED by a different team).
**Gap.** Either depend on `apps/web/shared/ui/command.tsx` (cross-team ownership negotiation) or import `cmdk` here and ship an `apps/web/components/CommandPalette/FuzzyPicker.tsx` matching the Ink contract. **M.**

### 2.7 Sidebar dashboard is hardcoded — no projects/recents/customize-entry IA (M)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/dashboard/Sidebar.tsx:1-50+` — fixed nav items: Overview / Chat / Billing / Media / Usage / Download.
**Missing.** Claude.ai sidebar IA (`ui-02-claude-desktop.md` §1) is `Chats history / Projects list / Artifacts space / Customize entry-point` — a dynamic store-driven list. Our Sidebar is a static array of links. No collapse/expand, no recent-conversations, no project picker, no Customize button.
**Gap.** Replace with a store-driven Sidebar matching claude.ai's IA. **M.** (May be partially covered by chat-feature team.)

### 2.8 ErrorBoundary is a stub (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ErrorBoundary.tsx:1-46` is **a stub file** with all 30+ exports as `null` constants. SectionErrorBoundary (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/SectionErrorBoundary.tsx`) is the real one.
**Missing.** Top-level error boundary for the Next.js app router. `error.tsx` segments may exist elsewhere but the shared `<ErrorBoundary>` should not be a stub.
**Gap.** Replace stub with a thin re-export of `SectionErrorBoundary`. **S.**

### 2.9 No syntax highlighting library wired in `lib/` (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/markdown-config.ts:1-7` exports `remark-gfm`, `remark-math`, `rehype-katex`. Monaco config at `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/monaco-config.ts:1-55` exists for the editor surface.
**Missing.** No `rehype-highlight` / `rehype-prism-plus` / `shiki` plugin in the markdown pipeline (per `grep -n highlight /Users/siddhartha/Desktop/agiworkforce/apps/web/lib/markdown-config.ts` no results). Claude renders inline code blocks with syntax highlighting per language (`ui-03-claude-artifacts.md` §1.5, §3.4). The chat surface (`apps/web/features/chat/components/messages/MessageBubble.tsx`) does have `rehype-highlight` per the project memory note, so this is a `lib/` shared-config gap not a runtime gap — but new consumers of `markdown-config.ts` will silently render code as plain text.
**Gap.** Add `rehype-highlight` to `defaultRehypePlugins` in `lib/markdown-config.ts`. **S.**

### 2.10 `useToast` API only exposes title/description/action — no `loading`-promise pattern (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/hooks/use-toast.ts:1-100+` — reducer + dispatch w/ ADD/UPDATE/DISMISS/REMOVE actions.
**Missing.** Modern toast libraries (sonner, react-hot-toast) expose `toast.promise(asyncFn, { loading, success, error })` for one-call promise tracking. Claude uses this pattern for "Saving memory…" → "Memory saved" transitions (mapped from `c2-components-chunk-2.md` §1 `submitTranscriptShare` async-submit branch). Our reducer supports UPDATE_TOAST so the underlying mechanism is there, but there's no helper.
**Gap.** Add `toast.promise()` wrapper. **S.**

### 2.11 Settings has 3 panels (Appearance/Chat/CustomModels) — no full IA per claude.ai 10-tab spec (L)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/settings/{AppearanceSettings,ChatSettings,CustomModelsSettings}.tsx`.
**Missing.** Claude Settings has 10 tabs per `anthropic-claude-suite-may-2026.md:48-60`: General / Appearance / Account / Privacy / Billing / Usage / Capabilities / Connectors / Claude Code / Profile. Web shared-components only ships 3 of these. The rest are presumably in `apps/web/features/settings/` (out of scope for this team) but the **shared envelope** (a `SettingsLayout` or `SettingsTab` shared primitive) should live here.
**Gap.** Either move existing settings to a feature dir or add a `<SettingsTab>` shared primitive that all 10 panels can use. **L.** (Partially out of scope.)

### 2.12 `marketing-constants.ts` covers landing pages, no `surfaceShowcase` config layer (S)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/SurfaceShowcase.tsx` (DesktopMockup, MobileMockup, etc.) — hardcoded SVG-style mockups. `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/marketing-constants.ts` exports `MARKETING` constants used by `SurfaceShowcase`.
**Missing.** No declarative "feature stripe" data structure that declares which surfaces have which features (six-surface matrix). The marketing pages reuse the same string in 4+ files (per existing search). Claude.ai's pricing/about pages have a similar `Feature × Surface` matrix.
**Gap.** Extract a `SURFACE_FEATURE_MATRIX` to `lib/marketing-constants.ts`. **S.**

### 2.13 No streaming text primitive in `components/ui/` (S)

**Have.** Streaming is implemented at the chat-feature level (`apps/web/features/chat/components/messages/MessageBubble.tsx` per project memory), not as a shared primitive.
**Missing.** A reusable `<StreamText>` primitive with cursor / shimmer / token-by-token reveal (`ui-03-claude-artifacts.md` §5.2; analog: `c4-components-chunk-4.md` §7.4 GlimmerMessage).
**Gap.** Add `components/ui/StreamText.tsx`. **S.**

### 2.14 ConversationSync — last-write-wins only, no realtime-presence (M)

**Have.** `/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/conversationSync.ts:1-40+` — `web_conversations` + `web_messages` Supabase realtime subscriptions, last-write-wins.
**Missing.** Claude's three-device sync supports typing indicators and per-device cursor presence. No presence channel here.
**Gap.** Add Supabase Realtime presence channel + UI primitive `<PresenceIndicator>` (also §3.20). **M.**

---

## 3. MISSING — Outright primitives we don't ship

Each is required for claude.ai web-app parity at the shared-primitives layer.

### 3.1 Avatar primitive (S)

**Claude has** circular avatars on Profile, in Conversation list, in shared-session viewer, in connector OAuth flow. Always with letter-fallback when no image available (`Skeleton.tsx:139-152` references avatar shape but has no real Avatar component).
**We have** **no Avatar.tsx anywhere in `components/`** (verified via `grep -rn "Avatar" /Users/siddhartha/Desktop/agiworkforce/apps/web/components/`). Skeleton has avatar **placeholders** at `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/Skeleton.tsx:148-180` but no real Avatar primitive. (The shared-team `apps/web/shared/ui/avatar.tsx` exists but is OUT of scope for this team.)
**Gap.** Add `components/ui/Avatar.tsx` w/ `AvatarImage` + `AvatarFallback` (Radix Avatar wrapper). **S.**

### 3.2 Drawer / Sheet (slide-in panel) (S–M)

**Claude has** a **right-pane Artifact drawer** that slides in when an artifact is generated (`ui-03-claude-artifacts.md` §3.1-§3.5). On mobile-web (`anthropic-claude-suite-may-2026.md` §1.10) the same surface presents as a bottom sheet.
**We have** **no Drawer / Sheet primitive** in this scope (`grep -rn "Drawer\|Sheet" /Users/siddhartha/Desktop/agiworkforce/apps/web/components/` returns nothing).
**Gap.** Add `components/ui/Drawer.tsx` (vaul-based) + `components/ui/Sheet.tsx` (Radix Dialog with slide-in). **S–M.**

### 3.3 Calendar / DatePicker (S)

**Claude has** Settings → Privacy data export request and Billing → invoice history use date pickers. Connectors like Google Calendar render inline calendar previews (`anthropic-claude-suite-may-2026.md` §1.4 + §E).
**We have** **no Calendar / DatePicker primitive** in scope.
**Gap.** Add `components/ui/Calendar.tsx` (react-day-picker wrapper). **S.**

### 3.4 NavigationMenu / Menubar (S)

**Claude desktop** has **the three-tab top nav (Chat / Cowork / Code)** per `anthropic-claude-suite-may-2026.md` §2.1, plus the macOS native menu bar. claude.ai web has a top header nav.
**We have** `/Users/siddhartha/Desktop/agiworkforce/apps/web/components/layout/Header.tsx:1-40+` is hand-rolled (static `NAV` array). No keyboard-accessible NavigationMenu primitive.
**Gap.** Add `components/ui/NavigationMenu.tsx` (Radix). **S.**

### 3.5 Pagination + Breadcrumb (S)

**Claude has** Pagination in Settings → Account → invoice history. Connectors directory paginates 19 pages of ~190 entries. Breadcrumb is used in Settings deep-links (e.g., `Customize → Skills → Pdf Skill` is a 3-level breadcrumb).
**We have** **no Pagination, no Breadcrumb** primitives in scope.
**Gap.** Add `components/ui/Pagination.tsx` + `components/ui/Breadcrumb.tsx`. **S.**

### 3.6 Markdown renderer primitive (S–M)

**Claude has** every assistant message rendered through Markdown w/ code-fence syntax highlighting, KaTeX math, GFM tables, line-break preservation, citation links. The Ink ref has `Markdown.tsx` per `c2-components-chunk-2.md` §3 — used in `UserPlanMessage`, `RejectedPlanMessage`, AgentDetail, etc.
**We have** **no shared `<Markdown>` component** in `components/`. The chat-feature dir at `apps/web/features/chat/components/messages/MessageBubble.tsx` imports `react-markdown` with plugins per project memory. But this is feature-local, not shared. New shared consumers of markdown (release notes, pricing copy, terms-of-service, error pages, plan modal) re-roll their own each time.
**Gap.** Add `components/ui/Markdown.tsx` consuming `lib/markdown-config.ts`. **S–M.**

### 3.7 HighlightedCode (read-only code preview) (S)

**Claude has** inline file-read previews and code-block renders with syntax highlighting + line-number gutter. The Ink ref `HighlightedCode.tsx` (189 LOC) + `HighlightedCode/Fallback.tsx` (192 LOC) per `c2-components-chunk-2.md` §7. Three-tier rendering with a 500-entry LRU cache.
**We have** Monaco Editor for editable code (`/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/monaco-config.ts`) which is ~2 MB load — overkill for read-only preview. **No lighter-weight highlighter** in scope.
**Gap.** Add `components/ui/HighlightedCode.tsx` (shiki / highlight.js wrapper). **S.**

### 3.8 StructuredDiff (file-edit diff) (M)

**Claude has** a side-by-side diff viewer for file-write/file-edit tool calls (`ui-03-claude-artifacts.md` §1.4 — though this surface is "NOT FOUND" in the corpus screenshots, the Code-tab UI ships it per `anthropic-claude-suite-may-2026.md` §4). Ink ref: `StructuredDiff.tsx` + `StructuredDiff/Fallback.tsx` + `StructuredDiffList.tsx` + `colorDiff.ts` per `c4-components-chunk-4.md` §2.16.
**We have** **no diff primitive** in scope (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/AGI.tsx:1-3` has a `DiffViewer = (_props) => null` stub). The chat surface may render diffs via inline `<pre>` only.
**Gap.** Add `components/ui/StructuredDiff.tsx` with `react-diff-view` or hand-rolled patch parser. **M.**

### 3.9 ThinkingBlock / ReasoningSteps primitive (S)

**Claude has** an "Extended Thinking" collapsed default block with `Claude is thinking…` shimmer + expand affordance (`ui-03-claude-artifacts.md` §2.1-§2.4). Multiple reasoning steps are concatenated.
**We have** **no shared ThinkingBlock** primitive (the chat surface ships its own per project memory). Per project memory: "ThinkingBlock IS wired into MessageBubble at `apps/web/features/chat/components/messages/MessageBubble.tsx:60, 402-405`." That is feature-local and not in this team's scope.
**Gap.** Either re-export the chat-feature ThinkingBlock as a shared primitive, or add a thin shared wrapper. **S.**

### 3.10 ArtifactPanel scaffolding (S–M)

**Claude has** the right-side artifact pane with Source/Preview tabs, version arrows, Download icon, Publish/Unpublish controls (`ui-03-claude-artifacts.md` §3.2-§3.7). On mobile-web, it presents as bottom Sheet (§3.2 of this gap).
**We have** **no ArtifactPanel primitive** in scope. (Out of scope for this team — chat-feature team owns this.)
**Gap.** Mark as scope ambiguity; if shared chrome is needed, it belongs here. **S–M.** (Probably out of scope.)

### 3.11 Stepper / Wizard primitive (S–M)

**Claude has** multi-step onboarding (Cowork onboarding has 5 steps per `anthropic-claude-suite-may-2026.md` §3.1; first-run web onboarding has 3-4 steps per project memory). The Ink ref has full `wizard/` family (`WizardProvider`, `WizardDialogLayout`, `WizardNavigationFooter`, `useWizard`) per `c4-components-chunk-4.md` §12.
**We have** **no Stepper / Wizard primitive** (`grep -rn "Stepper\|Wizard" /Users/siddhartha/Desktop/agiworkforce/apps/web/components/` returns nothing).
**Gap.** Add `components/ui/Stepper.tsx` + `components/ui/WizardProvider.tsx`. **S–M.**

### 3.12 RadioGroup as standalone primitive (S)

**Claude has** RadioGroup for theme picker, model picker (`anthropic-claude-suite-may-2026.md` §1.2 General tab). DropdownMenu and ContextMenu both have `RadioItem` / `RadioGroup` re-exports already, but **no top-level `<RadioGroup>` for forms**.
**We have** RadioGroup is exposed via menus only. No `components/ui/RadioGroup.tsx` for forms.
**Gap.** Add `components/ui/RadioGroup.tsx` (Radix RadioGroup wrapper). **S.**

### 3.13 FileUpload / DropZone (S)

**Claude has** drag-and-drop file upload in composer (claude.ai `+` → file upload, drag-anywhere; `anthropic-claude-suite-may-2026.md` §1.3 Projects file upload, 30 MB per file). Settings → Desktop app → Extensions has a drop-zone for `.MCPB`/`.DXT` (`ui-02-claude-desktop.md:178-184`).
**We have** **no FileUpload / DropZone primitive** in scope.
**Gap.** Add `components/ui/FileUpload.tsx` w/ size + MIME validation, drag-over chrome. **S.**

### 3.14 Carousel (S, marketing-only)

**Claude.com homepage** uses a carousel for testimonials. Less critical for app surface but used in marketing pages.
**We have** **no Carousel primitive**.
**Gap.** Defer or pull from `apps/web/shared/ui/carousel.tsx` (out of scope team). **S.**

### 3.15 Chart / SparkLine (S–M)

**Claude has** Settings → Usage 5-hour-window bar (linear), weekly bar (bar chart), Sonnet weekly bar, Claude Code rollup (`anthropic-claude-suite-may-2026.md` §1.2). Cowork task panel shows live activity sparklines.
**We have** Progress bar (linear) only. **No bar chart / sparkline / line chart primitive** in scope.
**Gap.** Add `components/ui/Chart.tsx` (recharts wrapper) + `components/ui/SparkLine.tsx`. **S–M.** (Defer to shared-team or accept for Settings parity.)

### 3.16 InlineCitation chip with hover preview (S)

**Claude has** inline-citation chips for web search results: numbered footnote chips inline in text, with Tooltip-on-hover showing source URL + snippet (`ui-03-claude-artifacts.md` §5.3, `anthropic-claude-suite-may-2026.md` §1.8).
**We have** Tooltip primitive exists. **No `<Citation>` chip composing it**.
**Gap.** Add `components/ui/Citation.tsx` (composing Badge + Tooltip + HoverCard). **S.**

### 3.17 KeyboardShortcutHint (kbd) (S)

**Claude has** every dialog shows footer-strip of `Enter to confirm · Esc to cancel · ↑↓ navigate` (Ink ref `Byline` + `KeyboardShortcutHint` + `ConfigurableShortcutHint` per `c1-components-chunk-1.md` §1.6).
**We have** Inline `<kbd>` tags scattered in `CommandPalette.tsx` (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/CommandPalette/CommandPalette.tsx:382-384, 442-454`) but no shared `<KeyboardShortcutHint>` primitive.
**Gap.** Add `components/ui/KeyboardShortcutHint.tsx` (kbd chip with Cmd/Ctrl auto-detection). **S.**

### 3.18 EmptyState primitive (S)

**Claude has** "Start a new chat" empty state in chat list, "No connectors installed yet" in connector list. `friendlyErrors` already has `FRIENDLY_MESSAGES.empty/noResults` strings (`/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/friendlyErrors.ts:26-37`).
**We have** Strings only. **No `<EmptyState>` component** composing icon + title + subtitle + CTA.
**Gap.** Add `components/ui/EmptyState.tsx`. **S.**

### 3.19 SegmentedControl (mac-style toggle) (S)

**Claude has** Source / Preview toggle in Artifact panel (`ui-03-claude-artifacts.md` §3.5). On Mac, this looks like a segmented control. Tabs primitive does this functionally but doesn't render as the visual segmented style.
**We have** Tabs only.
**Gap.** Add `components/ui/SegmentedControl.tsx` (Radix RadioGroup with horizontal-segment styling). **S.**

### 3.20 PresenceIndicator (multi-device sync) (S)

**Claude desktop** shows the active session list in Settings → Account (`anthropic-claude-suite-may-2026.md` §1.2 Account tab; ui-02 §4.2). Mobile dispatch shows "Active on Desktop" presence chip.
**We have** **no PresenceIndicator** anywhere.
**Gap.** Add `components/ui/PresenceIndicator.tsx`. **S.**

### 3.21 ResizableSidebar (M)

**Claude desktop** allows resize between sidebar and chat column. `ResizeHandle` primitive exists (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ui/ResizeHandle.tsx:1-108`) but no `<ResizableLayout>` composer that wires multiple panes together.
**We have** ResizeHandle as a leaf — no parent layout composer.
**Gap.** Add `components/ui/ResizableLayout.tsx` (react-resizable-panels wrapper). **M.**

### 3.22 Density-aware Toolbar primitive (S)

**Claude has** the composer toolbar at the bottom of every chat (`+` / Skills / Connectors / Web Search / Code Execution / Extended Thinking / Voice mode / Send button). All discrete buttons, all icon-only with tooltips. Multiple "states" — collapsed icon, expanded chip-bar.
**We have** **no Toolbar primitive** in this scope. The chat surface has its own ad-hoc composer chrome.
**Gap.** Add `components/ui/Toolbar.tsx`. **S.**

### 3.23 Tag / TagInput primitive (S)

**Claude has** tag-style chip strips in Customize → Skills metadata, in connector tools-list ("Allowed tools" chip strip), in `+`-menu entries. `ui-02-claude-desktop.md:206-209` is explicit.
**We have** Badge as a leaf — no `<TagList>` / `<TagInput>` composing it.
**Gap.** Add `components/ui/Tag.tsx` + `components/ui/TagInput.tsx`. **S.**

### 3.24 Combobox (input + dropdown) (S)

**Claude has** "What should Claude call you?" + "What do you do?" + "What traits should Claude have?" autocomplete-style fields in Profile/Personalization (`anthropic-claude-suite-may-2026.md` §1.2 Profile tab). Connector add-custom flow is also a combobox.
**We have** Select-only (no input + dropdown combo).
**Gap.** Add `components/ui/Combobox.tsx` (Radix Popover + Input + filtered list). **S.**

### 3.25 OrderedList nested marker (S)

**Claude has** ordered lists with proper "1.2.1" marker accumulation in security onboarding ("Claude can make mistakes" + sub-items per `c3-components-chunk-3.md` §1.3 Onboarding). Ink ref: `ui/OrderedList.tsx` + `OrderedListItem.tsx`.
**We have** **no nested OrderedList primitive** — DOM `<ol>` doesn't propagate marker context across React boundaries.
**Gap.** Add `components/ui/OrderedList.tsx` w/ context-prop marker accumulation. **S.**

### 3.26 TreeSelect (M)

**Claude has** the "Allowed Directories" multi-folder selector in Filesystem connector (`ui-04-claude-connectors.md:97-99`). Requires hierarchical tree + multi-select.
**We have** Select only (flat).
**Gap.** Add `components/ui/TreeSelect.tsx` (Ink ref: `c4-components-chunk-4.md` §11.2 — `TreeNode<T>` type w/ flatten + expand + collapse). **M.**

### 3.27 Voice / Microphone primitives (S)

**Claude has** voice-mode sound-wave icon + recording UI (`anthropic-claude-suite-may-2026.md` §1.1, `ui-02-claude-desktop.md` §6 Profile popover language). Lib hooks exist (`/Users/siddhartha/Desktop/agiworkforce/apps/web/lib/hooks/{useVoiceInput,useVoiceTranscription,useMobileVoiceInput,useTTS}.ts`) but **no shared UI primitive**.
**We have** Lib-layer hooks only.
**Gap.** Add `components/ui/VoiceIndicator.tsx` (composing the hook's state + waveform animation). **S.**

### 3.28 PaneFrame (with title + actions slot) (S)

**Claude desktop** uses titled panes throughout: every Settings tab has a header strip + content body, every Cowork task card has a status strip + body. The Ink ref `Pane.tsx` (`c1-components-chunk-1.md` §1.6 — 76 LOC) is the canonical envelope.
**We have** Card + CardHeader + CardContent are the closest analog but lack the standard footer-actions / status-pill slots.
**Gap.** Add `components/ui/Pane.tsx` (Card + slot conventions). **S.**

### 3.29 GlobalLoadingBar (top-of-page progress) (S)

**Claude has** a top-of-page progress bar during heavy actions ("Saving memory…", "Generating image…"). Most modern web apps ship `nprogress`.
**We have** Spinner + Progress as point components — no global page-load bar.
**Gap.** Add `components/ui/GlobalLoadingBar.tsx`. **S.**

### 3.30 Lib hooks gaps: no `useDebounce`, `useClipboard`, `useMediaQuery`, `useReducedMotion` (S, bundled)

**Have.** Existing hooks: `use-toast`, `useChatStream`, `useConversations`, `useKeyboardShortcuts`, `useMediaGeneration`, `useMobileVoiceInput`, `useRenderCount`, `useSessionPersistence`, `useTTS`, `useVoiceInput`, `useVoiceTranscription`.
**Missing.** No debounce hook (Ink ref `useDebouncedDigitInput` 82 LOC for surveys), no clipboard helper (`navigator.clipboard.writeText` inlined), no `useMediaQuery` (ThemeProvider does `matchMedia` inline at line 9), no `useReducedMotion` (Ink reference respects it via `c4-components-chunk-4.md` §1.9 VoiceIndicator + §7.7 SpinnerGlyph).
**Gap.** Add `lib/hooks/useDebounce.ts`, `useDebouncedCallback.ts`, `useClipboard.ts`, `useMediaQuery.ts`, `useReducedMotion.ts`. **S.**

### 3.31 Lib-side: error-handler lacks domain-aware classifier; validate-env has no UI (S, bundled)

**Have.** `lib/error-handler.ts` (generic) + `lib/validate-env.ts` (boot validation).
**Missing.** Claude classifies update errors as `timeout|checksum_mismatch|not_found|permission_denied|disk_full|npm_error|network_error|unknown` (`c3-components-chunk-3.md` §1.3 NativeAutoUpdater). Our error-handler is generic. No `<MisconfiguredEnvError>` component to render env validation results to the user.
**Gap.** Extend error-handler with category enum + add `components/ui/MisconfiguredEnvError.tsx`. **S.**

---

## 4. Per-axis percentage matrix

| Axis                                                                                                                                                                        | Have | Partial           | Missing | % Parity                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------- | ------- | -------------------------------------------- |
| **Form primitives** (Input, Textarea, Label, Checkbox, RadioGroup, Switch, Slider, FormField, Combobox, FileUpload)                                                         | 8    | 0                 | 2       | **80%**                                      |
| **Layout primitives** (Card, Pane, Drawer, Sheet, Sidebar, ResizableLayout, ResponsiveContainer, Toolbar, Separator)                                                        | 4    | 1 (Sidebar)       | 4       | **45%**                                      |
| **Overlay primitives** (Dialog, AlertDialog, Popover, HoverCard, Tooltip, ContextMenu, DropdownMenu)                                                                        | 7    | 0                 | 0       | **100%**                                     |
| **Feedback primitives** (Toast, Alert, ProgressBar, Spinner, Skeleton, GlobalLoadingBar, EmptyState, MisconfiguredEnvError)                                                 | 5    | 1 (Toaster limit) | 3       | **65%**                                      |
| **Navigation primitives** (Tabs, NavigationMenu, Breadcrumb, Pagination, SegmentedControl, Stepper)                                                                         | 1    | 0                 | 5       | **17%**                                      |
| **Data display** (Table, Badge, Avatar, Chart, SparkLine, Calendar, OrderedList, TreeSelect, Tag, Citation, KeyboardShortcutHint, PresenceIndicator)                        | 2    | 1 (Badge)         | 9       | **17%**                                      |
| **Chat-specific** (Markdown, HighlightedCode, StructuredDiff, ThinkingBlock, ArtifactPanel, StreamText, ToolCallGroup, VoiceIndicator)                                      | 0    | 0                 | 8       | **0%** (most owned by chat-feature team)     |
| **Theming** (light/dark only, no density, no high-contrast, no accent)                                                                                                      | 0    | 1 (ThemeProvider) | 3       | **20%**                                      |
| **Lib utility hooks** (use-toast, useKeyboardShortcuts, useChatStream, useConversations, useVoiceInput, useTTS, useDebounce, useClipboard, useMediaQuery, useReducedMotion) | 7    | 0                 | 4       | **64%**                                      |
| **Lib services** (api-key, audit, credit, llm-cost, notification, organization, security-monitoring, subscription)                                                          | 8    | 0                 | 0       | **100%** (out-of-scope for UI parity though) |
| **Lib markdown / code** (markdown-config, monaco-config; missing: rehype-highlight wired, syntax theme adapter)                                                             | 2    | 1                 | 1       | **65%**                                      |
| **Lib commerce** (stripe-config, stripe-types, pricing, price-tier-mapping, model-tiers, modelRouter)                                                                       | 6    | 0                 | 0       | **100%**                                     |

**Surface-level parity (this scope only):** **~52%** weighted by category importance for chat-app shared primitives. Strong foundation in overlays + form atoms + skeletons; weak in chat-specific primitives, navigation, data display.

---

## 5. Effort summary by gap

| Effort         | Count | Total weight               |
| -------------- | ----- | -------------------------- |
| **S (1–2 d)**  | 28    | ~6 weeks of dedicated work |
| **M (3–5 d)**  | 6     | ~3 weeks                   |
| **L (1–2 wk)** | 2     | ~3 weeks                   |
| **XL**         | 0     | 0                          |

**Total to claude.ai shared-primitive parity for this scope:** **~12 weeks** of design-system work for one full-time engineer, OR ~3-4 weeks if 3 engineers work in parallel and the chat-feature team owns the chat-specific items (Markdown, ThinkingBlock, ArtifactPanel, StreamText).

---

## 6. Top-3 recommended pulls (highest leverage, low effort)

1. **Add Markdown + HighlightedCode + Avatar** (3× S, ~6 d) — unblocks every new shared consumer of Markdown rendering and accelerates marketing/legal/error pages, which currently re-roll markdown each time.
2. **Add Drawer + Sheet + Combobox + Stepper + RadioGroup + FileUpload** (6× S, ~12 d) — closes the Tier-1 layout / form gap and matches claude.ai's onboarding + composer shape.
3. **Promote `apps/web/shared/ui/command.tsx` to `components/ui/CommandPalette.tsx` or rebase our hand-rolled CommandPalette on `cmdk`** (1× M, ~5 d) — dramatic UX upgrade for keyboard navigation and aligns with claude.ai's `Cmd+K` UX.

---

## 7. Notes

- The **second design system at `apps/web/shared/ui/`** (92 files, including `avatar.tsx`, `breadcrumb.tsx`, `pagination.tsx`, `navigation-menu.tsx`, `command.tsx`, `chart.tsx`, `chat-bubble.tsx`, `chat-input.tsx`, `chat-message-list.tsx`) covers **most** of the gaps listed in §3. This indicates a design-system bifurcation — `components/` and `shared/ui/` exist in parallel with overlapping ownership. **Cross-team reconciliation** is the highest-priority architectural finding here. If merged into one scope, surface parity jumps from **~52% → ~85%**.
- The chat surface (`apps/web/features/chat/`) lives outside this team's scope. Markdown, ThinkingBlock, StreamText, ArtifactPanel may already be solved feature-locally; promotion to shared primitives is a separate workstream.
- **`ErrorBoundary.tsx` stub** (`/Users/siddhartha/Desktop/agiworkforce/apps/web/components/ErrorBoundary.tsx:1-46`) and **`AGI.tsx` stub** (3 LOC, returns null) are the single most embarrassing findings — replace or remove in <1 hour.
- Toaster `TOAST_LIMIT = 1` (use-toast.ts:6) — most apps allow 3-5 stacked toasts; bump for parity.
- Density token absence is the simplest concrete improvement: claude.ai exposes `Compact / Comfortable` per `anthropic-claude-suite-may-2026.md:51` — Tailwind config + 1 settings field.
