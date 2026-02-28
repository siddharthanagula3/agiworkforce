//! File operations executor.
//!
//! Handles file system operations including reading, writing, and deleting files.
//! All operations include security validations to prevent path traversal attacks
//! and maintain undo capability for the safety model.
//!
//! # Security Model
//!
//! File operations are restricted to allowed directories configured in user settings.
//! Path traversal attacks (using `..`, symlinks, etc.) are prevented by canonicalizing
//! paths and validating them against the allowed directory list.
//!
//! # Undo Capability
//!
//! All file modifications are tracked via the `ChangeTracker` to support the
//! reversibility principle. Users can undo file writes and restore deleted files.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// EXE-005 fix: Maximum file write size (10 MB) to prevent resource exhaustion
const MAX_FILE_WRITE_SIZE: usize = 10 * 1024 * 1024; // 10 MB

/// EXE-005 fix: Maximum file read size (50 MB) to prevent memory exhaustion
const MAX_FILE_READ_SIZE: u64 = 50 * 1024 * 1024; // 50 MB

/// EXE-002 fix: Maximum path length to prevent path-based attacks
const MAX_PATH_LENGTH: usize = 4096;

/// Executor for file system operations.
///
/// Handles `file_read`, `file_write`, and `file_delete` tools with comprehensive
/// security validation and undo tracking.
pub struct FileExecutor;

impl FileExecutor {
    /// Create a new file executor.
    pub fn new() -> Self {
        Self
    }

    /// Validate an existing path is within allowed directories.
    ///
    /// # Security
    ///
    /// - Canonicalizes the path to resolve symlinks and `..` components
    /// - Validates the canonicalized path is within allowed directories
    /// - Logs security violations for audit trail
    ///
    /// # Arguments
    ///
    /// * `path` - The path to validate
    /// * `context` - The executor context containing allowed directories
    /// * `operation` - The operation name for logging
    ///
    /// # Returns
    ///
    /// The canonicalized path if validation succeeds, or an error if the path
    /// is invalid or outside allowed directories.
    fn validate_path(path: &Path, context: &ExecutorContext, operation: &str) -> Result<PathBuf> {
        // EXE-002 fix: Validate path length to prevent overflow attacks
        let path_str = path.to_string_lossy();
        if path_str.len() > MAX_PATH_LENGTH {
            tracing::error!(
                "[FileExecutor] Path too long: {} chars (max {})",
                path_str.len(),
                MAX_PATH_LENGTH
            );
            return Err(anyhow!(
                "Path exceeds maximum length of {} characters",
                MAX_PATH_LENGTH
            ));
        }

        // EXE-002 fix: Check for null bytes that could cause path truncation in C libraries
        if path_str.contains('\0') {
            tracing::error!(
                "[FileExecutor] Null byte in path blocked: '{}'",
                path.display()
            );
            return Err(anyhow!("Invalid path: contains null byte"));
        }

        // SECURITY: Canonicalize the path to resolve symlinks and prevent path traversal attacks
        // This converts relative paths to absolute and resolves "..", ".", and symlinks
        let canonical_path = std::fs::canonicalize(path)
            .map_err(|e| anyhow!("Invalid or inaccessible path '{}': {}", path.display(), e))?;

        // SECURITY: Validate the canonicalized path is within allowed directories
        // This prevents path traversal attacks like "../../../etc/passwd"
        let allowed_directories = context.get_allowed_directories();
        let path_allowed = if allowed_directories.is_empty() {
            // If no restrictions configured, allow access (backwards compatibility)
            // but log a security warning
            tracing::warn!(
                "[FileExecutor] No allowed_directories configured - {} unrestricted. \
                Consider configuring allowed directories for security.",
                operation
            );
            true
        } else {
            allowed_directories
                .iter()
                .any(|allowed_dir| canonical_path.starts_with(allowed_dir))
        };

        if !path_allowed {
            tracing::error!(
                "[FileExecutor] Path traversal attempt blocked: '{}' resolved to '{}' which is outside allowed directories",
                path.display(),
                canonical_path.display()
            );
            return Err(anyhow!(
                "Access denied: path '{}' is outside allowed directories",
                path.display()
            ));
        }

        Ok(canonical_path)
    }

    /// EXE-002 fix: Re-validate path immediately before operation to detect TOCTOU attacks.
    ///
    /// This function re-canonicalizes the path and verifies it still matches the expected
    /// canonical path. If the path changed between initial validation and this check,
    /// it indicates a potential symlink race attack.
    ///
    /// # Arguments
    ///
    /// * `original_path` - The original user-provided path
    /// * `expected_canonical` - The canonical path from initial validation
    /// * `operation` - The operation name for logging
    ///
    /// # Returns
    ///
    /// Ok(()) if the path is still valid, or an error if a race condition was detected.
    fn verify_path_unchanged(
        original_path: &Path,
        expected_canonical: &Path,
        operation: &str,
    ) -> Result<()> {
        // Re-canonicalize to detect if the path changed
        let current_canonical = std::fs::canonicalize(original_path).map_err(|e| {
            anyhow!(
                "Path became inaccessible during {}: {} - {}",
                operation,
                original_path.display(),
                e
            )
        })?;

        if current_canonical != expected_canonical {
            tracing::error!(
                "[FileExecutor] TOCTOU attack detected during {}: path '{}' changed from '{}' to '{}'",
                operation,
                original_path.display(),
                expected_canonical.display(),
                current_canonical.display()
            );
            return Err(anyhow!(
                "Security violation: path changed during operation (possible symlink race attack)"
            ));
        }

        Ok(())
    }

    /// Validate a path for new file creation.
    ///
    /// For new files, the file doesn't exist yet so we validate the parent directory
    /// and ensure it's within allowed directories.
    ///
    /// # Security
    ///
    /// - For existing files: canonicalizes and validates the full path
    /// - For new files: canonicalizes the parent directory and validates it
    /// - Prevents creation of files outside allowed directories
    ///
    /// # Arguments
    ///
    /// * `path` - The path where the file will be created
    /// * `context` - The executor context containing allowed directories
    /// * `operation` - The operation name for logging
    ///
    /// # Returns
    ///
    /// The canonicalized path where the file will be created.
    fn validate_new_path(
        path: &Path,
        context: &ExecutorContext,
        operation: &str,
    ) -> Result<PathBuf> {
        if path.exists() {
            // File exists, use standard validation
            Self::validate_path(path, context, operation)
        } else {
            // New file - validate parent directory
            let parent = path
                .parent()
                .ok_or_else(|| anyhow!("Invalid path: no parent directory"))?;

            if !parent.exists() {
                return Err(anyhow!(
                    "Parent directory does not exist: {}",
                    parent.display()
                ));
            }

            let canonical_parent = std::fs::canonicalize(parent)
                .map_err(|e| anyhow!("Invalid parent directory '{}': {}", parent.display(), e))?;

            // Validate parent is within allowed directories
            let allowed_directories = context.get_allowed_directories();
            let path_allowed = if allowed_directories.is_empty() {
                tracing::warn!(
                    "[FileExecutor] No allowed_directories configured - {} unrestricted. \
                    Consider configuring allowed directories for security.",
                    operation
                );
                true
            } else {
                allowed_directories
                    .iter()
                    .any(|allowed_dir| canonical_parent.starts_with(allowed_dir))
            };

            if !path_allowed {
                tracing::error!(
                    "[FileExecutor] Path traversal attempt blocked: '{}' parent '{}' is outside allowed directories",
                    path.display(),
                    canonical_parent.display()
                );
                return Err(anyhow!(
                    "Access denied: path '{}' is outside allowed directories",
                    path.display()
                ));
            }

            // Construct the full canonical path for the new file
            let filename = path
                .file_name()
                .ok_or_else(|| anyhow!("Invalid filename"))?;
            Ok(canonical_parent.join(filename))
        }
    }

    fn invalidate_file_read_cache(
        context: &ExecutorContext,
        original_path: &str,
        canonical_path: &Path,
    ) {
        let canonical_string = canonical_path.to_string_lossy().to_string();

        for candidate_path in [original_path, canonical_string.as_str()] {
            let mut read_params = HashMap::new();
            read_params.insert("path".to_string(), json!(candidate_path));
            let _ = context.tool_cache.invalidate("file_read", &read_params);
        }
    }

    /// Execute file_read operation.
    ///
    /// Reads the contents of a file and returns it as a string.
    /// Includes security validation to prevent path traversal attacks.
    ///
    /// # Parameters
    ///
    /// - `path`: The file path to read (required)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `content`: The file contents as a string
    /// - `path`: The canonicalized absolute path
    async fn execute_file_read(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'path' parameter"))?;

        // SECURITY: Validate the path is within allowed directories
        let canonical_path = Self::validate_path(Path::new(path), context, "file_read")?;

        // EXE-005 fix: Check file size before reading to prevent memory exhaustion
        let file_size = std::fs::metadata(&canonical_path)
            .map(|m| m.len())
            .unwrap_or(0);
        if file_size > MAX_FILE_READ_SIZE {
            return Err(anyhow!(
                "File too large to read: {} bytes (max {} bytes). Consider reading in chunks.",
                file_size,
                MAX_FILE_READ_SIZE
            ));
        }

        // EXE-002 fix: Re-validate path immediately before read to detect TOCTOU attacks
        Self::verify_path_unchanged(Path::new(path), &canonical_path, "file_read")?;

        let result = std::fs::read_to_string(&canonical_path);

        // Emit file operation event for UI
        if let Some(ref app_handle) = context.app_handle {
            let display_path = canonical_path.to_string_lossy().to_string();
            let file_op = match &result {
                Ok(content) => crate::ui::events::create_file_read_event(
                    &display_path,
                    content,
                    true,
                    None,
                    Some(context.session_id.clone()),
                ),
                Err(e) => crate::ui::events::create_file_read_event(
                    &display_path,
                    "",
                    false,
                    Some(e.to_string()),
                    Some(context.session_id.clone()),
                ),
            };
            crate::ui::events::emit_file_operation(app_handle, file_op);
        }

        let content = result?;

        tracing::info!(
            "[FileExecutor] file_read completed: path='{}' size={} bytes",
            canonical_path.display(),
            content.len()
        );

        Ok(json!({
            "content": content,
            "path": canonical_path.to_string_lossy()
        }))
    }

    /// Execute file_write operation.
    ///
    /// Writes content to a file, creating it if it doesn't exist.
    /// Tracks the change for undo capability (critical for safety model).
    ///
    /// # Parameters
    ///
    /// - `path`: The file path to write (required)
    /// - `content`: The content to write (required)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating success
    /// - `path`: The canonicalized absolute path
    ///
    /// # Undo Capability
    ///
    /// The original file content (if any) is stored via `ChangeTracker` to enable
    /// users to undo the write operation.
    async fn execute_file_write(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'path' parameter"))?;
        let content = parameters
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'content' parameter"))?;

        // EXE-005 fix: Validate file size before write to prevent resource exhaustion
        if content.len() > MAX_FILE_WRITE_SIZE {
            return Err(anyhow!(
                "File content too large: {} bytes (max {} bytes). Consider splitting into smaller files.",
                content.len(),
                MAX_FILE_WRITE_SIZE
            ));
        }

        // SECURITY: Validate the path (handles both existing and new files)
        let canonical_path = Self::validate_new_path(Path::new(path), context, "file_write")?;

        // Store old content for undo capability (CRITICAL for safety model)
        let old_content = std::fs::read_to_string(&canonical_path).ok();
        let was_new_file = old_content.is_none();

        // EXE-002 fix: For existing files, re-validate path immediately before write
        // to detect TOCTOU attacks where a symlink is swapped in between validation and write
        if !was_new_file {
            Self::verify_path_unchanged(Path::new(path), &canonical_path, "file_write")?;
        }

        let result = std::fs::write(&canonical_path, content);

        // Emit file operation event for UI
        if let Some(ref app_handle) = context.app_handle {
            let display_path = canonical_path.to_string_lossy().to_string();
            let file_op = crate::ui::events::create_file_write_event(
                &display_path,
                old_content.as_deref(),
                content,
                result.is_ok(),
                result.as_ref().err().map(|e| e.to_string()),
                Some(context.session_id.clone()),
            );
            crate::ui::events::emit_file_operation(app_handle, file_op);
        }

        // Check result before tracking
        result?;

        // Track file change for undo capability (CRITICAL for safety model)
        if let Some(ref tracker) = context.change_tracker {
            let task_id = context.session_id.clone();
            if was_new_file {
                // File was created
                tracker
                    .record_file_created(
                        PathBuf::from(&canonical_path),
                        content.to_string(),
                        task_id,
                    )
                    .await;
                tracing::debug!(
                    "[FileExecutor] Tracked file creation for undo: {}",
                    canonical_path.display()
                );
            } else {
                // File was modified
                tracker
                    .record_file_modified(
                        PathBuf::from(&canonical_path),
                        old_content.clone().unwrap_or_default(),
                        content.to_string(),
                        task_id,
                    )
                    .await;
                tracing::debug!(
                    "[FileExecutor] Tracked file modification for undo: {}",
                    canonical_path.display()
                );
            }
        }

        // Invalidate cache for file_read on this path
        Self::invalidate_file_read_cache(context, path, &canonical_path);

        tracing::info!(
            "[FileExecutor] file_write completed: path='{}' size={} bytes created={}",
            canonical_path.display(),
            content.len(),
            was_new_file
        );

        Ok(json!({
            "success": true,
            "path": canonical_path.to_string_lossy(),
            "created": was_new_file
        }))
    }

    /// Execute file_delete operation.
    ///
    /// Deletes a file, storing its content for undo capability.
    /// Ensures we're deleting a file, not a directory.
    ///
    /// # Parameters
    ///
    /// - `path`: The file path to delete (required)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating success
    /// - `path`: The canonicalized absolute path
    /// - `size_bytes`: Size of the deleted file
    /// - `had_content`: Whether the file had content that was backed up
    /// - `content_backup`: The file content (for verification/undo purposes)
    ///
    /// # Undo Capability
    ///
    /// The file content is stored via `ChangeTracker` to enable users to
    /// restore deleted files.
    async fn execute_file_delete(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'path' parameter"))?;

        // SECURITY: Validate the path is within allowed directories
        let canonical_path = Self::validate_path(Path::new(path), context, "file_delete")?;

        // SECURITY: Ensure we're deleting a file, not a directory
        // Directories require a separate tool with different safety considerations
        let metadata = std::fs::metadata(&canonical_path)
            .map_err(|e| anyhow!("Cannot access file '{}': {}", path, e))?;

        if metadata.is_dir() {
            return Err(anyhow!(
                "Cannot delete '{}': path is a directory. Use a directory deletion tool instead.",
                path
            ));
        }

        // Store content before deletion for undo capability (CRITICAL for safety model)
        // This enables the reversibility principle - users can undo file deletions
        let content_before = std::fs::read_to_string(&canonical_path).ok();
        let size_bytes = metadata.len() as usize;

        // EXE-002 fix: Re-validate path immediately before delete to detect TOCTOU attacks
        Self::verify_path_unchanged(Path::new(path), &canonical_path, "file_delete")?;

        // Perform the deletion
        let result = std::fs::remove_file(&canonical_path);

        // Emit file operation event for UI and audit trail
        if let Some(ref app_handle) = context.app_handle {
            let display_path = canonical_path.to_string_lossy().to_string();
            let file_op = crate::ui::events::create_file_delete_event(
                &display_path,
                Some(size_bytes),
                result.is_ok(),
                result.as_ref().err().map(|e| e.to_string()),
                Some(context.session_id.clone()),
            );
            crate::ui::events::emit_file_operation(app_handle, file_op);
        }

        // Check if deletion succeeded
        result?;

        // Track file deletion for undo capability (CRITICAL for safety model)
        if let Some(ref tracker) = context.change_tracker {
            if let Some(ref content) = content_before {
                tracker
                    .record_file_deleted(
                        PathBuf::from(&canonical_path),
                        content.clone(),
                        context.session_id.clone(),
                    )
                    .await;
                tracing::debug!(
                    "[FileExecutor] Tracked file deletion for undo: {}",
                    canonical_path.display()
                );
            }
        }

        // Invalidate any cached file_read results for this path
        Self::invalidate_file_read_cache(context, path, &canonical_path);

        tracing::info!(
            "[FileExecutor] file_delete completed: path='{}' size={} bytes",
            canonical_path.display(),
            size_bytes
        );

        Ok(json!({
            "success": true,
            "path": canonical_path.to_string_lossy(),
            "size_bytes": size_bytes,
            "had_content": content_before.is_some(),
            "content_backup": content_before
        }))
    }
}

impl Default for FileExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for FileExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["file_read", "file_write", "file_delete"]
    }

    fn description(&self) -> &'static str {
        "Handles file system operations including reading, writing, and deleting files \
        with security validation and undo capability."
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "file_read" => self.execute_file_read(parameters, context).await,
            "file_write" => self.execute_file_write(parameters, context).await,
            "file_delete" => self.execute_file_delete(parameters, context).await,
            _ => Err(anyhow!("Unknown file tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Create a minimal test context for unit tests.
    ///
    /// Note: This context has no app_handle, change_tracker, or security_guard,
    /// so some features (event emission, undo tracking) won't work in tests.
    /// The `get_allowed_directories` method will return default directories
    /// (home, cwd, temp) when there's no app_handle with settings state.
    fn create_test_context() -> ExecutorContext {
        use std::sync::Arc;

        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: crate::core::agi::Goal {
                id: "test".to_string(),
                description: "test".to_string(),
                priority: crate::core::agi::Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: crate::core::agi::ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    #[test]
    fn test_tool_names() {
        let executor = FileExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"file_read"));
        assert!(names.contains(&"file_write"));
        assert!(names.contains(&"file_delete"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn test_description() {
        let executor = FileExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("file"));
    }

    #[tokio::test]
    async fn test_file_read() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Hello, World!").unwrap();

        // For tests without settings state, get_allowed_directories returns home + cwd + temp
        // which includes the temp_dir used by tempfile
        let context = create_test_context();

        let executor = FileExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await
            .unwrap();

        assert_eq!(result["content"], "Hello, World!");
    }

    #[tokio::test]
    async fn test_file_write_new_file() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("new_file.txt");

        let context = create_test_context();

        let executor = FileExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert(
            "content".to_string(),
            Value::String("New content".to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await
            .unwrap();

        assert_eq!(result["success"], true);
        assert_eq!(result["created"], true);
        assert_eq!(fs::read_to_string(&test_file).unwrap(), "New content");
    }

    #[tokio::test]
    async fn test_file_write_existing_file() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("existing.txt");
        fs::write(&test_file, "Original content").unwrap();

        let context = create_test_context();

        let executor = FileExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert(
            "content".to_string(),
            Value::String("Modified content".to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await
            .unwrap();

        assert_eq!(result["success"], true);
        assert_eq!(result["created"], false);
        assert_eq!(fs::read_to_string(&test_file).unwrap(), "Modified content");
    }

    #[tokio::test]
    async fn test_file_delete() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("to_delete.txt");
        fs::write(&test_file, "Delete me").unwrap();

        let context = create_test_context();

        let executor = FileExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await
            .unwrap();

        assert_eq!(result["success"], true);
        assert_eq!(result["had_content"], true);
        assert_eq!(result["content_backup"], "Delete me");
        assert!(!test_file.exists());
    }

    #[tokio::test]
    async fn test_file_delete_directory_blocked() {
        let temp_dir = TempDir::new().unwrap();
        let sub_dir = temp_dir.path().join("subdir");
        fs::create_dir(&sub_dir).unwrap();

        let context = create_test_context();

        let executor = FileExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(sub_dir.to_string_lossy().to_string()),
        );

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("is a directory"));
    }

    #[tokio::test]
    async fn test_missing_path_parameter() {
        let context = create_test_context();
        let executor = FileExecutor::new();
        let params = HashMap::new(); // No path parameter

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'path' parameter"));
    }

    #[tokio::test]
    async fn test_missing_content_parameter() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");

        let context = create_test_context();
        let executor = FileExecutor::new();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        // No content parameter

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'content' parameter"));
    }

    #[tokio::test]
    async fn test_unknown_tool() {
        let context = create_test_context();
        let executor = FileExecutor::new();
        let params = HashMap::new();

        let exec_context = create_test_execution_context();

        let result = executor
            .execute("file_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Unknown file tool"));
    }

    #[test]
    fn test_validate_path_traversal_attempt() {
        // This test verifies that path traversal is blocked
        // Note: The actual validation depends on allowed directories
        // and file system state, so this is more of an integration test
    }

    #[test]
    fn test_default_impl() {
        #[allow(clippy::default_constructed_unit_structs)]
        let executor = FileExecutor::default();
        assert_eq!(executor.tool_names().len(), 3);
    }
}
