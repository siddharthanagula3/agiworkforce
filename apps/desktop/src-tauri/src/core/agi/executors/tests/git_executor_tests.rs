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
        let executor = GitExecutor::new();
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

    // ============================================================================
    // PR Creation Workflow Tests
    // ============================================================================

    use crate::core::agi::executors::{BranchDiffSummary, PrCreationConfig, PrCreationWorkflow};

    /// Create a test repo with commits on a feature branch.
    fn create_repo_with_branches() -> (TempDir, std::path::PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().join("pr_test_repo");
        fs::create_dir_all(&repo_path).unwrap();

        // Initialize repo
        let repo = git2::Repository::init(&repo_path).unwrap();

        // Create initial commit on main
        fs::write(repo_path.join("README.md"), "# Test Repo").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(std::path::Path::new("README.md")).unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let sig = git2::Signature::now("Test User", "test@example.com").unwrap();

        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();

        // Ensure we have a branch named 'main'
        let head = repo.head().unwrap();
        let commit = head.peel_to_commit().unwrap();
        // If HEAD is not main, create main. Use force=true to handle if it exists or if we are renaming.
        // Actually, easiest is just to create a branch pointer 'main' to the current commit.
        if repo.find_branch("main", git2::BranchType::Local).is_err() {
            repo.branch("main", &commit, false).unwrap();
        }

        // Create feature branch
        let head = repo.head().unwrap();
        let head_commit = head.peel_to_commit().unwrap();
        repo.branch("feature/test-pr", &head_commit, false).unwrap();

        // Checkout feature branch
        let feature_ref = "refs/heads/feature/test-pr";
        repo.set_head(feature_ref).unwrap();
        repo.checkout_head(Some(git2::build::CheckoutBuilder::default().force()))
            .unwrap();

        // Make commits on feature branch
        fs::write(repo_path.join("new_file.txt"), "New feature file").unwrap();
        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new("new_file.txt"))
            .unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();

        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "feat: add new feature file",
            &tree,
            &[&parent],
        )
        .unwrap();

        // Add another commit
        fs::write(repo_path.join("another_file.txt"), "Another change").unwrap();
        let mut index = repo.index().unwrap();
        index
            .add_path(std::path::Path::new("another_file.txt"))
            .unwrap();
        index.write().unwrap();

        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parent = repo.head().unwrap().peel_to_commit().unwrap();

        repo.commit(
            Some("HEAD"),
            &sig,
            &sig,
            "fix: add another file",
            &tree,
            &[&parent],
        )
        .unwrap();

        (temp_dir, repo_path)
    }

    #[test]
    fn test_get_branch_diff_summary_success() {
        let (_temp_dir, repo_path) = create_repo_with_branches();

        let result =
            PrCreationWorkflow::get_branch_diff_summary(&repo_path, "main", "feature/test-pr");

        assert!(result.is_ok());
        let summary = result.unwrap();

        assert_eq!(summary.base_branch, "main");
        assert_eq!(summary.head_branch, "feature/test-pr");
        assert_eq!(summary.commits_ahead, 2); // Two commits on feature branch
        assert!(!summary.commits.is_empty());
        assert!(!summary.files_changed.is_empty());
        assert!(summary.total_additions > 0);
    }

    #[test]
    fn test_get_branch_diff_summary_commit_details() {
        let (_temp_dir, repo_path) = create_repo_with_branches();

        let summary =
            PrCreationWorkflow::get_branch_diff_summary(&repo_path, "main", "feature/test-pr")
                .unwrap();

        // Check commit summaries
        let commit_messages: Vec<&str> =
            summary.commits.iter().map(|c| c.message.as_str()).collect();

        assert!(commit_messages.iter().any(|m| m.contains("feat:")));
        assert!(commit_messages.iter().any(|m| m.contains("fix:")));

        // Check each commit has required fields
        for commit in &summary.commits {
            assert!(!commit.hash_short.is_empty());
            assert!(!commit.hash_full.is_empty());
            assert_eq!(commit.hash_short.len(), 7);
            assert!(commit.timestamp > 0);
        }
    }

    #[test]
    fn test_get_branch_diff_summary_file_stats() {
        let (_temp_dir, repo_path) = create_repo_with_branches();

        let summary =
            PrCreationWorkflow::get_branch_diff_summary(&repo_path, "main", "feature/test-pr")
                .unwrap();

        // Should have two new files
        assert!(summary.files_changed.len() >= 2);

        // Check file status
        let added_files: Vec<_> = summary
            .files_changed
            .iter()
            .filter(|f| f.status == "added")
            .collect();
        assert!(added_files.len() >= 2);
    }

    #[test]
    fn test_get_branch_diff_summary_base_branch_not_found() {
        let (_temp_dir, repo_path) = create_repo_with_branches();

        let result = PrCreationWorkflow::get_branch_diff_summary(
            &repo_path,
            "nonexistent-branch",
            "feature/test-pr",
        );

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not found") || err.contains("Base branch"));
    }

    #[test]
    fn test_get_branch_diff_summary_head_branch_not_found() {
        let (_temp_dir, repo_path) = create_repo_with_branches();

        let result =
            PrCreationWorkflow::get_branch_diff_summary(&repo_path, "main", "nonexistent-feature");

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not found") || err.contains("Head branch"));
    }

    #[test]
    fn test_pr_creation_config_default() {
        let config = PrCreationConfig::default();

        assert_eq!(config.base_branch, "main");
        assert!(config.head_branch.is_empty());
        assert!(config.auto_generate_title);
        assert!(config.auto_generate_description);
        assert!(config.include_diff_summary);
        assert!(!config.draft);
        assert!(config.labels.is_empty());
        assert!(config.reviewers.is_empty());
    }

    #[test]
    fn test_pr_creation_config_serialization() {
        let config = PrCreationConfig {
            base_branch: "develop".to_string(),
            head_branch: "feature/test".to_string(),
            auto_generate_title: false,
            auto_generate_description: true,
            include_diff_summary: true,
            custom_title: Some("My PR title".to_string()),
            custom_description: None,
            draft: true,
            labels: vec!["bug".to_string(), "enhancement".to_string()],
            reviewers: vec!["user1".to_string()],
        };

        let json = serde_json::to_string(&config).unwrap();
        let deserialized: PrCreationConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.base_branch, "develop");
        assert_eq!(deserialized.head_branch, "feature/test");
        assert!(!deserialized.auto_generate_title);
        assert!(deserialized.draft);
        assert_eq!(deserialized.labels.len(), 2);
    }

    #[test]
    fn test_branch_diff_summary_serialization() {
        use crate::core::agi::executors::{CommitSummary, FileDiffStat};

        let summary = BranchDiffSummary {
            base_branch: "main".to_string(),
            head_branch: "feature/test".to_string(),
            commits_ahead: 2,
            commits: vec![CommitSummary {
                hash_short: "abc1234".to_string(),
                hash_full: "abc12345678901234567890".to_string(),
                message: "test commit".to_string(),
                message_full: "test commit\n\nFull description".to_string(),
                author: "Test User".to_string(),
                email: "test@example.com".to_string(),
                timestamp: 1234567890,
            }],
            files_changed: vec![FileDiffStat {
                path: "test.txt".to_string(),
                additions: 10,
                deletions: 5,
                status: "modified".to_string(),
                old_path: None,
            }],
            total_additions: 10,
            total_deletions: 5,
            diff_content: "+new line\n-old line".to_string(),
        };

        let json = serde_json::to_string(&summary).unwrap();
        let deserialized: BranchDiffSummary = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.commits_ahead, 2);
        assert_eq!(deserialized.commits.len(), 1);
        assert_eq!(deserialized.files_changed.len(), 1);
        assert_eq!(deserialized.total_additions, 10);
    }
}
