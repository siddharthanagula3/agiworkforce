use crate::core::agi::sandbox::{ExecutionConfig, SandboxManager};
use crate::sys::security::env_filter::filter_blocked_env_vars;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const DEFAULT_MEMORY_LIMIT_MB: u64 = 512;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024; // 1 MiB cap on stdout/stderr

// BATCH-5 (audit 2026-05-19): `BLOCKED_ENV_VARS` + `filter_blocked_env_vars`
// formerly lived inline here. They moved to
// `crate::sys::security::env_filter` so this module, `core::agi::sandbox`,
// and `core::mcp::transport` all consume the same canonical list. The new
// central list is a strict superset of the previous inline 9-var list.

/// Truncate a string to at most `max_bytes` bytes, appending a note if truncated.
fn truncate_output(s: String, max_bytes: usize) -> String {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    format!(
        "{}...\n[truncated — output exceeded {} bytes]",
        &s[..end],
        max_bytes
    )
}

/// Result returned to the frontend from code execution
#[derive(Debug, Serialize, Deserialize)]
pub struct CodeExecutionResponse {
    pub success: bool,
    pub stdout: String,
    pub stderr: String,
    pub output: String,
    pub error: Option<String>,
    pub exit_code: Option<i32>,
    pub execution_time_ms: u64,
    pub language: String,
    pub timed_out: bool,
}

/// Execute code in a temporary AGI workspace.
///
/// Supported languages: python, javascript, typescript, bash, powershell, ruby, perl, r
#[tauri::command]
pub async fn execute_code(
    app: tauri::AppHandle,
    language: String,
    code: String,
    timeout_secs: Option<u64>,
    stdin: Option<String>,
    env_vars: Option<HashMap<String, String>>,
    allow_network: Option<bool>,
    files: Option<HashMap<String, String>>,
) -> Result<CodeExecutionResponse, String> {
    // FIX-F5 (audit 2026-05-19): require HITL before running arbitrary LLM-
    // supplied code in 8 supported languages. SandboxManager creates a
    // temporary workspace and applies fail-closed Seatbelt/Bubblewrap network
    // isolation when allow_network is false. This gate ensures the user sees
    // both the code preview and network choice and can refuse. Goes through
    // request_confirmation_simple -> request_tool_confirmation so Safe/Plan
    // agent modes can also block.
    let code_preview: String = code.chars().take(400).collect();
    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "execute_code",
        &serde_json::json!({
            "language": language,
            "code_preview": code_preview,
            "code_full_len": code.len(),
            "allow_network": allow_network.unwrap_or(false),
        }),
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
    }

    let manager =
        SandboxManager::new().map_err(|e| format!("Failed to initialize sandbox: {e}"))?;

    let safe_env_vars = filter_blocked_env_vars(env_vars);

    let config = ExecutionConfig {
        language: language.clone(),
        code,
        stdin,
        timeout_secs: Some(timeout_secs.unwrap_or(30)),
        env_vars: safe_env_vars,
        allow_network: allow_network.unwrap_or(false),
        memory_limit_mb: Some(DEFAULT_MEMORY_LIMIT_MB),
        files,
    };

    let result = manager
        .execute_code(config)
        .await
        .map_err(|e| format!("Execution error: {e}"))?;

    Ok(CodeExecutionResponse {
        success: result.success,
        stdout: truncate_output(result.stdout, MAX_OUTPUT_BYTES),
        stderr: truncate_output(result.stderr, MAX_OUTPUT_BYTES),
        output: truncate_output(result.output, MAX_OUTPUT_BYTES),
        error: result.error,
        exit_code: result.exit_code,
        execution_time_ms: result.execution_time_ms,
        language: result.language,
        timed_out: result.timed_out,
    })
}
