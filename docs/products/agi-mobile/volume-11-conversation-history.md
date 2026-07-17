# AGI Mobile — Volume 11 — Conversation History

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-06-30

Authority: `AGENTS.md` (repo root); `apps/mobile/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in real repo paths: `apps/mobile/stores/chatStore.ts`, `apps/mobile/stores/chat/chatMessageStore.ts`, `apps/mobile/stores/chat/chatCloudMessageStore.ts`, `apps/mobile/stores/chat/chatViewStore.ts`, `apps/mobile/stores/chat/chatExecutionStore.ts`, `apps/mobile/storage/conversations.ts`, `apps/mobile/storage/migrations.ts`, `apps/mobile/services/cloudSyncEngine.ts`, `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/src/features/sidebar/components/ConversationItem.tsx`, `apps/mobile/app/_layout.tsx`, `apps/mobile/lib/v1FeatureFlags.ts`, `packages/contracts/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Mobile **lists, finds, organizes, and synchronizes past conversations** — the history surface, distinct from the per-conversation lifecycle in Volume 08. The governing constraint is Mobile's **two-trust-mode split**: history spans **Local** (small on-device LLM, free, private) and **Managed Cloud** only. **Mobile has no BYOK** — no provider-key affordance appears anywhere in history; "Provider Configuration" on mobile means on-device model management, never API keys.

The split is physical. Local conversations live in their own MMKV namespace plus on-device SQLCipher (`apps/mobile/storage/`); Cloud conversations live in a separate namespace (`chatCloudMessageStore.ts`) and are the only history eligible for Neon delta-sync (Web ↔ Mobile ↔ Desktop). The two lists are **merged for display only** (`stores/chatStore.ts`) and never written back into each other. Every history operation — recency, search, filter, pin, archive, sync — routes to the owning store. Cloud history fails closed: `services/remoteChatGate.ts` returns a disabled reason whenever `FEATURES.cloudChat` is off, and no Local conversation is promoted to cloud history without an explicit reviewed transfer.

## Recent Conversations

🟡 Partial — `apps/mobile/stores/chatStore.ts` builds the combined list via `mergedConversations = [...local, ...cloud]` (local first), and the SQLCipher source orders correctly: `listConversations` runs `ORDER BY pinned DESC, updated_at DESC` (`storage/conversations.ts`). Each namespace is therefore recency-correct on its own, but the live combined selector concatenates rather than re-sorting both namespaces into one recency stream. Requirement before ✅: a single merged ordering keyed on `pinned DESC, updatedAt DESC` across both namespaces, with a stable tiebreak on id, so a recently-touched Cloud chat is not buried under all Local chats. Each row must show its mode (Local vs Cloud) and last-activity time, never render an INR/price string, and reflect a rename or new turn without a full reload.

## Search

✅ Built — `apps/mobile/stores/chat/chatViewStore.ts` (`searchConversations` → `runSearch`, 300ms debounce). Search is **trust-scoped**: in **Local mode** it runs an in-memory scan over the on-device message store only — zero network, because Local chats never existed server-side; in **Cloud mode (signed in)** it calls server full-text search `GET /api/search?q=…&limit=50`, falling back to the local in-memory scan on any network/auth failure so search never dead-ends. Results carry conversation id, message id, snippet, and match offsets for highlighting. Requirements: an empty query clears results and cancels the pending debounce; Local search must not emit a network request under test; Cloud search must require a real Clerk session (no demo bypass).

## Filters — sorting + filtering

🟡 Partial — the storage layer supports the primitives: `listConversations({ archived })` filters archived vs active, and the `ORDER BY pinned DESC, updated_at DESC` clause encodes the default sort (`storage/conversations.ts`). What is **not** built is a user-facing filter/sort control surface — there are no mode chips (Local / Cloud), no "sort by created vs updated" toggle, and no project filter wired into the history list. Requirement before ✅: filter controls that (a) never blend namespaces — a "Cloud only" filter must read the cloud store, a "Local only" filter the local store; (b) default to `pinned DESC, updatedAt DESC`; (c) expose archived as an explicit filter state, not a hidden mode; (d) read `packages/contracts/types/src/models.json` for any model-based filter — never hardcode an id.

## Pinned Chats

✅ Built — `pinConversation` in `apps/mobile/stores/chat/chatMessageStore.ts` toggles `pinned` per namespace. A **Local** pin flips state on-device only. A **Cloud** pin optimistically patches the cloud store, then `PUT /api/chat/conversations/:id { pinned }`, and **rolls back** the optimistic flag if the request fails (no silent divergence). The SQLCipher `conversations` table carries a `pinned` column (`storage/conversations.ts`), and pin state is part of the cloud delta wire shape — `applyConversationDeltas` applies `pinned: d.pinned` (`services/cloudSyncEngine.ts`) — so a pin set on Web/Desktop arrives on Mobile. Requirement: pinned rows sort above unpinned; pinning a Cloud chat never mutates a same-titled Local chat; pin is reversible offline and reconciles on next sync.

## Archived Chats

🟡 Partial — the SQLCipher layer supports archive end-to-end: an `archived_at` column, `listConversations({ archived })`, and `updateConversation({ archived_at })` (`storage/conversations.ts`); `apps/mobile/src/features/sidebar/components/ConversationItem.tsx` exposes an `onArchive` handler and an "Archive" action. The gap is the live `chatMessageStore` list state does not yet expose an archive/unarchive action routed to both namespaces, so archive is not wired through the in-memory history list. Requirement before ✅: archive/unarchive actions in the store that (a) set/clear `archived_at` in the owning namespace; (b) remove archived rows from the default recent list and reveal them only under the archived filter; (c) for Cloud, sync the archived state via the delta queue; (d) never let archiving a Cloud chat hide a same-titled Local chat.

## Synchronization — cloud history sync (Managed-Cloud only)

✅ Built (Cloud only) — `apps/mobile/services/cloudSyncEngine.ts` delta-syncs the **cloud** chat store with `/api/chat/sync`: it pushes locally-changed rows, then pulls everything past the cursor (paged, up to 500 rows/page). The loop is started/stopped from `apps/mobile/app/_layout.tsx` (`startCloudSyncLoop`/`stopCloudSyncLoop`) while signed in, and `syncNow()` is invoked after sends (`stores/chat/chatExecutionStore.ts`). Gating is strict: `isManagedSyncEnabled()` returns true **only** when `FEATURES.cloudChat === true` **and** `appMode === 'cloud'` — Local conversations live in a separate store and are **never** pushed or pulled. The legacy `crossDeviceSync` flag stays `false` in `lib/v1FeatureFlags.ts`, **superseded** by `cloudChat` as the single governing flag (a HARD RULE comment forbids both being true at once). The engine also delta-syncs cloud memory, projects, and (last, allowlist-gated) settings on independent cursors. Requirements: push-then-pull with a monotonic `server_version` cursor compared as bigint (no float precision loss); a locally-dirty rename is preserved against a stale server snapshot until push lands (`applyConversationDeltas` data-loss guard); sync is a no-op in Local mode and when signed out. Local→Cloud history transfer is **not** part of this loop — it requires the explicit reviewed-transfer path, never an automatic upload.

## Repository map

- `apps/mobile/stores/chatStore.ts` — combined Local+Cloud selector (display-only merge).
- `apps/mobile/stores/chat/{chatMessageStore,chatCloudMessageStore,chatViewStore,chatExecutionStore}.ts` — list state, pin, search, send/sync triggers.
- `apps/mobile/storage/{conversations,messages,migrations,db}.ts` — on-device SQLCipher schema, sort/archive/pin CRUD.
- `apps/mobile/services/{cloudSyncEngine,remoteChatGate}.ts` — Managed-Cloud delta-sync; fail-closed cloud gate.
- `apps/mobile/src/features/sidebar/components/ConversationItem.tsx` — list-row actions (pin/archive/delete entry points).
- `apps/mobile/app/_layout.tsx` — sync loop lifecycle.
- `apps/mobile/lib/v1FeatureFlags.ts` — `cloudChat`, `crossDeviceSync:false`, `byokKeys:false`.
- Shared: `packages/contracts/types/src/models.json` (model ids), `apps/web/app/api/{chat/sync,search}` (cloud endpoints), Neon delta-sync.

## Competitor notes

ChatGPT and Claude mobile treat all history as cloud-only: every list, search, pin, and archive assumes a server account and one synced timeline, with no on-device-only thread and no per-surface trust boundary. AGI's divergence: a conversation can be **born, listed, searched, pinned, archived, and deleted entirely on-device** (Local mode — free, private, offline), or live in **Managed Cloud** and delta-sync across Web/Mobile/Desktop, and the user always sees which mode each row is. Multi-provider history is not tied to one vendor's account, and — unlike both competitors' key-entry flows elsewhere — Mobile **never** exposes BYOK and **never** blends Local history into a cloud timeline.

## Acceptance / Definition of Done

History is production-ready only when every operation routes to the owning namespace, respects the Local/Cloud boundary, degrades safely offline, and surfaces the per-row mode. No history operation may move Local data into the cloud without an explicit reviewed transfer.

- [ ] Build: recent list, search, pin, archive filter, and sync pass `pnpm --filter @agiworkforce/mobile typecheck` and `test`; the merged list survives cold start without duplicated or lost rows; pinned sort above unpinned.
- [ ] Trust: Local search/list make zero network calls; Cloud operations gate on `remoteChatGate` + a real Clerk session; sync is a no-op unless `cloudChat && appMode==='cloud'`; `byokKeys` stays false; no filter or sort blends namespaces.
- [ ] Security/privacy: cloud pin/archive reconcile via delta with rollback on failure; the cursor is bigint-safe; no model id, route, env var, or INR price is hardcoded.

## Anti-patterns

- Adding any BYOK / provider-key affordance to a history, filter, or search screen.
- Merging Local and Cloud rows into one namespace, or letting a filter/sort read across both stores.
- Auto-uploading Local history to Managed Cloud, or treating sync as a Local→Cloud transfer.
- Claiming unified recency, filter UI, or store-level archive as shipped — they are 🟡 until wired.
- Hardcoding or inventing a model id instead of reading `packages/contracts/types/src/models.json`.
- Setting both `cloudChat` and `crossDeviceSync` true, or reviving the dormant flag as a second gate.
- Referencing Supabase, or any removed tier (Plus / pro_plus / Hobby) in history copy.
