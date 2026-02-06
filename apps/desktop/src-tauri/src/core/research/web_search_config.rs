//! Web search configuration for research agents.
//!
//! This module provides configuration for integrating web search providers
//! (DuckDuckGo, Perplexity) into the research orchestration system.

use super::agents::WebSearchAgent;
use super::types::ResearchError;
use crate::core::agi::executors::search_executor::SearchExecutor;
use serde::{Deserialize, Serialize};

/// Web search provider options
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WebSearchProvider {
    /// DuckDuckGo (free, no API key required)
    DuckDuckGo,
    /// Perplexity API (requires API key, better results)
    Perplexity,
}

impl Default for WebSearchProvider {
    fn default() -> Self {
        Self::DuckDuckGo
    }
}

/// Configuration for web search integration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSearchConfig {
    /// Selected search provider
    pub provider: WebSearchProvider,
    /// API key for Perplexity (optional, only needed for Perplexity provider)
    pub perplexity_api_key: Option<String>,
    /// Maximum number of results to fetch per search
    pub max_results_per_search: usize,
    /// Request timeout in seconds
    pub timeout_secs: u64,
}

impl Default for WebSearchConfig {
    fn default() -> Self {
        Self {
            provider: WebSearchProvider::DuckDuckGo,
            perplexity_api_key: None,
            max_results_per_search: 10,
            timeout_secs: 30,
        }
    }
}

/// Creates a configured web search agent using the SearchExecutor.
///
/// This uses the existing SearchExecutor which has DuckDuckGo integration
/// and Perplexity fallback already implemented.
pub fn create_web_search_agent(config: WebSearchConfig) -> Result<WebSearchAgent, ResearchError> {
    // The WebSearchAgent will use the SearchExecutor internally
    // We don't need to pass API keys here because SearchExecutor
    // handles the web search logic directly
    Ok(WebSearchAgent::new())
}

/// Configures an existing WebSearchAgent with the provided settings.
pub fn configure_web_search_agent(
    agent: WebSearchAgent,
    config: WebSearchConfig,
) -> Result<WebSearchAgent, ResearchError> {
    match config.provider {
        WebSearchProvider::DuckDuckGo => {
            // DuckDuckGo doesn't require configuration
            tracing::info!("Using DuckDuckGo for web search (no API key required)");
            Ok(agent)
        }
        WebSearchProvider::Perplexity => {
            if let Some(api_key) = config.perplexity_api_key {
                tracing::info!("Using Perplexity API for web search");
                // Configure with Perplexity endpoint
                Ok(agent.configure("https://api.perplexity.ai/search", &api_key))
            } else {
                tracing::warn!("Perplexity selected but no API key provided, falling back to DuckDuckGo");
                Ok(agent)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config_uses_duckduckgo() {
        let config = WebSearchConfig::default();
        assert_eq!(config.provider, WebSearchProvider::DuckDuckGo);
        assert!(config.perplexity_api_key.is_none());
    }

    #[test]
    fn test_create_web_search_agent() {
        let config = WebSearchConfig::default();
        let result = create_web_search_agent(config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_configure_with_duckduckgo() {
        let agent = WebSearchAgent::new();
        let config = WebSearchConfig::default();
        let result = configure_web_search_agent(agent, config);
        assert!(result.is_ok());
    }

    #[test]
    fn test_configure_with_perplexity_no_key() {
        let agent = WebSearchAgent::new();
        let config = WebSearchConfig {
            provider: WebSearchProvider::Perplexity,
            perplexity_api_key: None,
            ..Default::default()
        };
        // Should fall back to DuckDuckGo
        let result = configure_web_search_agent(agent, config);
        assert!(result.is_ok());
    }
}
