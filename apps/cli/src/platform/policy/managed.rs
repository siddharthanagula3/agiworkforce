//! The managed (organization) configuration layer that sits above the user
//! config and the repository's `.agiworkforce/policy.toml`.

use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::engine::PolicyRule;

pub const MANAGED_POLICY_ENV: &str = "AGIWORKFORCE_MANAGED_POLICY";
pub const MANAGED_POLICY_CACHE_FILE: &str = "managed-policy.toml";

/// The `policy`, `config` and `trust` sections an administrator may pin.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ManagedDocument {
    #[serde(default)]
    pub policy: Option<ManagedPolicySection>,
    #[serde(default)]
    pub config: Option<ManagedConfigSection>,
    #[serde(default)]
    pub trust: Option<ManagedTrustSection>,
    /// The MDM file is shared with the hook, plugin and sandbox policies, which
    /// own their own sections. Capturing them keeps `deny_unknown_fields` from
    /// rejecting a document this reader only partly owns.
    #[serde(default, rename = "hooks")]
    _hooks: Option<serde_json::Value>,
    #[serde(default, rename = "plugins")]
    _plugins: Option<serde_json::Value>,
    #[serde(default, rename = "sandbox")]
    _sandbox: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedPolicySection {
    #[serde(default)]
    pub rules: Vec<PolicyRule>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedConfigSection {
    /// Pinned approval mode. The user and project layers may not replace it.
    #[serde(default)]
    pub approval_mode: Option<String>,
    /// Pinned privacy mode, for organizations that require Local or Managed.
    #[serde(default)]
    pub privacy_mode: Option<String>,
    /// When false, `.agiworkforce/config.toml` is never merged, however the
    /// workspace is trusted.
    #[serde(default)]
    pub allow_project_config: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ManagedTrustSection {
    /// When false, no new workspace trust grant may be recorded on this device.
    #[serde(default = "default_true")]
    pub allow_grant: bool,
}

fn default_true() -> bool {
    true
}

impl Default for ManagedTrustSection {
    fn default() -> Self {
        Self { allow_grant: true }
    }
}

#[derive(Debug, Clone)]
pub enum ManagedPolicyState {
    Absent,
    Loaded {
        document: ManagedDocument,
        source: PathBuf,
    },
    Invalid(String),
}

impl ManagedPolicyState {
    pub fn document(&self) -> Option<&ManagedDocument> {
        match self {
            Self::Loaded { document, .. } => Some(document),
            _ => None,
        }
    }

    pub fn source(&self) -> Option<&Path> {
        match self {
            Self::Loaded { source, .. } => Some(source.as_path()),
            _ => None,
        }
    }
}

/// Candidate managed-policy files, most authoritative first.
///
/// The MDM location outranks `AGIWORKFORCE_MANAGED_POLICY` on purpose: a user
/// controls their own environment, so an env pointer must never be able to
/// replace a policy the administrator installed on the machine.
pub fn managed_policy_sources() -> Vec<PathBuf> {
    let mut sources = Vec::new();
    if let Some(path) = crate::features::hooks::managed::managed_settings_path() {
        sources.push(path);
    }
    if let Some(value) = std::env::var_os(MANAGED_POLICY_ENV) {
        let path = PathBuf::from(value);
        if !path.as_os_str().is_empty() {
            sources.push(path);
        }
    }
    if let Ok(dir) = crate::config::CliConfig::config_dir() {
        sources.push(dir.join(MANAGED_POLICY_CACHE_FILE));
    }
    sources
}

/// Load the first managed policy that exists. A file that exists but does not
/// parse fails closed: the caller treats `Invalid` as "restrictions apply".
pub fn load_managed_policy() -> ManagedPolicyState {
    for path in managed_policy_sources() {
        match load_managed_policy_from(&path) {
            ManagedPolicyState::Absent => continue,
            state => return state,
        }
    }
    ManagedPolicyState::Absent
}

pub fn load_managed_policy_from(path: &Path) -> ManagedPolicyState {
    let raw = match std::fs::read_to_string(path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return ManagedPolicyState::Absent
        }
        Err(error) => {
            return ManagedPolicyState::Invalid(format!("cannot read {}: {error}", path.display()))
        }
    };
    let parsed = if path.extension().is_some_and(|ext| ext == "json") {
        serde_json::from_str::<ManagedDocument>(&raw).map_err(|error| error.to_string())
    } else {
        toml::from_str::<ManagedDocument>(&raw).map_err(|error| error.to_string())
    };
    match parsed {
        Ok(document)
            if document.policy.is_none()
                && document.config.is_none()
                && document.trust.is_none() =>
        {
            ManagedPolicyState::Absent
        }
        Ok(document) => ManagedPolicyState::Loaded {
            document,
            source: path.to_path_buf(),
        },
        Err(error) => ManagedPolicyState::Invalid(format!("{}: {error}", path.display())),
    }
}

/// Whether this device may record a new workspace trust grant.
pub fn trust_grants_allowed() -> bool {
    match load_managed_policy() {
        ManagedPolicyState::Loaded { document, .. } => {
            document.trust.unwrap_or_default().allow_grant
        }
        // An unreadable managed policy must not become a way to bypass it.
        ManagedPolicyState::Invalid(_) => false,
        ManagedPolicyState::Absent => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, body: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn an_mdm_document_sharing_the_file_with_other_readers_still_parses() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(
            dir.path(),
            "managed-settings.json",
            r#"{"sandbox":{"forced":true},"trust":{"allowGrant":false}}"#,
        );
        let state = load_managed_policy_from(&path);
        assert!(!state.document().unwrap().trust.clone().unwrap().allow_grant);
    }

    #[test]
    fn a_document_with_none_of_our_sections_is_absent_not_empty() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "managed-settings.json", r#"{"hooks":{}}"#);
        assert!(matches!(
            load_managed_policy_from(&path),
            ManagedPolicyState::Absent
        ));
    }

    #[test]
    fn a_malformed_managed_document_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(dir.path(), "managed-policy.toml", "[policy\nrules = ");
        assert!(matches!(
            load_managed_policy_from(&path),
            ManagedPolicyState::Invalid(_)
        ));
    }

    #[test]
    fn a_toml_managed_policy_carries_rules_and_config() {
        let dir = tempfile::tempdir().unwrap();
        let path = write(
            dir.path(),
            "managed-policy.toml",
            "[config]\napprovalMode = \"ask\"\nallowProjectConfig = false\n\n[[policy.rules]]\ntool = \"run_command\"\npattern = \"curl\"\ndecision = \"deny\"\npriority = 900\n",
        );
        let state = load_managed_policy_from(&path);
        let document = state.document().unwrap();
        assert_eq!(document.policy.as_ref().unwrap().rules.len(), 1);
        let config = document.config.as_ref().unwrap();
        assert_eq!(config.approval_mode.as_deref(), Some("ask"));
        assert_eq!(config.allow_project_config, Some(false));
    }
}
