use super::*;
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{self, json};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex as TokioMutex, oneshot};

pub struct ApprovalManager {
    config: AgentConfig,
    approval_rules: Vec<ApprovalRule>,
    auto_approved_tasks: HashMap<String, bool>,
}

#[derive(Debug, Clone)]
pub enum ApprovalRule {
    /// Auto-approve if task description matches pattern
    PatternMatch { pattern: String },
    /// Auto-approve if task has no file system operations
    NoFileSystemOps,
    /// Auto-approve if task has no network operations
    NoNetworkOps,
    /// Auto-approve if task only reads (no writes)
    ReadOnly,
    /// Always require approval
    AlwaysRequire,
}

impl ApprovalManager {
    pub fn new(config: AgentConfig) -> Self {
        let mut approval_rules = Vec::new();

        if config.auto_approve {
            // Add default auto-approval rules
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

    /// Check if a task should be approved automatically
    pub async fn should_approve(&self, task: &Task) -> Result<bool> {
        // Check if already approved
        if let Some(&approved) = self.auto_approved_tasks.get(&task.id) {
            return Ok(approved);
        }

        // If task has auto_approve flag, approve it
        if task.auto_approve {
            return Ok(true);
        }

        // Check against approval rules
        for rule in &self.approval_rules {
            if self.matches_rule(rule, task)? {
                return Ok(true);
            }
        }

        // Check for dangerous operations
        if self.has_dangerous_operations(task)? {
            return Ok(false);
        }

        // Default: require approval if not auto-approved
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
        // Check for potentially dangerous operations
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
        ];

        let description_lower = task.description.to_lowercase();
        let has_dangerous_keyword = dangerous_patterns
            .iter()
            .any(|pattern| description_lower.contains(pattern));

        // Also check for file deletion operations
        let has_file_deletion = task.steps.iter().any(|step| {
            if let Action::ExecuteCommand { command, .. } = &step.action {
                command.contains("del") || command.contains("rm") || command.contains("remove")
            } else {
                false
            }
        });

        Ok(has_dangerous_keyword || has_file_deletion)
    }

    /// Manually approve a task
    pub fn approve_task(&mut self, task_id: &str) {
        self.auto_approved_tasks.insert(task_id.to_string(), true);
    }

    /// Reject a task
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

#[derive(Debug, Clone)]
pub enum ApprovalResolution {
    Approved { trust: bool },
    Rejected { reason: Option<String> },
}

pub struct ApprovalController {
    pending: TokioMutex<HashMap<String, oneshot::Sender<ApprovalResolution>>>,
    trust_store: TokioMutex<TrustedWorkflowStore>,
    current_hash: TokioMutex<Option<String>>,
}

impl ApprovalController {
    pub fn new(data_dir: PathBuf) -> Result<Self> {
        let trust_store = TrustedWorkflowStore::load(data_dir.join("trusted_workflows.json"))?;
        Ok(Self {
            pending: TokioMutex::new(HashMap::new()),
            trust_store: TokioMutex::new(trust_store),
            current_hash: TokioMutex::new(None),
        })
    }

    pub async fn request_approval(
        &self,
        app_handle: &AppHandle,
        mut payload: ApprovalRequestPayload,
    ) -> Result<ApprovalResolution> {
        if payload.workflow_hash.is_none() {
            payload.workflow_hash = self.current_hash.lock().await.clone();
        }

        if let Some(hash) = payload.workflow_hash.as_deref() {
            if self
                .trust_store
                .lock()
                .await
                .is_trusted(hash, &payload.action_signature)
            {
                tracing::info!(
                    "[Approval] Auto-approved trusted workflow {} for action {}",
                    hash,
                    payload.action_id
                );
                return Ok(ApprovalResolution::Approved { trust: false });
            }
        }

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending.lock().await;
            pending.insert(payload.action_id.clone(), tx);
        }

        self.emit_status(app_handle, "paused", &payload.reason)?;

        if let Err(error) = app_handle.emit("agent:permission_required", &payload) {
            let mut pending = self.pending.lock().await;
            pending.remove(&payload.action_id);
            return Err(anyhow!("Failed to emit approval request: {}", error));
        }

        let action_signature = payload.action_signature.clone();

        match rx.await {
            Ok(resolution) => {
                if let (ApprovalResolution::Approved { trust }, Some(hash)) =
                    (&resolution, payload.workflow_hash.as_deref())
                {
                    if *trust {
                        let mut store = self.trust_store.lock().await;
                        store.record_trust(hash, &action_signature)?;
                    }
                }
                Ok(resolution)
            }
            Err(_) => {
                self.pending.lock().await.remove(&payload.action_id);
                Err(anyhow!("Approval channel dropped for {}", payload.action_id))
            }
        }
    }

    pub async fn resolve(
        &self,
        action_id: &str,
        resolution: ApprovalResolution,
    ) -> Result<()> {
        let sender = {
            let mut pending = self.pending.lock().await;
            pending
                .remove(action_id)
                .ok_or_else(|| anyhow!("Approval {} not pending", action_id))?
        };

        sender
            .send(resolution)
            .map_err(|_| anyhow!("Failed to send approval resolution for {}", action_id))
    }

    pub async fn is_action_trusted(
        &self,
        workflow_hash: Option<&str>,
        signature: &str,
    ) -> Result<bool> {
        if let Some(hash) = workflow_hash {
            Ok(self
                .trust_store
                .lock()
                .await
                .is_trusted(hash, signature))
        } else {
            Ok(false)
        }
    }

    fn emit_status(&self, app_handle: &AppHandle, status: &str, current_step: &str) -> Result<()> {
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
        let store = self.trust_store.lock().await;
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
            let contents = fs::read_to_string(&path)
                .with_context(|| format!("Failed to read {:?}", path))?;
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
        let entry = self
            .entries
            .entry(workflow_hash.to_string())
            .or_insert_with(BTreeSet::new);
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
