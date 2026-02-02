//! Session sandbox mode for isolation

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use crate::sys::error::{Error, Result};

/// Sandbox configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxConfig {
    pub enabled: bool,
    pub base_path: Option<PathBuf>,
    pub default_permissions: SandboxPermissions,
    pub max_sessions: usize,
}

impl Default for SandboxConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            base_path: None,
            default_permissions: SandboxPermissions::default(),
            max_sessions: 5,
        }
    }
}

/// Permissions for a sandbox session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxPermissions {
    pub filesystem_read: bool,
    pub filesystem_write: bool,
    pub network_access: bool,
    pub execute_commands: bool,
    pub allowed_paths: Vec<PathBuf>,
    pub blocked_paths: Vec<PathBuf>,
    pub allowed_hosts: Vec<String>,
    pub blocked_hosts: Vec<String>,
}

impl Default for SandboxPermissions {
    fn default() -> Self {
        Self {
            filesystem_read: true,
            filesystem_write: false,
            network_access: true,
            execute_commands: false,
            allowed_paths: vec![],
            blocked_paths: vec![
                PathBuf::from("/etc"),
                PathBuf::from("/usr"),
                PathBuf::from("/bin"),
                PathBuf::from("/sbin"),
            ],
            allowed_hosts: vec![],
            blocked_hosts: vec![],
        }
    }
}

/// A sandbox session
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxSession {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub permissions: SandboxPermissions,
    pub working_dir: PathBuf,
    pub environment: HashMap<String, String>,
    pub active: bool,
}

/// Sandbox manager
pub struct SandboxManager {
    config: RwLock<SandboxConfig>,
    sessions: Arc<RwLock<HashMap<String, SandboxSession>>>,
}

impl SandboxManager {
    pub fn new(config: SandboxConfig) -> Self {
        Self {
            config: RwLock::new(config),
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a new sandbox session
    pub fn create_session(
        &self,
        name: &str,
        permissions: Option<SandboxPermissions>,
    ) -> Result<SandboxSession> {
        let config = self
            .config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut sessions = self
            .sessions
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        if sessions.len() >= config.max_sessions {
            return Err(Error::Generic("Maximum sandbox sessions reached".into()));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let base_path = config.base_path.clone().unwrap_or_else(std::env::temp_dir);
        let working_dir = base_path.join("sandbox").join(&id);

        // Create sandbox directory
        std::fs::create_dir_all(&working_dir)?;

        let session = SandboxSession {
            id: id.clone(),
            name: name.to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
            permissions: permissions.unwrap_or_else(|| config.default_permissions.clone()),
            working_dir,
            environment: HashMap::new(),
            active: true,
        };

        sessions.insert(id, session.clone());

        Ok(session)
    }

    /// Get a session by ID
    pub fn get_session(&self, id: &str) -> Result<Option<SandboxSession>> {
        let sessions = self
            .sessions
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(sessions.get(id).cloned())
    }

    /// List all sessions
    pub fn list_sessions(&self) -> Result<Vec<SandboxSession>> {
        let sessions = self
            .sessions
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;
        Ok(sessions.values().cloned().collect())
    }

    /// Destroy a session
    pub fn destroy_session(&self, id: &str) -> Result<bool> {
        let config = self
            .config
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let mut sessions = self
            .sessions
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        if let Some(session) = sessions.remove(id) {
            // AUDIT-003-002 fix: Validate working_dir is within sandbox base_path before deletion
            // This prevents directory traversal attacks where working_dir could be manipulated
            if session.working_dir.exists() {
                let base_path = config.base_path.clone().unwrap_or_else(std::env::temp_dir);
                let sandbox_base = base_path.join("sandbox");

                // Canonicalize both paths to resolve symlinks and normalize
                let canonical_working = session.working_dir.canonicalize().ok();
                let canonical_base = sandbox_base.canonicalize().ok();

                let is_safe = match (canonical_working, canonical_base) {
                    (Some(working), Some(base)) => working.starts_with(&base),
                    // If canonicalization fails (e.g., path doesn't exist), use string prefix check
                    _ => session
                        .working_dir
                        .to_string_lossy()
                        .starts_with(sandbox_base.to_string_lossy().as_ref()),
                };

                if is_safe {
                    let _ = std::fs::remove_dir_all(&session.working_dir);
                } else {
                    tracing::warn!(
                        "AUDIT-003-002: Refused to delete working_dir outside sandbox: {:?}",
                        session.working_dir
                    );
                }
            }
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Check if a path is allowed
    pub fn is_path_allowed(&self, session_id: &str, path: &std::path::Path) -> Result<bool> {
        let sessions = self
            .sessions
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let session = sessions
            .get(session_id)
            .ok_or_else(|| Error::Generic("Session not found".into()))?;

        // Check blocked paths first
        for blocked in &session.permissions.blocked_paths {
            if path.starts_with(blocked) {
                return Ok(false);
            }
        }

        // If allowed_paths is empty, allow all except blocked
        if session.permissions.allowed_paths.is_empty() {
            return Ok(true);
        }

        // Check if in allowed paths
        for allowed in &session.permissions.allowed_paths {
            if path.starts_with(allowed) {
                return Ok(true);
            }
        }

        // Also allow sandbox working dir
        if path.starts_with(&session.working_dir) {
            return Ok(true);
        }

        Ok(false)
    }

    /// Check if a host is allowed
    pub fn is_host_allowed(&self, session_id: &str, host: &str) -> Result<bool> {
        let sessions = self
            .sessions
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        let session = sessions
            .get(session_id)
            .ok_or_else(|| Error::Generic("Session not found".into()))?;

        if !session.permissions.network_access {
            return Ok(false);
        }

        // Check blocked hosts
        for blocked in &session.permissions.blocked_hosts {
            if host.contains(blocked) {
                return Ok(false);
            }
        }

        // If allowed_hosts is empty, allow all except blocked
        if session.permissions.allowed_hosts.is_empty() {
            return Ok(true);
        }

        // Check allowed hosts
        for allowed in &session.permissions.allowed_hosts {
            if host.contains(allowed) {
                return Ok(true);
            }
        }

        Ok(false)
    }

    /// Update session permissions
    pub fn update_permissions(
        &self,
        session_id: &str,
        permissions: SandboxPermissions,
    ) -> Result<()> {
        let mut sessions = self
            .sessions
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        if let Some(session) = sessions.get_mut(session_id) {
            session.permissions = permissions;
            Ok(())
        } else {
            Err(Error::Generic("Session not found".into()))
        }
    }

    /// Set environment variable for session
    pub fn set_env(&self, session_id: &str, key: &str, value: &str) -> Result<()> {
        let mut sessions = self
            .sessions
            .write()
            .map_err(|e| Error::Generic(e.to_string()))?;

        if let Some(session) = sessions.get_mut(session_id) {
            session
                .environment
                .insert(key.to_string(), value.to_string());
            Ok(())
        } else {
            Err(Error::Generic("Session not found".into()))
        }
    }

    /// Get session working directory
    pub fn get_working_dir(&self, session_id: &str) -> Result<PathBuf> {
        let sessions = self
            .sessions
            .read()
            .map_err(|e| Error::Generic(e.to_string()))?;

        sessions
            .get(session_id)
            .map(|s| s.working_dir.clone())
            .ok_or_else(|| Error::Generic("Session not found".into()))
    }
}

impl Default for SandboxManager {
    fn default() -> Self {
        Self::new(SandboxConfig::default())
    }
}
