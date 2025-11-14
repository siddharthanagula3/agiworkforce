use super::{APIError, RequestConfig, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Perplexity API client for search queries
pub struct PerplexityClient {
    client: reqwest::Client,
    api_key: String,
    base_url: String,
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
        if config.api_key.is_empty() {
            return Err(APIError::MissingAPIKey("Perplexity".to_string()));
        }

        let timeout = Duration::from_secs(config.timeout_secs.unwrap_or(30));
        let client = reqwest::Client::builder()
            .timeout(timeout)
            .build()
            .map_err(APIError::HttpError)?;

        Ok(Self {
            client,
            api_key: config.api_key,
            base_url: "https://api.perplexity.ai".to_string(),
        })
    }

    /// Search using Perplexity's online models
    pub async fn search(&self, query: &str) -> Result<PerplexityResponse> {
        let request = PerplexityRequest {
            model: "pplx-70b-online".to_string(), // Use online model for search
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

    /// Send a custom request to Perplexity
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

    /// Extract the main response content
    pub fn extract_content(response: &PerplexityResponse) -> String {
        response
            .choices
            .first()
            .map(|choice| choice.message.content.clone())
            .unwrap_or_default()
    }

    /// Extract citations from response
    pub fn extract_citations(response: &PerplexityResponse) -> Vec<String> {
        response.citations.clone().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_perplexity_request_serialization() {
        let request = PerplexityRequest {
            model: "pplx-70b-online".to_string(),
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
        assert!(json.contains("pplx-70b-online"));
        assert!(json.contains("What is AI?"));
    }

    #[test]
    fn test_extract_content() {
        let response = PerplexityResponse {
            id: "test-id".to_string(),
            model: "pplx-70b-online".to_string(),
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
}
