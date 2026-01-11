/**
 * Codebase Analysis Module
 * Workspace indexing, semantic search, and symbol resolution
 */
pub mod indexer;

pub use indexer::{CodebaseIndexer, IndexStats, Symbol, SymbolKind};

use anyhow::Result;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Codebase service state
pub struct CodebaseService {
    indexer: Arc<Mutex<CodebaseIndexer>>,
}

impl CodebaseService {
    pub fn new(workspace_root: PathBuf) -> Result<Self> {
        let indexer = CodebaseIndexer::new(workspace_root)?;
        Ok(Self {
            indexer: Arc::new(Mutex::new(indexer)),
        })
    }

    pub fn indexer(&self) -> Arc<Mutex<CodebaseIndexer>> {
        self.indexer.clone()
    }
}

/// Tauri commands for codebase operations
#[tauri::command]
pub async fn index_workspace_file(
    file_path: String,
    codebase_service: tauri::State<'_, Arc<Mutex<CodebaseService>>>,
) -> Result<Vec<Symbol>, String> {
    let service = codebase_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    let path = PathBuf::from(&file_path);
    indexer_guard
        .index_file(&path)
        .await
        .map_err(|e| format!("Failed to index file: {}", e))
}

#[tauri::command]
pub async fn search_symbols(
    query: String,
    limit: Option<usize>,
    codebase_service: tauri::State<'_, Arc<Mutex<CodebaseService>>>,
) -> Result<Vec<Symbol>, String> {
    let service = codebase_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    indexer_guard
        .search_symbols(&query, limit.unwrap_or(50))
        .map_err(|e| format!("Failed to search symbols: {}", e))
}

#[tauri::command]
pub async fn get_file_symbols(
    file_path: String,
    codebase_service: tauri::State<'_, Arc<Mutex<CodebaseService>>>,
) -> Result<Vec<Symbol>, String> {
    let service = codebase_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    indexer_guard
        .get_file_symbols(&file_path)
        .map_err(|e| format!("Failed to get file symbols: {}", e))
}

#[tauri::command]
pub async fn get_index_stats(
    codebase_service: tauri::State<'_, Arc<Mutex<CodebaseService>>>,
) -> Result<IndexStats, String> {
    let service = codebase_service.lock().await;
    let indexer = service.indexer();
    let indexer_guard = indexer.lock().await;

    indexer_guard
        .get_stats()
        .map_err(|e| format!("Failed to get stats: {}", e))
}
