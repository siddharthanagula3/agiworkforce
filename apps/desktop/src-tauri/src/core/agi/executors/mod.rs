//! Modular Tool Executor Architecture
//!
//! This module provides a trait-based system for executing AGI tools.
//! Each tool category has its own executor implementing the `ToolExecutor` trait.
//!
//! # Architecture
//!
//! ```text
//! AGIExecutor
//!     └── ExecutorRegistry
//!             ├── FileExecutor (file_read, file_write, file_delete)
//!             ├── UiExecutor (ui_screenshot, ui_click, ui_type)
//!             ├── BrowserExecutor (browser_navigate, browser_click, browser_extract)
//!             ├── DatabaseExecutor (db_query, db_execute, db_transaction_*)
//!             ├── GitExecutor (git_status, git_init, git_add, git_commit, git_push, git_clone)
//!             ├── CloudExecutor (cloud_upload, cloud_download)
//!             ├── SearchExecutor (search_web)
//!             ├── TerminalExecutor (terminal_execute)
//!             ├── CodeExecutor (code_execute, code_analyze)
//!             ├── ApiExecutor (api_call, api_upload, api_download)
//!             ├── LlmExecutor (llm_reason)
//!             ├── ProductivityExecutor (productivity_*, document_*)
//!             └── OcrExecutor (ocr_extract, ocr_analyze)
//! ```

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::core::agent::ChangeTracker;
use crate::core::agi::ExecutionContext;
use crate::core::llm::LLMRouter;
use crate::data::cache::ToolResultCache;
use crate::sys::security::ToolExecutionGuard;

mod api_executor;
mod browser_executor;
mod cloud_executor;
mod code_executor;
mod database_executor;
pub mod deploy_executor;
mod file_executor;
pub mod git_executor;
mod llm_executor;
mod media_executor;
mod ocr_executor;
mod productivity_executor;
pub mod search_executor;
mod terminal_executor;
mod ui_executor;

#[cfg(test)]
mod tests;

pub use api_executor::ApiExecutor;
pub use browser_executor::BrowserExecutor;
pub use cloud_executor::CloudExecutor;
pub use code_executor::CodeExecutor;
pub use database_executor::DatabaseExecutor;
pub use file_executor::FileExecutor;
pub use git_executor::GitExecutor;
pub use llm_executor::LlmExecutor;
pub use media_executor::MediaExecutor;
pub use ocr_executor::OcrExecutor;
pub use productivity_executor::ProductivityExecutor;
pub use search_executor::SearchExecutor;
pub use terminal_executor::TerminalExecutor;
pub use ui_executor::UiExecutor;

pub(crate) const NO_GRANTED_FOLDER: &str =
    "Choose a project folder or add an allowed folder in Settings first.";

pub(crate) const WHOLE_DRIVE_REFUSED: &str =
    "it is a whole drive or the filesystem root, such as / or C:\\, which is never granted; choose a folder inside it";

/// The folder the app writes the files it makes for the agent, such as
/// screenshots, under app data, which every sandbox keeps read-only. Created
/// owner-only; a link in its place is refused rather than followed.
pub(crate) fn agent_artifacts_dir() -> Result<PathBuf> {
    let dir = crate::sys::utils::app_data_dir()?.join("agent-artifacts");
    #[cfg(unix)]
    {
        use std::os::unix::fs::{DirBuilderExt, PermissionsExt};

        std::fs::DirBuilder::new()
            .recursive(true)
            .mode(0o700)
            .create(&dir)
            .map_err(|error| anyhow::anyhow!("Failed to create {}: {error}", dir.display()))?;
        let metadata = std::fs::symlink_metadata(&dir)?;
        if !metadata.is_dir() {
            return Err(anyhow::anyhow!(
                "{} is not a directory, so it is not used",
                dir.display()
            ));
        }
        if metadata.permissions().mode() & 0o077 != 0 {
            std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700))?;
        }
    }
    #[cfg(not(unix))]
    std::fs::create_dir_all(&dir)
        .map_err(|error| anyhow::anyhow!("Failed to create {}: {error}", dir.display()))?;
    static PRUNED: std::sync::Once = std::sync::Once::new();
    PRUNED.call_once(|| prune_agent_artifacts(&dir, AGENT_ARTIFACT_MAX_AGE));
    Ok(dir)
}

const AGENT_ARTIFACT_MAX_AGE: std::time::Duration =
    std::time::Duration::from_secs(7 * 24 * 60 * 60);

/// Deletes each file or link directly in `dir` last changed more than
/// `max_age` ago. A link is removed itself, never what it points to, and
/// folders are left alone.
fn prune_agent_artifacts(dir: &Path, max_age: std::time::Duration) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            continue;
        }
        let expired = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age > max_age);
        if expired {
            if let Err(error) = std::fs::remove_file(entry.path()) {
                tracing::warn!(
                    "[Executors] Could not delete the old agent artifact {}: {error}",
                    entry.path().display()
                );
            }
        }
    }
}

/// The granted folders that verified, in their canonical spelling, each with
/// whether the agent may change what is inside, and every other one with why
/// it was refused, and the app's own agent artifacts folder, read only. A
/// target path is compared as `std::fs::canonicalize` spells it, so the
/// roots are spelled the same way.
#[derive(Debug, Clone, Default)]
pub struct GrantedFolders {
    roots: Vec<(PathBuf, bool)>,
    refused: Vec<(PathBuf, String)>,
    artifacts: Option<PathBuf>,
}

impl GrantedFolders {
    fn verify(granted: Vec<(PathBuf, bool)>) -> Self {
        let mut folders = Self::default();
        for (folder, modifiable) in granted {
            let checked = std::path::absolute(&folder)
                .map_err(|error| error.to_string())
                .and_then(|absolute| {
                    agiworkforce_sandbox_policy::host_path::verify_read_root(&absolute)
                })
                .and_then(|root| {
                    if root.canonical.parent().is_none() {
                        Err(WHOLE_DRIVE_REFUSED.to_string())
                    } else {
                        Ok(root)
                    }
                });
            match checked {
                Ok(root) => folders.roots.push((root.canonical, modifiable)),
                Err(reason) => folders.refused.push((folder, reason)),
            }
        }
        folders
    }

    /// Whether `canonical`, a path as `std::fs::canonicalize` spells it, is
    /// inside a granted folder.
    pub fn contains(&self, canonical: &Path) -> bool {
        self.roots
            .iter()
            .any(|(root, _)| canonical.starts_with(root))
            || self
                .artifacts
                .as_ref()
                .is_some_and(|artifacts| canonical.starts_with(artifacts))
    }

    /// `path` as `std::fs::canonicalize` spells it, refused unless it exists
    /// inside a granted folder.
    pub fn readable_path(&self, path: &Path, operation: &str) -> Result<PathBuf> {
        let canonical = std::fs::canonicalize(path).map_err(|error| {
            anyhow::anyhow!(
                "Invalid or inaccessible path '{}' for {operation}: {error}",
                path.display()
            )
        })?;
        self.require_reachable(path, &canonical, operation)?;
        Ok(canonical)
    }

    /// Refuses `canonical`, what `path` resolves to, when it is on the
    /// secrets denylist or outside every granted folder.
    pub fn require_reachable(&self, path: &Path, canonical: &Path, operation: &str) -> Result<()> {
        if crate::sys::security::blocked_paths::is_blocked(canonical) {
            tracing::error!(
                "[Executors] {operation} blocked: '{}' resolved to '{}', a protected secrets path",
                path.display(),
                canonical.display()
            );
            return Err(anyhow::anyhow!(
                "Access denied: path '{}' is a protected secrets path",
                path.display()
            ));
        }
        if !self.contains(canonical) {
            tracing::error!(
                "[Executors] {operation} blocked: '{}' resolved to '{}', outside allowed directories",
                path.display(),
                canonical.display()
            );
            return Err(self.denial(
                canonical,
                format!(
                    "Access denied: path '{}' is outside allowed directories",
                    path.display()
                ),
            ));
        }
        Ok(())
    }

    /// Where writing `path` lands, in canonical spelling: its nearest
    /// existing ancestor resolved, then the missing names below it. Refused
    /// unless that ancestor is inside a folder granted for changes, and
    /// refused when any missing name is already a link, since a write would
    /// follow a link to a missing target to wherever it points.
    pub fn writable_new_path(&self, path: &Path, operation: &str) -> Result<PathBuf> {
        let absolute = std::path::absolute(path)
            .map_err(|error| anyhow::anyhow!("Invalid path '{}': {error}", path.display()))?;
        let mut missing = Vec::new();
        let mut current = absolute.as_path();
        let ancestor = loop {
            match std::fs::canonicalize(current) {
                Ok(canonical) => break canonical,
                Err(_) if std::fs::symlink_metadata(current).is_ok() => {
                    tracing::error!(
                        "[Executors] {operation} blocked: '{}' is a link to a missing target",
                        current.display()
                    );
                    return Err(anyhow::anyhow!(
                        "Access denied: '{}' is a link to a missing target",
                        current.display()
                    ));
                }
                Err(_) => {}
            }
            let name = current
                .file_name()
                .ok_or_else(|| anyhow::anyhow!("Invalid path '{}'", path.display()))?;
            missing.push(name);
            current = current
                .parent()
                .ok_or_else(|| anyhow::anyhow!("Invalid path '{}'", path.display()))?;
        };
        let target = missing
            .iter()
            .rev()
            .fold(ancestor, |target, name| target.join(name));
        self.require_reachable(path, &target, operation)?;
        self.require_modifiable(&target, operation)?;
        Ok(target)
    }

    /// Refuses a change to `canonical` unless a folder holding it was granted
    /// for changes, not only for reading.
    pub fn require_modifiable(&self, canonical: &Path, operation: &str) -> Result<()> {
        if self
            .roots
            .iter()
            .any(|(root, modifiable)| *modifiable && canonical.starts_with(root))
        {
            return Ok(());
        }
        Err(anyhow::anyhow!(
            "Access denied: {operation} changes '{}', but its folder was granted for reading only. \
             Allow changes to that folder first.",
            canonical.display()
        ))
    }

    /// The error for `canonical`, outside every granted folder: why the
    /// refused folder holding it was refused, or else `outside`.
    pub fn denial(&self, canonical: &Path, outside: String) -> anyhow::Error {
        if self.roots.is_empty() {
            return anyhow::anyhow!(self.refusal_summary());
        }
        self.refused
            .iter()
            .find(|(folder, _)| {
                let now = std::fs::canonicalize(folder).ok();
                let whole_drive = folder.parent().is_none()
                    || now.as_ref().is_some_and(|now| now.parent().is_none());
                !whole_drive
                    && (canonical.starts_with(folder)
                        || now.is_some_and(|now| canonical.starts_with(now)))
            })
            .map(|(folder, reason)| {
                anyhow::anyhow!(
                    "Access denied: the granted folder '{}' is not used: {reason}",
                    folder.display()
                )
            })
            .unwrap_or_else(|| anyhow::anyhow!(outside))
    }

    fn refusal_summary(&self) -> String {
        if self.refused.is_empty() {
            return NO_GRANTED_FOLDER.to_string();
        }
        let reasons: Vec<String> = self
            .refused
            .iter()
            .map(|(folder, reason)| format!("'{}': {reason}", folder.display()))
            .collect();
        format!(
            "{NO_GRANTED_FOLDER} No granted folder could be used: {}",
            reasons.join("; ")
        )
    }
}

/// Shared context passed to all executors
pub struct ExecutorContext {
    pub app_handle: Option<tauri::AppHandle>,
    pub router: Arc<tokio::sync::RwLock<LLMRouter>>,
    pub tool_cache: Arc<ToolResultCache>,
    pub security_guard: Arc<ToolExecutionGuard>,
    pub change_tracker: Option<Arc<ChangeTracker>>,
    pub session_id: String,
    pub tool_id: String,
    /// Folders granted to this run beyond the project folder, settings and
    /// the paths approved this session.
    pub granted_directories: Vec<PathBuf>,
}

/// The folders file, git and OCR tools may reach: the open project folder,
/// the directories allowed in settings, the paths approved this session and
/// `granted_directories`, each through only the links the system owns and
/// still where a sandbox was first given it, and, to read only, the app's own
/// folder of files it made for the agent. A folder approved this session for
/// reading only is granted for reading only. With none usable, every caller
/// refuses rather than running unrestricted, naming each folder that was
/// refused and why.
pub async fn granted_folders_for(
    app_handle: Option<&tauri::AppHandle>,
    granted_directories: &[PathBuf],
) -> Result<GrantedFolders> {
    let mut granted: Vec<(PathBuf, bool)> = granted_directories
        .iter()
        .map(|folder| (folder.clone(), true))
        .collect();
    let with_artifacts = app_handle.is_some();
    if let Some(app) = app_handle {
        use tauri::Manager;

        if let Some(project) =
            app.try_state::<crate::sys::commands::project_context::ProjectContextState>()
        {
            let ctx = project.context.read().await;
            if ctx.is_valid {
                granted.extend(
                    ctx.folder
                        .iter()
                        .map(|folder| (PathBuf::from(folder), true)),
                );
            }
        }
        if let Some(settings_state) =
            app.try_state::<crate::sys::commands::settings::SettingsState>()
        {
            let settings = settings_state.settings.lock().await;
            granted.extend(
                settings
                    .allowed_directories
                    .iter()
                    .map(|folder| (PathBuf::from(folder), true)),
            );
        }
        if let Some(confirmation) = app.try_state::<crate::sys::commands::ToolConfirmationState>() {
            granted.extend(
                confirmation
                    .get_session_folder_grants()
                    .into_iter()
                    .map(|(folder, grant)| (folder, grant.modify)),
            );
        }
    }
    let folders = tokio::task::spawn_blocking(move || {
        let mut folders = GrantedFolders::verify(granted);
        if with_artifacts {
            folders.artifacts = agent_artifacts_dir()
                .and_then(|dir| std::fs::canonicalize(dir).map_err(anyhow::Error::from))
                .map_err(|error| {
                    tracing::warn!("[Executors] The agent artifacts folder is unusable: {error}")
                })
                .ok();
        }
        folders
    })
    .await
    .map_err(|error| anyhow::anyhow!("Checking the granted folders failed: {error}"))?;
    if folders.roots.is_empty() && folders.artifacts.is_none() {
        return Err(anyhow::anyhow!(folders.refusal_summary()));
    }
    Ok(folders)
}

impl ExecutorContext {
    /// [`granted_folders_for`] this run, read once when a tool call starts,
    /// waiting for the project and settings locks.
    pub async fn granted_folders(&self) -> Result<GrantedFolders> {
        granted_folders_for(self.app_handle.as_ref(), &self.granted_directories).await
    }

    /// Emit tool progress event
    ///
    /// # Arguments
    /// * `message` - Human-readable progress message
    /// * `progress` - Optional progress value between 0.0 and 1.0
    pub fn emit_progress(&self, message: &str, progress: Option<f32>) {
        if let Some(ref app_handle) = self.app_handle {
            crate::ui::events::tool_stream::emit_tool_progress(
                app_handle,
                &self.tool_id,
                progress.unwrap_or(0.0),
                Some(message),
            );
        }
    }

    /// Emit tool error event
    ///
    /// # Arguments
    /// * `error` - Error message
    /// * `start_time` - When the tool execution started (for duration calculation)
    /// * `recoverable` - Whether the error is recoverable/retryable
    pub fn emit_error(&self, error: &str, start_time: std::time::Instant, recoverable: bool) {
        if let Some(ref app_handle) = self.app_handle {
            crate::ui::events::tool_stream::emit_tool_error(
                app_handle,
                &self.tool_id,
                error,
                start_time.elapsed().as_millis() as u64,
                recoverable,
            );
        }
    }

    /// Emit tool completed event
    ///
    /// # Arguments
    /// * `result` - The result value to emit
    /// * `start_time` - When the tool execution started (for duration calculation)
    pub fn emit_completed(&self, result: &JsonValue, start_time: std::time::Instant) {
        if let Some(ref app_handle) = self.app_handle {
            crate::ui::events::tool_stream::emit_tool_completed(
                app_handle,
                &self.tool_id,
                result.clone(),
                start_time.elapsed().as_millis() as u64,
            );
        }
    }
}

/// Trait for executing tools in a specific category
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    /// Returns the list of tool names this executor handles
    fn tool_names(&self) -> Vec<&'static str>;

    /// Executes a tool with the given parameters
    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, JsonValue>,
        context: &ExecutorContext,
        execution_context: &ExecutionContext,
    ) -> Result<JsonValue>;

    /// Returns a description of this executor
    fn description(&self) -> &'static str;
}

/// Registry of all tool executors
pub struct ExecutorRegistry {
    executors: HashMap<String, Arc<dyn ToolExecutor>>,
}

impl ExecutorRegistry {
    /// Creates a new registry with all executors registered
    pub fn new(router: Arc<tokio::sync::RwLock<LLMRouter>>) -> Self {
        let mut executors: HashMap<String, Arc<dyn ToolExecutor>> = HashMap::new();

        // Register all executors
        let file_exec: Arc<dyn ToolExecutor> = Arc::new(FileExecutor::new());
        for name in file_exec.tool_names() {
            executors.insert(name.to_string(), file_exec.clone());
        }

        let ui_exec: Arc<dyn ToolExecutor> = Arc::new(UiExecutor::new());
        for name in ui_exec.tool_names() {
            executors.insert(name.to_string(), ui_exec.clone());
        }

        let browser_exec: Arc<dyn ToolExecutor> = Arc::new(BrowserExecutor::new());
        for name in browser_exec.tool_names() {
            executors.insert(name.to_string(), browser_exec.clone());
        }

        let db_exec: Arc<dyn ToolExecutor> = Arc::new(DatabaseExecutor::new());
        for name in db_exec.tool_names() {
            executors.insert(name.to_string(), db_exec.clone());
        }

        let git_exec: Arc<dyn ToolExecutor> = Arc::new(GitExecutor::new());
        for name in git_exec.tool_names() {
            executors.insert(name.to_string(), git_exec.clone());
        }

        let cloud_exec: Arc<dyn ToolExecutor> = Arc::new(CloudExecutor::new());
        for name in cloud_exec.tool_names() {
            executors.insert(name.to_string(), cloud_exec.clone());
        }

        let search_exec: Arc<dyn ToolExecutor> = Arc::new(SearchExecutor::new());
        for name in search_exec.tool_names() {
            executors.insert(name.to_string(), search_exec.clone());
        }

        let terminal_exec: Arc<dyn ToolExecutor> = Arc::new(TerminalExecutor::new());
        for name in terminal_exec.tool_names() {
            executors.insert(name.to_string(), terminal_exec.clone());
        }

        let code_exec: Arc<dyn ToolExecutor> = Arc::new(CodeExecutor::new());
        for name in code_exec.tool_names() {
            executors.insert(name.to_string(), code_exec.clone());
        }

        let api_exec: Arc<dyn ToolExecutor> = Arc::new(ApiExecutor::new());
        for name in api_exec.tool_names() {
            executors.insert(name.to_string(), api_exec.clone());
        }

        let llm_exec: Arc<dyn ToolExecutor> = Arc::new(LlmExecutor::new(router));
        for name in llm_exec.tool_names() {
            executors.insert(name.to_string(), llm_exec.clone());
        }

        let productivity_exec: Arc<dyn ToolExecutor> = Arc::new(ProductivityExecutor::new());
        for name in productivity_exec.tool_names() {
            executors.insert(name.to_string(), productivity_exec.clone());
        }

        let ocr_exec: Arc<dyn ToolExecutor> = Arc::new(OcrExecutor::new());
        for name in ocr_exec.tool_names() {
            executors.insert(name.to_string(), ocr_exec.clone());
        }

        // Media generation executor (image/video)
        let media_exec: Arc<dyn ToolExecutor> = Arc::new(MediaExecutor::new());
        for name in media_exec.tool_names() {
            executors.insert(name.to_string(), media_exec.clone());
        }

        Self { executors }
    }

    /// Gets an executor for a given tool name.
    pub fn get_executor(&self, tool_name: &str) -> Option<Arc<dyn ToolExecutor>> {
        self.executors.get(tool_name).cloned()
    }

    /// Returns all registered tool names.
    pub fn tool_names(&self) -> Vec<&str> {
        self.executors.keys().map(|s| s.as_str()).collect()
    }

    /// Returns the number of registered executors.
    pub fn executor_count(&self) -> usize {
        // Count unique executors (not tool names)
        let unique: std::collections::HashSet<_> =
            self.executors.values().map(|e| e.description()).collect();

        unique.len()
    }
}

// Note: Executor tests are located in the tests/ subdirectory:
// - tests/file_executor_tests.rs
// - tests/git_executor_tests.rs
// - tests/database_executor_tests.rs
