//! Per-account sync bookkeeping: pull cursors and the last server version this
//! device saw for every record it has pushed.
//!
//! The file is a cache, never the record of truth. Losing it costs a full
//! re-pull and a re-push that the hosted side treats as idempotent; it never
//! loses a local conversation, project or memory.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

pub const INITIAL_CURSOR: &str = "0";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncSection {
    #[serde(default = "initial_cursor")]
    pub cursor: String,
    #[serde(default)]
    pub versions: BTreeMap<String, String>,
}

/// Hand-written so an unset cursor is the hosted "from the beginning" value and
/// never an empty string, which every sync endpoint rejects.
impl Default for SyncSection {
    fn default() -> Self {
        Self {
            cursor: initial_cursor(),
            versions: BTreeMap::new(),
        }
    }
}

fn initial_cursor() -> String {
    INITIAL_CURSOR.to_string()
}

impl SyncSection {
    /// The base version to send for `id`: the version this device last saw, or
    /// `0`, which the hosted side reads as "insert this record".
    pub fn base_version(&self, id: &str) -> String {
        self.versions
            .get(id)
            .cloned()
            .unwrap_or_else(initial_cursor)
    }

    pub fn record(&mut self, id: &str, server_version: &str) {
        self.versions
            .insert(id.to_string(), server_version.to_string());
    }

    pub fn advance(&mut self, cursor: &str) {
        if version_greater(cursor, &self.cursor) {
            self.cursor = cursor.to_string();
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SyncState {
    #[serde(default)]
    pub owner: String,
    #[serde(default)]
    pub conversations: SyncSection,
    #[serde(default)]
    pub messages: SyncSection,
    #[serde(default)]
    pub projects: SyncSection,
    #[serde(default)]
    pub memories: SyncSection,
}

impl SyncState {
    /// Load the state for `owner`. State belonging to a different account is
    /// discarded rather than reused: its versions describe rows this account
    /// cannot see.
    pub fn load(config_dir: &Path, owner: &str) -> Self {
        let path = state_path(config_dir);
        let loaded = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<SyncState>(&raw).ok());
        match loaded {
            Some(state) if state.owner == owner => state,
            _ => SyncState {
                owner: owner.to_string(),
                ..SyncState::default()
            },
        }
    }

    pub fn save(&self, config_dir: &Path) -> std::io::Result<()> {
        let path = state_path(config_dir);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let serialized = serde_json::to_string_pretty(self)
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        let temp = path.with_extension("json.tmp");
        std::fs::write(&temp, serialized)?;
        std::fs::rename(&temp, &path)
    }
}

pub fn state_path(config_dir: &Path) -> PathBuf {
    config_dir.join("cloud").join("sync-state.json")
}

/// Compare two hosted `server_version` values, which are bigints carried as
/// decimal strings and so cannot be compared lexically.
pub fn version_greater(a: &str, b: &str) -> bool {
    let left = a.trim_start_matches('0');
    let right = b.trim_start_matches('0');
    if left.len() != right.len() {
        return left.len() > right.len();
    }
    left > right
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unseen_record_pushes_as_an_insert() {
        let section = SyncSection::default();
        assert_eq!(section.base_version("anything"), INITIAL_CURSOR);
    }

    #[test]
    fn a_seen_record_pushes_the_version_the_server_returned() {
        let mut section = SyncSection::default();
        section.record("a", "42");
        assert_eq!(section.base_version("a"), "42");
    }

    #[test]
    fn versions_compare_as_numbers_not_as_text() {
        assert!(version_greater("100", "99"));
        assert!(!version_greater("99", "100"));
        assert!(version_greater("9223372036854775807", "9223372036854775806"));
        assert!(!version_greater("7", "7"));
        assert!(version_greater("0007", "6"));
    }

    #[test]
    fn an_unset_cursor_is_the_hosted_beginning_not_an_empty_string() {
        assert_eq!(SyncSection::default().cursor, INITIAL_CURSOR);
        let state = SyncState::default();
        for cursor in [
            &state.conversations.cursor,
            &state.messages.cursor,
            &state.projects.cursor,
            &state.memories.cursor,
        ] {
            assert_eq!(cursor.as_str(), INITIAL_CURSOR);
        }
    }

    #[test]
    fn a_cursor_never_moves_backwards() {
        let mut section = SyncSection::default();
        section.advance("30");
        section.advance("12");
        assert_eq!(section.cursor, "30");
    }

    #[test]
    fn state_from_another_account_is_not_reused() {
        let dir = tempfile::tempdir().expect("temp dir");
        let mut mine = SyncState::load(dir.path(), "user_a");
        mine.memories.record("m1", "5");
        mine.memories.advance("5");
        mine.save(dir.path()).expect("save");

        let same = SyncState::load(dir.path(), "user_a");
        assert_eq!(same.memories.base_version("m1"), "5");

        let other = SyncState::load(dir.path(), "user_b");
        assert_eq!(other.memories.base_version("m1"), INITIAL_CURSOR);
        assert_eq!(other.memories.cursor, INITIAL_CURSOR);
    }

    #[test]
    fn a_corrupt_state_file_starts_clean_instead_of_failing() {
        let dir = tempfile::tempdir().expect("temp dir");
        std::fs::create_dir_all(dir.path().join("cloud")).expect("dir");
        std::fs::write(state_path(dir.path()), "{ not json").expect("write");
        let state = SyncState::load(dir.path(), "user_a");
        assert_eq!(state.owner, "user_a");
        assert_eq!(state.conversations.cursor, INITIAL_CURSOR);
    }
}
