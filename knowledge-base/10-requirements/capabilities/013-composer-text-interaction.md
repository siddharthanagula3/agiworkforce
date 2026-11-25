---
id: "REQ-AREA-013"
type: "requirements"
title: "Requirement items: Composer text interaction"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 13. Composer text interaction

41 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S13.01

**Plain-text entry.** The user can type a plain-text message into the composer and send it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F013-01 Typing, new lines and height](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)

## S13.02

**Multiline entry.** The composer accepts multi-line text (line breaks are kept in the sent message).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F013-01 Typing, new lines and height](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)

## S13.03

**Automatic height growth.** The composer grows taller automatically as the text grows, up to a cap, then scrolls.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F013-01 Typing, new lines and height](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)

## S13.04

**Manual expansion.** The user can manually enlarge the composer (an expand control or resize handle) beyond its automatic height.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F013-04 Manual expand and full-screen editing](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)

## S13.05

**Full-screen prompt editing.** The user can open the draft in a full-screen (or external) editor and return it to the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F013-04 Manual expand and full-screen editing](../../20-features/013-composer-text-interaction/F013-04-manual-expand-and-full-screen-editing.md)

## S13.06

**Send button.** A visible send button submits the composed message (and is disabled with a reason when sending is blocked).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F013-02 Send and Stop buttons](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)

## S13.07

**Stop button.** While a reply is generating, a stop control ends it (keeping what was produced).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web UI_ONLY
- Feature: [F013-02 Send and Stop buttons](../../20-features/013-composer-text-interaction/F013-02-send-and-stop-buttons.md)
- Competitor trace: CAP-editing-regeneration-and-branching-11

## S13.08

**Enter-to-send preference.** The user can choose in settings whether Enter sends or inserts a newline (e.g. Cmd/Ctrl+Enter to send).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F013-03 Enter key choice and shortcuts](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)

## S13.09

**Newline shortcut.** A keyboard shortcut (e.g. Shift+Enter) inserts a newline without sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F013-01 Typing, new lines and height](../../20-features/013-composer-text-interaction/F013-01-typing-new-lines-and-height.md)

## S13.10

**Undo and redo.** Standard undo/redo shortcuts (Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z) revert and reapply edits in the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile unverified, CLI done, VS Code unverified, Chrome done
- Feature: [F013-03 Enter key choice and shortcuts](../../20-features/013-composer-text-interaction/F013-03-enter-key-choice-and-shortcuts.md)

## S13.11

**Clipboard paste.** Pasting from the clipboard inserts text into the composer and turns pasted files/images into attachments.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F013-05 Paste handling](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)

## S13.12

**Rich-text paste normalization.** Pasting formatted (HTML/rich) text yields clean plain text in the composer, without styling or markup.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code done, Chrome done
- Feature: [F013-05 Paste handling](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)

## S13.13

**Code-paste formatting.** Pasted source code is recognized and wrapped in a code block (with a way to paste it as plain text).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F013-05 Paste handling](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)

## S13.14

**Long-prompt handling.** Very long input is handled deliberately (turned into an attachment, collapsed, or clearly limited with feedback) instead of flooding the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F013-05 Paste handling](../../20-features/013-composer-text-interaction/F013-05-paste-handling.md)

## S13.15

**Character or token indicators where useful.** Where length matters, the composer shows a character or token/context indicator before sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F013-06 Length counter and context warning](../../20-features/013-composer-text-interaction/F013-06-length-counter-and-context-warning.md)

## S13.16

**Draft autosave.** The unsent composer text is saved automatically while typing, so it survives a reload or crash.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome partial
- Seen in a real run: Web FAIL
- Feature: [F013-07 Drafts: autosave, recovery, isolation](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)

## S13.17

**Draft recovery.** After a reload, crash or failed send, the unsent text is put back in the composer (with a notice).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome partial
- Seen in a real run: Web FAIL
- Feature: [F013-07 Drafts: autosave, recovery, isolation](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)

## S13.18

**Draft isolation by conversation.** Each conversation keeps its own unsent draft; switching chats never carries text into another chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome partial
- Feature: [F013-07 Drafts: autosave, recovery, isolation](../../20-features/013-composer-text-interaction/F013-07-drafts-autosave-recovery-isolation.md)

## S13.19

**Prompt history in terminal interfaces.** In the terminal, Up/Down (and a search key) recall previously sent prompts into the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): CLI done
- Feature: [F013-08 Prompt history and prompt suggestions](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)

## S13.20

**Prompt suggestions.** The product offers prompt suggestions (e.g. follow-up questions) that the user can pick to fill or send the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile missing, CLI missing, VS Code done, Chrome missing
- Feature: [F013-08 Prompt history and prompt suggestions](../../20-features/013-composer-text-interaction/F013-08-prompt-history-and-prompt-suggestions.md)

## S13.21

**Prompt-template insertion.** The user can insert a saved prompt template (e.g. a custom command) into the composer, filling in their own text.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F013-09 Slash commands, templates and skills](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)

## S13.22

**Slash-command autocomplete.** Typing "/" opens a filtered list of commands that can be chosen with keyboard or pointer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F013-09 Slash commands, templates and skills](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)

## S13.23

**Skill invocation.** The user can explicitly invoke a Skill from the composer so the next message runs with it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F013-09 Slash commands, templates and skills](../../20-features/013-composer-text-interaction/F013-09-slash-commands-templates-and-skills.md)

## S13.24

**Agent or assistant mention.** The user can address a message to a specific agent or assistant by mentioning or selecting it in the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.25

**Project mention.** Typing a mention in the composer can reference a project, scoping the message to it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, Chrome done
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.26

**File mention.** Typing a mention in the composer can reference a file, whose contents are included with the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code done, Chrome missing
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.27

**Folder mention.** Typing a mention in the composer can reference a folder, whose contents are made available to the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code missing
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.28

**Repository mention.** Typing a mention in the composer can reference a code repository (e.g. a connected GitHub repo) as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.29

**Browser-tab mention.** The user can reference an open browser tab (choosing which one) as context for the message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Chrome done
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.30

**Connected-app mention.** The user can reference a connected app (connector/MCP server) or one of its resources inline in the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F013-10 @ mentions of projects, files, folders, apps, tabs and agents](../../20-features/013-composer-text-interaction/F013-10-mentions-of-projects-files-folders-apps-tabs-and-a.md)

## S13.31

**Context chips.** Context attached to the next message (skill, project, folder, files, page) shows as removable chips in the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F013-11 Context chips, selected sources and tools](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)

## S13.32

**Selected-source chips.** Sources chosen for the next message (e.g. web search, connector resources, a page) are shown as chips before sending.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome done
- Feature: [F013-11 Context chips, selected sources and tools](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)

## S13.33

**Selected-tool chips.** Tools switched on for the next message (e.g. research, code, office files) are shown as chips near the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F013-11 Context chips, selected sources and tools](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md)
- Competitor trace: CAP-research-01

## S13.34

**Output-format selection.** Before sending, the user can choose the output format for the reply (e.g. table, document, code, slides).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, VS Code missing, Chrome missing
- Feature: [F013-12 + menu, output format, dictation and voice](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)

## S13.35

**Attachment menu.** A "+" (attach) menu in the composer lists the ways to add files, media and context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F013-12 + menu, output format, dictation and voice](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)

## S13.36

**Dictation control.** A microphone control dictates speech into the composer text (without sending) for review.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome done
- Feature: [F013-12 + menu, output format, dictation and voice](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)

## S13.37

**Voice-conversation control.** A control starts a hands-free voice conversation (speak, hear the reply) from the composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F013-12 + menu, output format, dictation and voice](../../20-features/013-composer-text-interaction/F013-12-menu-output-format-dictation-and-voice.md)

## S13.38

**Queued next prompt.** While a reply is still generating, the user can type and queue the next message, which sends when the reply finishes.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F013-13 Queued and steering messages, side questions](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Competitor trace: CAP-editing-regeneration-and-branching-14

## S13.39

**Edit or cancel queued prompt.** A queued message can be edited or cancelled before it is sent.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F013-13 Queued and steering messages, side questions](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Competitor trace: CAP-editing-regeneration-and-branching-14

## S13.40

**Mid-task steering input.** While an agent is working, the user can send guidance that steers the running task without stopping it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F013-13 Queued and steering messages, side questions](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
- Competitor trace: CAP-editing-regeneration-and-branching-14

## S13.41

**Separate side question that does not modify the main task.** The user can ask a side question that is answered without being added to (or changing) the main task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code missing, Chrome missing
- Feature: [F013-13 Queued and steering messages, side questions](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md)
