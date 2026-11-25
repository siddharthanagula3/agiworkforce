---
id: "PLAN-cli-013"
type: "test-plan"
title: "CLI · 13. Composer text interaction"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "cli"
area: "13"
---
# CLI · 13. Composer text interaction

25 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/cli/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S13.01 Plain-text entry.

- **Expected:** The user can type a plain-text message into the composer and send it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:4125; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box at the bottom > type a message > Enter (labels found in the code)
- **Needs:** a signed-in account to see a reply
- **Steps:**
  1. Start agi in a terminal and wait for the main screen.
  2. The composer at the bottom has focus; type: hello there
  3. Press Enter.
  4. Look: the text appears in the chat as your message, and a reply starts (needs a signed-in account).

## S13.02 Multiline entry.

- **Expected:** The composer accepts multi-line text (line breaks are kept in the sent message).
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:4072; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > Shift+Enter (also Alt+Enter or Ctrl-J) (labels found in the code)
- **Steps:**
  1. Type: line one
  2. Press Shift+Enter, then type: line two.
  3. Look: the composer shows two lines and nothing was sent.
  4. Press Enter, then check the chat: the message keeps its line break.

## S13.03 Automatic height growth.

- **Expected:** The composer grows taller automatically as the text grows, up to a cap, then scrolls.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:1830 (quoted code not found in the file now); apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > keep adding lines with Shift+Enter (labels found in the code)
- **Steps:**
  1. Type one line, then press Shift+Enter and type another line.
  2. Repeat until there are about ten lines.
  3. Look: the composer grows one row per line up to about 8 text rows, then stops growing and the text scrolls inside it.

## S13.05 Full-screen prompt editing.

- **Expected:** The user can open the draft in a full-screen (or external) editor and return it to the composer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7300; apps/cli/src/tui/composer_edits.rs:140
- **Where to find it:** Main screen > composer box > Ctrl-G (or Ctrl-E) opens your $VISUAL or $EDITOR (labels found in the code)
- **Needs:** a VISUAL or EDITOR environment variable set
- **Steps:**
  1. Before starting agi, set VISUAL or EDITOR in the shell (for example export EDITOR=nano).
  2. Type a draft in the composer.
  3. Press Ctrl-G; the editor opens with the draft.
  4. Edit the text, save and quit the editor.
  5. Look: the edited text is back in the composer. If no editor is set, look for the notice: No editor is set; set VISUAL or EDITOR.

## S13.06 Send button.

- **Expected:** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4082; apps/cli/src/tui/tui_app.rs:1236 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:2846; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > Enter (there is no send button) (labels found in the code)
- **Steps:**
  1. Type a message.
  2. Look for a visible send button; none was found in the code.
  3. Press Enter.
  4. Look: the message is sent and appears in the chat. Then press Enter on an empty composer and look for a reason; none is shown.

## S13.07 Stop button.

- **Expected:** While a reply is generating, a stop control ends it (keeping what was produced).
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:1245 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:8713; apps/cli/src/lib.rs:8321
- **Where to find it:** While a reply is working > Esc (or Ctrl-C) (labels found in the code)
- **Needs:** a signed-in account to get a streamed reply
- **Steps:**
  1. Send a prompt that gives a long answer (needs a signed-in account).
  2. While the reply streams, look at the line that says: working, Esc or Ctrl-C to cancel.
  3. Press Esc.
  4. Look: the reply stops, the text already written stays, and the line: Stopped appears with the notice stopped the turn.

## S13.09 Newline shortcut.

- **Expected:** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:4110; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > Shift+Enter (labels found in the code)
- **Steps:**
  1. Type: first part
  2. Press Shift+Enter.
  3. Type: second part.
  4. Look: a new line is added and the message is not sent.

## S13.10 Undo and redo.

- **Expected:** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4042; apps/cli/src/tui/composer_edits.rs:38
- **Where to find it:** Main screen > composer box > Ctrl-_ to undo, Ctrl-Shift-Z to redo (labels found in the code)
- **Steps:**
  1. Type a sentence, then delete part of it.
  2. Press Ctrl-_ (Ctrl-Shift-- also undoes).
  3. Look: the text goes back to the earlier state.
  4. Press Ctrl-Shift-Z.
  5. Look: the edit is reapplied.

## S13.11 Clipboard paste.

- **Expected:** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3107; apps/cli/src/tui/tui_app.rs:4617; apps/cli/src/tui/tui_app.rs:4098; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > Cmd+V (text) or Ctrl+V (clipboard image) (labels found in the code)
- **Needs:** an image on the clipboard
- **Steps:**
  1. Copy a sentence, switch to agi and paste it into the composer; look: the text appears.
  2. Copy an image (for example a screenshot), then press Ctrl+V in the composer.
  3. Look: a chip line above the composer starts with a paperclip and ends with: /attach remove to drop, and the notice says attached.

## S13.14 Long-prompt handling.

- **Expected:** Very long input is handled deliberately (turned into an attachment, collapsed, or clearly limited with feedback) instead of flooding the composer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4629; apps/cli/src/tui/tui_app.rs:4083; apps/cli/src/tui/composer_edits.rs:113
- **Where to find it:** Main screen > composer box > paste a long text (more than 3 lines or 800 characters) (labels found in the code)
- **Needs:** some long text on the clipboard
- **Steps:**
  1. Copy about 10 lines of text.
  2. Paste it into the composer (Cmd+V).
  3. Look: the composer shows one marker such as [Pasted text #1 +10 lines] instead of all the text.
  4. Press Enter and check the chat: the full text was sent.

## S13.15 Character or token indicators where useful.

- **Expected:** Where length matters, the composer shows a character or token/context indicator before sending.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2019 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:1112; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > header, second row > context meter (labels found in the code)
- **Steps:**
  1. Start a chat and have a few exchanges.
  2. Look at the header's second row for a context meter with a percent.
  3. Type a long draft without sending.
  4. Look: the meter does not change with the draft length; it reflects the conversation so far. In Local mode the label begins with catalog estimate:.

## S13.19 Prompt history in terminal interfaces.

- **Expected:** In the terminal, Up/Down (and a search key) recall previously sent prompts into the composer.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:2661 (quoted code not found in the file now); apps/cli/src/tui/prompt_history.rs:52
- **Where to find it:** Main screen > composer box > Up arrow and Down arrow (labels found in the code)
- **Steps:**
  1. Send three different prompts.
  2. With the composer empty, press Up.
  3. Look: the last sent prompt appears in the composer.
  4. Press Up again, then Down, and check that the earlier and later prompts come back.

## S13.21 Prompt-template insertion.

- **Expected:** The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:719; apps/cli/src/tui/tui_app.rs:4082 (quoted code not found in the file now); apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > type / > pick a custom command in the Commands list > Tab (labels found in the code)
- **Needs:** a custom command file in .agiworkforce/commands/
- **Steps:**
  1. Before starting, add a command file under .agiworkforce/commands/ in the project (for example review-note.md).
  2. Type / in the composer and find your command in the Commands list.
  3. Press Tab on it.
  4. Look: the composer shows the command name (for example /review-note), then type your text after it and press Enter.
  5. Look: the command runs with your text.

## S13.22 Slash-command autocomplete.

- **Expected:** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4494; apps/cli/src/tui/tui_app.rs:4038; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > type / (labels found in the code)
- **Steps:**
  1. With the composer empty, type /.
  2. Look: a Commands list opens over the chat.
  3. Type mo to filter the list, then move with Up and Down.
  4. Look: the list narrows to matching commands; Enter runs the highlighted one and Tab fills it into the composer.

## S13.23 Skill invocation.

- **Expected:** The user can explicitly invoke a Skill from the composer so the next message runs with it.
- **Code:** done. Evidence moved: apps/cli/src/tui/tui_app.rs:4319 (quoted code not found in the file now); apps/cli/src/skills.rs:1469
- **Where to find it:** Main screen > composer box > type / then the skill name (or /skills to list them) (labels found in the code)
- **Needs:** a skill installed under .agiworkforce/skills/ or ~/.agiworkforce/skills/
- **Steps:**
  1. Type /skills and press Enter to list installed skills.
  2. Look: the list starts with Skills (N): or, with none, the notice No skills found.
  3. Type / and find the skill name in the Commands list.
  4. Type the skill name, then your request, and press Enter.
  5. Look: the reply follows the skill's instructions.

## S13.24 Agent or assistant mention.

- **Expected:** The user can address a message to a specific agent or assistant by mentioning or selecting it in the composer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4585; apps/cli/src/mentions.rs:460
- **Where to find it:** Main screen > composer box > type @ > pick an agent in the Files list, or type @agent-<name> (labels found in the code)
- **Needs:** an agent set up in the workspace
- **Steps:**
  1. Make sure an agent is set up in the workspace.
  2. Type @ and look for the Files list; agents should appear in it.
  3. Choose the agent and type your message, then press Enter.
  4. Look: the message is handed to that agent and its reply appears.

## S13.26 File mention.

- **Expected:** Typing a mention in the composer can reference a file, whose contents are included with the message.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4129; apps/cli/src/mentions.rs:315; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > type @ > pick a file in the Files list > Enter (labels found in the code)
- **Needs:** a trusted folder (an untrusted folder sends only the path)
- **Steps:**
  1. Type @ and then part of a file name, for example README.
  2. Look: the Files list narrows; press Enter on the file.
  3. Look: the @file token is inserted into the composer.
  4. Send a question about it and check the reply uses the file contents.

## S13.27 Folder mention.

- **Expected:** Typing a mention in the composer can reference a folder, whose contents are made available to the message.
- **Code:** done. Evidence present: apps/cli/src/mentions.rs:336; apps/cli/src/mentions.rs:468; apps/cli/src/mentions.rs:71
- **Where to find it:** Main screen > composer box > type @ > pick a folder > Enter (labels found in the code)
- **Needs:** a trusted folder (an untrusted folder sends only the path)
- **Steps:**
  1. Type @ and then a folder name, for example src.
  2. Pick the folder entry in the Files list and press Enter.
  3. Look: the @folder/ token is inserted.
  4. Send a question and check the reply lists or uses the folder contents.

## S13.30 Connected-app mention.

- **Expected:** The user can reference a connected app (connector/MCP server) or one of its resources inline in the composer.
- **Code:** done. Evidence moved: apps/cli/src/agent/mod.rs:847 (quoted code not found in the file now); apps/cli/src/tui/tui_app.rs:7800
- **Where to find it:** Main screen > composer box > type @server:resource-uri (typed by hand, no popup) (labels found in the code)
- **Needs:** a connected MCP server that offers resources
- **Steps:**
  1. Connect an MCP server that offers resources (via /mcp).
  2. Type @<server>:<resource-uri> in the composer and press Enter.
  3. Look: the notices in the chat say what was attached, and the reply uses the resource.

## S13.31 Context chips.

- **Expected:** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:3129; apps/cli/src/tui/tui_app.rs:943; apps/cli/src/lib.rs:8321
- **Where to find it:** Main screen > composer box > /attach <file> > chip line above the composer > /attach remove (labels found in the code)
- **Needs:** an image file
- **Steps:**
  1. Type /attach followed by the path of an image file and press Enter.
  2. Look: a chip line above the composer lists the file and says /attach remove to drop.
  3. Type /attach remove and press Enter.
  4. Look: the chip line is gone.

## S13.35 Attachment menu.

- **Expected:** A "+" (attach) menu in the composer lists the ways to add files, media and context.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:6218
- **Where to find it:** Main screen > composer box > type /attach > Enter (labels found in the code)
- **Steps:**
  1. Type /attach and press Enter.
  2. Look: the chat shows the list Ways to add context to your next message: with @path, @agent-<name>, /attach <file>, Ctrl+V and /mcp.

## S13.36 Dictation control.

- **Expected:** A microphone control dictates speech into the composer text (without sending) for review.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** Main screen > composer box > type /dictate > Enter (labels found in the code)
- **Needs:** a microphone
- **Steps:**
  1. Type /dictate and press Enter (an optional language code may follow).
  2. Speak when the app asks you to.
  3. Finish the dictation as the prompt says.
  4. Look: the words appear in the composer, are not sent, and the notice says dictation added to the composer, Enter to send.

## S13.37 Voice-conversation control.

- **Expected:** A control starts a hands-free voice conversation (speak, hear the reply) from the composer.
- **Code:** done. Evidence moved: .github/workflows/release-cli.yml:229 (quoted code not found in the file now); apps/cli/src/voice.rs:1065
- **Where to find it:** Main screen > composer box > type /voice > Enter (alias /v) (labels found in the code)
- **Needs:** a microphone and speakers, and a signed-in account
- **Steps:**
  1. Type /voice and press Enter.
  2. Wait for voice mode to take over the terminal, then speak.
  3. Listen for the spoken reply.
  4. End the voice session as the prompt says.
  5. Look: the notice Voice session ended. appears back in the main screen.

## S13.40 Mid-task steering input.

- **Expected:** While an agent is working, the user can send guidance that steers the running task without stopping it.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:4650; apps/cli/src/tui/tui_app.rs:8482; apps/cli/src/tui/tui_app.rs:7275
- **Where to find it:** While a reply is working > composer box > type a message > Enter (labels found in the code)
- **Needs:** a signed-in account and a long-running reply
- **Steps:**
  1. Send a prompt that takes a while.
  2. While the line shows working, type: use the tests folder, then press Enter.
  3. Look: the line shows the draft with (Enter to queue, /btw to ask aside) and 1 message queued.
  4. Wait for the turn to end and check that the queued message is then sent.

## S13.41 Separate side question that does not modify the main task.

- **Expected:** The user can ask a side question that is answered without being added to (or changing) the main task.
- **Code:** done. Evidence present: apps/cli/src/tui/tui_app.rs:7627; apps/cli/src/tui/tui_app.rs:4715; apps/cli/src/agent/chat.rs:1724
- **Where to find it:** While a reply is working (or any time) > composer box > /btw <question> > Enter (labels found in the code)
- **Needs:** a signed-in account for the answer
- **Steps:**
  1. Start a long reply.
  2. While it works, type /btw what does this file do? and press Enter.
  3. Look: the notice answering the side question appears and a chat line starting btw: shows the answer.
  4. Check that the main reply continues and the main conversation is not changed (for example /status shows the same Turns count).
