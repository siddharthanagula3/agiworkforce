# Desktop surface

Status: Current
Owner: Founder + desktop lead
Last updated: 2026-09-21

The public AGI Desktop product is the Electron application under
`apps/desktop/electron`. The Rust/Tauri implementation in
`apps/desktop/src-tauri` is retained for internal value and compatibility; it
does not define a second public Desktop product.

## Public contract

Desktop participates in two continuity domains without merging them:

- **Consumer Cloud.** Conversation inference is Managed Cloud. The public
  Electron dispatcher refuses every command in `LOCAL_INFERENCE_COMMANDS` with
  `unsupported-platform`. Consumer Desktop does not accept provider API keys or
  expose Local/BYOK chat; its device-registry profile reports
  `localModels: false` and `localMcp: false`. Cloud conversations, projects,
  memory, settings, connected apps, files/artifacts, and account state share
  the hosted contract with Web and later Mobile/eligible Chrome clients.
- **Host Developer.** Desktop Code uses the host-owned developer runtime also
  consumed by CLI and VS Code. Session IDs/transcripts, workspace tools and
  extensions, permission decisions, approved repositories/files, and local
  credential references are host state. Provider or tool secrets stay in the
  operating-system credential store and are not inherited by Consumer Cloud.

Approved local folders and device tools do not become account Cloud objects by
being visible in the same shell. A Cloud action may invoke a host capability
only through the typed permission path. Moving selected context between a Cloud
conversation and a developer session requires a previewed, secret-scanned,
provenance-preserving handoff and creates a destination record appropriate to
the new trust boundary.

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
Provider API keys are not part of Consumer Desktop Cloud. Future Desktop Code
provider credentials belong to the shared host credential broker used by CLI
and VS Code; they must never be copied into renderer storage or Cloud sync.

## Voice and computer-control target

The future Desktop release includes voice control of approved applications and
operating-system actions. Speech recognition, intent/target classification,
deterministic policy, user confirmation, native execution, result verification,
and undo/recovery are separate stages. A classifier such as Jev may advise on
intent, ambiguity, or risk; it cannot grant a permission or authorize a
consequential action. Prefer typed app/connector tools, then controlled browser
automation, then screen-level interaction. This is a target contract, not a
claim that current Desktop voice control is complete.

### Local database: backup, recovery and corruption

The Electron application holds no database of conversations, messages or
artifacts. They live in the managed cloud and are recovered with it
(`docs/runbooks/business-continuity.md`); what Electron stores is the shell
state above, which a reinstall and a fresh sign-in rebuild.

The retained Tauri build does keep a local store, a SQLCipher database, and its
recovery properties are these:

- **Key.** A new installation uses a random 256-bit key held by the operating
  system's credential service (`apps/desktop/src-tauri/src/data/db/key_management.rs`).
  A legacy machine-derived key is proven read-only and then retired by
  rekeying, because it is recomputable by any local process.
- **Corruption.** A file that neither the key nor a plaintext read can open
  fails closed with its bytes untouched, and is never reported as a migration
  (`corrupt_file_is_not_reported_as_a_completed_legacy_migration_and_preserves_bytes`
  in `apps/desktop/src-tauri/src/data/db/encryption.rs`). Corruption and a wrong
  key cannot be told apart, so neither is repaired automatically.
- **Rekey and migration.** The database file and its `-wal` and `-shm`
  sidecars are copied before a rekey, restored together if it fails, and
  deleted once it succeeds; these copies are transient and are not a backup.
- **Cloud-mode rows.** Conversations, messages and artifacts created in
  managed-cloud mode sync through `/api/chat/sync`
  (`apps/desktop/src-tauri/src/data/cloud_sync.rs`). An empty store starts its
  pull cursor at `0`, so a lost or unreadable database is rebuilt from the
  cloud on the next signed-in sync.
- **Local-mode rows.** Nothing copies them anywhere. A lost file, or a lost
  credential-service key, loses them; the product has no scheduled local
  backup, and says so rather than implying one.

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
