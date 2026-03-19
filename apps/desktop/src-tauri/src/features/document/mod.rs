use std::fs::File;
use std::io::Read;
use std::path::Path;

use crate::sys::error::{Error, Result};

pub mod excel;
pub mod pdf;
pub mod word;

/// DOC-010 fix: Maximum file size for document parsing (100 MB)
/// This prevents DoS attacks via maliciously large files
pub const MAX_DOCUMENT_SIZE: u64 = 100 * 1024 * 1024; // 100 MB

/// DOC-012 fix: Magic number signatures for file type validation
/// These are the first few bytes that identify file types
const PDF_MAGIC: &[u8] = b"%PDF-";
const ZIP_MAGIC: &[u8] = &[0x50, 0x4B, 0x03, 0x04]; // PK.. (DOCX, XLSX are ZIP-based)
const OLE_MAGIC: &[u8] = &[0xD0, 0xCF, 0x11, 0xE0]; // Legacy XLS (OLE compound document)

/// DOC-010 fix: Validate file size before parsing to prevent DoS attacks
pub fn validate_file_size(file_path: &Path) -> Result<u64> {
    let metadata = std::fs::metadata(file_path)
        .map_err(|e| Error::Generic(format!("Failed to read file metadata: {}", e)))?;

    let file_size = metadata.len();
    if file_size > MAX_DOCUMENT_SIZE {
        return Err(Error::Generic(format!(
            "File too large: {} bytes (max {} bytes). Please use a smaller file.",
            file_size, MAX_DOCUMENT_SIZE
        )));
    }

    Ok(file_size)
}

/// DOC-012 fix: Validate file magic number matches expected type
/// Prevents attacks using misnamed files (e.g., malware.exe renamed to report.pdf)
pub fn validate_magic_number(file_path: &Path, expected_type: &DocumentType) -> Result<()> {
    let mut file = File::open(file_path)
        .map_err(|e| Error::Generic(format!("Failed to open file for magic validation: {}", e)))?;

    // Read first 8 bytes (enough for all our magic numbers)
    let mut header = [0u8; 8];
    let bytes_read = file.read(&mut header).unwrap_or(0);

    if bytes_read < 4 {
        return Err(Error::Generic(
            "File too small to validate. The file may be corrupted or empty.".to_string(),
        ));
    }

    match expected_type {
        DocumentType::Pdf => {
            if !header.starts_with(PDF_MAGIC) {
                return Err(Error::Generic(
                    "File does not appear to be a valid PDF. \
                     The file header does not match PDF format."
                        .to_string(),
                ));
            }
        }
        DocumentType::Word => {
            // DOCX is a ZIP file (Office Open XML)
            if !header.starts_with(ZIP_MAGIC) {
                return Err(Error::Generic(
                    "File does not appear to be a valid Word document (.docx). \
                     The file may be corrupted or in legacy .doc format."
                        .to_string(),
                ));
            }
        }
        DocumentType::Excel => {
            // XLSX is ZIP-based, legacy XLS is OLE
            if !header.starts_with(ZIP_MAGIC) && !header.starts_with(OLE_MAGIC) {
                return Err(Error::Generic(
                    "File does not appear to be a valid Excel file. \
                     The file may be corrupted or in an unsupported format."
                        .to_string(),
                ));
            }
        }
    }

    Ok(())
}

pub mod create_excel;
pub mod create_pdf;
pub mod create_powerpoint;
pub mod create_word;

pub mod edit_excel;
pub mod edit_pdf;
pub mod edit_word;

pub use excel::ExcelHandler;
pub use pdf::PdfHandler;
pub use word::WordHandler;

pub use create_excel::{ExcelCell, ExcelDocumentConfig, ExcelDocumentCreator, ExcelSheet};
pub use create_pdf::{PdfContent, PdfDocumentConfig, PdfDocumentCreator};
pub use create_powerpoint::{PresentationConfig, PresentationCreator, PresentationSlide};
pub use create_word::{WordContent, WordDocumentConfig, WordDocumentCreator};

pub use edit_excel::{ExcelEdit, ExcelEditor};
pub use edit_pdf::{PdfEdit, PdfEditor};
pub use edit_word::{WordEdit, WordEditor};

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
    pub mime_type: Option<String>,
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
            "docx" => Ok(DocumentType::Word),
            "xlsx" | "xls" => Ok(DocumentType::Excel),
            "pdf" => Ok(DocumentType::Pdf),
            "doc" => Err(Error::Generic(
                "Legacy .doc files are not supported. Please convert the document to .docx and try again."
                    .to_string(),
            )),
            _ => Err(Error::Generic(format!("Unsupported file type: {}", extension))),
        }
    }

    pub async fn read_document(&self, file_path: &str) -> Result<DocumentContent> {
        let path = Path::new(file_path);

        // DOC-010 fix: Validate file size before parsing
        validate_file_size(path)?;

        let doc_type = Self::detect_type(file_path)?;

        // DOC-012 fix: Validate magic number matches expected type
        validate_magic_number(path, &doc_type)?;

        match doc_type {
            DocumentType::Word => self.word_handler.read(file_path).await,
            DocumentType::Excel => self.excel_handler.read(file_path).await,
            DocumentType::Pdf => self.pdf_handler.read(file_path).await,
        }
    }

    pub async fn extract_text(&self, file_path: &str) -> Result<String> {
        let path = Path::new(file_path);

        // DOC-010 fix: Validate file size before parsing
        validate_file_size(path)?;

        let doc_type = Self::detect_type(file_path)?;

        // DOC-012 fix: Validate magic number matches expected type
        validate_magic_number(path, &doc_type)?;

        match doc_type {
            DocumentType::Word => self.word_handler.extract_text(file_path).await,
            DocumentType::Excel => self.excel_handler.extract_text(file_path).await,
            DocumentType::Pdf => self.pdf_handler.extract_text(file_path).await,
        }
    }

    pub async fn get_metadata(&self, file_path: &str) -> Result<DocumentMetadata> {
        let path = Path::new(file_path);

        // DOC-010 fix: Validate file size before parsing
        validate_file_size(path)?;

        let doc_type = Self::detect_type(file_path)?;

        // DOC-012 fix: Validate magic number matches expected type
        validate_magic_number(path, &doc_type)?;

        match doc_type {
            DocumentType::Word => self.word_handler.get_metadata(file_path).await,
            DocumentType::Excel => self.excel_handler.get_metadata(file_path).await,
            DocumentType::Pdf => self.pdf_handler.get_metadata(file_path).await,
        }
    }

    pub async fn search(&self, file_path: &str, query: &str) -> Result<Vec<SearchResult>> {
        let path = Path::new(file_path);

        // DOC-010 fix: Validate file size before parsing
        validate_file_size(path)?;

        let doc_type = Self::detect_type(file_path)?;

        // DOC-012 fix: Validate magic number matches expected type
        validate_magic_number(path, &doc_type)?;

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_type_supports_common_formats() {
        assert!(matches!(
            DocumentManager::detect_type("report.pdf").unwrap(),
            DocumentType::Pdf
        ));
        assert!(matches!(
            DocumentManager::detect_type("sheet.xlsx").unwrap(),
            DocumentType::Excel
        ));
        assert!(matches!(
            DocumentManager::detect_type("notes.docx").unwrap(),
            DocumentType::Word
        ));
    }

    #[test]
    fn detect_type_rejects_legacy_doc() {
        let err = DocumentManager::detect_type("legacy.doc").unwrap_err();
        if let Error::Generic(message) = err {
            assert!(message.contains(".doc"));
        } else {
            panic!("Expected generic error for legacy doc, got: {:?}", err);
        }
    }

    #[test]
    fn detect_type_rejects_unknown_extension() {
        let err = DocumentManager::detect_type("archive.zip").unwrap_err();
        if let Error::Generic(message) = err {
            assert!(message.contains("Unsupported"));
        } else {
            panic!(
                "Expected generic error for unsupported extension, got: {:?}",
                err
            );
        }
    }
}
