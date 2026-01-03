use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Available Perplexity Sonar models (2025)
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PerplexityModel {
    /// Standard search model - good balance of speed and quality
    Sonar,
    /// Pro search model - more thorough search and reasoning
    SonarPro,
    /// Reasoning model - best for complex questions requiring analysis
    SonarReasoning,
    /// Deep research model - comprehensive multi-step research
    SonarDeepResearch,
}

impl PerplexityModel {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Sonar => "sonar",
            Self::SonarPro => "sonar-pro",
            Self::SonarReasoning => "sonar-reasoning-pro",
            Self::SonarDeepResearch => "sonar-deep-research",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "sonar" => Some(Self::Sonar),
            "sonar-pro" => Some(Self::SonarPro),
            "sonar-reasoning" | "sonar-reasoning-pro" => Some(Self::SonarReasoning),
            "sonar-deep-research" => Some(Self::SonarDeepResearch),
            // Legacy model mapping
            "pplx-70b-online" | "pplx-7b-online" => Some(Self::Sonar),
            _ => None,
        }
    }
}

impl Default for PerplexityModel {
    fn default() -> Self {
        Self::Sonar
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

    /// Quick search using the default Sonar model
    pub async fn search(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, self.default_model).await
    }

    /// Search with a specific model
    pub async fn search_with_model(
        &self,
        query: &str,
        model: PerplexityModel,
    ) -> Result<PerplexityResponse> {
        let request = PerplexityRequest {
            model: model.as_str().to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: query.to_string(),
            }],
            temperature: Some(0.2),
            max_tokens: Some(4096),
            search_domain_filter: vec![],
            return_citations: true,
        };

        self.send_request(&request).await
    }

    /// Deep research query - uses sonar-deep-research for comprehensive analysis
    pub async fn deep_research(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, PerplexityModel::SonarDeepResearch)
            .await
    }

    /// Pro search - more thorough than standard search
    pub async fn search_pro(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, PerplexityModel::SonarPro)
            .await
    }

    /// Reasoning search - best for complex analytical questions
    pub async fn search_reasoning(&self, query: &str) -> Result<PerplexityResponse> {
        self.search_with_model(query, PerplexityModel::SonarReasoning)
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
        assert_eq!(PerplexityModel::Sonar.as_str(), "sonar");
        assert_eq!(PerplexityModel::SonarPro.as_str(), "sonar-pro");
        assert_eq!(
            PerplexityModel::SonarReasoning.as_str(),
            "sonar-reasoning-pro"
        );
        assert_eq!(
            PerplexityModel::SonarDeepResearch.as_str(),
            "sonar-deep-research"
        );
    }

    #[test]
    fn test_perplexity_model_from_str() {
        assert_eq!(
            PerplexityModel::from_str("sonar"),
            Some(PerplexityModel::Sonar)
        );
        assert_eq!(
            PerplexityModel::from_str("sonar-pro"),
            Some(PerplexityModel::SonarPro)
        );
        assert_eq!(
            PerplexityModel::from_str("SONAR"),
            Some(PerplexityModel::Sonar)
        );
        // Legacy model mapping
        assert_eq!(
            PerplexityModel::from_str("pplx-70b-online"),
            Some(PerplexityModel::Sonar)
        );
        assert_eq!(
            PerplexityModel::from_str("pplx-7b-online"),
            Some(PerplexityModel::Sonar)
        );
        assert_eq!(PerplexityModel::from_str("unknown"), None);
    }

    #[test]
    fn test_perplexity_request_serialization() {
        let request = PerplexityRequest {
            model: PerplexityModel::Sonar.as_str().to_string(),
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
        assert!(json.contains("sonar"));
        assert!(json.contains("What is AI?"));
    }

    #[test]
    fn test_extract_content() {
        let response = PerplexityResponse {
            id: "test-id".to_string(),
            model: "sonar".to_string(),
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
        assert_eq!(PerplexityModel::default(), PerplexityModel::Sonar);
    }
}
