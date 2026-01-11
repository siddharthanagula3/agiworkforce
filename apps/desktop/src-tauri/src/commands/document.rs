use std::sync::Arc;
use tauri::{command, State};

use crate::document::{
    DocumentContent,
    DocumentManager,
    DocumentMetadata,
    // Creation types
    ExcelDocumentConfig,
    ExcelDocumentCreator,
    ExcelSheet,
    PdfContent,
    PdfDocumentConfig,
    PdfDocumentCreator,
    SearchResult,
    WordContent,
    WordDocumentConfig,
    WordDocumentCreator,
};
use crate::error::Result;

pub struct DocumentState {
    pub manager: Arc<DocumentManager>,
}

impl Default for DocumentState {
    fn default() -> Self {
        Self::new()
    }
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

// ====================
// Document Creation Commands
// ====================

/// Create a Word document (DOCX)
#[command]
pub async fn document_create_word(
    output_path: String,
    config: WordDocumentConfig,
    contents: Vec<WordContent>,
) -> Result<String> {
    let creator = WordDocumentCreator::new();
    creator.create(&output_path, config, contents)?;
    Ok(output_path)
}

/// Create a simple Word document with paragraphs
#[command]
pub async fn document_create_word_simple(
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    paragraphs: Vec<String>,
) -> Result<String> {
    let creator = WordDocumentCreator::new();
    creator.create_simple(&output_path, title, author, paragraphs)?;
    Ok(output_path)
}

/// Create an Excel spreadsheet (XLSX)
#[command]
pub async fn document_create_excel(
    output_path: String,
    config: ExcelDocumentConfig,
    sheets: Vec<ExcelSheet>,
) -> Result<String> {
    let creator = ExcelDocumentCreator::new();
    creator.create(&output_path, config, sheets)?;
    Ok(output_path)
}

/// Create a simple Excel spreadsheet with one sheet
#[command]
pub async fn document_create_excel_simple(
    output_path: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<String>>,
) -> Result<String> {
    let creator = ExcelDocumentCreator::new();
    creator.create_simple(&output_path, &sheet_name, headers, rows)?;
    Ok(output_path)
}

/// Create an Excel spreadsheet with numeric data
#[command]
pub async fn document_create_excel_numbers(
    output_path: String,
    sheet_name: String,
    headers: Vec<String>,
    rows: Vec<Vec<f64>>,
) -> Result<String> {
    let creator = ExcelDocumentCreator::new();
    creator.create_with_numbers(&output_path, &sheet_name, headers, rows)?;
    Ok(output_path)
}

/// Create a PDF document
#[command]
pub async fn document_create_pdf(
    output_path: String,
    config: PdfDocumentConfig,
    contents: Vec<PdfContent>,
) -> Result<String> {
    let creator = PdfDocumentCreator::new();
    creator.create(&output_path, config, contents)?;
    Ok(output_path)
}

/// Create a simple PDF with paragraphs
#[command]
pub async fn document_create_pdf_simple(
    output_path: String,
    title: Option<String>,
    author: Option<String>,
    paragraphs: Vec<String>,
) -> Result<String> {
    let creator = PdfDocumentCreator::new();
    creator.create_simple(&output_path, title, author, paragraphs)?;
    Ok(output_path)
}
