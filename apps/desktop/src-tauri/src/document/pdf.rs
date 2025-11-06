use std::fs;
use std::path::Path;

use lopdf::{Dictionary, Document as LopdfDocument, Object};
use pdf_extract;

use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};
use crate::error::{Error, Result};

pub struct PdfHandler;

impl PdfHandler {
    pub fn new() -> Self {
        Self
    }

    pub async fn read(&self, file_path: &str) -> Result<DocumentContent> {
        let text = self.extract_text(file_path).await?;
        let mut metadata = self.get_metadata(file_path).await?;
        metadata.word_count = Some(text.split_whitespace().count());

        Ok(DocumentContent { text, metadata })
    }

    pub async fn extract_text(&self, file_path: &str) -> Result<String> {
        let path = Path::new(file_path);

        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        pdf_extract::extract_text(path)
            .map_err(|e| Error::Generic(format!("Failed to extract PDF text: {}", e)))
    }

    pub async fn get_metadata(&self, file_path: &str) -> Result<DocumentMetadata> {
        let path = Path::new(file_path);

        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        let file_metadata = fs::metadata(path)
            .map_err(|e| Error::Generic(format!("Failed to read file metadata: {}", e)))?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let mut title = Some(file_name.clone());
        let mut author = None;
        let mut page_count = None;

        if let Ok(pdf) = LopdfDocument::load(path) {
            page_count = Some(pdf.get_pages().len());

            if let Ok(info_obj) = pdf.trailer.get(b"Info") {
                if let Some(dict) = resolve_info_dict(&pdf, info_obj) {
                    if let Ok(obj) = dict.get(b"Title") {
                        if let Some(decoded) = decode_pdf_string(obj) {
                            let trimmed = decoded.trim();
                            if !trimmed.is_empty() {
                                title = Some(trimmed.to_string());
                            }
                        }
                    }

                    if let Ok(obj) = dict.get(b"Author") {
                        if let Some(decoded) = decode_pdf_string(obj) {
                            let trimmed = decoded.trim();
                            if !trimmed.is_empty() {
                                author = Some(trimmed.to_string());
                            }
                        }
                    }
                }
            }
        }

        Ok(DocumentMetadata {
            file_path: file_path.to_string(),
            file_name,
            file_size: file_metadata.len(),
            document_type: DocumentType::Pdf,
            created_at: file_metadata.created().ok().and_then(timestamp_to_string),
            modified_at: file_metadata.modified().ok().and_then(timestamp_to_string),
            author,
            title,
            page_count,
            word_count: None,
        })
    }

    pub async fn search(&self, file_path: &str, query: &str) -> Result<Vec<SearchResult>> {
        let text = self.extract_text(file_path).await?;
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        for (line_num, line) in text.lines().enumerate() {
            if line.to_lowercase().contains(&query_lower) {
                results.push(SearchResult {
                    page: None,
                    line: Some(line_num + 1),
                    context: line.to_string(),
                    match_text: query.to_string(),
                });
            }
        }

        Ok(results)
    }
}

impl Default for PdfHandler {
    fn default() -> Self {
        Self::new()
    }
}

fn timestamp_to_string(time: std::time::SystemTime) -> Option<String> {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs().to_string())
}

fn decode_pdf_string(object: &Object) -> Option<String> {
    match object {
        Object::String(bytes, _) => Some(LopdfDocument::decode_text(None, bytes)),
        Object::Name(name) => String::from_utf8(name.clone()).ok(),
        _ => None,
    }
}

fn resolve_info_dict<'a>(
    document: &'a LopdfDocument,
    object: &'a Object,
) -> Option<&'a Dictionary> {
    match object {
        Object::Dictionary(dict) => Some(dict),
        Object::Reference(object_id) => document
            .get_object(*object_id)
            .ok()
            .and_then(|obj| obj.as_dict().ok()),
        _ => None,
    }
}
