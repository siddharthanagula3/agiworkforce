pub mod indexer;

pub use indexer::{CodebaseIndexer, IndexStats, Symbol, SymbolKind};

use std::path::PathBuf;
use std::sync::Arc;

/// Wrapper around `CodebaseIndexer` for Tauri managed state.
///
/// Uses `Option<CodebaseIndexer>` so we can provide a degraded state
/// when initialization fails, matching the codebase pattern for graceful fallback.
pub struct CodebaseServiceState {
    indexer: Option<Arc<CodebaseIndexer>>,
}

impl CodebaseServiceState {
    /// Initialize the service with a workspace root.
    /// The underlying `CodebaseIndexer` opens a tokio-rusqlite connection.
    pub async fn new(workspace_root: PathBuf) -> Result<Self, String> {
        let indexer = CodebaseIndexer::new(workspace_root).await?;
        Ok(Self {
            indexer: Some(Arc::new(indexer)),
        })
    }

    /// Create a degraded state that returns clear errors to the frontend
    /// instead of panicking on state retrieval.
    pub fn new_degraded() -> Self {
        Self { indexer: None }
    }

    fn get_indexer(&self) -> Result<&Arc<CodebaseIndexer>, String> {
        self.indexer.as_ref().ok_or_else(|| {
            "Codebase indexer is not available. It may have failed to initialize.".to_string()
        })
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn index_workspace_file(
    file_path: String,
    state: tauri::State<'_, CodebaseServiceState>,
) -> Result<Vec<Symbol>, String> {
    let indexer = state.get_indexer()?;
    let path = PathBuf::from(&file_path);
    indexer.index_file(&path).await
}

#[tauri::command]
pub async fn search_symbols(
    query: String,
    limit: Option<usize>,
    state: tauri::State<'_, CodebaseServiceState>,
) -> Result<Vec<Symbol>, String> {
    let indexer = state.get_indexer()?;
    indexer.search_symbols(&query, limit.unwrap_or(50)).await
}

#[tauri::command]
pub async fn get_file_symbols(
    file_path: String,
    state: tauri::State<'_, CodebaseServiceState>,
) -> Result<Vec<Symbol>, String> {
    let indexer = state.get_indexer()?;
    indexer.get_file_symbols(&file_path).await
}

#[tauri::command]
pub async fn get_index_stats(
    state: tauri::State<'_, CodebaseServiceState>,
) -> Result<IndexStats, String> {
    let indexer = state.get_indexer()?;
    indexer.get_stats().await
}
