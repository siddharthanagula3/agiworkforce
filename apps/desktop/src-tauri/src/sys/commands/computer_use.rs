use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;
use tokio::sync::Mutex;

use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use xcap::Monitor;

use crate::automation::computer_use::{
    zoom_region, ComputerUseAgent, ComputerUseConfig, ComputerUseTask, InterpolationMethod, Region,
    ZoomAction, ZoomLevel,
};
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

#[tauri::command]
pub async fn computer_use_capture_screen(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
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

#[tauri::command]
pub async fn computer_use_click(
    x: i32,
    y: i32,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
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

#[tauri::command]
pub async fn computer_use_move_mouse(
    x: i32,
    y: i32,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
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

#[tauri::command]
pub async fn computer_use_type_text(
    text: String,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<(), String> {
    tracing::info!("Typing text: {}", text);

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
) -> Result<serde_json::Value, String> {
    tracing::info!("Executing computer use tool: {}", tool_name);

    match tool_name.as_str() {
        "screenshot" => {
            let capture = computer_use_capture_screen(state).await?;
            serde_json::to_value(capture).map_err(|e| format!("Serialization error: {}", e))
        }
        "click" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            computer_use_click(x, y, state).await?;
            Ok(serde_json::json!({"success": true}))
        }
        "type" => {
            let text = args["text"].as_str().ok_or("Missing text")?;
            computer_use_type_text(text.to_string(), state).await?;
            Ok(serde_json::json!({"success": true}))
        }
        "move_mouse" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            computer_use_move_mouse(x, y, state).await?;
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

fn perform_click(x: i32, y: i32) -> Result<(), anyhow::Error> {
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.move_mouse(x, y, Coordinate::Abs)?;
    enigo.button(Button::Left, Direction::Click)?;
    Ok(())
}

fn perform_move(x: i32, y: i32) -> Result<(), anyhow::Error> {
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.move_mouse(x, y, Coordinate::Abs)?;
    Ok(())
}

fn perform_type(text: &str) -> Result<(), anyhow::Error> {
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

#[tauri::command]
pub async fn computer_use_execute_opa_task(
    description: String,
    timeout_ms: Option<u64>,
    max_actions: Option<u32>,
    target_application: Option<String>,
    success_indicators: Option<Vec<String>>,
    app: tauri::AppHandle,
    _state: State<'_, Arc<Mutex<ComputerUseState>>>,
    llm_state: State<'_, LLMState>,
) -> Result<serde_json::Value, String> {
    let router = llm_state.router.clone();

    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(300_000));
    let iterations = max_actions.unwrap_or(100);

    let config = ComputerUseConfig {
        max_iterations: iterations,
        max_duration: timeout_duration,
        ..ComputerUseConfig::default()
    };

    let agent = ComputerUseAgent::new(router, config)
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
