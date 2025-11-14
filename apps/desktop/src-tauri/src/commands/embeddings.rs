/**
 * Embeddings commands module
 * Exports Tauri commands and state for semantic search
 */

use std::sync::Arc;
use tokio::sync::Mutex;

pub use crate::embeddings::{
    generate_code_embeddings,
    semantic_search_codebase,
    get_embedding_stats,
    index_workspace,
    index_file,
    get_indexing_progress,
    on_file_changed,
    on_file_deleted,
    EmbeddingService,
};

/// Embedding service state wrapper
pub struct EmbeddingServiceState(pub Arc<Mutex<EmbeddingService>>);
