use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorReport {
    pub error_type: String,
    pub message: String,
    pub stack_trace: Option<String>,
    pub context: HashMap<String, serde_json::Value>,
    pub timestamp: u64,
}

/// Report an error to the backend
#[tauri::command]
pub async fn error_report(error_data: ErrorReport) -> Result<(), String> {
    // Log the error
    tracing::error!(
        error_type = %error_data.error_type,
        message = %error_data.message,
        timestamp = error_data.timestamp,
        context = ?error_data.context,
        "Error reported from frontend"
    );

    // TODO: Send to external error reporting service (e.g., Sentry)
    // For now, just log it

    Ok(())
}

/// Report multiple errors in a batch
#[tauri::command]
pub async fn error_report_batch(reports: Vec<ErrorReport>) -> Result<(), String> {
    tracing::info!("Received batch of {} error reports", reports.len());

    for report in reports {
        error_report(report).await?;
    }

    Ok(())
}

/// Get the last N lines from the log file
#[tauri::command]
pub async fn error_get_logs(app: tauri::AppHandle, lines: usize) -> Result<Vec<String>, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let log_file = log_dir.join("agiworkforce.log");

    if !log_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&log_file)
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    let all_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

    // Get last N lines
    let start = all_lines.len().saturating_sub(lines);
    Ok(all_lines[start..].to_vec())
}

/// Clear all log files
#[tauri::command]
pub async fn error_clear_logs(app: tauri::AppHandle) -> Result<(), String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    if !log_dir.exists() {
        return Ok(());
    }

    // Read all log files
    let entries = fs::read_dir(&log_dir)
        .map_err(|e| format!("Failed to read log directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().and_then(|s| s.to_str()) == Some("log") {
            fs::remove_file(&path).map_err(|e| format!("Failed to remove log file: {}", e))?;
            tracing::info!("Removed log file: {:?}", path);
        }
    }

    tracing::info!("All log files cleared");
    Ok(())
}

/// Get error statistics
#[derive(Serialize)]
pub struct ErrorStats {
    pub total_errors: usize,
    pub critical_errors: usize,
    pub warnings: usize,
    pub log_file_size_bytes: u64,
}

#[tauri::command]
pub async fn error_get_stats(app: tauri::AppHandle) -> Result<ErrorStats, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let log_file = log_dir.join("agiworkforce.log");

    let (total_errors, critical_errors, warnings) = if log_file.exists() {
        let content = fs::read_to_string(&log_file)
            .map_err(|e| format!("Failed to read log file: {}", e))?;

        let total = content.matches("ERROR").count();
        let critical = content.matches("CRITICAL").count();
        let warn = content.matches("WARN").count();

        (total, critical, warn)
    } else {
        (0, 0, 0)
    };

    let log_file_size = if log_file.exists() {
        fs::metadata(&log_file)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .len()
    } else {
        0
    };

    Ok(ErrorStats {
        total_errors,
        critical_errors,
        warnings,
        log_file_size_bytes: log_file_size,
    })
}

/// Export error logs as JSON
#[tauri::command]
pub async fn error_export_logs(app: tauri::AppHandle) -> Result<String, String> {
    let log_dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Failed to get log directory: {}", e))?;

    let log_file = log_dir.join("agiworkforce.log");

    if !log_file.exists() {
        return Ok("[]".to_string());
    }

    let content = fs::read_to_string(&log_file)
        .map_err(|e| format!("Failed to read log file: {}", e))?;

    // Parse log lines into structured format
    let logs: Vec<HashMap<String, String>> = content
        .lines()
        .map(|line| {
            let mut entry = HashMap::new();
            entry.insert("line".to_string(), line.to_string());
            entry
        })
        .collect();

    serde_json::to_string_pretty(&logs).map_err(|e| format!("Failed to serialize logs: {}", e))
}
