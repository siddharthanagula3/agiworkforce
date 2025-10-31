# Milestone 2 – Core UI Shell

## Current State Snapshot
- Frameless shell, window persistence, docking, and always-on-top toggles are implemented (see `window/mod.rs`, `state.rs`, and `useWindowManager.ts`).
- Custom title bar, sidebar layout, and Tailwind-based design system are live (`TitleBar.tsx`, `Sidebar.tsx`, `components/ui`).
- System tray now includes quick actions for show/hide, pinning, docking, new conversation, and settings (`src-tauri/src/tray.rs` + `useTrayQuickActions.ts`).

## Deliverable Checklist
1. **Tray quick actions** ✅  
   - Added “New Conversation” and “Settings” entries, bridged to React handlers.  
   - Introduced unread badge bridge (`tray_set_unread_badge`) with placeholder count updates.
2. **Title bar motion polish** ✅  
   - Applied Framer Motion transitions for docking/undocking with drag-region safe styling.  
   - Status copy animates between floating/docked states without disrupting dragging.
3. **Visual QA** ✅  
   - DPI sweep recorded at 100%/125%/150% (`docs/qa/milestone2-dpi.md`).  
   - Manual runbook captured in `docs/runbooks/window-shell.md`.
4. **Testing & docs** ✅  
   - Added Vitest smoke test (`src/__tests__/useTrayQuickActions.test.ts`) covering tray events and badge updates.  
   - Documentation added per runbook and QA log.

All Milestone 2 outstanding items are complete; future work should move to Milestone 3.
