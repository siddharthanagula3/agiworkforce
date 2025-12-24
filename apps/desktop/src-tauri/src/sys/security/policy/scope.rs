use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub root_path: PathBuf,
    pub description: Option<String>,
    pub created_at: i64,
}

pub struct ScopeManager {
    workspaces: Vec<Workspace>,
    system_blacklist: Vec<PathBuf>,
}

impl ScopeManager {
    pub fn new() -> Self {
        Self {
            workspaces: Vec::new(),
            system_blacklist: Self::default_blacklist(),
        }
    }

    fn default_blacklist() -> Vec<PathBuf> {
        let mut blacklist = Vec::new();

        if cfg!(windows) {
            if let Ok(windir) = std::env::var("WINDIR") {
                blacklist.push(PathBuf::from(&windir).join("System32"));
                blacklist.push(PathBuf::from(&windir).join("SysWOW64"));
            }
            blacklist.push(PathBuf::from("C:\\Windows\\System32"));
            blacklist.push(PathBuf::from("C:\\Windows\\SysWOW64"));
            blacklist.push(PathBuf::from("C:\\Program Files"));
            blacklist.push(PathBuf::from("C:\\Program Files (x86)"));
        }

        if cfg!(unix) {
            blacklist.push(PathBuf::from("/etc/passwd"));
            blacklist.push(PathBuf::from("/etc/shadow"));
            blacklist.push(PathBuf::from("/etc/sudoers"));
            blacklist.push(PathBuf::from("/root"));
        }

        blacklist
    }

    pub fn add_workspace(&mut self, workspace: Workspace) -> Result<()> {
        if !workspace.root_path.exists() {
            return Err(anyhow::anyhow!("Workspace path does not exist"));
        }
        if !workspace.root_path.is_dir() {
            return Err(anyhow::anyhow!("Workspace path is not a directory"));
        }

        let canonical = workspace.root_path.canonicalize()?;
        if self.is_path_blacklisted(&canonical)? {
            return Err(anyhow::anyhow!(
                "Cannot create workspace in system-critical directory"
            ));
        }

        self.workspaces.push(workspace);
        Ok(())
    }

    pub fn remove_workspace(&mut self, id: &str) {
        self.workspaces.retain(|w| w.id != id);
    }

    pub fn get_workspaces(&self) -> &[Workspace] {
        &self.workspaces
    }

    pub fn find_workspace_for_path(&self, path: &Path) -> Option<&Workspace> {
        let canonical = path.canonicalize().ok()?;

        self.workspaces.iter().find(|workspace| {
            if let Ok(workspace_canonical) = workspace.root_path.canonicalize() {
                canonical.starts_with(&workspace_canonical)
            } else {
                false
            }
        })
    }

    pub fn is_in_workspace(&self, path: &Path) -> Result<bool> {
        Ok(self.find_workspace_for_path(path).is_some())
    }

    pub fn is_path_blacklisted(&self, path: &Path) -> Result<bool> {
        let canonical = path.canonicalize().or_else(|_| {
            if let Some(parent) = path.parent() {
                parent.canonicalize()
            } else {
                Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "Cannot resolve path",
                ))
            }
        })?;

        for blacklisted in &self.system_blacklist {
            if let Ok(blacklisted_canonical) = blacklisted.canonicalize() {
                if canonical.starts_with(&blacklisted_canonical) {
                    return Ok(true);
                }
            }
        }

        let path_str = canonical.to_string_lossy().to_lowercase();
        let sensitive_patterns = [
            ".ssh",
            ".aws",
            ".gnupg",
            ".kube",
            "credentials",
            "private_key",
            "id_rsa",
            "id_ed25519",
        ];

        for pattern in &sensitive_patterns {
            if path_str.contains(pattern) {
                return Ok(true);
            }
        }

        Ok(false)
    }

    pub fn validate_path(&self, path: &Path) -> Result<PathBuf> {
        let path_str = path.to_string_lossy();

        if path_str.contains("..") {
            return Err(anyhow::anyhow!("Path contains directory traversal (..)"));
        }

        if path_str.contains('\0') {
            return Err(anyhow::anyhow!("Path contains null bytes"));
        }

        if path_str.len() > 4096 {
            return Err(anyhow::anyhow!("Path too long (max 4096 characters)"));
        }

        let canonical = path
            .canonicalize()
            .or_else(|_| {
                if let Some(parent) = path.parent() {
                    let parent_canonical = parent.canonicalize()?;
                    if let Some(filename) = path.file_name() {
                        Ok(parent_canonical.join(filename))
                    } else {
                        Err(anyhow::anyhow!("Invalid path"))
                    }
                } else {
                    Err(anyhow::anyhow!("Cannot resolve path"))
                }
            })
            .context("Failed to validate path")?;

        if self.is_path_blacklisted(&canonical)? {
            return Err(anyhow::anyhow!("Path is in system-critical directory"));
        }

        Ok(canonical)
    }

    pub fn check_path_scope(
        &self,
        path: &Path,
        is_write_or_delete: bool,
    ) -> Result<PathScopeResult> {
        let validated_path = self.validate_path(path)?;

        if let Some(workspace) = self.find_workspace_for_path(&validated_path) {
            return Ok(PathScopeResult::InWorkspace {
                workspace_id: workspace.id.clone(),
                workspace_name: workspace.name.clone(),
                path: validated_path,
            });
        }

        if let Some(home_dir) = dirs::home_dir() {
            if let Ok(home_canonical) = home_dir.canonicalize() {
                if validated_path.starts_with(&home_canonical) {
                    return Ok(PathScopeResult::InUserHome {
                        path: validated_path,
                        is_write_or_delete,
                    });
                }
            }
        }

        Ok(PathScopeResult::OutsideScope {
            path: validated_path,
            is_write_or_delete,
        })
    }
}

impl Default for ScopeManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
pub enum PathScopeResult {
    InWorkspace {
        workspace_id: String,
        workspace_name: String,
        path: PathBuf,
    },

    InUserHome {
        path: PathBuf,
        is_write_or_delete: bool,
    },

    OutsideScope {
        path: PathBuf,
        is_write_or_delete: bool,
    },
}
