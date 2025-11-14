pub mod image_gen;
pub mod perplexity;
pub mod veo3;

use serde::{Deserialize, Serialize};

/// Common error type for API integrations
#[derive(Debug, thiserror::Error)]
pub enum APIError {
    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("API key not configured for {0}")]
    MissingAPIKey(String),

    #[error("Invalid API response: {0}")]
    InvalidResponse(String),

    #[error("Rate limit exceeded for {0}")]
    RateLimitExceeded(String),

    #[error("API error: {0}")]
    APIError(String),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),
}

pub type Result<T> = std::result::Result<T, APIError>;

/// Common request configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestConfig {
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
}

impl Default for RequestConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            timeout_secs: Some(30),
            max_retries: Some(3),
        }
    }
}
