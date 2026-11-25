---
id: "PLAN-cli-010"
type: "test-plan"
title: "CLI · 10. Modal and dialog inventory"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "10"
---
# CLI · 10. Modal and dialog inventory

24 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S10.01 Create Project.

- **Expected:** A create-project dialog (or command) asks for a name and creates the project in the account.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:3787; apps/cli/src/cloud/mod.rs:442
- **Where to find it:** Terminal: agi projects create <name> (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Run agi projects create "QA Test Project" in a terminal.
  2. Read the output: it should say the project was created in your account, with an id.
  3. Run agi projects list and check the new project is listed.
  4. Compare with Expected: there is a command that creates the project in the account. There is no dialog; the name is typed on the command line.

## S10.02 Rename conversation.

- **Expected:** The user opens rename on a conversation, edits the title in a field or prompt, and the new title is saved.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6027; apps/cli/src/tui/tui_app.rs:6026
- **Where to find it:** Chat prompt: /rename <id> <new title> (labels found in the code)
- **Needs:** a saved conversation
- **Steps:**
  1. Open a conversation that has some messages, then type /history to find its id.
  2. Type /rename <id> Test renamed (use the real id and your own test title).
  3. Read the reply: it should say the session was renamed to the new title.
  4. Type /history again and check the new title is shown. Compare with Expected: an edit field is not used; the id and new title are typed.

## S10.04 Duplicate resource.

- **Expected:** A duplicate action creates an independent copy of a conversation or project and says where the copy is.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6014; apps/cli/src/tui/tui_app.rs:6015
- **Where to find it:** Chat prompt: /branch [name] (or /fork) (labels found in the code)
- **Needs:** a conversation with messages and session saving turned on
- **Steps:**
  1. Open a conversation that already has messages.
  2. Type /branch My copy test.
  3. Read the reply: it should say the conversation was branched as a new managed session, with its id and a resume command.
  4. Run the resume command shown and check the copy has the same messages. Compare with Expected: the reply names the copy's id, but does not name a folder or list.

## S10.05 Archive confirmation.

- **Expected:** Archiving asks to confirm, or confirms afterwards with a way to undo, and says where archived items can be found.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5769; apps/cli/src/lib.rs:5766
- **Where to find it:** Terminal: agi session archive <session id> (labels found in the code)
- **Needs:** a test session
- **Steps:**
  1. Run agi session list and pick a test session id.
  2. Run agi session archive <id>. Note that no question is asked.
  3. Read the reply: it should say the session was archived and show the command to unarchive it.
  4. Run agi session list --archived and check the session is listed there. Compare with Expected: the archive is not confirmed first, and the reply gives the undo command.

## S10.06 Delete confirmation.

- **Expected:** Deleting asks for confirmation that names the item before anything is removed.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1963; apps/cli/src/lib.rs:5792
- **Where to find it:** Terminal: agi session delete <session id> (labels found in the code)
- **Needs:** a throwaway test session
- **Steps:**
  1. Use a throwaway test session only. Run agi session list to get its id.
  2. Run agi session delete <id>.
  3. Read the question: it should name the session id and say the delete cannot be undone.
  4. Answer n and check the reply says the session was not deleted. Compare with Expected: the question names the item before anything is removed.

## S10.07 Permanent-delete confirmation.

- **Expected:** An irreversible delete says plainly that it cannot be undone and needs an explicit second confirmation.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:5802; apps/cli/src/lib.rs:5792
- **Where to find it:** Terminal: agi session delete <session id> (labels found in the code)
- **Needs:** a throwaway test session
- **Steps:**
  1. Use a throwaway test session only. Run agi session delete <id>.
  2. Read the question: it should say the delete cannot be undone.
  3. Answer y only if the session is a test one, and check it is removed.
  4. Compare with Expected: the code asks one yes or no question, not a second explicit confirmation.

## S10.10 Share artifact.

- **Expected:** An artifact share dialog publishes it to a link, lets the user copy it and choose who can open it, and can take it down.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2398 (quoted code not found in the file now); apps/cli/src/lib.rs:3888
- **Where to find it:** Terminal: agi artifacts publish <id> --audience workspace (labels found in the code)
- **Needs:** a signed-in account with a generated artifact
- **Steps:**
  1. Run agi artifacts list and pick an artifact id (an HTML, markdown or code artifact).
  2. Run agi artifacts publish <id> --audience workspace (or leave the default public).
  3. Read the reply: it should show a share link and who can open it.
  4. Run agi artifacts published to see the link and audience, then agi artifacts unpublish <id> and answer the question. Check the reply says the link no longer works. Compare with Expected: audience is set with a flag and the link is printed; there is no copy button or dialog.

## S10.11 Publish generated application.

- **Expected:** A publish dialog puts a generated app or page on a live URL and hands back the link.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:1399; apps/cli/src/cloud/artifacts.rs:451
- **Where to find it:** Terminal: agi artifacts publish <id> (labels found in the code)
- **Needs:** a signed-in account with a generated page or app
- **Steps:**
  1. Run agi artifacts list and pick an id for a generated page or app (html, react, svg, mermaid, markdown, text or code).
  2. Run agi artifacts publish <id>.
  3. Read the reply: it should give a live link and say who can open it.
  4. Open the link in a browser and check the page shows. Compare with Expected: a link is handed back in the terminal.

## S10.17 Upload from device.

- **Expected:** Choosing upload opens the device file chooser and the picked files attach to the message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6215; apps/cli/src/tui/tui_app.rs:3278; apps/cli/src/claude_parity.rs:223; apps/cli/src/claude_parity.rs:395
- **Where to find it:** Chat prompt: /attach, then /attach <file> (labels found in the code)
- **Needs:** a test image or PDF file on this computer
- **Steps:**
  1. Type /attach and press Enter. Read the menu titled Ways to add context to your next message.
  2. Type /attach followed by the full path of a test image or PDF, and press Enter.
  3. Read the chip above the prompt: it should show the file name with /attach remove to drop.
  4. Compare with Expected: no device file chooser opens; the path is typed or pasted instead.

## S10.18 Connect external account.

- **Expected:** A connect dialog starts the service's real authorization (OAuth or key) and ends with the account connected.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:5096
- **Where to find it:** Terminal: agi mcp add <name> --url <server address>, then agi mcp login <name> (labels found in the code)
- **Needs:** a remote MCP server that supports OAuth, and an account on that service
- **Steps:**
  1. Run agi mcp add <name> --url <address of a remote MCP server>.
  2. Run agi mcp login <name>. Follow the authorization it starts.
  3. Read the reply: it should say the server was authorized and the token is stored in the OS credential store.
  4. Run agi mcp list and check the server is connected. Compare with Expected: the login ends with the service connected.

## S10.19 Reauthorize connection.

- **Expected:** An expired connection offers a reconnect dialog that re-runs authorization and keeps its settings.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2126; apps/cli/src/lib.rs:5359
- **Where to find it:** Terminal: agi mcp login <name> (or /mcp restart in chat) (labels found in the code)
- **Needs:** a remote MCP server whose login has expired
- **Steps:**
  1. After the connection expires, run agi mcp login <name> again.
  2. Follow the authorization it starts.
  3. Read the reply: it should say the server was authorized again.
  4. Run agi mcp list and check the server keeps its settings. Compare with Expected: a reconnect dialog is expected; none was found, only the command.

## S10.20 Select among connected accounts.

- **Expected:** When a service has several connected accounts, a dialog lets the user pick which one to use or make default.
- **Code:** done. Evidence none: the ledger gives no code location
- **Where to find it:** not found in the code. Searched apps/cli for default account, primary account, connected account and pick an account; no picker was found. agi connectors lists connectors but no selection was found.
- **Needs:** a service with two or more connected accounts

## S10.21 Install Plugin.

- **Expected:** An install dialog shows the plugin and installs it into the account or workspace.
- **Code:** done. Evidence moved: apps/cli/src/lib.rs:2017; apps/cli/src/lib.rs:3655 (quoted code not found in the file now); apps/cli/src/lib.rs:7642
- **Where to find it:** Terminal: agi plugin install <local path or git URL> (labels found in the code)
- **Needs:** a test plugin folder or git URL
- **Steps:**
  1. Run agi plugin install <local folder or git URL of a test plugin>.
  2. Read the reply: it should say the plugin was installed.
  3. Run agi plugin list and check the plugin is listed.
  4. Run agi plugin info <name> to see its publisher and signature. Compare with Expected: there is no preview dialog before install; the info command is the only detail view.

## S10.23 Update Plugin.

- **Expected:** An update dialog offers a newer plugin version, shows what changes, and applies it.
- **Code:** done. Evidence present: apps/cli/src/lib.rs:2340; apps/cli/src/lib.rs:7654
- **Where to find it:** Terminal: agi plugin update <name> (labels found in the code)
- **Needs:** a plugin installed from git that has a newer commit
- **Steps:**
  1. Run agi plugin list and pick a plugin installed from git.
  2. Run agi plugin update <name>.
  3. Read the reply for what was applied.
  4. Compare with Expected: the update applies directly; no dialog shows what changes first.

## S10.24 Skill import.

- **Expected:** An import dialog takes a skill file or package and adds a usable skill.
- **Code:** done. Evidence present: apps/cli/src/skills.rs:1498
- **Where to find it:** Chat prompt: /skills import <path to SKILL.md or its folder> (labels found in the code)
- **Needs:** a skill folder with a SKILL.md file
- **Steps:**
  1. Prepare a folder that contains a SKILL.md file.
  2. Type /skills import <path to that folder> and press Enter.
  3. Read the reply: it should say the skill was imported to a location.
  4. Type /skills and check the skill is listed. Compare with Expected: the path is typed; no import dialog appears.

## S10.27 Context-limit warning.

- **Expected:** As a conversation nears or passes the model's context limit, the user gets a clear warning with what to do (trim, compact, new chat).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:8682
- **Where to find it:** Chat, in a long conversation that nears the context limit (labels found in the code)
- **Needs:** a long conversation near the model's context limit
- **Steps:**
  1. Keep adding turns to one long conversation until it nears the model's context window.
  2. Watch the reply after the turn that passes 85 percent.
  3. Read the system line: it should say the context is full and what to do.
  4. Type /compact and check the earlier turns are summarized. Compare with Expected: the warning names /compact only; it does not mention trimming or a new chat.

## S10.28 Usage-limit notice.

- **Expected:** When a usage limit is reached, the user sees which limit, when it resets, and what they can do.
- **Code:** done. Evidence present: apps/cli/src/errors.rs:687; apps/cli/src/models/streaming.rs:280
- **Where to find it:** Chat: send a message after the account reaches a usage limit (labels found in the code)
- **Needs:** an account at a usage limit
- **Steps:**
  1. Run agi usage to see the current limit state.
  2. When a message is refused for a usage limit, read the notice.
  3. Check the notice names the limit and when it resets, or says to run agi usage.
  4. Compare with Expected: the notice shows the reset time and the options. It cannot be forced on demand.

## S10.37 Folder-access permission.

- **Expected:** Before the assistant reads or writes a local folder, the user is asked to grant access to that folder.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7945; apps/cli/src/features/exec/tools/mod.rs:879; apps/cli/src/features/exec/tools/mod.rs:1965
- **Where to find it:** Terminal: run agi in a new folder that is not trusted yet (labels found in the code)
- **Needs:** a new folder that has not been trusted
- **Steps:**
  1. Create an empty folder in Terminal, cd into it, and run agi.
  2. At the question about trusting the directory, read the choices.
  3. Pick Open restricted to see the restricted mode, or Yes to trust it.
  4. Ask the assistant to read a file in the folder and check what happens. Compare with Expected: access is asked at launch for the whole folder, not before each read or write.

## S10.38 Tool-action approval.

- **Expected:** When a tool action needs approval, a prompt shows the action and the user approves or denies that one call.
- **Code:** done. Evidence moved: apps/cli/src/tui/widgets/approval_overlay.rs:81 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1596
- **Where to find it:** Chat: ask for a tool action, such as running a shell command (labels found in the code)
- **Needs:** a test folder in a trusted workspace
- **Steps:**
  1. In a trusted test folder, ask agi to run ls in this folder.
  2. Read the approval box: it should show the exact command.
  3. Choose Yes to run it once, and check only that call ran.
  4. Compare with Expected: the box offers more than one call answer, such as Allow Session and Always allow; use Always allow only on a test folder.

## S10.42 Edit-conflict resolution.

- **Expected:** When the same item was changed elsewhere, the user sees both versions and chooses which to keep (or merges).
- **Code:** done. Evidence moved: apps/cli/src/sync.rs:169 (quoted code not found in the file now)
- **Where to find it:** not found in the code. Only a warning was found in apps/cli/src/cloud/mod.rs ('cloud sync has unresolved conflicts', pointing to /export). No side-by-side chooser or merge dialog was found.
- **Needs:** a cloud conversation changed in two places at once

## S10.43 Export options.

- **Expected:** An export dialog lets the user pick a format and exports the conversation or item to a file.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6037; apps/cli/src/tui/tui_app.rs:6033
- **Where to find it:** Chat prompt: /export markdown <path> or /export json <path> (labels found in the code)
- **Needs:** a conversation with messages and a writable workspace folder
- **Steps:**
  1. Type /export to read the formats: markdown, json, answer.
  2. Type /export markdown ./export-test.md (a new file name in the workspace).
  3. Read the reply: it should say the conversation was exported to that path.
  4. Open the file, then repeat the same command and check the refusal to overwrite. Compare with Expected: formats are typed, not picked in a dialog.

## S10.45 Feedback submission.

- **Expected:** A feedback dialog, reachable product-wide, sends the user's message to the team's feedback store.
- **Code:** done. Evidence present: apps/cli/src/cloud/feedback.rs:65; apps/cli/src/claude_parity.rs:202; apps/cli/src/tui/tui_app.rs:7800
- **Where to find it:** Chat prompt: /feedback <message> (or /bug <message>) (labels found in the code)
- **Needs:** a signed-in account
- **Steps:**
  1. Type /feedback I would like a dark theme (test text only, it is sent to the team).
  2. Read the reply: it should say the feedback was sent to the team.
  3. Compare with Expected: the message goes to the team's feedback store; the message is typed, not entered in a dialog.

## S10.46 Diagnostic-sharing consent.

- **Expected:** Before diagnostics or crash reports leave the device, the user is told what is included and chooses (or sets a preference that is honoured).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:5887; apps/cli/src/config.rs:1473
- **Where to find it:** Chat prompt: /config show, then /config set crash-reports true (labels found in the code)
- **Steps:**
  1. Type /config show and read the crash-reports value (default is off).
  2. Type /config set crash-reports true and read the reply: it should say the value was saved.
  3. Run agi doctor --export and open the redacted file it writes to read what is included.
  4. Set it back with /config set crash-reports false. Compare with Expected: there is no notice before diagnostics leave the device; the setting is the only consent point.

## S10.47 Data-export request.

- **Expected:** A data-export dialog requests a copy of the account's data and delivers it as a download.
- **Code:** done. Evidence present: apps/cli/src/cloud/data_export.rs:45; apps/cli/src/cloud/data_export.rs:52; apps/cli/src/lib.rs:7410
- **Where to find it:** Terminal: agi export-data (labels found in the code)
- **Needs:** a signed-in account and time for the export to finish
- **Steps:**
  1. Run agi export-data. It requests the export.
  2. Read the reply: it should say the export is being prepared and to run the command again later.
  3. Run agi export-data again after it is ready and check files are saved to the current folder (or a folder given with --out).
  4. Compare with Expected: the export is delivered as files saved to a folder, not a browser download.
