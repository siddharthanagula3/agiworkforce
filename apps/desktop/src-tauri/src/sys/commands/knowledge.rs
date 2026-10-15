//! Project knowledge retrieval for local projects.
//!
//! A local project's knowledge files live as extracted text on the `projects`
//! row. When a local embedding model is installed, those files are chunked and
//! embedded on this device and each chat turn receives only the passages most
//! relevant to the message. Without one, the chat path falls back to injecting
//! the files whole, capped, and the project dialog tells the user so. Nothing
//! here leaves the device: embeddings come from the local Ollama runtime only.
//!
//! Files are embedded when the project dialog saves them and, when a turn
//! finds the index behind the files, in a background task. A chat turn only
//! reads the index, within [`TURN_RETRIEVAL_TIMEOUT`], and sends whole files
//! when the index is not ready.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::State;

use crate::core::embeddings::{EmbeddingConfig, EmbeddingGenerator};
use crate::features::projects::{ChunkingConfig, KnowledgeBase, KnowledgeDocument, RAGEngine};
use crate::sys::commands::chat::state::AppDatabase;

/// Passages given to one chat turn when retrieval is available.
const RETRIEVED_PASSAGES_PER_TURN: usize = 8;

/// The longest a chat turn waits for passages before sending whole files.
const TURN_RETRIEVAL_TIMEOUT: Duration = Duration::from_secs(3);

/// Without retrieval, at most this many knowledge files reach a turn.
pub const WHOLE_FILE_MAX_FILES: usize = 10;

/// Without retrieval, each knowledge file is cut to this many characters.
pub const WHOLE_FILE_MAX_CHARS: usize = 4_000;

/// Managed state for the knowledge store: opened once on first use, with
/// one index sync running at a time.
pub struct ProjectKnowledgeState {
    db_path: PathBuf,
    knowledge_base: Mutex<Option<Arc<KnowledgeBase>>>,
    sync_lock: Arc<tokio::sync::Mutex<()>>,
    background_syncs: Arc<Mutex<HashSet<String>>>,
}

impl ProjectKnowledgeState {
    pub fn new(db_path: PathBuf) -> Self {
        Self {
            db_path,
            knowledge_base: Mutex::new(None),
            sync_lock: Arc::new(tokio::sync::Mutex::new(())),
            background_syncs: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    /// Degraded state backed by an in-memory database.
    pub fn new_degraded() -> Self {
        Self::new(PathBuf::from(":memory:"))
    }

    fn knowledge_base(&self) -> Result<Arc<KnowledgeBase>, String> {
        let mut slot = self
            .knowledge_base
            .lock()
            .map_err(|_| "Knowledge base state lock poisoned".to_string())?;
        if let Some(kb) = slot.as_ref() {
            return Ok(kb.clone());
        }
        let kb = Arc::new(
            KnowledgeBase::new(self.db_path.clone())
                .map_err(|e| format!("Failed to open knowledge base: {}", e))?,
        );
        *slot = Some(kb.clone());
        Ok(kb)
    }

    /// Brings a project's index up to date in the background, once at a time
    /// per project, so the next turn can use passages.
    fn sync_in_background(
        &self,
        kb: Arc<KnowledgeBase>,
        project_id: &str,
        files: Vec<ProjectKnowledgeFile>,
        ollama_url: String,
    ) {
        let started = self
            .background_syncs
            .lock()
            .map(|mut running| running.insert(project_id.to_string()))
            .unwrap_or(false);
        if !started {
            return;
        }
        let project_id = project_id.to_string();
        let sync_lock = self.sync_lock.clone();
        let background_syncs = self.background_syncs.clone();
        tauri::async_runtime::spawn(async move {
            let _sync = sync_lock.lock().await;
            if let Some(generator) = local_embedding_generator(ollama_url).await {
                match sync_project_index(&kb, &generator, &project_id, &files).await {
                    Ok(indexed) => tracing::info!(
                        "[Knowledge] Indexed {indexed} knowledge file(s) for project {project_id}"
                    ),
                    Err(e) => tracing::warn!("[Knowledge] Background indexing failed: {}", e),
                }
            }
            if let Ok(mut running) = background_syncs.lock() {
                running.remove(&project_id);
            }
        });
    }
}

/// A knowledge file as the project dialog stores it on the `projects` row.
#[derive(Debug, Clone, Deserialize)]
pub struct ProjectKnowledgeFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub content: Option<String>,
}

impl ProjectKnowledgeFile {
    fn text(&self) -> Option<&str> {
        self.content
            .as_deref()
            .map(str::trim)
            .filter(|content| !content.is_empty())
    }
}

/// Parse the `projects.knowledge_base_files` JSON. Entries without an id or
/// name are skipped rather than failing the turn.
pub fn parse_project_knowledge_files(json: Option<&str>) -> Vec<ProjectKnowledgeFile> {
    json.and_then(|json| serde_json::from_str::<Vec<serde_json::Value>>(json).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| serde_json::from_value::<ProjectKnowledgeFile>(value).ok())
        .collect()
}

/// A passage chosen for a turn, with the name of the file it came from.
#[derive(Debug, Clone, PartialEq)]
pub struct RetrievedPassage {
    pub file_name: String,
    pub content: String,
}

/// How a project's knowledge reaches the model.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum KnowledgeRetrievalMode {
    /// A local embedding model is installed; only relevant passages are sent.
    Passages,
    /// No local embedding model; files are sent whole, up to the prompt caps.
    WholeFiles,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectKnowledgeSyncResult {
    pub retrieval: KnowledgeRetrievalMode,
    pub indexed_files: usize,
    pub whole_file_max_files: usize,
    pub whole_file_max_chars: usize,
}

/// The local embedding model, or `None` when Ollama is not running or has no
/// model that declares embedding support. Fallback is disabled so a missing
/// model is reported instead of silently producing low-quality vectors.
async fn local_embedding_generator(ollama_url: String) -> Option<EmbeddingGenerator> {
    match EmbeddingGenerator::new(EmbeddingConfig {
        ollama_url,
        enable_fallback: false,
        ..EmbeddingConfig::default()
    })
    .await
    {
        Ok(generator) => Some(generator),
        Err(e) => {
            tracing::debug!("[Knowledge] No local embedding model: {}", e);
            None
        }
    }
}

fn document_embedding_model(document: &KnowledgeDocument) -> Option<String> {
    document
        .metadata
        .as_deref()
        .and_then(|metadata| serde_json::from_str::<serde_json::Value>(metadata).ok())
        .and_then(|metadata| {
            metadata
                .get("embeddingModel")
                .and_then(|model| model.as_str())
                .map(str::to_string)
        })
}

/// Files shorter than one chunk produce no chunks, so they are always sent
/// whole instead of being retrieved.
pub fn is_below_chunk_size(content: &str) -> bool {
    content.chars().count() < ChunkingConfig::default().min_chunk_size
}

async fn index_knowledge_file(
    kb: &KnowledgeBase,
    generator: &EmbeddingGenerator,
    project_id: &str,
    file: &ProjectKnowledgeFile,
    content: &str,
) -> Result<(), String> {
    let engine = RAGEngine::new(ChunkingConfig::default());
    let now = chrono::Utc::now().to_rfc3339();
    let document = KnowledgeDocument {
        id: file.id.clone(),
        project_id: project_id.to_string(),
        file_path: String::new(),
        file_name: file.name.clone(),
        file_type: std::path::Path::new(&file.name)
            .extension()
            .map(|extension| extension.to_string_lossy().to_string())
            .unwrap_or_default(),
        size: content.len(),
        content: content.to_string(),
        metadata: Some(serde_json::json!({ "embeddingModel": generator.model_id() }).to_string()),
        indexed_at: now.clone(),
        created_at: now,
    };

    let mut chunks = engine
        .chunk_document(&document)
        .map_err(|e| format!("Failed to chunk {}: {}", file.name, e))?;
    for chunk in &mut chunks {
        let embedding = generator
            .generate(&chunk.content)
            .await
            .map_err(|e| format!("Failed to embed {}: {}", file.name, e))?;
        chunk.embedding = Some(embedding);
    }

    kb.delete_document(&document.id)
        .map_err(|e| format!("Failed to replace {}: {}", file.name, e))?;
    kb.add_document(document)
        .map_err(|e| format!("Failed to store {}: {}", file.name, e))?;
    for chunk in chunks {
        kb.add_chunk(chunk)
            .map_err(|e| format!("Failed to store a passage of {}: {}", file.name, e))?;
    }
    Ok(())
}

/// Delete indexed passages of files that are no longer on the project.
/// Runs whether or not an embedding model is installed, so a removed file
/// never lingers in the index.
fn prune_removed_files(
    kb: &KnowledgeBase,
    project_id: &str,
    files: &[ProjectKnowledgeFile],
) -> Result<Vec<KnowledgeDocument>, String> {
    let current_ids: HashSet<&str> = files.iter().map(|file| file.id.as_str()).collect();
    let documents = kb
        .get_project_documents(project_id)
        .map_err(|e| format!("Failed to list indexed knowledge: {}", e))?;
    let mut kept = Vec::with_capacity(documents.len());
    for document in documents {
        if current_ids.contains(document.id.as_str()) {
            kept.push(document);
        } else {
            kb.delete_document(&document.id)
                .map_err(|e| format!("Failed to remove deleted knowledge: {}", e))?;
        }
    }
    Ok(kept)
}

/// Bring the project's passage index in line with its knowledge files: drop
/// documents for removed files or an older embedding model, and embed files
/// that are not indexed yet. Returns how many files are indexed.
async fn sync_project_index(
    kb: &KnowledgeBase,
    generator: &EmbeddingGenerator,
    project_id: &str,
    files: &[ProjectKnowledgeFile],
) -> Result<usize, String> {
    let model = generator.model_id();
    let mut indexed: HashSet<String> = HashSet::new();
    for document in prune_removed_files(kb, project_id, files)? {
        if document_embedding_model(&document).as_deref() == Some(model.as_str()) {
            indexed.insert(document.id);
        } else {
            kb.delete_document(&document.id)
                .map_err(|e| format!("Failed to remove stale knowledge: {}", e))?;
        }
    }

    for file in files {
        if indexed.contains(&file.id) {
            continue;
        }
        let Some(content) = file.text() else { continue };
        if is_below_chunk_size(content) {
            continue;
        }
        index_knowledge_file(kb, generator, project_id, file, content).await?;
        indexed.insert(file.id.clone());
    }

    Ok(indexed.len())
}

enum IndexLookup {
    Passages(Vec<RetrievedPassage>),
    /// Some file the index should hold is missing or was embedded by another
    /// model.
    Behind,
    Unavailable,
}

/// Passages from the project's knowledge files that are most relevant to
/// `query`, or `None` when the caller must fall back to whole files: no local
/// embedding model, an index behind the files, or no answer within
/// [`TURN_RETRIEVAL_TIMEOUT`]. Only the query is embedded here; an index
/// behind the files is brought up to date in the background. Files too short
/// to chunk are returned whole.
pub async fn retrieve_project_passages(
    state: &ProjectKnowledgeState,
    project_id: &str,
    files: &[ProjectKnowledgeFile],
    query: &str,
    ollama_url: String,
) -> Option<Vec<RetrievedPassage>> {
    if files.iter().all(|file| file.text().is_none()) {
        return None;
    }
    let kb = match state.knowledge_base() {
        Ok(kb) => kb,
        Err(e) => {
            tracing::warn!("[Knowledge] {}", e);
            return None;
        }
    };
    let lookup = tokio::time::timeout(
        TURN_RETRIEVAL_TIMEOUT,
        passages_from_index(&kb, project_id, files, query, ollama_url.clone()),
    )
    .await;
    match lookup {
        Ok(IndexLookup::Passages(passages)) => Some(passages),
        Ok(IndexLookup::Behind) => {
            tracing::info!(
                "[Knowledge] Index is behind the files of project {project_id}; sending whole files and indexing in the background"
            );
            state.sync_in_background(kb, project_id, files.to_vec(), ollama_url);
            None
        }
        Ok(IndexLookup::Unavailable) => None,
        Err(_) => {
            tracing::warn!(
                "[Knowledge] Passage lookup took longer than {:?}; sending whole files",
                TURN_RETRIEVAL_TIMEOUT
            );
            None
        }
    }
}

async fn passages_from_index(
    kb: &KnowledgeBase,
    project_id: &str,
    files: &[ProjectKnowledgeFile],
    query: &str,
    ollama_url: String,
) -> IndexLookup {
    let Some(generator) = local_embedding_generator(ollama_url).await else {
        return IndexLookup::Unavailable;
    };
    let model = generator.model_id();
    let documents = match kb.get_project_documents(project_id) {
        Ok(documents) => documents,
        Err(e) => {
            tracing::warn!("[Knowledge] Failed to list indexed knowledge: {}", e);
            return IndexLookup::Unavailable;
        }
    };
    let indexed: HashSet<String> = documents
        .into_iter()
        .filter(|document| document_embedding_model(document).as_deref() == Some(model.as_str()))
        .map(|document| document.id)
        .collect();
    let behind = files.iter().any(|file| {
        file.text()
            .is_some_and(|content| !is_below_chunk_size(content))
            && !indexed.contains(&file.id)
    });
    if behind {
        return IndexLookup::Behind;
    }

    let query_embedding = match generator.generate(query).await {
        Ok(embedding) => embedding,
        Err(e) => {
            tracing::warn!(
                "[Knowledge] Query embedding failed, sending whole files: {}",
                e
            );
            return IndexLookup::Unavailable;
        }
    };
    let current_ids: HashSet<&str> = files.iter().map(|file| file.id.as_str()).collect();
    let chunks = match kb.get_project_chunks(project_id) {
        Ok(chunks) => chunks
            .into_iter()
            .filter(|chunk| current_ids.contains(chunk.document_id.as_str()))
            .collect(),
        Err(e) => {
            tracing::warn!(
                "[Knowledge] Passage lookup failed, sending whole files: {}",
                e
            );
            return IndexLookup::Unavailable;
        }
    };

    let mut passages: Vec<RetrievedPassage> = files
        .iter()
        .filter_map(|file| {
            file.text()
                .filter(|content| is_below_chunk_size(content))
                .map(|content| RetrievedPassage {
                    file_name: file.name.clone(),
                    content: content.to_string(),
                })
        })
        .collect();
    let engine = RAGEngine::new(ChunkingConfig::default());
    passages.extend(
        engine
            .find_similar_chunks(&query_embedding, chunks, RETRIEVED_PASSAGES_PER_TURN)
            .into_iter()
            .map(|result| RetrievedPassage {
                file_name: result.source_file,
                content: result.content,
            }),
    );
    IndexLookup::Passages(passages)
}

fn load_local_project_knowledge_files(
    db: &AppDatabase,
    project_id: &str,
) -> Result<Vec<ProjectKnowledgeFile>, String> {
    use rusqlite::OptionalExtension;

    let conn = db.connection()?;
    let json = conn
        .query_row(
            "SELECT knowledge_base_files FROM projects WHERE id = ?1",
            rusqlite::params![project_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .optional()
        .map_err(|e| format!("Failed to read project knowledge: {}", e))?
        .flatten();
    Ok(parse_project_knowledge_files(json.as_deref()))
}

/// Index a local project's saved knowledge files on this device and report
/// how chats will use them.
#[tauri::command]
pub async fn project_sync_knowledge(
    project_id: String,
    db: State<'_, AppDatabase>,
    state: State<'_, ProjectKnowledgeState>,
    llm_state: State<'_, crate::sys::commands::llm::LLMState>,
) -> Result<ProjectKnowledgeSyncResult, String> {
    let files = load_local_project_knowledge_files(&db, &project_id)?;
    let kb = state.knowledge_base()?;
    let _sync = state.sync_lock.lock().await;
    prune_removed_files(&kb, &project_id, &files)?;
    let ollama_url = crate::sys::commands::llm::configured_ollama_url(&llm_state.router).await;
    let Some(generator) = local_embedding_generator(ollama_url).await else {
        return Ok(ProjectKnowledgeSyncResult {
            retrieval: KnowledgeRetrievalMode::WholeFiles,
            indexed_files: 0,
            whole_file_max_files: WHOLE_FILE_MAX_FILES,
            whole_file_max_chars: WHOLE_FILE_MAX_CHARS,
        });
    };
    let indexed_files = sync_project_index(&kb, &generator, &project_id, &files).await?;
    Ok(ProjectKnowledgeSyncResult {
        retrieval: KnowledgeRetrievalMode::Passages,
        indexed_files,
        whole_file_max_files: WHOLE_FILE_MAX_FILES,
        whole_file_max_chars: WHOLE_FILE_MAX_CHARS,
    })
}

/// Delete a knowledge file's indexed passages and embeddings.
#[tauri::command]
pub async fn project_remove_knowledge_file(
    project_id: String,
    file_id: String,
    state: State<'_, ProjectKnowledgeState>,
) -> Result<(), String> {
    let kb = state.knowledge_base()?;
    let document = kb
        .get_document(&file_id)
        .map_err(|e| format!("Failed to read indexed knowledge: {}", e))?;
    match document {
        Some(document) if document.project_id == project_id => kb
            .delete_document(&file_id)
            .map_err(|e| format!("Failed to delete indexed knowledge: {}", e)),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_project_knowledge_files_skips_malformed_entries() {
        let files = parse_project_knowledge_files(Some(
            r#"[
                {"id": "a", "name": "notes.md", "content": "text", "addedAt": "2026-10-10"},
                {"name": "no-id.md"},
                {"id": "b", "name": "empty.md"}
            ]"#,
        ));
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].text(), Some("text"));
        assert_eq!(files[1].text(), None);
        assert!(parse_project_knowledge_files(Some("not json")).is_empty());
        assert!(parse_project_knowledge_files(None).is_empty());
    }

    #[test]
    fn short_files_are_below_chunk_size() {
        assert!(is_below_chunk_size("short note"));
        assert!(!is_below_chunk_size(
            &"word ".repeat(ChunkingConfig::default().min_chunk_size)
        ));
    }

    #[test]
    fn document_embedding_model_reads_metadata() {
        let document = KnowledgeDocument {
            id: "a".to_string(),
            project_id: "p".to_string(),
            file_path: String::new(),
            file_name: "a.md".to_string(),
            file_type: "md".to_string(),
            size: 0,
            content: String::new(),
            metadata: Some(r#"{"embeddingModel":"ollama:local"}"#.to_string()),
            indexed_at: String::new(),
            created_at: String::new(),
        };
        assert_eq!(
            document_embedding_model(&document).as_deref(),
            Some("ollama:local")
        );
        let legacy = KnowledgeDocument {
            metadata: None,
            ..document
        };
        assert_eq!(document_embedding_model(&legacy), None);
    }
}
