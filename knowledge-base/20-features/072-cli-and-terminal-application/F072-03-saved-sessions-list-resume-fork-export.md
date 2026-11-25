---
id: "F072-03"
type: "feature"
title: "Saved sessions: list, resume, fork, export"
aliases: ["Session list", "S72.11", "Resume command", "S72.12", "Branch command", "S72.13", "Export transcript", "S72.32", "/history", "/sessions", "/resume", "/fork", "/branch", "/export", "agi history", "agi resume", "agi fork", "agi session"]
area: "72 CLI and terminal application"
available_on: ["cli"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S72.11", "S72.12", "S72.13", "S72.32"]
depends_on: ["surface:cli", "mode:local", "mode:own-key", "mode:cloud", "api:POST /api/chat/sync", "api:GET /api/chat/conversations", "file:apps/cli/src/sessions.rs", "file:apps/cli/src/platform/runtime/session_control.rs", "file:apps/cli/src/repl/registry.rs", "SYS-sync-and-continuity", "SYS-memory-projects-and-context", "SYS-authentication-and-identity", "SYS-execution-boundaries", "SYS-data-model-and-migrations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F072-03 Saved sessions: list, resume, fork, export

Saved conversations in the CLI: list them (`/history`, `agi history`, `agi session list`), resume one (`/resume`, `agi resume [id] [--cloud]`, `-c`), branch one (`/fork`, `agi fork`, `agi session fork --at-turn`), and export a transcript (`/export`). Sessions live as files on the device; Managed sessions also appear in the account.

Area: [72. CLI and terminal application](README.md). Requirement items: [S72.11](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7211), [S72.12](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7212), [S72.13](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7213), [S72.32](../../10-requirements/capabilities/072-cli-and-terminal-application.md#s7232).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a user find an earlier terminal conversation, continue it, fork it into a new one, or write it to a file. Also lists and resumes conversations stored in the AGI account when the session mode is Managed.

**Why it exists.** The requirements list sessions, resume and branch as CLI features (doc: docs/product/requirements.md:1157-1178). The brief asks for list, resume, branch and export (doc: knowledge-base/data/area-briefs/072-cli-and-terminal-application.md S72.11, S72.12, S72.13, S72.32).

**Who uses it.** Developers who return to long tasks, want to try a different approach from a past point, or need a record of what the agent said.

**Problems it solves**

- Losing context when the terminal closes.
- Trying an alternative without changing the original conversation.
- Saving an answer or transcript to a file.
- Continuing a conversation started on another device in the same account.

**Use cases**

- `agi -c` continues yesterday's work in this repo.
- `/fork before-refactor` branches the current chat to try a second plan.
- `/export md notes/chat.md` writes a Markdown transcript.
- `agi resume --cloud <id>` picks up a conversation held in the account.

## 2. User experience

**Where to find it**

- surface:cli full-screen screen: `/history` or `/sessions` open a session picker; `/resume` opens it, `/resume <id>` resumes directly; `/fork` or `/branch [name]`; `/export [md|json|answer] [path]` (apps/cli/src/tui/tui_app.rs:5997-6052).
- surface:cli shell: `agi history [--limit N] [--cloud] [--project <p>]`, `agi resume [id] [--cloud|--teleport]`, `agi fork <id>`, `agi -c`/`--continue`, `agi --resume <id>`, `agi --session <id>`, `--fork-session`, `agi session list|pin|unpin|show|fork|archive|unarchive|delete` (apps/cli/src/lib.rs:245-264, 917-980, 1920-1975).

**Before you start**

- For device sessions: nothing beyond a config folder.
- For account sessions: a signed-in account and a Managed (Cloud) session mode; Local and own-key modes are refused for account history (apps/cli/src/cloud/client.rs:361-373).
- To branch: session saving must not be switched off with --no-session-persistence (apps/cli/src/repl/registry.rs:1363-1370).

**Screens and controls**

- Session picker overlay: rows show an optional pin mark, first 8 characters of the id, date and time, message count and title; Enter resumes, Esc closes (apps/cli/src/tui/tui_app.rs:4300-4340, apps/cli/src/tui/widgets/session_picker.rs).
- `/history search <text>` or `/history <text>` filters rows (apps/cli/src/tui/tui_app.rs:5997-6000).
- `/export` with no path prints the text into the chat; with a path writes a file (apps/cli/src/tui/tui_app.rs:6033-6043).

**Journey**

1. List: user types `/history`; the picker opens with active (not archived) sessions on this device.
2. Resume: user presses Enter on a row; the session is loaded, the transcript is rebuilt and a system line says `Resumed session <id> (<n> messages).` (apps/cli/src/tui/tui_app.rs:4345-4399).
3. Branch: user types `/fork name`; the current session is saved, copied to a new session, renamed, and a confirmation names the new session (apps/cli/src/repl/registry.rs:1353-1420).
4. Export: user types `/export md notes.md`; the file is created in the workspace (see gaps for the path rule) and a line says `Exported the conversation to <path>.` (apps/cli/src/repl/registry.rs:440-471).
5. Shell: `agi history` prints `On this device:` then `In your AGI account:` (or the reason it cannot) and the line `Resume one with `agi resume --cloud <id>`.` (apps/cli/src/lib.rs:7180-7210, 2985-3014).

**What the person sees and gets**

- `No sessions on this device.` when the device list is empty (apps/cli/src/lib.rs:7196).
- `Resumed session <id> (<n> messages).`, `No session matches ...`, `Could not load session: ...` (apps/cli/src/tui/tui_app.rs:4345-4399).
- `Nothing to branch, no messages yet.` and `Cannot branch, this run was started with --no-session-persistence ...` (apps/cli/src/repl/registry.rs:1363-1385).
- `Nothing to export, no messages in session yet.`; `<path> already exists, so nothing was written. Export to a new file name.` (apps/cli/src/repl/registry.rs:440-471, 598-607).
- `Account history unavailable: <reason>` when the account cannot be read (apps/cli/src/lib.rs:3009-3012).
- Interrupted tool calls at resume produce a warning that their results are unknown (apps/cli/src/lib.rs:8250-8262).

**Settings**

- `--no-session-persistence` turns session files off (apps/cli/src/repl/registry.rs:1363-1370).
- The session store sits under the config folder, set by AGIWORKFORCE_HOME (apps/cli/src/config.rs:480-484).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Sessions are JSON/JSONL files in `managed_sessions` with metadata in `managed_session_metadata` under the config folder (apps/cli/src/sessions.rs:1-10, 50, 205-235, apps/cli/src/platform/runtime/session_control.rs:18).
- Listing excludes archived sessions; `agi session list --archived` shows them (apps/cli/src/platform/runtime/session_control.rs:682-685, apps/cli/src/lib.rs:1920-1930).
- `agi resume` with no id or `-c` continues the newest non-archived session started in this project folder; with none it says `No saved session in this project to continue.` (apps/cli/src/lib.rs:2536-2554, 8240-8262).
- Resume by id works for device sessions and falls back to the account for an id it does not find locally (apps/cli/src/lib.rs:2513-2535).
- `--cloud` resolves the id against the account and copies the conversation into the device store before resuming (apps/cli/src/lib.rs:2829-2871).
- `--teleport` brings a cloud Code session here and checks out its branch (apps/cli/src/lib.rs:2626-2660).
- Fork from the screen: saves the current session, forks it, renames the fork (apps/cli/src/repl/registry.rs:1353-1420).
- `agi session fork <id> --at-turn N --as name [--force]` forks at a turn and refuses to overwrite an existing name without --force (apps/cli/src/lib.rs:5691-5770).
- Export formats: Markdown (default), JSON, and the last answer; Markdown and answer are sanitised for terminal escapes (apps/cli/src/repl/registry.rs:579-624).
- Export writes with create-new, so an existing file is never overwritten (apps/cli/src/repl/registry.rs:446-471).
- A resumed Cloud session is checked for routing authority and model, and refused if missing (apps/cli/src/tui/tui_app.rs:4383-4386).

**Incomplete**

- The TUI `/resume` takes only a local id or path; it has no `--cloud` handling, so account conversations must be resumed from the shell (apps/cli/src/tui/tui_app.rs:4345-4391).
- The TUI picker lists every active device session, not only this project's; `-c` is project-scoped (apps/cli/src/tui/tui_app.rs:4303-4325 vs apps/cli/src/platform/runtime/session_control.rs:693-698).

**Present but disconnected or switched off**

- Legacy sessions without privacy or provider authority cannot be resumed (apps/cli/src/lib.rs:2546-2551).

**Not available**

- Clipboard export: the brief says the transcript can go to the clipboard; `/export` has no clipboard write (apps/cli/src/tui/tui_app.rs:6033-6043, apps/cli/src/repl/registry.rs:433-471).
- surface:web, surface:desktop, surface:mobile, surface:vscode, surface:chrome: not part of this item (brief status n/a). The CLI session store is separate from the synced app chat history by design (apps/cli/src/sessions.rs:12-30).

## 4. Required behaviour

**Established requirements**

- The user can list saved sessions and pick one (`/history` picker in the TUI, `agi history`, `agi session list`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.11)
- The user can resume a previous session by picker, id or latest (`/resume`, `agi resume [id] [--cloud]`, `-c`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.12)
- The user can branch the current or a saved session into a new one (`/fork`, `/branch`, `agi fork`, `agi session fork --at-turn`). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.13)
- The user can export the conversation transcript (Markdown/JSON) to a file or clipboard. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S72.32)
- The CLI must include local session transcripts and resume/branch, and stay local unless the user hands off explicitly. (source: doc: docs/product/requirements.md:1157-1182)

**Acceptance criteria**

1. After a conversation, `agi history` lists it under `On this device:`.
2. `/history` opens a picker; Enter loads the session and the transcript shows the earlier messages.
3. `agi -c` in the same folder loads the newest session; in a folder with none it says no saved session.
4. `/fork x` creates a new session; the original is unchanged and the fork resumes with the same messages.
5. `agi session fork <id> --at-turn 1` keeps only the first exchange; running it again without `--force` fails with `already exists`.
6. `/export json out.json` creates the file; running it again says the file already exists and writes nothing.
7. `/export` in an empty session says there is nothing to export.
8. With a Local or own-key session, `agi history --cloud` explains that nothing is sent to the account in this mode.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Export should land inside the workspace, as the draft says, but the code does not enforce that; this needs a decision [inferred from apps/cli/src/repl/registry.rs:446-452].
- A user who forks should be told which session id to resume; the shell fork prints it, the screen fork names the session [inferred from lib.rs:5755-5762].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add clipboard copy to `/export` (the brief requires it) or change the brief.
- [proposed] Allow `/resume --cloud <id>` from the screen.
- [proposed] Keep permanent session delete behind the same named-consequence confirmation as the rest of the product (agents never destroy data on their own, doc: AGENTS.md section 9).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | sessions (managed-session compatibility layer) | `apps/cli/src/sessions.rs` | Listing, metadata, hosted-conversation adoption on top of the managed session store (sessions.rs:1-235). |
| store | managed_sessions folder | `apps/cli/src/platform/runtime/session_control.rs` | Session files, list, latest, resolve, fork, archive, delete (session_control.rs:18, 540-730). |
| store | managed_session_metadata folder | `apps/cli/src/sessions.rs` | Per-session metadata JSON (sessions.rs:50, 205-235). |
| service | ManagedSession | `apps/cli/src/platform/runtime/session.rs` | Session record, routing authority, forked_from, privacy mode. |
| command | open_session_picker and resume_session | `apps/cli/src/tui/tui_app.rs` | Picker data and resume in the screen (tui_app.rs:4300-4399). |
| component | SessionPickerView | `apps/cli/src/tui/widgets/session_picker.rs` | Overlay list (session_picker.rs). |
| command | /history, /resume, /fork, /export slash handlers | `apps/cli/src/tui/tui_app.rs` | Dispatch (tui_app.rs:5997-6052). |
| service | branch_session_for_display | `apps/cli/src/repl/registry.rs` | Fork logic with privacy and persistence guards (registry.rs:1353-1420). |
| service | export_conversation_to_file and render_export | `apps/cli/src/repl/registry.rs` | Export formats and file write (registry.rs:433-624). |
| command | Command::History, Resume, Fork, Session | `apps/cli/src/lib.rs` | Shell commands and flags (lib.rs:245-264, 917-980, 1920-1975, 2494-2554, 5685-5770, 7180-7210). |
| service | adopt_hosted_conversation and print_hosted_history | `apps/cli/src/lib.rs` | Account conversations to the device and listing (lib.rs:2829-2871, 2985-3014). |
| service | cloud::chat sync | `apps/cli/src/cloud/chat.rs` | Account conversation sync client; paths /api/chat/sync and /api/chat/conversations (chat.rs:13, 457). |
| service | CloudClient::connect and admit | `apps/cli/src/cloud/client.rs` | Allows account calls only for Managed sessions (client.rs:361-373). |
| service | sync_to_account / sync_session | `apps/cli/src/agent/mod.rs` | Pushes a Managed session to the account at exit (agent/mod.rs:2749-2760, cloud/mod.rs:325-360). |
| endpoint | api:POST /api/chat/sync | `apps/web/app/api/chat/sync/route.ts` | Server side of conversation sync; the HTTP verb is not confirmed here. |
| endpoint | api:GET /api/chat/conversations | `apps/web/app/api/chat/conversations/route.ts` | Server route behind the hosted conversation list; the verb is not confirmed here. |
| service | code_teleport | `apps/cli/src/cloud/code_teleport.rs` | `agi resume --teleport` (lib.rs:2626-2660). |
| service | fork_transcript | `apps/cli/src/lib.rs` | Cut a transcript at a turn without ending on an unanswered tool call (lib.rs:8773, tests 10869-10882). |
| test | registry export and branch tests | `apps/cli/src/repl/registry.rs` | Tests at lines 633-705, 1441-1489, 2407. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| List: the CLI reads session files and metadata in the config folder. | device | apps/cli/src/platform/runtime/session_control.rs:682-685 |
| `agi history` without --cloud prints device sessions, then asks the account for conversations (`pull_all` on /api/chat/sync) only if the mode is Managed and a token exists. | device and our servers | apps/cli/src/lib.rs:7180-7210, apps/cli/src/cloud/mod.rs:389-396, apps/cli/src/cloud/client.rs:361-379 |
| Resume: the session file is loaded, routing authority and model are checked, the mode is kept, and the transcript is rebuilt. | device | apps/cli/src/tui/tui_app.rs:4345-4399 |
| Resume --cloud: one conversation is fetched from the account and written to the device store. | device and our servers | apps/cli/src/lib.rs:2829-2871, apps/cli/src/cloud/mod.rs:401-414 |
| Fork: the live session is saved, copied under a new id and renamed. | device | apps/cli/src/repl/registry.rs:1353-1420 |
| Export: messages are rendered to Markdown, JSON or last answer; a file is created without overwriting, or the text is shown in the chat. | device | apps/cli/src/repl/registry.rs:433-471, 598-624 |
| At exit a Managed session is pushed to the account; if the project link is stale the push is retried unfiled. | device and our servers | apps/cli/src/agent/mod.rs:2749-2760, apps/cli/src/cloud/mod.rs:325-360 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Session transcript and routing authority | managed_sessions folder under the config folder (apps/cli/src/sessions.rs:1-10) | Managed sessions are pushed to the account at exit (apps/cli/src/agent/mod.rs:2749-2760). Local and own-key sessions are not (apps/cli/src/cloud/client.rs:361-373). | Kept until `agi session delete` (permanent, asks for confirmation unless --force) or /delete; archive hides without deleting (apps/cli/src/lib.rs:1960-1975, apps/cli/src/repl/registry.rs:368-416). |
| Session metadata (title, pin, archive time) | managed_session_metadata folder (apps/cli/src/sessions.rs:50) | Not found to sync | With the session. |
| Exported file | Path the user names, joined onto the workspace root (apps/cli/src/repl/registry.rs:446-452) | No | User-owned file; never overwritten by the command. |
| Account sync position | Sync state under the config folder (apps/cli/src/cloud/mod.rs:147-163) | Used for account sync | Not traced. |

**Models and providers.** Resume keeps the model the session was held on and falls back to the default model when none is recorded (apps/cli/src/lib.rs:9790-9810 tests). A Cloud session cannot carry an established Local or own-key transcript into Managed Cloud without a fresh session or reviewed continuation (apps/cli/src/agent/mod.rs:1218-1231). Which model answers later turns follows the session route; see F072-04.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Device list, resume, fork and export need no account. Account history and `--cloud` need a signed-in account (apps/cli/src/cloud/client.rs:375-379). |
| Permissions | Resume refuses a session with unknown or incompatible routing authority (apps/cli/src/tui/tui_app.rs:4383-4386). Session delete asks for confirmation unless --force and refuses in a non-interactive run without --force (apps/cli/src/lib.rs:1990-2005). |
| Subscription | None found for list, resume, fork or export. Account sync happens only in Managed mode, which needs an account; plan limits on it were not traced. |
| Limits and metering | `agi history --limit` defaults to 20 (apps/cli/src/lib.rs:969-975). None found for session counts. |
| Feature flags | --continue/-c, --resume, --session, --fork-session, --no-session-persistence, --limit, --cloud, --teleport, --project (apps/cli/src/lib.rs:245-264, 969-980). |
| Model compatibility | A resumed session needs a recorded model and routing authority; older sessions without them are refused (apps/cli/src/lib.rs:2546-2551). |
| Provider restrictions | Account history is refused for Local and own-key sessions with `<mode>: nothing is sent to your AGI cloud account in this mode. Switch to Cloud mode with /model to use this.` (apps/cli/src/cloud/client.rs:49-54). |
| Local mode | Sessions are saved on the device; nothing goes to the account; `--cloud` and account history print the boundary message. Resume and export work offline. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty history | `No sessions on this device.`; the picker with no rows offers nothing. | apps/cli/src/lib.rs:7196, apps/cli/src/tui/widgets/session_picker.rs:162 |
| No match for a filter | Status notice `no session matches '<text>'`. | apps/cli/src/tui/tui_app.rs:4334-4337 |
| Unknown id | `No session matches `<id>`: <reason>`. | apps/cli/src/tui/tui_app.rs:4391 |
| Resume of a session saved in another permission mode | The terminal keeps its current mode and says so. | apps/cli/src/tui/tui_app.rs:4376-4380, test line 8877 |
| Interrupted tool call at resume | Told to the user and to the assistant as unknown result. | apps/cli/src/lib.rs:8250-8262 |
| Session with no messages | Warning `has no messages`; branch says nothing to branch; export says nothing to export. | apps/cli/src/lib.rs:8228-8231, apps/cli/src/repl/registry.rs:1371-1378, 598-607 |
| Account unreachable or signed out | History prints `Account history unavailable: <reason>` and still shows device sessions. | apps/cli/src/lib.rs:3009-3012 |
| Export target exists | Nothing written; warning to choose a new name. | apps/cli/src/repl/registry.rs:458-466 |
| Session persistence off | Branch is refused with an explanation. | apps/cli/src/repl/registry.rs:1363-1370 |
| Retry, timeout, reconnect for account calls | A client timeout constant exists (CLOUD_TIMEOUT); no retry loop was found for history listing. | apps/cli/src/cloud/client.rs:384-386 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/cli/src/repl/registry.rs`: Export: empty session warning, export returned to a full-screen caller, export after compaction; fork: refuses with persistence off, nothing-to-branch, store refusal, names the new session; save and rename guards (lines 633-705, 1441-1489, 2407).
- `apps/cli/src/lib.rs`: Resume and fork flags open the interactive session (9749); resumed model kept or defaulted (9790, 9802); resumed identity (9995); requested session id (10818); fork at a turn and never ending on an unanswered tool call (10869, 10882).
- `apps/cli/src/tui/tui_app.rs`: Resuming a session saved in another mode keeps this terminal's mode (8877); Esc closes the session picker (10926); recent activity lists the folder's newest sessions (13407); cleared draft is recalled only in its session (10880).
- `apps/cli/src/tui/widgets/session_picker.rs`: Enter resumes, Esc closes, empty history, scrolling window (lines 144-172).
- `apps/cli/src/sessions.rs`: Unit tests on the managed session compatibility layer and the sync-surface rule (test at end of file).

**Test scenarios**

- **Round trip**
  1. Run `agi`, send one message, quit.
  2. Run `agi history`.
  3. Run `agi resume <id>` using the printed id.
  - Expected: The session is listed under `On this device:` and resumes with the earlier message in the transcript.
- **Continue newest in project**
  1. In the same repo run `agi -c`.
  2. In another empty folder run `agi -c`.
  - Expected: First loads the newest session; second says there is no saved session in this project.
- **Fork keeps the original**
  1. In a session type `/fork alt`.
  2. Add a message in the fork.
  3. Resume the original by id.
  - Expected: The original has none of the new messages.
- **Fork at turn**
  1. Run `agi session fork <id> --at-turn 0 --as short`.
  2. Run it again.
  - Expected: First creates `short` with the first exchange; second fails saying it exists and to use --force.
- **Export no overwrite**
  1. Type `/export json out.json`.
  2. Type it again.
  - Expected: First writes the file; second writes nothing and says the file exists.
- **Account boundary**
  1. Set the session to Local, run `agi history --cloud`.
  - Expected: A message that nothing is sent to the AGI cloud account in Local mode.

**Where to look when it fails**

- Output lines `Could not list sessions:`, `Could not load session:`, `Account history unavailable:`.
- `CloudError` texts in apps/cli/src/cloud/client.rs:39-70 (`no AGI credential`, `your AGI session expired`).
- `this turn is saved on this device but not yet in your account: <error>` at exit (apps/cli/src/agent/mod.rs:2756).
- Session files under the config folder `managed_sessions`.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/072-cli-and-terminal-application.md](../../70-qa/test-plans/cli/072-cli-and-terminal-application.md)

## 10. Gaps and dependencies

- **The brief says export goes to a file or the clipboard; there is no clipboard write.** Affects: surface:cli users who want to paste a transcript.. Evidence: apps/cli/src/tui/tui_app.rs:6033-6043, apps/cli/src/repl/registry.rs:433-471. Work needed: Add a clipboard path (or an --clipboard form) and test it, or correct the brief.
- **Export joins the typed path onto the workspace root with no containment check, so an absolute path or `..` can write outside the workspace.** Affects: surface:cli users and anyone scripting /export.. Evidence: apps/cli/src/repl/registry.rs:446-452 (join of expand_home(path) to the workspace root, create_new open). Work needed: Validate the target with the workspace path rules used by mentions, or document that any writable path is allowed.
- **No test covers the file-writing path of /export (exists, new, error).** Affects: Maintainers.. Evidence: apps/cli/src/repl/registry.rs:626-705 tests cover the display path only. Work needed: Add tests for new file, existing file and unwritable directory.
- **The TUI /resume cannot resume an account conversation; the shell can.** Affects: surface:cli full-screen users in Managed mode.. Evidence: apps/cli/src/tui/tui_app.rs:4345-4391 versus apps/cli/src/lib.rs:2513-2535. Work needed: Route `--cloud` through the same adoption path in the screen.
- **Documentation contradicts code: the sessions module header says the CLI never reads or writes synced app chat tables and does not sync chat history, but the code pushes Managed sessions to the account and lists account conversations.** Affects: Engineers and testers reading the header.. Evidence: apps/cli/src/sessions.rs:12-30 versus apps/cli/src/agent/mod.rs:2749-2760 and apps/cli/src/cloud/mod.rs:325-396. Work needed: Decide the rule and update either the header or the code; keep the requirement that Local and own-key sessions never sync.
- **`agi session fork --force` overwrites an existing session and `/delete` and `agi session delete` remove a session permanently; the repository rule says an agent never destroys user data on its own and expects Trash or Recently deleted.** Affects: surface:cli users.. Evidence: apps/cli/src/lib.rs:5718-5726, apps/cli/src/repl/registry.rs:368-416, doc: AGENTS.md section 9. Work needed: Confirm that these are explicit user actions (they are named commands with a confirmation) and whether archive-first is wanted.

**Depends on**

- surface:cli
- mode:local
- mode:own-key
- mode:cloud
- api:POST /api/chat/sync
- api:GET /api/chat/conversations
- file:apps/cli/src/sessions.rs
- file:apps/cli/src/platform/runtime/session_control.rs
- file:apps/cli/src/repl/registry.rs
- SYS-sync-and-continuity
- SYS-memory-projects-and-context
- SYS-authentication-and-identity
- SYS-execution-boundaries
- SYS-data-model-and-migrations

## Unknown

- HTTP verbs and server-side plan limits for /api/chat/sync and /api/chat/conversations were not read.
- Whether the account list for `agi history` includes conversations from other apps (web, desktop, mobile); the CLI reads the shared conversation list (cloud/mod.rs:389-396), so it likely does.
- How `session_pin_label` and pin state are shown in `agi history` versus `agi session list`.
- Retention period of account conversations.
