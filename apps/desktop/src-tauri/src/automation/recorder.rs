use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
#[cfg(not(test))]
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

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
    Narration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementTarget {
    pub x: i32,
    pub y: i32,
    pub element_id: Option<String>,
    pub element_name: Option<String>,
    pub element_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSession {
    pub session_id: String,
    pub start_time: u64,
    pub is_recording: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingStatus {
    pub session_id: String,
    pub start_time: u64,
    pub is_recording: bool,
    pub action_count: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscardedRecording {
    pub session_id: String,
    pub action_count: usize,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Recording {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub actions: Vec<RecordedAction>,
    pub duration_ms: u64,
    pub created_at: u64,
}

struct RecorderState {
    session: Option<RecordingSession>,
    start_instant: Option<Instant>,
    actions: VecDeque<RecordedAction>,
    last_recording: Option<Recording>,
    app_handle: Option<AppHandle>,
}

pub struct RecorderService {
    state: Arc<Mutex<RecorderState>>,
}

impl Default for RecorderService {
    fn default() -> Self {
        Self::new()
    }
}

impl RecorderService {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(RecorderState {
                session: None,
                start_instant: None,
                actions: VecDeque::new(),
                last_recording: None,
                app_handle: None,
            })),
        }
    }

    pub fn set_app_handle(&self, app_handle: AppHandle) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;
        state.app_handle = Some(app_handle);
        Ok(())
    }

    pub fn start_recording(&self) -> Result<RecordingSession> {
        #[cfg(not(test))]
        ensure_global_input_listener()?;

        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        if state.session.is_some() {
            return Err(anyhow!("Recording already in progress"));
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let session = RecordingSession {
            session_id: Uuid::new_v4().to_string(),
            start_time: now,
            is_recording: true,
        };

        state.session = Some(session.clone());
        state.start_instant = Some(Instant::now());
        state.actions.clear();
        state.last_recording = None;

        if let Some(ref app_handle) = state.app_handle {
            let _ = app_handle.emit("automation:recording_started", &session);
        }

        tracing::info!("Recording started: session_id={}", session.session_id);
        Ok(session)
    }

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
        state.last_recording = Some(recording.clone());

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

    pub fn discard_recording(&self) -> Result<DiscardedRecording> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;
        let session = state
            .session
            .take()
            .ok_or_else(|| anyhow!("No recording in progress"))?;
        let duration_ms = state
            .start_instant
            .take()
            .map(|started| started.elapsed().as_millis() as u64)
            .unwrap_or_default();
        let discarded = DiscardedRecording {
            session_id: session.session_id,
            action_count: state.actions.len(),
            duration_ms,
        };

        state.actions.clear();
        state.last_recording = None;
        if let Some(ref app_handle) = state.app_handle {
            let _ = app_handle.emit("automation:recording_discarded", &discarded);
        }

        tracing::info!(
            "Recording discarded: {} actions, duration={}ms",
            discarded.action_count,
            duration_ms
        );
        Ok(discarded)
    }

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

    pub fn record_scroll(&self, delta_x: i64, delta_y: i64, x: i32, y: i32) -> Result<()> {
        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Scroll,
            timestamp_ms: self.get_elapsed_ms()?,
            target: Some(ElementTarget {
                x,
                y,
                element_id: None,
                element_name: None,
                element_type: None,
            }),
            value: Some(format!("{delta_x},{delta_y}")),
            metadata: Some(serde_json::json!({
                "delta_x": delta_x,
                "delta_y": delta_y,
            })),
        })
    }

    pub fn record_narration(&self, text: &str) -> Result<()> {
        let text = text.trim();
        if text.is_empty() {
            return Err(anyhow!("Narration cannot be empty"));
        }

        self.record_action(RecordedAction {
            id: Uuid::new_v4().to_string(),
            action_type: ActionType::Narration,
            timestamp_ms: self.get_elapsed_ms()?,
            target: None,
            value: Some(text.to_string()),
            metadata: Some(serde_json::json!({
                "source": "microphone",
                "transcription": "local_whisper",
            })),
        })
    }

    pub fn is_recording(&self) -> bool {
        self.state
            .lock()
            .ok()
            .and_then(|s| s.session.as_ref().map(|sess| sess.is_recording))
            .unwrap_or(false)
    }

    pub fn get_session(&self) -> Option<RecordingSession> {
        self.state.lock().ok().and_then(|s| s.session.clone())
    }

    pub fn get_status(&self) -> Option<RecordingStatus> {
        self.state.lock().ok().and_then(|state| {
            let session = state.session.as_ref()?;
            Some(RecordingStatus {
                session_id: session.session_id.clone(),
                start_time: session.start_time,
                is_recording: session.is_recording,
                action_count: state.actions.len(),
                duration_ms: state
                    .start_instant
                    .as_ref()
                    .map(|started| started.elapsed().as_millis() as u64)
                    .unwrap_or_default(),
            })
        })
    }

    pub fn get_last_recording(&self) -> Option<Recording> {
        self.state
            .lock()
            .ok()
            .and_then(|state| state.last_recording.clone())
    }

    pub fn clear_last_recording(&self) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;
        state.last_recording = None;
        Ok(())
    }

    fn get_elapsed_ms(&self) -> Result<u64> {
        let state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        let start_instant = state
            .start_instant
            .as_ref()
            .ok_or_else(|| anyhow!("No recording in progress"))?;

        Ok(start_instant.elapsed().as_millis() as u64)
    }

    fn record_action(&self, action: RecordedAction) -> Result<()> {
        let mut state = self.state.lock().map_err(|_| anyhow!("Lock poisoned"))?;

        if state.session.is_none() {
            return Err(anyhow!("No recording in progress"));
        }

        state.actions.push_back(action.clone());

        if let Some(ref app_handle) = state.app_handle {
            let _ = app_handle.emit("automation:action_recorded", &action);
        }

        tracing::debug!("Recorded action: {:?}", action.action_type);
        Ok(())
    }
}

use once_cell::sync::Lazy;

static RECORDER: Lazy<RecorderService> = Lazy::new(RecorderService::new);
#[cfg(not(test))]
static INPUT_LISTENER_STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(not(test))]
static LAST_POINTER_POSITION: Lazy<Mutex<(i32, i32)>> = Lazy::new(|| Mutex::new((0, 0)));

pub fn global_recorder() -> &'static RecorderService {
    &RECORDER
}

#[cfg(not(test))]
fn ensure_global_input_listener() -> Result<()> {
    if INPUT_LISTENER_STARTED.swap(true, Ordering::SeqCst) {
        return Ok(());
    }

    let spawn_result = std::thread::Builder::new()
        .name("agi-skill-recorder".into())
        .spawn(|| {
            tracing::info!("[skill-recorder] global input listener started");
            let result = rdev::listen(handle_global_input_event);
            if let Err(error) = result {
                tracing::error!("[skill-recorder] global input listener failed: {error:?}");
            }
            INPUT_LISTENER_STARTED.store(false, Ordering::SeqCst);
            tracing::info!("[skill-recorder] global input listener exited");
        });

    if let Err(error) = spawn_result {
        INPUT_LISTENER_STARTED.store(false, Ordering::SeqCst);
        return Err(anyhow!(
            "Failed to start the global input recorder: {error}"
        ));
    }

    Ok(())
}

#[cfg(not(test))]
fn handle_global_input_event(event: rdev::Event) {
    use rdev::EventType;

    match event.event_type {
        EventType::MouseMove { x, y } => {
            if let Ok(mut position) = LAST_POINTER_POSITION.lock() {
                *position = (x.round() as i32, y.round() as i32);
            }
        }
        EventType::ButtonPress(button) => {
            if !global_recorder().is_recording() {
                return;
            }
            let (x, y) = LAST_POINTER_POSITION
                .lock()
                .map(|position| *position)
                .unwrap_or((0, 0));
            let button = match button {
                rdev::Button::Right => "right",
                rdev::Button::Middle => "middle",
                _ => "left",
            };
            if let Err(error) = global_recorder().record_click(x, y, button) {
                tracing::warn!("[skill-recorder] failed to record click: {error}");
            }
        }
        EventType::KeyPress(key) => {
            if !global_recorder().is_recording() {
                return;
            }
            let value = event.name.or_else(|| {
                let special = match key {
                    rdev::Key::Return => "Enter",
                    rdev::Key::Tab => "Tab",
                    rdev::Key::Escape => "Escape",
                    rdev::Key::Backspace => "Backspace",
                    rdev::Key::Delete => "Delete",
                    rdev::Key::Space => " ",
                    _ => return None,
                };
                Some(special.to_string())
            });
            if let Some(value) = value {
                let (x, y) = LAST_POINTER_POSITION
                    .lock()
                    .map(|position| *position)
                    .unwrap_or((0, 0));
                if let Err(error) = global_recorder().record_type(&value, x, y) {
                    tracing::warn!("[skill-recorder] failed to record typing: {error}");
                }
            }
        }
        EventType::Wheel { delta_x, delta_y } => {
            if !global_recorder().is_recording() {
                return;
            }
            let (x, y) = LAST_POINTER_POSITION
                .lock()
                .map(|position| *position)
                .unwrap_or((0, 0));
            if let Err(error) = global_recorder().record_scroll(delta_x, delta_y, x, y) {
                tracing::warn!("[skill-recorder] failed to record scroll: {error}");
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_rapid_consecutive_actions_without_dropping_steps() {
        let recorder = RecorderService::new();
        recorder.start_recording().expect("start recording");
        recorder.record_click(10, 20, "left").expect("first click");
        recorder.record_click(11, 21, "left").expect("second click");

        let recording = recorder.stop_recording().expect("stop recording");
        assert_eq!(recording.actions.len(), 2);
    }

    #[test]
    fn stopping_an_empty_recording_returns_zero_actions() {
        let recorder = RecorderService::new();
        recorder.start_recording().expect("start recording");

        let recording = recorder.stop_recording().expect("stop recording");
        assert!(recording.actions.is_empty());
    }

    #[test]
    fn status_reports_live_action_count_and_completed_recording_is_recoverable() {
        let recorder = RecorderService::new();
        let session = recorder.start_recording().expect("start recording");
        recorder.record_click(10, 20, "left").expect("record click");

        let status = recorder.get_status().expect("live status");
        assert_eq!(status.session_id, session.session_id);
        assert!(status.is_recording);
        assert_eq!(status.action_count, 1);

        let recording = recorder.stop_recording().expect("stop recording");
        assert!(recorder.get_status().is_none());
        assert_eq!(
            recorder
                .get_last_recording()
                .expect("recover completed recording")
                .id,
            recording.id
        );

        recorder
            .clear_last_recording()
            .expect("clear recovered recording");
        assert!(recorder.get_last_recording().is_none());
    }

    #[test]
    fn discard_clears_actions_without_creating_a_reviewable_recording() {
        let recorder = RecorderService::new();
        let session = recorder.start_recording().expect("start recording");
        recorder.record_click(10, 20, "left").expect("record click");

        let discarded = recorder.discard_recording().expect("discard recording");
        assert_eq!(discarded.session_id, session.session_id);
        assert_eq!(discarded.action_count, 1);
        assert!(!recorder.is_recording());
        assert!(recorder.get_last_recording().is_none());
    }

    #[test]
    fn narration_is_a_timestamped_local_transcription_action() {
        let recorder = RecorderService::new();
        recorder.start_recording().expect("start recording");
        recorder
            .record_narration("Open the regional report")
            .expect("record narration");

        let recording = recorder.stop_recording().expect("stop recording");
        let narration = recording.actions.first().expect("narration action");
        assert!(matches!(narration.action_type, ActionType::Narration));
        assert_eq!(narration.value.as_deref(), Some("Open the regional report"));
        assert_eq!(
            narration
                .metadata
                .as_ref()
                .and_then(|metadata| metadata.get("source"))
                .and_then(serde_json::Value::as_str),
            Some("microphone")
        );
    }
}
