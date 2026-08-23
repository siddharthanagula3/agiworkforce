//! Session Management for Computer Use.
//!
//! This module manages Computer Use sessions, providing:
//! - Session lifecycle management
//! - Screenshot before/after for undo capability
//! - Action history tracking
//! - Event emission for UI updates

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use image::RgbaImage;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

use crate::automation::screen::capture_primary_screen;

use super::types::{ComputerUseAction, ComputerUseTask, TaskOutcome, TaskProgress};
use super::window_manager::{ActiveWindow, WindowCoordinator};

/// Window/app name fragments that mark the foreground surface as one whose
/// pixels routinely contain secrets. Mirrors the sensitive-window list in
/// `safety.rs` and extends it with the credential surfaces a screen capture
/// would leak verbatim.
const SENSITIVE_SURFACE_KEYWORDS: &[&str] = &[
    "password",
    "passphrase",
    "credential",
    "keychain",
    "keyring",
    "sign in",
    "signin",
    "log in",
    "login",
    "authenticator",
    "one-time",
    "one time code",
    "otp",
    "2fa",
    "two-factor",
    "verification code",
    "security code",
    "secret",
    "api key",
    "private key",
    "seed phrase",
    "recovery phrase",
    "wallet",
    "bank",
    "checkout",
    "payment",
    "credit card",
    "1password",
    "bitwarden",
    "lastpass",
    "dashlane",
    "keeper",
    "vault",
    "security preferences",
    "system preferences",
    "control panel",
    "task manager",
    "terminal",
    "cmd.exe",
    "powershell",
];

fn is_sensitive_surface(app_name: &str, window_title: &str) -> bool {
    let haystack = format!("{app_name} {window_title}").to_lowercase();
    SENSITIVE_SURFACE_KEYWORDS
        .iter()
        .any(|keyword| haystack.contains(keyword))
}

/// A foreground window we cannot identify is treated like a sensitive one:
/// the capture stays in memory rather than being written to disk.
fn may_persist_capture(active: Option<&ActiveWindow>) -> bool {
    match active {
        Some(window) => !is_sensitive_surface(&window.app_name, &window.window_title),
        None => false,
    }
}

/// Per-user, app-private location for screen captures. Never the shared OS
/// temp directory: captures can contain on-screen credentials.
fn default_screenshot_dir() -> Option<PathBuf> {
    let base = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .map(|dir| dir.join("agiworkforce"))
        .or_else(|| dirs::home_dir().map(|home| home.join(".agiworkforce")))?;
    Some(base.join("computer-use").join("screenshots"))
}

fn prepare_screenshot_dir(dir: &Path) -> Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};

        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(dir)
            .with_context(|| format!("Failed to create screenshot dir {}", dir.display()))?;

        let metadata = std::fs::symlink_metadata(dir)?;
        if metadata.file_type().is_symlink() {
            anyhow::bail!("Screenshot directory {} is a symlink", dir.display());
        }

        let mut permissions = metadata.permissions();
        if permissions.mode() & 0o077 != 0 {
            permissions.set_mode(0o700);
            std::fs::set_permissions(dir, permissions)?;
        }
    }

    #[cfg(not(unix))]
    std::fs::create_dir_all(dir)
        .with_context(|| format!("Failed to create screenshot dir {}", dir.display()))?;

    Ok(())
}

fn write_screenshot(path: &Path, pixels: &RgbaImage) -> Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let file = options
        .open(path)
        .with_context(|| format!("Failed to create screenshot file {}", path.display()))?;
    let mut writer = std::io::BufWriter::new(file);
    pixels
        .write_to(&mut writer, image::ImageFormat::Png)
        .context("Failed to encode screenshot")?;
    writer.flush().context("Failed to flush screenshot")?;
    Ok(())
}

const LEGACY_TEMP_SCREENSHOT_DIR: &str = "agiworkforce_computer_use";

/// Earlier builds wrote captures to the shared OS temp directory; those files
/// outlive the upgrade, so remove them the first time a session is created.
fn purge_legacy_temp_screenshots() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        purge_legacy_screenshot_dir(&std::env::temp_dir().join(LEGACY_TEMP_SCREENSHOT_DIR));
    });
}

fn purge_legacy_screenshot_dir(dir: &Path) {
    let Ok(metadata) = std::fs::symlink_metadata(dir) else {
        return;
    };
    if !metadata.is_dir() {
        return;
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "png") && entry.path().is_file() {
            if let Err(err) = std::fs::remove_file(&path) {
                tracing::warn!("Failed to purge legacy computer-use screenshot: {}", err);
            }
        }
    }
    let _ = std::fs::remove_dir(dir);
}

fn purge_screenshot_ref(slot: &mut Option<ScreenshotRef>) {
    if !matches!(slot, Some(ScreenshotRef::OnDisk(_))) {
        return;
    }
    if let Some(ScreenshotRef::OnDisk(path)) = slot.take() {
        match std::fs::remove_file(&path) {
            Ok(()) => {}
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
            Err(err) => tracing::warn!("Failed to purge computer-use screenshot: {}", err),
        }
    }
}

/// Configuration for session behavior.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    /// Maximum number of screenshots to keep in memory.
    pub max_screenshots_in_memory: usize,
    /// Whether to save screenshots to disk.
    pub persist_screenshots: bool,
    /// Directory for persistent screenshots.
    pub screenshot_dir: Option<PathBuf>,
    /// Maximum action history to keep.
    pub max_action_history: usize,
    /// Whether to emit events for UI updates.
    pub emit_events: bool,
    /// Capture screenshot before each action.
    pub capture_before_action: bool,
    /// Capture screenshot after each action.
    pub capture_after_action: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            max_screenshots_in_memory: 50,
            persist_screenshots: true,
            screenshot_dir: default_screenshot_dir(),
            max_action_history: 1000,
            emit_events: true,
            capture_before_action: true,
            capture_after_action: true,
        }
    }
}

/// A snapshot of screen state before/after an action.
#[derive(Clone)]
pub struct ActionSnapshot {
    /// Unique ID for this snapshot.
    pub id: String,
    /// Timestamp when snapshot was taken.
    pub timestamp: DateTime<Utc>,
    /// The action that was (or will be) executed.
    pub action: ComputerUseAction,
    /// Screenshot before the action (path or in-memory).
    pub before_screenshot: Option<ScreenshotRef>,
    /// Screenshot after the action (path or in-memory).
    pub after_screenshot: Option<ScreenshotRef>,
    /// Whether the action succeeded.
    pub success: bool,
    /// Error message if action failed.
    pub error: Option<String>,
    /// Duration of action execution in milliseconds.
    pub duration_ms: u64,
}

/// Reference to a screenshot (either in memory or on disk).
#[derive(Clone)]
pub enum ScreenshotRef {
    /// Screenshot stored in memory.
    InMemory(Arc<RgbaImage>),
    /// Path to screenshot on disk.
    OnDisk(PathBuf),
}

impl ScreenshotRef {
    /// Loads the screenshot into memory.
    pub fn load(&self) -> Result<RgbaImage> {
        match self {
            ScreenshotRef::InMemory(img) => Ok((**img).clone()),
            ScreenshotRef::OnDisk(path) => {
                let img = image::open(path)
                    .context("Failed to load screenshot from disk")?
                    .to_rgba8();
                Ok(img)
            }
        }
    }

    /// Returns the path if stored on disk.
    pub fn path(&self) -> Option<&PathBuf> {
        match self {
            ScreenshotRef::OnDisk(path) => Some(path),
            ScreenshotRef::InMemory(_) => None,
        }
    }
}

/// Action to undo a previous computer use action.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UndoAction {
    /// ID of the original action.
    pub original_action_id: String,
    /// Description of what will be undone.
    pub description: String,
    /// Whether this undo is available.
    pub available: bool,
    /// Reason if undo is not available.
    pub unavailable_reason: Option<String>,
}

/// Events emitted during a Computer Use session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum SessionEvent {
    /// Session started.
    SessionStarted {
        session_id: String,
        task: ComputerUseTask,
    },
    /// Action about to be executed.
    ActionStarting {
        session_id: String,
        action: ComputerUseAction,
        action_index: u32,
    },
    /// Action completed.
    ActionCompleted {
        session_id: String,
        action: ComputerUseAction,
        success: bool,
        duration_ms: u64,
    },
    /// Progress update.
    ProgressUpdate {
        session_id: String,
        progress: TaskProgress,
    },
    /// Session completed.
    SessionCompleted {
        session_id: String,
        outcome: TaskOutcome,
    },
    /// Session paused (waiting for confirmation).
    SessionPaused {
        session_id: String,
        reason: String,
        action: ComputerUseAction,
    },
    /// Session resumed after pause.
    SessionResumed { session_id: String },
    /// Session cancelled by user.
    SessionCancelled { session_id: String },
    /// Error occurred.
    Error { session_id: String, error: String },
}

/// A Computer Use session tracks the execution of a task.
pub struct ComputerUseSession {
    /// Unique session ID.
    pub id: String,
    /// The task being executed.
    pub task: ComputerUseTask,
    /// Session configuration.
    pub config: SessionConfig,
    /// Action snapshots (history).
    snapshots: VecDeque<ActionSnapshot>,
    /// Current action index.
    action_index: u32,
    /// Session start time.
    started_at: DateTime<Utc>,
    /// Session end time.
    ended_at: Option<DateTime<Utc>>,
    /// Whether session is paused.
    is_paused: bool,
    /// Whether session was cancelled.
    is_cancelled: bool,
    /// App handle for event emission.
    app_handle: Option<AppHandle>,
}

impl ComputerUseSession {
    /// Creates a new session for a task.
    pub fn new(task: ComputerUseTask, config: SessionConfig) -> Self {
        purge_legacy_temp_screenshots();

        Self {
            id: uuid::Uuid::new_v4().to_string(),
            task,
            config,
            snapshots: VecDeque::new(),
            action_index: 0,
            started_at: Utc::now(),
            ended_at: None,
            is_paused: false,
            is_cancelled: false,
            app_handle: None,
        }
    }

    /// Sets the app handle for event emission.
    pub fn with_app_handle(mut self, app_handle: AppHandle) -> Self {
        self.app_handle = Some(app_handle);
        self
    }

    /// Emits a session event.
    pub fn emit(&self, event: SessionEvent) {
        if !self.config.emit_events {
            return;
        }

        if let Some(ref app) = self.app_handle {
            let event_name = match &event {
                SessionEvent::SessionStarted { .. } => "computer_use:session_started",
                SessionEvent::ActionStarting { .. } => "computer_use:action_starting",
                SessionEvent::ActionCompleted { .. } => "computer_use:action_completed",
                SessionEvent::ProgressUpdate { .. } => "computer_use:progress_update",
                SessionEvent::SessionCompleted { .. } => "computer_use:session_completed",
                SessionEvent::SessionPaused { .. } => "computer_use:session_paused",
                SessionEvent::SessionResumed { .. } => "computer_use:session_resumed",
                SessionEvent::SessionCancelled { .. } => "computer_use:session_cancelled",
                SessionEvent::Error { .. } => "computer_use:error",
            };

            if let Err(e) = app.emit(event_name, &event) {
                tracing::warn!("Failed to emit session event: {}", e);
            }
        }
    }

    /// Records the start of a session.
    pub fn start(&self) {
        self.emit(SessionEvent::SessionStarted {
            session_id: self.id.clone(),
            task: self.task.clone(),
        });
    }

    /// Captures a screenshot before an action.
    pub fn capture_before(&mut self, _action: &ComputerUseAction) -> Result<Option<ScreenshotRef>> {
        if !self.config.capture_before_action {
            return Ok(None);
        }

        self.capture_screenshot(&format!("before_{}", self.action_index))
    }

    /// Records the completion of an action.
    pub fn record_action(
        &mut self,
        action: ComputerUseAction,
        before: Option<ScreenshotRef>,
        success: bool,
        error: Option<String>,
        duration_ms: u64,
    ) -> Result<String> {
        let after = if self.config.capture_after_action {
            self.capture_screenshot(&format!("after_{}", self.action_index))?
        } else {
            None
        };

        let snapshot_id = format!("{}_{}", self.id, self.action_index);

        let snapshot = ActionSnapshot {
            id: snapshot_id.clone(),
            timestamp: Utc::now(),
            action: action.clone(),
            before_screenshot: before,
            after_screenshot: after,
            success,
            error: error.clone(),
            duration_ms,
        };

        // Add to history
        self.snapshots.push_back(snapshot);

        // Trim if needed
        while self.snapshots.len() > self.config.max_action_history {
            self.snapshots.pop_front();
        }

        self.action_index += 1;

        // Emit event
        self.emit(SessionEvent::ActionCompleted {
            session_id: self.id.clone(),
            action,
            success,
            duration_ms,
        });

        Ok(snapshot_id)
    }

    /// Captures a screenshot and stores it according to config.
    fn capture_screenshot(&self, suffix: &str) -> Result<Option<ScreenshotRef>> {
        let captured = capture_primary_screen().context("Failed to capture screenshot")?;

        if self.config.persist_screenshots {
            if let Some(ref dir) = self.config.screenshot_dir {
                if may_persist_capture(WindowCoordinator::get_active_window().as_ref()) {
                    prepare_screenshot_dir(dir)?;

                    let path = dir.join(format!("{}_{}.png", self.id, suffix));
                    write_screenshot(&path, &captured.pixels)?;
                    return Ok(Some(ScreenshotRef::OnDisk(path)));
                }

                tracing::debug!(
                    "Keeping computer-use capture in memory: foreground window is sensitive or unidentified"
                );
            }
        }

        // Store in memory
        if self.snapshots.len() < self.config.max_screenshots_in_memory {
            return Ok(Some(ScreenshotRef::InMemory(Arc::new(captured.pixels))));
        }

        Ok(None)
    }

    /// Pauses the session for user confirmation.
    pub fn pause(&mut self, reason: String, action: ComputerUseAction) {
        self.is_paused = true;
        self.emit(SessionEvent::SessionPaused {
            session_id: self.id.clone(),
            reason,
            action,
        });
    }

    /// Resumes the session after pause.
    pub fn resume(&mut self) {
        self.is_paused = false;
        self.emit(SessionEvent::SessionResumed {
            session_id: self.id.clone(),
        });
    }

    /// Cancels the session.
    pub fn cancel(&mut self) {
        self.is_cancelled = true;
        self.ended_at = Some(Utc::now());
        self.purge_persisted_screenshots();
        self.emit(SessionEvent::SessionCancelled {
            session_id: self.id.clone(),
        });
    }

    /// Completes the session with an outcome.
    pub fn complete(&mut self, outcome: TaskOutcome) {
        self.ended_at = Some(Utc::now());
        self.purge_persisted_screenshots();
        self.emit(SessionEvent::SessionCompleted {
            session_id: self.id.clone(),
            outcome,
        });
    }

    /// Emits a progress update.
    pub fn update_progress(&self, progress: TaskProgress) {
        self.emit(SessionEvent::ProgressUpdate {
            session_id: self.id.clone(),
            progress,
        });
    }

    /// Emits an error event.
    pub fn report_error(&self, error: String) {
        self.emit(SessionEvent::Error {
            session_id: self.id.clone(),
            error,
        });
    }

    /// Returns all snapshots.
    pub fn snapshots(&self) -> &VecDeque<ActionSnapshot> {
        &self.snapshots
    }

    /// Returns the most recent snapshot.
    pub fn last_snapshot(&self) -> Option<&ActionSnapshot> {
        self.snapshots.back()
    }

    /// Gets a snapshot by ID.
    pub fn get_snapshot(&self, id: &str) -> Option<&ActionSnapshot> {
        self.snapshots.iter().find(|s| s.id == id)
    }

    /// Checks if undo is available for the last action.
    pub fn can_undo(&self) -> bool {
        // Can only undo if we have a snapshot with before screenshot
        self.snapshots
            .back()
            .map(|s| s.before_screenshot.is_some())
            .unwrap_or(false)
    }

    /// Gets the undo action for the last executed action.
    pub fn get_undo_action(&self) -> Option<UndoAction> {
        let snapshot = self.snapshots.back()?;

        if snapshot.before_screenshot.is_none() {
            return Some(UndoAction {
                original_action_id: snapshot.id.clone(),
                description: format!("Undo: {}", snapshot.action.description()),
                available: false,
                unavailable_reason: Some("No before screenshot available".to_string()),
            });
        }

        Some(UndoAction {
            original_action_id: snapshot.id.clone(),
            description: format!("Undo: {}", snapshot.action.description()),
            available: true,
            unavailable_reason: None,
        })
    }

    /// Returns current action count.
    pub fn action_count(&self) -> u32 {
        self.action_index
    }

    /// Returns elapsed time since session start.
    pub fn elapsed_ms(&self) -> u64 {
        let end = self.ended_at.unwrap_or_else(Utc::now);
        (end - self.started_at).num_milliseconds().max(0) as u64
    }

    /// Checks if session is paused.
    pub fn is_paused(&self) -> bool {
        self.is_paused
    }

    /// Checks if session was cancelled.
    pub fn is_cancelled(&self) -> bool {
        self.is_cancelled
    }

    /// Returns all screenshot paths for this session.
    pub fn screenshot_paths(&self) -> Vec<PathBuf> {
        self.snapshots
            .iter()
            .flat_map(|s| {
                let mut paths = Vec::new();
                if let Some(ScreenshotRef::OnDisk(p)) = &s.before_screenshot {
                    paths.push(p.clone());
                }
                if let Some(ScreenshotRef::OnDisk(p)) = &s.after_screenshot {
                    paths.push(p.clone());
                }
                paths
            })
            .collect()
    }

    /// Deletes every persisted capture for this session and forgets its path.
    pub fn purge_persisted_screenshots(&mut self) {
        for snapshot in self.snapshots.iter_mut() {
            purge_screenshot_ref(&mut snapshot.before_screenshot);
            purge_screenshot_ref(&mut snapshot.after_screenshot);
        }
    }

    /// Cleans up session files.
    pub fn cleanup(&self) -> Result<()> {
        for path in self.screenshot_paths() {
            if path.exists() {
                std::fs::remove_file(&path)?;
            }
        }
        Ok(())
    }
}

/// Manages multiple Computer Use sessions.
pub struct SessionManager {
    sessions: Arc<Mutex<std::collections::HashMap<String, ComputerUseSession>>>,
    config: SessionConfig,
}

impl SessionManager {
    /// Creates a new session manager.
    pub fn new(config: SessionConfig) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
            config,
        }
    }

    /// Creates a new session for a task.
    pub async fn create_session(&self, task: ComputerUseTask) -> Result<String> {
        let session = ComputerUseSession::new(task, self.config.clone());
        let id = session.id.clone();

        let mut sessions = self.sessions.lock().await;
        sessions.insert(id.clone(), session);

        Ok(id)
    }

    /// Gets a session by ID.
    pub async fn get_session(
        &self,
        session_id: &str,
    ) -> Option<tokio::sync::MutexGuard<'_, std::collections::HashMap<String, ComputerUseSession>>>
    {
        let sessions = self.sessions.lock().await;
        if sessions.contains_key(session_id) {
            Some(sessions)
        } else {
            None
        }
    }

    /// Removes a session.
    pub async fn remove_session(&self, session_id: &str) -> Option<ComputerUseSession> {
        let mut sessions = self.sessions.lock().await;
        sessions.remove(session_id)
    }

    /// Lists all active sessions.
    pub async fn list_sessions(&self) -> Vec<String> {
        let sessions = self.sessions.lock().await;
        sessions.keys().cloned().collect()
    }

    /// Cleans up all completed sessions.
    pub async fn cleanup_completed(&self) -> Result<()> {
        let mut sessions = self.sessions.lock().await;
        let completed: Vec<_> = sessions
            .iter()
            .filter(|(_, s)| s.ended_at.is_some())
            .map(|(id, _)| id.clone())
            .collect();

        for id in completed {
            if let Some(session) = sessions.remove(&id) {
                session.cleanup()?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_task() -> ComputerUseTask {
        ComputerUseTask {
            id: "test-task".to_string(),
            description: "Test task".to_string(),
            ..Default::default()
        }
    }

    fn sample_png(path: &std::path::Path) {
        let pixels = RgbaImage::new(2, 2);
        write_screenshot(path, &pixels).unwrap();
    }

    #[test]
    fn default_screenshot_dir_is_app_private_not_shared_temp() {
        let dir = SessionConfig::default()
            .screenshot_dir
            .expect("default screenshot dir");

        assert!(!dir.starts_with(std::env::temp_dir()));
        assert!(dir.ends_with(std::path::Path::new("computer-use").join("screenshots")));
    }

    #[cfg(unix)]
    #[test]
    fn screenshot_dir_and_files_are_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("nested").join("screenshots");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o777)).unwrap();

        prepare_screenshot_dir(&dir).unwrap();
        assert_eq!(
            std::fs::metadata(&dir).unwrap().permissions().mode() & 0o777,
            0o700
        );

        let path = dir.join("capture.png");
        sample_png(&path);
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(image::open(&path).is_ok());
    }

    #[test]
    fn sensitive_or_unidentified_foreground_window_blocks_persistence() {
        assert!(is_sensitive_surface("Safari", "Sign in - Example Bank"));
        assert!(is_sensitive_surface("1Password", ""));
        assert!(!is_sensitive_surface("Notes", "Grocery list"));

        assert!(!may_persist_capture(None));
        assert!(!may_persist_capture(Some(&ActiveWindow {
            app_name: "Chrome".to_string(),
            window_title: "Enter your password".to_string(),
            bundle_id: None,
        })));
        assert!(may_persist_capture(Some(&ActiveWindow {
            app_name: "Notes".to_string(),
            window_title: "Grocery list".to_string(),
            bundle_id: None,
        })));
    }

    #[test]
    fn legacy_temp_screenshot_dir_is_removed() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join(LEGACY_TEMP_SCREENSHOT_DIR);
        std::fs::create_dir_all(&legacy).unwrap();
        let capture = legacy.join("session_before_0.png");
        sample_png(&capture);

        purge_legacy_screenshot_dir(&legacy);

        assert!(!capture.exists());
        assert!(!legacy.exists());
    }

    #[test]
    fn ending_a_session_purges_persisted_screenshots() {
        let root = tempfile::tempdir().unwrap();
        let before_path = root.path().join("before.png");
        let after_path = root.path().join("after.png");
        sample_png(&before_path);
        sample_png(&after_path);

        let config = SessionConfig {
            emit_events: false,
            capture_before_action: false,
            capture_after_action: false,
            ..Default::default()
        };
        let mut session = ComputerUseSession::new(create_test_task(), config);
        session.snapshots.push_back(ActionSnapshot {
            id: "snapshot-1".to_string(),
            timestamp: Utc::now(),
            action: ComputerUseAction::Screenshot {
                region: None,
                save_path: None,
            },
            before_screenshot: Some(ScreenshotRef::OnDisk(before_path.clone())),
            after_screenshot: Some(ScreenshotRef::InMemory(Arc::new(RgbaImage::new(1, 1)))),
            success: true,
            error: None,
            duration_ms: 1,
        });
        session.snapshots.push_back(ActionSnapshot {
            id: "snapshot-2".to_string(),
            timestamp: Utc::now(),
            action: ComputerUseAction::Screenshot {
                region: None,
                save_path: None,
            },
            before_screenshot: Some(ScreenshotRef::OnDisk(after_path.clone())),
            after_screenshot: None,
            success: true,
            error: None,
            duration_ms: 1,
        });

        session.complete(super::super::types::TaskOutcome::success(
            2,
            10,
            "Done".to_string(),
        ));

        assert!(!before_path.exists());
        assert!(!after_path.exists());
        assert!(session.screenshot_paths().is_empty());
        assert!(matches!(
            session.snapshots[0].after_screenshot,
            Some(ScreenshotRef::InMemory(_))
        ));
    }

    #[test]
    fn test_session_creation() {
        let task = create_test_task();
        let config = SessionConfig::default();
        let session = ComputerUseSession::new(task.clone(), config);

        assert!(!session.id.is_empty());
        assert_eq!(session.task.id, task.id);
        assert_eq!(session.action_count(), 0);
        assert!(!session.is_paused());
        assert!(!session.is_cancelled());
    }

    #[test]
    fn test_session_lifecycle() {
        let task = create_test_task();
        let config = SessionConfig {
            emit_events: false, // Disable for testing
            capture_before_action: false,
            capture_after_action: false,
            ..Default::default()
        };
        let mut session = ComputerUseSession::new(task, config);

        // Start
        session.start();

        // Record some actions
        let action = ComputerUseAction::Click {
            x: 100,
            y: 200,
            button: super::super::types::MouseButton::Left,
        };

        session
            .record_action(action.clone(), None, true, None, 50)
            .unwrap();

        assert_eq!(session.action_count(), 1);
        assert!(session.last_snapshot().is_some());

        // Complete
        let outcome = super::super::types::TaskOutcome::success(1, 1000, "Done".to_string());
        session.complete(outcome);

        assert!(session.ended_at.is_some());
    }

    #[test]
    fn test_pause_resume() {
        let task = create_test_task();
        let config = SessionConfig {
            emit_events: false,
            ..Default::default()
        };
        let mut session = ComputerUseSession::new(task, config);

        assert!(!session.is_paused());

        let action = ComputerUseAction::Type {
            text: "test".to_string(),
            delay_ms: 10,
        };
        session.pause("Confirmation needed".to_string(), action);
        assert!(session.is_paused());

        session.resume();
        assert!(!session.is_paused());
    }

    #[tokio::test]
    async fn test_session_manager() {
        let config = SessionConfig {
            emit_events: false,
            capture_before_action: false,
            capture_after_action: false,
            ..Default::default()
        };
        let manager = SessionManager::new(config);

        let task = create_test_task();
        let session_id = manager.create_session(task).await.unwrap();

        let sessions = manager.list_sessions().await;
        assert_eq!(sessions.len(), 1);
        assert!(sessions.contains(&session_id));

        manager.remove_session(&session_id).await;
        let sessions = manager.list_sessions().await;
        assert!(sessions.is_empty());
    }
}
