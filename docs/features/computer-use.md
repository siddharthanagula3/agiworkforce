# Sub-Feature: Computer Use

> Autonomous desktop control via an Observe-Plan-Act loop: the AI captures screenshots, reasons about UI state with a vision LLM, and executes mouse/keyboard actions to complete tasks without human intervention.

## Where It Lives

| Layer | Path(s) |
|-------|---------|
| OPA Loop | `apps/desktop/src-tauri/src/automation/computer_use/observe_plan_act.rs` |
| Visual Reasoner | `apps/desktop/src-tauri/src/automation/computer_use/visual_reasoner.rs` |
| Safety Layer | `apps/desktop/src-tauri/src/automation/computer_use/safety.rs` |
| Session Management | `apps/desktop/src-tauri/src/automation/computer_use/session.rs` |
| Core Types | `apps/desktop/src-tauri/src/automation/computer_use/types.rs` |
| Window Manager | `apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs` |
| Zoom Module | `apps/desktop/src-tauri/src/automation/computer_use/zoom.rs` |
| Module Root | `apps/desktop/src-tauri/src/automation/computer_use/mod.rs` |
| Tests | `apps/desktop/src-tauri/src/automation/computer_use/tests.rs` |
| Tauri Commands | `apps/desktop/src-tauri/src/sys/commands/computer_use.rs` |
| Capture Commands | `apps/desktop/src-tauri/src/sys/commands/capture.rs` |
| OCR Commands | `apps/desktop/src-tauri/src/sys/commands/ocr.rs` |
| Screen Capture | `apps/desktop/src-tauri/src/automation/screen/` (capture.rs, dxgi.rs, ocr.rs) |
| Input Simulation | `apps/desktop/src-tauri/src/automation/input/` (mouse.rs, keyboard.rs, clipboard.rs) |
| Zustand Store | `apps/desktop/src/stores/computerUseStore.ts` |
| Monitor Component | `apps/desktop/src/components/ComputerUse/ComputerUseMonitor.tsx` |
| Screen Preview | `apps/desktop/src/components/ComputerUse/ScreenPreview.tsx` |
| Action Log | `apps/desktop/src/components/ComputerUse/ActionLog.tsx` |
| Barrel Export | `apps/desktop/src/components/ComputerUse/index.ts` |
| DB Migrations | `apps/desktop/src-tauri/src/data/db/migrations.rs` (migration v31) |
| Tool Filter | `apps/desktop/src-tauri/src/sys/commands/chat/tools.rs` |
| Sidecar Mount | `apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx` |
| Inline Results | `apps/desktop/src/components/UnifiedAgenticChat/InlineToolResults/index.ts` |
| Settings Toggle | `apps/desktop/src/components/Settings/FeaturesPrivacySettings.tsx` |

## Architecture Overview

The Computer Use feature implements Anthropic-style autonomous desktop control through a four-phase **Observe-Plan-Act-Verify** loop:

```
┌──────────────────────────────────────────────────────┐
│                ComputerUseAgent                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              OPA Loop (max 100 iterations)       │ │
│  │                                                  │ │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐    │ │
│  │  │ OBSERVE  │──>│  PLAN    │──>│  ACT     │    │ │
│  │  │          │   │          │   │          │    │ │
│  │  │ Visual   │   │ Vision   │   │ Mouse/   │    │ │
│  │  │ Reasoner │   │ LLM Call │   │ Keyboard │    │ │
│  │  │ + Screen │   │ (Sonnet) │   │ Simulator│    │ │
│  │  │ Capture  │   │          │   │          │    │ │
│  │  └────┬─────┘   └──────────┘   └────┬─────┘    │ │
│  │       │                              │          │ │
│  │       │   ┌──────────────────┐       │          │ │
│  │       └───│  SAFETY LAYER   │───────┘          │ │
│  │           │ (per-action)    │                   │ │
│  │           └──────┬──────────┘                   │ │
│  │                  │                              │ │
│  │           ┌──────▼──────────┐                   │ │
│  │           │ SESSION MANAGER │                   │ │
│  │           │ (screenshots,   │                   │ │
│  │           │  undo, events)  │                   │ │
│  │           └─────────────────┘                   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────┐  ┌─────────────────────────┐│
│  │ Window Coordinator  │  │ Zoom Module             ││
│  │ (focus, launch,     │  │ (region capture +       ││
│  │  enumerate)         │  │  magnification)         ││
│  └─────────────────────┘  └─────────────────────────┘│
└──────────────────────────────────────────────────────┘
         │                            │
    ┌────▼────┐                 ┌─────▼──────┐
    │ Tauri   │  invoke()       │ Frontend   │
    │ Commands│◄────────────────│ Store +    │
    │ (IPC)   │────────────────>│ Components │
    │         │  events         │            │
    └─────────┘                 └────────────┘
```

**Data flow**: User describes a task in natural language --> `ComputerUseAgent::execute_task()` enters the OPA loop --> `VisualReasoner` captures and analyzes the screen via vision LLM --> LLM returns an `ActionPlan` (1-5 actions) --> safety layer validates each action --> `execute_action()` drives mouse/keyboard via `enigo` --> session records before/after screenshots --> loop repeats until task complete, timeout, or cancellation.

## Observe Phase

### Screen Capture Pipeline

The observe phase captures the current screen state and analyzes it using a vision-capable LLM.

**Capture layer** (`automation/screen/capture.rs`):
- `capture_primary_screen()` -> `CapturedImage { pixels: RgbaImage, screen_index, display }`
- `capture_region(x, y, width, height)` -> `CapturedRegion`
- `capture_window(hwnd)` -> captured via window handle
- Uses `xcap` crate (cross-platform), with macOS falling back to native `screencapture` CLI
- macOS captures hide the main window first via `WindowRestoreGuard` (RAII pattern in `sys/commands/capture.rs`) to avoid capturing the app itself

**Visual Reasoner** (`computer_use/visual_reasoner.rs`):

The `VisualReasoner` struct wraps an `LLMRouter` and performs:

1. **Screenshot capture** via `capture_primary_screen()`
2. **Image preparation** -- downscales to max 1920px dimension, encodes as PNG, then base64
3. **Vision LLM analysis** -- sends the screenshot with a structured prompt to `claude-sonnet-4-5` requesting JSON output with:
   - Detected UI elements (type, label, bounds as percentages, interactivity, focus state, confidence)
   - Active window, modal detection, loading state, error messages
4. **JSON parsing** -- converts percentage-based bounds to absolute pixel coordinates via `percent_to_pixels()`
5. **Caching** -- 2-second cache duration to avoid redundant captures during rapid iterations

Key types:
- `ScreenObservation { screenshot, analysis, image_base64, timestamp }`
- `ScreenAnalysis { elements, text_regions, screen_description, active_window, has_modal, is_loading, error_messages }`
- `ScreenElement { id, element_type, label, bounds, confidence, is_interactive, is_focused }`

Additional capabilities:
- `find_element(description)` -- asks the vision LLM to locate a specific element by natural language description
- `find_text(text)` -- locates specific text on screen, returns `ElementBounds`
- `detect_changes(before, after)` -- pixel-diff comparison (samples every 4th pixel, >0.5% change is significant)
- `wait_for_stable(timeout)` -- polls every 200ms until screen stops changing

**Configuration** (`VisualReasonerConfig`):
```rust
vision_timeout: 30s
max_image_dimension: 1920
image_quality: 85 (JPEG quality, though PNG is actually used)
use_ocr: true
element_confidence_threshold: 0.7
enable_caching: true
cache_duration: 2s
```

### OCR Pipeline

OCR is behind the `ocr` feature flag, using Tesseract:

- `ocr_process_image` -- full image OCR with word-level bounding boxes (TSV extraction)
- `ocr_process_region` -- crops image first, then OCR
- `ocr_process_with_boxes` -- OCR with optional preprocessing (Gaussian blur + contrast stretch)
- `ocr_detect_languages` -- probes 4 languages (eng, spa, fra, deu) to find best match
- `ocr_process_multi_language` -- auto-detects language, then OCR with detected language
- Supports 13 languages: English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Chinese (Simplified/Traditional), Korean, Arabic, Hindi

When the `ocr` feature is disabled, all OCR commands return a user-friendly error message.

## Plan Phase

Planning happens in `ComputerUseAgent::plan_next_actions()`:

1. **Prompt construction** (`create_planning_prompt`) builds a detailed prompt containing:
   - The task description
   - History of actions taken so far
   - Current screen description, active window, modal/loading state
   - Success indicators (if provided by the task)
   - Available action vocabulary (click, type, hotkey, scroll, drag, wait, focus_window, zoom)

2. **Vision LLM call** -- sends prompt + screenshot to `claude-sonnet-4-5` (hardcoded provider preference) with:
   - `temperature: 0.2` (low for consistent planning)
   - `max_tokens: 2048`
   - `requires_vision: true` router context
   - 30-second timeout

3. **Response parsing** (`parse_action_plan`) extracts JSON with:
   - `task_complete: bool` -- whether the task is done
   - `making_progress: bool` -- whether the agent is stuck
   - `actions: [...]` -- 1-5 action objects (capped at 5 per iteration)
   - `reasoning: string` -- explanation for debugging

4. **Action parsing** (`parse_action`) converts JSON action objects into typed `ComputerUseAction` enum variants. Supports all 20+ action types including the `zoom` action for detailed region inspection.

## Act Phase

### Action Types

The `ComputerUseAction` enum defines 20 action variants:

| Action | Description | Estimated Duration |
|--------|-------------|-------------------|
| `Click { x, y, button }` | Single click (left/right/middle) | 50ms |
| `DoubleClick { x, y }` | Double-click | 100ms |
| `TripleClick { x, y }` | Triple-click (select line/paragraph) | 150ms |
| `RightClick { x, y }` | Right-click context menu | 50ms |
| `Type { text, delay_ms }` | Character-by-character typing | `len * delay + 50`ms |
| `KeyPress { key }` | Single key press/release | 30ms |
| `Hotkey { modifiers, key }` | Keyboard shortcut (e.g., Ctrl+C) | 50ms |
| `Scroll { direction, amount, at }` | Mouse wheel scroll (up/down/left/right) | 100ms |
| `Drag { from, to, duration_ms }` | Drag and drop | `duration + 50`ms |
| `MoveMouse { x, y, smooth }` | Move cursor (instant or smooth) | 10-200ms |
| `Wait { condition }` | Wait for condition (duration, text, stable screen, window) | variable |
| `Screenshot { region, save_path }` | Capture screenshot | 200ms |
| `FocusWindow { title }` | Activate window by title | 100ms |
| `LaunchApplication { name }` | Open application | 2000ms |
| `Copy` | Cmd/Ctrl+C | 50ms |
| `Paste` | Cmd/Ctrl+V | 50ms |
| `SelectAll` | Cmd/Ctrl+A | 50ms |
| `Undo` | Cmd/Ctrl+Z | 50ms |
| `Redo` | Cmd/Ctrl+Shift+Z (mac) or Ctrl+Y | 50ms |
| `Zoom { region, zoom_level, capture }` | Zoom into region for inspection | 300ms |

### Input Simulation

**Mouse** (`automation/input/mouse.rs`) via `enigo` crate:
- `MouseSimulator` wraps `Enigo` for cross-platform mouse control
- `click(x, y, button)` -- move + click at absolute coordinates
- `double_click(x, y)` -- two clicks with delay
- `move_to(x, y)` / `move_to_smooth(x, y, duration)` -- instant or animated movement
- `drag_and_drop(from_x, from_y, to_x, to_y, duration)` -- press, move, release
- `scroll(amount)` -- mouse wheel

**Keyboard** (`automation/input/keyboard.rs`) via `enigo` crate:
- `KeyboardSimulator` wraps `Enigo`
- `send_text_with_delay(text, delay_ms)` -- types text character by character
- `tap_key(key)` -- press and release a single key
- `send_hotkey(modifiers, key)` -- hold modifiers, press key, release all

**Key parsing**: The `parse_key()` method in `ComputerUseAgent` maps string key names to `enigo::Key` variants: Enter, Tab, Space, Backspace, Delete, Escape, arrow keys, Home/End, PageUp/Down, F1-F12, and single Unicode characters.

**Platform-aware shortcuts**: Copy/Paste/SelectAll/Undo/Redo use `Meta` on macOS, `Ctrl` on Windows/Linux (via `#[cfg(target_os)]`).

### Zoom for Detailed Inspection

The zoom module (`computer_use/zoom.rs`) enables magnified capture of small UI regions:

- **Zoom levels**: X2 (2x), X4 (4x), X8 (8x), Custom(1.0-16.0)
- **Interpolation methods**: Nearest, Bilinear (default), Lanczos3, CatmullRom
- **`zoom_region(action)`** -- captures a screen region and scales it, returns base64 PNG
- **`zoom_around_point(x, y, context_size, zoom_level)`** -- creates a square region centered on a coordinate
- **`suggest_zoom_level(width, height)`** -- auto-selects zoom based on element size:
  - 0-10px -> X8, 11-25px -> X4, 26+px -> X2
- Output size capped at 7680x4320 (8K) to prevent memory issues

The zoom action is available to the LLM during planning. When the agent encounters elements too small to identify accurately, it can request a zoom action to get a magnified view for the next observation cycle.

## Session Management

`ComputerUseSession` tracks the full lifecycle of a computer use task:

### Session Lifecycle
```
                  start()
                    │
                    ▼
┌─────────────────────────────────────┐
│            RUNNING                   │
│  ┌─────────────────────────────┐    │
│  │ action loop:                 │    │
│  │  capture_before(action)      │    │
│  │  [execute action]            │    │
│  │  record_action(...)          │    │
│  │  update_progress(...)        │    │
│  └─────────────────────────────┘    │
│                                      │
│  Can transition to:                  │
│  - pause(reason, action)  ──────────┼──> PAUSED ──> resume() ──> RUNNING
│  - cancel()               ──────────┼──> CANCELLED
│  - complete(outcome)      ──────────┼──> COMPLETED
└─────────────────────────────────────┘
```

### Screenshot Management

Each action can have before/after screenshots:

```rust
SessionConfig {
    max_screenshots_in_memory: 50,
    persist_screenshots: true,
    screenshot_dir: $TMPDIR/agiworkforce_computer_use/,
    max_action_history: 1000,
    capture_before_action: true,
    capture_after_action: true,
}
```

Screenshots are stored as `ScreenshotRef`:
- `InMemory(Arc<RgbaImage>)` -- kept when under the memory cap
- `OnDisk(PathBuf)` -- persisted as PNG files named `{session_id}_{before|after}_{action_index}.png`

### Undo Support

Undo is tracked via `ActionSnapshot` (before/after screenshot pairs). `can_undo()` returns true if the last action has a before screenshot. The `UndoAction` struct indicates whether undo is available and why not if unavailable.

### Session Manager

`SessionManager` manages multiple concurrent sessions via `Arc<Mutex<HashMap<String, ComputerUseSession>>>`:
- `create_session(task)` -- returns session ID
- `get_session(id)` -- returns locked guard
- `remove_session(id)` -- removes and returns session
- `list_sessions()` -- returns all session IDs
- `cleanup_completed()` -- removes ended sessions and deletes their screenshot files

### Database Persistence

Migration v31 creates two tables:

```sql
computer_use_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_description TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL,        -- 'running', 'completed', 'cancelled', 'failed'
    actions_taken INTEGER DEFAULT 0
)

computer_use_actions (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,    -- FK -> computer_use_sessions
    action_type TEXT NOT NULL,
    action_data TEXT NOT NULL,   -- JSON-serialized action details
    screenshot_path TEXT,
    timestamp INTEGER NOT NULL,
    success INTEGER DEFAULT 1
)
```

Indexes: `(user_id, started_at DESC)`, `(session_id, timestamp)`, partial index on `status = 'running'`.

## Rust Commands (IPC)

### Computer Use Commands

Defined in `sys/commands/computer_use.rs`. **Only 5 of 11 are registered in `lib.rs`** (see Known Issue #14):

| Command | Params | Returns | Description | Registered? |
|---------|--------|---------|-------------|-------------|
| `computer_use_start_session` | -- | `String` (session ID) | Creates new session, sets as current | Yes |
| `computer_use_capture_screen` | -- | `ScreenCapture { image_data, width, height, timestamp }` | Captures primary monitor as base64 PNG | Yes |
| `computer_use_click` | `x: i32, y: i32` | `()` | Clicks at absolute coordinates via `enigo` | Yes |
| `computer_use_move_mouse` | `x: i32, y: i32` | `()` | Moves cursor to absolute coordinates | Yes |
| `computer_use_zoom_region` | `request: ZoomRegionRequest` | `ZoomRegionResponse` | Captures + magnifies a screen region | Yes |
| `computer_use_zoom_at_point` | `x, y, contextSize?, zoomLevel?` | `ZoomRegionResponse` | Zoom centered on a point (default 100px context, 4x zoom) | **No** |
| `computer_use_suggest_zoom_level` | `width: u32, height: u32` | `f32` | Returns recommended zoom factor | **No** |
| `computer_use_execute_tool` | `toolName: String, args: JSON` | `JSON` | Dispatches to screenshot/click/type/move/zoom/zoom_at_point | **No** |
| `computer_use_type_text` | `text: String` | `()` | Types text via `enigo` | **No** |
| `computer_use_get_session` | `sessionId: String` | `ComputerUseSession` | Returns session by ID | **No** |
| `computer_use_list_sessions` | -- | `Vec<ComputerUseSession>` | Returns all sessions | **No** |

### Capture Commands

Defined in `sys/commands/capture.rs`:

| Command | Description |
|---------|-------------|
| `capture_screen_full` | Full-screen capture, persists to `captures/` dir, stores in DB |
| `capture_screen_region` | Captures specified region (x, y, width, height) |
| `capture_screen_window` | Captures a specific window by handle |
| `capture_from_clipboard` | Captures image from system clipboard |
| `capture_get_windows` | Enumerates all visible windows with bounds |
| `capture_get_history` | Queries capture history from DB (with optional conversation filter) |
| `capture_delete` | Deletes capture from DB + disk |
| `capture_save_to_clipboard` | Copies a stored capture to system clipboard |

### OCR Commands (feature-gated: `ocr`)

| Command | Description |
|---------|-------------|
| `ocr_process_image` | Full image OCR with word bounding boxes |
| `ocr_process_region` | OCR on a cropped region |
| `ocr_get_languages` | Lists 13 supported languages |
| `ocr_get_result` | Retrieves stored OCR result by capture ID |
| `ocr_process_with_boxes` | OCR with optional preprocessing |
| `ocr_detect_languages` | Auto-detect language in image |
| `ocr_process_multi_language` | Auto-detect + OCR with best language |
| `ocr_preprocess_image` | Preprocessing only (blur + contrast stretch) |

### Tool Capability Gating

In `sys/commands/chat/tools.rs`, tools prefixed with `computer_use_`, `browser_`, or `ui_` are filtered based on `capabilities.computer_use`. If the model or user config does not have computer use enabled, these tools are not offered to the LLM.

## Store Schema

`computerUseStore.ts` -- Zustand store with Immer + Devtools:

```typescript
interface ComputerUseState {
  // State
  isActive: boolean;              // Whether a session is running
  sessionId: string | null;       // Current session UUID
  currentScreenshot: string | null; // Base64 PNG of latest capture
  screenWidth: number | null;     // Screen resolution width
  screenHeight: number | null;    // Screen resolution height
  actionLog: ComputerAction[];    // Chronological action history
  error: string | null;           // Last error message

  // Actions
  startSession(): Promise<void>;  // invoke('computer_use_start_session')
  stopSession(): Promise<void>;   // Resets isActive + sessionId
  captureScreen(): Promise<void>; // invoke('computer_use_capture_screen')
  logAction(action): void;        // Appends to actionLog
  clearLog(): void;               // Resets actionLog
  reset(): void;                  // Full state reset
}

interface ComputerAction {
  action_type: ActionType;                    // 'click' | 'double_click' | ... | 'zoom'
  coordinates: [number, number] | null;       // [x, y] for positional actions
  text: string | null;                        // Text content for type/zoom description
  key: string | null;                         // Key name for key_press
  timestamp: number;                          // Unix seconds
}
```

**Selectors** (exported for component use):
- `selectIsActive`, `selectSessionId`, `selectCurrentScreenshot`
- `selectScreenWidth`, `selectScreenHeight`, `selectActionLog`
- `selectComputerUseError`, `selectLastClickPosition` (scans log backwards for last click coordinates)

## Component Tree

```
UnifiedAgenticChat
  └── DynamicSidecar (case 'computer-use')
        └── ComputerUseMonitor          # Main container component
              ├── Header
              │     ├── Monitor icon + "Computer Use" title
              │     ├── Active/Inactive badge (pulse animation when active)
              │     └── Start/Stop button
              ├── Error display (red alert box)
              ├── Session ID display (first 8 chars of UUID)
              ├── ScreenPreview          # 60% of vertical space
              │     ├── <img> with base64 screenshot (object-contain)
              │     ├── ClickIndicator overlay (animated ping on last click position)
              │     │     └── Coordinate mapping: screen coords -> container coords
              │     │         accounting for aspect ratio (object-contain letterboxing)
              │     └── Resolution badge + Live indicator
              └── ActionLog              # 40% of vertical space
                    └── Scrollable list of action entries
                          ├── Timestamp (HH:MM:SS, monospace)
                          ├── Action icon (color-coded by type)
                          │     click/double/right = blue MousePointer
                          │     move = gray Move
                          │     type/key = green Keyboard
                          │     screenshot = purple Camera
                          │     scroll = yellow Eye
                          │     zoom = teal ZoomIn
                          └── Action description text
```

**Auto-refresh**: When `isActive`, `ScreenPreview` captures a new screenshot every 2 seconds via `setInterval`.

**Inline tool results** in `UnifiedAgenticChat/InlineToolResults/index.ts`:
- `computer_use_capture_screen` -> `InlineScreenshot` (renders base64 image)
- `computer_use_preview` / `__server__computer_use_preview` -> `InlineScreenshot`
- `computer_use_click` / `computer_use_type` / `computer_use_move_mouse` -> `InlineUIControl`

## Tauri Events

Events emitted from `ComputerUseSession::emit()` via `app.emit(event_name, &event)`:

| Event Name | Payload | When |
|------------|---------|------|
| `computer_use:session_started` | `{ session_id, task }` | Session begins |
| `computer_use:action_starting` | `{ session_id, action, action_index }` | Before each action executes |
| `computer_use:action_completed` | `{ session_id, action, success, duration_ms }` | After each action finishes |
| `computer_use:progress_update` | `{ session_id, progress }` | After each OPA iteration |
| `computer_use:session_completed` | `{ session_id, outcome }` | Session finishes (success or failure) |
| `computer_use:session_paused` | `{ session_id, reason, action }` | Paused for confirmation |
| `computer_use:session_resumed` | `{ session_id }` | Resumed after confirmation |
| `computer_use:session_cancelled` | `{ session_id }` | User cancelled |
| `computer_use:error` | `{ session_id, error }` | Error during execution |
| ~~`computer_use:screenshot`~~ | ~~`ScreenCapture`~~ | **Not emitted by Rust** — see Known Issue #13 |

Frontend subscription via `subscribeToComputerUseEvents()` in `computerUseStore.ts`:
- Listens to `action_completed` -> logs action to store
- Listens to `session_started` -> sets `isActive`, clears log
- Listens to `session_completed` -> clears `isActive`
- **Note**: The store subscribes to `computer_use:screenshot` but Rust never emits this event. Screenshot updates rely on the 2-second polling interval in `ScreenPreview` instead.

## Key Patterns

### Screenshot Streaming
- 2-second polling interval in `ScreenPreview` for live view
- Vision LLM analysis cached for 2 seconds to avoid redundant API calls
- Images downscaled to max 1920px before LLM submission
- PNG encoding for lossless capture, base64 for IPC transport

### Coordinate Mapping
- Vision LLM returns element bounds as **percentages** of screen dimensions
- `percent_to_pixels()` converts to absolute pixel coordinates: `left_px = (left_pct / 100) * screen_width`
- `ScreenPreview` maps screen coordinates to container coordinates via aspect-ratio-aware math (handles `object-contain` letterboxing)
- All input simulation uses absolute pixel coordinates via `enigo::Coordinate::Abs`

### Multi-Monitor Support
- `capture_primary_screen()` captures the primary monitor
- `list_displays()` via `dxgi.rs` enumerates all monitors as `ScreenInfo`
- `capture_region()` can capture across monitor boundaries
- Window enumeration via `WindowEnumerator::list_windows()` provides per-window bounds
- Current limitation: the OPA loop only observes the primary screen

### Safety Controls

**Three-tier safety architecture**:

1. **Prompt Injection Detection** (`PromptInjectionDetector`):
   - 15 regex patterns detecting instruction injection, role manipulation, system prompt extraction, jailbreak attempts
   - 8 suspicious phrase patterns (e.g., "ignore previous", "bypass safety", "sudo mode")
   - Scans screen description, text regions, element labels, and error messages
   - If detected during observation, the entire OPA loop terminates with `SafetyBlocked`

2. **Per-Action Safety Validation** (`ComputerUseSafetyLayer::evaluate_action`):
   - **Coordinate validation**: Negative coordinates blocked; system UI areas (top-left corner, menu bar, taskbar) warned/blocked
   - **Type content scanning**: Checks typed text against `safety_patterns::dangerous_command_patterns()` (shared with global safety); max 10,000 chars
   - **Hotkey blocking**: Alt+F4 requires confirmation; Ctrl+Alt+Delete, Meta+L (lock screen) blocked
   - **Window protection**: Password/Credential/Keychain/Security windows blocked or warned
   - **App launch validation**: `validate_app_name()` rejects path separators, shell metacharacters; terminal/cmd/powershell require confirmation
   - **Rate limiting**: Max 120 actions/minute, sliding window

3. **Sandbox Mode** (`SafetyConfig::sandboxed()`):
   - Clipboard blocked, app launch blocked, hotkeys blocked
   - Max 1,000 chars per type, 30 actions/minute
   - Used for untrusted task sources

**Risk levels** (0-10): Actions get a `SafetyDecision` with `allowed`, `risk_level`, `warnings`, and `requires_confirmation`. When `requires_confirmation` is true and the task has `require_confirmation: true`, the session pauses for user approval.

### Termination Conditions

The OPA loop exits when any of these conditions is met:

| Condition | `CompletionReason` |
|-----------|-------------------|
| LLM reports `task_complete: true` | `TaskComplete` |
| Iteration count > `max_iterations` (100) | `MaxIterationsReached` |
| Elapsed time > `max_duration` (300s) | `Timeout` |
| Consecutive failures >= `max_consecutive_failures` (3) | `TooManyFailures` |
| User cancels session | `UserCancelled` |
| Safety layer blocks an action | `SafetyBlocked` |
| LLM reports not making progress for 2+ iterations | `NotMakingProgress` |

### Window Management

Cross-platform window operations via `WindowCoordinator`:

| Platform | Enumeration | Activation | App Launch |
|----------|------------|------------|------------|
| Windows | `EnumWindows` Win32 API | `SetForegroundWindow` | `Command::new(name)` or `cmd /c start` |
| macOS | AppleScript via `osascript` | AppleScript (accessibility) | `open -a name` |
| Linux | `wmctrl -l -G` | `wmctrl -i -a` | Direct binary execution |

**Security hardening**:
- `sanitize_applescript_string()` -- strips quotes, backslashes, null bytes (max 200 chars)
- `sanitize_window_title_arg()` -- strips null bytes for direct argv passing (Linux)
- `validate_app_name()` -- rejects path separators, shell metacharacters, allows only `[a-zA-Z0-9\-\. ]`

### LLM Provider Routing

Both the visual reasoner and planning phase route through `LLMRouter` with:
- **Preferred provider**: `Provider::Anthropic`
- **Preferred model**: `claude-sonnet-4-5`
- **Router context**: `requires_vision: true`
- **Fallback**: If no vision-capable provider is configured, returns an error (does not degrade to non-vision models)

## Known Issues / Tech Debt

1. **Primary monitor only**: The OPA loop captures only the primary screen via `capture_primary_screen()`. Multi-monitor tasks where the target is on a secondary display will not work correctly.

2. **Hardcoded LLM provider**: Both `VisualReasoner` and `ComputerUseAgent` hardcode `claude-sonnet-4-5` as the vision model. This should respect the user's configured model preferences or at minimum use the first available vision-capable model.

3. **No streaming for planning**: Vision LLM calls use `stream: false`, which means the agent blocks for up to 30 seconds per planning step. Streaming would enable progress indication during planning.

4. **Limited WaitCondition support**: `WaitCondition::TextDisappears` and `WaitCondition::ElementAppears` fall through to a 1-second sleep in `execute_action()` rather than implementing actual polling.

5. **Session state not persisted to DB via OPA loop**: The `ComputerUseSession` (in-memory) and the `computer_use_sessions` DB table (migration v31) are not connected. The Tauri commands use their own `ComputerUseState` struct, while the OPA loop uses the module-level `ComputerUseSession`. Action history is not written to the DB during autonomous execution.

6. **Missing IPC commands for autonomous mode**: The registered Tauri commands (`computer_use_start_session`, `_click`, `_move_mouse`, etc.) only support manual step-by-step control from the frontend. There is no `computer_use_execute_task` command that exposes the full OPA loop to the frontend.

7. **Zoom not fed back into observation**: When the OPA loop executes a `Zoom` action, it captures and scales the region but does not feed the zoomed image back into the next observation cycle. The zoomed result is logged but discarded.

8. **macOS window activation incomplete**: The `activate_window_internal` on macOS is a no-op (returns `Ok(())`). Window activation relies on `activate_by_title` which uses `find_by_title` but the actual AppleScript to bring a window to front is not fully implemented.

9. **No confirmation UI on frontend**: When the safety layer triggers `requires_confirmation`, the session pauses and emits `computer_use:session_paused`. However, there is no frontend UI for the user to approve/deny the paused action. The session stays paused indefinitely until programmatically resumed.

10. **Computer use capability toggle**: `FeaturesPrivacySettings.tsx` references computer use as a toggleable capability, and `tools.rs` filters computer use tools based on `capabilities.computer_use`, but the toggle's effect on the autonomous OPA loop (vs. individual tool calls) is not enforced.

11. **Screenshot memory pressure**: With `capture_before_action: true` and `capture_after_action: true`, a 100-iteration session could produce 200 full-resolution screenshots. The in-memory cap is 50, and disk persistence stores to temp dir, but cleanup only happens on explicit `cleanup_completed()` calls.

12. **`image_quality` config unused**: `VisualReasonerConfig.image_quality` is set to 85 (intended for JPEG) but the actual encoding uses PNG (`image::ImageFormat::Png`).

13. **`computer_use:screenshot` event never emitted**: The Tauri events table lists `computer_use:screenshot` and the frontend store subscribes to it, but Rust only emits 9 session events (`session_started` through `error`). There is no `SessionEvent::Screenshot` variant. Screenshot updates rely entirely on the 2-second polling in `ScreenPreview`.

14. **6 of 11 computer use commands not registered in `lib.rs`**: Only 5 commands are in `generate_handler![]`: `computer_use_start_session`, `computer_use_capture_screen`, `computer_use_click`, `computer_use_move_mouse`, `computer_use_zoom_region`. The following 6 commands are defined in `sys/commands/computer_use.rs` but **not registered** and therefore unreachable via IPC: `computer_use_type_text`, `computer_use_get_session`, `computer_use_list_sessions`, `computer_use_execute_tool`, `computer_use_zoom_at_point`, `computer_use_suggest_zoom_level`.
