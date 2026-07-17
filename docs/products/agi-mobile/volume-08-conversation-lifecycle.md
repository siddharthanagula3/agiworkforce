# AGI Mobile — Volume 08 — Conversation Lifecycle

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root); `apps/mobile/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo paths: `apps/mobile/stores/chat/chatMessageStore.ts`, `apps/mobile/stores/chat/chatViewStore.ts`, `apps/mobile/stores/chat/chatCloudMessageStore.ts`, `apps/mobile/stores/chatStore.ts`, `apps/mobile/storage/conversations.ts`, `apps/mobile/storage/migrations.ts`, `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/services/dsarExport.ts`, `apps/mobile/services/fileCreation.ts`, `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx`, `apps/mobile/src/features/sidebar/components/ConversationItem.tsx`, `apps/mobile/lib/v1FeatureFlags.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies the full lifecycle of a conversation on AGI Mobile: creation, restoration on relaunch, metadata, branching, search, archive, delete, and export. The defining constraint is the **two-trust-mode split**: Mobile exposes **Local** (small on-device LLM, free) and **Managed Cloud** only — **there is no BYOK on mobile**, and no provider-key affordance may be added here.

The split is physical, not cosmetic. Local conversations live in their own MMKV namespace (`chat-message-store-local`) and on-device SQLCipher (`apps/mobile/storage/`); Cloud conversations live in a separate namespace (`chat-message-store-cloud`, in `chatCloudMessageStore.ts`) and are the only data eligible for Neon delta-sync (Web ↔ Mobile ↔ Desktop). The two stores are merged for display only (`stores/chatStore.ts`) and are never written back into each other. Every lifecycle verb below must route to the owning store and respect that boundary. Cloud access fails closed: `services/remoteChatGate.ts` returns a disabled reason whenever `FEATURES.cloudChat` is off, and Local chats never auto-route to the cloud.

## Conversation Creation

✅ Built — `apps/mobile/stores/chat/chatMessageStore.ts` (`createConversation` → `createConversationForMode`). Mode is read from `useChatAppModeStore`. A **Local** chat is created fully on-device with a `conv_*` id (`createStoredConversation`) — no network. A **Cloud** chat mints a client-side UUIDv7 (offline-first stable id) and `POST /api/chat/conversations`, then is added to the cloud store and queued for sync (`markConversationForSync`). Requirements: title defaults to `New Chat`; the new-chat home stays simple (no suggestion/starter cards); model defaults to the picked model only when its execution mode matches the requested mode, else `undefined` (resolved at send). Cloud creation throws if `isCloudChatEnabled()` is false — never a silent Local fallback.

## Session Restoration

✅ Built — Zustand `persist` over MMKV with `skipHydration` + `rehydrateWhenMmkvReady` (`chatMessageStore.ts`, `chatViewStore.ts`) closes the MMKV-race. `partialize` caps persistence at 200 conversations and 100 non-streaming messages each, and persists **only Local** conversations in the local store. Cloud conversations rehydrate from their own namespace and lazy-load message bodies via `GET /api/chat/conversations/:id` in `loadMessages` (skipped offline; existing content retained). SQLCipher schema + forward migrations live in `apps/mobile/storage/migrations.ts` / `conversations.ts`. Requirement: `currentConversationId` restores; in-flight streaming placeholders are dropped on restore, never persisted as completed turns.

## Conversation Metadata — titles + timestamps

✅ Built (rename + timestamps) / 🔭 Planned (auto-title). `renameConversation`, `createdAt`/`updatedAt`, and the SQLCipher `conversations` table (`created_at`, `updated_at`, `archived_at`, `pinned`) exist in `chatMessageStore.ts` and `storage/conversations.ts`. Cloud renames patch the cloud store, `markConversationForSync`, and `PUT /api/chat/conversations/:id`; a failed PUT keeps the optimistic title and relies on the dirty-queue retry (no silent revert). `pinConversation` toggles pin with cloud rollback on failure. **Auto-generated titles** (summarizing first turn) are not yet implemented — title stays `New Chat` until renamed; mark 🔭 with a tracked gap. INR/price strings never appear in metadata.

## Branch Conversations

🟡 Partial — `forkConversation` in `chatMessageStore.ts` exists and is trust-correct: a fork **stays in the source mode** (Local→Local, Cloud→Cloud), carries the project id within the same namespace (cloud re-validated against a live, non-tombstoned project), copies messages with new ids, and strips streaming/queued flags. Gap: no fork/branch entry point is wired in the chat UI (`src/features/chat/components/` has no fork control). So the capability is store-complete but user-unreachable. Requirement before ✅: a visible "Branch from here" affordance that never crosses the Local/Cloud boundary and labels the resulting mode.

## Conversation Search

✅ Built — `apps/mobile/stores/chat/chatViewStore.ts` (`searchConversations` → `runSearch`, 300ms debounce). Trust-scoped: **Local mode** searches the on-device message store in memory only (no network — Local chats never existed server-side); **Cloud mode (signed in)** calls `GET /api/search` server full-text search, with fallback to local in-memory search on any failure. Results carry conversation id, message id, snippet, and match offsets for highlighting.

## Archive

🟡 Partial — the SQLCipher layer supports archive end-to-end: `archived_at` column, `listConversations({ archived })`, and `updateConversation({ archived_at })` in `storage/conversations.ts`; `ConversationItem.tsx` exposes an `onArchive` handler and an "Archive" action. Gap: the live `chatMessageStore` (`ConversationSummary`) state does not yet expose an archive action, so archive is not wired through the list store to both namespaces. Requirement before ✅: archive/unarchive actions in the store that route per-namespace and (for Cloud) sync the archived state.

## Delete

✅ Built — `deleteConversation` in `chatMessageStore.ts`. **Local** delete removes the conversation and its messages from the store. **Cloud** delete is privacy-safe: it confirms the server delete (`deleteCloudConversationWithRetry`, 404 treated as idempotent success, transient 5xx retried) **before** hiding locally; a hard failure surfaces an alert and keeps the conversation visible so the user is never told sensitive content is gone while it persists in the cloud. SQLCipher `deleteConversation` runs in a transaction that nulls `memory_facts.source_conversation_id` and cascades messages.

## Export

✅ Built — two layers, both on-device. `ConversationExportSheet.tsx` offers PDF / Text / Markdown / Copy-All via `services/fileCreation.ts` and the native share sheet. `services/dsarExport.ts` produces a structured DSAR JSON (conversations, messages, memory facts, custom instructions, settings, installed-model metadata, compliance ledger) with no network calls; provider keys and model weights are excluded. Requirement: PDF export must stay light (system print/share), not pull a heavy local document engine — Mobile is not the first heavy local PDF/DOCX surface; large generation delegates to Desktop/Cloud.

## Repository map

- `apps/mobile/stores/chatStore.ts` — combined selector merging Local + Cloud for display only.
- `apps/mobile/stores/chat/{chatMessageStore,chatCloudMessageStore,chatViewStore,chatExecutionStore}.ts` — create/fork/delete/rename/pin/search/send.
- `apps/mobile/storage/{conversations,messages,migrations,db}.ts` — on-device SQLCipher schema + CRUD.
- `apps/mobile/services/{remoteChatGate,cloudSyncEngine,dsarExport,fileCreation}.ts` — cloud gate, delta-sync, exports.
- `apps/mobile/src/features/chat/components/ConversationExportSheet.tsx`, `apps/mobile/src/features/sidebar/components/ConversationItem.tsx` — export + list-item actions.
- `apps/mobile/lib/v1FeatureFlags.ts` — `cloudChat`, `crossDeviceSync`, `byokKeys:false`.
- Shared: `packages/contracts/types/src/models.json` (model ids), `apps/web/app/api/{chat,search}` (cloud endpoints), Neon delta-sync.

## Competitor notes

ChatGPT and Claude mobile treat every conversation as cloud-only: creation, history, search, archive, and delete all assume a server account, with no on-device-only thread and no local trust boundary. AGI's deliberate divergence: a conversation can be **born and die entirely on the device** (Local mode, free, private, offline-capable), or live in **Managed Cloud** and delta-sync across Web/Mobile/Desktop — the user sees which. Neither competitor offers per-surface trust isolation or a no-key on-device path; AGI does. AGI also refuses the one place competitors converge that conflicts with our model: it never adds BYOK on mobile and never blends Local data into a cloud history.

## Acceptance / Definition of Done

A lifecycle verb is production-ready only when it routes to the owning namespace, respects the Local/Cloud boundary, and degrades safely offline. No verb may move Local data into the cloud without an explicit reviewed transfer.

- [ ] Build: create/restore/rename/search/delete/export pass `pnpm --filter @agiworkforce/mobile typecheck` and `test`; restoration survives cold start without duplicated or lost threads.
- [ ] Trust: Local verbs make zero network calls; Cloud verbs gate on `remoteChatGate` + a real Clerk session; fork and archive never cross namespaces; `byokKeys` stays false.
- [ ] Security/privacy: Cloud delete confirms server-side before hiding; DSAR export excludes keys and weights; no model id, route, env var, or INR price is hardcoded.

## Anti-patterns

- Adding any BYOK / provider-key entry to a mobile lifecycle screen.
- Auto-routing or auto-sending a Local conversation to Managed Cloud, or merging Local and Cloud threads into one namespace.
- Optimistically hiding a Cloud conversation before the server confirms the delete.
- Claiming auto-title, branch UI, or store-level archive as shipped — they are 🔭/🟡 until wired.
- Hardcoding or inventing a model id instead of reading `packages/contracts/types/src/models.json`.
- Referencing Supabase, or any removed tier (Plus / pro_plus / Hobby) in lifecycle copy.
- Making Mobile the first heavy local PDF/DOCX export engine instead of delegating large jobs.
