use tauri::{command, State};
use std::sync::Arc;

use crate::document::{DocumentContent, DocumentManager, DocumentMetadata, SearchResult};
use crate::error::Result;

pub struct DocumentState {
    pub manager: Arc<DocumentManager>,
}

impl DocumentState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(DocumentManager::new()),
        }
    }
}

/// Read a document and extract its content
#[command]
pub async fn document_read(
    file_path: String,
    state: State<'_, DocumentState>,
) -> Result<DocumentContent> {
    state.manager.read_document(&file_path).await
}

/// Extract plain text from a document
#[command]
pub async fn document_extract_text(
    file_path: String,
    state: State<'_, DocumentState>,
) -> Result<String> {
    state.manager.extract_text(&file_path).await
}

/// Get metadata from a document
#[command]
pub async fn document_get_metadata(
    file_path: String,
    state: State<'_, DocumentState>,
) -> Result<DocumentMetadata> {
    state.manager.get_metadata(&file_path).await
}

/// Search for text within a document
#[command]
pub async fn document_search(
    file_path: String,
    query: String,
    state: State<'_, DocumentState>,
) -> Result<Vec<SearchResult>> {
    state.manager.search(&file_path, &query).await
}

/// Detect document type from file extension
#[command]
pub async fn document_detect_type(file_path: String) -> Result<String> {
    let doc_type = DocumentManager::detect_type(&file_path)?;
    Ok(format!("{:?}", doc_type))
}
