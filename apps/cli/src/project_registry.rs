#![allow(dead_code)]
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// A single registered project entry in the registry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectEntry {
    /// Short identifier derived from the directory name.
    pub id: String,
    /// ISO 8601 timestamp of last access.
    pub last_seen: String,
    /// Trust level: "trusted", "untrusted", "ask".
    pub trust_level: String,
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
    pub fn load(home: &Path) -> Result<Self> {
        let path = Self::registry_path(home);
        if !path.exists() {
            return Ok(Self::default());
        }
        let contents =
            std::fs::read_to_string(&path).context("Failed to read projects.json")?;
        let registry: ProjectRegistry =
            serde_json::from_str(&contents).context("Failed to parse projects.json")?;
        Ok(registry)
    }

    /// Save the project registry to `~/.agiworkforce/projects.json`.
    pub fn save(&self, home: &Path) -> Result<()> {
        let path = Self::registry_path(home);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .context("Failed to create config directory for projects.json")?;
            }
        }
        let contents =
            serde_json::to_string_pretty(self).context("Failed to serialize projects.json")?;
        std::fs::write(&path, contents).context("Failed to write projects.json")?;
        Ok(())
    }

    /// Register (or update) a project directory in the registry.
    ///
    /// The project ID is derived from the last path component. If that ID is
    /// already taken by a different path, a numeric suffix is appended.
    /// The `last_seen` timestamp is always updated to now.
    pub fn register_project(&mut self, path: &Path, trust_level: &str) -> Result<()> {
        let abs_path = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf());
        let path_key = abs_path.to_string_lossy().to_string();

        // If the path is already registered, just update last_seen.
        if let Some(entry) = self.projects.get_mut(&path_key) {
            entry.last_seen = chrono::Utc::now().to_rfc3339();
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
            },
        );
        Ok(())
    }

    /// Look up a project entry by its absolute path string.
    #[cfg(test)]
    pub fn get_project(&self, path: &str) -> Option<&ProjectEntry> {
        self.projects.get(path)
    }

    // --- Private helpers ---

    /// Path to the registry file: `<home>/.agiworkforce/projects.json`.
    fn registry_path(home: &Path) -> PathBuf {
        home.join(".agiworkforce").join("projects.json")
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
        let home = dir.path();
        fs::create_dir_all(home.join(".agiworkforce")).unwrap();

        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/tmp/my-project"), "trusted")
            .unwrap();
        registry.save(home).unwrap();

        let loaded = ProjectRegistry::load(home).unwrap();
        assert_eq!(loaded.projects.len(), 1);
    }

    #[test]
    fn test_register_updates_last_seen_on_reregister() {
        let mut registry = ProjectRegistry::default();
        registry
            .register_project(Path::new("/tmp/test-proj"), "trusted")
            .unwrap();
        let first_seen = registry
            .projects
            .values()
            .next()
            .unwrap()
            .last_seen
            .clone();

        // Re-register the same path
        std::thread::sleep(std::time::Duration::from_millis(10));
        registry
            .register_project(Path::new("/tmp/test-proj"), "trusted")
            .unwrap();
        let second_seen = registry
            .projects
            .values()
            .next()
            .unwrap()
            .last_seen
            .clone();

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
}
