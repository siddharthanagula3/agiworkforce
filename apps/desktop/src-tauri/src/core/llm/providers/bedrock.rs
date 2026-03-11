//! AWS Bedrock provider stub.
//!
//! AWS Bedrock requires SigV4 signing for authentication, which is substantially
//! different from the Bearer-token or API-key patterns used by other providers.
//!
//! This module provides the provider structure and will return a clear error
//! message until the full SigV4 signing implementation is complete.

use crate::core::llm::{LLMProvider, LLMRequest, LLMResponse};
use async_trait::async_trait;
use std::error::Error;

/// AWS Bedrock provider configuration.
///
/// Bedrock uses AWS SigV4 request signing instead of API keys.
/// The endpoint pattern is:
/// `https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/converse`
pub struct BedrockProvider {
    /// AWS access key ID.
    _access_key: String,
    /// AWS secret access key.
    _secret_key: String,
    /// AWS region (e.g. "us-east-1").
    _region: String,
    /// Whether the provider has been configured with credentials.
    configured: bool,
}

impl BedrockProvider {
    /// Create a new BedrockProvider with AWS credentials.
    ///
    /// The provider is marked as configured if all credentials are non-empty.
    pub fn new(access_key: String, secret_key: String, region: String) -> Self {
        let configured =
            !access_key.is_empty() && !secret_key.is_empty() && !region.is_empty();
        Self {
            _access_key: access_key,
            _secret_key: secret_key,
            _region: region,
            configured,
        }
    }
}

#[async_trait]
impl LLMProvider for BedrockProvider {
    async fn send_message(
        &self,
        _request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        Err(
            "AWS Bedrock provider is not yet implemented. SigV4 signing support is coming soon. \
             Please use a different provider in the meantime."
                .into(),
        )
    }

    fn is_configured(&self) -> bool {
        self.configured
    }

    fn name(&self) -> &str {
        "Bedrock"
    }

    fn supports_vision(&self) -> bool {
        // Bedrock supports vision via Claude, Titan, etc.
        true
    }

    fn supports_function_calling(&self) -> bool {
        // Bedrock Converse API supports tool use
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bedrock_not_configured_when_empty() {
        let provider = BedrockProvider::new(String::new(), String::new(), String::new());
        assert!(!provider.is_configured());
    }

    #[test]
    fn bedrock_configured_with_credentials() {
        let provider = BedrockProvider::new(
            "AKIAIOSFODNN7EXAMPLE".to_string(),
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            "us-east-1".to_string(),
        );
        assert!(provider.is_configured());
    }

    #[tokio::test]
    async fn bedrock_send_message_returns_not_implemented() {
        let provider = BedrockProvider::new(
            "key".to_string(),
            "secret".to_string(),
            "us-east-1".to_string(),
        );
        let request = LLMRequest::default();
        let result = provider.send_message(&request).await;
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("not yet implemented"));
    }
}
