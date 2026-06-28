# Volume 09 — Conversation System

Status: Canonical (expands `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 9)
Authority: this manual, `docs/current/source-of-truth.md` (UX Lock, Trust Modes), `packages/types/src/suite-contracts.ts`, `docs/strategy/02-gap-analysis.md`.

## Philosophy & Cloud/Local stance

The conversation is the product's atom. Everything else — projects, artifacts, memory, tools — hangs off a thread. AGI's defining bet is the **one-chat rule**: a single chat surface accepts prompts, attached files, reference files, images, project context, tools, connectors, and artifacts. There is no second "file chat" or "code chat" the user must switch into. This is a source-of-truth Launch Lock, not a preference.

Cloud/Local changes _where a thread lives and whether it can sync_, never the thread model itself. A **Local** thread runs on-device and stays on-device forever; the original Local thread remains Local even after a user forks it to BYOK. A **BYOK** thread uses the user's key directly. A **Managed** thread uses AGI-managed compute (public alpha, open by default). Crossing from Local into BYOK or Managed is an explicit, reviewed fork — never a silent mode flip. Sync is scoped strictly to the app-chat boundary and gated by `assertSurfaceCanSyncChats`: Web/Desktop/Mobile sync app chats; CLI/VS Code/Chrome stay workspace/task-scoped.

## Binding rules

1. **One chat accepts everything.** Prompts + files + reference files + images + project context + tools + connectors + artifacts in a single thread. Never route a user into a separate experience to attach a file (source-of-truth P0 #3).
2. **Trust mode is a thread property, immutable in place.** A thread carries its `ChatExecutionMode` (`local_only` / `byok` / `cloud_managed`). Changing trust requires a fork, not an edit.
3. **The Local original is preserved on fork.** A Local→BYOK/Managed continuation is a new branch recording: source thread id, selected context, secret-scan result, payload preview hash, provider label, and explicit consent. The Local thread is never mutated or migrated.
4. **Every message carries provider + privacy labels.** Each assistant turn records the resolved provider, model id (from `packages/types/src/models.json`), and `PrivacyMode`. Labels render in the UI and are never hardcoded — pull display copy from `suite-contracts.ts`.
5. **Temporary chats never persist pre-send and never update memory.** A temporary thread holds no durable record before the first send and is excluded from memory generation, reference-chat search, and sync.
6. **Branch/fork records lineage.** Forks store parent id + branch point + the redaction hash when the fork crosses a trust boundary.
7. **Delete is recoverable, then irreversible.** Soft-delete (recoverable window) → hard-delete (purges rows + blobs + vector entries within the thread's storage scope). Hard-delete respects Managed retention/deletion policy (Vol 25/30).
8. **Search is trust-scoped.** Conversation search never returns Local-only content into a BYOK/Managed-scoped query, and respects reference-chat-search opt-in (Privacy settings).
9. **Export carries provenance.** Export includes per-message provider/model/privacy metadata and the thread's trust mode; import never silently upgrades a thread's trust boundary.
10. **Sharing is consented and labeled.** A shared/published thread shows its trust origin and strips secrets flagged by the scan; shared-chat controls live in Privacy settings.

## Repository map

- One-chat shell + queue + stores: `packages/unified-chat/src/` (`components/`, `hooks/`, `stores/`, `queue/`, `lib/`).
- Web conversation surface: `apps/web/features/chat/` (`components/`, `hooks/`, `stores/`, `services/`, `commands/`, `v3/`).
- Desktop conversation UI: `apps/desktop/src/features/chat/` — incl. `BranchNavigator.tsx`, `ChatStream.tsx`, `CheckpointManager.tsx`, `ChatMessageList.tsx`, `AttachmentPreview.tsx`.
- Trust labels + sync gate: `packages/types/src/suite-contracts.ts` (`PrivacyMode`, `ProviderMode`, `ChatExecutionMode`, `assertSurfaceCanSyncChats`, display-copy maps).
- Model ids/capabilities: `packages/types/src/models.json` (catalog only — never invent ids).
- Mobile remote-send gate (fail-closed): `apps/mobile/services/remoteChatGate.ts`, `apps/mobile/services/llmGate.ts`.
- Canonical persistence: `apps/web/db/neon` (conversation/message tables, RLS).
- Sync engine (mobile): `apps/mobile/services/cloudSyncEngine.ts`, `offlineQueue.ts`.

## Competitor notes

Per `docs/strategy/02-gap-analysis.md`: ChatGPT and Claude both ship mature conversation history, search, branching, and sharing — table-stakes AGI must match. AGI's deliberate divergence is the **one-chat rule** (incumbents keep most flows unified but AGI makes it a hard contract) and **per-message trust/provider labels** plus the **preserved-Local-original fork**, which incumbents structurally cannot offer because they have a single trust zone. Global conversation search is a "feels unfinished" gap the moment a user passes ~20 chats (gap analysis §3); it is cheap, high-visibility, and required for parity. Do not copy Claude/ChatGPT thread UI, naming, or assets — match the _capability_.

## Checklists

### Build — thread lifecycle

- [ ] Create thread defaults to the surface's allowed trust mode; never default a Web thread to BYOK.
- [ ] Persist `ChatExecutionMode`, owner/org/workspace scope, and created/updated timestamps on every thread.
- [ ] Store provider + model id + `PrivacyMode` on every assistant message.
- [ ] Implement soft-delete with a recovery window, then hard-delete that purges rows, blobs, and vector entries in scope.
- [ ] Implement archive (hidden from default list, retained, searchable if opted in) distinct from delete.
- [ ] Implement pin/favorite and recent-chats ordering surfaced in the sidebar (UX Lock).

### Build — branches, forks, temporary

- [ ] Branch a thread at any message; store parent id + branch point.
- [ ] Fork Local→BYOK/Managed runs the full gate: context selection → secret scan → payload preview → provider label → consent; record the redaction hash.
- [ ] Verify the Local original is unchanged after a fork (assert in a trust-boundary test).
- [ ] Temporary chat holds no durable pre-send record and is excluded from memory + sync + reference search.

### Build — search, export, sharing

- [ ] Global conversation search across title + body, trust-scoped and reference-search-opt-in aware.
- [ ] Export a thread (markdown/JSON) with per-message provenance + thread trust mode.
- [ ] Import a thread without changing its trust boundary; mark imported provenance.
- [ ] Share/publish with secret stripping, trust-origin label, and revoke control.
- [ ] Conversation templates create a new thread without leaking the template author's context.
- [ ] Auto-summary/title generation runs in the thread's own trust boundary and is labeled.

### Review & security

- [ ] No code path lets a thread change trust mode in place (grep for direct mutations of execution mode).
- [ ] Search/memory/sync queries are namespaced so Local content cannot surface cross-boundary.
- [ ] `assertSurfaceCanSyncChats` guards every sync entry point; CLI/VS Code/Chrome never auto-sync app chats.
- [ ] Hard-delete and Managed retention/deletion are wired and tested (Vol 25/30).
- [ ] Shared-thread payloads pass the secret scan before leaving the device/account.

## Definition of Done

One-chat accepts prompts + files + reference files + images + project context + tools + artifacts in a single thread on the active surface. Create/branch/fork/archive/delete/recover/pin/share/export/import all work end-to-end with per-message provider+privacy labels rendered from `suite-contracts.ts`. The Local→BYOK fork preserves the Local original and records lineage + redaction hash. Temporary chats never persist pre-send or touch memory. Global search is trust-scoped and respects reference-search opt-in. Trust-boundary contract tests pass; the surface check from `docs/agent-context/commands.json` passes; launch-critical flows have e2e/visual verification (not build-only).

## Anti-patterns

- A separate "file chat", "code chat", or "image chat" the user must switch into — violates the one-chat Launch Lock.
- Flipping a thread's trust mode in place instead of forking; migrating a Local thread into Managed.
- Hardcoding provider/trust labels instead of `suite-contracts.ts` display copy.
- Inventing or hardcoding model ids instead of reading `models.json`.
- Persisting temporary chats, or feeding them into memory/sync/search.
- Global search or summaries that surface Local-only content into a BYOK/Managed context.
- Marking conversation features "done" from a passing typecheck without e2e verification of the one-chat flow.
