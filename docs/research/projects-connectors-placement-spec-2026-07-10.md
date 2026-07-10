# Projects + Connectors placement spec (founder reference, 2026-07-10)

Status: Founder directive with reference screenshots (ChatGPT sidebar + claude.ai Directory)
Owner: Founder + platform lead
Stable reference images: `/Users/siddhartha/Desktop/reference/claude_reference/251–256_desktop-free__directory-*.png` (Directory modal: connectors table, grid, partners grid, Gmail detail, plugins). The ChatGPT sidebar captures were transient; behavior is fully specified below.

## Projects (ChatGPT sidebar pattern — founder: "I wanted it like that")

1. **Section header hover controls.** Sidebar `Projects ⌄` header shows NOTHING extra at rest. On hover of the header row, a `+` (new project) and `…` (overflow) appear right-aligned on the header line. `+` creates a project; `…` opens section options.
2. **Project row hover controls.** Each project row (folder icon + name) shows nothing extra at rest. On hover, two icons appear right-aligned: a compose/new-chat icon (new chat IN that project) and `…` (rename/delete/etc.). This replaces any always-visible buttons.
3. **Inline expansion.** Clicking a project expands it inline in the sidebar: its chats listed indented beneath (truncated titles), ending with `Show more`. The project row stays as the expanded header (open-folder icon). Second click collapses.
4. **Section layout.** Sidebar order: Pinned → Projects (max ~5 + `Show more`) → Chats (time-grouped). Projects link to their full project page as today; the dedicated Projects PAGE follows the claude.ai pattern (grid of cards: name, description, updated date; `New project` button top-right; `Sort by` dropdown; search field) — keep whatever of this already exists, align what doesn't.

## Connectors (claude.ai pattern — founder: "should not be outside; in the modal itself")

Connectors must NOT be a flat submenu/list "outside" (e.g. expanding inline from the composer plus-menu). Two sanctioned surfaces, both modals:

1. **Settings modal → Customize → Connectors** (ref: claude.ai settings modal): left nav has Settings (General/Account/Privacy/Billing/Usage/Capabilities/…) and a **Customize** group with `Skills`, `Connectors`, `Plugins`. The Connectors pane is a TABLE: filter tabs `All | Connected | Not connected`, columns Connector / Type / Status (✓ connected, "Reconnect"/"Connection issue" warnings in amber, `Connect` buttons), search icon + `Add ⌄` button top-right.
2. **Directory modal** (refs 251–256): a large centered modal titled `Directory`, left tab rail `Skills | Connectors | Plugins`, search field, `Anthropic & Partners` chip, `Filter by`/`Sort by` dropdowns, card GRID (icon, name, popularity/badges like BETA/New/Trending, one-line description, `+` to add / gear when configured / spinner while connecting). Clicking a connector opens a DETAIL view inside the same modal (`< Back`, icon+name+tagline, description, "Developed by X" + trust note, `Tools (N)` chip list of tool names, Details: Author / Connector URL with copy / Documentation / Support / Privacy Policy links, `Disconnect` button).

The composer plus-menu keeps only a `Connectors ›` ENTRY that opens one of these modals (entry point, not the list itself). Skills and Plugins entries follow the same rule — the Directory modal is the shared home for all three.

## Scope notes

- Web first (canonical); desktop inherits via UI-parity rule. No new backend capability — placement/presentation of existing features only.
- Honesty rules apply: only real connectors with real statuses; no fake popularity ranks or invented partner cards.
