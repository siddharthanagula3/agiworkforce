//! Knowledge base commands for storing and retrieving knowledge.
//!
//! This module provides a simple knowledge base that can be used to store
//! and retrieve knowledge using embeddings. Also exposes project-scoped
//! RAG search and file ingestion commands.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

use crate::features::projects::{
    ChunkingConfig, KnowledgeBase, KnowledgeDocument, RAGEngine,
};

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

// =============================================================================
// PROJECT KNOWLEDGE RAG COMMANDS
// =============================================================================

/// Managed state that holds the path to the knowledge database.
pub struct ProjectKnowledgeState {
    db_path: PathBuf,
}

impl ProjectKnowledgeState {
    pub fn new(db_path: PathBuf) -> Self {
        Self { db_path }
    }

    /// Degraded state backed by an in-memory database.
    pub fn new_degraded() -> Self {
        Self {
            db_path: PathBuf::from(":memory:"),
        }
    }

    fn knowledge_base(&self) -> Result<KnowledgeBase, String> {
        KnowledgeBase::new(self.db_path.clone())
            .map_err(|e| format!("Failed to open knowledge base: {}", e))
    }
}

/// A single search result returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSearchResult {
    pub content: String,
    pub source: String,
    pub relevance_score: f32,
}

/// Search a project's knowledge base using the RAG engine.
///
/// Generates an embedding for the query, then finds the most similar
/// chunks across all documents in the project.
#[tauri::command]
pub async fn project_search_knowledge(
    project_id: String,
    query: String,
    limit: Option<usize>,
    state: State<'_, ProjectKnowledgeState>,
) -> Result<Vec<KnowledgeSearchResult>, String> {
    let kb = state.knowledge_base()?;
    let top_k = limit.unwrap_or(5);

    let engine = RAGEngine::new(ChunkingConfig::default());

    // Generate an embedding for the query
    let query_embedding = engine
        .generate_embedding(&query)
        .await
        .map_err(|e| format!("Failed to generate query embedding: {}", e))?;

    // Retrieve all chunks for this project
    let chunks = kb
        .get_project_chunks(&project_id)
        .map_err(|e| format!("Failed to get project chunks: {}", e))?;

    let results = engine.find_similar_chunks(&query_embedding, chunks, top_k);

    Ok(results
        .into_iter()
        .map(|r| KnowledgeSearchResult {
            content: r.content,
            source: r.source_file,
            relevance_score: r.similarity,
        })
        .collect())
}

/// Add a file to a project's knowledge base.
///
/// Reads the file, extracts text based on file type, chunks the content,
/// generates embeddings for each chunk, and stores everything in the
/// knowledge database.
#[tauri::command]
pub async fn project_add_knowledge_file(
    project_id: String,
    file_path: String,
    state: State<'_, ProjectKnowledgeState>,
) -> Result<String, String> {
    let kb = state.knowledge_base()?;
    let engine = RAGEngine::new(ChunkingConfig::default());

    let path = std::path::Path::new(&file_path);

    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "unknown".to_string());

    let file_type = path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_else(|| "txt".to_string());

    // Extract text content from the file
    let content = engine
        .extract_text_from_file(&file_path, &file_type)
        .map_err(|e| format!("Failed to extract text from file: {}", e))?;

    let file_size = std::fs::metadata(&file_path)
        .map(|m| m.len() as usize)
        .unwrap_or(0);

    let doc_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    let document = KnowledgeDocument {
        id: doc_id.clone(),
        project_id: project_id.clone(),
        file_path: file_path.clone(),
        file_name,
        file_type,
        size: file_size,
        content,
        metadata: None,
        indexed_at: now.clone(),
        created_at: now,
    };

    // Chunk the document
    let chunks = engine
        .chunk_document(&document)
        .map_err(|e| format!("Failed to chunk document: {}", e))?;

    // Store the document record
    kb.add_document(document)
        .map_err(|e| format!("Failed to store document: {}", e))?;

    // Generate embeddings and store each chunk
    for mut chunk in chunks {
        match engine.generate_embedding(&chunk.content).await {
            Ok(embedding) => {
                chunk.embedding = Some(embedding);
            }
            Err(e) => {
                tracing::warn!(
                    "Failed to generate embedding for chunk {}: {}",
                    chunk.id,
                    e
                );
                // Store chunk without embedding -- text search still works
            }
        }
        kb.add_chunk(chunk)
            .map_err(|e| format!("Failed to store chunk: {}", e))?;
    }

    Ok(doc_id)
}
