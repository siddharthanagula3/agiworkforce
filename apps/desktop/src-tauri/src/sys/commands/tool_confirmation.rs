//! Tool Confirmation Commands
//!
//! This module provides Tauri commands for the tool confirmation dialog system.
//! It handles user responses to tool confirmation requests and manages pending confirmations.

use crate::sys::security::tool_guard::RiskLevel;
use crate::sys::security::{ToolConfirmationRequest, ToolConfirmationResponse, ToolExecutionGuard};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::oneshot;
use tracing::{debug, info, warn};

/// Agent execution mode controlling which tools are permitted.
///
/// - **Safe**: Only read-only, non-destructive tools are allowed.
/// - **Plan**: Read-only tools allowed (same allowlist as Safe). The agent
///   produces a plan but cannot execute write operations. The user must
///   switch to Build or Autopilot to apply the plan.
/// - **Build**: All tools allowed, but destructive ones require user confirmation.
/// - **Autopilot**: All tools allowed, auto-approved without prompts.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AgentMode {
    Safe,
    Plan,
    #[default]
    Build,
    Autopilot,
}

/// State for managing pending tool confirmation requests
pub struct ToolConfirmationState {
    /// Map of request_id to oneshot sender for confirmation response
    pending_confirmations: Arc<Mutex<HashMap<String, oneshot::Sender<ToolConfirmationResponse>>>>,
    /// Remembered choices for specific tools (tool_name -> approved)
    remembered_choices: Arc<Mutex<HashMap<String, bool>>>,
    /// Tool execution guard for policy lookups
    tool_guard: Arc<ToolExecutionGuard>,
    /// Global auto-approve flag — when true, all tool confirmations are auto-approved
    /// without showing the user a dialog. Equivalent to "God Mode" / trust-all.
    auto_approve_all: Arc<AtomicBool>,
    /// Current agent execution mode (Safe / Build / Autopilot)
    agent_mode: Arc<Mutex<AgentMode>>,
    /// Session-scoped tool approvals — tools approved for the current session only.
    /// Cleared when session ends or user explicitly resets.
    pub session_approved_tools: Arc<Mutex<HashSet<String>>>,
}

impl ToolConfirmationState {
    pub fn new() -> Self {
        Self {
            pending_confirmations: Arc::new(Mutex::new(HashMap::new())),
            remembered_choices: Arc::new(Mutex::new(HashMap::new())),
            tool_guard: Arc::new(ToolExecutionGuard::new()),
            auto_approve_all: Arc::new(AtomicBool::new(false)),
            agent_mode: Arc::new(Mutex::new(AgentMode::default())),
            session_approved_tools: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Set the global auto-approve flag
    pub fn set_auto_approve_all(&self, enabled: bool) {
        self.auto_approve_all.store(enabled, Ordering::Relaxed);
        info!(
            "[ToolConfirmation] Auto-approve all: {}",
            if enabled { "enabled" } else { "disabled" }
        );
    }

    /// Get the current global auto-approve flag
    pub fn is_auto_approve_all(&self) -> bool {
        self.auto_approve_all.load(Ordering::Relaxed)
    }

    /// Set the current agent execution mode
    pub fn set_agent_mode(&self, mode: AgentMode) {
        let mut lock = self.agent_mode.lock();
        *lock = mode;
        info!("[ToolConfirmation] Agent mode set to: {:?}", mode);
    }

    /// Get the current agent execution mode
    pub fn get_agent_mode(&self) -> AgentMode {
        *self.agent_mode.lock()
    }

    /// Read-only tool allowlist shared by Safe and Plan modes.
    const READ_ONLY_TOOLS: &'static [&'static str] = &[
        "file_read",
        "file_list",
        "search_web",
        "browser_get_text",
        "browser_get_url",
        "browser_get_title",
        "ui_screenshot",
        "image_analyze",
        "image_ocr",
        "email_fetch",
        "calendar_list_events",
        "db_query",
        "document_read",
        "document_search",
        "code_analyze",
        "code_search",
        "grep_search",
        "glob_search",
        "git_status",
        "llm_reason",
        "list_scheduled_tasks",
        "memory_search",
    ];

    /// Check whether a tool is permitted under the given agent mode.
    ///
    /// In **Safe** and **Plan** modes only read-only / non-destructive tools
    /// are allowed. Plan mode additionally permits MCP read-only tools
    /// (prefixed with `mcp__`) that match common read patterns.
    ///
    /// **Build** and **Autopilot** modes permit all tools (confirmation gating
    /// is handled separately by the auto-approve flag and dialog system).
    pub fn is_tool_permitted_for_mode(tool_name: &str, mode: AgentMode) -> bool {
        match mode {
            AgentMode::Safe | AgentMode::Plan => {
                // Direct allowlist match
                if Self::READ_ONLY_TOOLS.contains(&tool_name) {
                    return true;
                }
                // MCP tools: allow known read-only patterns in Plan/Safe mode
                if tool_name.starts_with("mcp__") {
                    let read_mcp_patterns = [
                        "read_file",
                        "read_text_file",
                        "read_media_file",
                        "read_multiple_files",
                        "list_directory",
                        "list_directory_with_sizes",
                        "list_allowed_directories",
                        "directory_tree",
                        "get_file_info",
                        "search_files",
                        "git_status",
                        "git_log",
                        "git_show",
                        "git_diff",
                        "git_diff_staged",
                        "git_diff_unstaged",
                    ];
                    return read_mcp_patterns
                        .iter()
                        .any(|pattern| tool_name.ends_with(pattern));
                }
                false
            }
            AgentMode::Build | AgentMode::Autopilot => true,
        }
    }

    /// Check if a tool has been approved for this session
    pub fn is_session_approved(&self, tool_name: &str) -> bool {
        self.session_approved_tools.lock().contains(tool_name)
    }

    /// Add a tool to the session-approved set
    pub fn approve_for_session(&self, tool_name: &str) {
        self.session_approved_tools
            .lock()
            .insert(tool_name.to_string());
        info!(
            "[ToolConfirmation] Tool '{}' approved for session",
            tool_name
        );
    }

    /// Clear all session-scoped tool approvals
    pub fn clear_session_approvals(&self) {
        self.session_approved_tools.lock().clear();
        info!("[ToolConfirmation] Cleared all session-scoped tool approvals");
    }

    /// Check if user has a remembered choice for this tool
    pub fn get_remembered_choice(&self, tool_name: &str) -> Option<bool> {
        self.remembered_choices.lock().get(tool_name).copied()
    }

    /// Store a remembered choice for a tool
    pub fn remember_choice(&self, tool_name: &str, approved: bool) {
        self.remembered_choices
            .lock()
            .insert(tool_name.to_string(), approved);
    }

    /// Clear all remembered choices
    pub fn clear_remembered_choices(&self) {
        self.remembered_choices.lock().clear();
    }

    /// Get the tool guard for policy lookups
    pub fn tool_guard(&self) -> &ToolExecutionGuard {
        &self.tool_guard
    }

    /// Update the allowed directories in the tool guard.
    /// This is called when settings are loaded to sync user-configured directories.
    pub fn update_allowed_paths(&self, paths: Vec<String>) {
        let path_bufs: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
        self.tool_guard.set_allowed_paths(path_bufs);
        tracing::info!("Updated tool guard allowed paths");
    }

    /// Get the current allowed directories from the tool guard (for debugging)
    pub fn get_allowed_paths(&self) -> Vec<String> {
        self.tool_guard
            .get_allowed_paths()
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect()
    }

    /// Register a pending confirmation and return a receiver for the response
    pub fn register_pending(
        &self,
        request_id: String,
    ) -> oneshot::Receiver<ToolConfirmationResponse> {
        let (tx, rx) = oneshot::channel();
        self.pending_confirmations.lock().insert(request_id, tx);
        rx
    }

    /// Resolve a pending confirmation with the user's response
    pub fn resolve_pending(&self, response: ToolConfirmationResponse) -> Result<(), String> {
        let mut pending = self.pending_confirmations.lock();
        if let Some(tx) = pending.remove(&response.request_id) {
            tx.send(response)
                .map_err(|_| "Failed to send confirmation response".to_string())
        } else {
            Err(format!(
                "No pending confirmation found for request_id: {}",
                response.request_id
            ))
        }
    }

    /// Cancel a pending confirmation (e.g., on timeout)
    pub fn cancel_pending(&self, request_id: &str) {
        self.pending_confirmations.lock().remove(request_id);
    }

    /// Get count of pending confirmations
    pub fn pending_count(&self) -> usize {
        self.pending_confirmations.lock().len()
    }
}

impl Default for ToolConfirmationState {
    fn default() -> Self {
        Self::new()
    }
}

/// Summary of a tool confirmation request for the frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolConfirmationSummary {
    pub request_id: String,
    pub tool_name: String,
    pub tool_display_name: String,
    pub description: String,
    pub parameters_summary: String,
    pub risk_level: String,
    pub safety_tier: String,
    pub reason: String,
    pub reversible: bool,
    pub undo_description: Option<String>,
}

impl From<&ToolConfirmationRequest> for ToolConfirmationSummary {
    fn from(req: &ToolConfirmationRequest) -> Self {
        // Create a human-readable parameters summary
        let parameters_summary = if let Some(obj) = req.parameters.as_object() {
            obj.iter()
                .map(|(k, v)| {
                    let value_str = match v {
                        Value::String(s) => {
                            // Truncate long strings
                            if s.len() > 50 {
                                format!("\"{}...\"", &s[..47])
                            } else {
                                format!("\"{}\"", s)
                            }
                        }
                        _ => v.to_string(),
                    };
                    format!("{}: {}", k, value_str)
                })
                .collect::<Vec<_>>()
                .join(", ")
        } else {
            req.parameters.to_string()
        };

        // Create a user-friendly display name
        let tool_display_name = req
            .tool_name
            .replace('_', " ")
            .split_whitespace()
            .map(|word| {
                let mut chars = word.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().chain(chars).collect(),
                }
            })
            .collect::<Vec<_>>()
            .join(" ");

        Self {
            request_id: req.request_id.clone(),
            tool_name: req.tool_name.clone(),
            tool_display_name,
            description: req.tool_description.clone(),
            parameters_summary,
            risk_level: format!("{:?}", req.risk_level),
            safety_tier: format!("{:?}", req.safety_tier),
            reason: req.reason.clone(),
            reversible: req.reversible,
            undo_description: req.undo_description.clone(),
        }
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Respond to a tool confirmation request.
/// Called by the frontend when user approves or denies a tool execution.
///
/// `remember_for_session` — when `true` and approved, the tool is added to the
/// session-scoped approval set so future invocations in this session skip the
/// confirmation dialog. Requires `tool_name` to be provided.
///
/// `tool_name` — optional tool name for session-scoped approval. The frontend
/// receives this in the `ToolConfirmationSummary` and can pass it back here.
#[tauri::command]
pub async fn respond_tool_confirmation(
    request_id: String,
    approved: bool,
    remember_choice: bool,
    remember_for_session: Option<bool>,
    tool_name: Option<String>,
    reason: Option<String>,
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    info!(
        "[ToolConfirmation] User {} tool execution for request {}{}{}",
        if approved { "approved" } else { "denied" },
        request_id,
        if remember_choice {
            " (remembering choice)"
        } else {
            ""
        },
        if remember_for_session == Some(true) {
            " (session-scoped)"
        } else {
            ""
        }
    );

    // If the user approved and requested session-scoped approval, store it
    if approved && remember_for_session == Some(true) {
        if let Some(ref name) = tool_name {
            if !name.trim().is_empty() {
                state.approve_for_session(name);
            }
        }
    }

    let response = ToolConfirmationResponse {
        request_id: request_id.clone(),
        approved,
        remember_choice,
        reason,
    };

    state.resolve_pending(response)
}

/// Get the safety tier for a specific tool.
/// Useful for the frontend to determine how to handle tool calls.
#[tauri::command]
pub fn get_tool_safety_tier(
    tool_name: String,
    state: State<'_, ToolConfirmationState>,
) -> Result<ToolSafetyTierInfo, String> {
    let guard = state.tool_guard();
    let safety_tier = guard.get_safety_tier(&tool_name);
    let risk_level = guard.get_risk_level(&tool_name);

    Ok(ToolSafetyTierInfo {
        tool_name,
        safety_tier: format!("{:?}", safety_tier),
        safety_tier_description: safety_tier.description().to_string(),
        requires_user_action: safety_tier.requires_user_action(),
        risk_level: risk_level.map(|r| format!("{:?}", r)),
    })
}

/// Get remembered choices for tools.
#[tauri::command]
pub fn get_remembered_tool_choices(
    state: State<'_, ToolConfirmationState>,
) -> Result<HashMap<String, bool>, String> {
    Ok(state.remembered_choices.lock().clone())
}

/// Clear all remembered tool choices.
#[tauri::command]
pub fn clear_remembered_tool_choices(
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    state.clear_remembered_choices();
    info!("[ToolConfirmation] Cleared all remembered tool choices");
    Ok(())
}

/// Clear a specific remembered tool choice.
#[tauri::command]
pub fn clear_remembered_tool_choice(
    tool_name: String,
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    state.remembered_choices.lock().remove(&tool_name);
    info!(
        "[ToolConfirmation] Cleared remembered choice for tool: {}",
        tool_name
    );
    Ok(())
}

/// Clear all session-scoped tool approvals.
/// Call this when starting a new session or when the user wants to revoke
/// all session-level auto-approvals.
#[tauri::command]
pub fn clear_session_tool_approvals(state: State<'_, ToolConfirmationState>) -> Result<(), String> {
    state.clear_session_approvals();
    Ok(())
}

/// Get the count of pending confirmations.
#[tauri::command]
pub fn get_pending_confirmation_count(
    state: State<'_, ToolConfirmationState>,
) -> Result<usize, String> {
    Ok(state.pending_count())
}

/// Cancel a pending confirmation (e.g., user closed the dialog without responding).
#[tauri::command]
pub fn cancel_tool_confirmation(
    request_id: String,
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    state.cancel_pending(&request_id);
    info!(
        "[ToolConfirmation] Cancelled pending confirmation: {}",
        request_id
    );
    Ok(())
}

/// Update the allowed directories in the security tool guard.
/// This should be called after loading settings to sync user-configured directories.
#[tauri::command]
pub fn update_allowed_directories(
    paths: Vec<String>,
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    state.update_allowed_paths(paths.clone());
    info!(
        "[ToolConfirmation] Updated allowed directories: {:?}",
        paths
    );
    Ok(())
}

/// Get the current allowed directories from the security tool guard.
/// Useful for debugging and verification.
#[tauri::command]
pub fn get_allowed_directories(
    state: State<'_, ToolConfirmationState>,
) -> Result<Vec<String>, String> {
    Ok(state.get_allowed_paths())
}

/// Enable or disable global auto-approve mode.
/// When enabled, all tool confirmation dialogs are bypassed and every tool
/// call is automatically approved. Use with caution.
#[tauri::command]
pub fn set_auto_approve_all(
    enabled: bool,
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    state.set_auto_approve_all(enabled);
    Ok(())
}

/// Get the current global auto-approve state.
#[tauri::command]
pub fn get_auto_approve_all(state: State<'_, ToolConfirmationState>) -> Result<bool, String> {
    Ok(state.is_auto_approve_all())
}

/// Set the agent execution mode (Safe / Build / Autopilot).
///
/// DESK-2 (audit 2026-05-03): transitioning into `Autopilot` requires a
/// user confirmation through the same dialog used by every gated tool.
/// The mode change is logged to tracing with the previous and new mode
/// so audit log analysis can spot a hostile flip via XSS / prompt
/// injection. Safe and Build are still no-confirmation transitions
/// because they only ever raise the confirmation bar, never lower it.
#[tauri::command]
pub async fn set_agent_mode(
    mode: AgentMode,
    state: State<'_, ToolConfirmationState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let previous = state.get_agent_mode();
    if matches!(mode, AgentMode::Autopilot) && !matches!(previous, AgentMode::Autopilot) {
        let approved = request_confirmation_simple(
            &app_handle,
            "set_agent_mode:autopilot",
            &serde_json::json!({
                "previous_mode": format!("{:?}", previous),
                "new_mode": "Autopilot",
                "warning": "Autopilot bypasses ALL tool confirmation dialogs. Only enable for trusted, scoped tasks."
            }),
        )
        .await?;
        if !approved {
            return Err("Autopilot mode change denied by user".to_string());
        }
    }
    tracing::warn!(
        previous_mode = ?previous,
        new_mode = ?mode,
        "agent_mode_change",
    );
    state.set_agent_mode(mode);
    Ok(())
}

/// Get the current agent execution mode.
#[tauri::command]
pub fn get_agent_mode(state: State<'_, ToolConfirmationState>) -> Result<AgentMode, String> {
    Ok(state.get_agent_mode())
}

/// Per-tool approval policy: "ask", "always_allow", or "always_deny".
///
/// Stored as a remembered choice in the `ToolConfirmationState`.
/// - `"always_allow"` → remembered as approved
/// - `"always_deny"` → remembered as denied
/// - `"ask"` → removes any remembered choice so the dialog appears
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolApprovalPolicy {
    pub tool_name: String,
    pub policy: String,
}

/// Set the approval policy for a specific tool.
///
/// Valid policies: `"ask"`, `"always_allow"`, `"always_deny"`.
#[tauri::command]
pub fn set_tool_approval_policy(
    tool_name: String,
    policy: String,
    state: State<'_, ToolConfirmationState>,
) -> Result<(), String> {
    match policy.as_str() {
        "always_allow" => {
            state.remember_choice(&tool_name, true);
            info!(
                "[ToolConfirmation] Set policy for '{}': always_allow",
                tool_name
            );
        }
        "always_deny" => {
            state.remember_choice(&tool_name, false);
            info!(
                "[ToolConfirmation] Set policy for '{}': always_deny",
                tool_name
            );
        }
        "ask" => {
            state.remembered_choices.lock().remove(&tool_name);
            info!(
                "[ToolConfirmation] Set policy for '{}': ask (cleared remembered choice)",
                tool_name
            );
        }
        other => {
            return Err(format!(
                "Invalid policy '{}'. Valid options: ask, always_allow, always_deny",
                other
            ));
        }
    }
    Ok(())
}

/// Get the current approval policy for a specific tool.
///
/// Returns `"always_allow"`, `"always_deny"`, or `"ask"`.
#[tauri::command]
pub fn get_tool_approval_policy(
    tool_name: String,
    state: State<'_, ToolConfirmationState>,
) -> Result<String, String> {
    match state.get_remembered_choice(&tool_name) {
        Some(true) => Ok("always_allow".to_string()),
        Some(false) => Ok("always_deny".to_string()),
        None => Ok("ask".to_string()),
    }
}

/// Resolve a pending autonomous-agent task approval.
///
/// Called by the frontend when the user approves or rejects a task that is
/// stuck in `TaskStatus::WaitingApproval`. This sends a boolean signal through
/// the oneshot channel registered in `PENDING_TASK_APPROVALS`, waking the
/// suspended agent task so it can resume execution (on approve) or fail
/// gracefully (on reject).
#[tauri::command]
pub async fn resolve_task_approval(task_id: String, approved: bool) -> Result<(), String> {
    use crate::core::agent::autonomous::PENDING_TASK_APPROVALS;

    info!(
        "[TaskApproval] User {} task {}",
        if approved { "approved" } else { "rejected" },
        task_id,
    );

    let sender = PENDING_TASK_APPROVALS
        .remove(&task_id)
        .map(|(_, tx)| tx)
        .ok_or_else(|| {
            format!(
                "No pending approval found for task_id: {} (may have timed out)",
                task_id
            )
        })?;

    sender.send(approved).map_err(|_| {
        format!(
            "Failed to deliver approval signal for task {} (receiver dropped)",
            task_id
        )
    })
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolSafetyTierInfo {
    pub tool_name: String,
    pub safety_tier: String,
    pub safety_tier_description: String,
    pub requires_user_action: bool,
    pub risk_level: Option<String>,
}

// ============================================================================
// Helper Functions for Tool Executor Integration
// ============================================================================

/// Request confirmation from user for a tool execution.
/// Emits a `tool:confirmation_required` event and waits for response.
pub async fn request_tool_confirmation(
    app_handle: &tauri::AppHandle,
    state: &ToolConfirmationState,
    request: ToolConfirmationRequest,
    timeout_secs: u64,
) -> Result<bool, String> {
    let request_id = request.request_id.clone();
    let tool_name = request.tool_name.clone();

    // Agent mode gate — block tools not permitted in the current mode
    let current_mode = state.get_agent_mode();
    if !ToolConfirmationState::is_tool_permitted_for_mode(&tool_name, current_mode) {
        let mode_label = format!("{:?}", current_mode).to_lowercase();
        warn!(
            "[ToolConfirmation] Tool '{}' blocked by agent mode {}",
            tool_name, mode_label
        );
        let hint = if current_mode == AgentMode::Plan {
            "Switch to build mode to execute write operations."
        } else {
            "Change agent mode to allow this tool."
        };
        let _ = app_handle.emit(
            "tool:blocked_by_mode",
            serde_json::json!({
                "tool_name": tool_name,
                "mode": mode_label,
                "hint": hint,
            }),
        );
        return Err(format!(
            "Tool '{}' is not permitted in {} mode. {}",
            tool_name, mode_label, hint
        ));
    }

    // Global auto-approve bypass — skip all dialogs when trust-all is enabled
    if state.is_auto_approve_all() {
        debug!(
            "[ToolConfirmation] Auto-approve-all active, skipping dialog for '{}'",
            tool_name
        );
        return Ok(true);
    }

    // Check for remembered choice
    if let Some(remembered) = state.get_remembered_choice(&tool_name) {
        debug!(
            "[ToolConfirmation] Using remembered choice for '{}': {}",
            tool_name, remembered
        );
        return Ok(remembered);
    }

    // Check for session-scoped approval
    if state.is_session_approved(&tool_name) {
        debug!(
            "[ToolConfirmation] Tool '{}' is session-approved, auto-approving",
            tool_name
        );
        return Ok(true);
    }

    // Register the pending confirmation
    let rx = state.register_pending(request_id.clone());

    // Create summary for frontend
    let summary = ToolConfirmationSummary::from(&request);

    // Emit the confirmation request event
    if let Err(e) = app_handle.emit("tool:confirmation_required", &summary) {
        state.cancel_pending(&request_id);
        return Err(format!("Failed to emit confirmation event: {}", e));
    }

    info!(
        "[ToolConfirmation] Waiting for user confirmation for '{}' (request_id: {})",
        tool_name, request_id
    );

    // Wait for response with timeout
    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx).await {
        Ok(Ok(response)) => {
            // If user wants to remember the choice, store it
            if response.remember_choice {
                state.remember_choice(&tool_name, response.approved);
            }

            if response.approved {
                info!("[ToolConfirmation] Tool '{}' approved by user", tool_name);
            } else {
                warn!(
                    "[ToolConfirmation] Tool '{}' denied by user: {:?}",
                    tool_name, response.reason
                );
            }

            Ok(response.approved)
        }
        Ok(Err(_)) => {
            warn!(
                "[ToolConfirmation] Confirmation channel closed for '{}'",
                tool_name
            );
            state.cancel_pending(&request_id);
            Err("Confirmation channel closed unexpectedly".to_string())
        }
        Err(_) => {
            warn!(
                "[ToolConfirmation] Confirmation timeout for '{}' after {}s",
                tool_name, timeout_secs
            );
            state.cancel_pending(&request_id);
            // Emit timeout event so frontend can update UI
            let _ = app_handle.emit(
                "tool:confirmation_timeout",
                serde_json::json!({
                    "request_id": request_id,
                    "tool_name": tool_name,
                }),
            );
            Err(format!(
                "User did not respond within {} seconds",
                timeout_secs
            ))
        }
    }
}

/// Request confirmation for a user-initiated action, bypassing the agent-mode
/// gate. Use this for configuration actions (e.g., MCP server connect from
/// Settings) that should work regardless of the current agent mode.
///
/// Still respects auto-approve-all, remembered choices, and the 120-second
/// confirmation dialog — just skips the Safe/Build/Autopilot mode check.
pub async fn request_tool_confirmation_no_mode_gate(
    app_handle: &tauri::AppHandle,
    state: &ToolConfirmationState,
    request: ToolConfirmationRequest,
    timeout_secs: u64,
) -> Result<bool, String> {
    let request_id = request.request_id.clone();
    let tool_name = request.tool_name.clone();

    // Global auto-approve bypass
    if state.is_auto_approve_all() {
        debug!(
            "[ToolConfirmation] Auto-approve-all active, skipping dialog for '{}'",
            tool_name
        );
        return Ok(true);
    }

    // Check for remembered choice
    if let Some(remembered) = state.get_remembered_choice(&tool_name) {
        debug!(
            "[ToolConfirmation] Using remembered choice for '{}': {}",
            tool_name, remembered
        );
        return Ok(remembered);
    }

    // Check for session-scoped approval
    if state.is_session_approved(&tool_name) {
        debug!(
            "[ToolConfirmation] Tool '{}' is session-approved, auto-approving (no mode gate)",
            tool_name
        );
        return Ok(true);
    }

    // Register the pending confirmation
    let rx = state.register_pending(request_id.clone());

    // Create summary for frontend
    let summary = ToolConfirmationSummary::from(&request);

    // Emit the confirmation request event
    if let Err(e) = app_handle.emit("tool:confirmation_required", &summary) {
        state.cancel_pending(&request_id);
        return Err(format!("Failed to emit confirmation event: {}", e));
    }

    info!(
        "[ToolConfirmation] Waiting for user confirmation for '{}' (request_id: {})",
        tool_name, request_id
    );

    match tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), rx).await {
        Ok(Ok(response)) => {
            if response.remember_choice {
                state.remember_choice(&tool_name, response.approved);
            }
            if response.approved {
                info!("[ToolConfirmation] Tool '{}' approved by user", tool_name);
            } else {
                warn!(
                    "[ToolConfirmation] Tool '{}' denied by user: {:?}",
                    tool_name, response.reason
                );
            }
            Ok(response.approved)
        }
        Ok(Err(_)) => {
            state.cancel_pending(&request_id);
            Err("Confirmation channel closed unexpectedly".to_string())
        }
        Err(_) => {
            state.cancel_pending(&request_id);
            let _ = app_handle.emit(
                "tool:confirmation_timeout",
                serde_json::json!({
                    "request_id": request_id,
                    "tool_name": tool_name,
                }),
            );
            Err(format!(
                "User did not respond within {} seconds",
                timeout_secs
            ))
        }
    }
}

/// Request confirmation from user for a tool execution (Simplified version).
/// Automatically retrieves state and constructs the request.
pub async fn request_confirmation_simple(
    app_handle: &tauri::AppHandle,
    tool_name: &str,
    args: &serde_json::Value,
) -> Result<bool, String> {
    use tauri::Manager;

    let state = app_handle
        .try_state::<ToolConfirmationState>()
        .ok_or_else(|| "ToolConfirmationState not found".to_string())?;

    let guard = state.tool_guard();
    let risk_level = guard.get_risk_level(tool_name).unwrap_or(RiskLevel::High);
    let safety_tier = guard.get_safety_tier(tool_name);

    let request = ToolConfirmationRequest {
        request_id: uuid::Uuid::new_v4().to_string(),
        tool_name: tool_name.to_string(),
        tool_description: format!("Execute command: {}", tool_name),
        parameters: args.clone(),
        risk_level,
        safety_tier,
        reason: "This action requires user confirmation.".to_string(),
        reversible: false,
        undo_description: None,
    };

    request_tool_confirmation(app_handle, &state, request, 120).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sys::security::tool_guard::ToolSafetyTier;

    #[test]
    fn test_tool_confirmation_state() {
        let state = ToolConfirmationState::new();

        // Test remembered choices
        assert!(state.get_remembered_choice("file_write").is_none());
        state.remember_choice("file_write", true);
        assert_eq!(state.get_remembered_choice("file_write"), Some(true));

        // Test clearing
        state.clear_remembered_choices();
        assert!(state.get_remembered_choice("file_write").is_none());
    }

    #[test]
    fn test_safety_tier_lookup() {
        let state = ToolConfirmationState::new();
        let guard = state.tool_guard();

        // Test known tools
        assert_eq!(guard.get_safety_tier("file_read"), ToolSafetyTier::Safe);
        assert_eq!(
            guard.get_safety_tier("file_write"),
            ToolSafetyTier::RequiresConfirmation
        );
        assert_eq!(
            guard.get_safety_tier("browser_navigate"),
            ToolSafetyTier::RequiresConfirmation
        );
        assert_eq!(
            guard.get_safety_tier("code_execute"),
            ToolSafetyTier::RequiresExplicitApproval
        );

        // Test unknown tool (should default to confirmation)
        assert_eq!(
            guard.get_safety_tier("unknown_tool"),
            ToolSafetyTier::RequiresConfirmation
        );
    }

    #[test]
    fn test_confirmation_summary_creation() {
        let request = ToolConfirmationRequest {
            request_id: "test-123".to_string(),
            tool_name: "file_write".to_string(),
            tool_description: "Write content to a file".to_string(),
            parameters: serde_json::json!({
                "path": "/home/user/test.txt",
                "content": "Hello, World!"
            }),
            risk_level: crate::sys::security::tool_guard::RiskLevel::Medium,
            safety_tier: ToolSafetyTier::RequiresNotification,
            reason: "This action will modify a file.".to_string(),
            reversible: true,
            undo_description: Some("Original content can be restored.".to_string()),
        };

        let summary = ToolConfirmationSummary::from(&request);
        assert_eq!(summary.tool_display_name, "File Write");
        assert!(summary.parameters_summary.contains("path"));
        assert!(summary.parameters_summary.contains("content"));
    }

    #[test]
    fn test_agent_mode_default() {
        let state = ToolConfirmationState::new();
        assert_eq!(state.get_agent_mode(), AgentMode::Build);
    }

    #[test]
    fn test_agent_mode_set_get() {
        let state = ToolConfirmationState::new();
        state.set_agent_mode(AgentMode::Safe);
        assert_eq!(state.get_agent_mode(), AgentMode::Safe);
        state.set_agent_mode(AgentMode::Autopilot);
        assert_eq!(state.get_agent_mode(), AgentMode::Autopilot);
    }

    #[test]
    fn test_tool_permitted_safe_mode() {
        // Safe mode allows only read-only tools
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "file_read",
            AgentMode::Safe
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "search_web",
            AgentMode::Safe
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "document_read",
            AgentMode::Safe
        ));

        // Safe mode blocks write/destructive tools
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "file_write",
            AgentMode::Safe
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "code_execute",
            AgentMode::Safe
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "browser_navigate",
            AgentMode::Safe
        ));
    }

    #[test]
    fn test_tool_permitted_plan_mode() {
        // Plan mode allows the same read-only tools as Safe mode
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "file_read",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "search_web",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "document_read",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "git_status",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "llm_reason",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "code_analyze",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "document_search",
            AgentMode::Plan
        ));

        // Plan mode blocks write/destructive tools
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "file_write",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "file_delete",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "code_execute",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "terminal_execute",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "git_push",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "git_commit",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "browser_navigate",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "email_send",
            AgentMode::Plan
        ));
    }

    #[test]
    fn test_tool_permitted_plan_mode_mcp_read_tools() {
        // Plan mode allows MCP read-only tools
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__filesystem__read_file",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__filesystem__list_directory",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__filesystem__directory_tree",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__git__git_status",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__git__git_log",
            AgentMode::Plan
        ));

        // Plan mode blocks MCP write tools
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__filesystem__write_file",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__filesystem__edit_file",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__git__git_commit",
            AgentMode::Plan
        ));
        assert!(!ToolConfirmationState::is_tool_permitted_for_mode(
            "mcp__filesystem__move_file",
            AgentMode::Plan
        ));
    }

    #[test]
    fn test_tool_permitted_build_autopilot() {
        // Build and Autopilot modes allow everything
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "file_write",
            AgentMode::Build
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "code_execute",
            AgentMode::Build
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "file_write",
            AgentMode::Autopilot
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "code_execute",
            AgentMode::Autopilot
        ));
    }

    #[test]
    fn test_agent_mode_plan_set_get() {
        let state = ToolConfirmationState::new();
        state.set_agent_mode(AgentMode::Plan);
        assert_eq!(state.get_agent_mode(), AgentMode::Plan);
    }

    #[test]
    fn test_agent_mode_plan_serde_roundtrip() {
        let json_str = r#""plan""#;
        let mode: AgentMode = serde_json::from_str(json_str).expect("deserialize plan");
        assert_eq!(mode, AgentMode::Plan);
        let serialized = serde_json::to_string(&mode).expect("serialize plan");
        assert_eq!(serialized, r#""plan""#);
    }

    #[test]
    fn test_session_approved_tools() {
        let state = ToolConfirmationState::new();

        // Initially no session approvals
        assert!(!state.is_session_approved("file_write"));

        // Approve for session
        state.approve_for_session("file_write");
        assert!(state.is_session_approved("file_write"));

        // Other tools still not approved
        assert!(!state.is_session_approved("code_execute"));

        // Clear session approvals
        state.clear_session_approvals();
        assert!(!state.is_session_approved("file_write"));
    }

    #[test]
    fn test_new_read_only_tools_in_safe_mode() {
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "code_search",
            AgentMode::Safe
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "grep_search",
            AgentMode::Safe
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "glob_search",
            AgentMode::Safe
        ));
    }

    #[test]
    fn test_new_read_only_tools_in_plan_mode() {
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "code_search",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "grep_search",
            AgentMode::Plan
        ));
        assert!(ToolConfirmationState::is_tool_permitted_for_mode(
            "glob_search",
            AgentMode::Plan
        ));
    }
}
