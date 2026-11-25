---
id: "F072-02"
type: "feature"
title: "Keys, composer and @ file mentions"
aliases: ["Keyboard shortcuts", "S72.25", "Prompt history", "S72.24", "File mentions", "S72.23", "@ picker", "/keybindings", "/keys", "[ui.keybindings]"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.23", "S72.24", "S72.25"]
depends_on: ["surface:cli", "file:apps/cli/src/keybindings.rs", "file:apps/cli/src/mentions.rs", "file:apps/cli/src/tui/prompt_history.rs", "store:history.txt", "mode:local", "mode:own-key", "mode:cloud", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-execution-boundaries", "F072-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-02 Keys, composer and @ file mentions

Fast typing in the CLI chat screen: Up and Down recall earlier prompts (saved between runs), `@` opens a fuzzy file picker and inlines trusted files, and a small set of global keys can be rebound in `[ui.keybindings]` in config.toml. `/keybindings` lists them.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.23](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7223), [S72.24](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7224), [S72.25](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7225).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | built | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives the composer shortcuts: prompt recall, file and agent mentions, global key actions (quit, cycle mode, cycle model, redraw, clear chat, clear input, open palette), plus fixed editing keys.

**Why it exists.** The brief asks for recall that persists, a fuzzy file picker that inlines mentioned files, and global shortcuts that can be rebound (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.23, S72.24, S72.25).

**Who uses it.** Developers in the terminal who send many prompts and refer to files often.

**Problems it solves**

- Retyping a long prompt.
- Pointing the agent to the right file without typing the full path.
- Terminal or muscle-memory conflicts with default keys.
- Accidentally sending a repository-controlled file's contents to the model from an untrusted folder.

**Use cases**

- Press Up to repeat last week's prompt after restarting the CLI.
- Type `explain @src/li` and pick `src/lib.rs` from the list.
- Rebind open_palette to ctrl+p because `/` clashes with a habit.

## 2. User experience

**Where to find it**

- surface:cli, full-screen screen: the composer at the bottom (apps/cli/src/tui/tui_app.rs:4081-4200).
- `/keybindings` or `/keys` prints the current bindings (apps/cli/src/tui/tui_app.rs:6704-6706, apps/cli/src/keybindings.rs:157-187).
- In the command palette the `attach` item is listed with the description `Attach an image, PDF or Office file to the next message` (apps/cli/src/tui/tui_app.rs:4510-4520).

**Before you start**

- For file contents to be inlined, the folder must be trusted; otherwise only the typed path goes to the model (apps/cli/src/mentions.rs:296-315, apps/cli/src/tui/tui_app.rs:4541-4545).
- For `[ui.keybindings]` edits, access to config.toml.

**Screens and controls**

- Up/Down: move inside a multi-line draft first, then walk prompt history, otherwise scroll the transcript (apps/cli/src/tui/tui_app.rs:4179-4200).
- Up after clearing a draft brings the cleared draft back first (apps/cli/src/tui/tui_app.rs:1133-1148, 4181-4186).
- `@` at a word boundary opens a `Files` popup; typing narrows it, arrows move, Enter inserts, Esc closes, Backspace past the `@` closes it (apps/cli/src/tui/widgets/mention_popup.rs:1-60, apps/cli/src/tui/tui_app.rs:4160-4166).
- The popup also offers agent names (prefix is AGENT_MENTION_PREFIX) (apps/cli/src/tui/tui_app.rs:971-990).
- Default global keys: Ctrl+D quit, Shift+Tab cycle permission mode, Alt+P cycle model, Ctrl+L redraw, Ctrl+C clear input, `/` open palette; clear_chat has no default key (apps/cli/src/keybindings.rs:48-57).
- Fixed keys: Enter send, Shift+Enter, Alt+Enter and Ctrl+J newline, Ctrl+U delete to line start, Ctrl+V paste clipboard image, Ctrl+O toggle full tool output, Esc Esc rewind picker (apps/cli/src/tui/tui_app.rs:4020-4125, 3975-3990).

**Journey**

1. 1. User sends a prompt; it is added to history and appended to history.txt (apps/cli/src/tui/prompt_history.rs:52-65, apps/cli/src/tui/tui_app.rs:7400-7405).
2. 2. Next run, Up loads history.txt entries (apps/cli/src/tui/prompt_history.rs:15-30).
3. 3. User types `@`; the popup opens with the workspace file list (git-aware, bounded) (apps/cli/src/mentions.rs:1-100).
4. 4. User picks a path; it is spliced into the message at the cursor (apps/cli/src/tui/tui_app.rs:993).
5. 5. On Enter the text is resolved: each `@path` becomes a file block when the folder is trusted; images and documents are staged as attachments; skipped items get a system line `<path> was not inlined: <reason>` (apps/cli/src/tui/tui_app.rs:4541-4580).
6. 6. To rebind keys the user adds `[ui.keybindings]` with entries such as `open_palette = "ctrl+p"`; bad entries are refused at config load (apps/cli/src/keybindings.rs:157-187, apps/cli/src/config.rs:1437).

**What the person sees and gets**

- `nothing to interrupt · ctrl+c again to exit` after the first Ctrl+C on an empty composer (apps/cli/src/tui/tui_app.rs:4000-4012).
- `press ctrl+d again to quit` (apps/cli/src/tui/tui_app.rs:3956-3968).
- `cleared the composer · Up brings it back` when a non-empty draft is cleared (apps/cli/src/tui/tui_app.rs:1144-1147).
- `no workspace files to mention` when the list is empty (apps/cli/src/tui/tui_app.rs:4597-4599).
- `<path> was not inlined: <reason>` for skipped mentions (apps/cli/src/tui/tui_app.rs:4565-4577).

**Settings**

- `[ui.keybindings]` with the keys quit, cycle_mode, cycle_model, redraw, clear_chat, clear_input, open_palette (apps/cli/src/keybindings.rs:21-40).
- `[ui] edit_mode = "vi" or "emacs"` for the line REPL editor (apps/cli/src/keybindings.rs:157-187).
- `agi config set ui.keybindings.<action> <value>` style keys are read by config get/set (apps/cli/src/config.rs:1480-1482).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Prompt history is a rustyline file history loaded from `history.txt` in the config folder and appended on each send (apps/cli/src/tui/prompt_history.rs:15-30, 52-65).
- Up/Down logic: multi-line cursor, then parked draft, then history older, else scroll (apps/cli/src/tui/tui_app.rs:4179-4200).
- Mention candidates: `git ls-files` (cached and untracked, minus ignored) with a 3 s timeout, else a bounded walk of depth 12, capped at 20,000 entries, ten most recent files first (apps/cli/src/mentions.rs:20-100).
- Mention expansion: skips paths outside the workspace, files that hold credentials, files above 256 KB, and, in an untrusted folder, all file and directory contents; images and Office or PDF documents are staged as attachments (apps/cli/src/mentions.rs:296-420).
- Global bindings are validated: unknown action, bare character keys, keys the composer owns, and duplicates are rejected (apps/cli/src/keybindings.rs:195-250).
- Ctrl+C with a draft clears (parks) it; with an empty composer it arms exit for 2 seconds, and a second press quits (apps/cli/src/tui/tui_app.rs:3991-4022, 44).
- Ctrl+D with an empty composer also needs two presses within 2 seconds; with a draft it parks the draft instead (apps/cli/src/tui/tui_app.rs:3936-3970).
- While a turn is running Ctrl+D (the Quit binding) quits at once (apps/cli/src/tui/tui_app.rs:3915-3922).
- Pasted text is sanitised and long pastes collapse (apps/cli/src/tui/tui_app.rs:4617-4631).

**Incomplete**

- The brief says mentioned files are inlined; the code inlines only in a trusted folder and only up to 256 KB, listing folders up to 200 entries (apps/cli/src/mentions.rs:25-35, 296-420).
- `/keybindings` lists the global actions and a few fixed keys, but not Ctrl+J, Ctrl+U, Ctrl+V, Ctrl+O (apps/cli/src/keybindings.rs:157-187 versus tui_app.rs:4020-4125).

**Present but disconnected or switched off**

- Ctrl+R reverse search exists only in the line REPL, not in the full-screen screen (apps/cli/src/command_registry.rs:281-282, apps/cli/src/repl/mod.rs:1070).
- Clear chat is unbound by default; it only runs if the user names it (apps/cli/src/keybindings.rs:48-57).

**Not available**

- surface:web, surface:desktop, surface:mobile, surface:vscode, surface:chrome: not part of this item.
- History search in the full-screen screen: not available.

## 4. Required behaviour

**Established requirements**

- Typing @ in the composer opens a fuzzy file picker and the mentioned files are inlined as context when sent. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.23)
- Previous prompts can be recalled (Up arrow / history search) and persist across runs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.24)
- The TUI has global keyboard shortcuts, lists them with /keybindings, and lets users rebind them in config. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.25)
- The CLI must stay local and workspace scoped unless the user explicitly hands off. (source: doc: docs/product/requirements.md:1180-1182)

**Acceptance criteria**

1. Send a prompt, quit, restart, press Up: the prompt returns.
2. Press Up on a multi-line draft: the cursor moves up first and history only after the top line.
3. Type `@` after a space: a `Files` popup opens; typing `lib` narrows it; Enter inserts the path.
4. In a trusted folder, send `explain @small.txt`: the model sees the file text. In an untrusted folder the same send shows `was not inlined: workspace is not trusted, only the path was sent`.
5. Mention a file named like a credentials file: a skip line says `holds credentials, only the path was sent`.
6. Add `open_palette = "ctrl+p"` under `[ui.keybindings]`: Ctrl+P opens the palette and `/keybindings` shows it.
7. Set two actions to the same chord: config load fails with `duplicates another effective binding`.
8. Press Ctrl+C once on an empty composer: a notice appears; a second press within two seconds exits.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- History should not be shared in a way that leaks a Local prompt to the account; in the code history.txt is local only [inferred from apps/cli/src/tui/prompt_history.rs:1-97, which has no network call].
- Mention expansion must run before send so the model sees the file text [inferred from apps/cli/src/tui/tui_app.rs:4541].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Ctrl+R history search to the full-screen screen so both modes match.
- [proposed] List Ctrl+J, Ctrl+U, Ctrl+V and Ctrl+O in `/keybindings`.
- [proposed] Offer a way to keep a prompt out of history.txt (for example a leading space or a config switch).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | handle_key_event | `apps/cli/src/tui/tui_app.rs` | Order of key handling: overlay, pickers, loading, quit, Esc, global actions, edit keys (tui_app.rs:3876-4200). |
| service | PromptHistory | `apps/cli/src/tui/prompt_history.rs` | Load, record, older, newer for prompt recall (prompt_history.rs:1-97). |
| store | history.txt | `apps/cli/src/tui/prompt_history.rs` | Prompt history file in the config folder (prompt_history.rs:15-18). |
| service | mentions | `apps/cli/src/mentions.rs` | Candidate list, ranking, parsing, expansion with trust and credential checks (mentions.rs:1-738). |
| component | MentionPopup | `apps/cli/src/tui/widgets/mention_popup.rs` | The `Files` popup with filter and selection. |
| service | open_mention_popup / resolve_composer_mentions | `apps/cli/src/tui/tui_app.rs` | Open the popup on `@` and expand mentions on send (tui_app.rs:4541-4603). |
| component | fuzzy scorer | `apps/cli/src/tui/fuzzy.rs` | Ranking shared by command palette and mentions. |
| service | Keybindings | `apps/cli/src/keybindings.rs` | Actions, defaults, parse, validate, hints, help text (keybindings.rs:1-593). |
| config | ui.keybindings | `apps/cli/src/config.rs` | Config field, merge, validation and get/set (config.rs:171, 968-969, 1437, 1480-1482). |
| command | /keybindings, /keys | `apps/cli/src/tui/tui_app.rs` | Prints bindings (tui_app.rs:6704-6706). |
| service | composer_edits | `apps/cli/src/tui/composer_edits.rs` | Undo, redo, external editor key. |
| component | CommandPopup | `apps/cli/src/tui/widgets/command_popup.rs` | Command palette opened by `/`. |
| service | open_command_popup | `apps/cli/src/tui/tui_app.rs` | Builds palette entries from the registry plus TUI-only entries (tui_app.rs:4495-4535). |
| service | command_registry | `apps/cli/src/command_registry.rs` | Documents Ctrl+R for the line mode (command_registry.rs:281-282). |
| service | REPL line editor | `apps/cli/src/repl/mod.rs` | Line mode with Ctrl+R history search (repl/mod.rs:236, 1070). |
| service | path_security and sensitive_files | `apps/cli/src/path_security.rs` | Workspace path validation and credential file checks used by mention expansion (mentions.rs:326-345). |
| test | keybindings tests | `apps/cli/src/keybindings.rs` | Defaults, overrides, validation (keybindings.rs:362-593). |
| test | mention tests | `apps/cli/src/mentions.rs` | Ranking, bounded walk, parsing (mentions.rs:499-738). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A key event is read and dispatched; global actions are matched against the loaded bindings. | device | apps/cli/src/tui/tui_app.rs:3876-4140 |
| Up or Down reads in-memory history loaded from history.txt. | device | apps/cli/src/tui/prompt_history.rs:15-30, 75-95 |
| `@` lists files with `git ls-files` (3 s timeout) or a bounded walk, then ranks them locally. | device | apps/cli/src/mentions.rs:20-100 |
| On send, mentions are validated against the workspace, checked for credentials and size, and the file text is added to the prompt only in a trusted folder. | device | apps/cli/src/mentions.rs:296-420, apps/cli/src/tui/tui_app.rs:4541-4545 |
| The expanded prompt goes to the session's model route; file text can leave the device if the route is own key or Cloud. | device and our servers | apps/cli/src/tui/tui_app.rs:4541-4600 (expansion before send); route see SYS-execution-boundaries |
| The prompt is appended to history.txt. | device | apps/cli/src/tui/prompt_history.rs:52-65 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Prompt text | history.txt in the config folder (AGIWORKFORCE_HOME or ~/.agiworkforce) (apps/cli/src/tui/prompt_history.rs:15-18, apps/cli/src/config.rs:480-484) | No sync found in the code | Appended forever; no delete or clear command found in prompt_history.rs. |
| Key bindings | [ui.keybindings] in config.toml, global or project (apps/cli/src/config.rs:171, 968-969) | Not synced by this feature | Until edited. |
| Inlined file text | Inside the message sent to the model and then in the saved session | Pushed to the account only for Managed sessions (apps/cli/src/agent/mod.rs:2749-2760) | As the session (see F072-03). |

**Models and providers.** The feature is model-agnostic. Mentioned text goes wherever the session route sends the prompt: a local server, the user's provider key, or AGI Cloud. Which of the three applies is a property of the session, not of the mention code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None needed for keys, history or mentions. |
| Permissions | File contents are read only inside the workspace, never for credential files, and only when the folder is trusted (apps/cli/src/mentions.rs:296-345). Project keybindings are validated so a project config cannot bind a plain character to send or approve (apps/cli/src/keybindings.rs:1-6). |
| Subscription | None found in the code. |
| Limits and metering | Inlined files are limited to 256 KB each, 200 directory entries, 20,000 candidates (apps/cli/src/mentions.rs:20-35). Tokens from inlined text are counted like any other prompt text (see F072-05). |
| Feature flags | None found for these features beyond config keys. |
| Model compatibility | Images and documents mentioned are staged as attachments; whether the chosen model can read them is checked elsewhere (apps/cli/src/tui/tui_app.rs:4548-4560); model support not traced here. |
| Provider restrictions | None found in the mention code. Provider and boundary rules apply to the whole prompt. |
| Local mode | Everything on this page works with no account. With a Local model the mentioned text stays on the device. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No history yet | Up does nothing, then scrolls the transcript. | apps/cli/src/tui/prompt_history.rs:75-88, apps/cli/src/tui/tui_app.rs:4179-4195 |
| history.txt unreadable or unwritable | A warning is logged through tracing; the run continues. | apps/cli/src/tui/prompt_history.rs:22-28, 58-64 |
| No files to mention | Status notice `no workspace files to mention`. | apps/cli/src/tui/tui_app.rs:4597-4599 |
| Mention not found or outside workspace | Skipped with a reason and shown as a system line. | apps/cli/src/mentions.rs:312-326, apps/cli/src/tui/tui_app.rs:4565-4577 |
| Huge repo | List capped at 20,000; git listing times out after 3 s then the bounded walk runs. | apps/cli/src/mentions.rs:20-45 |
| Rebind collision or unsafe key | Config load fails with a message naming the key. | apps/cli/src/keybindings.rs:195-250, apps/cli/src/config.rs:1437 |
| Ctrl+C or Ctrl+D with text in the composer | The draft is parked, not lost; Up brings it back. | apps/cli/src/tui/tui_app.rs:1133-1148, 3936-3970 |
| Cancel while a turn runs | Esc or Ctrl-C cancels the turn (hint text); Ctrl+D quits at once. | apps/cli/src/tui/tui_app.rs:2064-2078, 3915-3922 |
| Accessibility | Plain and screen-reader mode use the line REPL, which has its own Ctrl+R search; the full-screen keys do not apply there. | apps/cli/src/lib.rs:8290-8300, apps/cli/src/repl/mod.rs:1070 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/keybindings.rs`: Default bindings match terminal events, custom bindings, validation of unknown or unsafe or duplicate bindings, BackTab spellings, hints, cycle_model default Alt+P (lines 362-593).
- `apps/cli/src/mentions.rs`: Ranking, bounded walk fallback, cursor query, parsing, punctuation, quoting (lines 499-738).
- `apps/cli/src/tui/widgets/mention_popup.rs`: Popup list, narrowing, Enter, Backspace past @, Esc, capped rows (lines 158-250).
- `apps/cli/src/tui/tui_app.rs`: A mention chosen mid-message keeps the text after the cursor (line 10734); a cleared draft returns only in its session (line 10880); expand_mentions with trust true (line 10758).
- `apps/cli/src/tui/prompt_history.rs`: No tests in this file; an in-memory constructor exists for tests elsewhere (prompt_history.rs:41-49).

**Test scenarios**

- **History survives restart**
  1. Run `agi`, send `alpha prompt`, quit.
  2. Run `agi` again, press Up on an empty composer.
  - Expected: `alpha prompt` appears in the composer.
- **Mention in trusted folder**
  1. In a trusted repo run `agi`.
  2. Type `summarise @README` and choose README.md.
  3. Send.
  - Expected: The reply refers to the file text.
- **Mention in untrusted folder**
  1. In a folder not trusted, repeat the mention.
  - Expected: System line `README.md was not inlined: workspace is not trusted, only the path was sent`.
- **Credential file**
  1. Mention a `.env` file.
  - Expected: Skip line `holds credentials, only the path was sent`.
- **Rebind palette**
  1. Add `[ui.keybindings]` `open_palette = "ctrl+p"`.
  2. Run `agi`, press Ctrl+P, then run /keybindings.
  - Expected: Palette opens and /keybindings lists `Ctrl+P` for the palette.
- **Two-step exit**
  1. Press Ctrl+C on an empty composer, then again after 3 seconds.
  - Expected: The second press is treated as a new first press (window is 2 seconds) and does not quit.

**Where to look when it fails**

- tracing warnings `prompt history at <path> could not be read` or `could not be saved`.
- Config load error text beginning `ui.keybindings.`
- System lines `<path> was not inlined: <reason>`.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **The brief's S72.24 allows history search; the full-screen screen has no search, only Up and Down.** Affects: surface:cli full-screen users.. Evidence: apps/cli/src/tui/tui_app.rs:4179-4200, apps/cli/src/command_registry.rs:281-282. Work needed: Add a search overlay or mark Ctrl+R as line-mode only in the brief.
- **The brief says mentioned files are inlined; in an untrusted folder they are not.** Affects: surface:cli users in folders they have not trusted.. Evidence: apps/cli/src/mentions.rs:296-315. Work needed: Update the brief and show a one-time hint telling the user to trust the folder.
- **No way found to keep a prompt out of history.txt or to clear it; prompts with secrets stay on disk.** Affects: surface:cli users who paste sensitive text.. Evidence: apps/cli/src/tui/prompt_history.rs:52-65. Work needed: Add an opt-out and a clear command, with a confirmation that names what is lost.
- **prompt_history.rs has no tests of its own.** Affects: Maintainers.. Evidence: apps/cli/src/tui/prompt_history.rs (no test module). Work needed: Add tests for load, record, older, newer and a failed write.
- **/keybindings omits several fixed keys that work.** Affects: surface:cli users looking for Ctrl+J, Ctrl+U, Ctrl+V, Ctrl+O.. Evidence: apps/cli/src/keybindings.rs:157-187 vs apps/cli/src/tui/tui_app.rs:4020-4125. Work needed: Add them to render_help.

**Depends on**

- surface:cli
- file:apps/cli/src/keybindings.rs
- file:apps/cli/src/mentions.rs
- file:apps/cli/src/tui/prompt_history.rs
- store:history.txt
- mode:local
- mode:own-key
- mode:cloud
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-execution-boundaries
- F072-01

## Unknown

- How history.txt stores a multi-line prompt (rustyline file history format); not checked.
- Exact syntax of a line-range suffix on a mention (a split_line_range helper exists, mentions.rs:~330).
- Whether a workspace trust prompt appears on first launch in a new folder; invocation_requires_project_trust exists (lib.rs:~1833) but was not traced.
- Whether history.txt is shared between the line REPL and the full-screen screen: both use config_dir/history.txt (repl/mod.rs:236, prompt_history.rs:15-18), so likely yes.
