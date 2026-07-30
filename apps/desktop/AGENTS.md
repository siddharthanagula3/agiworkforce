# Desktop Agent Rules

Status: Current
Owner: Desktop lead
Last updated: 2026-07-14

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

## Locked: one app, isolated execution planes

**Decision:** Desktop is one installed Tauri application with Local and Cloud
workspaces, not separate Local and Cloud binaries.

**Rules:**

- Local remains the default on a Tauri host. Local conversations and files do
  not sync or egress automatically.
- BYOK is a direct-provider route inside the Local product experience, but its
  persisted conversation `execution_mode` remains `byok`. Local-to-BYOK is an
  explicit reviewed fork, never a mutation of the Local conversation.
- Managed Cloud uses `cloud_managed` conversations, the account backend, and
  the shared Web/Mobile/Desktop cloud-chat plane. It must not reuse the Local
  SQLite conversation as its authority.
- `ChatPreferences.chatStorageMode` is an explicit synchronization preference,
  not the application mode or the conversation trust boundary. Do not infer
  Local/BYOK/Managed authority from it.
- `settings_load_from_disk` must not silently coerce a user's persisted
  synchronization preference. The privileged send/sync boundary enforces the
  active conversation mode independently.
- Managed Cloud is public alpha platform-wide, not waitlist-only. Desktop must
  still fail closed until `CloudRuntime` is selected by the live shell and the
  `desktop/cloud-chat` runtime profile is marked `implemented` after real
  credentialed end-to-end verification.
- Do not create a second Desktop application to complete Cloud Mode. Add the
  Cloud runtime adapter behind the existing shell and keep Local, BYOK, and
  Managed storage, credentials, tools, telemetry, and network policy isolated.
