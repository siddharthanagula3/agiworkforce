use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum SandboxPolicy {
    DangerFullAccess,
    ReadOnly,
    WorkspaceWrite { writable_roots: Vec<PathBuf> },
    ExternalSandbox,
}

impl SandboxPolicy {
    pub fn from_mode_str(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "read-only" | "readonly" => Self::ReadOnly,
            "workspace" | "workspace-write" => Self::WorkspaceWrite {
                writable_roots: Vec::new(),
            },
            "external" | "external-sandbox" => Self::ExternalSandbox,
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
            Self::ExternalSandbox => "external-sandbox",
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
    use super::SandboxPolicy;

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
        assert_eq!(
            SandboxPolicy::from_mode_str("external-sandbox"),
            SandboxPolicy::ExternalSandbox
        );
        // Unknown modes now safely default to WorkspaceWrite instead of DangerFullAccess
        assert!(matches!(
            SandboxPolicy::from_mode_str("unknown"),
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
