# Volume 25 — Storage (Cloud / Local)

Status: Canonical depth for Master Spec Vol 25
Authority: `docs/spec/AGI_CODE_MASTER_SPEC.md` Vol 25, `docs/strategy/04-scaling-to-1M-architecture.md` (data tier), `docs/current/source-of-truth.md` (trust modes), `apps/web/db/neon` (canonical migrations).

## Philosophy & Cloud/Local stance

Storage is where the trust boundary becomes physical. Cloud storage is for Managed and synced-account data; local storage is for Local-mode data that, by law, **stays on the device unless the user explicitly transfers it.** The single most important storage rule is also the product's promise: _local stays local._ Every record, attachment, and key carries its privacy mode + storage scope so the system can prove where data lives.

Cloud is canonical only for what belongs in the cloud (accounts, synced app chats, billing, Managed artifacts): PostgreSQL on Neon is the source of truth (`apps/web/db/neon`, 44 migrations, RLS-oriented), with Redis, object/blob storage, a CDN, and a vector DB layered on top (`docs/strategy/04` §5). Local is canonical for Local-mode data: SQLite, MMKV/IndexedDB, the OS keystore, and the filesystem. Secrets are the sharpest case — BYOK keys live in the OS keystore on Desktop/CLI/Mobile and **never** on Web/Chrome, and never transit AGI servers.

## Binding rules

1. RLS on every cloud table; every record carries org/workspace/user scope (Vol 4). No cross-tenant read is possible at the DB layer.
2. Local-mode data stays local: nothing in `local_only` is written to Neon, blob storage, or any AGI server unless the user runs an explicit reviewed transfer (Vol 3, Vol 26).
3. Secrets live in the OS keystore per surface: Desktop = Stronghold/Keychain, CLI = OS keyring, Mobile = SecureStore (`apps/mobile/lib/secureStorage.ts`). Web and Chrome hold no BYOK keys.
4. `apps/web/db/neon` is the canonical migration source; review migrations manually before any billing/security change (`repo-map.json`).
5. Audit logs are append-only/immutable (`security_audit_logs`, R1 in `docs/strategy/03`); they are never updated or deleted in place.
6. Every stored artifact/attachment carries a manifest: checksum, MIME, TTL/retention, owner, and privacy/provider mode (Vol 14, Vol 39).
7. Managed outputs follow the retention/deletion policy; local generated files stay local; never write outputs into source trees (Vol 39).
8. Vector/embedding storage is trust-scoped via a container-tag equivalent so a Local memory can never surface in a BYOK/Managed query (Vol 12).

## Repository map

- **Cloud canonical DB:** `apps/web/db/neon/*.sql` — `0001_mvp_chat`, `0003_subscriptions`, `0004_token_credits`, `0005_api_keys`, `0006_projects`, `0008_connectors`, `0010_memory`, `0012_stripe`, `0013_devices`, `0014_security`, `0015_organizations` … (44 migrations).
- **Realtime/sync store:** `services/signaling-server/src/db.ts`, `connection-manager.ts`; gateway persistence in `services/api-gateway`.
- **Local mobile storage:** `apps/mobile/lib/mmkv.ts` (key-value), `apps/mobile/lib/secureStorage.ts` (SecureStore), local model cache via `apps/mobile/services/modelDownload.ts`.
- **Local desktop storage:** SQLite + Stronghold/Keychain in `apps/desktop/src-tauri` (Cargo deps + capabilities in `src-tauri/capabilities/default.json`).
- **Contracts:** `packages/contracts/types/src/suite-contracts.ts` (`PrivacyMode`, storage-scope + generated-file trust-boundary validation); `packages/platform/data-layer`, `packages/platform/artifacts`.
- **Artifact isolation:** `apps/sandbox` (cross-origin renderer; storage isolation primitive, Vol 14).

## Competitor notes

Both incumbents run one unified account + conversation-history store, a shared usage-accounting service, vector retrieval for Projects/RAG, a memory-synthesis store with per-scope isolation, and artifact hosting with persistent storage and viewer-pays auth routing (`docs/strategy/01` §4). Claude artifacts persist 20MB each with publish/share. AGI's deliberate divergence: a **local storage tier that is canonical, not a cache** — the privacy-first wedge incumbents cannot lead on without cannibalizing their data flywheel (`01` §5). Neon scales well but conversation history + sync + metering write-amplify, so hot tables (`messages`, `usage_events`) need careful indexing, pooling, and eventually replicas/partitioning (`04` §5).

## Checklists

### Cloud storage

- [ ] Every table has RLS; cross-tenant access is impossible at the DB layer (verified, not assumed).
- [ ] Hot tables (`messages`, `usage_events`) indexed for append + read; connection pooling configured.
- [ ] Read replicas / time-or-tenant partitioning planned for history/search and metering at scale.
- [ ] `security_audit_logs` is append-only; no update/delete path exists.
- [ ] Blob/object storage holds artifacts/files with TTL/retention + checksums; CDN fronts public reads.
- [ ] Vector DB entries are trust-scoped (container tag); embeddings never mix Local with Managed.

### Local storage

- [ ] Local-mode chats/files/memory/projects persist only on-device (SQLite/MMKV/IndexedDB/FS).
- [ ] No `local_only` write reaches Neon/blob/any AGI server (egress + storage-scope test).
- [ ] Local caches/temp are bounded and evictable; model files are checksum-verified.
- [ ] A reviewed transfer is the only path from local → cloud, with consent + payload preview.

### Secret keystores (per surface)

- [ ] Desktop BYOK keys in Stronghold/Keychain; never in plaintext config or logs.
- [ ] CLI keys in the OS keyring; never echoed to the terminal or session log.
- [ ] Mobile keys in SecureStore (`apps/mobile/lib/secureStorage.ts`); never in MMKV/AsyncStorage.
- [ ] Web/Chrome hold no BYOK keys at all; BYOK keys never transit AGI servers.
- [ ] Key rotation supported; rotating a key invalidates the old material everywhere.

### Manifest & retention

- [ ] Each artifact/attachment carries checksum, MIME, TTL/retention, owner, privacy/provider mode.
- [ ] Managed outputs follow retention/deletion; deletion is honored end-to-end (incl. backups policy).
- [ ] Local generated files stay local; outputs never written into source trees.
- [ ] Data-export and account-delete flows cover every store (DB, blob, vector, local) for the user's scope.

## Definition of Done

Storage is production-ready when: every cloud table enforces RLS and tenant scope; audit logs are provably append-only; hot tables are indexed/pooled with a partitioning/replica plan; Local-mode data never leaves the device without a reviewed transfer (proven by egress + storage-scope tests); BYOK secrets live only in the correct OS keystore per surface and never on Web/Chrome or AGI servers; every stored object carries a manifest with retention; and export/delete flows cover all stores. Migrations are reviewed in `apps/web/db/neon` before any billing/security change.

## Anti-patterns

- Writing any Local-mode data to Neon, blob storage, or telemetry "just for convenience."
- Storing BYOK keys on Web/Chrome, in plaintext config, in logs, or in non-secure local storage.
- Adding a table without RLS or without org/workspace/user scope.
- Updating or deleting audit-log rows in place.
- Storing artifacts/files without a manifest (checksum, MIME, retention, privacy mode).
- Treating the local tier as a disposable cache when the product promise is that it is canonical and private.
- Letting `messages`/`usage_events` grow unindexed until reads collapse at scale.
