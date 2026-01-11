/// Security policy actions - represents all sensitive operations that require policy evaluation
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// A security-sensitive action that the application wants to perform
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SecurityAction {
    /// File system operations
    FileRead {
        path: PathBuf,
        workspace_id: Option<String>,
    },
    FileWrite {
        path: PathBuf,
        workspace_id: Option<String>,
        size_bytes: Option<u64>,
    },
    FileDelete {
        path: PathBuf,
        workspace_id: Option<String>,
    },
    DirectoryCreate {
        path: PathBuf,
        workspace_id: Option<String>,
    },
    DirectoryDelete {
        path: PathBuf,
        recursive: bool,
        workspace_id: Option<String>,
    },
    DirectoryList {
        path: PathBuf,
        recursive: bool,
        workspace_id: Option<String>,
    },

    /// Shell and command execution
    ShellCommand {
        command: String,
        args: Vec<String>,
        cwd: PathBuf,
        workspace_id: Option<String>,
    },
    TerminalSpawn {
        shell_type: String,
        cwd: PathBuf,
        workspace_id: Option<String>,
    },
    GitOperation {
        operation: GitOperationType,
        repository_path: PathBuf,
        workspace_id: Option<String>,
    },

    /// Screen and input automation
    ScreenCapture {
        region: Option<CaptureRegion>,
        save_to_disk: bool,
    },
    InputSimulation {
        action_type: InputActionType,
        target_window: Option<String>,
    },
    ClipboardRead,
    ClipboardWrite {
        content_type: String,
    },

    /// Database operations
    DatabaseConnect {
        db_type: String,
        host: String,
        database: String,
        is_local: bool,
    },
    DatabaseQuery {
        db_type: String,
        connection_id: String,
        query_type: QueryType,
    },

    /// Network operations
    NetworkRequest {
        method: String,
        url: String,
        domain: String,
        is_sensitive_data: bool,
    },

    /// Browser automation
    BrowserLaunch {
        headless: bool,
        profile_path: Option<PathBuf>,
    },
    BrowserNavigate {
        url: String,
        domain: String,
    },

    /// Sensitive data access
    CredentialRead {
        service: String,
        account: String,
    },
    CredentialWrite {
        service: String,
        account: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitOperationType {
    Init,
    Clone,
    Fetch,
    Pull,
    Push,
    Commit,
    Add,
    Status,
    Log,
    Diff,
    Branch,
    Checkout,
    Merge,
    Rebase,
    Reset,
    Stash,
    Remote,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureRegion {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InputActionType {
    Click { x: i32, y: i32 },
    DoubleClick { x: i32, y: i32 },
    Type { text: String },
    KeyPress { key: String },
    MouseMove { x: i32, y: i32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QueryType {
    Select,
    Insert,
    Update,
    Delete,
    Create,
    Drop,
    Alter,
}

impl SecurityAction {
    /// Get a human-readable description of this action
    pub fn description(&self) -> String {
        match self {
            SecurityAction::FileRead { path, .. } => {
                format!("Read file: {}", path.display())
            }
            SecurityAction::FileWrite { path, .. } => {
                format!("Write file: {}", path.display())
            }
            SecurityAction::FileDelete { path, .. } => {
                format!("Delete file: {}", path.display())
            }
            SecurityAction::DirectoryCreate { path, .. } => {
                format!("Create directory: {}", path.display())
            }
            SecurityAction::DirectoryDelete {
                path, recursive, ..
            } => {
                if *recursive {
                    format!("Delete directory recursively: {}", path.display())
                } else {
                    format!("Delete directory: {}", path.display())
                }
            }
            SecurityAction::DirectoryList { path, .. } => {
                format!("List directory: {}", path.display())
            }
            SecurityAction::ShellCommand { command, cwd, .. } => {
                format!("Run command '{}' in {}", command, cwd.display())
            }
            SecurityAction::TerminalSpawn {
                shell_type, cwd, ..
            } => {
                format!("Spawn {} terminal in {}", shell_type, cwd.display())
            }
            SecurityAction::GitOperation {
                operation,
                repository_path,
                ..
            } => {
                format!("Git {:?} in {}", operation, repository_path.display())
            }
            SecurityAction::ScreenCapture { region, .. } => {
                if let Some(r) = region {
                    format!("Capture screen region {}x{}", r.width, r.height)
                } else {
                    "Capture full screen".to_string()
                }
            }
            SecurityAction::InputSimulation { action_type, .. } => match action_type {
                InputActionType::Click { .. } => "Simulate mouse click".to_string(),
                InputActionType::Type { text } => format!("Type text ({} chars)", text.len()),
                InputActionType::KeyPress { key } => format!("Press key: {}", key),
                _ => "Simulate input".to_string(),
            },
            SecurityAction::ClipboardRead => "Read clipboard".to_string(),
            SecurityAction::ClipboardWrite { .. } => "Write to clipboard".to_string(),
            SecurityAction::DatabaseConnect {
                db_type,
                host,
                database,
                ..
            } => {
                format!("Connect to {} database: {} on {}", db_type, database, host)
            }
            SecurityAction::DatabaseQuery { query_type, .. } => {
                format!("Execute {:?} query", query_type)
            }
            SecurityAction::NetworkRequest { method, url, .. } => {
                format!("{} request to {}", method, url)
            }
            SecurityAction::BrowserLaunch { headless, .. } => {
                if *headless {
                    "Launch headless browser".to_string()
                } else {
                    "Launch browser".to_string()
                }
            }
            SecurityAction::BrowserNavigate { url, .. } => {
                format!("Navigate browser to {}", url)
            }
            SecurityAction::CredentialRead { service, .. } => {
                format!("Read credentials for {}", service)
            }
            SecurityAction::CredentialWrite { service, .. } => {
                format!("Store credentials for {}", service)
            }
        }
    }

    /// Get the category of this action for grouping and policy rules
    pub fn category(&self) -> ActionCategory {
        match self {
            SecurityAction::FileRead { .. }
            | SecurityAction::FileWrite { .. }
            | SecurityAction::FileDelete { .. }
            | SecurityAction::DirectoryCreate { .. }
            | SecurityAction::DirectoryDelete { .. }
            | SecurityAction::DirectoryList { .. } => ActionCategory::FileSystem,

            SecurityAction::ShellCommand { .. }
            | SecurityAction::TerminalSpawn { .. }
            | SecurityAction::GitOperation { .. } => ActionCategory::Shell,

            SecurityAction::ScreenCapture { .. }
            | SecurityAction::InputSimulation { .. }
            | SecurityAction::ClipboardRead
            | SecurityAction::ClipboardWrite { .. } => ActionCategory::Automation,

            SecurityAction::DatabaseConnect { .. } | SecurityAction::DatabaseQuery { .. } => {
                ActionCategory::Database
            }

            SecurityAction::NetworkRequest { .. } => ActionCategory::Network,

            SecurityAction::BrowserLaunch { .. } | SecurityAction::BrowserNavigate { .. } => {
                ActionCategory::Browser
            }

            SecurityAction::CredentialRead { .. } | SecurityAction::CredentialWrite { .. } => {
                ActionCategory::Credentials
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionCategory {
    FileSystem,
    Shell,
    Automation,
    Database,
    Network,
    Browser,
    Credentials,
}
