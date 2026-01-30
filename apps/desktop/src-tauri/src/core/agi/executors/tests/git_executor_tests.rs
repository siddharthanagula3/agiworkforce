//! Git Executor Test Suite
//!
//! Comprehensive tests for git operations including:
//! - Parameter validation for all git tools
//! - Repository initialization and status
//! - Staging and committing changes
//! - Path security validation
//! - Error handling for various failure scenarios

#[cfg(test)]
mod tests {
    use crate::core::agi::executors::{ExecutorContext, GitExecutor, ToolExecutor};
    use crate::core::agi::{ExecutionContext, Goal, Priority, ResourceState};
    use serde_json::Value;
    use std::collections::HashMap;
    use std::fs;
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
            router: Arc::new(tokio::sync::RwLock::new(crate::core::llm::LLMRouter::new())),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "git_test_session".to_string(),
            tool_id: "git_executor_test".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: "git_test_goal".to_string(),
                description: "Git executor test".to_string(),
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
                    "git_status".to_string(),
                    "git_init".to_string(),
                    "git_add".to_string(),
                    "git_commit".to_string(),
                    "git_push".to_string(),
                    "git_clone".to_string(),
                ],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    /// Create a temporary git repository for testing.
    fn create_temp_repo() -> (TempDir, std::path::PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("test_repo");
        (temp_dir, repo_path)
    }

    // ============================================================================
    // Constructor and Basic Tests
    // ============================================================================

    #[test]
    fn test_git_executor_new() {
        let executor = GitExecutor::new();
        assert_eq!(executor.tool_names().len(), 6);
    }

    #[test]
    fn test_git_executor_default() {
        let executor = GitExecutor::default();
        assert_eq!(executor.tool_names().len(), 6);
    }

    #[test]
    fn test_git_executor_tool_names() {
        let executor = GitExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"git_status"));
        assert!(names.contains(&"git_init"));
        assert!(names.contains(&"git_add"));
        assert!(names.contains(&"git_commit"));
        assert!(names.contains(&"git_push"));
        assert!(names.contains(&"git_clone"));
        assert_eq!(names.len(), 6);
    }

    #[test]
    fn test_git_executor_description() {
        let executor = GitExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("Git") || desc.contains("git"));
    }

    // ============================================================================
    // Parameter Validation Tests - git_status
    // ============================================================================

    #[tokio::test]
    async fn test_git_status_missing_path_parameter() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("git_status", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'path' parameter"));
    }

    #[tokio::test]
    async fn test_git_status_nonexistent_path() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String("/nonexistent/git/repo".to_string()),
        );

        let result = executor
            .execute("git_status", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_git_status_non_repo_directory() {
        let temp_dir = TempDir::new().unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(temp_dir.path().to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_status", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Failed to open git repository"));
    }

    // ============================================================================
    // Parameter Validation Tests - git_init
    // ============================================================================

    #[tokio::test]
    async fn test_git_init_missing_path_parameter() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("git_init", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'path' parameter"));
    }

    #[tokio::test]
    async fn test_git_init_success() {
        let (_temp_dir, repo_path) = create_temp_repo();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_init", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["message"].as_str().unwrap().contains("Initialized"));
        assert!(repo_path.join(".git").exists());
    }

    #[tokio::test]
    async fn test_git_init_already_exists() {
        let (_temp_dir, repo_path) = create_temp_repo();
        fs::create_dir_all(&repo_path).unwrap();

        // Initialize first time
        git2::Repository::init(&repo_path).unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        // Initialize second time - should succeed (reinit is allowed)
        let result = executor
            .execute("git_init", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
    }

    // ============================================================================
    // Parameter Validation Tests - git_add
    // ============================================================================

    #[tokio::test]
    async fn test_git_add_missing_path_parameter() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String("file.txt".to_string())]),
        );

        let result = executor
            .execute("git_add", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'path' parameter"));
    }

    #[tokio::test]
    async fn test_git_add_missing_files_parameter() {
        let (_temp_dir, repo_path) = create_temp_repo();

        // Initialize repo first
        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_add", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'files' parameter"));
    }

    #[tokio::test]
    async fn test_git_add_empty_files_array() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        params.insert("files".to_string(), Value::Array(vec![]));

        let result = executor
            .execute("git_add", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("No valid file paths"));
    }

    #[tokio::test]
    async fn test_git_add_specific_file() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        // Create a file to add
        let test_file = repo_path.join("test_file.txt");
        fs::write(&test_file, "test content").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String("test_file.txt".to_string())]),
        );

        let result = executor
            .execute("git_add", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert_eq!(result["files_count"], 1);
    }

    #[tokio::test]
    async fn test_git_add_all_files() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        // Create multiple files
        fs::write(repo_path.join("file1.txt"), "content 1").unwrap();
        fs::write(repo_path.join("file2.txt"), "content 2").unwrap();
        fs::write(repo_path.join("file3.txt"), "content 3").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );

        let result = executor
            .execute("git_add", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["files_count"].as_i64().unwrap() >= 3);
    }

    #[tokio::test]
    async fn test_git_add_wildcard() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        fs::write(repo_path.join("file1.txt"), "content 1").unwrap();
        fs::write(repo_path.join("file2.txt"), "content 2").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String("*".to_string())]),
        );

        let result = executor
            .execute("git_add", &params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
    }

    // ============================================================================
    // Parameter Validation Tests - git_commit
    // ============================================================================

    #[tokio::test]
    async fn test_git_commit_missing_path_parameter() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "message".to_string(),
            Value::String("Test commit".to_string()),
        );

        let result = executor
            .execute("git_commit", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'path' parameter"));
    }

    #[tokio::test]
    async fn test_git_commit_missing_message_parameter() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_commit", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'message' parameter"));
    }

    #[tokio::test]
    async fn test_git_commit_success() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        // Create and stage a file
        fs::write(repo_path.join("committed_file.txt"), "commit content").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Add file first
        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );
        executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await
            .unwrap();

        // Now commit
        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Test commit message".to_string()),
        );

        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], true);
        assert!(result["commit_hash"].as_str().is_some());
        assert!(result["commit_hash_short"].as_str().is_some());
        assert_eq!(result["message"], "Test commit message");
    }

    #[tokio::test]
    async fn test_git_commit_no_staged_changes() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        // Create, stage, and commit a file first
        fs::write(repo_path.join("initial.txt"), "initial").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );
        executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await
            .unwrap();

        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Initial commit".to_string()),
        );
        executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await
            .unwrap();

        // Try to commit again without any changes
        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert_eq!(result["success"], false);
        assert!(result["message"]
            .as_str()
            .unwrap()
            .contains("Nothing to commit"));
    }

    // ============================================================================
    // Parameter Validation Tests - git_push
    // ============================================================================

    #[tokio::test]
    async fn test_git_push_missing_path_parameter() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("git_push", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'path' parameter"));
    }

    #[tokio::test]
    async fn test_git_push_default_remote() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        let _repo = git2::Repository::init(&repo_path).unwrap();

        // Create a commit
        fs::write(repo_path.join("file.txt"), "content").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );
        executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await
            .unwrap();

        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert("message".to_string(), Value::String("Initial".to_string()));
        executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await
            .unwrap();

        // Try to push without a remote - should fail since no remote is configured
        let mut push_params = HashMap::new();
        push_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_push", &push_params, &context, &exec_context)
            .await;

        // Should fail because no remote is configured
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("remote") || err.contains("origin"));
    }

    // ============================================================================
    // Parameter Validation Tests - git_clone
    // ============================================================================

    #[tokio::test]
    async fn test_git_clone_missing_url_parameter() {
        let temp_dir = TempDir::new().unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "destination".to_string(),
            Value::String(temp_dir.path().join("clone").to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_clone", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'url' parameter"));
    }

    #[tokio::test]
    async fn test_git_clone_missing_destination_parameter() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "url".to_string(),
            Value::String("https://github.com/example/repo.git".to_string()),
        );

        let result = executor
            .execute("git_clone", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Missing 'destination' parameter"));
    }

    #[tokio::test]
    async fn test_git_clone_invalid_url() {
        let temp_dir = TempDir::new().unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "url".to_string(),
            Value::String("not a valid url".to_string()),
        );
        params.insert(
            "destination".to_string(),
            Value::String(temp_dir.path().join("clone").to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_clone", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Invalid repository URL"));
    }

    #[tokio::test]
    async fn test_git_clone_destination_not_empty() {
        let temp_dir = TempDir::new().unwrap();
        let dest = temp_dir.path().join("clone_dest");
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("existing_file.txt"), "existing").unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "url".to_string(),
            Value::String("https://github.com/example/repo.git".to_string()),
        );
        params.insert(
            "destination".to_string(),
            Value::String(dest.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_clone", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not empty"));
    }

    #[tokio::test]
    async fn test_git_clone_parent_not_exists() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "url".to_string(),
            Value::String("https://github.com/example/repo.git".to_string()),
        );
        params.insert(
            "destination".to_string(),
            Value::String("/nonexistent/parent/directory/clone".to_string()),
        );

        let result = executor
            .execute("git_clone", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Parent directory does not exist"));
    }

    // ============================================================================
    // Unknown Tool Tests
    // ============================================================================

    #[tokio::test]
    async fn test_unknown_git_tool() {
        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let params = HashMap::new();

        let result = executor
            .execute("git_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("Unknown git tool"));
    }

    // ============================================================================
    // Integration Tests - Full Workflow
    // ============================================================================

    #[tokio::test]
    async fn test_git_full_workflow_init_add_commit() {
        let (_temp_dir, repo_path) = create_temp_repo();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Step 1: Initialize repository
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap()["success"], true);

        // Step 2: Create files
        fs::write(repo_path.join("README.md"), "# Test Repo").unwrap();
        fs::write(repo_path.join("main.rs"), "fn main() {}").unwrap();

        // Step 3: Check status (should show untracked files)
        let mut status_params = HashMap::new();
        status_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_status", &status_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status["clean"], false);
        assert!(status["untracked"].as_array().map(|a| a.len()).unwrap_or(0) >= 2);

        // Step 4: Add all files
        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );

        let result = executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap()["success"], true);

        // Step 5: Check status again (should show staged files)
        let result = executor
            .execute("git_status", &status_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(status["staged"].as_array().map(|a| a.len()).unwrap_or(0) >= 2);

        // Step 6: Commit
        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert(
            "message".to_string(),
            Value::String("Initial commit with README and main.rs".to_string()),
        );

        let result = executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        let commit_result = result.unwrap();
        assert_eq!(commit_result["success"], true);
        assert!(commit_result["commit_hash"].as_str().is_some());

        // Step 7: Verify clean status
        let result = executor
            .execute("git_status", &status_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status["clean"], true);
    }

    #[tokio::test]
    async fn test_git_status_shows_modified_files() {
        let (_temp_dir, repo_path) = create_temp_repo();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        // Initialize and create initial commit
        let mut init_params = HashMap::new();
        init_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        executor
            .execute("git_init", &init_params, &context, &exec_context)
            .await
            .unwrap();

        fs::write(repo_path.join("file.txt"), "original").unwrap();

        let mut add_params = HashMap::new();
        add_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        add_params.insert(
            "files".to_string(),
            Value::Array(vec![Value::String(".".to_string())]),
        );
        executor
            .execute("git_add", &add_params, &context, &exec_context)
            .await
            .unwrap();

        let mut commit_params = HashMap::new();
        commit_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );
        commit_params.insert("message".to_string(), Value::String("Initial".to_string()));
        executor
            .execute("git_commit", &commit_params, &context, &exec_context)
            .await
            .unwrap();

        // Modify the file
        fs::write(repo_path.join("file.txt"), "modified").unwrap();

        // Check status - should show modified file
        let mut status_params = HashMap::new();
        status_params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_status", &status_params, &context, &exec_context)
            .await;
        assert!(result.is_ok());
        let status = result.unwrap();
        assert_eq!(status["clean"], false);
        let modified = status["modified"].as_array().unwrap();
        assert!(!modified.is_empty());
        assert!(modified
            .iter()
            .any(|v| v.as_str().unwrap().contains("file.txt")));
    }

    // ============================================================================
    // Path Validation Tests
    // ============================================================================

    #[tokio::test]
    async fn test_git_status_returns_canonical_path() {
        let (_temp_dir, repo_path) = create_temp_repo();

        fs::create_dir_all(&repo_path).unwrap();
        git2::Repository::init(&repo_path).unwrap();

        let executor = GitExecutor::new();
        let context = create_test_context();
        let exec_context = create_test_execution_context();
        let mut params = HashMap::new();
        params.insert(
            "path".to_string(),
            Value::String(repo_path.to_string_lossy().to_string()),
        );

        let result = executor
            .execute("git_status", &params, &context, &exec_context)
            .await
            .unwrap();

        let returned_path = result["path"].as_str().unwrap();
        let path_buf = std::path::PathBuf::from(returned_path);
        assert!(path_buf.is_absolute());
    }

    #[test]
    fn test_validate_path_with_valid_temp_directory() {
        let temp_dir = TempDir::new().unwrap();
        let context = create_test_context();

        let result = GitExecutor::validate_path(temp_dir.path(), &context, "test_operation");
        assert!(result.is_ok());
    }
}
