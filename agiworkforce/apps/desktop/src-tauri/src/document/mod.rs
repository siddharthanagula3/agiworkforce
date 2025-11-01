use std::path::Path;

use crate::error::{Error, Result};

pub mod word;
pub mod excel;
pub mod pdf;

pub use word::WordHandler;
pub use excel::ExcelHandler;
pub use pdf::PdfHandler;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DocumentType {
    Word,
    Excel,
    Pdf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub document_type: DocumentType,
    pub created_at: Option<String>,
    pub modified_at: Option<String>,
    pub author: Option<String>,
    pub title: Option<String>,
    pub page_count: Option<usize>,
    pub word_count: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentContent {
    pub text: String,
    pub metadata: DocumentMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub page: Option<usize>,
    pub line: Option<usize>,
    pub context: String,
    pub match_text: String,
}

pub struct DocumentManager {
    word_handler: WordHandler,
    excel_handler: ExcelHandler,
    pdf_handler: PdfHandler,
}

impl DocumentManager {
    pub fn new() -> Self {
        Self {
            word_handler: WordHandler::new(),
            excel_handler: ExcelHandler::new(),
            pdf_handler: PdfHandler::new(),
        }
    }

    pub fn detect_type(file_path: &str) -> Result<DocumentType> {
        let path = Path::new(file_path);
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .ok_or_else(|| Error::Generic("No file extension found".to_string()))?
            .to_lowercase();

        match extension.as_str() {
            "docx" | "doc" => Ok(DocumentType::Word),
            "xlsx" | "xls" => Ok(DocumentType::Excel),
            "pdf" => Ok(DocumentType::Pdf),
            _ => Err(Error::Generic(format!(
                "Unsupported file type: {}",
                extension
            ))),
        }
    }

    pub async fn read_document(&self, file_path: &str) -> Result<DocumentContent> {
        let doc_type = Self::detect_type(file_path)?;

        match doc_type {
            DocumentType::Word => self.word_handler.read(file_path).await,
            DocumentType::Excel => self.excel_handler.read(file_path).await,
            DocumentType::Pdf => self.pdf_handler.read(file_path).await,
        }
    }

    pub async fn extract_text(&self, file_path: &str) -> Result<String> {
        let doc_type = Self::detect_type(file_path)?;

        match doc_type {
            DocumentType::Word => self.word_handler.extract_text(file_path).await,
            DocumentType::Excel => self.excel_handler.extract_text(file_path).await,
            DocumentType::Pdf => self.pdf_handler.extract_text(file_path).await,
        }
    }

    pub async fn get_metadata(&self, file_path: &str) -> Result<DocumentMetadata> {
        let doc_type = Self::detect_type(file_path)?;

        match doc_type {
            DocumentType::Word => self.word_handler.get_metadata(file_path).await,
            DocumentType::Excel => self.excel_handler.get_metadata(file_path).await,
            DocumentType::Pdf => self.pdf_handler.get_metadata(file_path).await,
        }
    }

    pub async fn search(&self, file_path: &str, query: &str) -> Result<Vec<SearchResult>> {
        let doc_type = Self::detect_type(file_path)?;

        match doc_type {
            DocumentType::Word => self.word_handler.search(file_path, query).await,
            DocumentType::Excel => self.excel_handler.search(file_path, query).await,
            DocumentType::Pdf => self.pdf_handler.search(file_path, query).await,
        }
    }
}

impl Default for DocumentManager {
    fn default() -> Self {
        Self::new()
    }
}
