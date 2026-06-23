# Cross-surface chat sync v1 stance

Status: Decided 2026-05-22
Decider: Platform lead
Driver: R22 functional audit (commit 658118086) flagged schema mismatch between web (`web_conversations`/`web_messages`) and desktop (`conversations`/`messages`).

## Question

Should v1 LOCAL ONLY enable cross-surface chat sync between Web, Desktop, and Mobile, or defer to Cloud Managed waitlist?

## Decision

Cross-surface chat sync is **waitlist-gated for v1** per `locks/v1-local-only-cloud-waitlist-2026-05-18.md`. The schema mismatch is not a bug — it is intentional per-surface isolation in v1 LOCAL ONLY mode.

## Audit finding (R23)

`apps/desktop/src-tauri/src/data/supabase_sync.rs` was audited end-to-end. It does NOT fire automatically in v1 LOCAL ONLY mode. Three independent default-deny gates protect it:

1. **`chat_preferences.chat_storage_mode` defaults to `"local"`** — `apps/desktop/src-tauri/src/sys/commands/settings.rs:140-142` defines `fn default_chat_storage_mode() -> String { "local".to_string() }`. Every `spawn_sync_*` call in `send_message.rs` (line 33), `send_message_setup.rs`, `send_message_execution.rs`, and `persistence.rs` checks `cloud_sync_enabled = (chat_storage_mode == "cloud")` before invoking Supabase writes. This is false by default.

2. **`SupabaseSyncClient::new()` returns `None` without Supabase credentials** — `supabase_sync.rs:70-89` calls `get_supabase_url()` and short-circuits with `debug!("Supabase sync disabled: credentials not configured")` if the URL is empty. Bundled desktop apps have no `SUPABASE_URL` baked into the Rust process environment; the frontend must call `set_supabase_credentials` to populate it.

3. **`get_auth()` returns `None` without a stored JWT** — `supabase_sync.rs:93-97` requires an in-memory access token. Anonymous / unsigned-in v1 users have none. Both `spawn_sync_conversation` and `spawn_sync_message` check `SupabaseSyncClient::new()` before doing anything; both `sync_conversation` and `sync_message` check `get_auth()` inside the client and return an error that is silently dropped.

4. **Bulk sync command rejects unless mode is `"cloud"`** — `conversation.rs:329-340` enforces the preference check and returns an error message before constructing the client.

**Gap noted:** the desktop Privacy settings tab (`apps/desktop/src/features/settings/tabs/Privacy/index.tsx:248-274`) renders a visible toggle for `chatStorageMode` (labeled "Sync chat history to cloud") when running inside Tauri. This toggle is guarded only by `{!isCloudWeb && ...}` — it is visible on desktop today. A user who flips this toggle to `"cloud"` AND is authenticated will trigger Supabase writes. For v1 this toggle should be hidden or replaced with a "Coming soon" CTA. This is tracked as a follow-up; the gate at the Rust level means data cannot exfiltrate without an authenticated session regardless.

## Rationale

**Privacy by default**: v1 users are in Local Mode. Cross-device sync requires cloud infrastructure, authentication, and a shared schema across surfaces. Shipping sync prematurely would violate the v1 LOCAL ONLY guarantee communicated in onboarding and marketing copy.

**Schema isolation is intentional**: Web uses `web_conversations`/`web_messages` tables with a different column layout than desktop's `conversations`/`messages`. This is per-surface isolation — not a bug. Merging schemas requires a migration that is planned for Cloud Managed beta, not v1.

**Sets clear user expectations**: users who stay local-only have no data leaving the device unless they explicitly enable cloud mode. This is a trust property, not just a technical constraint.

**Architecture supports future enablement**: the Rust gate is one boolean; schema migration is the harder problem. This decision defers the harder problem correctly.

## v1 substitute

- Each surface maintains its own local chat history in SQLite (Desktop, CLI) or Supabase (Web, where the user is cloud-first by nature).
- Desktop-to-CLI and Desktop-to-extension sync uses the existing bridge on port 8787 (read-only context sharing, not chat history sync).
- Export as JSON is available on desktop (via `export_conversations` command) for manual transfer.

## Future enablement (Cloud Managed beta)

When Cloud Managed beta ships:

1. Pick one canonical schema (`conversations`/`messages`) or introduce a new `cloud_conversations`/`cloud_messages` set.
2. Set `chat_preferences.chat_storage_mode = "cloud"` in the frontend when the user activates Cloud Managed.
3. The Rust gate (`cloud_sync_enabled = mode == "cloud"`) then passes and Supabase writes start.
4. Remove or upgrade the Privacy tab toggle to be gated behind plan tier check.
5. The `sync_conversations_to_cloud` bulk command will run as a one-time migration for existing local history.

Schema decisions and migrations affecting Supabase must be escalated to the `supervisor` agent per cross-surface impact rules.

## Code references

- `apps/desktop/src-tauri/src/data/supabase_sync.rs` — correctly gated; `SupabaseSyncClient::new()` returns `None` without credentials (lines 70-89)
- `apps/desktop/src-tauri/src/sys/commands/settings.rs:140-142` — `default_chat_storage_mode()` returns `"local"`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs:28-35` — derives `cloud_sync_enabled` from `chat_storage_mode == "cloud"`, defaults to `false`
- `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs:329-340` — bulk sync command rejects unless mode is `"cloud"`
- `apps/desktop/src/features/settings/tabs/Privacy/index.tsx:248-274` — OPEN GAP: Tauri-visible toggle for `chatStorageMode`; should be hidden or waitlist-gated in v1
- `packages/types/src/suite-contracts.ts` — `assertSurfaceCanSyncChats` (if present; verify before Cloud Managed enablement)
- `crates/agiworkforce-protocol/src/projects.rs` — `is_synced_app_surface()` (if present; verify before Cloud Managed enablement)

## Rollback plan

The `chat_storage_mode` default is `"local"`. Rolling back means ensuring no user's persisted settings have `chat_storage_mode: "cloud"`. If a user has enabled cloud sync and then the feature is reverted:

1. Run a settings migration that sets `chat_storage_mode` back to `"local"` for all users.
2. Delete any cloud rows belonging to those users (or leave them orphaned — they are copies, not the source of truth; SQLite remains canonical).
3. Remove the Supabase credentials forwarding call (`set_supabase_credentials`) from the frontend startup path.

Because SQLite is always the source of truth, no data loss occurs on rollback.
