# Feature: Vision
> Screenshot capture, image-to-LLM analysis, OCR, and computer-use automation: captures screen images via platform APIs, optionally extracts text via Tesseract, and sends images to vision-capable LLMs for analysis or agentic click/type loops.

## Where It Lives

| Layer | Location |
|-------|----------|
| Frontend Components | `components/Vision/VisionWorkspace.tsx`, `VisionAnalysis.tsx`, `ImageUpload.tsx`; `components/ScreenCapture/ScreenCaptureButton.tsx`, `RegionSelector.tsx`, `WindowSelector.tsx`, `CapturePreview.tsx`, `OCRViewer.tsx` |
| Stores | `stores/computerUseStore.ts` — Computer Use session state (in-memory only) |
| Hooks | `hooks/useScreenCapture.ts` — wraps all capture IPC calls with timeouts |
| Rust Commands (capture) | `sys/commands/capture.rs` — `capture_screen_full`, `capture_screen_region`, `capture_screen_window`, `capture_from_clipboard`, `capture_get_windows`, `capture_get_history`, `capture_delete`, `capture_save_to_clipboard` |
| Rust Commands (vision LLM) | `sys/commands/vision.rs` — registered in lib.rs: `vision_send_message`, `vision_analyze_screenshot`, `vision_extract_text`, `vision_compare_images`. Defined but NOT registered: `vision_locate_element`, `vision_describe_ui_elements`, `vision_answer_question` (dead commands, not callable via IPC) |
| Rust Commands (OCR) | `sys/commands/ocr.rs` — registered in lib.rs: `ocr_process_image`, `ocr_process_region`, `ocr_get_languages`, `ocr_get_result` (all `#[cfg(feature="ocr")]`). Defined but NOT registered: `ocr_process_with_boxes`, `ocr_detect_languages` (dead commands) |
| Rust Commands (computer use) | `sys/commands/computer_use.rs` — registered in lib.rs: `computer_use_start_session`, `computer_use_capture_screen`, `computer_use_click`, `computer_use_move_mouse`, `computer_use_zoom_region`. Defined but NOT registered: `computer_use_type_text`, `computer_use_execute_tool`, `computer_use_suggest_zoom_level` (dead commands, not callable via IPC) |
| Rust Core | `automation/screen.rs` (xcap-based capture), `core/agent/vision.rs` (`VisionAutomation`) |
| Cargo Features | `ocr` = Tesseract (off by default). Screen capture always on. |
| Event Channels | `computer_use:session_started`, `computer_use:action_starting`, `computer_use:action_completed`, `computer_use:progress_update`, `computer_use:session_completed`, `computer_use:session_paused`, `computer_use:session_resumed`, `computer_use:session_cancelled`, `computer_use:error` — from `automation/computer_use/session.rs` |
| Database | `captures` table (id, conversation_id, capture_type, file_path, thumbnail_path, ocr_text, metadata, created_at); `ocr_results` table (id, capture_id, language, text, confidence, bounding_boxes) |

## Data Flow

### Path A: Screenshot capture

1. User clicks `ScreenCaptureButton` → selects Full Screen / Region / Window
2. `useScreenCapture.ts:64` → `invoke('capture_screen_full', { conversationId? })` (30s timeout)
3. **Rust** (`capture.rs:95`):
   - macOS: Hides main window (`WindowRestoreGuard`, 120ms delay), runs `screencapture -x <tmp>.png`, restores window
   - Other platforms: `capture_primary_screen()` from `automation::screen` (xcap)
4. **Persist** (`capture.rs:606`): Writes PNG to `<AppDataDir>/captures/capture_<id>.png`. Generates 200x150 thumbnail. Inserts into `captures` SQLite table.
5. Returns `CaptureResult { id, path, thumbnail_path, capture_type, metadata }`

### Path B: Region capture

1. `RegionSelector.tsx` renders full-screen portal overlay with `cursor-crosshair`
2. User drags to select rectangle → `invoke('capture_screen_region', { x, y, width, height })`
3. Same persist pipeline as Path A

### Path C: Vision LLM analysis

1. `VisionWorkspace` → user uploads images via `ImageUpload` (drag-drop / file / capture / clipboard)
2. `VisionAnalysis` → user selects mode (describe / extract_text / compare / custom)
3. `invoke('vision_send_message', { request })` → Rust loads images by source type:
   - `path` → `image::open(path)` (validates no `..` traversal)
   - `base64` → `base64::decode` → `image::load_from_memory`
   - `capture_id` → SQLite query → load from disk
4. `optimize_image_for_vision()`: Resize to max 2048x2048 (Lanczos3), encode JPEG quality 85 (PNG if alpha)
5. Assembles `LLMRequest` with `multimodal_content` (text + images), routes via `LLMRouter`
6. Returns `VisionResponse { content, model, tokens, cost, processing_time_ms }`

### Path D: OCR (requires `ocr` feature)

1. `invoke('ocr_process_image', { captureId, imagePath, language? })`
2. `Tesseract::new()` → `set_image(path)` → `get_text()` + TSV bounding boxes
3. Optional preprocessing: Gaussian blur (sigma=1.0) + contrast stretching
4. Updates `captures.ocr_text`, inserts into `ocr_results` table

### Path E: Computer Use (screenshot → vision → click/type loop)

1. `invoke('computer_use_start_session')` → creates `ComputerUseSession`
2. `invoke('computer_use_capture_screen')` → `xcap::Monitor::all()[0].capture_image()` → base64 PNG
3. Screenshot sent to vision LLM for click target identification
4. Actions (note: `computer_use_type_text` is defined in Rust but NOT registered in lib.rs — not callable via IPC):
   - `computer_use_click` → `Enigo::move_mouse(x,y)` + `button(Left, Click)` (registered)
   - `computer_use_type_text` → `Enigo::text(text)` (NOT registered — dead command)
   - `computer_use_zoom_region` → captures region, scales up for precise inspection (registered)
5. Each action recorded in session for audit/replay

### Path F: Vision in Agent (`core/agent/vision.rs`)

1. `VisionAutomation::capture_screenshot(region?)` → saves to `$TMPDIR/agiworkforce_screenshots/`
2. `VisionAutomation::find_text(query, fuzzy)` → captures + OCR + text search
3. Used by agent executor for `Action::Screenshot` and text-search actions

## Component Tree

```
VisionWorkspace
├── ImageUpload (drag-drop / file / capture / clipboard)
├── VisionAnalysis (when images present)
│   ├── Mode selector (describe | extract_text | compare | custom)
│   ├── Custom prompt textarea
│   ├── Analyze button → vision_send_message
│   └── Result card (content, model, cost, tokens)
└── History list (thumbnails + previews)

ScreenCaptureButton (in chat composer toolbar)
├── DropdownMenu
│   ├── Capture Full Screen
│   ├── Capture Region → RegionSelector (portal)
│   └── Capture Window → WindowSelector
└── Quick mode: single click → RegionSelector

RegionSelector (portal to document.body)
└── Full-screen overlay + crosshair cursor + drag selection
```

## IPC Contracts

| Frontend Call | Rust Handler | Params (camelCase) | Returns |
|---|---|---|---|
| `invoke('capture_screen_full', ...)` | `capture_screen_full` | `conversationId?: number` | `CaptureResult` |
| `invoke('capture_screen_region', ...)` | `capture_screen_region` | `x, y, width, height, conversationId?` | `CaptureResult` |
| `invoke('capture_screen_window', ...)` | `capture_screen_window` | `hwnd: string, conversationId?` | `CaptureResult` |
| `invoke('capture_from_clipboard', ...)` | `capture_from_clipboard` | `conversationId?` | `CaptureResult` |
| `invoke('capture_get_windows')` | `capture_get_windows` | — | `WindowInfo[]` |
| `invoke('capture_get_history', ...)` | `capture_get_history` | `conversationId?, limit?` | `CaptureRecord[]` |
| `invoke('vision_send_message', ...)` | `vision_send_message` | `request: { prompt, images, provider?, model?, temperature?, maxTokens?, detailLevel? }` | `VisionResponse` |
| `invoke('vision_analyze_screenshot', ...)` | `vision_analyze_screenshot` | `captureId, prompt?, provider?, model?` | `VisionResponse` |
| `invoke('vision_extract_text', ...)` | `vision_extract_text` | `imagePath, provider?` | `VisionResponse` |
| `invoke('vision_compare_images', ...)` | `vision_compare_images` | `imagePath1, imagePath2, comparisonType?, provider?` | `ImageComparisonResult` |
| `invoke('ocr_process_image', ...)` | `ocr_process_image` | `captureId, imagePath, language?` | `OCRResult` |
| `invoke('computer_use_start_session')` | `computer_use_start_session` | — | `string` (sessionId) |
| `invoke('computer_use_capture_screen')` | `computer_use_capture_screen` | — | `ScreenCapture` |
| `invoke('computer_use_click', ...)` | `computer_use_click` | `x, y` | `void` |
| `invoke('computer_use_zoom_region', ...)` | `computer_use_zoom_region` | `request: ZoomRegionRequest` | `ZoomRegionResponse` |

**Note:** `vision_locate_element`, `vision_describe_ui_elements`, `vision_answer_question`, `computer_use_type_text`, and `computer_use_execute_tool` are defined in Rust source but NOT registered in `lib.rs` — they cannot be called via `invoke()` from the frontend.

## Dependencies

- **Requires**: `xcap` crate (cross-platform capture), `screencapture` CLI (macOS, requires Screen Recording permission), `image` crate (resize/encode), `rusqlite`/`AppDatabase` (persist captures + OCR), `LLMRouter` (vision LLM requests), `tesseract` crate (`ocr` feature), `enigo` crate (mouse/keyboard for Computer Use), `tauri-plugin-clipboard-manager`
- **Required by**: Chat composer (`ScreenCaptureButton` attaches screenshots), Agent executor (`Action::Screenshot` → `VisionAutomation`), Computer Use agent loop

## Known Gaps

1. **`DEFAULT_VISION_MODEL = "gpt-5.2"` hardcoded** in `vision.rs:14` — fails without OpenAI key. Should read from model catalog.
2. **Computer Use sessions in-memory only** — lost on app restart. No SQLite persistence.
3. **OCR requires Tesseract system binary** — not bundled with app. `ocr` feature off by default.
4. **No streaming for vision** — all LLM calls use `stream: false`. Complex images block for seconds.
5. **macOS `WindowRestoreGuard`** — 120ms synchronous sleep blocks async executor per capture.
6. **`RegionSelector` uses portal to `document.body`** — required to cover full viewport including toolbar.
7. **Dead commands not registered in lib.rs**: `vision_locate_element`, `vision_describe_ui_elements`, `vision_answer_question`, `computer_use_type_text`, `computer_use_execute_tool`, `computer_use_suggest_zoom_level`, `ocr_process_with_boxes`, `ocr_detect_languages` exist in Rust source but are not in the `generate_handler!` macro — cannot be called from frontend.
8. **OCR registered commands differ from source**: lib.rs registers `ocr_get_languages` and `ocr_get_result` instead of `ocr_process_with_boxes` and `ocr_detect_languages`.

## Design Decisions

- **macOS uses `screencapture` CLI** over CGWindowListCreateImage: simpler, always-available. 120ms hide-then-show prevents app from appearing in screenshot.
- **Captures stored as files, not SQLite blobs**: Avoids database size bloat. `captures` table stores metadata + path. UUID as stable identifier.
- **Image optimization before LLM** (2048px cap, JPEG q85): Aligns with OpenAI vision limits. 2-5x smaller than PNG for screenshots.
- **Three image source types** (path, base64, capture_id): Handles drag-drop files, in-app screenshots, and disk paths with dedicated loaders.
- **Computer Use session tracking**: Accumulates all actions + screenshots in order for audit trail, debugging, and future undo.
