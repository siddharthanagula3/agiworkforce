/**
 * Computer Use Capabilities (Claude-like)
 * Screen capture, UI automation, and intelligent computer control
 */
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex;

#[cfg(target_os = "windows")]
use crate::automation::screen;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenCapture {
    pub image_data: String, // Base64 encoded
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

/// Start a computer use session
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

/// Capture screen
#[tauri::command]
pub async fn computer_use_capture_screen(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<ScreenCapture, String> {
    tracing::info!("Capturing screen");

    #[cfg(target_os = "windows")]
    {
        let screenshot =
            capture_screenshot().map_err(|e| format!("Failed to capture screenshot: {}", e))?;

        let capture = ScreenCapture {
            image_data: screenshot.image_data,
            width: screenshot.width,
            height: screenshot.height,
            timestamp: current_timestamp(),
        };

        // Add to current session
        let computer_state = state.lock().await;
        if let Some(session_id) = computer_state.current_session.lock().await.as_ref() {
            let mut sessions = computer_state.sessions.lock().await;
            if let Some(session) = sessions.iter_mut().find(|s| &s.id == session_id) {
                session.screenshots.push(capture.clone());
            }
        }

        Ok(capture)
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Screen capture not supported on this platform".to_string())
    }
}

/// Perform mouse click
#[tauri::command]
pub async fn computer_use_click(
    x: i32,
    y: i32,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<(), String> {
    tracing::info!("Clicking at ({}, {})", x, y);

    #[cfg(target_os = "windows")]
    {
        click(x, y).map_err(|e| format!("Failed to click: {}", e))?;

        // Record action
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

    #[cfg(not(target_os = "windows"))]
    {
        Err("Mouse control not supported on this platform".to_string())
    }
}

/// Move mouse
#[tauri::command]
pub async fn computer_use_move_mouse(
    x: i32,
    y: i32,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<(), String> {
    tracing::info!("Moving mouse to ({}, {})", x, y);

    #[cfg(target_os = "windows")]
    {
        move_to(x, y).map_err(|e| format!("Failed to move mouse: {}", e))?;

        // Record action
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

    #[cfg(not(target_os = "windows"))]
    {
        Err("Mouse control not supported on this platform".to_string())
    }
}

/// Type text
#[tauri::command]
pub async fn computer_use_type_text(
    text: String,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<(), String> {
    tracing::info!("Typing text: {}", text);

    #[cfg(target_os = "windows")]
    {
        type_text(&text).map_err(|e| format!("Failed to type text: {}", e))?;

        // Record action
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

    #[cfg(not(target_os = "windows"))]
    {
        Err("Keyboard control not supported on this platform".to_string())
    }
}

/// Get session history
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

/// List all sessions
#[tauri::command]
pub async fn computer_use_list_sessions(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<Vec<ComputerUseSession>, String> {
    let computer_state = state.lock().await;
    let sessions = computer_state.sessions.lock().await;
    Ok(sessions.clone())
}

/// Execute computer use tool
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

// Helper functions

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

#[cfg(target_os = "windows")]
fn capture_screenshot() -> Result<ScreenCapture, anyhow::Error> {
    use base64::{engine::general_purpose, Engine as _};
    use image::ImageEncoder;

    let captured = screen::capture_primary_screen()?;
    let (width, height) = captured.pixels.dimensions();

    // Convert to PNG and base64 encode
    let mut png_bytes = Vec::new();
    {
        let mut cursor = std::io::Cursor::new(&mut png_bytes);
        image::codecs::png::PngEncoder::new(&mut cursor).write_image(
            captured.pixels.as_raw(),
            width,
            height,
            image::ColorType::Rgba8,
        )?;
    }

    let image_data = general_purpose::STANDARD.encode(&png_bytes);

    Ok(ScreenCapture {
        image_data,
        width,
        height,
        timestamp: current_timestamp(),
    })
}

#[cfg(target_os = "windows")]
fn click(x: i32, y: i32) -> Result<(), anyhow::Error> {
    use enigo::{Enigo, Mouse, Settings};
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.move_mouse(x, y, enigo::Coordinate::Abs)?;
    enigo.button(enigo::Button::Left, enigo::Direction::Click)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn move_to(x: i32, y: i32) -> Result<(), anyhow::Error> {
    use enigo::{Enigo, Mouse, Settings};
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.move_mouse(x, y, enigo::Coordinate::Abs)?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn type_text(text: &str) -> Result<(), anyhow::Error> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo = Enigo::new(&Settings::default())?;
    enigo.text(text)?;
    Ok(())
}
