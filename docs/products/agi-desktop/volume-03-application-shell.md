# AGI Desktop — Volume 03 — Application Shell

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `apps/desktop/AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon). Grounded in real repo paths: `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/ui/{tray.rs,window_menu.rs,window/mod.rs}`, `apps/desktop/src/features/v3/{DesktopShellV3,Sidebar,EmptyChat,LocalCloudToggle,CodeModeHome}.tsx`, `apps/desktop/src/features/{updates,notifications}/`, `apps/desktop/src/App.tsx`.

## Overview & stance

This volume specifies the AGI Desktop **application shell**: the native window, chrome, sidebar, navigation, and OS-integration surfaces (tray, menu, dock, updates, notifications, deep links) that frame every session. AGI Desktop is the **full-trust surface**: Local + BYOK + Managed Cloud, each selectable with a correct, visible label. Desktop is also the suite's **local-private compute host** and native host (127.0.0.1 WS/IPC bridge for Chrome/VS Code, native-messaging host `com.agiworkforce.browser`, Desktop↔Mobile companion). The shell must make the active trust mode legible at all times and never silently route Local chats/files/sessions to BYOK or Cloud. Local→BYOK is an explicit fork (context selection, secret scan, payload preview, provider label, consent). The stack is Tauri v2 (Rust `src-tauri`) + React + Vite; the active shell is `DesktopShellV3`.

## Native Window

The main window is a single Tauri v2 webview: label `main`, title `AGI`, 1400×850 default, min 1000×700, resizable, centered, native decorations, opaque, shadowed, `dragDropEnabled: false`. Identifier `com.agiworkforce.desktop`; a strict CSP restricts `connect-src` to AGI/Stripe/signaling origins. **✅ Built** — `apps/desktop/src-tauri/tauri.conf.json`. Requirement: window config changes must preserve the CSP allowlist and min-size floor.

## Title Bar

Native OS title bar (`decorations: true`) rendered by the platform; the in-app "window chrome" row at the top of the sidebar shows the `AGI` wordmark and the collapse toggle. **✅ Built** — `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/features/v3/Sidebar.tsx`. A custom traffic-light/overlay title bar with inline session/trust chips is **🔭 Planned**.

## Sidebar — search, collapse, new chat, projects, artifacts, recents, account (UX Lock)

The sidebar is the shell's spine and is **UX-locked**: it expands to 240px / collapses to a 64px icon rail. Locked contents, top to bottom: window-chrome row (wordmark + collapse); **New chat** button; **Search** (⌘K); per-mode nav (Artifacts, Scheduled, Dispatch — Dispatch tagged Beta); a ChatGPT-style **Projects** folder section (max six visible, create-project affordance); **Recents** grouped by recency (Last hour / Today / Yesterday / Past week / Past month), pinned conversations floated to a no-cap top group, non-pinned capped at 30 with "Show all"; the `UpdatePill`; the **Local↔Cloud** toggle; and the account footer (avatar, name/email, plan display name, sign-in entry, settings gear). **✅ Built** — `apps/desktop/src/features/v3/Sidebar.tsx`. Requirement: the account footer must render the real plan name from `packages/types/src/billing-catalog.ts` reconciled to the canon ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) — the catalog still encodes legacy tiers, so any stale label is a **🟡** gap to flag, never invent.

## Navigation

Primary navigation is panel-based: `activePanel` switches between `chat`, `projects`, `artifacts`, `scheduled`, and `dispatch`; cloud/settings views forward through the host bridge (`onNavigateView`). New-chat routing scopes to a project when launched from a project row. **✅ Built** — `apps/desktop/src/features/v3/DesktopShellV3.tsx`. **AGI Code** exists (`apps/desktop/src/features/v3/CodeModeHome.tsx`, exported from `index.ts`) but is **not mounted** in the shell's panel switch — **🟡** (built component, no nav entry). Mounting AGI Code is design intent, not authorization to implement (serial-by-surface lock; Mobile is active).

## Multiple Windows

The config declares a single `main` window; there is no multi-window spawn path today. Detachable chat/artifact windows and a separate settings window are **🔭 Planned** — `apps/desktop/src-tauri/tauri.conf.json` (single-window baseline).

## Window Management

Window geometry is validated against the active monitor and restored on launch; `tauri-plugin-window-state` persists size/position. Edge **docking** (left/right) with a drag threshold and a `tile_right` helper that reserves screen space for the Chrome companion is implemented. **✅ Built** — `apps/desktop/src-tauri/src/ui/window/mod.rs`, `apps/desktop/src-tauri/Cargo.toml` (`tauri-plugin-window-state`). Requirement: restored geometry must clamp to visible monitor bounds and the min-size floor.

## Menu Bar

A native application menu provides File (Close Window) and Edit (undo/redo/cut/copy/paste via predefined items). **✅ Built** — `apps/desktop/src-tauri/src/ui/window_menu.rs`. A full menu (New Chat, Settings, trust-mode switch, Check for Updates) wired to shell actions is **🔭 Planned**.

## System Tray

A tray icon (feature `tray-icon`) toggles window show/hide on click and emits menu events `tray:new_conversation` and `tray:open_settings` into the main window. **✅ Built** — `apps/desktop/src-tauri/src/ui/tray.rs`, `apps/desktop/src-tauri/Cargo.toml`. Requirement: tray actions must respect the current trust mode (a tray "new chat" inherits the active Local/Cloud selection, never silently escalates).

## Dock Integration

The macOS bundle places AGI in the Dock by default via the app bundle config. A custom Dock menu, unread badge, and activation-policy control are **🔭 Planned** — no `set_activation_policy`/`set_badge` implementation exists in `apps/desktop/src-tauri/src/`.

## Status Indicators

Trust-mode legibility is the priority indicator: the **Local↔Cloud** toggle (`apps/desktop/src/features/v3/LocalCloudToggle.tsx`) and the plan badge in the sidebar footer are **✅ Built**; the chat provenance footer surfaces the resolved provider/model label (`showProvenanceFooter` in `DesktopShellV3.tsx`). Realtime presence primitives exist in `apps/desktop/src-tauri/src/integrations/realtime/presence.rs` (**🟡** — not surfaced as a shell status pill). Requirement: BYOK and Managed-Cloud sessions must show a distinct visible provider label; a Local session must never display a cloud label.

## Auto Updates

Signed auto-update via `tauri-plugin-updater`: endpoint `https://www.agiworkforce.com/api/releases/{{target}}/{{current_version}}`, minisign pubkey pinned, Windows passive install. UI: `UpdateChecker`, `UpdateDialog`, `UpdatePill`, `useUpdater`. **✅ Built** — `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/features/updates/`. Requirement: never disable signature verification; the pinned pubkey is the trust anchor.

## Notifications

OS notifications via `tauri-plugin-notification` with commands `notification_show`, `notification_cancel`, `notification_cancel_all` and an in-app `NotificationCenter`. **✅ Built** — `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/features/notifications/NotificationCenter.tsx`. Requirement: companion/remote-control approval prompts route through this path and must be approval-gated.

## Deep Links

The `agiworkforce` URL scheme is registered (config + `tauri_plugin_deep_link::init()` in `lib.rs`). **🟡 Partial** — the scheme is declared and the plugin loaded, but no `on_open_url` runtime handler routes an inbound link to a shell panel/conversation. Requirement: deep-link routing must be trust-aware (an inbound link cannot silently open a Cloud session for a Local user without consent). — `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/src/lib.rs`.

## Empty States

The chat panel renders a dedicated empty state via `EmptyChat` passed as `emptyStateSlot`. **✅ Built** — `apps/desktop/src/features/v3/EmptyChat.tsx`, `DesktopShellV3.tsx`. Per the Mobile-home simplicity rule mirrored here, the new-chat empty state stays simple (no starter/suggestion cards).

## Loading States

The V3 shell is code-split and mounted through React `lazy`/Suspense in `App.tsx`. **🟡 Partial** — a Suspense boundary exists (`apps/desktop/src/App.tsx`), but per-panel skeleton/loading states for Projects/Artifacts/Scheduled/Dispatch are **🔭 Planned**.

## Repository map

- `apps/desktop/src/features/v3/` — `DesktopShellV3.tsx`, `Sidebar.tsx`, `EmptyChat.tsx`, `CapModal.tsx`, `LocalCloudToggle.tsx`, `AccountMenu.tsx`, `AgiWork{Projects,Artifacts,Scheduled,Dispatch}.tsx`, `CodeModeHome.tsx` (unmounted).
- `apps/desktop/src/features/updates/`, `apps/desktop/src/features/notifications/`.
- `apps/desktop/src/features/mobile-companion/`, `apps/desktop/src/features/experimental/MobileCompanionPanel.tsx` (companion panel commented out of `src/features/chat/index.tsx`).
- `apps/desktop/src/App.tsx` — shell mount.
- `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`.
- `apps/desktop/src-tauri/src/ui/{tray.rs,window_menu.rs,window/mod.rs}`.
- `apps/desktop/src-tauri/src/integrations/realtime/` — bridge/companion fabric that status indicators reflect.

## Competitor notes

Claude Desktop, ChatGPT Desktop, and Codex ship polished single-provider shells with tray/menu/auto-update and cloud-first sessions. AGI's deliberate divergence: the shell is **trust-mode-aware** and **multi-provider** — Local, BYOK (Desktop only, never Web/Mobile), and Managed Cloud are all selectable with a visible label, and Desktop is the **local-private compute host** for the whole suite (127.0.0.1 bridge, native messaging, companion), not just a chat window. Where competitors default everything to their cloud, AGI defaults chats to local storage and requires an explicit, redacted fork to cross into BYOK or Cloud.

## Acceptance / Definition of Done

Production-ready when: the shell renders with the active trust mode always visible; Local sessions never display or route to a cloud label; the sidebar UX-lock is intact; updates are signature-verified; and every capability in this volume carries a correct ✅/🟡/🔭 label with a real path.

- [ ] Build: `pnpm --filter @agiworkforce/desktop typecheck` and `cargo check -p agiworkforce-desktop` pass; window restores within monitor bounds and min-size floor.
- [ ] Trust: Local↔Cloud toggle, provenance footer, and plan badge show correct labels; no silent Local→BYOK/Cloud routing; deep links are trust-gated.
- [ ] Security: updater signature verification enabled with the pinned pubkey; tray/notification/companion actions are approval-gated; CSP allowlist unchanged.

## Anti-patterns

- Showing a cloud/provider label on a Local session, or letting a tray/deep-link action silently escalate trust mode.
- Claiming AGI Code, multiple windows, Dock badges, or deep-link routing are shipped — they are 🟡/🔭.
- Hardcoding or inventing model IDs (read only from `packages/types/src/models.json`), routes, env vars, or command names.
- Referencing removed tiers (Plus, `pro_plus`, Hobby), credit top-ups, or inventing Pro/Max INR prices.
- Any Supabase reference (fully migrated to Clerk + Neon + Stripe) or renaming Next.js `proxy.ts` back to `middleware.ts`.
- Disabling updater signature verification or weakening the CSP `connect-src` allowlist.
