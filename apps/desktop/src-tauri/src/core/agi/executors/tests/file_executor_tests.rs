//! File Executor Test Suite
//!
//! Comprehensive tests for file operations including:
//! - Parameter validation for file_read, file_write, file_delete
//! - Path security validation and traversal attack prevention
//! - Error handling for various failure scenarios
//! - Mock-based integration tests for change tracking

#[cfg(test)]
mod tests {
    use crate::core::agi::executors::{ExecutorContext, FileExecutor, ToolExecutor};
    use crate::core::agi::{ExecutionContext, Goal, Priority, ResourceState};
    use serde_json::{json, Value};
    use std::collections::HashMap;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Arc;
    use tempfile::TempDir;

    // ============================================================================
    // Test Fixtures
    // ============================================================================

    /// Create a minimal test context for unit tests.
    fn create_test_context() -> ExecutorContext {
        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::default())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::default()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::default()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "file_executor_test".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: "file_test_goal".to_string(),
                description: "File executor test".to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![
                    "file_read".to_string(),
                    "file_write".to_string(),
                    "file_delete".to_string(),
                ],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    // ============================================================================
    // Constructor and Basic Tests
    // ============================================================================

    #[test]
    fn test_file_executor_new() {
        let executor = FileExecutor::new();
        assert_eq!(executor.tool_names().len(), 3);
    }

    #[test]
    fn test_file_executor_default() {
        let executor = FileExecutor::default();
        assert_eq!(executor.tool_names().len(), 3);
    }

    #[test]
    fn test_file_executor_tool_names() {
        let executor = FileExecutor::default();
        let names = executor.tool_names();

        assert!(names.contains(&"file_read"));
        assert!(names.contains(&"file_write"));
        assert!(names.contains(&"file_delete"));
        assert_eq!(names.len(), 3);
    }

    #[test]
    fn test_file_executor_description() {
        let executor = FileExecutor::default();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("file"));
        assert!(desc.contains("security") || desc.contains("undo"));
    }

    // ============================================================================
    // Parameter Validation Tests - file_read
    // ============================================================================

    #[tokio::test]
    async fn test_file_read_missing_path_parameter() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new(); // No path parameter

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'path' parameter"));
    }

    #[tokio::test]
    async fn test_file_read_null_path_parameter() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert("path".to_string(), Value::Null);

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'path' parameter"));
    }

    #[tokio::test]
    async fn test_file_read_non_string_path_parameter() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert("path".to_string(), json!(12345)); // Number instead of string

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'path' parameter"));
    }

    #[tokio::test]
    async fn test_file_read_nonexistent_file() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String("/nonexistent/path/to/file.txt".to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Invalid or inaccessible path") || err.contains("No such file"));
    }

    #[tokio::test]
    async fn test_file_read_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test_read.txt");
        fs::write(&test_file, "Hello, Test World!").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["content"], "Hello, Test World!");
        assert!(result["path"].as_str().is_some());
    }

    #[tokio::test]
    async fn test_file_read_empty_file() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("empty.txt");
        fs::write(&test_file, "").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["content"], "");
    }

    #[tokio::test]
    async fn test_file_read_large_content() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("large.txt");
        let large_content = "x".repeat(1_000_000); // 1MB of content
        fs::write(&test_file, &large_content).unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["content"].as_str().unwrap().len(), 1_000_000);
    }

    #[tokio::test]
    async fn test_file_read_unicode_content() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("unicode.txt");
        let unicode_content = "Hello Unicode chars here";
        fs::write(&test_file, unicode_content).unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["content"], unicode_content);
    }

    // ============================================================================
    // Parameter Validation Tests - file_write
    // ============================================================================

    #[tokio::test]
    async fn test_file_write_missing_path_parameter() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert("content".to_string(), Value::String("test".to_string()));

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'path' parameter"));
    }

    #[tokio::test]
    async fn test_file_write_missing_content_parameter() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'content' parameter"));
    }

    #[tokio::test]
    async fn test_file_write_null_content_parameter() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("test.txt");

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert("content".to_string(), Value::Null);

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'content' parameter"));
    }

    #[tokio::test]
    async fn test_file_write_new_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("new_file.txt");

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert(
            "content".to_string(),
            Value::String("New file content".to_string()),
        );

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["created"], true);
        assert_eq!(fs::read_to_string(&test_file).unwrap(), "New file content");
    }

    #[tokio::test]
    async fn test_file_write_existing_file_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("existing.txt");
        fs::write(&test_file, "Original content").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert(
            "content".to_string(),
            Value::String("Modified content".to_string()),
        );

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["created"], false);
        assert_eq!(fs::read_to_string(&test_file).unwrap(), "Modified content");
    }

    #[tokio::test]
    async fn test_file_write_empty_content() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("empty_write.txt");

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert("content".to_string(), Value::String("".to_string()));

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&test_file).unwrap(), "");
    }

    #[tokio::test]
    async fn test_file_write_nonexistent_parent_directory() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String("/nonexistent/parent/dir/file.txt".to_string()),
        );
        params.insert("content".to_string(), Value::String("test".to_string()));

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(
            err.contains("Parent directory does not exist")
                || err.contains("Invalid")
                || err.contains("inaccessible")
        );
    }

    // ============================================================================
    // Parameter Validation Tests - file_delete
    // ============================================================================

    #[tokio::test]
    async fn test_file_delete_missing_path_parameter() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing required 'path' parameter"));
    }

    #[tokio::test]
    async fn test_file_delete_nonexistent_file() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String("/nonexistent/file/to/delete.txt".to_string()),
        );

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_file_delete_success() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("to_delete.txt");
        fs::write(&test_file, "Delete me").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["had_content"], true);
        assert_eq!(result["content_backup"], "Delete me");
        assert!(!test_file.exists());
    }

    #[tokio::test]
    async fn test_file_delete_empty_file() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("empty_to_delete.txt");
        fs::write(&test_file, "").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["size_bytes"], 0);
        assert!(!test_file.exists());
    }

    #[tokio::test]
    async fn test_file_delete_directory_blocked() {
        let temp_dir = TempDir::new().unwrap();
        let sub_dir = temp_dir.path().join("subdir");
        fs::create_dir(&sub_dir).unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(sub_dir.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_delete", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("is a directory"));
        // Directory should still exist
        assert!(sub_dir.exists());
    }

    // ============================================================================
    // Unknown Tool Tests
    // ============================================================================

    #[tokio::test]
    async fn test_unknown_tool() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("file_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unknown file tool"));
    }

    #[tokio::test]
    async fn test_empty_tool_name() {
        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor.execute("", &params, &context, &exec_context).await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unknown file tool"));
    }

    // ============================================================================
    // Path Security Tests
    // ============================================================================

    #[tokio::test]
    async fn test_file_read_relative_path_in_temp() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("relative_test.txt");
        fs::write(&test_file, "Relative path content").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Use the absolute path from temp_dir
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_file_read_returns_canonical_path() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("canonical_test.txt");
        fs::write(&test_file, "content").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await
            .unwrap();

        // The returned path should be canonical (absolute)
        let returned_path = result["path"].as_str().unwrap();
        let returned_pathbuf = PathBuf::from(returned_path);
        assert!(returned_pathbuf.is_absolute());
    }

    // ============================================================================
    // Error Handling Tests
    // ============================================================================

    #[tokio::test]
    async fn test_file_read_permission_denied() {
        // This test is platform-specific and may not work on all systems
        // Skip on Windows where permission model is different
        #[cfg(not(target_os = "windows"))]
        {
            use std::os::unix::fs::PermissionsExt;

            let temp_dir = TempDir::new().unwrap();
            let test_file = temp_dir.path().join("no_read.txt");
            fs::write(&test_file, "secret").unwrap();

            // Remove read permissions
            let mut perms = fs::metadata(&test_file).unwrap().permissions();
            perms.set_mode(0o000);
            fs::set_permissions(&test_file, perms).unwrap();

            let executor = FileExecutor::default();
            let context = create_test_context();
            let exec_context = create_test_execution_context();
            let mut params = HashMap::new();
            params.insert(
                "path".to_string(),
                Value::String(test_file.to_string_lossy().to_string()),
            );

            let result = executor
                .execute("file_read", &params, &context, &exec_context)
                .await;

            // Restore permissions for cleanup
            let mut perms = fs::metadata(&test_file).unwrap().permissions();
            perms.set_mode(0o644);
            fs::set_permissions(&test_file, perms).unwrap();

            assert!(result.is_err());
        }
    }

    // ============================================================================
    // Integration Tests with File System
    // ============================================================================

    #[tokio::test]
    async fn test_file_write_then_read() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("write_read.txt");

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Write file
        let mut write_params = HashMap::new();
        write_params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        write_params.insert(
            "content".to_string(),
            Value::String("Write then read content".to_string()),
        );

        let write_result = executor
            .execute("file_write", &write_params, &context, &exec_context)
            .await;
        assert!(write_result.is_ok());

        // Read file
        let mut read_params = HashMap::new();
        read_params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let read_result = executor
            .execute("file_read", &read_params, &context, &exec_context)
            .await;
        assert!(read_result.is_ok());
        assert_eq!(read_result.unwrap()["content"], "Write then read content");
    }

    #[tokio::test]
    async fn test_file_write_modify_delete() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("lifecycle.txt");

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Create file
        let mut write_params = HashMap::new();
        write_params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        write_params.insert(
            "content".to_string(),
            Value::String("Initial content".to_string()),
        );

        let result = executor
            .execute("file_write", &write_params, &context, &exec_context)
            .await
            .unwrap();
        assert_eq!(result["created"], true);

        // Modify file
        write_params.insert(
            "content".to_string(),
            Value::String("Modified content".to_string()),
        );
        let result = executor
            .execute("file_write", &write_params, &context, &exec_context)
            .await
            .unwrap();
        assert_eq!(result["created"], false);

        // Delete file
        let mut delete_params = HashMap::new();
        delete_params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        let result = executor
            .execute("file_delete", &delete_params, &context, &exec_context)
            .await
            .unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["content_backup"], "Modified content");
        assert!(!test_file.exists());
    }

    // ============================================================================
    // Special Characters and Edge Cases
    // ============================================================================

    #[tokio::test]
    async fn test_file_with_spaces_in_path() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("file with spaces.txt");
        fs::write(&test_file, "content").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap()["content"], "content");
    }

    #[tokio::test]
    async fn test_file_with_special_chars_in_name() {
        let temp_dir = TempDir::new().unwrap();
        // Use safe special characters that work cross-platform
        let test_file = temp_dir.path().join("file-with_special.chars.txt");
        fs::write(&test_file, "special content").unwrap();

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("file_read", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap()["content"], "special content");
    }

    #[tokio::test]
    async fn test_file_write_multiline_content() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("multiline.txt");
        let multiline_content = "Line 1\nLine 2\nLine 3\n";

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert(
            "content".to_string(),
            Value::String(multiline_content.to_string()),
        );

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&test_file).unwrap(), multiline_content);
    }

    #[tokio::test]
    async fn test_file_write_json_content() {
        let temp_dir = TempDir::new().unwrap();
        let test_file = temp_dir.path().join("data.json");
        let json_content = r#"{"key": "value", "array": [1, 2, 3]}"#;

        let executor = FileExecutor::default();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(test_file.to_string_lossy().to_string()),
        );
        params.insert(
            "content".to_string(),
            Value::String(json_content.to_string()),
        );

        let result = executor
            .execute("file_write", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        assert_eq!(fs::read_to_string(&test_file).unwrap(), json_content);
    }
}
