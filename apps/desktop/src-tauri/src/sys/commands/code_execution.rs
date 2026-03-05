use crate::core::agi::sandbox::{ExecutionConfig, SandboxManager};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

const DEFAULT_MEMORY_LIMIT_MB: u64 = 512;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024; // 1 MiB cap on stdout/stderr

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

/// Execute code in a sandboxed environment.
///
/// Supported languages: python, javascript, typescript, bash, powershell, ruby, perl, r
#[tauri::command]
pub async fn execute_code(
    language: String,
    code: String,
    timeout_secs: Option<u64>,
    stdin: Option<String>,
    env_vars: Option<HashMap<String, String>>,
    allow_network: Option<bool>,
    files: Option<HashMap<String, String>>,
) -> Result<CodeExecutionResponse, String> {
    let manager =
        SandboxManager::new().map_err(|e| format!("Failed to initialize sandbox: {e}"))?;

    let config = ExecutionConfig {
        language: language.clone(),
        code,
        stdin,
        timeout_secs: Some(timeout_secs.unwrap_or(30)),
        env_vars,
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
