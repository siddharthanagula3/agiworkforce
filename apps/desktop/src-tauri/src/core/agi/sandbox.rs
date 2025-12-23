use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
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
            self.setup_git_worktree(&workspace_path, &sandbox_id)
                .await?;
        }

        let mut sandboxes = self.active_sandboxes.lock().await;
        sandboxes.push(sandbox.clone());

        tracing::info!("[SandboxManager] Created sandbox: {}", sandbox_id);

        Ok(sandbox)
    }

    async fn setup_git_worktree(&self, workspace_path: &Path, sandbox_id: &str) -> Result<()> {
        let current_dir = std::env::current_dir()?;
        let workspace_path = workspace_path.to_path_buf();
        let sandbox_id_clone = sandbox_id.to_string();

        if !self.is_git_repo(&current_dir).await? {
            tracing::warn!("[SandboxManager] Not in git repo, skipping worktree");
            return Ok(());
        }

        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&current_dir)
                .map_err(|e| anyhow!("Failed to open repo: {}", e))?;
            let branch_name = format!("sandbox/{}", sandbox_id_clone);

            let opts = git2::WorktreeAddOptions::new();
            repo.worktree(&branch_name, &workspace_path, Some(&opts))
                .map_err(|e| anyhow!("Failed to create worktree: {}", e))?;

            Ok::<(), anyhow::Error>(())
        })
        .awai
        .map_err(|e| anyhow!("Task join error: {}", e))??;

        tracing::info!(
            "[SandboxManager] Git worktree created: sandbox/{}",
            sandbox_id
        );

        Ok(())
    }

    async fn is_git_repo(&self, path: &Path) -> Result<bool> {
        let path = path.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || git2::Repository::discover(&path).is_ok())
            .awai
            .map_err(|e| anyhow!("Task join error: {}", e))
    }

    pub async fn cleanup_sandbox(&self, sandbox: &Sandbox) -> Result<()> {
        tracing::info!("[SandboxManager] Cleaning up sandbox: {}", sandbox.id);

        if sandbox.git_worktree {
            self.remove_git_worktree(&sandbox.workspace_path, &sandbox.id)
                .await?;
        }

        if sandbox.workspace_path.exists() {
            std::fs::remove_dir_all(&sandbox.workspace_path)?;
        }

        let mut sandboxes = self.active_sandboxes.lock().await;
        sandboxes.retain(|s| s.id != sandbox.id);

        Ok(())
    }

    async fn remove_git_worktree(&self, _workspace_path: &PathBuf, sandbox_id: &str) -> Result<()> {
        let current_dir = std::env::current_dir()?;
        let sandbox_id = sandbox_id.to_string();

        tauri::async_runtime::spawn_blocking(move || {
            let repo = git2::Repository::open(&current_dir)
                .map_err(|e| anyhow!("Failed to open repo: {}", e))?;
            let worktree_name = format!("sandbox/{}", sandbox_id);

            if let Ok(wt) = repo.find_worktree(&worktree_name) {
                wt.prune(None)
                    .map_err(|e| anyhow!("Failed to prune worktree: {}", e))?;
            }

            if let Ok(mut branch) = repo.find_branch(&worktree_name, git2::BranchType::Local) {
                branch
                    .delete()
                    .map_err(|e| anyhow!("Failed to delete branch: {}", e))?;
            }

            Ok::<(), anyhow::Error>(())
        })
        .awai
        .map_err(|e| anyhow!("Task join error: {}", e))??;

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
