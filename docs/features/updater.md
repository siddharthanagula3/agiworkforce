# Sub-Feature: Updater

> Tauri v2 auto-update system with Ed25519 signature verification, multi-platform GitHub Releases distribution, Supabase release database, and a frontend UI for checking/downloading/installing updates with user-controlled preferences.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| Rust backend (updater logic) | `apps/desktop/src-tauri/src/features/updater.rs` |
| Rust backend (security/verification) | `apps/desktop/src-tauri/src/sys/security/updater.rs` |
| Rust backend (plugin init) | `apps/desktop/src-tauri/src/lib.rs` (lines 118-122) |
| Rust backend (feature flag) | `apps/desktop/src-tauri/Cargo.toml` (`updater` feature) |
| Rust backend (module gate) | `apps/desktop/src-tauri/src/features/mod.rs` (`#[cfg(feature = "updater")]`) |
| Tauri config (endpoints, pubkey) | `apps/desktop/src-tauri/tauri.conf.json` (`plugins.updater`) |
| Tauri capabilities | `apps/desktop/src-tauri/capabilities/default.json` (updater permissions) |
| Frontend store | `apps/desktop/src/stores/updaterStore.ts` |
| Frontend hook | `apps/desktop/src/hooks/useUpdater.ts` |
| Frontend types | `apps/desktop/src/types/updater.ts` |
| Frontend UI (startup checker) | `apps/desktop/src/components/Updates/UpdateChecker.tsx` |
| Frontend UI (dialog) | `apps/desktop/src/components/Updates/UpdateDialog.tsx` |
| Frontend UI (settings panel) | `apps/desktop/src/components/Settings/UpdateSettings.tsx` |
| Frontend mock | `apps/desktop/src/lib/tauri-mock.ts` (`checkForUpdates`, `relaunchApp`) |
| Web API (Tauri endpoint) | `apps/web/app/api/releases/[target]/[version]/route.ts` |
| Web API (update check) | `apps/web/app/api/releases/check/route.ts` |
| Web API (latest manifest) | `apps/web/app/api/releases/latest/[platform]/route.ts` |
| Web API (download proxy) | `apps/web/app/api/download/route.ts` |
| Web stub store | `apps/web/stores/unified/updaterStore.ts` |
| CI/CD (release pipeline) | `.github/workflows/release-desktop.yml` |
| CI/CD (legacy release) | `.github/workflows/release.yml` |
| E2E test | `apps/desktop/src/__tests__/e2e/windows.spec.ts` (lines 527-580) |

## Architecture Overview

The updater is a multi-layer system spanning Rust backend, TypeScript frontend, Next.js web API, and CI/CD:

```
                                   CI/CD Pipeline
                                   (release-desktop.yml)
                                         |
                          [tag push v*] / [workflow_dispatch]
                                         |
                    +--------------------+--------------------+
                    |                    |                    |
              build-macos          build-windows        build-linux
              (tauri-action)       (tauri-action)       (tauri-action)
                    |                    |                    |
                    +--- .sig files -----+--- .sig files ----+
                    |       (Ed25519 signatures)             |
                    +--------------------+--------------------+
                                         |
                              GitHub Release (draft -> published)
                                    +
                              Supabase `releases` table
                                    (via upsert_release RPC)
                                         |
                                         v
  +--------------------------------------------------+
  |             Web API (Next.js)                     |
  |  /api/releases/{target}/{version} -> GET          |
  |    (Tauri updater endpoint - returns manifest)    |
  |  /api/releases/check -> GET/POST                  |
  |    (Human-readable update check)                  |
  |  /api/releases/latest/{platform} -> GET           |
  |    (Tauri manifest from DB or GitHub fallback)    |
  |  /api/download?platform=mac|windows|linux -> GET  |
  |    (Installer download proxy)                     |
  +--------------------------------------------------+
                           |
                           | HTTPS
                           v
  +--------------------------------------------------+
  |        Tauri Desktop App                          |
  |                                                   |
  |  tauri-plugin-updater (Rust)                      |
  |    -> queries /api/releases/{target}/{version}    |
  |    -> compares versions (semver)                  |
  |    -> downloads + Ed25519 signature verification  |
  |    -> installs update binary                      |
  |    -> emits events: updater:*                     |
  |                                                   |
  |  features/updater.rs (Tauri commands)             |
  |    -> check_for_updates                           |
  |    -> install_update                              |
  |    -> install_update_and_restart                  |
  |    -> get_current_version                         |
  |    -> get_version_info                            |
  |                                                   |
  |  sys/security/updater.rs                          |
  |    -> UpdateSecurityManager                       |
  |    -> SHA-256 checksum + Ed25519 signature verify |
  |    -> Domain allowlist for download URLs          |
  |    -> Backup/restore of user data                 |
  |                                                   |
  |  Frontend (React)                                 |
  |    UpdateChecker -> startup auto-check            |
  |    UpdateDialog -> download/install modal         |
  |    UpdateSettings -> preferences in Settings      |
  |    updaterStore -> Zustand state + localStorage   |
  |    useUpdater -> hook bridging store + Tauri      |
  +--------------------------------------------------+
```

## Update Flow

### 1. Automatic Check on Startup

1. `App.tsx` renders `<UpdateChecker startupDelay={5000} />` in the app shell
2. `UpdateChecker` waits for store hydration from localStorage, then checks if enough time has elapsed since last check (respects `checkIntervalHours`, default 24h)
3. Calls `useUpdater().checkForUpdates()` which invokes `@tauri-apps/plugin-updater`'s `check()` function
4. The plugin issues a GET request to the configured endpoint: `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`
5. The web API compares versions using semver; returns `204 No Content` if up-to-date, or a JSON manifest if an update is available
6. If an update is available and not dismissed, a persistent toast notification appears with "Later" and "Update Now" buttons

### 2. Manual Check

Users can also trigger a check from **Settings > General > Software Update** via the `UpdateSettings` component.

### 3. Download & Install

1. User clicks "Download & Install" (in toast, dialog, or settings)
2. `useUpdater().downloadAndInstall()` calls `@tauri-apps/plugin-updater`'s `check()` again, then `update.downloadAndInstall()`
3. The plugin downloads the binary, verifies the Ed25519 signature against the embedded public key
4. Progress events are emitted at 5% intervals (throttled to avoid flooding)
5. After installation, `@tauri-apps/plugin-process`'s `relaunch()` restarts the app

### 4. Dismissal

- Users can dismiss an update notification; the dismissed version and timestamp are persisted to localStorage
- Dismissals expire after 24 hours (`DISMISSAL_EXPIRY_MS`)
- A different version always shows the notification regardless of prior dismissal

## Release API

### `GET /api/releases/[target]/[version]` (Tauri Updater Endpoint)

The primary endpoint configured in `tauri.conf.json`. This is what `tauri-plugin-updater` calls.

- **URL pattern**: `/api/releases/darwin-aarch64/1.1.5`
- **Behavior**: Fetches latest release from GitHub Releases API, compares with `version` param using semver, returns Tauri-compatible manifest or `204` if up-to-date
- **Response format** (when update available):
  ```json
  {
    "version": "v1.2.0",
    "notes": "Release notes...",
    "pub_date": "2026-03-10T12:00:00Z",
    "platforms": {
      "darwin-aarch64": {
        "url": "https://github.com/.../AGI.Workforce_1.2.0_aarch64.app.tar.gz",
        "signature": "<Ed25519 signature content>"
      }
    }
  }
  ```
- **Caching**: `max-age=60, s-maxage=60`
- **Rate limiting**: Applied via `withRateLimit(request, 'default')`

### `GET/POST /api/releases/check` (Human-Readable Check)

A richer endpoint for programmatic update checks (not used by the Tauri plugin directly).

- **POST body**: `{ "current_version": "1.1.5", "platform": "darwin-aarch64", "channel": "stable" }`
- **GET params**: `?version=1.1.5&platform=darwin-aarch64&channel=stable`
- **Response**: Includes `update_available`, `is_critical`, `download_url`, `release_notes`, `file_size_bytes`
- **Data source**: Supabase `releases` table first, GitHub Releases API fallback

### `GET /api/releases/latest/[platform]` (Manifest Endpoint)

Returns Tauri-compatible update manifest for a specific platform.

- **Data source**: Supabase DB (with channel support: stable/beta) -> GitHub fallback
- **Features**: Download analytics recording via `record_release_download` RPC, critical release flag headers
- **Caching**: `max-age=300, s-maxage=300` (5 minutes)

### `GET /api/download?platform=mac|windows|linux` (Installer Download)

Public download proxy for website download buttons.

- **Behavior**: Fetches latest release from GitHub, streams the installer binary with clean filenames
- **Fallback**: Static download URLs from environment variables
- **Rate limiting**: 30 requests/minute per IP
- **No auth required**: Intentionally public (security note documented in source)

## Rust Configuration

### Cargo Feature Flag

The updater is an optional Cargo feature, enabled by default:

```toml
# Cargo.toml
[features]
default = ["shell", "updater", "billing", "devtools", "vad", "remote-databases"]
updater = ["dep:tauri-plugin-updater"]

[dependencies]
tauri-plugin-updater = { version = "2.3.0", optional = true }
ed25519-dalek = { version = "2.1", features = ["pkcs8", "rand_core"] }
```

All updater code is gated with `#[cfg(feature = "updater")]`:
- Module declaration in `features/mod.rs`
- Plugin initialization in `lib.rs`
- All 5 Tauri command registrations in `lib.rs`

This allows App Store builds (where the store handles updates) to exclude the updater entirely.

### Plugin Initialization (`lib.rs`)

```rust
#[cfg(feature = "updater")]
{
    builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
}
```

### Tauri Configuration (`tauri.conf.json`)

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQxODAzNEI3NDk3MzIzODEKUldTQkkzTkp0elNBUVhkUzdsanZXek5CTGJqTkFVSUlWelJZa25ueWdnWktQZ0JwWjJjeVhsdlAK",
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

The public key is a base64-encoded minisign public key used by `tauri-plugin-updater` to verify downloaded binaries.

### Capabilities (`capabilities/default.json`)

```json
"updater:default",
"updater:allow-check",
"updater:allow-download",
"updater:allow-install",
"updater:allow-download-and-install"
```

### Tauri Commands (5 registered)

| Command | Function | Returns |
|---------|----------|---------|
| `check_for_updates` | Query endpoint, emit events | `UpdateCheckResult` (Available/UpToDate/Error) |
| `install_update` | Download + verify + install | `bool` (true = restart needed) |
| `install_update_and_restart` | Download + install + `app.restart()` | Never returns on success |
| `get_current_version` | Read `Cargo.toml` version | `String` |
| `get_version_info` | Version + name + Tauri version | `VersionInfo` |

### Security Manager (`sys/security/updater.rs`)

Provides defense-in-depth beyond `tauri-plugin-updater`'s built-in verification:

| Method | Purpose |
|--------|---------|
| `verify_update(file_path, metadata)` | SHA-256 checksum + Ed25519 signature verification |
| `compute_file_checksum(path)` | SHA-256 hash of downloaded file |
| `verify_signature(message, sig, pubkey)` | Ed25519 verification via `ed25519-dalek` |
| `validate_download_url(url)` | HTTPS-only, domain allowlist (`agiworkforce.com`, `releases.agiworkforce.com`, `github.com`) |
| `create_backup(source, backup)` | Backs up `agiworkforce.db`, `config.toml`, `settings.json` before update |
| `restore_backup(backup, target)` | Restores backed-up files after failed update |
| `should_update(current, new)` | Simple version inequality check |

### Tauri Events (Rust -> Frontend)

| Event | Payload Status | When |
|-------|----------------|------|
| `updater:checking` | `Checking` | Check started |
| `updater:available` | `Available` + `UpdateInfo` | Update found |
| `updater:not-available` | `Idle` | No update |
| `updater:downloading` | `Downloading` + `UpdateProgress` | Every 5% of download |
| `updater:downloaded` | `Downloaded` | Download complete |
| `updater:installing` | `Installing` | Install started |
| `updater:installed` | `PendingRestart` | Install complete |
| `updater:error` | `Error` + message | Any failure |

## Store Schema

### `updaterStore.ts` (Zustand + Persist + devtools + subscribeWithSelector)

```typescript
interface UpdaterState {
  // Transient state (not persisted)
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'up-to-date';
  updateInfo: UpdateInfo | null;           // { version, currentVersion, releaseNotes?, releaseDate?, mandatory? }
  downloadProgress: DownloadProgress | null; // { downloaded, total, percent }
  error: string | null;

  // Persisted preferences
  autoCheckEnabled: boolean;               // default: true
  checkIntervalHours: number;              // default: 24 (options: 1, 6, 12, 24, 168)

  // Persisted dismissal tracking
  lastCheckTime: number | null;            // epoch ms
  dismissedVersion: string | null;         // e.g., "1.2.0"
  dismissedAt: number | null;             // epoch ms (expires after 24h)

  // Hydration tracking
  _hasHydrated: boolean;
}
```

**Storage key**: `agiworkforce-updater` (localStorage)
**Store version**: `1`
**Partialize**: Only `autoCheckEnabled`, `checkIntervalHours`, `lastCheckTime`, `dismissedVersion`, `dismissedAt` are persisted.

### Exported Selectors

- `selectUpdateStatus`, `selectUpdateInfo`, `selectDownloadProgress`, `selectError`, `selectAutoCheckEnabled`

### Exported Utility Functions

- `isDismissalExpired(dismissedAt)` -- checks 24h expiry
- `shouldShowUpdateNotification(version, dismissedVersion, dismissedAt)` -- combines version comparison + expiry
- `waitForUpdaterHydration()` -- returns a Promise that resolves when persist middleware completes rehydration

## Component Tree

```
App.tsx
  |
  +-- UpdateChecker (invisible, always mounted)
  |     |-- useUpdater() hook
  |     |-- useUpdaterStore() for preferences
  |     |-- waitForUpdaterHydration() before first check
  |     |-- Shows toast with "Later" / "Update Now" buttons
  |     +-- Renders UpdateDialog when user clicks "Update Now"
  |
  +-- Settings
        |
        +-- GeneralSettings / SettingsPanel
              |
              +-- UpdateSettings
                    |-- Update Status Card (icon, title, description, progress bar)
                    |-- Action buttons (Check / Download & Install / Restart / Retry)
                    |-- Version info + last check timestamp
                    |-- Update Preferences Card
                    |     |-- Auto-check toggle (Switch)
                    |     +-- Check frequency selector (Select: 1h/6h/12h/24h/weekly)
                    +-- UpdateDialog (shown on "View Details")
```

### UpdateDialog

Full-featured modal with:
- Version comparison display (current -> new with arrow icon)
- Release date formatting
- Download progress bar with bytes counter
- Release notes rendered as Markdown (`react-markdown` + `remark-gfm`)
- Error state with retry button
- State-dependent footer buttons:
  - Default: "Remind Me Later" + "Download & Install"
  - Downloading: "Cancel"
  - Downloaded: "Later" + "Restart Now"
  - Error: "Close" + "Retry"
  - Installing: disabled "Cancel"

## CI/CD Pipeline

### `release-desktop.yml` (Primary)

**Trigger**: `push` to `v*` tags OR `workflow_dispatch` with version/channel/prerelease inputs.

**Jobs**:

1. **prepare-release**: Extract version, detect channel (stable/beta/nightly from version string), generate changelog from git log, create draft GitHub Release
2. **validate**: Lint + typecheck + test
3. **build-macos** (matrix: universal, aarch64, x86_64): `tauri-apps/tauri-action@v0.6.1` with Apple code signing
4. **build-windows** (x86_64): `tauri-apps/tauri-action@v0.6.1` with NSIS installer
5. **build-linux** (x86_64 on ubuntu-22.04): `tauri-apps/tauri-action@v0.6.1` with AppImage
6. **update-database**: Upserts release records to Supabase `releases` table via RPC with signatures and file sizes
7. **publish-release**: Marks the draft release as published
8. **cleanup-on-failure**: Deletes draft release if any build fails

**Signing**: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are GitHub Secrets, masked in logs. The signing key generates `.sig` files alongside each build artifact.

**Artifacts uploaded per platform**:
- macOS: `.dmg`, `.app.tar.gz`, `.app.tar.gz.sig`
- Windows: `.exe`, `.nsis.zip`, `.nsis.zip.sig`
- Linux: `.AppImage`, `.AppImage.tar.gz`, `.AppImage.tar.gz.sig`

### Release Channels

| Channel | Trigger | Pre-release Flag |
|---------|---------|-----------------|
| `stable` | `v1.2.0` tag | false |
| `beta` | `v1.2.0-beta.1` tag or manual | true |
| `nightly` | `v1.2.0-alpha.1` tag or manual | true |

The web API's `/api/releases/latest/[platform]` and `/api/releases/check` accept a `channel` query parameter (defaults to `stable`).

## Key Patterns

### Signature Verification (Two Layers)

1. **tauri-plugin-updater** (automatic): Verifies Ed25519 signatures using the public key embedded in `tauri.conf.json`. The `.sig` files are generated by `tauri-action` during CI using `TAURI_SIGNING_PRIVATE_KEY`.

2. **UpdateSecurityManager** (defense-in-depth): Additional SHA-256 checksum + Ed25519 verification layer in `sys/security/updater.rs`. Domain allowlist restricts download URLs to `agiworkforce.com`, `releases.agiworkforce.com`, and `github.com`.

### Data Source Fallback Chain

The web API has a consistent fallback pattern:
1. **Supabase `releases` table** (populated by CI `update-database` job)
2. **GitHub Releases API** (always available as long as repo exists)

This ensures updates work even if the database is down.

### Backup Before Update

`UpdateSecurityManager.create_backup()` copies critical files (`agiworkforce.db`, `config.toml`, `settings.json`) before applying an update. `restore_backup()` can recover them using `walkdir` recursive copy.

### Download Progress Throttling

The Rust `install_update` command throttles progress events to every 5% to avoid flooding the frontend event bus:
```rust
let current_percentage = percentage.map(|p| (p / 5.0).floor() as i32 * 5);
```

### Feature Flag Gating

All updater code is behind `#[cfg(feature = "updater")]`, allowing App Store builds (where Apple/Microsoft/Linux stores handle updates) to exclude the self-update mechanism entirely.

### Web/Non-Tauri Graceful Degradation

- `useUpdater()` checks `isTauri` before calling native APIs; in web mode it immediately sets status to `'up-to-date'`
- `tauri-mock.ts` provides `checkForUpdates()` and `relaunchApp()` stubs
- `apps/web/stores/unified/updaterStore.ts` is a no-op stub for SSR compilation

### Windows Install Mode

Windows uses `"installMode": "passive"` in `tauri.conf.json`, which means the NSIS installer runs without requiring full user interaction (shows progress but no wizard prompts).

## Platform Support

| Platform | Arch | Artifact | Tauri Target |
|----------|------|----------|-------------|
| macOS | Apple Silicon | `.app.tar.gz` + `.sig` | `aarch64-apple-darwin` |
| macOS | Intel | `.app.tar.gz` + `.sig` | `x86_64-apple-darwin` |
| macOS | Universal | `.app.tar.gz` + `.sig` | `universal-apple-darwin` |
| Windows | x64 | `.nsis.zip` + `.sig` | `x86_64-pc-windows-msvc` |
| Linux | x64 | `.AppImage.tar.gz` + `.sig` | `x86_64-unknown-linux-gnu` |

Valid platform identifiers for API calls: `darwin-aarch64`, `darwin-x86_64`, `darwin-universal`, `windows-x86_64`, `linux-x86_64`.

## Known Issues / Tech Debt

1. **`install_update` re-checks for update**: The `install_update` command calls `updater.check().await` again even though the frontend already confirmed availability. This is a consequence of `tauri-plugin-updater`'s API requiring an `Update` object from `check()` to call `download()`. Minor inefficiency (extra HTTP request).

2. **Dual event systems**: The frontend `useUpdater` hook listens on both legacy Tauri v1-style events (`tauri://update-download-progress`, `tauri://update-downloaded`, `tauri://update-error`) and uses the Tauri v2 `downloadAndInstall()` callback API. The legacy listeners may be dead code.

3. **`UpdateInfo` type mismatch between store and types**: The store's `UpdateInfo` has `currentVersion`, `releaseNotes`, `releaseDate`, `mandatory` fields, while `types/updater.ts` uses `body`, `date`, `download_url` (matching the Rust struct). The hook does the mapping, but there is no shared interface.

4. **No rollback mechanism wired to UI**: `UpdateSecurityManager` has `create_backup()` and `restore_backup()` methods, but they are not called from any Tauri command or the update flow. Backup/restore is available in code but not integrated into the actual update pipeline.

5. **Semver comparison duplication**: Semver parsing and comparison is implemented independently in three places: `[target]/[version]/route.ts`, `check/route.ts`, and `sys/security/updater.rs` (`should_update` uses simple string inequality). Should be consolidated.

6. **No delta updates**: Every update downloads the full binary. Tauri v2 does not natively support delta/differential updates. For large binaries this means ~100MB+ downloads on every update.

7. **Channel selection not exposed in UI**: The backend and API support `stable`/`beta`/`nightly` channels, but the frontend has no UI for users to opt into beta or nightly channels. The channel is always `stable`.

8. **Download analytics dependency on Supabase**: The `recordDownload()` function in the latest-platform route silently fails if Supabase is not configured. Download counts are best-effort.

9. **Windows code signing not configured**: The `tauri.conf.json` has `"certificateThumbprint": null` for Windows. NSIS installers are currently unsigned, which triggers SmartScreen warnings on Windows.

10. **macOS notarization secrets required**: The CI pipeline expects `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` secrets for notarization. Without these, macOS builds will trigger Gatekeeper warnings.
