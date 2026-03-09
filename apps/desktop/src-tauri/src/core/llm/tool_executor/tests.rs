use super::*;
use crate::core::agi::tools::{ParameterType, ToolCapability, ToolParameter};
use crate::core::agi::ResourceUsage;
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
    let executor =
        ToolExecutor::new(create_registry_with_browser_tool("browser_get_url", vec![]));
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
