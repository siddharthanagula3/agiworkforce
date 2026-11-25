---
id: "F053-05"
type: "feature"
title: "Personal skills (create, edit, delete)"
aliases: ["Personal skills", "Your skills", "Created by you", "Skill editor", "New skill", "Create a skill", "Create with AGI", "Items S53.03, S53.09"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S53.03", "S53.09"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "api:POST /api/skills", "api:PUT /api/skills/{name}", "api:DELETE /api/skills/{name}", "table:user_skills", "table:user_skill_files", "F053-01", "F053-02", "F053-06", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-authorization-and-workspaces"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-05 Personal skills (create, edit, delete)

Lets a person write their own skill (name, description, instructions), change it and delete it. On web and Desktop an editor does this; on Mobile a New skill sheet does; on the CLI and in VS Code a skill is a SKILL.md file in a folder. Web and mobile save the skill to the account only.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.03](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5303), [S53.09](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5309).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built (this page lists unfinished parts) | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built (this page lists unfinished parts) | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores a skill the person wrote so only they can use it. The server records it with origin 'personal' and the time it was added, and offers it in chat before built-in skills.

**Why it exists.** People repeat the same instructions; a skill turns them into a reusable, named step. Requirements ask for user skills (doc: docs/product/requirements.md, section 19).

**Who uses it.** Any signed-in person; developers keeping skills as files.

**Problems it solves**

- Retyping the same instructions
- Sharing instructions across chats
- Keeping instructions private to one account

**Use cases**

- A person writes a 'weekly-report' skill on web and picks it from the slash menu.
- A mobile user starts a copy of a built-in skill with 'Use as a template' and edits it.
- A developer runs the VS Code 'Create a skill' command and edits the template file.
- A person deletes a skill they no longer need.

## 2. User experience

**Where to find it**

- Web and Desktop: Settings > Skills; header actions 'Create with AGI' ('Describe it in a chat and get a draft.') and 'Create a skill' ('Write the instructions yourself.') or the label 'New skill' (apps/web/features/directory/hooks/useDirectoryAdapter.ts:250-255; apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:17, 232-236).
- Web edit: open an own skill and use its settings action; delete: 'Delete skill' at the bottom of the detail (packages/ui/ui/src/directory/SkillDetailView.tsx:289-312).
- Mobile: 'New skill' on the Skills screen (apps/mobile/src/features/skills/SkillsScreen.tsx:873-879); 'Edit instructions', 'Delete skill', 'Use as a template' on the detail screen (apps/mobile/src/features/skills/SkillDetailScreen.tsx:378-398).
- CLI: files in ~/.agiworkforce/skills or the project's .agiworkforce/skills; /create-skill and /save-skill ask the model to write a project skill file (apps/cli/src/claude_parity.rs:319-320, 879-898).
- VS Code: Skills quick pick action 'Create a skill' (command 'New skill') (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:232-243; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:32-88).
- Chrome: none; 'Manage skills' opens the web settings (apps/extension/src/side_panel.ts:15183-15186).

**Before you start**

- Signed in (web, desktop, mobile).
- Authoring switched on: it is on unless the server setting AGI_USER_SKILL_AUTHORING is 0 (apps/web/lib/services/user-skill-authoring.ts:10-12).
- Create also needs the workspace Skills feature allowed (apps/web/app/api/skills/route.ts:215-222).

**Screens and controls**

- Web editor dialog titled 'New skill' or 'Edit skill': fields Name (placeholder 'release-notes'), Description, Instructions; button 'Import a SKILL.md'; buttons 'Create skill' or 'Save changes' ('Saving…'); for admins a 'Share with your workspace' action (apps/web/features/skills/components/SkillEditorDialog.tsx:91-312).
- Mobile sheet with fields labelled 'Skill name', 'Skill description', 'Skill instructions' and buttons 'Cancel' and 'Create skill' or 'Save skill' (apps/mobile/src/features/skills/NewSkillSheet.tsx:122-178).
- Delete confirmation on web: title 'Delete /<name>?' with 'The skill and its files are deleted from your account and cannot be recovered...' and button 'Delete' (packages/ui/ui/src/directory/constants.ts:357-362). Mobile: 'Delete <name>?' with 'This cannot be undone.' (apps/mobile/src/features/skills/SkillDetailScreen.tsx:164-170).
- VS Code prompts: scope pick 'Personal' or 'This project', a name box ('A short name in lowercase with hyphens, such as release-notes'), a description box ('When should AGI use this skill? The model reads this to decide.') (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:32-70).

**Journey**

1. Open the editor (web 'New skill', mobile 'New skill', VS Code 'Create a skill').
2. Enter a lowercase name with hyphens, a description of when to use it and the instructions.
3. Save. The server validates, scans the text, stores the skill and returns it.
4. The skill appears in the list and in the composer lists; it is labelled 'Created by you'.
5. Edit later through the same editor; delete from the detail view and confirm.

**What the person sees and gets**

- Web: the dialog lists every validation problem and shows server errors without losing the draft (apps/web/features/skills/components/SkillEditorDialog.test.tsx:150-195).
- Web: failure message 'Could not save this skill.' (apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:19).
- Mobile: 'Could not save this skill. Try again.' (apps/mobile/src/features/skills/NewSkillSheet.tsx:67).
- Server errors: 409 '"x" is already a built-in skill name.', 409 'You already have a skill named "x".', 400 for a name, description or instruction problem, or for text the scan blocks ('This skill was not saved because it ... Remove that part and try again.') (apps/web/app/api/skills/route.ts:237-240; apps/web/lib/services/user-skill-service.ts:122-145, 289).
- VS Code: warning 'a skill named <name> already exists there.' (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:76-80).

**Settings**

- AGI_USER_SKILL_AUTHORING on the server (apps/web/.env.example:406-408).
- The response flag canAuthorSkills controls whether web and mobile show the create controls (apps/web/app/api/skills/route.ts:160, 203; apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:232-236).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- POST /api/skills (JSON), PUT /api/skills/{name}, DELETE /api/skills/{name} (204), with CSRF, rate limit and audit (apps/web/app/api/skills/route.ts:206-258; apps/web/app/api/skills/[name]/route.ts:50-105).
- Rules: name 1 to 64 lowercase letters, digits, hyphens; description up to 1,024 characters; instructions up to 60,000 (packages/tools/skills/src/validation.ts:3-6, 124-160).
- A built-in name is refused; a duplicate own name is refused by a unique constraint (apps/web/app/api/skills/route.ts:237-240; apps/web/lib/services/user-skill-service.ts:25, 289; apps/web/db/neon/0157_user_skills.sql:27).
- Text is scanned and a blocking finding refuses the save (apps/web/lib/services/user-skill-service.ts:122-145).
- Rows are isolated per account by row level security (apps/web/db/neon/0157_user_skills.sql:35-46).
- Web editor, mobile sheet with edit and 'Use as a template' (copy named '<name>-copy') (apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107).
- Personal skills sync to the CLI as account skills (apps/cli/src/cloud/skills.rs:34-45, 85-100, 164-181).
- CLI and VS Code file-based skills (apps/cli/src/skills.rs:689-700; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:9-88).

**Incomplete**

- A personal skill keeps only name, description and instructions; any 'requires', version or other frontmatter in an imported file is dropped, so personal skills cannot declare needs (apps/web/app/api/skills/route.ts:130-137; apps/web/lib/services/user-skill-service.ts:156-166) [inferred].
- PUT and DELETE routes carry no workspace Skills gate (only POST does) (apps/web/app/api/skills/[name]/route.ts:50-105) [inferred].
- PUT changes name, description and instructions but not the bundled files (apps/web/lib/services/user-skill-service.ts:295-319).
- Mobile New skill appears only when canAuthorSkills is true (apps/mobile/src/features/skills/SkillsScreen.tsx:873).

**Present but disconnected or switched off**

- All create, edit and delete paths return 404 'Skill authoring is not available.' when AGI_USER_SKILL_AUTHORING is 0 (apps/web/lib/services/user-skill-authoring.ts:14-18).

**Not available**

- Chrome: no personal skill creation.
- CLI has no guided editor; the file is made by hand or by the model through /create-skill (apps/cli/src/claude_parity.rs:879-898).
- No trash or recovery for a deleted personal skill; the confirm text says it cannot be recovered (packages/ui/ui/src/directory/constants.ts:360-361).

## 4. Required behaviour

**Established requirements**

- A user can own personal skills that only they have and that they created or added (S53.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.03)
- A user can write and edit a skill's instructions in an editor in the product (S53.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.09)
- The server stores the skill for that account only with origin personal and the time added; a built-in name is refused with a conflict message. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.03, S53.09)
- Skills requirements include user skills and project skills. (source: doc: docs/product/requirements.md (section 19))
- An action a user cannot undo asks first and names what is lost. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Creating 'weekly-report' on web shows it in Settings > Skills as 'Created by you' and in the slash menu under 'Your skills'.
2. Creating a name that a built-in skill uses returns 409.
3. Creating the same name twice returns 409 'You already have a skill named'.
4. Saving a name with capital letters is refused with the name message.
5. Editing the instructions changes what the model loads on the next turn.
6. Deleting asks for confirmation naming the loss, then the skill disappears (204).
7. Another account never sees the skill.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Because all rows use row level security, the PUT and DELETE routes cannot touch another account's skill.
- [inferred] Renaming through PUT keeps the same row and its files.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Keep requires and version in personal skills.
- [proposed] Add a recovery window for deleted personal skills.
- [proposed] Add the workspace Skills gate to PUT and DELETE.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/skills | `apps/web/app/api/skills/route.ts` | Create from JSON or upload (lines 206-258). |
| endpoint | PUT and DELETE /api/skills/{name} | `apps/web/app/api/skills/[name]/route.ts` | Update and delete (lines 50-105). |
| service | user-skill-service | `apps/web/lib/services/user-skill-service.ts` | Create, update, delete, list, find with files (lines 122-392). |
| service | user-skill-authoring | `apps/web/lib/services/user-skill-authoring.ts` | Feature switch AGI_USER_SKILL_AUTHORING (lines 5-18). |
| schema | SkillDraftBodySchema | `apps/web/app/api/skills/skill-draft-schema.ts` | Strict JSON body: name, description, body. |
| service | validateSkillDraft | `packages/tools/skills/src/validation.ts` | Name pattern and length limits (lines 3-6, 124-160). |
| table | user_skills | `apps/web/db/neon/0157_user_skills.sql` | Per-account skills with unique (user_id, name) and row level security. |
| table | user_skill_files | `apps/web/db/neon/0318_user_skill_files.sql` | Files a personal skill bundles; cascade on delete. |
| component | SkillEditorDialog | `apps/web/features/skills/components/SkillEditorDialog.tsx` | Web editor. |
| hook | useSkillsSettingsAdapter | `apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx` | Opens the editor, loads the body, saves, shares to workspace (lines 41-263). |
| hook | useDirectoryAdapter create and delete | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Create with AGI, create, delete (lines 250-255, 376-407, 1483-1496). |
| component | NewSkillSheet | `apps/mobile/src/features/skills/NewSkillSheet.tsx` | Mobile create and edit sheet. |
| service | mobile personal skill client | `apps/mobile/src/features/skills/service.ts` | create, update, delete calls (lines 115-205). |
| screen | mobile detail Make your own | `apps/mobile/src/features/skills/SkillDetailScreen.tsx` | Edit, delete, template (lines 105-107, 160-182, 378-398). |
| service | CLI user skills loader | `apps/cli/src/skills.rs` | Reads user and project skill folders (lines 211-245, 689-736). |
| command | /create-skill and /save-skill | `apps/cli/src/claude_parity.rs` | Prompts that ask the model to write a skill file (lines 319-320, 879-898). |
| command | VS Code createSkill | `apps/extension-vscode/src/features/surfaces/skillAuthoring.ts` | Scope, name and description prompts, writes template (lines 32-88). |
| service | CLI account skills sync | `apps/cli/src/cloud/skills.rs` | Brings account personal skills to the device (lines 85-181). |
| endpoint | POST /api/skills/{name}/workspace | `apps/web/app/api/skills/[name]/workspace/route.ts` | Admin shares a personal skill with the workspace (lines 17-60). |
| config | AGI_USER_SKILL_AUTHORING | `apps/web/.env.example` | Documented switch, default on (lines 406-408). |
| test | skill-crud.test.ts | `apps/web/app/api/skills/__tests__/skill-crud.test.ts` | Create, edit, delete route tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person fills the editor and saves; the client sends POST /api/skills (create) or PUT /api/skills/{name} (edit) with a CSRF token. | device and our servers | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:196-215 |
| The server checks CSRF and the rate limit, requires authoring to be on, finds the account, and (create) checks the workspace Skills feature. | our servers | apps/web/app/api/skills/route.ts:206-222 |
| The body is parsed with a strict schema, a built-in name is refused, text is validated and scanned, then inserted into user_skills. | our servers | apps/web/app/api/skills/route.ts:223-242; apps/web/lib/services/user-skill-service.ts:122-145, 261-292 |
| An audit event 'skill_installed' (source authored) is recorded and the summary is returned with 201. | our servers | apps/web/app/api/skills/route.ts:243-258 |
| The client closes the editor, clears its list and announces a catalogue change so the lists reload. | device | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:222-226 |
| Delete: DELETE removes the row where user and name match, files cascade, an audit event 'skill_uninstalled' is recorded. | our servers | apps/web/app/api/skills/[name]/route.ts:82-105; apps/web/lib/services/user-skill-service.ts:321-332 |
| CLI and VS Code: a SKILL.md file is written to disk; no server call. | device | apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:72-87 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Skill name, description, instructions, timestamps | public.user_skills (apps/web/db/neon/0157_user_skills.sql:19-27) | Per account on our servers; copied to the CLI as an account skill when signed in | Deleted only by the owner (hard delete); files cascade |
| Bundled files (from an upload) | public.user_skill_files (apps/web/db/neon/0318_user_skill_files.sql:24-33) | Per account | Cascade with the skill and the account |
| File skills on a device | ~/.agiworkforce/skills or <project>/.agiworkforce/skills (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:9-17) | Not synced | Removable with /skills remove (apps/cli/src/tui/tui_app.rs:6183) |

**Models and providers.** No model is involved in saving. 'Create with AGI' opens a chat that uses the selected model and the 'skill-creator' skill if installed (apps/web/features/directory/hooks/useDirectoryAdapter.ts:376-385); CLI /create-skill is also a model turn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in for web, desktop, mobile. CLI and VS Code files need no account. |
| Permissions | Create needs the workspace Skills feature (apps/web/app/api/skills/route.ts:215-222). A workspace admin can share a personal skill with the workspace (apps/web/app/api/skills/[name]/workspace/route.ts:17-35). |
| Subscription | No plan check found in the create, edit or delete routes. |
| Limits and metering | Writes spend the chat-conversation bucket, 60 per minute (apps/web/lib/rate-limit.ts:282-286). Name 64 characters, description 1,024, instructions 60,000 (packages/tools/skills/src/validation.ts:3-6). No count limit per account found. |
| Feature flags | AGI_USER_SKILL_AUTHORING (on by default); FEATURES.skills (mobile). |
| Model compatibility | None for saving; using the skill needs a tool-capable model (F053-03). |
| Provider restrictions | None found in the code. |
| Local mode | Mobile Local mode: gated, so no creation. CLI and VS Code: file based, fully on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Validation error | All problems listed; draft kept. | apps/web/features/skills/components/SkillEditorDialog.test.tsx:150-195 |
| Blocked text | Save refused with a message naming the reason. | apps/web/lib/services/user-skill-service.ts:130-145 |
| Name conflict | 409 for built-in or own duplicate. | apps/web/app/api/skills/route.ts:237-240; apps/web/lib/services/user-skill-service.ts:289 |
| Edit while body loads | The editor shows a loading state and ignores stale reads when another skill is opened. | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:150-183; apps/web/features/skills/hooks/__tests__/useSkillsSettingsAdapter.stale-body.test.tsx:67-129 |
| Not found on edit or delete | 404 'Skill "x" not found'. | apps/web/app/api/skills/[name]/route.ts:76-78, 96-98 |
| Authoring off | 404 'Skill authoring is not available.' | apps/web/lib/services/user-skill-authoring.ts:14-18 |
| Cancel | Closing the web editor discards edits; mobile locks fields while saving. | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:128-139; apps/mobile/src/features/skills/__tests__/NewSkillSheet.test.tsx:86 |
| Offline, timeout | not handled beyond the save error message. | apps/web/features/skills/hooks/useSkillsSettingsAdapter.tsx:227-231 |
| Empty personal section | The plus menu says 'No skills of your own yet.'; the Chrome menu says the same. | apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:201; apps/extension/_locales/en/messages.json spSkillsEmpty |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/skills/__tests__/skill-crud.test.ts`: POST, PUT, DELETE, CSRF, feature gate, built-in name, invalid draft, authoring off.
- `apps/web/lib/services/user-skill-service.test.ts`: User skill service.
- `apps/web/db/neon/user-skills-migration.test.ts`: Migration shape.
- `apps/web/features/skills/components/SkillEditorDialog.test.tsx`: Editor fields, validation, import, submit.
- `apps/web/features/skills/hooks/__tests__/useSkillsSettingsAdapter.stale-body.test.tsx`: Stale body reads.
- `apps/web/app/api/skills/[name]/workspace/route.test.ts`: Sharing a personal skill with the workspace.
- `apps/mobile/src/features/skills/__tests__/NewSkillSheet.test.tsx`: Mobile sheet save behaviour.
- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Template, delete confirmation.
- `packages/tools/skills/src/__tests__/validation.test.ts`: Draft validation rules.
- `apps/web/__tests__/api/skills.security.test.ts`: Skills API security checks.

**Test scenarios**

- **Create and use**
  1. Web: New skill with name 'weekly-report', a description and instructions.
  2. Save.
  3. Type / and pick it.
  4. Send.
  - Expected: Created with 201, listed as 'Created by you', loaded in the reply.
- **Conflict**
  1. Create a skill with the name of a built-in skill.
  - Expected: 409 and the message that it is already a built-in skill name.
- **Delete**
  1. Open the skill, press 'Delete skill', confirm.
  - Expected: 204 and the skill disappears from every list.
- **Authoring off**
  1. Set AGI_USER_SKILL_AUTHORING to 0 on a test server and POST.
  - Expected: 404 'Skill authoring is not available.' and no New skill control.
- **VS Code create**
  1. Run 'Create a skill', choose Personal, name 'release-notes', give a description.
  - Expected: A SKILL.md template opens under the personal skills folder.

**Where to look when it fails**

- Audit events skill_installed (source authored) and skill_uninstalled.
- Unique constraint code 23505 mapped to the 409 message (apps/web/lib/services/user-skill-service.ts:25, 83).
- Mobile test text 'Could not save this skill. Try again.'

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **Personal skills cannot carry needs, version or other frontmatter.** Affects: Web, mobile, desktop. Evidence: apps/web/lib/services/user-skill-service.ts:156-166. Work needed: Store and return frontmatter fields.
- **PUT and DELETE skip the workspace Skills gate.** Affects: Workspaces with Skills off. Evidence: apps/web/app/api/skills/[name]/route.ts:50-105. Work needed: Apply the same gate or record why not.
- **Brief says mobile instruction editor and personal skills are missing or partial; mobile has create, edit, delete and template.** Affects: Documentation. Evidence: apps/mobile/src/features/skills/NewSkillSheet.tsx:55-67; apps/mobile/src/features/skills/SkillDetailScreen.tsx:378-398. Work needed: Correct the brief.
- **The brief lists organisation sharing as missing, but a share-with-workspace route and button exist for admins.** Affects: Documentation. Evidence: apps/web/app/api/skills/[name]/workspace/route.ts:17-60; apps/web/features/skills/components/SkillEditorDialog.tsx:266. Work needed: Correct the brief; that item belongs to another feature.
- **VS Code and the CLI create project skills too, which need a one-time allow before they load; a personal CLI skill needs hand editing or a model turn.** Affects: CLI, VS Code. Evidence: apps/cli/src/skills.rs:285-560; apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:44-52. Work needed: None required; document the allow step.
- **Permanent delete has no recovery window.** Affects: All personal skill owners. Evidence: apps/web/app/api/skills/[name]/route.ts:95; packages/ui/ui/src/directory/constants.ts:360. Work needed: Decide whether a trash step is needed (the confirm names the loss).
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- api:POST /api/skills
- api:PUT /api/skills/{name}
- api:DELETE /api/skills/{name}
- table:user_skills
- table:user_skill_files
- F053-01
- F053-02
- F053-06
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-authorization-and-workspaces

## Unknown

- Whether migrations 0157, 0318 and 0357 are applied in each environment (0157 header says 'NOT YET APPLIED').
- Whether any limit on the number of personal skills per account exists (none found).
- How the CLI personal folder relates to AGIWORKFORCE_HOME in the CLI config (VS Code reads that variable; CLI config_dir not traced).
- Whether Chrome's capability row allows skills.
