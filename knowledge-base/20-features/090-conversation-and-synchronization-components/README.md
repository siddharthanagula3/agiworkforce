---
id: "AREA-090"
type: "area"
title: "Conversation and synchronization components"
features: ["F090-01", "F090-02", "F090-03", "F090-04", "F090-05", "F090-06", "F090-07", "F090-08", "F090-09", "F090-10", "F090-11", "F090-12"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 90. Conversation and synchronization components

This area keeps a person's chats safe and the same on every device. Conversations, messages, edits, forks, drafts and artifacts are saved on the server, and changes made on one device reach the others through a sync protocol. It also streams answers live, lets a dropped answer resume, shares a chat by link, searches and exports chats, and sends notifications when a run finishes. Without it, a chat would live in one browser or phone and disappear when that device is lost.

**Who uses it.** Every signed-in user of a surface that calls the managed (Cloud) chat API. The server code shows no plan gate on the sync routes themselves. Free users are limited by a daily allowance on new conversations and message writes (apps/web/app/api/chat/sync/route.ts:576; apps/web/lib/services/tier-unit-quota-service.ts:519). Workspace administrators can turn cloud sync off per surface (apps/web/lib/services/organization-policy-evaluator.ts:329-339). Anyone with a share link can read a shared chat without signing in (apps/web/app/share/[token]/page.tsx:72). Mobile syncs only in Cloud app mode (apps/mobile/services/cloudSyncEngine.ts:97-107). Developers reach the same routes through the API and the CLI.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F090-01](F090-01-saved-conversations-and-messages.md) | Saved conversations and messages | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-02](F090-02-versions-branches-and-forks.md) | Versions, branches and forks | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-03](F090-03-pin-star-archive-and-chat-settings.md) | Pin, star, archive and chat settings | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-04](F090-04-automatic-chat-titles.md) | Automatic chat titles | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-05](F090-05-composer-drafts.md) | Composer drafts | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-06](F090-06-search-export-and-import.md) | Search, export and import | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-07](F090-07-sharing-a-chat-by-link.md) | Sharing a chat by link | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-08](F090-08-live-answer-stream-and-resume.md) | Live answer stream and resume | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-09](F090-09-attempt-record-for-each-answer.md) | Attempt record for each answer | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-10](F090-10-sync-between-devices.md) | Sync between devices | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-11](F090-11-notifications-when-a-run-finishes.md) | Notifications when a run finishes | n/a | n/a | n/a | n/a | n/a | n/a |
| [F090-12](F090-12-opening-a-link-to-a-chat-or-item.md) | Opening a link to a chat or item | n/a | n/a | n/a | n/a | n/a | n/a |

Requirement items for this area: [10-requirements/capabilities/090-conversation-and-synchronization-components.md](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md).

## How this area works in the code

1. **Send a message and save it.** The person sends a message. The server saves the turn on the chat, links it to its parent message, and, for the first question, cuts a short title and schedules a model title in the background. (`apps/web/app/api/chat/conversations/[id]/messages/route.ts:99`, `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:169-200`, `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:368-377`)
2. **Stream the answer and journal it.** The model route streams the answer as server-sent events with keep-alive lines. Each event is an envelope with a sequence number. The events are saved to the run's journal in batches. (`apps/web/app/api/llm/v1/chat/completions/route.ts:783-787`, `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:29-40`, `apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts:120-140`, `apps/web/lib/services/cloud-agent-run-service.ts:841-845`)
3. **Read the stream on the client.** The web client decodes each event, checks its envelope, and shows it. A gap in sequence numbers pauses settlement until the missing events are replayed. (`packages/contracts/cloud-contracts/src/agent-events.ts:321-346`, `apps/web/lib/hooks/useChatStream.ts:2516`, `apps/web/lib/hooks/useChatStream.ts:3241-3285`)
4. **Resume a dropped answer.** If the connection drops, the client posts its cursor (sequence and character count). The server reads the saved answer, cuts off what the client has, and streams the rest. (`apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:44-94`, `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:8-13`)
5. **Check the sync gate and protocol version.** A sync push or pull first checks the workspace policy for cloud sync and, for a push, the protocol version. A too-old push gets 426; a too-new one gets a validation error. (`apps/web/lib/managed-compute-gate.ts:262-281`, `apps/web/lib/services/organization-policy-evaluator.ts:329-339`, `apps/web/app/api/chat/sync/route.ts:105-112`, `apps/web/app/api/chat/sync/route.ts:940-947`, `packages/contracts/cloud-contracts/src/sync.ts:33-43`)
6. **Apply pushed changes with a base version.** The push route checks the project belongs to the active workspace, checks the free allowance, then applies each conversation, message and artifact only where its base version matches. Other rows come back as conflicts with the server copy. (`apps/web/app/api/chat/sync/route.ts:542-600`, `apps/web/app/api/chat/sync/route.ts:235-259`, `apps/web/app/api/chat/sync/route.ts:585-589`, `apps/web/lib/services/tier-unit-quota-service.ts:519-539`)
7. **Pull changes to other devices.** A device asks for changes after its cursor. The server returns chats, messages and artifacts, deletions included as tombstones. The client applies them and keeps local edits that are still waiting to be sent. (`apps/web/app/api/chat/sync/route.ts:105-210`, `apps/web/app/api/chat/sync/route.ts:974-1000`, `packages/client/sync/src/conversations.ts:46-80`, `apps/mobile/services/cloudSyncEngine.ts:993-1003`)
8. **Store the row and its version.** The database gives every change a new version number from a sequence. Soft deletes set deleted_at and also get a version, so they reach other devices. (`apps/web/db/neon/0038_cloud_sync_versioning.sql:50-62`, `apps/web/app/api/chat/conversations/[id]/route.ts:516-530`, `apps/web/db/neon/0001_mvp_chat.sql:3-14`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/chat/sync/route.ts` | Server side of cross-device sync: pull by cursor, push with base versions, conflicts, sync gate and free allowance. |
| `packages/contracts/cloud-contracts/src/sync.ts` | Sync protocol version (2, minimum 2), the too-old and too-new rules, and the wire schemas for sync deltas. |
| `apps/web/app/api/chat/conversations/[id]/route.ts` | Read, update (pin, star, archive, title, model, project, active leaf, draft) and soft-delete one chat; version check and 409 conflict. |
| `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Saves a turn, sets the provisional title on the first question, and schedules the model title. |
| `apps/web/app/api/llm/v1/chat/completions/lib/agent-event-stream.ts` | Builds the envelope for each stream event with a sequence number and the event id. |
| `apps/web/lib/services/cloud-agent-run-service.ts` | Event journal for runs: appends envelopes in batches, reads state, archives and restores runs. |
| `apps/web/lib/hooks/useChatStream.ts` | Browser client that reads the stream, checks sequence gaps and calls resume. |
| `apps/web/features/chat/services/conversation-draft.ts` | Browser side of draft saves: per-chat queue, retries, revision check between devices. |
| `apps/mobile/services/cloudSyncEngine.ts` | Phone sync engine: push and pull loop, conflict handling, dirty queue, runs only in Cloud mode. |
| `packages/client/sync/src/conversations.ts` | Shared client code that applies conversation deltas and tombstones to a local store. |
| `apps/web/app/api/share/route.ts` | Creates, lists, refreshes and revokes shares; verifies the snapshot matches the stored chat. |
| `apps/web/lib/services/product-link-resolver.ts` | Turns a link (chat, run, research, schedule, file, artifact) into a ready address or a not-found, deleted, expired or unauthorized state. |

## What is stored

- Chats: title, model, project, pinned, starred, archived, temporary flag, active leaf message, draft, draft time, version, deleted time, instructions: Postgres table public.web_conversations (apps/web/db/neon/0001_mvp_chat.sql:3; 0059; 0078; 0038; 0219)
- Messages: role, content, model, provider, tokens, metadata, parent id, deleted time: Postgres table public.web_messages (apps/web/db/neon/0001_mvp_chat.sql:15; apps/web/db/neon/0156_message_thread_variants.sql:37)
- Artifact versions: Postgres table web_artifact_versions, written by the sync push (apps/web/app/api/chat/sync/route.ts:366-374)
- Branch links: forked chat and mapping of copied messages: Postgres tables conversation_branches and conversation_branch_messages (apps/web/db/neon/0078_conversation_branching_runtime.sql:20-30)
- Generation attempt record: conversation id, outcome, error class: Postgres table public.managed_usage_requests (apps/web/db/neon/0329_managed_usage_attempt_record.sql:24-33)
- Run event journal: envelopes for each run: Postgres tables cloud_agent_runs and cloud_agent_events (apps/web/lib/services/cloud-agent-run-service.ts:1118-1125)
- Shared chat snapshots, personal and workspace: Postgres tables shared_sessions and organization_shared_sessions (apps/web/db/neon/0051_shared_sessions.sql:1; apps/web/db/neon/0186_organization_shared_sessions.sql:86)
- Imported memory items (from the memory import route): Postgres table user_memories (apps/web/lib/memory/import-store.ts:63)
- Phone: sync cursor, last sync time, queue of changed chats and messages: Phone storage (MMKV) under the key cloud-sync-state (apps/mobile/stores/chat/cloudSyncStateStore.ts:88-96)
- Browser: unsent composer text on the unsaved surface, per the migration comment: Browser sessionStorage and a zustand map (apps/web/db/neon/0219_conversation_drafts.sql:5-8; the code path was not opened)
- Notification feed items and push device tokens: Recorded through recordNotification and read from the push token store (apps/web/lib/services/agent-notification-service.ts:153; apps/web/lib/services/push-notification-service.ts:113)

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Cloud chat feature flag (mobile)**: When false, the phone never runs the managed sync and hides cloud chat screens. (apps/mobile/lib/v1FeatureFlags.ts:4 (cloudChat: true); read in apps/mobile/services/cloudSyncEngine.ts:97-107 and apps/mobile/app/(app)/notifications/index.tsx:355)
- **App mode is Cloud**: Mobile sync runs only when the app is in Cloud mode and an account is signed in. (apps/mobile/services/cloudSyncEngine.ts:97-107 (useChatAppModeStore appMode 'cloud'))
- **Workspace policy for chat sync, per surface**: An administrator can turn cloud sync off for one surface; the server refuses sync with an organization policy error. (apps/web/lib/services/organization-policy-evaluator.ts:329-339; enforced in apps/web/lib/managed-compute-gate.ts:262-281)
- **Free daily allowance**: Free users are limited on new chats and message writes per day; a spent allowance refuses the write. (apps/web/lib/services/tier-unit-quota-service.ts:519-539; called from apps/web/app/api/chat/sync/route.ts:576, apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:82 and apps/web/lib/services/conversation-branch-service.ts:208)
- **Sync protocol version**: Sets the version this server speaks (2) and the oldest one it still accepts (2). Pushes from older clients get 426; newer ones get a validation error. (packages/contracts/cloud-contracts/src/sync.ts:33-34)
- **Pull page sizes**: Caps how many chats, messages and artifacts one pull returns. (apps/web/app/api/chat/sync/route.ts:54-56)
- **Mobile sync interval**: The phone syncs every 30 seconds while active, and on return to the foreground. (apps/mobile/services/cloudSyncEngine.ts:1068 (startCloudSyncLoop intervalMs default 30000))
- **Stream keep-alive interval**: How often a keep-alive line is sent on a quiet stream (2 seconds, checked at most every 5 seconds). (apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:6 and 37)
- **Share link lifetime**: Sets how many days a share link lasts. (apps/web/app/api/share/route.ts:80 (expires_in_days) and :56 (shareExpiresAt))
- **Notification preference for phone pushes**: The phone's own switch decides whether phone pushes are sent for run events. The browser has its own switch. (apps/web/lib/services/agent-notification-service.ts:146-149 and 163 (loadAgentPushPreference))
- **Push transports**: Chooses which push transports a message is sent through (phone, browser). Both are on by default. (apps/web/lib/services/push-notification-service.ts:286)
- **Temporary chat**: A temporary chat is not stored as a draft, is not synced on mobile, cannot be shared, and resolves to not found in links. (apps/web/app/api/chat/conversations/[id]/route.ts:223; apps/mobile/services/cloudSyncEngine.ts:1088-1094; apps/web/app/api/share/route.ts:176; apps/web/lib/services/product-link-resolver.ts:88)

## Shared between apps

Shared between apps: the sync wire schemas, protocol version and refusal messages (packages/contracts/cloud-contracts/src/sync.ts); the stream envelope schema and parser (packages/contracts/cloud-contracts/src/agent-events.ts, used by the web, desktop, VS Code and browser-extension clients); the conversation delta apply and tombstone code (packages/client/sync/src/conversations.ts); product link format and parser (packages/contracts/types/src/product-links.ts); memory import parser (packages/contracts/types/src/memory-import.ts). Separate per app: the phone sync engine and its storage (apps/mobile/services/cloudSyncEngine.ts, apps/mobile/stores/chat/cloudSyncStateStore.ts); the CLI sync state and handshake (apps/cli/src/cloud/chat.rs, apps/cli/src/cloud/handshake.rs); the browser composer draft and stream hook (apps/web/features/chat/services/conversation-draft.ts, apps/web/lib/hooks/useChatStream.ts); the browser-extension conversation sync (apps/extension/src/features/cloud-bridge/conversationSync.ts). All server routes live only in apps/web.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The draft migration header says it is NOT YET APPLIED and waits for approval. The brief and the audit register say it is applied. One of the two is stale; the header should be corrected once the state is confirmed. (apps/web/db/neon/0219_conversation_drafts.sql:3 (contrast audit/prior-audits/active-issues-register.md:1003))
- Brief item S90.22 says chat history from another product can be imported as conversations. The import route only parses text into memory items and writes them to user_memories. No code I opened creates a conversation. (apps/web/app/api/memory/import/route.ts:107-173; apps/web/lib/memory/import-store.ts:63; packages/contracts/types/src/memory-import.ts:82)
- Brief item S90.23 says the server refuses too-old or too-new clients. Only the push route checks the protocol version. The pull route does not call the check. (apps/web/app/api/chat/sync/route.ts:105-210 (no call to assertReadableSyncProtocol) versus apps/web/app/api/chat/sync/route.ts:568)
- The first page of the conversation list is read by offset, not by the keyset cursor. Only later pages use the keyset cursor. The brief says keyset paging. (apps/web/app/api/chat/conversations/route.ts:104-107 and 113-114)
- The unauthorized state of a deep link reveals whether an id exists for another account, because it checks the table without the owner's scope. (apps/web/lib/services/product-link-resolver.ts:41-43 (existsForAnotherAccount))
- Brief item S90.15 describes a sequence cursor over the event journal. The resume route reads the saved message text and cuts it by character count; it does not read the journal. (apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/stream/route.ts:66-83 versus apps/web/lib/services/cloud-agent-run-service.ts:841)

## Not established

- I did not run anything. This is a reading of the code only; no tests, builds or servers were run, and no localhost checks were done.
- Whether the web, desktop and CLI apps run the sync loop; I traced only the phone sync engine, the CLI pull and push functions, and the extension scope.
- Whether desktop Local and own-key chats are ever synced to the server. The sync code I read works only on saved chats, and I did not follow the desktop code to see which chats it saves.
- Whether the search, export, share, deep link and notification features appear in the mobile, desktop, CLI or extension apps.
- The exact screen text for empty, waiting and failure states. I did not open any screen component except where named above.
- Whether migration 0219 is applied on the production database. The file says it is not, the audit register says it is.
- How the sidebar sorts pinned chats within the same page, and how the keyset sort key is built (conversations/route.ts:124 uses a '1' or '0' prefix; I did not read the helper that builds the rest).
- Which generation attempt rows are written for each provider path. I confirmed the finalization calls but did not walk every caller of the reserve function.
- The brief's line numbers for some items (for example S90.03 at messages/route.ts:71) point to query code that is not the version store itself; I used the code I opened instead.
- Whether the web push transport delivers to every browser that registered. I saw the send path (push-notification-service.ts:362-369) but not the browser subscription code.
