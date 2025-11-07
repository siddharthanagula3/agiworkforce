# Window Management and Window State - Code Summary

## Overview

The AGI Workforce desktop application has a comprehensive window management system built on Tauri 2.0 with both Rust backend state management and React/TypeScript frontend controls.

## 1. Window Configuration (Tauri Init)

**File:** `apps/desktop/src-tauri/tauri.conf.json`

Initial Settings:

- Window size: 420x680
- Min width: 360px, Max width: 480px
- Min height: 520px, Max height: 840px
- Decorations: false (custom title bar)
- Transparent: true
- Always on top: false (default)
- Shadow: true

## 2. Rust Backend State Management

**File:** `apps/desktop/src-tauri/src/state.rs`

Core Structures:

- DockPosition enum: Left | Right
- WindowGeometry: x, y, width, height
- PersistentWindowState: pinned, always_on_top, dock, geometry, previous_geometry

Key Methods:

- `AppState::load()` - Loads state from window_state.json
- `snapshot()` - Returns current state
- `update()` - Updates state with persistence
- `suppress_events()` - Prevents feedback loops

Persistence: `{app_config_dir}/window_state.json`

## 3. Rust Window Module

**File:** `apps/desktop/src-tauri/src/window/mod.rs`

Constants:

- WINDOW_MIN_WIDTH: 360px
- WINDOW_MAX_WIDTH: 480px
- DOCK_THRESHOLD: 32px

Core Functions:

- `set_pinned()` - Update pinned state, emit event
- `set_always_on_top()` - Set Tauri property, update state
- `show_window() / hide_window()` - Visibility control
- `initialize_window()` - App startup setup
- `apply_dock()` - Position window at screen edge
- `undock()` - Restore previous position

Event Handlers:

- Focused - Updates focus state
- Moved - Detects dock, auto-docks at 32px threshold
- Resized - Clamps width, updates state
- CloseRequested - Prevents close, hides window instead

## 4. Tauri Commands (RPC)

**File:** `apps/desktop/src-tauri/src/commands/window.rs`

Commands:

- `window_get_state()` - Return current state
- `window_set_pinned()` - Set pinned flag
- `window_set_always_on_top()` - Set always-on-top flag
- `window_set_visibility()` - Show/hide window
- `window_dock()` - Dock/undock window

## 5. TypeScript Frontend

**File:** `apps/desktop/src/hooks/useWindowManager.ts`

Hook API:

```typescript
interface WindowActions {
  refresh();
  setPinned(value);
  togglePinned();
  setAlwaysOnTop(value);
  toggleAlwaysOnTop();
  dock(position);
  minimize(); // Uses Tauri API
  toggleMaximize(); // Uses Tauri API
  hide();
  show();
}
```

Event Listeners:

- `window://state` - Backend state changes
- `window://focus` - Focus changes
- `window://dock-preview` - Dock preview during drag

Keyboard Shortcuts:

- Ctrl+Alt+ArrowLeft - Dock left
- Ctrl+Alt+ArrowRight - Dock right
- Ctrl+Alt+ArrowUp/Down - Undock

## 6. Title Bar Component

**File:** `apps/desktop/src/components/Layout/TitleBar.tsx`

Window Controls:

1. Pin button - Toggle pinned state
2. Search button - Open command palette
3. Always-on-top button - Toggle flag
4. Menu (···) - Dropdown with dock options
5. Minimize button (-) - Minimize window
6. Maximize button (□) - Toggle maximize
7. Close button (×) - Hide to tray

Features:

- Drag region for window dragging
- Visual feedback (focus state, dock state)
- Animated transitions with Framer Motion

## 7. Existing Maximize/Minimize Functionality

Both use Tauri API directly:

- `minimize(): window.minimize()`
- `toggleMaximize(): window.toggleMaximize()`

Not persisted to app state (handled by Tauri/OS).
Buttons available in TitleBar despite disabled decorations.

## 8. Key Design Patterns

- Arc<RwLock<>> for thread-safe shared state
- Event suppression to prevent feedback loops
- Monitor-aware positioning (multi-monitor support)
- Smart docking: auto snap-to-dock at 32px threshold
- Bidirectional sync: Backend state + Tauri properties
- Layered architecture: Commands → Window → AppState → Persistence

## 9. File Locations

| Component            | Path                                              |
| -------------------- | ------------------------------------------------- |
| Window Configuration | `apps/desktop/src-tauri/tauri.conf.json`          |
| Rust State           | `apps/desktop/src-tauri/src/state.rs`             |
| Window Module        | `apps/desktop/src-tauri/src/window/mod.rs`        |
| Window Commands      | `apps/desktop/src-tauri/src/commands/window.rs`   |
| Main Setup           | `apps/desktop/src-tauri/src/main.rs`              |
| TypeScript Hook      | `apps/desktop/src/hooks/useWindowManager.ts`      |
| Title Bar UI         | `apps/desktop/src/components/Layout/TitleBar.tsx` |
| App Integration      | `apps/desktop/src/App.tsx`                        |
