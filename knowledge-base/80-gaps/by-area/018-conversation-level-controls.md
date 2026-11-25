---
id: "GAPS-AREA-018"
type: "gap-list"
title: "Gaps: Conversation-level controls"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 18. Conversation-level controls

26 open gaps that touch this area. Area page: [20-features/018-conversation-level-controls](../../20-features/018-conversation-level-controls/README.md).

## CMP-CP30

**Slash command /rename**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: It cannot rename the current session without its id, which is what Claude /rename does /rename needs "<id> <new title>" and fails with a usage line otherwise (apps/cli/src/repl/registry.rs:1029-1035). It cannot rename the current session without its id, which is what Claude /rename does.
- Evidence: apps/cli/src/tui/tui_app.rs:5967

## CMP-V14

**Rename sessions and auto-archive inactive ones**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Local sessions cannot be renamed in the editor (only cloud runs) and nothing archives them after a period of inactivity.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2673; searched: autoArchive, archiveAfter

## CMP-W310

**Archive every chat in a project at once**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Chats are archived one at a time or all chats in the account from Settings; a project has no archive-its-chats action.
- Evidence: searched: archiveAll, archive all chats, archiveProjectChats in apps/web/features/projects, apps/web/features/chat, apps/web/app/api/projects, packages/ui/unified-chat/src

## CMP-WP44

**Shortcuts: pin, rename, archive, mark unread**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: No keys for these No keys for these; the composer commands /pin, /rename and /archive do the same.
- Evidence: packages/ui/unified-chat/src/lib/shortcutRegistry.ts:30-245 (no ids); features/chat/lib/chat-slash-commands.ts:26-32

## GAP-AREA018-LW01

**Test**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-018
- Detail: Area 18. Conversation-level controls
- Evidence: Test

## GAP-CAP-conversations-and-history-06

**Rename a chat and automatic titles: No rename in VS Code (V14); CLI /rename partial (CP30). Web title stays old after an edit of the first message (seen). Title ignores attachments (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.01, S18.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-07

**Pin chats: No pin in CLI or VS Code. The ledger and the comparison disagree for Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.03, S4.05
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-08

**Archive and unarchive chats: No archive-all for a project (W310). Archiving the open chat leaves it open (seen). Archiving offline gives no feedback (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.04, S4.04
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-10

**Delete a chat: See the recovery row: the web dialog says it cannot be undone.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.05
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-11

**Recover a deleted chat (Recently deleted): No screen to see or restore a deleted chat. Docs and copy promise one. The ledger marks delete done without checking recovery.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.05
- Detail: Claude unknown, ChatGPT no; AGI partly built

## GAP-CAP-conversations-and-history-13

**Temporary chat (not saved): No temporary-chat shortcut on web (comparison row without id). VS Code none. CLI and Chrome unclear.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-08](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F041-01](../../20-features/041-temporary-and-private-experiences/F041-01-start-a-temporary-chat.md), [F041-02](../../20-features/041-temporary-and-private-experiences/F041-02-temporary-mode-indicator-and-explainer.md)
- Requirement items: S12.17, S18.10, S41.01, S41.02
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-17

**Export one chat: Chrome has none. VS Code status conflicts.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.18
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-conversations-and-history-20

**History follows the account across devices: Reload mid-answer can leave a chat with no answer (seen, W-3).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.28
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-24

**Move a chat into or out of a project: No move from CLI, VS Code, Chrome. Details sit on the projects page.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S12.20, S18.07
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-10

**Branch tree: see and switch between branches: No branch navigation in CLI, VS Code, Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Requirement items: S18.17, S90.04
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-19

**Edit, retry and branch keep the Local boundary: Regenerate-with-model menu content in a Local chat, and Local retry on Mobile, were not checked.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.10
- Detail: Claude no, ChatGPT no; AGI partly built

## GAP-F018-01-01

**The feature record is a placeholder ('Test', 'Click', 'Works')**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md)
- Detail: Affects: Anyone reading F018-01. Work needed: Replace with real naming and use text
- Evidence: task feature definition; brief S18.01

## GAP-F018-01-02

**Titling on desktop, VS Code and Chrome not confirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md)
- Detail: Affects: those apps. Work needed: Open and document
- Evidence: brief lists code paths (e.g. apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2532) that I did not open

## GAP-F018-01-03

**Own-key chats get no model title**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md)
- Detail: Affects: Web own-key users. Work needed: Product decision
- Evidence: persist-message.ts:190

## GAP-F018-99-01

**Copy into Project, Outline and Scroll-position restoration have no code in the brief**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Affects: all apps. Work needed: Design and build
- Evidence: brief lines 40-42, 64-66, 77-79

## GAP-F018-99-02

**Jump to a turn missing on mobile, CLI, VS Code, Chrome; brief lists no web or desktop status**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Affects: those apps. Work needed: Confirm and build
- Evidence: brief line 70

## GAP-F018-99-03

**Usage summary missing on Web, Desktop, Mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add per-conversation totals
- Evidence: brief line 113

## GAP-F018-99-04

**Connected accounts per conversation unfinished in the UI**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Affects: Web, Desktop. Work needed: Finish the UI
- Evidence: brief line 130

## GAP-F018-99-05

**Brief is out of date: mobile Duplicate and web instructions exist**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Affects: planners and testers. Work needed: Re-audit and correct the brief
- Evidence: useConversationActions.ts:282; route.ts:276

## GAP-F018-99-06

**Chrome extension lacks most controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Affects: Chrome. Work needed: Decide scope
- Evidence: brief status lines

## GAP-F018-99-NOTBUILT

**Other items in Conversation-level controls: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Requirement items: S18.02, S18.03, S18.04, S18.06, S18.07, S18.08, S18.11, S18.13, S18.14, S18.15, S18.16, S18.17, S18.18, S18.19, S18.20, S18.21, S18.22, S18.23, S18.24, S18.25, S18.26, S18.27
- Detail: Web: S18.08, S18.13, S18.16, S18.23, S18.24; Desktop: S18.08, S18.13, S18.16, S18.23, S18.24; Mobile: S18.06, S18.08, S18.11, S18.13, S18.14, S18.16, S18.21, S18.23, S18.24, S18.26, S18.27; CLI: S18.03, S18.07, S18.08, S18.11, S18.13, S18.14, S18.16, S18.17, S18.19, S18.20, S18.26; VS Code: S18.02, S18.03, S18.07, S18.08, S18.11, S18.13, S18.14, S18.15, S18.16, S18.17, S18.18, S18.19, S18.20, S18.24, S18.26, S18.27; Chrome: S18.02, S18.03, S18.04, S18.06, S18.07, S18.08, S18.11, S18.13, S18.14, S18.15, S18.16, S18.17, S18.18, S18.19, S18.20, S18.21, S18.22, S18.23, S18.24, S18.25, S18.26, S18.27
