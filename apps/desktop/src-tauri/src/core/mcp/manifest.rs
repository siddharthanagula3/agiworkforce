
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub allowed_packages: Vec<String>,
}

pub fn load(path: &Path) -> Result<Manifest, std::io::Error> {
    let bytes = std::fs::read(path)?;
    let m: Manifest = serde_json::from_slice(&bytes).map_err(std::io::Error::other)?;
    Ok(m)
}

pub fn is_allowed(manifest: &Manifest, package: &str) -> bool {
    manifest.allowed_packages.iter().any(|p| p == package)
}

/// Where the packaged allow-list lives at runtime.
///
/// The old lookup was a bare CWD-relative `PathBuf::from("mcp-allowlist.json")`
/// and the file was in no `bundle.resources`, so on every installed client it
/// resolved to nothing and the check fell through to open mode. It now resolves
/// against the app's resource directory, and a release build that cannot find
/// it refuses the install rather than allowing everything.
pub const ALLOWLIST_RESOURCE: &str = "mcp-allowlist.json";

#[derive(Debug)]
pub enum AllowlistState {
    /// The packaged list was found and parsed.
    Loaded(Manifest),
    /// No list on disk. Only tolerable in a debug build.
    Absent,
}

impl AllowlistState {
    /// True when `package` may be installed. A missing list allows in debug and
    /// denies in release, so a mis-packaged installer fails loudly rather than
    /// silently disabling the control.
    pub fn permits(&self, package: &str) -> bool {
        match self {
            AllowlistState::Loaded(manifest) => is_allowed(manifest, package),
            AllowlistState::Absent => cfg!(debug_assertions),
        }
    }

    pub fn is_absent(&self) -> bool {
        matches!(self, AllowlistState::Absent)
    }
}

/// Loads the allow-list from a resolved resource path, if one was found.
pub fn load_state(path: Option<&Path>) -> AllowlistState {
    match path.and_then(|p| load(p).ok()) {
        Some(manifest) => AllowlistState::Loaded(manifest),
        None => AllowlistState::Absent,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest() -> Manifest {
        Manifest {
            version: 1,
            allowed_packages: vec!["@modelcontextprotocol/server-fetch".to_string()],
        }
    }

    #[test]
    fn a_loaded_list_permits_only_what_it_names() {
        let state = AllowlistState::Loaded(manifest());
        assert!(state.permits("@modelcontextprotocol/server-fetch"));
        assert!(!state.permits("@modelcontextprotocol/server-fetchh"));
        assert!(!state.permits("totally-unrelated"));
    }

    #[test]
    fn a_missing_list_denies_in_release_and_allows_in_debug() {
        let state = AllowlistState::Absent;
        assert!(state.is_absent());
        assert_eq!(state.permits("anything-at-all"), cfg!(debug_assertions));
    }

    #[test]
    fn load_state_reports_absent_for_a_path_that_is_not_there() {
        let missing = std::path::PathBuf::from("/nonexistent/mcp-allowlist.json");
        assert!(load_state(Some(&missing)).is_absent());
        assert!(load_state(None).is_absent());
    }
}
