//! The contract between the desktop app and the readers of its realtime
//! bridge: which port the bridge listens on and where its token is published.
//! The app, its in-process extension bridge and the native messaging host all
//! take both from here, so they cannot drift apart.

use std::path::{Path, PathBuf};

pub const REALTIME_PORT: u16 = 8787;
const TOKEN_FILE_NAME: &str = ".ipc_token";
const DESKTOP_IDENTIFIER: &str = "com.agiworkforce.desktop";

pub fn realtime_url() -> String {
    format!("ws://127.0.0.1:{REALTIME_PORT}")
}

/// The token file inside the app's data directory.
pub fn token_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(TOKEN_FILE_NAME)
}

/// Where an installed desktop app keeps its data, for the native messaging
/// host, which Chrome starts as a separate process with no app handle.
///
/// This is `dirs::data_dir()` joined with the bundle identifier, which is how
/// Tauri resolves `app_data_dir`: Roaming AppData on Windows, not Local. On
/// macOS the app may be sandboxed while the host is not, so the container's
/// copy is looked at first.
pub fn installed_app_data_dirs() -> Vec<PathBuf> {
    app_data_dirs_under(dirs::home_dir(), dirs::data_dir())
}

fn app_data_dirs_under(home: Option<PathBuf>, data_dir: Option<PathBuf>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if cfg!(target_os = "macos") {
        if let Some(home) = home {
            candidates.push(
                home.join("Library/Containers")
                    .join(DESKTOP_IDENTIFIER)
                    .join("Data/Library/Application Support")
                    .join(DESKTOP_IDENTIFIER),
            );
        }
    }
    if let Some(data_dir) = data_dir {
        candidates.push(data_dir.join(DESKTOP_IDENTIFIER));
    }
    candidates
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_host_looks_where_the_app_writes() {
        let data_dir = PathBuf::from("/data-root");
        let candidates = app_data_dirs_under(None, Some(data_dir.clone()));

        assert_eq!(candidates, vec![data_dir.join("com.agiworkforce.desktop")]);
        assert_eq!(
            token_path(&candidates[0]),
            data_dir.join("com.agiworkforce.desktop").join(".ipc_token")
        );
    }

    #[cfg(windows)]
    #[test]
    fn the_windows_host_reads_roaming_app_data_like_the_app() {
        let roaming = dirs::data_dir().expect("Roaming AppData resolves");
        let local = dirs::data_local_dir().expect("Local AppData resolves");
        assert_ne!(roaming, local);
        assert_eq!(
            installed_app_data_dirs(),
            vec![roaming.join("com.agiworkforce.desktop")]
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_sandboxed_install_is_looked_at_before_an_unsandboxed_one() {
        let candidates = app_data_dirs_under(
            Some(PathBuf::from("/Users/a")),
            Some(PathBuf::from("/Users/a/Library/Application Support")),
        );
        assert_eq!(
            candidates,
            vec![
                PathBuf::from(
                    "/Users/a/Library/Containers/com.agiworkforce.desktop/Data/Library/Application Support/com.agiworkforce.desktop"
                ),
                PathBuf::from("/Users/a/Library/Application Support/com.agiworkforce.desktop"),
            ]
        );
    }

    #[test]
    fn the_bridge_url_carries_the_one_port() {
        assert_eq!(realtime_url(), "ws://127.0.0.1:8787");
    }
}
