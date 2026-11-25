---
id: "PLAN-cli-005"
type: "test-plan"
title: "CLI · 5. Application shell and navigation components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "5"
---
# CLI · 5. Application shell and navigation components

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S5.01 Application header.

- **Expected:** A persistent top header shows where the user is (brand/conversation title) and the primary actions for the current view.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:2620; apps/cli/src/tui/tui_app.rs:2014
- **Where to find it:** Run agi in a terminal, then look at the top two rows of the screen (labels found in the code)
- **Steps:**
  1. Open Terminal, type agi and press Enter.
  2. Wait for the start screen to appear.
  3. Look at the top two rows: the app name, version, model and provider, then the second row with the counts and the context meter.
  4. Type a short message, press Enter and scroll the chat.
  5. Check the top rows are still on screen. Compare with Expected (a persistent header that shows where you are).

## S5.07 Sidebar search input.

- **Expected:** The navigation sidebar has a search entry that filters or searches conversations.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4323
- **Where to find it:** not found in the code. The terminal app has no navigation sidebar and no search box in the shell. Closest found: /history search <text> filters the Sessions list to entries containing the text (apps/cli/src/tui/tui_app.rs). Searched apps/cli/src for sidebar, search and recent wording.

## S5.08 New-chat action.

- **Expected:** A persistent New chat action starts a fresh conversation from anywhere in the shell.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5840; apps/cli/src/tui/tui_app.rs:5842
- **Where to find it:** /new (type it at the prompt and press Enter) (labels found in the code)
- **Steps:**
  1. Start agi and send one message so the chat has text.
  2. Type /new and press Enter.
  3. Look for the line Started new conversation. and a cleared chat. Compare with Expected (a fresh conversation).

## S5.10 Recent-item section.

- **Expected:** Navigation shows a list of recent conversations that open on selection.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3545 (quoted code not found in the file now); apps/cli/src/tui/widgets/session_picker.rs:1
- **Where to find it:** /resume (type it at the prompt and press Enter) (labels found in the code)
- **Needs:** an earlier saved conversation in the same folder
- **Steps:**
  1. Send a message in a folder, quit agi, then run agi again in the same folder.
  2. Look at the start screen for Recent activity, with rows such as 2h ago and a title.
  3. Type /resume and press Enter to open the Sessions list.
  4. Press Enter on a row and check that the chosen conversation opens.

## S5.12 Date-grouped recents.

- **Expected:** Recent conversations are grouped by date buckets (Today, Yesterday, This week, Older).
- **Code:** done. Evidence moved: apps/cli/src/sessions.rs:1180; apps/cli/src/lib.rs:3864 (quoted code not found in the file now)
- **Where to find it:** agi session list (run in Terminal, outside agi) (labels found in the code)
- **Needs:** saved conversations from several days; a date heading only appears for chats older than a week
- **Steps:**
  1. Quit agi, then in Terminal run: agi session list
  2. Look for group headings Today, Yesterday, This Week, or a calendar date.
  3. Compare with Expected (Today, Yesterday, This week, Older).

## S5.13 Conversation row.

- **Expected:** Each conversation row shows its title, indicates the active one, and opens the conversation.
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/session_picker.rs:70; apps/cli/src/tui/tui_app.rs:6006
- **Where to find it:** /resume (type it at the prompt and press Enter) (labels found in the code)
- **Needs:** at least one saved conversation in this folder
- **Steps:**
  1. Type /resume and press Enter.
  2. Look at each row: a short id, date and time, message count and title.
  3. Move with Up or Down. The arrow mark marks the cursor row.
  4. Press Enter on a row and check that the chosen conversation opens.

## S5.14 Project row.

- **Expected:** Navigation shows project rows that open the project (and expose its actions).
- **Code:** done. Evidence present: apps/cli/src/lib.rs:7762; apps/cli/src/lib.rs:3673
- **Where to find it:** not found in the code. The terminal app shows no project rows. Only shell commands were found: agi projects list (prints No projects in your AGI account. when empty, apps/cli/src/lib.rs) and agi -C <folder> to start a session in a folder. No project actions were found.

## S5.15 Task row.

- **Expected:** Background work/tasks appear as rows marked as tasks (distinct from chats) with their state, and open on selection.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7551; apps/cli/src/repl/registry.rs:484
- **Where to find it:** /tasks (type it at the prompt and press Enter) (labels found in the code)
- **Needs:** a running or finished background task
- **Steps:**
  1. Start background work, such as a sub-agent or background terminal task, in a conversation (how the task starts was not traced).
  2. Type /tasks and press Enter.
  3. Look for the task list with each task and its state. Compare with Expected (tasks shown apart from chats, with state).
  4. Type /tasks show <id> using an id from the list and check that the task output opens.

## S5.17 Running-task indicator.

- **Expected:** Navigation marks items whose task or response is still running, visually and for screen readers.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3017; apps/cli/src/tui/tui_app.rs:3023
- **Where to find it:** Send a prompt in agi, then look at the spinner line above the input and the header second row (labels found in the code)
- **Steps:**
  1. Start agi and send a prompt that takes a few seconds, such as a question that needs a tool.
  2. Look at the spinner line above the input, such as 3s, which shows still working after about 10 seconds with no text.
  3. Look at the header second row for the working count.
  4. When two or more tools run at once, look for the line with working at once (subagents for sub-agents). Compare with Expected (running work is marked).

## S5.18 Needs-input indicator.

- **Expected:** Navigation marks items that are blocked waiting for the user (approval or input).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3013; apps/cli/src/tui/tui_app.rs:8305
- **Where to find it:** Shift+Tab to a permission mode that asks before tools, then send a prompt that uses a tool (labels found in the code)
- **Needs:** a permission mode that asks before tools run
- **Steps:**
  1. Start agi and press Shift+Tab until the mode label in the status bar shows a mode that asks before running tools.
  2. Send a prompt that needs a tool, such as reading or writing a file.
  3. Look at the spinner line for Waiting for your approval and at the header second row for the awaiting input count.
  4. Answer the approval prompt that opens. Compare with Expected (an item blocked on the user is marked).

## S5.20 Item overflow menu.

- **Expected:** Each row has an overflow (⋯) menu with its actions (share, rename, pin, archive, move, delete).
- **Code:** done. Evidence present: apps/cli/src/tui/widgets/session_picker.rs:100
- **Where to find it:** not found in the code. No overflow menu was found. The /resume Sessions list has only Enter (resume) and r (rename). No /pin, /archive, /move, /delete or /share command was found in apps/cli/src/tui/tui_app.rs, apps/cli/src/command_registry.rs or apps/cli/src/claude_parity.rs. /rename and /fork exist as typed commands.

## S5.21 Inline rename field.

- **Expected:** A row can be renamed in place (inline field, Enter to save, Escape to cancel) and the new title persists.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6026; apps/cli/src/tui/tui_app.rs:6027
- **Where to find it:** /resume, then press r on a row (Sessions list) (labels found in the code)
- **Needs:** a saved conversation in this folder
- **Steps:**
  1. Type /resume and press Enter.
  2. Use Up or Down to pick a row.
  3. Press r. The prompt line fills with /rename and the conversation id.
  4. Type the new name and press Enter.
  5. Reopen /resume and check the row shows the new title. Compare with Expected (renamed in place, the title persists).

## S5.26 Global command palette.

- **Expected:** A global command palette (keyboard-invoked) searches and runs app commands and destinations.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4038; apps/cli/src/tui/widgets/command_popup.rs:1
- **Where to find it:** / (press / on an empty prompt line to open the Commands list) (labels found in the code)
- **Steps:**
  1. Start agi and make sure the prompt line is empty.
  2. Press / to open the Commands list.
  3. Type a word such as model to filter, use Up and Down, then press Enter on a command.
  4. Check that the list filters and the chosen command runs. Compare with Expected (searches and runs app commands).

## S5.27 Keyboard-shortcut help.

- **Expected:** A keyboard-shortcut help view lists the available shortcuts and is reachable from the app.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6704; apps/cli/src/keybindings.rs:157
- **Where to find it:** /keybindings (or /keys), and /help (labels found in the code)
- **Steps:**
  1. Type /keybindings and press Enter.
  2. Look for the Keybindings list with entries such as Open command palette and Cycle permission mode.
  3. Type /help and press Enter, then look for the Keyboard shortcuts: section.

## S5.29 User/profile menu.

- **Expected:** A user/profile menu shows who is signed in and offers account actions (settings, plan, sign out).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5792
- **Where to find it:** not found in the code. No profile menu was found. /status prints Account: signed in, <tier> plan, or not signed in (agi login) (apps/cli/src/tui/tui_app.rs). Sign-out is the typed /logout. No settings or plan menu was found.

## S5.30 Help menu.

- **Expected:** A help menu gathers help centre, support contact, feedback and shortcuts in one place.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3531 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:5987
- **Where to find it:** /help (also /h or /?) (labels found in the code)
- **Steps:**
  1. Type /help and press Enter.
  2. Look at the command list and the Keyboard shortcuts: section.
  3. Type /feedback with no words to see its usage text. Compare with Expected (help centre, support contact, feedback and shortcuts in one place).

## S5.31 Upgrade entry.

- **Expected:** A visible Upgrade entry in the shell takes an eligible user into the plan upgrade flow.
- **Code:** done. Evidence present: apps/cli/src/claude_parity.rs:789
- **Where to find it:** /upgrade (type it at the prompt and press Enter) (labels found in the code)
- **Needs:** a browser on this computer; eligibility was not checked in the code
- **Steps:**
  1. Type /upgrade and press Enter.
  2. Look for Opened plans and upgrades in your browser: with the link, or Plans and upgrades: with the link if the browser did not open.
  3. Compare with Expected (takes an eligible user into the plan upgrade flow).

## S5.32 Connection-status indicator.

- **Expected:** A status indicator shows whether the app is connected to its backend/runtime and offers reconnect when not.
- **Code:** done. Evidence present: apps/cli/src/cloud/client.rs:1143; apps/cli/src/repl/slash_commands.rs:285; apps/cli/src/tui/tui_app.rs:7767
- **Where to find it:** /status (in a Managed Cloud session) (labels found in the code)
- **Needs:** a Managed Cloud session and a way to turn the network off
- **Steps:**
  1. Start agi in a Managed Cloud session, not Local.
  2. Type /status and press Enter, then look for AGI Cloud: reachable with a time in ms.
  3. Turn off the network, type /status again and look for the unreachable line.
  4. Turn the network back on and run /status again to reconnect.

## S5.34 Release/update indicator.

- **Expected:** The app tells the user when a new release is available (or just installed) and how to get it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4615 (quoted code not found in the file now)
- **Where to find it:** agi update --check (run in Terminal, outside agi); the startup notice appears on its own when a newer release is found (labels found in the code)
- **Needs:** an older build than the published one, an internet connection, and a privacy mode other than Local
- **Steps:**
  1. Run agi update --check in Terminal and wait for the verdict.
  2. Look for An update is available. Install it with: agi update --install, or the up-to-date line.
  3. Start agi and watch the top of the chat for an agi version is available notice with the same install command.
  4. Compare with Expected (the app says a new release is available and how to get it).
