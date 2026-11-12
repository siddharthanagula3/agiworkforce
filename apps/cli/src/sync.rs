//! Cross-device dotfile sync for AGI CLI.
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
use std::path::{Component, Path, PathBuf};

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
    /// Hex-encoded SHA256 the exporting device recorded at its previous sync.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_sha256: Option<String>,
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

/// True only when `candidate` is a relative path built entirely from ordinary
/// names, no `..`, no root, no drive prefix, no bare `.`. Everything a sync
/// bundle is allowed to write must satisfy this before it is joined onto home.
pub fn is_contained_relative_path(candidate: &str) -> bool {
    if candidate.is_empty() || candidate.contains('\0') {
        return false;
    }
    let path = Path::new(candidate);
    if path.is_absolute() {
        return false;
    }
    let mut has_name = false;
    for component in path.components() {
        match component {
            Component::Normal(_) => has_name = true,
            _ => return false,
        }
    }
    has_name
}

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
        crate::hex::encode(&hasher.finalize())
    }

    fn import_path(home: &Path, relative: &str) -> Result<PathBuf> {
        if !is_contained_relative_path(relative) {
            anyhow::bail!("invalid sync import path: '{}'", relative);
        }
        let destination = home.join(relative);
        let mut current = home.to_path_buf();
        let mut components = Path::new(relative).components().peekable();
        while let Some(component) = components.next() {
            current.push(component.as_os_str());
            match fs::symlink_metadata(&current) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink() {
                        anyhow::bail!(
                            "refusing sync import through symlink: {}",
                            current.display()
                        );
                    }
                    if components.peek().is_some() {
                        if !metadata.is_dir() {
                            anyhow::bail!(
                                "sync import parent is not a directory: {}",
                                current.display()
                            );
                        }
                    } else if !metadata.is_file() {
                        anyhow::bail!(
                            "sync import destination is not a regular file: {}",
                            current.display()
                        );
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) => {
                    return Err(error)
                        .with_context(|| format!("failed to inspect {}", current.display()));
                }
            }
        }
        Ok(destination)
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

    /// Relative paths whose contents can carry provider API keys / BYOK
    /// secrets and are therefore exported verbatim (unencrypted) in the bundle.
    /// Exporting these warrants an explicit credential-leak warning so the user
    /// does not share the bundle over an insecure channel (cloud drive, chat,
    /// email) without realizing it may contain secrets.
    const SECRET_BEARING_FILES: &'static [&'static str] = &["config.toml", "mcp.json"];

    /// Export synced files into a portable JSON bundle.
    ///
    /// The bundle is **unencrypted plaintext**. `config.toml` / `mcp.json` may
    /// embed provider API keys or BYOK secrets, so when those files are present
    /// a one-line warning is printed to stderr advising the user to treat the
    /// export as sensitive. Callers that surface the bundle to an untrusted
    /// channel should redact or encrypt secret-bearing content first.
    pub fn export(home: &Path) -> Result<SyncBundle> {
        let device_id = Self::device_id(home)?;
        let previous = Self::load_manifest(home)?;
        let now = chrono::Utc::now().to_rfc3339();
        let mut files = HashMap::new();
        let mut secret_bearing_included: Vec<&str> = Vec::new();

        for rel_path in Self::SYNCED_FILES {
            let abs_path = home.join(rel_path);
            if !abs_path.exists() {
                continue;
            }
            let content = fs::read_to_string(&abs_path)
                .with_context(|| format!("failed to read {} for export", rel_path))?;
            let sha256 = Self::sha256_hex(content.as_bytes());
            if Self::SECRET_BEARING_FILES.contains(rel_path) {
                secret_bearing_included.push(rel_path);
            }
            let base_sha256 = previous
                .as_ref()
                .and_then(|manifest| manifest.files.get(*rel_path))
                .map(|recorded| recorded.sha256.clone());
            files.insert(
                rel_path.to_string(),
                SyncedFile {
                    content,
                    sha256,
                    base_sha256,
                },
            );
        }

        if !secret_bearing_included.is_empty() {
            eprintln!(
                "  [sync] WARNING: this export is UNENCRYPTED and includes {}, which may contain \
                 provider API keys or BYOK secrets. Do not share the bundle over an insecure \
                 channel (cloud drive, chat, email); treat it like a credential file.",
                secret_bearing_included.join(", ")
            );
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
    /// - Bundle copy edited from exactly the local version -> overwrite
    /// - Otherwise the copies diverged: `config.toml` and `mcp.json` take the
    ///   remote's missing keys or servers when that keeps every remote value
    ///   and loses no local comment; anything else keeps the local file,
    ///   writes `<path>.imported` and reports a conflict
    ///
    /// Preflight rejects unsupported paths, invalid checksums, and existing
    /// symlinks before writes. It does not prevent concurrent filesystem changes
    /// or roll back completed writes after a later I/O failure.
    pub fn import(home: &Path, bundle: &SyncBundle) -> Result<SyncReport> {
        for (rel_path, synced) in &bundle.files {
            if !Self::SYNCED_FILES.contains(&rel_path.as_str()) {
                anyhow::bail!("Sync bundle contains unsupported path: '{}'", rel_path);
            }
            if Self::sha256_hex(synced.content.as_bytes()) != synced.sha256 {
                anyhow::bail!("Sync bundle checksum mismatch for '{}'", rel_path);
            }
        }

        let canonical_home = home
            .canonicalize()
            .context("failed to resolve sync home directory")?;
        if !canonical_home.is_dir() {
            anyhow::bail!("sync home is not a directory: {}", canonical_home.display());
        }
        Self::import_path(&canonical_home, Self::MANIFEST_FILE)?;
        for rel_path in Self::SYNCED_FILES {
            Self::import_path(&canonical_home, rel_path)?;
        }

        let mut report = SyncReport {
            files_updated: Vec::new(),
            files_skipped: Vec::new(),
            conflicts: Vec::new(),
        };
        let mut writes = Vec::new();

        for (rel_path, synced) in &bundle.files {
            let abs_path = canonical_home.join(rel_path);
            let local_data = match fs::read(&abs_path) {
                Ok(data) => data,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                    writes.push((rel_path.clone(), synced.content.as_bytes().to_vec()));
                    report.files_updated.push(rel_path.clone());
                    continue;
                }
                Err(error) => {
                    return Err(error)
                        .with_context(|| format!("failed to read local {}", rel_path));
                }
            };
            let local_hash = Self::sha256_hex(&local_data);

            // If remote content matches local, skip
            if local_hash == synced.sha256 {
                report.files_skipped.push(rel_path.clone());
                continue;
            }

            if synced.base_sha256.as_deref() == Some(local_hash.as_str()) {
                writes.push((rel_path.clone(), synced.content.as_bytes().to_vec()));
                report.files_updated.push(rel_path.clone());
                continue;
            }

            if let Some(merged) = Self::lossless_merge(rel_path, &local_data, &synced.content) {
                writes.push((rel_path.clone(), merged.into_bytes()));
                report.files_updated.push(rel_path.clone());
            } else {
                let copy = format!("{}.imported", rel_path);
                Self::import_path(&canonical_home, &copy)?;
                writes.push((copy, synced.content.as_bytes().to_vec()));
                report.conflicts.push(rel_path.clone());
            }
        }

        for (rel_path, contents) in writes {
            let abs_path = Self::import_path(&canonical_home, &rel_path)?;
            if let Some(parent) = abs_path.parent() {
                fs::create_dir_all(parent)
                    .with_context(|| format!("failed to create directory for {}", rel_path))?;
            }
            fs::write(&abs_path, contents)
                .with_context(|| format!("failed to write {}", rel_path))?;
        }

        Self::import_path(&canonical_home, Self::MANIFEST_FILE)?;
        let new_manifest = Self::compute_manifest(&canonical_home)?;
        Self::save_manifest(&canonical_home, &new_manifest)?;

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
                    // No manifest yet, everything that exists is new
                    if exists {
                        result.push((rel_path.to_string(), ChangeType::New));
                    }
                }
            }
        }

        Ok(result)
    }

    // ----- Merge helpers -----

    fn lossless_merge(rel_path: &str, local_bytes: &[u8], remote_content: &str) -> Option<String> {
        match rel_path {
            "config.toml" => {
                if std::str::from_utf8(local_bytes).ok()?.contains('#') {
                    return None;
                }
                let merged = Self::merge_toml(local_bytes, remote_content).ok()?;
                let merged_table: toml::Table = toml::from_str(&merged).ok()?;
                let remote_table: toml::Table = toml::from_str(remote_content).ok()?;
                Self::toml_covers(&merged_table, &remote_table).then_some(merged)
            }
            "mcp.json" => {
                let merged = Self::merge_mcp_json(local_bytes, remote_content).ok()?;
                let merged_json: serde_json::Value = serde_json::from_str(&merged).ok()?;
                let remote_json: serde_json::Value = serde_json::from_str(remote_content).ok()?;
                Self::json_covers(&merged_json, &remote_json).then_some(merged)
            }
            _ => None,
        }
    }

    fn toml_covers(merged: &toml::Table, remote: &toml::Table) -> bool {
        remote.iter().all(
            |(key, remote_value)| match (merged.get(key), remote_value) {
                (Some(toml::Value::Table(merged_sub)), toml::Value::Table(remote_sub)) => {
                    Self::toml_covers(merged_sub, remote_sub)
                }
                (Some(merged_value), _) => merged_value == remote_value,
                (None, _) => false,
            },
        )
    }

    fn json_covers(merged: &serde_json::Value, remote: &serde_json::Value) -> bool {
        match (merged.as_object(), remote.as_object()) {
            (Some(merged), Some(remote)) => remote.iter().all(|(key, remote_value)| {
                merged
                    .get(key)
                    .is_some_and(|merged_value| Self::json_covers(merged_value, remote_value))
            }),
            _ => merged == remote,
        }
    }

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
                    // Key exists in local, keep local value
                }
                None => {
                    // Key missing in local, add from remote
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

    fn bundle_with(path: &str, content: &str) -> SyncBundle {
        let mut files = HashMap::new();
        files.insert(
            path.to_string(),
            SyncedFile {
                content: content.to_string(),
                sha256: ConfigSync::sha256_hex(content.as_bytes()),
                base_sha256: None,
            },
        );
        SyncBundle {
            device_id: "test-device".to_string(),
            exported_at: "2026-08-16T00:00:00Z".to_string(),
            files,
        }
    }

    #[test]
    fn a_traversing_bundle_path_is_refused_and_writes_nothing() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        let outside = dir.path().join("outside");
        fs::create_dir_all(&home).unwrap();
        fs::create_dir_all(&outside).unwrap();
        setup_home(&home);

        // The target does not exist, so canonicalize() fails and the old
        // fallback compared the raw join, whose components do start with
        // home's, so the lexical starts_with check passed.
        let escape = "../outside/pwned.plist";
        let result = ConfigSync::import(&home, &bundle_with(escape, "payload"));

        assert!(result.is_err(), "traversing path was accepted");
        assert!(!outside.join("pwned.plist").exists(), "wrote outside home");
    }

    #[test]
    fn an_absolute_bundle_path_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        fs::create_dir_all(&home).unwrap();
        setup_home(&home);
        let absolute = dir.path().join("absolute.plist");

        let result = ConfigSync::import(&home, &bundle_with(absolute.to_str().unwrap(), "payload"));

        assert!(result.is_err(), "absolute path was accepted");
        assert!(
            !absolute.exists(),
            "join discarded the base and wrote there"
        );
    }

    #[test]
    fn an_ordinary_nested_path_still_imports() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        fs::create_dir_all(&home).unwrap();

        let report =
            ConfigSync::import(&home, &bundle_with("memories/raw_memories.md", "kept")).unwrap();

        assert_eq!(
            report.files_updated,
            vec!["memories/raw_memories.md".to_string()]
        );
        assert_eq!(
            fs::read_to_string(home.join("memories/raw_memories.md")).unwrap(),
            "kept"
        );
    }

    #[test]
    fn unsupported_bundle_paths_are_rejected_without_creating_files() {
        for path in [
            "sessions.db",
            "sync_manifest.json",
            "memories/notes.md",
            "memories/./raw_memories.md",
            "memories//raw_memories.md",
            "memories\\raw_memories.md",
            "./config.toml",
        ] {
            let home = tempfile::tempdir().unwrap();
            let bundle = bundle_with(path, "payload");

            let error = ConfigSync::import(home.path(), &bundle).err().unwrap();

            assert!(error.to_string().contains("unsupported path"), "{path}");
            assert_eq!(fs::read_dir(home.path()).unwrap().count(), 0, "{path}");
        }
    }

    #[test]
    fn a_forged_matching_hash_is_rejected_before_other_files_are_written() {
        let home = tempfile::tempdir().unwrap();
        let local = home.path().join("INSTRUCTIONS.md");
        fs::write(&local, "local instructions").unwrap();
        let mut bundle = bundle_with("INSTRUCTIONS.md", "different remote instructions");
        bundle.files.get_mut("INSTRUCTIONS.md").unwrap().sha256 =
            ConfigSync::sha256_hex(b"local instructions");
        bundle
            .files
            .extend(bundle_with("projects.json", "{}").files);

        let error = ConfigSync::import(home.path(), &bundle).err().unwrap();

        assert!(error.to_string().contains("checksum mismatch"));
        assert_eq!(fs::read_to_string(local).unwrap(), "local instructions");
        assert!(!home.path().join("projects.json").exists());
        assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
        assert!(!home.path().join("INSTRUCTIONS.md.imported").exists());
    }

    #[test]
    fn a_later_invalid_destination_prevents_earlier_bundle_writes() {
        let home = tempfile::tempdir().unwrap();
        let mut bundle = bundle_with("INSTRUCTIONS.md", "incoming instructions");
        bundle
            .files
            .extend(bundle_with("projects.json", "{}").files);
        let first = bundle.files.keys().next().unwrap().clone();
        let last = bundle.files.keys().last().unwrap().clone();
        fs::create_dir(home.path().join(&last)).unwrap();

        let error = ConfigSync::import(home.path(), &bundle).err().unwrap();

        assert!(error.to_string().contains("not a regular file"));
        assert!(!home.path().join(first).exists());
        assert!(home.path().join(last).is_dir());
        assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
    }

    #[test]
    fn a_later_invalid_conflict_copy_prevents_earlier_planned_writes() {
        let home = tempfile::tempdir().unwrap();
        let mut bundle = bundle_with("INSTRUCTIONS.md", "incoming instructions");
        bundle
            .files
            .extend(bundle_with("projects.json", "{}").files);
        let first = bundle.files.keys().next().unwrap().clone();
        let last = bundle.files.keys().last().unwrap().clone();
        fs::write(home.path().join(&last), "local content").unwrap();
        let copy = home.path().join(format!("{last}.imported"));
        fs::create_dir(&copy).unwrap();

        let error = ConfigSync::import(home.path(), &bundle).err().unwrap();

        assert!(error.to_string().contains("not a regular file"));
        assert!(!home.path().join(first).exists());
        assert_eq!(
            fs::read_to_string(home.path().join(last)).unwrap(),
            "local content"
        );
        assert!(copy.is_dir());
        assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
    }

    #[test]
    fn an_unresolved_home_is_not_created_by_import() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("missing-home");

        let error = ConfigSync::import(&home, &bundle_with("INSTRUCTIONS.md", "incoming"))
            .err()
            .unwrap();

        assert!(error.to_string().contains("failed to resolve sync home"));
        assert!(!home.exists());
    }

    #[test]
    fn a_non_directory_parent_is_rejected_before_import() {
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join("memories"), "preserved").unwrap();

        let error = ConfigSync::import(home.path(), &bundle_with("INSTRUCTIONS.md", "incoming"))
            .err()
            .unwrap();

        assert!(error.to_string().contains("parent is not a directory"));
        assert_eq!(
            fs::read_to_string(home.path().join("memories")).unwrap(),
            "preserved"
        );
        assert!(!home.path().join("INSTRUCTIONS.md").exists());
        assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_parent_symlink_is_rejected_when_the_import_leaf_is_missing() {
        use std::os::unix::fs::symlink;

        let home = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        symlink(outside.path(), home.path().join("memories")).unwrap();

        let result = ConfigSync::import(
            home.path(),
            &bundle_with("memories/raw_memories.md", "incoming"),
        );

        assert!(result.is_err());
        assert!(!outside.path().join("raw_memories.md").exists());
        assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
        assert!(fs::symlink_metadata(home.path().join("memories"))
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[cfg(unix)]
    #[test]
    fn existing_and_dangling_destination_symlinks_are_rejected() {
        use std::os::unix::fs::symlink;

        for target_exists in [false, true] {
            let home = tempfile::tempdir().unwrap();
            let outside = tempfile::tempdir().unwrap();
            let target = outside.path().join("instructions");
            if target_exists {
                fs::write(&target, "outside content").unwrap();
            }
            symlink(&target, home.path().join("INSTRUCTIONS.md")).unwrap();

            let result =
                ConfigSync::import(home.path(), &bundle_with("INSTRUCTIONS.md", "incoming"));

            assert!(result.is_err());
            assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
            if target_exists {
                assert_eq!(fs::read_to_string(target).unwrap(), "outside content");
            } else {
                assert!(!target.exists());
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn conflict_copy_symlinks_are_rejected_for_each_conflict_path() {
        use std::os::unix::fs::symlink;

        for path in ["INSTRUCTIONS.md", "config.toml", "mcp.json"] {
            for target_exists in [false, true] {
                let home = tempfile::tempdir().unwrap();
                let outside = tempfile::tempdir().unwrap();
                let target = outside.path().join("preserve");
                if target_exists {
                    fs::write(&target, "outside content").unwrap();
                }
                fs::write(home.path().join(path), "invalid local config {").unwrap();
                let copy = home.path().join(format!("{path}.imported"));
                symlink(&target, &copy).unwrap();
                let mut bundle = bundle_with(path, "remote content");
                bundle
                    .files
                    .extend(bundle_with("projects.json", "{}").files);

                let result = ConfigSync::import(home.path(), &bundle);

                assert!(result.is_err(), "{path}");
                assert_eq!(
                    fs::read_to_string(home.path().join(path)).unwrap(),
                    "invalid local config {"
                );
                assert!(!home.path().join("projects.json").exists());
                assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
                assert!(fs::symlink_metadata(copy).unwrap().file_type().is_symlink());
                if target_exists {
                    assert_eq!(fs::read_to_string(target).unwrap(), "outside content");
                } else {
                    assert!(!target.exists());
                }
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_manifest_symlink_is_rejected_before_bundle_writes() {
        use std::os::unix::fs::symlink;

        for target_exists in [false, true] {
            let home = tempfile::tempdir().unwrap();
            let outside = tempfile::tempdir().unwrap();
            let target = outside.path().join("manifest.json");
            let original = r#"{"device_id":"outside","last_sync":"previous","files":{}}"#;
            if target_exists {
                fs::write(&target, original).unwrap();
            }
            symlink(&target, home.path().join(ConfigSync::MANIFEST_FILE)).unwrap();

            let result =
                ConfigSync::import(home.path(), &bundle_with("INSTRUCTIONS.md", "incoming"));

            assert!(result.is_err());
            assert!(!home.path().join("INSTRUCTIONS.md").exists());
            if target_exists {
                assert_eq!(fs::read_to_string(target).unwrap(), original);
            } else {
                assert!(!target.exists());
            }
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_in_other_manifest_inputs_prevents_bundle_writes() {
        use std::os::unix::fs::symlink;

        let home = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("mcp.json");
        fs::write(&target, "outside content").unwrap();
        symlink(&target, home.path().join("mcp.json")).unwrap();

        let result = ConfigSync::import(home.path(), &bundle_with("INSTRUCTIONS.md", "incoming"));

        assert!(result.is_err());
        assert!(!home.path().join("INSTRUCTIONS.md").exists());
        assert!(!home.path().join(ConfigSync::MANIFEST_FILE).exists());
        assert_eq!(fs::read_to_string(target).unwrap(), "outside content");
    }

    #[cfg(unix)]
    #[test]
    fn a_home_alias_uses_the_resolved_directory_for_files_and_manifest() {
        use std::os::unix::fs::symlink;

        let dir = tempfile::tempdir().unwrap();
        let home = dir.path().join("home");
        let alias = dir.path().join("alias");
        fs::create_dir(&home).unwrap();
        symlink(&home, &alias).unwrap();

        let report =
            ConfigSync::import(&alias, &bundle_with("INSTRUCTIONS.md", "incoming")).unwrap();

        assert_eq!(report.files_updated, vec!["INSTRUCTIONS.md".to_string()]);
        assert_eq!(
            fs::read_to_string(home.join("INSTRUCTIONS.md")).unwrap(),
            "incoming"
        );
        assert!(ConfigSync::load_manifest(&home).unwrap().is_some());
    }

    #[cfg(unix)]
    #[test]
    fn identical_content_skips_an_unused_conflict_copy_symlink() {
        use std::os::unix::fs::symlink;

        let home = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let target = outside.path().join("preserve");
        fs::write(&target, "outside content").unwrap();
        fs::write(home.path().join("INSTRUCTIONS.md"), "same content").unwrap();
        let copy = home.path().join("INSTRUCTIONS.md.imported");
        symlink(&target, &copy).unwrap();

        let report =
            ConfigSync::import(home.path(), &bundle_with("INSTRUCTIONS.md", "same content"))
                .unwrap();

        assert_eq!(report.files_skipped, vec!["INSTRUCTIONS.md".to_string()]);
        assert!(report.files_updated.is_empty());
        assert!(report.conflicts.is_empty());
        assert_eq!(fs::read_to_string(target).unwrap(), "outside content");
        assert!(fs::symlink_metadata(copy).unwrap().file_type().is_symlink());
    }

    #[test]
    fn a_regular_conflict_copy_keeps_the_existing_overwrite_behavior() {
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join("INSTRUCTIONS.md"), "local instructions").unwrap();
        fs::write(home.path().join("INSTRUCTIONS.md.imported"), "older import").unwrap();

        let report =
            ConfigSync::import(home.path(), &bundle_with("INSTRUCTIONS.md", "newer import"))
                .unwrap();

        assert_eq!(report.conflicts, vec!["INSTRUCTIONS.md".to_string()]);
        assert_eq!(
            fs::read_to_string(home.path().join("INSTRUCTIONS.md")).unwrap(),
            "local instructions"
        );
        assert_eq!(
            fs::read_to_string(home.path().join("INSTRUCTIONS.md.imported")).unwrap(),
            "newer import"
        );
    }

    #[test]
    fn successful_config_merges_do_not_validate_unused_conflict_copies() {
        for (path, local, remote) in [
            (
                "config.toml",
                "[local]\nkept = true\n",
                "[remote]\nadded = true\n",
            ),
            (
                "mcp.json",
                r#"{"mcpServers":{"local":{"command":"kept"}}}"#,
                r#"{"mcpServers":{"remote":{"command":"added"}}}"#,
            ),
        ] {
            let home = tempfile::tempdir().unwrap();
            fs::write(home.path().join(path), local).unwrap();
            let copy = home.path().join(format!("{path}.imported"));
            fs::create_dir(&copy).unwrap();

            let report = ConfigSync::import(home.path(), &bundle_with(path, remote)).unwrap();

            assert_eq!(report.files_updated, vec![path.to_string()]);
            assert!(report.conflicts.is_empty());
            let merged = fs::read_to_string(home.path().join(path)).unwrap();
            assert!(merged.contains("local"));
            assert!(merged.contains("remote"));
            assert!(copy.is_dir());
        }
    }

    #[test]
    fn containment_check_accepts_names_and_rejects_everything_else() {
        assert!(is_contained_relative_path("config.toml"));
        assert!(is_contained_relative_path("memories/notes.md"));
        assert!(!is_contained_relative_path(""));
        assert!(!is_contained_relative_path("."));
        assert!(!is_contained_relative_path(".."));
        assert!(!is_contained_relative_path("a/../../b"));
        assert!(!is_contained_relative_path("/etc/passwd"));
        assert!(!is_contained_relative_path("a\0b"));
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

        fs::write(
            home.join("config.toml"),
            "[default]\nmodel = \"fixture-config-model\"",
        )
        .unwrap();
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
            "[default]\nmodel = \"fixture-sync-model\"\n",
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
        assert!(dst_config.contains("fixture-sync-model"));
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
                    SyncedFile {
                        content,
                        sha256,
                        base_sha256: Some(ConfigSync::sha256_hex(b"# Original")),
                    },
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
                        base_sha256: Some(ConfigSync::sha256_hex(b"# Original")),
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
    fn an_older_bundle_never_replaces_newer_local_work() {
        let device_a = tempfile::tempdir().unwrap();
        let device_b = tempfile::tempdir().unwrap();
        for home in [device_a.path(), device_b.path()] {
            setup_home(home);
            fs::write(home.join("INSTRUCTIONS.md"), "# Shared v1").unwrap();
            let manifest = ConfigSync::compute_manifest(home).unwrap();
            ConfigSync::save_manifest(home, &manifest).unwrap();
        }
        fs::write(device_a.path().join("INSTRUCTIONS.md"), "# Edited on A").unwrap();
        let from_a = ConfigSync::export(device_a.path()).unwrap();
        let from_b = ConfigSync::export(device_b.path()).unwrap();

        let report = ConfigSync::import(device_a.path(), &from_b).unwrap();

        assert_eq!(report.conflicts, vec!["INSTRUCTIONS.md".to_string()]);
        assert!(report.files_updated.is_empty());
        assert_eq!(
            fs::read_to_string(device_a.path().join("INSTRUCTIONS.md")).unwrap(),
            "# Edited on A"
        );
        assert_eq!(
            fs::read_to_string(device_a.path().join("INSTRUCTIONS.md.imported")).unwrap(),
            "# Shared v1"
        );

        let report = ConfigSync::import(device_b.path(), &from_a).unwrap();

        assert_eq!(report.files_updated, vec!["INSTRUCTIONS.md".to_string()]);
        assert!(report.conflicts.is_empty());
        assert_eq!(
            fs::read_to_string(device_b.path().join("INSTRUCTIONS.md")).unwrap(),
            "# Edited on A"
        );
    }

    #[test]
    fn a_bundle_without_a_base_never_overwrites_a_differing_local_file() {
        let home = tempfile::tempdir().unwrap();
        fs::write(home.path().join("projects.json"), "{\"local\":true}").unwrap();
        let manifest = ConfigSync::compute_manifest(home.path()).unwrap();
        ConfigSync::save_manifest(home.path(), &manifest).unwrap();

        let report = ConfigSync::import(home.path(), &bundle_with("projects.json", "{}")).unwrap();

        assert_eq!(report.conflicts, vec!["projects.json".to_string()]);
        assert_eq!(
            fs::read_to_string(home.path().join("projects.json")).unwrap(),
            "{\"local\":true}"
        );
    }

    #[test]
    fn a_config_merge_that_would_drop_a_remote_value_or_a_comment_is_a_conflict() {
        for local in [
            "# my model\n[default]\nmodel = \"fixture-local-model\"\n",
            "[default]\nmodel = \"fixture-local-model\"\n",
            "# only a comment differs\n[default]\nstream = true\n",
        ] {
            let home = tempfile::tempdir().unwrap();
            fs::write(home.path().join("config.toml"), local).unwrap();
            let remote = "[default]\nmodel = \"fixture-remote-model\"\nstream = true\n";

            let report =
                ConfigSync::import(home.path(), &bundle_with("config.toml", remote)).unwrap();

            assert_eq!(report.conflicts, vec!["config.toml".to_string()], "{local}");
            assert!(report.files_updated.is_empty(), "{local}");
            assert_eq!(
                fs::read_to_string(home.path().join("config.toml")).unwrap(),
                local
            );
            assert_eq!(
                fs::read_to_string(home.path().join("config.toml.imported")).unwrap(),
                remote
            );
        }
    }

    #[test]
    fn an_mcp_merge_that_would_keep_a_changed_server_is_a_conflict() {
        let home = tempfile::tempdir().unwrap();
        let local = r#"{"mcpServers":{"shared":{"command":"node"}}}"#;
        fs::write(home.path().join("mcp.json"), local).unwrap();
        let remote = r#"{"mcpServers":{"shared":{"command":"deno"},"added":{"command":"py"}}}"#;

        let report = ConfigSync::import(home.path(), &bundle_with("mcp.json", remote)).unwrap();

        assert_eq!(report.conflicts, vec!["mcp.json".to_string()]);
        assert_eq!(
            fs::read_to_string(home.path().join("mcp.json")).unwrap(),
            local
        );
    }

    #[test]
    fn test_merge_toml_adds_new_keys() {
        let local = b"[default]\nmodel = \"fixture-local-config-model\"\n";
        let remote = "[default]\nmodel = \"fixture-remote-config-model\"\nstream = true\n\n[providers.new]\napi_key_env = \"NEW_KEY\"\n";
        let merged = ConfigSync::merge_toml(local, remote).unwrap();
        // Local model should be preserved
        assert!(merged.contains("fixture-local-config-model"));
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
