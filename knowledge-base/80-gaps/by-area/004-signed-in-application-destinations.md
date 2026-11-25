---
id: "GAPS-AREA-004"
type: "gap-list"
title: "Gaps: Signed-in application destinations"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 4. Signed-in application destinations

105 open gaps that touch this area. Area page: [20-features/004-signed-in-application-destinations](../../20-features/004-signed-in-application-destinations/README.md).

## CMP-CP29

**Session picker: preview, scope widening, search by PR link, rename key**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: It has no preview, no worktree or project scope switch and no search by pull request link The picker lists managed sessions with a text filter and an r key to rename; it has no preview, no worktree or project scope switch and no search by pull request link.
- Evidence: apps/cli/src/tui/tui_app.rs:4253; apps/cli/src/tui/widgets/session_picker.rs:95

## CMP-CP294

**Turn off session history saving or cap its size**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: Only the size cap is missing default.keep_history = false turns session saving off for every run (apps/cli/src/config.rs:205,1459; applied at apps/cli/src/lib.rs:6155-6157). Only the size cap is missing. The row Run without saving a transcript already says so.
- Evidence: searched: history.persistence, max_bytes in apps/cli/src

## CMP-MP22

**Search chats including archived chats**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Archived chats are managed on a separate Archived chats page and search coverage of them is not shown Our search covers chats, projects, files and library; archived chats are managed on a separate Archived chats page and search coverage of them is not shown.
- Evidence: apps/mobile/src/features/chat/ChatsListScreen.tsx:387-396; src/features/search/mobileDestinations.ts:174

## CMP-V14

**Rename sessions and auto-archive inactive ones**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F018-01](../../20-features/018-conversation-level-controls/F018-01-test.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Detail: Local sessions cannot be renamed in the editor (only cloud runs) and nothing archives them after a period of inactivity.
- Evidence: apps/extension-vscode/src/core/commandSetup.ts:2673; searched: autoArchive, archiveAfter

## CMP-VP72

**Do not keep session history**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F041-08](../../20-features/041-temporary-and-private-experiences/F041-08-local-only-conversations-and-files.md), [F041-09](../../20-features/041-temporary-and-private-experiences/F041-09-local-only-memory.md), [F041-10](../../20-features/041-temporary-and-private-experiences/F041-10-clear-all-data-on-this-device.md), [F085-12](../../20-features/085-personalization-and-data-settings/F085-12-clear-device-data-and-options-that-are-not-offered.md)
- Detail: The editor has no switch for it The engine has a keep_history setting that stops saving sessions; the editor has no switch for it.
- Evidence: apps/cli/src/lib.rs:6030-6035

## CMP-W310

**Archive every chat in a project at once**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: Chats are archived one at a time or all chats in the account from Settings; a project has no archive-its-chats action.
- Evidence: searched: archiveAll, archive all chats, archiveProjectChats in apps/web/features/projects, apps/web/features/chat, apps/web/app/api/projects, packages/ui/unified-chat/src

## CMP-WP247

**Filter and group the chat list (Type, Status, Last activity, Group by, Sort by)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: No Group by or Sort by Chats and tasks has All, Chats and Tasks filters, search and bulk archive or delete; no Group by or Sort by.
- Evidence: apps/web/features/chat/components/ChatsAndTasksList.tsx:45; apps/web/app/chat/chats/page.tsx:4

## CMP-WP44

**Shortcuts: pin, rename, archive, mark unread**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md)
- Detail: No keys for these No keys for these; the composer commands /pin, /rename and /archive do the same.
- Evidence: packages/ui/unified-chat/src/lib/shortcutRegistry.ts:30-245 (no ids); features/chat/lib/chat-slash-commands.ts:26-32

## GAP-AREA004-LW06

**Approvals inbox: the web has a 'Needs you' filter inside the tasks page, not a separate inbox. It covers Cloud runs only, not schedule run approvals, which are resolved from the schedule card.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-004
- Detail: Area 4. Signed-in application destinations
- Evidence: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:60; apps/web/features/schedules/components/SchedulesPage.tsx:430

## GAP-AREA004-LW08

**Video studio is marked not applicable everywhere, yet video generation routes and a jobs table exist.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-004
- Detail: Area 4. Signed-in application destinations
- Evidence: apps/web/app/api/media/video; apps/web/lib/server/media-job-history.ts:142

## GAP-AREA004-LW10

**The workspace-sharing page lists items only for workspace members.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-004
- Detail: Area 4. Signed-in application destinations
- Evidence: apps/web/app/api/settings/organization/shared/route.ts:57

## GAP-CAP-conversations-and-history-01

**Start a new chat: Unsent draft is not restored in the CLI or Chrome (S12.23). No shortcut check was made on every app.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F012-01](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md), [F012-09](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md), [F012-11](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Requirement items: S12.01, S12.20, S12.23, S4.01
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-02

**Chat list (Recents) with groups, sort and filter: Filter and group by type, status and last activity is partial (WP247). The archived view still reads Recents (cosmetic, seen). The phone sidebar account row is clipped at 390 wide (seen).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Requirement items: S4.02, S4.05
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-conversations-and-history-03

**Search past chats: Web shows three result rows for one chat and the dialog jumps as results change (seen, cosmetic). Mobile search of archived chats is partial (MP22).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Requirement items: S34.02, S4.03
- Detail: Claude partly, ChatGPT yes; AGI built

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

## GAP-CAP-conversations-and-history-09

**Archived chats list (restore or delete from it): Chrome has no archived list.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Requirement items: S4.04
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-conversations-and-history-19

**Resume past sessions in coding tools: No rename or auto-archive in VS Code (V14). Session picker preview and PR search partial (CP29). Turning off history saving partial (CP294, VP72).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md), [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md)
- Requirement items: S34.02, S4.02
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-research-10

**Cited report with outline and full-screen reader: No conflicting-evidence display; no attachments; no CLI, VS Code or Chrome reader.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md), [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Requirement items: S35.12, S35.13, S35.14, S35.20, S35.21, S35.22, S35.23, S35.24, S4.32, S7.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-12

**Research history, reopen and rerun: Comparing report revisions (S35.27) is missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md), [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md), [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Requirement items: S35.19, S35.25, S35.26, S4.32
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-F004-01-01

**Not-found behaviour differs from the brief: the code redirects with a toast.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md)
- Detail: Affects: Web and Desktop. Work needed: Decide the intended state and align code, tests and brief
- Evidence: WebChatPage.tsx:2369-2384 vs not-found.tsx:21

## GAP-F004-01-02

**Offline or reconnect handling for opening a chat not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md)
- Detail: Affects: Web, Desktop. Work needed: Confirm and add or document
- Evidence: No handling seen in WebChatPage.tsx:2357-2400

## GAP-F004-01-03

**Chrome and VS Code reopen paths not verified in this review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md)
- Detail: Affects: Chrome, VS Code. Work needed: Read the history list code and add a test
- Evidence: Only command registration seen (commandSetup.ts:1392-1399)

## GAP-F004-01-04

**No test found that covers the Work-mode rewrite from /agi-work.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-01](../../20-features/004-signed-in-application-destinations/F004-01-new-chat-and-past-chats.md)
- Detail: Affects: Web. Work needed: Add a proxy test
- Evidence: No test file named for the proxy rewrite was found in this review (search was by name only)

## GAP-F004-02-01

**Brief says CLI pin is missing but the CLI implements it.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: Affects: CLI. Work needed: Correct the brief; confirm the TUI also shows pins
- Evidence: apps/cli/src/lib.rs:1940-1945,5646-5647

## GAP-F004-02-02

**Archived rows cannot be opened from the web archived page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: Affects: Web, Desktop. Work needed: Add Open or change the requirement
- Evidence: ArchivedChatsSection.tsx:176-195

## GAP-F004-02-03

**Search wildcards from user input are not escaped.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: Affects: Web, Desktop, mobile Cloud. Work needed: Escape % and _ and add a test
- Evidence: search/route.ts:316

## GAP-F004-02-04

**Local-mode mobile chats cannot be archived.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: Affects: Mobile Local. Work needed: Decide whether Local needs an archive set
- Evidence: useConversationActions.ts:109-112

## GAP-F004-02-05

**No pin or archive in VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: Affects: VS Code, Chrome. Work needed: Decide scope per app
- Evidence: No pin or archive command found in commandSetup.ts; brief marks them missing

## GAP-F004-02-06

**Whether the indexed search uses a model provider is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Detail: Affects: All with web search. Work needed: Read retrieval-search-service
- Evidence: search/route.ts:21-31 imports retrieval search

## GAP-F004-02-NOTBUILT

**Search, archived and pinned chats: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F004-02](../../20-features/004-signed-in-application-destinations/F004-02-search-archived-and-pinned-chats.md)
- Requirement items: S4.03, S4.04, S4.05
- Detail: CLI: S4.05; VS Code: S4.05; Chrome: S4.03, S4.04, S4.05

## GAP-F004-03-01

**CLI cannot list a project's conversations.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-03](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)
- Detail: Affects: CLI. Work needed: Add listing
- Evidence: Brief S4.08; lib.rs:1304 shows count only

## GAP-F004-03-02

**Chrome has no projects manager; only active project selection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-03](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)
- Detail: Affects: Chrome. Work needed: Decide scope; verify
- Evidence: side_panel.ts:912,5865

## GAP-F004-03-03

**The plan numbers are not asserted by any test I could name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-03](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)
- Detail: Affects: Web. Work needed: Add or locate test
- Evidence: No test by name found for getProjectLimit in this review

## GAP-F004-03-04

**Mobile Local project behavior under limits is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-03](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)
- Detail: Affects: Mobile Local. Work needed: Read local store rules
- Evidence: projects.tsx:72-82

## GAP-F004-03-NOTBUILT

**Projects: list, overview, chats, instructions: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F004-03](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)
- Requirement items: S4.08
- Detail: CLI: S4.08

## GAP-F004-03-PARTLY

**Projects: list, overview, chats, instructions: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F004-03](../../20-features/004-signed-in-application-destinations/F004-03-projects-list-overview-chats-instructions.md)
- Requirement items: S4.06, S4.07, S4.08, S4.10

## GAP-F004-04-01

**Brief is stale for mobile members, mobile memory, CLI sources and the CLI flag name.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-04](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)
- Detail: Affects: Mobile, CLI. Work needed: Update the brief and verify these screens by use
- Evidence: ProjectSettingsScreen.tsx:193; lib.rs:1328,1447

## GAP-F004-04-02

**Notebook annotation and generated outputs were not confirmed.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-04](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)
- Detail: Affects: Web, Desktop. Work needed: Read and verify against S4.31
- Evidence: ProjectStudio.tsx not read

## GAP-F004-04-03

**Chrome and VS Code have no sources, members or memory.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-04](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)
- Detail: Affects: Chrome, VS Code. Work needed: Decide scope
- Evidence: Brief marks missing; none found

## GAP-F004-04-04

**CLI cannot remove a source or list project sources except via show.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-04](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)
- Detail: Affects: CLI. Work needed: Add remove-file if required
- Evidence: ProjectsSubcommand list in lib.rs:1286-1352 has no remove-file

## GAP-F004-04-NOTBUILT

**Project sources, members, memory and notebook: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F004-04](../../20-features/004-signed-in-application-destinations/F004-04-project-sources-members-memory-and-notebook.md)
- Requirement items: S4.09, S4.11, S4.12, S4.31
- Detail: Mobile: S4.11, S4.12, S4.31; CLI: S4.09, S4.11, S4.31; VS Code: S4.11, S4.12, S4.31; Chrome: S4.09, S4.11, S4.12, S4.31

## GAP-F004-05-01

**No CLI view of Work runs.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Detail: Affects: CLI. Work needed: Decide scope
- Evidence: Brief S4.13-16 cli missing; no runs command found

## GAP-F004-05-02

**Chrome has no approval controls in its tasks sheet.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Detail: Affects: Chrome. Work needed: Add or document
- Evidence: tasksSheet.ts:30-60 shows Stop only

## GAP-F004-05-03

**Wording differs: Deny on web, Reject on VS Code, brief says Reject.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Detail: Affects: Web, VS Code. Work needed: One term
- Evidence: tool-approval-policy.ts:30; cloudRunApproval.ts:92

## GAP-F004-05-04

**Start Work button is not always visible on /tasks.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Detail: Affects: Web, Desktop. Work needed: Decide design
- Evidence: TasksPage.tsx:605-609

## GAP-F004-05-05

**Treatment of the awaiting_approval state versus the card condition.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Detail: Affects: Web. Work needed: Verify by running
- Evidence: TasksPage.tsx:60-64 vs 887

## GAP-F004-05-NOTBUILT

**AGI Work tasks, approvals and details: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Requirement items: S4.13, S4.14, S4.15, S4.16
- Detail: CLI: S4.13, S4.14, S4.15, S4.16

## GAP-F004-05-PARTLY

**AGI Work tasks, approvals and details: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F004-05](../../20-features/004-signed-in-application-destinations/F004-05-agi-work-tasks-approvals-and-details.md)
- Requirement items: S4.14, S4.15, S4.16

## GAP-F004-06-01

**Brief's idempotency description is wrong: the key is reused until success.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-06](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)
- Detail: Affects: Brief and testers. Work needed: Fix the brief; add a test for retry reuse
- Evidence: SchedulesPage.tsx:636-640

## GAP-F004-06-02

**VS Code lacks create and edit in the schedules tree (not seen).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-06](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)
- Detail: Affects: VS Code. Work needed: Verify and decide
- Evidence: commandSetup.ts:2563-2580

## GAP-F004-06-03

**Approval handling on mobile and Chrome history not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-06](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)
- Detail: Affects: Mobile, Chrome. Work needed: Read and test
- Evidence: Files not opened

## GAP-F004-06-04

**Retention of run history unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-06](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)
- Detail: Affects: All. Work needed: Read deletion policy
- Evidence: No policy read

## GAP-F004-06-05

**No Local-mode scheduled execution for phones.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-06](../../20-features/004-signed-in-application-destinations/F004-06-scheduled-tasks-and-routine-details.md)
- Detail: Affects: Mobile Local. Work needed: Product decision
- Evidence: schedules/index.tsx:83

## GAP-F004-07-01

**CLI cannot send a follow-up instruction to an existing session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-07](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)
- Detail: Affects: CLI users. Work needed: Add a send action calling the agent turn route with an idempotency key.
- Evidence: apps/cli/src/lib.rs:1163 lists only start, handoff, list, show, open, approvals, approve, reject

## GAP-F004-07-02

**Chrome extension has no Code surface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-07](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)
- Detail: Affects: Chrome users. Work needed: Decide whether Code belongs in Chrome; if yes, add a list and open-in-web entry.
- Evidence: brief S4.19 status chrome missing; no reference in apps/extension/src

## GAP-F004-07-03

**Brief code references are stale (cloud-code-api.ts:356/364, tui_app.rs lines) so verification by line is not possible.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-07](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)
- Detail: Affects: Engineers and testers. Work needed: Refresh the brief's code column.
- Evidence: apps/web/features/code/services/cloud-code-api.ts has 70 lines

## GAP-F004-07-04

**Plan gate wording in the brief ('exact plan gate for Code') was unknown; code shows it is a Code daily budget above zero plus sandboxes above zero. Local-only, own-key and free users cannot use cloud Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-07](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)
- Detail: Affects: Free, local-only and own-key users. Work needed: Confirm with the owner that own-key users should be excluded from cloud Code; own-key sandbox compute still costs us.
- Evidence: packages/contracts/types/src/billing-catalog.ts:839

## GAP-F004-07-05

**Desktop (Tauri) code was not checked for a separate Code surface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-07](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)
- Detail: Affects: Desktop. Work needed: Read apps/desktop/src Code and record.
- Evidence: not read

## GAP-F004-07-NOTBUILT

**Coding sessions: not built on Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F004-07](../../20-features/004-signed-in-application-destinations/F004-07-coding-sessions.md)
- Requirement items: S4.19, S4.20
- Detail: Chrome: S4.19, S4.20

## GAP-F004-08-01

**Mobile device list and remote session viewer are off in v1.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-08](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)
- Detail: Affects: Mobile users. Work needed: Owner decision to enable; then verify pairing.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:17

## GAP-F004-08-02

**CLI can list but not rename or unlink; brief says missing.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-08](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)
- Detail: Affects: CLI users. Work needed: Add actions or update the brief.
- Evidence: apps/cli/src/lib.rs:1100

## GAP-F004-08-03

**No remote-session viewer on web or desktop.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-08](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)
- Detail: Affects: Web and desktop users. Work needed: Decide scope.
- Evidence: brief S4.22

## GAP-F004-08-04

**Web Account panel has no way to pair a new device.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-08](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)
- Detail: Affects: Web users. Work needed: Add a pair action or document linking from the device.
- Evidence: apps/web/features/settings/components/LinkedDevicesPanel.tsx

## GAP-F004-08-05

**VS Code and Chrome are not shown as devices management surfaces though they heartbeat as device types.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-08](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)
- Detail: Affects: VS Code and Chrome users. Work needed: None for listing (they appear in the web list); management stays on web.
- Evidence: apps/web/features/settings/components/LinkedDevicesPanel.tsx:46

## GAP-F004-08-NOTBUILT

**Devices and remote sessions: not built on Web, Desktop, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, VS Code, Chrome
- Features: [F004-08](../../20-features/004-signed-in-application-destinations/F004-08-devices-and-remote-sessions.md)
- Requirement items: S4.21, S4.22
- Detail: Web: S4.22; Desktop: S4.22; VS Code: S4.21, S4.22; Chrome: S4.21, S4.22

## GAP-F004-09-01

**No dedicated image studio on web; only redirect to Library.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Detail: Affects: Web and desktop. Work needed: Owner decision: keep chat-first images or build a studio page.
- Evidence: apps/web/app/chat/images/page.tsx:3

## GAP-F004-09-02

**Artifact editor exists only on web (and desktop through hosted web).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Detail: Affects: Mobile, CLI, VS Code, Chrome. Work needed: Decide per app.
- Evidence: brief S4.26; ArtifactPreview.tsx:1041

## GAP-F004-09-03

**No Library or artifact gallery on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Detail: Affects: VS Code, Chrome. Work needed: Add or mark not applicable.
- Evidence: no api/library use in those folders

## GAP-F004-09-04

**Media jobs not available in CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Detail: Affects: those apps. Work needed: Optional CLI view.
- Evidence: brief S4.30

## GAP-F004-09-05

**Nothing in the repository records a run of these screens; the brief marks all partial or unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Detail: Affects: Testers. Work needed: Run scenarios and record.
- Evidence: brief statuses

## GAP-F004-09-NOTBUILT

**Library, artifacts, images and media jobs: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Requirement items: S4.23, S4.25, S4.26, S4.27, S4.28, S4.30
- Detail: Mobile: S4.26; CLI: S4.26, S4.28, S4.30; VS Code: S4.23, S4.25, S4.26, S4.27, S4.28, S4.30; Chrome: S4.23, S4.25, S4.26, S4.27, S4.28, S4.30

## GAP-F004-09-PARTLY

**Library, artifacts, images and media jobs: partly built on Web, Desktop, Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Chrome
- Features: [F004-09](../../20-features/004-signed-in-application-destinations/F004-09-library-artifacts-images-and-media-jobs.md)
- Requirement items: S4.25, S4.27

## GAP-F004-10-01

**Shared project rows have no Open link in this component.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-10](../../20-features/004-signed-in-application-destinations/F004-10-shared-items.md)
- Detail: Affects: Web and desktop members. Work needed: Add link to /chat/projects/<id>.
- Evidence: apps/web/features/settings/sections/OrganizationSharingSection.tsx:385 and :492 only link artifacts and conversations

## GAP-F004-10-02

**No shared items on mobile, CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-10](../../20-features/004-signed-in-application-destinations/F004-10-shared-items.md)
- Detail: Affects: those apps. Work needed: Decide scope.
- Evidence: brief S4.24

## GAP-F004-10-03

**Page is a workspace overview, not a personal 'shared with me' list.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-10](../../20-features/004-signed-in-application-destinations/F004-10-shared-items.md)
- Detail: Affects: Members. Work needed: Rename in brief or add a personal view.
- Evidence: apps/web/app/workspace/sharing/page.tsx:12

## GAP-F004-10-NOTBUILT

**Shared items: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F004-10](../../20-features/004-signed-in-application-destinations/F004-10-shared-items.md)
- Requirement items: S4.24
- Detail: Mobile: S4.24; CLI: S4.24; VS Code: S4.24; Chrome: S4.24

## GAP-F004-11-01

**Brief says web, desktop and mobile missing; code has them.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-11](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)
- Detail: Affects: Documentation. Work needed: Update brief S4.33 and S4.34.
- Evidence: apps/web/app/chat/agents/page.tsx; apps/mobile/app/(app)/agents/index.tsx

## GAP-F004-11-02

**CLI has no cloud agent manager; its agents are local files with a different model.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-11](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)
- Detail: Affects: CLI users. Work needed: Name the difference in help or add cloud agent commands.
- Evidence: apps/cli/src/agents.rs:252

## GAP-F004-11-03

**No agents on VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-11](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)
- Detail: Affects: those apps. Work needed: Decide scope.
- Evidence: none found

## GAP-F004-11-04

**No subscription rule for agents found; whether Free may create is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-11](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)
- Detail: Affects: Free plan. Work needed: Confirm product rule and entitlement check.
- Evidence: apps/web/lib/services/custom-agent-service.ts

## GAP-F004-11-NOTBUILT

**Agents (custom assistants): not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F004-11](../../20-features/004-signed-in-application-destinations/F004-11-agents-custom-assistants.md)
- Requirement items: S4.33, S4.34
- Detail: CLI: S4.33, S4.34; VS Code: S4.33, S4.34; Chrome: S4.33, S4.34

## GAP-F004-12-01

**Connectors are globally coming soon; only listed ids are released.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-12](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)
- Detail: Affects: All apps. Work needed: Owner release decision.
- Evidence: packages/contracts/types/src/connector-release.ts:11

## GAP-F004-12-02

**CLI plugins do not use the web plugin marketplace routes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-12](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)
- Detail: Affects: CLI and web users expecting one plugin list. Work needed: Decide whether CLI plugins should sync with the account.
- Evidence: apps/cli/src/lib.rs:2021

## GAP-F004-12-03

**Brief out of date for mobile plugins and CLI connectors.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-12](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)
- Detail: Affects: Documentation. Work needed: Update brief.
- Evidence: apps/mobile/app/(app)/plugins/index.tsx; apps/cli/src/lib.rs:1275

## GAP-F004-12-04

**No Chrome manager for skills, plugins or connectors; VS Code has no connected accounts view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-12](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)
- Detail: Affects: Chrome, VS Code. Work needed: Decide scope.
- Evidence: none found

## GAP-F004-12-05

**CLI cannot connect a connector, only list and disconnect.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-12](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)
- Detail: Affects: CLI. Work needed: Open the web connect URL from the CLI.
- Evidence: apps/cli/src/lib.rs:1275

## GAP-F004-12-NOTBUILT

**Skills, plugins and connected accounts: not built on Mobile, CLI, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, Chrome
- Features: [F004-12](../../20-features/004-signed-in-application-destinations/F004-12-skills-plugins-and-connected-accounts.md)
- Requirement items: S4.35, S4.36, S4.37
- Detail: Mobile: S4.36; CLI: S4.37; Chrome: S4.35, S4.36

## GAP-F004-13-01

**Billing has no recorded live check with Stripe test checkout and migration 0281.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-13](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)
- Detail: Affects: Web and Electron Desktop paid people. Work needed: Run the live check and record it under audit/.
- Evidence: brief S4.40 Unfinished

## GAP-F004-13-02

**Mobile shows no billing management in v1.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-13](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)
- Detail: Affects: Mobile paid or comped accounts. Work needed: Owner decision when sales open (not before 2027-01-01 per owner notes).
- Evidence: apps/mobile/lib/v1FeatureFlags.ts:6; storePurchases.json

## GAP-F004-13-03

**Mobile picker uses /api/models, not the catalogue projection.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-13](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)
- Detail: Affects: Mobile Cloud mode. Work needed: Confirm parity or move to the projection.
- Evidence: providerAvailabilityStore.ts:5

## GAP-F004-13-04

**Brief code reference for default model is stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-13](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)
- Detail: Affects: Engineers using the brief. Work needed: Update the brief source.
- Evidence: GeneralSection.tsx has 881 lines; brief cites :1060

## GAP-F004-13-05

**Whether CLI, VS Code and Chrome hide meters for Free is unknown.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-13](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)
- Detail: Affects: Those apps. Work needed: Read and test.
- Evidence: usage_summary.rs, commandSetup.ts:2185 not read in full

## GAP-F004-13-PARTLY

**Models, usage, billing and settings: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F004-13](../../20-features/004-signed-in-application-destinations/F004-13-models-usage-billing-and-settings.md)
- Requirement items: S4.40
- Detail: Web S4.40: live-check: with a beta_redemptions-granted test account run Stripe test checkout, then /settings/billing on web and in Electron: plan, invoices, portal (opens externally in Electron) and the overage toggle work; migration 0281 is applied | Desktop S4.40: live-check: with a beta_redemptions-granted test account run Stripe test checkout, then /settings/billing on web and in Electron: plan, invoices, portal (opens externally in Electron) and the overage toggle work; migration 0281 is applied | Mobile S4.40: D-2026-09-28-27: web-billed plans are managed on the web; invoices, card and plan change link out. FEATURES.billing and the waitlist are owner-held.

## GAP-F004-14-01

**Chrome extension has no found help or feedback code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-14](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
- Detail: Affects: Chrome. Work needed: Verify or add.
- Evidence: search of apps/extension/src found none; brief S4.44 'unverified'

## GAP-F004-14-02

**Admin console is not on mobile, CLI, VS Code or Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-14](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
- Detail: Affects: Admins on those apps. Work needed: Owner decision on parity.
- Evidence: brief S4.42

## GAP-F004-14-03

**English labels of account-menu Help entries not confirmed (translation keys only).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-14](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
- Detail: Affects: Knowledge base accuracy. Work needed: Read the locale file.
- Evidence: AccountMenuItems.tsx:92-100

## GAP-F004-14-04

**Live checks of invitation, seat payment and key use not recorded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-14](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
- Detail: Affects: Web admins and developers. Work needed: Run and record.
- Evidence: no run record found

## GAP-F004-14-NOTBUILT

**Workspace admin, developer console and help: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F004-14](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
- Requirement items: S4.42, S4.43, S4.44
- Detail: CLI: S4.42; VS Code: S4.42; Chrome: S4.42, S4.43, S4.44

## GAP-F004-14-PARTLY

**Workspace admin, developer console and help: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F004-14](../../20-features/004-signed-in-application-destinations/F004-14-workspace-admin-developer-console-and-help.md)
- Requirement items: S4.44

## GAP-F004-99-01

**S4.29 statuses in this feature (built) contradict the brief item (not applicable anywhere).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)
- Detail: Affects: Area status accuracy. Work needed: Correct the status data.
- Evidence: brief S4.29; docs/decisions/2026-09-27-founder-decisions.md:132

## GAP-F004-99-02

**Mobile video generation is off in v1.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)
- Detail: Affects: Mobile. Work needed: Owner decision.
- Evidence: apps/mobile/lib/v1FeatureFlags.ts videoGen false

## GAP-F004-99-03

**Report reader absent on CLI, VS Code and Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)
- Detail: Affects: Those apps. Work needed: Decide whether parity is required.
- Evidence: brief S4.32

## GAP-F004-99-04

**Library tab name hides that it holds reports.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)
- Detail: Affects: Web users. Work needed: Rename or explain.
- Evidence: ResearchPanel.tsx:395-475

## GAP-F004-99-NOTBUILT

**Other items in Signed-in application destinations: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md)
- Requirement items: S4.32
- Detail: CLI: S4.32; VS Code: S4.32; Chrome: S4.32
