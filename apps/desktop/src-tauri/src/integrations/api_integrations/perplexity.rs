use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Semantic roles for the current Perplexity search catalog.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PerplexityModel {
    /// Standard search model - good balance of speed and quality
    #[default]
    Fast,
    /// Pro search model - more thorough search and reasoning
    Thorough,
    /// Reasoning model - best for complex questions requiring analysis
    Reasoning,
    /// Deep research model - comprehensive multi-step research
    DeepResearch,
}

impl PerplexityModel {
    /// Catalog ID for this semantic search variant.
    ///
    /// Provider model names change independently of this API. Selection stays
    /// on catalog metadata so replacing a Perplexity model never requires an
    /// edit here.
    pub fn as_str(&self) -> &'static str {
        use crate::core::llm::models_config;

        let matches_variant = |entry: &&models_config::ModelEntry| {
            if entry.provider != "perplexity"
                || entry.model_type != "search"
                || entry.deprecated == Some(true)
            {
                return false;
            }
            match self {
                Self::Fast => entry.quality_tier == "fast" && !entry.capabilities.research,
                Self::Thorough => {
                    entry.quality_tier == "balanced"
                        && entry.capabilities.research
                        && !entry.capabilities.thinking
                }
                Self::Reasoning => entry.quality_tier == "balanced" && entry.capabilities.thinking,
                Self::DeepResearch => entry.quality_tier == "best" && entry.capabilities.research,
            }
        };

        models_config::get_all_model_entries()
            .values()
            .filter(matches_variant)
            .min_by(|left, right| left.id.cmp(&right.id))
            .map(|entry| entry.id.as_str())
            .unwrap_or_else(|| {
                models_config::get_default_model(&crate::core::llm::Provider::Perplexity)
            })
    }

    /// ID to put on the wire. The catalog owns `apiModelId`, so a Perplexity-side
    /// rename of an ID this enum still names reaches the request body without the
    /// enum being retyped.
    ///
    pub fn wire_id(&self) -> String {
        crate::core::llm::models_config::get_api_model_id(self.as_str())
    }

    pub fn from_str(s: &str) -> Option<Self> {
        let variants = [
            Self::Fast,
            Self::Thorough,
            Self::Reasoning,
            Self::DeepResearch,
        ];
        if let Some(variant) = variants.into_iter().find(|variant| {
            variant.as_str().eq_ignore_ascii_case(s) || variant.wire_id().eq_ignore_ascii_case(s)
        }) {
            return Some(variant);
        }

        None
    }
}

pub struct PerplexityClient {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
    default_model: PerplexityModel,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerplexityRequest {
    pub model: String,
    pub messages: Vec<Message>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(default = "default_search_domain_filter")]
    pub search_domain_filter: Vec<String>,
    #[serde(default = "default_return_citations")]
    pub return_citations: bool,
}

fn default_search_domain_filter() -> Vec<String> {
    vec![]
}

/// Perplexity rejects a `search_domain_filter` longer than 20 entries
/// (docs.perplexity.ai/guides/search-domain-filters, verified 2026-08-09).
/// Callers pass curated vertical allowlists, so clamp rather than error: a
/// slightly narrower allowlist still searches, a rejected request does not.
pub const MAX_SEARCH_DOMAIN_FILTERS: usize = 20;

fn default_return_citations() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerplexityResponse {
    pub id: String,
    pub model: String,
    pub created: u64,
    pub choices: Vec<Choice>,
    pub usage: Usage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub citations: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Choice {
    pub index: u32,
    pub message: Message,
    pub finish_reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Usage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

impl PerplexityClient {
    pub fn new(config: RequestConfig) -> Result<Self> {
        Self::with_model(config, PerplexityModel::default())
    }

    pub fn with_model(config: RequestConfig, model: PerplexityModel) -> Result<Self> {
        if config.api_key.is_empty() {
            return Err(APIError::MissingAPIKey("Perplexity".to_string()));
        }

        let timeout = Duration::from_secs(config.timeout_secs.unwrap_or(60));
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(APIError::HttpError)?;

        Ok(Self {
            client,
            api_key: config.api_key,
            base_url: "https://api.perplexity.ai".to_string(),
            default_model: model,
        })
    }

    /// Quick search using the default catalog-selected model.
    pub async fn search(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, self.default_model).await
    }

    /// Search with a specific model, across the whole web.
    pub async fn search_with_model(
        &self,
        query: &str,
        model: PerplexityModel,
    ) -> Result<PerplexityResponse> {
        self.search_with_model_in_domains(query, model, Vec::new())
            .await
    }

    pub async fn search_with_model_in_domains(
        &self,
        query: &str,
        model: PerplexityModel,
        domains: Vec<String>,
    ) -> Result<PerplexityResponse> {
        self.send_request(&Self::search_request(model, query, domains))
            .await
    }

    /// Build the request body for a search. Pure and public so callers can
    /// assert a vertical's domain allowlist actually reaches the wire without
    /// performing a network round trip.
    pub fn search_request(
        model: PerplexityModel,
        query: &str,
        mut domains: Vec<String>,
    ) -> PerplexityRequest {
        domains.truncate(MAX_SEARCH_DOMAIN_FILTERS);
        PerplexityRequest {
            model: model.wire_id(),
            messages: vec![Message {
                role: "user".to_string(),
                content: query.to_string(),
            }],
            temperature: Some(0.2),
            max_tokens: Some(4096),
            search_domain_filter: domains,
            return_citations: true,
        }
    }

    /// Deep research query using the catalog's best research variant.
    pub async fn deep_research(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, PerplexityModel::DeepResearch)
            .await
    }

    /// Pro search - more thorough than standard search
    pub async fn search_pro(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, PerplexityModel::Thorough)
            .await
    }

    /// Reasoning search - best for complex analytical questions
    pub async fn search_reasoning(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, PerplexityModel::Reasoning)
            .await
    }

    pub async fn send_request(&self, request: &PerplexityRequest) -> Result<PerplexityResponse> {
        let url = format!("{}/chat/completions", self.base_url);

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(request)
            .send()
            .await
            .map_err(APIError::HttpError)?;

        if response.status().is_success() {
            response
                .json::<PerplexityResponse>()
                .await
                .map_err(APIError::HttpError)
        } else if response.status().as_u16() == 429 {
            Err(APIError::RateLimitExceeded("Perplexity".to_string()))
        } else {
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            Err(APIError::APIError(format!(
                "Perplexity API error: {}",
                error_text
            )))
        }
    }

    pub fn extract_content(response: &PerplexityResponse) -> String {
        response
            .choices
            .first()
            .map(|choice| choice.message.content.clone())
            .unwrap_or_default()
    }

    pub fn extract_citations(response: &PerplexityResponse) -> Vec<String> {
        response.citations.clone().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perplexity_model_enum() {
        let ids = [
            PerplexityModel::Fast.as_str(),
            PerplexityModel::Thorough.as_str(),
            PerplexityModel::Reasoning.as_str(),
            PerplexityModel::DeepResearch.as_str(),
        ];
        assert!(ids.iter().all(|id| !id.is_empty()));
        let unique = ids.into_iter().collect::<std::collections::HashSet<_>>();
        assert_eq!(
            unique.len(),
            4,
            "every semantic variant needs a distinct catalog model"
        );
    }

    /// Every variant must name a live Perplexity search model in the shared
    /// catalog. Without this the enum can outlive a retired provider ID and keep
    /// putting it on the wire.
    #[test]
    fn variants_exist_in_catalog() {
        use crate::core::llm::models_config::config;

        for model in [
            PerplexityModel::Fast,
            PerplexityModel::Thorough,
            PerplexityModel::Reasoning,
            PerplexityModel::DeepResearch,
        ] {
            let entry = config().models.get(model.as_str()).unwrap_or_else(|| {
                panic!(
                    "PerplexityModel::{model:?} = \"{}\" is not in models.json",
                    model.as_str()
                )
            });
            assert_eq!(entry.provider, "perplexity", "{model:?} changed provider");
            assert_eq!(
                entry.model_type, "search",
                "{model:?} is not a search model"
            );
            assert!(!model.wire_id().is_empty(), "{model:?} has no wire id");
        }
    }

    #[test]
    fn test_perplexity_model_from_str() {
        let fast = PerplexityModel::Fast.as_str();
        let pro = PerplexityModel::Thorough.as_str();
        assert_eq!(PerplexityModel::from_str(fast), Some(PerplexityModel::Fast));
        assert_eq!(
            PerplexityModel::from_str(pro),
            Some(PerplexityModel::Thorough)
        );
        assert_eq!(
            PerplexityModel::from_str(&fast.to_uppercase()),
            Some(PerplexityModel::Fast)
        );
        // Legacy model mapping
        assert_eq!(PerplexityModel::from_str("unknown"), None);
    }

    #[test]
    fn test_perplexity_request_serialization() {
        let request = PerplexityRequest {
            model: PerplexityModel::Fast.as_str().to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: "What is AI?".to_string(),
            }],
            temperature: Some(0.2),
            max_tokens: Some(1000),
            search_domain_filter: vec![],
            return_citations: true,
        };

        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains(&request.model));
        assert!(json.contains("What is AI?"));
    }

    #[test]
    fn search_request_carries_the_domain_allowlist_and_clamps_it() {
        let request = PerplexityClient::search_request(
            PerplexityModel::Thorough,
            "how do I parse json in rust",
            vec!["github.com".to_string(), "docs.rs".to_string()],
        );
        assert_eq!(request.search_domain_filter, vec!["github.com", "docs.rs"]);
        assert_eq!(request.model, PerplexityModel::Thorough.wire_id());
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"search_domain_filter\""));
        assert!(json.contains("docs.rs"));

        // Perplexity rejects more than MAX_SEARCH_DOMAIN_FILTERS entries, so an
        // oversized allowlist must be trimmed rather than sent and refused.
        let oversized: Vec<String> = (0..MAX_SEARCH_DOMAIN_FILTERS + 5)
            .map(|i| format!("example{i}.com"))
            .collect();
        let clamped =
            PerplexityClient::search_request(PerplexityModel::Fast, "query", oversized.clone());
        assert_eq!(
            clamped.search_domain_filter.len(),
            MAX_SEARCH_DOMAIN_FILTERS
        );
        assert_eq!(
            clamped.search_domain_filter,
            oversized[..MAX_SEARCH_DOMAIN_FILTERS]
        );
    }

    #[test]
    fn test_extract_content() {
        let response = PerplexityResponse {
            id: "test-id".to_string(),
            model: "fixture-search-model".to_string(),
            created: 1234567890,
            choices: vec![Choice {
                index: 0,
                message: Message {
                    role: "assistant".to_string(),
                    content: "AI stands for Artificial Intelligence.".to_string(),
                },
                finish_reason: "stop".to_string(),
            }],
            usage: Usage {
                prompt_tokens: 10,
                completion_tokens: 20,
                total_tokens: 30,
            },
            citations: Some(vec!["https://example.com".to_string()]),
        };

        let content = PerplexityClient::extract_content(&response);
        assert_eq!(content, "AI stands for Artificial Intelligence.");

        let citations = PerplexityClient::extract_citations(&response);
        assert_eq!(citations.len(), 1);
    }

    #[test]
    fn test_default_model() {
        assert_eq!(PerplexityModel::default(), PerplexityModel::Fast);
    }
}
