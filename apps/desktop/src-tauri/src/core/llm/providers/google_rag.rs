/// Google Gemini RAG (Retrieval-Augmented Generation) capabilities
///
/// This module implements advanced RAG features for Google Gemini models:
/// 1. File Search with Embeddings - semantic search over uploaded files
/// 2. URL Context - web grounding with citation support
/// 3. Long Context Optimization - efficient handling of 1M+ token contexts
///
/// Pricing:
/// - File Search: $0.039 per 1000 queries
/// - Context caching: 75% discount on cached tokens
/// - Long context: Automatic optimization for 1M+ token windows
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;

/// Configuration for File Search with embeddings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileSearchConfig {
    /// File IDs to search across (from Files API)
    pub files: Vec<String>,

    /// Semantic similarity threshold (0.0 to 1.0)
    /// Higher values = stricter matching
    #[serde(skip_serializing_if = "Option::is_none")]
    pub semantic_threshold: Option<f32>,

    /// Maximum number of search results to return
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_results: Option<u32>,

    /// Whether to include full file content or just snippets
    #[serde(default)]
    pub include_full_content: bool,
}

impl Default for FileSearchConfig {
    fn default() -> Self {
        Self {
            files: Vec::new(),
            semantic_threshold: Some(0.7),
            max_results: Some(10),
            include_full_content: false,
        }
    }
}

/// Configuration for URL context grounding
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct URLContextConfig {
    /// URLs to fetch and use as context
    pub urls: Vec<String>,

    /// Whether to include citations in responses
    #[serde(default = "default_true")]
    pub include_citations: bool,

    /// Maximum content length per URL (in characters)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_content_length: Option<usize>,

    /// Whether to extract main content (remove navigation, ads, etc.)
    #[serde(default = "default_true")]
    pub extract_main_content: bool,
}

fn default_true() -> bool {
    true
}

impl Default for URLContextConfig {
    fn default() -> Self {
        Self {
            urls: Vec::new(),
            include_citations: true,
            max_content_length: Some(50000), // ~12.5K tokens
            extract_main_content: true,
        }
    }
}

/// Long context optimization settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LongContextConfig {
    /// Enable automatic context chunking for 1M+ token inputs
    #[serde(default)]
    pub enable_chunking: bool,

    /// Chunk size in tokens (default: 100K tokens per chunk)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_size_tokens: Option<u32>,

    /// Overlap between chunks in tokens (default: 1K tokens)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chunk_overlap_tokens: Option<u32>,

    /// Use context caching for repeated content
    #[serde(default = "default_true")]
    pub use_caching: bool,
}

impl Default for LongContextConfig {
    fn default() -> Self {
        Self {
            enable_chunking: true,
            chunk_size_tokens: Some(100000),
            chunk_overlap_tokens: Some(1000),
            use_caching: true,
        }
    }
}

/// File search result from Gemini
#[derive(Debug, Clone, Deserialize)]
pub struct FileSearchResult {
    /// File ID that matched
    pub file_id: String,

    /// Relevance score (0.0 to 1.0)
    pub score: f32,

    /// Matched content snippet
    pub snippet: String,

    /// Full content if requested
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_content: Option<String>,

    /// Metadata about the file
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// Citation from grounded URL context
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    /// Source URL
    pub url: String,

    /// Title of the source
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    /// Excerpt that was cited
    pub excerpt: String,

    /// Position in response where this citation applies
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_index: Option<u32>,

    /// End position in response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_index: Option<u32>,
}

/// URL grounding metadata from RAG context
#[derive(Debug, Clone, Deserialize)]
pub struct URLGroundingMetadata {
    /// Sources that were used for grounding
    pub grounding_sources: Vec<URLGroundingSource>,

    /// Citations extracted from the response
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grounding_citations: Option<Vec<Citation>>,

    /// Search queries generated for grounding
    #[serde(skip_serializing_if = "Option::is_none")]
    pub search_queries: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct URLGroundingSource {
    /// URL of the source
    pub url: String,

    /// Title extracted from the page
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,

    /// Relevance score (0.0 to 1.0)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f32>,
}

/// RAG-enhanced response with grounding and citations
#[derive(Debug, Clone)]
pub struct RAGResponse {
    /// Main response content
    pub content: String,

    /// File search results (if file search was used)
    pub file_search_results: Option<Vec<FileSearchResult>>,

    /// Grounding metadata (if URL context was used)
    pub grounding_metadata: Option<URLGroundingMetadata>,

    /// Citations for verification
    pub citations: Vec<Citation>,

    /// Context chunks used (for long context)
    pub context_chunks_used: Option<u32>,

    /// Token usage details
    pub token_usage: RAGTokenUsage,
}

#[derive(Debug, Clone, Default)]
pub struct RAGTokenUsage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cached_tokens: u32,
    pub file_search_queries: u32,
}

/// Google Files API client for managing uploaded files
pub struct GoogleFilesAPI {
    client: Client,
    api_key: String,
    base_url: String,
}

impl GoogleFilesAPI {
    pub fn new(api_key: String) -> Result<Self, Box<dyn Error + Send + Sync>> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()?;
        let base_url = std::env::var("GOOGLE_API_BASE")
            .unwrap_or_else(|_| "https://generativelanguage.googleapis.com/v1beta".to_string());

        Ok(Self {
            client,
            api_key,
            base_url,
        })
    }

    /// Upload a file for RAG search
    pub async fn upload_file(
        &self,
        file_path: &str,
        display_name: Option<&str>,
    ) -> Result<UploadedFile, Box<dyn Error + Send + Sync>> {
        tracing::info!("Uploading file for RAG: {}", file_path);

        let file_data = tokio::fs::read(file_path).await?;
        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file");

        // Detect MIME type
        let mime_type = self.detect_mime_type(file_path);

        // Upload via multipart
        let url = format!("{}/files?key={}", self.base_url, self.api_key);

        let form = reqwest::multipart::Form::new()
            .text(
                "display_name",
                display_name.unwrap_or(file_name).to_string(),
            )
            .part(
                "file",
                reqwest::multipart::Part::bytes(file_data)
                    .file_name(file_name.to_string())
                    .mime_str(&mime_type)?,
            );

        let response = self.client.post(&url).multipart(form).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Failed to upload file: {}", error_text).into());
        }

        let uploaded: UploadedFile = response.json().await?;
        tracing::info!("File uploaded successfully: {}", uploaded.name);

        Ok(uploaded)
    }

    /// Get file metadata
    pub async fn get_file(
        &self,
        file_id: &str,
    ) -> Result<UploadedFile, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/files/{}?key={}", self.base_url, file_id, self.api_key);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Failed to get file: {}", error_text).into());
        }

        let file: UploadedFile = response.json().await?;
        Ok(file)
    }

    /// Delete a file
    pub async fn delete_file(&self, file_id: &str) -> Result<(), Box<dyn Error + Send + Sync>> {
        let url = format!("{}/files/{}?key={}", self.base_url, file_id, self.api_key);

        let response = self.client.delete(&url).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Failed to delete file: {}", error_text).into());
        }

        tracing::info!("File deleted: {}", file_id);
        Ok(())
    }

    /// List all uploaded files
    pub async fn list_files(&self) -> Result<Vec<UploadedFile>, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/files?key={}", self.base_url, self.api_key);

        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(format!("Failed to list files: {}", error_text).into());
        }

        #[derive(Deserialize)]
        struct ListResponse {
            files: Vec<UploadedFile>,
        }

        let list: ListResponse = response.json().await?;
        Ok(list.files)
    }

    fn detect_mime_type(&self, file_path: &str) -> String {
        let extension = std::path::Path::new(file_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        match extension.to_lowercase().as_str() {
            "pdf" => "application/pdf",
            "txt" => "text/plain",
            "md" => "text/markdown",
            "json" => "application/json",
            "csv" => "text/csv",
            "xml" => "application/xml",
            "html" | "htm" => "text/html",
            "doc" => "application/msword",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls" => "application/vnd.ms-excel",
            "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "ppt" => "application/vnd.ms-powerpoint",
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            _ => "application/octet-stream",
        }
        .to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadedFile {
    /// Resource name in format "files/{file_id}"
    pub name: String,

    /// Display name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,

    /// MIME type
    pub mime_type: String,

    /// File size in bytes
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,

    /// Creation timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub create_time: Option<String>,

    /// Update timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update_time: Option<String>,

    /// Expiration timestamp
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_time: Option<String>,

    /// SHA256 hash
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256_hash: Option<String>,

    /// URI for accessing the file
    pub uri: String,

    /// Processing state
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
}

impl UploadedFile {
    /// Extract file ID from resource name
    pub fn file_id(&self) -> &str {
        self.name.strip_prefix("files/").unwrap_or(&self.name)
    }

    /// Check if file is ready for use
    pub fn is_ready(&self) -> bool {
        self.state.as_deref() == Some("ACTIVE")
    }
}

/// URL content fetcher with main content extraction
pub struct URLContentFetcher {
    client: Client,
}

impl URLContentFetcher {
    pub fn new() -> Result<Self, Box<dyn Error + Send + Sync>> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (compatible; AGIWorkforce/1.0)")
            .build()?;

        Ok(Self { client })
    }

    /// Fetch and process URL content
    pub async fn fetch_url(
        &self,
        url: &str,
        config: &URLContextConfig,
    ) -> Result<URLContent, Box<dyn Error + Send + Sync>> {
        tracing::debug!("Fetching URL content: {}", url);

        let response = self.client.get(url).send().await?;

        if !response.status().is_success() {
            return Err(format!(
                "Failed to fetch URL: {} (status: {})",
                url,
                response.status()
            )
            .into());
        }

        let html = response.text().await?;
        let title = self.extract_title(&html);

        let mut content = if config.extract_main_content {
            self.extract_main_content(&html)
        } else {
            html
        };

        // Apply length limit
        if let Some(max_length) = config.max_content_length {
            if content.len() > max_length {
                content.truncate(max_length);
                content.push_str("\n... (content truncated)");
            }
        }

        let word_count = content.split_whitespace().count();

        Ok(URLContent {
            url: url.to_string(),
            title,
            content,
            word_count,
        })
    }

    /// Extract main content from HTML (simple implementation)
    /// In production, use a library like readability or trafilatura
    fn extract_main_content(&self, html: &str) -> String {
        // Simple extraction: remove scripts, styles, and navigation
        let mut content = html.to_string();

        // Remove script tags (case-insensitive)
        content = regex::Regex::new(r"(?is)<script[^>]*>.*?</script>")
            .unwrap()
            .replace_all(&content, "")
            .to_string();

        // Remove style tags (case-insensitive)
        content = regex::Regex::new(r"(?is)<style[^>]*>.*?</style>")
            .unwrap()
            .replace_all(&content, "")
            .to_string();

        // Remove HTML tags
        content = regex::Regex::new(r"<[^>]+>")
            .unwrap()
            .replace_all(&content, " ")
            .to_string();

        // Normalize whitespace
        content = regex::Regex::new(r"\s+")
            .unwrap()
            .replace_all(&content, " ")
            .to_string();

        content.trim().to_string()
    }

    fn extract_title(&self, html: &str) -> Option<String> {
        regex::Regex::new(r"<title>([^<]+)</title>")
            .ok()?
            .captures(html)?
            .get(1)
            .map(|m| m.as_str().trim().to_string())
    }
}

impl Default for URLContentFetcher {
    fn default() -> Self {
        Self::new().expect("Failed to create URL content fetcher")
    }
}

#[derive(Debug, Clone)]
pub struct URLContent {
    pub url: String,
    pub title: Option<String>,
    pub content: String,
    pub word_count: usize,
}

/// Token counter for long context optimization
pub struct TokenCounter;

impl TokenCounter {
    /// Estimate token count (rough approximation: 1 token ≈ 4 characters)
    pub fn estimate_tokens(text: &str) -> u32 {
        (text.len() / 4) as u32
    }

    /// Check if context exceeds long context threshold (1M tokens)
    pub fn is_long_context(text: &str) -> bool {
        Self::estimate_tokens(text) > 1_000_000
    }

    /// Split text into chunks for long context processing
    pub fn chunk_text(text: &str, chunk_size_tokens: u32, overlap_tokens: u32) -> Vec<String> {
        let chunk_size_chars = (chunk_size_tokens * 4) as usize;
        let overlap_chars = (overlap_tokens * 4) as usize;

        let mut chunks = Vec::new();
        let mut start = 0;

        while start < text.len() {
            let end = (start + chunk_size_chars).min(text.len());
            chunks.push(text[start..end].to_string());

            if end == text.len() {
                break;
            }

            start = end - overlap_chars;
        }

        chunks
    }
}

/// Calculate RAG pricing
pub struct RAGPricing;

impl RAGPricing {
    /// Cost per 1000 file search queries
    pub const FILE_SEARCH_COST_PER_1K: f64 = 0.039;

    /// Calculate file search cost
    pub fn calculate_file_search_cost(num_queries: u32) -> f64 {
        (num_queries as f64 / 1000.0) * Self::FILE_SEARCH_COST_PER_1K
    }

    /// Calculate total RAG cost including file search and tokens
    pub fn calculate_total_cost(
        usage: &RAGTokenUsage,
        input_cost_per_1m: f64,
        output_cost_per_1m: f64,
    ) -> f64 {
        // Token costs
        let uncached_tokens = usage.input_tokens.saturating_sub(usage.cached_tokens);
        let input_cost = (uncached_tokens as f64 / 1_000_000.0) * input_cost_per_1m;

        // Cached tokens get 75% discount
        let cached_cost = (usage.cached_tokens as f64 / 1_000_000.0) * input_cost_per_1m * 0.25;

        let output_cost = (usage.output_tokens as f64 / 1_000_000.0) * output_cost_per_1m;

        // File search cost
        let file_search_cost = Self::calculate_file_search_cost(usage.file_search_queries);

        input_cost + cached_cost + output_cost + file_search_cost
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_file_search_config_defaults() {
        let config = FileSearchConfig::default();
        assert_eq!(config.semantic_threshold, Some(0.7));
        assert_eq!(config.max_results, Some(10));
        assert!(!config.include_full_content);
    }

    #[test]
    fn test_url_context_config_defaults() {
        let config = URLContextConfig::default();
        assert!(config.include_citations);
        assert_eq!(config.max_content_length, Some(50000));
        assert!(config.extract_main_content);
    }

    #[test]
    fn test_long_context_config_defaults() {
        let config = LongContextConfig::default();
        assert!(config.enable_chunking);
        assert_eq!(config.chunk_size_tokens, Some(100000));
        assert_eq!(config.chunk_overlap_tokens, Some(1000));
        assert!(config.use_caching);
    }

    #[test]
    fn test_token_counter_estimate() {
        let text = "This is a test with approximately twenty tokens here now.";
        let tokens = TokenCounter::estimate_tokens(text);
        assert!(tokens > 10 && tokens < 30); // Rough estimate
    }

    #[test]
    fn test_token_counter_long_context() {
        let short_text = "Short text";
        assert!(!TokenCounter::is_long_context(short_text));

        // Create a text that would exceed 1M tokens
        let long_text = "a".repeat(5_000_000); // 5M chars ≈ 1.25M tokens
        assert!(TokenCounter::is_long_context(&long_text));
    }

    #[test]
    fn test_token_counter_chunking() {
        let text = "a".repeat(1000);
        let chunks = TokenCounter::chunk_text(&text, 100, 10);

        assert!(chunks.len() > 1);
        assert_eq!(chunks[0].len(), 400); // 100 tokens * 4 chars
    }

    // Helper for approximate floating-point equality
    fn approx_eq(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-9
    }

    #[test]
    fn test_file_search_pricing() {
        let cost = RAGPricing::calculate_file_search_cost(1000);
        assert!(approx_eq(cost, 0.039));

        let cost_small = RAGPricing::calculate_file_search_cost(100);
        assert!(approx_eq(cost_small, 0.0039));
    }

    #[test]
    fn test_total_rag_cost() {
        let usage = RAGTokenUsage {
            input_tokens: 1_000_000,
            output_tokens: 1_000_000,
            cached_tokens: 500_000,
            file_search_queries: 1000,
        };

        // Gemini 3 Pro pricing: $1.5/1M input, $6.0/1M output
        let cost = RAGPricing::calculate_total_cost(&usage, 1.5, 6.0);

        // Expected: 500K uncached ($0.75) + 500K cached ($0.1875) + 1M output ($6.0) + 1K searches ($0.039)
        // = $6.9765
        assert!((cost - 6.9765).abs() < 0.001);
    }

    #[test]
    fn test_uploaded_file_id_extraction() {
        let file = UploadedFile {
            name: "files/abc123".to_string(),
            display_name: Some("test.pdf".to_string()),
            mime_type: "application/pdf".to_string(),
            size_bytes: Some(1024),
            create_time: None,
            update_time: None,
            expiration_time: None,
            sha256_hash: None,
            uri: "https://example.com/files/abc123".to_string(),
            state: Some("ACTIVE".to_string()),
        };

        assert_eq!(file.file_id(), "abc123");
        assert!(file.is_ready());
    }
}
