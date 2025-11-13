use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Represents a single recorded action
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordedAction {
    pub id: String,
    pub action_type: ActionType,
    pub timestamp_ms: u64,
    pub target: Option<ElementTarget>,
    pub value: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionType {
    Click,
    RightClick,
    DoubleClick,
    Type,
    Hotkey,
    Wait,
    Screenshot,
    Drag,
    Scroll,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementTarget {
    pub x: i32,
    pub y: i32,
    pub element_id: Option<String>,
    pub element_name: Option<String>,
    pub element_type: Option<String>,
}

/// Recording session information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub session_id: String,
    pub start_time: u64,
    pub is_recording: bool,
}

/// Complete recording with all captured actions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recording {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub actions: Vec<RecordedAction>,
    pub duration_ms: u64,
    pub created_at: u64,
}

/// Internal state for the recorder
struct RecorderState {
    session: Option<RecordingSession>,
    start_instant: Option<Instant>,
    actions: VecDeque<RecordedAction>,
    last_action_time: Option<Instant>,
    app_handle: Option<AppHandle>,
}

/// Main recorder service
pub struct RecorderService {
    state: Arc<Mutex<RecorderState>>,
}

impl RecorderService {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(RecorderState {
                session: None,
                start_instant: None,
                actions: VecDeque::new(),
                last_action_time: None,
                app_handle: None,
            })),
        }
    }

    /// Set the app handle for emitting events
    pub fn set_app_handle(&self, app_handle: AppHandle) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;
        state.app_handle = Some(app_handle);
        Ok(())
    }

    /// Start a new recording session
    pub fn start_recording(&self) -> Result<RecordingSession> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        if state.session.is_some() {
            return Err(anyhow!("Recording already in progress"));
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let session = RecordingSession {
            session_id: Uuid::new_v4().to_string(),
            start_time: now,
            is_recording: true,
        };

        state.session = Some(session.clone());
        state.start_instant = Some(Instant::now());
        state.actions.clear();
        state.last_action_time = None;

        // Emit event
        if let Some(ref app_handle) = state.app_handle {
            let _ = app_handle.emit("automation:recording_started", &session);
        }

        tracing::info!("Recording started: session_id={}", session.session_id);
        Ok(session)
    }

    /// Stop the current recording session
    pub fn stop_recording(&self) -> Result<Recording> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        let session = state
            .session
            .take()
            .ok_or_else(|| anyhow!("No recording in progress"))?;

        let start_instant = state
            .start_instant
            .take()
            .ok_or_else(|| anyhow!("No start instant"))?;

        let duration_ms = start_instant.elapsed().as_millis() as u64;

        let recording = Recording {
            id: Uuid::new_v4().to_string(),
            name: format!("Recording {}", session.session_id),
            description: None,
            actions: state.actions.drain(..).collect(),
            duration_ms,
            created_at: session.start_time,
        };

        // Emit event
        if let Some(ref app_handle) = state.app_handle {
            let _ = app_handle.emit("automation:recording_stopped", &recording);
        }

        tracing::info!(
            "Recording stopped: {} actions, duration={}ms",
            recording.actions.len(),
            duration_ms
        );

        Ok(recording)
    }

    /// Record a click action
    pub fn record_click(&self, x: i32, y: i32, button: &str) -> Result<()> {
        let action_type = match button {
            "right" => ActionType::RightClick,
            _ => ActionType::Click,
        };

        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type,
            timestamp_ms: self.get_elapsed_ms()?,
            target: Some(ElementTarget {
                x,
                y,
                element_id: None,
                element_name: None,
                element_type: None,
            }),
            value: None,
            metadata: None,
        })
    }

    /// Record a typing action
    pub fn record_type(&self, text: &str, x: i32, y: i32) -> Result<()> {
        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Type,
            timestamp_ms: self.get_elapsed_ms()?,
            target: Some(ElementTarget {
                x,
                y,
                element_id: None,
                element_name: None,
                element_type: None,
            }),
            value: Some(text.to_string()),
            metadata: None,
        })
    }

    /// Record a hotkey action
    pub fn record_hotkey(&self, key: u16, modifiers: Vec<String>) -> Result<()> {
        let metadata = serde_json::json!({
            "key": key,
            "modifiers": modifiers,
        });

        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Hotkey,
            timestamp_ms: self.get_elapsed_ms()?,
            target: None,
            value: Some(format!("{:?}+{}", modifiers, key)),
            metadata: Some(metadata),
        })
    }

    /// Record a screenshot action
    pub fn record_screenshot(&self) -> Result<()> {
        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Screenshot,
            timestamp_ms: self.get_elapsed_ms()?,
            target: None,
            value: None,
            metadata: None,
        })
    }

    /// Record a wait action
    pub fn record_wait(&self, duration_ms: u64) -> Result<()> {
        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Wait,
            timestamp_ms: self.get_elapsed_ms()?,
            target: None,
            value: Some(duration_ms.to_string()),
            metadata: None,
        })
    }

    /// Record a drag action
    pub fn record_drag(&self, from_x: i32, from_y: i32, to_x: i32, to_y: i32) -> Result<()> {
        let metadata = serde_json::json!({
            "from_x": from_x,
            "from_y": from_y,
            "to_x": to_x,
            "to_y": to_y,
        });

        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Drag,
            timestamp_ms: self.get_elapsed_ms()?,
            target: Some(ElementTarget {
                x: from_x,
                y: from_y,
                element_id: None,
                element_name: None,
                element_type: None,
            }),
            value: Some(format!("({}, {}) -> ({}, {})", from_x, from_y, to_x, to_y)),
            metadata: Some(metadata),
        })
    }

    /// Check if currently recording
    pub fn is_recording(&self) -> bool {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.session.as_ref().map(|sess| sess.is_recording))
            .unwrap_or(false)
    }

    /// Get current session
    pub fn get_session(&self) -> Option<RecordingSession> {
        self.state.lock().ok().and_then(|s| s.session.clone())
    }

    /// Get elapsed milliseconds since recording started
    fn get_elapsed_ms(&self) -> Result<u64> {
        let state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        let start_instant = state
            .start_instant
            .as_ref()
            .ok_or_else(|| anyhow!("No recording in progress"))?;

        Ok(start_instant.elapsed().as_millis() as u64)
    }

    /// Internal method to record an action
    fn record_action(&self, action: RecordedAction) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        if state.session.is_none() {
            return Err(anyhow!("No recording in progress"));
        }

        // Filter out noise: ignore actions that are too close together
        let should_record = if let Some(last_time) = state.last_action_time {
            last_time.elapsed().as_millis() > 100 // 100ms debounce
        } else {
            true
        };

        if should_record {
            state.actions.push_back(action.clone());
            state.last_action_time = Some(Instant::now());

            // Emit event
            if let Some(ref app_handle) = state.app_handle {
                let _ = app_handle.emit("automation:action_recorded", &action);
            }

            tracing::debug!("Recorded action: {:?}", action.action_type);
        }

        Ok(())
    }
}

// Global recorder instance
use once_cell::sync::Lazy;

static RECORDER: Lazy<RecorderService> = Lazy::new(RecorderService::new);

pub fn global_recorder() -> &'static RecorderService {
    &RECORDER
}
