pub mod cache;
pub mod chunker;

pub mod generator;
pub mod indexer;
pub mod similarity;

pub use cache::{CacheStats, EmbeddingCache};
pub use chunker::{ChunkStrategy, CodeChunk, CodeChunker};
pub use generator::{EmbeddingConfig, EmbeddingGenerator, EmbeddingModel};
pub use indexer::{IncrementalIndexer, IndexingProgress};
pub use similarity::{cosine_similarity, SearchResult, SimilaritySearch};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

pub type Vector = Vec<f32>;

pub struct EmbeddingService {
    generator: Arc<Mutex<EmbeddingGenerator>>,
    similarity: Arc<Mutex<SimilaritySearch>>,
    cache: Arc<Mutex<EmbeddingCache>>,
    indexer: Arc<Mutex<IncrementalIndexer>>,
}

impl EmbeddingService {
    /// Create a degraded EmbeddingService using temp paths and skipping async init.
    /// Commands will function but may return errors on actual embedding operations.
    pub fn new_degraded() -> Result<Self> {
        let config = EmbeddingConfig::default();
        let generator = EmbeddingGenerator::new_degraded(config)?;
        let temp_dir = std::env::temp_dir().join("agiworkforce_embeddings_degraded");
        std::fs::create_dir_all(&temp_dir)?;
        let db_path = temp_dir.join("embeddings_degraded.db");
        let cache_path = db_path.with_file_name("embedding_cache_degraded.db");

        let similarity = SimilaritySearch::new(db_path)?;
        let cache = EmbeddingCache::new(cache_path)?;

        let generator_arc = Arc::new(Mutex::new(generator));
        let similarity_arc = Arc::new(Mutex::new(similarity));

        let indexer =
            IncrementalIndexer::new(temp_dir, generator_arc.clone(), similarity_arc.clone());

        Ok(Self {
            generator: generator_arc,
            similarity: similarity_arc,
            cache: Arc::new(Mutex::new(cache)),
            indexer: Arc::new(Mutex::new(indexer)),
        })
    }

    pub async fn new(workspace_root: PathBuf, config: EmbeddingConfig) -> Result<Self> {
        let generator = EmbeddingGenerator::new(config).await?;
        let db_path = workspace_root.join(".agi").join("embeddings.db");
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let cache_path = db_path.with_file_name("embedding_cache.db");

        let similarity = SimilaritySearch::new(db_path)?;
        let cache = EmbeddingCache::new(cache_path)?;

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

    pub fn generator(&self) -> Arc<Mutex<EmbeddingGenerator>> {
        self.generator.clone()
    }

    pub fn similarity(&self) -> Arc<Mutex<SimilaritySearch>> {
        self.similarity.clone()
    }

    pub fn cache(&self) -> Arc<Mutex<EmbeddingCache>> {
        self.cache.clone()
    }

    pub fn indexer(&self) -> Arc<Mutex<IncrementalIndexer>> {
        self.indexer.clone()
    }
}

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
        let id = format!("{}:{}:{}", file_path, chunk_index, start_line);

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

#[tauri::command]
pub async fn generate_code_embeddings(
    file_path: String,
    content: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<usize, String> {
    let service = embedding_service.lock().await;

    let chunker = CodeChunker::new(ChunkStrategy::Semantic);
    let chunks = chunker
        .chunk_file(&file_path, &content)
        .map_err(|e| format!("Failed to chunk file: {}", e))?;

    let generator = service.generator();
    let generator_guard = generator.lock().await;

    let similarity = service.similarity();
    let mut similarity_guard = similarity.lock().await;

    let mut count = 0;
    for chunk in chunks {
        let embedding = generator_guard
            .generate(&chunk.content)
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

        let metadata_id = metadata.id.clone();

        similarity_guard
            .add_embedding(&metadata_id, embedding, metadata)
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

    let query_embedding = generator_guard
        .generate(&query)
        .await
        .map_err(|e| format!("Failed to generate query embedding: {}", e))?;

    drop(generator_guard);

    let similarity = service.similarity();
    let similarity_guard = similarity.lock().await;

    let results = similarity_guard
        .search(query_embedding, limit.unwrap_or(10))
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

    let total_embeddings = similarity_guard
        .count_embeddings()
        .map_err(|e| format!("Failed to get embedding count: {}", e))?;

    let cache = service.cache();
    let cache_guard = cache.lock().await;
    let cache_stats = cache_guard
        .get_stats()
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
    let indexer = {
        let service = embedding_service.lock().await;
        service.indexer()
    };
    let indexer_guard = indexer.lock().await;

    indexer_guard
        .index_workspace()
        .await
        .map_err(|e| format!("Failed to index workspace: {}", e))
}

#[tauri::command]
pub async fn index_file(
    file_path: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let indexer = {
        let service = embedding_service.lock().await;
        service.indexer()
    };
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(file_path);
    indexer_guard
        .index_file(&path)
        .await
        .map_err(|e| format!("Failed to index file: {}", e))
}

#[tauri::command]
pub async fn get_indexing_progress(
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<IndexingProgress, String> {
    let indexer = {
        let service = embedding_service.lock().await;
        service.indexer()
    };
    let indexer_guard = indexer.lock().await;

    Ok(indexer_guard.get_progress().await)
}

#[tauri::command]
pub async fn on_file_changed(
    file_path: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let indexer = {
        let service = embedding_service.lock().await;
        service.indexer()
    };
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(file_path);
    indexer_guard
        .on_file_changed(&path)
        .await
        .map_err(|e| format!("Failed to handle file change: {}", e))
}

#[tauri::command]
pub async fn on_file_deleted(
    file_path: String,
    embedding_service: tauri::State<'_, Arc<Mutex<EmbeddingService>>>,
) -> Result<(), String> {
    let indexer = {
        let service = embedding_service.lock().await;
        service.indexer()
    };
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(file_path);
    indexer_guard
        .on_file_deleted(&path)
        .await
        .map_err(|e| format!("Failed to handle file deletion: {}", e))
}
