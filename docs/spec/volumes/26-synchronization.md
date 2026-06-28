# Volume 26 — Synchronization

Status: Canonical depth for Master Spec Vol 26
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 26, `docs/strategy/04-scaling-to-1M-architecture.md` (sync engine), `docs/current/source-of-truth.md` (Surface Roles), `packages/types/src/suite-contracts.ts` (`assertSurfaceCanSyncChats`).

## Philosophy & Cloud/Local stance

Sync is a fan-out and conflict-resolution problem scoped _strictly_ to the app-chat boundary. Get the data model right once: many features depend on it (`docs/strategy/04` §3). There is **one** conflict model — server-side last-writer-wins / version vectors, no CRDT (`04` §5, `10` §1) — and **one** authority on whether a surface may sync: `assertSurfaceCanSyncChats` in `suite-contracts.ts`. Clients never decide sync eligibility themselves.

The Cloud/Local stance is the hard line: sync moves _synced-account app-chat data_ across Web/Desktop/Mobile. It does **not** move Local-mode chats, BYOK sessions, or developer-surface work. Local and BYOK never sync into Managed — a Local chat that becomes a BYOK or Managed continuation is an explicit reviewed branch (Vol 3), not a background flip. CLI/VS Code/Chrome are workspace/task-scoped: their only path into app chat is an explicit, redacted handoff. Sync is for convenience across a user's own account; it is never a trust-boundary loophole.

## Binding rules

1. One conflict model: server-side LWW / version vectors, scoped to the app-chat boundary. No CRDT, no per-surface ad-hoc merge.
2. Sync eligibility is decided by `assertSurfaceCanSyncChats` (`packages/types/src/suite-contracts.ts`); a client must call it, not reimplement the rule.
3. Web/Desktop/Mobile sync app chats only. Local-mode chats, memory, projects, files, profile, and personalization stay local unless the user runs a reviewed transfer.
4. CLI/VS Code/Chrome stay local/workspace-scoped; handoff to app chat is explicit and redacted, never automatic.
5. Local and BYOK never sync into Managed; a boundary-crossing continuation is a new reviewed branch with provenance (source + selected context + redaction hash).
6. The offline queue persists pending mutations and replays them idempotently when connectivity returns; replay never duplicates or reorders destructively.
7. Sync runs in tiers — background (idle), live (active session), and delta (changed records only) — never a full re-download of history per change.
8. Every synced record carries privacy mode + provider label so a sync can be rejected if it would cross a boundary.

## Repository map

- **Sync transport:** `services/signaling-server/src/` — `index.ts`, `connection-manager.ts`, `db.ts`, `metrics.ts`, `middleware/` (fan-out + presence).
- **Sync authority:** `packages/types/src/suite-contracts.ts` (`assertSurfaceCanSyncChats`, `PrivacyMode`, synced/developer surface separation, generated-file trust-boundary validation) + `__tests__/suite-contracts.test.ts`.
- **Persistence (canonical):** `apps/web/db/neon` (conversation/message tables that sync); gateway writes via `services/api-gateway`.
- **Per-surface gates:** Web `apps/web` (sync allowed), Desktop `apps/desktop` (app chats sync; local files stay local), Mobile `apps/mobile/services/remoteChatGate.ts` (cloud sync only when entitled, fail-closed), CLI `apps/cli/src/agent/mod.rs` (no auto app-chat sync), Chrome `apps/extension` (sync-boundary comments + tests), VS Code `apps/extension-vscode` (explicit redacted handoff).
- **Local state:** `apps/mobile/lib/mmkv.ts`, desktop SQLite (`src-tauri`), `packages/stores`/`packages/data-layer`.

## Competitor notes

Both incumbents run unified account + conversation-history sync over one shared backend (`docs/strategy/01` §4). The P2 sync engine is the gating dependency for several AGI features, so the data model must be right once (`04` §3). AGI's deliberate divergence is the **boundary-scoped sync**: incumbents sync everything to one cloud because that _is_ their data flywheel; AGI deliberately refuses to sync Local/BYOK/developer-surface data, which is the privacy wedge (`01` §5). The engineering reference is PowerSync (mutable) + Electric Shapes (read-only) with server-side LWW, enforcing the trust matrix (CLI/VS Code local, BYOK local-only) — `10` §1.

## Checklists

### Conflict & data model

- [ ] One server-side LWW / version-vector resolver; no CRDT, no per-surface merge logic.
- [ ] Conflict resolution is deterministic and testable; last-writer-wins ties broken by a stable rule.
- [ ] Synced records carry version + privacy mode + provider label.
- [ ] The sync data model is documented once and shared across Web/Desktop/Mobile.

### Boundary enforcement

- [ ] Every sync path calls `assertSurfaceCanSyncChats`; no client reimplements eligibility.
- [ ] Web/Desktop/Mobile sync app chats only; Local-mode data excluded by construction.
- [ ] CLI/VS Code/Chrome never auto-sync into app chat (boundary tests assert this).
- [ ] Local→BYOK/Managed continuation creates a reviewed branch with provenance, not a silent sync.
- [ ] Mobile cloud sync is gated to signed-in entitled Cloud chats; `remoteChatGate.ts` fails closed.

### Offline & tiers

- [ ] Offline queue persists pending mutations across app restarts.
- [ ] Replay on reconnect is idempotent; no duplicate messages or destructive reorder.
- [ ] Delta sync transfers only changed records; no full-history re-download per change.
- [ ] Live sync updates the active session promptly; background sync runs on idle without jank.
- [ ] Fan-out scales (presence + per-connection routing) without head-of-line blocking (`signaling-server/connection-manager.ts`).

### Scope coverage

- [ ] Conversations, projects, files, artifacts, memories, and settings sync only within the allowed boundary.
- [ ] Files: app-chat-scoped files sync per policy; local files stay local unless explicitly transferred.
- [ ] Memories: synced only within the synced-account boundary; Local memory never syncs.
- [ ] Settings sync respects per-surface differences (a Web setting doesn't override a Local-only Desktop control).

## Definition of Done

Synchronization is production-ready when: one server-side LWW/version-vector model resolves conflicts deterministically across Web/Desktop/Mobile; `assertSurfaceCanSyncChats` is the single gate every client calls; Local-mode, BYOK, and developer-surface (CLI/VS Code/Chrome) data provably never sync into Managed (boundary contract tests green); the offline queue replays idempotently; delta/live/background tiers work without full re-downloads; and the sync data model is shared, documented, and load-tested for fan-out at scale (`04` §5).

## Anti-patterns

- Inventing a second conflict model or per-surface merge logic instead of the one server-side resolver.
- A client deciding for itself whether it may sync, bypassing `assertSurfaceCanSyncChats`.
- Auto-syncing CLI/VS Code/Chrome work, or Local/BYOK chats, into the app-chat store.
- Treating a boundary-crossing continuation as a sync instead of a reviewed branch with provenance.
- Re-downloading full history on every change instead of delta sync.
- An offline replay that duplicates messages or reorders them destructively.
- Syncing without carrying the privacy mode, so a boundary violation can't be detected and rejected.
