//! Account memory: the same `/api/memory/sync` records the web settings memory
//! panel and mobile read and write.
//!
//! The local `memories/raw_memories.md` file stays exactly where it is. In
//! Managed mode it becomes the cache of what the account holds; in Local mode
//! it is the whole store.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::client::{CloudClient, CloudError};
use super::state::{SyncState, INITIAL_CURSOR};

pub const MEMORY_SYNC_PATH: &str = "/api/memory/sync";
pub const SYNC_PROTOCOL_VERSION: u8 = 2;
const CONTENT_MAX_CHARS: usize = 20_000;
const CATEGORY_MAX_CHARS: usize = 200;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPushItem {
    pub id: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    pub source: String,
    pub base_version: String,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub is_deleted: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPushRequest {
    pub protocol_version: u8,
    pub memories: Vec<MemoryPushItem>,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct MemoryDelta {
    pub id: String,
    pub content: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub is_deleted: bool,
    pub updated_at: String,
    pub server_version: String,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPullResponse {
    #[serde(default)]
    pub memories: Vec<MemoryDelta>,
    pub cursor: String,
    #[serde(default)]
    pub has_more: bool,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct AppliedRow {
    pub id: String,
    pub server_version: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemoryConflict {
    pub id: String,
    #[serde(default)]
    pub current: Option<MemoryDelta>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RejectedMemory {
    pub id: String,
    #[serde(default)]
    pub term: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MemoryPushResponse {
    #[serde(default)]
    pub applied: Vec<AppliedRow>,
    #[serde(default)]
    pub conflicts: Vec<MemoryConflict>,
    #[serde(default)]
    pub rejected: Vec<RejectedMemory>,
    pub cursor: String,
}

/// The account's memory as this device last saw it.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct MemoryCache {
    #[serde(default)]
    pub entries: Vec<CachedMemory>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CachedMemory {
    pub id: String,
    pub content: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    pub updated_at: String,
}

impl MemoryCache {
    pub fn apply(&mut self, deltas: &[MemoryDelta]) {
        for delta in deltas {
            self.entries.retain(|entry| entry.id != delta.id);
            if delta.is_deleted {
                continue;
            }
            self.entries.push(CachedMemory {
                id: delta.id.clone(),
                content: delta.content.clone(),
                category: delta.category.clone(),
                source: delta.source.clone(),
                pinned: delta.pinned,
                updated_at: delta.updated_at.clone(),
            });
        }
        self.entries.sort_by(|a, b| {
            b.pinned
                .cmp(&a.pinned)
                .then_with(|| b.updated_at.cmp(&a.updated_at))
        });
    }

    pub fn contains(&self, content: &str) -> bool {
        let key = normalize(content);
        self.entries
            .iter()
            .any(|entry| normalize(&entry.content) == key)
    }

    /// The account memory as the block the CLI already injects into the system
    /// prompt beside the on-disk file.
    pub fn context_prompt(&self) -> String {
        if self.entries.is_empty() {
            return String::new();
        }
        let lines = self
            .entries
            .iter()
            .map(|entry| format!("- {}", entry.content.replace(['\n', '\r'], " ").trim()))
            .collect::<Vec<_>>()
            .join("\n");
        format!("\n<account_memory>\n{lines}\n</account_memory>\n")
    }
}

fn normalize(content: &str) -> String {
    content.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

pub fn new_memory(content: &str, category: Option<&str>, source: &str) -> MemoryPushItem {
    MemoryPushItem {
        id: Uuid::new_v4().to_string(),
        content: truncate(content.trim(), CONTENT_MAX_CHARS),
        category: category
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| truncate(value, CATEGORY_MAX_CHARS)),
        source: source.to_string(),
        base_version: INITIAL_CURSOR.to_string(),
        is_deleted: false,
    }
}

pub fn delete_memory(entry: &CachedMemory, state: &SyncState, source: &str) -> MemoryPushItem {
    MemoryPushItem {
        id: entry.id.clone(),
        content: entry.content.clone(),
        category: entry.category.clone(),
        source: source.to_string(),
        base_version: state.memories.base_version(&entry.id),
        is_deleted: true,
    }
}

pub fn apply_push_response(response: &MemoryPushResponse, state: &mut SyncState) {
    for row in &response.applied {
        state.memories.record(&row.id, &row.server_version);
    }
    for conflict in &response.conflicts {
        if let Some(current) = conflict.current.as_ref() {
            state.memories.record(&conflict.id, &current.server_version);
        }
    }
    state.memories.advance(&response.cursor);
}

pub fn apply_pull_response(response: &MemoryPullResponse, state: &mut SyncState) {
    for memory in &response.memories {
        state.memories.record(&memory.id, &memory.server_version);
    }
    state.memories.advance(&response.cursor);
}

/// Why a pushed memory did not land, in the user's words. An empty result means
/// every memory in the batch was stored.
pub fn refusals(request: &MemoryPushRequest, response: &MemoryPushResponse) -> Vec<String> {
    request
        .memories
        .iter()
        .filter(|memory| {
            !response
                .applied
                .iter()
                .any(|applied| applied.id == memory.id)
        })
        .map(|memory| {
            let preview = truncate(&memory.content, 60);
            if let Some(rejected) = response
                .rejected
                .iter()
                .find(|rejected| rejected.id == memory.id)
            {
                match rejected.term.as_deref() {
                    Some(term) => format!("'{preview}' was refused by your account's memory policy ({term})"),
                    None => format!("'{preview}' was refused by your account's memory policy"),
                }
            } else {
                format!("'{preview}' was not stored: another client changed it first, its account copy wins")
            }
        })
        .collect()
}

pub struct MemorySync<'a> {
    client: &'a CloudClient,
}

impl<'a> MemorySync<'a> {
    pub fn new(client: &'a CloudClient) -> Self {
        Self { client }
    }

    pub async fn pull(&self, since: &str) -> Result<MemoryPullResponse, CloudError> {
        self.client
            .get(MEMORY_SYNC_PATH, &[("since", since.to_string())])
            .await
    }

    pub async fn pull_all(&self, since: &str) -> Result<MemoryPullResponse, CloudError> {
        let mut cursor = since.to_string();
        let mut merged = MemoryPullResponse {
            memories: Vec::new(),
            cursor: cursor.clone(),
            has_more: false,
        };
        loop {
            let page = self.pull(&cursor).await?;
            merged.memories.extend(page.memories.iter().cloned());
            let advanced = page.cursor != cursor;
            cursor = page.cursor.clone();
            merged.cursor = cursor.clone();
            if !page.has_more || !advanced {
                break;
            }
        }
        Ok(merged)
    }

    pub async fn push(&self, request: &MemoryPushRequest) -> Result<MemoryPushResponse, CloudError> {
        self.client.post(MEMORY_SYNC_PATH, request).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn delta(id: &str, content: &str, version: &str, deleted: bool) -> MemoryDelta {
        MemoryDelta {
            id: id.to_string(),
            content: content.to_string(),
            category: None,
            source: Some("cli".to_string()),
            pinned: false,
            is_deleted: deleted,
            updated_at: format!("2026-09-13T00:00:{version:0>2}Z"),
            server_version: version.to_string(),
        }
    }

    #[test]
    fn a_new_memory_pushes_as_an_insert() {
        let memory = new_memory("  prefers tabs  ", None, "cli");
        assert_eq!(memory.content, "prefers tabs");
        assert_eq!(memory.base_version, INITIAL_CURSOR);
        assert!(!memory.is_deleted);
        assert!(Uuid::parse_str(&memory.id).is_ok());
    }

    #[test]
    fn a_delete_carries_the_version_the_device_last_saw() {
        let mut state = SyncState::default();
        state.memories.record("m1", "17");
        let entry = CachedMemory {
            id: "m1".to_string(),
            content: "prefers tabs".to_string(),
            category: None,
            source: None,
            pinned: false,
            updated_at: "2026-09-13T00:00:00Z".to_string(),
        };
        let push = delete_memory(&entry, &state, "cli");
        assert!(push.is_deleted);
        assert_eq!(push.base_version, "17");
    }

    #[test]
    fn a_tombstone_leaves_the_cache_and_an_update_replaces_it() {
        let mut cache = MemoryCache::default();
        cache.apply(&[delta("m1", "first", "1", false)]);
        cache.apply(&[delta("m1", "second", "2", false)]);
        assert_eq!(cache.entries.len(), 1);
        assert_eq!(cache.entries[0].content, "second");
        cache.apply(&[delta("m1", "second", "3", true)]);
        assert!(cache.entries.is_empty());
    }

    #[test]
    fn duplicate_content_is_recognised_regardless_of_spacing_and_case() {
        let mut cache = MemoryCache::default();
        cache.apply(&[delta("m1", "Prefers  tabs", "1", false)]);
        assert!(cache.contains("prefers tabs"));
        assert!(!cache.contains("prefers spaces"));
    }

    #[test]
    fn the_context_prompt_is_empty_when_the_account_holds_nothing() {
        assert_eq!(MemoryCache::default().context_prompt(), "");
    }

    #[test]
    fn the_context_prompt_lists_every_account_memory_on_one_line_each() {
        let mut cache = MemoryCache::default();
        cache.apply(&[delta("m1", "line one\nline two", "1", false)]);
        let prompt = cache.context_prompt();
        assert!(prompt.contains("<account_memory>"));
        assert!(prompt.contains("- line one line two"));
        assert!(!prompt.contains("line one\nline two"));
    }

    #[test]
    fn a_refused_memory_is_reported_with_the_reason_the_server_gave() {
        let request = MemoryPushRequest {
            protocol_version: SYNC_PROTOCOL_VERSION,
            memories: vec![
                new_memory("kept", None, "cli"),
                new_memory("refused by policy", None, "cli"),
                new_memory("lost a race", None, "cli"),
            ],
        };
        let response = MemoryPushResponse {
            applied: vec![AppliedRow {
                id: request.memories[0].id.clone(),
                server_version: "9".to_string(),
            }],
            conflicts: vec![MemoryConflict {
                id: request.memories[2].id.clone(),
                current: Some(delta(&request.memories[2].id, "lost a race", "10", false)),
            }],
            rejected: vec![RejectedMemory {
                id: request.memories[1].id.clone(),
                term: Some("password".to_string()),
            }],
            cursor: "10".to_string(),
        };

        let reported = refusals(&request, &response);
        assert_eq!(reported.len(), 2);
        assert!(reported[0].contains("memory policy"));
        assert!(reported[0].contains("password"));
        assert!(reported[1].contains("account copy wins"));
    }

    #[test]
    fn a_fully_applied_push_reports_nothing() {
        let request = MemoryPushRequest {
            protocol_version: SYNC_PROTOCOL_VERSION,
            memories: vec![new_memory("kept", None, "cli")],
        };
        let response = MemoryPushResponse {
            applied: vec![AppliedRow {
                id: request.memories[0].id.clone(),
                server_version: "9".to_string(),
            }],
            conflicts: Vec::new(),
            rejected: Vec::new(),
            cursor: "9".to_string(),
        };
        assert!(refusals(&request, &response).is_empty());
    }

    #[test]
    fn a_conflict_adopts_the_hosted_version() {
        let mut state = SyncState::default();
        let response = MemoryPushResponse {
            applied: Vec::new(),
            conflicts: vec![MemoryConflict {
                id: "m1".to_string(),
                current: Some(delta("m1", "account copy", "31", false)),
            }],
            rejected: Vec::new(),
            cursor: "31".to_string(),
        };
        apply_push_response(&response, &mut state);
        assert_eq!(state.memories.base_version("m1"), "31");
    }

    #[test]
    fn a_push_request_serializes_to_the_hosted_field_names() {
        let request = MemoryPushRequest {
            protocol_version: SYNC_PROTOCOL_VERSION,
            memories: vec![new_memory("remember this", Some("preference"), "cli")],
        };
        let json = serde_json::to_value(&request).expect("serializes");
        assert_eq!(json["protocolVersion"], 2);
        assert_eq!(json["memories"][0]["category"], "preference");
        assert_eq!(json["memories"][0]["source"], "cli");
        assert!(json["memories"][0]["baseVersion"].is_string());
        assert!(json["memories"][0].get("isDeleted").is_none());
    }

    #[test]
    fn a_pull_records_the_versions_it_delivered() {
        let mut state = SyncState::default();
        let response = MemoryPullResponse {
            memories: vec![delta("m1", "one", "8", false)],
            cursor: "8".to_string(),
            has_more: false,
        };
        apply_pull_response(&response, &mut state);
        assert_eq!(state.memories.base_version("m1"), "8");
        assert_eq!(state.memories.cursor, "8");
    }
}
