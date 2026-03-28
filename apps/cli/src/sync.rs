//! Cross-device dotfile sync for AGI Workforce CLI.
//!
//! Provides file-hash based change detection, export/import bundles, and
//! a sync manifest that tracks per-file SHA256 hashes and timestamps.
//!
//! Synced files (small, important config):
//!   - config.toml, mcp.json, memories/raw_memories.md, projects.json, INSTRUCTIONS.md
//!
//! NOT synced (too large or device-specific):
//!   - sessions.db, history.jsonl, shell_snapshots/, plugins/cache/

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Persistent manifest stored at `~/.agiworkforce/sync_manifest.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncManifest {
    /// Unique identifier for this device (UUID v4, generated on first sync).
    pub device_id: String,
    /// ISO 8601 timestamp of the last sync operation.
    pub last_sync: String,
    /// Per-file hash entries keyed by relative path (e.g. "config.toml").
    pub files: HashMap<String, FileHash>,
}

/// Hash + metadata for a single synced file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileHash {
    /// Hex-encoded SHA256 of the file contents.
    pub sha256: String,
    /// ISO 8601 timestamp of the file's last modification.
    pub modified_at: String,
    /// Size in bytes.
    pub size_bytes: u64,
}

/// Portable bundle of synced files for export/import.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncBundle {
    /// Device that created the bundle.
    pub device_id: String,
    /// ISO 8601 timestamp when the bundle was exported.
    pub exported_at: String,
    /// File contents keyed by relative path.
    pub files: HashMap<String, SyncedFile>,
}

/// A single file inside a sync bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncedFile {
    /// UTF-8 file content.
    pub content: String,
    /// Hex-encoded SHA256 of `content`.
    pub sha256: String,
}

/// Describes how a file changed since the last sync.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChangeType {
    Unchanged,
    Modified,
    New,
    Deleted,
}

impl std::fmt::Display for ChangeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unchanged => write!(f, "unchanged"),
            Self::Modified => write!(f, "modified"),
            Self::New => write!(f, "new"),
            Self::Deleted => write!(f, "deleted"),
        }
    }
}

/// Report returned after importing a sync bundle.
pub struct SyncReport {
    /// Files that were written (created or overwritten).
    pub files_updated: Vec<String>,
    /// Files skipped because the content was identical.
    pub files_skipped: Vec<String>,
    /// Files with local changes since last sync (kept local, flagged for user).
    pub conflicts: Vec<String>,
}

// ---------------------------------------------------------------------------
// ConfigSync
// ---------------------------------------------------------------------------

pub struct ConfigSync;

impl ConfigSync {
    /// Relative paths (inside `~/.agiworkforce/`) that are synced across devices.
    const SYNCED_FILES: &'static [&'static str] = &[
        "config.toml",
        "mcp.json",
        "memories/raw_memories.md",
        "projects.json",
        "INSTRUCTIONS.md",
    ];

    const MANIFEST_FILE: &'static str = "sync_manifest.json";

    // ----- Manifest -----

    /// Load the sync manifest from disk, or return `None` if it doesn't exist.
    pub fn load_manifest(home: &Path) -> Result<Option<SyncManifest>> {
        let path = home.join(Self::MANIFEST_FILE);
        if !path.exists() {
            return Ok(None);
        }
        let contents = fs::read_to_string(&path).context("failed to read sync_manifest.json")?;
        let manifest: SyncManifest =
            serde_json::from_str(&contents).context("failed to parse sync_manifest.json")?;
        Ok(Some(manifest))
    }

    /// Save the sync manifest to disk.
    fn save_manifest(home: &Path, manifest: &SyncManifest) -> Result<()> {
        let path = home.join(Self::MANIFEST_FILE);
        let contents = serde_json::to_string_pretty(manifest)
            .context("failed to serialize sync_manifest.json")?;
        fs::write(&path, contents).context("failed to write sync_manifest.json")?;
        Ok(())
    }

    /// Get or create the device ID. Stored inside the manifest; if no manifest
    /// exists yet, a new UUID is generated.
    fn device_id(home: &Path) -> Result<String> {
        if let Some(manifest) = Self::load_manifest(home)? {
            return Ok(manifest.device_id);
        }
        Ok(uuid::Uuid::new_v4().to_string())
    }

    // ----- Hashing -----

    /// Compute SHA256 hex digest for a byte slice.
    fn sha256_hex(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    // ----- Public API -----

    /// Compute the current manifest from files on disk.
    pub fn compute_manifest(home: &Path) -> Result<SyncManifest> {
        let device_id = Self::device_id(home)?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut files = HashMap::new();

        for rel_path in Self::SYNCED_FILES {
            let abs_path = home.join(rel_path);
            if !abs_path.exists() {
                continue;
            }
            let data =
                fs::read(&abs_path).with_context(|| format!("failed to read {}", rel_path))?;
            let meta =
                fs::metadata(&abs_path).with_context(|| format!("failed to stat {}", rel_path))?;
            let modified_at = meta
                .modified()
                .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                .unwrap_or_else(|_| now.clone());

            files.insert(
                rel_path.to_string(),
                FileHash {
                    sha256: Self::sha256_hex(&data),
                    modified_at,
                    size_bytes: meta.len(),
                },
            );
        }

        Ok(SyncManifest {
            device_id,
            last_sync: now,
            files,
        })
    }

    /// Export synced files into a portable JSON bundle.
    pub fn export(home: &Path) -> Result<SyncBundle> {
        let device_id = Self::device_id(home)?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut files = HashMap::new();

        for rel_path in Self::SYNCED_FILES {
            let abs_path = home.join(rel_path);
            if !abs_path.exists() {
                continue;
            }
            let content = fs::read_to_string(&abs_path)
                .with_context(|| format!("failed to read {} for export", rel_path))?;
            let sha256 = Self::sha256_hex(content.as_bytes());
            files.insert(rel_path.to_string(), SyncedFile { content, sha256 });
        }

        // Update manifest after export
        let manifest = Self::compute_manifest(home)?;
        Self::save_manifest(home, &manifest)?;

        Ok(SyncBundle {
            device_id,
            exported_at: now,
            files,
        })
    }

    /// Import a sync bundle, merging with local files.
    ///
    /// Merge strategy:
    /// - Local file absent -> import it
    /// - Local unchanged since last sync -> overwrite with imported
    /// - Local changed since last sync -> conflict (keep local, report)
    /// - `config.toml`: section-level TOML merge (add new keys, don't clobber existing)
    /// - `mcp.json`: merge server entries (add new, don't remove existing)
    pub fn import(home: &Path, bundle: &SyncBundle) -> Result<SyncReport> {
        let old_manifest = Self::load_manifest(home)?;
        let mut report = SyncReport {
            files_updated: Vec::new(),
            files_skipped: Vec::new(),
            conflicts: Vec::new(),
        };

        // Canonicalize home once — on macOS /var is a symlink to /private/var,
        // so we need a stable prefix for starts_with checks.
        let canonical_home = home.canonicalize().unwrap_or_else(|_| home.to_path_buf());

        for (rel_path, synced) in &bundle.files {
            // Validate that rel_path doesn't escape the home directory (path traversal).
            // Build abs_path from the canonical home so both paths share the same
            // symlink-resolved prefix — avoids false positives when the target file
            // doesn't exist yet (canonicalize would fail on a non-existent path).
            let abs_path = canonical_home.join(rel_path);
            let canonical_abs = abs_path.canonicalize().unwrap_or_else(|_| abs_path.clone());
            if !canonical_abs.starts_with(&canonical_home) {
                anyhow::bail!(
                    "Sync bundle contains path traversal: '{}' resolves outside home directory",
                    rel_path
                );
            }

            // Ensure parent directory exists
            if let Some(parent) = abs_path.parent() {
                if !parent.exists() {
                    fs::create_dir_all(parent)
                        .with_context(|| format!("failed to create directory for {}", rel_path))?;
                }
            }

            if !abs_path.exists() {
                // File doesn't exist locally -> import it
                fs::write(&abs_path, &synced.content)
                    .with_context(|| format!("failed to write {}", rel_path))?;
                report.files_updated.push(rel_path.clone());
                continue;
            }

            // File exists locally — check if it changed since last sync
            let local_data = fs::read(&abs_path)
                .with_context(|| format!("failed to read local {}", rel_path))?;
            let local_hash = Self::sha256_hex(&local_data);

            // If remote content matches local, skip
            if local_hash == synced.sha256 {
                report.files_skipped.push(rel_path.clone());
                continue;
            }

            // Check whether the local file changed since last sync
            let local_changed_since_sync = match &old_manifest {
                Some(m) => match m.files.get(rel_path.as_str()) {
                    Some(old_hash) => old_hash.sha256 != local_hash,
                    None => true, // wasn't tracked before -> treat as changed
                },
                None => true, // no previous sync -> conservative: treat as changed
            };

            if local_changed_since_sync {
                // Both sides changed -> conflict
                // Special handling for config.toml and mcp.json: attempt merge
                if rel_path == "config.toml" {
                    match Self::merge_toml(&local_data, &synced.content) {
                        Ok(merged) => {
                            fs::write(&abs_path, merged)
                                .with_context(|| format!("failed to write merged {}", rel_path))?;
                            report.files_updated.push(rel_path.clone());
                        }
                        Err(_) => {
                            report.conflicts.push(rel_path.clone());
                        }
                    }
                } else if rel_path == "mcp.json" {
                    match Self::merge_mcp_json(&local_data, &synced.content) {
                        Ok(merged) => {
                            fs::write(&abs_path, merged)
                                .with_context(|| format!("failed to write merged {}", rel_path))?;
                            report.files_updated.push(rel_path.clone());
                        }
                        Err(_) => {
                            report.conflicts.push(rel_path.clone());
                        }
                    }
                } else {
                    report.conflicts.push(rel_path.clone());
                }
            } else {
                // Local unchanged since last sync -> safe to overwrite
                fs::write(&abs_path, &synced.content)
                    .with_context(|| format!("failed to write {}", rel_path))?;
                report.files_updated.push(rel_path.clone());
            }
        }

        // Save updated manifest
        let new_manifest = Self::compute_manifest(home)?;
        Self::save_manifest(home, &new_manifest)?;

        Ok(report)
    }

    /// Check which synced files have changed since the last sync.
    pub fn status(home: &Path) -> Result<Vec<(String, ChangeType)>> {
        let old_manifest = Self::load_manifest(home)?;
        let mut result = Vec::new();

        for rel_path in Self::SYNCED_FILES {
            let abs_path = home.join(rel_path);
            let exists = abs_path.exists();

            match &old_manifest {
                Some(m) => {
                    if let Some(old_hash) = m.files.get(*rel_path) {
                        if !exists {
                            result.push((rel_path.to_string(), ChangeType::Deleted));
                        } else {
                            let data = fs::read(&abs_path)
                                .with_context(|| format!("failed to read {}", rel_path))?;
                            let current_hash = Self::sha256_hex(&data);
                            if current_hash == old_hash.sha256 {
                                result.push((rel_path.to_string(), ChangeType::Unchanged));
                            } else {
                                result.push((rel_path.to_string(), ChangeType::Modified));
                            }
                        }
                    } else if exists {
                        result.push((rel_path.to_string(), ChangeType::New));
                    }
                    // Not in manifest and doesn't exist -> skip silently
                }
                None => {
                    // No manifest yet — everything that exists is new
                    if exists {
                        result.push((rel_path.to_string(), ChangeType::New));
                    }
                }
            }
        }

        Ok(result)
    }

    // ----- Merge helpers -----

    /// Section-level TOML merge: add new top-level keys and sub-table keys from
    /// the remote side without clobbering existing local values.
    fn merge_toml(local_bytes: &[u8], remote_content: &str) -> Result<String> {
        let local_str =
            std::str::from_utf8(local_bytes).context("local config.toml is not valid UTF-8")?;
        let mut local_table: toml::Table =
            toml::from_str(local_str).context("failed to parse local config.toml")?;
        let remote_table: toml::Table =
            toml::from_str(remote_content).context("failed to parse remote config.toml")?;

        Self::merge_toml_tables(&mut local_table, &remote_table);
        toml::to_string_pretty(&local_table).context("failed to serialize merged config.toml")
    }

    /// Recursively merge `remote` into `local`, adding keys that don't exist
    /// in local but never overwriting existing local values.
    fn merge_toml_tables(local: &mut toml::Table, remote: &toml::Table) {
        for (key, remote_val) in remote {
            match local.get_mut(key) {
                Some(toml::Value::Table(local_sub)) => {
                    if let toml::Value::Table(remote_sub) = remote_val {
                        Self::merge_toml_tables(local_sub, remote_sub);
                    }
                    // If types differ, keep local
                }
                Some(_) => {
                    // Key exists in local — keep local value
                }
                None => {
                    // Key missing in local — add from remote
                    local.insert(key.clone(), remote_val.clone());
                }
            }
        }
    }

    /// Merge MCP server entries: add new servers from remote, don't remove or
    /// overwrite existing local servers.
    fn merge_mcp_json(local_bytes: &[u8], remote_content: &str) -> Result<String> {
        let local_str =
            std::str::from_utf8(local_bytes).context("local mcp.json is not valid UTF-8")?;
        let mut local_json: serde_json::Value =
            serde_json::from_str(local_str).context("failed to parse local mcp.json")?;
        let remote_json: serde_json::Value =
            serde_json::from_str(remote_content).context("failed to parse remote mcp.json")?;

        // Merge mcpServers objects
        if let (Some(local_servers), Some(remote_servers)) = (
            local_json
                .get_mut("mcpServers")
                .and_then(|v| v.as_object_mut()),
            remote_json.get("mcpServers").and_then(|v| v.as_object()),
        ) {
            for (name, config) in remote_servers {
                if !local_servers.contains_key(name) {
                    local_servers.insert(name.clone(), config.clone());
                }
            }
        }

        serde_json::to_string_pretty(&local_json).context("failed to serialize merged mcp.json")
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn setup_home(dir: &Path) {
        fs::create_dir_all(dir.join("memories")).unwrap();
    }

    #[test]
    fn test_sha256_hex() {
        let hash = ConfigSync::sha256_hex(b"hello world");
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_compute_manifest_empty_home() {
        let dir = tempfile::tempdir().unwrap();
        setup_home(dir.path());
        let manifest = ConfigSync::compute_manifest(dir.path()).unwrap();
        assert!(manifest.files.is_empty());
        assert!(!manifest.device_id.is_empty());
    }

    #[test]
    fn test_compute_manifest_with_files() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        setup_home(home);

        fs::write(home.join("config.toml"), "[default]\nmodel = \"gpt-4o\"").unwrap();
        fs::write(home.join("INSTRUCTIONS.md"), "# My instructions").unwrap();

        let manifest = ConfigSync::compute_manifest(home).unwrap();
        assert_eq!(manifest.files.len(), 2);
        assert!(manifest.files.contains_key("config.toml"));
        assert!(manifest.files.contains_key("INSTRUCTIONS.md"));
    }

    #[test]
    fn test_export_and_import_roundtrip() {
        let src = tempfile::tempdir().unwrap();
        let dst = tempfile::tempdir().unwrap();
        setup_home(src.path());
        setup_home(dst.path());

        // Write files on source
        fs::write(
            src.path().join("config.toml"),
            "[default]\nmodel = \"claude-opus-4-6\"\n",
        )
        .unwrap();
        fs::write(src.path().join("INSTRUCTIONS.md"), "# Source instructions").unwrap();

        // Export from source
        let bundle = ConfigSync::export(src.path()).unwrap();
        assert_eq!(bundle.files.len(), 2);

        // Import to destination (no local files -> all imported)
        let report = ConfigSync::import(dst.path(), &bundle).unwrap();
        assert_eq!(report.files_updated.len(), 2);
        assert!(report.conflicts.is_empty());

        // Verify files exist on destination
        let dst_config = fs::read_to_string(dst.path().join("config.toml")).unwrap();
        assert!(dst_config.contains("claude-opus-4-6"));
    }

    #[test]
    fn test_import_conflict_detection() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        // Write a local file and create an initial manifest
        fs::write(home_path.join("INSTRUCTIONS.md"), "# Original").unwrap();
        let manifest = ConfigSync::compute_manifest(home_path).unwrap();
        ConfigSync::save_manifest(home_path, &manifest).unwrap();

        // Modify the local file (simulating local changes since last sync)
        fs::write(home_path.join("INSTRUCTIONS.md"), "# Modified locally").unwrap();

        // Create a bundle from a different device with different content
        let bundle = SyncBundle {
            device_id: "other-device".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            files: {
                let mut f = HashMap::new();
                let content = "# Modified remotely".to_string();
                let sha256 = ConfigSync::sha256_hex(content.as_bytes());
                f.insert(
                    "INSTRUCTIONS.md".to_string(),
                    SyncedFile { content, sha256 },
                );
                f
            },
        };

        let report = ConfigSync::import(home_path, &bundle).unwrap();
        assert_eq!(report.conflicts.len(), 1);
        assert!(report.conflicts.contains(&"INSTRUCTIONS.md".to_string()));

        // Local file should be preserved
        let local = fs::read_to_string(home_path.join("INSTRUCTIONS.md")).unwrap();
        assert_eq!(local, "# Modified locally");
    }

    #[test]
    fn test_import_overwrites_unchanged_local() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        // Write a local file and create a manifest (marking it as synced)
        fs::write(home_path.join("INSTRUCTIONS.md"), "# Original").unwrap();
        let manifest = ConfigSync::compute_manifest(home_path).unwrap();
        ConfigSync::save_manifest(home_path, &manifest).unwrap();

        // Do NOT modify the local file. Import a bundle with new content.
        let new_content = "# Updated from other device".to_string();
        let sha256 = ConfigSync::sha256_hex(new_content.as_bytes());
        let bundle = SyncBundle {
            device_id: "other-device".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            files: {
                let mut f = HashMap::new();
                f.insert(
                    "INSTRUCTIONS.md".to_string(),
                    SyncedFile {
                        content: new_content.clone(),
                        sha256,
                    },
                );
                f
            },
        };

        let report = ConfigSync::import(home_path, &bundle).unwrap();
        assert_eq!(report.files_updated.len(), 1);
        assert!(report.conflicts.is_empty());

        let local = fs::read_to_string(home_path.join("INSTRUCTIONS.md")).unwrap();
        assert_eq!(local, "# Updated from other device");
    }

    #[test]
    fn test_status_no_manifest() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        fs::write(home_path.join("config.toml"), "test").unwrap();

        let status = ConfigSync::status(home_path).unwrap();
        let config_entry = status.iter().find(|(p, _)| p == "config.toml");
        assert!(config_entry.is_some());
        assert_eq!(config_entry.unwrap().1, ChangeType::New);
    }

    #[test]
    fn test_status_unchanged() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        fs::write(home_path.join("config.toml"), "test").unwrap();
        let manifest = ConfigSync::compute_manifest(home_path).unwrap();
        ConfigSync::save_manifest(home_path, &manifest).unwrap();

        let status = ConfigSync::status(home_path).unwrap();
        let config_entry = status.iter().find(|(p, _)| p == "config.toml");
        assert_eq!(config_entry.unwrap().1, ChangeType::Unchanged);
    }

    #[test]
    fn test_status_modified() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        fs::write(home_path.join("config.toml"), "original").unwrap();
        let manifest = ConfigSync::compute_manifest(home_path).unwrap();
        ConfigSync::save_manifest(home_path, &manifest).unwrap();

        fs::write(home_path.join("config.toml"), "changed").unwrap();

        let status = ConfigSync::status(home_path).unwrap();
        let config_entry = status.iter().find(|(p, _)| p == "config.toml");
        assert_eq!(config_entry.unwrap().1, ChangeType::Modified);
    }

    #[test]
    fn test_status_deleted() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        fs::write(home_path.join("config.toml"), "test").unwrap();
        let manifest = ConfigSync::compute_manifest(home_path).unwrap();
        ConfigSync::save_manifest(home_path, &manifest).unwrap();

        fs::remove_file(home_path.join("config.toml")).unwrap();

        let status = ConfigSync::status(home_path).unwrap();
        let config_entry = status.iter().find(|(p, _)| p == "config.toml");
        assert_eq!(config_entry.unwrap().1, ChangeType::Deleted);
    }

    #[test]
    fn test_merge_toml_adds_new_keys() {
        let local = b"[default]\nmodel = \"gpt-4o\"\n";
        let remote = "[default]\nmodel = \"claude-opus-4-6\"\nstream = true\n\n[providers.new]\napi_key_env = \"NEW_KEY\"\n";
        let merged = ConfigSync::merge_toml(local, remote).unwrap();
        // Local model should be preserved
        assert!(merged.contains("gpt-4o"));
        // New key 'stream' should be added
        assert!(merged.contains("stream"));
        // New provider section should be added
        assert!(merged.contains("NEW_KEY"));
    }

    #[test]
    fn test_merge_mcp_json_adds_new_servers() {
        let local = br#"{"mcpServers": {"existing": {"command": "node", "args": ["server.js"]}}}"#;
        let remote = r#"{"mcpServers": {"existing": {"command": "deno"}, "new-server": {"command": "python", "args": ["mcp.py"]}}}"#;
        let merged = ConfigSync::merge_mcp_json(local, remote).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&merged).unwrap();
        let servers = parsed["mcpServers"].as_object().unwrap();
        // Existing server should keep local config
        assert_eq!(servers["existing"]["command"], "node");
        // New server should be added
        assert!(servers.contains_key("new-server"));
        assert_eq!(servers["new-server"]["command"], "python");
    }

    #[test]
    fn test_device_id_persistence() {
        let home = tempfile::tempdir().unwrap();
        let home_path = home.path();
        setup_home(home_path);

        // First call generates a new device ID
        let id1 = ConfigSync::device_id(home_path).unwrap();
        assert!(!id1.is_empty());

        // Save a manifest with that ID
        let manifest = SyncManifest {
            device_id: id1.clone(),
            last_sync: chrono::Utc::now().to_rfc3339(),
            files: HashMap::new(),
        };
        ConfigSync::save_manifest(home_path, &manifest).unwrap();

        // Second call should return the same ID
        let id2 = ConfigSync::device_id(home_path).unwrap();
        assert_eq!(id1, id2);
    }
}
