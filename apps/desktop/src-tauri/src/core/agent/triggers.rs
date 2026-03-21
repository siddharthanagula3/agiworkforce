//! Event trigger engine -- automatic agent execution based on external events.
//!
//! Supports cron schedules, webhook endpoints, and filesystem watchers.
//! Each trigger can spawn a new agent session with configurable approval gates.
//!
//! # Architecture
//!
//! - `TriggerRegistry` manages all active triggers in memory.
//! - `start()` launches background tasks for cron polling, a localhost webhook
//!   server, and filesystem watchers.
//! - When a trigger fires, `execute_trigger()` emits a Tauri event so the
//!   frontend can surface the execution; the agent is spawned via the background
//!   agent system.
//! - `stop()` tears down all listeners and watchers gracefully.
//!
//! # Tauri Commands
//!
//! Four commands are exposed at the bottom of this file:
//! - `register_trigger`
//! - `unregister_trigger`
//! - `list_triggers`
//! - `toggle_trigger`

use chrono::Utc;
use cron::Schedule;
use notify::{Event as NotifyEvent, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Trigger registry -- manages all active triggers.
pub struct TriggerRegistry {
    triggers: Arc<RwLock<HashMap<String, RegisteredTrigger>>>,
    /// Execution history keyed by trigger ID (most recent first, capped at 100 per trigger).
    executions: Arc<RwLock<HashMap<String, Vec<TriggerExecution>>>>,
    /// Handle to the cron scheduler task.
    cron_handle: Option<tokio::task::JoinHandle<()>>,
    /// Handle to the webhook server task.
    webhook_handle: Option<tokio::task::JoinHandle<()>>,
    /// Active file-system watchers keyed by trigger ID.
    /// Each entry holds the watcher (which must stay alive to keep receiving events)
    /// plus the join-handle for the async debounce task.
    file_watchers: HashMap<String, (RecommendedWatcher, tokio::task::JoinHandle<()>)>,
    /// Tauri app handle for emitting events.
    app_handle: Option<AppHandle>,
    /// Cancellation flag shared with background tasks.
    cancel: Arc<tokio::sync::Notify>,
}

/// A fully-registered trigger definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisteredTrigger {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub trigger_type: TriggerType,
    pub config: TriggerConfig,
    pub action: TriggerAction,
    pub enabled: bool,
    pub last_triggered_at: Option<String>,
    pub trigger_count: u64,
    pub created_at: String,
    pub updated_at: String,
}

/// High-level category of the trigger.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TriggerType {
    Cron,
    Webhook,
    FileWatcher,
}

/// Concrete configuration for each trigger type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TriggerConfig {
    Cron {
        expression: String,
        timezone: Option<String>,
    },
    Webhook {
        path: String,
        auth_token: Option<String>,
    },
    FileWatcher {
        watch_path: String,
        glob: Option<String>,
        debounce_ms: Option<u64>,
    },
}

/// What to do when a trigger fires.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerAction {
    /// "agent", "workflow", or "notification".
    #[serde(rename = "type")]
    pub action_type: String,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub approval_required: bool,
}

/// A single recorded execution of a trigger.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerExecution {
    pub id: String,
    pub trigger_id: String,
    pub trigger_name: String,
    pub fired_at: String,
    pub success: bool,
    pub error: Option<String>,
    pub event_data: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Event payload emitted to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TriggerEventPayload {
    trigger_id: String,
    trigger_name: String,
    event: String,
    event_data: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Default timeout constants
// ---------------------------------------------------------------------------

/// How often the cron polling loop checks triggers (in seconds).
const CRON_POLL_INTERVAL_SECS: u64 = 30;

/// Default debounce for file-watcher triggers (milliseconds).
const DEFAULT_DEBOUNCE_MS: u64 = 500;

/// Port for the localhost webhook server.
const WEBHOOK_PORT: u16 = 18923;

/// Maximum execution time for a single trigger execution (seconds).
const TRIGGER_EXECUTION_TIMEOUT_SECS: u64 = 300;

/// Minimum allowed interval between cron trigger firings (seconds).
/// Cron expressions that would fire more often than every 5 minutes are rejected.
const MIN_CRON_INTERVAL_SECS: i64 = 300;

/// Sensitive directories that must never be watched by file-watcher triggers.
const DENIED_WATCH_PATHS: &[&str] = &[
    ".ssh",
    ".gnupg",
    ".aws",
    ".config/gcloud",
    ".azure",
    ".kube",
    ".docker",
    ".npmrc",
    ".pypirc",
];

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/// Constant-time byte comparison to prevent timing side-channel attacks on
/// webhook authentication tokens.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut result = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        result |= x ^ y;
    }
    result == 0
}

/// Check that a path does not reside inside any sensitive directory under the
/// user's home folder (e.g. `.ssh`, `.gnupg`, `.aws`).
fn is_watch_path_allowed(path: &Path) -> bool {
    let canonical = match std::fs::canonicalize(path) {
        Ok(p) => p,
        Err(_) => return false, // can't resolve → deny
    };
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return true, // no home dir, can't check
    };
    for denied in DENIED_WATCH_PATHS {
        let denied_path = home.join(denied);
        // Try to canonicalize denied path too (it may not exist)
        let denied_canonical = std::fs::canonicalize(&denied_path).unwrap_or(denied_path);
        if canonical.starts_with(&denied_canonical) {
            return false;
        }
    }
    true
}

/// Validate that a cron expression does not fire more often than every
/// `MIN_CRON_INTERVAL_SECS` seconds.  Returns `Ok(())` if acceptable, or an
/// error string describing why the expression was rejected.
fn validate_cron_interval(cron_expr: &str) -> Result<(), String> {
    let schedule = Schedule::from_str(cron_expr)
        .map_err(|e| format!("Invalid cron expression '{}': {}", cron_expr, e))?;

    let now = Utc::now();
    let upcoming: Vec<_> = schedule.after(&now).take(10).collect();

    for window in upcoming.windows(2) {
        let gap = window[1].signed_duration_since(window[0]).num_seconds();
        if gap < MIN_CRON_INTERVAL_SECS {
            return Err(format!(
                "Cron expression '{}' would fire every {}s — minimum allowed interval is {}s (5 minutes)",
                cron_expr, gap, MIN_CRON_INTERVAL_SECS
            ));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

impl Default for TriggerRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl TriggerRegistry {
    /// Create a new, empty trigger registry.
    pub fn new() -> Self {
        Self {
            triggers: Arc::new(RwLock::new(HashMap::new())),
            executions: Arc::new(RwLock::new(HashMap::new())),
            cron_handle: None,
            webhook_handle: None,
            file_watchers: HashMap::new(),
            app_handle: None,
            cancel: Arc::new(tokio::sync::Notify::new()),
        }
    }

    /// Set the Tauri app handle used for emitting events to the frontend.
    pub fn set_app_handle(&mut self, app_handle: AppHandle) {
        self.app_handle = Some(app_handle);
    }

    // ------------------------------------------------------------------
    // CRUD
    // ------------------------------------------------------------------

    /// Register a new trigger.
    pub async fn register(&self, trigger: RegisteredTrigger) -> anyhow::Result<()> {
        // Validate based on type
        match &trigger.config {
            TriggerConfig::Cron { expression, .. } => {
                Schedule::from_str(expression).map_err(|e| {
                    anyhow::anyhow!("Invalid cron expression '{}': {}", expression, e)
                })?;
                // Reject cron intervals shorter than 5 minutes to prevent abuse.
                validate_cron_interval(expression).map_err(|e| anyhow::anyhow!("{}", e))?;
            }
            TriggerConfig::Webhook { path, .. } => {
                if path.is_empty() || !path.starts_with('/') {
                    return Err(anyhow::anyhow!(
                        "Webhook path must start with '/': got '{}'",
                        path
                    ));
                }
            }
            TriggerConfig::FileWatcher { watch_path, .. } => {
                let p = Path::new(watch_path);
                if !p.exists() {
                    return Err(anyhow::anyhow!(
                        "Watch path does not exist: '{}'",
                        watch_path
                    ));
                }
                // Block watchers on sensitive directories (e.g. .ssh, .gnupg, .aws).
                if !is_watch_path_allowed(p) {
                    return Err(anyhow::anyhow!(
                        "Watch path '{}' is inside a sensitive directory and cannot be watched",
                        watch_path
                    ));
                }
            }
        }

        let id = trigger.id.clone();
        self.triggers.write().await.insert(id.clone(), trigger);

        tracing::info!("[TriggerRegistry] Registered trigger: {}", id);
        self.emit_event("trigger:registered", &id, serde_json::Value::Null);
        Ok(())
    }

    /// Remove a trigger by ID. Returns an error if the trigger does not exist.
    pub async fn unregister(&self, id: &str) -> anyhow::Result<()> {
        let removed = self.triggers.write().await.remove(id);
        if removed.is_none() {
            return Err(anyhow::anyhow!("Trigger not found: {}", id));
        }

        tracing::info!("[TriggerRegistry] Unregistered trigger: {}", id);
        self.emit_event("trigger:unregistered", id, serde_json::Value::Null);
        Ok(())
    }

    /// Enable a previously-disabled trigger.
    pub async fn enable(&self, id: &str) -> anyhow::Result<()> {
        let mut triggers = self.triggers.write().await;
        let trigger = triggers
            .get_mut(id)
            .ok_or_else(|| anyhow::anyhow!("Trigger not found: {}", id))?;
        trigger.enabled = true;
        tracing::info!("[TriggerRegistry] Enabled trigger: {}", id);
        self.emit_event("trigger:enabled", id, serde_json::Value::Null);
        Ok(())
    }

    /// Disable a trigger without removing it.
    pub async fn disable(&self, id: &str) -> anyhow::Result<()> {
        let mut triggers = self.triggers.write().await;
        let trigger = triggers
            .get_mut(id)
            .ok_or_else(|| anyhow::anyhow!("Trigger not found: {}", id))?;
        trigger.enabled = false;
        tracing::info!("[TriggerRegistry] Disabled trigger: {}", id);
        self.emit_event("trigger:disabled", id, serde_json::Value::Null);
        Ok(())
    }

    /// Return a snapshot of all registered triggers.
    pub async fn list(&self) -> Vec<RegisteredTrigger> {
        let triggers = self.triggers.read().await;
        let mut list: Vec<_> = triggers.values().cloned().collect();
        list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        list
    }

    /// Update fields on an existing trigger from a partial JSON patch.
    ///
    /// Only the fields present in `updates` are applied; others are left unchanged.
    /// Returns an error if the trigger does not exist.
    pub async fn update(
        &self,
        id: &str,
        updates: serde_json::Value,
    ) -> anyhow::Result<RegisteredTrigger> {
        let mut map = self.triggers.write().await;
        let trigger = map
            .get_mut(id)
            .ok_or_else(|| anyhow::anyhow!("Trigger not found: {}", id))?;

        // Apply supported scalar fields from the patch.
        if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
            trigger.name = name.to_string();
        }
        if let Some(enabled) = updates.get("enabled").and_then(|v| v.as_bool()) {
            trigger.enabled = enabled;
        }
        if let Some(prompt) = updates.get("prompt").and_then(|v| v.as_str()) {
            trigger.action.prompt = Some(prompt.to_string());
        }
        if let Some(model) = updates.get("model").and_then(|v| v.as_str()) {
            trigger.action.model = Some(model.to_string());
        }
        if let Some(approval_required) = updates.get("approvalRequired").and_then(|v| v.as_bool()) {
            trigger.action.approval_required = approval_required;
        }

        trigger.updated_at = Utc::now().to_rfc3339();
        let updated = trigger.clone();
        tracing::info!("[TriggerRegistry] Updated trigger: {}", id);
        self.emit_event("trigger:updated", id, serde_json::Value::Null);
        Ok(updated)
    }

    /// Return the execution history for a trigger (most recent first, up to 100 entries).
    pub async fn get_executions(&self, trigger_id: &str) -> Vec<TriggerExecution> {
        let exec_map = self.executions.read().await;
        exec_map.get(trigger_id).cloned().unwrap_or_default()
    }

    // ------------------------------------------------------------------
    // Lifecycle: start / stop
    // ------------------------------------------------------------------

    /// Start all trigger listeners (cron, webhook, file watchers).
    ///
    /// Calling `start()` when already started is a no-op for the subsystems
    /// that are already running.
    pub async fn start(&mut self) -> anyhow::Result<()> {
        tracing::info!("[TriggerRegistry] Starting trigger engine");

        // --- Cron scheduler ---
        if self.cron_handle.is_none() {
            let triggers = Arc::clone(&self.triggers);
            let executions = Arc::clone(&self.executions);
            let cancel = Arc::clone(&self.cancel);
            let app_handle = self.app_handle.clone();

            self.cron_handle = Some(tokio::spawn(async move {
                cron_poll_loop(triggers, executions, cancel, app_handle).await;
            }));
        }

        // --- Webhook server ---
        if self.webhook_handle.is_none() {
            let triggers = Arc::clone(&self.triggers);
            let executions = Arc::clone(&self.executions);
            let cancel = Arc::clone(&self.cancel);
            let app_handle = self.app_handle.clone();

            self.webhook_handle = Some(tokio::spawn(async move {
                webhook_server(triggers, executions, cancel, app_handle).await;
            }));
        }

        // --- File watchers (one per FileWatcher trigger) ---
        let trigger_snapshot: Vec<RegisteredTrigger> = {
            let trig = self.triggers.read().await;
            trig.values()
                .filter(|t| t.trigger_type == TriggerType::FileWatcher && t.enabled)
                .cloned()
                .collect()
        };

        for trigger in trigger_snapshot {
            if self.file_watchers.contains_key(&trigger.id) {
                continue; // already watching
            }
            if let Err(e) = self.start_file_watcher(&trigger).await {
                tracing::warn!(
                    "[TriggerRegistry] Failed to start file watcher for trigger {}: {}",
                    trigger.id,
                    e
                );
            }
        }

        tracing::info!("[TriggerRegistry] Trigger engine started");
        Ok(())
    }

    /// Stop all listeners and tear down background tasks.
    pub async fn stop(&mut self) {
        tracing::info!("[TriggerRegistry] Stopping trigger engine");

        // Signal all background tasks to exit
        self.cancel.notify_waiters();

        if let Some(handle) = self.cron_handle.take() {
            handle.abort();
        }
        if let Some(handle) = self.webhook_handle.take() {
            handle.abort();
        }

        // Stop all file watchers
        for (id, (_watcher, handle)) in self.file_watchers.drain() {
            handle.abort();
            tracing::debug!("[TriggerRegistry] Stopped file watcher for trigger {}", id);
        }

        tracing::info!("[TriggerRegistry] Trigger engine stopped");
    }

    // ------------------------------------------------------------------
    // Trigger execution
    // ------------------------------------------------------------------

    /// Execute a trigger's action in response to an event.
    ///
    /// This is the central dispatch point -- it records the firing, emits an
    /// event to the frontend, and (for "agent" action types) spawns an agent
    /// task.
    async fn execute_trigger(
        triggers: &Arc<RwLock<HashMap<String, RegisteredTrigger>>>,
        executions: &Arc<RwLock<HashMap<String, Vec<TriggerExecution>>>>,
        trigger_id: &str,
        event_data: serde_json::Value,
        app_handle: &Option<AppHandle>,
    ) -> anyhow::Result<()> {
        // Snapshot the trigger and update counters atomically.
        let trigger = {
            let mut map = triggers.write().await;
            let t = map
                .get_mut(trigger_id)
                .ok_or_else(|| anyhow::anyhow!("Trigger not found: {}", trigger_id))?;

            if !t.enabled {
                return Ok(()); // silently skip disabled triggers
            }

            t.last_triggered_at = Some(Utc::now().to_rfc3339());
            t.trigger_count += 1;
            t.clone()
        };

        tracing::info!(
            "[TriggerRegistry] Executing trigger '{}' ({}), count={}",
            trigger.name,
            trigger.id,
            trigger.trigger_count
        );

        // Emit frontend event so the UI can show execution status.
        if let Some(ref app) = app_handle {
            let payload = TriggerEventPayload {
                trigger_id: trigger.id.clone(),
                trigger_name: trigger.name.clone(),
                event: "trigger:fired".to_string(),
                event_data: event_data.clone(),
            };
            if let Err(e) = app.emit("trigger:fired", &payload) {
                tracing::warn!(
                    "[TriggerRegistry] Failed to emit trigger:fired event: {}",
                    e
                );
            }
        }

        // Dispatch based on action_type and capture any error for the execution log.
        let dispatch_result: anyhow::Result<()> = match trigger.action.action_type.as_str() {
            "agent" => Self::spawn_agent_from_trigger(&trigger, &event_data, app_handle).await,
            "notification" => {
                Self::send_trigger_notification(&trigger, app_handle);
                Ok(())
            }
            "workflow" => {
                // Workflow execution is delegated to the orchestration layer.
                // Emit an event that the workflow engine can pick up.
                if let Some(ref app) = app_handle {
                    let payload = serde_json::json!({
                        "triggerId": trigger.id,
                        "triggerName": trigger.name,
                        "eventData": event_data,
                        "prompt": trigger.action.prompt,
                    });
                    if let Err(e) = app.emit("trigger:workflow_requested", &payload) {
                        tracing::warn!("[TriggerRegistry] Failed to emit workflow request: {}", e);
                    }
                }
                Ok(())
            }
            other => {
                tracing::warn!(
                    "[TriggerRegistry] Unknown action type '{}' for trigger {}",
                    other,
                    trigger.id
                );
                Ok(())
            }
        };

        // Record the execution in the history log (capped at 100 per trigger).
        {
            let execution = TriggerExecution {
                id: Uuid::new_v4().to_string(),
                trigger_id: trigger.id.clone(),
                trigger_name: trigger.name.clone(),
                fired_at: Utc::now().to_rfc3339(),
                success: dispatch_result.is_ok(),
                error: dispatch_result.as_ref().err().map(|e| e.to_string()),
                event_data: event_data.clone(),
            };

            let mut exec_map = executions.write().await;
            let history = exec_map.entry(trigger.id.clone()).or_insert_with(Vec::new);
            history.insert(0, execution);
            if history.len() > 100 {
                history.truncate(100);
            }
        }

        dispatch_result
    }

    /// Spawn an agent session in response to a trigger.
    ///
    /// This emits a `trigger:agent_spawn` event that the frontend/background
    /// agent manager can consume to actually start the agent. We intentionally
    /// decouple from `BackgroundAgentManager` here to avoid circular deps and
    /// to let the frontend decide on approval flow.
    async fn spawn_agent_from_trigger(
        trigger: &RegisteredTrigger,
        event_data: &serde_json::Value,
        app_handle: &Option<AppHandle>,
    ) -> anyhow::Result<()> {
        let prompt = trigger
            .action
            .prompt
            .clone()
            .unwrap_or_else(|| format!("Triggered by: {}", trigger.name));

        let spawn_payload = serde_json::json!({
            "triggerId": trigger.id,
            "triggerName": trigger.name,
            "prompt": prompt,
            "model": trigger.action.model,
            "approvalRequired": trigger.action.approval_required,
            "eventData": event_data,
            "timeoutSecs": TRIGGER_EXECUTION_TIMEOUT_SECS,
            "spawnId": Uuid::new_v4().to_string(),
        });

        if let Some(ref app) = app_handle {
            app.emit("trigger:agent_spawn", &spawn_payload)?;
            tracing::info!(
                "[TriggerRegistry] Emitted agent spawn for trigger '{}'",
                trigger.name
            );
        } else {
            tracing::warn!(
                "[TriggerRegistry] No app handle; cannot spawn agent for trigger '{}'",
                trigger.name
            );
        }

        Ok(())
    }

    /// Send a desktop notification for a trigger.
    fn send_trigger_notification(trigger: &RegisteredTrigger, app_handle: &Option<AppHandle>) {
        if let Some(ref app) = app_handle {
            use tauri_plugin_notification::NotificationExt;

            let title = format!("Trigger Fired: {}", trigger.name);
            let body = trigger
                .action
                .prompt
                .clone()
                .unwrap_or_else(|| format!("Trigger '{}' fired.", trigger.name));

            if let Err(e) = app
                .notification()
                .builder()
                .title(&title)
                .body(&body)
                .show()
            {
                tracing::warn!(
                    "[TriggerRegistry] Failed to show notification for trigger {}: {}",
                    trigger.id,
                    e
                );
            }
        }
    }

    // ------------------------------------------------------------------
    // File watcher helper
    // ------------------------------------------------------------------

    /// Start a file-system watcher for a single FileWatcher trigger.
    async fn start_file_watcher(&mut self, trigger: &RegisteredTrigger) -> anyhow::Result<()> {
        let (watch_path, glob_pattern, debounce_ms) = match &trigger.config {
            TriggerConfig::FileWatcher {
                watch_path,
                glob,
                debounce_ms,
            } => (
                watch_path.clone(),
                glob.clone(),
                debounce_ms.unwrap_or(DEFAULT_DEBOUNCE_MS),
            ),
            _ => {
                return Err(anyhow::anyhow!(
                    "Trigger {} is not a FileWatcher",
                    trigger.id
                ))
            }
        };

        // Re-check the denylist at watcher start time (defense-in-depth).
        let watch_path_ref = Path::new(&watch_path);
        if !is_watch_path_allowed(watch_path_ref) {
            return Err(anyhow::anyhow!(
                "Watch path '{}' is inside a sensitive directory and cannot be watched",
                watch_path
            ));
        }

        let trigger_id = trigger.id.clone();
        let triggers = Arc::clone(&self.triggers);
        let executions = Arc::clone(&self.executions);
        let app_handle = self.app_handle.clone();

        // Channel for debounce: watcher thread sends events, async task debounces & fires.
        let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<std::path::PathBuf>>(64);

        let glob_pattern_clone = glob_pattern.clone();
        let watcher =
            notify::recommended_watcher(move |res: Result<NotifyEvent, notify::Error>| {
                if let Ok(event) = res {
                    // Only care about create/modify/remove.
                    if !matches!(
                        event.kind,
                        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
                    ) {
                        return;
                    }

                    // Optional glob filter.
                    let paths: Vec<_> = if let Some(ref pattern) = glob_pattern_clone {
                        let glob_matcher = glob::Pattern::new(pattern).ok();
                        event
                            .paths
                            .into_iter()
                            .filter(|p| {
                                glob_matcher
                                    .as_ref()
                                    .map(|g| {
                                        g.matches(
                                            p.file_name()
                                                .unwrap_or_default()
                                                .to_str()
                                                .unwrap_or_default(),
                                        )
                                    })
                                    .unwrap_or(true)
                            })
                            .collect()
                    } else {
                        event.paths
                    };

                    if !paths.is_empty() {
                        let _ = tx.try_send(paths);
                    }
                }
            })
            .map_err(|e| anyhow::anyhow!("Failed to create file watcher: {}", e))?;

        // Start watching.
        let mut watcher = watcher;
        watcher
            .watch(std::path::Path::new(&watch_path), RecursiveMode::Recursive)
            .map_err(|e| anyhow::anyhow!("Failed to watch path '{}': {}", watch_path, e))?;

        // Debounce task.
        let debounce_handle = tokio::spawn(async move {
            while let Some(paths) = rx.recv().await {
                // Debounce: drain any additional events that arrive within the window.
                tokio::time::sleep(tokio::time::Duration::from_millis(debounce_ms)).await;
                let mut all_paths = paths;
                while let Ok(more) = rx.try_recv() {
                    all_paths.extend(more);
                }
                all_paths.sort();
                all_paths.dedup();

                let event_data = serde_json::json!({
                    "type": "file_change",
                    "paths": all_paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>(),
                });

                if let Err(e) = Self::execute_trigger(
                    &triggers,
                    &executions,
                    &trigger_id,
                    event_data,
                    &app_handle,
                )
                .await
                {
                    tracing::warn!(
                        "[TriggerRegistry] File watcher trigger execution failed: {}",
                        e
                    );
                }
            }
        });

        self.file_watchers
            .insert(trigger.id.clone(), (watcher, debounce_handle));

        tracing::info!(
            "[TriggerRegistry] File watcher started for trigger {} on '{}'",
            trigger.id,
            watch_path
        );

        Ok(())
    }

    // ------------------------------------------------------------------
    // Event emission helper
    // ------------------------------------------------------------------

    fn emit_event(&self, event: &str, trigger_id: &str, data: serde_json::Value) {
        if let Some(ref app) = self.app_handle {
            let payload = serde_json::json!({
                "triggerId": trigger_id,
                "data": data,
            });
            if let Err(e) = app.emit(event, &payload) {
                tracing::warn!("[TriggerRegistry] Failed to emit event '{}': {}", event, e);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Cron polling loop
// ---------------------------------------------------------------------------

/// Background task that checks cron-based triggers every `CRON_POLL_INTERVAL_SECS`.
async fn cron_poll_loop(
    triggers: Arc<RwLock<HashMap<String, RegisteredTrigger>>>,
    executions: Arc<RwLock<HashMap<String, Vec<TriggerExecution>>>>,
    cancel: Arc<tokio::sync::Notify>,
    app_handle: Option<AppHandle>,
) {
    tracing::info!(
        "[TriggerRegistry] Cron poll loop started (interval={}s)",
        CRON_POLL_INTERVAL_SECS
    );

    // Track the last time each cron trigger was checked so we only fire once
    // per matching interval.
    let mut last_fired: HashMap<String, chrono::DateTime<Utc>> = HashMap::new();

    loop {
        tokio::select! {
            _ = cancel.notified() => {
                tracing::info!("[TriggerRegistry] Cron poll loop cancelled");
                break;
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(CRON_POLL_INTERVAL_SECS)) => {
                let now = Utc::now();
                let snapshot: Vec<RegisteredTrigger> = {
                    let trig = triggers.read().await;
                    trig.values()
                        .filter(|t| t.trigger_type == TriggerType::Cron && t.enabled)
                        .cloned()
                        .collect()
                };

                for trigger in &snapshot {
                    let expression = match &trigger.config {
                        TriggerConfig::Cron { expression, .. } => expression.clone(),
                        _ => continue,
                    };

                    let schedule = match Schedule::from_str(&expression) {
                        Ok(s) => s,
                        Err(e) => {
                            tracing::warn!(
                                "[TriggerRegistry] Invalid cron expression for trigger {}: {}",
                                trigger.id,
                                e
                            );
                            continue;
                        }
                    };

                    // Check if the schedule had a matching time since we last checked.
                    let since = last_fired
                        .get(&trigger.id)
                        .copied()
                        .unwrap_or_else(|| now - chrono::Duration::seconds(CRON_POLL_INTERVAL_SECS as i64 + 1));

                    let should_fire = schedule
                        .after(&since)
                        .take(1)
                        .any(|next| next <= now);

                    if should_fire {
                        last_fired.insert(trigger.id.clone(), now);

                        let event_data = serde_json::json!({
                            "type": "cron",
                            "expression": expression,
                            "firedAt": now.to_rfc3339(),
                        });

                        if let Err(e) = TriggerRegistry::execute_trigger(
                            &triggers,
                            &executions,
                            &trigger.id,
                            event_data,
                            &app_handle,
                        )
                        .await
                        {
                            tracing::warn!(
                                "[TriggerRegistry] Cron trigger execution failed for {}: {}",
                                trigger.id,
                                e
                            );
                        }
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Webhook server
// ---------------------------------------------------------------------------

/// Minimal localhost webhook server.
///
/// Routes incoming POST requests to `/<path>` against registered webhook
/// triggers. An optional `auth_token` is checked via the `Authorization`
/// header (Bearer scheme).
async fn webhook_server(
    triggers: Arc<RwLock<HashMap<String, RegisteredTrigger>>>,
    executions: Arc<RwLock<HashMap<String, Vec<TriggerExecution>>>>,
    cancel: Arc<tokio::sync::Notify>,
    app_handle: Option<AppHandle>,
) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    let addr = format!("127.0.0.1:{}", WEBHOOK_PORT);

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            tracing::info!("[TriggerRegistry] Webhook server listening on {}", addr);
            l
        }
        Err(e) => {
            tracing::error!(
                "[TriggerRegistry] Failed to bind webhook server on {}: {}",
                addr,
                e
            );
            return;
        }
    };

    loop {
        tokio::select! {
            _ = cancel.notified() => {
                tracing::info!("[TriggerRegistry] Webhook server shutting down");
                break;
            }
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((mut stream, peer)) => {
                        let triggers = Arc::clone(&triggers);
                        let executions = Arc::clone(&executions);
                        let app_handle = app_handle.clone();

                        tokio::spawn(async move {
                            // Read the full HTTP request (up to 64KB).
                            let mut buf = vec![0u8; 65536];
                            let n = match tokio::time::timeout(
                                tokio::time::Duration::from_secs(10),
                                stream.read(&mut buf),
                            )
                            .await
                            {
                                Ok(Ok(n)) if n > 0 => n,
                                _ => return,
                            };

                            let request = String::from_utf8_lossy(&buf[..n]);

                            // Parse the minimal HTTP request.
                            let (method, path, auth_header, body) = parse_http_request(&request);

                            if method != "POST" {
                                let response = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\n\r\n";
                                let _ = stream.write_all(response.as_bytes()).await;
                                return;
                            }

                            // Find a matching webhook trigger.
                            let matched = {
                                let trig = triggers.read().await;
                                trig.values()
                                    .find(|t| {
                                        t.trigger_type == TriggerType::Webhook
                                            && t.enabled
                                            && matches!(&t.config, TriggerConfig::Webhook { path: p, .. } if *p == path)
                                    })
                                    .cloned()
                            };

                            let trigger = match matched {
                                Some(t) => t,
                                None => {
                                    let response = "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n";
                                    let _ = stream.write_all(response.as_bytes()).await;
                                    return;
                                }
                            };

                            // Check auth token if configured.
                            // Uses constant-time comparison to prevent timing
                            // side-channel attacks on the bearer token.
                            if let TriggerConfig::Webhook {
                                auth_token: Some(ref expected),
                                ..
                            } = trigger.config
                            {
                                let bearer = format!("Bearer {}", expected);
                                let provided = auth_header.as_deref().unwrap_or_default();
                                if !constant_time_eq(provided.as_bytes(), bearer.as_bytes()) {
                                    let response = "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n";
                                    let _ = stream.write_all(response.as_bytes()).await;
                                    tracing::warn!(
                                        "[TriggerRegistry] Webhook auth failed for trigger {} from {}",
                                        trigger.id,
                                        peer
                                    );
                                    return;
                                }
                            }

                            // Parse body as JSON (best-effort).
                            let body_json: serde_json::Value = serde_json::from_str(&body)
                                .unwrap_or_else(|_| serde_json::json!({ "raw": body }));

                            let event_data = serde_json::json!({
                                "type": "webhook",
                                "path": path,
                                "peer": peer.to_string(),
                                "body": body_json,
                            });

                            let exec_result = TriggerRegistry::execute_trigger(
                                &triggers,
                                &executions,
                                &trigger.id,
                                event_data,
                                &app_handle,
                            )
                            .await;

                            let response = if exec_result.is_ok() {
                                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\n\r\n{\"ok\": true}\n"
                            } else {
                                "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\n\r\n"
                            };
                            let _ = stream.write_all(response.as_bytes()).await;
                        });
                    }
                    Err(e) => {
                        tracing::warn!("[TriggerRegistry] Webhook accept error: {}", e);
                    }
                }
            }
        }
    }
}

/// Parse a raw HTTP request into (method, path, authorization_header, body).
fn parse_http_request(raw: &str) -> (String, String, Option<String>, String) {
    let mut lines = raw.split("\r\n");

    // Request line: "POST /path HTTP/1.1"
    let request_line = lines.next().unwrap_or_default();
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let method = parts.first().unwrap_or(&"").to_string();
    let path = parts.get(1).unwrap_or(&"/").to_string();

    // Headers
    let mut auth_header: Option<String> = None;
    let mut found_body = false;
    let mut header_lines = Vec::new();

    for line in lines {
        if line.is_empty() {
            found_body = true;
            break;
        }
        header_lines.push(line);
        if let Some(value) = line.strip_prefix("Authorization: ") {
            auth_header = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("authorization: ") {
            auth_header = Some(value.to_string());
        }
    }

    // Body: everything after the blank line
    let body = if found_body {
        // Re-split from the original to grab everything after \r\n\r\n
        raw.split_once("\r\n\r\n")
            .map(|x| x.1)
            .unwrap_or_default()
            .to_string()
    } else {
        String::new()
    };

    (method, path, auth_header, body)
}

// ---------------------------------------------------------------------------
// Tauri state wrapper
// ---------------------------------------------------------------------------

/// Tauri-managed state for the trigger registry.
pub struct TriggerRegistryState(pub Arc<RwLock<TriggerRegistry>>);

impl TriggerRegistryState {
    pub fn new(registry: TriggerRegistry) -> Self {
        Self(Arc::new(RwLock::new(registry)))
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// Register a new trigger.
///
/// Accepts the full `RegisteredTrigger` from the frontend. If no `id` or
/// `created_at` is provided, sensible defaults are generated.
#[tauri::command]
pub async fn register_trigger(
    trigger: RegisteredTrigger,
    state: tauri::State<'_, TriggerRegistryState>,
) -> Result<RegisteredTrigger, String> {
    let mut trigger = trigger;

    // Fill in defaults if the frontend didn't supply them.
    if trigger.id.is_empty() {
        trigger.id = Uuid::new_v4().to_string();
    }
    let now = Utc::now().to_rfc3339();
    if trigger.created_at.is_empty() {
        trigger.created_at = now.clone();
    }
    if trigger.updated_at.is_empty() {
        trigger.updated_at = now;
    }

    // Use a single write lock for register + watcher start to avoid TOCTOU races.
    {
        let mut registry = state.0.write().await;
        registry
            .register(trigger.clone())
            .await
            .map_err(|e| e.to_string())?;

        // For FileWatcher triggers, dynamically start the watcher immediately
        // instead of waiting for the next full engine restart.
        if trigger.trigger_type == TriggerType::FileWatcher
            && trigger.enabled
            && !registry.file_watchers.contains_key(&trigger.id)
        {
            if let Err(e) = registry.start_file_watcher(&trigger).await {
                tracing::warn!(
                    "[TriggerRegistry] Failed to start file watcher on dynamic registration for {}: {}",
                    trigger.id,
                    e
                );
            }
        }
    }

    Ok(trigger)
}

/// Unregister (delete) a trigger by ID.
#[tauri::command]
pub async fn unregister_trigger(
    trigger_id: String,
    state: tauri::State<'_, TriggerRegistryState>,
) -> Result<(), String> {
    let mut registry = state.0.write().await;
    registry
        .unregister(&trigger_id)
        .await
        .map_err(|e| e.to_string())?;
    // Stop and remove the file watcher if one exists (prevents resource leak).
    registry.file_watchers.remove(&trigger_id);
    Ok(())
}

/// List all registered triggers.
#[tauri::command]
pub async fn list_triggers(
    state: tauri::State<'_, TriggerRegistryState>,
) -> Result<Vec<RegisteredTrigger>, String> {
    let registry = state.0.read().await;
    Ok(registry.list().await)
}

/// Toggle a trigger on or off.
#[tauri::command]
pub async fn toggle_trigger(
    trigger_id: String,
    enabled: bool,
    state: tauri::State<'_, TriggerRegistryState>,
) -> Result<(), String> {
    let registry = state.0.read().await;
    if enabled {
        registry
            .enable(&trigger_id)
            .await
            .map_err(|e| e.to_string())
    } else {
        registry
            .disable(&trigger_id)
            .await
            .map_err(|e| e.to_string())
    }
}

/// Update mutable fields on an existing trigger (partial patch).
///
/// Only the fields present in the `updates` JSON object are applied.
/// Returns the updated `RegisteredTrigger`.
#[tauri::command]
pub async fn update_trigger(
    trigger_id: String,
    updates: serde_json::Value,
    state: tauri::State<'_, TriggerRegistryState>,
) -> Result<RegisteredTrigger, String> {
    let registry = state.0.read().await;
    registry
        .update(&trigger_id, updates)
        .await
        .map_err(|e| e.to_string())
}

/// Return the execution history for a trigger (most recent first, up to 100 entries).
#[tauri::command]
pub async fn get_trigger_executions(
    trigger_id: String,
    state: tauri::State<'_, TriggerRegistryState>,
) -> Result<Vec<TriggerExecution>, String> {
    let registry = state.0.read().await;
    Ok(registry.get_executions(&trigger_id).await)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_trigger(trigger_type: TriggerType, config: TriggerConfig) -> RegisteredTrigger {
        RegisteredTrigger {
            id: Uuid::new_v4().to_string(),
            name: "Test trigger".to_string(),
            trigger_type,
            config,
            action: TriggerAction {
                action_type: "notification".to_string(),
                prompt: Some("Hello from trigger".to_string()),
                model: None,
                approval_required: false,
            },
            enabled: true,
            last_triggered_at: None,
            trigger_count: 0,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        }
    }

    #[tokio::test]
    async fn test_register_and_list() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::Cron,
            TriggerConfig::Cron {
                expression: "0 */5 * * * *".to_string(),
                timezone: None,
            },
        );

        registry.register(trigger.clone()).await.unwrap();

        let list = registry.list().await;
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, trigger.id);
    }

    #[tokio::test]
    async fn test_unregister() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::Cron,
            TriggerConfig::Cron {
                expression: "0 */5 * * * *".to_string(),
                timezone: None,
            },
        );
        let id = trigger.id.clone();

        registry.register(trigger).await.unwrap();
        assert_eq!(registry.list().await.len(), 1);

        registry.unregister(&id).await.unwrap();
        assert_eq!(registry.list().await.len(), 0);
    }

    #[tokio::test]
    async fn test_unregister_missing_returns_error() {
        let registry = TriggerRegistry::new();
        let result = registry.unregister("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_enable_disable() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::Webhook,
            TriggerConfig::Webhook {
                path: "/test".to_string(),
                auth_token: None,
            },
        );
        let id = trigger.id.clone();

        registry.register(trigger).await.unwrap();

        registry.disable(&id).await.unwrap();
        let list = registry.list().await;
        assert!(!list[0].enabled);

        registry.enable(&id).await.unwrap();
        let list = registry.list().await;
        assert!(list[0].enabled);
    }

    #[tokio::test]
    async fn test_invalid_cron_expression_rejected() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::Cron,
            TriggerConfig::Cron {
                expression: "not a cron".to_string(),
                timezone: None,
            },
        );

        let result = registry.register(trigger).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid cron"));
    }

    #[tokio::test]
    async fn test_invalid_webhook_path_rejected() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::Webhook,
            TriggerConfig::Webhook {
                path: "no-leading-slash".to_string(),
                auth_token: None,
            },
        );

        let result = registry.register(trigger).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("must start with"));
    }

    #[tokio::test]
    async fn test_nonexistent_watch_path_rejected() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::FileWatcher,
            TriggerConfig::FileWatcher {
                watch_path: "/nonexistent/path/that/does/not/exist".to_string(),
                glob: None,
                debounce_ms: None,
            },
        );

        let result = registry.register(trigger).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("does not exist"));
    }

    #[test]
    fn test_parse_http_request_basic() {
        let raw = "POST /webhook/test HTTP/1.1\r\nHost: localhost\r\nAuthorization: Bearer secret123\r\nContent-Type: application/json\r\n\r\n{\"hello\": \"world\"}";
        let (method, path, auth, body) = parse_http_request(raw);
        assert_eq!(method, "POST");
        assert_eq!(path, "/webhook/test");
        assert_eq!(auth, Some("Bearer secret123".to_string()));
        assert_eq!(body, "{\"hello\": \"world\"}");
    }

    #[test]
    fn test_parse_http_request_no_body() {
        let raw = "GET / HTTP/1.1\r\nHost: localhost\r\n\r\n";
        let (method, path, auth, body) = parse_http_request(raw);
        assert_eq!(method, "GET");
        assert_eq!(path, "/");
        assert!(auth.is_none());
        assert!(body.is_empty());
    }

    #[tokio::test]
    async fn test_start_and_stop() {
        let mut registry = TriggerRegistry::new();
        // Start should succeed even with no triggers.
        registry.start().await.unwrap();
        // Stop should be clean.
        registry.stop().await;
    }

    #[tokio::test]
    async fn test_file_watcher_with_valid_path() {
        let registry = TriggerRegistry::new();
        let temp_dir = tempfile::tempdir().unwrap();
        let trigger = make_test_trigger(
            TriggerType::FileWatcher,
            TriggerConfig::FileWatcher {
                watch_path: temp_dir.path().to_str().unwrap().to_string(),
                glob: Some("*.txt".to_string()),
                debounce_ms: Some(100),
            },
        );

        // Should register without error since temp_dir exists.
        registry.register(trigger).await.unwrap();
    }

    // ------------------------------------------------------------------
    // Security: constant-time token comparison
    // ------------------------------------------------------------------

    #[test]
    fn test_constant_time_eq_matching() {
        assert!(constant_time_eq(b"secret123", b"secret123"));
        assert!(constant_time_eq(b"", b""));
    }

    #[test]
    fn test_constant_time_eq_mismatch() {
        assert!(!constant_time_eq(b"secret123", b"secret124"));
        assert!(!constant_time_eq(b"short", b"longer_string"));
        assert!(!constant_time_eq(b"abc", b""));
    }

    // ------------------------------------------------------------------
    // Security: file watcher path denylist
    // ------------------------------------------------------------------

    #[test]
    fn test_watch_path_allowed_for_normal_dirs() {
        let temp_dir = tempfile::tempdir().unwrap();
        assert!(is_watch_path_allowed(temp_dir.path()));
    }

    #[test]
    fn test_watch_path_denied_for_ssh() {
        let home = dirs::home_dir().unwrap_or_default();
        assert!(!is_watch_path_allowed(&home.join(".ssh")));
        assert!(!is_watch_path_allowed(&home.join(".ssh/keys")));
    }

    #[test]
    fn test_watch_path_denied_for_aws() {
        let home = dirs::home_dir().unwrap_or_default();
        assert!(!is_watch_path_allowed(&home.join(".aws")));
        assert!(!is_watch_path_allowed(&home.join(".aws/credentials")));
    }

    #[test]
    fn test_watch_path_denied_for_gnupg() {
        let home = dirs::home_dir().unwrap_or_default();
        assert!(!is_watch_path_allowed(&home.join(".gnupg")));
    }

    #[tokio::test]
    async fn test_sensitive_watch_path_rejected_on_register() {
        let registry = TriggerRegistry::new();
        let home = dirs::home_dir().unwrap_or_default();
        let ssh_path = home.join(".ssh");

        // Only test if the directory actually exists on this machine.
        if ssh_path.exists() {
            let trigger = make_test_trigger(
                TriggerType::FileWatcher,
                TriggerConfig::FileWatcher {
                    watch_path: ssh_path.to_str().unwrap().to_string(),
                    glob: None,
                    debounce_ms: None,
                },
            );

            let result = registry.register(trigger).await;
            assert!(result.is_err());
            assert!(result
                .unwrap_err()
                .to_string()
                .contains("sensitive directory"));
        }
    }

    // ------------------------------------------------------------------
    // Security: cron minimum interval
    // ------------------------------------------------------------------

    #[test]
    fn test_cron_interval_every_5_min_ok() {
        // "0 */5 * * * *" = every 5 minutes — should be accepted.
        assert!(validate_cron_interval("0 */5 * * * *").is_ok());
    }

    #[test]
    fn test_cron_interval_hourly_ok() {
        // "0 0 * * * *" = every hour — should be accepted.
        assert!(validate_cron_interval("0 0 * * * *").is_ok());
    }

    #[test]
    fn test_cron_interval_every_second_rejected() {
        // "* * * * * *" = every second — must be rejected.
        assert!(validate_cron_interval("* * * * * *").is_err());
    }

    #[test]
    fn test_cron_interval_every_minute_rejected() {
        // "0 * * * * *" = every minute — must be rejected.
        let result = validate_cron_interval("0 * * * * *");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("minimum allowed interval"));
    }

    #[tokio::test]
    async fn test_too_frequent_cron_rejected_on_register() {
        let registry = TriggerRegistry::new();
        let trigger = make_test_trigger(
            TriggerType::Cron,
            TriggerConfig::Cron {
                expression: "0 * * * * *".to_string(), // every minute — too frequent
                timezone: None,
            },
        );

        let result = registry.register(trigger).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("minimum allowed interval"));
    }
}
