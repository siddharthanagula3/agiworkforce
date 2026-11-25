---
id: "GAPS-AREA-090"
type: "gap-list"
title: "Gaps: Conversation and synchronization components"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 90. Conversation and synchronization components

68 open gaps that touch this area. Area page: [20-features/090-conversation-and-synchronization-components](../../20-features/090-conversation-and-synchronization-components/README.md).

## CMP-CP73

**Notification when a session needs input or finishes**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md), [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md), [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md), [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: The terminal does not ring or send a desktop notice on its own A Notification hook event fires, but the terminal does not ring or send a desktop notice on its own.
- Evidence: apps/cli/src/agent/chat.rs:3444; searched: bell, notify in tui

## CMP-M99

**Pinned Codex chats sync to the phone**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Detail: No pinning of coding sessions; sessions are listed by state only.
- Evidence: searched: pin, pinned in apps/mobile/src/features/cloud-code

## CMP-MP72

**Move conversations between accounts by export and upload**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F090-06](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Detail: Importing a chat history file as reference was not found (memory import only) Data export exists; importing a chat history file as reference was not found (memory import only).
- Evidence: apps/mobile/services/cloudDataExport.ts; searched: conversations.json in src

## CMP-VP57

**Chats come back after reloading the editor**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Detail: The sidebar chat is not reopened and interrupted steps are not resumed Chat tabs opened in the editor are restored after a reload; the sidebar chat is not reopened and interrupted steps are not resumed.
- Evidence: apps/extension-vscode/src/providers/chatEditorPanel.ts:79-100

## GAP-AREA090-LW05

**The unauthorized state of a deep link reveals whether an id exists for another account, because it checks the table without the owner's scope.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-090
- Detail: Area 90. Conversation and synchronization components
- Evidence: apps/web/lib/services/product-link-resolver.ts:41-43 (existsForAnotherAccount)

## GAP-CAP-editing-regeneration-and-branching-03

**Versions of an edited message, with a pager: Ledger lists an unfinished ui item for web and desktop. A build flag can switch versions off. No pager outside Web, Desktop, Mobile.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F016-03](../../20-features/016-user-message-components/F016-03-timestamp-and-edited-marker.md), [F016-05](../../20-features/016-user-message-components/F016-05-edit-in-place-and-version-paging.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md), [F103-03](../../20-features/103-data-and-persistence-categories/F103-03-chats-branches-and-memory.md)
- Requirement items: S103.07, S16.06, S16.11, S90.03
- Detail: Claude partly, ChatGPT unknown; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-04

**Retry or regenerate a response: No regenerate in the CLI chat. Retry after a failed answer re-ran the first turn on web (defect).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F017-06](../../20-features/017-assistant-message-components/F017-06-regenerate-retry-continue-branch-and-answer-versio.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Requirement items: S17.19, S90.03
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-10

**Branch tree: see and switch between branches: No branch navigation in CLI, VS Code, Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F018-99](../../20-features/018-conversation-level-controls/F018-99-other-items.md), [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Requirement items: S18.17, S90.04
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-synchronization-and-continuity-01

**Chat history follows the account: No two-device check has been run by a person. Web testers wrote 'Sync to other devices not tested'.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md), [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Requirement items: S110.18, S90.01, S90.02, S90.17
- Detail: Claude partly, ChatGPT yes; AGI built

## GAP-CAP-synchronization-and-continuity-02

**Settings and personalization follow the account: There is no list of which settings sync and which stay on the device. Only Web was compared.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Requirement items: S90.12
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-synchronization-and-continuity-04

**Projects, files and artifacts follow the account: Not checked across two devices.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Requirement items: S90.17
- Detail: Claude partly, ChatGPT unknown; AGI built

## GAP-CAP-synchronization-and-continuity-05

**Pinned chats sync: Pinned coding chats do not sync to the phone (M99 Missing). Archived chats lose their pin on Web (W-13 defect).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Requirement items: S90.08, S90.12
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-synchronization-and-continuity-06

**Draft message follows the user: Only Web is listed in the ledger. Mobile and Desktop draft sync is not shown.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-05](../../20-features/090-conversation-and-synchronization-components/F090-05-composer-drafts.md)
- Requirement items: S90.07
- Detail: Claude unknown, ChatGPT unknown; AGI built

## GAP-CAP-synchronization-and-continuity-07

**Safe sync: conflicts, offline queue, deletions: None known in code. Not run on real devices.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Requirement items: S90.16, S90.19, S90.21, S90.23
- Detail: Claude unknown, ChatGPT unknown; AGI built

## GAP-CAP-synchronization-and-continuity-21

**Approve and follow a running session from another device: Read-only attachment (S68.10) and execution-owner indicator (S68.12) are not built on most apps.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F068-03](../../20-features/068-session-continuity-and-remote-session-product/F068-03-answer-approvals-and-drive-a-session-from-another.md), [F068-10](../../20-features/068-session-continuity-and-remote-session-product/F068-10-activity-alerts-on-other-clients.md), [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Requirement items: S68.08, S68.09, S68.11, S68.30, S90.18
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-synchronization-and-continuity-22

**Resume after a dropped connection and resume past sessions: VS Code chat return after reload is Partial (VP57).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F068-02](../../20-features/068-session-continuity-and-remote-session-product/F068-02-live-view-of-a-running-turn.md), [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Requirement items: S68.26, S90.13, S90.15
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-synchronization-and-continuity-27

**Move or import conversations between accounts: Import adapter evidence shown is the memory import route; account-to-organization move not confirmed.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F090-06](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Requirement items: S90.10, S90.22
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-F090-01-01

**Web lists chats and opens a chat by offset, not by the keyset cursor the brief requires.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Detail: Affects: Web, Electron desktop; members with long histories.. Work needed: Switch the hooks to nextCursor and keep offset only for older clients.
- Evidence: apps/web/lib/hooks/useConversations.ts:196, :552, :729-766

## GAP-F090-01-02

**Message provider and token usage are not written by the POST message insert, though S90.02 asks for usage.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Detail: Affects: All apps that save through POST /messages.. Work needed: Trace the writer of these columns (likely the completions path) and record it, or write them here.
- Evidence: apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:33-45 versus messages/route.ts:68

## GAP-F090-01-03

**A malformed cursor silently returns page one.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Detail: Affects: Any client with a corrupt cursor; may show duplicates.. Work needed: Return a validation error.
- Evidence: apps/web/lib/identity/pagination.ts:45-57

## GAP-F090-01-04

**Daily allowance check fails open when the count cannot be read.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Detail: Affects: Free users (cap can be exceeded during a database fault).. Work needed: Decide if fail-open is intended and document or change it.
- Evidence: apps/web/lib/services/tier-unit-quota-service.ts:391-404

## GAP-F090-01-05

**Per-app screens for the list on VS Code, Chrome, CLI and Tauri desktop were not established.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-01](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Detail: Affects: VS Code, Chrome, CLI.. Work needed: Open each app's history screen and record labels and states.
- Evidence: files listed in the implementation map; no list screens opened

## GAP-F090-02-01

**Forked chats lose the parent tree (messages copied without parent_id).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Detail: Affects: Web and mobile Cloud forks; people expecting variants in the fork.. Work needed: Map parent ids through the copy or document that a fork is linear.
- Evidence: apps/web/lib/services/conversation-branch-service.ts:399-423

## GAP-F090-02-02

**Product contract lists branch id, version ordinal, trust transition in the branch graph; not stored as such.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Detail: Affects: All apps; audit and handoff.. Work needed: Decide which fields are required and add them.
- Evidence: docs/product/experience-contract.md:419-427 versus 0156 and 0078 migrations

## GAP-F090-02-03

**Fork allowance counts one message write for many copied messages.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Detail: Affects: Free users.. Work needed: Confirm intent; adjust count.
- Evidence: conversation-branch-service.ts:208-212

## GAP-F090-02-04

**Fork workspace placement is unconfirmed (source read by user only, target insert omits organization_id).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Detail: Affects: Workspace members forking a chat from another workspace.. Work needed: Test a fork with an active workspace different from the source.
- Evidence: conversation-branch-service.ts:226-248, :289-292

## GAP-F090-02-05

**Version paging and fork on Chrome, VS Code and CLI not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-02](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Detail: Affects: Those apps.. Work needed: Search and record, or add.
- Evidence: no matching code in opened files

## GAP-F090-03-01

**No UI control sets starred on web or mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Detail: Affects: All apps with a sidebar or list.. Work needed: Add Star and Unstar actions and a Starred filter, or drop the column.
- Evidence: packages/ui/ui/src/sidebar/SessionItem.tsx:337-420 (no star item); apps/mobile/src/features/conversation-actions/useConversationActions.ts:262-300

## GAP-F090-03-02

**Web and mobile clients do not send If-Match, so concurrent metadata edits overwrite each other.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Detail: Affects: People using two devices.. Work needed: Send versions and handle 412.
- Evidence: no If-Match use in apps/web/lib/hooks/useConversations.ts:892-930 or mobile service; only apps/cli/src/cloud/chat.rs:540-549

## GAP-F090-03-03

**Sync push ignores starred, archived.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Detail: Affects: Mobile and CLI offline edits.. Work needed: Extend the push or state that these use the update route only.
- Evidence: apps/web/app/api/chat/sync/route.ts:608-628

## GAP-F090-03-04

**Mobile has no Archive for Local chats.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Detail: Affects: Mobile Local mode.. Work needed: Decide if Local needs archive.
- Evidence: useConversationActions.ts:106-108

## GAP-F090-03-05

**The draft's 409 conflict for stale versions is wrong: stale version answers 412.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-03](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Detail: Affects: Documentation and testers.. Work needed: Use 412 in tests and docs; 409 belongs to draft conflicts.
- Evidence: apps/web/lib/http-preconditions.ts:20-29

## GAP-F090-04-01

**Mobile and other apps have no confirmed auto-title step of their own; they depend on the server path after sync or save.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-04](../../20-features/090-conversation-and-synchronization-components/F090-04-automatic-chat-titles.md)
- Detail: Affects: Mobile, CLI, Chrome, VS Code.. Work needed: Search mobile cloud turn code and record how a title appears.
- Evidence: no title generation code found outside apps/web in files opened

## GAP-F090-04-02

**Model titles are skipped for chats whose model is a catalog provider offering; reason not documented.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-04](../../20-features/090-conversation-and-synchronization-components/F090-04-automatic-chat-titles.md)
- Detail: Affects: Chats on those models.. Work needed: Document or remove the condition.
- Evidence: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:199

## GAP-F090-04-03

**The draft says title generation counts against the daily allowance; it uses a usage lease instead.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-04](../../20-features/090-conversation-and-synchronization-components/F090-04-automatic-chat-titles.md)
- Detail: Affects: Documentation, Free users.. Work needed: Use the corrected wording.
- Evidence: apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:187-212

## GAP-F090-05-01

**Mobile drafts do not follow the user across devices (no server call).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-05](../../20-features/090-conversation-and-synchronization-components/F090-05-composer-drafts.md)
- Detail: Affects: Mobile users; S90.07 cross-device.. Work needed: Use the same PUT draft route from mobile with revisions.
- Evidence: apps/mobile/src/features/chat/draftStore.ts:1-60

## GAP-F090-05-02

**Conflict handling is a dialog, not newer-wins as the draft says; the statement in the brief draft is wrong.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-05](../../20-features/090-conversation-and-synchronization-components/F090-05-composer-drafts.md)
- Detail: Affects: Documentation, testers.. Work needed: Use the corrected description.
- Evidence: apps/web/features/chat/components/DraftConflictDialog.tsx:68-92

## GAP-F090-05-03

**Server nulls a temporary chat's draft but still answers saved true.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-05](../../20-features/090-conversation-and-synchronization-components/F090-05-composer-drafts.md)
- Detail: Affects: Any client that sends one.. Work needed: Return a refusal.
- Evidence: apps/web/app/api/chat/conversations/[id]/route.ts:219-272

## GAP-F090-05-04

**Drafts on CLI, Chrome and VS Code not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-05](../../20-features/090-conversation-and-synchronization-components/F090-05-composer-drafts.md)
- Detail: Affects: Those apps.. Work needed: Confirm and decide.
- Evidence: no draft sync code found

## GAP-F090-06-01

**Conversation import (S90.22) is missing; only memory text import exists.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-06](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Detail: Affects: All apps; people migrating from other assistants.. Work needed: Design chat-history import, parsers for each vendor file, quota and trust rules.
- Evidence: apps/web/app/api/memory/import/route.ts:13-34; no conversation import route under apps/web/app/api

## GAP-F090-06-02

**Message search is a live substring scan, not a stored text index; short queries scan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-06](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Detail: Affects: All users with large histories.. Work needed: Measure and consider full-text search.
- Evidence: apps/web/app/api/search/route.ts:369-380; 0101_sync_and_search_indexes.sql:76-81

## GAP-F090-06-03

**Export and chat search exist on web (and search on mobile); CLI, Chrome, VS Code not found.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-06](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Detail: Affects: CLI, Chrome, VS Code, mobile export.. Work needed: Confirm and decide scope.
- Evidence: no matching code in opened files

## GAP-F090-06-04

**Export of message body text does not strip expiring links.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-06](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Detail: Affects: People sharing exported files.. Work needed: Confirm with a test and strip if needed.
- Evidence: apps/web/features/chat/services/conversation-export.ts:98-116

## GAP-F090-07-01

**Tauri desktop share client omits conversation_id and the server requires it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-07](../../20-features/090-conversation-and-synchronization-components/F090-07-sharing-a-chat-by-link.md)
- Detail: Affects: Internal Tauri desktop shell users in Managed Cloud mode. Work needed: Pass the saved conversation id, or route the shell to the Web dialog; verify by running.
- Evidence: apps/desktop/src/services/desktopCloudShares.ts:14-19 vs apps/web/app/api/share/route.ts:574

## GAP-F090-07-02

**Mobile and Chrome cannot choose expiry or audience, cannot update a link**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-07](../../20-features/090-conversation-and-synchronization-components/F090-07-sharing-a-chat-by-link.md)
- Detail: Affects: Mobile and Chrome users. Work needed: Add controls that call the same contract fields.
- Evidence: apps/mobile/src/features/shared-links/service.ts:105-122; apps/extension/src/features/cloud-bridge/shareClient.ts:70-84

## GAP-F090-07-03

**No purge of expired shared_sessions rows found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-07](../../20-features/090-conversation-and-synchronization-components/F090-07-sharing-a-chat-by-link.md)
- Detail: Affects: Data retention. Work needed: Confirm whether a cron job exists; if not, add one.
- Evidence: readers only hide expired rows (apps/web/app/share/[token]/page.tsx:78-80)

## GAP-F090-07-04

**Brief says 'expiry is set in days'; code limits the choice to 1/7/30**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-07](../../20-features/090-conversation-and-synchronization-components/F090-07-sharing-a-chat-by-link.md)
- Detail: Affects: Anyone wanting a custom expiry. Work needed: Decide if fixed options are the requirement; update the brief if so.
- Evidence: apps/web/app/api/share/route.ts:77-83

## GAP-F090-07-05

**CLI and VS Code have no create or visibility control**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-07](../../20-features/090-conversation-and-synchronization-components/F090-07-sharing-a-chat-by-link.md)
- Detail: Affects: CLI and VS Code users. Work needed: Parity decision per the product parity program.
- Evidence: apps/cli/src/cloud/shares.rs:31-46

## GAP-F090-08-01

**Cloud resume replay exists on Web, Desktop, Mobile and CLI only; VS Code and Chrome parse envelopes but no replay found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Detail: Affects: VS Code and Chrome users. Work needed: Confirm and add run-follow or accept a documented difference.
- Evidence: apps/extension-vscode/src/integrations/localRuntimeClient.ts:1308; apps/extension/src/features/computer-use/cloudAgentClient.ts:470

## GAP-F090-08-02

**Where the first-leg Web stream gets its StreamEnvelope stamp is not found; gap detection depends on it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Detail: Affects: Web plain chat reliability. Work needed: Trace the stamping path or add it to the main route.
- Evidence: withStreamEnvelope used only at runs/[runId]/resume/route.ts:402

## GAP-F090-08-03

**Web plain-chat resume is unavailable for temporary chats and continuations**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Detail: Affects: Web users in temporary chats. Work needed: Decide the product rule; temporary chats may be intentionally unsaved.
- Evidence: apps/web/lib/hooks/useChatStream.ts:3045

## GAP-F090-08-04

**Brief cites journal lines that moved (cloud-agent-run-service.ts:788/1112 now different)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-08](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief's code references.
- Evidence: apps/web/lib/services/cloud-agent-run-service.ts:841,1218

## GAP-F090-09-01

**Nothing reads the attempt record; people cannot see failed or cancelled tries**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-09](../../20-features/090-conversation-and-synchronization-components/F090-09-attempt-record-for-each-answer.md)
- Detail: Affects: All users and support on every app. Work needed: Add a read path (usage history or support view).
- Evidence: attempt_outcome appears only in managed-usage-request-service.ts and free-trial-service.ts under apps/web/lib and app

## GAP-F090-09-02

**No own id per attempt and no link between a retry and the first try**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-09](../../20-features/090-conversation-and-synchronization-components/F090-09-attempt-record-for-each-answer.md)
- Detail: Affects: Retry and regenerate analysis. Work needed: Establish whether idempotency key differs per retry; add an attempt number if required.
- Evidence: apps/web/lib/services/managed-usage-request-service.ts:1233-1236 says a regenerated turn hashes the same

## GAP-F090-09-03

**Own-key and Local attempts are not recorded**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-09](../../20-features/090-conversation-and-synchronization-components/F090-09-attempt-record-for-each-answer.md)
- Detail: Affects: BYOK and Local users. Work needed: Decide whether usage history should include them.
- Evidence: table is a managed usage ledger (0056)

## GAP-F090-09-04

**Brief says warning, code logs at error level**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-09](../../20-features/090-conversation-and-synchronization-components/F090-09-attempt-record-for-each-answer.md)
- Detail: Affects: Log filters only. Work needed: Align the brief or the level.
- Evidence: managed-usage-request-service.ts:685-695

## GAP-F090-10-01

**No chat sync engine found on Tauri desktop or Web for conversations; only artifacts on Web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Detail: Affects: Tauri desktop shell (internal) and any claim of a client engine on Web. Work needed: Confirm how the hosted app reads chats, and wire or remove the Tauri tables.
- Evidence: grep of apps/desktop and apps/web for api/chat/sync; apps/desktop/src-tauri/src/data/db/migrations.rs:192-194

## GAP-F090-10-02

**CLI conflicts need manual resolution**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Detail: Affects: CLI users. Work needed: A merge or rebase flow.
- Evidence: apps/cli/src/cloud/mod.rs:356-362

## GAP-F090-10-03

**Brief cites CLI chat.rs:348 for pull; this build's pull code is at chat.rs:1164-1201 and record logic at 343-364**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Detail: Affects: Documentation. Work needed: Refresh the brief.
- Evidence: apps/cli/src/cloud/chat.rs:1164

## GAP-F090-10-04

**Two version rules exist (sync protocol 2 and API contract date header); the 426 for contract is raised in api-gateway-policy, not in the sync route**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Detail: Affects: Engineers testing version refusals. Work needed: Document both in one place.
- Evidence: apps/web/lib/api-gateway-policy.ts:61-70; route.ts:940-947

## GAP-F090-10-05

**VS Code has no chat sync (by design per docs)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-10](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Detail: Affects: VS Code users. Work needed: None unless parity decision changes.
- Evidence: doc: docs/product/suite.md:75-79

## GAP-F090-11-01

**Quiet hours drop pushes rather than defer them**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: Affects: Phone and browser users with quiet hours. Work needed: Decide the product rule; defer if required.
- Evidence: apps/web/lib/services/push-notification-service.ts:289-295 versus the brief draft

## GAP-F090-11-02

**No push receiver for CLI, VS Code, Chrome, native Desktop**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: Affects: Those apps. Work needed: Parity decision.
- Evidence: no api/notifications use outside apps/web found

## GAP-F090-11-03

**Notifications are not plan gated and not subscription-linked**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: Affects: Subscription consistency. Work needed: Confirm that is intended.
- Evidence: no entitlement check in agent-notification-service.ts

## GAP-F090-11-04

**Brief item cites line ranges that moved**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-11](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Detail: Affects: Documentation. Work needed: Refresh references.
- Evidence: agent-notification-service.ts:146-180

## GAP-F090-12-01

**Resolver reads Personal scope only; workspace items may read as unauthorized**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-12](../../20-features/090-conversation-and-synchronization-components/F090-12-opening-a-link-to-a-chat-or-item.md)
- Detail: Affects: Workspace members on Web. Work needed: Resolve against the member's workspaces; test.
- Evidence: apps/web/app/open/[target]/[id]/page.tsx:38

## GAP-F090-12-02

**No handler in CLI or VS Code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-12](../../20-features/090-conversation-and-synchronization-components/F090-12-opening-a-link-to-a-chat-or-item.md)
- Detail: Affects: Those apps. Work needed: Open the web link.
- Evidence: no usage of parseProductLinkPath there

## GAP-F090-12-03

**Unauthorized vs not found leaks that an id exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F090-12](../../20-features/090-conversation-and-synchronization-components/F090-12-opening-a-link-to-a-chat-or-item.md)
- Detail: Affects: Privacy of ids. Work needed: Confirm that this is wanted.
- Evidence: product-link-resolver.ts:41-43 (accepted by the brief)
