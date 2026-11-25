---
id: "AREA-053"
type: "area"
title: "Skill creation and management"
features: ["F053-01", "F053-02", "F053-03", "F053-04", "F053-05", "F053-06", "F053-07", "F053-08", "F053-09", "F053-10", "F053-11", "F053-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 53. Skill creation and management

A skill is a short instruction file (SKILL.md, with optional reference files and scripts) that teaches the assistant how to do one kind of task. This area lets a person find skills in a catalogue, turn them on or off, write their own, import or export them, and use them in chat by picking one or by letting the assistant match one to the request. It matters because the same skill works the same way across the apps, so a person's own method for a task can be reused without retyping it.

**Who uses it.** Every signed-in user for browsing, installing and using skills on web, desktop and mobile (Cloud mode). Writing or importing personal skills is gated by a server environment flag and a workspace feature gate, so it is not open to every account. CLI and VS Code users work with skill folders on their own machine (CLI global, account and project folders; VS Code personal and project folders). No code path for organisation admins or organisation-wide skills was found (brief items 05 and 25 are missing). Developers use the SKILL.md format and the skills packages; no separate developer-only surface was found.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F053-01](F053-01-skill-directory-and-installed-list.md) | Skill directory and installed list | built | built | built | partly | partly | partly |
| [F053-02](F053-02-skill-detail-page-and-requirements.md) | Skill detail page and requirements | built | built | partly | partly | partly | no |
| [F053-03](F053-03-using-a-skill-in-chat-manual-and-automatic.md) | Using a skill in chat (manual and automatic) | built | built | built | built | partly | partly |
| [F053-04](F053-04-install-turn-on-and-off.md) | Install, turn on and off | built | built | built | built | built | no |
| [F053-05](F053-05-personal-skills-create-edit-delete.md) | Personal skills (create, edit, delete) | built | built | partly | built | partly | no |
| [F053-06](F053-06-upload-import-and-export.md) | Upload, import and export | built | built | partly | partly | partly | no |
| [F053-07](F053-07-bundled-files-and-scripts.md) | Bundled files and scripts | built | built | partly | built | built | no |
| [F053-08](F053-08-project-and-organisation-scope.md) | Project and organisation scope | partly | partly | no | partly | partly | no |
| [F053-09](F053-09-input-and-output-declarations-and-surfaces.md) | Input and output declarations and surfaces | no | no | no | no | no | no |
| [F053-10](F053-10-skill-composition-and-versions.md) | Skill composition and versions | partly | partly | partly | no | no | no |
| [F053-11](F053-11-recorded-skills-demonstration-and-voice-teaching.md) | Recorded skills (demonstration and voice teaching) | partly | partly | no | partly | no | no |
| [F053-12](F053-12-testing-results-and-measurement.md) | Testing, results and measurement | partly | no | no | no | no | no |

Requirement items for this area: [10-requirements/capabilities/053-skill-creation-and-management.md](../../10-requirements/capabilities/053-skill-creation-and-management.md).

## How this area works in the code

1. **1. Browse the catalogue.** The screen asks the server for the skill list. The server returns the account's installed skills, or the whole catalogue when asked, merged with personal skills and plugin skills, each with origin, lifecycle, install count and required tools or connections. The list is checked against per-account install overrides. (`apps/web/app/api/skills/route.ts:141-204`, `apps/web/features/directory/services/skills-directory.ts:269-282`, `apps/web/lib/services/skill-install-service.ts:44-49 and 123-130`)
2. **2. Install or turn off a skill.** Install and uninstall send a request with a CSRF token. The server writes a per-account override under the skills.installs key of the account's settings row inside a database transaction that locks the row. Authored skills are deleted rather than switched off. (`apps/web/features/directory/hooks/useDirectoryAdapter.ts:1404-1407`, `apps/web/features/directory/services/skills-directory.ts:284-313`, `apps/web/app/api/skills/installs/route.ts:73-88`, `apps/web/lib/services/skill-install-service.ts:89-121`)
3. **3. Open the detail view.** The screen loads the skill body and file list, then shows provenance, version, required tools and connections, and a file viewer. Files that cannot be shown offer a download. (`apps/web/features/directory/services/skills-directory.ts:325-350`, `packages/ui/ui/src/directory/SkillDetailView.tsx:64-132`, `packages/ui/ui/src/directory/SkillFileViewer.tsx:175-185`)
4. **4. Create or upload a personal skill.** A JSON body or a multipart upload (zip or Markdown) is read. Zip files are read for one skill folder; the content is checked by an upload scan and parsed for a valid draft. The name is checked against built-in names. The skill and its files are saved and an audit event is written. (`apps/web/app/api/skills/route.ts:206-259`, `apps/web/app/api/skills/route.ts:84-139`, `apps/web/lib/services/user-skill-service.ts:107-148`, `apps/web/lib/services/user-skill-service.ts:261-300`, `apps/web/lib/services/user-skill-service.ts:246`)
5. **5. Pick a skill for a message.** The chat request may name one skill. The server validates the name, checks it exists in the catalog, adds the skill's instructions and the skill tool to the request, and reports a missing requirement when a tool or connection is not offered. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:824-840`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1047-1070`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073-1100`)
6. **6. Offer skills automatically.** When no skill is named, the server picks skills whose descriptions fit the prompt, up to a fixed character budget, and offers them through the skill tool. This is skipped for the VS Code, CLI and API surfaces. Install overrides are read first; if that read fails, skills are withheld. (`apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts:10-32`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073-1088`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3738-3744`)
7. **7. Load a skill during the model turn.** When the model calls the skill tool with a load or read action, the tool returns the skill text, a file inventory and a note. Skills that ship scripts are copied into the code sandbox when code runs for the first time in the turn. (`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2241-2265`, `packages/tools/skills/src/tool.ts:4-5`, `apps/web/lib/e2b/skill-staging.ts:94-108`)
8. **8. Store what was saved.** Personal skills live in a skills table with one row per skill and a child table for its files. Install overrides live in the settings row. Desktop and CLI read skill folders on disk. (`apps/web/db/neon/0157_user_skills.sql:19`, `apps/web/db/neon/0318_user_skill_files.sql:24`, `apps/cli/src/skills.rs:94-115`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/skills/route.ts` | Server entry for listing skills (GET) and creating a personal skill (POST, JSON or upload). |
| `apps/web/lib/services/user-skill-service.ts` | Stores, lists and deletes personal skills and their files, and runs the upload scan. |
| `apps/web/lib/services/skill-install-service.ts` | Per-account install and turn-off overrides kept in the settings row; filters the catalogue. |
| `apps/web/features/directory/services/skills-directory.ts` | Browser-side calls for the catalogue, install, uninstall, delete and file reads; builds the directory entries and groups. |
| `packages/ui/ui/src/directory/SkillDetailView.tsx` | Shared detail view: provenance, version, required tools and connections, file viewer, enable switch and delete. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates a chosen skill name, adds the skill tool and catalogue, and makes the automatic offer. |
| `apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts` | Chooses which skills are offered automatically, within a character budget. |
| `packages/tools/skills/src/tool.ts` | Shared skill tool definition, catalogue text, requirement checks and output limits. |
| `apps/mobile/src/features/skills/SkillsScreen.tsx` | Mobile Skills screen: search, install and uninstall, import, empty and error states. |
| `apps/cli/src/skills.rs` | CLI skill discovery from global, account, plugin and project folders; disable list; frontmatter parsing. |
| `apps/extension-vscode/src/features/surfaces/skillAuthoring.ts` | VS Code New skill command: chooses Personal or This project and writes the template. |
| `apps/web/lib/e2b/skill-staging.ts` | Copies a skill's scripts into the code sandbox for a turn. |

## What is stored

- Personal skill: name, description, body, timestamps, owner id: public.user_skills table (apps/web/db/neon/0157_user_skills.sql:19)
- Personal skill files (path and content, size-limited): public.user_skill_files table (apps/web/db/neon/0318_user_skill_files.sql:24)
- Per-account install or turn-off state for each skill, under settings key skills.installs: public.user_settings.settings JSON (apps/web/lib/services/skill-install-service.ts:10-11, 89-121)
- Audit events for skill install and create: Workspace audit log via recordWorkspaceAuditEvent (apps/web/app/api/skills/route.ts:243-251; apps/web/app/api/skills/installs/route.ts:84-89)
- CLI global disabled-skill list: Config directory file disabled-skills.json (apps/cli/src/skills.rs:94-115)
- CLI project disabled-skill list: .agiworkforce/disabled-skills.json in the project root (apps/cli/src/skills.rs:109-115)
- CLI skill files: ~/.agiworkforce/skills, ~/.agiworkforce/account-skills and the project .agiworkforce/skills folder (apps/cli/src/skills.rs:1-12, 169-181)
- VS Code new skill files: Personal skills root, or the open folder's .agiworkforce/skills (apps/extension-vscode/src/features/surfaces/skillAuthoring.ts:40-50)
- Skill files copied into the code sandbox for one turn: Code sandbox, not kept after the turn (apps/web/lib/e2b/skill-staging.ts:94-108)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **AGI_USER_SKILL_AUTHORING environment value (off only when set to 0)**: When off, creating skills returns not found and the list says canAuthorSkills is false, so the New skill and upload controls are hidden. (apps/web/lib/services/user-skill-authoring.ts:5-18; read in apps/web/app/api/skills/route.ts:160 and :212; blank in apps/web/.env.example:408)
- **Workspace feature gate 'skills'**: Blocks skill creation for a workspace that does not allow it and returns a gate response. (apps/web/app/api/skills/route.ts:215-221)
- **Workspace plugin access**: When not allowed, plugin and directory skills are left out of the list and the chat request. (apps/web/app/api/skills/route.ts:146 and :162; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3746)
- **Mobile FEATURES.skills flag**: Turns the Skills screen on; it also needs Cloud mode and a signed-in user. (apps/mobile/lib/v1FeatureFlags.ts:20; apps/mobile/src/features/skills/SkillsScreen.tsx:640)
- **CLI canUseSkills capability**: When refused, no skills are discovered. (apps/cli/src/tier_cache.rs:285; apps/cli/src/skills.rs:145-148; apps/cli/src/cloud/mod.rs:656)
- **CLI project trust and project consent**: Project skills and project disabled-list load only for a trusted project and after consent. (apps/cli/src/skills.rs:109-112 and discover_skills_all (about apps/cli/src/skills.rs:174-178))
- **Frontmatter draft flag**: A skill marked draft is listed as draft and cannot be installed. (apps/web/app/api/skills/route.ts:179-180; apps/web/features/directory/services/skills-directory.ts:146-156)
- **Frontmatter allow_implicit**: Parsed by the CLI. The effect on automatic matching was not traced. (apps/cli/src/skills.rs:965-971)
- **Size and count limits**: Limits on the number of listed requirements (20), always-listed character budget (8000), companion file count and size, skill output size (100000 bytes) and file inventory (50). (apps/web/app/api/skills/route.ts:72; apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts:10; apps/web/features/plugins/server/directory/constants (imported at apps/web/lib/services/user-skill-service.ts:17-18); packages/tools/skills/src/tool.ts:4-5)
- **Rate limit names**: Limit skill list reads and skill creation. (apps/web/app/api/skills/route.ts:142 ('skills-catalog-read') and :210 ('chat-conversation'))

## Shared between apps

Web, desktop and the chat API share the server routes and services in apps/web (skills route, install service, user skill service, request processor). Desktop uses the same web directory code and the shared UI in packages/ui/ui/src/directory (SkillDetailView, SkillFileViewer). The shared skill tool, catalogue text, requirement checks and skill type are in packages/tools/skills/src/tool.ts and the @agiworkforce/skills package. Mobile has its own service and screens in apps/mobile/src/features/skills. The CLI is separate Rust code in apps/cli/src/skills.rs; its integrity hash is said to match packages/tools/skills/src/integrity.ts (comment at apps/cli/src/skills.rs:829-836). VS Code has its own surface files under apps/extension-vscode/src/features/surfaces. Chrome: no Chrome app folder was found under apps/.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Skill creation reuses the chat conversation rate limit, not a skills limit. (apps/web/app/api/skills/route.ts:210)
- Brief says mobile skill import is missing, but the mobile screen has an Import button with a document picker and an import error path. (apps/mobile/src/features/skills/SkillsScreen.tsx:716-735)
- Brief says web recorded skills are missing, but a web recorder exists and is wired into the plus menu. It needs a desktop host bridge and shows only on macOS. (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:76-80, 149-155; apps/web/features/skill-recorder/components/SkillRecorder.tsx:112)
- Brief says mobile enable/disable is missing, but the mobile screen has Install and Uninstall per skill. (apps/mobile/src/features/skills/SkillsScreen.tsx:365-370, 684-701)
- Brief says mobile personal skills are partial; the create and update sheet exists. (apps/mobile/src/features/skills/NewSkillSheet.tsx:10, 61)
- Detail delete text says deletion cannot be recovered; this code does not show the confirmation step that AGENTS.md section 9 requires. The confirm call was not found in the file opened. (packages/ui/ui/src/directory/SkillDetailView.tsx:44-45)
- Automatic offer is skipped for VS Code and CLI on the server, but the brief lists automatic matching as done for both. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073; apps/web/app/api/llm/v1/chat/completions/lib/skill-offer.ts)

## Not established

- Chrome extension: no Chrome app folder was found under apps/. The brief's Chrome statuses (done for 18, missing for others) could not be checked.
- Whether the detail-view delete button asks for confirmation before deleting (the code that calls it was not opened).
- The mobile import helper importSkillFile was not opened, so the mobile import path is not fully traced.
- How allow_implicit (CLI frontmatter) affects automatic matching.
- Mobile detail route apps/mobile/app/(app)/skills/[name] was not opened.
- Whether the desktop app uses the web code path for skills or has its own (the desktop shell files were not opened).
- Organisation skills, versions, composition, test, cost and history features: no code found in the paths the brief lists; not searched exhaustively across the repo.
- Line numbers for apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3746 and apps/cli/src/skills.rs:109-112 and 174-178 were read from partial output windows and may be off by a few lines.
- Plan gates by subscription tier for skills were not found in the code paths opened (only workspace gates and the environment flag).
- This was a read-only pass. No tests, builds or servers were run, so nothing here was checked on localhost or on any single surface. The request to test only one surface at a time does not apply to this read-only task.
