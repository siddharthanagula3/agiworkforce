# Domain audit: Skills + Plugins + Connectors (extensibility)

Audited against: Claude web/desktop/iOS (Skills / Connectors / Plugins as three
separate directories), ChatGPT web/iOS + Codex macOS/VS Code (Plugins/Apps/MCPs/Skills
as one counted tab strip). Repo commit `e15df56e3`, working tree clean.

## 0. Summary

The three products this domain covers are architecturally real, not faked. Skills has
a genuine progressive-disclosure content pipeline (SHA-256 lockfile, tree hashing,
first-party provenance, a working `skill_create_from_recording` screen-recording flow
on desktop that closely mirrors Claude's "Record a Skill"). Plugins has an honestly
gated registry with DB-level CHECK constraints that make it _structurally impossible_
for a `preview` row to claim a downloadable artifact. Connectors has a real per-user
OAuth broker, a saved allow/ask/deny permission model enforced server-side before the
tool catalog is even built, and MCP tool calls render inline in the transcript with
resolved server names — nothing is hidden behind a generic spinner.

The gaps are not "this doesn't exist." They cluster in three shapes:

1. **Built but disconnected.** A complete, tested screen or function with no caller
   (mobile Skills screen with no nav entry; desktop's `skill_match_for_message`
   auto-invocation heuristic with zero UI callers; a Cloud-skill "download" link with
   no import path back into the directory chat actually reads from).
2. **Two things sharing a name or a settings tab that don't share a model.** Desktop's
   "Connections" (mobile pairing) and "Connectors" (MCP + cloud storage + health
   dashboard, five subsystems deep) are near-homographs with unrelated contents.
3. **A security control that fails open silently.** The MCP slopsquatting allow-list
   is real code, guarded by a real comment, and is never bundled into a release
   build — so the control it names does nothing in production.

None of these needs new product surface to fix. Every one of them is a wiring
problem in code that already exists, which is the cheapest class of gap to close.

## 1. Skills

|                             | AGI Workforce                                                                                                                                                                                                                                                                                                                              | Benchmark                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Personal/first-party skills | `.agents/skills` + `skills-lock.json` (SHA-256 tree hash, CI-enforced provenance) — `skills-lock.json:1-60`                                                                                                                                                                                                                                | Anthropic + custom skills, `agentskills.io` open spec                                                                      |
| Directory/browse            | Desktop `SkillMarketplace` (grid/list, category filter, search) reads **local disk only** — `apps/desktop/src/features/skill-marketplace/SkillMarketplace.tsx:1-11`; Web `/skills` lists the **managed Cloud catalog**, gated by enabled plugin ids — `apps/web/app/api/skills/route.ts`, `apps/web/lib/services/skill-catalog-service.ts` | Claude: unified "Browse skills, connectors, and plugins" directory, `+`/⚙ install-in-place — `shots-claude-web.md:539-584` |
| Creation                    | Desktop "Record a Skill" (screen capture → `skill_create_from_recording`) is real and functionally close to Claude's flow — `apps/desktop/src-tauri/src/sys/commands/skills.rs:522-552`, `apps/desktop/src-tauri/src/lib.rs:1974`                                                                                                          | Claude Desktop "Record a skill" — `shots-claude-desktop.md:95-185`                                                         |
| Invocation — explicit       | Slash-command style on desktop (`skill_parse_slash_command`, `skill_get_slash_commands`) and explicit `skill_name` selection on web (`request-processor.ts:2272`)                                                                                                                                                                          | Claude: `/skill-name`, matches the directory's literal slug — `shots-claude-web.md:577-580`                                |
| Invocation — **automatic**  | **Not reachable anywhere.** See EXTENSIBILITY-004.                                                                                                                                                                                                                                                                                         | Claude: "Claude decides relevance and loads the skill (progressive disclosure)" — `claude-web-desktop.md:33`               |
| Versioning                  | `declaredVersion` field in the lockfile; no update/propagation UI found                                                                                                                                                                                                                                                                    | Claude: shared/org skills auto-propagate; a directory install is view-only, edit requires download-reupload                |
| Org/team provisioning       | Not enforced end-to-end — tracked as `CAP-010` (Deferred) in `audit/capability-gaps.csv:11`                                                                                                                                                                                                                                                | Claude: org owners upload a skill zip, instantly provisioned org-wide, three sharing toggles                               |
| Mobile                      | Screen is complete (655 lines) but **has no navigation entry** — EXTENSIBILITY-001                                                                                                                                                                                                                                                         | ChatGPT iOS: Skills tab, empty-state teaching copy — `shots-chatgpt-ios-shell-settings.md:47,115-117`                      |

**Strength worth keeping, not copying over:** the lockfile's own notes
(`skills-lock.json:5-9`) record that it caught and discarded four previously-unverifiable
skill hashes rather than silently carrying them forward — a level of supply-chain
rigor around skill provenance that none of the benchmark's public documentation
claims for itself.

## 2. Plugins

|                                         | AGI Workforce                                                                                                                                                                                                                                                                                             | Benchmark                                                                                                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry                                | `plugin_registry_entries` table with a **CHECK constraint** making it schema-illegal for a `preview` row to carry a `manifest_url`/`sha256` — `apps/web/db/neon/0096_plugin_registry.sql:26-30,86-89`                                                                                                     | Claude Plugin directory: role-bundle cards, Anthropic/Partners chips                                                                                                         |
| Included skills / connectors per plugin | Modeled: `declared_skills`, `required_connectors` columns — `apps/web/lib/services/plugin-registry-service.ts:65-66,224-225`                                                                                                                                                                              | Claude: partner skills "built to pair with MCP connectors"                                                                                                                   |
| Install (Web)                           | Explicitly disabled — `PLUGIN_INSTALLS_ENABLED = false`, page labeled "Catalogue preview"                                                                                                                                                                                                                 | Already tracked: **GAP-113, GAP-117** (both `Not Planned`, considered decision pending an account-owned marketplace)                                                         |
| Install (CLI)                           | Real: `agi plugin install <source>` (git/local path) plus a separate hosted-registry resolver with SHA-256 verification, an explicit unverified-artifact opt-in, and a refusal path for unpublished entries — `apps/cli/src/lib.rs:1542-1552`, `apps/cli/src/features/plugins/registry.rs:73-117,463-528` | This is **more rigorous than what either benchmark documents publicly** for its own install pipeline — worth highlighting as a strength once real artifacts exist to install |
| Mobile                                  | No installable marketplace; deliberately no dead-end row — comment at `apps/mobile/src/features/settings/index.tsx:636-638`                                                                                                                                                                               | Already tracked: **GAP-024** (`Not Planned`)                                                                                                                                 |
| Org governance                          | Duplicate, unreconciled policy labels — tracked as `CAP-009` (Open) in `audit/capability-gaps.csv:10`                                                                                                                                                                                                     | Claude: `allowedPluginMarketplaces`, three independent sharing toggles                                                                                                       |

Every plugin-install gap in this section is **already tracked** (GAP-113, GAP-117,
GAP-024, GAP-274, CAP-008, CAP-009, CAP-046) with a consistent, defensible reasoning:
don't fake an installed state until there's a real artifact and an account-owned
entitlement lifecycle. That reasoning is sound — the DB CHECK constraint enforces it
at the schema level, which is a stronger guarantee than most products offer. **Do not
re-open these as new rows.** The one thing this audit adds beyond that ledger is
confirming the CLI's install mechanism is real, not just the registry read path.

## 3. Connectors / MCP

|                                 | AGI Workforce                                                                                                                                                                                                                                                                                                           | Benchmark                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| OAuth broker                    | Real: authorization-code flow, PKCE, protected-param allowlist, redirect URI derived server-side (never from `Host`) — `apps/web/lib/connectors/oauth-registry.ts:43-46,84-97`                                                                                                                                          | Claude: standard OAuth, review scopes at consent                                                                                 |
| Catalog breadth                 | **89 catalog connector ids** (`connectors.ts`, confirmed via `grep -c "id: '"`)                                                                                                                                                                                                                                         | Claude: 200+ (soft-verified); ChatGPT: 15+ official + "dozens more" via Work plugins                                             |
| Actually connectable by default | **2 of 89**: GitHub (App-install flow) and user-defined custom remote MCP. Every other id is a `501` unless an operator sets `CONNECTOR_OAUTH_<ID>_CLIENT_ID`/`CONNECTOR_OAUTH_PROVIDERS_JSON` — see EXTENSIBILITY-006                                                                                                  | Claude/ChatGPT connector directories work for major providers (Slack, Notion, Drive, Gmail) out of the box                       |
| Permission model                | Real allow/ask/deny, saved per connector-tool, loaded **before** the tool catalog is built so a `deny`d tool is never offered to the model, re-enforced on resume so a stale client decision can't execute a blocked tool — `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:2-19,29,71-143` | Claude: official guidance to disable write tools during Research; ChatGPT: tiered "Allow low-risk actions" preset                |
| Tool visibility in transcript   | Real: MCP server id parsed from the qualified tool name and rendered as an icon + label, not a generic spinner — `packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:142-153`, `InlineToolCall.tsx:184-205`                                                                                              | Explicit requirement of this domain (§15) — **met**                                                                              |
| Local MCP (desktop)             | Large, mostly-wired surface: client/manager/oauth/server/executor — `apps/desktop/src-tauri/src/core/mcp/`                                                                                                                                                                                                              | Claude Desktop Extensions (`.mcpb`), local `claude_desktop_config.json` equivalent                                               |
| Slopsquatting defense           | Present in code, **fails open in every packaged build** — EXTENSIBILITY-003                                                                                                                                                                                                                                             | n/a (this is a security control, not a benchmarked UX)                                                                           |
| Mobile                          | Directory real; GitHub + custom MCP work; other 19/21 catalog providers `501` — already tracked as `known-flaws.md` `MOBILE-CONNECTORS-501` (low severity, open) and `mobile.md:276,284-291`. **Re-verified, still true**: `cloud-connectors/index.tsx:510,612`                                                         | ChatGPT iOS: Plugins marketplace, Featured/Productivity sections, working installs                                               |
| Desktop IA                      | "Connections" (mobile pairing) and "Connectors" (5 stacked subsystems: gallery, health dashboard, AGI's own exposed MCP server config, client MCP workspace, cloud storage browser) are near-homograph tabs — EXTENSIBILITY-002                                                                                         | Claude Desktop: Skills / Connectors / Plugins as three clean, separately-scoped tabs — `shots-claude-desktop.md:306-308,545-547` |

## 4. Chrome extension — zero extensibility surface

`apps/extension/src/options.ts` has **no** connector, plugin, or skill string anywhere
in the file (`grep -n -i "connector\|plugin\|skill"` returns nothing). The side panel's
attach menu carries only 2 items where the shared desktop `AttachmentMenu` carries 7,
including **Select folder, Record skill, Research, explicit Web search, Run code,
Writing style** — `extension-chrome.md:408,414`. There is no `SkillMentionPicker` —
zero matches for `SkillMention`/`@skill` anywhere in the extension (`extension-chrome.md:402`).

This matters more than it would have eight weeks ago: Claude's own Cowork landed in
the Chrome side panel in **August 2026** with "skills/plugins/connectors now work
in-browser for the first time" (`claude-web-desktop.md:205`) — this is a live,
contemporaneous benchmark move, not a stale target. See EXTENSIBILITY-007.

`GAP-122` already declines adding a plugin registry to the Chrome extension's attach
menu (`Not Planned` — no extension-owned capability registry exists yet, a reasonable
call given Plugins genuinely has zero installable artifacts anywhere in the product).
That reasoning does **not** extend to Skills, which are a real, working feature on
web/desktop/CLI today. Skipping them in Chrome isn't gated on an unbuilt registry —
it's a straightforward composer-parity gap.

## 5. What NOT to copy

- **Claude's "Skills installed from the directory are view-only"** (must
  download-and-reupload to customize) is a real, documented user complaint in the
  benchmark research (`claude-web-desktop.md:113`). AGI Workforce's local
  filesystem-backed skill model (`~/.agiworkforce/skills/`, directly editable files)
  is architecturally better here — don't imitate Claude's read-only directory install
  as the _only_ path; if a network skill directory ships, keep local files editable
  in place alongside it.
- **ChatGPT/OpenAI's naming churn** ("Connectors" → "Apps" → also "Plugins" as an
  umbrella, `chatgpt-web-desktop.md:161`) is explicitly flagged in the benchmark
  research as a source of user and even internal-documentation confusion. AGI
  Workforce's stable "Connectors" / "Skills" / "Plugins" naming should not be
  destabilized to chase ChatGPT's terminology.
- **Do not build a fourth flavor of "install."** Web already declines to fake plugin
  installation until there's a real artifact + entitlement lifecycle (enforced by a
  DB CHECK constraint, not just a comment). That discipline is worth defending against
  pressure to ship a cosmetic "Install" button — see §2.

## 6. Gaps filed

8 gaps below (`domain-extensibility.json`). Severity distribution: 4×P1, 4×P2, 0×P0.
No P0 was warranted — every finding here is a secondary-surface or backend-wiring
defect, not a break in the core chat workflow.

| id                | severity | surface          | one-line                                                                                                           |
| ----------------- | -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| EXTENSIBILITY-001 | P1       | mobile           | Skills screen complete, zero navigation entry (regression, cites GAP-001)                                          |
| EXTENSIBILITY-002 | P1       | desktop-tauri    | "Connections"/"Connectors" near-homograph tabs; MCPWorkspace on wrong tab; 5 subsystems in one tab (cites GAP-083) |
| EXTENSIBILITY-003 | P1       | desktop-tauri    | MCP slopsquatting allow-list never bundled — fails open in every release build                                     |
| EXTENSIBILITY-004 | P1       | cross-surface    | No automatic/progressive-disclosure skill invocation anywhere; the one Rust function built for it has zero callers |
| EXTENSIBILITY-005 | P2       | desktop-tauri    | Cloud skill "download" is a dead-end raw file link with no import path into the skill directory chat reads from    |
| EXTENSIBILITY-006 | P2       | web              | 87 of 89 catalog connectors are `501` by default; architecture is real but zero-configured out of the box          |
| EXTENSIBILITY-007 | P2       | extension-chrome | Zero skills/plugins/connectors surface in Chrome — no options.ts section, no Skill @mention picker                 |
| EXTENSIBILITY-008 | P2       | backend          | Org/team skill + plugin governance duplicated and unenforced (cites CAP-009/CAP-010)                               |

## 7. Evidence log (representative, not exhaustive)

- `apps/mobile/src/features/drawer/components/DrawerContent.tsx:62-100` — `PRIMARY_ITEMS` array, no `skills` entry.
- `apps/mobile/app/(app)/_layout.tsx:73` — `<Drawer.Screen name="skills/index" options={HIDDEN} />`.
- `apps/mobile/src/features/settings/index.tsx:636-638` — stale comment claiming a drawer entry that no longer exists.
- `apps/desktop/src/features/settings/tabs/Connections/index.tsx:1-38` — renders only `MobileCompanionPanel`.
- `apps/desktop/src/features/settings/tabs/Connectors/index.tsx:1-79` — renders `ConnectorGallery` + `ConnectorHealthDashboard` + `MCPServerSettings` + `MCPWorkspace` + `CloudStoragePanel` stacked in one scroll.
- `apps/desktop/src-tauri/src/core/mcp/config.rs:1645-1668` — allow-list loaded via a CWD-relative path with an open-mode fallback.
- `apps/desktop/src-tauri/tauri.conf.json:50-86` — `bundle` block has no `resources` key referencing `mcp-allowlist.json`.
- `apps/desktop/src/stores/skillMarketplaceStore.ts:247,348-354` — `matchForMessage` defined, zero callers (`grep -rn "matchForMessage\b" apps/desktop/src`).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:461-473,2272` — skill selection is explicit `skill_name` only.
- `apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:927-933` — `downloadHref` built for every downloadable cloud skill.
- `packages/ui/ui/src/settings-modal/SettingsModal.tsx:422-438` — renders `downloadHref` as a plain `<a href download>`.
- `apps/web/app/api/connectors/route.ts:114-120,416-429` — 89-id catalog, 55+ never had a maintained allowlist, generic 501 for any non-operator-mapped id.
- `apps/web/lib/connectors/oauth-registry.ts:144-166` — per-provider credentials resolved from `CONNECTOR_OAUTH_<ID>_CLIENT_ID`/`_SECRET` env vars, empty registry when unset.
- `apps/extension/src/options.ts` — zero matches for `connector|plugin|skill`.
- `audit/parity-2026-08-15/gaps/done-claim-verification.md:83-102,65-77` — independent confirmation of the mobile-Skills regression and the desktop GAP-083 misattribution.
