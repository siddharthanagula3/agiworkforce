use std::fs::File;
use std::path::Path;

use roxmltree::Document as XmlDocument;
use zip::read::ZipArchive;

use super::ooxml::read_entry_to_string;
use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};
use crate::sys::error::{Error, Result};

// `roxmltree` resolves no external entity and rejects DOCTYPE declarations
// with SYSTEM or PUBLIC identifiers, so parsing a document cannot reach XXE.
const DC_NS: &str = "http://purl.org/dc/elements/1.1/";

const DCTERMS_NS: &str = "http://purl.org/dc/terms/";

const EXT_PROPS_NS: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

pub struct WordHandler;

impl Default for WordHandler {
    fn default() -> Self {
        Self::new()
    }
}

impl WordHandler {
    pub fn new() -> Self {
        Self
    }

    pub async fn read(&self, file_path: &str) -> Result<DocumentContent> {
        let text = self.extract_text(file_path).await?;
        let mut metadata = self.get_metadata(file_path).await?;

        if metadata.word_count.is_none() {
            metadata.word_count = Some(text.split_whitespace().count());
        }

        Ok(DocumentContent { text, metadata })
    }

    pub async fn extract_text(&self, file_path: &str) -> Result<String> {
        let path = Path::new(file_path);
        if !path.exists() {
            return Err(Error::Generic(format!("File not found: {}", file_path)));
        }

        let bytes = std::fs::read(path)
            .map_err(|e| Error::Generic(format!("Failed to open DOCX: {}", e)))?;

        super::ooxml::extract_docx_text(&bytes)
    }

    pub async fn get_metadata(&self, file_path: &str) -> Result<DocumentMetadata> {
        let path = Path::new(file_path);
        let file =
            File::open(path).map_err(|e| Error::Generic(format!("Failed to open DOCX: {}", e)))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| Error::Generic(format!("Invalid DOCX archive: {}", e)))?;

        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();
        let file_size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);

        let mut metadata = DocumentMetadata {
            file_path: file_path.to_string(),
            file_name,
            file_size,
            document_type: DocumentType::Word,
            title: None,
            author: None,
            created_at: None,
            modified_at: None,
            page_count: None,
            word_count: None,
            mime_type: Some(
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    .to_string(),
            ),
        };

        // Try to read Core Properties
        if let Ok(prop_entry) = archive.by_name("docProps/core.xml") {
            if let Ok(xml) = read_entry_to_string(prop_entry, "docProps/core.xml") {
                if let Ok(doc) = XmlDocument::parse(&xml) {
                    for node in doc.descendants() {
                        if node.has_tag_name((DC_NS, "title")) {
                            metadata.title = node.text().map(|s| s.to_string());
                        } else if node.has_tag_name((DC_NS, "creator")) {
                            metadata.author = node.text().map(|s| s.to_string());
                        } else if node.has_tag_name((DCTERMS_NS, "created")) {
                            metadata.created_at = node
                                .text()
                                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                                .map(|dt| dt.with_timezone(&chrono::Utc))
                                .map(|dt| dt.to_rfc3339());
                        } else if node.has_tag_name((DCTERMS_NS, "modified")) {
                            metadata.modified_at = node
                                .text()
                                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                                .map(|dt| dt.with_timezone(&chrono::Utc))
                                .map(|dt| dt.to_rfc3339());
                        }
                    }
                }
            }
        }

        // Try to read Extended Properties (for stats)
        if let Ok(app_entry) = archive.by_name("docProps/app.xml") {
            if let Ok(xml) = read_entry_to_string(app_entry, "docProps/app.xml") {
                if let Ok(doc) = XmlDocument::parse(&xml) {
                    for node in doc.descendants() {
                        if node.has_tag_name((EXT_PROPS_NS, "Pages")) {
                            metadata.page_count = node.text().and_then(|s| s.parse::<usize>().ok());
                        } else if node.has_tag_name((EXT_PROPS_NS, "Words")) {
                            metadata.word_count = node.text().and_then(|s| s.parse::<usize>().ok());
                        }
                    }
                }
            }
        }

        Ok(metadata)
    }

    pub async fn search(&self, file_path: &str, query: &str) -> Result<Vec<SearchResult>> {
        let text = self.extract_text(file_path).await?;
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for (line_num, line) in text.lines().enumerate() {
            let line_lower = line.to_lowercase();
            if line_lower.contains(&query_lower) {
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
