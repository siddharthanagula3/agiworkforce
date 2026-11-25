---
id: "F067-10"
type: "feature"
title: "Repository memory, instruction files and skills"
aliases: ["Repository memory (S67.37)", "Instruction files (S67.38)", "Project skills and plugins (S67.39)", "Memory control", "Skills and plugins control", "Remember for This Repository", "AGENTS.md and CLAUDE.md loading", "developer_memory_add", "skills/consent"]
area: "67 Coding capabilities and developer workflows"
available_on: ["desktop", "cli", "vscode"]
implementation: {web: "missing", desktop: "built", mobile: "missing", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S67.37", "S67.38", "S67.39"]
depends_on: ["surface:desktop", "surface:cli", "surface:vscode", "surface:web", "surface:mobile", "mode:local", "mode:own-key", "mode:cloud", "SYS-connectors-plugins-and-skills", "SYS-memory-projects-and-context", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "file:apps/cli/src/memory.rs", "file:apps/cli/src/compaction.rs", "file:apps/cli/src/skills.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F067-10 Repository memory, instruction files and skills

The agent keeps repository notes in project files, loads AGENTS.md, CLAUDE.md and AGI instruction files into its prompt, and uses skills and plugins a folder defines. On Desktop (local panel) and VS Code the person can save a memory and switch skills and plugins; project skills run only after the person trusts that exact set. Cloud sessions load none of this in the code read.

Area: [67. Coding capabilities and developer workflows](README.md). Requirement items: [S67.37](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6737), [S67.38](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6738), [S67.39](../../10-requirements/capabilities/067-coding-capabilities-and-developer-workflows.md#s6739).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | not built **(disagrees with the ledger on whether it exists)** | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Saves a short fact into the repository's CLAUDE.md or the user's instruction file (apps/cli/src/memory.rs:243-279), loads instruction files from the working folder up to the repository root within a 10,000 token budget (apps/cli/src/compaction.rs:11-23, 172-218, 286-300), and lists and toggles skills and plugins with a trust step for project skills (apps/cli/src/app_server/surfaces.rs:105-188).

**Why it exists.** Agents work better and safer with the repository's own rules, remembered facts and skills. Brief items: save repository facts and reuse them (S67.37), load AGENTS.md and CLAUDE.md and follow them (S67.38), use project skills and plugins that the user can see or toggle (S67.39).

**Who uses it.** Developers with Desktop local sessions, the CLI and VS Code.

**Problems it solves**

- The agent forgets repository conventions between sessions.
- Untrusted skills in a cloned repository could run scripts; they stay off until the person trusts that exact set (apps/cli/src/skills.rs:395-445, 529).
- Files outside the folder, FIFOs and credential files are not read into the prompt (apps/cli/src/compaction.rs:160-166).

**Use cases**

- Save 'Run pnpm test:unit before committing' as Project memory.
- Add an AGENTS.md to a repository and have each CLI turn load it.
- Trust a cloned repository's skills after reading them, then switch one on.
- Switch a plugin off for a folder.

## 2. User experience

**Where to find it**

- Desktop local panel (Electron shell with Local mode): header buttons 'Memory' (brain icon) and 'Skills and plugins' (sparkles icon) (apps/web/features/code/components/LocalSessionPanel.tsx:1067-1068; apps/web/features/code/local-code.ts:234, 246). The Memory button shows only when the runtime reports the memory feature and the session is not on a remote SSH host (LocalSessionPanel.tsx:459).
- VS Code: command 'Code: Remember for This Repository' (apps/extension-vscode/package.json:768-769) and 'Code: Show Skills' (package.json:753-754).
- CLI: instruction files load automatically; skills are listed with the skills command (apps/cli/src/skills.rs:1592).
- Web (browser, Cloud): no memory, skills or instruction file control found for repositories; the brief says missing (doc: brief S67.37-39). The Local components live in apps/web but only render in the desktop shell (apps/web/features/desktop-host/lib/host.ts:45-47).
- Mobile: no repository memory or skills control found; brief says done as remote view (doc: brief).

**Before you start**

- A trusted workspace and the AGI CLI runtime for the folder (Desktop starts it per folder: apps/desktop/electron/runtime/developerSessionService.ts:3421-3436).
- For memory: a project root for Project memory ('No project root found...' otherwise, memory.rs:246-248).
- For project skills: the person's trust of the current set.

**Screens and controls**

- Memory popover: heading 'Remember for later sessions', field 'What to remember', radio 'Project memory' ('Saved in this repository and shared through git.') and 'User memory' ('Saved for all your projects on this computer.'), button 'Save to memory' (local-code.ts:246-257; LocalMemoryControl.tsx:60-141).
- Skills and plugins popover: button "Trust this folder's skills" or "Stop trusting this folder's skills", a Skills list with switches, a Plugins list with switches, labels 'This folder', 'Your account', 'From a plugin' (local-code.ts:234-245; LocalExtensionsControl.tsx:95-180).
- VS Code skill list: 'Create a skill', 'Install a skill', 'Allow this folder's project skills' (capabilityManagement.ts:230-256).

**Journey**

1. Memory: open Memory, type the fact, pick Project or User, press 'Save to memory'.
2. The desktop sends it to the folder's CLI runtime, which appends it to the file (developerSessionService.ts:3423-3436).
3. The popover shows 'Saved to <path>'.
4. Skills: open 'Skills and plugins'; project skills are off with the note 'Off until you trust them. Trusted skills can run scripts with your account.' (local-code.ts:241).
5. Press "Trust this folder's skills"; the app sends the digest it showed; if the set changed meanwhile, nothing is trusted and the list is refreshed (surfaces.rs:153-180).
6. Switch a skill or plugin on or off.
7. Next session: the CLI loads instruction files and the enabled skills into the prompt (apps/cli/src/agent/prompt.rs:396-405).

**What the person sees and gets**

- 'Saved to <path>' (role=status) or 'That could not be saved to memory.' (role=alert) (LocalMemoryControl.tsx:121-132).
- 'Loading skills and plugins', 'Skills and plugins could not be read.', 'That change could not be saved.', 'No skills or plugins are installed for this folder.' (local-code.ts:237-240).
- CLI prints a note when instruction files exceed the budget (compaction.rs:228-234).

**Settings**

- Skill enabled state is stored by skill name for the user, not per folder (apps/cli/src/app_server/surfaces.rs:142-150 calls skills::set_skill_enabled(name)).
- Trust is stored per project root and per exact skill set digest (skills.rs:395-445).
- Memory tiers: Global (user), Project, Local; the Desktop control exposes only user and project (LocalMemoryControl.tsx:20-27; developerSessionService.ts:3421).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Memory save: validates non-empty text, at most 4,000 characters, appends to the tier's file (apps/cli/src/app_server/surfaces.rs:44, 1646-1672; apps/cli/src/memory.rs:243-279). Project memory goes to <project root>/CLAUDE.md; User memory goes to a user instruction file chosen by privacy boundary (memory.rs:36-52).
- Desktop memory route and capability check (apps/desktop/electron/runtime/dispatcher.ts:901-905, 2980-2986).
- Instruction loading: AGENTS.md, CLAUDE.md and .agiworkforce/instructions.md from the repository root down to the folder, plus a user file; 10,000 token budget; links and special files skipped (apps/cli/src/compaction.rs:11-23, 172-218).
- The system prompt gets instructions, memory, skill catalog and always-on rules (apps/cli/src/agent/prompt.rs:396-405).
- Skills: list, enable, consent with digest, plugin enable (surfaces.rs:105-188; dispatcher.ts:3077-3100).
- VS Code remember command and skills management (apps/extension-vscode/src/features/surfaces/repositoryMemory.ts; capabilityManagement.ts:220-256).

**Incomplete**

- Web Cloud sessions: no code loading AGENTS.md or CLAUDE.md was found in apps/web/lib/services/cloud-code-*.ts or apps/web/lib/e2b (search returned nothing). Whether the sandbox harness reads them: unknown.
- The product definition names '.agi' as the canonical project configuration (doc: docs/product/definition.md:122); the CLI code read loads .agiworkforce/instructions.md and AGENTS.md/CLAUDE.md, and no '.agi/' loader was found (a search of apps/cli/src matched only memory.rs and update_check.rs, which were not read).
- Local-tier memory exists in the CLI but is not offered in the Desktop control.

**Present but disconnected or switched off**

- The Memory button is hidden unless runtimeModels.features.memory is true (LocalSessionPanel.tsx:459; developerSessionService.ts:1360, 1487 where memory is false by default).
- Project skills stay switched off until trusted (LocalExtensionsControl.tsx:145).

**Not available**

- Web browser (Cloud) repository memory, skills and instruction files: not found.
- Mobile controls: not found.
- Chrome: not applicable.

## 4. Required behaviour

**Established requirements**

- The agent saves useful repository facts to memory and reuses them in later sessions on that repository. (source: brief S67.37)
- The agent loads AGENTS.md and CLAUDE.md and follows them. (source: brief S67.38)
- The agent uses project skills and plugins and the user can see or toggle them. (source: brief S67.39)
- Developer extension discovery is folder-aware; .agi is canonical, compatibility loaders may read .agents, .claude, AGENTS.md, CLAUDE.md, skills, plugins; CLI and VS Code must show the same inventory for the same trusted workspace; compatibility does not authorize rewriting another tool's files. (source: (doc: docs/product/definition.md:122))
- Saving a memory is a user action that names where it will be written. (source: apps/web/features/code/local-code.ts:250-253)
- A skill that is not trusted is not followed. (source: apps/web/features/code/local-code.ts:241; apps/cli/src/skills.rs:395-445)

**Acceptance criteria**

1. Saving 'X' as Project memory appends X to the repository root CLAUDE.md and shows its path.
2. A memory over 4,000 characters is refused.
3. Project memory in a folder with no project root shows an error.
4. A new CLI turn in a folder with AGENTS.md includes its text in the system prompt, and the text is cut when the files exceed 10,000 tokens.
5. A cloned repository's skills appear off with the untrusted note; after "Trust this folder's skills" the switches work.
6. Editing a project skill after trusting makes it untrusted again.
7. VS Code 'Remember for This Repository' saves a project memory and offers 'Open memory file'.
8. The Memory button is absent when the runtime does not report memory.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Plugin and skill toggles should need the shell grant because they let the agent run scripts (dispatcher.ts:934-947).
- [inferred] User memory should not reach BYOK or Managed sessions from a Local file: the file name depends on the privacy boundary (memory.rs:46-52).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer Local-tier memory in the control.
- [proposed] Load instruction files in Cloud sessions or state clearly that they are not.
- [proposed] Show the loaded instruction files in the Desktop panel (the CLI has a preview; see the surfaces.rs test instruction_preview_names_exactly_the_files_a_turn_loads).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | LocalMemoryControl | `apps/web/features/code/components/LocalMemoryControl.tsx` | Memory popover. |
| component | LocalExtensionsControl | `apps/web/features/code/components/LocalExtensionsControl.tsx` | Skills and plugins popover with trust. |
| screen | LocalSessionPanel | `apps/web/features/code/components/LocalSessionPanel.tsx` | Mounts both controls (lines 1067-1068). |
| config | LOCAL_CODE_COPY | `apps/web/features/code/local-code.ts` | Visible labels. |
| service | desktop-host runtime-client (addDeveloperMemory, listDeveloperSkills, setDeveloperSkillConsent) | `apps/web/features/desktop-host/lib/runtime-client.ts` | Bridge calls from the web app to the desktop. |
| config | capability map (developer_memory_add, developer_skill_consent, developer_skill_set_enabled, developer_plugin_set_enabled) | `apps/desktop/electron/runtime/dispatcher.ts` | Grant and reason text (lines 901-947). |
| service | addDeveloperMemory, listDeveloperSkills, setDeveloperPluginEnabled | `apps/desktop/electron/runtime/developerSessionService.ts` | Send memory/add, skills/*, plugins/* to the folder's CLI runtime. |
| service | add_memory, list_skills, set_skill_enabled, set_skill_consent | `apps/cli/src/app_server/surfaces.rs` | Handlers for memory and skills methods. |
| service | MemoryManager and MemoryTier | `apps/cli/src/memory.rs` | Resolves and appends to memory files; rules. |
| service | load_instructions, instruction_sources | `apps/cli/src/compaction.rs` | Finds and budgets instruction files. |
| service | assemble_system_prompt | `apps/cli/src/agent/prompt.rs` | Puts instructions, memory, skills and rules into the prompt (line 396-405). |
| service | skills (discovery, digest, consent) | `apps/cli/src/skills.rs` | Skill sources, digest and consent store. |
| schema | developer_session protocol (SkillSummary, MemoryAddParams) | `crates/agiworkforce-protocol/src/developer_session.rs` | Wire types. |
| command | agi-workforce.rememberForRepository | `apps/extension-vscode/src/features/surfaces/repositoryMemory.ts` | VS Code memory save. |
| command | agi-workforce.showSkills (manageSkills) | `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts` | VS Code skill list and trust. |
| service | localRuntimeClient skills, plugins, memory methods | `apps/extension-vscode/src/integrations/localRuntimeClient.ts` | VS Code calls (lines 2129-2220, 2327). |
| store | skill consent store (per project root, digest) | `apps/cli/src/skills.rs` | JSON consent file on the device (load/save at lines 301-315). |
| store | project CLAUDE.md, .agiworkforce/instructions.md, user instructions files | `apps/cli/src/memory.rs` | Where memory text lives. |
| test | LocalExtensionsControl test | `apps/web/features/code/components/LocalExtensionsControl.test.tsx` | Trust and digest behaviour. |
| test | instruction settings tests | `apps/cli/src/app_server/instruction_settings/tests.rs` | Instruction files behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person saves a memory in the desktop panel; the web app calls the desktop host. | device | apps/web/features/code/components/LocalMemoryControl.tsx:49; apps/web/features/desktop-host/lib/runtime-client.ts:858 |
| The desktop checks the shell grant and sends memory/add to the CLI runtime for that folder. | device | apps/desktop/electron/runtime/dispatcher.ts:901-905; developerSessionService.ts:3423-3436 |
| The CLI appends the text to the memory file directly. It does not ask the model to write it. | device | apps/cli/src/app_server/surfaces.rs:1646-1672; apps/cli/src/memory.rs:243-279 |
| On the next turn the CLI reads instruction files, memory, rules and the enabled skills, and builds the system prompt. | device | apps/cli/src/agent/prompt.rs:396-405; apps/cli/src/compaction.rs:286 |
| The prompt, with that text in it, is sent to the session's model: a local model on the device, the person's own provider, or AGI Cloud. | outside service | SYS-chat-turn-pipeline; route depends on the session mode (not traced here). With a local model it stays on the device. |
| Trust: the person's yes with the shown digest is written to the consent store; a changed set refuses. | device | apps/cli/src/app_server/surfaces.rs:153-180; apps/cli/src/skills.rs:529 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Memory text | Project CLAUDE.md in the repository, or the user's instruction file in the CLI config directory (named per privacy boundary) | Project file travels with git if committed; user file does not sync (no sync code read) | Append only; deleting needs a manual file edit (no delete in add_memory) |
| Skill enabled flags | CLI config (disabled skills set) | Not synced | Kept until changed |
| Skill trust | A JSON file keyed by project root with the set digest | Not synced | Revoked by 'Stop trusting' |

**Models and providers.** No model is needed to save or list. The instruction text and memory are placed in the model prompt, so they are sent to whichever provider the session uses; the CLI keeps global instructions apart by trust boundary (memory.rs:46-52; prompt.rs assemble_system_prompt takes the privacy mode).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Local use needs no AGI account in the code read. |
| Permissions | Desktop grants: shell.execute for memory add, skill enable, consent and plugin enable; filesystem.read for listing (dispatcher.ts:901-947). VS Code needs a trusted workspace (repositoryMemory.ts:11-15). |
| Subscription | none found in the code for memory, skills or instruction loading. |
| Limits and metering | 4,000 characters per memory (surfaces.rs:44); 10,000 token instruction budget (compaction.rs:11). |
| Feature flags | Memory feature flag reported by the runtime (developerSessionService.ts:1360). |
| Model compatibility | none found in the code. |
| Provider restrictions | none found in the code. |
| Local mode | Works fully on the device: files, trust and toggles are local and free. Instruction and memory text are sent to the model only through the session's own route. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty text | Save button disabled; the server refuses empty text. | LocalMemoryControl.tsx:137; surfaces.rs:1652-1654 |
| Too long | Refused with the 4,000 character message. | surfaces.rs:1655-1659 |
| No project root | Error text from the CLI. | memory.rs:246-248 |
| Runtime unavailable | Error 'The AGI CLI is no longer running' or not found. | developerSessionService.ts:1130-1135, 1170-1190 |
| Request timeout | 'The AGI CLI did not answer memory/add in time.' | developerSessionService.ts:1138-1141 |
| Skill set changed during review | Nothing trusted; list refreshed. | surfaces.rs:170-178; test LocalExtensionsControl.test.tsx 'lists the skills as they are now' |
| Untrusted skill | Switch disabled. | LocalExtensionsControl.tsx:145 |
| Instruction files too large | Later files dropped, one stderr note per process. | compaction.rs:228-234 |
| Symlink out of folder, FIFO, oversize | Skipped and logged. | compaction.rs:160-166 |
| Remote SSH session | Memory button hidden. | LocalSessionPanel.tsx:459 |
| Accessibility | Buttons carry aria-labels; status and alert roles on messages. | LocalMemoryControl.tsx:74-84, 121-132 |
| Offline | not handled in the code as a distinct state; the feature is local files only. | searched LocalMemoryControl.tsx and surfaces.rs add_memory; no network call |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/code/components/LocalExtensionsControl.test.tsx`: Sends the digest with trust, refreshes when the set changed, revoke.
- `apps/web/features/desktop-host/__tests__/local-runtime-client.test.ts`: Desktop host client calls including skills.
- `apps/desktop/electron/__tests__/dispatcher.test.ts`: Dispatcher including developer skill commands (matched by search for developer_skill_consent).
- `apps/desktop/electron/__tests__/developerSessionService.test.ts`: Runtime service including skills (matched by search).
- `apps/cli/src/app_server/instruction_settings/tests.rs`: Instruction settings.
- `apps/cli/src/app_server/surfaces.rs`: In-file test: instruction preview names exactly the files a turn loads.
- `apps/extension-vscode/src/__tests__/settingsPanelLocalCapabilities.test.ts`: VS Code settings use of local capabilities incl. skills.

**Test scenarios**

- **Save project memory**
  1. Open a local session in a git folder.
  2. Open Memory, type a fact, keep Project, press 'Save to memory'.
  3. Open the repository CLAUDE.md.
  - Expected: The fact is appended; the popover shows the path.
- **Instruction loading**
  1. Add AGENTS.md with a unique rule.
  2. Run the CLI with --dump-system-prompt in that folder.
  - Expected: The rule appears in the instructions part, root-first.
- **Untrusted skill**
  1. Clone a repository with .agiworkforce/skills.
  2. Open 'Skills and plugins'.
  - Expected: Skills listed, switches disabled, note shown.
- **Trust then edit**
  1. Trust the folder's skills.
  2. Edit one skill file.
  3. Reopen the list.
  - Expected: Trust is gone for the changed set.
- **Memory limit**
  1. Paste 4,001 characters and save.
  - Expected: Refused.
- **VS Code remember**
  1. Run 'Code: Remember for This Repository' and enter a note.
  - Expected: Message 'saved to <path>' with 'Open memory file'.

**Where to look when it fails**

- CLI stderr 'note: your instruction files are over the 10000-token budget'.
- Desktop error strings 'The AGI CLI did not say where it saved the memory.'
- The skills consent store file path returned in the consent response (surfaces.rs:181-185).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/desktop/067-coding-capabilities-and-developer-workflows.md)
- CLI: [70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/cli/067-coding-capabilities-and-developer-workflows.md)
- VS Code: [70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md](../../70-qa/test-plans/vscode/067-coding-capabilities-and-developer-workflows.md)

## 10. Gaps and dependencies

- **Web (browser) has no repository memory, skills or instruction loading** Affects: Web Cloud sessions. Evidence: No loader in apps/web/lib/services/cloud-code-*.ts; brief says missing. Work needed: Decide scope and add, or mark not applicable.
- **'.agi' canonical folder not found in the CLI code read** Affects: CLI, VS Code, Desktop. Evidence: docs/product/definition.md:122 versus apps/cli/src/compaction.rs:23. Work needed: Confirm or add an .agi loader.
- **Memory cannot be edited or removed from the control** Affects: Desktop, VS Code. Evidence: add_memory only appends. Work needed: Add list, edit and delete.
- **Skill enable state is global, not per folder** Affects: CLI, Desktop, VS Code. Evidence: surfaces.rs:142-150. Work needed: Decide whether per folder is wanted; the popover implies this folder.
- **Dispatcher reason text says the CLI agent writes the memory; the code appends the text directly** Affects: Desktop consent text accuracy. Evidence: dispatcher.ts:901-905 versus surfaces.rs:1646-1672. Work needed: Correct the reason text.
- **Mobile 'done' is not backed by a control** Affects: Mobile. Evidence: No memory or skills control found. Work needed: Verify or correct.
- **Surface matrix says VS Code has no skills; the code has them** Affects: Documentation. Evidence: docs/product/surface-feature-matrix.md Skills section versus apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:220. Work needed: Regenerate the matrix.
- **No test for LocalMemoryControl** Affects: Desktop, Web local. Evidence: no test file found for it. Work needed: Add one.
- Not built on: Web, Mobile (from the capability ledger).

**Depends on**

- surface:desktop
- surface:cli
- surface:vscode
- surface:web
- surface:mobile
- mode:local
- mode:own-key
- mode:cloud
- SYS-connectors-plugins-and-skills
- SYS-memory-projects-and-context
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- file:apps/cli/src/memory.rs
- file:apps/cli/src/compaction.rs
- file:apps/cli/src/skills.rs

## Unknown

- Whether Cloud sandbox sessions read AGENTS.md or CLAUDE.md.
- Whether an '.agi' loader exists.
- Whether Mobile shows memory or skills.
- How the model uses plugin commands and MCP servers per folder (plugins not traced).
- The default of the runtime memory feature flag when the CLI reports it (developerSessionService.ts:1360 reads capabilities['memory']).
- Whether user memory files sync across devices (no sync code read).
- Retention or deletion rules for memory files.
