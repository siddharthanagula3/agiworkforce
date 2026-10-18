use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub mod full_read;
pub mod host_path;
pub mod launch_env;
pub mod launch_files;
pub mod protected_paths;
pub mod relay;
pub mod resolve;
pub mod wrap;

pub use full_read::{
    credential_paths, full_read_program, full_read_program_guarding, full_read_program_protecting,
    FullReadSpec, ProtectedProgram,
};
pub use host_path::{sandbox_launcher, verify_writable_root};
pub use launch_env::{
    holds_a_credential, pinned_value, shown_value, value_is_secret, REDACTED_SUFFIX,
    VALUE_DIGEST_PREFIX,
};
pub use protected_paths::{
    folded, is_protected_project_path, is_protected_relative_path, protected_project_entries,
    AGENT_INSTRUCTION_PATHS, DEPENDENCY_TREE_NAMES, GIT_METADATA_ENTRY, HOOK_MANAGER_PATHS,
    PROJECT_CONFIG_PATHS,
};
pub use resolve::{landing_path, read_file_within, LinkLoop, NotRead};
pub use wrap::{
    project_config_paths, sandboxed_program, NetworkPolicy, SandboxBackend, SandboxSpec,
};

/// A directory a sandbox may grant write access to. The filesystem root, the
/// home directory and every directory above it are refused: writing there
/// reaches shell profiles, launch agents and every other user's project. A
/// path is judged where it resolves too, so a link or `..` that lands on the
/// home directory is refused like the home directory itself.
pub fn is_safe_write_root(path: &Path) -> bool {
    if !path.is_absolute() || path.parent().is_none() {
        return false;
    }
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    if resolved.parent().is_none() {
        return false;
    }
    match dirs::home_dir() {
        Some(home) => {
            let home = home.canonicalize().unwrap_or(home);
            !home.starts_with(path) && !home.starts_with(&resolved)
        }
        None => true,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxPolicy {
    DangerFullAccess,
    ReadOnly,
    WorkspaceWrite { writable_roots: Vec<PathBuf> },
}

impl SandboxPolicy {
    pub fn from_mode_str(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "read-only" | "readonly" => Self::ReadOnly,
            "workspace" | "workspace-write" => Self::WorkspaceWrite {
                writable_roots: Vec::new(),
            },
            "danger" | "full-access" | "danger-full-access" => Self::DangerFullAccess,
            other => {
                eprintln!(
                    "[sandbox-policy] WARNING: unrecognised sandbox mode '{}', defaulting to workspace-write (safe default). \
                     Use 'danger-full-access' explicitly to disable sandboxing.",
                    other
                );
                Self::WorkspaceWrite {
                    writable_roots: Vec::new(),
                }
            }
        }
    }

    pub fn mode_name(&self) -> &'static str {
        match self {
            Self::DangerFullAccess => "danger-full-access",
            Self::ReadOnly => "read-only",
            Self::WorkspaceWrite { .. } => "workspace-write",
        }
    }

    pub fn writable_roots(&self) -> &[PathBuf] {
        match self {
            Self::WorkspaceWrite { writable_roots } => writable_roots,
            _ => &[],
        }
    }

    pub fn is_read_only(&self) -> bool {
        matches!(self, Self::ReadOnly)
    }

    pub fn permits_workspace_writes(&self) -> bool {
        matches!(self, Self::WorkspaceWrite { .. })
    }
}

impl Default for SandboxPolicy {
    fn default() -> Self {
        Self::WorkspaceWrite {
            writable_roots: Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{is_safe_write_root, SandboxPolicy};
    use std::path::Path;

    #[test]
    fn home_root_and_their_ancestors_are_never_write_roots() {
        let home = dirs::home_dir().expect("home dir");
        let home = home.canonicalize().unwrap_or(home);
        assert!(!is_safe_write_root(Path::new("/")));
        assert!(!is_safe_write_root(&home));
        if let Some(parent) = home.parent() {
            assert!(!is_safe_write_root(parent));
        }
        assert!(is_safe_write_root(&home.join("projects").join("app")));
        assert!(!is_safe_write_root(Path::new("relative")));
    }

    #[test]
    fn a_path_that_resolves_to_home_is_refused_like_home() {
        let home = dirs::home_dir().expect("home dir");
        let home = home.canonicalize().unwrap_or(home);
        let Some(name) = home.file_name() else {
            return;
        };
        let dotted = home.join("..").join(name);
        assert!(!is_safe_write_root(&dotted), "{}", dotted.display());
        #[cfg(unix)]
        {
            let dir = std::env::temp_dir().join(format!(
                "agi-safe-root-{}-{}",
                std::process::id(),
                line!()
            ));
            std::fs::create_dir_all(&dir).expect("temp dir");
            let link = dir.join("home-link");
            std::os::unix::fs::symlink(&home, &link).expect("symlink");
            assert!(!is_safe_write_root(&link), "{}", link.display());
            let _ = std::fs::remove_dir_all(&dir);
        }
    }

    #[test]
    fn defaults_to_workspace_write() {
        assert!(matches!(
            SandboxPolicy::default(),
            SandboxPolicy::WorkspaceWrite { .. }
        ));
    }

    #[test]
    fn parses_supported_modes() {
        assert_eq!(
            SandboxPolicy::from_mode_str("read-only"),
            SandboxPolicy::ReadOnly
        );
        assert!(matches!(
            SandboxPolicy::from_mode_str("workspace-write"),
            SandboxPolicy::WorkspaceWrite { .. }
        ));
        // Unknown modes now safely default to WorkspaceWrite instead of DangerFullAccess
        assert!(matches!(
            SandboxPolicy::from_mode_str("unknown"),
            SandboxPolicy::WorkspaceWrite { .. }
        ));
        assert!(matches!(
            SandboxPolicy::from_mode_str("external-sandbox"),
            SandboxPolicy::WorkspaceWrite { .. }
        ));
        // DangerFullAccess must be requested explicitly
        assert_eq!(
            SandboxPolicy::from_mode_str("danger-full-access"),
            SandboxPolicy::DangerFullAccess
        );
    }

    #[test]
    fn exposes_stable_mode_names() {
        assert_eq!(
            SandboxPolicy::DangerFullAccess.mode_name(),
            "danger-full-access"
        );
        assert_eq!(SandboxPolicy::ReadOnly.mode_name(), "read-only");
        assert_eq!(
            SandboxPolicy::WorkspaceWrite {
                writable_roots: Vec::new(),
            }
            .mode_name(),
            "workspace-write"
        );
    }
}
