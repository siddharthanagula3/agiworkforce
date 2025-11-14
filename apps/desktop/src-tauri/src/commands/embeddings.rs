/**
 * Embeddings commands module
 * Exports Tauri commands and state for semantic search
 */
use std::sync::Arc;
use tokio::sync::Mutex;

pub use crate::embeddings::{
    generate_code_embeddings, get_embedding_stats, get_indexing_progress, index_file,
    index_workspace, on_file_changed, on_file_deleted, semantic_search_codebase, EmbeddingService,
};

/// Embedding service state wrapper
pub struct EmbeddingServiceState(pub Arc<Mutex<EmbeddingService>>);
