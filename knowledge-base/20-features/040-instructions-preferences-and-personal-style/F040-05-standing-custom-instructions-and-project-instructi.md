---
id: "F040-05"
type: "feature"
title: "Standing custom instructions and project instructions"
aliases: ["Custom instructions", "Instructions for AGI", "Standing instructions", "Project instructions", "Use your profile and instructions for AGI", "Use your response style", "Host default and Workspace override (VS Code)", "CLAUDE.md tiers (CLI)", "S40.16", "S40.17", "S40.30"]
area: "40 Instructions, preferences, and personal style"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S40.16", "S40.17", "S40.30"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "mode:local", "mode:own-key", "api:GET /api/settings/preferences", "api:PUT /api/settings/preferences", "table:user_settings", "table:user_projects", "table:organization_shared_projects", "table:organization_members", "table:organization_project_access", "store:vscode-globalState", "SYS-authorization-and-workspaces", "SYS-data-model-and-migrations", "SYS-memory-projects-and-context", "SYS-chat-turn-pipeline", "F040-01", "F040-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-05 Standing custom instructions and project instructions

Standing instructions apply to every new Cloud chat and can be switched off without being deleted. A project can add its own instructions and choose whether the account profile, instructions and response style apply there. Web is complete; Mobile, CLI and VS Code have their own versions; Chrome has none.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.16](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4016), [S40.17](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4017), [S40.30](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4030).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Account instructions (up to 2000 characters) go into a <user_instructions> tag (apps/web/lib/server/user-identity.ts:196-198). A project has its own instruction text, loaded as a project block, and two switches stored on the project: uses_account_instructions and uses_account_style (apps/web/db/neon/0310_project_account_personalization.sql).

**Why it exists.** So people set preferences once, and so a client project can keep personal preferences out (migration 0310 comment).

**Who uses it.** Any person; project owners and editors; developers (CLI, VS Code files).

**Problems it solves**

- Repeating the same request in every chat.
- Personal preamble leaking into a client project.
- Need to pause instructions without losing them.

**Use cases**

- Write 'prefer analogies' once for all chats.
- Switch instructions off for a hard task and back on later with the text intact.
- Create a project 'Client X' with 'Respond in Spanish' and turn off account instructions.
- Developer keeps rules in a CLAUDE.md file in the repository.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron web view): Settings, Personalization, section 'Instructions for AGI' with switch 'Apply instructions for AGI' (PersonalizationSection.tsx:482-523). The draft's 'Settings, General' is out of date.
- Web project: project settings dialog, 'Instructions' field and 'Personalization' checkboxes 'Use your profile and instructions for AGI' and 'Use your response style' (apps/web/features/projects/components/ProjectSettingsDialog.tsx:308-380).
- Mobile account: Personalization, 'Custom Instructions' (index.tsx:566-572). Mobile project: project page 'Add instructions' sheet (apps/mobile/src/features/projects/components/ProjectInstructionsSheet.tsx:38-50,244) and project settings screen section PERSONALIZATION with switches 'Use your profile and instructions' and 'Use your response style' (apps/mobile/src/features/projects/components/ProjectSettingsScreen.tsx:197-213). The brief says per-project sharing is missing on Mobile; the code has it for Cloud projects.
- CLI: Markdown files named CLAUDE.md in three places: user-wide per trust boundary, project root, and current directory (apps/cli/src/memory.rs:11-65); listed by /output-style overview as 'Instructions' (claude_parity.rs:1383-1389).
- VS Code: Settings panel card 'Custom instructions' with 'Host default' and 'Workspace override', 8000 characters each, and a read-only 'Effective turn prelude' (apps/extension-vscode/src/features/settings/settingsWebviewContent.ts:1675-1740).
- Chrome: none found.
- Desktop Tauri internal build: Custom Instructions (10000 characters) with on/off switch, not the public Desktop (apps/desktop/src/stores/customInstructionsStore.ts).

**Before you start**

- Signed in for account instructions and Cloud projects.
- VS Code and CLI files need no account.

**Screens and controls**

- Web: text area with counter 'n / 2000', hint 'AGI keeps these in mind in every chat.' or 'Off. Your instructions are kept and not sent to the model.' (PersonalizationSection.tsx:500-522).
- Web project dialog: text area with counter, two checkboxes.
- Mobile: text field and project switches.
- VS Code: two text areas, Save buttons 'Save host instructions' and 'Save workspace override'.

**Journey**

1. Write the instructions and leave the switch on (Web autosaves).
2. Open or create a chat; the text is added automatically.
3. To pause, turn the switch off; the text stays.
4. In a project, open project settings, write project instructions and choose what account text applies.
5. Chat in the project; the project instructions are read after the account ones.

**What the person sees and gets**

- Web status 'Saved'; hint text changes with the switch.
- VS Code shows the exact prelude text sent to the local runtime.
- CLI /output-style overview lists instruction files in effect.
- No equivalent preview on Web or Mobile.

**Settings**

- Namespace 'general' keys instructions and instructionsEnabled (PersonalizationSection.tsx:293-295).
- Project columns uses_account_instructions and uses_account_style, both default true.
- VS Code keys agiWorkforce.customInstructions.host and .workspace (customInstructions.ts:16-17).
- Mobile and Web: per-chat personalization:false on temporary chats.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: switch and text saved with the profile; server reads text and enabled flag (apps/web/lib/preferences/instruction-preferences.ts:34-47; user-identity.ts:260-290).
- Server: a switched-off block is dropped, an enabled empty block is dropped, and turning web off does not promote the Mobile text (instruction-preferences.ts:50-70; user-identity.ts:292-307; test user-identity.test.ts:27-76).
- Server: project scope read with ownership or shared-organization check in the same query; a missing project means full account scope (user-identity.ts:213-247).
- Server: project instruction is the 'project' layer block found in project context and placed ahead of the account text in the final prompt order (request-processor.ts:4123-4124,6618-6625; test request-processor.project-precedence.test.ts:258-281).
- Web project dialog saves both switches (ProjectSettingsDialog.tsx:178-181,347-380; apps/web/app/api/projects/[id]/route.ts:183-188).
- Mobile Cloud projects have the two switches (ProjectSettingsScreen.tsx:111-112,197-213); Mobile Local projects inject instructions on the device only in local mode (chatExecutionStore.ts:2756-2773).
- CLI loads CLAUDE.md in the three tiers per trust boundary: Local reads CLAUDE.md, own-key CLAUDE.byok.md, Managed CLAUDE.managed.md (memory.rs:63-71).
- VS Code stores host and workspace text, 8000 characters, workspace wins when non-empty, escapes the closing tag and prepends it to local developer turns (customInstructions.ts:16-110).

**Incomplete**

- Mobile has no on/off switch for account instructions: no code for instructionsEnabled found in apps/mobile.
- Mobile Local mode block puts custom instructions in a line with no 'preference, not authority' framing (personalization.ts:62-63).
- Account instructions cannot be edited from the CLI: /personalize has no instructions field and points to web settings (personalization.rs:27-118,179-182).
- VS Code account instructions are not managed in the extension; its Host default and Workspace override are local only.
- Mobile project switches exist only for Cloud projects; Local projects have no such concept (stores/projects/cloudProjectStore.ts:30-31,156-157).

**Present but disconnected or switched off**

- Desktop Tauri customInstructionsStore (10000 characters, saveToBackend through invoke) belongs to the internal build and is not shown in the public Desktop (apps/desktop/src/stores/customInstructionsStore.ts; AGENTS.md section 5).

**Not available**

- Chrome project and account instructions screens.
- Per-project sharing on CLI and VS Code.

## 4. Required behaviour

**Established requirements**

- The user can save standing custom instructions that apply to every new chat, and switch them off without deleting them. (source: brief S40.16)
- The user can give a project its own instructions that apply to every chat in that project. (source: brief S40.17)
- For each project the user can choose which personal preferences and instructions apply. (source: brief S40.30)
- A project instruction outranks the account's own preference in prompt order. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.project-precedence.test.ts:258)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Turn the switch off on Web: text stays in the box and no <user_instructions> block is sent.
2. Turn it on again: same text is sent.
3. Text over 2000 characters cannot be saved.
4. Project with 'Use your profile and instructions' off: chats there get no name, work, about-you or account instructions.
5. Project with 'Use your response style' off: no <response_style> block from the account.
6. Both off: the server returns no personalization block (user-identity.ts:261).
7. A person without access to a project does not read its scope flags (ownership check).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Project instructions apply to chats in shared projects for members with access [inferred from the same query].
- VS Code workspace override replaces, does not merge with, the host default (customInstructions.ts:41-49).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an on/off switch to Mobile instructions.
- [proposed] Let the CLI set account instructions or open the right page.
- [proposed] Add project instructions to Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | PersonalizationSection (instructions) | `apps/web/features/settings/sections/PersonalizationSection.tsx` | Text area and switch. |
| service | instruction-preferences | `apps/web/lib/preferences/instruction-preferences.ts` | Reads text and enabled flag, orders account, workspace, project. |
| service | buildCustomInstructionsPreamble | `apps/web/lib/server/user-identity.ts` | Applies the project scope and builds the block. |
| service | readProjectPersonalizationScope | `apps/web/lib/server/user-identity.ts` | Reads the two project flags with an access check. |
| table | user_projects | `apps/web/db/neon/0310_project_account_personalization.sql` | Adds uses_account_instructions and uses_account_style. |
| table | organization_shared_projects, organization_members, organization_project_access | `apps/web/lib/server/user-identity.ts` | Used in the access check of the scope query. |
| component | ProjectSettingsDialog | `apps/web/features/projects/components/ProjectSettingsDialog.tsx` | Web project instructions and two checkboxes. |
| endpoint | project update route | `apps/web/app/api/projects/[id]/route.ts` | Saves project instructions and the flags. |
| service | request-processor project context | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Loads project blocks and places the instruction block. |
| screen | Personalization (mobile) | `apps/mobile/src/features/settings/personalization/index.tsx` | Custom Instructions field. |
| screen | ProjectSettingsScreen | `apps/mobile/src/features/projects/components/ProjectSettingsScreen.tsx` | Mobile project switches. |
| component | ProjectInstructionsSheet | `apps/mobile/src/features/projects/components/ProjectInstructionsSheet.tsx` | Mobile project instruction editor. |
| store | cloudProjectStore | `apps/mobile/stores/projects/cloudProjectStore.ts` | Holds the project flags. |
| service | MemoryManager | `apps/cli/src/memory.rs` | CLI instruction files in three tiers per trust boundary. |
| command | /output-style overview | `apps/cli/src/claude_parity.rs` | Lists instruction files in effect. |
| service | customInstructions | `apps/extension-vscode/src/features/instructions/customInstructions.ts` | Host and workspace text, prelude. |
| component | settingsWebviewContent | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | Custom instructions card. |
| service | projectInstructions | `apps/extension-vscode/src/data/projectInstructions.ts` | Reads repository instruction files. |
| store | customInstructionsStore (Tauri) | `apps/desktop/src/stores/customInstructionsStore.ts` | Internal desktop build only. |
| test | user-identity.test.ts | `apps/web/lib/server/__tests__/user-identity.test.ts` | Switch-off behaviour. |
| test | instruction-preferences.test.ts | `apps/web/lib/preferences/__tests__/instruction-preferences.test.ts` | Block reading and order. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person writes text and toggles the switch; Web saves namespace 'general'. | device | PersonalizationSection.tsx:287-298 |
| Stored in user_settings. | our servers | route.ts:98-131 |
| Per Cloud turn the server resolves the conversation's project, reads the two flags and builds the account block accordingly. | our servers | request-processor.ts:3992-4004; user-identity.ts:250-290 |
| Server loads project context and puts the project instruction block before the account block in the message list. | our servers | request-processor.ts:3841-3862,4123-4124,6618-6625 |
| Provider answers. | outside service | [inferred] |
| CLI: files are read from disk at session start and each turn; VS Code: text read from extension state and prepended to local runtime input. | device | memory.rs:63-110; customInstructions.ts:98-110 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Account instructions and enabled flag | user_settings namespace 'general' | Yes | Switch off keeps text; clearing removes it |
| Project instruction text and flags | user_projects (instructions, uses_account_instructions, uses_account_style) | Yes through the project API | Follows project lifecycle (deleted_at filter in scope query) |
| VS Code host and workspace text | VS Code globalState and workspaceState | No | Until the person clears it |
| CLI instruction files | config dir CLAUDE.md, CLAUDE.byok.md, CLAUDE.managed.md and repository CLAUDE.md | No | Files on disk, never deleted by the CLI |

**Models and providers.** Plain text added to the prompt; not model specific [inferred]. Boundary rule: a Local CLI session never reads the Managed file and the reverse (memory.rs:63-71; agent/mod.rs:1815-1821).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needed for account instructions and Cloud projects. VS Code and CLI files work signed out. |
| Permissions | Project owner or an editor of a shared project can change project instructions; ownership of the project row or an organization share is required to read the flags (user-identity.ts:225-244; projects/[id]/route.ts:268 message on editors). |
| Subscription | none found in the code for instructions or the project switches. |
| Limits and metering | 2000 characters account (MAX_CUSTOM_INSTRUCTIONS_LENGTH); VS Code 8000; Tauri 10000; project limit constant PROJECT_INSTRUCTIONS_MAX_LENGTH (value not read). |
| Feature flags | personalization:false per request; per-project flags; migration 0310. |
| Model compatibility | Not model specific [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local: instructions from the device store and local project text are injected on the device. CLI and VS Code files work fully on the device. Web local-model turns get account instructions from our server via /api/memory/local-context. CLI account personalization is refused outside Managed mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Switched off | Text kept, not sent. | instruction-preferences.ts:50-52; PersonalizationSection.tsx:500-504 |
| Instruction written before the flag existed | Treated as on. | instruction-preferences.ts:35-47; user-identity.test.ts:51 |
| Project missing or flags null | Full account scope. | user-identity.ts:213-222,243-246 |
| Project archived or deleted | Chat is refused with 'project_context_unavailable' (409). | request-processor.ts:3846-3860 |
| Instruction read failure | Chat continues with none; setup says unavailable. | request-processor.ts:3999-4004 |
| Project context load failure | Refused rather than sent unfiltered. | request-processor.ts:3880-3895; project-precedence.test.ts:385-401 |
| VS Code too long | Save rejected with a message about 8,000 characters. | customInstructions.ts:55-59 |
| Loading, save failure | Same as F040-01. | PersonalizationSection.tsx:609-655 |
| Confirmation before clearing | not handled in the code for Web account instructions (text edits autosave); the Tauri build asks before clear. | PersonalizationSection.tsx:505-519; apps/desktop/src/features/settings/CustomInstructionsSettings.tsx (AlertDialog) |
| Accessibility | Textarea has label, hint and counter; switch has label 'Apply instructions for AGI'. | PersonalizationSection.tsx:488-522 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/server/__tests__/user-identity.test.ts`: Switch off keeps text and leaves it out; back on; legacy text; no promotion of other surface text; scope carried.
- `apps/web/lib/preferences/__tests__/instruction-preferences.test.ts`: Reading blocks, ordering account then workspace then project.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.project-precedence.test.ts`: Project instruction ahead of personalized layer; refusal when project context cannot be decided.
- `apps/web/features/settings/sections/PersonalizationSection.test.tsx`: Switch off without emptying the field; stored off state.
- `apps/mobile/src/features/projects/__tests__/ProjectInstructionsMemory.test.tsx`: Mobile project instruction sheet.
- `apps/mobile/src/features/projects/__tests__/updateCloudProjectDetails.test.ts`: Project flag update and rollback.
- `apps/extension-vscode/src/__tests__/customInstructions.test.ts`: Host and workspace scopes, bounded escaped prelude, 8000 limit.
- `apps/web/features/projects/components/__tests__/ProjectSettingsDialog.save-ownership.test.tsx`: Project dialog saving (the two flag checkboxes: no test found by name).

**Test scenarios**

- **Pause and resume**
  1. Write 'Always answer in bullets' and leave the switch on.
  2. Turn the switch off.
  3. Chat.
  4. Turn it on and chat.
  - Expected: Off: no bullets from the instruction and the text remains; on: applied again.
- **Project opt-out**
  1. Set name Ada and instructions on Web.
  2. Create a project, turn both Personalization checkboxes off.
  3. Start a chat in the project.
  - Expected: No profile, instructions or style from the account; project instructions still apply.
- **Precedence**
  1. Account instruction 'Be brief'.
  2. Project instruction 'Be thorough'.
  3. Chat in the project.
  - Expected: Project text is placed ahead of the account text in the prompt (project-precedence test).
- **VS Code override**
  1. Set Host default text.
  2. Set Workspace override text.
  3. Open the Effective turn prelude.
  - Expected: Prelude shows the workspace text and scope 'this VS Code workspace'.
- **CLI trust boundary**
  1. Put different text in CLAUDE.md and CLAUDE.managed.md in the config directory.
  2. Start a Managed session.
  - Expected: Only the managed file is used.

**Where to look when it fails**

- Log 'Custom instructions read failed; sending none'.
- Error code project_context_unavailable (409).
- Columns uses_account_instructions and uses_account_style on user_projects.
- CLI /output-style overview lists instruction files; VS Code Effective turn prelude.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/web/040-instructions-preferences-and-personal-style.md)
- Desktop: [70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/desktop/040-instructions-preferences-and-personal-style.md)
- Mobile: [70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/mobile/040-instructions-preferences-and-personal-style.md)
- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Mobile lacks the instructions on/off switch.** Affects: Mobile users. Evidence: no instructionsEnabled in apps/mobile. Work needed: Add the switch and sync the flag.
- **Brief says Mobile per-project sharing is missing; it exists for Cloud projects.** Affects: Testers. Evidence: ProjectSettingsScreen.tsx:197-213. Work needed: Correct brief S40.30.
- **Brief says CLI and VS Code have project instructions; they use repository files and local text, not the account project field.** Affects: CLI, VS Code. Evidence: memory.rs:11-65; customInstructions.ts. Work needed: Decide if account projects should also reach them.
- **No test found for readProjectPersonalizationScope or the two project checkboxes.** Affects: Web projects. Evidence: search for uses_account_style in tests found only a marketing preview test. Work needed: Add server and dialog tests.
- **Chrome has no instructions or project instructions UI.** Affects: Chrome. Evidence: no code in apps/extension. Work needed: Build or link.
- **Web edits to instructions autosave with no confirmation or version history.** Affects: Web. Evidence: PersonalizationSection.tsx:505-519. Work needed: Consider a confirm for clearing, per AGENTS.md section 9 [proposed].
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- mode:local
- mode:own-key
- api:GET /api/settings/preferences
- api:PUT /api/settings/preferences
- table:user_settings
- table:user_projects
- table:organization_shared_projects
- table:organization_members
- table:organization_project_access
- store:vscode-globalState
- SYS-authorization-and-workspaces
- SYS-data-model-and-migrations
- SYS-memory-projects-and-context
- SYS-chat-turn-pipeline
- F040-01
- F040-02

## Unknown

- Value of PROJECT_INSTRUCTIONS_MAX_LENGTH (constant not opened).
- Whether Mobile pushes instructions with enabled flag semantic (no flag code).
- How Chrome handles project instructions: no code found.
- Whether CLI managed turns also receive server project instructions: not traced.
- Which HTTP method the project update route uses (route file not fully read).
