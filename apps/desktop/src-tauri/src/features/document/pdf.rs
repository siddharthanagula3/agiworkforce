use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use lopdf::{Dictionary, Document as LopdfDocument, Object};
use pdf_extract;

use super::{DocumentContent, DocumentMetadata, DocumentType, SearchResult};
use crate::sys::error::{Error, Result};

/// DOC-014 fix: Cache duration for parsed PDF metadata (5 minutes)
const CACHE_DURATION: Duration = Duration::from_secs(300);

/// DOC-014 fix: Maximum number of cached entries to prevent unbounded memory growth
const MAX_CACHE_ENTRIES: usize = 100;

/// DOC-014 fix: Cached PDF metadata with timestamp for expiration
struct CachedMetadata {
    metadata: DocumentMetadata,
    cached_at: Instant,
}

impl CachedMetadata {
    fn is_expired(&self) -> bool {
        self.cached_at.elapsed() > CACHE_DURATION
    }
}

pub struct PdfHandler {
    /// DOC-014 fix: Cache for parsed document metadata to avoid re-parsing
    cache: RwLock<HashMap<String, CachedMetadata>>,
}

impl PdfHandler {
    pub fn new() -> Self {
        Self {
            cache: RwLock::new(HashMap::new()),
        }
    }

    /// DOC-014 fix: Invalidate all expired cache entries
    fn cleanup_expired_entries(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.retain(|_, entry| !entry.is_expired());
        }
    }

    /// DOC-014 fix: Evict oldest entries if cache is full (LRU-like based on cache time)
    fn evict_if_needed(&self) {
        if let Ok(mut cache) = self.cache.write() {
            if cache.len() >= MAX_CACHE_ENTRIES {
                // Find the oldest entry
                if let Some(oldest_key) = cache
                    .iter()
                    .min_by_key(|(_, entry)| entry.cached_at)
                    .map(|(key, _)| key.clone())
                {
                    cache.remove(&oldest_key);
                }
            }
        }
    }

    pub async fn read(&self, file_path: &str) -> Result<DocumentContent> {
        let text = self.extract_text(file_path).await?;

        // DOC-014 fix: Use cached metadata if available
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

        // DOC-014 fix: Check file modification time for cache invalidation
        let file_metadata = fs::metadata(path)
            .map_err(|e| Error::Generic(format!("Failed to read file metadata: {}", e)))?;

        let modified_time = file_metadata.modified().ok();

        // DOC-014 fix: Try to get from cache first
        if let Ok(cache) = self.cache.read() {
            if let Some(cached) = cache.get(file_path) {
                if !cached.is_expired() {
                    // Check if file was modified since caching
                    let cached_modified = cached
                        .metadata
                        .modified_at
                        .as_ref()
                        .and_then(|s| s.parse::<u64>().ok());
                    let current_modified = modified_time
                        .as_ref()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs());

                    if cached_modified == current_modified {
                        tracing::debug!("DOC-014: Using cached metadata for {}", file_path);
                        return Ok(cached.metadata.clone());
                    }
                }
            }
        }

        // DOC-014 fix: Parse and cache the metadata
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

        let metadata = DocumentMetadata {
            file_path: file_path.to_string(),
            file_name,
            file_size: file_metadata.len(),
            document_type: DocumentType::Pdf,
            created_at: file_metadata.created().ok().and_then(timestamp_to_string),
            modified_at: modified_time.and_then(timestamp_to_string),
            author,
            title,
            page_count,
            word_count: None,
            mime_type: Some("application/pdf".to_string()),
        };

        // DOC-014 fix: Store in cache
        self.cleanup_expired_entries();
        self.evict_if_needed();

        if let Ok(mut cache) = self.cache.write() {
            cache.insert(
                file_path.to_string(),
                CachedMetadata {
                    metadata: metadata.clone(),
                    cached_at: Instant::now(),
                },
            );
            tracing::debug!(
                "DOC-014: Cached metadata for {} (cache size: {})",
                file_path,
                cache.len()
            );
        }

        Ok(metadata)
    }

    pub async fn search(&self, file_path: &str, query: &str) -> Result<Vec<SearchResult>> {
        let text = self.extract_text(file_path).await?;
        let mut results = Vec::new();
        let query_lower = query.to_lowercase();

        // DOC-013 fix: Pre-lowercase the entire content once for O(n) instead of O(n*m)
        // where n is content length and m is number of lines
        let text_lower = text.to_lowercase();
        let lines: Vec<&str> = text.lines().collect();
        let lines_lower: Vec<&str> = text_lower.lines().collect();

        for (line_num, (line, line_lower)) in lines.iter().zip(lines_lower.iter()).enumerate() {
            if line_lower.contains(&query_lower) {
                results.push(SearchResult {
                    page: None,
                    line: Some(line_num + 1),
                    context: line.to_string(), // Return original case for display
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

impl PdfHandler {
    /// DOC-014 fix: Clear the metadata cache (useful for testing or manual refresh)
    #[allow(dead_code)]
    pub fn clear_cache(&self) {
        if let Ok(mut cache) = self.cache.write() {
            cache.clear();
            tracing::debug!("DOC-014: Cache cleared");
        }
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
