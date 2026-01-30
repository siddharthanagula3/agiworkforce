//! Integration tests for the hooks system.
//!
//! These tests verify the complete hook lifecycle including configuration,
//! matching, execution, and error handling.

use super::*;
use std::path::PathBuf;
use tempfile::TempDir;

/// Creates a test hooks configuration with various event types.
fn test_config() -> HooksConfig {
    HooksConfig::from_json(
        r#"{
        "hooks": {
            "SessionStart": [{
                "hooks": [{
                    "type": "command",
                    "command": "echo 'session-start'",
                    "description": "Log session start"
                }]
            }],
            "SessionEnd": [{
                "hooks": [{
                    "type": "command",
                    "command": "echo 'session-end'"
                }]
            }],
            "PostToolUse": [
                {
                    "matcher": "Write|Edit",
                    "hooks": [{
                        "type": "command",
                        "command": "echo 'file-modified: $AGI_HOOK_TOOL_NAME'"
                    }]
                },
                {
                    "matcher": "Bash",
                    "hooks": [{
                        "type": "command",
                        "command": "echo 'bash-command-run'"
                    }]
                }
            ],
            "PreToolUse": [{
                "matcher": "Bash",
                "hooks": [{
                    "type": "command",
                    "command": "echo 'validating-bash'",
                    "timeout_ms": 5000
                }]
            }]
        }
    }"#,
    )
    .unwrap()
}

#[test]
fn test_all_events_exist() {
    let events = HookEvent::all();
    assert_eq!(events.len(), 12);

    // Verify all events can be serialized/deserialized
    for event in events {
        let json = serde_json::to_string(event).unwrap();
        let parsed: HookEvent = serde_json::from_str(&json).unwrap();
        assert_eq!(*event, parsed);
    }
}

#[test]
fn test_config_validation_rejects_unknown_event() {
    let result = HooksConfig::from_json(
        r#"{
        "hooks": {
            "UnknownEvent": [{
                "hooks": [{"type": "command", "command": "echo test"}]
            }]
        }
    }"#,
    );

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(err.to_string().contains("Unknown hook event"));
}

#[test]
fn test_config_validation_rejects_invalid_matcher() {
    let result = HooksConfig::from_json(
        r#"{
        "hooks": {
            "PostToolUse": [{
                "matcher": "[invalid-regex",
                "hooks": [{"type": "command", "command": "echo test"}]
            }]
        }
    }"#,
    );

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(matches!(err, HookError::InvalidMatcher { .. }));
}

#[test]
fn test_config_validation_rejects_empty_command() {
    let result = HooksConfig::from_json(
        r#"{
        "hooks": {
            "SessionStart": [{
                "hooks": [{"type": "command", "command": ""}]
            }]
        }
    }"#,
    );

    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(err.to_string().contains("cannot be empty"));
}

#[test]
fn test_context_builder_chain() {
    let context = HookContext::new(HookEvent::PostToolUse)
        .with_session_id("sess-abc")
        .with_tool("Write", "mcp__filesystem__write")
        .with_tool_arguments(serde_json::json!({"path": "/tmp/test.txt"}))
        .with_tool_result(serde_json::json!({"success": true}))
        .with_duration_ms(250)
        .with_metadata("file_size", "1024")
        .with_metadata("encoding", "utf-8");

    assert_eq!(context.event, HookEvent::PostToolUse);
    assert_eq!(context.session_id, Some("sess-abc".to_string()));
    assert_eq!(context.tool_name, Some("Write".to_string()));
    assert_eq!(context.tool_id, Some("mcp__filesystem__write".to_string()));
    assert!(context.tool_arguments.is_some());
    assert!(context.tool_result.is_some());
    assert_eq!(context.duration_ms, Some(250));
    assert_eq!(context.metadata.len(), 2);
}

#[test]
fn test_context_serialization_roundtrip() {
    let original = HookContext::new(HookEvent::PreToolUse)
        .with_session_id("test-session")
        .with_tool("Edit", "mcp__fs__edit")
        .with_tool_arguments(serde_json::json!({"file": "test.rs", "content": "fn main() {}"}));

    let json = original.to_json().unwrap();
    let deserialized: HookContext = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.event, original.event);
    assert_eq!(deserialized.session_id, original.session_id);
    assert_eq!(deserialized.tool_name, original.tool_name);
    assert_eq!(deserialized.tool_id, original.tool_id);
}

#[test]
fn test_matcher_patterns() {
    let config = test_config();

    // Test PostToolUse matchers
    let entries = config.get_entries(HookEvent::PostToolUse).unwrap();
    assert_eq!(entries.len(), 2);

    // First entry matches Write|Edit
    let write_edit_entry = &entries[0];
    assert!(write_edit_entry.matches_tool("Write").unwrap());
    assert!(write_edit_entry.matches_tool("Edit").unwrap());
    assert!(!write_edit_entry.matches_tool("Read").unwrap());
    assert!(!write_edit_entry.matches_tool("Bash").unwrap());

    // Second entry matches Bash
    let bash_entry = &entries[1];
    assert!(bash_entry.matches_tool("Bash").unwrap());
    assert!(!bash_entry.matches_tool("Write").unwrap());
}

#[test]
fn test_get_matching_hooks_with_tool_filter() {
    let config = test_config();

    // Write should match the Write|Edit pattern
    let write_hooks = config
        .get_matching_hooks(HookEvent::PostToolUse, Some("Write"))
        .unwrap();
    assert_eq!(write_hooks.len(), 1);
    assert!(write_hooks[0].command.contains("file-modified"));

    // Bash should match the Bash pattern
    let bash_hooks = config
        .get_matching_hooks(HookEvent::PostToolUse, Some("Bash"))
        .unwrap();
    assert_eq!(bash_hooks.len(), 1);
    assert!(bash_hooks[0].command.contains("bash-command"));

    // Read shouldn't match any pattern
    let read_hooks = config
        .get_matching_hooks(HookEvent::PostToolUse, Some("Read"))
        .unwrap();
    assert!(read_hooks.is_empty());
}

#[test]
fn test_compiled_matcher_performance() {
    // CompiledMatcher should be reusable for multiple matches
    let matcher = CompiledMatcher::new("^(Read|Write|Edit|Delete)$").unwrap();

    assert!(matcher.matches("Read"));
    assert!(matcher.matches("Write"));
    assert!(matcher.matches("Edit"));
    assert!(matcher.matches("Delete"));
    assert!(!matcher.matches("ReadFile"));
    assert!(!matcher.matches("read")); // Case sensitive
    assert!(!matcher.matches(""));
}

#[tokio::test]
async fn test_executor_full_workflow() {
    let config = test_config();
    let executor = HookExecutor::new(config);

    // Test SessionStart (non-blocking)
    let ctx = HookContext::new(HookEvent::SessionStart).with_session_id("workflow-test");

    let results = executor.fire(&ctx).await.unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].success);
    assert!(results[0].stdout.contains("session-start"));

    // Test PostToolUse with matching tool
    let ctx = HookContext::new(HookEvent::PostToolUse)
        .with_session_id("workflow-test")
        .with_tool("Write", "mcp__fs__write");

    let results = executor.fire(&ctx).await.unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].success);

    // Verify stats
    let stats = executor.stats();
    assert_eq!(stats.total(), 2);
    assert_eq!(stats.successful(), 2);
}

#[tokio::test]
async fn test_executor_with_working_dir() {
    let temp_dir = TempDir::new().unwrap();
    let temp_path = temp_dir.path().to_path_buf();

    let mut config = HooksConfig::new();
    config.add_hook(
        HookEvent::SessionStart,
        HookEntry::new(vec![HookDefinition::new("pwd")]),
    );

    let executor = HookExecutor::new(config);
    executor.set_working_dir(Some(temp_path.clone()));

    let ctx = HookContext::new(HookEvent::SessionStart);
    let results = executor.fire(&ctx).await.unwrap();

    assert_eq!(results.len(), 1);
    assert!(results[0].success);
    // The output should contain the temp directory path
    assert!(results[0].stdout.trim().len() > 0);
}

#[tokio::test]
async fn test_executor_invalid_working_dir() {
    let mut config = HooksConfig::new();
    config.add_hook(
        HookEvent::SessionStart,
        HookEntry::new(vec![HookDefinition::new("echo test")]),
    );

    let executor = HookExecutor::new(config);
    executor.set_working_dir(Some(PathBuf::from("/nonexistent/path/abc123")));

    let ctx = HookContext::new(HookEvent::SessionStart);
    let result = executor.fire(&ctx).await;

    assert!(matches!(
        result,
        Err(HookError::InvalidWorkingDirectory { .. })
    ));
}

#[tokio::test]
async fn test_executor_disabled() {
    let config = test_config();
    let executor = HookExecutor::new(config);
    executor.set_enabled(false);

    let ctx = HookContext::new(HookEvent::SessionStart);
    let result = executor.fire(&ctx).await;

    assert!(matches!(result, Err(HookError::Disabled(_))));
}

#[tokio::test]
async fn test_executor_hook_failure_non_blocking() {
    let mut config = HooksConfig::new();
    config.add_hook(
        HookEvent::SessionEnd, // Non-blocking event
        HookEntry::new(vec![
            HookDefinition::new("exit 1"),
            HookDefinition::new("echo 'still-runs'"),
        ]),
    );

    let executor = HookExecutor::new(config);
    let ctx = HookContext::new(HookEvent::SessionEnd);

    // For non-blocking events, all hooks run even if some fail
    let results = executor.fire(&ctx).await.unwrap();
    assert_eq!(results.len(), 2);
    assert!(!results[0].success);
    assert!(results[1].success);
}

#[tokio::test]
async fn test_executor_hook_failure_blocking() {
    let mut config = HooksConfig::new();
    config.add_hook(
        HookEvent::PreToolUse, // Blocking event
        HookEntry::new(vec![
            HookDefinition::new("exit 1"),
            HookDefinition::new("echo 'should-not-run'"),
        ]),
    );

    let executor = HookExecutor::new(config);
    let ctx = HookContext::new(HookEvent::PreToolUse).with_tool("Bash", "mcp__bash__run");

    // For blocking events, execution stops on first failure
    let results = executor.fire(&ctx).await.unwrap();
    assert_eq!(results.len(), 1);
    assert!(!results[0].success);
}

#[tokio::test]
async fn test_executor_environment_variables() {
    let mut config = HooksConfig::new();
    // Use printenv to verify environment variables are set
    config.add_hook(
        HookEvent::PostToolUse,
        HookEntry::new(vec![HookDefinition::new(
            "echo \"EVENT=$AGI_HOOK_EVENT TOOL=$AGI_HOOK_TOOL_NAME\"",
        )]),
    );

    let executor = HookExecutor::new(config);
    let ctx = HookContext::new(HookEvent::PostToolUse)
        .with_session_id("env-test")
        .with_tool("TestTool", "mcp__test__tool");

    let results = executor.fire(&ctx).await.unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].success);
    assert!(results[0].stdout.contains("EVENT=PostToolUse"));
    assert!(results[0].stdout.contains("TOOL=TestTool"));
}

#[tokio::test]
async fn test_executor_timeout() {
    let mut config = HooksConfig::new();
    config.add_hook(
        HookEvent::SessionStart,
        HookEntry::new(vec![HookDefinition::new("sleep 10").with_timeout_ms(100)]),
    );

    let executor = HookExecutor::new(config);
    let ctx = HookContext::new(HookEvent::SessionStart);

    let result = executor.fire(&ctx).await;
    assert!(matches!(result, Err(HookError::Timeout { .. })));

    // Stats should record the timeout
    assert_eq!(executor.stats().timed_out(), 1);
}

#[tokio::test]
async fn test_executor_multiple_concurrent_hooks() {
    let mut config = HooksConfig::new();
    // Add multiple hooks that will run concurrently
    config.add_hook(
        HookEvent::SessionEnd,
        HookEntry::new(vec![
            HookDefinition::new("echo 'hook1'"),
            HookDefinition::new("echo 'hook2'"),
            HookDefinition::new("echo 'hook3'"),
        ]),
    );

    let executor = HookExecutor::new(config);
    let ctx = HookContext::new(HookEvent::SessionEnd);

    let results = executor.fire(&ctx).await.unwrap();
    assert_eq!(results.len(), 3);
    assert!(results.iter().all(|r| r.success));

    assert_eq!(executor.stats().successful(), 3);
}

#[tokio::test]
async fn test_fire_and_forget() {
    let mut config = HooksConfig::new();
    config.add_hook(
        HookEvent::Notification,
        HookEntry::new(vec![HookDefinition::new("echo 'notification-sent'")]),
    );

    let executor = HookExecutor::new(config);
    let ctx = HookContext::new(HookEvent::Notification).with_notification(
        "info",
        "Test Title",
        "Test Body",
    );

    // fire_and_forget should return immediately
    executor.fire_and_forget(ctx);

    // Give background task time to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

    // Stats should be updated
    assert!(executor.stats().total() >= 1);
}

#[test]
fn test_hook_entry_disabled_hooks() {
    let entry = HookEntry::new(vec![
        HookDefinition::new("cmd1").with_enabled(true),
        HookDefinition::new("cmd2").with_enabled(false),
        HookDefinition::new("cmd3").with_enabled(true),
        HookDefinition::new("cmd4").with_enabled(false),
    ]);

    let enabled = entry.enabled_hooks();
    assert_eq!(enabled.len(), 2);
    assert_eq!(enabled[0].command, "cmd1");
    assert_eq!(enabled[1].command, "cmd3");
}

#[test]
fn test_config_merge() {
    let mut base = HooksConfig::new();
    base.add_hook(
        HookEvent::SessionStart,
        HookEntry::new(vec![HookDefinition::new("echo 'base'")]),
    );

    let mut extension = HooksConfig::new();
    extension.add_hook(
        HookEvent::SessionStart,
        HookEntry::new(vec![HookDefinition::new("echo 'extension'")]),
    );
    extension.add_hook(
        HookEvent::SessionEnd,
        HookEntry::new(vec![HookDefinition::new("echo 'end'")]),
    );

    base.merge(extension);

    // SessionStart should have 2 entries now
    let start_entries = base.get_entries(HookEvent::SessionStart).unwrap();
    assert_eq!(start_entries.len(), 2);

    // SessionEnd should be added
    assert!(base.has_hooks(HookEvent::SessionEnd));
}

#[test]
fn test_error_types() {
    // Test error display formatting
    let config_err = HookError::Configuration("test error".into());
    assert!(config_err.to_string().contains("test error"));

    let matcher_err = HookError::InvalidMatcher {
        pattern: "[bad".into(),
        reason: "unclosed".into(),
    };
    assert!(matcher_err.to_string().contains("[bad"));
    assert!(matcher_err.to_string().contains("unclosed"));

    let exec_err = HookError::ExecutionFailed {
        event: "SessionStart".into(),
        reason: "command not found".into(),
    };
    assert!(exec_err.to_string().contains("SessionStart"));
    assert!(exec_err.to_string().contains("command not found"));

    let timeout_err = HookError::Timeout {
        command: "sleep 100".into(),
        timeout_ms: 5000,
    };
    assert!(timeout_err.to_string().contains("5000ms"));
    assert!(timeout_err.to_string().contains("sleep 100"));
}

#[test]
fn test_hook_stats() {
    let stats = HookStats::new();

    stats.record_success(100);
    stats.record_success(200);
    stats.record_failure(50);
    stats.record_timeout(1000);

    assert_eq!(stats.total(), 4);
    assert_eq!(stats.successful(), 2);
    assert_eq!(stats.failed(), 1);
    assert_eq!(stats.timed_out(), 1);
    assert_eq!(stats.avg_duration_ms(), 337.5); // (100+200+50+1000)/4
}

#[test]
fn test_all_context_event_types() {
    // Test context builders for all event types

    // SessionStart
    let _ = HookContext::new(HookEvent::SessionStart).with_session_id("test");

    // SessionEnd
    let _ = HookContext::new(HookEvent::SessionEnd)
        .with_session_id("test")
        .with_duration_ms(60000)
        .with_reason("user_closed");

    // UserPromptSubmit
    let _ = HookContext::new(HookEvent::UserPromptSubmit)
        .with_session_id("test")
        .with_prompt("Help me write a function");

    // PreToolUse
    let _ = HookContext::new(HookEvent::PreToolUse)
        .with_tool("Write", "mcp__fs__write")
        .with_tool_arguments(serde_json::json!({"path": "/test.txt"}));

    // PostToolUse
    let _ = HookContext::new(HookEvent::PostToolUse)
        .with_tool("Write", "mcp__fs__write")
        .with_tool_result(serde_json::json!({"bytes_written": 100}))
        .with_duration_ms(50);

    // PostToolUseFailure
    let _ = HookContext::new(HookEvent::PostToolUseFailure)
        .with_tool("Write", "mcp__fs__write")
        .with_error("Permission denied")
        .with_duration_ms(10);

    // PermissionRequest
    let _ =
        HookContext::new(HookEvent::PermissionRequest).with_permission("filesystem", "/home/user");

    // SubagentStart
    let _ = HookContext::new(HookEvent::SubagentStart)
        .with_agent_id("agent-123")
        .with_session_id("parent-session");

    // SubagentStop
    let _ = HookContext::new(HookEvent::SubagentStop)
        .with_agent_id("agent-123")
        .with_duration_ms(30000)
        .with_reason("task_completed");

    // Stop
    let _ = HookContext::new(HookEvent::Stop)
        .with_session_id("test")
        .with_reason("user_cancelled");

    // PreCompact
    let _ = HookContext::new(HookEvent::PreCompact)
        .with_session_id("test")
        .with_compaction(50000, "sliding_window");

    // Notification
    let _ = HookContext::new(HookEvent::Notification).with_notification(
        "success",
        "Task Complete",
        "Your task has finished",
    );
}
