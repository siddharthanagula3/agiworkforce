# Canonical Website Screen + Component Inventory

Status: Reference (grounded in `~/Desktop/reference/claude_reference` web + settings images,
159 web screenshots read via the `claude-reference-web-ui-inventory` ultracode workflow,
9 agents). Owner: this session. Last updated: 2026-06-21.

**Purpose:** single grounding doc for building the agiworkforce **website** as the canonical
implementation in shared packages (`@agiworkforce/unified-chat`, `@agiworkforce/ui`), reused
by desktop + mobile. Rule throughout: **website == desktop minus desktop-only extras**.
Reference UI is Claude.ai; **structure is borrowed, content is not** — model IDs come from
`packages/contracts/types/src/models.json`, pricing is agiworkforce Local/Pro($20)/Max($80). Icon family
is **lucide-react** (the convention in `packages/ui/ui/src/settings-nav.ts`); every icon below is
a concrete lucide name.

> **Product-truth firewall (load-bearing).** The reference shows Claude models (Opus 4.7 /
> Sonnet 4.6 / Haiku 4.5), Claude tiers (Free/Pro/Max/Team/Enterprise), Claude prices
> ($17/$100/$200). **None are agiworkforce truth.** This doc maps the _layout/control
> structure_ only; every spot where reference content must be swapped for repo-sourced data
> is flagged.

---

## 1. Screen Map

Tags: **[web]** canonical website surface · **[web-shell]** chrome that also re-renders on
desktop/mobile · **[desktop-only]** browse-only or hand-off on web · **[separate]** not in scope.

| Screen / Surface                     | Tag                     | Route                       | Purpose                                                                             |
| ------------------------------------ | ----------------------- | --------------------------- | ----------------------------------------------------------------------------------- |
| Chat home (empty)                    | web                     | `/chat`                     | Time-aware greeting + centered composer + suggestion chips.                         |
| Chat conversation                    | web                     | `/chat/[id]`                | Message stream, inline tool/skill status, inline artifact widgets, docked composer. |
| Chats list / Recents                 | web                     | `/chat` (list)              | History list: title + relative time, project tags, select-mode, search.             |
| Global search palette                | web-shell               | overlay                     | Unified ⌘K search across chats + projects.                                          |
| Artifacts gallery                    | web                     | `/gallery`                  | Library of saved artifacts as preview cards ("Last edited … ago").                  |
| Artifact split-view / inline widget  | web                     | within `/chat/[id]`         | Live interactive artifact — inline + right-side panel.                              |
| Projects home                        | web                     | `/projects`                 | Project cards grid, sort, search, "New project".                                    |
| Project detail                       | web                     | `/projects/[id]`            | Per-project chats + knowledge/files.                                                |
| Connectors directory (browse modal)  | web                     | overlay on `/connectors`    | Searchable 2-col card grid w/ add/configure.                                        |
| Connectors detail / tool permissions | web                     | `/connectors/[id]`          | Per-connector intro + 3-state tool-permission grid.                                 |
| Skills browse (directory)            | web                     | overlay                     | 2-col grid of installable skills (`/name`, author, downloads).                      |
| Skills detail (rendered ↔ code)      | web                     | within Customize            | SKILL.md rendered/source views.                                                     |
| Customize home                       | web                     | `/customize` (target)       | Hub for Skills + Connectors (+ Plugins on desktop); 3-col nav/list/detail.          |
| Plugins directory                    | desktop-only            | `/plugins`                  | Browse-only on web (banner → desktop).                                              |
| Code surface                         | web                     | `/agi-code`                 | Coding-session surface (sessions, repo/branch, permission mode).                    |
| Settings (modal/page)                | web-shell               | `/settings`                 | Shell + sections (see §2F).                                                         |
| Pricing                              | web                     | `/pricing`                  | Tier cards (Local/Pro/Max) + Individual/Team toggle.                                |
| Auth (sign-in / sign-up)             | web                     | `/auth`, `/sign-up`         | Split hero + email/OAuth card + desktop download.                                   |
| Upgrade / plan modal                 | web                     | overlay                     | In-app tier comparison; CTA by current plan.                                        |
| Billing / Usage settings             | web                     | `/settings` → Billing/Usage | Plan summary, payment, invoices; usage meters.                                      |
| Downloads                            | web                     | `/download`                 | desktop / mobile / extensions / Code install cards.                                 |
| Cowork                               | desktop-only            | —                           | Desktop hand-off; label only on web.                                                |
| Claude Design / Chrome / Excel-promo | separate / desktop-only | —                           | Not in this build (promo/settings pane only on web).                                |

---

## 2. Per-Area Component + Iconography Spec

### 2A. Composer + Model Selector

Rounded composer card; bottom-left attach (`Plus`); text/voice input; bottom-right model
cluster + send/stop/voice. Centered under greeting on empty state, docked in conversation.

Add menu (`AttachmentMenu`): Add files/photos `Paperclip` · Screenshot `Camera` · Add to
project `FolderPlus` · From GitHub `Github` · Skills `BookOpen` · Connectors `Plug` · Plugins
`Puzzle` (dimmed on web) · Web search toggle `Globe` (blue+✓ on) · Use style `Brush`. Model:
name+mode+`ChevronDown`; Adaptive-thinking toggle; More models `ChevronRight`; effort levels
(check on selected, Code surface). Send `ArrowUp`; Stop `Square`/`CircleStop`; Voice `Mic`/`AudioLines`.

**Model selector = structure only:** two-tier menu (current-gen models + descriptors +
checkmark; divider; Adaptive-thinking toggle; divider; More models › flyout for legacy). The
**model LIST + descriptors come from `packages/contracts/types/src/models.json` + provider capability
metadata** — do NOT hardcode the reference's "Opus 4.7 / Sonnet 4.6 / Haiku 4.5".

Greeting `BrandedGreeting` + `getGreeting()` (`lib/greetings`); starburst → `Sparkles`. Chips
`QuickChips`: Code `Code` · Learn `GraduationCap` · Write `PenLine` · Life `Coffee` +
connector-sourced (e.g. "From Gmail" `Mail`). `Disclaimer` line.

### 2B. Artifact Viewer / Split-View + Inline Widget

TWO render modes (both in reference, both required): (1) **inline widget** in the stream
(live, header + counter/toggle + `MoreHorizontal` overflow), via `ArtifactRenderer` (sandboxed
iframe); (2) **right-side panel** (`ArtifactPanel`). View toggle rendered↔code = `Eye`/`Code`.
Reasoning `ThinkingBlock` (`ChevronRight`). Tool/skill status `StatusTrail`/`InlineToolCall`
(`FileText`/`Loader2`). Share `Share2`/`Upload`. Message actions `ActionBar`
(`Copy`/`ThumbsUp`/`ThumbsDown`/`RotateCw`). Gallery page `/gallery`: header + "New artifact"
`Plus` + search `Search` + 3-col preview-thumbnail cards ("Last edited … ago").
Cross-reference the verified §1.5 of the caching reference: **inline = ephemeral, panel =
persistent/versioned**, plus a "convert to artifact" action.

### 2C. Connectors Directory + Detail

Directory (browse modal): "Directory" title, left rail (Skills/Connectors/Plugins), search +
category pill + Filter/Sort, **2-col card grid**. Card: brand logo (`ConnectorLogo`, exists),
Add `Plus` / Configure `Settings`, status badges (New/Trending `TrendingUp`). Detail pane:
brand + name + Disconnect + `MoreVertical`; feature bullets; **Tool permissions** grouped by
collapsible category (count badge + group policy dropdown), each tool row = a **3-state
segmented permission control**: Allow `Check` / Ask `Hand` / Deny `Ban`. Store exists
(`getConnectorPermissionStore`); the UI is a gap.

### 2D. Skills

Browse directory: same modal shell; cards = `/skill-name` (mono) + author + download count
`Download` + 2-line desc + add/gear. Detail (in Customize): 4-col (global rail / Customize nav
/ skills list+file-tree / detail). Detail = title + enable toggle + `MoreVertical`; metadata
(Added by / Last updated / Trigger); rendered↔code toggle `Eye`/`Code`; "Allowed tools" chips;
rendered markdown or line-numbered YAML+md. `SkillMentionPicker` exists (composer only).

### 2E. Projects

"Projects" + Sort `ChevronDown` + New `Plus`; full-width search `Search`; responsive card grid
(title + example/shared tag + body + "Updated … ago"). Components exist: `ProjectCard`,
`ProjectGallery`, `ProjectHeader`. Project glyph `FolderOpen`/`Archive`; shared tag `Users`/`Share2`.

### 2F. Settings Shell + Sections

`SettingsShell` + `SettingsModal` (exist); nav SSOT `packages/ui/ui/src/settings-nav.ts` (reuse
verbatim). Modal: "Settings" + `X`; left search + icon'd nav (active = pill); right pane
(label/desc left, control right). Canonical sections (lucide icons fixed in settings-nav):
General `Settings2` · Account `CreditCard` (active-sessions table) · Personalization
`UserRound` · Privacy `Shield` · Models & Keys `Server` (BYOK = Local boundary; catalog from
models.json) · Agents `Zap` · Skills `BookOpen` · Connectors `Plug` · Plugins `Puzzle`
(browse-only) · Memory `Brain` (`MemoryEditor` exists) · Notifications `Bell` · Voice `Mic` ·
Capabilities `FolderCog` (Artifacts / AI-powered artifacts / inline visuals toggles + Code
execution + network-egress nested card + domain allowlist) · Usage `BarChart3` (meters; **flat
tier, NO top-ups** per repo pricing) · Billing `CreditCard` · Code `Code`. Recurring controls:
toggle switch · dropdown `ChevronDown` · navigable row `ChevronRight` · info `Info` ·
external-link `ArrowUpRight`/`ExternalLink` · kebab `MoreVertical` · delete `Trash2` · refresh
`RotateCw`; nested/dependent controls inset.

---

## 3. Shared-Component Mapping (exists vs gap)

**EXISTS in shared packages** — reuse, do not rebuild:

- `unified-chat`: `ChatStream`/`MessageList`/`MessageBubble`/`ChatInterface`, `ChatInput`/
  `ChatInputToolbar`/`AttachmentMenu`, `ModelSelector`(+`useModel`/`modelStore`),
  `BrandedGreeting`/`QuickChips`/`Disclaimer`, `useVoiceInput`, `ArtifactPanel`/
  `ArtifactRenderer`/`artifact-components/*`/`ArtifactsSidebar`, `WebSearchCard`/`CitationPill`,
  `StatusTrail`/`InlineToolCall(Group)`/`ThinkingBlock`/`ToolCallCard`/`ToolTimeline`,
  `ActionBar`, `ConversationHeader`, `Sidebar`/`ConversationItem`/`UserProfile`,
  `CommandPalette`, `ProjectCard`/`ProjectGallery`/`ProjectHeader`, `SettingsShell`/
  `SettingsModal`, `MemoryEditor`, `SkillMentionPicker`, `getConnectorPermissionStore` (store).
- `ui`: `settings-nav.ts`, `settings-modal/*`, `ConnectorLogo`, `sidebar/*`, `AgiMark`/`ProviderMark`.

**GAPS (net-new shared components to build):** `DirectoryModal`, `ConnectorCard`,
`ConnectorDetailPane`, `ToolPermissionControl` (3-state segmented), `ToolPermissionGroup`,
`SkillsListColumn`, `SkillDetailPane`, `CustomizeShell` (+ `/customize` route), `ArtifactGalleryCard`,
"Notify when done" toast, `PlanCard`/`PlanToggle` (pricing; or web-local), auth hero + downloads
cards (web-local).

---

## 4. Coverage Gaps (reference features the app likely lacks)

1. **Connectors Directory (browse modal)** — 2-col card grid, Filter/Sort, add/configure, badges. (high)
2. **Connector detail + tool-permission grid** — 3-state segmented control + group policy; store exists, UI doesn't. (high)
3. **Skills browse directory + detail pane** — directory cards + 4-col detail w/ rendered↔code SKILL.md. (high)
4. **Customize full-page surface** — 3-col Skills+Connectors(+Plugins) hub; no `/customize` route. (high)
5. **Artifacts gallery card** — `/gallery` route exists but no `ArtifactGalleryCard`. (medium)
6. **Custom remote MCP connector modal** — entry point captured, but reference 076 was a corrupted montage; **modal fields NOT captured — do NOT invent (Name/URL/auth). Tracked gap pending re-capture or docs.**
7. **"Notify when Claude responds" toast** (`Bell`).
8. **Shared-links / publish** — "Shared" tags + Share buttons visible; publish surface unclear as a shared component. (medium — verify)
9. **Plugins** — keep web **browse-only** (desktop-app banner); no plugin execution on web.

**NOT a gap (do not over-build):** web-search renders inline text `CitationPill` chips +
optional "Source: url" line — NOT a favicon source-card panel. `WebSearchCard`+`CitationPill`
already cover parity.

---

## 5. Fidelity Notes (recurring visual language)

- **Themes:** light + dark both first-class; collapsed-rail vs expanded sidebar is independent
  of theme; only color tokens flip — use the `design-tokens` package.
- **Cards:** rounded-rect, hairline border, soft shadow (light) / subtle fill (dark), generous padding.
- **Typography:** serif display for hero greetings/titles; sans for chrome/body; mono for skill
  names (`/name`), tool names, code views.
- **Accent/state colors:** primary accent for send + toggles-on + progress + checked; permission
  control green-check / neutral-hand / red-deny; selection = checkmark.
- **Iconography: lucide-react, outline ~1.5–2px** (matches settings-nav). Map Claude's
  proprietary glyphs to lucide (starburst→`Sparkles`, scroll→`BookOpen`, blocks→`Plug`/`LayoutGrid`).
  **Never reproduce Anthropic's exact proprietary glyphs.**
- **Entity glyphs:** chat `MessageSquare`; code/artifact chat `Code`; project `FolderOpen`/`Archive`;
  palette selected row `↵` `CornerDownLeft`.
- **Plan CTAs are state-dependent** (current-Max sees "Downgrade to Pro" not "Get plan") — encode
  CTA-by-current-plan, with agiworkforce tiers.

---

**Grounding paths:** shared = `packages/ui/unified-chat/src/components/`, `packages/ui/ui/src/`;
settings SSOT `packages/ui/ui/src/settings-nav.ts`; model catalog SSOT
`packages/contracts/types/src/models.json`; web routes `apps/web/app/`. Highest-confidence net-new shared
components: `DirectoryModal`, `ConnectorCard`, `ConnectorDetailPane`, `ToolPermissionControl`,
`SkillsListColumn`, `SkillDetailPane`, `CustomizeShell`, `ArtifactGalleryCard`.
