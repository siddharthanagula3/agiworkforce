use super::*;
use crate::core::agi::tools::{ParameterType, ToolCapability, ToolParameter};
use crate::core::agi::ResourceUsage;
use base64::Engine as _;
use std::sync::Arc;

fn create_registry_with_file_list() -> Arc<ToolRegistry> {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_tool(crate::core::agi::tools::Tool {
            id: "file_list".to_string(),
            name: "List Files".to_string(),
            description: "List files in a directory".to_string(),
            capabilities: vec![ToolCapability::FileRead],
            parameters: vec![
                ToolParameter {
                    name: "path".to_string(),
                    parameter_type: ParameterType::FilePath,
                    required: true,
                    description: "Path".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "limit".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Limit".to_string(),
                    default: None,
                },
                ToolParameter {
                    name: "offset".to_string(),
                    parameter_type: ParameterType::Integer,
                    required: false,
                    description: "Offset".to_string(),
                    default: None,
                },
            ],
            estimated_resources: ResourceUsage {
                cpu_percent: 0.0,
                memory_mb: 0,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })
        .expect("register file_list");
    registry
}

fn create_registry_with_browser_tool(
    tool_id: &str,
    params: Vec<ToolParameter>,
) -> Arc<ToolRegistry> {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_tool(crate::core::agi::tools::Tool {
            id: tool_id.to_string(),
            name: tool_id.to_string(),
            description: format!("{} tool", tool_id),
            capabilities: vec![ToolCapability::UIAutomation],
            parameters: params,
            estimated_resources: ResourceUsage {
                cpu_percent: 0.0,
                memory_mb: 0,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })
        .expect("register browser tool");
    registry
}

fn create_registry_with_all_tools() -> Arc<ToolRegistry> {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry.register_all_tools().expect("register all tools");
    registry
}

#[test]
fn test_terminal_registry_does_not_expose_model_shell_override() {
    let registry = create_registry_with_all_tools();
    let terminal = registry
        .get_tool("terminal_execute")
        .expect("terminal_execute should be registered");
    let names: Vec<&str> = terminal
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();

    assert!(names.contains(&"command"));
    assert!(names.contains(&"cwd"));
    assert!(names.contains(&"timeout_ms"));
    assert!(names.contains(&"max_output_bytes"));
    assert!(!names.contains(&"shell"));
}

#[test]
fn test_git_registry_matches_executor_defaults() {
    let registry = create_registry_with_all_tools();
    let git_add = registry
        .get_tool("git_add")
        .expect("git_add should be registered");
    let files = git_add
        .parameters
        .iter()
        .find(|parameter| parameter.name == "files")
        .expect("git_add should expose files parameter");
    assert!(!files.required);
    assert_eq!(files.default.as_ref(), Some(&json!(["."])));

    let git_status = registry
        .get_tool("git_status")
        .expect("git_status should be registered");
    let path = git_status
        .parameters
        .iter()
        .find(|parameter| parameter.name == "path")
        .expect("git_status should expose path parameter");
    assert!(!path.required);

    let git_diff = registry
        .get_tool("git_diff")
        .expect("git_diff should be registered");
    let diff_names: Vec<&str> = git_diff
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(git_diff.description.contains("Does not include untracked"));
    assert!(diff_names.contains(&"path"));
    assert!(diff_names.contains(&"file_path"));
    assert!(diff_names.contains(&"staged"));
    assert!(diff_names.contains(&"max_bytes"));

    let git_log = registry
        .get_tool("git_log")
        .expect("git_log should be registered");
    let log_names: Vec<&str> = git_log
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(git_log.description.contains("without changing"));
    assert!(log_names.contains(&"path"));
    assert!(log_names.contains(&"limit"));

    let git_list_branches = registry
        .get_tool("git_list_branches")
        .expect("git_list_branches should be registered");
    let branch_names: Vec<&str> = git_list_branches
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(git_list_branches.description.contains("without changing"));
    assert_eq!(branch_names, vec!["path"]);
}

#[test]
fn test_worktree_registry_matches_executor_contract() {
    let registry = create_registry_with_all_tools();

    let create = registry
        .get_tool("worktree_create")
        .expect("worktree_create should be registered");
    let create_names: Vec<&str> = create
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(create.description.contains("not an OS sandbox"));
    assert!(create_names.contains(&"slug"));
    assert!(create_names.contains(&"repo_path"));
    assert!(!create_names.contains(&"command"));

    let list = registry
        .get_tool("worktree_list")
        .expect("worktree_list should be registered");
    let list_names: Vec<&str> = list
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert_eq!(list_names, vec!["repo_path"]);

    let remove = registry
        .get_tool("worktree_remove")
        .expect("worktree_remove should be registered");
    let remove_names: Vec<&str> = remove
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(remove.description.contains("branch deletion is separate"));
    assert!(remove_names.contains(&"slug"));
    assert!(remove_names.contains(&"repo_path"));
    assert!(remove_names.contains(&"force"));
    assert!(remove_names.contains(&"delete_branch"));
}

#[test]
fn test_undo_registry_matches_executor_contract() {
    let registry = create_registry_with_all_tools();

    let get_changes = registry
        .get_tool("undo_get_changes")
        .expect("undo_get_changes should be registered");
    let get_changes_names: Vec<&str> = get_changes
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(get_changes.description.contains("without applying an undo"));
    assert!(get_changes_names.contains(&"task_id"));
    assert!(get_changes_names.contains(&"limit"));

    let undo_change = registry
        .get_tool("undo_change")
        .expect("undo_change should be registered");
    let undo_change_names: Vec<&str> = undo_change
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(undo_change
        .description
        .contains("Requires user confirmation"));
    assert_eq!(undo_change_names, vec!["change_id"]);

    let checkpoint_create = registry
        .get_tool("coding_checkpoint_create")
        .expect("coding_checkpoint_create should be registered");
    let checkpoint_create_names: Vec<&str> = checkpoint_create
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(checkpoint_create
        .description
        .contains("persists file contents locally"));
    assert!(checkpoint_create_names.contains(&"name"));
    assert!(checkpoint_create_names.contains(&"paths"));

    let checkpoint_list = registry
        .get_tool("coding_checkpoint_list")
        .expect("coding_checkpoint_list should be registered");
    assert!(checkpoint_list
        .description
        .contains("without returning snapshotted file contents"));

    let checkpoint_rewind = registry
        .get_tool("coding_checkpoint_rewind")
        .expect("coding_checkpoint_rewind should be registered");
    let checkpoint_rewind_names: Vec<&str> = checkpoint_rewind
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert_eq!(checkpoint_rewind_names, vec!["checkpoint_id"]);
}

#[tokio::test]
async fn test_undo_tools_require_desktop_app_state() {
    let executor = ToolExecutor::new(create_registry_with_all_tools());
    let error = executor
        .execute_undo_get_summary_tool(&HashMap::new())
        .await
        .expect_err("undo tools should require app state");
    assert!(error.to_string().contains("Desktop application state"));
}

#[test]
fn test_browser_execute_async_js_registry_matches_executor_contract() {
    let registry = create_registry_with_all_tools();
    let tool = registry
        .get_tool("browser_execute_async_js")
        .expect("browser_execute_async_js should be registered");
    let names: Vec<&str> = tool
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();

    assert!(names.contains(&"script"));
    assert!(names.contains(&"timeout_ms"));
    assert!(names.contains(&"tab_id"));
    assert!(!names.contains(&"args"));
    assert!(!names.contains(&"retry_count"));
    assert!(!names.contains(&"retry_delay_ms"));
    assert!(!names.contains(&"await_promise"));
}

#[test]
fn test_browser_wait_timeout_alias_normalizes_to_timeout_ms() {
    let mut args = HashMap::from([("timeout".to_string(), json!(1234))]);

    ToolExecutor::normalize_tool_arguments("browser_wait_for_selector", &mut args);

    assert_eq!(args.get("timeout_ms"), Some(&json!(1234)));
    assert!(args.get("timeout").is_none());
}

#[test]
fn test_alias_normalization_removes_alias_when_canonical_present() {
    let mut args = HashMap::from([
        ("timeout_ms".to_string(), json!(5000)),
        ("timeout".to_string(), json!(1234)),
    ]);

    ToolExecutor::normalize_tool_arguments("browser_wait_for_selector", &mut args);

    assert_eq!(args.get("timeout_ms"), Some(&json!(5000)));
    assert!(args.get("timeout").is_none());
}

#[test]
fn test_mcp_control_args_are_not_forwarded_to_server() {
    let (timeout_ms, server_args) = ToolExecutor::split_mcp_control_args(HashMap::from([
        ("path".to_string(), json!("/tmp/example.txt")),
        ("timeout_ms".to_string(), json!(999_999)),
    ]));

    assert_eq!(timeout_ms, mcp_tools::MCP_TOOL_MAX_TIMEOUT_MS);
    assert_eq!(server_args.get("path"), Some(&json!("/tmp/example.txt")));
    assert!(!server_args.contains_key("timeout_ms"));
}

#[cfg(unix)]
#[tokio::test]
async fn test_terminal_execute_caps_returned_output() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let mut executor = ToolExecutor::new(create_registry_with_all_tools());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

    let mut args = HashMap::new();
    args.insert("command".to_string(), json!("yes x | head -c 50000"));
    args.insert("cwd".to_string(), json!(dir.path().to_string_lossy()));
    args.insert("timeout_ms".to_string(), json!(10_000));
    args.insert("max_output_bytes".to_string(), json!(2_048));

    let result = executor
        .execute_terminal_tool(args, "terminal-truncation-test")
        .await
        .unwrap();

    assert!(
        result.success,
        "terminal command should succeed: {:?}",
        result.error
    );
    assert_eq!(result.data["stdoutTruncated"].as_bool(), Some(true));
    assert_eq!(result.metadata.get("stdout_truncated"), Some(&json!(true)));
    assert_eq!(result.metadata.get("max_output_bytes"), Some(&json!(2048)));
    assert!(
        result.data["stdoutBytes"].as_u64().unwrap_or_default() >= 50_000,
        "stdoutBytes should report produced bytes"
    );
    let stdout = result.data["stdout"].as_str().unwrap_or_default();
    assert!(stdout.contains("stdout truncated after 2048 bytes"));
    assert!(
        stdout.as_bytes().len() < 2_300,
        "returned stdout should be capped plus a short marker"
    );
}

#[test]
fn test_search_registry_exposes_pagination() {
    let registry = create_registry_with_all_tools();

    let grep = registry
        .get_tool("grep_search")
        .expect("grep_search should be registered");
    let grep_names: Vec<&str> = grep
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(grep_names.contains(&"limit"));
    assert!(grep_names.contains(&"offset"));

    let glob = registry
        .get_tool("glob_search")
        .expect("glob_search should be registered");
    let glob_names: Vec<&str> = glob
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(glob_names.contains(&"limit"));
    assert!(glob_names.contains(&"offset"));
}

#[test]
fn test_background_agent_registry_matches_executor_contract() {
    let registry = create_registry_with_all_tools();

    let start = registry
        .get_tool("background_agent_start")
        .expect("background_agent_start should be registered");
    let start_params: Vec<&str> = start
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(start_params.contains(&"goal"));
    assert!(start_params.contains(&"working_directory"));
    assert!(start_params.contains(&"custom_instructions"));
    assert!(start_params.contains(&"priority"));
    assert!(start_params.contains(&"conversation_id"));

    let get = registry
        .get_tool("background_agent_get")
        .expect("background_agent_get should be registered");
    let get_params: Vec<&str> = get
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(get_params.contains(&"agent_id"));
    assert!(get_params.contains(&"block"));
    assert!(get_params.contains(&"timeout_ms"));

    let cancel = registry
        .get_tool("background_agent_cancel")
        .expect("background_agent_cancel should be registered");
    assert_eq!(cancel.parameters.len(), 1);
    assert_eq!(cancel.parameters[0].name, "agent_id");
}

#[tokio::test]
async fn test_background_agent_tools_are_policy_registered() {
    let guard = crate::sys::security::ToolExecutionGuard::new();

    guard
        .validate_tool_call(
            "background_agent_start",
            &json!({
                "goal": "summarize the current workspace",
                "working_directory": "/tmp",
                "custom_instructions": "keep output concise",
                "priority": 5,
                "conversation_id": "conv-1"
            }),
        )
        .await
        .expect("background_agent_start canonical parameters should be allowed");
    assert_eq!(
        guard.get_safety_tier("background_agent_start"),
        crate::sys::security::ToolSafetyTier::RequiresConfirmation
    );

    guard
        .validate_tool_call(
            "background_agent_get",
            &json!({
                "agent_id": "agent-1",
                "block": false,
                "timeout_ms": 1000
            }),
        )
        .await
        .expect("background_agent_get canonical parameters should be allowed");
    assert_eq!(
        guard.get_safety_tier("background_agent_get"),
        crate::sys::security::ToolSafetyTier::Safe
    );

    guard
        .validate_tool_call("background_agent_cancel", &json!({ "agent_id": "agent-1" }))
        .await
        .expect("background_agent_cancel canonical parameters should be allowed");
    assert_eq!(
        guard.get_safety_tier("background_agent_cancel"),
        crate::sys::security::ToolSafetyTier::RequiresConfirmation
    );
}

#[test]
fn test_create_artifact_registry_matches_executor_contract() {
    let registry = create_registry_with_all_tools();

    let tool = registry
        .get_tool("create_artifact")
        .expect("create_artifact should be registered");
    let params: Vec<&str> = tool
        .parameters
        .iter()
        .map(|parameter| parameter.name.as_str())
        .collect();
    assert!(params.contains(&"artifact_type"));
    assert!(params.contains(&"title"));
    assert!(params.contains(&"content"));
    assert!(params.contains(&"language"));
}

#[test]
fn test_internal_resource_persistence_is_explicit_per_turn() {
    let mut executor = ToolExecutor::new(create_registry_with_all_tools());
    assert!(
        executor.persist_internal_resources,
        "normal turns must retain durable artifact behavior"
    );

    executor.set_persist_internal_resources(false);
    assert!(
        !executor.persist_internal_resources,
        "temporary turns must be able to disable all app-owned resource persistence"
    );
}

#[tokio::test]
async fn test_create_artifact_is_policy_registered() {
    // Without a policy entry, ToolExecutionGuard::validate_tool_call rejects
    // ANY tool call for an unregistered tool name with UnauthorizedTool —
    // this test guards against that regression (DESKTOP-ARTIFACTS-ENTIRELY-
    // UNWIRED-01 fix landing without the matching tool_guard.rs policy).
    let guard = crate::sys::security::ToolExecutionGuard::new();

    guard
        .validate_tool_call(
            "create_artifact",
            &json!({
                "artifact_type": "markdown",
                "title": "Notes",
                "content": "# Hello",
                "language": null
            }),
        )
        .await
        .expect("create_artifact canonical parameters should be allowed");

    // Benign, app-owned-store writes shouldn't require user confirmation
    // (same trust boundary as memory_remember).
    assert_eq!(
        guard.get_safety_tier("create_artifact"),
        crate::sys::security::ToolSafetyTier::Safe
    );
}

#[tokio::test]
async fn test_background_agent_start_requires_real_app_handle() {
    let registry = create_registry_with_all_tools();
    let executor = ToolExecutor::new(registry);
    let tool_call = ToolCall {
        id: "test_background_agent_start_no_app".to_string(),
        name: "background_agent_start".to_string(),
        arguments: json!({ "goal": "inspect the repo" }).to_string(),
    };

    let err = executor
        .execute_tool_call(&tool_call)
        .await
        .expect_err("background_agent_start should require the desktop app state");
    assert!(err
        .to_string()
        .contains("App handle not available for background agents"));
}

#[tokio::test]
async fn test_grep_search_paginates_results() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("one.txt"), "alpha one").unwrap();
    std::fs::write(dir.path().join("two.txt"), "alpha two").unwrap();
    std::fs::write(dir.path().join("three.txt"), "alpha three").unwrap();

    let mut executor = ToolExecutor::new(create_registry_with_all_tools());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

    let tool_call = ToolCall {
        id: "grep-pagination".to_string(),
        name: "grep_search".to_string(),
        arguments: serde_json::json!({
            "pattern": "alpha",
            "root": dir.path().to_string_lossy(),
            "output_mode": "files_with_matches",
            "limit": 1,
            "offset": 1
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();
    assert!(
        result.success,
        "grep_search should succeed: {:?}",
        result.error
    );
    assert_eq!(result.data["returned"].as_u64(), Some(1));
    assert_eq!(result.data["limit"].as_u64(), Some(1));
    assert_eq!(result.data["offset"].as_u64(), Some(1));
    assert_eq!(result.data["has_more"].as_bool(), Some(true));
    assert_eq!(result.data["matches"].as_array().map(Vec::len), Some(1));
}

#[tokio::test]
async fn test_grep_search_rejects_missing_root_without_fallback() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let missing = dir.path().join("missing-search-root");

    let mut executor = ToolExecutor::new(create_registry_with_all_tools());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

    let tool_call = ToolCall {
        id: "grep-missing-root".to_string(),
        name: "grep_search".to_string(),
        arguments: serde_json::json!({
            "pattern": "alpha",
            "root": missing.to_string_lossy()
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();
    assert!(!result.success, "missing root should fail");
    assert!(result
        .error
        .unwrap_or_default()
        .contains("Search root does not exist"));
}

#[tokio::test]
async fn test_glob_search_paginates_results() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("one.rs"), "one").unwrap();
    std::fs::write(dir.path().join("two.rs"), "two").unwrap();
    std::fs::write(dir.path().join("three.rs"), "three").unwrap();

    let mut executor = ToolExecutor::new(create_registry_with_all_tools());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

    let tool_call = ToolCall {
        id: "glob-pagination".to_string(),
        name: "glob_search".to_string(),
        arguments: serde_json::json!({
            "pattern": "*.rs",
            "root": dir.path().to_string_lossy(),
            "limit": 1,
            "offset": 1
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();
    assert!(
        result.success,
        "glob_search should succeed: {:?}",
        result.error
    );
    assert_eq!(result.data["returned"].as_u64(), Some(1));
    assert_eq!(result.data["limit"].as_u64(), Some(1));
    assert_eq!(result.data["offset"].as_u64(), Some(1));
    assert_eq!(result.data["total_matches"].as_u64(), Some(3));
    assert_eq!(result.data["has_more"].as_bool(), Some(true));
    assert_eq!(result.data["matches"].as_array().map(Vec::len), Some(1));
}

#[test]
fn test_html_response_truncation_metadata_uses_extraction_limit() {
    let html = "<html><head><title>Short</title></head><body><p>Hello world</p></body></html>";
    let (content, was_html, truncated) = super::search_tools::process_response_body(html, 15_000);

    assert!(was_html);
    assert!(!truncated);
    assert!(content.contains("Hello world"));
}

#[test]
fn test_plain_response_truncation_preserves_utf8_boundary() {
    let text = "ééé";
    let (content, was_html, truncated) = super::search_tools::process_response_body(text, 3);

    assert!(!was_html);
    assert!(truncated);
    assert_eq!(content, "é");
}

#[test]
fn test_build_job_autofill_profile_maps_aliases() {
    let mut args: HashMap<String, Value> = HashMap::new();
    args.insert("first_name".to_string(), json!("Siddhartha"));
    args.insert("last_name".to_string(), json!("Tester"));
    args.insert("email".to_string(), json!("sid@example.com"));
    args.insert(
        "linkedin_url".to_string(),
        json!("https://linkedin.com/in/sid"),
    );

    let profile = ToolExecutor::build_job_autofill_profile(&args).expect("profile");

    assert_eq!(
        profile.get("firstName").and_then(Value::as_str),
        Some("Siddhartha")
    );
    assert_eq!(
        profile.get("lastName").and_then(Value::as_str),
        Some("Tester")
    );
    assert_eq!(
        profile.get("email").and_then(Value::as_str),
        Some("sid@example.com")
    );
    assert_eq!(
        profile.get("linkedinUrl").and_then(Value::as_str),
        Some("https://linkedin.com/in/sid")
    );
}

#[test]
fn test_build_job_autofill_profile_requires_data() {
    let args: HashMap<String, Value> = HashMap::new();
    let result = ToolExecutor::build_job_autofill_profile(&args);
    assert!(result.is_err());
    assert!(result
        .expect_err("missing profile should fail")
        .to_string()
        .contains("Missing profile parameter"));
}

#[test]
fn test_build_job_autofill_options_maps_aliases() {
    let mut args: HashMap<String, Value> = HashMap::new();
    args.insert("auto_submit".to_string(), json!(true));
    args.insert(
        "allow_submit_with_missing_required".to_string(),
        json!(false),
    );
    args.insert("delay_ms".to_string(), json!(250));
    args.insert("max_submit_steps".to_string(), json!(4));

    let options = ToolExecutor::build_job_autofill_options(&args);

    assert_eq!(
        options.get("autoSubmit").and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        options
            .get("allowSubmitWithMissingRequired")
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(options.get("delayMs").and_then(Value::as_u64), Some(250));
    assert_eq!(
        options.get("maxSubmitSteps").and_then(Value::as_u64),
        Some(4)
    );
}

#[test]
fn test_tool_call_parsing() {
    let tool_call = ToolCall {
        id: "test_123".to_string(),
        name: "file_read".to_string(),
        arguments: serde_json::json!({
            "path": "/tmp/test.txt"
        })
        .to_string(),
    };

    assert_eq!(tool_call.id, "test_123");
    assert_eq!(tool_call.name, "file_read");

    let args: HashMap<String, serde_json::Value> =
        serde_json::from_str(&tool_call.arguments).unwrap();
    assert!(args.get("path").and_then(|v| v.as_str()).is_some());
}

#[tokio::test]
async fn test_unknown_tool_returns_failed_result() {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    let executor = ToolExecutor::new(registry);
    let tool_call = ToolCall {
        id: "test_unknown_tool".to_string(),
        name: "nonexistent_tool".to_string(),
        arguments: "{}".to_string(),
    };

    let result = executor
        .execute_tool_call(&tool_call)
        .await
        .expect("unknown tool should surface as tool failure");

    assert!(!result.success);
    assert!(result
        .error
        .unwrap_or_default()
        .contains("Tool not found: nonexistent_tool"));
}

#[tokio::test]
async fn test_missing_required_parameter_returns_failed_result() {
    let registry = create_registry_with_browser_tool(
        "custom_required_tool",
        vec![ToolParameter {
            name: "input".to_string(),
            parameter_type: ParameterType::String,
            required: true,
            description: "Required input".to_string(),
            default: None,
        }],
    );
    let executor = ToolExecutor::new(registry);
    let tool_call = ToolCall {
        id: "test_missing_required_parameter".to_string(),
        name: "custom_required_tool".to_string(),
        arguments: "{}".to_string(),
    };

    let result = executor
        .execute_tool_call(&tool_call)
        .await
        .expect("missing parameters should surface as tool failure");

    assert!(!result.success);
    assert!(result
        .error
        .unwrap_or_default()
        .contains("Missing required parameter: input"));
}

#[tokio::test]
async fn test_tool_execution_file_read() {
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.txt");

    {
        let mut file = File::create(&file_path).unwrap();
        writeln!(file, "Hello, World!").unwrap();
    }

    let tool_call = ToolCall {
        id: "test_file_read".to_string(),
        name: "file_read".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_str().unwrap()
        })
        .to_string(),
    };

    let args: HashMap<String, serde_json::Value> =
        serde_json::from_str(&tool_call.arguments).unwrap();
    let path_str = args.get("path").and_then(|v| v.as_str()).unwrap();
    let content = std::fs::read_to_string(path_str).unwrap();
    assert!(content.contains("Hello, World!"));
}

#[tokio::test]
async fn test_tool_execution_file_write() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test_write.txt");
    let path_str = file_path.to_str().unwrap();

    let tool_call = ToolCall {
        id: "test_file_write".to_string(),
        name: "file_write".to_string(),
        arguments: serde_json::json!({
            "path": path_str,
            "content": "Written by test"
        })
        .to_string(),
    };

    let registry = std::sync::Arc::new(ToolRegistry::new().unwrap());

    registry
        .register_tool(crate::core::agi::tools::Tool {
            id: "file_write".to_string(),
            name: "Write File".to_string(),
            description: "Write content to a file".to_string(),
            capabilities: vec![crate::core::agi::tools::ToolCapability::FileWrite],
            parameters: vec![
                crate::core::agi::tools::ToolParameter {
                    name: "path".to_string(),
                    parameter_type: crate::core::agi::tools::ParameterType::FilePath,
                    required: true,
                    description: "Path".to_string(),
                    default: None,
                },
                crate::core::agi::tools::ToolParameter {
                    name: "content".to_string(),
                    parameter_type: crate::core::agi::tools::ParameterType::String,
                    required: true,
                    description: "Content".to_string(),
                    default: None,
                },
            ],
            estimated_resources: crate::core::agi::ResourceUsage {
                cpu_percent: 0.0,
                memory_mb: 0,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })
        .unwrap();

    let executor = ToolExecutor::new(registry);
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success);
    let content = std::fs::read_to_string(path_str).unwrap();
    assert_eq!(content, "Written by test");
}

#[tokio::test]
async fn test_tool_execution_search_web_args() {
    let tool_call = ToolCall {
        id: "test_search".to_string(),
        name: "search_web".to_string(),
        arguments: serde_json::json!({
            "query": "rust tauri"
        })
        .to_string(),
    };

    let args: HashMap<String, serde_json::Value> =
        serde_json::from_str(&tool_call.arguments).unwrap();
    assert_eq!(
        args.get("query").and_then(|v| v.as_str()).unwrap(),
        "rust tauri"
    );
}

#[tokio::test]
async fn test_file_list_returns_entries_with_limits() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    fs::write(dir.path().join("a.txt"), "a").unwrap();
    fs::write(dir.path().join("b.txt"), "b").unwrap();
    fs::create_dir(dir.path().join("nested")).unwrap();

    let tool_call = ToolCall {
        id: "test_file_list_basic".to_string(),
        name: "file_list".to_string(),
        arguments: serde_json::json!({
            "path": dir.path().to_string_lossy(),
            "limit": 2
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_list());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success, "file_list should succeed");
    assert_eq!(result.data["returned"].as_u64(), Some(2));
    assert_eq!(result.data["has_more"].as_bool(), Some(true));
    assert_eq!(result.data["next_offset"].as_u64(), Some(2));
}

#[cfg(unix)]
#[tokio::test]
async fn test_file_list_permission_denied_returns_error() {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let blocked = dir.path().join("blocked");
    fs::create_dir(&blocked).unwrap();
    fs::set_permissions(&blocked, fs::Permissions::from_mode(0o000)).unwrap();

    let tool_call = ToolCall {
        id: "test_file_list_denied".to_string(),
        name: "file_list".to_string(),
        arguments: serde_json::json!({
            "path": blocked.to_string_lossy(),
            "timeout_ms": 2000
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_list());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    fs::set_permissions(&blocked, fs::Permissions::from_mode(0o755)).unwrap();

    assert!(
        !result.success,
        "file_list should fail on permission denied"
    );
    assert!(result
        .error
        .unwrap_or_default()
        .contains("Failed to list directory"));
}

#[tokio::test]
async fn test_file_list_large_directory_paginates() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    for idx in 0..600usize {
        fs::write(dir.path().join(format!("file_{idx}.txt")), "x").unwrap();
    }

    let tool_call = ToolCall {
        id: "test_file_list_pagination".to_string(),
        name: "file_list".to_string(),
        arguments: serde_json::json!({
            "path": dir.path().to_string_lossy(),
            "limit": 100,
            "offset": 200
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_list());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success);
    assert_eq!(result.data["returned"].as_u64(), Some(100));
    assert_eq!(result.data["offset"].as_u64(), Some(200));
    assert_eq!(result.data["has_more"].as_bool(), Some(true));
    assert_eq!(result.data["next_offset"].as_u64(), Some(300));
}

#[tokio::test]
async fn test_file_list_defaults_to_project_folder_when_path_missing() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    fs::write(dir.path().join("fallback.txt"), "ok").unwrap();

    let tool_call = ToolCall {
        id: "test_file_list_missing_path".to_string(),
        name: "file_list".to_string(),
        arguments: serde_json::json!({
            "limit": 20
        })
        .to_string(),
    };

    let mut executor = ToolExecutor::new(create_registry_with_file_list());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

    let result = executor.execute_tool_call(&tool_call).await.unwrap();
    assert!(
        result.success,
        "file_list should use project folder fallback, got error={:?} data={}",
        result.error, result.data
    );
    let entries = result.data["entries"]
        .as_array()
        .expect("entries should be present");
    assert!(
        entries
            .iter()
            .any(|entry| entry["name"].as_str() == Some("fallback.txt")),
        "fallback directory listing should include file from project folder"
    );
}

#[tokio::test]
async fn test_file_list_paginates_after_sorting_entries() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    fs::write(dir.path().join("zeta.txt"), "z").unwrap();
    fs::write(dir.path().join("alpha.txt"), "a").unwrap();
    fs::write(dir.path().join("middle.txt"), "m").unwrap();

    let tool_call = ToolCall {
        id: "test_file_list_sorted_pagination".to_string(),
        name: "file_list".to_string(),
        arguments: serde_json::json!({
            "path": dir.path().to_string_lossy(),
            "limit": 2,
            "offset": 0
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_list());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success);
    let names = result.data["entries"]
        .as_array()
        .expect("entries should be present")
        .iter()
        .filter_map(|entry| entry["name"].as_str())
        .collect::<Vec<_>>();
    assert_eq!(names, vec!["alpha.txt", "middle.txt"]);
    assert_eq!(result.data["has_more"].as_bool(), Some(true));
    assert_eq!(result.data["next_offset"].as_u64(), Some(2));
    assert_eq!(result.data["total_matched"].as_u64(), Some(3));
}

#[test]
fn test_file_list_registry_exposes_timeout_ms() {
    let registry = ToolRegistry::new().expect("registry");
    registry
        .register_all_tools()
        .expect("register all default tools");

    let file_list = registry
        .get_tool("file_list")
        .expect("file_list registered");
    assert!(file_list
        .parameters
        .iter()
        .any(|parameter| parameter.name == "timeout_ms"));
}

#[tokio::test]
async fn test_file_read_range_is_routed_and_numbered() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("range.txt");
    fs::write(&file_path, "alpha\nbeta\ngamma\ndelta\n").unwrap();

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_file_read_range".to_string(),
        name: "file_read_range".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "offset": 2,
            "limit": 2
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success, "range read failed: {:?}", result.error);
    assert_eq!(result.data["content"].as_str(), Some("2: beta\n3: gamma"));
    assert_eq!(result.data["line_count"].as_u64(), Some(2));
    assert_eq!(result.data["start_line"].as_u64(), Some(2));
    assert_eq!(result.data["total_lines"].as_u64(), Some(4));
    assert_eq!(result.data["has_more"].as_bool(), Some(true));
    assert_eq!(result.data["next_offset"].as_u64(), Some(4));
}

#[tokio::test]
async fn test_file_read_returns_file_version_hash() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("versioned.txt");
    let original = "alpha\nbeta\n";
    fs::write(&file_path, original).unwrap();

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_file_read_version".to_string(),
        name: "file_read".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success, "file_read failed: {:?}", result.error);
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());
    assert_eq!(result.data["content"].as_str(), Some(original));
    assert_eq!(
        result.data["file_version"]["sha256"].as_str(),
        Some(expected_sha256.as_str())
    );
    assert_eq!(result.data["truncated"].as_bool(), Some(false));
    assert_eq!(result.data["is_partial_view"].as_bool(), Some(false));
}

#[tokio::test]
async fn test_file_read_range_offset_exceeds_file_length() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("short.txt");
    fs::write(&file_path, "only\n").unwrap();

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_file_read_range_offset_exceeds".to_string(),
        name: "file_read_range".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "offset": 3,
            "limit": 1
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert_eq!(result.error.as_deref(), Some("offset exceeds file length"));
    assert_eq!(result.data["total_lines"].as_u64(), Some(1));
}

#[tokio::test]
async fn test_file_write_existing_requires_matching_expected_sha256() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("write-guard.txt");
    let original = "before\n";
    fs::write(&file_path, original).unwrap();

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let missing_hash = ToolCall {
        id: "test_file_write_missing_hash".to_string(),
        name: "file_write".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "content": "after\n",
        })
        .to_string(),
    };
    let result = executor.execute_tool_call(&missing_hash).await.unwrap();
    assert!(!result.success);
    assert!(result
        .error
        .as_deref()
        .unwrap_or_default()
        .contains("expected_sha256 is required"));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), original);

    let stale_hash = ToolCall {
        id: "test_file_write_stale_hash".to_string(),
        name: "file_write".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "content": "after\n",
            "expected_sha256": ToolExecutor::sha256_hex(b"stale\n"),
        })
        .to_string(),
    };
    let result = executor.execute_tool_call(&stale_hash).await.unwrap();
    assert!(!result.success);
    assert!(result
        .error
        .as_deref()
        .unwrap_or_default()
        .contains("File has changed since it was read"));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), original);

    let matching_hash = ToolCall {
        id: "test_file_write_matching_hash".to_string(),
        name: "file_write".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "content": "after\n",
            "expected_sha256": ToolExecutor::sha256_hex(original.as_bytes()),
        })
        .to_string(),
    };
    let result = executor.execute_tool_call(&matching_hash).await.unwrap();
    assert!(result.success, "file_write failed: {:?}", result.error);
    assert_eq!(fs::read_to_string(&file_path).unwrap(), "after\n");
}

#[tokio::test]
async fn test_apply_patch_rejects_partial_application_without_writing() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("patch.txt");
    let original = "line1\nold\nline3\nkeep\n";
    fs::write(&file_path, original).unwrap();
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let patch = "\
@@ -1,3 +1,3 @@
 line1
-old
+new
 line3
@@ -10,1 +10,1 @@
-missing
+never";

    let tool_call = ToolCall {
        id: "test_apply_patch_partial_rejected".to_string(),
        name: "apply_patch".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "patch": patch,
            "expected_sha256": expected_sha256
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert!(result
        .error
        .as_deref()
        .unwrap_or_default()
        .contains("no changes were written"));
    assert_eq!(result.data["applied"].as_u64(), Some(1));
    assert_eq!(result.data["failed"].as_u64(), Some(1));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), original);
}

#[tokio::test]
async fn test_edit_exact_replace_rejects_stale_expected_sha256() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("stale-edit.txt");
    let current = "current\n";
    fs::write(&file_path, current).unwrap();

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_edit_exact_replace_stale_hash".to_string(),
        name: "edit_exact_replace".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "old_text": "current",
            "new_text": "next",
            "expected_sha256": ToolExecutor::sha256_hex(b"previous\n"),
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert!(result
        .error
        .as_deref()
        .unwrap_or_default()
        .contains("File has changed since it was read"));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), current);
}

#[tokio::test]
async fn test_apply_patch_applies_all_hunks() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("patch-all.txt");
    let original = "line1\nold\nline3\nsecond\n";
    fs::write(&file_path, original).unwrap();
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let patch = "\
@@ -1,3 +1,3 @@
 line1
-old
+new
 line3
@@ -4,1 +4,1 @@
-second
+done";

    let tool_call = ToolCall {
        id: "test_apply_patch_all".to_string(),
        name: "apply_patch".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "patch": patch,
            "expected_sha256": expected_sha256
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success, "patch failed: {:?}", result.error);
    assert_eq!(result.data["applied"].as_u64(), Some(2));
    assert_eq!(result.data["failed"].as_u64(), Some(0));
    assert_eq!(
        fs::read_to_string(&file_path).unwrap(),
        "line1\nnew\nline3\ndone\n"
    );
}

#[tokio::test]
async fn test_edit_exact_replace_rejects_identical_replacement() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("same.txt");
    let original = "same\n";
    fs::write(&file_path, original).unwrap();
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_edit_exact_replace_noop".to_string(),
        name: "edit_exact_replace".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "old_text": "same",
            "new_text": "same",
            "expected_sha256": expected_sha256
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert_eq!(
        result.error.as_deref(),
        Some("No changes to make: old_text and new_text are identical")
    );
    assert_eq!(fs::read_to_string(&file_path).unwrap(), "same\n");
}

#[tokio::test]
async fn test_edit_exact_replace_rejects_empty_old_text() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("empty-old.txt");
    let original = "content\n";
    fs::write(&file_path, original).unwrap();
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_edit_exact_replace_empty_old".to_string(),
        name: "edit_exact_replace".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy(),
            "old_text": "",
            "new_text": "replacement",
            "expected_sha256": expected_sha256
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert_eq!(result.error.as_deref(), Some("old_text cannot be empty"));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), "content\n");
}

#[tokio::test]
async fn test_multi_edit_rejects_ambiguous_match_without_writing() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("ambiguous.txt");
    let original = "foo\nbar\nfoo\n";
    fs::write(&file_path, original).unwrap();
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_multi_edit_ambiguous".to_string(),
        name: "multi_edit".to_string(),
        arguments: serde_json::json!({
            "edits": [{
                "path": file_path.to_string_lossy(),
                "old_text": "foo",
                "new_text": "baz",
                "expected_sha256": expected_sha256
            }]
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert_eq!(result.data["occurrences"].as_u64(), Some(2));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), "foo\nbar\nfoo\n");
}

#[tokio::test]
async fn test_multi_edit_replace_all_replaces_all_occurrences() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("replace-all.txt");
    let original = "foo\nbar\nfoo\n";
    fs::write(&file_path, original).unwrap();
    let expected_sha256 = ToolExecutor::sha256_hex(original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_multi_edit_replace_all".to_string(),
        name: "multi_edit".to_string(),
        arguments: serde_json::json!({
            "edits": [{
                "path": file_path.to_string_lossy(),
                "old_text": "foo",
                "new_text": "baz",
                "replace_all": true,
                "expected_replacements": 2,
                "expected_sha256": expected_sha256
            }]
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success, "multi_edit failed: {:?}", result.error);
    assert_eq!(result.data["applied"].as_u64(), Some(1));
    assert_eq!(result.data["replacements_made"].as_u64(), Some(2));
    assert_eq!(fs::read_to_string(&file_path).unwrap(), "baz\nbar\nbaz\n");
}

#[tokio::test]
async fn test_multi_edit_expected_replacements_mismatch_rolls_back() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let first = dir.path().join("first.txt");
    let second = dir.path().join("second.txt");
    let first_original = "alpha\n";
    let second_original = "beta\n";
    fs::write(&first, first_original).unwrap();
    fs::write(&second, second_original).unwrap();
    let first_sha256 = ToolExecutor::sha256_hex(first_original.as_bytes());
    let second_sha256 = ToolExecutor::sha256_hex(second_original.as_bytes());

    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_multi_edit_expected_mismatch".to_string(),
        name: "multi_edit".to_string(),
        arguments: serde_json::json!({
            "edits": [
                {
                    "path": first.to_string_lossy(),
                    "old_text": "alpha",
                    "new_text": "ALPHA",
                    "expected_sha256": first_sha256
                },
                {
                    "path": second.to_string_lossy(),
                    "old_text": "beta",
                    "new_text": "BETA",
                    "expected_replacements": 2,
                    "expected_sha256": second_sha256
                }
            ]
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success);
    assert_eq!(result.data["rolled_back"].as_u64(), Some(1));
    assert_eq!(fs::read_to_string(&first).unwrap(), "alpha\n");
    assert_eq!(fs::read_to_string(&second).unwrap(), "beta\n");
}

#[tokio::test]
async fn test_mcp_list_allowed_directories_uses_local_fallback() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let project_path = dir.path().to_string_lossy().to_string();

    let mut executor = ToolExecutor::new(create_registry_with_file_list());
    executor.set_project_folder(Some(project_path.clone()));

    let tool_call = ToolCall {
        id: "test_mcp_list_allowed_dirs".to_string(),
        name: "mcp__filesystem__list_allowed_directories".to_string(),
        arguments: serde_json::json!({}).to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();
    assert!(result.success);
    assert_eq!(result.data["source"].as_str(), Some("local_fallback"));
    let directories = result.data["directories"]
        .as_array()
        .expect("directories should be an array");
    assert!(
        directories
            .iter()
            .any(|entry| entry.as_str() == Some(project_path.as_str())),
        "fallback directories should include project folder"
    );
}

#[tokio::test]
async fn test_mcp_read_text_file_uses_local_fallback() {
    use std::fs;
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("notes.txt");
    fs::write(&file_path, "hello from fallback").unwrap();

    let mut executor = ToolExecutor::new(create_registry_with_file_list());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));

    let tool_call = ToolCall {
        id: "test_mcp_read_text_file".to_string(),
        name: "mcp__filesystem__read_text_file".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_string_lossy()
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();
    assert!(result.success);
    assert_eq!(result.data["source"].as_str(), Some("local_fallback"));
    assert_eq!(result.data["content"].as_str(), Some("hello from fallback"));
}

#[test]
fn test_mcp_list_directory_payload_is_normalized() {
    let mut args = HashMap::new();
    args.insert("path".to_string(), json!("/workspace/project"));
    let raw_result = json!({
        "content": [
            {
                "type": "text",
                "text": "[DIR] src\n[FILE] Cargo.toml (382 bytes)"
            }
        ]
    });

    let normalized = ToolExecutor::normalize_mcp_tool_result(
        "mcp__filesystem__list_directory",
        &args,
        raw_result,
    );

    assert_eq!(
        normalized["source"].as_str(),
        Some("mcp_filesystem_list_directory")
    );
    assert_eq!(normalized["returned"].as_u64(), Some(2));
    let entries = normalized["entries"]
        .as_array()
        .expect("entries should be present");
    assert!(entries
        .iter()
        .any(|entry| entry["name"].as_str() == Some("src")
            && entry["type"].as_str() == Some("directory")));
    assert!(entries
        .iter()
        .any(|entry| entry["name"].as_str() == Some("Cargo.toml")
            && entry["type"].as_str() == Some("file")));
}

#[test]
fn test_mcp_list_allowed_directories_payload_is_normalized() {
    let args = HashMap::new();
    let raw_result = json!({
        "content": [
            {
                "type": "text",
                "text": "Allowed directories:\n- /Users/sid/Documents\n- /tmp"
            }
        ]
    });

    let normalized = ToolExecutor::normalize_mcp_tool_result(
        "mcp__filesystem__list_allowed_directories",
        &args,
        raw_result,
    );

    assert_eq!(
        normalized["source"].as_str(),
        Some("mcp_filesystem_list_allowed_directories")
    );
    let directories = normalized["directories"]
        .as_array()
        .expect("directories should be present");
    assert!(directories
        .iter()
        .any(|value| value.as_str() == Some("/Users/sid/Documents")));
    assert!(directories
        .iter()
        .any(|value| value.as_str() == Some("/tmp")));
}

#[test]
fn test_mcp_read_text_file_payload_is_normalized() {
    let mut args = HashMap::new();
    args.insert("path".to_string(), json!("/workspace/project/notes.txt"));
    let raw_result = json!({
        "content": [
            { "type": "text", "text": "line one" },
            { "type": "text", "text": "line two" }
        ]
    });

    let normalized = ToolExecutor::normalize_mcp_tool_result(
        "mcp__filesystem__read_text_file",
        &args,
        raw_result,
    );

    assert_eq!(
        normalized["source"].as_str(),
        Some("mcp_filesystem_read_text_file")
    );
    assert_eq!(
        normalized["path"].as_str(),
        Some("/workspace/project/notes.txt")
    );
    assert_eq!(normalized["content"].as_str(), Some("line one\nline two"));
}

#[tokio::test]
async fn test_browser_tool_is_routed_not_unknown() {
    let tool_call = ToolCall {
        id: "test_browser_get_url".to_string(),
        name: "browser_get_url".to_string(),
        arguments: serde_json::json!({}).to_string(),
    };
    let executor = ToolExecutor::new(create_registry_with_browser_tool("browser_get_url", vec![]));
    let err = executor
        .execute_tool_call(&tool_call)
        .await
        .expect_err("browser tool should fail cleanly without app handle");
    let message = err.to_string();
    assert!(
        message.contains("App handle not available for browser automation"),
        "unexpected error: {message}"
    );
}

#[tokio::test]
async fn test_browser_autofill_tool_is_routed_not_unknown() {
    let tool_call = ToolCall {
        id: "test_browser_autofill_job_application".to_string(),
        name: "browser_autofill_job_application".to_string(),
        arguments: serde_json::json!({
            "profile": {
                "firstName": "Siddhartha",
                "lastName": "Tester",
                "email": "sid@example.com"
            },
            "options": {
                "autoSubmit": false
            }
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_browser_tool(
        "browser_autofill_job_application",
        vec![ToolParameter {
            name: "profile".to_string(),
            parameter_type: ParameterType::Object,
            required: true,
            description: "Profile object".to_string(),
            default: None,
        }],
    ));
    let err = executor
        .execute_tool_call(&tool_call)
        .await
        .expect_err("autofill browser tool should fail cleanly without app handle");
    let message = err.to_string();
    assert!(
        message.contains("App handle not available for browser automation"),
        "unexpected error: {message}"
    );
}

#[tokio::test]
async fn test_registry_tools_are_routable_in_executor() {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all default tools");
    let executor = ToolExecutor::new(registry.clone());

    let mut tool_ids: Vec<String> = registry
        .list_tools()
        .iter()
        .map(|tool| tool.id.clone())
        .collect();
    tool_ids.sort();

    for tool_id in tool_ids {
        let tool_call = ToolCall {
            id: format!("coverage_{tool_id}"),
            name: tool_id.clone(),
            arguments: "{}".to_string(),
        };

        if let Err(err) = executor.execute_tool_call(&tool_call).await {
            let message = err.to_string();
            assert!(
                !message.contains("Unknown tool"),
                "tool '{tool_id}' is registered but not routable in execute_tool_impl: {message}",
            );
        }
    }
}

fn create_registry_with_file_read_binary() -> Arc<ToolRegistry> {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_tool(crate::core::agi::tools::Tool {
            id: "file_read_binary".to_string(),
            name: "Read Binary File".to_string(),
            description: "Read a binary file as base64".to_string(),
            capabilities: vec![ToolCapability::FileRead],
            parameters: vec![ToolParameter {
                name: "path".to_string(),
                parameter_type: ParameterType::FilePath,
                required: true,
                description: "Path to the binary file".to_string(),
                default: None,
            }],
            estimated_resources: ResourceUsage {
                cpu_percent: 0.0,
                memory_mb: 0,
                network_mb: 0.0,
            },
            dependencies: vec![],
        })
        .expect("register file_read_binary");
    registry
}

#[tokio::test]
async fn test_file_read_binary_returns_base64() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test.bin");
    // Write known binary bytes (not valid UTF-8)
    let binary_data: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xFF, 0xFE];
    std::fs::write(&file_path, &binary_data).unwrap();

    let tool_call = ToolCall {
        id: "test_file_read_binary".to_string(),
        name: "file_read_binary".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_str().unwrap()
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_read_binary());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(
        result.success,
        "file_read_binary should succeed, error: {:?}",
        result.error
    );

    // Decode the base64 and verify it matches the original binary data
    let encoded = result.data["base64_content"]
        .as_str()
        .expect("base64_content should be a string");
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .expect("should be valid base64");
    assert_eq!(decoded, binary_data, "decoded bytes should match original");
    assert_eq!(
        result.data["size_bytes"].as_u64(),
        Some(binary_data.len() as u64)
    );
    assert_eq!(
        result.data["mime_type"].as_str(),
        Some("application/octet-stream")
    );
}

#[tokio::test]
async fn test_file_read_binary_png_mime_type() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("image.png");
    let binary_data: Vec<u8> = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    std::fs::write(&file_path, &binary_data).unwrap();

    let tool_call = ToolCall {
        id: "test_file_read_binary_png".to_string(),
        name: "file_read_binary".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_str().unwrap()
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_read_binary());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success);
    assert_eq!(result.data["mime_type"].as_str(), Some("image/png"));
}

#[tokio::test]
async fn test_file_read_binary_pdf_mime_type() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("document.pdf");
    std::fs::write(&file_path, b"%PDF-1.4 fake").unwrap();

    let tool_call = ToolCall {
        id: "test_file_read_binary_pdf".to_string(),
        name: "file_read_binary".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_str().unwrap()
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_read_binary());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success);
    assert_eq!(result.data["mime_type"].as_str(), Some("application/pdf"));
}

#[tokio::test]
async fn test_file_read_binary_missing_file() {
    let dir = tempfile::tempdir().unwrap();
    let missing_path = dir.path().join("definitely_nonexistent_file_abc123.bin");

    let tool_call = ToolCall {
        id: "test_file_read_binary_missing".to_string(),
        name: "file_read_binary".to_string(),
        arguments: serde_json::json!({
            "path": missing_path.to_string_lossy()
        })
        .to_string(),
    };

    let mut executor = ToolExecutor::new(create_registry_with_file_read_binary());
    executor.set_project_folder(Some(dir.path().to_string_lossy().to_string()));
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success, "should fail for missing file");
    assert!(
        result.error.unwrap_or_default().contains("Failed"),
        "error should describe the failure"
    );
}

#[tokio::test]
async fn test_file_read_binary_missing_path_param() {
    let tool_call = ToolCall {
        id: "test_file_read_binary_no_path".to_string(),
        name: "file_read_binary".to_string(),
        arguments: serde_json::json!({}).to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_read_binary());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(!result.success, "should fail without path");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("Missing required parameter: path"),
        "error should mention missing path"
    );
}

#[tokio::test]
async fn test_file_read_binary_preserves_data_unchanged() {
    use tempfile::tempdir;

    let dir = tempdir().unwrap();
    let file_path = dir.path().join("test_all_bytes.bin");

    // Write all 256 possible byte values
    let all_bytes: Vec<u8> = (0..=255u8).collect();
    std::fs::write(&file_path, &all_bytes).unwrap();

    let tool_call = ToolCall {
        id: "test_file_read_binary_all_bytes".to_string(),
        name: "file_read_binary".to_string(),
        arguments: serde_json::json!({
            "path": file_path.to_str().unwrap()
        })
        .to_string(),
    };

    let executor = ToolExecutor::new(create_registry_with_file_read_binary());
    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(result.success);
    let encoded = result.data["base64_content"].as_str().unwrap();
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .unwrap();
    assert_eq!(
        decoded, all_bytes,
        "all 256 byte values should round-trip through base64"
    );
    assert_eq!(result.data["size_bytes"].as_u64(), Some(256));
}

#[test]
fn test_infer_mime_type_known_extensions() {
    use super::file_tools::infer_mime_type;

    assert_eq!(infer_mime_type("png"), "image/png");
    assert_eq!(infer_mime_type("PNG"), "image/png");
    assert_eq!(infer_mime_type("jpg"), "image/jpeg");
    assert_eq!(infer_mime_type("jpeg"), "image/jpeg");
    assert_eq!(infer_mime_type("pdf"), "application/pdf");
    assert_eq!(infer_mime_type("zip"), "application/zip");
    assert_eq!(infer_mime_type("mp4"), "video/mp4");
    assert_eq!(infer_mime_type("wasm"), "application/wasm");
    assert_eq!(infer_mime_type("unknown_ext"), "application/octet-stream");
}

#[test]
fn test_tilde_expansion() {
    let mut args: HashMap<String, Value> = HashMap::new();
    args.insert("path".to_string(), json!("~/Documents/test.txt"));

    ToolExecutor::expand_tilde_in_args(&mut args);

    let expanded = args
        .get("path")
        .and_then(|v| v.as_str())
        .expect("path should be present");
    assert!(
        expanded.starts_with('/'),
        "expanded path should be absolute, got: {expanded}"
    );
    assert!(
        !expanded.contains('~'),
        "expanded path should not contain tilde, got: {expanded}"
    );
    assert!(
        expanded.ends_with("/Documents/test.txt"),
        "expanded path should preserve relative portion, got: {expanded}"
    );
}

#[tokio::test]
async fn test_tool_search_select_returns_exact_schema() {
    let registry = Arc::new(ToolRegistry::new().expect("registry"));
    registry
        .register_all_tools()
        .expect("register all tools for tool_search");
    let executor = ToolExecutor::new(registry);

    let tool_call = ToolCall {
        id: "test_tool_search_select".to_string(),
        name: "tool_search".to_string(),
        arguments: json!({
            "query": "select:edit_exact_replace",
            "max_results": 5
        })
        .to_string(),
    };

    let result = executor.execute_tool_call(&tool_call).await.unwrap();

    assert!(
        result.success,
        "tool_search should succeed: {:?}",
        result.error
    );
    assert_eq!(result.data["match_count"].as_u64(), Some(1));
    assert_eq!(
        result.data["matches"][0]["name"].as_str(),
        Some("edit_exact_replace")
    );
    assert_eq!(
        result.data["matches"][0]["schema"]["parameters"]["properties"]["old_text"]["type"]
            .as_str(),
        Some("string")
    );
}
