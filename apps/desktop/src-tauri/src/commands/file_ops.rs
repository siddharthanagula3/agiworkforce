use crate::commands::AppDatabase;
use crate::db::models::PermissionType;
use crate::security::permissions::PermissionManager;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};
use tracing::{debug, info, warn};

/// File metadata information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileMetadata {
    pub size: u64,
    pub is_file: bool,
    pub is_dir: bool,
    pub created: i64,
    pub modified: i64,
    pub readonly: bool,
}

/// Directory entry information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_file: bool,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
}

/// File operation types for permission checking
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

/// Dangerous operation event for confirmation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DangerousOpEvent {
    pub operation: String,
    pub file_count: usize,
    pub paths: Vec<String>,
}

/// Check if a path is blacklisted (sensitive system directories)
fn is_blacklisted_path(path: &str) -> bool {
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
    ];

    blacklist
        .iter()
        .any(|blocked| path_lower.contains(&blocked.to_lowercase()))
}

/// Check file permission before operation
async fn check_file_permission(
    path: &str,
    operation: FileOperation,
    db: &AppDatabase,
) -> Result<bool, String> {
    // Check if path is blacklisted
    if is_blacklisted_path(path) {
        warn!("Attempted access to blacklisted path: {}", path);
        return Ok(false);
    }

    // Get permission manager
    let _conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

    let pm = PermissionManager::new(
        rusqlite::Connection::open_in_memory()
            .map_err(|e| format!("Failed to create permission manager: {}", e))?,
    );

    // Check permission (with path pattern for granular control)
    let permission_type = operation.to_permission_type();
    let is_allowed = pm
        .is_allowed(permission_type, Some(path))
        .map_err(|e| format!("Permission check failed: {}", e))?;

    if !is_allowed {
        let requires_prompt = pm
            .requires_prompt(permission_type, Some(path))
            .map_err(|e| format!("Permission check failed: {}", e))?;

        if requires_prompt {
            warn!(
                "Permission prompt required for {} on {}",
                operation.as_str(),
                path
            );
            // In a real implementation, this would emit an event to frontend
            // For now, we deny by default
            return Ok(false);
        }
    }

    Ok(is_allowed)
}

/// Log file operation to audit trail
async fn log_file_operation(
    path: &str,
    operation: FileOperation,
    success: bool,
    error: Option<String>,
    db: &AppDatabase,
) -> Result<(), String> {
    let conn = db
        .conn
        .lock()
        .map_err(|e| format!("Failed to acquire database lock: {}", e))?;

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
            true, // approved (permission was granted)
            success,
            error,
            0, // duration_ms (could be measured)
            now,
        ],
    )
    .map_err(|e| format!("Failed to log audit entry: {}", e))?;

    Ok(())
}

/// Check if operation is dangerous and requires confirmation
async fn _confirm_dangerous_operation(
    operation: &str,
    paths: &[String],
    app_handle: &AppHandle,
) -> Result<bool, String> {
    if paths.len() >= 10 {
        warn!(
            "Dangerous operation detected: {} on {} files",
            operation,
            paths.len()
        );

        // Emit event to frontend for confirmation
        let event = DangerousOpEvent {
            operation: operation.to_string(),
            file_count: paths.len(),
            paths: paths.to_vec(),
        };

        app_handle
            .emit("dangerous-operation", event)
            .map_err(|e| format!("Failed to emit dangerous operation event: {}", e))?;

        // For now, require explicit user action by returning false
        // In a real implementation, we'd wait for user response
        return Ok(false);
    }

    Ok(true)
}

// ============================================================================
// FILE CRUD OPERATIONS
// ============================================================================

/// Read file contents
#[tauri::command]
pub async fn file_read(
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<String, String> {
    debug!("Reading file: {}", path);

    // Check permissions
    if !check_file_permission(&path, FileOperation::Read, &state).await? {
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

    // Read file
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

/// Write file contents
#[tauri::command]
pub async fn file_write(
    path: String,
    content: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Writing file: {}", path);

    // Check permissions
    if !check_file_permission(&path, FileOperation::Write, &state).await? {
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

    // Create parent directory if it doesn't exist
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    // Write file
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

/// Delete file
#[tauri::command]
pub async fn file_delete(path: String, state: tauri::State<'_, AppDatabase>) -> Result<(), String> {
    debug!("Deleting file: {}", path);

    // Check permissions
    if !check_file_permission(&path, FileOperation::Delete, &state).await? {
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

    // Delete file
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

/// Rename/move file
#[tauri::command]
pub async fn file_rename(
    old_path: String,
    new_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Renaming file: {} -> {}", old_path, new_path);

    // Check permissions on both paths
    if !check_file_permission(&old_path, FileOperation::Delete, &state).await? {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&new_path, FileOperation::Write, &state).await? {
        return Err("Permission denied for destination file".to_string());
    }

    // Rename file
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

/// Copy file
#[tauri::command]
pub async fn file_copy(
    src: String,
    dest: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Copying file: {} -> {}", src, dest);

    // Check permissions
    if !check_file_permission(&src, FileOperation::Read, &state).await? {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&dest, FileOperation::Write, &state).await? {
        return Err("Permission denied for destination file".to_string());
    }

    // Copy file
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

/// Move file (copy + delete)
#[tauri::command]
pub async fn file_move(
    src: String,
    dest: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Moving file: {} -> {}", src, dest);

    // Check permissions
    if !check_file_permission(&src, FileOperation::Delete, &state).await? {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&dest, FileOperation::Write, &state).await? {
        return Err("Permission denied for destination file".to_string());
    }

    // Try rename first (faster if on same filesystem)
    match fs::rename(&src, &dest) {
        Ok(_) => {
            log_file_operation(&src, FileOperation::Delete, true, None, &state).await?;
            log_file_operation(&dest, FileOperation::Write, true, None, &state).await?;
            info!("Successfully moved file: {} -> {}", src, dest);
            Ok(())
        }
        Err(_) => {
            // Fall back to copy + delete
            fs::copy(&src, &dest).map_err(|e| format!("Failed to copy file: {}", e))?;
            fs::remove_file(&src).map_err(|e| format!("Failed to delete source file: {}", e))?;
            log_file_operation(&src, FileOperation::Delete, true, None, &state).await?;
            log_file_operation(&dest, FileOperation::Write, true, None, &state).await?;
            info!("Successfully moved file: {} -> {}", src, dest);
            Ok(())
        }
    }
}

/// Check if file exists
#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

/// Get file metadata
#[tauri::command]
pub async fn file_metadata(path: String) -> Result<FileMetadata, String> {
    debug!("Getting metadata for: {}", path);

    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get metadata: {}", e))?;

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

// ============================================================================
// DIRECTORY OPERATIONS
// ============================================================================

/// Create directory (including parent directories)
#[tauri::command]
pub async fn dir_create(path: String, state: tauri::State<'_, AppDatabase>) -> Result<(), String> {
    debug!("Creating directory: {}", path);

    // Check permissions
    if !check_file_permission(&path, FileOperation::Write, &state).await? {
        return Err("Permission denied".to_string());
    }

    // Create directory
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

/// List directory contents
#[tauri::command]
pub async fn dir_list(
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<Vec<DirEntry>, String> {
    debug!("Listing directory: {}", path);

    // Check permissions
    if !check_file_permission(&path, FileOperation::Read, &state).await? {
        return Err("Permission denied".to_string());
    }

    // Read directory
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

/// Delete directory
#[tauri::command]
pub async fn dir_delete(
    path: String,
    recursive: bool,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Deleting directory: {} (recursive: {})", path, recursive);

    // Check permissions
    if !check_file_permission(&path, FileOperation::Delete, &state).await? {
        return Err("Permission denied".to_string());
    }

    // Delete directory
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

/// Traverse directory with glob pattern
#[tauri::command]
pub async fn dir_traverse(
    path: String,
    glob_pattern: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<Vec<String>, String> {
    debug!(
        "Traversing directory: {} with pattern: {}",
        path, glob_pattern
    );

    // Check permissions
    if !check_file_permission(&path, FileOperation::Read, &state).await? {
        return Err("Permission denied".to_string());
    }

    // Build full glob pattern
    let full_pattern = if glob_pattern.is_empty() {
        format!("{}/**/*", path)
    } else {
        format!("{}/{}", path, glob_pattern)
    };

    // Execute glob
    let mut results = Vec::new();

    match glob::glob(&full_pattern) {
        Ok(paths) => {
            for entry in paths {
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
            return Err(format!("Invalid glob pattern: {}", e));
        }
    }

    log_file_operation(&path, FileOperation::Read, true, None, &state).await?;
    info!("Found {} files matching pattern", results.len());
    Ok(results)
}

// ============================================================================
// CONTEXT AND WORKSPACE OPERATIONS
// ============================================================================

/// File content with metadata for LLM context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileContextContent {
    pub content: String,
    pub size: u64,
    pub line_count: usize,
    pub language: Option<String>,
    pub excerpt: String, // First 500 characters for preview
}

/// Detect programming language from file extension
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

/// Read file content with metadata for LLM context
#[tauri::command]
pub async fn fs_read_file_content(
    file_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<FileContextContent, String> {
    debug!("Reading file content for context: {}", file_path);

    // Check permissions
    if !check_file_permission(&file_path, FileOperation::Read, &state).await? {
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

    // Read file
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

    // Get file size
    let metadata =
        fs::metadata(&file_path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let size = metadata.len();

    // Count lines
    let line_count = content.lines().count();

    // Detect language
    let language = detect_language(&file_path);

    // Create excerpt (first 500 characters)
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

/// Workspace file entry
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

/// Get list of files in workspace directory (non-recursive)
#[tauri::command]
pub async fn fs_get_workspace_files(
    workspace_path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<Vec<WorkspaceFile>, String> {
    debug!("Getting workspace files: {}", workspace_path);

    // Check permissions
    if !check_file_permission(&workspace_path, FileOperation::Read, &state).await? {
        return Err("Permission denied".to_string());
    }

    // Read directory
    let entries =
        fs::read_dir(&workspace_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let path_str = path.to_str().unwrap_or("").to_string();

        // Skip hidden files and common ignored directories
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

    // Sort: directories first, then files alphabetically
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

// ============================================================================
// TESTS
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_file_exists() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        // File doesn't exist yet
        assert!(!file_exists(file_path.to_str().unwrap().to_string())
            .await
            .unwrap());

        // Create file
        fs::write(&file_path, "test").unwrap();

        // File exists now
        assert!(file_exists(file_path.to_str().unwrap().to_string())
            .await
            .unwrap());
    }

    #[tokio::test]
    async fn test_file_metadata() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.txt");

        // Create file
        fs::write(&file_path, "test content").unwrap();

        // Get metadata
        let metadata = file_metadata(file_path.to_str().unwrap().to_string())
            .await
            .unwrap();

        assert!(metadata.is_file);
        assert!(!metadata.is_dir);
        assert_eq!(metadata.size, 12); // "test content" is 12 bytes
    }

    #[test]
    fn test_blacklist_check() {
        assert!(is_blacklisted_path("C:\\Windows\\System32\\kernel32.dll"));
        assert!(is_blacklisted_path("C:\\Program Files\\app\\file.exe"));
        assert!(is_blacklisted_path("/home/user/.ssh/id_rsa"));
        assert!(!is_blacklisted_path("C:\\Users\\user\\Documents\\file.txt"));
    }
}
