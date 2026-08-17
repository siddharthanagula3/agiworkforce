# Connectors, plugins, skills, MCP & custom assistants — 2026-08-15

Benchmarked against live-observed ChatGPT, Claude, Gemini, and Manus behavior (29 claims).
Cross-referenced against the same-day prior audit at `audit/parity-2026-08-15/` (domain-extensibility,
domain-shell-nav-ia, domain-dead-code, done-claim-verification).

## Method note

This domain turned out to be one of the stronger areas of the product. The web surface
(`apps/web`) has a real, deliberately-designed Skills/Connectors/Plugins system with a shared
`DirectoryBrowse` component, a genuine self-serve MCP connector flow, a granular per-tool
approval model, and code comments that actively refuse to fabricate metrics or show dishonest
UI. Several claims that looked like obvious gaps from the benchmark description turned out to
be already met, sometimes more thoroughly than the benchmark itself. The real gaps cluster
around: (1) skills auto-invoke is unwired even though the matcher exists (already flagged by the
prior audit), (2) connectors/plugins have no in-composer per-message attachment the way skills
do, (3) two of the three catalog objects (custom connectors, plugins) can be deleted with a
single click and no confirmation while the third (catalog connectors) is properly gated, and (4)
an entire category of claims (custom-assistant/GPT/Gem-style objects, star ratings, install
counts) doesn't apply because we don't build that kind of object at all yet.

---

## Claim-by-claim findings

### connectors-01 — Account-level extension management surface — PRESENT (web/desktop), PARTIAL (mobile)

Web ships exactly this: `packages/ui/ui/src/settings-nav.ts:279-305` (`SETTINGS_NAV_GROUPS_WEB`)
registers `skills`, `connectors`, `plugins` as three flat, always-visible settings items — a
founder directive comment at line 270-277 explicitly documents the flat-list decision. Global
permission-style controls exist: `apps/web/app/agent-permissions/page.tsx` (a full public page
documenting what runs without asking, what always needs approval, and every revoke path) and
per-tool "Always allow / Ask / Block" verdicts persisted in
`apps/web/features/connectors/stores/tool-permissions-store.ts`.

Desktop has the equivalent via `packages/ui/ui/src/settings-nav.ts:92-190` (`SETTINGS_NAV`), with
separate Connectors/Skills/Plugins tabs (already the subject of two prior-audit rows,
`EXTENSIBILITY-002`/`SHELL-NAV-IA-002`, about a naming collision between "Connections" and
"Connectors" — CONFIRMS_PRIOR, not re-filed here).

Mobile is the exception: `apps/mobile/src/features/drawer/components/DrawerContent.tsx`'s
`PRIMARY_ITEMS` has no Skills entry (removed by commit `1e858a7f1`), so a fully-built,
tested `SkillsScreen.tsx` (655 lines) is unreachable — already filed as `EXTENSIBILITY-001`/
`SHELL-NAV-IA-003` (P1). CONFIRMS_PRIOR; re-filed below as a claim-scoped row since it directly
falls under connectors-01's "reachable surface" requirement for one specific surface.

### connectors-02 — In-composer capability attachment — PARTIAL

Skills: genuinely present via two mechanisms in `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1264-1324` — typing `/` opens `SlashCommandMenu` with skill suggestions, and typing `@` opens a mention dropdown explicitly labeled "Skills" (lines 2191-2229). Both are searchable-as-you-type.

Connectors and Plugins: the composer's "+" menu (`ChatComposerNew.tsx:2714-2800`) has rows for
Skills/Connectors/Plugins, but the code comments say plainly what they do: "entry point that opens
the settings modal ... per-conversation connector enablement has no runtime backing, so the honest
surface is the settings pane — no fake toggles, no inline list" (lines 2740-2745). Clicking
Connectors or Plugins from the composer navigates OUT to the settings modal; there is no way to
attach/invoke a specific connector or plugin in-context for a single message.

This is architecturally coherent (connected connectors are already always-on per connectors-04
below, so a per-message toggle really would be decorative), but it means the claim's "attach a
connector directly from the composer" behavior is not met for 2 of the 3 categories.

### connectors-03 — Slash-command skill invocation — PRESENT (strength)

`apps/web/features/chat/components/Composer/SlashCommandMenu.tsx:104-134` builds
`skillSuggestions` from the live skill catalog, sorted and filtered by the typed query
(`normalizedQuery`), rendered with a distinct amber Sparkles icon and `isSkill: true`. This is a
real, working implementation of exactly the Claude/Gemini `/skill-name` pattern the claim
describes.

### connectors-04 — Automatic/implicit skill or connector invocation — PARTIAL

Connectors: genuinely automatic. `apps/web/app/api/llm/v1/chat/completions/route.ts:419-466`
loads every one of the signed-in user's CONNECTED connectors' tools
(`loadUserConnectorToolCatalog`) into EVERY chat turn, merged with operator MCP tools into
`mcpTools`, with no per-message selection required — gated only by the per-tool approval
verdict (`connectorPermissions`), not by whether the user picked the connector for this message.
This matches the claim for connectors.

Skills: confirmed NOT automatic, matching the prior audit's independent finding
(`EXTENSIBILITY-004`, CONFIRMS_PRIOR). `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:316-329` requires an explicit client-supplied `skill_name`; `applyManagedSkillSelection` (lines 461-473) only fires `if (!request.skill_name) return { ok: true }` — there is no server-side relevance matching. Desktop has a real matcher (`skill_match_for_message`, `apps/desktop/src-tauri/src/sys/commands/skills.rs:342-414`) exposed to the frontend as `matchForMessage`, but grepping `apps/desktop/src` for that identifier turns up only its own interface and implementation — zero call sites in any chat component. Skills remain 100% explicit-selection.

### connectors-05 — Dedicated "Connector search" auto-invoke toggle — MISSING

Grepped `apps/web` and `apps/desktop` for `Connector search`, `connectorSearch`, `Tool access
mode`, `Load tools when needed` — no matches outside this audit's own notes. Connectors are
always-searched-and-used per connectors-04 above, with no way to turn that off short of
disconnecting the connector or blocking the specific tool.

### connectors-06 — Global approval gate for plugin/connector actions — PRESENT (strength, more granular than benchmark)

`apps/web/app/agent-permissions/page.tsx` documents a real, working three-way default per action
class (no-ask / needs-approval / revoke), and `apps/web/features/connectors/stores/tool-permissions-store.ts` + `ToolPermissionsPanel.tsx` implement genuine per-tool "Always allow / Ask /
Block" verdicts, enforced server-side in `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2751-2813` (`gatedCalls`, `approvalCalls`, `lethal_trifecta` escalation). This is more
granular than either benchmark's single "Allow low-risk actions" toggle — a genuine strength, not
a gap.

### connectors-07 — Live in-flight tool-execution status line — INCONCLUSIVE (not filed as a gap)

`apps/web/features/chat/components/messages/ToolTimeline.tsx:134-164` (`humanizeToolName`) and
`describeMcpTool` (`apps/web/features/connectors/lib/mcp-tool-name.ts`) do produce real,
tool-specific human-readable labels rather than a generic spinner, and `ToolCallStatus` includes a
`'running'` state. Whether the label updates with dynamic per-call detail (ChatGPT's "Resolving
Library Documentation for Context7") the way the benchmark describes, versus a static per-tool-type
label ("Searching web"), was not fully verified — not filed as a gap; flagged as worth a closer
look with an actual live trace.

### connectors-08 — Tool-call trace that scales with call count — INCONCLUSIVE (not filed as a gap)

`ToolTimeline.tsx` genuinely renders an ordered, per-step list (not a fixed template) with
per-step icons and labels — structurally consistent with the claim. Whether a single-call trace
specifically collapses to a one-line plain-text summary versus the same itemized-row format used
for multi-call traces was not directly observed. Not filed as a gap.

### connectors-09 — MCP explicitly named in first-party UI — PRESENT (strength, more thorough than benchmark)

MCP is named directly and repeatedly in real product UI, not just docs:
`apps/web/features/connectors/pages/ConnectorsPage.tsx:256-390` ("Inspect MCP server", "MCP server
URL", "MCP auth token", "MCP reference servers", link text "MCP docs"), and
`apps/web/app/connectors/mcp-directory/page.tsx:8-133` (page titled "MCP Reference Servers",
"official MCP registry"). This is more explicit and more frequent than either ChatGPT's single
subtitle or Claude's single partner-listing sentence cited in the benchmark.

### connectors-10 — Self-serve raw MCP connector authoring — PRESENT (strength, matches Manus)

`apps/web/features/connectors/pages/ConnectorsPage.tsx:101-354` (`InspectMcpServerDialog`) is a
real, working, end-to-end flow: paste an MCP server URL + optional bearer token, click "Inspect
tools" (POSTs to `apps/web/app/api/mcp/route.ts`, which really connects and lists advertised
tools), review the returned tool list, then "Add connector" (POSTs to
`apps/web/app/api/connectors/custom/route.ts`, which persists it). No marketplace listing or
vendor intermediary required. This is functionally equivalent to Manus's "Add MCP by URL," is
live (not beta-gated), and additionally shows the inspected tool list before commit, which the
benchmark does not document Manus doing.

### connectors-11 — Self-serve custom API connector (non-MCP) — MISSING

Grepped for `Custom API`, `customApi`, `custom_api`, "REST API connector" across `apps/web` — one
unrelated comment hit, no feature. There is no non-MCP generic-REST-API connector authoring path;
every self-serve connector must speak MCP.

### connectors-12 — AI-assisted skill authoring entry point — MISSING on web/BYOK/managed surfaces; DIFFERENT mechanism on Desktop Local

No conversational or wizard-based "describe a skill, have the model draft it" flow exists
anywhere — grepped for `SkillEditor`, `SkillComposer`, `createSkill`, `CreateSkillDialog`,
`NewSkillForm` across `apps`/`packages`: no matches. `apps/web/app/settings/skills/new/page.tsx`
and `apps/web/app/skills/[name]/page.tsx` are pure browse/redirect surfaces with no creation form.

Desktop Local mode has a genuinely different mechanism instead: "Record skill"
(`apps/desktop/src/features/v3/DesktopShellV3.tsx:777-779`, wired to Tauri command
`skill_create_from_recording`, `apps/desktop/src-tauri/src/sys/commands/skills.rs:528`, with its
own E2E spec at `apps/desktop/wdio/specs/record-skill.spec.ts`) — the user performs an action and
the app derives a skill from the recording, rather than describing it in natural language. This is
real and wired, but explicitly gated to `privacyMode === 'local'` only
(`DesktopShellV3.tsx:778`), so it does not help web, BYOK, or managed-cloud users, which is where
the majority of the benchmarked competitors' equivalent features live.

### connectors-13 — Raw skill file upload / GitHub import — MISSING

No upload-a-file or import-from-GitHub path exists anywhere in the skill creation surface (same
grep sweep as connectors-12). The only inbound skill path found is the Cloud-catalog
`downloadHref` flow already flagged by the prior audit (`EXTENSIBILITY-005`) — and that one is a
one-way OUTBOUND file save to Downloads with no import-back-in step, which is the opposite
direction from what this claim needs.

### connectors-14 — Unified cross-category marketplace browsing UI — PRESENT (strength, matches Claude closely)

`packages/ui/ui/src/settings-modal/SettingsModal.tsx:444-826` (`DirectoryBrowse`) is exactly this:
one shared component with a `Skills / Connectors / Plugins` tab strip (line 496-500), a live
search box, a category filter for connectors, and A-Z/Z-A sort — reached from the Connectors
table's "Browse connectors" action, the Skills table's "Browse" button, and the Plugins table
(wiring confirmed at lines 1254, 1550, 1720). The component's own doc comment explicitly cites
"claude.ai refs 251-256" as the design reference and documents a deliberate choice: "Deliberately
NO download counts, popularity ranks, or partner cards — we have no such metrics (honesty rule)."

### connectors-15 — Download/install-count telemetry — MISSING (deliberate, not a bug)

Confirmed absent by design, not by oversight. `apps/web/db/neon/0096_plugin_registry.sql:12-14`:
"Nothing here stores a download count, install total, or rating: the registry has never observed
one, and a column invites a fabricated number." Same reasoning repeated in `SettingsModal.tsx`'s
`DirectoryBrowse` comment. See `notWorthCopying` below — this is a principled omission, not
something to silently backfill with fake numbers.

### connectors-16 — Star-rating display on custom-assistant storefront listings — MISSING (no underlying object)

There is no custom-assistant/GPT-equivalent object in this product at all — grepped for
`custom-assistant`, `CustomGPT`, and browsed `apps/web/app` for an assistant-builder route: none
exists. The claim doesn't just lack a rating widget, it lacks the underlying product concept the
rating would attach to.

### connectors-17 — Plugin as a composed bundle of skills + optional connectors — PRESENT (strength, more visible than benchmark)

Architecturally real, not cosmetic. `apps/web/db/neon/0096_plugin_registry.sql` has
`declared_skills` and `required_connectors` columns as first-class parts of the
`PluginRegistryEntry` contract. `apps/web/app/plugins/[id]/page.tsx:199-245` decomposes a plugin
into its skill list and a `ConnectorChecklist` of required connectors. `apps/web/app/plugins/page.tsx:163-171` goes further than Claude's list view (which only shows a count column per
the benchmark) — it renders the actual skill names as inline chips directly in the catalog list,
before opening the detail page.

### connectors-18 — Plugin-sourced skill autocomplete attribution — MISSING

`SkillItem` (`apps/web/features/chat/hooks/use-skills-list.ts:10`) carries a `source` field, but
it is a coarse catalog-origin tag (`'bundled' | ...`, see
`apps/web/lib/services/skill-catalog-service.ts:57-83`), not a plugin name — and even that field
never reaches the composer: `SlashCommandMenu.tsx`'s `skillSuggestions` mapping (lines 118-129)
only carries `id`/`command`/`description`/`icon`, dropping `source` entirely. There is no
plugin-provenance data flowing into the composer's skill picker at all, so there is nothing to
wire even once the data model is extended.

### connectors-19 — Distinct narration copy for plugin-sourced vs. standalone skill invocation — MISSING

Grepped the whole product for `Loaded.*skill`, `skill.*loaded`, `Using skill` — the only hits are
unrelated store/loading-state code (`skillMarketplaceStore.ts`, `DesktopCloudSettingsModal.tsx`).
There is no "used skill X" disclosure narration text anywhere in the chat UI, for skills sourced
either way — this is a strict prerequisite-gap on connectors-18 above (no provenance data means
no provenance narration is possible yet).

### connectors-20 — Confirmation-gated plugin/connector removal — PARTIAL / inconsistent within our own product

Catalog connectors do this correctly: `apps/web/features/connectors/pages/ConnectorsPage.tsx:767-795` renders a real confirm `Dialog` with per-connector consequence copy from
`describeDisconnect()` (line 491) before disconnecting.

Two adjacent, equally-destructive controls in the SAME product bypass it entirely:

- Custom (self-added MCP) connectors: the "Remove" `X` button at
  `ConnectorsPage.tsx:1190-1203` calls `handleRemoveCustomConnector(c.id)` directly `onClick`, with
  no confirmation step of any kind.
- Plugins: `packages/ui/ui/src/settings-modal/SettingsModal.tsx:1921-1932`'s "Remove" button calls
  `adapter.removePlugin?.(plugin.id)` directly `onClick`, also with zero confirmation.

This is the exact anti-pattern the claim's `howToVerify` warns against ("a single-click,
no-confirmation delete"), and it is inconsistent with the confirmed-safe pattern this same
codebase already built and shipped for catalog connectors one component away.

### connectors-21 — Dedicated read-only "data source" integration category — MISSING

`apps/web/features/connectors/data/connectors.ts` categories (`grep -o "category: '[^']*'"`):
AI, Cloud, Communication, CRM, Data, Design, Developer, Exclusive, Finance, Healthcare,
Marketing, Productivity, Social, Storage — all sub-filters within one flat "Connectors" bucket in
`DirectoryBrowse`'s category `<select>`. There is a `'Data'` sub-category tag, but no top-level
architectural split between read-only data feeds and action-taking connectors the way Manus has a
peer "Data sources" tab.

### connectors-22 — Ready-to-use example prompt on connector cards — MISSING

Grepped `connectors.ts` and `ConnectorsPage.tsx` for `examplePrompt`/`sample prompt`/`Try:` — no
matches. Connector cards show name/description/category only.

### connectors-23 — First-party productivity-suite bundle as one master toggle — MISSING

Grepped for `Google Workspace`, `workspace bundle`, `masterToggle` — no matches. Each first-party
integration in the catalog is an independent connector with no bundle-level parent toggle.

### connectors-24 — Two simultaneously-live tiers of custom-assistant objects — N/A (no underlying object exists)

Same root cause as connectors-16: there is no custom-assistant-object primitive in this product,
so there cannot be two competing tiers of it. Not a gap to close — see `notWorthCopying`, this is
a benchmark anti-pattern, not a target.

### connectors-25 — Public storefront for custom-assistant objects with category browsing — MISSING / mostly non-functional today

`apps/web/app/plugins/page.tsx` IS a public marketing-layout page (Header + MarketingFooter, no
auth gate visible), reachable without an account, which partially matches the "reachable without
first creating one" requirement. But it has no category-tab browsing (category is shown as plain
text per row, `page.tsx:159`, not a filterable nav), and per the page's own doc comment, "every row
is `preview`" today — i.e. the catalog that exists is not yet installable by anyone, first- or
third-party. This is closer to a pre-launch shell than a working storefront.

### connectors-26 — Context-load control for installed tools — MISSING

Grepped for `Tool access mode`, `Load tools when needed`, `toolAccessMode` across web and desktop
— no matches outside one forward-looking comment (`apps/desktop/src/features/settings/tabs/Capabilities/index.tsx:30`, "network egress, domain allow list) consolidate here in the
app-verified pass" — describing a future state, not a shipped one).

### connectors-27 — Sandboxed network-egress control for skill/code execution — MISSING

`apps/desktop/src/lib/egressGuard.ts` is a real, well-documented control, but it enforces a
different boundary (whether the whole Local-mode app may talk to AGI's own cloud infrastructure at
all) — not a user-configurable outbound-domain allowlist scoped to sandboxed skill/code execution.
Grepped `apps/web/lib/e2b` (the sandboxed code-execution path) for any domain-allowlist concept:
none found.

### connectors-28 — Live-functional connector/plugin invocation, not decorative — PARTIAL

Connectors and Skills: genuinely live. The MCP inspect-and-add flow (connectors-10) really
connects and lists real tools; `route.ts:419-466`'s `mcpTools` really execute through
`tool-loop.ts`; `request-processor.ts`'s skill selection really forces a tool call through
`createSkillToolDefinition()`. Not decorative.

Plugins: NOT yet live. Per `0096_plugin_registry.sql`'s own constraints
(`plugin_registry_entries_published_needs_artifact`) and `apps/web/app/plugins/page.tsx`'s doc
comment, every seeded plugin row today is `status = 'preview'`, which by the database's own CHECK
constraint means no `manifest_url` exists yet — a plugin cannot actually be installed or invoked
in this deployment regardless of what its detail page shows. The storefront and the
skills/connectors decomposition (connectors-17) are real and well-built; there is simply nothing
installable behind them yet.

### connectors-29 — Exactly-three-category capability taxonomy — PRESENT (strength, exact match to Claude)

`packages/ui/ui/src/settings-nav.ts:299-301` — Skills / Connectors / Plugins, exactly three,
exactly Claude's own three category names. This is as clean a taxonomy as any of the four
benchmarked products, and unlike ChatGPT's sprawling 4-5-surface spread the claim criticizes, we
converge to one flat, unlabeled, three-item list by explicit founder directive.

---

## Strengths (at or ahead of all four benchmarked products)

1. **Genuine unified Directory browse UI** (`DirectoryBrowse`,
   `packages/ui/ui/src/settings-modal/SettingsModal.tsx:444-826`) matching Claude's own referenced
   design almost line-for-line, reached from three separate entry points and wired for real.
2. **Both slash-command AND @-mention skill invocation in the same composer**
   (`ChatComposerNew.tsx:1264-1324`, `SlashCommandMenu.tsx`) — no single benchmarked competitor
   documents having both simultaneously for skills.
3. **A real, working, self-serve "paste URL, inspect tools, add connector" MCP flow**
   (`ConnectorsPage.tsx:101-354`, backed by `api/mcp` and `api/connectors/custom`) that is live
   today, not beta-gated like Manus's equivalent.
4. **Plugin architecture that genuinely decomposes into skills + connectors**, visible at both the
   list level (inline skill chips, `plugins/page.tsx:163-171`) and detail level
   (`plugins/[id]/page.tsx:199-245`) — more visible at the list level than Claude's count-column
   approach.
5. **Per-tool granular approval model** (Always allow / Ask / Block,
   `tool-permissions-store.ts` + `tool-loop.ts:2751-2813`) with a dedicated public disclosure page
   (`/agent-permissions`) — more granular than either benchmarked competitor's single toggle.
6. **Connectors auto-invoke without per-message selection** (`route.ts:419-466`), a real,
   server-enforced instance of the "automatic tool use" behavior the benchmark documents for three
   competitors.
7. **Explicit, repeated, product-wide honesty discipline**: refusing fabricated download counts
   (`0096_plugin_registry.sql:12-14`), refusing to render a "Connect" button known to fail
   (`SettingsConnector.canConnect`/`statusLabel`, `settings-modal/types.ts`), and refusing fake
   per-conversation connector toggles (`ChatComposerNew.tsx:2740-2745`). This is a genuine product
   value the benchmarked competitors' screenshots don't demonstrate either way.

## Not worth copying

- **Claude's precise-looking download counts (1.2M–2.2M, etc.) with no stated audit
  methodology.** This codebase has already reasoned through why not to do this
  (`0096_plugin_registry.sql`'s own comment) — copying it without real telemetry would be a
  regression against this repo's own honesty rule, not an improvement.
- **Gemini's two parallel, differently-branded custom-assistant systems on one page** ("My Gems"
  vs. "Gems from Labs"). The benchmark's own evidence frames this as visibly confusing. This
  repo's own audit independently flagged and is remediating the identical anti-pattern twice
  already — a dead, superseded parallel MCP management UI sitting beside the live one
  (`DEAD-CODE-003`) and a naming collision between "Connections" and "Connectors"
  (`SHELL-NAV-IA-002`/`EXTENSIBILITY-002`). Do not introduce a third instance of it by cloning
  Gemini's Gems structure.
- **ChatGPT's single blanket "Allow low-risk actions" toggle** as a target to converge on — it is
  strictly less granular than the per-tool verdict system already shipped here. If anything, the
  benchmark should converge toward us on this one.
- **Rushing a public, unmoderated, star-rated GPT-Store-style listing surface** before this
  repo's own signing/review policy exists. `0096_plugin_registry.sql` already encodes exactly why
  not to (`plugin_registry_entries_unsigned_until_policy` — "there is no signing key, no verifier,
  and no review process"), and there's a dedicated supply-chain vetting tool
  (`tools/skill-vetting/`) built specifically to gate this before it opens.

## Evidence I could not fully verify

- connectors-07 and connectors-08 (live status-line specificity, and single- vs. multi-call trace
  structure) — the underlying components look architecturally capable but I did not drive a live
  trace to confirm the exact behavior claimed; not filed as gaps, flagged for a follow-up
  live-verification pass instead of guessing.
