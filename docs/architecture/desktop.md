# Desktop surface

Status: Current
Owner: Founder + desktop lead
Last updated: 2026-11-11

The public AGI Desktop product is the Electron application under
`apps/desktop/electron`. The Rust/Tauri implementation in
`apps/desktop/src-tauri` is retained for internal value and compatibility; it
does not define a second public Desktop product.

The founder authorized starting a GPUI migration on 2026-11-08. The opt-in
development host at `apps/desktop/gpui` uses the existing CLI developer-session
protocol through separate account-only and consented workspace connections. Its
Code path supports folder sessions, model discovery, composer submission,
streamed output, interruption and approvals. Its separate Consumer Cloud path
supports saved history and attachment-reference continuity, versioned conversation metadata/model selection,
workspace-bound project metadata/conversations and recoverable Work runs through the hosted contracts. Cloud model preferences stay
on their conversation record, with no native private copy. Saved user-file references
are displayed as filename/type/size metadata and passed by asset ID to the existing
authorized gateway hydrator; native history never opens metadata URLs. Invalid
references, workspace mismatches and oversized serialized context stop the send
before gateway dispatch. Reviewed native chat uploads use the shared account
upload engine, with explicit file selection/review and message-bound attachment
references. Completed unsent references have scoped private device recovery;
uncertain sends require review, and Temporary Chats suppress retention. In-flight
upload recovery and full native acceptance remain open. Inline file/image previews and downloads from these transcript labels
remain unimplemented. Cloud draft writes use
the shared independent draft revision; native pending text remains bound to its
captured account and workspace until saved or explicitly resolved. Native end-to-end
conversation acceptance is pending; it is not yet a replacement release. Cloud continuity and Host Developer remain separate
boundaries throughout migration. The remaining migration and release gates live
in `audit/plan/desktop-gpui-migration.md`.

Code file recovery is owned by the CLI host, under its private configuration
root. Its bounded recovery document is keyed by the granted folder identity and
relative file path. Retaining or reading edits does not change workspace files
or enter account Cloud storage. The recovery browser lists metadata for the
current recorded folder identity, including missing files. A reviewed copy can
create an unused relative path in an existing folder through the host's anchored
save authority; it never replaces an existing destination or consumes recovery.
Explicit discard remains separate and updates any open editor's recovery state.
Reopening an existing file can also show retained edits for review and restoration
into the editor. Saving the workspace file still uses
its checked file revision. Concurrent recovery writes use versioned receipts;
discard invalidates older writes so a late request cannot recreate discarded
text. Corrupt or unsupported recovery data is retained and reported, never
silently replaced with an empty store. This implementation advertises recovery
on Unix hosts. Windows private storage, recovery after complete folder removal,
directory-identifier lifetime/reuse, and full native interaction/accessibility
qualification remain open. Code message drafts still lack durable host persistence.

The opt-in Code settings panel edits additional instruction files through the
CLI owner, with explicit profile/folder scope and a per-file revision. Native
saves change one file, retain conflicting editor text and require confirmation.
Empty native saves leave an empty instruction file; the older settings method
retains its explicit empty-string deletion contract through the same anchored
writer. The native panel reports configured defaults read-only and can request
the context engine's discovered source list. Other instruction sources and the
host's context budget continue to apply. These are Host Developer settings;
account Cloud preferences remain a separate owner.

Native Code worktree controls use the CLI's managed-worktree owner for creation,
listing, pinning and archival. Opening a checkout, or returning to its original
repository, requires a fresh folder grant. A runtime inside a checkout lists only
that checkout; sibling management stays in the original repository's scope.
Archives retain a Git ref/commit receipt. The owner refuses removal when ignored
files or nested repositories/submodules would be omitted, and retains the host
record if Git cannot remove the checkout.

Native apply-to-original uses separate host-owned review and commit methods on
Unix. A plan captures the original folder's identity, source Git snapshot,
admitted source bytes and destination versions. Read-only text/binary previews
are bounded by global CLI policy. A confirmed commit checks the source and all
applicable destinations before writing through the existing file authority;
conflicts and protected paths remain unchanged. Per-file outcomes distinguish
known refusal from unconfirmed writes and retain available original copies when
publication fails. The worker holds lifecycle admission until I/O finishes even
if its caller is cancelled. Receipts are read in bounded pages, and the same
commit returns the recorded result without rewriting later edits. Plans and the
last receipt are runtime-bound; no apply is replayed after restart. Whole-folder
transactions, durable receipt/recovery discovery and incremental apply baselines
remain open, alongside setup-script review/run and other migration gates.

## Public contract

Desktop participates in two continuity domains without merging them:

- **Consumer Cloud.** Conversation inference is Managed Cloud. The public
  Electron dispatcher refuses every command in `LOCAL_INFERENCE_COMMANDS` with
  `unsupported-platform`. Desktop chat does not accept provider API keys or
  expose Local/BYOK chat; its device-registry profile reports
  `localModels: false` and `localMcp: false`. Cloud conversations, projects,
  memory, settings, connected apps, files/artifacts, and account state share
  the hosted contract with Web and later Mobile/eligible Chrome clients.
- **Host Developer.** Desktop Code uses the host-owned developer runtime also
  consumed by CLI and VS Code: a local coding session runs the bundled CLI, which
  can use a local model or a provider key set up in the CLI. Session IDs/transcripts, workspace tools and
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

- `apps/desktop/electron/config.ts` for the hosted web origin, allowed origins,
  and the Managed Cloud boundary.
- `apps/desktop/electron/main.ts` for the hardened browser window, preload,
  deep links, tray, shortcuts, and IPC registration.
- `apps/desktop/electron/runtime/dispatcher.ts` for command classification,
  permission ordering, Local-inference refusal, and device capability
  declaration.
- `packages/contracts/local-runtime` for typed IPC commands and device-step
  contracts shared with consumers.

## Renderer and IPC boundary

The window always loads the hosted web app, `https://agiworkforce.com`;
in an unpackaged build `AGI_CLOUD_APP_ORIGIN` can point it at localhost or
another first-party host, and a packaged build ignores that variable but honors
`--agi-cloud-app-origin=` within the same allowlist. The main window
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
- **Cloud-mode data.** Conversations, messages and artifacts created in
  managed-cloud mode are stored by the account through the web API
  (`apps/desktop/src/runtime/CloudRuntime.ts`) and are not kept in this
  database, so losing the file does not lose them. They are not readable
  offline.
- **Local-mode rows.** Nothing copies them anywhere. A lost file, or a lost
  credential-service key, loses them; the product has no scheduled local
  backup, and says so rather than implying one.

## Release state

`.github/workflows/release-desktop-cloud.yml` builds the Electron macOS
application from `v-cloud-desktop-*` tags, signs each architecture, notarizes
the result, and validates the staple. `scripts/release/build-desktop-mac-local.sh`
does the same on a Mac without GitHub credentials, and both run
`scripts/release/verify-desktop-mac-release.sh`. A working release workflow is not proof
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
