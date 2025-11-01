use std::fs;
use std::path::Path;

use crate::error::{Error, Result};
use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};

pub struct ExcelHandler;

impl ExcelHandler {
    pub fn new() -> Self {
        Self
    }

    pub async fn read(&self, file_path: &str) -> Result<DocumentContent> {
        let text = self.extract_text(file_path).await?;
        let metadata = self.get_metadata(file_path).await?;

        Ok(DocumentContent { text, metadata })
    }

    pub async fn extract_text(&self, file_path: &str) -> Result<String> {
        let path = Path::new(file_path);

        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        // Simple text extraction - in production use calamine crate
        let text = format!(
            "Excel spreadsheet data from: {}\n\n[Spreadsheet parsing requires calamine crate - placeholder for MVP]",
            file_path
        );

        Ok(text)
    }

    pub async fn get_metadata(&self, file_path: &str) -> Result<DocumentMetadata> {
        let path = Path::new(file_path);

        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        let file_metadata = fs::metadata(path).map_err(|e| {
            Error::Generic(format!("Failed to read file metadata: {}", e))
        })?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let title = file_name.clone();

        Ok(DocumentMetadata {
            file_path: file_path.to_string(),
            file_name,
            file_size: file_metadata.len(),
            document_type: DocumentType::Excel,
            created_at: file_metadata
                .created()
                .ok()
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_secs().to_string())
                }),
            modified_at: file_metadata
                .modified()
                .ok()
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_secs().to_string())
                }),
            author: None,
            title: Some(title),
            page_count: None,
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

impl Default for ExcelHandler {
    fn default() -> Self {
        Self::new()
    }
}
