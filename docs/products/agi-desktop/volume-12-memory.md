# AGI Desktop — Volume 12 — Memory

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/desktop/AGENTS.md`; grounded in real repo paths `apps/desktop/src/stores/memoryStore.ts`, `apps/desktop/src/api/memory.ts`, `apps/desktop/src-tauri/src/sys/commands/memory.rs`, `apps/desktop/src/features/memory/`, `apps/desktop/src/features/settings/tabs/Memory.tsx`, `apps/desktop/src/features/settings/tabs/Privacy/index.tsx`, and `apps/web/app/api/memory/sync/route.ts`.

## Overview & stance

Memory lets AGI Desktop carry preferences, facts, decisions, and context across conversations instead of starting cold each session. Desktop is the full-trust surface (Local + BYOK + Managed Cloud), and memory obeys the same trust boundaries as chat: **memory captured in a Local or BYOK session is on-device SQLite and never leaves the machine unless the user explicitly forks or syncs it.** The Desktop memory tab today runs a **v1 local-only posture** — facts persist via the shared `MemoryEditor`/`memoryStore` on this device, and cloud sync of memory is not yet wired into the Desktop client (`apps/desktop/src/features/settings/tabs/Memory.tsx`). Cloud memory, when a signed-in Managed-Cloud user enables it, rides the same Neon delta-sync fabric as chat (`apps/web/app/api/memory/sync/route.ts` ✅), scoped by Clerk identity and Postgres RLS. Recalled memory is treated as untrusted data, not instructions, and is fenced before entering a prompt.

## Automatic Memory

The agent can capture memory without an explicit user click. Desktop keeps a **daily-log** stream (`logContext`, `getDailyLogs`) and a **compaction** pass that reads old logs and extracts durable `fact`, `decision`, and `preference` memories, then promotes them into long-term storage (`compactOldLogs`, `promoteExtracted`, `getExtractionPrompt` in `apps/desktop/src/stores/memoryStore.ts`, backed by `apps/desktop/src-tauri/src/sys/commands/memory.rs`). An **importance-decay** engine ages unused memories and boosts recalled ones (`runDecay`, `boostOnAccess`, `getDecayConfig`/`setDecayConfig`). On send, `buildMemoryContext` selects high-importance memories (importance ≥ 5), fits them to a token budget, and injects them into the system prompt wrapped by `fenceUntrustedContent` so recalled text is handled as data. 🟡 Partial — extraction, decay, and injection primitives exist in `memoryStore.ts`, but automatic capture is not turned on as a default background policy across chat; verify wiring before claiming always-on. Requirement: automatic capture MUST respect the active trust mode — Local/BYOK logs and extracted memories stay local and are never queued for cloud push.

## Manual Memory

Users can save memory explicitly. `SaveToMemoryButton` captures a chat message (default `context` category, topic derived from the first sentence) via the Tauri backend with a localStorage fallback (`apps/desktop/src/features/memory/SaveToMemoryButton.tsx`) ✅. `CreateMemoryDialog` and `MemoryManager` let users author a memory with category, topic, content, and importance; `MemorySearch` and `MemoryBrowserModal` retrieve them (`apps/desktop/src/features/memory/`) ✅. Inline recall surfaces in chat via `InlineMemoryCard` (`apps/desktop/src/features/chat/InlineToolResults/InlineMemoryCard.tsx`) ✅. Requirement: manual saves MUST show the trust mode and destination (this device vs. cloud) before persisting, and MUST never silently upgrade a Local memory to a cloud row.

## Categories

Memory is typed into four canonical categories — `preference`, `fact`, `decision`, `context` — defined once in `apps/desktop/src/stores/memoryStore.ts` (`MemoryCategory`) and mirrored in `apps/desktop/src/api/memory.ts` and the Rust structs (`apps/desktop/src-tauri/src/sys/commands/memory.rs`) ✅. Each entry carries `importance` (1–10), optional `source`, and timestamps. Selectors filter by category for browsing ✅. A separate **project memory** store keys memories to a project folder with tech-stack/conventions metadata (`apps/desktop/src/stores/projectMemoryStore.ts`, `apps/desktop/src-tauri/src/core/agi/project_memory.rs`) ✅. Requirement: the category enum is the single source of truth; UI labels must not introduce categories the store does not define.

## Edit

Users can revise a memory's content, category, and importance. Editing flows through `MemoryManager`/`CreateMemoryDialog` and the store's `storeMemory` (upsert) and `remember` actions, with `boostOnAccess`/`decaySingle` adjusting importance over time (`apps/desktop/src/stores/memoryStore.ts`) 🟡 — write and re-store paths exist, but a dedicated inline "edit existing entry" affordance in the viewer should be verified against `MemoryViewer.tsx`/`MemoryCard.tsx` before claiming full parity. Requirement: an edit MUST update `updated_at` (so last-writer-wins stays correct if the memory later syncs) and MUST NOT change the row's trust mode.

## Delete

Deletes are first-class. The store exposes `deleteMemory(id)`, `forgetById(id)`, `forget(category, topic)`, plus `cleanupLogs` for daily logs, surfaced through `MemoryManager`/`MemoryCard` with Sonner confirmations (`apps/desktop/src/stores/memoryStore.ts`, `apps/desktop/src/features/memory/`) ✅. Requirement: a local delete MUST remove the on-device SQLite row. For a synced cloud memory, delete MUST propagate as a **tombstone** (`is_deleted = true`) through delta-sync so the deletion reaches other devices — `apps/web/app/api/memory/sync/route.ts` carries tombstones on pull and accepts `is_deleted` on push ✅; the Desktop client wiring to emit/consume them is the gap (🟡, see Cloud Synchronization). Deleting a memory MUST NOT delete the underlying chat, and vice versa.

## Privacy

Local memory is private by default and stays on the device: the on-device SQLite store plus a bounded Zustand-persist cache (capped at 100 entries / 1 MB, oldest-pruned) in `apps/desktop/src/stores/memoryStore.ts` ✅. The Privacy tab enforces the locked "local default with explicit cloud sync gating" rule — Desktop must not silently sync local data to cloud (`apps/desktop/src/features/settings/tabs/Privacy/index.tsx`, `apps/desktop/AGENTS.md`) ✅. Recalled memory is fenced as untrusted content before prompt injection (`buildMemoryContext` → `fenceUntrustedContent`) ✅, mitigating memory-poisoning/prompt-injection. Requirement: Local→BYOK reuse follows the standard fork gate — context selection, secret scan, payload preview, visible provider label, consent; API keys stay in the OS keychain and are never written into memory content. Export produces JSON/Markdown to a user-chosen path (`exportJson`, `exportMarkdown`, `importJson`) ✅ so users can inspect, back up, or delete their full memory corpus.

## Cloud Synchronization

Cloud memory sync is a **Managed-Cloud-only** capability. The server endpoint is built: `apps/web/app/api/memory/sync/route.ts` implements delta sync mirroring chat — `GET ?since=<cursor>` returns `user_memories` rows (including tombstones) newer than the cursor with `hasMore`; `POST { memories: [...] }` does an idempotent upsert keyed by id with server-side `user_id` (from the verified Clerk session, never the body), RLS `WITH CHECK` as backstop, and last-writer-wins by `updated_at` ✅. It runs Web ↔ Mobile ↔ Desktop and **only for Managed-Cloud memories**; Local/BYOK rows have no `cloud_id` and are never pushed or pulled. On Desktop the client is **not yet wired** to this endpoint — the Memory tab documents cloud sync as "coming soon" for Desktop while it is public alpha on Web and Mobile (`apps/desktop/src/features/settings/tabs/Memory.tsx`) 🟡. Requirement (target): when enabled, Desktop cloud memory sync MUST be opt-in per the Privacy gate, MUST push/pull only rows the user marked cloud, MUST carry tombstones for deletes, and MUST show a clear cloud vs. local badge on every synced entry. Settings sync is allowlist-gated and lands last. 🔭 Planned: Desktop delta-sync client integration.

## Repository map

- `apps/desktop/src/stores/memoryStore.ts` — memory + daily-log + decay + compaction store, `buildMemoryContext`.
- `apps/desktop/src/stores/projectMemoryStore.ts` — project-scoped memory store.
- `apps/desktop/src/api/memory.ts`, `apps/desktop/src/api/projectMemory.ts` — Tauri command wrappers.
- `apps/desktop/src-tauri/src/sys/commands/memory.rs`, `.../commands/project_memory.rs`, `.../core/agi/project_memory.rs`, `.../data/db/migrations.rs` — Rust storage + SQLite schema/migrations.
- `apps/desktop/src/features/memory/` — `MemoryManager`, `MemoryViewer`, `MemoryCard`, `MemoryBrowserModal`, `CreateMemoryDialog`, `MemorySearch`, `SaveToMemoryButton`, `MemoryImport`, `MemoryBadge`, `MemoryImportanceIndicator`.
- `apps/desktop/src/features/chat/InlineToolResults/InlineMemoryCard.tsx` — inline recall in chat.
- `apps/desktop/src/features/settings/tabs/Memory.tsx` (shared `MemoryEditor`), `apps/desktop/src/features/settings/tabs/Privacy/index.tsx` — settings.
- `apps/web/app/api/memory/sync/route.ts` — Neon delta-sync endpoint (cursor + tombstones + idempotent upsert, RLS-scoped).

## Competitor notes

Claude, ChatGPT, and Codex persist memory to the vendor cloud by default, single-provider. AGI's divergence: memory is **local-first and trust-scoped** — Local/BYOK memory lives in on-device SQLite and never syncs; only explicitly-cloud memory rides Neon delta-sync, and only Web↔Mobile↔Desktop. Memory is multi-provider (prompt-injected context, not a provider feature), portable via JSON/Markdown export, and per-surface: CLI/VS Code/Chrome stay workspace/task-scoped and never auto-feed app-chat memory. Recalled memory is fenced as untrusted data.

## Acceptance / Definition of Done

Memory is production-ready on Desktop when every capability above carries a correct trust label in the UI, Local memory provably never leaves the device, and cloud memory (once wired) syncs and tombstones correctly across devices with RLS isolation.

- [ ] Build: create/edit/delete/search across all four categories works against SQLite; export/import round-trips; persist cache stays within the 100-entry / 1 MB caps.
- [ ] Trust: a Local or BYOK session produces no cloud memory rows (verified: no `cloud_id`, no `/api/memory/sync` push); Local→BYOK reuse runs the full fork gate.
- [ ] Security: recalled memory is fenced via `fenceUntrustedContent`; delete emits a tombstone that propagates and hides the row on other devices; `user_id` is always server-derived; no secrets are stored in memory content.

## Anti-patterns

- Silently syncing Local or BYOK memory to cloud, or upgrading a local row to a cloud row without explicit consent — a trust-boundary violation.
- Claiming Desktop cloud memory sync is shipped; it is 🟡 (endpoint built in web; Desktop client not wired).
- Introducing categories beyond `preference`/`fact`/`decision`/`context`, or forking the enum away from `memoryStore.ts`.
- Injecting recalled memory as trusted instructions instead of fenced data (memory-poisoning risk).
- Hard deletes that skip tombstones, or trusting a client-supplied `user_id`.
- Referencing Supabase (fully migrated away) or renaming `proxy.ts` to `middleware.ts`.
- Hardcoding or inventing model IDs, routes, env vars, or INR prices; referencing removed tiers (Plus/Hobby/`pro_plus`) or credit top-ups. Pricing is Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
