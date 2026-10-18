use crate::data::db::models::PermissionType;
use crate::sys::commands::settings::SettingsState;
use crate::sys::commands::AppDatabase;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::{AppHandle, Manager};
use tracing::{debug, info, warn};

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

pub(crate) fn validate_path_security(path: &str) -> Result<PathBuf, String> {
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

    if Path::new(path)
        .components()
        .any(|part| part == std::path::Component::ParentDir)
    {
        return Err(
            "Path contains directory traversal (..) which is not allowed for security reasons"
                .to_string(),
        );
    }
    #[cfg(windows)]
    if matches!(
        Path::new(path).components().next(),
        Some(std::path::Component::Prefix(_))
    ) && !Path::new(path).is_absolute()
    {
        return Err("Drive-relative paths are not allowed".to_string());
    }

    let path_exists = match fs::symlink_metadata(path) {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("Failed to inspect path '{}': {}", path, error)),
    };
    let canonical_path = if path_exists {
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

fn validate_read_path(path: &str) -> Result<PathBuf, String> {
    let canonical = validate_path_security(path)?;
    if crate::sys::security::blocked_paths::is_blocked(&canonical) {
        return Err(format!(
            "Access denied: path is on the blocked-paths denylist: {}",
            path
        ));
    }
    Ok(canonical)
}

/// The previous implementation walked a substring
/// blacklist via `path_lower.contains(blocked)`, which produced both
/// false positives (`events.txt` blocked because it contained `.ent`-ish
/// patterns is the canonical example) and false negatives (`.envrc`,
/// `.kube/config`, `.netrc`, `id_rsa`, `.docker/config.json` weren't on
/// the list at all). The new implementation compares **canonical path
/// components** and per-component file names, so `.env` matches the
/// directory `~/.env` and the file `~/.env` but not `~/dev/.envrc-prod`.
pub(crate) fn is_blacklisted_path(path: &str) -> bool {
    let path = std::path::Path::new(path);

    // Per-component basenames that are unsafe regardless of where they
    // appear in the tree. Matches `.ssh/config` and `~/.ssh` but not
    // `~/dev/.ssh-keys/notes.md`.
    const BLOCKED_BASENAMES: &[&str] = &[
        ".ssh",
        ".aws",
        ".gnupg",
        ".env",
        ".envrc",
        ".netrc",
        ".kube",
        ".docker",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
        "id_dsa",
        "credentials",
        "private_keys",
        "privatekeys",
    ];

    // Absolute path prefixes that must not be touched. Canonical paths on
    // macOS resolve `/etc` → `/private/etc`; we list both forms.
    const BLOCKED_PREFIXES: &[&str] = &[
        "/etc/passwd",
        "/etc/shadow",
        "/etc/sudoers",
        "/private/etc/passwd",
        "/private/etc/shadow",
        "/private/etc/sudoers",
        "/private/etc/master.passwd",
        "C:\\Windows\\System32",
        "C:\\Windows\\SysWOW64",
        "C:\\Program Files",
        "C:\\Program Files (x86)",
    ];

    let path_str = path.to_string_lossy();
    let path_lower = path_str.to_lowercase();
    if BLOCKED_PREFIXES.iter().any(|prefix| {
        crate::sys::security::blocked_paths::path_is_within(
            Path::new(&path_lower),
            Path::new(&prefix.to_lowercase()),
        )
    }) {
        return true;
    }

    // path.components() on Linux/macOS does not recognise `\` as a path
    // separator, so a Windows-style input like `C:\\Users\\user\\.env`
    // would come through as a single Normal component and we'd miss the
    // `.env` basename. Split manually on both separators so the check
    // works the same on every host where the test runs.
    for raw_segment in path_str.split(['/', '\\']) {
        let segment_lower = raw_segment.to_lowercase();
        if BLOCKED_BASENAMES.iter().any(|b| segment_lower == *b) {
            return true;
        }
    }

    false
}

pub(crate) fn is_path_allowed(canonical_path: &str, allowed_dirs: &[PathBuf]) -> bool {
    let canonical_normalized = canonical_path.replace('\\', "/");
    allowed_dirs.iter().any(|dir| {
        let dir_str = dir.to_string_lossy();
        let dir_normalized = dir_str.replace('\\', "/");
        // The previous `starts_with(&dir_normalized)`
        // matched `/Users/foo` against `/Users/foobar` (prefix lookalike).
        // Trim trailing separator and require exact-match OR subpath-after-sep.
        let dir_trimmed = dir_normalized.trim_end_matches('/');
        canonical_normalized == dir_trimmed
            || canonical_normalized.starts_with(&format!("{}/", dir_trimmed))
    })
}

/// The folders the user has granted, each as the filesystem resolves it now:
/// the list every path a command is handed is tested against with
/// [`is_path_allowed`]. `None` when the settings cannot be read, which a
/// caller treats as nothing granted.
pub(crate) async fn granted_directories(app: &AppHandle) -> Option<Vec<PathBuf>> {
    let settings_state = app.try_state::<SettingsState>()?;
    let settings = settings_state.settings.lock().await;
    Some(
        settings
            .allowed_directories
            .iter()
            .map(|dir| std::fs::canonicalize(dir).unwrap_or_else(|_| PathBuf::from(dir)))
            .collect(),
    )
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
        match granted_directories(app_handle).await {
            Some(dirs) if dirs.is_empty() => {
                warn!("No allowed directories configured; denying file operation");
                return Ok(false);
            }
            Some(dirs) => dirs,
            None => {
                // M9: SettingsState is unavailable, fail closed rather than
                // falling back to the entire home directory. Returning false here
                // ensures no file operation is permitted without explicit configuration.
                tracing::warn!(
                    "SettingsState unavailable for AppHandle, denying file operation as fail-safe"
                );
                return Ok(false);
            }
        }
    } else {
        // M9: No AppHandle at all, same fail-closed policy.
        tracing::warn!("No AppHandle provided, denying file operation as fail-safe");
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

/// The test `file_read` applies, for a page command outside this module that
/// is handed a path: it must lie in a folder the person granted, which
/// includes the open project folder, and off the denylist. The refusal is the
/// sentence the person reads.
pub(crate) async fn require_granted_path(
    app: &AppHandle,
    path: &str,
    operation: FileOperation,
) -> Result<PathBuf, String> {
    let canonical = validate_read_path(path)?;
    let Some(database) = app.try_state::<AppDatabase>() else {
        return Err("The local database is unavailable, so no file can be opened.".to_string());
    };
    if check_file_permission(path, operation, &database, Some(app)).await? {
        Ok(canonical)
    } else {
        Err(format!(
            "{path} is outside the folders you have allowed. Add its folder in Settings, Allowed Directories, or open it as the project folder."
        ))
    }
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

    let canonical = validate_read_path(&path)?;

    // Use the canonical (symlink-resolved) path for all fs ops.
    match fs::symlink_metadata(&canonical) {
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
            if metadata.file_type().is_symlink() {
                return Err("Refusing to read through symlink".to_string());
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

    match fs::read_to_string(&canonical) {
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

    let canonical = validate_path_security(&path)?;
    let canonical_str = canonical.to_string_lossy().to_string();
    // Centralized blocked-path denylist.
    if crate::sys::security::blocked_paths::is_blocked(&canonical) {
        return Err(format!(
            "Access denied: path is on the blocked-paths denylist: {}",
            canonical_str
        ));
    }

    if content.len() > 100_000_000 {
        return Err(format!(
            "Content too large: {} bytes. Maximum is 100MB for safety",
            content.len()
        ));
    }

    // Require HITL on file_write so an indirect
    // prompt-injection-driven agent cannot silently overwrite files in the
    // user's allowed dirs (e.g. ~/Projects/.git/hooks/pre-commit,
    // ~/.cargo/config.toml). Pattern mirrors file_delete (line 545).
    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "file_write",
        &serde_json::json!({ "path": &canonical_str, "size_bytes": content.len() }),
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
    }

    if !check_file_permission(&canonical_str, FileOperation::Write, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &canonical_str,
            FileOperation::Write,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    // Canonicalize parent and rejoin filename so writes to nonexistent files still pin to a real dir.
    let write_target: std::path::PathBuf = if canonical.exists() {
        canonical.clone()
    } else {
        let parent = Path::new(&path)
            .parent()
            .ok_or_else(|| format!("Path has no parent: {}", path))?;
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize parent: {}", e))?;
        let file_name = Path::new(&path)
            .file_name()
            .ok_or_else(|| format!("Path missing filename: {}", path))?;
        canonical_parent.join(file_name)
    };

    #[cfg(unix)]
    let write_result: std::io::Result<()> = (|| {
        use std::io::Write as _;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .custom_flags(libc::O_NOFOLLOW)
            .open(&write_target)?;
        f.write_all(content.as_bytes())
    })();
    #[cfg(not(unix))]
    let write_result = fs::write(&write_target, content.as_bytes());

    match write_result {
        Ok(_) => {
            log_file_operation(&canonical_str, FileOperation::Write, true, None, &state).await?;
            info!("Successfully wrote file: {}", canonical_str);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to write file: {}", e);
            log_file_operation(
                &canonical_str,
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

    let canonical_path = validate_path_security(&path)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    match fs::metadata(&canonical_path) {
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
        &serde_json::json!({ "path": &canonical_str }),
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
    }

    if !check_file_permission(&canonical_str, FileOperation::Delete, &state, Some(&app)).await? {
        let error = "Permission denied".to_string();
        log_file_operation(
            &canonical_str,
            FileOperation::Delete,
            false,
            Some(error.clone()),
            &state,
        )
        .await?;
        return Err(error);
    }

    match fs::remove_file(&canonical_path) {
        Ok(_) => {
            log_file_operation(&canonical_str, FileOperation::Delete, true, None, &state).await?;
            info!("Successfully deleted file: {}", canonical_str);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to delete file: {}", e);
            log_file_operation(
                &canonical_str,
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

    let canonical_old_path = validate_path_security(&old_path)?;
    let canonical_new_path = validate_path_security(&new_path)?;
    let canonical_old_str = canonical_old_path.to_string_lossy().to_string();
    let canonical_new_str = canonical_new_path.to_string_lossy().to_string();

    if !canonical_old_path.exists() {
        return Err(format!("Source file does not exist: {}", old_path));
    }

    if canonical_new_path.exists() {
        return Err(format!(
            "Destination already exists: {}. Cannot overwrite",
            new_path
        ));
    }

    if !check_file_permission(
        &canonical_old_str,
        FileOperation::Delete,
        &state,
        Some(&app),
    )
    .await?
    {
        return Err("Permission denied for source file".to_string());
    }
    if !check_file_permission(&canonical_new_str, FileOperation::Write, &state, Some(&app)).await? {
        return Err("Permission denied for destination file".to_string());
    }

    match fs::rename(&canonical_old_path, &canonical_new_path) {
        Ok(_) => {
            log_file_operation(
                &canonical_old_str,
                FileOperation::Delete,
                true,
                None,
                &state,
            )
            .await?;
            log_file_operation(&canonical_new_str, FileOperation::Write, true, None, &state)
                .await?;
            info!(
                "Successfully renamed file: {} -> {}",
                canonical_old_str, canonical_new_str
            );
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to rename file: {}", e);
            Err(error)
        }
    }
}

#[tauri::command]
pub async fn file_exists(path: String) -> Result<bool, String> {
    let canonical_path = validate_path_security(&path)?;

    Ok(canonical_path.exists())
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

    // Block executable extensions so an LLM that
    // dropped a malicious binary through a file write cannot chain into
    // `open` to execute it. macOS `open` will
    // launch .app bundles; Windows Start-Process will execute .exe/.bat/.cmd
    // /.ps1; Linux xdg-open can execute .desktop files.
    const EXEC_EXTENSIONS: &[&str] = &[
        "app", "exe", "bat", "cmd", "com", "ps1", "sh", "command", "scpt", "workflow", "desktop",
    ];
    if let Some(ext) = canonical_path.extension().and_then(|e| e.to_str()) {
        let lower = ext.to_ascii_lowercase();
        if EXEC_EXTENSIONS.contains(&lower.as_str()) {
            return Err(format!(
                "Refusing to open executable extension '.{ext}' via default app handler. \
                 Run via terminal_execute (HITL-gated) instead."
            ));
        }
    }

    // Require HITL on open-with-default since
    // even non-executable extensions can trigger handlers that side-effect
    // (PDF auto-fetch, URL-handler files, etc.).
    if !crate::sys::commands::tool_confirmation::request_confirmation_simple(
        &app,
        "file_open_with_default_app",
        &serde_json::json!({ "path": &canonical_str }),
    )
    .await?
    {
        return Err("Operation denied by user".to_string());
    }

    if !check_file_permission(&canonical_str, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    open::that_detached(&canonical_path)
        .map_err(|e| format!("Failed to launch default app: {}", e))?;

    log_file_operation(&canonical_str, FileOperation::Execute, true, None, &state).await?;
    info!("Opened path with default app: {}", canonical_str);
    Ok(())
}

#[tauri::command]
pub async fn dir_create(
    app: AppHandle,
    path: String,
    state: tauri::State<'_, AppDatabase>,
) -> Result<(), String> {
    debug!("Creating directory: {}", path);

    let canonical_path = validate_path_security(&path)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    if canonical_path.exists() {
        return Err(format!("Path already exists: {}", path));
    }

    if !check_file_permission(&canonical_str, FileOperation::Write, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    match fs::create_dir_all(&canonical_path) {
        Ok(_) => {
            log_file_operation(&canonical_str, FileOperation::Write, true, None, &state).await?;
            info!("Successfully created directory: {}", canonical_str);
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

    let canonical_path = validate_path_security(&path)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    match fs::metadata(&canonical_path) {
        Ok(metadata) => {
            if !metadata.is_dir() {
                return Err(format!("Path is not a directory: {}", path));
            }
        }
        Err(_) => return Err(format!("Directory does not exist: {}", path)),
    }

    if !check_file_permission(&canonical_str, FileOperation::Read, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    let entries =
        fs::read_dir(&canonical_path).map_err(|e| format!("Failed to read directory: {}", e))?;

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

    log_file_operation(&canonical_str, FileOperation::Read, true, None, &state).await?;
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

    let canonical_path = validate_path_security(&path)?;
    let canonical_str = canonical_path.to_string_lossy().to_string();

    match fs::metadata(&canonical_path) {
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
            &serde_json::json!({ "path": &canonical_str, "recursive": true }),
        )
        .await?
        {
            return Err("Operation denied by user".to_string());
        }
    }

    if !check_file_permission(&canonical_str, FileOperation::Delete, &state, Some(&app)).await? {
        return Err("Permission denied".to_string());
    }

    let result = if recursive {
        fs::remove_dir_all(&canonical_path)
    } else {
        fs::remove_dir(&canonical_path)
    };

    match result {
        Ok(_) => {
            log_file_operation(&canonical_str, FileOperation::Delete, true, None, &state).await?;
            info!("Successfully deleted directory: {}", canonical_str);
            Ok(())
        }
        Err(e) => {
            let error = format!("Failed to delete directory: {}", e);
            Err(error)
        }
    }
}

#[cfg(test)]
mod fix_016_blacklist_tests {
    //! Pin the canonical-path-aware blacklist
    //! semantics so a future refactor can't silently regress to substring
    //! matching.
    use super::is_blacklisted_path;

    #[test]
    fn blocks_exact_dotfile_basenames() {
        assert!(is_blacklisted_path("/Users/me/.ssh"));
        assert!(is_blacklisted_path("/Users/me/.ssh/config"));
        assert!(is_blacklisted_path("/Users/me/.aws/credentials"));
        assert!(is_blacklisted_path("/Users/me/.env"));
        assert!(is_blacklisted_path("/Users/me/.netrc"));
    }

    #[test]
    fn blocks_well_known_key_files_anywhere() {
        assert!(is_blacklisted_path("/Users/me/projects/keys/id_rsa"));
        assert!(is_blacklisted_path("/Users/me/.ssh/id_ed25519"));
    }

    #[test]
    fn blocks_etc_and_private_etc_prefixes() {
        assert!(is_blacklisted_path("/etc/passwd"));
        assert!(is_blacklisted_path("/etc/shadow"));
        assert!(is_blacklisted_path("/private/etc/passwd"));
        assert!(is_blacklisted_path("/private/etc/master.passwd"));
        assert!(is_blacklisted_path("/private/etc/sudoers"));
    }

    #[test]
    fn does_not_match_substring_false_positives() {
        // A substring check would flag anything
        // containing `.env`, including `.envrc-prod` and `development/.eslintrc`
        // (no `.env` substring there, but `.environment` is a thing).
        assert!(!is_blacklisted_path("/Users/me/dev/.envrc-prod"));
        assert!(!is_blacklisted_path("/Users/me/dev/development/file.txt"));
        assert!(!is_blacklisted_path("/Users/me/.environments/notes.md"));
        assert!(!is_blacklisted_path("/Users/me/notes/credential-policy.md"));
    }

    #[test]
    fn blocks_dotfile_dirs_with_trailing_slash_or_subpath() {
        assert!(is_blacklisted_path("/Users/me/.docker/config.json"));
        assert!(is_blacklisted_path("/Users/me/.kube/config"));
    }
}

#[cfg(test)]
mod blocked_read_path_tests {
    use super::{is_blacklisted_path, validate_read_path};
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn read_guard_rejects_central_blocked_paths_not_in_legacy_blacklist() {
        let dir = tempdir().unwrap();
        let npmrc = dir.path().join(".npmrc");
        fs::write(&npmrc, "token").unwrap();

        assert!(
            !is_blacklisted_path(npmrc.to_str().unwrap()),
            "legacy component blacklist intentionally does not cover .npmrc"
        );
        let err = validate_read_path(npmrc.to_str().unwrap()).unwrap_err();
        assert!(err.contains("blocked-paths denylist"));
    }
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

    #[test]
    fn test_blacklist_check() {
        assert!(is_blacklisted_path("C:\\Windows\\System32\\kernel32.dll"));
        assert!(is_blacklisted_path("C:\\Program Files\\app\\file.exe"));
        assert!(is_blacklisted_path("/home/user/.ssh/id_rsa"));
        assert!(!is_blacklisted_path("C:\\Users\\user\\Documents\\file.txt"));
    }
}

#[cfg(test)]
mod fix_f3_path_allowed_prefix_tests {
    //! Pin the canonical-path containment check
    //! so a directory `/Users/foo` does NOT also allow `/Users/foobar/...`.
    //! Prefix-vs-component bug fixed in `is_path_allowed`.
    use super::is_path_allowed;
    use std::path::PathBuf;

    #[test]
    fn allows_exact_match_to_dir_root() {
        let allowed = vec![PathBuf::from("/Users/foo")];
        assert!(is_path_allowed("/Users/foo", &allowed));
    }

    #[test]
    fn allows_subpath_under_allowed_dir() {
        let allowed = vec![PathBuf::from("/Users/foo")];
        assert!(is_path_allowed("/Users/foo/bar/baz.txt", &allowed));
    }

    #[test]
    fn rejects_prefix_lookalike_siblings() {
        let allowed = vec![PathBuf::from("/Users/foo")];
        assert!(!is_path_allowed("/Users/foobar/secret.txt", &allowed));
        assert!(!is_path_allowed("/Users/foo-evil/x.txt", &allowed));
        assert!(!is_path_allowed("/Users/foo.bak/y.txt", &allowed));
    }

    #[test]
    fn handles_trailing_separator_in_allowed_dir() {
        let allowed = vec![PathBuf::from("/Users/foo/")];
        assert!(is_path_allowed("/Users/foo/file.txt", &allowed));
        assert!(!is_path_allowed("/Users/foobar/file.txt", &allowed));
    }

    #[test]
    fn rejects_when_no_dirs_allowed() {
        let allowed: Vec<PathBuf> = Vec::new();
        assert!(!is_path_allowed("/Users/foo/file.txt", &allowed));
    }

    #[test]
    fn windows_backslash_paths_normalized() {
        let allowed = vec![PathBuf::from("C:\\Users\\foo")];
        assert!(is_path_allowed("C:\\Users\\foo\\file.txt", &allowed));
        assert!(!is_path_allowed("C:\\Users\\foobar\\file.txt", &allowed));
    }
}
