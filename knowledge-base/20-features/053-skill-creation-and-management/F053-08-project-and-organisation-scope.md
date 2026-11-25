---
id: "F053-08"
type: "feature"
title: "Project and organisation scope"
aliases: ["Project and organisation scope", "Project Skills (S53.04)", "Organization Skills (S53.05)", "Organization sharing (S53.25)", "Share with your workspace", "This project skill scope", "project-skills-consent"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S53.04", "S53.05", "S53.25"]
depends_on: ["SYS-authorization-and-workspaces", "SYS-connectors-plugins-and-skills", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "F053-07", "surface:cli", "surface:vscode", "surface:web"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-08 Project and organisation scope

A skill can belong to one project folder (CLI and VS Code, loaded only after the person allows it) or be shared with a workspace (web: an admin publishes a personal skill as a workspace plugin that members can add, or that an admin can require). Web, desktop and mobile have no per-project skill scope.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.04](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5304), [S53.05](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5305), [S53.25](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5325).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** CLI and VS Code: loads skills from <project>/.agiworkforce/skills only after the person allows that exact set. Web: lets a workspace admin share a personal skill with the workspace through the workspace plugin system.

**Why it exists.** Repository skills are instructions written by whoever writes the repository, so they must not reach the model unasked (apps/cli/src/skills.rs:285-292). Teams also want one skill every member can use (apps/web/app/api/skills/[name]/workspace/route.ts:35-44).

**Who uses it.** Developers working in a shared repository; workspace admins who want to give a team a skill.

**Problems it solves**

- A cloned repository cannot silently add instructions to the model.
- A team no longer has to ask each member to upload the same skill.
- A project can override a global skill of the same name, because project skills load first (apps/cli/src/skills.rs:155-160).

**Use cases**

- CLI: commit .agiworkforce/skills/release-notes/SKILL.md; the first run in the repo asks 'Load them?'; the answer is remembered until a skill changes.
- VS Code: 'New skill' then 'This project'; then 'Allow this folder’s project skills'.
- Web admin: edit a personal skill and press 'Share with workspace'; members then add it from Skills.
- Web admin: publish a skill as 'required' or 'installed by default' through workspace plugin settings.

## 2. User experience

**Where to find it**

- CLI: folder .agiworkforce/skills in the project; prompt on terminal; '/skills-toggle' to turn skills off; project file .agiworkforce/disabled-skills.json (apps/cli/src/skills.rs:111-125; apps/cli/src/tui/tui_app.rs:4520).
- VS Code: command-palette Skills manager; 'Create a skill' opens a quick pick titled '<product>, New skill' with 'Personal' and 'This project'; item '$(shield) Allow this folder’s project skills' (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:33-50; capabilityManagement.ts:250-254).
- Web and Desktop: Settings, Skills, skill editor (edit mode) shows the section 'Share with your workspace' for workspace admins (apps/web/features/skills/components/SkillEditorDialog.tsx:264-304).
- Mobile, Chrome: no project or workspace scope control found.

**Before you start**

- CLI: project folder trusted for its disabled list (apps/cli/src/skills.rs:111-114); a terminal to answer the prompt, or consent given through VS Code (apps/cli/src/skills.rs:445-448).
- VS Code: a trusted workspace, otherwise the item reads 'Open a trusted workspace to reach the AGI CLI.' (apps/extension-vscode/src/features/surfaces/cliCapabilities.ts:5-6); AGI CLI at the minimum supported version.
- Web share: signed in, personal skill saved (no unsaved changes), workspace permission policy.manage (apps/web/app/api/skills/[name]/workspace/route.ts:15-33).

**Screens and controls**

- CLI consent question: 'This project supplies N skill(s) of its own that would load on every run in <path>: <names>. Load them? You are asked again when one changes.' (apps/cli/src/skills.rs:459-466).
- VS Code rows show scope text and ', not allowed yet' until allowed; a 'Review skill file' button opens the file for review before allowing (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:257-303).
- Web editor: confirm dialog 'Share <name> with your workspace?' with button 'Share with workspace'; success text 'Shared. Members can add it from Skills now.' (apps/web/features/skills/components/SkillEditorDialog.tsx:264-304).

**Journey**

1. CLI: 1. Put SKILL.md in .agiworkforce/skills/<name>. 2. Run the CLI in the project. 3. Answer the question. 4. The skills load; the answer is stored against that exact set. 5. Edit or add a skill: asked again.
2. VS Code: 1. Skills manager, 'Create a skill', choose 'This project', give a name and 'When should AGI use this skill?'. 2. The SKILL.md opens for editing. 3. Choose 'Allow this folder’s project skills'. 4. Skills load in sessions for that workspace.
3. Web: 1. Edit a personal skill. 2. 'Share with workspace', confirm. 3. Members see it under workspace plugins and add it, unless the admin changes its install preference.

**What the person sees and gets**

- Declined sets are not asked again in the same run (apps/cli/src/skills.rs:289-290, 449-457).
- VS Code error toasts use the CLI's refusal reason (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:79-85).
- Web share errors show the server message or 'Could not share this skill with the workspace.' (apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:22, 113-134).

**Settings**

- CLI: ~/.agiworkforce/project-skills-consent.json (config folder) and ~/.agiworkforce/disabled-skills.json; project .agiworkforce/disabled-skills.json (apps/cli/src/skills.rs:95-125, 285).
- VS Code: environment AGIWORKFORCE_HOME to relocate the personal skills folder (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:9-15).
- Web: workspace plugin install preference values required, installed_by_default, available, not_available (packages/contracts/cloud-contracts/src/plugin-packages.ts:14-19).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI loads project skills first, then user, account, plugin and project-plugin skills; a project skill wins a name clash because the first entry wins (apps/cli/src/skills.rs:155-190, 1252-1275).
- Consent is kept in the user's config folder as a digest of file paths, content hashes, package hashes and hidden or linked package members; any change asks again (apps/cli/src/skills.rs:329-424).
- With no terminal the project skills do not load, and the app-server reports the gate read-only (apps/cli/src/skills.rs:445-448, 482-496).
- Project skill files are read only as regular files inside the project (apps/cli/src/skills.rs:798-806).
- CLI and VS Code can grant and revoke consent (apps/cli/src/skills.rs:529-562; apps/cli/src/app_server/surfaces.rs:153-170).
- VS Code 'New skill' writes <folder>/.agiworkforce/skills/<name>/SKILL.md and refuses to overwrite (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:31-88).
- Web: POST /api/skills/{name}/workspace publishes a personal skill with its files as a workspace plugin, needs policy.manage, writes an audit event (apps/web/app/api/skills/[name]/workspace/route.ts:22-61).
- Web: workspace plugin skills reach members who have the plugin enabled (apps/web/features/plugins/server/directory/installed-skills.ts:115-144), with their files (apps/web/features/plugins/server/directory/skill-companions.ts:111-122).

**Incomplete**

- The share button publishes with preference 'available' only; making it required or installed by default is done elsewhere in workspace plugin settings (apps/web/app/api/skills/[name]/workspace/route.ts:41; apps/web/app/api/settings/organization/plugins/route.ts:118-140).
- No UI that calls the share endpoint was found outside the web skill editor (searched apps and packages).
- Project-level disabled list is read only for trusted projects (apps/cli/src/skills.rs:111-114).

**Present but disconnected or switched off**

- The generated surface matrix says VS Code is 'absent' for skills, but the extension has a skills manager; the matrix is older than the code (docs/product/surface-feature-matrix.md:368 vs apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220).

**Not available**

- Web, Desktop, Mobile project scope: no skill is tied to a project; skill sources 'project' and 'workspace' exist in the contract but no web project-skill authoring was found (packages/contracts/cloud-contracts/src/skills.ts:10-17; brief S53.04).
- Chrome: no scope control (brief S53.04, S53.05).
- Mobile: no share or scope control found; it only labels sources 'Project' and 'Workspace' (apps/mobile/src/features/skills/SkillsScreen.tsx:46-47).
- CLI and VS Code: no organisation skills or sharing (brief S53.05, S53.25).

## 4. Required behaviour

**Established requirements**

- Skills can be scoped to a project so they load only in that project. (source: brief S53.04)
- An organization can provide skills that all its members get. (source: brief S53.05)
- A user can share a skill with their organization. (source: brief S53.25)
- Project skills load only after the project is consented (CLI) or allowed once (VS Code). (source: apps/cli/src/skills.rs:285-292; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:44)
- Developer extension discovery is folder-aware; CLI and VS Code show the same inventory for the same trusted workspace; compatibility never authorises changing another tool's files. (source: docs/product/definition.md:122)

**Acceptance criteria**

1. CLI: a project with one skill and no recorded consent asks once on a terminal and loads nothing if declined.
2. CLI: after a yes, adding a new skill file or editing one asks again.
3. CLI: a project skill named like a global skill is the one the model sees.
4. VS Code: a created project skill shows 'not allowed yet' until 'Allow this folder’s project skills' is chosen.
5. Web: a non-admin does not see the 'Share with your workspace' section; an admin does and, after confirming, members see the skill under workspace plugins.
6. Web: sharing a skill with unsaved edits is blocked (button disabled while dirty).
7. A skill with files keeps its files when shared.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Web, Desktop and Mobile project scope is wanted because the brief lists S53.04 as 'Should' for every app; the code shows none [inferred].
- Organisation skill delivery for members should be visible in the skill directory with the workspace as source [inferred from origin kind 'workspace' in packages/contracts/cloud-contracts/src/skills.ts:28-35].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Attach a skill to a web Project so it loads only in chats of that project.
- [proposed] Offer 'required for everyone' directly from the share confirmation.
- [proposed] Show the consent digest change reason (which skill changed) in the CLI prompt.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | CLI skill sources and precedence | `apps/cli/src/skills.rs` | load_skill_sources, discover_skills_all; project first, then user, account, plugin, project plugin. |
| service | CLI project consent | `apps/cli/src/skills.rs` | Digest of the project skill set, prompt, grant, revoke, read-only report. |
| store | store:project-skills-consent.json | `apps/cli/src/skills.rs` | Maps canonical project path to the allowed digest in the config folder. |
| store | store:disabled-skills.json | `apps/cli/src/skills.rs` | Global and per-project disabled skill names. |
| command | /skills-toggle, /skills import, /skills remove | `apps/cli/src/tui/tui_app.rs` | Terminal controls for turning skills off, importing and removing. |
| service | App-server skill surface | `apps/cli/src/app_server/surfaces.rs` | list_skills with projectSkillsDigest, set_skill_enabled, set_skill_consent, install_skill for VS Code. |
| command | VS Code skill creation | `apps/extension-vscode/src/features/surfaces/skillAuthoring.ts` | Quick pick 'Personal' or 'This project', writes SKILL.md. |
| command | VS Code skills manager | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | List, allow project skills, enable, install, remove. |
| config | VS Code CLI method names | `apps/extension-vscode/src/features/surfaces/cliCapabilities.ts` | Maps skillsConsent to setProjectSkillConsent. |
| endpoint | api:POST /api/skills/{name}/workspace | `apps/web/app/api/skills/[name]/workspace/route.ts` | Publishes a personal skill as a workspace plugin (admin only). |
| service | Skill-to-workspace-plugin converter | `apps/web/lib/services/skill-workspace-share-service.ts` | Builds the plugin input from the personal skill and all its files. |
| service | Organization plugin service | `apps/web/lib/services/organization-plugin-service.ts` | Publish, list for members, member state, skill files and companions for workspace plugins. |
| endpoint | api:GET /api/settings/organization/plugins | `apps/web/app/api/settings/organization/plugins/route.ts` | Admin list (canManage), publish by archive, change preference. |
| endpoint | api:GET /api/plugins/organization | `apps/web/app/api/plugins/organization/route.ts` | Member view of workspace plugins. |
| table | table:organization_plugins | `apps/web/db/neon/0326_organization_plugins.sql` | Published workspace plugins with install preference and scan verdict. |
| table | table:organization_plugin_files | `apps/web/lib/services/organization-plugin-service.ts` | Files of workspace plugins including skill files (queried at 467-525). |
| component | Skill editor dialog share section | `apps/web/features/skills/components/SkillEditorDialog.tsx` | The 'Share with your workspace' control with confirm dialog. |
| hook | Skills settings adapter | `apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx` | Checks canManage and posts the share request. |
| service | Installed directory skills (workspace source) | `apps/web/features/plugins/server/directory/installed-skills.ts` | Adds enabled workspace plugin skills to the member's skill list. |
| config | Skill sources and origins | `packages/contracts/cloud-contracts/src/skills.ts` | Sources project and workspace; origin kind workspace. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI starts, reads the project .agiworkforce/skills folder (regular files inside the project only) and the config-folder consent file. | device | apps/cli/src/skills.rs:211-232, 302-307 |
| CLI hashes the project skill set and compares with the stored digest; on mismatch it asks on the terminal. | device | apps/cli/src/skills.rs:426-479 |
| VS Code asks the CLI runtime for the list, shows the digest, and sends consent with the digest it showed; the CLI refuses if the set changed meanwhile. | device | apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:250-254; apps/cli/src/skills.rs:510-527 |
| Web admin presses Share; the browser posts to /api/skills/{name}/workspace. | device | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:113-134 |
| Server checks permission policy.manage, reads the personal skill and its files, scans, publishes the workspace plugin in the database and records an audit event. | our servers | apps/web/app/api/skills/[name]/workspace/route.ts:22-61; apps/web/lib/services/skill-workspace-share-service.ts:15-59 |
| Members' skill lists and chat turns include the workspace plugin's skills when the plugin is enabled for them. | our servers | apps/web/features/plugins/server/directory/installed-skills.ts:115-144, 284-300 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Project consent digest | store:project-skills-consent.json in the CLI config folder, keyed by canonical project path | no; deliberately outside the repository so the project cannot ship its own yes (apps/cli/src/skills.rs:285-292) | Kept until consent is revoked (apps/cli/src/skills.rs:552-562). |
| Workspace plugin with skill files | table:organization_plugins and table:organization_plugin_files | server-side; members read it live | Published rows can be retired (status field); deletion rules: unknown. |
| Audit event admin_policy_changed (source personal_skill) | security audit log | server-side | Retention: unknown. |

**Models and providers.** Scope does not depend on a model. Project skill text is sent to whichever model the CLI or VS Code session uses, only after consent. Workspace skills are loaded by the cloud chat loop for any tool-calling model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI project scope needs no account. Web sharing needs a signed-in admin of a workspace (apps/web/app/api/skills/[name]/workspace/route.ts:25-33). |
| Permissions | CLI: user consent plus project trust for the disabled list. VS Code: workspace trust and CLI version. Web: permission policy.manage (apps/web/app/api/skills/[name]/workspace/route.ts:15, 31-33). |
| Subscription | The CLI hides all skills when the cached capability document denies canUseSkills (apps/cli/src/skills.rs:144-148). Whether workspace plugins need a specific plan: none found in the code read. |
| Limits and metering | Same file limits as F053-07 for shared skills. Number of workspace plugins: unknown. No metering found for scope features. |
| Feature flags | AGI_USER_SKILL_AUTHORING must not be '0' for a personal skill to exist to share (apps/web/lib/services/user-skill-authoring.ts:6). |
| Model compatibility | No model rule found for scope. |
| Provider restrictions | none found in the code. |
| Local mode | CLI project scope is entirely local: no sign-in or payment needed, and skills load with local or own-key models. Web workspace sharing is cloud only. Desktop and Mobile local inference: no project scope exists. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No terminal and no recorded consent | Project skills do not load; no prompt is opened. | apps/cli/src/skills.rs:445-448 |
| Answer was 'no' in this run | Not asked again until restart. | apps/cli/src/skills.rs:449-457 |
| Skill edited between listing and allowing (VS Code) | The grant is refused as Changed so no unseen skill is allowed. | apps/cli/src/skills.rs:498-527 |
| Project has no skills | Nothing to allow; consent call returns NothingToAllow. | apps/cli/src/skills.rs:498-520 |
| Skill share while editor has unsaved changes | Share button disabled. | apps/web/features/skills/components/SkillEditorDialog.tsx:287 |
| Share by a non-admin | Server refuses with 'Only a workspace admin can share a skill with everyone in the workspace.'; the section is hidden when canManage is false. | apps/web/app/api/skills/[name]/workspace/route.ts:31-33; apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:96-104 |
| A file of the skill cannot be read while sharing | Share fails with '<path> could not be read, so the skill was not shared.' | apps/web/lib/services/skill-workspace-share-service.ts:35-37 |
| Offline, retry, cancel | not handled in the code beyond the error message on the share control. | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:113-134 |
| Accessibility | The share section has aria-label 'Share with your workspace'; VS Code uses standard quick pick. | apps/web/features/skills/components/SkillEditorDialog.tsx:266 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/skills.rs`: Inline tests: consent names the allowed set, a yes holds only for that set, a project cannot ship its own consent, consent covers hidden and linked package files.
- `apps/web/app/api/skills/[name]/workspace/route.test.ts`: Workspace share route: permission, CSRF, rate limit, publish and audit (mocked).
- `apps/web/lib/services/__tests__/skill-workspace-share-service.test.ts`: Converting a personal skill and its files into a workspace plugin.
- `apps/web/features/skills/components/SkillEditorDialog.test.tsx`: Skill editor dialog behaviour; whether it covers the share section was not checked.
- `crates/agiworkforce-app-server/tests/developer_sessions.rs`: App-server developer sessions; skill consent coverage not checked.

**Test scenarios**

- **CLI consent prompt**
  1. Create .agiworkforce/skills/demo/SKILL.md in a git repo.
  2. Run the CLI on a terminal.
  3. Answer no, then run again and answer yes.
  4. Edit SKILL.md and run again.
  - Expected: First run asks and loads nothing on no; yes loads it; after the edit it asks again with 'They are not the ones you allowed before.'
- **CLI without terminal**
  1. Remove consent; run the CLI non-interactively.
  - Expected: Project skills do not load and no prompt is written.
- **VS Code project skill**
  1. Open a trusted folder; Skills manager; Create a skill; This project; name and description.
  2. Open Skills manager again.
  - Expected: Row says 'project, not allowed yet'; after 'Allow this folder’s project skills' the row has a Turn off control.
- **Web share as admin**
  1. Sign in as workspace admin; create a personal skill; edit; Share with workspace; confirm.
  2. Sign in as a member; open Skills.
  - Expected: Success text shown; the member can add the skill from workspace plugins.
- **Web share as member**
  1. Sign in as a non-admin; edit a personal skill.
  - Expected: No 'Share with your workspace' section.

**Where to look when it fails**

- Server error text 'Only a workspace admin can share a skill with everyone in the workspace.'
- Audit events with eventType admin_policy_changed and source personal_skill.
- CLI file ~/.agiworkforce/project-skills-consent.json (inspect the digest for the project path).
- VS Code failure toast '<product>: <reason>' from reportFailure.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **The brief marks organisation skills and sharing missing on all apps, but the web code can share a skill with a workspace and publish workspace plugins; the brief and surface matrix are out of date for web.** Affects: Web, Desktop (hosted web). Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:22-61; brief S53.05, S53.25. Work needed: Update the brief and acceptance tests; decide the correct status.
- **No project-scoped skills on web, desktop or mobile.** Affects: Web, Desktop, Mobile. Evidence: brief S53.04; no project column in skill code. Work needed: Design attachment of a skill to a Project and loading rules.
- **Mobile and Chrome cannot share or scope a skill.** Affects: Mobile, Chrome. Evidence: apps/mobile/src/features/skills; apps/extension/src/features/cloud-bridge/skillsClient.ts. Work needed: Decide parity target.
- **Share control publishes as 'available' only and members must add it.** Affects: Workspace admins. Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:41. Work needed: Offer a stronger preference at share time or document the other screen.
- **CLI and VS Code have no organisation skills.** Affects: CLI, VS Code. Evidence: brief S53.05, S53.25. Work needed: Sync workspace plugin skills to the CLI like account skills.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-authorization-and-workspaces
- SYS-connectors-plugins-and-skills
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- F053-07
- surface:cli
- surface:vscode
- surface:web

## Unknown

- Whether any test covers the VS Code create-skill or allow flow (none found).
- Whether members get workspace skills automatically when the install preference is 'required' or 'installed_by_default' (member state code read, enforcement path not traced).
- Plan or entitlement needed for workspace plugins.
- Retention of retired workspace plugins and audit events.
- Whether the Tauri desktop code has project skill scope.
