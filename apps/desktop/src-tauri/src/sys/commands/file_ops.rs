use crate::data::db::models::PermissionType;
use crate::sys::commands::settings::SettingsState;
use crate::sys::commands::AppDatabase;

use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};
use tracing::{debug, info, warn};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
    pub created: i64,
    pub modified: i64,
    pub readonly: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_file: bool,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
}

#[derive(Debug, Clone, Copy)]
pub enum FileOperation {
    Read,
    Write,
    Delete,
    Execute,
}

impl FileOperation {
    pub fn as_str(&self) -> &'static str {
        match self {
            FileOperation::Read => "read",
            FileOperation::Write => "write",
            FileOperation::Delete => "delete",
            FileOperation::Execute => "execute",
        }
    }

    pub fn to_permission_type(&self) -> PermissionType {
        match self {
            FileOperation::Read => PermissionType::FileRead,
            FileOperation::Write => PermissionType::FileWrite,
            FileOperation::Delete => PermissionType::FileDelete,
            FileOperation::Execute => PermissionType::FileExecute,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DangerousOpEvent {
    pub operation: String,
    pub file_count: usize,
    pub paths: Vec<String>,
}

/// Validates path security by canonicalizing first, then checking for traversal attacks.
/// Returns the canonical PathBuf on success to prevent TOCTOU vulnerabilities.
fn validate_path_security(path: &str) -> Result<PathBuf, String> {
    // Basic validation before any filesystem operations
    if path.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if path.len() > 4096 {
        return Err(format!(
            "Path too long: {} characters. Maximum is 4096",
            path.len()
        ));
    }
    if path.contains('\0') {
        return Err("Path contains null bytes which is not allowed".to_string());
    }

    // Canonicalize the path BEFORE checking for traversal
    // This prevents bypass attacks using encoded sequences or symlinks
    let canonical_path = if Path::new(path).exists() {
        // For existing paths, canonicalize directly
        fs::canonicalize(path).map_err(|e| format!("Failed to resolve path '{}': {}", path, e))?
    } else {
        // For non-existing paths (new files), canonicalize the parent and append filename
        let path_obj = Path::new(path);
        if let Some(parent) = path_obj.parent() {
            if parent.as_os_str().is_empty() {
                // Relative path with no parent directory - use current directory
                let current_dir = std::env::current_dir()
                    .map_err(|e| format!("Failed to get current directory: {}", e))?;
                let canonical_parent = fs::canonicalize(&current_dir)
                    .map_err(|e| format!("Failed to canonicalize current directory: {}", e))?;
                if let Some(file_name) = path_obj.file_name() {
                    canonical_parent.join(file_name)
                } else {
                    return Err(format!("Invalid path: no filename in '{}'", path));
                }
            } else if parent.exists() {
                let canonical_parent = fs::canonicalize(parent)
                    .map_err(|e| format!("Failed to resolve parent directory: {}", e))?;
                if let Some(file_name) = path_obj.file_name() {
                    canonical_parent.join(file_name)
                } else {
                    return Err(format!("Invalid path: no filename in '{}'", path));
                }
            } else {
                return Err(format!(
                    "Parent directory does not exist: {}",
                    parent.display()
                ));
            }
        } else {
            return Err(format!("Invalid path structure: {}", path));
        }
    };

    // Convert to string for security checks
    let canonical_str = canonical_path.to_string_lossy();

    // Check for directory traversal in the CANONICAL path
    // This catches attempts that might have been encoded or used symlinks
    if canonical_str.contains("..") {
        warn!(
            "Directory traversal detected after canonicalization: original='{}', canonical='{}'",
            path, canonical_str
        );
        return Err(
            "Path contains directory traversal (..) which is not allowed for security reasons"
                .to_string(),
        );
    }

    // Check blacklisted paths against the CANONICAL path
    if is_blacklisted_path(&canonical_str) {
        warn!(
            "Attempted access to blacklisted path: original='{}', canonical='{}'",
            path, canonical_str
        );
        return Err(format!(
            "Access to protected system path is not allowed: {}",
            canonical_str
        ));
    }

    Ok(canonical_path)
}

// AUDIT-003-014 fix: Escape glob special characters in path strings.
// This prevents directory names containing glob metacharacters from being
// interpreted as patterns, which could lead to unintended file access.
fn escape_glob_special_chars(path: &str) -> String {
    let mut escaped = String::with_capacity(path.len() * 2);
    for c in path.chars() {
        match c {
            // Glob metacharacters that need escaping
            '*' | '?' | '[' | ']' | '{' | '}' => {
                escaped.push('[');
                escaped.push(c);
                escaped.push(']');
            }
            // Escape backslash on non-Windows (on Windows it's a path separator)
            '\\' if !cfg!(windows) => {
                escaped.push('[');
                escaped.push('\\');
                escaped.push(']');
            }
            _ => escaped.push(c),
        }
    }
    escaped
}

pub(crate) fn is_blacklisted_path(path: &str) -> bool {
    let path_lower = path.to_lowercase();
    let blacklist = [
        "c:\\windows\\system32",
        "c:\\windows\\syswow64",
        "c:\\program files",
        "c:\\program files (x86)",
        "/windows/system32",
        "/program files",
        ".ssh",
        ".aws",
        ".gnupg",
        ".env",
        "credentials",
        "/etc/passwd",
        "/etc/shadow",
        // Protect private key directories (but not macOS /private/ system prefix)
        "private_keys",
        "privatekeys",
        "/private/etc/",
    ];

    blacklist
        .iter()
        .any(|blocked| path_lower.contains(&blocked.to_lowercase()))
}

fn is_path_allowed(canonical_path: &str, allowed_dirs: &[PathBuf]) -> bool {
    let canonical_normalized = canonical_path.replace('\\', "/");
    allowed_dirs.iter().any(|dir| {
        let dir_str = dir.to_string_lossy();
        let dir_normalized = dir_str.replace('\\', "/");
        canonical_normalized.starts_with(&dir_normalized)
    })
}

async fn check_file_permission(
    path: &str,
    operation: FileOperation,
    _db: &AppDatabase,
    app: Option<&AppHandle>,
) -> Result<bool, String> {
    let canonical_path = if Path::new(path).exists() {
        match std::fs::canonicalize(path) {
            Ok(p) => p.to_string_lossy().to_string(),
            Err(_) => path.to_string(),
        }
    } else if let Some(parent) = Path::new(path).parent() {
        if parent.exists() {
            match std::fs::canonicalize(parent) {
                Ok(p) => p
                    .join(Path::new(path).file_name().unwrap_or_default())
                    .to_string_lossy()
                    .to_string(),
                Err(_) => path.to_string(),
            }
        } else {
            path.to_string()
        }
    } else {
        path.to_string()
    };

    if is_blacklisted_path(&canonical_path) {
        warn!(
            "Attempted access to blacklisted path: {} (canonical: {})",
            path, canonical_path
        );
        return Ok(false);
    }

    debug!(
        "Permission check for {} operation on path: {}",
        operation.as_str(),
        canonical_path
    );

    let is_destructive = matches!(operation, FileOperation::Delete | FileOperation::Write);
    if is_destructive {
        debug!("Destructive operation {} on {}", operation.as_str(), path);
    }

    let allowed_dirs = if let Some(app_handle) = app {
        if let Some(settings_state) = app_handle.try_state::<SettingsState>() {
            let settings = settings_state.settings.lock().await;
            if settings.allowed_directories.is_empty() {
                warn!("No allowed directories configured; denying file operation");
                return Ok(false);
            }

            settings
                .allowed_directories
                .iter()
                .map(|dir| std::fs::canonicalize(dir).unwrap_or_else(|_| PathBuf::from(dir)))
                .collect::<Vec<_>>()
        } else {
            // M9: SettingsState is unavailable — fail closed rather than
            // falling back to the entire home directory. Returning false here
            // ensures no file operation is permitted without explicit configuration.
            tracing::warn!(
                "SettingsState unavailable for AppHandle — denying file operation as fail-safe"
            );
            return Ok(false);
        }
    } else {
        // M9: No AppHandle at all — same fail-closed policy.
        tracing::warn!("No AppHandle provided — denying file operation as fail-safe");
        return Ok(false);
    };
    if !is_path_allowed(&canonical_path, &allowed_dirs) {
        warn!(
            "Path not in allowed directories: {} (canonical: {})",
            path, canonical_path
        );
        return Ok(false);
    }

    Ok(true)
}

async fn log_file_operation(
    path: &str,
    operation: FileOperation,
    success: bool,
    error: Option<String>,
    db: &AppDatabase,
) -> Result<(), String> {
    let conn = db.connection()?;

    let operation_type = format!("FILE_{}", operation.as_str().to_uppercase());
    let details = serde_json::json!({
        "path": path,
        "operation": operation.as_str(),
        "success": success,
        "error": error,
    })
    .to_string();

    let permission_type = operation.to_permission_type().as_str();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO audit_log (operation_type, operation_details, permission_type, approved, success, error_message, duration_ms, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            operation_type,
            details,
            permission_type,
            true,
            success,
            error,
            0,
            now,
        ],
    )
    .map_err(|e| format!("Failed to log audit entry: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn file_read(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<String, String> {
    debug!("Reading file: {}", path);

    let _ = validate_path_security(&path)?;

    match fs::metadata(&path) {
        Ok(metadata) => {
            if metadata.len() > 100_000_000 {
                return Err(format!(
                    "File too large: {} bytes. Maximum is 100MB for safety",
                    metadata.len()
                ));
            }
            if !metadata.is_file() {
                return Err(format!("Path is not a file: {}", path));
            }
        }
        Err(e) => return Err(format!("Failed to access file metadata: {}", e)),
    }

    if !check_file_permission(&path, FileOperation::Read, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &path,
            FileOperation::Read,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    match fs::read_to_string(&path) {
        Ok(content) => {
            log_file_operation(&path, FileOperation::Read, true, None, &state).await?;
            info!("Successfully read file: {}", path);
            Ok(content)
        }
        Err(e) => {
            let error = format!("Failed to read file: {}", e);
            log_file_operation(
                &path,
                FileOperation::Read,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_write(
    app: AppHandle,
    path: String,
    content: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Writing file: {}", path);

    let _ = validate_path_security(&path)?;

    if content.len() > 100_000_000 {
        return Err(format!(
            "Content too large: {} bytes. Maximum is 100MB for safety",
            content.len()
        ));
    }

    if !check_file_permission(&path, FileOperation::Write, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &path,
            FileOperation::Write,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    match fs::write(&path, content) {
        Ok(_) => {
            log_file_operation(&path, FileOperation::Write, true, None, &state).await?;
            info!("Successfully wrote file: {}", path);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to write file: {}", e);
            log_file_operation(
                &path,
                FileOperation::Write,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_delete(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Deleting file: {}", path);

    let _ = validate_path_security(&path)?;

    match fs::metadata(&path) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Err(format!(
                    "Cannot delete: {} is not a file. Use dir_delete for directories",
                    path
                ));
            }
        }
        Err(_) => {
            return Err(format!("File does not exist: {}", path));
        }
    }

    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "file_delete",
        &serde_json::json!({ "path": path }),
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
    }

    if !check_file_permission(&path, FileOperation::Delete, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &path,
            FileOperation::Delete,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    match fs::remove_file(&path) {
        Ok(_) => {
            log_file_operation(&path, FileOperation::Delete, true, None, &state).await?;
            info!("Successfully deleted file: {}", path);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to delete file: {}", e);
            log_file_operation(
                &path,
                FileOperation::Delete,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_rename(
    app: AppHandle,
    old_path: String,
    new_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Renaming file: {} -> {}", old_path, new_path);

    let _ = validate_path_security(&old_path)?;
    let _ = validate_path_security(&new_path)?;

    if !Path::new(&old_path).exists() {
        return Err(format!("Source file does not exist: {}", old_path));
    }

    if Path::new(&new_path).exists() {
        return Err(format!(
            "Destination already exists: {}. Cannot overwrite",
            new_path
        ));
    }

    if !check_file_permission(&old_path, FileOperation::Delete, &state, Some(&app)).await? {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&new_path, FileOperation::Write, &state, Some(&app)).await? {
        return Err("Permission denied for destination file".to_string());
    }

    match fs::rename(&old_path, &new_path) {
        Ok(_) => {
            log_file_operation(&old_path, FileOperation::Delete, true, None, &state).await?;
            log_file_operation(&new_path, FileOperation::Write, true, None, &state).await?;
            info!("Successfully renamed file: {} -> {}", old_path, new_path);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to rename file: {}", e);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_copy(
    app: AppHandle,
    src: String,
    dest: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Copying file: {} -> {}", src, dest);

    let _ = validate_path_security(&src)?;
    let _ = validate_path_security(&dest)?;

    match fs::metadata(&src) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Err(format!("Source is not a file: {}", src));
            }

            if metadata.len() > 1_000_000_000 {
                return Err(format!(
                    "File too large to copy: {} bytes. Maximum is 1GB",
                    metadata.len()
                ));
            }
        }
        Err(_) => return Err(format!("Source file does not exist: {}", src)),
    }

    if Path::new(&dest).exists() {
        return Err(format!(
            "Destination already exists: {}. Cannot overwrite",
            dest
        ));
    }

    if !check_file_permission(&src, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&dest, FileOperation::Write, &state, Some(&app)).await? {
        return Err("Permission denied for destination file".to_string());
    }

    match fs::copy(&src, &dest) {
        Ok(_) => {
            log_file_operation(&dest, FileOperation::Write, true, None, &state).await?;
            info!("Successfully copied file: {} -> {}", src, dest);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to copy file: {}", e);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_move(
    app: AppHandle,
    src: String,
    dest: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Moving file: {} -> {}", src, dest);

    let _ = validate_path_security(&src)?;
    let _ = validate_path_security(&dest)?;

    match fs::metadata(&src) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Err(format!("Source is not a file: {}", src));
            }

            if metadata.len() > 1_000_000_000 {
                return Err(format!(
                    "File too large to move: {} bytes. Maximum is 1GB",
                    metadata.len()
                ));
            }
        }
        Err(_) => return Err(format!("Source file does not exist: {}", src)),
    }

    if Path::new(&dest).exists() {
        return Err(format!(
            "Destination already exists: {}. Cannot overwrite",
            dest
        ));
    }

    if !check_file_permission(&src, FileOperation::Delete, &state, Some(&app)).await? {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&dest, FileOperation::Write, &state, Some(&app)).await? {
        return Err("Permission denied for destination file".to_string());
    }

    if let Some(parent) = Path::new(&dest).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create destination directory: {}", e))?;
        }
    }

    match fs::rename(&src, &dest) {
        Ok(_) => {
            log_file_operation(&src, FileOperation::Delete, true, None, &state).await?;
            log_file_operation(&dest, FileOperation::Write, true, None, &state).await?;
            info!("Successfully moved file: {} -> {}", src, dest);
            Ok(())
        }
        Err(_) => {
            fs::copy(&src, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
            fs::remove_file(&src).map_err(|e| format!("Failed to delete source file: {}", e))?;
            log_file_operation(&src, FileOperation::Delete, true, None, &state).await?;
            log_file_operation(&dest, FileOperation::Write, true, None, &state).await?;
            info!("Successfully moved file: {} -> {}", src, dest);
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    let _ = validate_path_security(&path)?;

    Ok(Path::new(&path).exists())
}

#[tauri::command]
pub async fn file_open_with_default_app(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Opening path with default app: {}", path);

    let canonical_path = validate_path_security(&path)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    match fs::metadata(&canonical_path) {
        Ok(metadata) => {
            if !metadata.is_file() && !metadata.is_dir() {
                return Err(format!(
                    "Path is neither a file nor directory: {}",
                    canonical_str
                ));
            }
        }
        Err(e) => return Err(format!("Path does not exist or is not accessible: {}", e)),
    }

    if !check_file_permission(&canonical_str, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = std::process::Command::new("open");
        cmd.arg(&canonical_str);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = std::process::Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-Command",
            "Start-Process",
            "-FilePath",
            &canonical_str,
        ]);
        cmd
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(&canonical_str);
        cmd
    };

    command
        .spawn()
        .map_err(|e| format!("Failed to launch default app: {}", e))?;

    log_file_operation(&canonical_str, FileOperation::Execute, true, None, &state).await?;
    info!("Opened path with default app: {}", canonical_str);
    Ok(())
}

#[tauri::command]
pub async fn file_metadata(path: String) -> Result<FileMetadata, String> {
    debug!("Getting metadata for: {}", path);

    let _ = validate_path_security(&path)?;

    let metadata =
        fs::metadata(&path).map_err(|e| format!("Failed to get metadata for '{}': {}", path, e))?;

    let created = metadata
        .created()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let modified = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    Ok(FileMetadata {
        size: metadata.len(),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        created,
        modified,
        readonly: metadata.permissions().readonly(),
    })
}

#[tauri::command]
pub async fn dir_create(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Creating directory: {}", path);

    let _ = validate_path_security(&path)?;

    if Path::new(&path).exists() {
        return Err(format!("Path already exists: {}", path));
    }

    if !check_file_permission(&path, FileOperation::Write, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    match fs::create_dir_all(&path) {
        Ok(_) => {
            log_file_operation(&path, FileOperation::Write, true, None, &state).await?;
            info!("Successfully created directory: {}", path);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to create directory: {}", e);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn dir_list(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<Vec<DirEntry>, String> {
    debug!("Listing directory: {}", path);

    let _ = validate_path_security(&path)?;

    match fs::metadata(&path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!("Path is not a directory: {}", path));
            }
        }
        Err(_) => return Err(format!("Directory does not exist: {}", path)),
    }

    if !check_file_permission(&path, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    let entries = fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut results = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path_buf = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        let modified = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        results.push(DirEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path_buf.to_string_lossy().to_string(),
            is_file: metadata.is_file(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified,
        });
    }

    log_file_operation(&path, FileOperation::Read, true, None, &state).await?;
    Ok(results)
}

#[tauri::command]
pub async fn dir_delete(
    app: AppHandle,
    path: String,
    recursive: bool,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Deleting directory: {} (recursive: {})", path, recursive);

    let _ = validate_path_security(&path)?;

    match fs::metadata(&path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!(
                    "Path is not a directory: {}. Use file_delete for files",
                    path
                ));
            }
        }
        Err(_) => return Err(format!("Directory does not exist: {}", path)),
    }

    if recursive {
        warn!("Recursive directory deletion requested for: {}", path);
        if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
            &app,
            "dir_delete",
            &serde_json::json!({ "path": path, "recursive": true }),
        )
        .await?
        {
            return Err("Operation denied by user".to_string());
        }
    }

    if !check_file_permission(&path, FileOperation::Delete, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    let result = if recursive {
        fs::remove_dir_all(&path)
    } else {
        fs::remove_dir(&path)
    };

    match result {
        Ok(_) => {
            log_file_operation(&path, FileOperation::Delete, true, None, &state).await?;
            info!("Successfully deleted directory: {}", path);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to delete directory: {}", e);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn dir_traverse(
    app: AppHandle,
    path: String,
    glob_pattern: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<Vec<String>, String> {
    debug!(
        "Traversing directory: {} with pattern: {}",
        path, glob_pattern
    );

    let _ = validate_path_security(&path)?;

    if glob_pattern.contains("..") {
        return Err("Glob pattern cannot contain directory traversal (..)".to_string());
    }
    if glob_pattern.len() > 1000 {
        return Err(format!(
            "Glob pattern too long: {} characters. Maximum is 1000",
            glob_pattern.len()
        ));
    }

    match fs::metadata(&path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!("Path is not a directory: {}", path));
            }
        }
        Err(_) => return Err(format!("Directory does not exist: {}", path)),
    }

    if !check_file_permission(&path, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    // AUDIT-003-014 fix: Escape glob special characters in the base path to prevent
    // unintended pattern matching. Special characters in the base path should be
    // treated literally, not as glob metacharacters.
    let escaped_path = escape_glob_special_chars(&path);

    let full_pattern = if glob_pattern.is_empty() {
        format!("{}*", escaped_path)
    } else {
        format!("{}/{}", escaped_path, glob_pattern)
    };

    let mut results = Vec::new();
    const MAX_RESULTS: usize = 10_000;

    match glob::glob(&full_pattern) {
        Ok(paths) => {
            for (index, entry) in paths.enumerate() {
                if index >= MAX_RESULTS {
                    warn!("Glob result limit reached: {} files", MAX_RESULTS);
                    break;
                }

                match entry {
                    Ok(path_buf) => {
                        results.push(path_buf.to_string_lossy().to_string());
                    }
                    Err(e) => {
                        warn!("Glob error: {}", e);
                    }
                }
            }
        }
        Err(e) => {
            return Err(format!("Glob search failed: {}", e));
        }
    }
    Ok(results)
}

// ─────────────────────────────────────────────────────────────────────────────
// file_read_range — Read with line-number offset + limit (OpenCode parity)
// ─────────────────────────────────────────────────────────────────────────────

/// Response for a ranged file read.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadRangeResult {
    /// The lines requested (joined with newlines), prefixed with line numbers.
    pub content: String,
    /// 1-indexed line number of the first returned line.
    pub start_line: usize,
    /// 1-indexed line number of the last returned line.
    pub end_line: usize,
    /// Total number of lines in the file.
    pub total_lines: usize,
    /// True when there are more lines beyond `end_line`.
    pub has_more: bool,
}

/// Read a file with a line-number offset and limit.
///
/// Each returned line is prefixed with its 1-based line number: `"42: <content>"`.
/// This matches the OpenCode `Read(path, offset, limit)` tool signature and lets
/// the agent navigate large files without loading them entirely into context.
///
/// # Arguments
/// * `path`   — Absolute or relative path to the file.
/// * `offset` — 1-indexed line number to start from (default 1).
/// * `limit`  — Maximum number of lines to return (default 2000, max 5000).
#[tauri::command]
pub async fn file_read_range(
    app: AppHandle,
    path: String,
    offset: Option<usize>,
    limit: Option<usize>,
    state: tauri::State<'_, AppDatabase>,
) -> Result<FileReadRangeResult, String> {
    debug!(
        "Reading file with range: {} offset={:?} limit={:?}",
        path, offset, limit
    );

    let _ = validate_path_security(&path)?;

    match fs::metadata(&path) {
        Ok(metadata) => {
            if metadata.len() > 100_000_000 {
                return Err(format!(
                    "File too large: {} bytes. Maximum is 100MB for safety",
                    metadata.len()
                ));
            }
            if !metadata.is_file() {
                return Err(format!("Path is not a file: {}", path));
            }
        }
        Err(e) => return Err(format!("Failed to access file metadata: {}", e)),
    }

    if !check_file_permission(&path, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    let content_str =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;

    log_file_operation(&path, FileOperation::Read, true, None, &state).await?;

    let all_lines: Vec<&str> = content_str.lines().collect();
    let total_lines = all_lines.len();

    // Clamp offset to valid range (1-indexed input → 0-indexed internal).
    let start_0 = offset.unwrap_or(1).saturating_sub(1).min(total_lines);
    let max_limit = 5000usize;
    let take = limit.unwrap_or(2000).min(max_limit);

    let end_exclusive = (start_0 + take).min(total_lines);
    let selected = &all_lines[start_0..end_exclusive];

    // Prefix each line with its 1-based line number.
    let content = selected
        .iter()
        .enumerate()
        .map(|(i, line)| format!("{}: {}", start_0 + i + 1, line))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(FileReadRangeResult {
        content,
        start_line: start_0 + 1,
        end_line: end_exclusive,
        total_lines,
        has_more: end_exclusive < total_lines,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContextContent {
    pub content: String,
    pub size: u64,
    pub line_count: usize,
    pub language: Option<String>,
    pub excerpt: String,
}

fn detect_language(path: &str) -> Option<String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())?;

    let language = match extension.as_str() {
        "rs" => "rust",
        "js" => "javascript",
        "ts" => "typescript",
        "tsx" => "typescript",
        "jsx" => "javascript",
        "py" => "python",
        "go" => "go",
        "java" => "java",
        "cpp" | "cc" | "cxx" => "cpp",
        "c" => "c",
        "h" | "hpp" => "cpp",
        "cs" => "csharp",
        "rb" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "kt" => "kotlin",
        "scala" => "scala",
        "sh" | "bash" => "bash",
        "ps1" => "powershell",
        "sql" => "sql",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" | "sass" => "scss",
        "json" => "json",
        "xml" => "xml",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "md" | "markdown" => "markdown",
        "txt" => "text",
        _ => return None,
    };

    Some(language.to_string())
}

#[tauri::command]
pub async fn fs_read_file_content(
    app: AppHandle,
    file_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<FileContextContent, String> {
    debug!("Reading file content for context: {}", file_path);

    let _ = validate_path_security(&file_path)?;

    match fs::metadata(&file_path) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Err(format!("Path is not a file: {}", file_path));
            }

            // Smaller safety cap for context reads (prevents huge file ingestion)
            if metadata.len() > 10_000_000 {
                return Err(format!(
                    "File too large for context read: {} bytes. Maximum is 10MB",
                    metadata.len()
                ));
            }
        }
        Err(e) => return Err(format!("Failed to access file metadata: {}", e)),
    }

    if !check_file_permission(&file_path, FileOperation::Read, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &file_path,
            FileOperation::Read,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    let content = match fs::read_to_string(&file_path) {
        Ok(content) => content,
        Err(e) => {
            let error = format!("Failed to read file: {}", e);
            log_file_operation(
                &file_path,
                FileOperation::Read,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            return Err(error);
        }
    };

    let metadata =
        fs::metadata(&file_path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let size = metadata.len();

    let line_count = content.lines().count();

    let language = detect_language(&file_path);

    let excerpt = if content.len() > 500 {
        format!("{}...", &content[..500])
    } else {
        content.clone()
    };

    log_file_operation(&file_path, FileOperation::Read, true, None, &state).await?;

    Ok(FileContextContent {
        content,
        size,
        line_count,
        language,
        excerpt,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFile {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub language: Option<String>,
}

#[tauri::command]
pub async fn fs_get_workspace_files(
    app: AppHandle,
    workspace_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<Vec<WorkspaceFile>, String> {
    debug!("Getting workspace files: {}", workspace_path);

    let _ = validate_path_security(&workspace_path)?;

    match fs::metadata(&workspace_path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!("Path is not a directory: {}", workspace_path));
            }
        }
        Err(_) => return Err(format!("Directory does not exist: {}", workspace_path)),
    }

    if !check_file_permission(&workspace_path, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    let entries =
        fs::read_dir(&workspace_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let path_str = path.to_str().unwrap_or("").to_string();

        let name = entry.file_name().to_str().unwrap_or("").to_string();
        if name.starts_with('.')
            || name == "node_modules"
            || name == "target"
            || name == "dist"
            || name == "build"
        {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let is_file = metadata.is_file();
        let is_dir = metadata.is_dir();
        let size = metadata.len();

        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string());

        let language = if is_file {
            detect_language(&path_str)
        } else {
            None
        };

        files.push(WorkspaceFile {
            path: path_str,
            name,
            size,
            is_file,
            is_dir,
            extension,
            language,
        });
    }

    files.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_file_exists() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        assert!(!file_exists(file_path.to_str().unwrap().to_string())
            .await
            .unwrap());

        fs::write(&file_path, "test").unwrap();

        assert!(file_exists(file_path.to_str().unwrap().to_string())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn test_file_metadata() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        fs::write(&file_path, "test content").unwrap();

        let metadata = file_metadata(file_path.to_str().unwrap().to_string())
            .await
            .unwrap();

        assert!(metadata.is_file);
        assert!(!metadata.is_dir);
        assert_eq!(metadata.size, 12);
    }

    #[test]
    fn test_blacklist_check() {
        assert!(is_blacklisted_path("C:\\Windows\\System32\\kernel32.dll"));
        assert!(is_blacklisted_path("C:\\Program Files\\app\\file.exe"));
        assert!(is_blacklisted_path("/home/user/.ssh/id_rsa"));
        assert!(!is_blacklisted_path("C:\\Users\\user\\Documents\\file.txt"));
    }
}

#[tauri::command]
pub async fn file_read_text(
    app: AppHandle,
    file_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<String, String> {
    let _ = validate_path_security(&file_path)?;

    if !check_file_permission(&file_path, FileOperation::Read, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &file_path,
            FileOperation::Read,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    match fs::read_to_string(&file_path) {
        Ok(content) => {
            log_file_operation(&file_path, FileOperation::Read, true, None, &state).await?;
            Ok(content)
        }
        Err(e) => {
            let error = format!("Failed to read file: {}", e);
            log_file_operation(
                &file_path,
                FileOperation::Read,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_write_text(
    app: AppHandle,
    file_path: String,
    content: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    let _ = validate_path_security(&file_path)?;

    if content.len() > 100_000_000 {
        return Err(format!(
            "Content too large: {} bytes. Maximum is 100MB",
            content.len()
        ));
    }

    if !check_file_permission(&file_path, FileOperation::Write, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &file_path,
            FileOperation::Write,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    if let Some(parent) = Path::new(&file_path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    match fs::write(&file_path, content) {
        Ok(_) => {
            log_file_operation(&file_path, FileOperation::Write, true, None, &state).await?;
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to write file: {}", e);
            log_file_operation(
                &file_path,
                FileOperation::Write,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_read_binary(
    app: AppHandle,
    file_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<String, String> {
    let _ = validate_path_security(&file_path)?;

    if !check_file_permission(&file_path, FileOperation::Read, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &file_path,
            FileOperation::Read,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    match fs::read(&file_path) {
        Ok(data) => {
            log_file_operation(&file_path, FileOperation::Read, true, None, &state).await?;
            Ok(general_purpose::STANDARD.encode(&data))
        }
        Err(e) => {
            let error = format!("Failed to read file: {}", e);
            log_file_operation(
                &file_path,
                FileOperation::Read,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_write_binary(
    app: AppHandle,
    file_path: String,
    base64_content: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    let _ = validate_path_security(&file_path)?;

    if base64_content.len() > 134_000_000 {
        return Err("Content too large. Maximum is 100MB decoded".to_string());
    }

    if !check_file_permission(&file_path, FileOperation::Write, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &file_path,
            FileOperation::Write,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    let data = general_purpose::STANDARD
        .decode(&base64_content)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    if let Some(parent) = Path::new(&file_path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    match fs::write(&file_path, data) {
        Ok(_) => {
            log_file_operation(&file_path, FileOperation::Write, true, None, &state).await?;
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to write file: {}", e);
            log_file_operation(
                &file_path,
                FileOperation::Write,
                false,
                Some(error.clone()),
                &state,
            )
            .await?;
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_get_metadata(file_path: String) -> Result<FileMetadata, String> {
    let _ = validate_path_security(&file_path)?;

    let metadata =
        fs::metadata(&file_path).map_err(|e| format!("Failed to get metadata: {}", e))?;

    let created = metadata
        .created()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let modified = metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    Ok(FileMetadata {
        size: metadata.len(),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        created,
        modified,
        readonly: metadata.permissions().readonly(),
    })
}

#[tauri::command]
pub async fn undo_file_operation(
    app: AppHandle,
    operation: String,
    path: String,
    content: Option<String>,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    info!("Undo file operation: {} on {}", operation, path);

    let _ = validate_path_security(&path)?;

    match operation.as_str() {
        "restore" => {
            let content = content.ok_or("Content required for restore operation")?;

            if content.len() > 100_000_000 {
                return Err(format!(
                    "Content too large: {} bytes. Maximum is 100MB",
                    content.len()
                ));
            }

            if !check_file_permission(&path, FileOperation::Write, &state, Some(&app)).await? {
                return Err("Permission denied".to_string());
            }

            if let Some(parent) = Path::new(&path).parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }
            }

            fs::write(&path, content).map_err(|e| format!("Failed to restore file: {}", e))?;
            log_file_operation(&path, FileOperation::Write, true, None, &state).await?;
            info!("Successfully restored file: {}", path);
            Ok(())
        }
        "delete" => {
            if !check_file_permission(&path, FileOperation::Delete, &state, Some(&app)).await? {
                return Err("Permission denied".to_string());
            }

            if Path::new(&path).exists() {
                fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))?;
                log_file_operation(&path, FileOperation::Delete, true, None, &state).await?;
                info!("Successfully deleted file: {}", path);
            }
            Ok(())
        }
        "create" => {
            let content = content.ok_or("Content required for create operation")?;

            if content.len() > 100_000_000 {
                return Err(format!(
                    "Content too large: {} bytes. Maximum is 100MB",
                    content.len()
                ));
            }

            if !check_file_permission(&path, FileOperation::Write, &state, Some(&app)).await? {
                return Err("Permission denied".to_string());
            }

            if let Some(parent) = Path::new(&path).parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }
            }

            fs::write(&path, content).map_err(|e| format!("Failed to create file: {}", e))?;
            log_file_operation(&path, FileOperation::Write, true, None, &state).await?;
            info!("Successfully created file: {}", path);
            Ok(())
        }
        _ => Err(format!("Unknown undo operation: {}", operation)),
    }
}
