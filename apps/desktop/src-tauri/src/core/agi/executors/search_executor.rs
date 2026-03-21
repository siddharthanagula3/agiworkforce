//! Web search executor.
//!
//! Handles web search operations using Perplexity API with fallback to DuckDuckGo.
//! Supports different search types: general, code, academic.

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::integrations::api_integrations::perplexity::{PerplexityClient, PerplexityModel};
use crate::integrations::api_integrations::RequestConfig;
use crate::sys::commands::security::SecretManagerState;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;
use std::time::Duration;

/// Search type enumeration for different search modes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchType {
    /// General web search - default mode
    General,
    /// Code-focused search - optimized for programming queries
    Code,
    /// Academic search - optimized for scholarly content
    Academic,
    /// News search - recent news articles
    News,
    /// Deep research - comprehensive multi-step research
    Research,
}

impl SearchType {
    /// Parse search type from string.
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "general" | "web" => Some(Self::General),
            "code" | "programming" => Some(Self::Code),
            "academic" | "scholarly" | "research" => Some(Self::Academic),
            "news" => Some(Self::News),
            "deep_research" | "deep-research" | "research_deep" => Some(Self::Research),
            _ => None,
        }
    }

    /// Get the appropriate Perplexity model for this search type.
    #[must_use]
    pub fn to_perplexity_model(self) -> PerplexityModel {
        match self {
            Self::General | Self::News => PerplexityModel::Sonar,
            Self::Code => PerplexityModel::SonarPro, // Pro for better code understanding
            Self::Academic => PerplexityModel::SonarReasoning, // Reasoning for academic analysis
            Self::Research => PerplexityModel::SonarDeepResearch, // Deep research for comprehensive analysis
        }
    }

    /// Get domain filters for this search type.
    ///
    #[must_use]
    pub fn domain_filters(self) -> Vec<String> {
        match self {
            Self::Code => vec![
                "github.com".to_string(),
                "stackoverflow.com".to_string(),
                "docs.rs".to_string(),
                "crates.io".to_string(),
                "npmjs.com".to_string(),
                "pypi.org".to_string(),
                "dev.to".to_string(),
                "medium.com".to_string(),
            ],
            Self::Academic => vec![
                "arxiv.org".to_string(),
                "scholar.google.com".to_string(),
                "pubmed.ncbi.nlm.nih.gov".to_string(),
                "researchgate.net".to_string(),
                "ieee.org".to_string(),
                "acm.org".to_string(),
                "nature.com".to_string(),
                "sciencedirect.com".to_string(),
            ],
            Self::News => vec![
                "reuters.com".to_string(),
                "bbc.com".to_string(),
                "nytimes.com".to_string(),
                "theguardian.com".to_string(),
                "washingtonpost.com".to_string(),
                "techcrunch.com".to_string(),
                "arstechnica.com".to_string(),
            ],
            _ => vec![], // No domain filters for general search
        }
    }

    /// Get system prompt suffix for this search type.
    #[must_use]
    pub fn system_prompt_suffix(self) -> &'static str {
        match self {
            Self::General => "",
            Self::Code => "Focus on code examples, documentation, and programming best practices. Include relevant code snippets when available.",
            Self::Academic => "Focus on peer-reviewed research, academic papers, and scholarly sources. Cite specific studies and findings.",
            Self::News => "Focus on recent news articles and current events. Prioritize recent and authoritative news sources.",
            Self::Research => "Conduct comprehensive research across multiple sources. Provide in-depth analysis with detailed citations.",
        }
    }
}

/// Citation structure for search results.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citation {
    /// Citation index (1-based)
    pub index: usize,
    /// Source URL
    pub url: String,
    /// Source title (if available)
    pub title: Option<String>,
    /// Snippet from the source
    pub snippet: Option<String>,
}

/// Search result structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// Title of the result
    pub title: String,
    /// URL of the result
    pub url: String,
    /// Snippet or description
    pub snippet: String,
    /// Source name
    pub source: String,
    /// Result type (e.g., "instant_answer", "related_topic", "result")
    pub result_type: String,
}

static HTML_TAG_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?is)<[^>]+>").expect("valid HTML tag regex"));
static BRAVE_LINK_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<a href="(https?://[^"]+)"[^>]*class="[^"]*\bl1\b[^"]*""#)
        .expect("valid Brave link regex")
});
static BRAVE_TITLE_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?is)<div class="title[^"]*"[^>]*>(.*?)</div>"#).expect("valid Brave title regex")
});
static BRAVE_SNIPPET_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"(?is)<div class="generic-snippet[^"]*">.*?<div class="content [^"]*"[^>]*>(.*?)</div>"#,
    )
    .expect("valid Brave snippet regex")
});

/// Executor for web search operations.
pub struct SearchExecutor;

impl SearchExecutor {
    /// Create a new search executor.
    pub fn new() -> Self {
        Self
    }

    /// Get Perplexity API key from SecretManager when the app handle is available.
    /// Falls back to the environment for legacy/background contexts.
    fn get_perplexity_api_key(app_handle: Option<&tauri::AppHandle>) -> Option<String> {
        if let Some(app_handle) = app_handle {
            use tauri::Manager;

            if let Some(secret_state) = app_handle.try_state::<SecretManagerState>() {
                if let Ok(secret) = secret_state.manager().get_secret("perplexity_api_key") {
                    let trimmed = secret.trim();
                    if !trimmed.is_empty() {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }

        std::env::var("PERPLEXITY_API_KEY")
            .ok()
            .filter(|key| !key.is_empty())
    }

    fn decode_html_entities(text: &str) -> String {
        text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&#x27;", "'")
            .replace("&apos;", "'")
            .replace("&nbsp;", " ")
    }

    fn clean_html_text(text: &str) -> String {
        let without_comments = text.replace("<!---->", "");
        let without_tags = HTML_TAG_RE.replace_all(&without_comments, " ");
        let decoded = Self::decode_html_entities(without_tags.as_ref());
        decoded.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    fn parse_brave_html_results(
        html: &str,
        num_results: usize,
    ) -> (Vec<SearchResult>, Vec<Citation>) {
        let mut results: Vec<SearchResult> = Vec::new();
        let mut citations: Vec<Citation> = Vec::new();
        let mut seen_urls = HashSet::new();

        for chunk in html.split("<div class=\"snippet ").skip(1) {
            if results.len() >= num_results {
                break;
            }

            let fragment = format!("<div class=\"snippet {}", chunk);

            let Some(link_match) = BRAVE_LINK_RE.captures(&fragment).and_then(|cap| cap.get(1))
            else {
                continue;
            };

            let url = Self::decode_html_entities(link_match.as_str());
            if url.is_empty() || !seen_urls.insert(url.clone()) {
                continue;
            }

            let title = BRAVE_TITLE_RE
                .captures(&fragment)
                .and_then(|cap| cap.get(1))
                .map(|m| Self::clean_html_text(m.as_str()))
                .unwrap_or_default();

            if title.is_empty() {
                continue;
            }

            let snippet = BRAVE_SNIPPET_RE
                .captures(&fragment)
                .and_then(|cap| cap.get(1))
                .map(|m| Self::clean_html_text(m.as_str()))
                .unwrap_or_default();

            let source = url::Url::parse(&url)
                .ok()
                .and_then(|u| u.host_str().map(|h| h.to_string()))
                .unwrap_or_else(|| "Brave".to_string());

            results.push(SearchResult {
                title: title.clone(),
                url: url.clone(),
                snippet: snippet.clone(),
                source,
                result_type: "web_result".to_string(),
            });

            citations.push(Citation {
                index: citations.len() + 1,
                url,
                title: Some(title),
                snippet: if snippet.is_empty() {
                    None
                } else {
                    Some(snippet)
                },
            });
        }

        (results, citations)
    }

    async fn search_with_brave_html_fallback(
        &self,
        query: &str,
        num_results: usize,
    ) -> Result<(Vec<SearchResult>, Vec<Citation>)> {
        let encoded_query = urlencoding::encode(query);
        let url = format!(
            "https://search.brave.com/search?q={}&source=web",
            encoded_query
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header("User-Agent", "AGI Workforce Desktop/1.0")
            .header("Accept", "text/html")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| anyhow!("Brave fallback request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Brave fallback request returned error status: {}",
                response.status()
            ));
        }

        let html = response
            .text()
            .await
            .map_err(|e| anyhow!("Failed to read Brave fallback response: {}", e))?;

        let (results, citations) = Self::parse_brave_html_results(&html, num_results);
        if results.is_empty() {
            return Err(anyhow!("Brave fallback returned no parsable results"));
        }

        Ok((results, citations))
    }

    /// Execute search using Perplexity API.
    async fn search_with_perplexity(
        &self,
        query: &str,
        search_type: SearchType,
        num_results: usize,
        api_key: &str,
    ) -> Result<Value> {
        let config = RequestConfig {
            api_key: api_key.to_string(),
            timeout_secs: Some(60),
            max_retries: Some(2),
        };

        let model = search_type.to_perplexity_model();
        let client = PerplexityClient::with_model(config, model)
            .map_err(|e| anyhow!("Failed to create Perplexity client: {}", e))?;

        // Build the search query with any type-specific enhancements
        let enhanced_query = if !search_type.system_prompt_suffix().is_empty() {
            format!(
                "{}\n\n[Search focus: {}]",
                query,
                search_type.system_prompt_suffix()
            )
        } else {
            query.to_string()
        };

        tracing::info!(
            "[SearchExecutor] Perplexity search: model={} query='{}'",
            model.as_str(),
            &enhanced_query[..enhanced_query.len().min(50)]
        );

        // Execute the search
        let response = client
            .search_with_model(&enhanced_query, model)
            .await
            .map_err(|e| anyhow!("Perplexity search failed: {}", e))?;

        // Extract content and citations
        let content = PerplexityClient::extract_content(&response);
        let citation_urls = PerplexityClient::extract_citations(&response);

        // Build citations with indices
        let citations: Vec<Citation> = citation_urls
            .iter()
            .take(num_results)
            .enumerate()
            .map(|(i, url)| Citation {
                index: i + 1,
                url: url.clone(),
                title: None,
                snippet: None,
            })
            .collect();

        // Build search results from citations
        let results: Vec<SearchResult> = citations
            .iter()
            .map(|citation| SearchResult {
                title: citation.title.clone().unwrap_or_else(|| {
                    // Extract domain as fallback title
                    url::Url::parse(&citation.url)
                        .ok()
                        .and_then(|u| u.host_str().map(|h| h.to_string()))
                        .unwrap_or_else(|| "Source".to_string())
                }),
                url: citation.url.clone(),
                snippet: citation.snippet.clone().unwrap_or_default(),
                source: "Perplexity".to_string(),
                result_type: "search_result".to_string(),
            })
            .collect();

        tracing::info!(
            "[SearchExecutor] Perplexity search completed: citations={} model={}",
            citations.len(),
            response.model
        );

        Ok(json!({
            "success": true,
            "query": query,
            "search_type": format!("{:?}", search_type).to_lowercase(),
            "provider": "perplexity",
            "model": response.model,
            "results_count": results.len(),
            "results": results,
            "answer": content,
            "citations": citations,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            },
            "has_results": !results.is_empty() || !content.is_empty()
        }))
    }

    /// Execute search using DuckDuckGo Instant Answer API (fallback).
    async fn search_with_duckduckgo(
        &self,
        query: &str,
        search_type: SearchType,
        num_results: usize,
    ) -> Result<Value> {
        tracing::info!(
            "[SearchExecutor] DuckDuckGo fallback search: query='{}'",
            &query[..query.len().min(50)]
        );

        // Use DuckDuckGo Instant Answer API (free, no API key required)
        let encoded_query = urlencoding::encode(query);
        let url = format!(
            "https://api.duckduckgo.com/?q={}&format=json&no_html=1&skip_disambig=1",
            encoded_query
        );

        let client = reqwest::Client::new();
        let response = client
            .get(&url)
            .header("User-Agent", "AGI Workforce Desktop/1.0")
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| anyhow!("Search request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(anyhow!(
                "Search request returned error status: {}",
                response.status()
            ));
        }

        let data: serde_json::Value = response
            .json()
            .await
            .map_err(|e| anyhow!("Failed to parse search results: {}", e))?;

        // Extract results from DuckDuckGo response
        let abstract_text = data["Abstract"].as_str().unwrap_or("");
        let abstract_source = data["AbstractSource"].as_str().unwrap_or("");
        let abstract_url = data["AbstractURL"].as_str().unwrap_or("");
        let heading = data["Heading"].as_str().unwrap_or("");
        let answer = data["Answer"].as_str().unwrap_or("");
        let answer_type = data["AnswerType"].as_str().unwrap_or("");

        let mut results: Vec<SearchResult> = Vec::new();
        let mut citations: Vec<Citation> = Vec::new();

        // Add the main abstract as a result if available
        if !abstract_text.is_empty() {
            results.push(SearchResult {
                title: heading.to_string(),
                url: abstract_url.to_string(),
                snippet: abstract_text.to_string(),
                source: abstract_source.to_string(),
                result_type: "instant_answer".to_string(),
            });

            if !abstract_url.is_empty() {
                citations.push(Citation {
                    index: citations.len() + 1,
                    url: abstract_url.to_string(),
                    title: Some(heading.to_string()),
                    snippet: Some(abstract_text.to_string()),
                });
            }
        }

        // Add direct answer if available
        if !answer.is_empty() {
            results.push(SearchResult {
                title: format!("Direct Answer ({})", answer_type),
                url: String::new(),
                snippet: answer.to_string(),
                source: "DuckDuckGo".to_string(),
                result_type: "direct_answer".to_string(),
            });
        }

        // Extract related topics
        if let Some(related_topics) = data["RelatedTopics"].as_array() {
            for topic in related_topics
                .iter()
                .take(num_results.saturating_sub(results.len()))
            {
                if let Some(topic_obj) = topic.as_object() {
                    // Regular topic
                    if let Some(text) = topic_obj.get("Text").and_then(|v| v.as_str()) {
                        let first_url = topic_obj
                            .get("FirstURL")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");

                        let title = text.split(" - ").next().unwrap_or(text).to_string();

                        results.push(SearchResult {
                            title: title.clone(),
                            url: first_url.to_string(),
                            snippet: text.to_string(),
                            source: "DuckDuckGo".to_string(),
                            result_type: "related_topic".to_string(),
                        });

                        if !first_url.is_empty() {
                            citations.push(Citation {
                                index: citations.len() + 1,
                                url: first_url.to_string(),
                                title: Some(title),
                                snippet: Some(text.to_string()),
                            });
                        }
                    }

                    // Nested topics (categories)
                    if let Some(topics) = topic_obj.get("Topics").and_then(|v| v.as_array()) {
                        for nested_topic in topics.iter().take(3) {
                            if let Some(text) = nested_topic.get("Text").and_then(|v| v.as_str()) {
                                let first_url = nested_topic
                                    .get("FirstURL")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("");

                                let title = text.split(" - ").next().unwrap_or(text).to_string();

                                results.push(SearchResult {
                                    title: title.clone(),
                                    url: first_url.to_string(),
                                    snippet: text.to_string(),
                                    source: "DuckDuckGo".to_string(),
                                    result_type: "related_topic".to_string(),
                                });

                                if !first_url.is_empty() {
                                    citations.push(Citation {
                                        index: citations.len() + 1,
                                        url: first_url.to_string(),
                                        title: Some(title),
                                        snippet: Some(text.to_string()),
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Extract results from Results array if available
        if let Some(ddg_results) = data["Results"].as_array() {
            for result in ddg_results
                .iter()
                .take(num_results.saturating_sub(results.len()))
            {
                if let Some(result_obj) = result.as_object() {
                    let text = result_obj
                        .get("Text")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let first_url = result_obj
                        .get("FirstURL")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");

                    let title = text.split(" - ").next().unwrap_or(text).to_string();

                    results.push(SearchResult {
                        title: title.clone(),
                        url: first_url.to_string(),
                        snippet: text.to_string(),
                        source: "DuckDuckGo".to_string(),
                        result_type: "result".to_string(),
                    });

                    if !first_url.is_empty() {
                        citations.push(Citation {
                            index: citations.len() + 1,
                            url: first_url.to_string(),
                            title: Some(title),
                            snippet: Some(text.to_string()),
                        });
                    }
                }
            }
        }

        let mut provider = "duckduckgo".to_string();
        let mut model = "instant_answer_api".to_string();
        let mut note = String::new();

        // If DuckDuckGo instant answers are empty, fall back to Brave HTML search.
        if results.is_empty() {
            match self
                .search_with_brave_html_fallback(query, num_results)
                .await
            {
                Ok((fallback_results, fallback_citations)) => {
                    tracing::info!(
                        "[SearchExecutor] Brave fallback provided {} web results",
                        fallback_results.len()
                    );
                    results = fallback_results;
                    citations = fallback_citations;
                    provider = "brave".to_string();
                    model = "html_search_fallback".to_string();
                    note = "DuckDuckGo Instant Answer API returned no results. Used Brave HTML fallback results.".to_string();
                }
                Err(e) => {
                    tracing::warn!("[SearchExecutor] Brave fallback failed: {}", e);
                    note = "DuckDuckGo Instant Answer API returned no results. Configure PERPLEXITY_API_KEY for broader web coverage.".to_string();
                }
            }
        }

        // Truncate to requested number of results
        results.truncate(num_results);
        citations.truncate(num_results);

        let has_results = !results.is_empty() || !abstract_text.is_empty() || !answer.is_empty();

        // Combine abstract and answer for the answer field
        let combined_answer = if !abstract_text.is_empty() && !answer.is_empty() {
            format!("{}\n\n{}", abstract_text, answer)
        } else if !abstract_text.is_empty() {
            abstract_text.to_string()
        } else if !answer.is_empty() {
            answer.to_string()
        } else {
            String::new()
        };

        tracing::info!(
            "[SearchExecutor] DuckDuckGo search completed: results={} has_instant_answer={}",
            results.len(),
            !abstract_text.is_empty()
        );

        Ok(json!({
            "success": true,
            "query": query,
            "search_type": format!("{:?}", search_type).to_lowercase(),
            "provider": provider,
            "model": model,
            "results_count": results.len(),
            "results": results,
            "answer": combined_answer,
            "citations": citations,
            "instant_answer": {
                "text": abstract_text,
                "source": abstract_source,
                "url": abstract_url,
                "heading": heading
            },
            "direct_answer": if !answer.is_empty() { Some(answer) } else { None },
            "has_results": has_results,
            "note": note
        }))
    }
}

impl Default for SearchExecutor {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl ToolExecutor for SearchExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["search_web"]
    }

    fn description(&self) -> &'static str {
        "Web search executor using Perplexity API with DuckDuckGo/Brave fallback"
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "search_web" => self
                .execute_search(parameters, context.app_handle.as_ref())
                .await,
            _ => Err(anyhow!("Unknown search tool: {}", tool_name)),
        }
    }
}

impl SearchExecutor {
    /// Execute a web search with typed parameters.
    ///
    /// This is a public entrypoint for Tauri commands and other internal callers.
    pub async fn run_search(
        &self,
        query: &str,
        search_type: SearchType,
        num_results: usize,
    ) -> Result<Value> {
        self.run_search_with_app_handle(None, query, search_type, num_results)
            .await
    }

    pub async fn run_search_with_app_handle(
        &self,
        app_handle: Option<&tauri::AppHandle>,
        query: &str,
        search_type: SearchType,
        num_results: usize,
    ) -> Result<Value> {
        // Validate query
        let query_trimmed = query.trim();
        if query_trimmed.is_empty() {
            return Err(anyhow!("Search query cannot be empty"));
        }

        if query_trimmed.len() > 500 {
            return Err(anyhow!(
                "Search query too long (max 500 characters, got {})",
                query_trimmed.len()
            ));
        }

        let num_results = num_results.clamp(1, 20);

        tracing::info!(
            "[SearchExecutor] search_web: query='{}' type={:?} num_results={}",
            &query_trimmed[..query_trimmed.len().min(50)],
            search_type,
            num_results
        );

        // Try Perplexity first if API key is available (all tiers)
        if let Some(api_key) = Self::get_perplexity_api_key(app_handle) {
            match self
                .search_with_perplexity(query_trimmed, search_type, num_results, &api_key)
                .await
            {
                Ok(result) => return Ok(result),
                Err(e) => {
                    tracing::warn!(
                        "[SearchExecutor] Perplexity search failed, falling back to DuckDuckGo: {}",
                        e
                    );
                    // Fall through to DuckDuckGo
                }
            }
        }

        // Fallback (or Hobby tier): DuckDuckGo
        self.search_with_duckduckgo(query_trimmed, search_type, num_results)
            .await
    }

    /// Execute search_web operation.
    ///
    /// Performs a web search using Perplexity API (if configured) with fallback to DuckDuckGo.
    /// Supports different search types: general, code, academic, news, research.
    async fn execute_search(
        &self,
        parameters: &HashMap<String, Value>,
        app_handle: Option<&tauri::AppHandle>,
    ) -> Result<Value> {
        let query = parameters
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing 'query' parameter"))?;

        let num_results = parameters
            .get("num_results")
            .and_then(|v| v.as_i64())
            .map(|n| n.clamp(1, 20) as usize)
            .unwrap_or(10);

        let search_type_str = parameters
            .get("search_type")
            .and_then(|v| v.as_str())
            .unwrap_or("general");

        // Parse search type
        let search_type = SearchType::from_str(search_type_str).unwrap_or_else(|| {
            tracing::warn!(
                "[SearchExecutor] Unknown search_type '{}', defaulting to 'general'",
                search_type_str
            );
            SearchType::General
        });

        self.run_search_with_app_handle(app_handle, query, search_type, num_results)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_search_executor_tool_names() {
        let executor = SearchExecutor::new();
        let names = executor.tool_names();

        assert!(names.contains(&"search_web"));
    }

    #[test]
    fn test_search_executor_description() {
        let executor = SearchExecutor::new();
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("search"));
    }

    #[test]
    fn test_search_type_parsing() {
        assert_eq!(SearchType::from_str("general"), Some(SearchType::General));
        assert_eq!(SearchType::from_str("web"), Some(SearchType::General));
        assert_eq!(SearchType::from_str("code"), Some(SearchType::Code));
        assert_eq!(SearchType::from_str("programming"), Some(SearchType::Code));
        assert_eq!(SearchType::from_str("academic"), Some(SearchType::Academic));
        assert_eq!(
            SearchType::from_str("scholarly"),
            Some(SearchType::Academic)
        );
        assert_eq!(SearchType::from_str("news"), Some(SearchType::News));
        assert_eq!(
            SearchType::from_str("deep_research"),
            Some(SearchType::Research)
        );
        assert_eq!(SearchType::from_str("GENERAL"), Some(SearchType::General));
        assert_eq!(SearchType::from_str("unknown"), None);
    }

    #[test]
    fn test_search_type_to_model() {
        assert_eq!(
            SearchType::General.to_perplexity_model(),
            PerplexityModel::Sonar
        );
        assert_eq!(
            SearchType::Code.to_perplexity_model(),
            PerplexityModel::SonarPro
        );
        assert_eq!(
            SearchType::Academic.to_perplexity_model(),
            PerplexityModel::SonarReasoning
        );
        assert_eq!(
            SearchType::Research.to_perplexity_model(),
            PerplexityModel::SonarDeepResearch
        );
    }

    #[test]
    fn test_search_type_domain_filters() {
        // General has no filters
        assert!(SearchType::General.domain_filters().is_empty());

        // Code has programming-related domains
        let code_filters = SearchType::Code.domain_filters();
        assert!(code_filters.contains(&"github.com".to_string()));
        assert!(code_filters.contains(&"stackoverflow.com".to_string()));

        // Academic has scholarly domains
        let academic_filters = SearchType::Academic.domain_filters();
        assert!(academic_filters.contains(&"arxiv.org".to_string()));
        assert!(academic_filters.contains(&"scholar.google.com".to_string()));
    }

    #[test]
    fn test_citation_serialization() {
        let citation = Citation {
            index: 1,
            url: "https://example.com".to_string(),
            title: Some("Example".to_string()),
            snippet: Some("Example snippet".to_string()),
        };

        let json = serde_json::to_value(&citation).unwrap();
        assert_eq!(json["index"], 1);
        assert_eq!(json["url"], "https://example.com");
        assert_eq!(json["title"], "Example");
    }

    #[test]
    fn test_search_result_serialization() {
        let result = SearchResult {
            title: "Test Title".to_string(),
            url: "https://test.com".to_string(),
            snippet: "Test snippet".to_string(),
            source: "Test".to_string(),
            result_type: "result".to_string(),
        };

        let json = serde_json::to_value(&result).unwrap();
        assert_eq!(json["title"], "Test Title");
        assert_eq!(json["url"], "https://test.com");
        assert_eq!(json["source"], "Test");
    }

    #[test]
    fn test_parse_brave_html_results_extracts_results() {
        let html = r#"
            <div class="snippet svelte-jmfu5f">
              <div class="result-wrapper">
                <div class="result-content">
                  <a href="https://www.agiworkforce.com/" target="_self" class="svelte-14r20fy l1">
                    <div class="title search-snippet-title line-clamp-1 svelte-14r20fy">AGI Workforce &amp; Platform</div>
                  </a>
                  <div class="generic-snippet svelte-1cwdgg3">
                    <div class="content desktop-default-regular t-primary line-clamp-dynamic svelte-1cwdgg3"><!---->Automate workflows with agents<!----></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="snippet svelte-jmfu5f">
              <div class="result-wrapper">
                <div class="result-content">
                  <a href="https://docs.agiworkforce.com/" target="_self" class="svelte-14r20fy l1">
                    <div class="title search-snippet-title line-clamp-1 svelte-14r20fy">Docs</div>
                  </a>
                  <div class="generic-snippet svelte-1cwdgg3">
                    <div class="content desktop-default-regular t-primary line-clamp-dynamic svelte-1cwdgg3">Technical documentation</div>
                  </div>
                </div>
              </div>
            </div>
        "#;

        let (results, citations) = SearchExecutor::parse_brave_html_results(html, 10);
        assert_eq!(results.len(), 2);
        assert_eq!(citations.len(), 2);
        assert_eq!(results[0].url, "https://www.agiworkforce.com/");
        assert_eq!(results[0].title, "AGI Workforce & Platform");
        assert_eq!(results[0].snippet, "Automate workflows with agents");
        assert_eq!(results[1].source, "docs.agiworkforce.com");
        assert_eq!(citations[1].index, 2);
    }

    #[tokio::test]
    async fn test_empty_query_validation() {
        let executor = SearchExecutor::new();
        let mut params = HashMap::new();
        params.insert("query".to_string(), Value::String("".to_string()));

        let result = executor.execute_search(&params, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("empty"));
    }

    #[tokio::test]
    async fn test_long_query_validation() {
        let executor = SearchExecutor::new();
        let mut params = HashMap::new();
        params.insert("query".to_string(), Value::String("a".repeat(501)));

        let result = executor.execute_search(&params, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("too long"));
    }

    #[tokio::test]
    async fn test_missing_query_parameter() {
        let executor = SearchExecutor::new();
        let params = HashMap::new();

        let result = executor.execute_search(&params, None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Missing"));
    }
}
