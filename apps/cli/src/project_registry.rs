use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// The trust levels a project entry may carry. Persisted as free-form strings
/// for forward/backward compatibility, but validated on write via
/// [`ProjectRegistry::register_project`] so a typo'd value cannot reach disk and
/// be mis-evaluated by downstream trust checks.
pub const ALLOWED_TRUST_LEVELS: [&str; 3] = ["trusted", "untrusted", "ask"];

/// A single registered project entry in the registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    /// Short identifier derived from the directory name.
    pub id: String,
    /// ISO 8601 timestamp of last access.
    pub last_seen: String,
    /// Trust level: "trusted", "untrusted", "ask".
    pub trust_level: String,
    /// Id of the account project this directory belongs to, when the user has
    /// linked one. A directory is never published to the account by being
    /// visited; the link is always explicit.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cloud_project_id: Option<String>,
    /// Stable repository identity this grant is keyed by, so moving or
    /// re-cloning the checkout does not silently drop or re-use the decision.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<String>,
    /// Who granted trust, and on which machine. Absent on entries written
    /// before grants carried an identity; those stay honoured as-is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trusted_by: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trusted_on: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trusted_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revoked_at: Option<String>,
}

/// Registry of known projects, stored as `~/.agiworkforce/projects.json`.
///
/// Maps absolute directory paths to their `ProjectEntry` metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProjectRegistry {
    #[serde(flatten)]
    pub projects: HashMap<String, ProjectEntry>,
}

impl ProjectRegistry {
    /// Load the project registry from `~/.agiworkforce/projects.json`.
    ///
    /// Returns a default (empty) registry if the file does not exist.
    pub fn load(config_dir: &Path) -> Result<Self> {
        let path = Self::registry_path(config_dir);
        let legacy_path = Self::legacy_registry_path(config_dir);
        let path = if path.exists() {
            path
        } else if legacy_path.exists() {
            legacy_path
        } else {
            return Ok(Self::default());
        };
        let contents = std::fs::read_to_string(&path).context("Failed to read projects.json")?;
        let registry: ProjectRegistry =
            serde_json::from_str(&contents).context("Failed to parse projects.json")?;
        Ok(registry)
    }

    /// Save the project registry to `~/.agiworkforce/projects.json`.
    pub fn save(&self, config_dir: &Path) -> Result<()> {
        let path = Self::registry_path(config_dir);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .context("Failed to create config directory for projects.json")?;
            }
        }
        let contents =
            serde_json::to_string_pretty(self).context("Failed to serialize projects.json")?;
        // Write to a sibling temp file and atomically rename it into place so a
        // crash or concurrent invocation mid-write cannot leave projects.json
        // truncated/corrupted (which would lose all registered trust levels).
        let tmp_path = path.with_extension("json.tmp");
        std::fs::write(&tmp_path, contents).context("Failed to write temp projects.json")?;
        std::fs::rename(&tmp_path, &path).context("Failed to persist projects.json")?;
        Ok(())
    }

    /// Register (or update) a project directory in the registry.
    ///
    /// The project ID is derived from the last path component. If that ID is
    /// already taken by a different path, a numeric suffix is appended.
    /// The `last_seen` timestamp is always updated to now.
    pub fn register_project(&mut self, path: &Path, trust_level: &str) -> Result<()> {
        if !ALLOWED_TRUST_LEVELS.contains(&trust_level) {
            bail!("Invalid trust level {trust_level:?}; expected one of {ALLOWED_TRUST_LEVELS:?}");
        }
        let abs_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let path_key = abs_path.to_string_lossy().to_string();

        // If the path is already registered, update trust and last_seen.
        if let Some(entry) = self.projects.get_mut(&path_key) {
            entry.last_seen = chrono::Utc::now().to_rfc3339();
            entry.trust_level = trust_level.to_string();
            return Ok(());
        }

        // Derive an ID from the last directory component.
        let base_id = abs_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "project".to_string());

        let id = self.unique_id(&base_id, &path_key);

        self.projects.insert(
            path_key,
            ProjectEntry {
                id,
                last_seen: chrono::Utc::now().to_rfc3339(),
                trust_level: trust_level.to_string(),
                cloud_project_id: None,
                identity: None,
                trusted_by: None,
                trusted_on: None,
                trusted_at: None,
                revoked_at: None,
            },
        );
        Ok(())
    }

    /// Record an explicit trust grant for `path`, bound to the repository
    /// identity, the account that granted it and the machine it was granted on.
    pub fn trust(&mut self, path: &Path, identity: &str, actor: &str, machine: &str) -> Result<()> {
        if identity.trim().is_empty() {
            bail!("A trust grant needs a repository identity");
        }
        self.register_project(path, "trusted")?;
        let entry = self
            .projects
            .get_mut(&Self::path_key(path))
            .context("Project entry vanished while recording a trust grant")?;
        entry.trust_level = "trusted".to_string();
        entry.identity = Some(identity.to_string());
        entry.trusted_by = Some(actor.to_string());
        entry.trusted_on = Some(machine.to_string());
        entry.trusted_at = Some(chrono::Utc::now().to_rfc3339());
        entry.revoked_at = None;
        Ok(())
    }

    /// Revoke trust for a repository identity, and for the directory itself.
    ///
    /// Revocation is identity-scoped: every checkout of the same repository
    /// loses the grant, not only the path the command ran in. Returns how many
    /// entries were revoked.
    pub fn revoke(&mut self, path: &Path, identity: &str) -> usize {
        let path_key = Self::path_key(path);
        let now = chrono::Utc::now().to_rfc3339();
        let mut revoked = 0;
        for (key, entry) in self.projects.iter_mut() {
            let matches_identity =
                !identity.is_empty() && entry.identity.as_deref() == Some(identity);
            if !matches_identity && key != &path_key {
                continue;
            }
            if entry.trust_level == "untrusted" && entry.revoked_at.is_some() {
                continue;
            }
            entry.trust_level = "untrusted".to_string();
            entry.revoked_at = Some(now.clone());
            entry.trusted_by = None;
            entry.trusted_on = None;
            entry.trusted_at = None;
            revoked += 1;
        }
        revoked
    }

    /// Look up the entry that governs `path`: the identity-keyed grant first,
    /// the path-keyed entry second, so a registry written before grants carried
    /// an identity still resolves.
    pub fn entry_for(&self, path: &Path, identity: &str) -> Option<&ProjectEntry> {
        let path_key = Self::path_key(path);
        if let Some(entry) = self.projects.get(&path_key) {
            return Some(entry);
        }
        if identity.is_empty() {
            return None;
        }
        self.projects
            .values()
            .find(|entry| entry.identity.as_deref() == Some(identity))
    }

    fn path_key(path: &Path) -> String {
        path.canonicalize()
            .unwrap_or_else(|_| path.to_path_buf())
            .to_string_lossy()
            .to_string()
    }

    /// Look up a project entry by its absolute path string.
    #[cfg(test)]
    pub fn get_project(&self, path: &str) -> Option<&ProjectEntry> {
        self.projects.get(path)
    }

    /// Point a directory at an account project. Registers the directory first
    /// when it is not known yet, so linking never depends on having chatted
    /// here before.
    pub fn link_cloud_project(&mut self, path: &Path, cloud_project_id: &str) -> Result<()> {
        if cloud_project_id.trim().is_empty() {
            bail!("An account project id cannot be blank");
        }
        let abs_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        let path_key = abs_path.to_string_lossy().to_string();
        if !self.projects.contains_key(&path_key) {
            self.register_project(path, "ask")?;
        }
        let entry = self
            .projects
            .get_mut(&path_key)
            .context("Project entry vanished while linking it to an account project")?;
        entry.cloud_project_id = Some(cloud_project_id.trim().to_string());
        Ok(())
    }

    /// The account project a directory is linked to, if any.
    pub fn cloud_project_for(&self, path: &Path) -> Option<&str> {
        let abs_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        self.projects
            .get(&abs_path.to_string_lossy().to_string())
            .and_then(|entry| entry.cloud_project_id.as_deref())
    }

    // --- Private helpers ---

    /// Path to the registry file: `<config_dir>/projects.json`.
    fn registry_path(config_dir: &Path) -> PathBuf {
        config_dir.join("projects.json")
    }

    /// Legacy path used by the old buggy implementation.
    fn legacy_registry_path(config_dir: &Path) -> PathBuf {
        config_dir.join(".agiworkforce").join("projects.json")
    }

    /// Generate a unique ID for a project. If the base ID is already taken by
    /// a different path, append an incrementing numeric suffix.
    fn unique_id(&self, base_id: &str, path_key: &str) -> String {
        let id_taken = |candidate: &str| -> bool {
            self.projects
                .iter()
                .any(|(k, entry)| k != path_key && entry.id == candidate)
        };

        if !id_taken(base_id) {
            return base_id.to_string();
        }

        let mut suffix = 2u32;
        loop {
            let candidate = format!("{}-{}", base_id, suffix);
            if !id_taken(&candidate) {
                return candidate;
            }
            suffix += 1;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_load_nonexistent_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        let registry = ProjectRegistry::load(dir.path()).unwrap();
        assert!(registry.projects.is_empty());
    }

    #[test]
    fn test_save_and_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let config_dir = dir.path().join(".agiworkforce");
        fs::create_dir_all(&config_dir).unwrap();

        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/tmp/my-project"), "trusted")
            .unwrap();
        registry.save(&config_dir).unwrap();

        let loaded = ProjectRegistry::load(&config_dir).unwrap();
        assert_eq!(loaded.projects.len(), 1);
    }

    #[test]
    fn test_load_reads_legacy_nested_path() {
        let dir = tempfile::tempdir().unwrap();
        let config_dir = dir.path().join(".agiworkforce");
        let legacy_dir = config_dir.join(".agiworkforce");
        fs::create_dir_all(&legacy_dir).unwrap();
        let legacy_path = legacy_dir.join("projects.json");
        fs::write(
            legacy_path,
            r#"{
  "/tmp/project": {
    "id": "project",
    "last_seen": "2026-03-26T00:00:00Z",
    "trust_level": "trusted"
  }
}"#,
        )
        .unwrap();

        let loaded = ProjectRegistry::load(&config_dir).unwrap();

        assert_eq!(loaded.projects.len(), 1);
        assert_eq!(
            loaded.projects.get("/tmp/project").unwrap().trust_level,
            "trusted"
        );
    }

    #[test]
    fn test_register_updates_last_seen_on_reregister() {
        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/tmp/test-proj"), "trusted")
            .unwrap();
        let first_seen = registry.projects.values().next().unwrap().last_seen.clone();

        // Re-register the same path
        std::thread::sleep(std::time::Duration::from_millis(10));
        registry
            .register_project(Path::new("/tmp/test-proj"), "trusted")
            .unwrap();
        let second_seen = registry.projects.values().next().unwrap().last_seen.clone();

        // last_seen should be updated (or at least not earlier)
        assert!(second_seen >= first_seen);
    }

    #[test]
    fn test_unique_id_appends_suffix_for_collision() {
        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/home/user/project"), "trusted")
            .unwrap();
        registry
            .register_project(Path::new("/home/other/project"), "trusted")
            .unwrap();

        let ids: Vec<String> = registry.projects.values().map(|e| e.id.clone()).collect();
        assert!(ids.contains(&"project".to_string()));
        assert!(ids.contains(&"project-2".to_string()));
    }

    #[test]
    fn test_get_project() {
        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/tmp/foo"), "trusted")
            .unwrap();

        // get_project uses the canonical path as key
        let key = Path::new("/tmp/foo")
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from("/tmp/foo"))
            .to_string_lossy()
            .to_string();
        let entry = registry.get_project(&key);
        assert!(entry.is_some());
        assert_eq!(entry.unwrap().trust_level, "trusted");
    }

    #[test]
    fn test_register_rejects_invalid_trust_level() {
        let mut registry = ProjectRegistry::default();
        let err = registry
            .register_project(Path::new("/tmp/bad-trust"), "trustd")
            .unwrap_err();
        assert!(err.to_string().contains("Invalid trust level"));
        assert!(registry.projects.is_empty());
    }

    #[test]
    fn test_register_accepts_all_documented_trust_levels() {
        for (i, level) in ALLOWED_TRUST_LEVELS.iter().enumerate() {
            let mut registry = ProjectRegistry::default();
            registry
                .register_project(Path::new(&format!("/tmp/trust-{i}")), level)
                .unwrap();
            assert_eq!(registry.projects.len(), 1);
        }
    }

    #[test]
    fn test_reregister_updates_trust_level() {
        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/tmp/trust-me"), "untrusted")
            .unwrap();

        registry
            .register_project(Path::new("/tmp/trust-me"), "trusted")
            .unwrap();

        let key = Path::new("/tmp/trust-me")
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from("/tmp/trust-me"))
            .to_string_lossy()
            .to_string();
        assert_eq!(registry.get_project(&key).unwrap().trust_level, "trusted");
    }

    #[test]
    fn a_directory_carries_no_account_project_until_it_is_linked() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("repo");
        std::fs::create_dir_all(&project).unwrap();

        let mut registry = ProjectRegistry::default();
        registry.register_project(&project, "trusted").unwrap();
        assert_eq!(registry.cloud_project_for(&project), None);

        registry.link_cloud_project(&project, "  p-123  ").unwrap();
        assert_eq!(registry.cloud_project_for(&project), Some("p-123"));
    }

    #[test]
    fn linking_registers_a_directory_that_was_never_visited() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("fresh");
        std::fs::create_dir_all(&project).unwrap();

        let mut registry = ProjectRegistry::default();
        registry.link_cloud_project(&project, "p-9").unwrap();
        assert_eq!(registry.cloud_project_for(&project), Some("p-9"));
    }

    #[test]
    fn a_blank_account_project_id_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("repo");
        std::fs::create_dir_all(&project).unwrap();
        let mut registry = ProjectRegistry::default();
        assert!(registry.link_cloud_project(&project, "   ").is_err());
    }

    #[test]
    fn an_account_link_survives_a_save_and_load() {
        let config = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("repo");
        std::fs::create_dir_all(&project).unwrap();

        let mut registry = ProjectRegistry::default();
        registry.link_cloud_project(&project, "p-77").unwrap();
        registry.save(config.path()).unwrap();

        let reloaded = ProjectRegistry::load(config.path()).unwrap();
        assert_eq!(reloaded.cloud_project_for(&project), Some("p-77"));
    }

    #[test]
    fn a_grant_records_the_identity_the_account_and_the_machine() {
        let dir = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry
            .trust(dir.path(), "git:github.com/o/r", "ada", "laptop")
            .unwrap();

        let entry = registry
            .entry_for(dir.path(), "git:github.com/o/r")
            .unwrap();
        assert_eq!(entry.trust_level, "trusted");
        assert_eq!(entry.identity.as_deref(), Some("git:github.com/o/r"));
        assert_eq!(entry.trusted_by.as_deref(), Some("ada"));
        assert_eq!(entry.trusted_on.as_deref(), Some("laptop"));
        assert!(entry.trusted_at.is_some());
        assert!(entry.revoked_at.is_none());
    }

    #[test]
    fn a_grant_without_an_identity_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        assert!(registry.trust(dir.path(), "  ", "ada", "laptop").is_err());
    }

    #[test]
    fn revoking_clears_every_checkout_of_the_same_repository() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        let unrelated = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry
            .trust(first.path(), "git:github.com/o/r", "ada", "laptop")
            .unwrap();
        registry
            .trust(second.path(), "git:github.com/o/r", "ada", "laptop")
            .unwrap();
        registry
            .trust(unrelated.path(), "git:github.com/o/other", "ada", "laptop")
            .unwrap();

        assert_eq!(registry.revoke(first.path(), "git:github.com/o/r"), 2);

        for dir in [first.path(), second.path()] {
            let entry = registry.entry_for(dir, "git:github.com/o/r").unwrap();
            assert_eq!(entry.trust_level, "untrusted");
            assert!(entry.revoked_at.is_some());
            assert!(entry.trusted_by.is_none());
        }
        assert_eq!(
            registry
                .entry_for(unrelated.path(), "git:github.com/o/other")
                .unwrap()
                .trust_level,
            "trusted"
        );
    }

    #[test]
    fn revoking_twice_reports_nothing_left_to_revoke() {
        let dir = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry
            .trust(dir.path(), "git:github.com/o/r", "ada", "laptop")
            .unwrap();
        assert_eq!(registry.revoke(dir.path(), "git:github.com/o/r"), 1);
        assert_eq!(registry.revoke(dir.path(), "git:github.com/o/r"), 0);
    }

    #[test]
    fn a_fresh_clone_of_a_trusted_repository_resolves_by_identity() {
        let original = tempfile::tempdir().unwrap();
        let clone = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry
            .trust(original.path(), "git:github.com/o/r", "ada", "laptop")
            .unwrap();

        let entry = registry
            .entry_for(clone.path(), "git:github.com/o/r")
            .expect("identity lookup finds the grant at another path");
        assert_eq!(entry.trust_level, "trusted");
        assert!(registry.entry_for(clone.path(), "git:other").is_none());
    }

    #[test]
    fn a_grant_survives_a_save_and_load() {
        let config = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        let mut registry = ProjectRegistry::default();
        registry
            .trust(dir.path(), "git:github.com/o/r", "ada", "laptop")
            .unwrap();
        registry.save(config.path()).unwrap();

        let reloaded = ProjectRegistry::load(config.path()).unwrap();
        let entry = reloaded
            .entry_for(dir.path(), "git:github.com/o/r")
            .unwrap();
        assert_eq!(entry.trusted_on.as_deref(), Some("laptop"));
    }

    #[test]
    fn a_registry_written_before_account_links_still_loads() {
        let config = tempfile::tempdir().unwrap();
        std::fs::write(
            config.path().join("projects.json"),
            r#"{"/tmp/legacy":{"id":"legacy","last_seen":"2026-01-01T00:00:00Z","trust_level":"trusted"}}"#,
        )
        .unwrap();
        let registry = ProjectRegistry::load(config.path()).unwrap();
        assert_eq!(
            registry
                .projects
                .get("/tmp/legacy")
                .unwrap()
                .cloud_project_id,
            None
        );
    }
}
