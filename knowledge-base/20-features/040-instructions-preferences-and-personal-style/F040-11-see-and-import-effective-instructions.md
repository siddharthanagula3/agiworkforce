---
id: "F040-11"
type: "feature"
title: "See and import effective instructions"
aliases: ["Effective instructions", "Effective-instruction explanation", "Import preferences from another assistant", "agi migrate", "/output-style overview", "Effective turn prelude", "S40.28", "S40.29"]
area: "40 Instructions, preferences, and personal style"
available_on: ["cli", "vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "partial", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S40.28", "S40.29"]
depends_on: ["SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-connectors-plugins-and-skills", "SYS-agents-tools-and-automation", "F040-07", "F040-09", "surface:cli", "surface:vscode", "mode:local", "mode:own-key", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F040-11 See and import effective instructions

Shows which instructions are in effect and where they come from, and imports settings from another assistant. The CLI lists the active output style, instruction files and account status, and 'agi migrate' copies Claude Code files. VS Code shows its custom-instruction text and instruction files. Other apps have neither.

Area: [40. Instructions, preferences, and personal style](README.md). Requirement items: [S40.28](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4028), [S40.29](../../10-requirements/capabilities/040-instructions-preferences-and-personal-style.md#s4029).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | built | built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** CLI: /output-style with no argument prints the output style and its origin, each instruction file found, tool allowlist and whether account preferences apply. VS Code: Settings panel shows the exact custom-instruction block and the discovered instruction files. Import: 'agi migrate' copies Claude Code files into the AGI config folder.

**Why it exists.** Briefs S40.28 (see which instructions apply and where each comes from) and S40.29 (import preferences from another assistant).

**Who uses it.** Developers on the CLI and VS Code; people switching from Claude Code.

**Problems it solves**

- Not knowing why the assistant behaves a certain way.
- Not knowing which instruction file won.
- Moving to AGI without rewriting instructions, prompts, skills, MCP settings.

**Use cases**

- Run /output-style to see Global, Project and Local instruction files in use.
- Open Settings > Instructions & editor in VS Code to read the exact turn prelude.
- Run 'agi migrate --dry-run' to preview what would be copied, then 'agi migrate'.

## 2. User experience

**Where to find it**

- CLI: /output-style with no argument in the REPL (claude_parity.rs:1301, 1378-1432); in the full-screen terminal UI the no-argument route prints only active and available styles (tui_app.rs:5724-5742).
- CLI import: command 'agi migrate [claude|claude-code] [--dry-run]' (lib.rs:959-968).
- VS Code: AGI Settings panel, navigation button 'Instructions & editor', card 'Custom instructions' with 'Effective turn prelude' and 'Runtime-discovered project sources' (settingsWebviewContent.ts:1277, 1669-1760); also an 'instructions' group in the context tree (contextPanelProvider.ts:10, 183-210).
- Web, Desktop, Mobile, Chrome: none.

**Before you start**

- CLI: a running session; migrate needs a ~/.claude folder with files to copy.
- VS Code: the settings panel open.

**Screens and controls**

- CLI overview lines: 'In effect for this session:', 'Output style', 'Instructions <tier>: <path>', 'Tool allowlist', 'Account'.
- VS Code: Host default and Workspace override text areas (8000 characters each), 'Effective turn prelude' preview, list of sources with a 'Preview truncated' note, button 'Custom-instruction docs'.
- migrate: printed report of copied items.

**Journey**

1. CLI: type /output-style.
2. Read the output style and its origin, each instruction file, and the Account line.
3. Switch or edit as needed.
4. Import: run 'agi migrate --dry-run', read the report, run 'agi migrate'.
5. VS Code: open Settings, choose 'Instructions & editor', read the prelude and sources.

**What the person sees and gets**

- CLI Account line says either 'your personalization and custom instructions (see /personalize)' or 'not applied: this session is <mode>, account preferences reach Managed Cloud turns only'.
- VS Code preview shows 'No custom instructions are active.' or the block; sources list says 'No AGENTS.md, CLAUDE.md, or .agiworkforce/instructions.md source was found.' when none.
- Migrate prints a report (format_claude_migration_report).

**Settings**

- VS Code host default and workspace override instructions.
- CLI instruction files: global, project, local CLAUDE.md tiers and the per-boundary global file names.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- CLI overview lists output style with origin, existing instruction files by tier, tool allowlist and account status (claude_parity.rs:1378-1432).
- CLI global instruction file is separate per trust boundary: CLAUDE.md for Local, CLAUDE.byok.md for own key, CLAUDE.managed.md for Managed (memory.rs:50-56).
- VS Code builds the effective custom-instruction text with workspace winning over host, and lists project instruction sources (customInstructions.ts:45-58, 128-141).
- VS Code shows the same snapshot in the settings panel and the context tree (SettingsPanel.ts:274; contextPanelProvider.ts:191).
- 'agi migrate' copies Claude Code global memory file, MCP servers, prompts, skills, agents, hooks and settings files without overwriting an existing target (ecosystem.rs:561-650, 748-775; lib.rs:7170-7178).
- Dry run writes nothing (ecosystem.rs:765-775).

**Incomplete**

- The terminal UI route for /output-style with no argument shows only active and available styles, not instruction files or the Account line (tui_app.rs:5724-5742), unlike the REPL handler.
- VS Code shows custom instructions and project files only; it does not show the selected output style or account personalization in that view (customInstructions.ts:128-141).
- Import covers only Claude Code (MigrationSource has two spellings of the same source, lib.rs:547-555); other detected tools exist in ecosystem.rs but 'agi migrate' does not take them [inferred from lib.rs:549-555].
- Import copies the instruction file to the Local file only, so it does not reach own-key or Managed sessions (ecosystem.rs:586-593; memory.rs:50-56).
- Import does not read another assistant's personal preferences such as name, tone or custom instructions typed in an app; it reads files in ~/.claude. [inferred]

**Present but disconnected or switched off**

- lib.rs:3849 listed in the brief for import points at project linking code, not import; the import command is at lib.rs:959-968 and 7170-7178.

**Not available**

- Web, Desktop, Mobile, Chrome: no effective-instruction view and no import.
- Import from ChatGPT or other chat assistants: no code found.
- Showing per-instruction source for account custom instructions and personalization traits on Web or Mobile: none.

## 4. Required behaviour

**Established requirements**

- The user can see which instructions and preferences are currently in effect and where each comes from. (source: S40.28 (brief))
- The user can import their preferences and instructions from another assistant. (source: S40.29 (brief))
- Brief status for S40.28: CLI and VS Code done; Web, Desktop, Mobile, Chrome missing. For S40.29: CLI done; others missing. (source: S40.28, S40.29 (brief))
- Local, BYOK and Managed Cloud are separate trust boundaries; nothing silently routes Local data to BYOK or Cloud. (source: doc: AGENTS.md section 6)
- The founder decision set names some CLI scope limits (terminal agent stays at Claude Code and Codex CLI scope). (source: doc: docs/decisions/2026-09-27-founder-decisions.md:440-475)

**Acceptance criteria**

1. CLI REPL: /output-style prints the active style with origin and every instruction file that exists.
2. CLI: the Account line says 'not applied' in Local and own-key sessions and names the mode.
3. VS Code: a workspace override replaces the host default in the preview, and clearing it shows the host default.
4. VS Code: with no instruction files the sources list shows the 'No AGENTS.md...' message.
5. agi migrate --dry-run changes no files and reports what would be copied.
6. agi migrate does not overwrite an existing target file.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A person should be able to see the same view in the full-screen terminal UI as in the REPL. [inferred]
- An imported instruction file should say which boundary it applies to. [inferred from memory.rs]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the TUI no-argument route call the shared overview.
- [proposed] Show the output style and account personalization in the VS Code view.
- [proposed] Add a Web and Mobile screen 'What applies to this chat' listing saved style, per-chat override, custom instructions, project instructions and memory, each with its source.
- [proposed] Offer an explicit choice to copy imported instructions to own-key and Managed files.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | handle_output_style / output_style_overview | `apps/cli/src/claude_parity.rs` | REPL effective-instruction overview and style commands. |
| command | TUI /output-style | `apps/cli/src/tui/tui_app.rs` | Terminal UI no-argument list (shorter than REPL overview). |
| service | MemoryManager and global_instructions_file | `apps/cli/src/memory.rs` | Finds Global, Project and Local instruction files per trust boundary. |
| service | migrate_claude_code | `apps/cli/src/ecosystem.rs` | Copies Claude Code files into the AGI config folder, with dry run. |
| command | Command::Migrate | `apps/cli/src/lib.rs` | Defines 'migrate' and prints the report (lines 959-968, 7170-7178). |
| service | cloud personalization (CLI) | `apps/cli/src/cloud/personalization.rs` | Account personalization keys used by /personalize. |
| component | SettingsPanel | `apps/extension-vscode/src/features/settings/SettingsPanel.ts` | Builds instructionContext for the settings webview (lines 169-178, 274). |
| component | settingsWebviewContent | `apps/extension-vscode/src/features/settings/settingsWebviewContent.ts` | 'Custom instructions' card with Effective turn prelude and sources list. |
| service | customInstructions | `apps/extension-vscode/src/features/instructions/customInstructions.ts` | Host and workspace instructions, effective scope, prelude, snapshot. |
| service | projectInstructions loader | `apps/extension-vscode/src/data/projectInstructions.ts` | Finds AGENTS.md, CLAUDE.md and .agiworkforce/instructions.md sources (file referenced by customInstructions.ts:4). |
| component | contextPanelProvider | `apps/extension-vscode/src/features/trees/contextPanelProvider.ts` | Context tree group 'instructions'. |
| hook | ChatStateManager turn input | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Builds custom instruction input for every turn (line 5356). |
| test | ecosystem migrate tests | `apps/cli/src/ecosystem.rs` | Inline tests: migration imports memory, MCP, commands; dry run writes nothing (lines 1859, 1917). |
| test | CLI parity tests | `apps/cli/src/claude_parity.rs` | Inline test of style selection (line 3192). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| CLI: the handler reads the active style, loads all styles to find its origin, lists instruction files by tier and reads the privacy mode. | device | claude_parity.rs:1378-1412 |
| CLI: the Account line only claims account preferences in Managed mode. | device | claude_parity.rs:1400-1407 |
| VS Code: the settings panel builds a snapshot from extension state and instruction files in the workspace and posts it to the webview. | device | SettingsPanel.ts:274; customInstructions.ts:128-141 |
| Import: 'agi migrate' reads files under ~/.claude and copies each to the AGI config folder if the target is missing. | device | ecosystem.rs:567-650, 748-775 |
| The report is printed to the terminal. | device | lib.rs:7176-7177 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Imported Claude Code global instruction file, prompts, skills, agents, hooks and settings copies | AGI CLI config folder (file:<config dir>/CLAUDE.md, prompts/claude, skills/claude, agents/claude, hooks/claude, settings/claude) | No sync code found | Copies are kept; sources are untouched (copy only) |
| VS Code custom instructions (host and workspace) | Extension global state and workspace state (store:agiWorkforce.customInstructions.host and .workspace) | Not synced | Kept until edited |

**Models and providers.** No model takes part in showing or importing; these are local reads. The shown instructions are later sent to whatever model runs the turn.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | CLI overview and migrate need no account. VS Code view needs none. The Account line reports whether account preferences apply. |
| Permissions | Migrate reads the home folder and writes the AGI config folder; the CLI shows what it did. No separate permission prompt was seen. |
| Subscription | none found in the code |
| Limits and metering | VS Code instruction text is 8000 characters per scope (customInstructions.ts:21). |
| Feature flags | none found in the code. --dry-run on migrate. |
| Model compatibility | Not applicable; no model call. |
| Provider restrictions | none found in the code |
| Local mode | Everything for this feature runs on the device in every mode. In CLI Local and own-key sessions account preferences are reported as 'not applied' (claude_parity.rs:1403-1407). Imported instructions go to the Local global file, so they apply in Local sessions only (ecosystem.rs:586-593; memory.rs:50-56). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No instruction files | CLI prints no 'Instructions' lines; VS Code prints the 'No AGENTS.md...' message. | claude_parity.rs:1388-1394; settingsWebviewContent.ts:2893-2897 |
| No custom instructions (VS Code) | Preview says 'No custom instructions are active.' | settingsWebviewContent.ts:2886 |
| Project source truncated | Listed with 'Preview truncated'. | settingsWebviewContent.ts:2903 |
| Snapshot build fails (VS Code context tree) | Instruction context is cleared and the tree refreshes. | contextPanelProvider.ts:190-196 |
| Migrate target exists | Left alone and reported as an existing target. | ecosystem.rs:757-763 |
| Migrate source missing | Reported as missing source. | ecosystem.rs:749-755 |
| Dry run | No files written. | ecosystem.rs:765 |
| Offline | Not applicable; local reads. Not handled beyond that. | claude_parity.rs:1378 |
| Accessibility | CLI output is plain text; VS Code uses labelled textareas and a preformatted preview. Screen-reader behaviour was not tested. | settingsWebviewContent.ts:1672-1735 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/ecosystem.rs`: Inline: migration imports memory, MCP and commands (line 1859); dry run writes nothing (line 1917).
- `apps/cli/src/claude_parity.rs`: Inline: case-insensitive style selection; no test of output_style_overview text found.
- `apps/cli/src/tui/tui_app.rs`: Inline: /output-style grammar and persistence (line 10243).
- `apps/extension-vscode/src/__tests__/chatStateManager.test.ts`: Turn input includes style text; custom instruction input not isolated here.

**Test scenarios**

- **CLI overview**
  1. Create CLAUDE.md in a project folder.
  2. Start the CLI REPL and run /output-style.
  - Expected: Output style with origin, an 'Instructions Project: <path>' line, and an Account line naming the privacy mode.
- **Account line by mode**
  1. Run /output-style in a Local session, then in a Managed session.
  - Expected: Local shows 'not applied'; Managed shows personalization and custom instructions.
- **TUI versus REPL**
  1. Run /output-style with no argument in the full-screen UI and in the REPL.
  - Expected: TUI lists styles only; REPL also shows instruction files (confirms the gap).
- **Migrate dry run**
  1. Place a ~/.claude/CLAUDE.md.
  2. Run 'agi migrate --dry-run'.
  3. Run 'agi migrate'.
  4. Run it again.
  - Expected: First run writes nothing; second copies to the Local global file; third reports existing target.
- **VS Code effective prelude**
  1. Save a host default and a workspace override.
  2. Open Settings > Instructions & editor.
  - Expected: Prelude names 'this VS Code workspace' and shows the override; clearing the override shows the host text.

**Where to look when it fails**

- CLI: the printed report from format_claude_migration_report; message 'Unknown option' from the style handler.
- VS Code: webview message 'dropped malformed settings webview message' in the console; 'settings.error' notice.
- Files: global instruction file names in memory.rs:50-56.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/cli/040-instructions-preferences-and-personal-style.md)
- VS Code: [70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md](../../70-qa/test-plans/vscode/040-instructions-preferences-and-personal-style.md)

## 10. Gaps and dependencies

- **Web, Desktop, Mobile and Chrome have no view of the instructions in effect.** Affects: Users of those apps. Evidence: Brief S40.28 missing; no code found. Work needed: Build a shared 'what applies to this chat' view listing saved style, chat override, custom instructions, project instructions, memory and their sources.
- **The terminal UI shows a shorter list than the REPL for the same command.** Affects: CLI full-screen users. Evidence: tui_app.rs:5724-5742 vs claude_parity.rs:1378-1432. Work needed: Route the TUI to the shared overview.
- **VS Code view leaves out the output style and account personalization.** Affects: VS Code users. Evidence: customInstructions.ts:128-141. Work needed: Add those sources to the snapshot.
- **Import covers Claude Code files only and copies to the Local file only.** Affects: CLI users coming from other assistants; own-key and Managed sessions. Evidence: lib.rs:547-555; ecosystem.rs:586-593; memory.rs:50-56. Work needed: Add other sources and an explicit boundary choice.
- **No import on Web, Desktop, Mobile, VS Code or Chrome, and no import of chat-app personalization from other assistants.** Affects: All non-CLI users. Evidence: Brief S40.29; no code found. Work needed: Decide scope and build a guided import with consent.
- **Brief code pointers for S40.29 are stale (lib.rs:3849 is project linking).** Affects: Documentation. Evidence: lib.rs:3820-3850. Work needed: Update the brief to lib.rs:959-968 and 7170-7178.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-connectors-plugins-and-skills
- SYS-agents-tools-and-automation
- F040-07
- F040-09
- surface:cli
- surface:vscode
- mode:local
- mode:own-key
- mode:cloud

## Unknown

- Whether VS Code's account personalization (personalization.ts) appears in any effective view: not found.
- What the plain REPL's no-argument route calls versus the TUI: REPL route traced via claude_parity.rs:182 and handle_output_style; slash_commands.rs line 788 only persists.
- Whether the CLI migrate command runs a consent prompt: none seen.
- Whether the extension in Chrome exposes any instruction view: nothing found.
- Where the brief's cited lines claude_parity.rs:929 and ecosystem.rs:567 map exactly: 929 is in an unrelated command (table), ecosystem.rs:567 is the start of the migration function.
