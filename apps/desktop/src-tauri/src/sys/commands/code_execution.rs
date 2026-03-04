use crate::core::agi::sandbox::{ExecutionConfig, SandboxManager};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

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
    let manager = SandboxManager::new().map_err(|e| format!("Failed to initialize sandbox: {e}"))?;

    let config = ExecutionConfig {
        language: language.clone(),
        code,
        stdin,
        timeout_secs: Some(timeout_secs.unwrap_or(30)),
        env_vars,
        allow_network: allow_network.unwrap_or(false),
        memory_limit_mb: Some(512),
        files,
    };

    let result = manager
        .execute_code(config)
        .await
        .map_err(|e| format!("Execution error: {e}"))?;

    Ok(CodeExecutionResponse {
        success: result.success,
        stdout: result.stdout,
        stderr: result.stderr,
        output: result.output,
        error: result.error,
        exit_code: result.exit_code,
        execution_time_ms: result.execution_time_ms,
        language: result.language,
        timed_out: result.timed_out,
    })
}
