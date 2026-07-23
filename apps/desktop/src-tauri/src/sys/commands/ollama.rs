//! Ollama-specific Tauri commands for dynamic model fetching and status checking.
//!
//! This module provides commands to:
//! - Check if Ollama is running locally
//! - Fetch the list of installed Ollama models
//! - Get detailed model information

use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Represents an Ollama model with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModel {
    /// The model name (e.g., "llama3.2:latest")
    pub name: String,
    /// Size of the model in bytes
    pub size: u64,
    /// ISO 8601 timestamp of when the model was last modified
    pub modified_at: String,
    /// Model digest/hash
    #[serde(default)]
    pub digest: String,
    /// Additional model details
    #[serde(default)]
    pub details: OllamaModelDetails,
}

/// Detailed information about an Ollama model
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OllamaModelDetails {
    /// Parameter size (e.g., "7B", "13B")
    #[serde(default)]
    pub parameter_size: String,
    /// Quantization level (e.g., "Q4_0", "Q8_0")
    #[serde(default)]
    pub quantization_level: String,
    /// Model family (e.g., "llama", "mistral")
    #[serde(default)]
    pub family: String,
    /// Model families this model belongs to
    #[serde(default)]
    pub families: Vec<String>,
    /// Parent model name
    #[serde(default)]
    pub parent_model: String,
    /// Model format
    #[serde(default)]
    pub format: String,
}

/// Response from Ollama's /api/tags endpoint
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaApiModel>,
}

/// Internal representation of a model from Ollama's API
#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaApiModel {
    name: String,
    #[serde(default)]
    size: u64,
    #[serde(default)]
    modified_at: String,
    #[serde(default)]
    digest: String,
    #[serde(default)]
    details: Option<OllamaApiModelDetails>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct OllamaApiModelDetails {
    #[serde(default)]
    parameter_size: Option<String>,
    #[serde(default)]
    quantization_level: Option<String>,
    #[serde(default)]
    family: Option<String>,
    #[serde(default)]
    families: Option<Vec<String>>,
    #[serde(default)]
    parent_model: Option<String>,
    #[serde(default)]
    format: Option<String>,
}

use crate::core::llm::OLLAMA_DEFAULT_BASE_URL;

fn resolve_ollama_base_url(base_url: Option<String>) -> Result<String, String> {
    let candidate = base_url
        .as_deref()
        .unwrap_or(OLLAMA_DEFAULT_BASE_URL)
        .trim()
        .trim_end_matches('/');
    let parsed =
        url::Url::parse(candidate).map_err(|_| "Ollama URL must be a valid URL".to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Ollama URL must use http or https".to_string());
    }
    if parsed.host_str().is_none() {
        return Err("Ollama URL must include a host".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Ollama URL must not contain credentials".to_string());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("Ollama URL must not contain a query or fragment".to_string());
    }

    Ok(candidate.to_string())
}

/// Check if Ollama server is running and accessible
///
/// # Returns
/// - `Ok(true)` if Ollama is running and responding
/// - `Ok(false)` if Ollama is not running or not accessible
#[tauri::command]
pub async fn ollama_check_status(base_url: Option<String>) -> Result<bool, String> {
    let base_url = resolve_ollama_base_url(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    match client
        .get(format!("{}/api/tags", base_url))
        .timeout(Duration::from_secs(3))
        .send()
        .await
    {
        Ok(response) => Ok(response.status().is_success()),
        Err(_) => Ok(false),
    }
}

/// Fetch the list of installed Ollama models
///
/// # Returns
/// - `Ok(Vec<OllamaModel>)` with the list of installed models
/// - `Err` if Ollama is not running or the request fails
#[tauri::command]
pub async fn ollama_list_models(base_url: Option<String>) -> Result<Vec<OllamaModel>, String> {
    let base_url = resolve_ollama_base_url(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(format!("{}/api/tags", base_url))
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Ollama is not running. Start it with 'ollama serve' in your terminal.".to_string()
            } else if e.is_timeout() {
                "Connection to Ollama timed out. Please check if Ollama is running.".to_string()
            } else {
                format!("Failed to connect to Ollama: {}", e)
            }
        })?;

    if !response.status().is_success() {
        return Err(format!(
            "Ollama API returned error status: {}",
            response.status()
        ));
    }

    let tags_response: OllamaTagsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    let models = tags_response
        .models
        .into_iter()
        .map(|m| {
            let details = m.details.unwrap_or_default();
            OllamaModel {
                name: m.name,
                size: m.size,
                modified_at: m.modified_at,
                digest: m.digest,
                details: OllamaModelDetails {
                    parameter_size: details.parameter_size.unwrap_or_default(),
                    quantization_level: details.quantization_level.unwrap_or_default(),
                    family: details.family.unwrap_or_default(),
                    families: details.families.unwrap_or_default(),
                    parent_model: details.parent_model.unwrap_or_default(),
                    format: details.format.unwrap_or_default(),
                },
            }
        })
        .collect();

    Ok(models)
}

/// Get detailed information about a specific Ollama model
///
/// # Arguments
/// * `model_name` - The name of the model to get details for (e.g., "llama3.2:latest")
///
/// # Returns
/// - `Ok(OllamaModel)` with the model details
/// - `Err` if the model is not found or Ollama is not running
#[tauri::command]
pub async fn ollama_get_model_info(
    model_name: String,
    base_url: Option<String>,
) -> Result<OllamaModel, String> {
    let models = ollama_list_models(base_url).await?;

    models
        .into_iter()
        .find(|m| m.name == model_name || m.name.starts_with(&format!("{}:", model_name)))
        .ok_or_else(|| format!("Model '{}' not found in Ollama", model_name))
}

/// Pull a model from Ollama and wait for the download to complete.
///
/// # Arguments
/// * `model_name` - The name of the model to pull (e.g., "llama3.2", "mistral:7b")
///
/// # Returns
/// - `Ok(())` when the model is ready
/// - `Err` if the request fails
#[tauri::command]
pub async fn ollama_pull_model(model_name: String, base_url: Option<String>) -> Result<(), String> {
    if model_name.trim().is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let base_url = resolve_ollama_base_url(base_url)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(86400))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .post(format!("{}/api/pull", base_url))
        .json(&serde_json::json!({
            "name": model_name,
            "stream": false
        }))
        .timeout(Duration::from_secs(86400))
        .send()
        .await
        .map_err(|e| format!("Failed to initiate model pull: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to pull model: {}", error_text));
    }

    Ok(())
}

/// Delete an Ollama model
///
/// # Arguments
/// * `model_name` - The name of the model to delete
///
/// # Returns
/// - `Ok(())` if the model was deleted
/// - `Err` if the deletion fails
#[tauri::command]
pub async fn ollama_delete_model(
    model_name: String,
    base_url: Option<String>,
) -> Result<(), String> {
    if model_name.trim().is_empty() {
        return Err("Model name cannot be empty".to_string());
    }
    let base_url = resolve_ollama_base_url(base_url)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .delete(format!("{}/api/delete", base_url))
        .json(&serde_json::json!({
            "name": model_name
        }))
        .timeout(Duration::from_secs(30))
        .send()
        .await
        .map_err(|e| format!("Failed to delete model: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Failed to delete model: {}", error_text));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ollama_check_status_when_not_running() {
        // A running local Ollama returns true; an absent one returns false.
        // Either way the command must not turn connection refusal into an error.
        let result = ollama_check_status(None).await;
        assert!(result.is_ok());
    }

    #[test]
    fn resolves_configured_ollama_url_without_trailing_slash() {
        let url = resolve_ollama_base_url(Some("http://192.168.1.20:11434/".to_string())).unwrap();
        assert_eq!(url, "http://192.168.1.20:11434");
    }

    #[test]
    fn rejects_ollama_urls_with_embedded_credentials() {
        let result =
            resolve_ollama_base_url(Some("http://user:secret@localhost:11434".to_string()));
        assert_eq!(
            result.unwrap_err(),
            "Ollama URL must not contain credentials"
        );
    }

    #[test]
    fn test_ollama_model_serialization() {
        let model = OllamaModel {
            name: "llama3.2:latest".to_string(),
            size: 4_000_000_000,
            modified_at: "2024-01-15T10:30:00Z".to_string(),
            digest: "abc123".to_string(),
            details: OllamaModelDetails {
                parameter_size: "7B".to_string(),
                quantization_level: "Q4_0".to_string(),
                family: "llama".to_string(),
                families: vec!["llama".to_string()],
                parent_model: String::new(),
                format: "gguf".to_string(),
            },
        };

        let json = serde_json::to_string(&model).unwrap();
        assert!(json.contains("llama3.2:latest"));
        assert!(json.contains("7B"));
    }
}
