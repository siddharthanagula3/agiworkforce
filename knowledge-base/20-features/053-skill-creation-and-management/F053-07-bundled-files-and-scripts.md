---
id: "F053-07"
type: "feature"
title: "Bundled files and scripts"
aliases: ["Bundled files and scripts", "Reference-file bundle (S53.10)", "Script bundle (S53.11)", "Skill companion files", "Skill package files (references/, scripts/, assets/)", "skill_sandbox note", "stageSkillScripts"]
area: "53 Skill creation and management"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S53.10", "S53.11"]
depends_on: ["SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "SYS-files-artifacts-and-storage", "SYS-execution-boundaries", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "F053-08", "surface:web", "surface:desktop", "surface:cli"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F053-07 Bundled files and scripts

A skill can ship extra text files (references, templates, scripts) beside SKILL.md. On the web, desktop (hosted web), mobile and Chrome paths, the cloud chat loop lists them, reads them on request and copies them into a code sandbox so scripts can run. In the CLI and VS Code the files stay in the skill folder on disk.

Area: [53. Skill creation and management](README.md). Requirement items: [S53.10](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5310), [S53.11](../../10-requirements/capabilities/053-skill-creation-and-management.md#s5311).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Keeps a skill's whole folder, not just SKILL.md. The model sees a file list when it loads a skill, can read any listed text file, and can run bundled scripts: in the cloud code sandbox on web/desktop/mobile, or through the model's own file and shell tools on the CLI and VS Code.

**Why it exists.** A skill that is only instructions loses the templates, references and scripts it needs. The migration that stores skill files says Claude and ChatGPT keep a skill's folder whole and run its scripts in a code sandbox (apps/web/db/neon/0318_user_skill_files.sql:1-12).

**Who uses it.** Skill authors who upload a zip or folder, and anyone who installs a skill from the catalog, a plugin repository, a workspace, or the CLI skills folder.

**Problems it solves**

- A skill folder uploaded as a zip no longer loses its references and scripts (apps/web/db/neon/0318_user_skill_files.sql:5-9).
- The model reads long reference material only when the skill points at it, so the base prompt stays small (packages/tools/skills/src/tool.ts:23-27 description of action=read).
- Scripts can run without the user installing anything, inside the cloud sandbox (apps/web/lib/e2b/skill-staging.ts:80-96).

**Use cases**

- Upload a zip of a skill folder with a references/ folder and a scripts/ folder; ask a question; the model loads the skill, reads a reference and runs a script.
- Install a plugin from a repository whose skills carry templates; the model reads them on demand.
- CLI: put scripts/ next to SKILL.md in ~/.agiworkforce/skills/<name>; the loaded skill tells the model where the folder is.
- Turn code execution off; load a skill with scripts; the model is told the scripts cannot run here.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): Settings, Skills directory, button 'Upload a skill' (accepts .zip, .skill or SKILL.md) (packages/ui/ui/src/directory/constants.ts:408-415); the skill detail view shows a file tree and a file viewer with a 'Download file' button for non-text files (packages/ui/ui/src/directory/SkillFileViewer.tsx:180-195, packages/ui/ui/src/directory/constants.ts:251).
- Mobile: skill detail screen, section 'Files' with the text 'The instructions and the reference files and scripts bundled with them.'; tapping a text file previews it (apps/mobile/src/features/skills/SkillDetailScreen.tsx:317-360).
- CLI: skill folder under ~/.agiworkforce/skills/<name>/ or <project>/.agiworkforce/skills/<name>/; commands '/skills import <path to SKILL.md or its folder>' and '/skills remove <name>' (apps/cli/src/tui/tui_app.rs:6169-6186).
- VS Code: command-palette skill manager 'Skills' with items 'Create a skill' and 'Install a skill' ('Copy a skill folder, the one that holds SKILL.md, into your skills') (apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220-247).
- Chrome: no screen; the side panel only lets the person pick a skill by name (apps/extension/src/features/cloud-bridge/skillsClient.ts:30-48).

**Before you start**

- Web, Desktop, Mobile, Chrome: signed in; skill authoring is on unless the server switch AGI_USER_SKILL_AUTHORING is '0' (apps/web/lib/services/user-skill-authoring.ts:6-13); the workspace policy must allow the 'skills' feature (apps/web/app/api/skills/route.ts:215-221).
- Running scripts in the cloud: code execution must be offered in that chat turn (apps/web/lib/e2b/skill-staging.ts:87).
- CLI and VS Code: a skill folder on disk; project skills also need the person's consent (see F053-08).

**Screens and controls**

- Upload a skill dialog (UploadFileDialog) with a trust notice (packages/ui/ui/src/directory/DirectoryPanel.tsx:1060-1076).
- Skill detail: file tree, rendered/raw toggle, copy, 'Download file' (packages/ui/ui/src/directory/SkillFileViewer.tsx:163-215).
- Upload result lines: '/<skill name>' and, when files were left out, 'Left out a file that is not text: <files>. Skills can bundle text files such as references and scripts.' (apps/web/features/directory/constants.ts:311-326).
- Mobile 'Files' list, with 'no preview' for non-text files (apps/mobile/src/features/skills/SkillDetailScreen.tsx:322-335).

**Journey**

1. 1. Author zips the skill folder as <skill-name>/SKILL.md plus other files and chooses 'Upload a skill' (apps/web/app/api/skills/skill-upload-rules.ts:5-18).
2. 2. The server checks the zip, reads text companions (binary or empty ones are left out and named), scans every file for unsafe content, and stores a personal skill plus one row per file (apps/web/app/api/skills/route.ts:84-139, apps/web/lib/services/user-skill-service.ts:261-293).
3. 3. In chat the skill is picked by the person or offered by relevance; the model calls the skill tool with action=load (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1047-1102).
4. 4. The result lists up to 50 files with sizes; the model calls action=read with an exact path for the ones it needs (packages/tools/skills/src/tool.ts:252-265, 454-486).
5. 5. If any listed file looks like a script, the loaded result gets a skill_sandbox note: either 'code execution is off ... turning on code execution lets the skill run its scripts' or the sandbox folder where files will be copied (apps/web/lib/e2b/skill-staging.ts:26-27, 72-96).
6. 6. The first time the model runs code in that turn the files are copied to <workspace>/.skills/<skill name>/ and the model runs a script from there (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4900-4930).

**What the person sees and gets**

- Upload success title 'Skill added' (apps/web/features/directory/constants.ts:306).
- Read failures shown to the model: 'No file at <path> in this skill. Load the skill again for its file list.', '<path> is not text and cannot be read.', '<path> is too large to read.' (packages/tools/skills/src/tool.ts:445-452).
- Result too big: the model gets 'Skill output exceeded the safe response limit and was not returned.' (packages/tools/skills/src/tool.ts:238-251).
- Skipped files named in the sandbox note: 'These files were not copied because they are not text or are too large: ...' (apps/web/lib/e2b/skill-staging.ts:72-78).

**Settings**

- Server switch AGI_USER_SKILL_AUTHORING (name only; '0' turns authoring off) (apps/web/lib/services/user-skill-authoring.ts:6).
- Per-chat code execution setting (Run code); on mobile it is switched on automatically for a skill that requires the code-run tool when the plan allows it (apps/mobile/src/features/skills/skillRequirements.ts:21-39).
- Enable/disable of a skill: web directory toggle, CLI '/skills-toggle' (apps/cli/src/tui/tui_app.rs:4520).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud skill tool with list, load and read actions, file inventory capped at 50 entries and default output cap of 100000 bytes (packages/tools/skills/src/tool.ts:4-5, 454-486).
- Reading files from five stores: built-in catalog (apps/web/lib/services/skill-catalog-service.ts:473-484), the person's personal skill files (apps/web/lib/services/user-skill-service.ts:334-392), stored plugin entries, workspace plugins, community submissions and GitHub repositories (apps/web/features/plugins/server/directory/skill-companions.ts:99-219).
- Per-file limits: at most 200 listed files and 512 KiB per file (apps/web/features/plugins/server/directory/constants.ts:137-138); non-UTF-8 or NUL-containing files are 'binary' (apps/web/features/plugins/server/directory/skill-companions.ts:55-63).
- Zip upload keeps text companions, names the others in omittedFiles, and refuses a zip with more than 200 files (apps/web/features/plugins/server/directory/archive.ts:300-338, 651-673; apps/web/app/api/skills/route.ts:222-258).
- Sandbox staging: files recognised as scripts (a scripts/ folder or py, js, mjs, cjs, ts, sh, bash, rb, pl, r) trigger copying of up to 100 files and 4 MiB of text to the sandbox; unsafe paths, binary and oversize files are skipped and named (apps/web/lib/e2b/skill-staging.ts:8-11, 38-78).
- Copy is deferred until the sandbox exists and is flushed right after attachments are staged (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4900-4930).
- If code execution is not offered the model gets an explicit note instead of a failed run (apps/web/lib/e2b/skill-staging.ts:26-27, 87).
- Uploaded files are scanned; a blocking finding refuses the save, a review finding needs an acknowledgement hash (apps/web/lib/services/user-skill-service.ts:122-150).
- CLI: a skill folder is hashed as a whole (SKILL.md plus scripts/references/assets), and the loaded result tells the model the package directory so relative paths resolve there (apps/cli/src/skills.rs:884-908, 1202-1232).
- CLI import copies a skill folder (max 500 files, skipping links and dotfiles) into the global skills folder (apps/cli/src/skills.rs:1496-1588).
- CLI signed in: account skills are synced to disk with up to 64 files of at most 1,000,000 bytes each (apps/cli/src/cloud/skills.rs:14-15, 130-165).
- VS Code lists, enables, installs from a folder and removes skills by calling the CLI runtime (apps/extension-vscode/src/features/surfaces/cliCapabilities.ts:10-14; apps/cli/src/app_server/surfaces.rs:996-1005).
- Mobile detail screen lists files and previews text ones through the same /api/skills/<name>/files routes (apps/mobile/src/features/skills/service.ts:152-185).

**Incomplete**

- CLI has no read action: invoke_skill_tool accepts only list and load ('Unsupported skill action ... Expected list or load') (apps/cli/src/skills.rs:1459-1463). Files are read by the model's own tools [inferred].
- Files cannot be added, replaced or removed after a personal skill is created: the update statement changes only name, description and body (apps/web/lib/services/user-skill-service.ts:295-318).
- The sandbox note says files 'are copied' before the copy happens, and a failed copy is only logged ('some skill files could not be copied into the sandbox') (apps/web/lib/e2b/skill-staging.ts:72-78, 98-118).
- A file between roughly 100 KB and 512 KiB can be stored and listed but a read returns the 'exceeded the safe response limit' error because the output cap is 100000 bytes (apps/web/features/plugins/server/directory/constants.ts:138; packages/tools/skills/src/tool.ts:238-251) [inferred from both limits].
- The inventory shows 50 files while up to 200 are readable; files beyond 50 appear only as '<omitted count>' with no names (packages/tools/skills/src/tool.ts:252-265).

**Present but disconnected or switched off**

- Skill authoring and personal-skill file storage switch off with AGI_USER_SKILL_AUTHORING=0; list, find and create then return nothing or 404 (apps/web/lib/services/user-skill-service.ts:160-176).
- The implicit skill offer is skipped for the vscode, cli and api surfaces of the cloud chat route (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1073-1090).
- apps/desktop/src (retained Tauri code) has SkillsPluginsSettings.tsx; whether it handles bundled files was not checked (apps/desktop/src/features/settings/SkillsPluginsSettings.tsx).

**Not available**

- Mobile: no mobile-side reading or sandbox of bundled files; the brief marks S53.10 and S53.11 missing, and the code agrees that all file work is server-side (brief: S53.10, S53.11). Mobile only shows the file list and turns on code execution for skills that require it.
- Chrome: no file list, reader or sandbox control (apps/extension/src/features/cloud-bridge/skillsClient.ts).
- Local mode on every app: the bundle reader and sandbox live in the cloud chat route; no on-device sandbox for skill scripts was found [inferred from absence in apps/mobile and apps/extension].

## 4. Required behaviour

**Established requirements**

- A skill can bundle reference files that the model reads when the skill runs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.10)
- A skill can bundle scripts that run when the skill is used. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S53.11)
- Reference files are listed (up to 50 entries) and read on request; a skill tool result is capped at 100000 bytes by default. (source: packages/tools/skills/src/tool.ts:4-5)
- A skill with scripts is copied into the sandbox when code first runs in a turn; if code execution is off the model is told. (source: apps/web/lib/e2b/skill-staging.ts:26-27, 72-96)
- Files that are not text or are too large are skipped and named in the note. (source: apps/web/lib/e2b/skill-staging.ts:72-78)
- Claude and ChatGPT keep a skill folder whole (SKILL.md plus references, assets and scripts), read while the skill runs and executed in the code sandbox; the product follows them. (source: apps/web/db/neon/0318_user_skill_files.sql:5-9; docs/product/competitive-guidance.md:34)

**Acceptance criteria**

1. Upload a zip <name>/SKILL.md + references/a.md + scripts/run.py: the skill is created and its detail view lists both files.
2. Upload a zip that also holds a PNG: the result says a file that is not text was left out and names it; the skill still works.
3. In a chat with code execution on, load the skill and ask for the script to run: the result carries a skill_sandbox note with the .skills/<name> path, and a run from that path finds run.py.
4. In a chat with code execution off, load the same skill: the result carries the note that scripts cannot run and the model tells the person so.
5. A read of a path not in the list returns the 'No file at ... Load the skill again' error; a read of a binary file returns 'is not text and cannot be read'.
6. A skill with 60 files shows 50 entries and an 'omitted count=10' line.
7. CLI: a skill with scripts/ in its folder shows the package directory in the loaded result, and changing a script changes the tree hash.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A staged-copy failure should be reported to the model instead of claiming the copy happened [inferred from skill-staging.ts:72-78 vs 98-118].
- The read-size limit and the output cap should agree so a listed file is always readable [inferred].
- Mobile and Chrome should be able to show bundle contents and script needs the same way the web does [inferred from brief status 'missing'].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Let a person add, replace and remove files on an existing personal skill.
- [proposed] Report files skipped in staging, and failed writes, to the model in the same note.
- [proposed] Give the CLI skill tool a read action with package-contained paths, as the cloud tool has.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | Skill tool (definition, list/load/read, fencing, caps) | `packages/tools/skills/src/tool.ts` | Defines the skill tool, the 50-entry inventory, the 100000-byte output cap, and file reads fenced as untrusted. |
| service | stageSkillScripts / writeSandboxSeedFiles | `apps/web/lib/e2b/skill-staging.ts` | Detects scripts, builds the sandbox note, collects up to 100 files and 4 MiB, writes them into the sandbox. |
| service | Cloud tool loop (skill branch, seed queue, sandbox resolution) | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Runs the skill tool, finds the skill with its file access, queues files and flushes them when the sandbox first opens. |
| service | Skill selection and implicit offer | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the skill tool, the catalog prompt and the forced tool choice for an explicitly selected skill; skips implicit offers on vscode, cli and api. |
| service | Companion file access (stored, workspace, community, repository) | `apps/web/features/plugins/server/directory/skill-companions.ts` | Lists and reads a directory skill's files with the 200-file and 512 KiB limits. |
| config | SKILL_COMPANION_MAX_FILES / SKILL_COMPANION_MAX_BYTES | `apps/web/features/plugins/server/directory/constants.ts` | The 200-file and 512 KiB per-file limits. |
| service | Installed directory skills with files | `apps/web/features/plugins/server/directory/installed-skills.ts` | Finds an installed plugin skill and picks the right file access for its source. |
| service | User skill service (files in the database) | `apps/web/lib/services/user-skill-service.ts` | Creates personal skills with files in one transaction, scans uploads, lists and reads files. |
| service | Zip reader | `apps/web/features/plugins/server/directory/archive.ts` | Reads a single-skill zip, collects text companions, names omitted files, refuses more than 200 files. |
| endpoint | api:POST /api/skills | `apps/web/app/api/skills/route.ts` | Creates a personal skill from JSON or from an uploaded zip or SKILL.md. |
| endpoint | api:GET /api/skills/{name}/files | `apps/web/app/api/skills/[name]/files/route.ts` | Lists a skill's files with content hashes. |
| endpoint | api:GET /api/skills/{name}/files/{path} | `apps/web/app/api/skills/[name]/files/[...path]/route.ts` | Previews a text file or downloads a file (?download=1). |
| table | table:user_skill_files | `apps/web/db/neon/0318_user_skill_files.sql` | One row per text file of a personal skill, with path rule, hash, byte size and row-level security. |
| component | Skill detail view and file viewer | `packages/ui/ui/src/directory/SkillFileViewer.tsx` | File tree, viewer and 'Download file' button used by web and desktop. |
| hook | Directory adapter upload | `apps/web/features/directory/hooks/useDirectoryAdapter.ts` | Posts the uploaded skill file and shows the 'Left out a file that is not text' line. |
| screen | Mobile skill detail | `apps/mobile/src/features/skills/SkillDetailScreen.tsx` | Lists and previews bundled files; offers 'Use as a template'. |
| service | Mobile skill requirements | `apps/mobile/src/features/skills/skillRequirements.ts` | Turns on code execution for a skill that requires the code-run tool when the plan allows. |
| service | CLI skills module | `apps/cli/src/skills.rs` | Loads skill folders, hashes the package, adds the package directory to the loaded result, imports a folder. |
| service | CLI account skills sync | `apps/cli/src/cloud/skills.rs` | Downloads account skills with up to 64 files into the account-skills folder. |
| service | VS Code skill manager | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | Quick pick to create, install from a folder, enable, remove skills through the CLI runtime. |
| service | CLI app-server skill surface | `apps/cli/src/app_server/surfaces.rs` | list_skills, set_skill_enabled, set_skill_consent, install_skill for the VS Code extension. |
| service | Chrome skills client | `apps/extension/src/features/cloud-bridge/skillsClient.ts` | Fetches the account's skill names and descriptions for the side panel picker; no files. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person uploads a zip; the browser posts multipart form data to POST /api/skills. | device | apps/web/features/directory/hooks/useDirectoryAdapter.ts:1743-1766 |
| Server checks CSRF, rate limit, workspace policy for the 'skills' feature, scans the upload for unsafe content, reads the zip and parses SKILL.md. | our servers | apps/web/app/api/skills/route.ts:84-139, 206-221 |
| Server stores the skill row and one file row per text companion in one database transaction; writes an audit event 'skill_installed'. | our servers | apps/web/lib/services/user-skill-service.ts:261-293; apps/web/app/api/skills/route.ts:240-251 |
| In a chat turn the cloud route adds the skill tool; the model asks to load the skill; the server returns the instructions plus the file inventory. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2409-2480 |
| The model reads files with action=read; the server reads from the database, a stored plugin entry, or a repository over HTTPS (raw file fetch with a timeout). | our servers | apps/web/features/plugins/server/directory/skill-companions.ts:135-197 |
| Repository-hosted skill files are listed from a GitHub tree and fetched from the repository host. | outside service | apps/web/features/plugins/server/directory/skill-companions.ts:135-197 |
| Script files are queued; when the model first runs code the files are written into the code sandbox under .skills/<name>; scripts run there. | outside service | apps/web/lib/e2b/skill-staging.ts:98-118; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4911-4930 (sandbox obtained from getE2BExecutor in apps/web/lib/e2b/runtime.ts:778) |
| CLI: the skill folder is read from disk, hashed, and its path is given to the model; the model uses its own file and shell tools (approvals apply) to read and run files. | device | apps/cli/src/skills.rs:1202-1232 [the use of file and shell tools is inferred] |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Personal skill files (path, text, hash, size) | table:user_skill_files, one row per file, row-level security by owner | Server-side only; the CLI downloads them when signed in (apps/cli/src/cloud/skills.rs:130-165). | Rows cascade-delete with the skill and with the account (apps/web/db/neon/0318_user_skill_files.sql:10-13). Deleting a skill is a hard delete (apps/web/lib/services/user-skill-service.ts:321-332). |
| Sandbox copy of skill files | Code sandbox workspace folder .skills/<skill name> | no | Lives with the sandbox session; the note says load the skill again in a later turn (apps/web/lib/e2b/skill-staging.ts:72-78). Sandbox lifetime rules: unknown. |
| CLI skill folders and account-skills copy | store:~/.agiworkforce/skills and store:~/.agiworkforce/account-skills | account-skills is overwritten from the account on sync; folders the account no longer lists are removed (apps/cli/src/cloud/skills.rs:183-215) | User skills stay until removed with '/skills remove'. |

**Models and providers.** The skill tool is offered only to models that can call tools; the implicit offer checks toolsCapable and the sandbox needs a model with code execution capability and permission (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1082-1090, 5925-5937). Any model family that meets those checks can use it; no provider-specific code was found in the skill files path. In the CLI the instructions go to whichever model the person configured.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web, Desktop, Mobile, Chrome: signed in (the routes use user-scoped database access: apps/web/app/api/skills/route.ts:141-146). CLI and VS Code: skills on disk need no account; account skills sync only when signed in (apps/cli/src/skills.rs:222-232). |
| Permissions | Workspace policy for the 'skills' feature can refuse creating a skill (apps/web/app/api/skills/route.ts:215-221). Workspace plugin policy can hide plugin and directory skills (apps/web/app/api/skills/route.ts:146-160). Skill-file content is always treated as untrusted reference guidance (packages/tools/skills/src/tool.ts:267-278). |
| Subscription | The skills capability is true for the web, desktop and mobile rows (packages/contracts/types/src/capabilities.ts:55, 88, 121). The CLI hides skills when the cached capability document denies canUseSkills, for example 'on your plan' (apps/cli/src/skills.rs:144-148; apps/cli/src/tier_cache.rs:376-392). Plan-specific rules for bundled files: none found in the code. Running scripts needs cloud code execution, and mobile needs the tier flag codeExecutionAvailable plus canUseCloudExecution (apps/mobile/src/features/skills/skillRequirements.ts:26-36). |
| Limits and metering | 200 files and 512 KiB per file, 50 files shown, 100000-byte tool output, 100 files and 4 MiB staged (apps/web/features/plugins/server/directory/constants.ts:137-138; packages/tools/skills/src/tool.ts:4-5; apps/web/lib/e2b/skill-staging.ts:10-11). The cloud sandbox is metered as hosted code execution (apps/web/lib/e2b/compute-metering.ts, apps/web/lib/e2b/hosted-code-execution.ts); exact plan amounts: unknown. No metering was found for reading files. |
| Feature flags | AGI_USER_SKILL_AUTHORING (server switch); mobile FEATURES.skills and FEATURES.codeExecution (apps/mobile/lib/v1FeatureFlags.ts:20, 34). |
| Model compatibility | Needs a tool-calling model; running scripts needs a model with code-execution capability (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5925-5937). Whether specific models are excluded: unknown. |
| Provider restrictions | The free-trial route refuses code execution when the trial capabilities do not include it (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4383). Other provider restrictions: none found in the code. |
| Local mode | Mobile and Desktop on-device models: the bundle reader and sandbox are part of the cloud chat route, so scripts do not run on-device; whether a Local chat can use a skill's files at all: unknown. CLI: everything is on the device; no sign-in or payment is needed for skills on disk, and a missing capability cache lets skills load (apps/cli/src/tier_cache.rs:376-380). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Code execution off | The loaded skill result ends with a note that scripts cannot run and the person should turn code execution on. | apps/web/lib/e2b/skill-staging.ts:26-27, 87 |
| No sandbox queue available | Staging returns no note and copies nothing. | apps/web/lib/e2b/skill-staging.ts:88 |
| Unsafe path in the listing (absolute, '..', backslash) | The file is skipped and named in the note. | apps/web/lib/e2b/skill-staging.ts:38-41, 52-55 |
| More than 100 files or over 4 MiB | Extra files are skipped and named. | apps/web/lib/e2b/skill-staging.ts:52-66 |
| Zip with more than 200 companion files | The upload is refused with a message naming the limit. | apps/web/features/plugins/server/directory/archive.ts:325-329 |
| Repository cannot be listed | The skill loads with its instructions only; a warning is logged. | apps/web/features/plugins/server/directory/skill-companions.ts:155-162 |
| Repository file fetch fails or times out | Read returns not_found. | apps/web/features/plugins/server/directory/skill-companions.ts:187-196 |
| Skill is uninstalled or disabled | Loading it returns the same unknown-skill answer. | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.skill.test.ts:414-450 |
| Retry, cancel, timeout, offline for file reads | not handled in the code beyond the repository fetch timeout (PLUGIN_DIRECTORY_FETCH_TIMEOUT_MS); no retry found. | apps/web/features/plugins/server/directory/skill-companions.ts:187-196 |
| Accessibility | Mobile file rows have role button and labels 'Open <path>' or '<path>, no preview' and a 44 point minimum height; web accessibility of the file tree was not checked. | apps/mobile/src/features/skills/SkillDetailScreen.tsx:322-335 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/tools/skills/src/__tests__/tool.test.ts`: File inventory in a loaded skill, omitted-count line, fenced file read, refused read without path, container breakout neutralised, oversized body bounded, no read on a surface without files.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.skill.test.ts`: Skill tool loop: load after a model call, unknown name, caller skills and directory skills, uninstalled skills, agent skill selection. No test of sandbox staging was found in it.
- `apps/web/app/api/skills/__tests__/skill-upload.test.ts`: Upload of SKILL.md and zip: one SKILL.md per zip, folder naming, symlink refusal, .skill extension, frontmatter keys, size ceiling.
- `apps/web/app/api/skills/[name]/files/__tests__/skill-files.test.ts`: File list with hashes, read, binary refusal, download, path traversal.
- `apps/web/app/api/skills/[name]/files/[...path]/__tests__/route.test.ts`: File read and download route.
- `apps/web/lib/services/user-skill-service.test.ts`: Create, update, delete, list, switch-off behaviour of personal skills; file rows not seen in the test titles.
- `apps/web/features/plugins/server/directory/__tests__/installed-skills.test.ts`: Installed directory skills, cache refetch, stored-file path.
- `apps/cli/src/skills.rs`: Inline Rust tests: tree hash covers scripts and ignores dotfiles, version and hash stamping, project consent covers hidden and linked package files, folder import.
- `apps/mobile/src/features/skills/__tests__/SkillDetail.test.tsx`: Mobile detail shows the bundle, encodes nested paths, recognises previewable files, template copy, multipart import.
- `apps/mobile/src/features/skills/__tests__/skillRequirements.test.ts`: Mobile skill requirement helpers.

**Test scenarios**

- **Zip with scripts runs in sandbox**
  1. Zip a folder demo/SKILL.md, demo/references/a.md, demo/scripts/hello.py (print a line).
  2. Upload it with 'Upload a skill'.
  3. Open a new chat with code execution on; pick the skill; ask it to run the hello script.
  4. Inspect the tool results.
  - Expected: Load result shows the two files and a skill_sandbox note with .skills/demo; the run prints the line.
- **Code execution off**
  1. Same skill, new chat with code execution off.
  2. Ask it to run the script.
  - Expected: The load result carries the 'cannot run here' note; the model says code execution must be turned on.
- **Binary file left out**
  1. Add logo.png to the zip and upload.
  - Expected: Result lines name logo.png as left out; skill still saves; reading it later returns not found.
- **File over the output cap**
  1. Add a 300 KB text reference; load the skill; read it.
  - Expected: Observe whether the model gets the file or the 'exceeded the safe response limit' error; record the result (unknown today).
- **CLI package directory**
  1. Place scripts/run.sh beside SKILL.md in ~/.agiworkforce/skills/demo; start the CLI; load the skill.
  - Expected: The result shows tree_hash and the package path; editing run.sh changes tree_hash.
- **Mobile bundle view**
  1. Open a skill with files on mobile; tap a text file and a PNG.
  - Expected: Text previews; the PNG row says no preview.

**Where to look when it fails**

- Log line 'Skill companion files could not be listed; the skill loads with its instructions only' (apps/web/features/plugins/server/directory/skill-companions.ts:155).
- Log line '[e2b] some skill files could not be copied into the sandbox' with failed and written counts (apps/web/lib/e2b/skill-staging.ts:111-116).
- Tool result codes skill_file_unavailable, skill_output_too_large, skill_dependencies_unavailable (packages/tools/skills/src/tool.ts:55-63).
- Table user_skill_files; audit event type skill_installed (apps/web/app/api/skills/route.ts:240-247).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/053-skill-creation-and-management.md](../../70-qa/test-plans/web/053-skill-creation-and-management.md)
- Desktop: [70-qa/test-plans/desktop/053-skill-creation-and-management.md](../../70-qa/test-plans/desktop/053-skill-creation-and-management.md)
- Mobile: [70-qa/test-plans/mobile/053-skill-creation-and-management.md](../../70-qa/test-plans/mobile/053-skill-creation-and-management.md)
- CLI: [70-qa/test-plans/cli/053-skill-creation-and-management.md](../../70-qa/test-plans/cli/053-skill-creation-and-management.md)
- VS Code: [70-qa/test-plans/vscode/053-skill-creation-and-management.md](../../70-qa/test-plans/vscode/053-skill-creation-and-management.md)

## 10. Gaps and dependencies

- **A skill's files cannot be changed after creation.** Affects: Web, Desktop, Mobile authors. Evidence: apps/web/lib/services/user-skill-service.ts:295-318 (update touches name, description, body only). Work needed: Add file add/replace/remove to the edit flow and PUT route.
- **Sandbox note claims files were copied even if a write failed or the sandbox never opens.** Affects: Web, Desktop, Mobile users running scripts. Evidence: apps/web/lib/e2b/skill-staging.ts:72-96, 98-118. Work needed: Report per-file results back to the model or log to the person.
- **Read limit (512 KiB) is larger than the tool output cap (100000 bytes).** Affects: All cloud users with large reference files. Evidence: apps/web/features/plugins/server/directory/constants.ts:138; packages/tools/skills/src/tool.ts:4, 238-251. Work needed: Align limits or chunk reads.
- **No mobile or Chrome handling of bundled files beyond display (mobile) or none (Chrome).** Affects: Mobile, Chrome. Evidence: brief S53.10, S53.11; apps/extension/src/features/cloud-bridge/skillsClient.ts. Work needed: Decide parity target; add file list and requirement display to Chrome.
- **CLI has no sandbox and no read action; scripts run with the model's shell tool.** Affects: CLI and VS Code. Evidence: apps/cli/src/skills.rs:1459-1463. Work needed: Document or add a contained read action.
- **Mobile 'Use as a template' copies only the body, dropping bundled files.** Affects: Mobile. Evidence: apps/mobile/src/features/skills/SkillDetailScreen.tsx:105-107. Work needed: Copy files with the template or say they are not copied.
- **Whether skill files work in Local (on-device model) chats is not established.** Affects: Desktop and Mobile local inference users. Evidence: No skill tool code found outside the cloud route and CLI. Work needed: Trace the local chat paths and decide the required behaviour.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- SYS-files-artifacts-and-storage
- SYS-execution-boundaries
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- F053-08
- surface:web
- surface:desktop
- surface:cli

## Unknown

- Whether any test covers stageSkillScripts or the sandbox seed flush (no test file was found).
- Whether the mobile zip import accepts a .zip from the picker (service sends a multipart file; the picker types were not checked).
- Whether skills with files work in Local (on-device) chats on desktop and mobile.
- How long the sandbox session and its .skills folder live, and plan-level sandbox quotas.
- Whether the retained Tauri desktop skills settings handle bundled files.
- Whether the web own-key (bring your own provider key) mode uses the same cloud skill tool.
