# AGI Desktop — Volume 21 — Native Platform Integration

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon);
`apps/desktop/AGENTS.md`; and the real repo paths cited in the Repository map below.

## Overview & stance

AGI Desktop is the full-trust surface — Local + BYOK + Managed Cloud, each selectable with a
correct, visible provider label — and the suite's local-private compute host. Native platform
integration is where that stance meets the OS: window chrome, menus, tray, notifications, deep
links, file types, and login behavior. The binding rule: OS-level entry points (a deep link, an
opened file, a notification action, a tray "New Conversation") must never _silently_ route a Local
chat, file, or session into BYOK or Managed Cloud. Any such handoff is an explicit fork (context
selection, secret scan, payload preview, provider label, consent). Compute stays on the host;
Remote Control windows are outbound-only and approval-gated. Stack: Tauri v2 (`src-tauri/` Rust) +
React + Vite.

## Windows

Windows packaging is defined in `tauri.conf.json` `bundle.windows`: NSIS installer
(`installMode: currentUser`) and WiX (`en-US`), SHA-256 digest, DigiCert timestamp URL; the
updater runs `passive` install. The system tray falls back to the default window icon on Windows
(`#[cfg(windows)]` branch in `src/ui/tray.rs`), and the tray tooltip is capped at 128 chars for the
Credential Manager limit. The Chrome native-messaging host registers under the Windows local data
dir with per-browser manifests (`src/integrations/native_messaging/manifest.rs`). ✅ Built —
`tauri.conf.json`, `src/ui/tray.rs`, `manifest.rs`. Code-signing provisioning for the NSIS/WiX
artifacts is an ops task — 🟡 (no Windows signing identity is committed).

## macOS

macOS is the most hardened target. `Info.plist` declares the `agiworkforce` URL scheme
(`CFBundleURLTypes`), the `.agiworkflow` document type (`CFBundleDocumentTypes`), all privacy
usage strings (camera, microphone, accessibility, Apple Events, screen capture, folders), and an
App Transport Security exception limited to loopback (`127.0.0.1`, `localhost`, `[::1]`) so Local
providers like Ollama / LM Studio work without weakening ATS globally.
`entitlements.plist` plus `tauri.conf.json` `bundle.macOS` carry the Developer ID Application
signing identity and provider short name. The native-messaging host is staged into
`~/Library/Application Support/com.agiworkforce.desktop/` and linked into each browser's
`NativeMessagingHosts` directory (`manifest.rs` macOS branch). ✅ Built — `Info.plist`,
`entitlements.plist`, `manifest.rs`. Notarization/stapling is an ops gate — 🟡.

## Linux

`tauri.conf.json` `bundle.targets: "all"`, so Linux artifacts (AppImage/deb) build from the same
config. The native-messaging host installs into `~/.config/{google-chrome,chromium,microsoft-edge}/
NativeMessagingHosts` (`manifest.rs` Linux branch). Secret storage targets the Secret Service via
the `keyring` crate (`Cargo.toml`). 🟡 Partial — Linux builds exist but per-distro polish is thin:
no Linux tray icon fallback (only the `#[cfg(windows)]` branch in `tray.rs`), no `.desktop`/MIME
registration for `.agiworkflow`, and no committed Wayland-vs-X11 tray packaging.

## Native APIs

Native OS access flows through Tauri v2 plugins registered in `src/lib.rs` and scoped by
`capabilities/default.json`: filesystem (`tauri-plugin-fs`, with allow-lists for
`$DOCUMENT`/`$DOWNLOAD`/`$APPDATA`/`$HOME/.agiworkforce` and _deny_ for `$HOME/.ssh`, `$HOME/.aws`),
dialog, clipboard-manager, shell, process, global-shortcut, deep-link, window-state, updater, and
stronghold (`Cargo.toml`). Secret material (BYOK keys, tokens) is
handled by `src/sys/security/secret_manager.rs` using machine-derived encryption
(`machine_key.rs`, `storage.rs`) to avoid repeated keychain prompts; the `keyring` crate remains a
dependency for OS-keychain paths. ✅ Built for the plugin/permission surface. 🟡 — the stated
"keys in OS keychains" stance is only partially realized: the primary path is machine-derived
encryption, not the OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret
Service), a tracked reconciliation gap.

## Window Management

`src/ui/window/mod.rs` owns geometry: `initialize_window` restores validated saved geometry
(bounded to the active monitor), `tauri-plugin-window-state` persists position/size across
launches, and `apply_dock`/`undock` implement edge-docking (left/right, 480 px max), `set_pinned`,
`set_always_on_top`, a floating companion window, and `auto_tile_for_browser`. Window controls are
permitted via `core:window:allow-*` in `capabilities/default.json`. ✅ Built —
`src/ui/window/mod.rs`, `capabilities/default.json`.

## File Associations

The `agiworkforce://` deep-link scheme is declared in `tauri.conf.json`
(`plugins.deep-link.desktop.schemes`) and `Info.plist` (`CFBundleURLTypes`), with
`tauri-plugin-deep-link` registered in `src/lib.rs`; the `.agiworkflow` file type is declared in
`Info.plist` `CFBundleDocumentTypes`. 🟡 Partial — the macOS document type is declared, but there
is no cross-platform `bundle.fileAssociations` block, no Linux MIME/`.desktop` registration, no
single-instance guard (an opened file/URL may spawn a second instance), and no confirmed open-file
handler routing the payload to a chat with the correct trust label. Opened files default to Local
and are never auto-forwarded to BYOK/Cloud.

## Context Menus

The native menu bar is built in `src/ui/window_menu.rs` with App (Settings, Hide/Show-All, Quit),
File (New Conversation ⌘N, Close), Edit (predefined undo/redo/cut/copy/paste/select-all + Find),
View (Reload, Zoom, Fullscreen), and Help submenus. The tray also carries a context menu
(`src/ui/tray.rs`). ✅ Built — `src/ui/window_menu.rs`, `src/ui/tray.rs`. In-webview right-click
context menus (message/artifact actions) are React-owned and 🔭 Planned for this volume.

## Auto Start

🔭 Planned. There is no `tauri-plugin-autostart` / login-item integration in `Cargo.toml` or
`src/lib.rs`. `settings.rs` exposes `startup_position` and `dock_on_startup`, but those control
_window placement at launch_, not launch-at-login. A future implementation must be opt-in, in the
locked Settings IA, and must not silently start Cloud sessions on boot.

## Dock Integration

🟡 Partial. The macOS Dock icon ships via the bundle icon set, and notification settings expose a
`badge_enabled` flag (`src/sys/commands/notification_center.rs`). But the badge writer
`tray_set_unread_badge` in `src/sys/commands/tray.rs` is an explicit placeholder (logs and returns
`Ok(())`) — it sets no real Dock/taskbar badge. The window-level "dock" (`apply_dock`) is
screen-edge docking, not OS Dock integration. Gaps: no `set_badge`/overlay-icon call, no
activation-policy control, no Dock right-click menu.

## System Tray

✅ Built — `src/ui/tray.rs` (via `build_system_tray` in `src/lib.rs`). The tray exposes a full
menu (Show, Hide, New Conversation, Settings, Pin/Unpin, Toggle Always On Top, Quit), a left-click
show/hide toggle bound to the main window, and a tooltip; menu events re-emit to the webview
(`tray:new_conversation`, `tray:open_settings`). The unread-badge overlay is the 🟡 gap noted
under Dock Integration.

## Native Notifications

✅ Built — `tauri-plugin-notification` is registered in `src/lib.rs`, backed by
`src/sys/commands/notifications.rs` (permission check/request, show, cancel, scheduled reminders,
actions) and an in-app center in `src/sys/commands/notification_center.rs` (list, mark-read,
sound/badge settings). 🟡 gap: `badge_enabled` does not yet drive a real Dock/taskbar badge (see
Dock Integration). Notifications referencing a chat must carry the originating trust label and must
not deep-link a Local chat into a Cloud view without consent.

## Repository map

- `apps/desktop/src-tauri/tauri.conf.json` — bundle targets, Windows NSIS/WiX, macOS signing, deep-link scheme, updater.
- `apps/desktop/src-tauri/Info.plist`, `entitlements.plist` — macOS URL scheme, document types, privacy strings, ATS.
- `apps/desktop/src-tauri/Cargo.toml` — Tauri v2 plugin + `keyring` dependencies.
- `apps/desktop/src-tauri/capabilities/default.json` — window/fs/event permission scoping.
- `apps/desktop/src-tauri/src/lib.rs` — plugin registration, tray/menu/notification/shortcut wiring.
- `apps/desktop/src-tauri/src/ui/{tray.rs,window_menu.rs,window/mod.rs}` — tray, native menu bar, window management.
- `apps/desktop/src-tauri/src/sys/commands/{tray.rs,notifications.rs,notification_center.rs,shortcuts.rs}` — badge/notification/shortcut commands.

- `apps/desktop/src-tauri/src/integrations/native_messaging/manifest.rs` — per-OS native-host registration.
- `apps/desktop/src-tauri/src/sys/security/{secret_manager.rs,machine_key.rs,storage.rs}` — secret storage.

## Competitor notes

Claude Desktop, ChatGPT Desktop, and Codex ship polished tray/menu/notification/deep-link stacks
tied to a single first-party cloud account. AGI's divergence: native integration is
**trust-mode aware** and **local-first**. Every OS entry point respects the three-mode boundary,
Local is the default for opened files and deep links, BYOK is Desktop-only with explicit fork
consent, and the desktop is the _host_ for the Chrome and VS Code extensions via the
native-messaging bridge — competitors expose no such local-host fabric. Model choice is
multi-provider (IDs sourced only from `packages/contracts/types/src/models.json`), never a single vendor.

## Acceptance / Definition of Done

A native-integration feature is production-ready only when the OS surface works on all shipped
platforms, respects the trust boundary, and cites a real path — no faked capability, no silent routing.

- [ ] Build: app packages and launches on macOS, Windows, and Linux from `tauri.conf.json`; tray, native menu, window-state restore, and notifications work on each.
- [ ] Trust: deep links, opened files, tray actions, and notification actions default to Local and never auto-route to BYOK/Cloud; any handoff shows the fork (context selection, secret scan, payload preview, provider label, consent).
- [ ] Security: fs allow/deny lists hold (`.ssh`/`.aws` denied); secrets go through `secret_manager.rs`; native-host manifests write only to the correct per-OS paths; Dock-badge and file-association gaps are closed or tracked as 🟡.

## Anti-patterns

- Routing a Local chat/file/session into BYOK or Cloud from a deep link, opened file, tray item, or notification without the explicit fork + consent.
- Claiming Dock badge, Auto Start, or cross-platform file associations as shipped (they are 🟡/🔭); describing placeholders (`tray_set_unread_badge`) as working.
- Hardcoding or inventing model IDs; they come only from `packages/contracts/types/src/models.json`.
- Referencing removed tiers ("Plus", `pro_plus`, "Hobby") or inventing INR prices; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise; no top-ups.
- Any Supabase reference; auth/DB/billing is Clerk + Neon + Stripe.
- Widening the fs allow-list or ATS exceptions beyond loopback, or writing native-host manifests outside the per-OS paths in `manifest.rs`; renaming Next.js `proxy.ts` back to `middleware.ts`.
