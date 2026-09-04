use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::State;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use enigo::{Button, Coordinate, Direction, Enigo, Keyboard, Mouse, Settings};
use xcap::Monitor;

use crate::automation::computer_use::consent::{
    consent_prompt_on_screen, load_consent, persist_consent, process_scope, revoke_consent,
    ConsentPromptOnScreen, ConsentScope,
};
use crate::automation::computer_use::ComputerUseConsent;
use crate::automation::computer_use::{
    zoom_region, AppPermission, AppPermissionManager, ComputerUseAgent, ComputerUseConfig,
    ComputerUseTask, ExecutionState, InterpolationMethod, PermissionStatus, Region, TaskOutcome,
    ZoomAction, ZoomLevel, ALWAYS_BLOCKED_BUNDLE_IDS,
};
use crate::automation::os_lock::lock_os_automation;
use crate::core::llm::Provider;
use crate::sys::commands::llm::LLMState;
use crate::sys::commands::settings_v2::SettingsServiceState;

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
    opa_executions: HashMap<String, OpaExecutionControl>,
    opa_cancelled_before_start: HashSet<String>,
    opa_completed_executions: VecDeque<String>,
}

#[derive(Clone)]
struct OpaExecutionControl {
    cancellation: CancellationToken,
    finished: CancellationToken,
}

impl OpaExecutionControl {
    fn new() -> Self {
        Self {
            cancellation: CancellationToken::new(),
            finished: CancellationToken::new(),
        }
    }
}

impl ComputerUseState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(Vec::new())),
            current_session: Arc::new(Mutex::new(None)),
            opa_executions: HashMap::new(),
            opa_cancelled_before_start: HashSet::new(),
            opa_completed_executions: VecDeque::new(),
        }
    }
}

impl Default for ComputerUseState {
    fn default() -> Self {
        Self::new()
    }
}

const CONSENT_REQUIRED_ERROR: &str = "Computer use has not been consented to on this device. Approve the computer-use request that opens on this computer, then start the action again.";
const CONSENT_PROMPT_BUSY_ERROR: &str = "The computer-use consent request is open on this computer. It has to be answered there, so nothing can be driven through this app until it is.";
const AUTOMATION_NOT_SUSPENDED_ERROR: &str = "Computer use cannot ask for permission right now: this app could not pause its own pointer and keyboard control while the request is open. Try again, or restart AGI Workforce.";
const CONSENT_PROMPT_TITLE: &str = "Allow AGI Workforce to control this computer?";
const CONSENT_PROMPT_BODY: &str = "AGI Workforce is asking to watch this screen and to move the pointer, type, and click on your behalf. The permission lasts until you turn computer use off in Settings or quit AGI Workforce. Allow this only if you just started a computer-use task yourself.";
const CONSENT_PROMPT_COOLDOWN: Duration = Duration::from_secs(30);

static CONSENT_PROMPT: Lazy<ConsentPrompt> = Lazy::new(ConsentPrompt::default);

#[derive(Default)]
struct ConsentPrompt {
    state: std::sync::Mutex<PromptState>,
}

#[derive(Default)]
struct PromptState {
    open: bool,
    last_shown: Option<Instant>,
}

/// Keeps the prompt marked open for exactly as long as the dialog is on screen,
/// including when the caller unwinds.
struct PromptTicket<'a> {
    prompt: &'a ConsentPrompt,
    _on_screen: ConsentPromptOnScreen,
}

impl Drop for PromptTicket<'_> {
    fn drop(&mut self) {
        if let Ok(mut state) = self.prompt.state.lock() {
            state.open = false;
        }
    }
}

impl ConsentPrompt {
    /// Reserves the right to raise the dialog, stamping the cooldown as the
    /// dialog is shown rather than when it is answered: a burst of commands
    /// cannot become a wall of dialogs, and failing to record an approval
    /// cannot reopen one on the next `invoke()`.
    fn reserve(&self) -> Option<PromptTicket<'_>> {
        let mut state = self.state.lock().ok()?;
        if state.open {
            return None;
        }
        if state
            .last_shown
            .is_some_and(|shown_at| shown_at.elapsed() < CONSENT_PROMPT_COOLDOWN)
        {
            return None;
        }
        state.open = true;
        state.last_shown = Some(Instant::now());
        Some(PromptTicket {
            prompt: self,
            _on_screen: consent_prompt_on_screen(),
        })
    }

    /// A poisoned lock reads as open so synthetic input stays refused.
    fn is_open(&self) -> bool {
        self.state.lock().map(|state| state.open).unwrap_or(true)
    }
}

pub(crate) async fn require_consent(
    app_handle: &tauri::AppHandle,
    settings: &SettingsServiceState,
) -> Result<(), String> {
    let app_handle = app_handle.clone();
    require_consent_via(process_scope(), settings, &CONSENT_PROMPT, move || {
        native_consent_prompt(app_handle)
    })
    .await
}

/// Runs `action` only once `gate` has allowed it, so a refused gate can never
/// be a step the action already took.
pub(crate) async fn run_when_consented<T, E>(
    gate: impl Future<Output = Result<(), E>>,
    action: impl Future<Output = Result<T, E>>,
) -> Result<T, E> {
    gate.await?;
    action.await
}

async fn require_consent_via<P, F>(
    scope: &ConsentScope,
    settings: &SettingsServiceState,
    prompt_gate: &ConsentPrompt,
    prompt: P,
) -> Result<(), String>
where
    P: FnOnce() -> F,
    F: Future<Output = bool>,
{
    refuse_while_prompt_is_open(prompt_gate)?;
    if consent_granted(scope, settings)? {
        return Ok(());
    }

    // The dialog wait is unbounded, so the reservation is a flag rather than a
    // held lock: a pending prompt must not stall every other command.
    let Some(_ticket) = prompt_gate.reserve() else {
        return Err(CONSENT_REQUIRED_ERROR.to_string());
    };
    if consent_granted(scope, settings)? {
        return Ok(());
    }

    let approved = {
        let _suspension = suspend_os_automation().await?;
        prompt().await
    };
    if !approved {
        let _ = clear_consent(scope, settings);
        return Err(CONSENT_REQUIRED_ERROR.to_string());
    }

    write_consent(scope, settings, &ComputerUseConsent::accept())
}

/// F20 (audit 2026-08-21, recovery): refusing synthetic input command by
/// command only holds while every emitter is a command. The script executor,
/// the autonomous agent loop and the LLM UI tools all reach `MouseSimulator`
/// without one, so the prompt instead takes the process-wide OS-automation lock
/// that every synthetic click, keystroke, clipboard write and screen capture in
/// this process has to take. While the user is deciding there is no thread left
/// that can press the dialog's buttons, and none that can photograph where they
/// are.
///
/// The lock is parked on its own thread rather than held by the caller: the
/// dialog wait is unbounded and the guard is neither `Send` nor safe to hold
/// across an await.
struct SuspendedOsAutomation {
    release: Option<std::sync::mpsc::Sender<()>>,
    holder: Option<std::thread::JoinHandle<()>>,
}

impl SuspendedOsAutomation {
    fn begin() -> Result<Self, String> {
        let (held_tx, held_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel::<()>();
        let holder = std::thread::spawn(move || {
            let held = lock_os_automation();
            if held_tx.send(held.is_ok()).is_err() || held.is_err() {
                return;
            }
            let _ = release_rx.recv();
        });

        match held_rx.recv() {
            Ok(true) => Ok(Self {
                release: Some(release_tx),
                holder: Some(holder),
            }),
            _ => Err(AUTOMATION_NOT_SUSPENDED_ERROR.to_string()),
        }
    }
}

impl Drop for SuspendedOsAutomation {
    fn drop(&mut self) {
        self.release = None;
        if let Some(holder) = self.holder.take() {
            let _ = holder.join();
        }
    }
}

async fn suspend_os_automation() -> Result<SuspendedOsAutomation, String> {
    tokio::task::spawn_blocking(SuspendedOsAutomation::begin)
        .await
        .unwrap_or_else(|_| Err(AUTOMATION_NOT_SUSPENDED_ERROR.to_string()))
}

fn refuse_while_prompt_is_open(prompt_gate: &ConsentPrompt) -> Result<(), String> {
    if prompt_gate.is_open() {
        return Err(CONSENT_PROMPT_BUSY_ERROR.to_string());
    }
    Ok(())
}

async fn native_consent_prompt(app_handle: tauri::AppHandle) -> bool {
    tokio::task::spawn_blocking(move || {
        app_handle
            .dialog()
            .message(CONSENT_PROMPT_BODY)
            .title(CONSENT_PROMPT_TITLE)
            .kind(MessageDialogKind::Warning)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Allow".to_string(),
                "Don't allow".to_string(),
            ))
            .blocking_show()
    })
    .await
    .unwrap_or(false)
}

fn consent_granted(scope: &ConsentScope, settings: &SettingsServiceState) -> Result<bool, String> {
    let service = settings
        .service
        .lock()
        .map_err(|e| format!("Failed to read computer-use consent: {e}"))?;
    Ok(load_consent(scope, &service).is_valid())
}

fn write_consent(
    scope: &ConsentScope,
    settings: &SettingsServiceState,
    consent: &ComputerUseConsent,
) -> Result<(), String> {
    let service = settings
        .service
        .lock()
        .map_err(|e| format!("Failed to record computer-use consent: {e}"))?;
    persist_consent(scope, &service, consent)
        .map_err(|e| format!("Failed to record computer-use consent: {e}"))
}

fn clear_consent(scope: &ConsentScope, settings: &SettingsServiceState) -> Result<(), String> {
    let service = settings
        .service
        .lock()
        .map_err(|e| format!("Failed to clear computer-use consent: {e}"))?;
    revoke_consent(scope, &service)
        .map_err(|e| format!("Failed to clear computer-use consent: {e}"))
}

#[tauri::command]
pub async fn computer_use_start_session(
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
    settings: State<'_, SettingsServiceState>,
) -> Result<String, String> {
    require_consent(&app_handle, &settings).await?;
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
    settings: State<'_, SettingsServiceState>,
) -> Result<ScreenCapture, String> {
    require_consent(&app_handle, &settings).await?;
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


async fn click_inner(x: i32, y: i32, state: &Arc<Mutex<ComputerUseState>>) -> Result<(), String> {
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

async fn type_text_inner(text: String, state: &Arc<Mutex<ComputerUseState>>) -> Result<(), String> {
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
    settings: State<'_, SettingsServiceState>,
) -> Result<(), String> {
    require_consent(&app_handle, &settings).await?;
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
    settings: State<'_, SettingsServiceState>,
) -> Result<(), String> {
    require_consent(&app_handle, &settings).await?;
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
    settings: State<'_, SettingsServiceState>,
) -> Result<(), String> {
    require_consent(&app_handle, &settings).await?;
    require_confirmation(
        &app_handle,
        "computer_use_type_text",
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
    settings: State<'_, SettingsServiceState>,
) -> Result<serde_json::Value, String> {
    require_consent(&app_handle, &settings).await?;
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

            // Dispatcher is already gated above (~line 429); call inner directly.
            let result = zoom_region_inner(request, state.inner()).await?;
            serde_json::to_value(result).map_err(|e| format!("Serialization error: {}", e))
        }
        "zoom_at_point" => {
            let x = args["x"].as_i64().ok_or("Missing x coordinate")? as i32;
            let y = args["y"].as_i64().ok_or("Missing y coordinate")? as i32;
            let context_size = args["context_size"].as_u64().map(|v| v as u32);
            let zoom_level = args["zoom_level"].as_f64().map(|v| v as f32);

            let size = context_size.unwrap_or(100);
            let level = zoom_level.unwrap_or(4.0);
            let half = (size / 2) as i32;
            let req = ZoomRegionRequest {
                x: x - half,
                y: y - half,
                width: size,
                height: size,
                zoom_level: level,
                interpolation: None,
                save_path: None,
            };
            // Dispatcher is already gated above (~line 429); call inner directly.
            let result = zoom_region_inner(req, state.inner()).await?;
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

#[tauri::command]
pub async fn computer_use_zoom_region(
    request: ZoomRegionRequest,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    app_handle: tauri::AppHandle,
    settings: State<'_, SettingsServiceState>,
) -> Result<ZoomRegionResponse, String> {
    require_consent(&app_handle, &settings).await?;
    require_confirmation(
        &app_handle,
        "computer_use_zoom_region",
        serde_json::json!({
            "x": request.x,
            "y": request.y,
            "width": request.width,
            "height": request.height,
            "zoom_level": request.zoom_level,
        }),
    )
    .await?;

    zoom_region_inner(request, state.inner()).await
}

async fn zoom_region_inner(
    request: ZoomRegionRequest,
    state: &Arc<Mutex<ComputerUseState>>,
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
        // SECURITY: confine the screenshot to an app-controlled screenshots dir.
        // Treat save_path as a FILENAME only (strip any directory/traversal
        // components) so a model can't write a PNG to an arbitrary location.
        let file_name = std::path::Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "zoom.png".to_string());
        let screenshots_dir = crate::sys::utils::app_data_dir()
            .map_err(|e| format!("Failed to resolve app data dir: {}", e))?
            .join("screenshots");
        std::fs::create_dir_all(&screenshots_dir)
            .map_err(|e| format!("Failed to create screenshots dir: {}", e))?;
        let confined = screenshots_dir.join(file_name);
        action = action.with_save_path(confined.to_string_lossy().to_string());
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
    app_handle: tauri::AppHandle,
    settings: State<'_, SettingsServiceState>,
) -> Result<ZoomRegionResponse, String> {
    require_consent(&app_handle, &settings).await?;
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

    require_confirmation(
        &app_handle,
        "computer_use_zoom_at_point",
        serde_json::json!({
            "x": request.x,
            "y": request.y,
            "width": request.width,
            "height": request.height,
            "zoom_level": request.zoom_level,
        }),
    )
    .await?;

    zoom_region_inner(request, state.inner()).await
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

fn validate_opa_execution_boundary(
    execution_mode: Option<crate::sys::commands::chat::types::ChatExecutionMode>,
    provider: Option<Provider>,
) -> Result<(), String> {
    use crate::sys::commands::chat::types::ChatExecutionMode;

    let (Some(mode), Some(provider)) = (execution_mode, provider) else {
        return Ok(());
    };
    let is_local = matches!(
        provider,
        Provider::Ollama | Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm
    );
    match mode {
        ChatExecutionMode::LocalOnly if !is_local => Err(format!(
            "execution_mode 'local_only' cannot use non-local provider '{}'; omit the provider or fork the task to BYOK",
            provider.as_string()
        )),
        ChatExecutionMode::Byok if is_local || provider == Provider::ManagedCloud => Err(format!(
            "execution_mode 'byok' requires a direct vendor provider, got '{}'",
            provider.as_string()
        )),
        ChatExecutionMode::CloudManaged if is_local => Err(format!(
            "execution_mode 'cloud_managed' cannot run on local provider '{}'",
            provider.as_string()
        )),
        _ => Ok(()),
    }
}

const OPA_CANCELLATION_ACK_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_OPA_PRE_CANCELLED_EXECUTIONS: usize = 128;
// Bound replay memory in the long-lived native process. UUID entropy remains the
// primary uniqueness guarantee once an old completion ages out of this cache.
const MAX_OPA_COMPLETED_EXECUTIONS: usize = 256;

enum OpaExecutionRegistration {
    Active(OpaExecutionControl),
    CancelledBeforeStart,
}

fn validate_opa_execution_id(execution_id: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(execution_id)
        .map(|_| ())
        .map_err(|_| "computer-use execution_id must be a UUID".to_string())
}

fn remember_completed_opa_execution(state: &mut ComputerUseState, execution_id: &str) {
    if state
        .opa_completed_executions
        .iter()
        .any(|completed| completed == execution_id)
    {
        return;
    }
    if state.opa_completed_executions.len() >= MAX_OPA_COMPLETED_EXECUTIONS {
        state.opa_completed_executions.pop_front();
    }
    state
        .opa_completed_executions
        .push_back(execution_id.to_string());
}

async fn register_opa_execution(
    state: &Arc<Mutex<ComputerUseState>>,
    execution_id: &str,
) -> Result<OpaExecutionRegistration, String> {
    validate_opa_execution_id(execution_id)?;
    let mut computer_state = state.lock().await;
    if computer_state
        .opa_completed_executions
        .iter()
        .any(|completed| completed == execution_id)
    {
        return Err(format!(
            "computer-use execution '{execution_id}' has already completed and cannot be reused"
        ));
    }
    if computer_state
        .opa_cancelled_before_start
        .remove(execution_id)
    {
        remember_completed_opa_execution(&mut computer_state, execution_id);
        return Ok(OpaExecutionRegistration::CancelledBeforeStart);
    }
    if computer_state.opa_executions.contains_key(execution_id) {
        return Err(format!(
            "computer-use execution '{execution_id}' is already active"
        ));
    }
    if let Some(active_execution_id) = computer_state.opa_executions.keys().next() {
        return Err(format!(
            "computer-use execution '{active_execution_id}' already owns desktop control"
        ));
    }

    let control = OpaExecutionControl::new();
    computer_state
        .opa_executions
        .insert(execution_id.to_string(), control.clone());
    Ok(OpaExecutionRegistration::Active(control))
}

async fn finish_opa_execution(
    state: &Arc<Mutex<ComputerUseState>>,
    execution_id: &str,
    control: &OpaExecutionControl,
) {
    let mut computer_state = state.lock().await;
    computer_state.opa_executions.remove(execution_id);
    remember_completed_opa_execution(&mut computer_state, execution_id);
    control.finished.cancel();
}

async fn cancel_opa_execution(
    state: &Arc<Mutex<ComputerUseState>>,
    execution_id: &str,
) -> Result<bool, String> {
    validate_opa_execution_id(execution_id)?;
    let control = {
        let mut computer_state = state.lock().await;
        let control = computer_state.opa_executions.get(execution_id).cloned();
        if control.is_none() {
            if computer_state
                .opa_completed_executions
                .iter()
                .any(|completed| completed == execution_id)
            {
                return Ok(true);
            }
            if computer_state
                .opa_cancelled_before_start
                .contains(execution_id)
            {
                return Ok(true);
            }
            if computer_state.opa_cancelled_before_start.len() >= MAX_OPA_PRE_CANCELLED_EXECUTIONS {
                return Err(
                    "too many computer-use executions are awaiting start cancellation".to_string(),
                );
            }
            // Tauri dispatches async commands independently. Stop can therefore
            // arrive before the earlier execute invoke registers. Reserve this
            // UUID as revoked so a late execute consumes the reservation and
            // returns a cancelled result without taking any OS action.
            computer_state
                .opa_cancelled_before_start
                .insert(execution_id.to_string());
            return Ok(true);
        }
        control
    };
    let control = control.expect("active execution control checked while holding the state lock");

    control.cancellation.cancel();
    tokio::time::timeout(OPA_CANCELLATION_ACK_TIMEOUT, control.finished.cancelled())
        .await
        .map_err(|_| {
            format!("timed out waiting for computer-use execution '{execution_id}' to stop")
        })?;
    Ok(true)
}

async fn await_opa_or_cancellation<T>(
    cancellation: &CancellationToken,
    execution: impl Future<Output = T>,
) -> Option<T> {
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => None,
        result = execution => Some(result),
    }
}

fn cancelled_opa_result() -> serde_json::Value {
    serde_json::json!({
        "success": false,
        "reason": { "type": "user_cancelled" },
        "state": ExecutionState::default(),
        "outcome": TaskOutcome::failure(
            0,
            0,
            "Computer-use action was cancelled.".to_string(),
            Vec::new(),
        ),
    })
}

/// Executes an OPA (Observe-Plan-Act) computer use task.
///
/// Stream 2 params:
/// - `model`: explicit vision-capable model id from the catalog. `None` lets the
///   router pick the user's default vision model.
/// - `provider`: explicit provider name (`anthropic`, `openai`, `google`,
///   `xai`, etc). `None` resolves from the model id.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn computer_use_execute_opa_task(
    execution_id: String,
    description: String,
    timeout_ms: Option<u64>,
    max_actions: Option<u32>,
    target_application: Option<String>,
    success_indicators: Option<Vec<String>>,
    model: Option<String>,
    provider: Option<String>,
    // TRUST BOUNDARY (desktop-trust-boundary-01): the active session's
    // execution boundary. Optional so existing callers keep compiling; when
    // omitted the router's fail-closed default keeps this Local-only rather
    // than silently reaching whatever `provider` above names.
    execution_mode: Option<crate::sys::commands::chat::types::ChatExecutionMode>,
    app_handle: tauri::AppHandle,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
    llm_state: State<'_, LLMState>,
    permissions_state: State<'_, Arc<AppPermissionManager>>,
    settings: State<'_, SettingsServiceState>,
) -> Result<serde_json::Value, String> {
    require_consent(&app_handle, &settings).await?;

    let router = llm_state.router.clone();

    let timeout_duration = Duration::from_millis(timeout_ms.unwrap_or(300_000));
    let iterations = max_actions.unwrap_or(100);

    let resolved_provider = provider.as_deref().and_then(Provider::from_string);

    validate_opa_execution_boundary(execution_mode, resolved_provider)?;

    let config = ComputerUseConfig {
        max_iterations: iterations,
        max_duration: timeout_duration,
        model,
        provider: resolved_provider,
        trust_mode: execution_mode.map(|mode| mode.trust_mode()),
        ..ComputerUseConfig::default()
    };

    // Stream 1: wire the per-app permission manager into the agent so the
    // safety layer's `check_app_permission` consults the active foreground
    // app on every action. Closes the gap from today's audit.
    let agent =
        ComputerUseAgent::with_app_permissions(router, config, permissions_state.inner().clone())
            .map_err(|e| format!("Failed to create ComputerUseAgent: {}", e))?
            .with_app_handle(app_handle);

    let task = ComputerUseTask {
        id: execution_id.clone(),
        description,
        timeout_ms: timeout_ms.unwrap_or(300_000),
        max_actions: max_actions.unwrap_or(100),
        target_application,
        success_indicators: success_indicators.unwrap_or_default(),
        ..ComputerUseTask::default()
    };

    let control = match register_opa_execution(state.inner(), &execution_id).await? {
        OpaExecutionRegistration::Active(control) => control,
        OpaExecutionRegistration::CancelledBeforeStart => {
            return Ok(cancelled_opa_result());
        }
    };
    let result = await_opa_or_cancellation(&control.cancellation, agent.execute_task(task)).await;
    finish_opa_execution(state.inner(), &execution_id, &control).await;

    let Some(result) = result else {
        return Ok(cancelled_opa_result());
    };
    let result = result.map_err(|e| format!("OPA task execution failed: {}", e))?;

    let value = serde_json::json!({
        "success": result.success,
        "reason": result.reason,
        "state": result.state,
        "outcome": result.outcome,
    });

    Ok(value)
}

/// Cancels one exact OPA execution and does not acknowledge until the native
/// execution future has been dropped. The UUID is the caller's ownership
/// handle; stale UI sessions cannot cancel a newer run by using ambient state.
#[tauri::command]
pub async fn computer_use_cancel_opa_task(
    execution_id: String,
    state: State<'_, Arc<Mutex<ComputerUseState>>>,
) -> Result<bool, String> {
    cancel_opa_execution(state.inner(), &execution_id).await
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

async fn persist_permissions(app_handle: &tauri::AppHandle, mgr: &Arc<AppPermissionManager>) {
    use tauri::Manager as _;
    let path = match app_handle.path().app_data_dir() {
        Ok(dir) => dir.join("app_permissions.json"),
        Err(e) => {
            tracing::warn!(
                "Could not resolve app_data_dir for app_permissions.json: {}",
                e
            );
            return;
        }
    };

    match mgr.to_json().await {
        Ok(json) => {
            if let Err(e) = tokio::fs::write(&path, json).await {
                tracing::warn!(
                    "Failed to persist app_permissions.json at {:?}: {}",
                    path,
                    e
                );
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::automation::computer_use::{CONSENT_SETTINGS_KEY, CONSENT_VERSION};
    use crate::data::settings::{SettingCategory, SettingValue, SettingsService};
    use crate::sys::commands::chat::types::ChatExecutionMode;
    use rusqlite::Connection;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

    fn settings_state() -> SettingsServiceState {
        let conn = Connection::open_in_memory().expect("in-memory settings database");
        conn.execute(
            "CREATE TABLE settings_v2 (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                category TEXT NOT NULL,
                encrypted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )",
            [],
        )
        .expect("create settings table");
        SettingsServiceState::new(
            SettingsService::new(Arc::new(std::sync::Mutex::new(conn))).expect("settings service"),
        )
    }

    fn counting_prompt(
        answer: bool,
        calls: &Arc<AtomicUsize>,
    ) -> impl FnOnce() -> std::future::Ready<bool> {
        let calls = calls.clone();
        move || {
            calls.fetch_add(1, Ordering::SeqCst);
            std::future::ready(answer)
        }
    }

    fn fixed_prompt(answer: bool) -> impl FnOnce() -> std::future::Ready<bool> {
        move || std::future::ready(answer)
    }

    fn first_statement_of(source: &str, signature: &str) -> String {
        let after = source
            .split(signature)
            .nth(1)
            .unwrap_or_else(|| panic!("{signature} is missing from this file"));
        let (_, body) = after
            .split_once("> {\n")
            .unwrap_or_else(|| panic!("{signature} has no recognizable body"));
        body.trim_start()
            .lines()
            .next()
            .unwrap_or_default()
            .trim()
            .to_string()
    }

    #[tokio::test]
    async fn desktop_control_is_refused_until_the_native_prompt_is_approved() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        let refusal =
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .expect_err("unconsented desktop control");
        assert_eq!(refusal, CONSENT_REQUIRED_ERROR);

        // A fresh gate stands in for asking again after the cooldown.
        let gate = ConsentPrompt::default();
        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(true, &prompts)).await,
            Ok(())
        );
        assert_eq!(prompts.load(Ordering::SeqCst), 2);

        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts)).await,
            Ok(())
        );
        assert_eq!(
            prompts.load(Ordering::SeqCst),
            2,
            "an approved grant must not re-prompt"
        );

        write_consent(&scope, &settings, &ComputerUseConsent::not_accepted())
            .expect("revoke consent");
        let gate = ConsentPrompt::default();
        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .expect_err("revoked consent must stop new sessions"),
            CONSENT_REQUIRED_ERROR
        );
    }

    /// F20 (audit 2026-08-21): `settings_v2_set` writes any key the renderer
    /// names, so the same caller that can invoke a computer-use command can
    /// write this row first. Only a grant bound to the per-install secret
    /// opens the gate; the forged row is ignored and the user is still asked.
    #[tokio::test]
    async fn a_consent_row_written_through_settings_does_not_open_the_gate() {
        let settings = settings_state();
        settings
            .service
            .lock()
            .expect("settings lock")
            .set(
                CONSENT_SETTINGS_KEY.to_string(),
                SettingValue::Json(serde_json::json!({
                    "accepted": true,
                    "accepted_at": "2026-08-21T00:00:00Z",
                    "version": CONSENT_VERSION,
                })),
                SettingCategory::Security,
                false,
            )
            .expect("write forged consent row");

        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));
        assert_eq!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .expect_err("a forged settings row is not consent"),
            CONSENT_REQUIRED_ERROR
        );
        assert_eq!(prompts.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn synthetic_input_cannot_answer_the_consent_prompt() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let synthetic_input = Arc::new(std::sync::Mutex::new(Vec::<String>::new()));

        let attempts = Arc::clone(&synthetic_input);
        let open_gate = &gate;
        let open_scope = &scope;
        let open_settings = &settings;
        let prompt = move || async move {
            // Everything a renderer could drive at the alert runs through the
            // same gate, so record what each attempt is told while it is up.
            let refused_input = refuse_while_prompt_is_open(open_gate)
                .expect_err("synthetic input while the prompt is open");
            let refused_gate =
                require_consent_via(open_scope, open_settings, open_gate, fixed_prompt(true))
                    .await
                    .expect_err("a second gate entry while the prompt is open");
            let mut attempts = attempts.lock().expect("attempt log");
            attempts.push(refused_input);
            attempts.push(refused_gate);
            false
        };

        assert_eq!(
            require_consent_via(&scope, &settings, &gate, prompt)
                .await
                .expect_err("an unanswered prompt must not grant desktop control"),
            CONSENT_REQUIRED_ERROR
        );
        assert_eq!(
            *synthetic_input.lock().expect("attempt log"),
            vec![
                CONSENT_PROMPT_BUSY_ERROR.to_string(),
                CONSENT_PROMPT_BUSY_ERROR.to_string()
            ]
        );
        assert!(
            !consent_granted(&scope, &settings).expect("read consent"),
            "input synthesized during the prompt must not mint a grant"
        );
    }

    #[tokio::test]
    async fn nothing_in_this_process_can_synthesize_input_while_the_prompt_is_up() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let (reached_os, os_was_reached) = std::sync::mpsc::channel::<()>();
        let synthetic_input = std::sync::Mutex::new(None);

        let probe = &synthetic_input;
        let blocked = &os_was_reached;
        let prompt = move || async move {
            *probe.lock().expect("probe slot") = Some(std::thread::spawn(move || {
                let _os_automation = lock_os_automation().expect("OS automation lock");
                let _ = reached_os.send(());
            }));
            blocked.recv_timeout(Duration::from_millis(250)).is_err()
        };

        assert_eq!(
            require_consent_via(&scope, &settings, &gate, prompt).await,
            Ok(()),
            "synthetic input reached the OS while the consent prompt was on screen"
        );
        os_was_reached
            .recv_timeout(Duration::from_secs(5))
            .expect("automation must resume once the prompt has been answered");
        synthetic_input
            .lock()
            .expect("probe slot")
            .take()
            .expect("probe thread")
            .join()
            .expect("probe thread");
    }

    /// The gate is only a gate while it runs first.
    #[tokio::test]
    async fn a_refused_gate_never_reaches_the_action() {
        let performed = Arc::new(AtomicBool::new(false));
        let action = {
            let performed = Arc::clone(&performed);
            async move {
                performed.store(true, Ordering::SeqCst);
                Ok(())
            }
        };

        let refusal = run_when_consented(
            std::future::ready(Err(CONSENT_REQUIRED_ERROR.to_string())),
            action,
        )
        .await
        .expect_err("a refused gate must refuse the action");
        assert_eq!(refusal, CONSENT_REQUIRED_ERROR);
        assert!(
            !performed.load(Ordering::SeqCst),
            "the action must not run before consent is verified"
        );
    }

    #[tokio::test]
    async fn stale_or_malformed_consent_records_are_refused() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        let mut stale = ComputerUseConsent::accept();
        stale.version = "0.9".to_string();
        write_consent(&scope, &settings, &stale).expect("persist stale consent");
        assert!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .is_err()
        );

        settings
            .service
            .lock()
            .expect("settings lock")
            .set(
                CONSENT_SETTINGS_KEY.to_string(),
                SettingValue::Boolean(true),
                SettingCategory::Security,
                false,
            )
            .expect("persist malformed consent");
        let gate = ConsentPrompt::default();
        assert!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                .await
                .is_err()
        );
    }

    /// A shown prompt must not become a wall of dialogs the next `invoke()`
    /// storm can push the user through, whatever the answer was.
    #[tokio::test]
    async fn a_shown_prompt_is_not_reopened_by_a_command_storm() {
        let settings = settings_state();
        let scope = ConsentScope::new();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        for _ in 0..5 {
            assert_eq!(
                require_consent_via(&scope, &settings, &gate, counting_prompt(false, &prompts))
                    .await
                    .expect_err("a refused prompt must keep computer use closed"),
                CONSENT_REQUIRED_ERROR
            );
        }
        assert_eq!(
            prompts.load(Ordering::SeqCst),
            1,
            "showing the prompt must silence it for the cooldown window"
        );
    }

    /// An approval this machine cannot bind a grant to is still an approval the
    /// user answered, so it must not reopen the prompt on the next command.
    #[tokio::test]
    async fn an_approval_that_cannot_be_recorded_does_not_reopen_the_prompt() {
        let settings = settings_state();
        let scope = ConsentScope::unbindable();
        let gate = ConsentPrompt::default();
        let prompts = Arc::new(AtomicUsize::new(0));

        let unrecordable =
            require_consent_via(&scope, &settings, &gate, counting_prompt(true, &prompts))
                .await
                .expect_err("a grant that cannot be sealed is not consent");
        assert!(unrecordable.contains("Failed to record computer-use consent"));

        assert!(
            require_consent_via(&scope, &settings, &gate, counting_prompt(true, &prompts))
                .await
                .is_err()
        );
        assert_eq!(
            prompts.load(Ordering::SeqCst),
            1,
            "the cooldown is stamped when the dialog is shown, not when it is answered"
        );
    }

    /// Tauri commands cannot be invoked without a running app, so this guards
    /// the wiring itself: every command that can act on the desktop must open
    /// with the persisted-consent gate. Asserting the first statement, not just
    /// that the call appears somewhere, keeps the gate from drifting below the
    /// action it is supposed to precede.
    #[test]
    fn every_acting_computer_use_command_opens_with_the_consent_gate() {
        const SOURCE: &str = include_str!("computer_use.rs");
        for command in [
            "pub async fn computer_use_start_session(",
            "pub async fn computer_use_capture_screen(",
            "pub async fn computer_use_click(",
            "pub async fn computer_use_move_mouse(",
            "pub async fn computer_use_type_text(",
            "pub async fn computer_use_execute_tool(",
            "pub async fn computer_use_zoom_region(",
            "pub async fn computer_use_zoom_at_point(",
            "pub async fn computer_use_execute_opa_task(",
        ] {
            assert_eq!(
                first_statement_of(SOURCE, command),
                "require_consent(&app_handle, &settings).await?;",
                "{command} must refuse to act before it checks persisted computer-use consent"
            );
        }
    }

    /// The gate is only worth the name while the webview cannot answer it for
    /// the user: an IPC command that records acceptance would put the grant
    /// back within reach of the caller it exists to stop.
    #[test]
    fn no_ipc_command_records_computer_use_consent() {
        const SOURCE: &str = include_str!("computer_use.rs");
        let shipped = SOURCE.split("#[cfg(test)]").next().expect("shipped source");
        let commands: Vec<&str> = shipped.split("#[tauri::command]").skip(1).collect();
        assert!(!commands.is_empty(), "no commands found to scan");
        for body in commands {
            assert!(
                !body.contains("write_consent("),
                "only the native prompt may record computer-use consent"
            );
        }
    }

    #[test]
    fn absent_execution_mode_or_provider_passes() {
        assert!(validate_opa_execution_boundary(None, None).is_ok());
        assert!(validate_opa_execution_boundary(None, Some(Provider::Anthropic)).is_ok());
        assert!(validate_opa_execution_boundary(Some(ChatExecutionMode::LocalOnly), None).is_ok());
    }

    #[test]
    fn local_only_rejects_non_local_providers() {
        for provider in [
            Provider::Anthropic,
            Provider::OpenAI,
            Provider::ManagedCloud,
        ] {
            let err =
                validate_opa_execution_boundary(Some(ChatExecutionMode::LocalOnly), Some(provider))
                    .unwrap_err();
            assert!(err.contains("local_only"), "unexpected error: {err}");
        }
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::LocalOnly),
            Some(Provider::Ollama)
        )
        .is_ok());
    }

    #[test]
    fn byok_rejects_managed_cloud_and_local_providers() {
        for provider in [Provider::ManagedCloud, Provider::Ollama, Provider::LmStudio] {
            let err =
                validate_opa_execution_boundary(Some(ChatExecutionMode::Byok), Some(provider))
                    .unwrap_err();
            assert!(err.contains("byok"), "unexpected error: {err}");
        }
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::Byok),
            Some(Provider::Anthropic)
        )
        .is_ok());
    }

    #[test]
    fn cloud_managed_rejects_local_providers_but_allows_vendor_hints() {
        let err = validate_opa_execution_boundary(
            Some(ChatExecutionMode::CloudManaged),
            Some(Provider::Vllm),
        )
        .unwrap_err();
        assert!(err.contains("cloud_managed"), "unexpected error: {err}");
        // Vendor strings under the managed boundary are model-family hints;
        // the router's ManagedCloud trust filter prevents direct egress.
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::CloudManaged),
            Some(Provider::Anthropic)
        )
        .is_ok());
        assert!(validate_opa_execution_boundary(
            Some(ChatExecutionMode::CloudManaged),
            Some(Provider::ManagedCloud)
        )
        .is_ok());
    }

    #[tokio::test]
    async fn recently_completed_opa_execution_ids_cannot_be_reused() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let execution_id = uuid::Uuid::new_v4().to_string();
        let OpaExecutionRegistration::Active(control) =
            register_opa_execution(&state, &execution_id)
                .await
                .expect("first owner should register")
        else {
            panic!("fresh execution must not be pre-cancelled");
        };

        let duplicate = register_opa_execution(&state, &execution_id)
            .await
            .err()
            .expect("duplicate owner must be rejected");
        assert!(duplicate.contains("already active"));

        finish_opa_execution(&state, &execution_id, &control).await;
        let reuse = register_opa_execution(&state, &execution_id)
            .await
            .err()
            .expect("a retained completed UUID must not acquire desktop control again");
        assert!(reuse.contains("already completed"));
    }

    #[tokio::test]
    async fn distinct_opa_executions_cannot_control_the_desktop_concurrently() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let first_id = uuid::Uuid::new_v4().to_string();
        let second_id = uuid::Uuid::new_v4().to_string();
        let OpaExecutionRegistration::Active(first) = register_opa_execution(&state, &first_id)
            .await
            .expect("first execution should register")
        else {
            panic!("fresh execution must not be pre-cancelled");
        };

        let overlap = register_opa_execution(&state, &second_id)
            .await
            .err()
            .expect("a second desktop-control owner must be rejected");
        assert!(overlap.contains("already owns desktop control"));

        finish_opa_execution(&state, &first_id, &first).await;
        let OpaExecutionRegistration::Active(second) = register_opa_execution(&state, &second_id)
            .await
            .expect("the next owner may start after shutdown")
        else {
            panic!("second execution was not pre-cancelled");
        };
        finish_opa_execution(&state, &second_id, &second).await;
    }

    #[tokio::test]
    async fn cancellation_before_registration_revokes_a_late_execution() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let execution_id = uuid::Uuid::new_v4().to_string();

        assert_eq!(
            cancel_opa_execution(&state, &execution_id).await,
            Ok(true),
            "Stop must reserve an unknown valid UUID as revoked"
        );
        assert!(matches!(
            register_opa_execution(&state, &execution_id)
                .await
                .expect("late registration should consume the cancellation reservation"),
            OpaExecutionRegistration::CancelledBeforeStart
        ));
        assert!(state.lock().await.opa_executions.is_empty());
        assert_eq!(
            cancel_opa_execution(&state, &execution_id).await,
            Ok(true),
            "a consumed pre-cancellation remains idempotent"
        );
    }

    #[tokio::test]
    async fn cancellation_after_completion_does_not_consume_pre_start_capacity() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));

        for _ in 0..=MAX_OPA_PRE_CANCELLED_EXECUTIONS {
            let execution_id = uuid::Uuid::new_v4().to_string();
            let OpaExecutionRegistration::Active(control) =
                register_opa_execution(&state, &execution_id)
                    .await
                    .expect("fresh execution should register")
            else {
                panic!("fresh execution must not be pre-cancelled");
            };
            finish_opa_execution(&state, &execution_id, &control).await;
            assert_eq!(cancel_opa_execution(&state, &execution_id).await, Ok(true));
        }

        assert!(state.lock().await.opa_cancelled_before_start.is_empty());
        let future_execution_id = uuid::Uuid::new_v4().to_string();
        assert_eq!(
            cancel_opa_execution(&state, &future_execution_id).await,
            Ok(true),
            "post-completion retries must not exhaust legitimate stop-before-start reservations"
        );
    }

    #[tokio::test]
    async fn cancellation_waits_for_native_execution_shutdown() {
        let state = Arc::new(Mutex::new(ComputerUseState::new()));
        let execution_id = uuid::Uuid::new_v4().to_string();
        let OpaExecutionRegistration::Active(control) =
            register_opa_execution(&state, &execution_id)
                .await
                .expect("execution should register")
        else {
            panic!("fresh execution must not be pre-cancelled");
        };

        let cancel_state = Arc::clone(&state);
        let cancel_id = execution_id.clone();
        let cancellation =
            tokio::spawn(async move { cancel_opa_execution(&cancel_state, &cancel_id).await });
        tokio::task::yield_now().await;

        assert!(control.cancellation.is_cancelled());
        assert!(
            !cancellation.is_finished(),
            "cancellation must not acknowledge before the executor finishes"
        );

        finish_opa_execution(&state, &execution_id, &control).await;
        assert_eq!(
            cancellation.await.expect("cancel task should join"),
            Ok(true)
        );
        assert_eq!(
            cancel_opa_execution(&state, &execution_id).await,
            Ok(true),
            "repeated cancellation should keep the execution UUID revoked"
        );
    }

    #[tokio::test]
    async fn cancellation_drops_the_in_flight_opa_future() {
        struct DropProbe(Arc<AtomicBool>);
        impl Drop for DropProbe {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }

        let cancellation = CancellationToken::new();
        let dropped = Arc::new(AtomicBool::new(false));
        let probe = DropProbe(Arc::clone(&dropped));
        let execution = async move {
            let _probe = probe;
            std::future::pending::<()>().await;
        };

        cancellation.cancel();
        assert!(await_opa_or_cancellation(&cancellation, execution)
            .await
            .is_none());
        assert!(dropped.load(Ordering::SeqCst));
    }

    #[test]
    fn opa_execution_id_must_be_a_uuid() {
        let error = validate_opa_execution_id("account-a-current-task")
            .expect_err("unbounded caller labels must be rejected");
        assert!(error.contains("UUID"));
    }
}
