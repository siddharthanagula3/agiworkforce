//! Search agents for different data sources.
//!
//! Each agent specializes in searching a particular type of source:
//! - Web: Internet searches using configured search providers
//! - Documents: Local documents (PDF, Word, etc.)
//! - Email: Connected email accounts
//! - Calendar: Calendar events
//! - Memory: Persistent AGI memory

use super::citation::{Citation, SourceType};
use super::types::{AgentType, ResearchError, SearchStrategy, TimeConstraint};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Result from a search agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchAgentResult {
    /// The agent that produced this result
    pub agent_type: AgentType,

    /// Individual search results
    pub results: Vec<SearchResult>,

    /// Time taken for the search (milliseconds)
    pub search_time_ms: u64,

    /// Any warnings or notes
    pub warnings: Vec<String>,

    /// Whether the search was complete or partial
    pub complete: bool,

    /// Error message if search failed
    pub error: Option<String>,
}

impl SearchAgentResult {
    /// Creates an empty successful result.
    pub fn empty(agent_type: AgentType) -> Self {
        Self {
            agent_type,
            results: Vec::new(),
            search_time_ms: 0,
            warnings: Vec::new(),
            complete: true,
            error: None,
        }
    }

    /// Creates a failed result.
    pub fn failed(agent_type: AgentType, error: &str) -> Self {
        Self {
            agent_type,
            results: Vec::new(),
            search_time_ms: 0,
            warnings: Vec::new(),
            complete: false,
            error: Some(error.to_string()),
        }
    }
}

/// A single search result from any agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// Unique ID for this result
    pub id: String,

    /// Title of the result
    pub title: String,

    /// Content snippet or summary
    pub content: String,

    /// Full content if available
    pub full_content: Option<String>,

    /// URL if applicable
    pub url: Option<String>,

    /// Source type
    pub source_type: SourceType,

    /// Relevance score (0.0 - 1.0)
    pub relevance: f32,

    /// Timestamp of the source (Unix timestamp)
    pub timestamp: Option<i64>,

    /// Author or creator
    pub author: Option<String>,

    /// Additional metadata
    pub metadata: HashMap<String, String>,
}

impl SearchResult {
    /// Converts this result into a Citation.
    pub fn to_citation(&self, number: usize) -> Citation {
        let mut citation = Citation::new(
            &self.id,
            number,
            self.source_type,
            &self.title,
            self.relevance,
        )
        .with_excerpt(&self.content);

        if let Some(url) = &self.url {
            citation = citation.with_url(url);
        }

        if let Some(author) = &self.author {
            citation = citation.with_author(author);
        }

        if let Some(ts) = self.timestamp {
            let date = chrono::DateTime::from_timestamp(ts, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_default();
            if !date.is_empty() {
                citation = citation.with_date(&date);
            }
        }

        citation
    }
}

/// Trait for search agents.
#[async_trait]
pub trait SearchAgent: Send + Sync {
    /// Returns the type of this agent.
    fn agent_type(&self) -> AgentType;

    /// Returns whether this agent is available/configured.
    fn is_available(&self) -> bool;

    /// Performs a search based on the given strategy.
    async fn search(
        &self,
        strategy: &SearchStrategy,
        time_constraint: Option<&TimeConstraint>,
        max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError>;

    /// Returns a human-readable name for this agent.
    fn name(&self) -> &str;
}

// =============================================================================
// WEB SEARCH AGENT
// =============================================================================

/// Agent for searching the web.
pub struct WebSearchAgent {
    /// HTTP client for making requests
    http_client: reqwest::Client,

    /// Whether web search is configured
    configured: bool,

    /// Search API endpoint (e.g., Perplexity, Tavily)
    api_endpoint: Option<String>,

    /// API key for the search service
    api_key: Option<String>,
}

impl WebSearchAgent {
    /// Creates a new web search agent.
    pub fn new() -> Self {
        Self {
            http_client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
            configured: false,
            api_endpoint: None,
            api_key: None,
        }
    }

    /// Configures the agent with a search API.
    pub fn configure(mut self, endpoint: &str, api_key: &str) -> Self {
        self.api_endpoint = Some(endpoint.to_string());
        self.api_key = Some(api_key.to_string());
        self.configured = true;
        self
    }

    /// Performs a web search using the configured API.
    async fn perform_web_search(
        &self,
        query: &str,
        max_results: usize,
    ) -> Result<Vec<SearchResult>, ResearchError> {
        // If not configured with external API, return mock results
        // In production, this would call Perplexity, Tavily, or similar
        if !self.configured {
            tracing::warn!("WebSearchAgent not configured, returning empty results");
            return Ok(Vec::new());
        }

        let endpoint = self
            .api_endpoint
            .as_ref()
            .ok_or_else(|| ResearchError::ConfigError("No search endpoint configured".into()))?;

        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| ResearchError::ConfigError("No API key configured".into()))?;

        // Build the search request
        let request_body = serde_json::json!({
            "query": query,
            "max_results": max_results,
        });

        let response = self
            .http_client
            .post(endpoint)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await
            .map_err(|e| ResearchError::AgentError {
                agent: "web_search".into(),
                message: e.to_string(),
            })?;

        if !response.status().is_success() {
            return Err(ResearchError::AgentError {
                agent: "web_search".into(),
                message: format!("Search API returned status: {}", response.status()),
            });
        }

        // Parse the response
        let json: serde_json::Value =
            response
                .json()
                .await
                .map_err(|e| ResearchError::AgentError {
                    agent: "web_search".into(),
                    message: e.to_string(),
                })?;

        // Parse results based on API response format
        let mut results = Vec::new();
        if let Some(items) = json["results"].as_array() {
            for (idx, item) in items.iter().enumerate() {
                let result = SearchResult {
                    id: format!("web_{}", idx),
                    title: item["title"].as_str().unwrap_or("Untitled").to_string(),
                    content: item["snippet"].as_str().unwrap_or("").to_string(),
                    full_content: item["content"].as_str().map(|s| s.to_string()),
                    url: item["url"].as_str().map(|s| s.to_string()),
                    source_type: SourceType::WebPage,
                    relevance: item["score"].as_f64().unwrap_or(0.5) as f32,
                    timestamp: None,
                    author: item["author"].as_str().map(|s| s.to_string()),
                    metadata: HashMap::new(),
                };
                results.push(result);
            }
        }

        Ok(results)
    }
}

impl Default for WebSearchAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchAgent for WebSearchAgent {
    fn agent_type(&self) -> AgentType {
        AgentType::WebSearch
    }

    fn is_available(&self) -> bool {
        // Web search is always "available" but may return empty if not configured
        true
    }

    fn name(&self) -> &str {
        "Web Search"
    }

    async fn search(
        &self,
        strategy: &SearchStrategy,
        _time_constraint: Option<&TimeConstraint>,
        max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError> {
        let start = std::time::Instant::now();

        // Build combined query from strategy terms
        let query = strategy.search_terms.join(" ");

        match self.perform_web_search(&query, max_results).await {
            Ok(results) => Ok(SearchAgentResult {
                agent_type: AgentType::WebSearch,
                results,
                search_time_ms: start.elapsed().as_millis() as u64,
                warnings: Vec::new(),
                complete: true,
                error: None,
            }),
            Err(e) => Ok(SearchAgentResult {
                agent_type: AgentType::WebSearch,
                results: Vec::new(),
                search_time_ms: start.elapsed().as_millis() as u64,
                warnings: vec![e.to_string()],
                complete: false,
                error: Some(e.to_string()),
            }),
        }
    }
}

// =============================================================================
// DOCUMENT SEARCH AGENT
// =============================================================================

/// Agent for searching local documents.
pub struct DocumentSearchAgent {
    /// Root directories to search
    search_paths: Vec<std::path::PathBuf>,

    /// File extensions to search
    extensions: Vec<String>,
}

impl DocumentSearchAgent {
    /// Creates a new document search agent.
    pub fn new() -> Self {
        Self {
            search_paths: Vec::new(),
            extensions: vec![
                "pdf".into(),
                "docx".into(),
                "doc".into(),
                "txt".into(),
                "md".into(),
            ],
        }
    }

    /// Adds a search path.
    pub fn add_path(mut self, path: std::path::PathBuf) -> Self {
        self.search_paths.push(path);
        self
    }

    /// Sets the file extensions to search.
    pub fn with_extensions(mut self, extensions: Vec<String>) -> Self {
        self.extensions = extensions;
        self
    }
}

impl Default for DocumentSearchAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchAgent for DocumentSearchAgent {
    fn agent_type(&self) -> AgentType {
        AgentType::DocumentSearch
    }

    fn is_available(&self) -> bool {
        !self.search_paths.is_empty()
    }

    fn name(&self) -> &str {
        "Document Search"
    }

    async fn search(
        &self,
        strategy: &SearchStrategy,
        _time_constraint: Option<&TimeConstraint>,
        max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError> {
        let start = std::time::Instant::now();

        if self.search_paths.is_empty() {
            return Ok(SearchAgentResult::empty(AgentType::DocumentSearch));
        }

        let mut results = Vec::new();
        let search_terms: Vec<&str> = strategy.search_terms.iter().map(|s| s.as_str()).collect();

        // Walk through search paths
        for base_path in &self.search_paths {
            if !base_path.exists() {
                continue;
            }

            // Use walkdir to traverse directories
            let walker = walkdir::WalkDir::new(base_path)
                .max_depth(5) // Limit depth for performance
                .into_iter()
                .filter_map(|e| e.ok());

            for entry in walker {
                if results.len() >= max_results {
                    break;
                }

                let path = entry.path();
                if !path.is_file() {
                    continue;
                }

                // Check extension
                let ext = path
                    .extension()
                    .and_then(|e| e.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                if !self.extensions.contains(&ext) {
                    continue;
                }

                // Check if filename contains any search term
                let filename = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_lowercase();

                let matches_term = search_terms
                    .iter()
                    .any(|term| filename.contains(&term.to_lowercase()));

                if matches_term {
                    let result = SearchResult {
                        id: format!("doc_{}", results.len()),
                        title: path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("Unknown")
                            .to_string(),
                        content: format!("Document at {}", path.display()),
                        full_content: None,
                        url: Some(format!("file://{}", path.display())),
                        source_type: SourceType::Document,
                        relevance: 0.7,
                        timestamp: path
                            .metadata()
                            .ok()
                            .and_then(|m| m.modified().ok())
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs() as i64),
                        author: None,
                        metadata: HashMap::new(),
                    };
                    results.push(result);
                }
            }
        }

        Ok(SearchAgentResult {
            agent_type: AgentType::DocumentSearch,
            results,
            search_time_ms: start.elapsed().as_millis() as u64,
            warnings: Vec::new(),
            complete: true,
            error: None,
        })
    }
}

// =============================================================================
// EMAIL SEARCH AGENT
// =============================================================================

/// Agent for searching email accounts.
pub struct EmailSearchAgent {
    /// Whether email is connected
    connected: bool,
}

impl EmailSearchAgent {
    /// Creates a new email search agent.
    pub fn new() -> Self {
        Self { connected: false }
    }

    /// Sets the connection status.
    pub fn set_connected(mut self, connected: bool) -> Self {
        self.connected = connected;
        self
    }
}

impl Default for EmailSearchAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchAgent for EmailSearchAgent {
    fn agent_type(&self) -> AgentType {
        AgentType::EmailSearch
    }

    fn is_available(&self) -> bool {
        self.connected
    }

    fn name(&self) -> &str {
        "Email Search"
    }

    async fn search(
        &self,
        _strategy: &SearchStrategy,
        _time_constraint: Option<&TimeConstraint>,
        _max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError> {
        let start = std::time::Instant::now();

        if !self.connected {
            return Ok(SearchAgentResult {
                agent_type: AgentType::EmailSearch,
                results: Vec::new(),
                search_time_ms: start.elapsed().as_millis() as u64,
                warnings: vec!["Email not connected".into()],
                complete: true,
                error: None,
            });
        }

        // In production, this would search via Gmail API, IMAP, etc.
        // For now, return empty results as placeholder
        Ok(SearchAgentResult::empty(AgentType::EmailSearch))
    }
}

// =============================================================================
// CALENDAR SEARCH AGENT
// =============================================================================

/// Agent for searching calendar events.
pub struct CalendarSearchAgent {
    /// Whether calendar is connected
    connected: bool,
}

impl CalendarSearchAgent {
    /// Creates a new calendar search agent.
    pub fn new() -> Self {
        Self { connected: false }
    }

    /// Sets the connection status.
    pub fn set_connected(mut self, connected: bool) -> Self {
        self.connected = connected;
        self
    }
}

impl Default for CalendarSearchAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchAgent for CalendarSearchAgent {
    fn agent_type(&self) -> AgentType {
        AgentType::CalendarSearch
    }

    fn is_available(&self) -> bool {
        self.connected
    }

    fn name(&self) -> &str {
        "Calendar Search"
    }

    async fn search(
        &self,
        _strategy: &SearchStrategy,
        _time_constraint: Option<&TimeConstraint>,
        _max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError> {
        let start = std::time::Instant::now();

        if !self.connected {
            return Ok(SearchAgentResult {
                agent_type: AgentType::CalendarSearch,
                results: Vec::new(),
                search_time_ms: start.elapsed().as_millis() as u64,
                warnings: vec!["Calendar not connected".into()],
                complete: true,
                error: None,
            });
        }

        // In production, this would search via Google Calendar API, etc.
        Ok(SearchAgentResult::empty(AgentType::CalendarSearch))
    }
}

// =============================================================================
// MEMORY SEARCH AGENT
// =============================================================================

/// Agent for searching the AGI's persistent memory.
pub struct MemorySearchAgent {
    /// Memory manager reference (in production, this would be injected)
    available: bool,
}

impl MemorySearchAgent {
    /// Creates a new memory search agent.
    pub fn new() -> Self {
        Self { available: true }
    }

    /// Sets availability.
    pub fn set_available(mut self, available: bool) -> Self {
        self.available = available;
        self
    }
}

impl Default for MemorySearchAgent {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl SearchAgent for MemorySearchAgent {
    fn agent_type(&self) -> AgentType {
        AgentType::MemorySearch
    }

    fn is_available(&self) -> bool {
        self.available
    }

    fn name(&self) -> &str {
        "Memory Search"
    }

    async fn search(
        &self,
        strategy: &SearchStrategy,
        _time_constraint: Option<&TimeConstraint>,
        max_results: usize,
    ) -> Result<SearchAgentResult, ResearchError> {
        let start = std::time::Instant::now();

        if !self.available {
            return Ok(SearchAgentResult::failed(
                AgentType::MemorySearch,
                "Memory not available",
            ));
        }

        // In production, this would search the MemoryManager
        // For now, return a placeholder that indicates the capability exists

        let _ = strategy;
        let _ = max_results;

        Ok(SearchAgentResult {
            agent_type: AgentType::MemorySearch,
            results: Vec::new(),
            search_time_ms: start.elapsed().as_millis() as u64,
            warnings: Vec::new(),
            complete: true,
            error: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_result_to_citation() {
        let result = SearchResult {
            id: "test_1".into(),
            title: "Test Article".into(),
            content: "This is a test".into(),
            full_content: None,
            url: Some("https://example.com".into()),
            source_type: SourceType::WebPage,
            relevance: 0.85,
            timestamp: Some(1704067200), // 2024-01-01
            author: Some("John Doe".into()),
            metadata: HashMap::new(),
        };

        let citation = result.to_citation(1);
        assert_eq!(citation.title, "Test Article");
        assert_eq!(citation.number, 1);
        assert!(citation.url.is_some());
    }

    #[tokio::test]
    async fn test_web_agent_unconfigured() {
        let agent = WebSearchAgent::new();
        assert!(agent.is_available());

        let strategy = SearchStrategy {
            id: "test".into(),
            description: "Test search".into(),
            agent_type: AgentType::WebSearch,
            search_terms: vec!["test".into()],
            priority: 1,
            expected_relevance: 0.5,
        };

        let result = agent.search(&strategy, None, 10).await.unwrap();
        assert!(result.results.is_empty()); // Empty because not configured
    }

    #[test]
    fn test_document_agent_paths() {
        let agent = DocumentSearchAgent::new()
            .add_path(std::path::PathBuf::from("/tmp"))
            .with_extensions(vec!["pdf".into()]);

        assert!(agent.is_available());
    }
}
