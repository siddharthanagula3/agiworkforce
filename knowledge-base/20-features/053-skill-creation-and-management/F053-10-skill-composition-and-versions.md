---
id: "F053-10"
type: "feature"
title: "Skill composition and versions"
aliases: ["Skill composition and versions", "Skill composition (S53.19)", "Version selection (S53.23)", "Update notification (S53.24)", "Skill duplication and customization (S53.26)", "Use as a template"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S53.19", "S53.23", "S53.24", "S53.26"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "F053-07", "F053-09", "surface:mobile", "surface:web"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-10 Skill composition and versions

Mostly not built. A skill cannot call another skill, a person cannot pick a version, and no update notice exists. A version string is shown read-only. Copying exists in two partial forms: mobile 'Use as a template' for a skill's text, and a web plugin-level customize call.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.19](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5319), [S53.23](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5323), [S53.24](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5324), [S53.26](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5326).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Would let one skill build on another, let a person choose or be told about a skill version, and let a person copy a built-in skill and edit the copy.

**Why it exists.** Brief items S53.19, S53.23, S53.24 and S53.26 require them on every app.

**Who uses it.** Skill authors and people who depend on shared or built-in skills.

**Problems it solves**

- Today a built-in skill cannot be tweaked in place; a person must copy it by hand.
- Skills carry a content hash and a version so a change can be detected, but nobody is told (packages/tools/skills/src/tool.ts:300-320).

**Use cases**

- Mobile: open a catalog skill and choose 'Use as a template' to get an editable '<name>-copy'.
- CLI: list shows version, content_hash and tree_hash so a caller can see a skill changed.
- [proposed] A release skill that calls a changelog skill.
- [proposed] Pin a skill to version 1.2 and be warned about 1.3.

## 2. User experience

**Where to find it**

- Web and Desktop: skill detail 'Source and access' shows 'Version' read-only when the skill has one (packages/ui/ui/src/directory/SkillDetailView.tsx:82-84; packages/ui/ui/src/directory/constants.ts:133).
- Mobile: skill detail, button 'Use as a template' (apps/mobile/src/features/skills/SkillDetailScreen.tsx:396-400).
- Web plugin detail: a Customize action calls the plugin customize endpoint (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1688-1708; packages/ui/ui/src/directory/PluginDetailView.tsx:807-827).
- CLI: '/skills' list text; JSON list from the skill tool includes version and hashes (apps/cli/src/skills.rs:1373-1415).
- VS Code, Chrome: nothing.

**Before you start**

- Mobile template: signed in and skill authoring available (the new skill is created through POST /api/skills).

**Screens and controls**

- Mobile edit sheet opens with name '<skill>-copy', same description and body; 'Create skill' saves it (apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx:172-187).

**Journey**

1. Mobile: 1. Open a catalog skill. 2. Press 'Use as a template'. 3. Edit. 4. Press 'Create skill'. The copy is a personal skill with the body only (apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107).

**What the person sees and gets**

- Version text appears in the access summary only when the skill's frontmatter has one; mobile test says nothing is shown when absent (apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx:142).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Version from frontmatter is carried into the catalog response when non-empty (apps/web/app/api/skills/route.ts:186-196) and shown read-only on web, desktop and mobile.
- Loaded skill results are stamped with version (or 'unversioned'), content hash and tree hash (packages/tools/skills/src/tool.ts:300-320; apps/cli/src/skills.rs:1202-1232).
- CLI tests detect hash drift between two loads (apps/cli/src/skills.rs:2335-2358).
- Mobile 'Use as a template' creates a personal copy of the text (apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107).
- Web: customizing a plugin posts to the plugin customize path and returns a new entry id (apps/web/features/directory/hooks/useDirectoryAdapter.ts:1688-1708).

**Incomplete**

- Customize works on plugins, not on a single skill, and what it copies was not read: unknown.
- Template copy drops bundled files (apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107).
- A built-in skill on web can be downloaded when downloadable (apps/web/app/api/skills/route.ts:181), so a manual copy path exists but is not a duplicate action [inferred].

**Present but disconnected or switched off**

- Hashes and version travel in tool results but no screen compares them to an earlier load.

**Not available**

- Skill composition on all apps (brief S53.19).
- Version selection on all apps (brief S53.23).
- Update notification on all apps (brief S53.24).
- Web, desktop, CLI, VS Code, Chrome skill duplication (brief S53.26); mobile has the partial template copy.

## 4. Required behaviour

**Established requirements**

- A skill can call or build on other skills as part of its workflow. (source: brief S53.19)
- A user can choose which version of a skill to use. (source: brief S53.23)
- The product notifies users when an installed skill has an update. (source: brief S53.24)
- A user can duplicate a skill (e.g. a built-in one) and customize the copy. (source: brief S53.26)

**Acceptance criteria**

1. A skill body that names another skill leads the model to load that skill by exact name (today: model can call the tool again; no declared dependency).
2. Version shows in detail on web, desktop and mobile only when declared.
3. A user can choose among versions and the chosen one is the one loaded.
4. An installed skill with a newer version shows an update notice.
5. 'Use as a template' keeps the files of the source skill.
6. Duplicating a built-in skill on web gives an editable personal copy.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The model can already call the skill tool several times in a turn, so composition by instruction text may work without a declaration [inferred from tool-loop skill branch allowing repeated calls: tool-loop.skill.test.ts:579].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A 'requires skills' frontmatter list checked like required tools.
- [proposed] Store several versions per skill and a 'pinned version' per user.
- [proposed] An 'Update available' badge from comparing the stored content hash with the source.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Skill tool fencing with version and hashes | `packages/tools/skills/src/tool.ts` | Stamps version, content_hash, tree_hash on loaded and listed skills. |
| service | Skill integrity hashes | `packages/tools/skills/src/integrity.ts` | Content and tree hash algorithm shared with Rust. |
| endpoint | api:GET /api/skills | `apps/web/app/api/skills/route.ts` | Adds version and treeHash to each catalog entry. |
| component | Skill access summary | `packages/ui/ui/src/directory/SkillDetailView.tsx` | Read-only 'Version' row. |
| screen | Mobile skill detail template | `apps/mobile/src/features/skills/SkillDetailScreen.tsx` | skillTemplateDraft and 'Use as a template'. |
| hook | Directory adapter customizePlugin | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Calls the plugin customize endpoint. |
| config | Plugin customize contract | `packages/contracts/cloud-contracts/src/plugin-marketplaces.ts` | PluginCustomizeRequestSchema (line 321). |
| service | CLI skill load and hashing | `apps/cli/src/skills.rs` | Version field, content hash, tree hash and drift tests. |
| service | CLI skill tool list | `apps/cli/src/skills.rs` | Lists version and hashes. |
| service | Managed skill summary schema | `packages/contracts/cloud-contracts/src/skills.ts` | version field (max 40 chars) described as optional and never invented. |
| service | Skill origin and install records | `apps/web/lib/services/skill-install-service.ts` | Install and uninstall overrides; stores no version choice. |
| endpoint | api:GET /api/skills/{name}/download | `apps/web/app/api/skills/[name]/download/route.ts` | Downloads a bundled skill; the manual route to a copy. |
| service | Chrome skills client | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Reads only name and description; no version. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Catalog request builds each entry with the version from frontmatter and its tree hash. | our servers | apps/web/app/api/skills/route.ts:186-196 |
| Mobile template: the app fetches the skill body, fills a new draft '<name>-copy' and creates a personal skill. | device and our servers | apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107, 196-215; apps/mobile/src/features/skills/service.ts:111-128 |
| Plugin customize: the browser posts pluginId or entryId; the server returns an entry id. | our servers | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1688-1708 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Version string | Inside the skill's SKILL.md frontmatter | Travels with the catalog response | Changes when the file changes; no history of versions is kept (none found in the code). |
| Template copy | table:user_skills (personal skill) | server-side | Deleted when the person deletes the skill. |

**Models and providers.** No model takes part in versioning or copying. Composition, if used, is the model calling the skill tool again.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Template copy and customize need a signed-in account. |
| Permissions | Creating the copy follows personal skill creation rules, including the workspace 'skills' policy (apps/web/app/api/skills/route.ts:215-221). |
| Subscription | none found in the code. |
| Limits and metering | none found in the code for versions or copies; the copy counts as a personal skill with draft limits of 64-character name, 1,024-character description, 60,000-character body (packages/tools/skills/src/validation.ts:3-6). |
| Feature flags | AGI_USER_SKILL_AUTHORING; mobile FEATURES.skills. |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | CLI versions and hashes are read from local files with no sign-in. On desktop and mobile local inference nothing for this feature runs on-device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Skill has no version | Web shows no version row; the loaded result says version 'unversioned'. | packages/tools/skills/src/tool.ts:305; apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx:142 |
| Template name already exists | Server returns a conflict 'You already have a skill named ...'. | apps/web/lib/services/user-skill-service.ts:283-288 |
| Name equals a built-in skill name | Creation refused: '<name>' is already a built-in skill name. | apps/web/app/api/skills/route.ts:237-241 |
| Skill changes between two loads (CLI) | Hash differs; tests assert drift is detected, no notice is shown. | apps/cli/src/skills.rs:2335-2358 |
| Offline, retry, cancel, accessibility | not handled in the code for versions or update notices. | brief S53.23, S53.24 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Template copy and version display on mobile.
- `packages/tools/skills/src/__tests__/tool.test.ts`: Version and integrity hashes stamped on loaded skills (line 134).
- `packages/tools/skills/src/__tests__/integrity.test.ts`: Hash known-answer vectors.
- `apps/cli/src/skills.rs`: Inline tests: version stamping, versionless skills still load, tree hash.
- `apps/web/app/api/skills/__tests__/skill-crud.test.ts`: Create, update and delete of personal skills.

**Test scenarios**

- **Version row**
  1. Create a skill with version: 1.2 in frontmatter via upload; open its detail on web.
  - Expected: Read-only 'Version 1.2'.
- **Mobile template**
  1. Open a catalog skill on mobile; Use as a template; Create skill.
  - Expected: A personal '<name>-copy' exists with the same instructions and no files.
- **No update notice**
  1. Change the source of an installed repository skill; reopen the app.
  - Expected: No update notice (confirms absence).
- **Composition by text**
  1. Write skill A whose body says 'load skill B first'; ask for A.
  - Expected: Record whether the model calls the skill tool for B.

**Where to look when it fails**

- Catalog entry fields version and treeHash.
- CLI skill list JSON fields version, content_hash, tree_hash.
- Conflict error 'You already have a skill named'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **No skill composition support or declaration.** Affects: All apps. Evidence: brief S53.19. Work needed: Define how a skill names dependencies and how loading is limited (loops, depth).
- **No version selection or version history.** Affects: All apps. Evidence: brief S53.23; no version column in the user_skills table (apps/web/lib/services/user-skill-service.ts:273-280). Work needed: Design version storage and a picker.
- **No update notification.** Affects: All apps. Evidence: brief S53.24; search for update-available code found none. Work needed: Compare installed and source hashes, add a notice.
- **Duplication is mobile-only and text-only.** Affects: Web, Desktop, CLI, VS Code, Chrome; Mobile loses files. Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107. Work needed: Add a duplicate action to the shared skill detail and copy files.
- **Brief lists mobile as missing S53.26 but a template action exists.** Affects: Documentation. Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:396-400. Work needed: Update brief.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- F053-07
- F053-09
- surface:mobile
- surface:web

## Unknown

- What the plugin customize endpoint copies (server code not read).
- Whether a skill can already be duplicated through web plugin customize for a built-in pack.
- Whether the model reliably loads a second skill named in a skill body.
- Whether any design for versions exists in docs/specs.
