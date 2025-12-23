use super::policy::*;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PolicyError {
    ApprovalRequired {
        action_description: String,
        risk_level: RiskLevel,
        reason: String,
        allow_remember: bool,

        approval_token: Option<String>,
    },

    Denied {
        reason: String,
        can_elevate: bool,
    },

    PolicyFailure {
        message: String,
    },
}

impl std::fmt::Display for PolicyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PolicyError::ApprovalRequired { reason, .. } => {
                write!(f, "Approval required: {}", reason)
            }
            PolicyError::Denied { reason, .. } => {
                write!(f, "Denied: {}", reason)
            }
            PolicyError::PolicyFailure { message } => {
                write!(f, "Policy error: {}", message)
            }
        }
    }
}

impl std::error::Error for PolicyError {}

pub struct PolicyState {
    engine: Arc<RwLock<PolicyEngine>>,
    context: Arc<RwLock<PolicyContext>>,
}

impl PolicyState {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(RwLock::new(PolicyEngine::new())),
            context: Arc::new(RwLock::new(PolicyContext::default())),
        }
    }

    pub async fn check_action(&self, action: SecurityAction) -> Result<(), PolicyError> {
        let engine = self.engine.read().await;
        let context = self.context.read().await;

        let decision =
            engine
                .evaluate(&action, &context)
                .map_err(|e| PolicyError::PolicyFailure {
                    message: e.to_string(),
                })?;

        match decision {
            PolicyDecision::Allow { .. } => Ok(()),
            PolicyDecision::RequireApproval {
                risk_level,
                reason,
                allow_remember,
            } => Err(PolicyError::ApprovalRequired {
                action_description: action.description(),
                risk_level,
                reason,
                allow_remember,
                approval_token: None,
            }),
            PolicyDecision::Deny {
                reason,
                can_elevate,
            } => Err(PolicyError::Denied {
                reason,
                can_elevate,
            }),
        }
    }

    pub async fn engine_mut(&self) -> tokio::sync::RwLockWriteGuard<'_, PolicyEngine> {
        self.engine.write().await
    }

    pub async fn engine(&self) -> tokio::sync::RwLockReadGuard<'_, PolicyEngine> {
        self.engine.read().await
    }

    pub async fn set_context(&self, context: PolicyContext) {
        let mut ctx = self.context.write().await;
        *ctx = context;
    }

    pub async fn get_context(&self) -> PolicyContext {
        self.context.read().await.clone()
    }

    pub async fn set_trust_level(&self, trust_level: TrustLevel) {
        let mut ctx = self.context.write().await;
        ctx.trust_level = trust_level;
    }

    pub async fn add_workspace(&self, workspace: Workspace) -> Result<(), String> {
        let mut engine = self.engine.write().await;
        engine
            .scope_manager_mut()
            .add_workspace(workspace)
            .map_err(|e| e.to_string())
    }

    pub async fn get_workspaces(&self) -> Vec<Workspace> {
        let engine = self.engine.read().await;
        engine.scope_manager().get_workspaces().to_vec()
    }
}

impl Default for PolicyState {
    fn default() -> Self {
        Self::new()
    }
}

pub async fn check_file_read(
    policy: &PolicyState,
    path: &Path,
    workspace_id: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::FileRead {
            path: path.to_path_buf(),
            workspace_id,
        })
        .await
}

pub async fn check_file_write(
    policy: &PolicyState,
    path: &Path,
    size_bytes: Option<u64>,
    workspace_id: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::FileWrite {
            path: path.to_path_buf(),
            workspace_id,
            size_bytes,
        })
        .await
}

pub async fn check_file_delete(
    policy: &PolicyState,
    path: &Path,
    workspace_id: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::FileDelete {
            path: path.to_path_buf(),
            workspace_id,
        })
        .await
}

pub async fn check_directory_delete(
    policy: &PolicyState,
    path: &Path,
    recursive: bool,
    workspace_id: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::DirectoryDelete {
            path: path.to_path_buf(),
            recursive,
            workspace_id,
        })
        .await
}

pub async fn check_shell_command(
    policy: &PolicyState,
    command: &str,
    args: Vec<String>,
    cwd: &Path,
    workspace_id: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::ShellCommand {
            command: command.to_string(),
            args,
            cwd: cwd.to_path_buf(),
            workspace_id,
        })
        .await
}

pub async fn check_terminal_spawn(
    policy: &PolicyState,
    shell_type: &str,
    cwd: &Path,
    workspace_id: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::TerminalSpawn {
            shell_type: shell_type.to_string(),
            cwd: cwd.to_path_buf(),
            workspace_id,
        })
        .await
}

pub async fn check_screen_capture(
    policy: &PolicyState,
    region: Option<CaptureRegion>,
    save_to_disk: bool,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::ScreenCapture {
            region,
            save_to_disk,
        })
        .await
}

pub async fn check_input_simulation(
    policy: &PolicyState,
    action_type: InputActionType,
    target_window: Option<String>,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::InputSimulation {
            action_type,
            target_window,
        })
        .await
}

pub async fn check_clipboard_read(policy: &PolicyState) -> Result<(), PolicyError> {
    policy.check_action(SecurityAction::ClipboardRead).await
}

pub async fn check_clipboard_write(
    policy: &PolicyState,
    content_type: &str,
) -> Result<(), PolicyError> {
    policy
        .check_action(SecurityAction::ClipboardWrite {
            content_type: content_type.to_string(),
        })
        .await
}

pub async fn check_database_connect(
    policy: &PolicyState,
    db_type: &str,
    host: &str,
    database: &str,
) -> Result<(), PolicyError> {
    let is_local = host == "localhost" || host == "127.0.0.1" || host.starts_with("127.");

    policy
        .check_action(SecurityAction::DatabaseConnect {
            db_type: db_type.to_string(),
            host: host.to_string(),
            database: database.to_string(),
            is_local,
        })
        .await
}

pub async fn check_network_request(
    policy: &PolicyState,
    method: &str,
    url: &str,
    is_sensitive_data: bool,
) -> Result<(), PolicyError> {
    let domain = url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
        .unwrap_or_else(|| url.to_string());

    policy
        .check_action(SecurityAction::NetworkRequest {
            method: method.to_string(),
            url: url.to_string(),
            domain,
            is_sensitive_data,
        })
        .await
}

#[macro_export]
macro_rules! check_policy {
    ($policy:expr, $action:expr) => {
        $policy
            .check_action($action)
            .await
            .map_err(|e| format!("{}", e))?
    };
}
