# Area 90. Conversation and synchronization components

23 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S90.01 Conversation store.
- Should: Conversations are durably stored per user and workspace, created, listed with keyset paging, read, updated and soft-deleted through a server API.
- Status: platform done
- Code: apps/web/db/neon/0001_mvp_chat.sql:3; apps/web/app/api/chat/conversations/route.ts:238; apps/web/app/api/chat/conversations/route.ts:108

## S90.02 Turn/message store.
- Should: Each turn (user/assistant message) is durably stored against its conversation with role, content, model, usage and metadata, and can be listed and appended.
- Status: platform done
- Code: apps/web/db/neon/0001_mvp_chat.sql:15; apps/web/app/api/chat/conversations/[id]/messages/lib/message-thread.ts:29; apps/web/app/api/chat/conversations/[id]/messages/route.ts:141

## S90.03 Message-version store.
- Should: Regenerations and edits of a turn are kept as versions (siblings of one parent) and the visible version is recorded, so users can page between versions.
- Status: platform done
- Code: apps/web/db/neon/0156_message_thread_variants.sql:37; apps/web/app/api/chat/conversations/[id]/route.ts:407; apps/web/app/api/chat/conversations/[id]/messages/route.ts:71

## S90.04 Branch graph.
- Should: Conversation lineage is stored as a graph: messages form a parent tree and forks create a new conversation linked to its source message.
- Status: platform done
- Code: apps/web/lib/services/conversation-branch-service.ts:187; apps/web/lib/services/conversation-branch-service.ts:291; apps/web/app/api/chat/conversations/[id]/branches/route.ts:52; apps/web/db/neon/0078_conversation_branching_runtime.sql:25

## S90.05 Generation-attempt store.
- Should: Every generation attempt (first answer, retry, regenerate) is recorded with its own id, status, provider and model, including failed and cancelled attempts.
- Status: platform done
- Code: apps/web/db/neon/0329_managed_usage_attempt_record.sql:24; apps/web/lib/services/managed-usage-request-service.ts:579; apps/web/lib/services/managed-usage-request-service.ts:1011; apps/web/lib/services/free-trial-service.ts:506; apps/web/lib/services/free-trial-service.ts:599; apps/web/lib/services/free-trial-service.ts:647; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4948; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5328

## S90.06 Conversation-title generator.
- Should: A new conversation gets a short model-generated title after its first message, without overwriting a title the user set.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:168; apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:375; apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:345

## S90.07 Draft store.
- Should: A half-written composer message is saved per conversation and restored, both locally and on the server so it follows the user across devices.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:225; apps/web/features/chat/services/conversation-draft.ts:36; apps/web/features/chat/pages/WebChatPage.tsx:1495; apps/web/db/neon/0219_conversation_drafts.sql:29

## S90.08 Pin/archive service.
- Should: Conversations can be pinned, starred and archived through the API, persisted, and reflected in list ordering and filters.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:304; apps/web/app/api/chat/conversations/[id]/route.ts:377; apps/web/db/neon/0059_conversation_star_archive.sql:22

## S90.09 Conversation search index.
- Should: Conversation titles and message text are indexed so the search API finds matches quickly across the user's history.
- Status: platform done
- Code: apps/web/db/neon/0101_sync_and_search_indexes.sql:84; apps/web/app/api/search/route.ts:308; apps/web/app/api/search/route.ts:380

## S90.10 Transcript export.
- Should: A conversation transcript can be exported to a file (Markdown, JSON, HTML, PDF, DOCX) from the conversation.
- Status: platform done
- Code: apps/web/features/chat/services/conversation-export.ts:31; apps/web/features/chat/services/conversation-export.ts:68; apps/web/features/chat/pages/WebChatPage.tsx:5469; apps/web/features/chat/components/dialogs/EnhancedExportDialog.tsx:34

## S90.11 Shared-conversation snapshot service.
- Should: Sharing freezes a sanitized snapshot of the conversation under a token that can be viewed publicly, listed, changed in visibility and revoked.
- Status: platform done
- Code: apps/web/app/api/share/route.ts:217; apps/web/app/api/share/route.ts:200; apps/web/app/api/share/[token]/route.ts:134; apps/web/app/share/[token]/page.tsx:72

## S90.12 Conversation metadata service.
- Should: Conversation metadata (title, model, project, pin/star/archive, temporary, active branch) is read and updated through one versioned service.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:369; apps/web/app/api/chat/conversations/[id]/route.ts:385

## S90.13 Event-stream gateway.
- Should: A gateway streams a turn's events to the client as server-sent events, with agent-run headers, heartbeats and a resume path.
- Status: platform done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:8; apps/web/app/api/llm/v1/chat/completions/route.ts:783; apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts:129

## S90.14 Streaming event codec.
- Should: Stream events use one versioned envelope schema that the server encodes and every client decodes and validates.
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/agent-events.ts:301; apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts:128; apps/web/lib/hooks/useChatStream.ts:2516

## S90.15 Stream cursor/replay store.
- Should: Stream events are journalled with a sequence cursor so a client can re-read events after a cursor or resume a dropped stream without duplicates.
- Status: platform done
- Code: apps/web/lib/services/cloud-agent-run-service.ts:788; apps/web/lib/services/cloud-agent-run-service.ts:1112; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:74

## S90.16 Client-event reconciliation.
- Should: Client pushes carry a base version; the server applies, rejects as conflict, or treats as idempotent, and clients reconcile conflicts with the server copy.
- Status: platform done
- Code: apps/web/app/api/chat/sync/route.ts:197; apps/web/app/api/chat/sync/route.ts:585; apps/mobile/services/cloudSyncEngine.ts:485

## S90.17 Cross-device synchronization.
- Should: Conversations, messages and artifacts changed on one device appear on the user's other devices through a cursor-based pull/push sync.
- Status: platform done
- Code: apps/web/app/api/chat/sync/route.ts:92; apps/mobile/services/cloudSyncEngine.ts:405; apps/cli/src/cloud/chat.rs:348

## S90.18 Notification fan-out.
- Should: One event is fanned out to the in-app notification feed and to every registered device transport (mobile push, web push).
- Status: platform done
- Code: apps/web/lib/services/agent-notification-service.ts:146; apps/web/lib/services/agent-notification-service.ts:169; apps/web/lib/services/push-notification-service.ts:190

## S90.19 Offline-change reconciliation.
- Should: Changes made while offline are queued durably and reconciled against the server when connectivity returns.
- Status: platform done
- Code: apps/mobile/stores/chat/cloudSyncStateStore.ts:41; apps/mobile/stores/chat/cloudSyncStateStore.ts:73; apps/mobile/services/cloudSyncEngine.ts:875

## S90.20 Conversation/resource deep-link resolver.
- Should: A stable link to a conversation or resource resolves to the right screen, with login redirect and not-found/deleted/unauthorized states.
- Status: platform done
- Code: packages/contracts/types/src/product-links.ts:52; apps/web/app/open/[target]/[id]/page.tsx:38; apps/web/lib/services/product-link-resolver.ts:155

## S90.21 Deletion tombstone propagation.
- Should: Deletions become tombstones that advance the sync cursor, reach other devices on pull, and remove the item there without being re-created by a later push.
- Status: platform done
- Code: apps/web/app/api/chat/conversations/[id]/route.ts:45; apps/web/db/neon/0038_cloud_sync_versioning.sql:56; packages/client/sync/src/conversations.ts:49; packages/client/sync/src/__tests__/tombstone-coverage.test.ts:1

## S90.22 Import and migration adapters.
- Should: Conversation history exported from another product (ChatGPT, Claude, Gemini) or an older local store can be imported as conversations.
- Status: platform done
- Code: apps/web/app/api/memory/import/route.ts:13

## S90.23 Client-version compatibility layer.
- Should: Clients declare a protocol/contract version and the server refuses too-old or too-new clients with an update-required answer instead of a parse failure.
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/sync.ts:27; apps/web/app/api/chat/sync/route.ts:787; apps/cli/src/cloud/handshake.rs:35
