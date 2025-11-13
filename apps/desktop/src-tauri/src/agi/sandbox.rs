use anyhow::{anyhow, Result};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct Sandbox {
    pub id: String,
    pub workspace_path: PathBuf,
    pub git_worktree: bool,
    pub isolated: bool,
}

pub struct SandboxManager {
    active_sandboxes: Arc<Mutex<Vec<Sandbox>>>,
    base_path: PathBuf,
}

impl SandboxManager {
    pub fn new() -> Result<Self> {
        let base_path = std::env::temp_dir().join("agi_sandboxes");
        std::fs::create_dir_all(&base_path)?;

        Ok(Self {
            active_sandboxes: Arc::new(Mutex::new(Vec::new())),
            base_path,
        })
    }

    pub async fn create_sandbox(&self, use_git_worktree: bool) -> Result<Sandbox> {
        let sandbox_id = Uuid::new_v4().to_string();
        let workspace_path = self.base_path.join(&sandbox_id);

        std::fs::create_dir_all(&workspace_path)?;

        let sandbox = Sandbox {
            id: sandbox_id.clone(),
            workspace_path: workspace_path.clone(),
            git_worktree: use_git_worktree,
            isolated: true,
        };

        if use_git_worktree {
            self.setup_git_worktree(&workspace_path, &sandbox_id).await?;
        }

        let mut sandboxes = self.active_sandboxes.lock().await;
        sandboxes.push(sandbox.clone());

        tracing::info!("[SandboxManager] Created sandbox: {}", sandbox_id);

        Ok(sandbox)
    }

    async fn setup_git_worktree(&self, workspace_path: &PathBuf, sandbox_id: &str) -> Result<()> {
        let current_dir = std::env::current_dir()?;

        if !self.is_git_repo(&current_dir).await? {
            tracing::warn!("[SandboxManager] Not in git repo, skipping worktree");
            return Ok(());
        }

        let branch_name = format!("sandbox/{}", sandbox_id);

        let output = tokio::process::Command::new("git")
            .args([
                "worktree",
                "add",
                workspace_path.to_str().unwrap(),
                "-b",
                &branch_name,
            ])
            .current_dir(&current_dir)
            .output()
            .await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("Git worktree creation failed: {}", error));
        }

        tracing::info!("[SandboxManager] Git worktree created: {}", branch_name);

        Ok(())
    }

    async fn is_git_repo(&self, path: &PathBuf) -> Result<bool> {
        let output = tokio::process::Command::new("git")
            .args(["rev-parse", "--git-dir"])
            .current_dir(path)
            .output()
            .await?;

        Ok(output.status.success())
    }

    pub async fn cleanup_sandbox(&self, sandbox: &Sandbox) -> Result<()> {
        tracing::info!("[SandboxManager] Cleaning up sandbox: {}", sandbox.id);

        if sandbox.git_worktree {
            self.remove_git_worktree(&sandbox.workspace_path).await?;
        }

        if sandbox.workspace_path.exists() {
            std::fs::remove_dir_all(&sandbox.workspace_path)?;
        }

        let mut sandboxes = self.active_sandboxes.lock().await;
        sandboxes.retain(|s| s.id != sandbox.id);

        Ok(())
    }

    async fn remove_git_worktree(&self, workspace_path: &PathBuf) -> Result<()> {
        let current_dir = std::env::current_dir()?;

        let output = tokio::process::Command::new("git")
            .args(["worktree", "remove", workspace_path.to_str().unwrap(), "--force"])
            .current_dir(&current_dir)
            .output()
            .await?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            tracing::warn!("[SandboxManager] Git worktree removal warning: {}", error);
        }

        Ok(())
    }

    pub async fn cleanup_all(&self) -> Result<()> {
        let sandboxes = self.active_sandboxes.lock().await.clone();

        for sandbox in sandboxes {
            if let Err(e) = self.cleanup_sandbox(&sandbox).await {
                tracing::error!("[SandboxManager] Failed to cleanup {}: {}", sandbox.id, e);
            }
        }

        Ok(())
    }

    pub async fn get_active_count(&self) -> usize {
        self.active_sandboxes.lock().await.len()
    }
}

impl Drop for SandboxManager {
    fn drop(&mut self) {
        tracing::info!("[SandboxManager] Dropping sandbox manager");
    }
}
