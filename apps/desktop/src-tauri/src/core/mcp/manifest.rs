use serde::Deserialize;
use std::path::Path;

/// One installable npm package, pinned to the exact tarball that was reviewed.
#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct AllowedPackage {
    pub name: String,
    /// Exact version; ranges and tags are refused at load.
    pub version: String,
    /// Subresource Integrity of the registry tarball, `sha512-<base64>`.
    pub integrity: String,
    /// Lifecycle scripts run during install only when this is true.
    #[serde(default)]
    pub allow_scripts: bool,
}

impl AllowedPackage {
    pub fn install_spec(&self) -> String {
        format!("{}@{}", self.name, self.version)
    }

    fn validate(&self) -> Result<(), String> {
        let exact = !self.version.is_empty()
            && self
                .version
                .split(['-', '+'])
                .next()
                .is_some_and(|core| core.split('.').count() == 3)
            && self
                .version
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '+'))
            && self.version.starts_with(|c: char| c.is_ascii_digit());
        if !exact {
            return Err(format!(
                "'{}' must pin an exact version, not '{}'",
                self.name, self.version
            ));
        }
        let digest = self.integrity.strip_prefix("sha512-").unwrap_or_default();
        if digest.len() != 88 || !digest.ends_with("==") {
            return Err(format!("'{}' must pin a sha512 integrity hash", self.name));
        }
        Ok(())
    }
}

#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub allowed_packages: Vec<AllowedPackage>,
}

impl Manifest {
    fn validate(&self) -> Result<(), String> {
        self.allowed_packages
            .iter()
            .try_for_each(AllowedPackage::validate)
    }
}

/// A list with any unpinned entry is rejected whole, so a careless edit
/// cannot quietly reopen an unverified install.
pub fn load(path: &Path) -> Result<Manifest, std::io::Error> {
    let bytes = std::fs::read(path)?;
    let m: Manifest = serde_json::from_slice(&bytes).map_err(std::io::Error::other)?;
    m.validate().map_err(std::io::Error::other)?;
    Ok(m)
}

pub fn pinned<'a>(manifest: &'a Manifest, package: &str) -> Option<&'a AllowedPackage> {
    manifest.allowed_packages.iter().find(|p| p.name == package)
}

pub fn is_allowed(manifest: &Manifest, package: &str) -> bool {
    pinned(manifest, package).is_some()
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

    /// The reviewed pin for `package`. Only a loaded list has pins, so an
    /// install that needs one is refused when the list is missing, in debug
    /// builds too.
    pub fn pinned(&self, package: &str) -> Option<&AllowedPackage> {
        match self {
            AllowlistState::Loaded(manifest) => pinned(manifest, package),
            AllowlistState::Absent => None,
        }
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

    const INTEGRITY: &str = "sha512-kKaFkyAh6oipvc9+EAbJ552JafnMnOq5nzmzWkp1jJdBhTAAGpmIpWihUG1+rfNhmEFM98gUZDdCHCDD4v6a7Q==";

    fn pin(name: &str, version: &str, integrity: &str) -> AllowedPackage {
        AllowedPackage {
            name: name.to_string(),
            version: version.to_string(),
            integrity: integrity.to_string(),
            allow_scripts: false,
        }
    }

    fn manifest() -> Manifest {
        Manifest {
            version: 2,
            allowed_packages: vec![pin(
                "@modelcontextprotocol/server-fetch",
                "2026.8.31",
                INTEGRITY,
            )],
        }
    }

    #[test]
    fn a_loaded_list_exposes_the_reviewed_pin() {
        let state = AllowlistState::Loaded(manifest());
        let pinned = state
            .pinned("@modelcontextprotocol/server-fetch")
            .expect("pinned");
        assert_eq!(
            pinned.install_spec(),
            "@modelcontextprotocol/server-fetch@2026.8.31"
        );
        assert!(!pinned.allow_scripts);
        assert!(AllowlistState::Absent.pinned("anything").is_none());
    }

    #[test]
    fn ranges_tags_and_missing_hashes_are_refused() {
        for (version, integrity) in [
            ("^1.2.3", INTEGRITY),
            ("latest", INTEGRITY),
            ("1.2", INTEGRITY),
            ("1.2.3 || 2.0.0", INTEGRITY),
            ("1.2.3", "sha1-abc="),
            ("1.2.3", ""),
        ] {
            let manifest = Manifest {
                version: 2,
                allowed_packages: vec![pin("pkg", version, integrity)],
            };
            assert!(
                manifest.validate().is_err(),
                "{version} / {integrity} must be refused"
            );
        }
        assert!(manifest().validate().is_ok());
    }

    #[test]
    fn the_packaged_list_is_fully_pinned() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(ALLOWLIST_RESOURCE);
        let manifest = load(&path).expect("packaged allow-list must load");
        assert!(!manifest.allowed_packages.is_empty());
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
