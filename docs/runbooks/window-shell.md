# Window Shell Manual QA Runbook

This runbook captures the minimal manual steps we follow to validate the desktop window shell after changes to docking, persistence, or tray behaviour.

## Prerequisites
- Desktop app built in debug mode (`pnpm tauri dev`) or release build
- Dual-monitor setup (optional, but recommended to validate monitor persistence)
- Clean application state (`%LocalAppData%/agiworkforce` directory removed) to simulate first launch

## Test Matrix
| Scenario | DPI | Dock State | Expected Result |
|----------|-----|------------|-----------------|
| Fresh launch | 100% | Floating | Window appears centered (~420×720), focus ring active |
| Restore after pin toggle | 125% | Floating | Pin button toggles state, window stays in place |
| Dock to left monitor | 150% | Docked Left | Width clamps to 480px, height matches monitor, drag disabled |
| Dock to right monitor | 150% | Docked Right | Same behaviour mirrored right, status text updates |
| Undock via menu | 100% | Floating | Window returns to last floating geometry |
| Tray quick action | 100% | Floating | Tray “Show” brings window to front with focus |

## Step-by-Step Procedure
1. **Launch the application**
   - Confirm frameless window renders with gradient header and motion transitions.
   - Verify status label reads “Ready · Floating” and focus glow is visible.

2. **Pin and Always-On-Top toggles**
   - Toggle pin state via title bar and tray menu; check toast indicator in devtools logs.
   - Enable “Always on top” and confirm window stays above other applications.

3. **Docking interactions**
   - Drag window to left edge until magnet indicator triggers; release to dock.
   - Observe spring animation snapping window flush to monitor edge.
   - Repeat for right edge.
   - Use tray “Undock” entry to restore floating position; ensure previous geometry restored.

4. **Keyboard shortcuts**
   - Use `Ctrl+Alt+ArrowLeft / ArrowRight / ArrowDown` to dock and undock.
   - Confirm title bar motion smoothly adapts with no drag glitches.

5. **Tray menu & quick actions**
   - Use tray “Hide” then “Show” to verify visibility toggles.
   - Trigger “New Conversation” from tray; window should surface focused and sidebar should highlight new chat.
   - Trigger “Settings”; settings panel should open without affecting drag behaviour.

6. **Persistence validation**
   - Move floating window to secondary monitor and resize to minimum width.
   - Close to tray, quit from tray menu, relaunch application.
   - Confirm window restores on the same monitor with saved dimensions.

7. **Regression sweep**
   - Ensure context menu in title bar still opens and buttons remain clickable.
   - Verify system tray tooltip displays unread badge text (currently “AGI Workforce” or “AGI Workforce · X unread”).

Document test results (pass/fail, notes) in the companion QA log (`docs/qa/milestone2-dpi.md`) after each run.
