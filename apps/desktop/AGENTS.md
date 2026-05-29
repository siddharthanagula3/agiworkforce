# Desktop Agent Rules

Status: Current
Owner: Desktop lead
Last updated: 2026-05-21

Read root `AGENTS.md`, then this file, then `apps/desktop/README.md`.

## Scope

`apps/desktop` owns the local-first desktop app, Tauri bridge, local files, MCP/connectors, artifacts, generated files, computer-use host behavior, and Desktop as future local compute host.

## Lane Contract

- Primary lanes: `desktop-frontend` and `desktop-native`.
- `desktop-frontend` owns `apps/desktop/src/**`.
- `desktop-native` owns `apps/desktop/src-tauri/**`.
- Shared contracts, Rust crates outside the Desktop package, release signing, and installer metadata need the matching platform or release lane.
- Cross-boundary Tauri IPC changes need frontend and native verification before merge.

## High-Risk Areas

- Local file access, filesystem writes, shell/process execution, MCP credentials, browser/computer use, native messaging, sandbox policy, generated files, update/signing, and Local/BYOK/Managed handoffs.
- Frontend changes can affect Desktop and the embedded Web chat build path. Check both when touching shared shell/chat behavior.
- Do not move reusable runtime contracts into Desktop-only code.

## Verification

- Frontend: `pnpm --filter @agiworkforce/desktop typecheck`
- Frontend behavior: `pnpm --filter @agiworkforce/desktop test`
- Tauri/Rust: `cargo check -p agiworkforce-desktop`
- Packaging/release: run the relevant build or document why it was not run.

## Locked: v1 LOCAL ONLY — cloud sync gating (R25-V5, 2026-05-22)

**Decision:** Remove the "Sync chat history to cloud" toggle from the Privacy tab entirely (option b).

**Rationale:**

- v1 is LOCAL ONLY by ADR `docs/locks/v1-local-only-cloud-waitlist-2026-05-18.md`.
- The `ChatPreferences.chatStorageMode` field defaults to `"local"` (Rust: `default_chat_storage_mode()`, TS: `defaultChatPreferences.chatStorageMode`).
- `send_message.rs` derives `cloud_sync_enabled = chat_storage_mode == "cloud"` and only crosses the managed cloud boundary when explicitly enabled.
- The default local path keeps sync silent under default settings.
- `settings_load_from_disk` now coerces any persisted `"cloud"` back to `"local"` on app load (migration guard for users who enabled sync before the v1 gate).
- When cloud sync is ungated: re-add the toggle to `apps/desktop/src/features/settings/tabs/Privacy/index.tsx` (look for the comment), remove the coercion in `settings_load_from_disk`, and delete/replace the negative test with a gated one.
