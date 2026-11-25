---
id: "GAPS-AREA-072"
type: "gap-list"
title: "Gaps: CLI and terminal application"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 72. CLI and terminal application

84 open gaps that touch this area. Area page: [20-features/072-cli-and-terminal-application](../../20-features/072-cli-and-terminal-application/README.md).

## CMP-C387

**Homebrew install**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: A Homebrew formula script exists but writes to a private tap and is not offered to users.
- Evidence: scripts/update-homebrew-tap.sh; docs/runbooks/cli-release.md:57-66

## CMP-C388

**Native Windows installer (PowerShell, CMD or WinGet)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: The script needs Git Bash, MSYS2, Cygwin or WSL; PowerShell and cmd cannot run it, and there is no WinGet package.
- Evidence: apps/web/public/install.sh:11-12; docs/runbooks/cli-release.md:57-66

## CMP-C389

**npm install**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: No npm package; the CLI is published only as release archives and the script.
- Evidence: searched: npm in docs/runbooks/cli-release.md install channels; apps/cli/Cargo.toml publish = false

## CMP-C390

**Public page shows the install command**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: The CLI is still marked Coming soon on the site, so /cli and /download do not show the install command although v0.0.1 is published.
- Evidence: apps/web/lib/surface-status.ts:9

## CMP-C391

**Admin version floor and ceiling (minimum and maximum version)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Managed policy cannot hold a version limit and agi update cannot be pinned.
- Evidence: searched: minimum_version, required_min, requiredMaximumVersion in apps/cli/src/platform/policy, update_check.rs

## CMP-C392

**Alpine and other musl Linux**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: install.sh refuses musl Linux because builds need glibc 2.35 or newer.
- Evidence: apps/web/public/install.sh:112

## CMP-C394

**Linux package repositories (apt, dnf, apk)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: No apt, dnf or apk repository; Linux users use the script or the tar.gz archive.
- Evidence: docs/runbooks/cli-release.md:57-66

## CMP-C395

**Package-manager installs update themselves (Homebrew, WinGet)**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: When the binary is owned by Homebrew, Nix, cargo or snap, agi update only tells the user to use that tool; it never runs the package manager.
- Evidence: apps/cli/src/update_check.rs:267-290 (package_manager_owning)

## CMP-C400

**Uninstall command and instructions**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: No agi uninstall command or documented removal steps; only plugins and logout have remove paths.
- Evidence: searched: uninstall in apps/cli/src/lib.rs, apps/cli/README.md, apps/web/public/install.sh

## CMP-CP256

**Background auto-update**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Nothing updates itself agi checks for a newer release at start and prints a notice; agi update --install replaces the binary after you confirm. Nothing updates itself.
- Evidence: apps/cli/src/update_check.rs:135-154; apps/cli/src/lib.rs:6516

## CMP-CP258

**Installer variables for scripted installs: non-interactive mode and install folder**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: There are no environment-variable forms install.sh takes --version, --install-dir and --no-modify-path as flags and never prompts; there are no environment-variable forms.
- Evidence: apps/web/public/install.sh:5-8,56-72

## CMP-CP68

**Fork a session into a background copy**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: It does not start a background copy or a subtask row Ours /fork branches the conversation in the foreground; it does not start a background copy or a subtask row.
- Evidence: apps/cli/src/repl/slash_commands.rs:491; apps/cli/src/tui/tui_app.rs:5955

## CMP-WP200

**Fork a coding session from the browser**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: No fork was found for cloud coding sessions Device-local sessions can be forked; no fork was found for cloud coding sessions.
- Evidence: apps/web/features/code/CloudCodePage.tsx:1876; apps/web/features/code/components/LocalSessionPanel.tsx:442

## GAP-AREA072-LW05

**Interrupt exits with code 130, which is outside the documented exit contract (1, 65, 69, 75, 76, 77, 78).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-072
- Detail: Area 72. CLI and terminal application
- Evidence: apps/cli/src/lib.rs:8633-8637

## GAP-AREA072-LW08

**Stale dead-code allowances. load_merged and load_project_config carry #[allow(dead_code)], but load_merged is called at runtime from the main run path. The annotation hides nothing.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-072
- Detail: Area 72. CLI and terminal application
- Evidence: apps/cli/src/config.rs:526-527 and :688-689; apps/cli/src/lib.rs:6186

## GAP-AREA072-LW09

**sessions::open_db is a name for a folder-based store, not a database. It creates folders and JSON files under the config folder.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-072
- Detail: Area 72. CLI and terminal application
- Evidence: apps/cli/src/sessions.rs:205-235

## GAP-CAP-apps-and-install-10

**Command-line install paths: Native Windows installer, package managers, uninstall, public install page.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Requirement items: S72.35
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-apps-and-install-11

**Command-line update, pinning and disabling: No silent background apply and no version pin.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Requirement items: S72.35
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-09

**Branch a conversation into a new chat from a message: Mobile code ships Branch Conversation from Here although decision D-2026-09-28-15 keeps branching off the phone. Chrome has none. A web console 404 on the branches request was seen on the first turn.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-07](../../20-features/016-user-message-components/F016-07-branch-from-here.md), [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Requirement items: S16.10, S17.27, S62.17, S72.13
- Detail: Claude no, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-17

**Fork or branch a coding session: Background fork is missing on web, desktop, mobile. Web fork is partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md), [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Requirement items: S62.16, S62.17, S72.13
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F072-01-01

**No test sends a real resize event; the brief marks resize as done but the proof is a draw into a test buffer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-01](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)
- Detail: Affects: surface:cli users who resize while a turn is streaming.. Work needed: Add a loop-level test or a recorded terminal test with a resize event, including during a streamed turn.
- Evidence: apps/cli/src/tui/tui_app.rs:7283-7290 and 11638-11660

## GAP-F072-01-02

**Theme is saved to the project config, so it is not remembered in other folders, and a new `.agiworkforce` folder is created in whatever directory the user is in.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-01](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)
- Detail: Affects: surface:cli users who work in many folders.. Work needed: Decide whether theme belongs in user config; save there when there is no project config.
- Evidence: apps/cli/src/config.rs:1162-1195

## GAP-F072-01-03

**The solarized spellings are accepted but only map to Dark and Light.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-01](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)
- Detail: Affects: surface:cli users who type /theme solarized-dark.. Work needed: Either add real themes or reject the names.
- Evidence: apps/cli/src/tui/widgets/theme_picker.rs:93-94

## GAP-F072-01-04

**Plain and screen-reader users never get this screen; they get the line mode, which has a different command set (for example it has Ctrl+R search).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-01](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)
- Detail: Affects: surface:cli users who need plain mode.. Work needed: Confirm parity between the two modes and record the differences in docs.
- Evidence: apps/cli/src/lib.rs:8290-8300, apps/cli/src/command_registry.rs:281-282

## GAP-F072-01-05

**The decision log says the TUI /background command was cut, but the code has it again as a durable hand-off.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-01](../../20-features/072-cli-and-terminal-application/F072-01-full-screen-terminal-chat-screen.md)
- Detail: Affects: Engineers reading docs/decisions/wire-or-cut.md.. Work needed: Update the decision row to match the current code.
- Evidence: docs/decisions/wire-or-cut.md:55, apps/cli/src/tui/tui_app.rs:5960

## GAP-F072-02-01

**The brief's S72.24 allows history search; the full-screen screen has no search, only Up and Down.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-02](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)
- Detail: Affects: surface:cli full-screen users.. Work needed: Add a search overlay or mark Ctrl+R as line-mode only in the brief.
- Evidence: apps/cli/src/tui/tui_app.rs:4179-4200, apps/cli/src/command_registry.rs:281-282

## GAP-F072-02-02

**The brief says mentioned files are inlined; in an untrusted folder they are not.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-02](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)
- Detail: Affects: surface:cli users in folders they have not trusted.. Work needed: Update the brief and show a one-time hint telling the user to trust the folder.
- Evidence: apps/cli/src/mentions.rs:296-315

## GAP-F072-02-03

**No way found to keep a prompt out of history.txt or to clear it; prompts with secrets stay on disk.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-02](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)
- Detail: Affects: surface:cli users who paste sensitive text.. Work needed: Add an opt-out and a clear command, with a confirmation that names what is lost.
- Evidence: apps/cli/src/tui/prompt_history.rs:52-65

## GAP-F072-02-04

**prompt_history.rs has no tests of its own.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-02](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)
- Detail: Affects: Maintainers.. Work needed: Add tests for load, record, older, newer and a failed write.
- Evidence: apps/cli/src/tui/prompt_history.rs (no test module)

## GAP-F072-02-05

**/keybindings omits several fixed keys that work.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-02](../../20-features/072-cli-and-terminal-application/F072-02-keys-composer-and-file-mentions.md)
- Detail: Affects: surface:cli users looking for Ctrl+J, Ctrl+U, Ctrl+V, Ctrl+O.. Work needed: Add them to render_help.
- Evidence: apps/cli/src/keybindings.rs:157-187 vs apps/cli/src/tui/tui_app.rs:4020-4125

## GAP-F072-03-01

**The brief says export goes to a file or the clipboard; there is no clipboard write.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: Affects: surface:cli users who want to paste a transcript.. Work needed: Add a clipboard path (or an --clipboard form) and test it, or correct the brief.
- Evidence: apps/cli/src/tui/tui_app.rs:6033-6043, apps/cli/src/repl/registry.rs:433-471

## GAP-F072-03-02

**Export joins the typed path onto the workspace root with no containment check, so an absolute path or `..` can write outside the workspace.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: Affects: surface:cli users and anyone scripting /export.. Work needed: Validate the target with the workspace path rules used by mentions, or document that any writable path is allowed.
- Evidence: apps/cli/src/repl/registry.rs:446-452 (join of expand_home(path) to the workspace root, create_new open)

## GAP-F072-03-03

**No test covers the file-writing path of /export (exists, new, error).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: Affects: Maintainers.. Work needed: Add tests for new file, existing file and unwritable directory.
- Evidence: apps/cli/src/repl/registry.rs:626-705 tests cover the display path only

## GAP-F072-03-04

**The TUI /resume cannot resume an account conversation; the shell can.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: Affects: surface:cli full-screen users in Managed mode.. Work needed: Route `--cloud` through the same adoption path in the screen.
- Evidence: apps/cli/src/tui/tui_app.rs:4345-4391 versus apps/cli/src/lib.rs:2513-2535

## GAP-F072-03-05

**Documentation contradicts code: the sessions module header says the CLI never reads or writes synced app chat tables and does not sync chat history, but the code pushes Managed sessions to the account and lists account conversations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: Affects: Engineers and testers reading the header.. Work needed: Decide the rule and update either the header or the code; keep the requirement that Local and own-key sessions never sync.
- Evidence: apps/cli/src/sessions.rs:12-30 versus apps/cli/src/agent/mod.rs:2749-2760 and apps/cli/src/cloud/mod.rs:325-396

## GAP-F072-03-06

**`agi session fork --force` overwrites an existing session and `/delete` and `agi session delete` remove a session permanently; the repository rule says an agent never destroys user data on its own and expects Trash or Recently deleted.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-03](../../20-features/072-cli-and-terminal-application/F072-03-saved-sessions-list-resume-fork-export.md)
- Detail: Affects: surface:cli users.. Work needed: Confirm that these are explicit user actions (they are named commands with a confirmation) and whether archive-first is wanted.
- Evidence: apps/cli/src/lib.rs:5718-5726, apps/cli/src/repl/registry.rs:368-416, doc: AGENTS.md section 9

## GAP-F072-04-01

**The brief says /effort only changes the next request; the code also saves it as the project default.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-04](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)
- Detail: Affects: surface:cli users who expect a one-off change.. Work needed: Decide the intended behaviour and update the brief or add a session-only form.
- Evidence: apps/cli/src/tui/tui_app.rs:6452-6470, apps/cli/src/config.rs:1144-1160

## GAP-F072-04-02

**The brief lists four effort levels; the code has seven.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-04](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)
- Detail: Affects: Testers using the brief.. Work needed: Correct the brief.
- Evidence: apps/cli/src/design_system.rs:404-412

## GAP-F072-04-03

**If the project config cannot be written, `/effort` hides the failure.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-04](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)
- Detail: Affects: surface:cli users in read-only folders.. Work needed: Report the save failure the way /theme does.
- Evidence: apps/cli/src/tui/tui_app.rs:6466-6470

## GAP-F072-04-04

**`/permissions` is not tabbed in the screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-04](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)
- Detail: Affects: surface:cli full-screen users.. Work needed: Add tabs or document the sub-commands.
- Evidence: apps/cli/src/repl/registry.rs:803-860

## GAP-F072-04-05

**A Local session's switch_model has no trust check, unlike established Managed and own-key sessions.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-04](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)
- Detail: Affects: surface:cli users in Local mode.. Work needed: Confirm that a Local-to-own-key or Local-to-cloud switch is blocked or consent-gated at send time (see AGENTS.md section 6), and add a test.
- Evidence: apps/cli/src/agent/mod.rs:1144

## GAP-F072-04-06

**No test found for the tier lock on model picker rows or for `--auto` conflicts.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-04](../../20-features/072-cli-and-terminal-application/F072-04-model-effort-and-permission-controls.md)
- Detail: Affects: Cloud users below the required tier.. Work needed: Add tests for locked rows and the CLI flag conflict.
- Evidence: apps/cli/src/tui/widgets/model_picker.rs:206-214

## GAP-F072-05-01

**The brief says the usage numbers come from the shared usage ledger; the CLI reads `/api/usage` and does not show Local or own-key spend beyond a catalog-price estimate.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-05](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)
- Detail: Affects: surface:cli users in Local or own-key mode.. Work needed: State in the brief that account numbers are Cloud only, and decide what Local usage should show.
- Evidence: apps/cli/src/usage_summary.rs:343-356, 497-503

## GAP-F072-05-02

**Discovered local models have window 0 in the picker catalog, so context percent uses a 128,000 assumption.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-05](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)
- Detail: Affects: surface:cli users with local models.. Work needed: Read the real window from the local server or label the number as assumed.
- Evidence: apps/cli/src/tui/tui_app.rs:3395, apps/cli/src/compaction.rs:28-35

## GAP-F072-05-03

**`/usage` has no loading indicator while it waits.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-05](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)
- Detail: Affects: surface:cli users on slow networks.. Work needed: Show a working line or time-bound the call.
- Evidence: apps/cli/src/usage_summary.rs:540-555

## GAP-F072-05-04

**No test found that `/compact` surfaces a model failure or a Local model that cannot summarise.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-05](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)
- Detail: Affects: surface:cli users in Local mode.. Work needed: Add failure-path tests.
- Evidence: apps/cli/src/compaction.rs:354-376 tests cover receipts only

## GAP-F072-05-05

**The brief's line numbers for these items no longer match the file; the real handlers are at different lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-05](../../20-features/072-cli-and-terminal-application/F072-05-context-usage-and-compaction.md)
- Detail: Affects: Engineers following the brief.. Work needed: Refresh the brief's code references.
- Evidence: brief S72.17-S72.19 versus apps/cli/src/tui/tui_app.rs:5820, 5995, 6498

## GAP-F072-06-01

**`/tasks` does not show `agi background` runs, while the brief describes one place to list, inspect and stop background tasks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: surface:cli users with several kinds of background work.. Work needed: Merge the two lists or point `/tasks` output to `agi background list`.
- Evidence: apps/cli/src/repl/registry.rs:484-520 versus apps/cli/src/lib.rs:1731-1757

## GAP-F072-06-02

**The decision log still says `/background` and `/bg` were cut.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: Engineers reading docs/decisions/wire-or-cut.md.. Work needed: Update the decision log to the current code.
- Evidence: docs/decisions/wire-or-cut.md:55 versus apps/cli/src/tui/tui_app.rs:5960

## GAP-F072-06-03

**Background runs carry no spend or time cap from `agi background start`.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: surface:cli users running Cloud models unattended.. Work needed: Pass `--max-budget-usd` or a plan-based cap and show it at start.
- Evidence: apps/cli/src/background.rs:246-262

## GAP-F072-06-04

**`agi background rm` and `agi plugin remove` delete data permanently with no confirmation that names the loss.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: surface:cli users.. Work needed: Confirm with a consequence line, or move to Trash first.
- Evidence: apps/cli/src/background.rs:586-606, doc: AGENTS.md section 9

## GAP-F072-06-05

**The brief gives the registry as `~/.agiworkforce/mcp.json`; the path is the config folder, which AGIWORKFORCE_HOME can move.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: Testers.. Work needed: State the default and the override in the brief.
- Evidence: apps/cli/src/mcp/registry.rs:63-67, apps/cli/src/config.rs:480-484

## GAP-F072-06-06

**`/skills` toggle exists only as `/skills-toggle`, which the brief does not name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: Testers following S72.21.. Work needed: Update the brief.
- Evidence: apps/cli/src/tui/tui_app.rs:4503-4527, 6169-6215

## GAP-F072-06-07

**The Marketplaces tab behaviour and `agi marketplace` were not verified here.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-06](../../20-features/072-cli-and-terminal-application/F072-06-tools-skills-plugins-and-background-runs.md)
- Detail: Affects: surface:cli plugin users.. Work needed: Trace and document the marketplace flow.
- Evidence: apps/cli/src/tui/tui_app.rs:6292-6325

## GAP-F072-07-01

**`agi exec` ignores --output-format, --raw, --print and returns a thinner JSON object.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-07](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)
- Detail: Affects: surface:cli scripts using exec. Work needed: Route exec through run_oneshot or share the result builder.
- Evidence: apps/cli/src/lib.rs:6239-6490, 6438-6457

## GAP-F072-07-02

**`-p` is --provider, not print; the brief and draft say `agi -p "..."`.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-07](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)
- Detail: Affects: surface:cli users coming from other coding CLIs. Work needed: Decide the meaning of -p and update docs or the flag.
- Evidence: apps/cli/src/lib.rs:195, 292-294

## GAP-F072-07-03

**JSON mode failure goes to stderr only, stream-json on stdout; inconsistent error contract.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-07](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)
- Detail: Affects: surface:cli CI users. Work needed: Pick and document one rule.
- Evidence: apps/cli/src/lib.rs:9385-9411, 9455-9461

## GAP-F072-07-04

**Two event schemas (--json-events and stream-json) with no shared documentation.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-07](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)
- Detail: Affects: surface:cli integrators. Work needed: Document both; consider retiring one.
- Evidence: apps/cli/src/agent_events.rs:20-90; apps/cli/src/sdk_io/protocol.rs:12-95

## GAP-F072-07-05

**Top-level --json-events without exec is undefined.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-07](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)
- Detail: Affects: surface:cli. Work needed: Trace and either support or reject it.
- Evidence: apps/cli/src/lib.rs:9238-9250

## GAP-F072-07-06

**No integration test exercises run_oneshot json or stream-json against a real binary.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-07](../../20-features/072-cli-and-terminal-application/F072-07-one-shot-and-scripted-runs-with-output-formats.md)
- Detail: Affects: surface:cli. Work needed: Add binary-level tests with a local fake route.
- Evidence: apps/cli/tests/ lists only json_events_jsonl.rs for events

## GAP-F072-08-01

**Budget stop has no distinct exit status and no machine event in text or json modes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-08](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)
- Detail: Affects: surface:cli CI users using --max-budget-usd. Work needed: Define the status and event; add a test.
- Evidence: crates/agiworkforce-agent-core/src/engine.rs:79-87; apps/cli/src/lib.rs:9246-9250

## GAP-F072-08-02

**Statuses 130, 141 and `update --check` 1 are outside the stated contract.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-08](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)
- Detail: Affects: surface:cli scripts. Work needed: Document them or fold them into the contract.
- Evidence: apps/cli/src/lib.rs:8633-8637, 6573-6578; apps/cli/src/broken_pipe.rs:7

## GAP-F072-08-03

**Untrusted-folder failure has no class (likely 1) though it needs user action like 78.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-08](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)
- Detail: Affects: surface:cli CI. Work needed: Return a CliError::Config.
- Evidence: apps/cli/src/lib.rs:6160-6167

## GAP-F072-08-04

**`agi doctor` always exits 0.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-08](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)
- Detail: Affects: surface:cli CI health checks. Work needed: Optional strict flag.
- Evidence: apps/cli/src/doctor.rs:49-57

## GAP-F072-08-05

**No binary-level test of exit statuses.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-08](../../20-features/072-cli-and-terminal-application/F072-08-exit-codes-and-ci-automation.md)
- Detail: Affects: surface:cli. Work needed: Add tests that spawn the binary.
- Evidence: apps/cli/tests/ has no exit-code test

## GAP-F072-09-01

**NO_COLOR alone does not remove colour in the full-screen screen.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-09](../../20-features/072-cli-and-terminal-application/F072-09-plain-and-screen-reader-output-no-colour.md)
- Detail: Affects: surface:cli users who set NO_COLOR. Work needed: Read NO_COLOR in the palette code.
- Evidence: apps/cli/src/tui/icons.rs:33-36 is the only tui read; no other NO_COLOR use under apps/cli/src/tui

## GAP-F072-09-02

**Screen-reader labels do not apply to one-shot or subcommand runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-09](../../20-features/072-cli-and-terminal-application/F072-09-plain-and-screen-reader-output-no-colour.md)
- Detail: Affects: surface:cli screen-reader users running subcommands. Work needed: Decide whether subcommand output needs labels; document the rule.
- Evidence: apps/cli/src/lib.rs:5974-5980

## GAP-F072-09-03

**No end-to-end test that plain mode starts the line REPL.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-09](../../20-features/072-cli-and-terminal-application/F072-09-plain-and-screen-reader-output-no-colour.md)
- Detail: Affects: surface:cli. Work needed: Add a binary test.
- Evidence: no test found for apps/cli/src/lib.rs:8295

## GAP-F072-09-04

**No evidence a real screen reader was used to verify the mode.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-09](../../20-features/072-cli-and-terminal-application/F072-09-plain-and-screen-reader-output-no-colour.md)
- Detail: Affects: surface:cli. Work needed: Run a manual pass with a screen reader and record it.
- Evidence: no test or doc records it

## GAP-F072-10-01

**Headless runs in an untrusted folder fail instead of using global-only config.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-10](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)
- Detail: Affects: surface:cli CI. Work needed: Decide the fallback and exit class.
- Evidence: apps/cli/src/lib.rs:6160-6167

## GAP-F072-10-02

**Copy in errors.rs describes a vendor sign-in for openai and anthropic that the code does not offer.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-10](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)
- Detail: Affects: surface:cli users. Work needed: Align copy or implement.
- Evidence: apps/cli/src/errors.rs:495-499 vs apps/cli/src/auth.rs:1276-1279

## GAP-F072-10-03

**The brief and draft cite /config as showing effective settings; `/config` is documented but the exact display of managed overrides was not traced.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-10](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)
- Detail: Affects: surface:cli. Work needed: Trace and test.
- Evidence: apps/cli/src/config.rs:1291 display; not read in full

## GAP-F072-10-04

**No browser-less alternative to device sign-in other than AGIWORKFORCE_JWT.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-10](../../20-features/072-cli-and-terminal-application/F072-10-sign-in-settings-folders-and-environment.md)
- Detail: Affects: surface:cli headless machines. Work needed: Document the token route.
- Evidence: apps/cli/src/app_server/account.rs:122

## GAP-F072-11-01

**No signed release is confirmed published; surface status says Coming soon.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Affects: surface:cli all new users. Work needed: Owner sets AGI_CLI_RELEASE_SIGNING_KEY in the cli-release environment, publishes the first signed release (doc: docs/runbooks/cli-release.md), then updates the status.
- Evidence: apps/web/lib/surface-status.ts:9; doc: audit/partial/072-cli-and-terminal-application.md

## GAP-F072-11-02

**`agi update --install` does not support Windows.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Affects: surface:cli Windows users. Work needed: Add a Windows swap path.
- Evidence: apps/cli/src/update_check.rs:196-203, 243-253

## GAP-F072-11-03

**`doctor` cannot fail a script.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Affects: surface:cli CI. Work needed: Strict exit option.
- Evidence: apps/cli/src/doctor.rs:49-57

## GAP-F072-11-04

**`--check` exits 1 for outdated, the same as generic failure.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Affects: surface:cli CI. Work needed: Document or change.
- Evidence: apps/cli/src/lib.rs:6573-6578

## GAP-F072-11-05

**No test spawns the CLI to verify `update` or `completion` output end to end.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Detail: Affects: surface:cli. Work needed: Add binary tests.
- Evidence: apps/cli/tests lists none

## GAP-F072-11-PARTLY

**Install, update, diagnostics and shell completion: partly built on CLI**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F072-11](../../20-features/072-cli-and-terminal-application/F072-11-install-update-diagnostics-and-shell-completion.md)
- Requirement items: S72.35
- Detail: CLI S72.35: Owner only: set AGI_CLI_RELEASE_SIGNING_KEY, publish the first signed release, then mark the CLI available (surface-status.ts:7).

## GAP-F072-12-01

**Teleport copies; it does not keep the cloud session and terminal in step.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-12](../../20-features/072-cli-and-terminal-application/F072-12-remote-session-attachment.md)
- Detail: Affects: surface:cli users expecting `attach`. Work needed: Define the rule; add a push-back or reword.
- Evidence: apps/cli/src/lib.rs:2668-2672

## GAP-F072-12-02

**Relay host reachability for Remote Control is blocked by a founder action.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-12](../../20-features/072-cli-and-terminal-application/F072-12-remote-session-attachment.md)
- Detail: Affects: surface:cli and surface:mobile Remote Control. Work needed: Point the relay hostname at the working app and verify pairing.
- Evidence: doc: audit/decisions/founder-actions.md:277-287

## GAP-F072-12-03

**Surface-feature matrix says CLI remote control is absent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-12](../../20-features/072-cli-and-terminal-application/F072-12-remote-session-attachment.md)
- Detail: Affects: documentation readers. Work needed: Regenerate the matrix.
- Evidence: doc: docs/product/surface-feature-matrix.md:562-570 vs apps/cli/src/lib.rs:6659

## GAP-F072-12-04

**Teleport supports GitHub repositories only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-12](../../20-features/072-cli-and-terminal-application/F072-12-remote-session-attachment.md)
- Detail: Affects: surface:cli users of other hosts. Work needed: Extend or document.
- Evidence: apps/cli/src/cloud/code_teleport.rs:119-128

## GAP-F072-12-05

**No run record of a real teleport or pairing in the repo.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F072-12](../../20-features/072-cli-and-terminal-application/F072-12-remote-session-attachment.md)
- Detail: Affects: surface:cli. Work needed: Run both scenarios and record the result.
- Evidence: no file records one
