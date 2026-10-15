use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{self, json};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::{oneshot, Mutex as TokioMutex};

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
    Approved,
    Rejected { reason: Option<String> },
}

impl ApprovalResolution {
    fn describe(&self) -> String {
        match self {
            Self::Approved => "approved".to_string(),
            Self::Rejected {
                reason: Some(reason),
            } => format!("rejected ({})", reason),
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
/// without reaching a terminal state, which is exactly what happens when a
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
/// to the frontend and waits for user approve/reject via a `oneshot` channel.
///
/// SECURITY: the answer comes from the window, which a page script can
/// reach, so an approval covers the one action that asked and nothing after
/// it. A standing grant is never recorded here.
///
/// **Canonical usage**: registered via `app.manage()` in `lib.rs`, accessed
/// in the `agent_resolve_approval` Tauri command.
#[derive(Default)]
pub struct ApprovalController {
    pending: Mutex<HashMap<String, PendingApproval>>,

    resolved: Mutex<ResolvedLedger>,

    current_hash: TokioMutex<Option<String>>,
}

impl ApprovalController {
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

        // From here on every exit, including the caller dropping this future.
        // releases the pending slot.
        let mut slot = PendingSlot {
            pending: &self.pending,
            action_id: payload.action_id.clone(),
            armed: true,
        };

        let _waiting_on_user = crate::sys::commands::chat::state::UserWaitGuard::start();
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

        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(resolution)) => {
                slot.disarm();
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
            ApprovalResolution::Approved => ("running", format!("Resuming: {}", payload.title)),
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
}
