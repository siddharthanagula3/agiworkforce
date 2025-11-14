/**
 * Embeddings Module
 * Vector embeddings for semantic code search
 *
 * Architecture:
 * - Primary: Ollama embeddings API (nomic-embed-text)
 * - Fallback: fastembed-rs (all-MiniLM-L6-v2) for offline support
 * - Storage: SQLite with custom vector similarity search
 */

pub mod generator;
pub mod similarity;
pub mod chunker;
pub mod cache;
pub mod indexer;

pub use generator::{EmbeddingGenerator, EmbeddingModel, EmbeddingConfig};
pub use similarity::{SimilaritySearch, SearchResult, cosine_similarity};
pub use chunker::{CodeChunker, CodeChunk, ChunkStrategy};
pub use cache::{EmbeddingCache, CacheStats};
pub use indexer::{IncrementalIndexer, IndexingProgress};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Vector embedding (384 dimensions for all-MiniLM-L6-v2 / nomic-embed-text)
pub type Vector = Vec<f32>;

/// Embedding service state
pub struct EmbeddingService {
    generator: Arc<Mutex<EmbeddingGenerator>>,
    similarity: Arc<Mutex<SimilaritySearch>>,
    cache: Arc<Mutex<EmbeddingCache>>,
    indexer: Arc<Mutex<IncrementalIndexer>>,
}

impl EmbeddingService {
    /// Create a new embedding service
    pub async fn new(workspace_root: PathBuf, config: EmbeddingConfig) -> Result<Self> {
        let generator = EmbeddingGenerator::new(config).await?;
        let db_path = workspace_root.join(".agi").join("embeddings.db");
        std::fs::create_dir_all(db_path.parent().unwrap())?;

        let similarity = SimilaritySearch::new(db_path.clone())?;
        let cache = EmbeddingCache::new(db_path)?;

        let generator_arc = Arc::new(Mutex::new(generator));
        let similarity_arc = Arc::new(Mutex::new(similarity));

        let indexer = IncrementalIndexer::new(
            workspace_root,
            generator_arc.clone(),
            similarity_arc.clone(),
        );

        Ok(Self {
            generator: generator_arc,
            similarity: similarity_arc,
            cache: Arc::new(Mutex::new(cache)),
            indexer: Arc::new(Mutex::new(indexer)),
        })
    }

    /// Get generator
    pub fn generator(&self) -> Arc<Mutex<EmbeddingGenerator>> {
        self.generator.clone()
    }

    /// Get similarity search
    pub fn similarity(&self) -> Arc<Mutex<SimilaritySearch>> {
        self.similarity.clone()
    }

    /// Get cache
    pub fn cache(&self) -> Arc<Mutex<EmbeddingCache>> {
        self.cache.clone()
    }

    /// Get indexer
    pub fn indexer(&self) -> Arc<Mutex<IncrementalIndexer>> {
        self.indexer.clone()
    }
}

/// Embedding metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddingMetadata {
    pub id: String,
    pub file_path: String,
    pub chunk_index: usize,
    pub content: String,
    pub language: String,
    pub symbol_name: Option<String>,
    pub start_line: u32,
    pub end_line: u32,
    pub created_at: i64,
}

impl EmbeddingMetadata {
    pub fn new(
        file_path: String,
        chunk_index: usize,
        content: String,
        language: String,
        start_line: u32,
        end_line: u32,
    ) -> Self {
        let id = format!(
            "{}:{}:{}",
            file_path,
            chunk_index,
            start_line
        );

        Self {
            id,
            file_path,
            chunk_index,
            content,
            language,
            symbol_name: None,
            start_line,
            end_line,
            created_at: chrono::Utc::now().timestamp(),
        }
    }
}

/// Tauri commands for embeddings
#[tauri::command]
pub async fn generate_code_embeddings(
    file_path: String,
    content: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<usize, String> {
    let service = embedding_service.lock().await;

    // Chunk the code
    let chunker = CodeChunker::new(ChunkStrategy::Semantic);
    let chunks = chunker.chunk_file(&file_path, &content)
        .map_err(|e| format!("Failed to chunk file: {}", e))?;

    let generator = service.generator();
    let generator_guard = generator.lock().await;

    let similarity = service.similarity();
    let mut similarity_guard = similarity.lock().await;

    // Generate embeddings for each chunk
    let mut count = 0;
    for chunk in chunks {
        let embedding = generator_guard.generate(&chunk.content)
            .await
            .map_err(|e| format!("Failed to generate embedding: {}", e))?;

        let metadata = EmbeddingMetadata::new(
            chunk.file_path,
            chunk.index,
            chunk.content,
            chunk.language,
            chunk.start_line,
            chunk.end_line,
        );

        similarity_guard.add_embedding(&metadata.id, embedding, metadata)
            .map_err(|e| format!("Failed to store embedding: {}", e))?;

        count += 1;
    }

    Ok(count)
}

#[tauri::command]
pub async fn semantic_search_codebase(
    query: String,
    limit: Option<usize>,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<Vec<SearchResult>, String> {
    let service = embedding_service.lock().await;

    let generator = service.generator();
    let generator_guard = generator.lock().await;

    // Generate embedding for query
    let query_embedding = generator_guard.generate(&query)
        .await
        .map_err(|e| format!("Failed to generate query embedding: {}", e))?;

    drop(generator_guard);

    let similarity = service.similarity();
    let similarity_guard = similarity.lock().await;

    // Search for similar embeddings
    let results = similarity_guard.search(query_embedding, limit.unwrap_or(10))
        .map_err(|e| format!("Failed to search: {}", e))?;

    Ok(results)
}

#[tauri::command]
pub async fn get_embedding_stats(
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<EmbeddingStats, String> {
    let service = embedding_service.lock().await;

    let similarity = service.similarity();
    let similarity_guard = similarity.lock().await;

    let total_embeddings = similarity_guard.count_embeddings()
        .map_err(|e| format!("Failed to get embedding count: {}", e))?;

    let cache = service.cache();
    let cache_guard = cache.lock().await;
    let cache_stats = cache_guard.get_stats()
        .map_err(|e| format!("Failed to get cache stats: {}", e))?;

    Ok(EmbeddingStats {
        total_embeddings,
        cache_hits: cache_stats.hits,
        cache_misses: cache_stats.misses,
        cache_size: cache_stats.size,
    })
}

#[derive(Debug, Serialize)]
pub struct EmbeddingStats {
    pub total_embeddings: usize,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub cache_size: usize,
}

#[tauri::command]
pub async fn index_workspace(
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let service = embedding_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    indexer_guard.index_workspace()
        .await
        .map_err(|e| format!("Failed to index workspace: {}", e))
}

#[tauri::command]
pub async fn index_file(
    file_path: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let service = embedding_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(file_path);
    indexer_guard.index_file(&path)
        .await
        .map_err(|e| format!("Failed to index file: {}", e))
}

#[tauri::command]
pub async fn get_indexing_progress(
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<IndexingProgress, String> {
    let service = embedding_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    Ok(indexer_guard.get_progress().await)
}

#[tauri::command]
pub async fn on_file_changed(
    file_path: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let service = embedding_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(file_path);
    indexer_guard.on_file_changed(&path)
        .await
        .map_err(|e| format!("Failed to handle file change: {}", e))
}

#[tauri::command]
pub async fn on_file_deleted(
    file_path: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let service = embedding_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(file_path);
    indexer_guard.on_file_deleted(&path)
        .await
        .map_err(|e| format!("Failed to handle file deletion: {}", e))
}
