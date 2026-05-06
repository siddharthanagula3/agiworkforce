use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::Mutex;

use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use xcap::Monitor;

use crate::automation::computer_use::{
    zoom_region, AppPermission, AppPermissionManager, ComputerUseAgent, ComputerUseConfig,
    ComputerUseTask, InterpolationMethod, PermissionStatus, Region, ZoomAction, ZoomLevel,
    ALWAYS_BLOCKED_BUNDLE_IDS,
};
use crate::core::llm::Provider;
use crate::sys::commands::llm::LLMState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCapture {
    pub image_data: String,
    pub width: u32,
    pub height: u32,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerAction {
    pub action_type: ActionType,
    pub coordinates: Option<(i32, i32)>,
    pub text: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Click,
    DoubleClick,
    RightClick,
    MoveMouse,
    Type,
    KeyPress,
    Screenshot,
    Scroll,
    Zoom,
}

/// Request structure for zoom region operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomRegionRequest {
    /// X coordinate of the region's top-left corner.
    pub x: i32,
    /// Y coordinate of the region's top-left corner.
    pub y: i32,
    /// Width of the region in pixels.
    pub width: u32,
    /// Height of the region in pixels.
    pub height: u32,
    /// Zoom level: 2.0 (2x), 4.0 (4x), or 8.0 (8x).
    #[serde(default = "default_zoom")]
    pub zoom_level: f32,
    /// Interpolation method: "nearest", "bilinear", "lanczos3", "catmull_rom".
    #[serde(default)]
    pub interpolation: Option<String>,
    /// Optional path to save the zoomed image.
    #[serde(default)]
    pub save_path: Option<String>,
}

fn default_zoom() -> f32 {
    2.0
}

/// Response structure for zoom region operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ZoomRegionResponse {
    /// Base64-encoded PNG of the zoomed region.
    pub image_data: String,
    /// Width of the zoomed image.
    pub width: u32,
    /// Height of the zoomed image.
    pub height: u32,
    /// Scale factor that was applied.
    pub scale_factor: f32,
    /// Original region coordinates.
    pub original_x: i32,
    pub original_y: i32,
    pub original_width: u32,
    pub original_height: u32,
    /// Processing time in milliseconds.
    pub processing_time_ms: u64,
    /// Path where image was saved (if requested).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub saved_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComputerUseSession {
    pub id: String,
    pub actions: Vec<ComputerAction>,
    pub screenshots: Vec<ScreenCapture>,
    pub started_at: u64,
}

pub struct ComputerUseState {
    pub sessions: Arc<Mutex<Vec<ComputerUseSession>>>,
    pub current_session: Arc<Mutex<Option<String>>>,
}

impl ComputerUseState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(Vec::new())),
            current_session: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for ComputerUseState {
    fn default() -> Self {
        Self::new()
    }
}

#[tauri::command]
pub async fn computer_use_start_session(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<String, String> {
    let computer_state = state.lock().await;
    let session_id = uuid::Uuid::new_v4().to_string();

    let session = ComputerUseSession {
        id: session_id.clone(),
        actions: Vec::new(),
        screenshots: Vec::new(),
        started_at: current_timestamp(),
    };

    let mut sessions = computer_state.sessions.lock().await;
    sessions.push(session);

    let mut current = computer_state.current_session.lock().await;
    *current = Some(session_id.clone());

    tracing::info!("Started computer use session: {}", session_id);
    Ok(session_id)
}

/// Internal screen-capture worker — does the actual work without any
/// confirmation gate. Used by both the gated IPC entry point
/// (`computer_use_capture_screen`) and the dispatcher
/// (`computer_use_execute_tool`), which has its own dispatch-level gate.
/// Calling this from a non-IPC code path bypasses the user-confirmation
/// gate, so any new caller MUST justify why bypass is acceptable.
async fn capture_screen_inner(
    state: &Arc<Mutex<ComputerUseState>>,
) -> Result<ScreenCapture, String> {
    tracing::info!("Capturing screen");

    let monitors = Monitor::all().map_err(|e| format!("Failed to list monitors: {}", e))?;
    let monitor = monitors.first().ok_or("No monitors found")?;

    let image = monitor
        .capture_image()
        .map_err(|e| format!("Failed to capture screen: {}", e))?;

    let width = image.width();
    let height = image.height();

    let mut png_bytes = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        use image::ImageEncoder;
        image::codecs::png::PngEncoder::new(&mut cursor)
            .write_image(
                image.as_raw(),
                width,
                height,
                image::ColorType::Rgba8.into(),
            )
            .map_err(|e| format!("Failed to encode image: {}", e))?;
    }

    use base64::{engine::general_purpose, Engine as _};
    let image_data = general_purpose::STANDARD.encode(&png_bytes);

    let capture = ScreenCapture {
        image_data,
        width,
        height,
        timestamp: current_timestamp(),
    };

    let computer_state = state.lock().await;
    if let Some(session_id) = computer_state.current_session.lock().await.as_ref() {
        let mut sessions = computer_state.sessions.lock().await;
        if let Some(session) = sessions.iter_mut().find(|s| &s.id == session_id) {
            session.screenshots.push(capture.clone());
        }
    }

    Ok(capture)
}

/// SEV-DESK-09 fix: gate the IPC entry point on `require_confirmation`
/// to match the click/move_mouse/type_text pattern at lines 296-343.
/// The dispatcher path (`computer_use_execute_tool`) calls
/// `capture_screen_inner` directly because it gates `screenshot` once
/// at the dispatch level (line 403); double-prompting would be hostile.
/// A direct frontend `invoke('computer_use_capture_screen', ...)` from
/// a prompt-injected LLM no longer bypasses confirmation.
#[tauri::command]
pub async fn computer_use_capture_screen(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
) -> Result<ScreenCapture, String> {
    require_confirmation(
        &app_handle,
        "computer_use_capture_screen",
        serde_json::json!({}),
    )
    .await?;
    capture_screen_inner(state.inner()).await
}

/// FIX-003 (Sprint 2): every `computer_use_*` IPC routes through
/// `tool_confirmation::request_confirmation_simple` before touching the
/// real OS input layer. Mirrors the gate that `terminal.rs:60-90` and
/// `git.rs:307+` already enforce. Without this gate, an indirect prompt
/// injection (PDF, web page, email contents) could drive the agent to
/// click anywhere or type anything with zero user opportunity to refuse.
async fn require_confirmation(
    app_handle: &tauri::AppHandle,
    tool_name: &'static str,
    args: serde_json::Value,
) -> Result<(), String> {
    let approved = crate::sys::commands::tool_confirmation::request_confirmation_simple(
        app_handle, tool_name, &args,
    )
    .await?;
    if !approved {
        return Err(format!(
            "{tool_name} denied by user. Re-issue the request or grant approval to retry."
        ));
    }
    Ok(())
}

// DESK-9 (audit 2026-05-03): the previous implementation had
// `computer_use_execute_tool` calling other `#[tauri::command]` fns
// directly in Rust. That's unsupported Tauri API misuse — those
// functions are wrapped by the IPC layer and not meant to be invoked
// without going through `invoke()`. Refactor: move the OS-interaction
// + record-action logic into private `perform_*_inner` helpers, and
// have BOTH the IPC command and execute_tool call those.

async fn click_inner(
    x: i32,
    y: i32,
    state: &Arc<Mutex<ComputerUseState>>,
) -> Result<(), String> {
    tracing::info!("Clicking at ({}, {})", x, y);
    perform_click(x, y).map_err(|e| format!("Failed to click: {}", e))?;
    let computer_state = state.lock().await;
    record_action(
        &computer_state,
        ComputerAction {
            action_type: ActionType::Click,
            coordinates: Some((x, y)),
            text: None,
            key: None,
        },
    )
    .await;
    Ok(())
}

async fn move_mouse_inner(
    x: i32,
    y: i32,
    state: &Arc<Mutex<ComputerUseState>>,
) -> Result<(), String> {
    tracing::info!("Moving mouse to ({}, {})", x, y);
    perform_move(x, y).map_err(|e| format!("Failed to move mouse: {}", e))?;
    let computer_state = state.lock().await;
    record_action(
        &computer_state,
        ComputerAction {
            action_type: ActionType::MoveMouse,
            coordinates: Some((x, y)),
            text: None,
            key: None,
        },
    )
    .await;
    Ok(())
}

async fn type_text_inner(
    text: String,
    state: &Arc<Mutex<ComputerUseState>>,
) -> Result<(), String> {
    // FIX-003: replaced `tracing::info!("Typing text: {}", text)` — the
    // previous form spilled raw passwords into the log pipeline.
    tracing::info!("Typing {} chars", text.chars().count());
    perform_type(&text).map_err(|e| format!("Failed to type text: {}", e))?;
    let computer_state = state.lock().await;
    record_action(
        &computer_state,
        ComputerAction {
            action_type: ActionType::Type,
            coordinates: None,
            text: Some(text),
            key: None,
        },
    )
    .await;
    Ok(())
}

#[tauri::command]
pub async fn computer_use_click(
    x: i32,
    y: i32,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    require_confirmation(
        &app_handle,
        "computer_use_click",
        serde_json::json!({ "x": x, "y": y }),
    )
    .await?;
    click_inner(x, y, state.inner()).await
}

#[tauri::command]
pub async fn computer_use_move_mouse(
    x: i32,
    y: i32,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    require_confirmation(
        &app_handle,
        "computer_use_move_mouse",
        serde_json::json!({ "x": x, "y": y }),
    )
    .await?;
    move_mouse_inner(x, y, state.inner()).await
}

#[tauri::command]
pub async fn computer_use_type_text(
    text: String,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    require_confirmation(
        &app_handle,
        "computer_use_type_text",
        // Surface only the length to the approval prompt — the literal
        // text could contain credentials the model captured from the
        // user's clipboard or a previous tool call.
        serde_json::json!({ "chars": text.chars().count() }),
    )
    .await?;
    type_text_inner(text, state.inner()).await
}

#[tauri::command]
pub async fn computer_use_get_session(
    session_id: String,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<ComputerUseSession, String> {
    let computer_state = state.lock().await;
    let sessions = computer_state.sessions.lock().await;

    sessions
        .iter()
        .find(|s| s.id == session_id)
        .cloned()
        .ok_or_else(|| format!("Session not found: {}", session_id))
}

#[tauri::command]
pub async fn computer_use_list_sessions(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<Vec<ComputerUseSession>, String> {
    let computer_state = state.lock().await;
    let sessions = computer_state.sessions.lock().await;
    Ok(sessions.clone())
}

#[tauri::command]
pub async fn computer_use_execute_tool(
    tool_name: String,
    args: serde_json::Value,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    tracing::info!("Executing computer use tool: {}", tool_name);

    // FIX-003 (Sprint 2): replaced the previous raw `match tool_name`
    // with an explicit allow-list. Anything outside this set is refused
    // before any state lookup so we don't leak the existence of internal
    // helpers via error messages.
    const ALLOWED_TOOLS: &[&str] = &[
        "screenshot",
        "click",
        "type",
        "move_mouse",
        "zoom",
        "zoom_at_point",
    ];
    if !ALLOWED_TOOLS.contains(&tool_name.as_str()) {
        return Err(format!(
            "Unknown computer-use tool: '{tool_name}'. Allowed: {}",
            ALLOWED_TOOLS.join(", ")
        ));
    }

    // DESK-1 (audit 2026-05-03): require_confirmation at the dispatch
    // entry point so EVERY branch is gated, including `zoom` and
    // `zoom_at_point` which previously fell through to functions that
    // didn't gate themselves. Zoom/zoom_at_point are screen-capture
    // primitives and an indirect prompt-injection that maps screen
    // contents must be visible to the user.
    require_confirmation(
        &app_handle,
        "computer_use_execute_tool",
        serde_json::json!({ "tool": tool_name, "args": args }),
    )
    .await?;

    match tool_name.as_str() {
        "screenshot" => {
            // SEV-DESK-09: dispatcher already gated above (line 403); call the
            // inner worker directly to avoid a second confirmation prompt.
            let capture = capture_screen_inner(state.inner()).await?;
            serde_json::to_value(capture).map_err(|e| format!("Serialization error: {}", e))
        }
        "click" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            // DESK-9: call the helper directly instead of a Tauri command.
            click_inner(x, y, state.inner()).await?;
            Ok(serde_json::json!({"success": true}))
        }
        "type" => {
            let text = args["text"].as_str().ok_or("Missing text")?;
            type_text_inner(text.to_string(), state.inner()).await?;
            Ok(serde_json::json!({"success": true}))
        }
        "move_mouse" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            move_mouse_inner(x, y, state.inner()).await?;
            Ok(serde_json::json!({"success": true}))
        }
        "zoom" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            let width = args["width"].as_u64().ok_or("Missing width")? as u32;
            let height = args["height"].as_u64().ok_or("Missing height")? as u32;
            let zoom_level = args["zoom_level"].as_f64().unwrap_or(2.0) as f32;
            let interpolation = args["interpolation"].as_str().map(String::from);
            let save_path = args["save_path"].as_str().map(String::from);

            let request = ZoomRegionRequest {
                x,
                y,
                width,
                height,
                zoom_level,
                interpolation,
                save_path,
            };

            let result = computer_use_zoom_region(request, state).await?;
            serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
        }
        "zoom_at_point" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            let context_size = args["context_size"].as_u64().map(|v| v as u32);
            let zoom_level = args["zoom_level"].as_f64().map(|v| v as f32);

            let result = computer_use_zoom_at_point(x, y, context_size, zoom_level, state).await?;
            serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
        }
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

/// Records an action to the current session for audit/replay purposes
async fn record_action(state: &ComputerUseState, action: ComputerAction) {
    if let Some(session_id) = state.current_session.lock().await.as_ref() {
        let mut sessions = state.sessions.lock().await;
        if let Some(session) = sessions.iter_mut().find(|s| &s.id == session_id) {
            session.actions.push(action);
        }
    }
}

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or(std::time::Duration::ZERO)
        .as_secs()
}

/// FIX-025 (Sprint 5): on Linux we can't reliably synthesize OS input
/// without an AT-SPI or libei integration that hasn't been built yet.
/// Returning a clear error instead of letting `enigo` silently no-op
/// (X11 sessions) or panic (pure Wayland) lets the frontend surface a
/// "Computer use is not supported on Linux yet" banner instead of the
/// agent thinking it succeeded. macOS + Windows continue to work.
fn ensure_supported_platform() -> Result<(), anyhow::Error> {
    #[cfg(target_os = "linux")]
    {
        Err(anyhow::anyhow!(
            "Computer use is not supported on Linux yet. Run the agent on macOS or Windows for click/type/move actions."
        ))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(())
    }
}

fn perform_click(x: i32, y: i32) -> Result<(), anyhow::Error> {
    ensure_supported_platform()?;
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.move_mouse(x, y, Coordinate::Abs)?;
    enigo.button(Button::Left, Direction::Click)?;
    Ok(())
}

fn perform_move(x: i32, y: i32) -> Result<(), anyhow::Error> {
    ensure_supported_platform()?;
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.move_mouse(x, y, Coordinate::Abs)?;
    Ok(())
}

fn perform_type(text: &str) -> Result<(), anyhow::Error> {
    ensure_supported_platform()?;
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.text(text)?;
    Ok(())
}

/// Zoom into a screen region for detailed inspection.
///
/// Captures the specified region from the screen and scales it up
/// for improved element detection and OCR accuracy.
///
/// # Arguments
///
/// * `request` - The zoom request containing region coordinates and zoom level
///
/// # Returns
///
/// A `ZoomRegionResponse` containing the zoomed image and metadata.
///
/// # Examples
///
/// ```typescript
/// // From frontend:
/// const result = await invoke('computer_use_zoom_region', {
///   request: {
///     x: 100,
///     y: 200,
///     width: 50,
///     height: 30,
///     zoom_level: 4.0,
///   }
/// });
/// // result.image_data contains base64 PNG of 200x120 zoomed image
/// ```
#[tauri::command]
pub async fn computer_use_zoom_region(
    request: ZoomRegionRequest,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<ZoomRegionResponse, String> {
    tracing::info!(
        "Zooming region at ({}, {}) size {}x{} with {}x magnification",
        request.x,
        request.y,
        request.width,
        request.height,
        request.zoom_level
    );

    // Validate zoom level
    let zoom_level = request.zoom_level.clamp(1.0, 16.0);

    // Parse interpolation method
    let interpolation = match request.interpolation.as_deref() {
        Some("nearest") => InterpolationMethod::Nearest,
        Some("lanczos3") => InterpolationMethod::Lanczos3,
        Some("catmull_rom") => InterpolationMethod::CatmullRom,
        _ => InterpolationMethod::Bilinear,
    };

    // Create zoom action
    let mut action = ZoomAction::new(
        Region::new(request.x, request.y, request.width, request.height),
        ZoomLevel::from_factor(zoom_level),
    )
    .with_interpolation(interpolation);

    if let Some(path) = request.save_path.clone() {
        action = action.with_save_path(path);
    }

    // Perform zoom
    let result = zoom_region(&action).map_err(|e| format!("Failed to zoom region: {}", e))?;

    // Record action to session
    let computer_state = state.lock().await;
    record_action(
        &computer_state,
        ComputerAction {
            action_type: ActionType::Zoom,
            coordinates: Some((request.x, request.y)),
            text: Some(format!(
                "{}x zoom of {}x{} region",
                zoom_level, request.width, request.height
            )),
            key: None,
        },
    )
    .await;

    Ok(ZoomRegionResponse {
        image_data: result.image_base64,
        width: result.width,
        height: result.height,
        scale_factor: result.scale_factor,
        original_x: result.original_region.x,
        original_y: result.original_region.y,
        original_width: result.original_region.width,
        original_height: result.original_region.height,
        processing_time_ms: result.processing_time_ms,
        saved_path: result.saved_path,
    })
}

/// Zoom around a specific point on the screen.
///
/// Creates a square region centered on the given coordinates and zooms in.
/// Useful when you know the target point but not the exact element bounds.
///
/// # Arguments
///
/// * `x` - X coordinate to center on
/// * `y` - Y coordinate to center on
/// * `context_size` - Size of the region around the point (default: 100 pixels)
/// * `zoom_level` - Zoom factor (2.0, 4.0, or 8.0)
#[tauri::command]
pub async fn computer_use_zoom_at_point(
    x: i32,
    y: i32,
    context_size: Option<u32>,
    zoom_level: Option<f32>,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<ZoomRegionResponse, String> {
    let size = context_size.unwrap_or(100);
    let level = zoom_level.unwrap_or(4.0);

    let half = (size / 2) as i32;
    let request = ZoomRegionRequest {
        x: x - half,
        y: y - half,
        width: size,
        height: size,
        zoom_level: level,
        interpolation: None,
        save_path: None,
    };

    computer_use_zoom_region(request, state).await
}

/// Suggest an appropriate zoom level based on element dimensions.
///
/// Smaller elements need higher zoom levels for accurate inspection.
///
/// # Arguments
///
/// * `width` - Element width in pixels
/// * `height` - Element height in pixels
///
/// # Returns
///
/// Recommended zoom level (2.0, 4.0, or 8.0)
#[tauri::command]
pub fn computer_use_suggest_zoom_level(width: u32, height: u32) -> f32 {
    crate::automation::computer_use::suggest_zoom_level(width, height).scale_factor()
}

/// Executes an OPA (Observe-Plan-Act) computer use task.
///
/// Stream 2 params:
/// - `model`: explicit model id from the catalog (e.g. `claude-opus-4.7`,
///   `gpt-5.5`, `gemini-3.1-pro`, `grok-4.3-vision`). `None` lets the
///   router pick the user's default vision model.
/// - `provider`: explicit provider name (`anthropic`, `openai`, `google`,
///   `xai`, etc). `None` resolves from the model id.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn computer_use_execute_opa_task(
    description: String,
    timeout_ms: Option<u64>,
    max_actions: Option<u32>,
    target_application: Option<String>,
    success_indicators: Option<Vec<String>>,
    model: Option<String>,
    provider: Option<String>,
    app: tauri::AppHandle,
    _state: State<'_, Arc<Mutex<ComputerUseState>>>,
    llm_state: State<'_, LLMState>,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<serde_json::Value, String> {
    let router = llm_state.router.clone();

    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(300_000));
    let iterations = max_actions.unwrap_or(100);

    let resolved_provider = provider.as_deref().and_then(Provider::from_string);

    let config = ComputerUseConfig {
        max_iterations: iterations,
        max_duration: timeout_duration,
        model,
        provider: resolved_provider,
        ..ComputerUseConfig::default()
    };

    // Stream 1: wire the per-app permission manager into the agent so the
    // safety layer's `check_app_permission` consults the active foreground
    // app on every action. Closes the gap from today's audit.
    let agent = ComputerUseAgent::with_app_permissions(
        router,
        config,
        permissions_state.inner().clone(),
    )
    .map_err(|e| format!("Failed to create ComputerUseAgent: {}", e))?
    .with_app_handle(app);

    let task = ComputerUseTask {
        description,
        timeout_ms: timeout_ms.unwrap_or(300_000),
        max_actions: max_actions.unwrap_or(100),
        target_application,
        success_indicators: success_indicators.unwrap_or_default(),
        ..ComputerUseTask::default()
    };

    let result = agent
        .execute_task(task)
        .await
        .map_err(|e| format!("OPA task execution failed: {}", e))?;

    let value = serde_json::json!({
        "success": result.success,
        "reason": result.reason,
        "state": result.state,
        "outcome": result.outcome,
    });

    Ok(value)
}

// ---------------------------------------------------------------------------
// Per-app permissions (Stream 1)
// ---------------------------------------------------------------------------

/// Lists every app the user has explicitly allowed/denied/marked-ask.
/// Apps not in this list default to `AskEveryTime` on first encounter.
#[tauri::command]
pub async fn app_permissions_list(
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<Vec<AppPermission>, String> {
    Ok(permissions_state.list_permissions().await)
}

/// Sets the permission status for an app (allow / deny / ask).
///
/// `bundle_id` is optional but recommended on macOS — it lets the gate
/// match against `frontmostApplication.bundleIdentifier` rather than the
/// localized display name.
///
/// `status` accepts: `allowed`, `denied`, or `ask`.
#[tauri::command]
pub async fn app_permissions_set(
    app_name: String,
    bundle_id: Option<String>,
    status: String,
    app_handle: tauri::AppHandle,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<(), String> {
    let parsed = match status.to_lowercase().as_str() {
        "allowed" | "allow" => PermissionStatus::Allowed,
        "denied" | "deny" | "block" | "blocked" => PermissionStatus::Denied,
        "ask" | "ask_every_time" | "askeverytime" => PermissionStatus::AskEveryTime,
        other => {
            return Err(format!(
                "Invalid status '{other}'. Expected one of: allowed, denied, ask"
            ))
        }
    };

    permissions_state
        .set_permission_with_bundle(&app_name, bundle_id.as_deref(), parsed)
        .await;

    persist_permissions(&app_handle, permissions_state.inner()).await;
    Ok(())
}

/// Removes a per-app permission entry, reverting it to `AskEveryTime` on
/// next encounter.
#[tauri::command]
pub async fn app_permissions_remove(
    app_name: String,
    app_handle: tauri::AppHandle,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
) -> Result<(), String> {
    permissions_state.remove_permission(&app_name).await;
    persist_permissions(&app_handle, permissions_state.inner()).await;
    Ok(())
}

/// Best-effort persistence of the permission registry to the app data dir.
/// Failures are logged but don't bubble up — the in-memory state is still
/// authoritative for the current session.
async fn persist_permissions(app_handle: &tauri::AppHandle, mgr: &Arc<AppPermissionManager>) {
    use tauri::Manager as _;
    let path = match app_handle.path().app_data_dir() {
        Ok(dir) => dir.join("app_permissions.json"),
        Err(e) => {
            tracing::warn!("Could not resolve app_data_dir for app_permissions.json: {}", e);
            return;
        }
    };

    match mgr.to_json().await {
        Ok(json) => {
            if let Err(e) = tokio::fs::write(&path, json).await {
                tracing::warn!("Failed to persist app_permissions.json at {:?}: {}", path, e);
            }
        }
        Err(e) => {
            tracing::warn!("Failed to serialize app_permissions: {}", e);
        }
    }
}

/// Returns the hardcoded refuse-list (investment / crypto / banking
/// apps) so the UI can surface them as "always blocked" entries that the
/// user cannot enable.
#[tauri::command]
pub fn app_permissions_always_blocked() -> Vec<String> {
    ALWAYS_BLOCKED_BUNDLE_IDS
        .iter()
        .map(|s| s.to_string())
        .collect()
}

/// Returns the currently focused application — used by the settings UI to
/// help the user discover and approve new apps.
#[tauri::command]
pub fn app_permissions_active_window() -> Option<crate::automation::computer_use::ActiveWindow> {
    crate::automation::computer_use::WindowCoordinator::get_active_window()
}

#[tauri::command]
pub async fn computer_use_stop_session(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    session_id: String,
) -> Result<(), String> {
    let computer_state = state.lock().await;
    let mut current = computer_state.current_session.lock().await;
    if current.as_deref() == Some(&session_id) {
        *current = None;
        tracing::info!("Stopped computer use session: {}", session_id);
    }
    Ok(())
}
