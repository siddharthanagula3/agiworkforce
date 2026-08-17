# Desktop Agent Rules

Status: Current
Owner: Desktop lead
Last updated: 2026-08-04

Read root `AGENTS.md`, then this file.

## Scope

`apps/desktop` owns the local-first desktop app, Tauri bridge, local files, MCP/connectors, artifacts, generated files, computer-use host behavior, and Desktop as future local compute host. It also owns the cloud-only Electron shell (`apps/desktop/electron/` plus the `src/lib/tauri-electron/` shims), which packages the desktop cloud web build.

## Lane Contract

- Primary lanes: `desktop-frontend` and `desktop-native`.
- `desktop-frontend` owns `apps/desktop/src/**` and `apps/desktop/electron/**`.
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
- Electron shell: `pnpm --filter @agiworkforce/desktop typecheck:electron` and
  `pnpm --filter @agiworkforce/desktop build:electron`
- Packaging/release: run the relevant build or document why it was not run.

## Isolation pattern: release-only, brownfield in the dev loop

`tauri.conf.json` keeps `app.security.pattern.use = "isolation"`, so every
packaged build (`build:local`, `build:release`) and the WDIO e2e build ship the
IPC isolation frame. The dev loop cannot: `build.devUrl` is
`http://127.0.0.1:5173`, and WKWebView never delivers the isolation frame's
`postMessage` (origin `null`) to an http parent, so with isolation on `pnpm dev`
hangs on the first `invoke()` with no rejection. `pnpm dev` therefore merges
`src-tauri/tauri.dev.conf.json`, which switches the pattern to `brownfield`.

- The override must keep `"options": null`; JSON Merge Patch otherwise leaves
  the isolation `options` map behind and the config fails to deserialize with
  `invalid type: map, expected unit variant PatternKind::Brownfield`.
- Dev does not exercise `src-tauri/isolation/isolation-hook.js`. Verify IPC
  changes against the isolation pattern with `pnpm run test:e2e`, which builds
  with `--features tauri/custom-protocol` and the product pattern.
- Do not pass a pattern override to any `tauri build` invocation, and do not
  flip the product config to `brownfield`.
- `src/__tests__/tauriDevIsolation.test.ts` guards both halves.

## Locked: one surface, two shells, isolated execution planes

**Decision (founder, 2026-08-03):** Desktop is one product surface with two
installed shells. The Tauri shell owns Local, BYOK, and Managed Cloud
workspaces. The cloud-only Electron shell (`apps/desktop/electron/`) packages
the desktop cloud web build and lives entirely inside the Managed Cloud trust
boundary, on the same plane as Web. This supersedes the earlier "one installed
Tauri application" lock.

**Electron shell rules:**

- The Electron shell is Managed Cloud only, permanently. It must never gain a
  Local mode, BYOK routing, local filesystem features, shell/process
  execution, MCP hosting, or any local execution plane.
- Default renderer is the HOSTED cloud web app (Claude-desktop model, founder
  decision 2026-08-04): the window loads `https://agiworkforce.com/chat`
  top-level in the pinned `persist:agi-cloud` session partition, with
  cookie-session auth and a navigation allowlist (our hosts + identity
  providers; everything else opens in the OS browser). Do not change the
  partition name — it wipes signed-in state.
- Fallback renderer (`AGI_CLOUD_RENDERER=bundled`) is the
  `VITE_BUILD_TARGET=electron` bundle served over `agi://cloud`, with native
  Clerk sign-in proxied by the main process. Keep it building and tested; it
  is the escape hatch if the remote model hits a webview or auth wall.
- The main process talks only to the Clerk Frontend API and our own cloud API.
- Do not complete Tauri Cloud Mode by pointing users at the Electron shell, and
  do not port Tauri Local/BYOK behavior into it.

**Tauri shell rules:**

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
- Keep Local, BYOK, and Managed storage, credentials, tools, telemetry, and
  network policy isolated. The Electron shell is not a substitute for Tauri
  Cloud Mode: the Tauri shell keeps its own Cloud runtime adapter behind the
  existing shell.
