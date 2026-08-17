# Desktop Audit — Electron Shell + Shared Renderer (`apps/desktop`)

Scope: `apps/desktop/electron/**` (Electron main/preload/IPC), `electron-builder.yml`,
`apps/desktop/src/**` (the renderer shared across Tauri, Electron-bundled, and
cloud-web builds), `wiring-allowlist.json`/`check-wiring.sh`. Read-only inventory.
`apps/desktop/src-tauri/**` (desktop-native lane, 743 `.rs` files) was **not**
audited in depth — it belongs to a separate lane per `apps/desktop/AGENTS.md` —
but is referenced wherever the renderer's behavior depends on it.

Read first: `apps/desktop/AGENTS.md` (locked 2026-08-03/04 decision: "one Desktop
surface, two shells"), root `AGENTS.md`.

---

## 1. Electron vs. Tauri — the central architectural fact

**These are two independently-shipping desktop apps that install side by side,
sharing only a TypeScript source tree — not two windows onto one app.**

|                  | Tauri shell (`src-tauri/`)                            | Electron shell (`electron/`)                                                                                                                                                 |
| ---------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App ID           | `com.agiworkforce.desktop` ("AGI")                    | `com.agiworkforce.desktop.cloud` ("AGI Cloud") — electron-builder.yml:11-12                                                                                                  |
| Trust boundaries | Local + BYOK + Managed Cloud (all three)              | Managed Cloud **only**, permanently (AGENTS.md:47-49)                                                                                                                        |
| Default renderer | `apps/desktop/src` built native (WKWebView/ WebView2) | The **hosted web app** `https://agiworkforce.com/chat`, loaded top-level in Chromium — main.ts:14, main.ts:510                                                               |
| Deep-link scheme | `agiworkforce://`                                     | `agiworkforce-cloud://` — config.ts:42 (deliberately distinct so both installers coexist)                                                                                    |
| Release tags     | `v-desktop-*`                                         | `v-cloud-desktop-*` (electron-builder.yml:7-10, never mixed)                                                                                                                 |
| Auto-update      | `@tauri-apps/plugin-updater` (real feed)              | **No auto-update feed.** Manual "Download Installer" dialog only — main.ts:553-606, `desktopCloudUpdate.ts:1-8` explicitly documents "not an in-place electron-updater feed" |

**Critical, easy-to-miss consequence:** in its default configuration, the
Electron shell does **not** run `apps/desktop/src` at all — it is a thin
Chromium wrapper pointed at the same web app that ships to browsers
(`apps/web`). `apps/desktop/src` only becomes the Electron renderer when the
operator sets `AGI_CLOUD_RENDERER=bundled` (an "escape hatch" for webview/auth
failures — main.ts:11-16, config.ts:17-23). This is a founder-locked decision
(2026-08-04, AGENTS.md:36-43), not an oversight, and CHANGELOG.md:362-372
documents the same "Claude-desktop model" rationale. But it means:

- The renderer audit scope (`apps/desktop/src`) is the **Tauri app's
  renderer first**, and **only secondarily** an Electron-bundled fallback
  renderer, and is **not** what most Electron-shell users ever load.
- `apps/desktop/src/lib/tauri-electron/*` (8 files: core, window, deep-link,
  dialog, notification, process, shell, updater) exist purely to make that
  fallback renderer behave correctly when it _is_ used — replacing the web
  build's silent no-op Tauri stubs (dialogs that always answer "no", dead
  window controls, deep links that never fire) with real Electron IPC.
  `vite.config.ts:46-91` wires these in only for `VITE_BUILD_TARGET=electron`.
- Neither shell is abandoned. Both have live, recent commits (`git log`:
  Tauri touched as recently as the current HEAD; Electron shell added
  2026-08-04 per `1d2116c5b feat(desktop): cloud-only electron shell`, still
  touched in `1e858a7f1`). Tauri is the primary, feature-complete product
  (Local/BYOK/Managed, terminal, browser automation, MCP, computer-use,
  743 Rust files under `src-tauri/`); Electron is a deliberately thin,
  Managed-Cloud-only companion shell that piggybacks on the web app.

### Known, self-documented gaps in the Electron shell (CHANGELOG.md:399-405)

- Alpha ships on `WebRuntime` — "no server-side stop, quota surfaces, or
  history pagination — CloudRuntime promotion is required before GA."
- In-app auto-update deferred: the feed route
  `/api/releases/electron/mac/*` + electron-updater wiring do not exist.
- Ops has not yet allowlisted `agiworkforce-cloud://sso-callback` as a Clerk
  redirect URL — see §4 below, this makes the deep-link SSO path currently
  unusable even though the code exists.

### Documentation drift found

CHANGELOG.md:385 claims the packaged artifacts are "dmg+zip"; the live
`electron-builder.yml:39-41` and `.github/workflows/release-desktop-cloud.yml`
(`pnpm exec electron-builder --mac --arm64 --x64 --config electron-builder.yml`)
only configure a `dmg` target — no `zip`, no `publish` key (so no
electron-builder auto-update feed either). **NEEDS_VALIDATION** — minor stale
changelog claim, not a functional bug.

---

## 2. Electron IPC inventory (bidirectional)

All Electron-side IPC is defined once in
`src/lib/tauri-electron/bridgeContract.ts` and is intentionally small: 9
channels, all consumed only by the **bundled fallback renderer**.

### Channels registered in `electron/main.ts` (`registerIpcHandlers()`, called

only when `RENDERER_MODE === 'bundled'` — main.ts:634-637)

| Channel                     | Handler                                                    | Notes                                                                                                                                      |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `agi:invoke-bridge`         | main.ts:173-183 → `accountBridge.handleBridgeCommand`      | Validates `isTrustedSender` + command allowlist (`ELECTRON_BRIDGE_COMMANDS`)                                                               |
| `agi:open-external`         | main.ts:185-202                                            | Protocol-allowlisted (`https:`/`http:`/`mailto:` only)                                                                                     |
| `agi:window-control`        | main.ts:204-249                                            | minimize/maximize/unmaximize/toggleMaximize/isMaximized/close/show/hide/setFocus/setAlwaysOnTop/setTitle/startDragging (no-op, CSS-driven) |
| `agi:dialog`                | main.ts:251-295                                            | message/ask/confirm/open/save via native `dialog`                                                                                          |
| `agi:notify`                | main.ts:297-314                                            | Native `Notification`, click focuses main window                                                                                           |
| `agi:relaunch`              | main.ts:316-320                                            | `app.relaunch()` + `app.exit(0)`                                                                                                           |
| `agi:check-update`          | main.ts:322-325                                            | `checkDesktopCloudUpdate`                                                                                                                  |
| `agi:open-update-installer` | main.ts:327-330                                            | Opens signed DMG download URL externally                                                                                                   |
| `agi:deep-link`             | main.ts:342/498 (`webContents.send`, not `ipcMain.handle`) | One-way main→renderer push, see §4                                                                                                         |

Every `ipcMain.handle` above starts with `isTrustedSender(event)` — checks
`event.senderFrame === event.sender.mainFrame` and that the frame URL starts
with the pinned `agi://cloud` origin (main.ts:166-170). **COMPLETE / correctly
wired** — no unauthenticated handler found.

### Renderer-side callers (preload.ts + `src/lib/tauri-electron/*`)

`preload.ts:26-83` exposes exactly this contract as `window.agiHost` via
`contextBridge.exposeInMainWorld` — 1:1 match with the 8 invoke-style channels
plus `onDeepLink` (listener wrapper). No orphan preload exports, no orphan
main-process handlers. **Classification: COMPLETE (bidirectionally matched)**
for the bundled-renderer path.

**However:** `preload.ts` is only ever attached to a `BrowserWindow` in the
`!isRemote` branch of `webPreferences` (main.ts:477-483). The **default**
(`remote`) main window and the quick-ask panel both use
`partition: REMOTE_SESSION_PARTITION` with **no `preload` key at all**
(main.ts:478, quickAsk.ts:39-45). Consequence:

- `window.agiHost` is `undefined` in the default shipped configuration.
- Every one of the 9 channels above is **unreachable in the default
  (`AGI_CLOUD_RENDERER` unset) build** — they only fire when an operator sets
  `AGI_CLOUD_RENDERER=bundled`.
- This is intentional per the architecture (§1) and each Electron-only shim
  in `src/lib/tauri-electron/*` correctly feature-detects `agiHost` and
  degrades (dialog.ts:32-33, shell.ts:11-19, etc.) — so it is not a crash
  risk. But it means the entire preload/IPC surface documented above is
  **BACKEND_ONLY relative to the shipped default app** and only truly live
  when the fallback renderer is active. Classify the bridge as: **COMPLETE
  for `AGI_CLOUD_RENDERER=bundled`; DEAD-BY-DEFAULT for the primary shipped
  configuration.**

### Second-order finding: deep links registered but undeliverable in default mode

`deliverDeepLink()` (main.ts:336-346) is called unconditionally from
`app.on('open-url', …)` and `app.on('second-instance', …)` regardless of
`RENDERER_MODE`, and pushes via `mainWindow.webContents.send(ELECTRON_IPC_CHANNELS.deepLink, url)`.
In remote mode there is no preload script, so nothing on the page can ever
receive `ipcRenderer.on('agi:deep-link', …)` — `contextBridge` never runs, so
`window.agiHost.onDeepLink` (preload.ts:41-49) is never registered. Confirmed
this is intentional-by-design, not a bug: the default renderer authenticates
via the ordinary same-origin Clerk **cookie** session through the navigation
allowlist (`windowPolicy.ts:15-23`, Google/Microsoft/Apple/Clerk hosts do a
plain HTTPS redirect back to `agiworkforce.com`), and only the bundled
renderer's native SSO flow (`src/services/desktopSocialSignIn.ts:50-52`, gated
on `isElectronHost`) needs the `agiworkforce-cloud://sso-callback` deep link.
`app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)` (main.ts:616) is still
registered unconditionally, so the OS will hand the app any
`agiworkforce-cloud://` URL even in remote mode — where it is silently
dropped (window is refocused, URL discarded). **Classification: PARTIAL** —
correct/complete for the bundled path; present-but-inert plumbing for the
default path. Also note CHANGELOG.md:404 lists "allowlist
`agiworkforce-cloud://sso-callback` as a Clerk redirect URL" as an
**un-actioned ops TODO**, so even the bundled path's SSO return may not
resolve a `rotating_token_nonce` yet in production Clerk config —
**NEEDS_VALIDATION** against the live Clerk dashboard, not verifiable from
the repo alone.

### Tray menu refresh is unreachable

`electron/tray.ts:99-101` exports `refreshTrayMenu()` to rebuild the tray
context menu after a shortcut-accelerator change. **Nothing calls it** (only
`createTray` is called, once, at startup — main.ts:654). Combined with the
next finding, this is dead code kept for a feature (shortcut customization)
that has no way to trigger it.

### Shortcut customization is backend-only / unreachable

`electron/settingsStore.ts` persists `{ quickAskShortcut, screenshotShortcut }`
to `settings.json` via `saveSettings()`, and `garnishCore.ts` has full
validation/normalization logic for custom accelerators. `saveSettings` is
**never called anywhere** in `electron/` or `src/` (grep confirmed — the only
other `saveSettings` hits in the repo belong to the unrelated
`useSettingsStore` Zustand store). There is no IPC channel, no UI, and no
tray menu item to change these shortcuts — they are permanently
`DEFAULT_SHORTCUTS` (`Alt+Shift+Space`, `CommandOrControl+Shift+2`,
garnishCore.ts:17-23). **Classification: DEAD** — a real persistence/validation
layer exists with no caller anywhere in the app.

---

## 3. Electron security posture

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` on
  **every** BrowserWindow created (main window: main.ts:473-483; quick-ask
  panel: quickAsk.ts:39-44). No exceptions found. **COMPLETE / good.**
- CSP served on every bundled-mode HTML response (`RENDERER_CSP`,
  config.ts:63-77): `default-src 'self'`, `script-src 'self'` (no
  `unsafe-inline`/`unsafe-eval`), `object-src 'none'`, `frame-ancestors 'none'`.
- Permission model (`permissionPolicy.ts`) is origin-scoped
  (`isTrustedCloudRendererOrigin` — only `CLOUD_APP_ORIGIN` or the bundled
  `agi://cloud` origin) and media-subtype-aware: Electron's coarse `media`
  permission (which bundles camera+mic) is narrowed to audio-only, so a
  malicious/compromised page cannot silently get camera access even though
  the app has no camera feature (permissionPolicy.ts:39-63). Correctly
  mirrored between request-time and check-time handlers.
- `setDisplayMediaRequestHandler` requires `request.userGesture` and
  `isTrustedCloudRendererOrigin` before it will even enumerate screens
  (main.ts:368-401) — good gating, prevents a compromised iframe from probing
  the display list.
- Navigation is allowlisted (`windowPolicy.ts:15-49`); everything else opens
  in the OS browser via `shell.openExternal`, never as a child
  `BrowserWindow` (which would break OAuth's `disallowed_useragent` check).
  `setWindowOpenHandler` always returns `{ action: 'deny' }` and instead
  externally opens — popups can never become embedded windows.
- `isAllowedApiBaseUrl` (config.ts:45-60) blocks credentialed URLs
  (`username`/`password` in the URL) and non-`agiworkforce.com` HTTPS hosts,
  allows plain HTTP only for localhost — reasonable SSRF guard on the
  renderer-settable API base override used by `accountBridge.ts`.
- Secrets: `secretStore.ts` uses Electron `safeStorage` (Keychain-backed on
  macOS) and refuses to store a credential if OS encryption is unavailable
  (`setSecret` throws rather than silently storing plaintext —
  secretStore.ts:44-46). File written `mode: 0o600`.
- `clerkProxy.ts` (`executeClerkNativeRequest`) allowlists Clerk API paths by
  exact segment shape (`validateClerkPath`) and derives the FAPI host only
  from the publishable key with an explicit SSRF-style hostname character
  check (clerkProxy.ts:64-67) — cannot be redirected to an attacker host via
  request args.
- No `remote` module, no `enableRemoteModule`, no `webviewTag` seen anywhere
  in `electron/*.ts`.

**No security holes found in the Electron main/preload code reviewed.** This
is a comparatively small, carefully-scoped surface (12 non-test files,
~1,200 lines) and reads as deliberately minimal by design.

---

## 4. `electron-builder.yml` — packaging

`apps/desktop/electron-builder.yml` (56 lines):

- `appId: com.agiworkforce.desktop.cloud`, `productName: AGI Cloud` — distinct
  identity from the Tauri app so both can be installed simultaneously.
- **macOS only.** `mac:` block only; no `win`/`linux`/`nsis`/`appImage` keys
  anywhere in the file. Confirms this shell targets macOS exclusively today.
- Targets: `dmg`, arch `[arm64, x64]`, with an explicit
  `artifactName: ${productName}-${version}-${arch}.${ext}` (comment explains
  this avoids the default unmarked x64 filename breaking the download
  route's arch selection — real, load-bearing detail, not decoration).
- `hardenedRuntime: true`, `gatekeeperAssess: false`, custom entitlements
  (`electron/entitlements.mac.plist`) applied to both `entitlements` and
  `entitlementsInherit`. `notarize: true`.
- `NSMicrophoneUsageDescription` is declared in `extendInfo`, matching the
  audio-only media permission grant in §3 — consistent.
- **Protocol handler registered:** `agiworkforce-cloud` scheme, role Viewer
  — matches `DEEP_LINK_SCHEME` in config.ts:42 and `app.setAsDefaultProtocolClient`
  in main.ts:616.
- **No `publish:` key** → no electron-builder auto-update feed (GitHub
  Releases provider, generic provider, etc.). Consistent with §1's "manual
  installer, no in-place update" finding — not a gap relative to the
  documented design, just confirming it.
- `dmg: { sign: false }` — the DMG container itself is unsigned (only the
  `.app` inside is codesigned/notarized), which is normal electron-builder
  practice, not a defect.
- Signing/notarization secrets (`CSC_LINK`, `APPLE_API_KEY`, etc.) are
  supplied by `.github/workflows/release-desktop-cloud.yml`, not present in
  this file — correctly kept out of the repo.

---

## 5. Desktop-workspace capability checklist (Electron shell)

Per `apps/desktop/AGENTS.md`'s explicit, founder-locked contract, the
Electron shell must **never** gain Local/BYOK/filesystem/shell-exec/MCP —
verified this holds:

| Capability                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native window (min/max/close/drag)                            | **COMPLETE** for bundled mode via IPC; native OS chrome for default mode (deliberately no custom titlebar — main.ts:459-472 explains why `hiddenInset` was tried and reverted)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | main.ts:204-249, window.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Multiple windows/tabs                                         | **Two windows only**: main window + hidden/reused quick-ask panel. No tab strip, no "new window" command.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | quickAsk.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| System/menu-bar app menu                                      | **Absent.** No `Menu.setApplicationMenu` call anywhere in `electron/`. Electron's OS default menu applies; no custom Edit/View/Window items, no zoom/find menu items (contrast: Tauri's `window_menu.rs` wires these — out of scope but noted for parity purposes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | grep confirmed no hits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tray / menu-bar icon                                          | **COMPLETE.** Open/New Chat/Quick Ask/Screenshot/Check-for-Updates/Quit, template icon with 2x fallback and graceful empty-icon degrade if assets are missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | tray.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Global shortcut                                               | **COMPLETE but fixed.** Registers `Alt+Shift+Space` (Quick Ask) and `Cmd/Ctrl+Shift+2` (Screenshot) via `globalShortcut`; conflict is detected and surfaced via a one-time notification, with the tray menu as an always-available fallback. Not user-configurable (§2 dead settingsStore).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | shortcuts.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Quick-entry/Spotlight-style window                            | **COMPLETE (remote mode).** Frameless always-on-top panel, positioned Spotlight-style in the upper third, warm-started 5 s after boot, dismiss on blur/Escape, composer auto-focus via a DOM heuristic (last visible `textarea`/`contenteditable`). In bundled mode it degrades to just raising the main window (no second hosted page exists) — quickAsk.ts:108-115.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | quickAsk.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Screenshot / screen capture                                   | **COMPLETE.** Captures the display under the cursor via `desktopCapturer`, writes to clipboard, restores prior clipboard text after paste, explains the macOS TCC screen-recording permission once per launch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | screenshot.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Clipboard                                                     | **COMPLETE**, but only as a transport for the screenshot feature (no general clipboard IPC exposed to the renderer).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | screenshot.ts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Drag-drop                                                     | Not implemented in the main process — relies entirely on the loaded web page's own HTML5 drag-drop (no Electron-side file-drop handling found). **NEEDS_VALIDATION** whether `apps/web`'s composer supports OS file drop when embedded (out of this audit's file scope).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Desktop file & folder access                                  | **Absent by design** — confirmed no `fs`/file-dialog IPC beyond the generic native `open`/`save` path picker (`agi:dialog`), which the bundled renderer uses only for things like "choose an export path", not arbitrary filesystem read/write. Correctly excluded per AGENTS.md:47-49.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Launching local apps                                          | **Absent** — only `shell.openExternal` for `https/http/mailto`; no arbitrary app-launch IPC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Browser automation / computer use / terminal / code execution | **Absent, and actively refused.** `src/lib/tauri-electron/shell.ts:21-31`'s `Command.execute()` throws `'Shell commands are not available in the AGI cloud desktop app.'` rather than the web stub's fake `{code:0}` success — a deliberate honesty improvement over the browser fallback. Terminal/ActionRecorder/BrowserViewer components exist in the shared renderer (`src/features/terminal`, `src/features/automation`, `src/features/browser`) but are gated behind `privacyMode === 'local'` in `DesktopShellV3.tsx:942,810`, and `appModeStore.ts:52,65,72` force-coerces `mode` to `'cloud'` whenever `supportsLocalAppMode` is false — which it always is for the Electron build (`isTauri` false, `isDesktopUiDevLocal` requires a dev-only flag). **Verified: Local mode, and everything gated behind it, is unreachable in the Electron shell — the trust-boundary lock holds.** |
| Local agent runtime vs. cloud runtime selector                | `LocalCloudToggle.tsx` renders unconditionally in the shared sidebar and calls `appModeStore.setMode('local'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 'cloud')`; per the row above, selecting `'local'`inside the Electron-bundled renderer is silently coerced back to`'cloud'`by the store itself (not by hiding the toggle) — so the control is visible but its Local option is inert in this shell. **PARTIAL from a UX-honesty standpoint**: the toggle doesn't visibly disable/hide the Local segment when running under a shell that cannot honor it; it just no-ops the mode change. Not verified from static reading whether`setMode` surfaces a toast on refusal in this path specifically (LocalCloudToggle.tsx has no visible affordance change) — **NEEDS_VALIDATION** by running the bundled build. |
| Notifications                                                 | **COMPLETE via two paths**: native `Notification` API through `agi:notify` IPC (bundled mode only) **and** the standard Web Notifications API, which works unassisted in remote mode because `permissionPolicy.ts` grants the `notifications` permission to the trusted origin — so notifications function in the default shipped app even without the IPC bridge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Background tasks                                              | Not owned by the Electron main process; would be the hosted web app's own concern (out of file scope).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deep links                                                    | **PARTIAL** — see §2 finding; complete plumbing, unreachable receiver in the default renderer, and the Clerk-side redirect URL allowlisting is an open ops TODO per CHANGELOG.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Auto-update                                                   | **Manual only, honestly presented.** No in-place update; `checkForCloudUpdate()` shows a native dialog with a "Download Installer" button that opens the signed DMG in the OS browser (main.ts:558-606). Version comparison is a real, tested SemVer implementation (`desktopCloudUpdate.ts`), not a stub.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| OS-specific settings                                          | macOS-only shell; no Windows/Linux code paths exist to check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Crash recovery / session restore                              | **Not implemented at the Electron layer.** No window-bounds persistence (no `getBounds`/`setBounds` for the main window — only the quick-ask panel repositions itself per-summon), no crash reporter wiring, no restart-and-restore. Session restore for chat state itself is a renderer/web-app concern (out of file scope) — the shared renderer's `StartupRecoveryBootstrap` (`main.tsx:5-6,30`) exists for the **Tauri** encrypted-DB recovery path and is unrelated to the Electron shell (which has no local DB).                                                                                                                                                                                                                                                                                                                                                                        |

---

## 6. `apps/desktop/src` — the shared renderer

### Scale and shape

- 759 non-test `.ts`/`.tsx` files under `src/` (excludes `__tests__` and
  `.test.`/`.spec.` files).
- Entry chain: `main.tsx` → `StartupRecoveryBootstrap` (Tauri-only recovery
  gate) → lazy `NormalApplication` → `App.tsx` (2,251 lines — the single
  largest file in the surface, effectively the whole app's wiring/bootstrap)
  → `DesktopShellV3` (996 lines, the actual shell UI: sidebar, panels,
  composer host, terminal dock, artifact panel, account menu).
- `App.tsx` is saturated with `isTauri`/`isElectronHost` runtime branches
  (dozens of call sites — grepped) gating: native window-menu listeners,
  global-hotkey listeners, MCP bundle install listener, Ollama health
  monitor, managed-cloud provider bootstrap, window docking/centering,
  timeout-warning IPC events. This is the mechanism by which one renderer
  source tree serves three different runtime targets (Tauri / Electron
  bundled / cloud-web) — consistently applied everywhere it was checked, not
  spot-patched.

### Build targets (`vite.config.ts`)

Three real output targets share this one `src/` tree:

1. **Tauri** (default, no `VITE_BUILD_TARGET`) — native app, full
   Local/BYOK/Managed, `@tauri-apps/*` used directly.
2. **`VITE_BUILD_TARGET=web`** (`build:cloud`) — this **is `apps/web`'s own
   desktop-facing cloud-web build**, not the Electron shell; Tauri APIs
   replaced by `src/lib/tauri-web/*` silent-stub shims.
3. **`VITE_BUILD_TARGET=electron`** (`build:electron`) — the bundled Electron
   fallback; Tauri APIs replaced by the `src/lib/tauri-electron/*` shims
   audited in §2, everything else falls back to the same `tauri-web`/mock
   stack as target 2.

### Shared vs. duplicated with `apps/web`

- **Chat is genuinely shared**, not duplicated: both `apps/web/package.json`
  and `apps/desktop/package.json` depend on `@agiworkforce/unified-chat`
  (`packages/ui/unified-chat`), and `App.tsx:12-19` pulls
  `ChatHostBridge`, `useChatModelStore`, `useChatSettingsStore`,
  `useChatStore` straight from that package. Desktop's own
  `src/features/chat/` is now a thin, desktop-specific overlay layer only —
  8 files: `CommandPalette`, `SearchModal`, `McpToolConfirmationPrompt`,
  `FolderAccessConsentDialog`, `ProjectSettingsDialog`,
  `KeyboardShortcutsOverlay`, `BrandedGreeting`, `ToolLabel` — not a
  parallel chat/message-rendering implementation.
- **This was not always true.** `apps/desktop/archive/features/chat/` holds
  **204 files** of a superseded full chat UI (`MessageBubble/`, `Cards/`,
  `Sidecar/`, `Timeline/`, `Visualizations/`, `Widgets/`, `InlinePanels/`,
  `InlineToolResults/`, plus a full `archive/features/tool-calling/` tree).
  This is the "before" state of the migration to `@agiworkforce/unified-chat`.
  It sits as a sibling to `src/` (not inside it), is excluded from
  `tsconfig.json`'s `include` (`["src", "src/**/*.ts", ...]` — archive/ is
  simply outside the root), excluded from Vitest
  (`vite.config.ts:450-453`, with a comment explicitly calling it
  "Superseded... unreachable from main.tsx"), and grep confirmed **zero**
  imports of `archive/` from anywhere in `src/`. **Classification: DEAD (by
  design, intentionally archived)** — correctly isolated, not a live-code
  hazard, but 204 files of committed dead weight.
- Local/BYOK/Managed mode selection (`LocalCloudToggle`, `appModeStore`),
  the v3 shell (`DesktopShellV3`, `Sidebar`, `AgiWorkProjects`,
  `AgiWorkArtifacts`, `AgiWorkScheduled`), Terminal, ActionRecorder/browser
  automation, and MCP tooling are all desktop-only concerns with no `apps/web`
  equivalent (web has no Local mode) — these are correctly **not** shared, by
  necessity of the trust-boundary design, not oversight.

### `tsconfig.json` stale exclude

`tsconfig.json:19` excludes `src/features/experimental`, which **does not
exist** (`find` returned nothing). Harmless (excluding a non-existent path is
a no-op) but is a small piece of drift worth cleaning up.

---

## 7. `wiring-allowlist.json` / `check-wiring.sh` — what they enforce

**Important scope correction:** these two files audit the **Tauri** IPC
surface (`invoke('cmd')` in the renderer ↔ `#[tauri::command]` in
`src-tauri/`), **not** the Electron IPC surface from §2. `check-wiring.sh`
runs `apps/desktop/scripts/check-wiring.mjs`, which:

1. Parses the single `generate_handler![...]` registry in `src-tauri/src/lib.rs`.
2. Walks the **real import graph** from `apps/desktop/src/main.tsx` (plus
   `packages/client/desktop-command-client/src` and
   `packages/ui/unified-chat/src`) to find every `invoke(...)`/`command(...)`
   call site that is actually **reachable** from the app's entry point — not
   just lexically present anywhere in the tree. This reachability walk is the
   whole point: a prior lexical-only sweep let ~96 registered commands "pass"
   while being unreachable from the running app (referenced as incident
   "SIX-32").
3. Fails on: duplicate registrations, frontend calls with no Rust
   registration, Rust `#[tauri::command]` fns never added to
   `generate_handler!`, registered commands with no frontend caller at all
   (`registeredWithoutFrontend`), and registered+called-but-**unreachable**
   commands (`registeredWithoutReachableCaller`) — each of the last two
   categories can be waived only via a reasoned, non-generic (≥20 char)
   allowlist entry in `wiring-allowlist.json`.
4. Also enforces a HITL (human-in-the-loop) approval invariant: every tool
   listed in `.hitl-required-tools.yaml` must resolve to a handler function
   that actually calls `request_confirmation_simple`.

### What `wiring-allowlist.json` currently exempts

- **4 entries** under `registeredWithoutFrontendCaller` — commands with no
  `invoke()` call site anywhere: 1 is an agent-tool-executor entry point
  invoked directly by Rust (not the renderer) by design; 3
  (`llm_list_llamacpp_models`/`lmstudio`/`vllm`) are marked as reached
  through a "runtime-selected local model command table in
  `apps/desktop/src/App.tsx`" — **confirmed live** in the App.tsx excerpt
  read for this audit (App.tsx:944-950, the `catalogFetches` array literal
  that the reachability-walker's regex apparently can't statically resolve
  through).
- **~58 entries** under `registeredWithoutReachableCaller`, every single one
  tagged with the identical boilerplate reason: _"SIX-32 baseline: the only
  invoke() call sites for this command live in desktop modules that are
  unreachable from `apps/desktop/src/main.tsx`... Delete the command or route
  its feature tree from a mounted surface; this list may only shrink."_
  These span entire feature families that read as **fully-built but
  currently unmounted**: the generic `api_*` HTTP/OAuth/template client (13
  commands: `api_get`, `api_post_json`, `api_oauth_*`, `api_render_template`,
  etc.), a whole **undo/redo subsystem** (`undo_*`, `form_undo_*` — 13
  commands), a **task/scheduler subsystem** (`task_*`, `scheduler_get_*` — 9
  commands), **project-memory** (`get_project_memory_stats`,
  `clear_project_memories`, `delete_project_memory`,
  `update_memory_importance`), **coordination/approvals**
  (`coord_get_pending_approvals`, `coord_request_approval`,
  `coord_update_app_state`), **architectural-decision tracking**
  (`get_architectural_decisions`, `save_architectural_decision`,
  `get_coding_styles`, `save_coding_style`), and a **Lovable migration
  importer** (`migration_launch_lovable`, `migration_list_lovable_workflows`,
  `migration_test_lovable_connection`). This is the file's own
  self-classification, and the file's own comment says the list "may only
  shrink" — i.e., it is a tracked-debt ledger the team already knows about,
  not a new finding, but it is strong independent confirmation of the
  audit's core methodology: a large, coherent set of backend capabilities
  (Rust command + presumably real business logic) with **zero path from any
  mounted UI**. **Classification for all ~58: BACKEND_ONLY / DEAD (per the
  project's own gate), pre-existing and tracked, not newly discovered here.**
  Not independently re-verified item-by-item against `src-tauri` in this pass
  (out of lane per AGENTS.md), but the gate mechanism itself (the reachable-
  import-graph walk) is sound and its output is being read here at face
  value.
- The check also separately guards against **stale allowlist entries**
  (`staleAllowlist`, `staleReachabilityAllowlist`) — an entry that becomes
  reachable again must be removed or the check fails, so the allowlist can't
  silently rot in the other direction either.

---

## 8. Dead / duplicated / disconnected code and stale artifacts

| Item                                                                                         | Classification                                            | Evidence                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/archive/features/chat/` + `archive/features/tool-calling/` (204 files)         | DEAD (intentionally archived)                             | tsconfig/vite excludes, zero imports from `src/`                                                                                                                                                                                                                                |
| Electron `saveSettings()` / shortcut customization                                           | DEAD                                                      | No caller anywhere; §2                                                                                                                                                                                                                                                          |
| Electron `refreshTrayMenu()`                                                                 | DEAD                                                      | No caller anywhere; §2                                                                                                                                                                                                                                                          |
| Electron preload/IPC bridge (8 invoke channels)                                              | BACKEND_ONLY relative to the shipped default app          | Only live under `AGI_CLOUD_RENDERER=bundled`; §2                                                                                                                                                                                                                                |
| `agi:deep-link` push in remote mode                                                          | DEAD (no listener)                                        | §2                                                                                                                                                                                                                                                                              |
| `tsconfig.json` exclude of non-existent `src/features/experimental`                          | Harmless drift                                            | §6                                                                                                                                                                                                                                                                              |
| ~58 Tauri commands, self-tracked in `wiring-allowlist.json`                                  | BACKEND_ONLY / DEAD, pre-tracked                          | §7                                                                                                                                                                                                                                                                              |
| `apps/desktop/dist/`, `electron/dist/`, `release/mac*`, `.turbo`, `.cache`, `.vercel/output` | Build artifacts present in the working tree at audit time | `find` at start of session; these are conventional build output directories (not asserted to be committed to git — not checked against `.gitignore` in this pass) — **NEEDS_VALIDATION**: confirm these are gitignored, not accidentally tracked, before treating as a finding. |
| CHANGELOG "dmg+zip" claim vs. actual dmg-only config                                         | Minor doc drift                                           | §1/§4                                                                                                                                                                                                                                                                           |

Not independently re-verified: whether `apps/desktop/dist`, `release/`,
`.cache`, `.turbo` are `git`-tracked or merely present as local build output
in this working tree — `git status` at session start showed a clean tree on
`compliance/dpdp`, which is consistent with these being gitignored local
artifacts rather than committed stale build output, but this file audit did
not run `git ls-files` against those specific paths to confirm.

---

## 9. Summary classification table

| Capability / surface                                          | Classification                                                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Electron main-process IPC (bundled mode)                      | COMPLETE                                                                                                           |
| Electron main-process IPC (default/remote mode)               | BACKEND_ONLY (unreachable — no preload)                                                                            |
| Electron security posture (isolation/sandbox/CSP/permissions) | COMPLETE, no holes found                                                                                           |
| electron-builder packaging (mac, dmg, notarized)              | COMPLETE for what it claims; no Windows/Linux                                                                      |
| Electron auto-update                                          | Honest manual flow, COMPLETE for that scope; in-place update explicitly deferred                                   |
| Deep link (bundled mode)                                      | COMPLETE                                                                                                           |
| Deep link (default/remote mode)                               | PARTIAL / effectively DEAD receiver                                                                                |
| Quick Ask panel                                               | COMPLETE                                                                                                           |
| Screenshot-to-chat                                            | COMPLETE                                                                                                           |
| Tray + global shortcuts                                       | COMPLETE, but shortcuts are non-configurable (dead settings layer)                                                 |
| Local/BYOK/terminal/automation/computer-use in Electron shell | Correctly ABSENT / trust-boundary held                                                                             |
| Local↔Cloud toggle honesty inside Electron                    | PARTIAL (silently no-ops rather than hiding/disabling)                                                             |
| Shared renderer chat implementation                           | COMPLETE / genuinely shared via `@agiworkforce/unified-chat`, not duplicated                                       |
| Archived legacy chat UI                                       | DEAD, intentionally isolated                                                                                       |
| Tauri IPC wiring gate (`wiring-allowlist.json`)               | Sound mechanism; surfaces a large pre-tracked BACKEND_ONLY/DEAD command set                                        |
| Electron vs. Tauri relationship                               | Two live, separately-shipping, non-abandoned products sharing a TS source tree by convention, not a shared runtime |
