/**
 * Embedding Generator
 * Generates vector embeddings using Ollama (primary) or fastembed-rs (fallback)
 */
use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use super::Vector;

/// Embedding model selection
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EmbeddingModel {
    /// Ollama nomic-embed-text (768 dimensions, surpasses OpenAI ada-002)
    OllamaNomicEmbedText,
    /// Ollama mxbai-embed-large (1024 dimensions, high quality)
    OllamaMxbaiEmbedLarge,
    /// Local fastembed all-MiniLM-L6-v2 (384 dimensions, fast)
    FastembedAllMiniLM,
}

impl EmbeddingModel {
    pub fn dimensions(&self) -> usize {
        match self {
            Self::OllamaNomicEmbedText => 768,
            Self::OllamaMxbaiEmbedLarge => 1024,
            Self::FastembedAllMiniLM => 384,
        }
    }

    pub fn ollama_model_name(&self) -> Option<&str> {
        match self {
            Self::OllamaNomicEmbedText => Some("nomic-embed-text"),
            Self::OllamaMxbaiEmbedLarge => Some("mxbai-embed-large"),
            Self::FastembedAllMiniLM => None,
        }
    }
}

/// Configuration for embedding generation
#[derive(Debug, Clone)]
pub struct EmbeddingConfig {
    pub model: EmbeddingModel,
    pub ollama_url: String,
    pub enable_fallback: bool,
    pub timeout: Duration,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            model: EmbeddingModel::OllamaNomicEmbedText,
            ollama_url: "http://localhost:11434".to_string(),
            enable_fallback: true,
            timeout: Duration::from_secs(30),
        }
    }
}

/// Embedding generator
pub struct EmbeddingGenerator {
    config: EmbeddingConfig,
    client: Client,
}

impl EmbeddingGenerator {
    /// Create a new generator
    pub async fn new(config: EmbeddingConfig) -> Result<Self> {
        let client = Client::builder().timeout(config.timeout).build()?;

        let generator = Self { config, client };

        // Test Ollama connection if using Ollama model
        if generator.config.model.ollama_model_name().is_some() {
            if let Err(e) = generator.test_ollama_connection().await {
                tracing::warn!(
                    "Ollama connection test failed: {}. Will use fallback if enabled.",
                    e
                );

                if !generator.config.enable_fallback {
                    return Err(anyhow!("Ollama unavailable and fallback disabled"));
                }
            }
        }

        Ok(generator)
    }

    /// Test Ollama connection
    async fn test_ollama_connection(&self) -> Result<()> {
        let url = format!("{}/api/tags", self.config.ollama_url);
        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("Ollama returned status: {}", response.status()));
        }

        Ok(())
    }

    /// Generate embedding for text
    pub async fn generate(&self, text: &str) -> Result<Vector> {
        // Try Ollama first
        if let Some(model_name) = self.config.model.ollama_model_name() {
            match self.generate_ollama(text, model_name).await {
                Ok(embedding) => return Ok(embedding),
                Err(e) => {
                    tracing::warn!("Ollama embedding generation failed: {}", e);

                    if !self.config.enable_fallback {
                        return Err(e);
                    }

                    tracing::info!("Falling back to local embedding generation");
                }
            }
        }

        // Fallback to fastembed (if enabled)
        if self.config.enable_fallback {
            self.generate_fastembed(text).await
        } else {
            Err(anyhow!("Ollama unavailable and fallback disabled"))
        }
    }

    /// Generate embedding using Ollama
    async fn generate_ollama(&self, text: &str, model: &str) -> Result<Vector> {
        let url = format!("{}/api/embed", self.config.ollama_url);

        let request = OllamaEmbedRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let response = self
            .client
            .post(&url)
            .json(&request)
            .send()
            .await
            .context("Failed to send Ollama request")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Ollama error {}: {}", status, body));
        }

        let result: OllamaEmbedResponse = response
            .json()
            .await
            .context("Failed to parse Ollama response")?;

        // Ollama returns embeddings, take the first one
        result
            .embeddings
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("No embeddings in Ollama response"))
    }

    /// Generate embedding using fastembed-rs (local)
    async fn generate_fastembed(&self, text: &str) -> Result<Vector> {
        // NOTE: fastembed-rs requires downloading model files on first use
        // For now, return error indicating fastembed is not yet implemented
        // TODO: Implement fastembed integration in a separate PR
        Err(anyhow!(
            "Local fastembed generation not yet implemented. \
            Please ensure Ollama is running with 'ollama pull nomic-embed-text'"
        ))
    }

    /// Generate batch embeddings (more efficient for multiple texts)
    pub async fn generate_batch(&self, texts: &[&str]) -> Result<Vec<Vector>> {
        let mut embeddings = Vec::with_capacity(texts.len());

        for text in texts {
            let embedding = self.generate(text).await?;
            embeddings.push(embedding);
        }

        Ok(embeddings)
    }

    /// Get the dimensionality of embeddings
    pub fn dimensions(&self) -> usize {
        self.config.model.dimensions()
    }
}

#[derive(Debug, Serialize)]
struct OllamaEmbedRequest {
    model: String,
    input: String,
}

#[derive(Debug, Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vector>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ollama_connection() {
        let config = EmbeddingConfig::default();
        let generator = EmbeddingGenerator::new(config).await;

        // Should succeed if Ollama is running, otherwise should warn
        match generator {
            Ok(_) => println!("Ollama connection successful"),
            Err(e) => println!("Expected: Ollama not running - {}", e),
        }
    }

    #[tokio::test]
    async fn test_generate_embedding() {
        let config = EmbeddingConfig::default();

        if let Ok(generator) = EmbeddingGenerator::new(config).await {
            let text = "Hello, world! This is a test.";
            let result = generator.generate(text).await;

            match result {
                Ok(embedding) => {
                    assert_eq!(embedding.len(), 768); // nomic-embed-text dimensions
                    println!("Generated embedding with {} dimensions", embedding.len());
                }
                Err(e) => {
                    println!(
                        "Embedding generation failed (Ollama may not be running): {}",
                        e
                    );
                }
            }
        }
    }
}
