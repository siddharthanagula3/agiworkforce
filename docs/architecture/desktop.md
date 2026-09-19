# Desktop surface

Status: Current
Owner: Founder + desktop lead
Last updated: 2026-09-19

The public AGI Desktop product is the Electron application under
`apps/desktop/electron`. The Rust/Tauri implementation in
`apps/desktop/src-tauri` is retained for internal value and compatibility; it
does not define a second public Desktop product.

## Public contract

- Conversation inference is Managed Cloud. The public Electron dispatcher
  refuses every command in `LOCAL_INFERENCE_COMMANDS` with
  `unsupported-platform`.
- Desktop does not accept provider API keys and does not expose Local or BYOK
  inference. The device-registry profile reports `localModels: false` and
  `localMcp: false`.
- Desktop adds approved local folders and device tools to the signed-in cloud
  account. A local device capability does not change the conversation's trust
  mode.
- Cloud conversations, projects, memory, settings, and account state share the
  hosted contract with Web. Durable conversation data does not move into a
  private Desktop SQLite database.

The executable owners are:

- `apps/desktop/electron/config.ts` for renderer mode, allowed origins, and the
  Managed Cloud boundary.
- `apps/desktop/electron/main.ts` for the hardened browser window, preload,
  deep links, tray, shortcuts, and IPC registration.
- `apps/desktop/electron/runtime/dispatcher.ts` for command classification,
  permission ordering, Local-inference refusal, and device capability
  declaration.
- `packages/contracts/local-runtime` for typed IPC commands and device-step
  contracts shared with consumers.

## Renderer and IPC boundary

The shipped renderer mode loads `https://agiworkforce.com`. The main window
uses context isolation, Chromium sandboxing, no renderer Node integration, and
the Electron preload. The preload exposes the host bridge only to the allowed
AGI origin; OAuth pages do not inherit it.

Privileged operations follow one path:

```text
hosted web renderer
  -> sandboxed preload
  -> Electron IPC channel
  -> runtime dispatcher
  -> command classification
  -> workspace/global permission
  -> approved-root and path checks where applicable
  -> device service
```

Unknown commands fail closed. Local-inference commands are refused before
permission handling so a hidden UI cannot leave the capability reachable.
Filesystem operations resolve and contain paths under a user-approved root.
High-risk operations use explicit approval and the platform's available
sandbox; an unavailable sandbox must not silently become an unrestricted run.

## Local state and credentials

Electron keeps only device-owned shell state such as window preferences,
approved roots, permission decisions, pairing state, and device identity.
Account credentials are stored only when Electron `safeStorage` reports that
operating-system encryption is available; otherwise persistence is refused.
Provider API keys are not part of the public Desktop contract.

## Release state

`.github/workflows/release-desktop-cloud.yml` builds the Electron macOS
application from `v-cloud-desktop-*` tags, signs each architecture, notarizes
the result, and validates the staple. A working release workflow is not proof
that an installer is published. The release API and public download page remain
the authority for availability, and no public Electron installer is currently
published.

The retained Tauri workflows use a separate tag and asset namespace. They do
not authorize public Tauri, Linux, Local-inference, or BYOK claims.

## Retained Tauri source conventions

These conventions describe the retained internal Tauri renderer, not the
public Electron product. **Retired chat folder:** the former
UnifiedAgenticChat component tree must not be recreated; retained Tauri-owned
chat code lives in `apps/desktop/src/features/chat/`.

## Verification

```bash
pnpm --filter @agiworkforce/desktop typecheck:electron
pnpm --filter @agiworkforce/desktop test
pnpm --filter @agiworkforce/desktop check:no-devtools
pnpm --filter @agiworkforce/desktop exec vitest run electron/__tests__/dispatcher.test.ts
```

Website claim tests additionally inspect the executable Electron contract so a
copy-only test cannot certify a shared false premise.
