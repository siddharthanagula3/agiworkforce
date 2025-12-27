use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use xcap::Monitor;

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
            .write_image(image.as_raw(), width, height, image::ColorType::Rgba8.into())
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
        _ => Err(format!("Unknown tool: {}", tool_name)),
    }
}

#[allow(dead_code)]
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
        .unwrap()
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
