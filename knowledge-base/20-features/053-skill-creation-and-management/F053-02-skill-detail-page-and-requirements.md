---
id: "F053-02"
type: "feature"
title: "Skill detail page and requirements"
aliases: ["Skill detail", "Skill detail view", "Source and access", "Skill files viewer", "Required tools and connections", "Items S53.06, S53.14, S53.15, S53.36"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "partly seen (1 of 4)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S53.06", "S53.14", "S53.15", "S53.36"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:GET /api/skills/{name}", "api:GET /api/skills/{name}/files", "api:GET /api/skills/{name}/files/{path}", "table:user_skills", "F053-01", "F053-04", "F053-05", "SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-02 Skill detail page and requirements

Opens one skill and shows its description, its instruction file and bundled files, where it came from, the tools and connectors it needs, and whether each connector is connected. Web and Desktop have a full view; Mobile has a smaller detail screen. CLI and VS Code show name, description and missing requirements only.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.06](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5306), [S53.14](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5314), [S53.15](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5315), [S53.36](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5336).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | partly seen (1 of 4) |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows what a skill is before and while it is used: instruction text, file tree, source, date added, version, license, needed tools and needed connectors with a Connected or Connect control.

**Why it exists.** A skill is a set of instructions the model follows. People need to read it, see what it can touch, and fix a missing connection before relying on it. The access line states that a skill gets no access of its own (packages/ui/ui/src/directory/constants.ts:137-138).

**Who uses it.** Anyone choosing, checking or editing a skill; admins checking where a skill came from.

**Problems it solves**

- Not knowing what a skill will do
- Not knowing which tools or connectors a skill needs
- Not knowing who supplied a skill

**Use cases**

- A person opens a built-in skill, reads SKILL.md and sees it needs a connector that is not connected, then presses Connect.
- A person checks that a plugin skill shows 'Part of a plugin' as its source.
- A person opens a bundled script in the file tree and copies its contents.
- A mobile user opens Details on a skill and reads its Needs section.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Skills, click a skill card or manage row (packages/ui/ui/src/directory/DirectoryPanel.tsx:517-600).
- Mobile: Details button on a skill row opens route /(app)/skills/[name] (apps/mobile/src/features/skills/SkillsScreen.tsx:374-381, apps/mobile/app/(app)/skills/[name].tsx).
- CLI: no detail view; the 'skill' tool list action returns requirements for the model (apps/cli/src/skills.rs:1373-1411).
- VS Code: pick a skill in the Skills quick pick to see its actions; the row detail shows the description and requirements (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:213-216, 301-307).
- Chrome: none.

**Before you start**

- Signed in on web, desktop and mobile; mobile also needs Cloud mode (apps/mobile/src/features/skills/SkillDetailScreen.tsx:219-232).

**Screens and controls**

- Web header: skill name, publisher, primary button 'Install' or 'Uninstall', or 'Installed' with the 'Enable skill' switch; copy-link; 'Try in chat' button when installed (packages/ui/ui/src/directory/SkillDetailView.tsx:203-250).
- Section 'Source and access' with rows Source, Added, Version, 'Needs tools' (chips), 'Needs connectors' (name plus 'Connected', a 'Connect' button, or 'Not connected') and 'Access' (packages/ui/ui/src/directory/SkillDetailView.tsx:64-130).
- File tree 'Skill files' and a pane showing Description, License, then the file with 'Rendered' and 'Raw' toggles and 'Copy file contents'; a file that cannot be previewed shows 'No preview. This file type cannot be previewed.' and a 'Download file' button (packages/ui/ui/src/directory/SkillFileViewer.tsx:179-242).
- Own skills only: 'Delete skill' with the hint 'Deleting removes this skill for good. It cannot be recovered.' (packages/ui/ui/src/directory/SkillDetailView.tsx:44-45).
- Mobile: description, meta line (Version, Coming later), plugin note, switch 'Turned on', section 'Needs' (Tools list, connector rows with Connected / Not connected and a 'Connect' button), section 'Files' with 'Close file', section 'Make your own' (apps/mobile/src/features/skills/SkillDetailScreen.tsx:247-420).

**Journey**

1. Click or tap a skill in the list.
2. The web adapter looks the skill up in the loaded catalogue, then loads its file list and reads SKILL.md (apps/web/features/directory/services/skills-directory.ts:369-403).
3. Read the access summary and the instruction text.
4. If a connector shows 'Connect', press it; the page jumps to the Connectors section (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1769-1772).
5. Click a file to read it; non-text files offer a download.

**What the person sees and gets**

- Web: spinner while the detail loads, an error line if it fails (packages/ui/ui/src/directory/DirectoryPanel.tsx:517-530).
- Web: per-file spinner and an error message while a file loads (packages/ui/ui/src/directory/SkillDetailView.tsx:180-200).
- Mobile: skeleton rows, 'Could not load this skill' with 'Try again', or 'Skill not found' with 'It may have been removed or renamed.' (apps/mobile/src/features/skills/SkillDetailScreen.tsx:240-247).

**Settings**

- Connected state of connectors comes from the account's connector directory, not from a setting on this view (apps/web/features/directory/services/skills-directory.ts:357-368).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web and Desktop (hosted web app): detail from catalogue entry, body from GET /api/skills/{name}, files from GET /api/skills/{name}/files, per-file read and download (apps/web/features/directory/services/skills-directory.ts:325-403; apps/web/app/api/skills/[name]/route.ts:28-47).
- Provenance text: 'Created by you', 'Included with AGI', 'Managed for this workspace', 'Part of a plugin', or a plugin-specific origin line (apps/web/features/directory/constants.ts:22-25; apps/web/features/directory/services/skills-directory.ts:116-127).
- Required tools and connectors come from the skill frontmatter 'requires' block through the list response (apps/web/app/api/skills/route.ts:189-194).
- Mobile detail screen with body, files, needs, switch and connector rows (apps/mobile/src/features/skills/SkillDetailScreen.tsx:69-104, 247-376).
- CLI model tool lists required tools, env vars and connections and refuses a load when one is missing (apps/cli/src/skills.rs:1373-1440).
- VS Code shows missing tools and env vars in each row (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:213-216).

**Incomplete**

- Mobile detail shows version and a plugin note but no 'Source' or 'Added' rows, so provenance is not shown there (apps/mobile/src/features/skills/SkillDetailScreen.tsx:215-228).
- Mobile connector rows say 'coming soon' for unreleased connectors instead of Connect (apps/mobile/src/features/skills/SkillDetailScreen.tsx:285-300).
- A personal skill never reports requirements or a version because only name, description and body are stored (apps/web/lib/services/user-skill-service.ts:156-166).

**Present but disconnected or switched off**

- Endpoint GET /api/skills/{name}/download (SKILL.md of a built-in skill) has no caller in apps/web, packages/ui or apps/mobile that I found (apps/web/app/api/skills/[name]/download/route.ts:26-37).

**Not available**

- CLI: no detail screen for people (apps/cli/src/tui/tui_app.rs:6198-6212).
- VS Code: no detail page with instructions or files; a row opens the SKILL.md file in the editor instead (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:257-270).
- Chrome: no detail view.

## 4. Required behaviour

**Established requirements**

- A user can open a skill detail view showing its description, instructions and files (S53.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.06)
- A skill declares the tools it needs and the product shows or enforces it (S53.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.14)
- A skill declares the connectors or MCP servers it needs and the product shows or enforces it (S53.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.15)
- A skill shows a summary of the permissions it uses and where it came from (S53.36). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.36)
- Skills requirements include scope and permissions. (source: doc: docs/product/requirements.md (section 19))
- Missing credentials and unavailable runtimes are explained without claiming execution. (source: doc: docs/product/experience-contract.md:788)

**Acceptance criteria**

1. Opening a built-in skill on web shows its description, SKILL.md text, file tree and the Source row 'Included with AGI'.
2. A skill that needs a connector shows its name with 'Connected' or a 'Connect' button.
3. A file that cannot be previewed shows 'No preview' and a 'Download file' button.
4. A personal skill shows 'Created by you', no 'Enable skill' switch, and a 'Delete skill' control.
5. Opening an unknown skill name on mobile shows 'Skill not found'.
6. A skill listing 'create_office_file' or code run in its requirements shows those under 'Needs tools'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The access line applies to every skill: skills use only tools and connectors already on in the chat (packages/ui/ui/src/directory/constants.ts:137-138).
- [inferred] Skill file reads need the skill to be visible to the account (selectable) rather than only to exist (apps/web/app/api/skills/[name]/files/route.ts:35-47).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show Source and Added on the mobile detail screen.
- [proposed] Let a personal skill declare tools and connectors so its Needs section is filled.
- [proposed] Give CLI and VS Code a read-only detail page.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | SkillDetailView | `packages/ui/ui/src/directory/SkillDetailView.tsx` | Shared detail layout, access summary, switch, try-in-chat, delete (lines 64-318). |
| component | SkillFileViewer | `packages/ui/ui/src/directory/SkillFileViewer.tsx` | File tree and body; no-preview fallback with download (lines 179-242). |
| component | DirectoryPanel | `packages/ui/ui/src/directory/DirectoryPanel.tsx` | Hosts the detail view and wires actions (lines 517-600). |
| service | fetchSkillDetail | `apps/web/features/directory/services/skills-directory.ts` | Builds the detail: files, body, provenance, requirements (lines 369-403). |
| hook | useDirectoryAdapter openConnector | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Sends Connect to the Connectors section (lines 1769-1772). |
| endpoint | GET /api/skills/{name} | `apps/web/app/api/skills/[name]/route.ts` | Returns the skill body (lines 28-47). |
| endpoint | GET /api/skills/{name}/files | `apps/web/app/api/skills/[name]/files/route.ts` | Lists files with content hashes (lines 23-70). |
| endpoint | GET /api/skills/{name}/files/{path} | `apps/web/app/api/skills/[name]/files/[...path]/route.ts` | Reads or downloads one file; 415 for non-text, 413 for too large (lines 49-120). |
| endpoint | GET /api/skills/{name}/download | `apps/web/app/api/skills/[name]/download/route.ts` | Serves SKILL.md of a built-in skill (lines 26-37). |
| service | findSelectableSkillByName | `apps/web/lib/services/skill-catalog-service.ts` | Resolves a skill by name across built-in, plugin-directory and personal skills (line 637). |
| schema | ManagedSkillSummarySchema | `packages/contracts/cloud-contracts/src/skills.ts` | Defines origin, version, requiredTools, requiredConnectors fields (lines 55-80). |
| service | skill-origin-service | `apps/web/lib/services/skill-origin-service.ts` | Works out where each skill came from. |
| screen | SkillDetailScreen | `apps/mobile/src/features/skills/SkillDetailScreen.tsx` | Mobile detail (lines 69-420). |
| service | mobile skill body and files | `apps/mobile/src/features/skills/service.ts` | fetchSkillBody, fetchSkillFiles, fetchSkillFileText (lines 145-185). |
| service | CLI invoke_skill_tool | `apps/cli/src/skills.rs` | List and load with missing-requirement refusal (lines 1279-1440). |
| command | VS Code skill requirements row | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Shows requirements and opens SKILL.md (lines 213-307). |
| config | detail labels | `packages/ui/ui/src/directory/constants.ts` | Visible labels: Source, Added, Version, Needs tools, Needs connectors, Access (lines 128-142). |
| test | SkillDetailView.test.tsx | `packages/ui/ui/src/directory/__tests__/SkillDetailView.test.tsx` | Detail controls. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Click on a skill sets the selected id; the adapter finds the summary in the cached catalogue (loading it first if empty). | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1021-1027, 1207-1215 |
| Client requests the file list and, for SKILL.md, the body. | device and our servers | apps/web/features/directory/services/skills-directory.ts:325-355, 369-380 |
| Server rate-limits, resolves the skill among built-in, plugin-directory and personal skills, and returns the body or file list with hashes. | our servers | apps/web/app/api/skills/[name]/route.ts:28-47; apps/web/app/api/skills/[name]/files/route.ts:23-70 |
| Client builds the access summary from the summary fields; connected state comes from the connector directory already loaded in the adapter. | device | apps/web/features/directory/services/skills-directory.ts:357-403 |
| Opening a file calls GET /api/skills/{name}/files/{path}; text comes back as JSON; a non-text file answers 415 and the viewer shows the download button. | our servers | apps/web/app/api/skills/[name]/files/[...path]/route.ts:96-120; packages/ui/ui/src/directory/SkillFileViewer.tsx:179-192 |
| Mobile loads catalogue, installs and connector directory, then body and files for the named skill. | device and our servers | apps/mobile/src/features/skills/SkillDetailScreen.tsx:69-104 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Skill body and bundled files | Built-in: bundled files on the server; personal: public.user_skills and public.user_skill_files (apps/web/lib/services/user-skill-service.ts:223-244, 368-392) | Read on demand; not stored on the client beyond memory | Personal rows deleted with the skill |
| File content hash used as ETag | Computed on read (apps/web/app/api/skills/[name]/files/route.ts:49-62) | Returned with the list | Not stored |

**Models and providers.** No model is involved in showing a detail view.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in. Detail reads use the account's own database scope (apps/web/app/api/skills/[name]/route.ts:32-34). |
| Permissions | Plugin skills appear only when the workspace allows plugins and the plugin is enabled (apps/web/app/api/skills/[name]/route.ts:36-44). Deleting is offered only for editable (personal) skills. |
| Subscription | No plan check found in these routes; the Skills capability follows the same rule as F053-01. |
| Limits and metering | skills-catalog-read bucket, 300 per minute (apps/web/lib/rate-limit.ts:311-317). File reads over 512 KB answer 'too large' (apps/web/features/plugins/server/directory/constants.ts:138). |
| Feature flags | AGI_USER_SKILL_AUTHORING affects whether personal skills show; FEATURES.skills on mobile. |
| Model compatibility | Not applicable; none found in the code. |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode shows a gate instead of the detail (apps/mobile/src/features/skills/SkillDetailScreen.tsx:219-232). CLI local skill files expose requirements through the skill tool without any account. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Web spinner; mobile skeleton rows. | packages/ui/ui/src/directory/DirectoryPanel.tsx:517-523; apps/mobile/src/features/skills/SkillDetailScreen.tsx:243 |
| Skill not found | Server 404 'Skill "x" not found'; mobile shows 'Skill not found'. | apps/web/app/api/skills/[name]/route.ts:44-46; apps/mobile/src/features/skills/SkillDetailScreen.tsx:247 |
| File cannot be previewed | 415 from the server; viewer shows the no-preview text and a download button. | apps/web/app/api/skills/[name]/files/[...path]/route.ts:96-103; packages/ui/ui/src/directory/SkillFileViewer.tsx:179-192 |
| File too large | 413 'This file is too large to preview.' | apps/web/app/api/skills/[name]/files/[...path]/route.ts:104-112 |
| Connector not connected | Connect button if a handler exists, otherwise 'Not connected'. | packages/ui/ui/src/directory/SkillDetailView.tsx:104-122 |
| Load failure (mobile) | 'Could not load this skill' with Try again; body failures fall back to null and disable edit. | apps/mobile/src/features/skills/SkillDetailScreen.tsx:75-80, 137, 240 |
| Accessibility | Switch has a label and hint; summary uses a definition list; file buttons have aria labels. | packages/ui/ui/src/directory/SkillDetailView.tsx:226-237; packages/ui/ui/src/directory/SkillFileViewer.tsx:200-232 |
| Cancel, timeout, offline | not handled in the code beyond error messages and Try again. | packages/ui/ui/src/directory/SkillDetailView.tsx:180-200 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/ui/src/directory/__tests__/SkillDetailView.test.tsx`: Enable switch, Uninstall button, Try in chat, Delete skill on authored skills.
- `packages/ui/ui/src/directory/__tests__/SkillFileViewer.test.tsx`: File viewer behaviour.
- `apps/web/app/api/skills/[name]/files/__tests__/skill-files.test.ts`: File tree, hashes, preview, binary refusal, download, traversal blocking.
- `apps/web/app/api/skills/[name]/files/[...path]/__tests__/route.test.ts`: Single file route.
- `apps/web/app/api/skills/[name]/download/__tests__/route.test.ts`: SKILL.md download route.
- `apps/web/features/directory/__tests__/skills-directory.test.ts`: Provenance and detail mapping.
- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Mobile bundle, needs, version line, template, delete confirm.
- `apps/web/lib/services/__tests__/skill-origin-service.test.ts`: Origin resolution.

**Test scenarios**

- **Needs connector**
  1. Open a skill whose frontmatter requires a connector that is not connected.
  2. Look at 'Needs connectors'.
  3. Press Connect.
  - Expected: The row shows Connect; pressing it opens the Connectors section.
- **Binary file**
  1. Open a skill that bundles a non-text file.
  2. Click that file.
  - Expected: 'No preview' and a 'Download file' button; the download starts an attachment.
- **Personal skill detail**
  1. Create a personal skill.
  2. Open it.
  - Expected: Source reads 'Created by you', no switch, Delete skill is shown.
- **Mobile detail**
  1. Cloud mode, open Details on a skill that needs tools.
  - Expected: Needs section lists Tools; files list opens inline.
- **Unknown skill link**
  1. Open /(app)/skills/does-not-exist on mobile.
  - Expected: 'Skill not found'.

**Where to look when it fails**

- HTTP 404 'Skill "x" not found', 415 and 413 from the file routes.
- Mobile messages 'Could not open <path>.' and 'Skills returned an invalid response.' (apps/mobile/src/features/skills/service.ts:174-185).
- Server log when optional skill sources fail: 'Optional skill source unavailable; continuing without it' (apps/web/lib/services/skill-catalog-service.ts:583-595).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **Mobile detail has no Source or Added rows.** Affects: Mobile users. Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:215-228. Work needed: Add provenance rows from the summary origin.
- **Personal skills cannot state needs or version, so their Needs section is always empty.** Affects: All apps for personal skills. Evidence: apps/web/lib/services/user-skill-service.ts:156-166. Work needed: Store frontmatter requires and version for personal skills.
- **The brief calls mobile detail missing for items 06 and 15, but the screen exists with Needs and Connect.** Affects: Documentation. Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:272-318. Work needed: Correct the brief.
- **CLI, VS Code and Chrome have no detail view with instructions, files and provenance.** Affects: CLI, VS Code, Chrome users. Evidence: apps/cli/src/tui/tui_app.rs:6198-6212. Work needed: Decide the per-surface detail design.
- **The built-in download endpoint has no UI caller.** Affects: Web. Evidence: apps/web/app/api/skills/[name]/download/route.ts:26-37. Work needed: Wire it to a visible control or remove it.
- **The detail 'Enable skill' switch shows for installed plugin skills, but the server refuses the change with 'controlled by its plugin installation'.** Affects: Web and Desktop users. Evidence: packages/ui/ui/src/directory/SkillDetailView.tsx:204; apps/web/app/api/skills/installs/route.ts:77-79 [inferred]. Work needed: Hide the switch for plugin-owned skills.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:GET /api/skills/{name}
- api:GET /api/skills/{name}/files
- api:GET /api/skills/{name}/files/{path}
- table:user_skills
- F053-01
- F053-04
- F053-05
- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage

## Unknown

- Whether the mobile Connect button opens a connector flow (press handler not read).
- Whether DirectoryPanel asks for confirmation before Install (requestInstall not read).
- Whether plugin-skill detail shows a file tree (a test says none is served for installed plugin skills, not opened).
