//! Knowledge base commands for storing and retrieving knowledge.
//!
//! This module provides a simple knowledge base that can be used to store
//! and retrieve knowledge using embeddings.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

/// Knowledge entry stored in the knowledge base
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeEntry {
    pub id: String,
    pub content: String,
    pub source: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub embedding_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Knowledge query result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeQueryResult {
    pub entries: Vec<KnowledgeEntry>,
    pub query: String,
    pub relevance_scores: Vec<f64>,
}

/// State for the knowledge base
pub struct KnowledgeState {
    entries: Mutex<HashMap<String, KnowledgeEntry>>,
}

impl Default for KnowledgeState {
    fn default() -> Self {
        Self::new()
    }
}

impl KnowledgeState {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

/// Add content to the knowledge base
///
/// This is a simple implementation that stores the content without embeddings.
/// In a production system, this would generate embeddings and store them
/// in a vector database for semantic search.
#[tauri::command]
pub async fn knowledge_add(
    content: String,
    source: String,
    metadata: std::collections::HashMap<String, serde_json::Value>,
    state: State<'_, KnowledgeState>,
) -> Result<String, String> {
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let entry = KnowledgeEntry {
        id: id.clone(),
        content,
        source,
        metadata,
        embedding_id: None,
        created_at: now.clone(),
        updated_at: now,
    };

    let mut entries = state.entries.lock().map_err(|e| e.to_string())?;
    entries.insert(id.clone(), entry);

    Ok(id)
}

/// Query the knowledge base
///
/// This is a simple implementation that does keyword matching.
/// In a production system, this would use vector similarity search.
#[tauri::command]
pub async fn knowledge_query(
    query: String,
    limit: usize,
    state: State<'_, KnowledgeState>,
) -> Result<KnowledgeQueryResult, String> {
    let entries = state.entries.lock().map_err(|e| e.to_string())?;

    // Simple keyword matching - find entries that contain the query keywords
    let query_lower = query.to_lowercase();
    let query_words: Vec<&str> = query_lower.split_whitespace().collect();

    let mut scored_entries: Vec<(String, KnowledgeEntry, f64)> = entries
        .iter()
        .map(|(id, entry)| {
            let content_lower = entry.content.to_lowercase();
            // Count how many query words appear in the content
            let score = query_words
                .iter()
                .filter(|word| content_lower.contains(*word))
                .count() as f64;
            (id.clone(), entry.clone(), score)
        })
        .filter(|(_, _, score)| *score > 0.0)
        .collect();

    // Sort by score descending
    scored_entries.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    // Take top results
    let results: Vec<KnowledgeEntry> = scored_entries
        .into_iter()
        .take(limit)
        .map(|(_, entry, _)| entry)
        .collect();

    let relevance_scores: Vec<f64> = results
        .iter()
        .map(|entry| {
            let content_lower = entry.content.to_lowercase();
            query_words
                .iter()
                .filter(|word| content_lower.contains(*word))
                .count() as f64
        })
        .collect();

    Ok(KnowledgeQueryResult {
        entries: results,
        query,
        relevance_scores,
    })
}
