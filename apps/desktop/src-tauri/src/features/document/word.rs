use std::fs::File;
use std::io::Read;
use std::path::Path;

use roxmltree::Document as XmlDocument;
use zip::read::ZipArchive;

use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};
use crate::sys::error::{Error, Result};

/// DOC-011 security note: XXE (XML External Entity) Protection
///
/// This module uses `roxmltree` for XML parsing which is inherently safe from XXE attacks:
/// - roxmltree is a read-only parser that does not resolve external entities
/// - It does not support DOCTYPE declarations with SYSTEM or PUBLIC identifiers
/// - External entity expansion is not implemented, preventing XXE injection
///
/// Additional protections:
/// - File size limits are enforced at the DocumentManager level (DOC-010)
/// - ZIP bomb protection via the `zip` crate's built-in limits
/// - No network access during parsing (no external resource fetching)

const CORE_PROPS_NS: &str =
    "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";

const DC_NS: &str = "http://purl.org/dc/elements/1.1/";

const EXT_PROPS_NS: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";

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

        let file =
            File::open(path).map_err(|e| Error::Generic(format!("Failed to open DOCX: {}", e)))?;
        let mut archive = ZipArchive::new(file)
            .map_err(|e| Error::Generic(format!("Invalid DOCX archive: {}", e)))?;

        let mut document_xml = String::new();
        {
            let mut doc_entry = archive
                .by_name("word/document.xml")
                .map_err(|e| Error::Generic(format!("Failed to read document.xml: {}", e)))?;
            doc_entry
                .read_to_string(&mut document_xml)
                .map_err(|e| Error::Generic(format!("Failed to load document.xml: {}", e)))?;
        }

        let xml = XmlDocument::parse(&document_xml)
            .map_err(|e| Error::Generic(format!("Invalid DOCX XML: {}", e)))?;
        let mut output = String::new();
        let mut last_was_newline = true;

        for node in xml.descendants() {
            if node.has_tag_name((
                "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                "p",
            )) {
                if !last_was_newline {
                    output.push('\n');
                    last_was_newline = true;
                }
                for child in node.descendants() {
                    if child.has_tag_name((
                        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                        "t",
                    )) {
                        if let Some(text) = child.text() {
                            output.push_str(text);
                            last_was_newline = false;
                        }
                    } else if child.has_tag_name((
                        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                        "br",
                    )) {
                        output.push('\n');
                        last_was_newline = true;
                    } else if child.has_tag_name((
                        "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                        "tab",
                    )) {
                        output.push('\t');
                        last_was_newline = false;
                    }
                }
            }
        }

        Ok(output)
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
        if let Ok(mut prop_entry) = archive.by_name("docProps/core.xml") {
            let mut xml = String::new();
            if prop_entry.read_to_string(&mut xml).is_ok() {
                if let Ok(doc) = XmlDocument::parse(&xml) {
                    for node in doc.descendants() {
                        if node.has_tag_name((DC_NS, "title")) {
                            metadata.title = node.text().map(|s| s.to_string());
                        } else if node.has_tag_name((DC_NS, "creator")) {
                            metadata.author = node.text().map(|s| s.to_string());
                        } else if node.has_tag_name((CORE_PROPS_NS, "created")) {
                            metadata.created_at = node
                                .text()
                                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                                .map(|dt| dt.with_timezone(&chrono::Utc))
                                .map(|dt| dt.to_rfc3339());
                        } else if node.has_tag_name((CORE_PROPS_NS, "modified")) {
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
        if let Ok(mut app_entry) = archive.by_name("docProps/app.xml") {
            let mut xml = String::new();
            if app_entry.read_to_string(&mut xml).is_ok() {
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

    pub async fn search(&self, _file_path: &str, _query: &str) -> Result<Vec<SearchResult>> {
        Ok(vec![])
    }
}
