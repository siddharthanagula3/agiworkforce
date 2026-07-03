# AGI Desktop — Volume 14 — Desktop Integrations

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: grounded in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/desktop/AGENTS.md`, and real repo paths: `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/Info.plist`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/ui/{tray.rs,window_menu.rs}`, `apps/desktop/src-tauri/src/sys/commands/{shortcuts.rs,notifications.rs,capture.rs}`, `apps/desktop/src-tauri/src/features/clipboard/monitor.rs`, `apps/desktop/src/features/chat/DragDropOverlay.tsx`, `apps/desktop/src/features/settings/AllowedDirectoriesSettings.tsx`, `packages/types/src/models.json`.

## Overview & stance

This volume specifies how AGI Desktop meets the host operating system: file/folder pickers, drag & drop, clipboard, global shortcuts, notifications, deep links and URL handling, share targets, recent files, context menus, file associations, dock/tray/menu-bar surfaces, and multiple windows. Desktop is the full-trust surface (Local + BYOK + Managed Cloud) and the suite's **local-private compute host**, so OS integrations are trust-boundary-sensitive: a file the OS hands us, a clipboard payload, or a deep link is **Local by default** and must never be silently routed to BYOK or Managed Cloud. Any Local→BYOK move is an explicit fork (context selection, secret scan, payload preview, visible provider label, consent). The stack is Tauri v2 (`src-tauri/` Rust) + React + Vite; every native capability here is a Tauri plugin or command, scoped by `capabilities/default.json`. Model IDs are never emitted by these integrations except through the catalog (`packages/types/src/models.json`).

### Native File Picker

✅ Built. `tauri-plugin-dialog` (`apps/desktop/src-tauri/Cargo.toml`) is registered in `lib.rs` and exposed to the frontend via `@tauri-apps/plugin-dialog`; `open`/`save` are used in `apps/desktop/src/features/settings/SettingsPanel.tsx` (export save dialog) and `blocking_pick_file()` in `src-tauri/src/sys/commands/mcp_extensions.rs`. Requirement: picked paths honor the `fs:allow-read-file` allow/deny scope in `capabilities/default.json` (denies `$HOME/.ssh`, `.aws`, keychains, etc.); picked files stay Local until an explicit transfer.

### Folder Picker

✅ Built. `open({ directory: true, multiple: false })` in `apps/desktop/src/features/settings/AllowedDirectoriesSettings.tsx` selects an allowed workspace directory. Requirement: a chosen folder is added to the allow-list and never auto-indexed into Cloud; folder grants are Local-scoped and revocable.

### Drag & Drop

🟡 Partial. Native OS drag-drop is deliberately disabled (`"dragDropEnabled": false` in `tauri.conf.json`); dropping is handled by an HTML5 DOM overlay `apps/desktop/src/features/chat/DragDropOverlay.tsx` (used by `features/chat/index.tsx`, `MemoryImport.tsx`, `ProjectSettingsDialog.tsx`). Gap: files arrive as browser `File` objects, not OS paths, so large-file and folder-tree drops are limited. Requirement: dropped content is treated as Local attachment input with type/size caps.

### Clipboard

✅ Built. `tauri-plugin-clipboard-manager` (registered in `lib.rs`) plus commands `automation_clipboard_get`/`automation_clipboard_set`, `capture_save_to_clipboard`, and `capture::capture_from_clipboard`; a clipboard watcher lives at `src-tauri/src/features/clipboard/monitor.rs`. Requirement: clipboard reads are user-initiated or consented; clipboard payloads are Local and must pass the secret scan before any BYOK/Cloud fork.

### Global Keyboard Shortcuts

✅ Built. `tauri-plugin-global-shortcut` is registered in `lib.rs`; `init_global_shortcuts` and `register_global_shortcut` live in `src-tauri/src/sys/commands/shortcuts.rs`, exposed via `shortcuts_register_global`/`shortcuts_unregister_global`. In-app menu accelerators (e.g. `CmdOrCtrl+N`, `CmdOrCtrl+F`) are defined in `src-tauri/src/ui/window_menu.rs`. Requirement: global hotkeys are user-configurable, conflict-checked, and never grant compute to a non-Local trust mode without the fork gate.

### System Notifications

✅ Built. `tauri-plugin-notification` powers OS notifications via `notification_show`/`notification_schedule`/`notification_show_with_actions`/`notification_request_permission` (`src-tauri/src/sys/commands/notifications.rs`), alongside an in-app center (`sys/commands/notification_center.rs`). Requirement: notifications state the originating trust mode where relevant and never leak Cloud/BYOK provider content into a Local session label.

### Deep Links

✅ Built. `tauri-plugin-deep-link` registers scheme `agiworkforce` in `tauri.conf.json` (`plugins.deep-link.desktop.schemes`) and `Info.plist` `CFBundleURLSchemes`. Gap (🟡): no single-instance plugin is registered, so second-instance link forwarding on Windows/Linux is unverified. Requirement: inbound links are validated and routed in-app only; a link must never auto-start a Cloud/BYOK run without consent.

### URL Handling

🟡 Partial. The `agiworkforce://` scheme is registered (above), but the in-app route mapping from URL → view/action is not verified in this pass. Requirement: define an allow-listed URL grammar (e.g. open chat, open settings pane), reject unknown hosts, and redact any query params before logging; remote-control pairing links are outbound-only and QR/HMAC-gated, not arbitrary deep links.

### Share Targets

🔭 Planned. No OS share-target/share-extension registration exists in `src-tauri/`. Design intent: register a macOS Share extension / Windows share target that hands content to a **Local** draft chat with an explicit provider selector before any BYOK/Cloud send.

### Recent Files

🔭 Planned. No recent-files store or OS recent-documents integration is present in the repo. Design intent: a Local-only recents list (respecting `capabilities/default.json` scope) surfaced in File menu and dock/jump-list, never synced (Local rows do not cross the Neon delta-sync boundary).

### Native Context Menus

🟡 Partial. Standard edit actions (`cut`/`copy`/`paste`/`select_all`/`undo`/`redo`) exist as `PredefinedMenuItem`s in `src-tauri/src/ui/window_menu.rs`; rich right-click context menus (e.g. message/artifact actions) are not yet wired as native Tauri menus. Requirement: context-menu actions respect the active trust mode and never expose a "send to Cloud" shortcut that bypasses the fork gate.

### File Associations

🟡 Partial. macOS declares `CFBundleDocumentTypes` for `.agiworkflow` (Editor role) in `Info.plist`; there is **no** cross-platform `fileAssociations` block in `tauri.conf.json` and the open-file handler is unverified. Requirement: associate AGI-owned document types only; opening an associated file loads it Locally, never auto-uploading.

### Dock Menu

🔭 Planned. No macOS dock menu (`NSApplication` dock tile menu) is implemented; only the tray menu exists (`ui/tray.rs`). Design intent: dock menu with New Conversation / recent items, mirroring tray actions.

### System Tray

✅ Built. `tauri` `tray-icon` feature is enabled (`Cargo.toml`) and `build_system_tray` in `src-tauri/src/ui/tray.rs` builds a tray with Show/Hide/New Conversation/Settings/Pin/Toggle Always-On-Top/Quit and click handlers. Requirement: tray remains functional headless; tray actions target the `main` window and never elevate trust mode.

### Menu Bar

✅ Built. `build_window_menu` in `src-tauri/src/ui/window_menu.rs` constructs the application menu (File/Edit/View submenus with accelerators). Requirement: menu items map to in-app commands only; provider/model choices come from the catalog, never hardcoded in menu labels.

### Multiple Windows

🟡 Partial. `tauri.conf.json` defines a single `main` window; `capabilities/default.json` grants `core:window:allow-create`; `tauri-plugin-window-state` persists geometry. No secondary-window creation path is wired (all code uses `get_webview_window("main")`). Requirement: any future secondary window inherits the parent session's trust mode and shows the same provider label; window state is Local.

## Repository map

- `apps/desktop/src-tauri/tauri.conf.json` — deep-link scheme, window config, `dragDropEnabled`, bundle.
- `apps/desktop/src-tauri/Cargo.toml` — dialog/fs/clipboard/notification/global-shortcut/deep-link/window-state plugins; `tray-icon` feature.
- `apps/desktop/src-tauri/capabilities/default.json` — window + `fs` allow/deny scope.
- `apps/desktop/src-tauri/Info.plist` — macOS URL schemes + document types.
- `apps/desktop/src-tauri/src/lib.rs` — plugin registration + IPC command handlers.
- `apps/desktop/src-tauri/src/ui/{tray.rs,window_menu.rs}` — tray + menu bar.
- `apps/desktop/src-tauri/src/sys/commands/{shortcuts.rs,notifications.rs,notification_center.rs,capture.rs}` — shortcut/notification/clipboard-capture commands.
- `apps/desktop/src-tauri/src/features/clipboard/monitor.rs` — clipboard watcher.
- `apps/desktop/src/features/chat/DragDropOverlay.tsx`, `apps/desktop/src/features/settings/{AllowedDirectoriesSettings.tsx,SettingsPanel.tsx}` — frontend pickers/drop.

## Competitor notes

Claude Desktop, ChatGPT desktop, and Codex integrate the OS narrowly around a single hosted provider: global hotkey, screenshot/clipboard capture, tray/menu bar, deep links into one cloud account. AGI's deliberate divergence: these same integrations are **trust-aware and multi-provider**. A picked file, clipboard payload, or dropped attachment stays **Local** until an explicit fork; BYOK is a first-class option here (Desktop only) with a visible provider label; Managed Cloud is opt-in per action, not the default sink. Desktop is also the local compute **host** for Chrome/VS Code bridges and the Mobile companion, so OS integrations must never become a silent side-channel that moves Local data to a non-Local mode.

## Acceptance / Definition of Done

Production-ready when every ✅ capability is covered by tests, every native entry point enforces the trust boundary, and 🟡/🔭 items are tracked with owners.

- [ ] Build: dialog, folder picker, clipboard, global shortcut, notification, tray, and menu-bar paths pass `pnpm --filter @agiworkforce/desktop test` and `cargo check -p agiworkforce-desktop`.
- [ ] Trust: no OS entry point (drop, paste, deep link, share, open-with) can start a BYOK/Cloud run without the explicit fork (context selection, secret scan, payload preview, provider label, consent); Local files/clipboard stay Local; nothing enters Neon delta-sync from these paths.
- [ ] Security: file/folder access stays within `capabilities/default.json` allow/deny scope; deep links validated against an allow-listed grammar; single-instance link forwarding resolved before shipping deep-link as GA.

## Anti-patterns

- Auto-routing a dropped/pasted/opened file or a deep link into BYOK or Managed Cloud without the fork gate.
- Widening `fs` scope past `capabilities/default.json` or reading denied paths (`.ssh`, `.aws`, keychains).
- Claiming Recent Files, Share Targets, Dock Menu, or multi-window as shipped — they are 🔭/🟡; cite the path and label.
- Hardcoding a model ID in a menu/tray/notification label instead of reading `packages/types/src/models.json`.
- Referencing Supabase, `middleware.ts`, removed tiers ("Plus"/`pro_plus`/"Hobby"), credit top-ups, or invented INR prices for Pro/Max.
- Syncing recent-files, window-state, or clipboard history across devices — these are Local, never delta-synced.
