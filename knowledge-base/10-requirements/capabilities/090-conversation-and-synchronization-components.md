---
id: "REQ-AREA-090"
type: "requirements"
title: "Requirement items: Conversation and synchronization components"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 90. Conversation and synchronization components

23 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S90.01

**Conversation store.** Conversations are durably stored per user and workspace, created, listed with keyset paging, read, updated and soft-deleted through a server API.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-01 Saved conversations and messages](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Competitor trace: CAP-synchronization-and-continuity-01

## S90.02

**Turn/message store.** Each turn (user/assistant message) is durably stored against its conversation with role, content, model, usage and metadata, and can be listed and appended.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-01 Saved conversations and messages](../../20-features/090-conversation-and-synchronization-components/F090-01-saved-conversations-and-messages.md)
- Competitor trace: CAP-synchronization-and-continuity-01

## S90.03

**Message-version store.** Regenerations and edits of a turn are kept as versions (siblings of one parent) and the visible version is recorded, so users can page between versions.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-02 Versions, branches and forks](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Competitor trace: CAP-editing-regeneration-and-branching-03, CAP-editing-regeneration-and-branching-04

## S90.04

**Branch graph.** Conversation lineage is stored as a graph: messages form a parent tree and forks create a new conversation linked to its source message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-02 Versions, branches and forks](../../20-features/090-conversation-and-synchronization-components/F090-02-versions-branches-and-forks.md)
- Competitor trace: CAP-editing-regeneration-and-branching-10

## S90.05

**Generation-attempt store.** Every generation attempt (first answer, retry, regenerate) is recorded with its own id, status, provider and model, including failed and cancelled attempts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-09 Attempt record for each answer](../../20-features/090-conversation-and-synchronization-components/F090-09-attempt-record-for-each-answer.md)

## S90.06

**Conversation-title generator.** A new conversation gets a short model-generated title after its first message, without overwriting a title the user set.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-04 Automatic chat titles](../../20-features/090-conversation-and-synchronization-components/F090-04-automatic-chat-titles.md)

## S90.07

**Draft store.** A half-written composer message is saved per conversation and restored, both locally and on the server so it follows the user across devices.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-05 Composer drafts](../../20-features/090-conversation-and-synchronization-components/F090-05-composer-drafts.md)
- Competitor trace: CAP-synchronization-and-continuity-06

## S90.08

**Pin/archive service.** Conversations can be pinned, starred and archived through the API, persisted, and reflected in list ordering and filters.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-03 Pin, star, archive and chat settings](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Competitor trace: CAP-synchronization-and-continuity-05

## S90.09

**Conversation search index.** Conversation titles and message text are indexed so the search API finds matches quickly across the user's history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-06 Search, export and import](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)

## S90.10

**Transcript export.** A conversation transcript can be exported to a file (Markdown, JSON, HTML, PDF, DOCX) from the conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-06 Search, export and import](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Competitor trace: CAP-synchronization-and-continuity-27

## S90.11

**Shared-conversation snapshot service.** Sharing freezes a sanitized snapshot of the conversation under a token that can be viewed publicly, listed, changed in visibility and revoked.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-07 Sharing a chat by link](../../20-features/090-conversation-and-synchronization-components/F090-07-sharing-a-chat-by-link.md)

## S90.12

**Conversation metadata service.** Conversation metadata (title, model, project, pin/star/archive, temporary, active branch) is read and updated through one versioned service.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-03 Pin, star, archive and chat settings](../../20-features/090-conversation-and-synchronization-components/F090-03-pin-star-archive-and-chat-settings.md)
- Competitor trace: CAP-synchronization-and-continuity-02, CAP-synchronization-and-continuity-05

## S90.13

**Event-stream gateway.** A gateway streams a turn's events to the client as server-sent events, with agent-run headers, heartbeats and a resume path.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-08 Live answer stream and resume](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Competitor trace: CAP-synchronization-and-continuity-22

## S90.14

**Streaming event codec.** Stream events use one versioned envelope schema that the server encodes and every client decodes and validates.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-08 Live answer stream and resume](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)

## S90.15

**Stream cursor/replay store.** Stream events are journalled with a sequence cursor so a client can re-read events after a cursor or resume a dropped stream without duplicates.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-08 Live answer stream and resume](../../20-features/090-conversation-and-synchronization-components/F090-08-live-answer-stream-and-resume.md)
- Competitor trace: CAP-synchronization-and-continuity-22

## S90.16

**Client-event reconciliation.** Client pushes carry a base version; the server applies, rejects as conflict, or treats as idempotent, and clients reconcile conflicts with the server copy.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-10 Sync between devices](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-07

## S90.17

**Cross-device synchronization.** Conversations, messages and artifacts changed on one device appear on the user's other devices through a cursor-based pull/push sync.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-10 Sync between devices](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-01, CAP-synchronization-and-continuity-04

## S90.18

**Notification fan-out.** One event is fanned out to the in-app notification feed and to every registered device transport (mobile push, web push).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-11 Notifications when a run finishes](../../20-features/090-conversation-and-synchronization-components/F090-11-notifications-when-a-run-finishes.md)
- Competitor trace: CAP-synchronization-and-continuity-21

## S90.19

**Offline-change reconciliation.** Changes made while offline are queued durably and reconciled against the server when connectivity returns.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-10 Sync between devices](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-07

## S90.20

**Conversation/resource deep-link resolver.** A stable link to a conversation or resource resolves to the right screen, with login redirect and not-found/deleted/unauthorized states.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-12 Opening a link to a chat or item](../../20-features/090-conversation-and-synchronization-components/F090-12-opening-a-link-to-a-chat-or-item.md)

## S90.21

**Deletion tombstone propagation.** Deletions become tombstones that advance the sync cursor, reach other devices on pull, and remove the item there without being re-created by a later push.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-10 Sync between devices](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-07

## S90.22

**Import and migration adapters.** Conversation history exported from another product (ChatGPT, Claude, Gemini) or an older local store can be imported as conversations.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-06 Search, export and import](../../20-features/090-conversation-and-synchronization-components/F090-06-search-export-and-import.md)
- Competitor trace: CAP-synchronization-and-continuity-27

## S90.23

**Client-version compatibility layer.** Clients declare a protocol/contract version and the server refuses too-old or too-new clients with an update-required answer instead of a parse failure.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates):
- Feature: [F090-10 Sync between devices](../../20-features/090-conversation-and-synchronization-components/F090-10-sync-between-devices.md)
- Competitor trace: CAP-synchronization-and-continuity-07
