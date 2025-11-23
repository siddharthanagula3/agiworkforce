/**
 * Incremental Indexer
 * Background indexing service that watches for file changes
 */
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use walkdir::WalkDir;

use super::{ChunkStrategy, CodeChunker, EmbeddingGenerator, EmbeddingMetadata, SimilaritySearch};

/// Indexing progress
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexingProgress {
    pub total_files: usize,
    pub indexed_files: usize,
    pub current_file: Option<String>,
    pub is_complete: bool,
}

/// Incremental indexer
pub struct IncrementalIndexer {
    workspace_root: PathBuf,
    generator: Arc<Mutex<EmbeddingGenerator>>,
    similarity: Arc<Mutex<SimilaritySearch>>,
    chunker: CodeChunker,
    indexed_files: Arc<Mutex<HashSet<String>>>,
    progress: Arc<Mutex<IndexingProgress>>,
}

impl IncrementalIndexer {
    /// Create a new incremental indexer
    pub fn new(
        workspace_root: PathBuf,
        generator: Arc<Mutex<EmbeddingGenerator>>,
        similarity: Arc<Mutex<SimilaritySearch>>,
    ) -> Self {
        Self {
            workspace_root,
            generator,
            similarity,
            chunker: CodeChunker::new(ChunkStrategy::Hybrid { max_size: 100 }),
            indexed_files: Arc::new(Mutex::new(HashSet::new())),
            progress: Arc::new(Mutex::new(IndexingProgress {
                total_files: 0,
                indexed_files: 0,
                current_file: None,
                is_complete: false,
            })),
        }
    }

    /// Start background indexing of the entire workspace
    pub async fn index_workspace(&self) -> Result<()> {
        let files = self.discover_files().await?;

        {
            let mut progress = self.progress.lock().await;
            progress.total_files = files.len();
            progress.indexed_files = 0;
            progress.is_complete = false;
        }

        for file_path in files {
            self.index_file(&file_path).await?;

            {
                let mut progress = self.progress.lock().await;
                progress.indexed_files += 1;
                progress.current_file = Some(file_path.to_string_lossy().to_string());
            }
        }

        {
            let mut progress = self.progress.lock().await;
            progress.is_complete = true;
            progress.current_file = None;
        }

        Ok(())
    }

    /// Index a single file
    pub async fn index_file(&self, file_path: &Path) -> Result<()> {
        let file_path_str = file_path.to_string_lossy().to_string();

        tracing::info!("Indexing file: {}", file_path_str);

        // Read file content
        let content = tokio::fs::read_to_string(file_path)
            .await
            .context("Failed to read file")?;

        // Chunk the file
        let chunks = self.chunker.chunk_file(&file_path_str, &content)?;

        let generator = self.generator.lock().await;
        let mut similarity = self.similarity.lock().await;

        // Delete existing embeddings for this file
        similarity.delete_file_embeddings(&file_path_str)?;

        // Generate and store embeddings for each chunk
        for chunk in chunks {
            let embedding = generator.generate(&chunk.content).await?;

            let metadata = EmbeddingMetadata::new(
                chunk.file_path.clone(),
                chunk.index,
                chunk.content,
                chunk.language,
                chunk.start_line,
                chunk.end_line,
            );

            let metadata_id = metadata.id.clone();
            similarity.add_embedding(&metadata_id, embedding, metadata)?;
        }

        // Mark file as indexed
        {
            let mut indexed = self.indexed_files.lock().await;
            indexed.insert(file_path_str);
        }

        Ok(())
    }

    /// Handle file change event
    pub async fn on_file_changed(&self, file_path: &Path) -> Result<()> {
        if !self.should_index_file(file_path) {
            return Ok(());
        }

        tracing::info!("File changed, re-indexing: {}", file_path.display());
        self.index_file(file_path).await
    }

    /// Handle file deletion event
    pub async fn on_file_deleted(&self, file_path: &Path) -> Result<()> {
        let file_path_str = file_path.to_string_lossy().to_string();

        tracing::info!("File deleted, removing embeddings: {}", file_path_str);

        let mut similarity = self.similarity.lock().await;
        similarity.delete_file_embeddings(&file_path_str)?;

        let mut indexed = self.indexed_files.lock().await;
        indexed.remove(&file_path_str);

        Ok(())
    }

    /// Discover all indexable files in workspace
    async fn discover_files(&self) -> Result<Vec<PathBuf>> {
        let mut files = Vec::new();

        for entry in WalkDir::new(&self.workspace_root)
            .follow_links(false)
            .into_iter()
            .filter_entry(|e| !self.should_ignore(e.path()))
        {
            let entry = entry?;
            let path = entry.path();

            if path.is_file() && self.should_index_file(path) {
                files.push(path.to_path_buf());
            }
        }

        Ok(files)
    }

    /// Check if file should be indexed
    fn should_index_file(&self, path: &Path) -> bool {
        let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        matches!(
            extension,
            "ts" | "tsx"
                | "js"
                | "jsx"
                | "rs"
                | "py"
                | "go"
                | "java"
                | "cpp"
                | "c"
                | "cs"
                | "rb"
                | "php"
                | "swift"
                | "kt"
        )
    }

    /// Check if path should be ignored
    fn should_ignore(&self, path: &Path) -> bool {
        let path_str = path.to_string_lossy();

        // Ignore common directories
        let ignore_patterns = [
            "node_modules",
            ".git",
            "target",
            "dist",
            "build",
            ".next",
            ".vscode",
            ".idea",
            "__pycache__",
            ".pytest_cache",
            "coverage",
            ".turbo",
            ".agi",
        ];

        for pattern in &ignore_patterns {
            if path_str.contains(pattern) {
                return true;
            }
        }

        false
    }

    /// Get indexing progress
    pub async fn get_progress(&self) -> IndexingProgress {
        self.progress.lock().await.clone()
    }

    /// Check if file is indexed
    pub async fn is_indexed(&self, file_path: &str) -> bool {
        let indexed = self.indexed_files.lock().await;
        indexed.contains(file_path)
    }

    /// Get total indexed files count
    pub async fn indexed_count(&self) -> usize {
        let indexed = self.indexed_files.lock().await;
        indexed.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_should_index_file() {
        let indexer = IncrementalIndexer::new(
            PathBuf::from("."),
            Arc::new(Mutex::new(
                EmbeddingGenerator::new(Default::default()).await.unwrap(),
            )),
            Arc::new(Mutex::new(
                SimilaritySearch::new(PathBuf::from("test.db")).unwrap(),
            )),
        );

        assert!(indexer.should_index_file(Path::new("test.ts")));
        assert!(indexer.should_index_file(Path::new("main.rs")));
        assert!(!indexer.should_index_file(Path::new("README.md")));
        assert!(!indexer.should_index_file(Path::new("test.json")));
    }

    #[tokio::test]
    async fn test_should_ignore() {
        let indexer = IncrementalIndexer::new(
            PathBuf::from("."),
            Arc::new(Mutex::new(
                EmbeddingGenerator::new(Default::default()).await.unwrap(),
            )),
            Arc::new(Mutex::new(
                SimilaritySearch::new(PathBuf::from("test.db")).unwrap(),
            )),
        );

        assert!(indexer.should_ignore(Path::new("node_modules/test.ts")));
        assert!(indexer.should_ignore(Path::new(".git/config")));
        assert!(indexer.should_ignore(Path::new("target/debug/main")));
        assert!(!indexer.should_ignore(Path::new("src/main.rs")));
    }
}
