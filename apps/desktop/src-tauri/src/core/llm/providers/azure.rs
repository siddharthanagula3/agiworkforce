//! Azure OpenAI provider module.
//!
//! Azure OpenAI uses a custom URL pattern and `api-key` header authentication
//! instead of the standard `Authorization: Bearer` token. The DirectApiProvider
//! already handles Azure through its `chat_endpoint()` and `apply_auth()` methods.
//!
//! This module provides a convenience constructor that validates Azure-specific
//! configuration (resource name, deployment name) and builds the correct base URL.

use super::direct_api_provider::DirectApiProvider;
use crate::core::llm::Provider;
use std::error::Error;

/// Build a `DirectApiProvider` configured for Azure OpenAI.
///
/// # Parameters
/// - `api_key`: The Azure API key (sent via `api-key` header).
/// - `resource_name`: The Azure resource name (e.g. "my-resource").
/// - `deployment_name`: The deployment/model name (e.g. "gpt-4o").
/// - `api_version`: Optional API version (defaults to "2024-10-21").
///
/// The constructed base URL follows Azure's pattern:
/// `https://{resource_name}.openai.azure.com/openai/deployments/{deployment_name}`
pub fn create_azure_provider(
    api_key: String,
    resource_name: &str,
    deployment_name: &str,
    _api_version: Option<&str>,
) -> Result<DirectApiProvider, Box<dyn Error + Send + Sync>> {
    if resource_name.is_empty() {
        return Err("Azure resource name is required".into());
    }
    if deployment_name.is_empty() {
        return Err("Azure deployment name is required".into());
    }

    // Validate resource name contains only alphanumeric and hyphens
    if !resource_name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-')
    {
        return Err("Azure resource name must contain only alphanumeric characters and hyphens".into());
    }

    let base_url = format!(
        "https://{}.openai.azure.com/openai/deployments/{}",
        resource_name, deployment_name
    );

    DirectApiProvider::new(Provider::Azure, api_key, Some(base_url))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_azure_provider_valid() {
        let provider = create_azure_provider(
            "test-key".to_string(),
            "my-resource",
            "gpt-4o",
            None,
        );
        assert!(provider.is_ok());
    }

    #[test]
    fn create_azure_provider_empty_resource() {
        let provider = create_azure_provider(
            "test-key".to_string(),
            "",
            "gpt-4o",
            None,
        );
        assert!(provider.is_err());
    }

    #[test]
    fn create_azure_provider_empty_deployment() {
        let provider = create_azure_provider(
            "test-key".to_string(),
            "my-resource",
            "",
            None,
        );
        assert!(provider.is_err());
    }

    #[test]
    fn create_azure_provider_invalid_resource_name() {
        let provider = create_azure_provider(
            "test-key".to_string(),
            "my resource!",
            "gpt-4o",
            None,
        );
        assert!(provider.is_err());
    }
}
