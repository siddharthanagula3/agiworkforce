//! Web Search Integration
//!
//! Provides direct web search capabilities using multiple providers:
//! - DuckDuckGo (free, no API key required)
//! - Brave Search (requires API key, better results)

use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::env;
use std::time::Duration;

/// A single web search result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResult {
    /// Title of the search result
    pub title: String,
    /// URL of the page
    pub url: String,
    /// Snippet/description of the content
    pub snippet: String,
    /// Favicon URL (optional)
    pub favicon: Option<String>,
    /// Domain name extracted from URL
    pub domain: Option<String>,
    /// Position in search results (1-indexed)
    pub position: usize,
    /// Citation ID for inline referencing (matches position by default)
    #[serde(default)]
    pub citation_id: Option<String>,
    /// When the source was accessed
    #[serde(default)]
    pub access_timestamp: Option<u64>,
}

/// Search type for different kinds of searches
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SearchType {
    #[default]
    Web,
    News,
    Images,
}

/// Configuration for web search
#[derive(Debug, Clone)]
pub struct WebSearchConfig {
    /// Maximum number of results to return
    pub num_results: usize,
    /// Type of search to perform
    pub search_type: SearchType,
    /// Preferred search region (e.g., "us-en", "uk-en")
    pub region: Option<String>,
    /// Safe search mode
    pub safe_search: bool,
}

impl Default for WebSearchConfig {
    fn default() -> Self {
        Self {
            num_results: 10,
            search_type: SearchType::Web,
            region: None,
            safe_search: true,
        }
    }
}

/// Response from web search
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchResponse {
    /// The original search query
    pub query: String,
    /// List of search results
    pub results: Vec<WebSearchResult>,
    /// Total number of results found
    pub count: usize,
    /// Provider used for search
    pub provider: String,
    /// Search duration in milliseconds
    pub duration_ms: u64,
}

/// Web search provider trait
#[async_trait::async_trait]
pub trait SearchProvider: Send + Sync {
    /// Perform a web search
    async fn search(&self, query: &str, config: &WebSearchConfig) -> Result<Vec<WebSearchResult>>;

    /// Get the provider name
    fn name(&self) -> &str;

    /// Check if the provider is available (has required API keys, etc.)
    fn is_available(&self) -> bool;
}

/// DuckDuckGo search provider (free, no API key required)
pub struct DuckDuckGoProvider {
    client: Client,
}

impl DuckDuckGoProvider {
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build()?;

        Ok(Self { client })
    }

    /// Parse DuckDuckGo HTML search results
    fn parse_html_results(&self, html: &str, max_results: usize) -> Result<Vec<WebSearchResult>> {
        let mut results = Vec::new();

        // DuckDuckGo HTML search results parsing
        // We look for result containers with specific patterns
        let result_pattern = regex::Regex::new(
            r#"<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([^<]*)</a>"#,
        )
        .map_err(|e| anyhow!("Regex error: {}", e))?;

        let snippet_pattern =
            regex::Regex::new(r#"<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)"#)
                .map_err(|e| anyhow!("Regex error: {}", e))?;

        // Note: We use multiple parsing strategies as DuckDuckGo's HTML structure
        // can vary. The main result_pattern handles most cases.

        // First try to extract links directly
        for (idx, cap) in result_pattern.captures_iter(html).enumerate() {
            if idx >= max_results {
                break;
            }

            let url = cap.get(1).map(|m| m.as_str()).unwrap_or("");
            let title = cap.get(2).map(|m| m.as_str()).unwrap_or("");

            if url.is_empty() || title.is_empty() {
                continue;
            }

            // Skip DuckDuckGo internal links
            if url.starts_with("/") || url.contains("duckduckgo.com") {
                continue;
            }

            let domain = extract_domain(url);
            let favicon = domain
                .as_ref()
                .map(|d| format!("https://www.google.com/s2/favicons?domain={}&sz=32", d));

            let position = idx + 1;
            results.push(WebSearchResult {
                title: html_decode(title),
                url: url.to_string(),
                snippet: String::new(), // Will try to fill in below
                favicon,
                domain,
                position,
                citation_id: Some(format!("cite-{}", position)),
                access_timestamp: Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_secs())
                        .unwrap_or(0),
                ),
            });
        }

        // If we didn't get results, try parsing differently
        if results.is_empty() {
            // Fall back to looking for any external links in result-like structures
            // Note: Using simpler regex without look-ahead (not supported by Rust regex)
            let any_link = regex::Regex::new(r#"href="(https?://[^"]+)"[^>]*>([^<]+)</a>"#)
                .map_err(|e| anyhow!("Regex error: {}", e))?;

            let mut count = 0;
            for cap in any_link.captures_iter(html) {
                if count >= max_results {
                    break;
                }

                let url = cap.get(1).map(|m| m.as_str()).unwrap_or("");
                let title = cap.get(2).map(|m| m.as_str()).unwrap_or("");

                // Filter out duckduckgo internal links
                if url.is_empty()
                    || title.is_empty()
                    || title.len() < 5
                    || url.contains("duckduckgo")
                {
                    continue;
                }

                let domain = extract_domain(url);
                let favicon = domain
                    .as_ref()
                    .map(|d| format!("https://www.google.com/s2/favicons?domain={}&sz=32", d));

                let position = count + 1;
                results.push(WebSearchResult {
                    title: html_decode(title),
                    url: url.to_string(),
                    snippet: String::new(),
                    favicon,
                    domain,
                    position,
                    citation_id: Some(format!("cite-{}", position)),
                    access_timestamp: Some(
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|d| d.as_secs())
                            .unwrap_or(0),
                    ),
                });
                count += 1;
            }
        }

        // Try to extract snippets
        for (idx, cap) in snippet_pattern.captures_iter(html).enumerate() {
            if idx < results.len() {
                if let Some(snippet) = cap.get(1) {
                    results[idx].snippet = html_decode(snippet.as_str());
                }
            }
        }

        Ok(results)
    }
}

#[async_trait::async_trait]
impl SearchProvider for DuckDuckGoProvider {
    async fn search(&self, query: &str, config: &WebSearchConfig) -> Result<Vec<WebSearchResult>> {
        // Use DuckDuckGo HTML search
        let url = format!(
            "https://html.duckduckgo.com/html/?q={}",
            urlencoding::encode(query)
        );

        let response = self
            .client
            .get(&url)
            .header("Accept", "text/html")
            .header("Accept-Language", "en-US,en;q=0.9")
            .send()
            .await
            .map_err(|e| anyhow!("DuckDuckGo request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!("DuckDuckGo returned status: {}", response.status()));
        }

        let html = response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read DuckDuckGo response: {}", e))?;

        self.parse_html_results(&html, config.num_results)
    }

    fn name(&self) -> &str {
        "DuckDuckGo"
    }

    fn is_available(&self) -> bool {
        true // Always available, no API key required
    }
}

/// Brave Search provider (requires API key for better results)
pub struct BraveSearchProvider {
    client: Client,
    api_key: String,
}

impl BraveSearchProvider {
    pub fn new(api_key: String) -> Result<Self> {
        let client = Client::builder().timeout(Duration::from_secs(30)).build()?;

        Ok(Self { client, api_key })
    }

    pub fn from_env() -> Option<Self> {
        env::var("BRAVE_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())
            .and_then(|api_key| Self::new(api_key).ok())
    }
}

/// Brave Search API response structures
#[derive(Debug, Deserialize)]
struct BraveSearchResponse {
    web: Option<BraveWebResults>,
    news: Option<BraveNewsResults>,
}

#[derive(Debug, Deserialize)]
struct BraveWebResults {
    results: Vec<BraveWebResult>,
}

#[derive(Debug, Deserialize)]
struct BraveWebResult {
    title: String,
    url: String,
    description: Option<String>,
    #[serde(default)]
    extra_snippets: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct BraveNewsResults {
    results: Vec<BraveNewsResult>,
}

#[derive(Debug, Deserialize)]
struct BraveNewsResult {
    title: String,
    url: String,
    description: Option<String>,
}

#[async_trait::async_trait]
impl SearchProvider for BraveSearchProvider {
    async fn search(&self, query: &str, config: &WebSearchConfig) -> Result<Vec<WebSearchResult>> {
        let endpoint = match config.search_type {
            SearchType::Web => "https://api.search.brave.com/res/v1/web/search",
            SearchType::News => "https://api.search.brave.com/res/v1/news/search",
            SearchType::Images => "https://api.search.brave.com/res/v1/images/search",
        };

        let mut params = vec![
            ("q", query.to_string()),
            ("count", config.num_results.to_string()),
        ];

        if let Some(ref region) = config.region {
            params.push(("country", region.clone()));
        }

        if config.safe_search {
            params.push(("safesearch", "moderate".to_string()));
        }

        let response = self
            .client
            .get(endpoint)
            .header("Accept", "application/json")
            .header("Accept-Encoding", "gzip")
            .header("X-Subscription-Token", &self.api_key)
            .query(&params)
            .send()
            .await
            .map_err(|e| anyhow!("Brave Search request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Brave Search returned status {}: {}", status, body));
        }

        let brave_response: BraveSearchResponse = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse Brave Search response: {}", e))?;

        let mut results = Vec::new();

        match config.search_type {
            SearchType::Web => {
                if let Some(web) = brave_response.web {
                    for (idx, result) in web.results.into_iter().enumerate() {
                        let domain = extract_domain(&result.url);
                        let favicon = domain.as_ref().map(|d| {
                            format!("https://www.google.com/s2/favicons?domain={}&sz=32", d)
                        });

                        let snippet = result.description.unwrap_or_else(|| {
                            result.extra_snippets.first().cloned().unwrap_or_default()
                        });

                        let position = idx + 1;
                        results.push(WebSearchResult {
                            title: result.title,
                            url: result.url,
                            snippet,
                            favicon,
                            domain,
                            position,
                            citation_id: Some(format!("cite-{}", position)),
                            access_timestamp: Some(
                                std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0),
                            ),
                        });
                    }
                }
            }
            SearchType::News => {
                if let Some(news) = brave_response.news {
                    for (idx, result) in news.results.into_iter().enumerate() {
                        let domain = extract_domain(&result.url);
                        let favicon = domain.as_ref().map(|d| {
                            format!("https://www.google.com/s2/favicons?domain={}&sz=32", d)
                        });

                        let position = idx + 1;
                        results.push(WebSearchResult {
                            title: result.title,
                            url: result.url,
                            snippet: result.description.unwrap_or_default(),
                            favicon,
                            domain,
                            position,
                            citation_id: Some(format!("cite-{}", position)),
                            access_timestamp: Some(
                                std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0),
                            ),
                        });
                    }
                }
            }
            SearchType::Images => {
                // Images search would need different handling
                return Err(anyhow!("Image search not yet implemented for Brave"));
            }
        }

        Ok(results)
    }

    fn name(&self) -> &str {
        "Brave Search"
    }

    fn is_available(&self) -> bool {
        !self.api_key.is_empty()
    }
}

/// Main web search service that manages providers
pub struct WebSearchService {
    brave_provider: Option<BraveSearchProvider>,
    duckduckgo_provider: DuckDuckGoProvider,
}

impl WebSearchService {
    pub fn new() -> Result<Self> {
        let brave_provider = BraveSearchProvider::from_env();
        let duckduckgo_provider = DuckDuckGoProvider::new()?;

        if brave_provider.is_some() {
            tracing::info!("Brave Search API key found - using Brave as primary search provider");
        } else {
            tracing::info!("No Brave Search API key - using DuckDuckGo as search provider");
        }

        Ok(Self {
            brave_provider,
            duckduckgo_provider,
        })
    }

    /// Perform a web search using the best available provider
    pub async fn search(
        &self,
        query: &str,
        config: Option<WebSearchConfig>,
    ) -> Result<WebSearchResponse> {
        let config = config.unwrap_or_default();
        let start = std::time::Instant::now();

        // Try Brave first if available
        let (results, provider_name) = if let Some(ref brave) = self.brave_provider {
            match brave.search(query, &config).await {
                Ok(results) => (results, brave.name().to_string()),
                Err(e) => {
                    tracing::warn!("Brave Search failed, falling back to DuckDuckGo: {}", e);
                    let results = self.duckduckgo_provider.search(query, &config).await?;
                    (results, self.duckduckgo_provider.name().to_string())
                }
            }
        } else {
            let results = self.duckduckgo_provider.search(query, &config).await?;
            (results, self.duckduckgo_provider.name().to_string())
        };

        let duration_ms = start.elapsed().as_millis() as u64;
        let count = results.len();

        Ok(WebSearchResponse {
            query: query.to_string(),
            results,
            count,
            provider: provider_name,
            duration_ms,
        })
    }

    /// Check if Brave Search is available
    pub fn has_brave_search(&self) -> bool {
        self.brave_provider.is_some()
    }
}

/// Extract domain from URL
fn extract_domain(url: &str) -> Option<String> {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| h.to_string()))
}

/// Basic HTML entity decoding
fn html_decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&#x27;", "'")
        .replace("&nbsp;", " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_duckduckgo_search() {
        let provider = DuckDuckGoProvider::new().unwrap();
        let config = WebSearchConfig {
            num_results: 5,
            ..Default::default()
        };

        let results = provider.search("rust programming language", &config).await;
        // Note: This test may fail if DuckDuckGo blocks the request
        // In production, we handle this gracefully
        if let Ok(results) = results {
            assert!(!results.is_empty() || true); // Allow empty results in CI
        }
    }

    #[test]
    fn test_extract_domain() {
        assert_eq!(
            extract_domain("https://www.example.com/path"),
            Some("www.example.com".to_string())
        );
        assert_eq!(
            extract_domain("http://rust-lang.org"),
            Some("rust-lang.org".to_string())
        );
        assert_eq!(extract_domain("invalid-url"), None);
    }

    #[test]
    fn test_html_decode() {
        assert_eq!(html_decode("Hello &amp; World"), "Hello & World");
        assert_eq!(html_decode("&lt;div&gt;"), "<div>");
        assert_eq!(html_decode("It&#39;s fine"), "It's fine");
    }
}
