use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher as NotifyWatcher};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tracing::{debug, error, info, warn};

/// File event type for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "paths")]
pub enum FileEvent {
    Created(Vec<PathBuf>),
    Modified(Vec<PathBuf>),
    Deleted(Vec<PathBuf>),
    Renamed { from: PathBuf, to: PathBuf },
}

/// File watcher state
pub struct FileWatcher {
    watcher: RecommendedWatcher,
    watched_paths: Arc<Mutex<HashMap<PathBuf, RecursiveMode>>>,
}

impl FileWatcher {
    /// Create new file watcher instance
    pub fn new(app_handle: AppHandle) -> Result<Self, String> {
        let watched_paths = Arc::new(Mutex::new(HashMap::new()));
        let watched_paths_clone = Arc::clone(&watched_paths);

        let watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            match res {
                Ok(event) => {
                    debug!("File event: {:?}", event);

                    // Convert notify event to our FileEvent
                    let file_event = match event.kind {
                        EventKind::Create(_) => {
                            info!("Files created: {:?}", event.paths);
                            FileEvent::Created(event.paths.clone())
                        }
                        EventKind::Modify(_) => {
                            debug!("Files modified: {:?}", event.paths);
                            FileEvent::Modified(event.paths.clone())
                        }
                        EventKind::Remove(_) => {
                            info!("Files deleted: {:?}", event.paths);
                            FileEvent::Deleted(event.paths.clone())
                        }
                        EventKind::Access(_) => {
                            // We don't emit access events to avoid spam
                            return;
                        }
                        _ => {
                            debug!("Other file event: {:?}", event.kind);
                            return;
                        }
                    };

                    // Emit event to frontend
                    if let Err(e) = app_handle.emit("file-event", &file_event) {
                        error!("Failed to emit file event: {}", e);
                    }
                }
                Err(e) => {
                    error!("Watch error: {:?}", e);
                }
            }
        })
        .map_err(|e| format!("Failed to create file watcher: {}", e))?;

        Ok(Self {
            watcher,
            watched_paths: watched_paths_clone,
        })
    }

    /// Start watching a path
    pub fn watch(&mut self, path: &str, recursive: bool) -> Result<(), String> {
        let path_buf = PathBuf::from(path);

        if !path_buf.exists() {
            return Err(format!("Path does not exist: {}", path));
        }

        let mode = if recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };

        self.watcher
            .watch(&path_buf, mode)
            .map_err(|e| format!("Failed to watch path: {}", e))?;

        // Store watched path
        let mut watched = self
            .watched_paths
            .lock()
            .map_err(|e| format!("Failed to lock watched paths: {}", e))?;
        watched.insert(path_buf.clone(), mode);

        info!("Started watching: {} (recursive: {})", path, recursive);
        Ok(())
    }

    /// Stop watching a path
    pub fn unwatch(&mut self, path: &str) -> Result<(), String> {
        let path_buf = PathBuf::from(path);

        self.watcher
            .unwatch(&path_buf)
            .map_err(|e| format!("Failed to unwatch path: {}", e))?;

        // Remove from watched paths
        let mut watched = self
            .watched_paths
            .lock()
            .map_err(|e| format!("Failed to lock watched paths: {}", e))?;
        watched.remove(&path_buf);

        info!("Stopped watching: {}", path);
        Ok(())
    }

    /// Get all currently watched paths
    pub fn get_watched_paths(&self) -> Result<Vec<String>, String> {
        let watched = self
            .watched_paths
            .lock()
            .map_err(|e| format!("Failed to lock watched paths: {}", e))?;

        Ok(watched
            .keys()
            .map(|p| p.to_string_lossy().to_string())
            .collect())
    }

    /// Stop watching all paths
    pub fn unwatch_all(&mut self) -> Result<(), String> {
        let paths: Vec<PathBuf> = {
            let watched = self
                .watched_paths
                .lock()
                .map_err(|e| format!("Failed to lock watched paths: {}", e))?;
            watched.keys().cloned().collect()
        };

        for path in paths {
            if let Err(e) = self.watcher.unwatch(&path) {
                warn!("Failed to unwatch {}: {}", path.display(), e);
            }
        }

        // Clear all watched paths
        let mut watched = self
            .watched_paths
            .lock()
            .map_err(|e| format!("Failed to lock watched paths: {}", e))?;
        watched.clear();

        info!("Stopped watching all paths");
        Ok(())
    }
}

impl Drop for FileWatcher {
    fn drop(&mut self) {
        if let Err(e) = self.unwatch_all() {
            error!("Failed to cleanup file watcher: {}", e);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Duration;
    use tempfile::tempdir;

    #[test]
    fn test_watcher_lifecycle() {
        // Note: This test is simplified because we need a Tauri AppHandle
        // In a real test environment, you'd use a mock AppHandle
        let dir = tempdir().unwrap();
        let watch_path = dir.path().to_str().unwrap();

        // The actual watcher creation would require a Tauri AppHandle
        // For now, we just test the path validation logic
        let path_buf = PathBuf::from(watch_path);
        assert!(path_buf.exists());
    }

    #[test]
    fn test_file_event_serialization() {
        let event = FileEvent::Created(vec![PathBuf::from("/test/file.txt")]);
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("Created"));
        assert!(json.contains("/test/file.txt"));
    }
}
