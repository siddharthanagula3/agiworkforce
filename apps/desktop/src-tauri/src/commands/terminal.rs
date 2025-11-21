use crate::terminal::{detect_available_shells, SessionManager, ShellInfo, ShellType, TerminalAI};
use tauri::State;

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
    let history = crate::terminal::session_manager::get_command_history(&app, &session_id, limit)
        .await
        .map_err(|e| format!("Failed to get history: {}", e))?;
    Ok(history)
}

// AI-assisted terminal commands

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
