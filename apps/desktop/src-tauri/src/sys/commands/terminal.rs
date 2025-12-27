use crate::features::terminal::{
    detect_available_shells, SessionManager, ShellInfo, ShellType, TerminalAI,
};
use std::time::Instant;
use tauri::State;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    stdout: String,
    stderr: String,
    exit_code: Option<i32>,
    duration_ms: u64,
}

#[tauri::command]
pub async fn execute_terminal_command(
    command: String,
    cwd: Option<String>,
    shell: Option<String>,
) -> Result<ExecuteResult, String> {
    use std::path::Path;
    use std::process::Stdio;
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    tracing::info!("Executing independent terminal command: {}", command);

    let normalized = command
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();

    let dangerous_patterns = [
        "rm -rf /",
        "rm -rf /*",
        "rm -r /",
        "dd if=",
        ":(){ :|:& };:",
        "mkfs",
        "format c:",
        "> /dev/sda",
        "> /dev/",
        "chmod -r 777 /",
        "shutdown",
        "reboot",
        "halt",
        "init 0",
        "init 6",
        "sudo rm",
        "curl | sh",
        "curl | bash",
        "wget | sh",
        "wget | bash",
        "eval $(",
        "base64 -d |",
        "> /etc/passwd",
        "> /etc/shadow",
        "mv /",
        "cp /",
        "> /boot",
        "> /proc",
        "> /sys",
        "nc -e",
        "bash -i >&",
    ];

    for pattern in &dangerous_patterns {
        if normalized.contains(pattern) {
            tracing::warn!("Blocked dangerous command pattern: {}", pattern);
            return Err(format!(
                "Command blocked for security: contains dangerous pattern '{}'",
                pattern
            ));
        }
    }

    let suspicious_patterns = [
        "wget", "curl", "base64", "nc", "netcat", "ssh", "scp", "sftp",
    ];

    for pattern in &suspicious_patterns {
        if normalized.contains(pattern) {
            tracing::warn!(
                "Executing suspicious command pattern '{}': {}",
                pattern,
                command
            );
        }
    }

    let dangerous_metacharacters = ['`', '$', '\n', '\r'];

    for meta in &dangerous_metacharacters {
        if command.contains(*meta) {
            let display_char = match *meta {
                '\n' | '\r' => "newline".to_string(),
                c => c.to_string(),
            };
            tracing::warn!("Blocked command containing shell metacharacter: {:?}", meta);
            return Err(format!(
                "Command blocked for security: contains shell metacharacter '{}'",
                display_char
            ));
        }
    }

    let audit_operators = ['|', ';', '&', '<', '>'];
    for op in &audit_operators {
        if command.contains(*op) {
            tracing::info!("Command contains shell operator '{}': {}", op, command);
        }
    }

    if let Some(ref dir) = cwd {
        if !Path::new(dir).exists() {
            return Err(format!("Working directory does not exist: {}", dir));
        }
    }

    let shell = shell.unwrap_or_else(|| {
        if cfg!(target_os = "windows") {
            "powershell".to_string()
        } else {
            "bash".to_string()
        }
    });

    let (program, args): (String, Vec<String>) = match shell.to_lowercase().as_str() {
        "cmd" => (
            "cmd.exe".to_string(),
            vec!["/C".to_string(), command.clone()],
        ),
        "bash" | "sh" | "zsh" => {
            let shell_path = if cfg!(target_os = "macos") {
                "/bin/zsh".to_string()
            } else {
                "/bin/bash".to_string()
            };
            (shell_path, vec!["-lc".to_string(), command.clone()])
        }
        "powershell" | "pwsh" => (
            if cfg!(target_os = "windows") {
                "powershell.exe".to_string()
            } else {
                "pwsh".to_string()
            },
            vec![
                "-NoLogo".to_string(),
                "-NoProfile".to_string(),
                "-Command".to_string(),
                command.clone(),
            ],
        ),
        _ => {
            if cfg!(target_os = "windows") {
                (
                    "powershell.exe".to_string(),
                    vec!["-Command".to_string(), command.clone()],
                )
            } else {
                (
                    "/bin/sh".to_string(),
                    vec!["-c".to_string(), command.clone()],
                )
            }
        }
    };

    let mut cmd = Command::new(&program);
    for arg in &args {
        cmd.arg(arg);
    }

    if let Some(ref path) = cwd {
        cmd.current_dir(path);
    }

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    let start_time = Instant::now();

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let stdout_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stdout) = stdout_handle {
            let _ = stdout.read_to_end(&mut buffer).await;
        }
        buffer
    });

    let stderr_task = tokio::spawn(async move {
        let mut buffer = Vec::new();
        if let Some(mut stderr) = stderr_handle {
            let _ = stderr.read_to_end(&mut buffer).await;
        }
        buffer
    });

    let timeout_duration = tokio::time::Duration::from_secs(60);
    let status = match tokio::time::timeout(timeout_duration, child.wait()).await {
        Ok(result) => result.map_err(|e| format!("Command failed: {}", e))?,
        Err(_) => {
            let _ = child.kill().await;
            return Err("Command timed out after 60 seconds".to_string());
        }
    };

    let stdout_bytes = stdout_task.await.unwrap_or_default();
    let stderr_bytes = stderr_task.await.unwrap_or_default();
    let duration = start_time.elapsed();

    Ok(ExecuteResult {
        stdout: String::from_utf8_lossy(&stdout_bytes).to_string(),
        stderr: String::from_utf8_lossy(&stderr_bytes).to_string(),
        exit_code: status.code(),
        duration_ms: duration.as_millis() as u64,
    })
}

#[tauri::command]
pub async fn terminal_detect_shells() -> Result<Vec<ShellInfo>, String> {
    tracing::info!("Detecting available shells");
    let shells = detect_available_shells();
    tracing::info!("Found {} available shells", shells.len());
    Ok(shells)
}

#[tauri::command]
pub async fn terminal_create_session(
    shell_type: String,
    cwd: Option<String>,
    state: State<'_, SessionManager>,
) -> Result<String, String> {
    tracing::info!("Creating terminal session with shell: {}", shell_type);

    let shell_type = match shell_type.to_lowercase().as_str() {
        "powershell" => ShellType::PowerShell,
        "cmd" => ShellType::Cmd,
        "wsl" => ShellType::Wsl,
        "gitbash" => ShellType::GitBash,
        _ => return Err(format!("Invalid shell type: {}", shell_type)),
    };

    let session_id = state
        .create_session(shell_type, cwd)
        .await
        .map_err(|e| format!("Failed to create session: {}", e))?;

    tracing::info!("Created terminal session: {}", session_id);
    Ok(session_id)
}

#[tauri::command]
pub async fn terminal_send_input(
    session_id: String,
    data: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state
        .send_input(&session_id, &data)
        .await
        .map_err(|e| format!("Failed to send input: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_resize(
    session_id: String,
    cols: u16,
    rows: u16,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state
        .resize_session(&session_id, cols, rows)
        .await
        .map_err(|e| format!("Failed to resize terminal: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_kill(
    session_id: String,
    state: State<'_, SessionManager>,
) -> Result<(), String> {
    state
        .kill_session(&session_id)
        .await
        .map_err(|e| format!("Failed to kill terminal: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn terminal_list_sessions(
    state: State<'_, SessionManager>,
) -> Result<Vec<String>, String> {
    let sessions = state.list_sessions().await;
    Ok(sessions)
}

#[tauri::command]
pub async fn terminal_get_history(
    session_id: String,
    limit: Option<usize>,
    _state: State<'_, SessionManager>,
    app: tauri::AppHandle,
) -> Result<Vec<String>, String> {
    let limit = limit.unwrap_or(50);
    let history =
        crate::features::terminal::session_manager::get_command_history(&app, &session_id, limit)
            .await
            .map_err(|e| format!("Failed to get history: {}", e))?;
    Ok(history)
}

#[tauri::command]
pub async fn terminal_ai_suggest_command(
    intent: String,
    shell_type: String,
    cwd: Option<String>,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
    tracing::info!("AI suggesting command for intent: {}", intent);

    let command = ai_state
        .suggest_command(&intent, &shell_type, cwd.as_deref())
        .await
        .map_err(|e| format!("Failed to generate command: {}", e))?;

    tracing::info!("AI suggested: {}", command);
    Ok(command)
}

#[tauri::command]
pub async fn terminal_ai_explain_error(
    error_output: String,
    command: Option<String>,
    shell_type: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
    tracing::info!("AI explaining error");

    let explanation = ai_state
        .explain_error(&error_output, command.as_deref(), &shell_type)
        .await
        .map_err(|e| format!("Failed to explain error: {}", e))?;

    Ok(explanation)
}

#[tauri::command]
pub async fn terminal_smart_commit(
    session_id: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<String, String> {
    tracing::info!("AI smart commit for session: {}", session_id);

    let result = ai_state
        .smart_commit(&session_id)
        .await
        .map_err(|e| format!("Smart commit failed: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub async fn terminal_ai_suggest_improvements(
    command: String,
    shell_type: String,
    ai_state: State<'_, TerminalAI>,
) -> Result<Option<String>, String> {
    tracing::info!("AI analyzing command: {}", command);

    let suggestions = ai_state
        .suggest_improvements(&command, &shell_type)
        .await
        .map_err(|e| format!("Failed to analyze command: {}", e))?;

    Ok(suggestions)
}
