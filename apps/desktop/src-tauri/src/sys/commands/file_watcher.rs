use crate::sys::filesystem::FileWatcher;
use std::sync::Mutex;
use tauri::State;
use tracing::{debug, info};

pub struct FileWatcherState(pub Mutex<Option<FileWatcher>>);

impl Default for FileWatcherState {
    fn default() -> Self {
        Self::new()
    }
}

impl FileWatcherState {
    pub fn new() -> Self {
        Self(Mutex::new(None))
    }
}

#[tauri::command]
pub async fn file_watch_start(
    path: String,
    recursive: bool,
    state: State<'_, FileWatcherState>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    debug!("Starting file watch: {} (recursive: {})", path, recursive);

    // A watch reports every file name that changes under `path`, so the page
    // may watch only inside a folder the person granted.
    crate::sys::commands::file_ops::require_granted_path(
        &app_handle,
        &path,
        crate::sys::commands::file_ops::FileOperation::Read,
    )
    .await?;

    let mut watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock watcher: {}", e))?;

    if watcher_lock.is_none() {
        *watcher_lock = Some(FileWatcher::new(app_handle)?);
    }

    if let Some(watcher) = watcher_lock.as_mut() {
        watcher.watch(&path, recursive)?;
        info!("Started watching: {}", path);
        Ok(())
    } else {
        Err("File watcher not initialized".to_string())
    }
}

#[tauri::command]
pub async fn file_watch_stop(
    path: String,
    state: State<'_, FileWatcherState>,
) -> Result<(), String> {
    debug!("Stopping file watch: {}", path);

    let mut watcher_lock = state
        .0
        .lock()
        .map_err(|e| format!("Failed to lock watcher: {}", e))?;

    if let Some(watcher) = watcher_lock.as_mut() {
        watcher.unwatch(&path)?;
        info!("Stopped watching: {}", path);
        Ok(())
    } else {
        Err("File watcher not initialized".to_string())
    }
}
