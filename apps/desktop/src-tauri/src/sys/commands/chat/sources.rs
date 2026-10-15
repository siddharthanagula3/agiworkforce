//! The sources a Local turn drew on, sent to the renderer beside the stream.
//!
//! The model-facing tool result carries search results as one fenced text
//! block, and knowledge passages go into the system prompt; neither is
//! structured data the renderer can show. This event is that structure. It is
//! renderer-facing only and is never added to a model message.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::sys::commands::knowledge::RetrievedPassage;

pub const CHAT_SOURCES_EVENT: &str = "chat:sources";

const MAX_SOURCES_PER_EVENT: usize = 20;
const MAX_SOURCE_TITLE_CHARS: usize = 200;
const MAX_SOURCE_SNIPPET_CHARS: usize = 300;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ChatSourceKind {
    WebSearch,
    ProjectKnowledge,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ChatSource {
    pub title: String,
    /// Empty for a project knowledge file, which has no address to open.
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatSourcesEvent {
    pub conversation_id: i64,
    pub kind: ChatSourceKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    pub sources: Vec<ChatSource>,
}

fn bounded(value: &str, max_chars: usize) -> String {
    value.trim().chars().take(max_chars).collect()
}

fn is_web_address(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|parsed| matches!(parsed.scheme(), "http" | "https"))
}

/// Search results as sources: one per distinct `http(s)` address, in rank order.
pub fn web_search_sources(results: &[serde_json::Value]) -> Vec<ChatSource> {
    let mut seen = std::collections::HashSet::new();
    results
        .iter()
        .filter_map(|item| {
            let field = |key: &str| item.get(key).and_then(|value| value.as_str()).unwrap_or("");
            let url = field("url").trim();
            if !is_web_address(url) || !seen.insert(url.to_string()) {
                return None;
            }
            let title = bounded(field("title"), MAX_SOURCE_TITLE_CHARS);
            let snippet = bounded(field("snippet"), MAX_SOURCE_SNIPPET_CHARS);
            Some(ChatSource {
                title: if title.is_empty() {
                    url.to_string()
                } else {
                    title
                },
                url: url.to_string(),
                snippet: (!snippet.is_empty()).then_some(snippet),
            })
        })
        .take(MAX_SOURCES_PER_EVENT)
        .collect()
}

/// Retrieved passages as sources: one per knowledge file, in retrieval order.
pub fn knowledge_sources(passages: &[RetrievedPassage]) -> Vec<ChatSource> {
    let mut seen = std::collections::HashSet::new();
    passages
        .iter()
        .filter_map(|passage| {
            let title = bounded(&passage.file_name, MAX_SOURCE_TITLE_CHARS);
            if title.is_empty() || !seen.insert(title.clone()) {
                return None;
            }
            let snippet = bounded(&passage.content, MAX_SOURCE_SNIPPET_CHARS);
            Some(ChatSource {
                title,
                url: String::new(),
                snippet: (!snippet.is_empty()).then_some(snippet),
            })
        })
        .take(MAX_SOURCES_PER_EVENT)
        .collect()
}

pub fn emit_chat_sources(app_handle: &AppHandle, event: ChatSourcesEvent) {
    if event.sources.is_empty() {
        return;
    }
    if let Err(error) = app_handle.emit(CHAT_SOURCES_EVENT, &event) {
        tracing::warn!("[Chat] Failed to emit the sources of a turn: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn web_sources_keep_rank_order_and_drop_duplicates_and_non_web_addresses() {
        let sources = web_search_sources(&[
            json!({ "title": "First", "url": "https://example.com/a", "snippet": "alpha" }),
            json!({ "title": "Script", "url": "javascript:alert(1)", "snippet": "" }),
            json!({ "title": "Local file", "url": "file:///etc/passwd" }),
            json!({ "title": "Again", "url": "https://example.com/a" }),
            json!({ "title": "", "url": "http://example.org/b", "snippet": "  " }),
            json!({ "title": "No address", "url": "" }),
        ]);

        assert_eq!(
            sources,
            vec![
                ChatSource {
                    title: "First".to_string(),
                    url: "https://example.com/a".to_string(),
                    snippet: Some("alpha".to_string()),
                },
                ChatSource {
                    title: "http://example.org/b".to_string(),
                    url: "http://example.org/b".to_string(),
                    snippet: None,
                },
            ]
        );
    }

    #[test]
    fn web_sources_are_capped_and_bounded() {
        let results: Vec<serde_json::Value> = (0..40)
            .map(|index| {
                json!({
                    "title": "t".repeat(500),
                    "url": format!("https://example.com/{index}"),
                    "snippet": "界".repeat(1_000),
                })
            })
            .collect();

        let sources = web_search_sources(&results);
        assert_eq!(sources.len(), MAX_SOURCES_PER_EVENT);
        assert_eq!(sources[0].title.chars().count(), MAX_SOURCE_TITLE_CHARS);
        assert_eq!(
            sources[0].snippet.as_deref().map(|s| s.chars().count()),
            Some(MAX_SOURCE_SNIPPET_CHARS)
        );
    }

    #[test]
    fn knowledge_sources_name_each_file_once_and_carry_no_address() {
        let passage = |file_name: &str, content: &str| RetrievedPassage {
            file_name: file_name.to_string(),
            content: content.to_string(),
        };
        let sources = knowledge_sources(&[
            passage("notes.md", "The launch window is May."),
            passage("notes.md", "A second passage from the same file."),
            passage("plan.pdf", ""),
            passage("  ", "A passage with no file name."),
        ]);

        assert_eq!(
            sources,
            vec![
                ChatSource {
                    title: "notes.md".to_string(),
                    url: String::new(),
                    snippet: Some("The launch window is May.".to_string()),
                },
                ChatSource {
                    title: "plan.pdf".to_string(),
                    url: String::new(),
                    snippet: None,
                },
            ]
        );
    }

    #[test]
    fn the_event_serializes_in_the_shape_the_renderer_reads() {
        let event = ChatSourcesEvent {
            conversation_id: 7,
            kind: ChatSourceKind::WebSearch,
            tool_call_id: Some("call_1".to_string()),
            query: Some("rust async".to_string()),
            sources: vec![ChatSource {
                title: "Async book".to_string(),
                url: "https://example.com/async".to_string(),
                snippet: None,
            }],
        };

        assert_eq!(
            serde_json::to_value(&event).expect("event"),
            json!({
                "conversation_id": 7,
                "kind": "web_search",
                "tool_call_id": "call_1",
                "query": "rust async",
                "sources": [{ "title": "Async book", "url": "https://example.com/async" }],
            })
        );
    }
}
