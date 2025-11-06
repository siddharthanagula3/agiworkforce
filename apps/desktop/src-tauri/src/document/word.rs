use std::fs::{self, File};
use std::io::Read;
use std::path::Path;

use roxmltree::Document as XmlDocument;
use zip::read::ZipArchive;

use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};
use crate::error::{Error, Result};

const CORE_PROPS_NS: &str =
    "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
const DC_NS: &str = "http://purl.org/dc/elements/1.1/";
const EXT_PROPS_NS: &str =
    "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

pub struct WordHandler;

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
                "t",
            )) {
                if let Some(text) = node.text() {
                    if !last_was_newline && !output.ends_with([' ', '\n']) {
                        output.push(' ');
                    }
                    output.push_str(text.trim_end_matches('\u{a0}'));
                    last_was_newline = false;
                }
            } else if node.has_tag_name((
                "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                "p",
            )) || node.has_tag_name((
                "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                "br",
            )) {
                if !output.ends_with('\n') {
                    output.push('\n');
                }
                last_was_newline = true;
            }
        }

        Ok(output.trim().to_string())
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

        let mut archive = ZipArchive::new(
            File::open(path).map_err(|e| Error::Generic(format!("Failed to open DOCX: {}", e)))?,
        )
        .map_err(|e| Error::Generic(format!("Invalid DOCX archive: {}", e)))?;

        let mut title = Some(file_name.clone());
        let mut author = None;
        let mut page_count = None;
        let mut recorded_word_count = None;

        let mut core_props_xml = String::new();
        if let Ok(mut entry) = archive.by_name("docProps/core.xml") {
            let _ = entry.read_to_string(&mut core_props_xml);
        }

        if !core_props_xml.is_empty() {
            if let Ok(doc) = XmlDocument::parse(&core_props_xml) {
                if let Some(node) = doc.descendants().find(|n| {
                    n.has_tag_name((DC_NS, "title")) || n.has_tag_name((CORE_PROPS_NS, "title"))
                }) {
                    if let Some(value) = node.text() {
                        let value = value.trim();
                        if !value.is_empty() {
                            title = Some(value.to_string());
                        }
                    }
                }

                if let Some(node) = doc.descendants().find(|n| {
                    n.has_tag_name((DC_NS, "creator")) || n.has_tag_name((CORE_PROPS_NS, "creator"))
                }) {
                    if let Some(value) = node.text() {
                        let value = value.trim();
                        if !value.is_empty() {
                            author = Some(value.to_string());
                        }
                    }
                }
            }
        }

        let mut app_props_xml = String::new();
        if let Ok(mut entry) = archive.by_name("docProps/app.xml") {
            let _ = entry.read_to_string(&mut app_props_xml);
        }

        if !app_props_xml.is_empty() {
            if let Ok(doc) = XmlDocument::parse(&app_props_xml) {
                if let Some(node) = doc
                    .descendants()
                    .find(|n| n.has_tag_name((EXT_PROPS_NS, "Pages")))
                {
                    if let Some(value) = node.text().and_then(|v| v.trim().parse::<usize>().ok()) {
                        page_count = Some(value);
                    }
                }

                if let Some(node) = doc
                    .descendants()
                    .find(|n| n.has_tag_name((EXT_PROPS_NS, "Words")))
                {
                    if let Some(value) = node.text().and_then(|v| v.trim().parse::<usize>().ok()) {
                        recorded_word_count = Some(value);
                    }
                }
            }
        }

        Ok(DocumentMetadata {
            file_path: file_path.to_string(),
            file_name,
            file_size: file_metadata.len(),
            document_type: DocumentType::Word,
            created_at: file_metadata.created().ok().and_then(timestamp_to_string),
            modified_at: file_metadata.modified().ok().and_then(timestamp_to_string),
            author,
            title,
            page_count,
            word_count: recorded_word_count,
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

impl Default for WordHandler {
    fn default() -> Self {
        Self::new()
    }
}

fn timestamp_to_string(time: std::time::SystemTime) -> Option<String> {
    time.duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs().to_string())
}
