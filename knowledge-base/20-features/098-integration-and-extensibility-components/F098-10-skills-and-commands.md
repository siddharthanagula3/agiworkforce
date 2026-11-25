---
id: "F098-10"
type: "feature"
title: "Skills and commands"
aliases: ["Skill registry", "Skill resource loader", "Command registry", "Slash commands", "Skills list", "S98.21", "S98.22", "S98.24"]
area: "98 Integration and extensibility components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S98.21", "S98.22", "S98.24"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "F098-08", "F098-09"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F098-10 Skills and commands

Two lists. The server lists the skills a person can use, including ones from installed plugins, and serves a skill's bundled files for preview or download. The CLI builds one slash command list from built-in commands, skills, plugin commands and custom command files. Mobile, desktop, Chrome and the CLI read the server skills list.

Area: [98. Integration and extensibility components](README.md). Requirement items: [S98.21](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9821), [S98.22](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9822), [S98.24](../../10-requirements/capabilities/098-integration-and-extensibility-components.md#s9824).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** GET /api/skills returns built-in, plugin, workspace, personal and installed-directory skills with source, version, required tools and connectors. GET /api/skills/[name]/files/[...path] returns one bundled file as text or as a download. In the CLI, the command registry merges built-in commands, skills, plugin command files and custom command files so the palette, help and slash handling agree.

**Why it exists.** A skill is a saved procedure the model can follow; people need to see which are available and load its scripts and references when used. The CLI needs one command list so a name means one thing.

**Who uses it.** Anyone using skills on web, mobile, desktop or Chrome; CLI users typing slash commands; plugin authors adding commands.

**Problems it solves**

- Knowing which skills are on and where each came from.
- Previewing or downloading a skill's files safely.
- Name clashes between commands and skills.
- Plugin and project commands showing up beside built-in ones.

**Use cases**

- Open the skills list and pick a skill; its source shows as built-in, plugin or personal.
- Preview references/guide.md inside a skill.
- In the CLI type / and find a plugin's command next to /help.
- Add a markdown file to .agiworkforce/commands and run it as a slash command.

## 2. User experience

**Where to find it**

- Web: skills list reads GET /api/skills; the public page /skills is linked from the site map (apps/web/app/sitemap-page/page.tsx:36); in-app skill screens not opened: unknown.
- Desktop: skills list in the cloud settings modal with a download link to /api/skills/<name>/download (apps/desktop/src/features/settings/DesktopCloudSettingsModal.tsx:1014; apps/desktop/src/api/cloudSkills.ts:12).
- Mobile: reads /api/skills and /api/skills?catalog=all and skill installs (apps/mobile/src/features/skills/service.ts:16-18).
- Chrome: reads /api/skills (apps/extension/src/features/cloud-bridge/skillsClient.ts:4).
- CLI: slash palette opened by typing '/' (apps/cli/src/tui/tui_app.rs:718-740) and the /help text 'Commands:' (command_registry.rs:230-262).
- VS Code: skills absent per the matrix (doc: docs/product/surface-feature-matrix.md:74-78). The CLI app server also lists commands for other clients (apps/cli/src/app_server/surfaces.rs:648-660); which client uses it was not traced: unknown.

**Before you start**

- Server routes: signed-in account.
- Skills list shows plugin skills only if the workspace allows plugins and the plugin is enabled (apps/web/app/api/skills/route.ts:146-152).
- CLI skills are hidden when the account's capability document denies canUseSkills (apps/cli/src/skills.rs:144-149).

**Screens and controls**

- Skill list entries carry name, title, description, source, lifecycle ('included' or 'draft'), downloadable flag, install total, version, required tools and required connectors (apps/web/app/api/skills/route.ts:171-198).
- 'catalog=all' returns the whole directory instead of only installed skills (route.ts:66-67,145-153).
- File preview returns { file: { path, size, content } }; '?download=1' returns an attachment (files route:76-125).
- CLI help lists each command with its slash name, argument hint and aliases (command_registry.rs:230-262).

**Journey**

1. The app calls GET /api/skills. The server checks whether plugins are allowed, loads enabled plugin ids, builds the directory, applies the person's install choices, adds installed directory skills and personal skills, de-duplicates by name and returns the list.
2. The person opens a skill; the app may call GET /api/skills/[name]/files/[path] to preview a bundled file.
3. In the CLI, at startup the TUI builds the registry from discover_skills, then adds custom commands not already named (tui_app.rs:717-745).
4. Typing /name expands, in order, a skill, then a plugin command, then a custom command (command_registry.rs:162-182).

**What the person sees and gets**

- File route errors: 415 'This file is not text and cannot be previewed.', 413 'This file is too large to preview.' or '...download.', 404 'File not found' or 'Skill "x" not found' (files route:76-112).
- List failure: 500 'Failed to load skills' when the managed catalog cannot load (route.ts:154-158).
- CLI warning when a skill shares a name with a built-in command: the built-in keeps running (command_registry.rs:50-52).
- A skill that matched but cannot load returns its error and does not fall through to a custom command (command_registry.rs tests, around 'a_skill_that_cannot_load_does_not_fall_through').

**Settings**

- Per-user skill install choices stored under settings 'skills' in user_settings (skill-install-service.ts:10,89-120).
- SKILLS_LAYERS environment variable adds skill folders on the server (skill-catalog-service.ts:19-41,235).
- AGI_USER_SKILL_AUTHORING turns personal skill creation on or off (default on).
- CLI: ~/.agiworkforce/skills, project .agiworkforce/skills (needs project consent), account-skills synced from the server (apps/cli/src/skills.rs:162-187).
- CLI custom commands: .agiworkforce/commands, ~/.agiworkforce/commands, imported Claude command folders (apps/cli/src/custom_commands.rs:1-8).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server skill list, with a 60 second cache of the managed directory (skill-catalog-service.ts:52,239-262; app/api/skills/route.ts:141-204).
- Plugin-owned skills appear only while their plugin is enabled and the skill is switched on (skill-catalog-service.ts:279-295).
- File read with realpath containment, size ceiling and binary refusal (skill-catalog-service.ts:411-454; files route:95-112).
- Personal skill creation by JSON or upload with scanning, feature gate 'skills', and audit (route.ts:206-259).
- CLI registry: built-ins first, then skills, then custom prompt entries (code path), then plugin commands; later names never override earlier ones (command_registry.rs:45-92).
- CLI plugin commands from each installed plugin's declared command paths, kept inside the plugin root (command_registry.rs:104-141).
- CLI custom commands are added in the TUI and in the app server list (tui_app.rs:719-745; surfaces.rs:648-660).

**Incomplete**

- The custom-prompt merge path (registry_from_builtins_skills_and_prompts with prompts) is fed an empty list by both production callers (apps/cli/src/tui/tui_app.rs:718; apps/cli/src/app_server/surfaces.rs:651); only tests pass prompts. Custom commands reach the palette through a separate loop instead.
- The brief cites command_registry.rs:45-60 and 94-104; at HEAD the merge is at 45-92 and plugin discovery at 94-141. The brief predates HEAD.
- The mobile skills code treats 'extra' as the plugin source (apps/mobile/src/features/skills/service.ts:25); how mobile shows it was not opened: unknown.

**Present but disconnected or switched off**

- CLI skills are switched off when the capability document denies canUseSkills (skills.rs:144-149).

**Not available**

- VS Code extension: no skills list (doc: docs/product/surface-feature-matrix.md:77).
- Command registry on web, mobile, desktop, Chrome: none; the registry is CLI only.

## 4. Required behaviour

**Established requirements**

- A skill registry lists the skills available to a user, including plugin-provided ones (S98.21). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.21)
- A skill's bundled files (scripts, references, assets) can be loaded when the skill is used (S98.22). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.22)
- A command registry merges built-in, skill, plugin and custom commands for the command surface (S98.24). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S98.24)
- Skills requirements: user, project and marketplace or plugin skills; versioning; invocation from slash menu or plus menu; scope and permissions. (source: doc: docs/product/requirements.md (section 19, lines 1548-1558))

**Acceptance criteria**

1. GET /api/skills with no sign-in returns 401.
2. A skill from a plugin that is turned off does not appear; turning the plugin on makes it appear.
3. Requesting a file path that climbs outside the skill folder returns 404.
4. A binary file preview returns 415; a file over the size ceiling returns 413.
5. In the CLI a plugin command named like a built-in does not replace it, and a log line says so for skills.
6. A project skill without recorded consent does not appear in the CLI list.
7. Two entries with the same name appear once, with the first source winning.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The skill list should include the same plugin skills on every app that shows skills [inferred].
- Custom prompts from the protocol crate should appear in the palette or the unused merge path should be removed (AGENTS.md section 9 on unused abstractions) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Remove or feed the custom-prompt merge so one function builds the whole CLI list.
- [proposed] Add skills to the VS Code extension through the same endpoint, since the server route is app-neutral.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST /api/skills | `apps/web/app/api/skills/route.ts` | List skills (141), create personal skill (206). |
| endpoint | GET /api/skills/[name]/files/[...path] | `apps/web/app/api/skills/[name]/files/[...path]/route.ts` | Preview or download one bundled file (lines 49-125). |
| service | Skill catalog service | `apps/web/lib/services/skill-catalog-service.ts` | Directory load (239), plugin filter (290), file read (411), selectable skill with files (669). |
| service | Skill install service | `apps/web/lib/services/skill-install-service.ts` | Per-user install overrides (89) and resolve installed skills (123). |
| service | User skill service | `apps/web/lib/services/user-skill-service.ts` | Personal skills: validate and scan (122), create (261), list (196), files (368). |
| service | Installed directory skills | `apps/web/features/plugins/server/directory/installed-skills.ts` | Skills from installed marketplace and workspace plugins (from line 80). |
| service | Workspace plugin access | `apps/web/lib/services/workspace-plugin-access.ts` | workspaceAllowsPlugins gate used by the list and files routes. |
| service | Enabled plugin ids | `apps/web/lib/services/plugin-installation-service.ts` | listEnabledPluginIds (448) decides which plugin skills show. |
| table | user_skills and user_skill_files | `apps/web/db/neon/0157_user_skills.sql` | Personal skill storage; 0318 adds files. |
| table | user_settings | `apps/web/lib/services/skill-install-service.ts` | Stores install overrides under settings.skills (lines 10, 89-120). |
| component | Mobile skills client | `apps/mobile/src/features/skills/service.ts` | Calls /api/skills, ?catalog=all and /api/skills/installs. |
| service | Desktop skills client | `apps/desktop/src/api/cloudSkills.ts` | Fetches /api/skills for the cloud settings modal. |
| service | Chrome skills client | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Reads /api/skills. |
| service | CLI account skills sync | `apps/cli/src/cloud/skills.rs` | fetch_account_skills (164) and write_account_skills (183) from /api/skills. |
| service | CLI skills discovery | `apps/cli/src/skills.rs` | discover_skills (144), discover_skills_all (169), skill_command_prompt (1469). |
| service | CLI command registry | `apps/cli/src/command_registry.rs` | registry_from_builtins_and_skills (45), with prompts (60), plugin commands (94-141), dynamic expansion (169), help (230). |
| service | CLI custom commands | `apps/cli/src/custom_commands.rs` | Discovers markdown commands from project, user and Claude-style folders (lines 67-180). |
| service | Built-in command contracts | `crates/agiworkforce-command-registry/src/lib.rs` | CommandRegistry, CommandSource, RegistryCommand, built-in slash list (imported at command_registry.rs:5-7). |
| screen | CLI palette | `apps/cli/src/tui/tui_app.rs` | Builds the registry at lines 717-745. |
| endpoint | CLI app-server command list | `apps/cli/src/app_server/surfaces.rs` | list_commands (648) returns commands to a connected client. |
| service | Capability gate for CLI skills | `apps/cli/src/tier_cache.rs` | SKILLS_CAPABILITY and capability_refusal (lines 285, 376-392). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app sends GET /api/skills with the person's session. | device and our servers | apps/mobile/src/features/skills/service.ts:16; apps/desktop/src/api/cloudSkills.ts:12 |
| The server rate-limits (bucket 'skills-catalog-read'), opens a user-scoped database session, and checks whether the workspace allows plugins. | our servers | apps/web/app/api/skills/route.ts:141-146 |
| It reads the built-in skills from the .agents/skills folder shipped with the server (cached 60 s), filtered by product audience, plus extra layers from SKILLS_LAYERS. | our servers | skill-catalog-service.ts:52,233-262 |
| It adds installed directory skills and personal skills, de-duplicates and returns the list. | our servers | route.ts:160-203 |
| A file request resolves the skill, then reads the file with realpath containment and a size ceiling, and returns text or an attachment. | our servers | files route:62-125; skill-catalog-service.ts:411-454 |
| The CLI syncs account skills into a local folder and discovers local skills; the TUI builds the slash registry on the device. | device | apps/cli/src/cloud/skills.rs:164-190; apps/cli/src/skills.rs:162-187; tui_app.rs:717 |
| Running /name resolves skill, then plugin command, then custom command and sends the expanded prompt to the model as the next message. | device | command_registry.rs:162-198 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Built-in skills | Files under .agents/skills shipped with the server, with an audience manifest | Served by API | Changed by release |
| Personal skills and their files | table:user_skills and table:user_skill_files | Server side | Deleted by deleteUserSkill (user-skill-service.ts:321); trash step not read: unknown |
| Install choices | table:user_settings, settings.skills.installs | Server side | Overwritten per choice |
| CLI account skills copy | ~/.agiworkforce/account-skills on the device, tied to the account owner | Downloaded from /api/skills | Rewritten on sync; ignored when owner differs (skills.rs:229-236) |
| CLI custom command files | markdown files in project or home folders | No | User managed |

**Models and providers.** Listing and file reading use no model. When a skill or command runs, its text goes to whatever model and provider the session uses (Local, own key or Cloud); the registry does not choose one [inferred].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Server routes need a signed-in account (the files route test 'returns 401 when the caller is not signed in'). CLI local skills and custom commands need no account; account skills need sign-in. |
| Permissions | Workspace policy for plugins and the 'skills' feature gate on creating personal skills (route.ts:146,214-221); project skills in the CLI need recorded consent (skills.rs:169-186). |
| Subscription | Capability 'canUseSkills' is true in the web, desktop and mobile rows (capabilities.ts:55,88,121) and can be denied by the capability document; the CLI refuses with 'Skills is not available on your plan' style text depending on layer (tier_cache.rs:376-392). No plan name rule read: unknown. |
| Limits and metering | Rate-limit buckets 'skills-catalog-read' and, for creation, 'chat-conversation'; values not read. File size ceiling SKILL_FILE_MAX_BYTES (value not read). Listed requirements capped at 20 (route.ts:72). |
| Feature flags | AGI_USER_SKILL_AUTHORING, SKILLS_LAYERS, CLI sandbox and consent settings. |
| Model compatibility | none found in the code for listing. A skill's required tools and connectors are shown so the app can warn when they are missing (route.ts:189-194). |
| Provider restrictions | none found in the code. |
| Local mode | CLI local skills, plugin commands and custom commands work from local files. Account skills only load after a Cloud sync and belong to the signed-in owner. Web, desktop, mobile and Chrome lists come from the Cloud server, so Local mode apps do not show account skills until signed in [inferred; desktop Local settings not opened]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Catalog fails to load | 500 'Failed to load skills' and the catalog cache is cleared if the response shape is wrong. | route.ts:154-158,199-202 |
| Plugins not allowed by workspace | Plugin skills and directory skills are omitted; the files route does not load plugins. | route.ts:146-152; files route:62-70 |
| Empty list | Returns an empty skills array plus canAuthorSkills; empty-state screens not opened: unknown. | route.ts:203 |
| Skill name clash in list | First claimed name wins (dedupeByFirstClaimedName). | route.ts:163,172 |
| CLI skill clashes with a built-in command | Skill skipped, warning logged, built-in keeps running. | command_registry.rs:48-53 |
| Plugin command path outside plugin root | Skipped. | command_registry.rs:113-130 |
| Broken plugin load in CLI | Plugin commands silently omitted (load error returns an empty list). | command_registry.rs:107-111 |
| Offline | Server lists unavailable; CLI uses the last synced account skills and local files [inferred]. | apps/cli/src/skills.rs:229-236 |
| Timeout, retry, cancel | Not handled in the code read for these two lists. | skills route and registry read |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/skills/__tests__/skill-catalog-param.test.ts`: The catalog=all parameter.
- `apps/web/app/api/skills/__tests__/skill-crud.test.ts`: Personal skill create, update, delete.
- `apps/web/app/api/skills/__tests__/skill-upload.test.ts`: Skill upload.
- `apps/web/app/api/skills/[name]/files/[...path]/__tests__/route.test.ts`: 401, empty path, 404, plugins gate, binary 415, too large 413, preview, download.
- `apps/web/lib/services/skill-catalog-service.test.ts`: Skill catalog service.
- `apps/web/lib/services/__tests__/skill-catalog-service.files.test.ts`: Skill file reads.
- `apps/web/lib/services/__tests__/skill-install-service.test.ts`: Install overrides.
- `apps/web/lib/services/user-skill-service.test.ts`: Personal skills and scan.
- `apps/cli/src/command_registry.rs`: Inline tests from line 372: shared built-in registry, skills as prompt entries, aliases, help rendering, ordering, collisions, plugin command loading and expansion, unreadable files.

**Test scenarios**

- **Plugin skill follows plugin state**
  1. Install a plugin that declares a skill.
  2. GET /api/skills.
  3. Turn the plugin off and GET again.
  - Expected: Skill present while on, absent when off.
- **Path escape refused**
  1. Request /api/skills/<name>/files/../../etc/passwd (encoded).
  - Expected: 404 'File not found'.
- **Binary and large files**
  1. Preview a binary asset, then a file above the size ceiling.
  - Expected: 415 then 413 with the stated messages.
- **CLI plugin command**
  1. Install a plugin whose manifest lists a commands folder with deploy.md.
  2. Open the CLI and type /.
  - Expected: 'deploy' appears with source Plugin; a command named like a built-in does not.
- **CLI name clash**
  1. Create a skill named like a built-in command.
  2. Start the CLI.
  - Expected: Built-in still runs and a warning is logged.

**Where to look when it fails**

- Logs: 'Managed Skill catalog load failed'; CLI warning 'a skill shares its name with a command already listed'.
- Error names: SkillCatalogUnavailableError.
- Rate-limit headers from withAdmittedRateLimitHeaders on both routes.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **CLI custom-prompt merge is never fed in production** Affects: CLI. Evidence: apps/cli/src/tui/tui_app.rs:718; apps/cli/src/app_server/surfaces.rs:651 pass &[]. Work needed: Delete the dead branch or feed saved prompts.
- **No skills in VS Code and no command registry outside the CLI** Affects: VS Code, web, desktop, mobile, Chrome. Evidence: doc: docs/product/surface-feature-matrix.md:77. Work needed: Decide parity; the server route is reusable.
- **Empty, loading and error screens for skills not verified** Affects: Web, desktop, mobile, Chrome. Evidence: Only routes and clients were read. Work needed: Drive each app and record the states.
- **Plan rules for skills unknown** Affects: Subscription accuracy. Evidence: capabilities.ts lists true; tier layer not read. Work needed: Read the capability evaluator and tier policy and record which plans deny skills.

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- F098-08
- F098-09

## Unknown

- In-app skill screens and their loading, empty and error states on web, desktop, mobile and Chrome.
- Rate-limit values and SKILL_FILE_MAX_BYTES.
- Which plans, if any, deny skills.
- Which client uses the CLI app-server command list.
- Whether personal skill deletion goes to a trash.
- Contents of crates/agiworkforce-command-registry (only imported names read).
