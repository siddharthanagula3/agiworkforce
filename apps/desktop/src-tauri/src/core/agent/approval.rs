use super::*;
use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{self, json};
use std::collections::{BTreeSet, HashMap, VecDeque};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{oneshot, Mutex as TokioMutex, RwLock};

/// Canonical bound on how long a single interactive approval may sit pending
/// before the controller itself resolves it as expired.
///
/// Before this existed, `request_approval` parked on a `oneshot` receiver with
/// no deadline at all: a producer that forgot to wrap the call in its own
/// `tokio::time::timeout` blocked its step forever, and the approval card the
/// user was looking at never reached a terminal state. `autonomous.rs` and
/// `llm/tool_executor/mod.rs` still wrap their calls in an outer timeout of the
/// same length; those are now belt-and-braces around the controller's own
/// bound rather than the only thing standing between the product and a hang.
pub const DEFAULT_APPROVAL_TIMEOUT_SECS: u64 = 300;

/// How many terminal decisions are remembered so a duplicate click, a retried
/// IPC call, or a second surface answering the same card is an idempotent
/// no-op instead of a user-visible `Approval {id} not pending` error.
const RESOLVED_HISTORY_LIMIT: usize = 256;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Synchronous, rule-based approval checker used **inside** `AutonomousAgent`.
///
/// Evaluates a `Task` against `ApprovalRule`s and returns a boolean decision
/// (approve / reject) without user interaction. This is the first gate: if
/// `should_approve()` returns `false`, the caller should escalate to
/// `ApprovalController` for an interactive frontend approval prompt.
///
/// **Canonical usage**: `AutonomousAgent::approval` field.
/// See also: `ApprovalController` -- the async, frontend-facing approval system.
pub struct ApprovalManager {
    config: AgentConfig,
    approval_rules: Vec<ApprovalRule>,
    auto_approved_tasks: HashMap<String, bool>,
}

#[derive(Debug, Clone)]
pub enum ApprovalRule {
    PatternMatch { pattern: String },

    NoFileSystemOps,

    NoNetworkOps,

    ReadOnly,

    AlwaysRequire,
}

impl ApprovalManager {
    pub fn new(config: AgentConfig) -> Self {
        let mut approval_rules = Vec::new();

        if config.auto_approve {
            approval_rules.push(ApprovalRule::ReadOnly);
            approval_rules.push(ApprovalRule::NoFileSystemOps);
            approval_rules.push(ApprovalRule::NoNetworkOps);
        } else {
            approval_rules.push(ApprovalRule::AlwaysRequire);
        }

        Self {
            config,
            approval_rules,
            auto_approved_tasks: HashMap::new(),
        }
    }

    pub async fn should_approve(&self, task: &Task) -> Result<bool> {
        if let Some(&approved) = self.auto_approved_tasks.get(&task.id) {
            return Ok(approved);
        }

        // SAFETY GATE: Dangerous operations ALWAYS require explicit approval,
        // even when auto_approve is true. This prevents automated deletion,
        // command execution, and database mutations without human confirmation.
        if self.has_dangerous_operations(task)? {
            return Ok(false);
        }

        if task.auto_approve {
            return Ok(true);
        }

        // AlwaysRequire is an unconditional deny — short-circuit before any other
        // rule can grant approval, preventing PatternMatch from bypassing it.
        if self
            .approval_rules
            .iter()
            .any(|r| matches!(r, ApprovalRule::AlwaysRequire))
        {
            return Ok(false);
        }

        for rule in &self.approval_rules {
            if self.matches_rule(rule, task)? {
                return Ok(true);
            }
        }

        Ok(self.config.auto_approve)
    }

    fn matches_rule(&self, rule: &ApprovalRule, task: &Task) -> Result<bool> {
        match rule {
            ApprovalRule::PatternMatch { pattern } => Ok(task
                .description
                .to_lowercase()
                .contains(&pattern.to_lowercase())),
            ApprovalRule::NoFileSystemOps => Ok(!self.has_file_operations(task)),
            ApprovalRule::NoNetworkOps => Ok(!self.has_network_operations(task)),
            ApprovalRule::ReadOnly => Ok(self.is_read_only(task)),
            ApprovalRule::AlwaysRequire => Ok(false),
        }
    }

    fn has_file_operations(&self, task: &Task) -> bool {
        task.steps.iter().any(|step| {
            matches!(
                step.action,
                Action::WriteFile { .. } | Action::ExecuteCommand { .. }
            )
        })
    }

    fn has_network_operations(&self, task: &Task) -> bool {
        task.steps
            .iter()
            .any(|step| matches!(step.action, Action::Navigate { .. }))
    }

    fn is_read_only(&self, task: &Task) -> bool {
        task.steps.iter().all(|step| {
            matches!(
                step.action,
                Action::Screenshot { .. }
                    | Action::ReadFile { .. }
                    | Action::SearchText { .. }
                    | Action::WaitForElement { .. }
            )
        })
    }

    fn has_dangerous_operations(&self, task: &Task) -> Result<bool> {
        let dangerous_patterns = [
            "delete",
            "remove",
            "uninstall",
            "format",
            "wipe",
            "clear",
            "reset",
            "shutdown",
            "restart",
            "drop table",
            "drop database",
            "truncate",
        ];

        let description_lower = task.description.to_lowercase();
        let has_dangerous_keyword = dangerous_patterns
            .iter()
            .any(|pattern| description_lower.contains(pattern));

        // Check for dangerous step actions:
        // - Any ExecuteCommand is inherently dangerous (terminal_execute, db_execute)
        // - WriteFile to system/root paths is dangerous
        let has_dangerous_step = task.steps.iter().any(|step| {
            match &step.action {
                Action::ExecuteCommand { .. } => {
                    // All command execution is dangerous — this covers
                    // terminal_execute and db_execute tool categories
                    true
                }
                Action::WriteFile { path, .. } => {
                    // Writing to system-critical paths requires approval
                    let p = path.to_lowercase();
                    p.starts_with("/etc")
                        || p.starts_with("/usr")
                        || p.starts_with("/bin")
                        || p.starts_with("/sbin")
                        || p.starts_with("/system")
                        || p.starts_with("c:\\windows")
                        || p.starts_with("c:\\program files")
                }
                _ => false,
            }
        });

        Ok(has_dangerous_keyword || has_dangerous_step)
    }

    pub fn approve_task(&mut self, task_id: &str) {
        self.auto_approved_tasks.insert(task_id.to_string(), true);
    }

    pub fn reject_task(&mut self, task_id: &str) {
        self.auto_approved_tasks.insert(task_id.to_string(), false);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalScopeType {
    Terminal,
    Filesystem,
    Browser,
    Ui,
    Mcp,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalScope {
    #[serde(rename = "type")]
    pub scope_type: ApprovalScopeType,
    pub command: Option<String>,
    pub cwd: Option<String>,
    pub path: Option<String>,
    pub domain: Option<String>,
    pub description: Option<String>,
    pub risk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApprovalRequestPayload {
    pub action_id: String,
    pub tool_name: String,
    pub title: String,
    pub description: String,
    pub reason: String,
    pub risk_level: String,
    pub scope: ApprovalScope,
    pub workflow_hash: Option<String>,
    pub action_signature: String,
}

/// Envelope actually placed on `agent:permission_required`.
///
/// The request fields are flattened so every existing consumer keeps the shape
/// it already parses (`apps/desktop/src/stores/chat/agentWorkflowEvents.ts`
/// -> `applyAgentPermissionRequired`). The added fields give the renderer the
/// deadline it needs to show, and to stop showing, a card that the backend has
/// already bounded.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalRequestEnvelope<'a> {
    #[serde(flatten)]
    request: &'a ApprovalRequestPayload,
    requested_at_ms: u64,
    expires_at_ms: u64,
    timeout_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApprovalResolution {
    Approved { trust: bool },
    Rejected { reason: Option<String> },
}

impl ApprovalResolution {
    fn describe(&self) -> String {
        match self {
            Self::Approved { trust: true } => "approved (trusted for this workflow)".to_string(),
            Self::Approved { trust: false } => "approved".to_string(),
            Self::Rejected { reason: Some(reason) } => format!("rejected ({})", reason),
            Self::Rejected { reason: None } => "rejected".to_string(),
        }
    }
}

#[derive(Debug)]
struct PendingApproval {
    sender: oneshot::Sender<ApprovalResolution>,

    resolved: AtomicBool,
}

/// Bounded memory of decisions that already reached a terminal state.
///
/// Without it, `resolve()` could only answer "pending" or "not pending", so a
/// double-click on Approve surfaced `Approval {id} not pending` on the card the
/// user had just successfully answered.
#[derive(Debug, Default)]
struct ResolvedLedger {
    outcomes: HashMap<String, ApprovalResolution>,
    order: VecDeque<String>,
}

impl ResolvedLedger {
    fn record(&mut self, action_id: &str, resolution: ApprovalResolution) {
        if self
            .outcomes
            .insert(action_id.to_string(), resolution)
            .is_none()
        {
            self.order.push_back(action_id.to_string());
            while self.order.len() > RESOLVED_HISTORY_LIMIT {
                if let Some(evicted) = self.order.pop_front() {
                    self.outcomes.remove(&evicted);
                }
            }
        }
    }

    fn get(&self, action_id: &str) -> Option<ApprovalResolution> {
        self.outcomes.get(action_id).cloned()
    }
}

/// Releases the controller's pending slot if `request_approval` goes away
/// without reaching a terminal state — which is exactly what happens when a
/// caller wraps the call in its own `tokio::time::timeout` and that outer
/// timeout wins, or when the surrounding run is cancelled.
///
/// The slot used to leak: the map entry stayed forever, so the controller grew
/// without bound and a later decision for that id removed a dead entry and
/// failed with `Failed to send approval resolution`, instead of telling the
/// caller the request was no longer live.
struct PendingSlot<'a> {
    pending: &'a Mutex<HashMap<String, PendingApproval>>,
    action_id: String,
    armed: bool,
}

impl PendingSlot<'_> {
    fn disarm(&mut self) {
        self.armed = false;
    }
}

impl Drop for PendingSlot<'_> {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        if self.pending.lock().remove(&self.action_id).is_some() {
            tracing::warn!(
                "[Approval] Request {} was cancelled before a decision; pending slot released",
                self.action_id
            );
        }
    }
}

/// Async, frontend-facing approval controller managed as Tauri state.
///
/// Handles the interactive approval flow: emits `agent:permission_required`
/// to the frontend, waits for user approve/reject via a `oneshot` channel,
/// and optionally records trust in `TrustedWorkflowStore` for auto-approval.
///
/// **Canonical usage**: registered via `app.manage()` in `lib.rs`, accessed
/// in Tauri commands (`resolve_agent_approval`, `list_trusted_workflows`).
///
/// Both systems are intentionally separate and complementary:
/// - `ApprovalManager` = synchronous rule engine (auto-approve / auto-reject)
/// - `ApprovalController` = async user-interaction bridge (emit -> wait -> resolve)
///   Do NOT remove either.
pub struct ApprovalController {
    pending: Mutex<HashMap<String, PendingApproval>>,

    resolved: Mutex<ResolvedLedger>,

    trust_store: RwLock<TrustedWorkflowStore>,

    current_hash: TokioMutex<Option<String>>,
}

impl ApprovalController {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        let trust_store = TrustedWorkflowStore::load(data_dir.join("trusted_workflows.json"))?;
        Ok(Self {
            pending: Mutex::new(HashMap::new()),
            resolved: Mutex::new(ResolvedLedger::default()),
            trust_store: RwLock::new(trust_store),
            current_hash: TokioMutex::new(None),
        })
    }

    pub async fn request_approval<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        payload: ApprovalRequestPayload,
    ) -> Result<ApprovalResolution> {
        self.request_approval_with_timeout(
            app_handle,
            payload,
            Duration::from_secs(DEFAULT_APPROVAL_TIMEOUT_SECS),
        )
        .await
    }

    /// Same as [`Self::request_approval`] with an explicit bound. Tests use the
    /// short form; production goes through the canonical default.
    pub async fn request_approval_with_timeout<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        mut payload: ApprovalRequestPayload,
        timeout: Duration,
    ) -> Result<ApprovalResolution> {
        if payload.workflow_hash.is_none() {
            payload.workflow_hash = self.current_hash.lock().await.clone();
        }

        if let Some(hash) = payload.workflow_hash.as_deref() {
            let trust_store = self.trust_store.read().await;
            if trust_store.is_trusted(hash, &payload.action_signature) {
                tracing::info!(
                    "[Approval] Auto-approved trusted workflow {} for action {}",
                    hash,
                    payload.action_id
                );

                drop(trust_store);
                return Ok(ApprovalResolution::Approved { trust: false });
            }

            drop(trust_store);
        }

        let (tx, rx) = oneshot::channel();

        {
            let mut pending = self.pending.lock();
            pending.insert(
                payload.action_id.clone(),
                PendingApproval {
                    sender: tx,
                    resolved: AtomicBool::new(false),
                },
            );
        }

        // From here on every exit — including the caller dropping this future —
        // releases the pending slot.
        let mut slot = PendingSlot {
            pending: &self.pending,
            action_id: payload.action_id.clone(),
            armed: true,
        };

        self.emit_status(app_handle, "paused", &payload.reason)?;

        let requested_at_ms = now_ms();
        let expires_at_ms = requested_at_ms.saturating_add(timeout.as_millis() as u64);
        let envelope = ApprovalRequestEnvelope {
            request: &payload,
            requested_at_ms,
            expires_at_ms,
            timeout_seconds: timeout.as_secs(),
        };

        if let Err(error) = app_handle.emit("agent:permission_required", envelope) {
            return Err(anyhow!("Failed to emit approval request: {}", error));
        }

        let action_signature = payload.action_signature.clone();

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(resolution)) => {
                slot.disarm();
                if let (ApprovalResolution::Approved { trust }, Some(hash)) =
                    (&resolution, payload.workflow_hash.as_deref())
                {
                    if *trust {
                        let mut store = self.trust_store.write().await;
                        store.record_trust(hash, &action_signature)?;
                    }
                }
                self.emit_decided(app_handle, &payload, &resolution);
                Ok(resolution)
            }
            Ok(Err(_)) => Err(anyhow!(
                "Approval channel dropped for {}",
                payload.action_id
            )),
            Err(_) => {
                // Terminal, deterministic, and fail-closed: an unanswered
                // request is a denial, not an indefinite wait.
                slot.disarm();
                self.pending.lock().remove(&payload.action_id);

                let reason = format!(
                    "Approval expired after {}s without a decision",
                    timeout.as_secs()
                );
                tracing::warn!("[Approval] {} for action {}", reason, payload.action_id);

                let resolution = ApprovalResolution::Rejected {
                    reason: Some(reason.clone()),
                };
                self.resolved
                    .lock()
                    .record(&payload.action_id, resolution.clone());

                // `agent_resolve_approval` emits these when a human decides;
                // an expiry has no such call, so without this the card stayed
                // on screen and the agent indicator stayed "paused" forever.
                let _ = app_handle.emit(
                    "agi:approval_denied",
                    json!({
                        "approval": {
                            "id": payload.action_id,
                            "rejectionReason": reason,
                        }
                    }),
                );
                let _ = app_handle.emit(
                    "agent:action_update",
                    json!({
                        "action": {
                            "id": payload.action_id,
                            "status": "failed",
                            "requiresApproval": false,
                            "error": reason,
                        }
                    }),
                );
                self.emit_decided(app_handle, &payload, &resolution);

                Ok(resolution)
            }
        }
    }

    pub async fn resolve(&self, action_id: &str, resolution: ApprovalResolution) -> Result<()> {
        let pending_approval = {
            let mut pending = self.pending.lock();
            pending.remove(action_id)
        };

        let Some(pending_approval) = pending_approval else {
            // Not pending. Either it already reached a terminal state (duplicate
            // click, retried IPC, second surface) or it never existed.
            return match self.resolved.lock().get(action_id) {
                Some(prior) if prior == resolution => {
                    tracing::debug!(
                        "[Approval] Duplicate {} for {} ignored; the decision already stands",
                        resolution.describe(),
                        action_id
                    );
                    Ok(())
                }
                Some(prior) => Err(anyhow!(
                    "Approval {} already resolved as {}; refusing to change it to {}",
                    action_id,
                    prior.describe(),
                    resolution.describe()
                )),
                None => Err(anyhow!("Approval {} not pending", action_id)),
            };
        };

        if pending_approval
            .resolved
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            tracing::error!(
                "[Security] Race condition detected: Approval {} already resolved",
                action_id
            );
            return Err(anyhow!(
                "Approval {} already resolved (race condition prevented)",
                action_id
            ));
        }

        // Recorded before the send so a duplicate that lands while the waiter is
        // still waking up is recognised as a replay rather than "not pending".
        self.resolved.lock().record(action_id, resolution.clone());

        pending_approval
            .sender
            .send(resolution)
            .map_err(|_| anyhow!("Failed to send approval resolution for {}", action_id))
    }

    pub async fn is_action_trusted(
        &self,
        workflow_hash: Option<&str>,
        signature: &str,
    ) -> Result<bool> {
        if let Some(hash) = workflow_hash {
            Ok(self.trust_store.read().await.is_trusted(hash, signature))
        } else {
            Ok(false)
        }
    }

    /// Clears the "paused" indicator this controller raised when it asked.
    ///
    /// `request_approval` emits `agent:status:update` with `paused`, but nothing
    /// ever emitted the matching un-pause, so the agent chip stayed paused after
    /// the user had already answered and the step had resumed.
    fn emit_decided<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        payload: &ApprovalRequestPayload,
        resolution: &ApprovalResolution,
    ) {
        let (status, step) = match resolution {
            ApprovalResolution::Approved { .. } => {
                ("running", format!("Resuming: {}", payload.title))
            }
            ApprovalResolution::Rejected { reason } => (
                "idle",
                reason
                    .clone()
                    .unwrap_or_else(|| format!("Approval denied: {}", payload.title)),
            ),
        };

        if let Err(error) = self.emit_status(app_handle, status, &step) {
            tracing::warn!(
                "[Approval] Failed to clear paused status for {}: {}",
                payload.action_id,
                error
            );
        }
    }

    fn emit_status<R: Runtime>(
        &self,
        app_handle: &AppHandle<R>,
        status: &str,
        current_step: &str,
    ) -> Result<()> {
        app_handle
            .emit(
                "agent:status:update",
                json!({
                    "id": "main_agent",
                    "name": "AGI Workforce Agent",
                    "status": status,
                    "currentStep": current_step,
                    "progress": 50
                }),
            )
            .map_err(|e| anyhow!("Failed to emit status update: {}", e))
    }

    pub async fn set_current_hash(&self, hash: Option<String>) {
        let mut guard = self.current_hash.lock().await;
        *guard = hash;
    }

    pub async fn current_hash(&self) -> Option<String> {
        self.current_hash.lock().await.clone()
    }

    pub async fn list_trusted_workflows(&self) -> Result<HashMap<String, Vec<String>>> {
        let store = self.trust_store.read().await;
        Ok(store
            .entries
            .iter()
            .map(|(hash, actions)| (hash.clone(), actions.iter().cloned().collect()))
            .collect())
    }
}

#[derive(Debug)]
struct TrustedWorkflowStore {
    path: PathBuf,
    entries: HashMap<String, BTreeSet<String>>,
}

impl TrustedWorkflowStore {
    fn load(path: PathBuf) -> Result<Self> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create trust store directory {:?}", parent))?;
        }

        let entries = if path.exists() {
            let contents =
                fs::read_to_string(&path).with_context(|| format!("Failed to read {:?}", path))?;
            if contents.trim().is_empty() {
                HashMap::new()
            } else {
                serde_json::from_str(&contents)
                    .with_context(|| format!("Failed to parse {:?}", path))?
            }
        } else {
            HashMap::new()
        };

        Ok(Self { path, entries })
    }

    fn is_trusted(&self, workflow_hash: &str, signature: &str) -> bool {
        self.entries
            .get(workflow_hash)
            .map(|set| set.contains(signature))
            .unwrap_or(false)
    }

    fn record_trust(&mut self, workflow_hash: &str, signature: &str) -> Result<()> {
        let entry = self.entries.entry(workflow_hash.to_string()).or_default();
        if entry.insert(signature.to_string()) {
            self.persist()?;
        }
        Ok(())
    }

    fn persist(&self) -> Result<()> {
        let serialized = serde_json::to_string_pretty(&self.entries)?;
        fs::write(&self.path, serialized)
            .with_context(|| format!("Failed to write {:?}", self.path))
    }
}
