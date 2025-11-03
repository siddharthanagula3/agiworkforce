# Milestone 5 – Windows Automation MCP

## Current Progress Snapshot
- UI Automation service already exposes window discovery, invoke, value, toggle, and focus helpers via `automation_list_windows`, `automation_find_elements`, etc. (`apps/desktop/src-tauri/src/automation/uia/mod.rs:1`).
- Input simulation (keyboard, mouse, clipboard) ships through dedicated simulators using Win32 `SendInput` (`apps/desktop/src-tauri/src/automation/input`).
- Screen capture and OCR hooks are wired into the capture commands using the `screenshots` crate and optional Tesseract feature (`apps/desktop/src-tauri/src/commands/capture.rs:1`).
- Overlay pipeline now persists and emits click/type/region/flash events to the frontend (`apps/desktop/src-tauri/src/overlay`).
- React visualization layer renders click ripples, typing caret, region highlight, and screenshot flash (`apps/desktop/src/components/Overlay`).

## Deliverable Checklist
1. **UI Automation Integration**
   - Element search & runtime caching ✅ (`UIAutomationService::find_elements`).
   - Pattern helpers for Invoke/Value/Toggle/Text ✅ (shared through `uia::mod.rs`).
   - Todo: extract helpers into dedicated `element_tree.rs` / `patterns.rs` modules for clarity.
2. **Input Simulation** ✅ – Keyboard, mouse, clipboard simulators implemented with Win32 APIs.
3. **Screen Capture & OCR** ✅ – Full/region capture, thumbnail generation, and OCR hooks in place.
4. **Overlay Visualization** ✅
   - Backend dispatcher & persistence ✅ (`overlay::dispatch_overlay_animation`).
   - Frontend canvas effects ✅ (`VisualizationLayer`, `ActionOverlay`, `ScreenshotOverlay`).
   - Multi-monitor coordinate normalization ✅ (`overlay::window`, `overlay::renderer`).
5. **Backend Commands** ✅
   - Click, type, clipboard, screen capture, and OCR commands emit overlay events + capture artifacts.
   - Overlay replay and automation OCR helpers exposed to frontend (`automation_screenshot`, `automation_ocr`, `overlay_replay_recent`).
6. **Acceptance Criteria** – Initial automated click/type flows visualised via overlay; Notepad E2E scenario pending manual validation on Windows host.

## Next Steps
- Expand UIA helpers into dedicated modules (element tree/actions) for long-term maintainability.
- Complete Windows multi-monitor manual validation pass (Notepad E2E) and capture any calibration feedback.
- Add integration tests covering click/type flows once Windows CI or a manual test matrix is available.
