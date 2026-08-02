//! Ephemeral, picker-owned filesystem capabilities for Local -> Managed Cloud handoff.
//!
//! The renderer never supplies an ambient root path. The native process opens
//! the operating-system folder picker, retains an open capability to the chosen
//! directory, and returns only an opaque, expiring grant id. Listing and reads
//! are resolved relative to that retained handle, so even a rename/symlink race
//! cannot escape into another part of the device filesystem.

use cap_std::ambient_authority;
use cap_std::fs::Dir;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use super::code_search::is_excluded_dir;

const CLOUD_HANDOFF_GRANT_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_ACTIVE_GRANTS: usize = 32;
const DEFAULT_LIST_LIMIT: usize = 1_000;
const MAX_LIST_LIMIT: usize = 1_000;
const MAX_VISITED_ENTRIES: usize = 20_000;
const MAX_DIRECTORY_DEPTH: usize = 64;
const MAX_CLOUD_HANDOFF_FILE_BYTES: u64 = 12 * 1024 * 1024;

struct CloudHandoffGrant {
    directory: Dir,
    created_at: Instant,
    expires_at: Instant,
}

/// Native-only registry of picker-created capabilities.
///
/// Deliberately contains no ambient root path API: callers can use a grant id
/// only after the native picker has placed a retained directory handle here.
#[derive(Default)]
pub struct CloudHandoffGrantState {
    grants: Mutex<HashMap<String, CloudHandoffGrant>>,
}

impl CloudHandoffGrantState {
    fn insert(&self, directory: Dir) -> Result<String, String> {
        let now = Instant::now();
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Cloud handoff grant registry is unavailable".to_string())?;
        grants.retain(|_, grant| grant.expires_at > now);

        while grants.len() >= MAX_ACTIVE_GRANTS {
            let Some(oldest_id) = grants
                .iter()
                .min_by_key(|(_, grant)| grant.created_at)
                .map(|(id, _)| id.clone())
            else {
                break;
            };
            grants.remove(&oldest_id);
        }

        let grant_id = Uuid::new_v4().to_string();
        grants.insert(
            grant_id.clone(),
            CloudHandoffGrant {
                directory,
                created_at: now,
                expires_at: now + CLOUD_HANDOFF_GRANT_TTL,
            },
        );
        Ok(grant_id)
    }

    fn clone_directory(&self, grant_id: &str) -> Result<Dir, String> {
        if Uuid::parse_str(grant_id).is_err() {
            return Err("Cloud handoff grant is invalid or expired".to_string());
        }
        let now = Instant::now();
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Cloud handoff grant registry is unavailable".to_string())?;
        grants.retain(|_, grant| grant.expires_at > now);
        grants
            .get(grant_id)
            .ok_or_else(|| "Cloud handoff grant is invalid or expired".to_string())?
            .directory
            .try_clone()
            .map_err(|error| format!("Could not use the selected-folder capability: {error}"))
    }

    fn revoke(&self, grant_id: &str) -> Result<(), String> {
        let mut grants = self
            .grants
            .lock()
            .map_err(|_| "Cloud handoff grant registry is unavailable".to_string())?;
        grants.remove(grant_id);
        Ok(())
    }

    #[cfg(test)]
    fn insert_path(&self, path: &Path) -> Result<String, String> {
        let directory = Dir::open_ambient_dir(path, ambient_authority())
            .map_err(|error| format!("Could not open test folder capability: {error}"))?;
        self.insert(directory)
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudHandoffFolderSelection {
    grant_id: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudHandoffFileEntry {
    /// Intentionally root-relative. No home directory is returned to the webview listing.
    path: String,
    relative_path: String,
    is_file: bool,
    size_bytes: u64,
    modified_secs: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudHandoffFolderListing {
    matches: Vec<CloudHandoffFileEntry>,
    truncated: bool,
}

fn validate_relative_path(relative_path: &Path) -> Result<(), String> {
    if relative_path.as_os_str().is_empty() {
        return Err("Cloud handoff file path cannot be empty".to_string());
    }
    for component in relative_path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(
                "Cloud handoff file path must stay beneath the selected folder".to_string(),
            );
        }
    }
    Ok(())
}

fn modified_secs(metadata: &cap_std::fs::Metadata) -> i64 {
    metadata
        .modified()
        .map(cap_std::time::SystemTime::into_std)
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .min(i64::MAX as u64) as i64
}

fn list_directory_capability(root: Dir, limit: usize) -> Result<CloudHandoffFolderListing, String> {
    let mut stack = vec![(root, String::new(), 0usize)];
    let mut matches = Vec::with_capacity(limit.saturating_add(1));
    let mut visited = 0usize;
    let mut truncated = false;

    while let Some((directory, prefix, depth)) = stack.pop() {
        let entries = directory
            .entries()
            .map_err(|error| format!("Could not list the selected folder: {error}"))?;
        for entry in entries {
            visited = visited.saturating_add(1);
            if visited > MAX_VISITED_ENTRIES {
                truncated = true;
                break;
            }

            let entry = match entry {
                Ok(entry) => entry,
                Err(_) => continue,
            };
            let Some(file_name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let relative_path = if prefix.is_empty() {
                file_name
            } else {
                format!("{prefix}/{file_name}")
            };
            if is_excluded_dir(Path::new(&relative_path)) {
                continue;
            }

            let file_type = match entry.file_type() {
                Ok(file_type) => file_type,
                Err(_) => continue,
            };
            // Links are never presented as candidates. If an entry is swapped
            // after this check, cap-std still confines resolution to the retained root.
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                if depth < MAX_DIRECTORY_DEPTH {
                    if let Ok(child) = entry.open_dir() {
                        stack.push((child, relative_path, depth + 1));
                    }
                } else {
                    truncated = true;
                }
                continue;
            }
            if !file_type.is_file() {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(metadata) if metadata.is_file() => metadata,
                _ => continue,
            };
            matches.push(CloudHandoffFileEntry {
                path: relative_path.clone(),
                relative_path,
                is_file: true,
                size_bytes: metadata.len(),
                modified_secs: modified_secs(&metadata),
            });
            if matches.len() > limit {
                truncated = true;
                // Keep the newest bounded sample while continuing the walk,
                // rather than letting traversal order decide the preview.
                if matches.len() > limit.saturating_add(1) {
                    if let Some((oldest_index, _)) = matches
                        .iter()
                        .enumerate()
                        .min_by_key(|(_, entry)| entry.modified_secs)
                    {
                        matches.swap_remove(oldest_index);
                    }
                }
            }
        }
        if visited > MAX_VISITED_ENTRIES {
            break;
        }
    }

    matches.sort_by(|left, right| right.modified_secs.cmp(&left.modified_secs));
    matches.truncate(limit);
    Ok(CloudHandoffFolderListing { matches, truncated })
}

fn open_relative_file(root: Dir, relative_path: &Path) -> Result<cap_std::fs::File, String> {
    validate_relative_path(relative_path)?;
    let components = relative_path
        .components()
        .map(|component| component.as_os_str().to_owned())
        .collect::<Vec<_>>();
    let (file_name, parent_components) = components
        .split_last()
        .ok_or_else(|| "Cloud handoff file path cannot be empty".to_string())?;

    let mut directory = root;
    for component in parent_components {
        let metadata = directory
            .symlink_metadata(component)
            .map_err(|error| format!("Could not inspect Cloud handoff path: {error}"))?;
        if metadata.is_symlink() || !metadata.is_dir() {
            return Err("Refusing to read a linked or changed Cloud handoff path".to_string());
        }
        directory = directory
            .open_dir(component)
            .map_err(|error| format!("Could not open Cloud handoff directory: {error}"))?;
    }

    let metadata = directory
        .symlink_metadata(file_name)
        .map_err(|error| format!("Could not inspect Cloud handoff file: {error}"))?;
    if metadata.is_symlink() || !metadata.is_file() {
        return Err("Refusing to read a linked or non-file Cloud handoff path".to_string());
    }
    directory
        .open(file_name)
        .map_err(|error| format!("Could not open Cloud handoff file: {error}"))
}

/// Open the native folder picker and retain the resulting directory capability.
/// The renderer cannot nominate the root passed to `Dir::open_ambient_dir`.
#[tauri::command]
pub async fn select_cloud_handoff_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, CloudHandoffGrantState>,
) -> Result<Option<CloudHandoffFolderSelection>, String> {
    let selected = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Select a folder to attach from")
            .blocking_pick_folder()
    })
    .await
    .map_err(|error| format!("Cloud handoff folder picker failed: {error}"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let selected = selected
        .into_path()
        .map_err(|error| format!("The selected folder path is unavailable: {error}"))?;
    let canonical = selected
        .canonicalize()
        .map_err(|error| format!("Could not resolve the selected folder: {error}"))?;
    if !canonical.is_dir() {
        return Err("The selected Cloud handoff path is not a folder".to_string());
    }
    let directory = Dir::open_ambient_dir(&canonical, ambient_authority())
        .map_err(|error| format!("Could not open the selected-folder capability: {error}"))?;
    let grant_id = state.insert(directory)?;
    Ok(Some(CloudHandoffFolderSelection {
        grant_id,
        path: canonical.to_string_lossy().into_owned(),
    }))
}

#[tauri::command]
pub async fn list_cloud_handoff_files(
    grant_id: String,
    limit: Option<usize>,
    state: tauri::State<'_, CloudHandoffGrantState>,
) -> Result<CloudHandoffFolderListing, String> {
    let directory = state.clone_directory(&grant_id)?;
    let limit = limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, MAX_LIST_LIMIT);
    tokio::task::spawn_blocking(move || list_directory_capability(directory, limit))
        .await
        .map_err(|error| format!("Cloud handoff listing task failed: {error}"))?
}

#[tauri::command]
pub async fn read_cloud_handoff_file(
    grant_id: String,
    relative_path: String,
    state: tauri::State<'_, CloudHandoffGrantState>,
) -> Result<tauri::ipc::Response, String> {
    let directory = state.clone_directory(&grant_id)?;
    let relative_path = PathBuf::from(relative_path);
    tokio::task::spawn_blocking(move || {
        let mut file = open_relative_file(directory, &relative_path)?;
        let metadata = file
            .metadata()
            .map_err(|error| format!("Could not inspect Cloud handoff file: {error}"))?;
        if !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > MAX_CLOUD_HANDOFF_FILE_BYTES
        {
            return Err("Cloud handoff file is outside attachment size limits".to_string());
        }

        let mut bytes = Vec::with_capacity(metadata.len() as usize);
        file.by_ref()
            .take(MAX_CLOUD_HANDOFF_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Could not read Cloud handoff file: {error}"))?;
        if bytes.is_empty() || bytes.len() as u64 > MAX_CLOUD_HANDOFF_FILE_BYTES {
            return Err("Cloud handoff file changed beyond attachment size limits".to_string());
        }
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|error| format!("Cloud handoff read task failed: {error}"))?
}

#[tauri::command]
pub async fn revoke_cloud_handoff_grant(
    grant_id: String,
    state: tauri::State<'_, CloudHandoffGrantState>,
) -> Result<(), String> {
    state.revoke(&grant_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_path_rejects_escape_and_absolute_paths() {
        assert!(validate_relative_path(Path::new("src/main.rs")).is_ok());
        assert!(validate_relative_path(Path::new("../secret.txt")).is_err());
        assert!(validate_relative_path(Path::new("/etc/passwd")).is_err());
        assert!(validate_relative_path(Path::new("")).is_err());
    }

    #[test]
    fn grant_lists_and_reads_only_relative_regular_files() {
        let root = tempfile::tempdir().expect("temp root");
        std::fs::create_dir(root.path().join("src")).expect("create nested folder");
        std::fs::write(root.path().join("src/main.rs"), b"fn main() {}").expect("write fixture");
        let state = CloudHandoffGrantState::default();
        let grant_id = state.insert_path(root.path()).expect("create grant");
        let directory = state.clone_directory(&grant_id).expect("clone capability");

        let listing = list_directory_capability(directory, 100).expect("list capability");
        assert_eq!(listing.matches.len(), 1);
        assert_eq!(listing.matches[0].relative_path, "src/main.rs");
        assert_eq!(listing.matches[0].path, "src/main.rs");

        let mut file = open_relative_file(
            state.clone_directory(&grant_id).expect("clone capability"),
            Path::new("src/main.rs"),
        )
        .expect("open regular file");
        let mut body = String::new();
        file.read_to_string(&mut body).expect("read fixture");
        assert_eq!(body, "fn main() {}");
    }

    #[test]
    fn revoked_and_unknown_grants_fail_closed() {
        let root = tempfile::tempdir().expect("temp root");
        let state = CloudHandoffGrantState::default();
        let grant_id = state.insert_path(root.path()).expect("create grant");
        state.revoke(&grant_id).expect("revoke grant");

        assert!(state.clone_directory(&grant_id).is_err());
        assert!(state
            .clone_directory("/Users/example/renderer-chosen-root")
            .is_err());
    }

    #[cfg(unix)]
    #[test]
    fn listing_and_read_reject_symlinks() {
        use std::os::unix::fs::symlink;

        let root = tempfile::tempdir().expect("temp root");
        let outside = tempfile::tempdir().expect("outside root");
        std::fs::write(outside.path().join("secret.txt"), b"secret").expect("write secret");
        symlink(
            outside.path().join("secret.txt"),
            root.path().join("linked-file.txt"),
        )
        .expect("link file");
        symlink(outside.path(), root.path().join("linked-dir")).expect("link directory");
        let state = CloudHandoffGrantState::default();
        let grant_id = state.insert_path(root.path()).expect("create grant");

        let listing = list_directory_capability(
            state.clone_directory(&grant_id).expect("clone capability"),
            100,
        )
        .expect("list capability");
        assert!(listing.matches.is_empty());
        assert!(open_relative_file(
            state.clone_directory(&grant_id).expect("clone capability"),
            Path::new("linked-file.txt"),
        )
        .is_err());
        assert!(open_relative_file(
            state.clone_directory(&grant_id).expect("clone capability"),
            Path::new("linked-dir/secret.txt"),
        )
        .is_err());
    }
}
