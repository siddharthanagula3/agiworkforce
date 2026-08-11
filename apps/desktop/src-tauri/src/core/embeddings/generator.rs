use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use super::Vector;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EmbeddingModel {
    /// Discover an installed Ollama model whose provider metadata declares
    /// embedding support. The concrete model identity stays runtime-owned.
    OllamaRuntime,
    /// Reserved for a future bundled embedding runtime. It remains explicitly
    /// unavailable until that runtime is actually wired.
    BundledUnavailable,
}

#[derive(Debug, Clone)]
pub struct EmbeddingConfig {
    pub model: EmbeddingModel,
    /// Optional model selected by Ollama runtime discovery or explicit local
    /// configuration. No provider model is compiled into the application.
    pub ollama_model: Option<String>,
    pub ollama_url: String,
    pub enable_fallback: bool,
    pub timeout: Duration,
}

impl Default for EmbeddingConfig {
    fn default() -> Self {
        Self {
            model: EmbeddingModel::OllamaRuntime,
            ollama_model: None,
            ollama_url: crate::core::llm::OLLAMA_DEFAULT_BASE_URL.to_string(),
            enable_fallback: true,
            timeout: Duration::from_secs(30),
        }
    }
}

pub struct EmbeddingGenerator {
    config: EmbeddingConfig,
    client: Client,
    ollama_model: Option<String>,
    observed_dimensions: AtomicUsize,
}

impl EmbeddingGenerator {
    /// Create a degraded generator that skips the async connection test.
    /// Used when the full async initialization fails and we need a valid but non-functional state.
    pub fn new_degraded(config: EmbeddingConfig) -> Result<Self> {
        let client = Client::builder().timeout(config.timeout).build()?;
        let ollama_model = config.ollama_model.clone();
        Ok(Self {
            config,
            client,
            ollama_model,
            observed_dimensions: AtomicUsize::new(0),
        })
    }

    pub async fn new(config: EmbeddingConfig) -> Result<Self> {
        let client = Client::builder().timeout(config.timeout).build()?;

        let mut ollama_model = config.ollama_model.clone();
        if config.model == EmbeddingModel::OllamaRuntime && ollama_model.is_none() {
            match crate::core::llm::capability_detection::find_installed_model_with_capability(
                &client,
                &config.ollama_url,
                "embedding",
            )
            .await
            {
                Ok(discovered) => ollama_model = Some(discovered),
                Err(error) => tracing::warn!(
                    "Ollama embedding-model discovery failed: {}. Will use fallback if enabled.",
                    error
                ),
            }
        }

        let generator = Self {
            config,
            client,
            ollama_model,
            observed_dimensions: AtomicUsize::new(0),
        };

        if generator.config.model == EmbeddingModel::OllamaRuntime {
            if let Err(e) = generator.test_ollama_connection().await {
                tracing::warn!(
                    "Ollama connection test failed: {}. Will use fallback if enabled.",
                    e
                );

                if !generator.config.enable_fallback {
                    return Err(anyhow!("Ollama unavailable and fallback disabled"));
                }
            }

            if generator.ollama_model.is_none() && !generator.config.enable_fallback {
                return Err(anyhow!(
                    "No installed Ollama model declares embedding capability"
                ));
            }
        }

        Ok(generator)
    }

    async fn test_ollama_connection(&self) -> Result<()> {
        let url = format!("{}/api/tags", self.config.ollama_url);
        let response = self.client.get(&url).send().await?;

        if !response.status().is_success() {
            return Err(anyhow!("Ollama returned status: {}", response.status()));
        }

        Ok(())
    }

    pub async fn generate(&self, text: &str) -> Result<Vector> {
        if let Some(model_name) = self.ollama_model.as_deref() {
            match self.generate_ollama(text, model_name).await {
                Ok(embedding) => {
                    self.observed_dimensions
                        .store(embedding.len(), Ordering::Relaxed);
                    return Ok(embedding);
                }
                Err(e) => {
                    tracing::warn!("Ollama embedding generation failed: {}", e);

                    if !self.config.enable_fallback {
                        return Err(e);
                    }

                    tracing::info!("Falling back to local embedding generation");
                }
            }
        }

        if self.config.enable_fallback {
            self.generate_fastembed(text).await
        } else {
            Err(anyhow!("Ollama unavailable and fallback disabled"))
        }
    }

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

        result
            .embeddings
            .into_iter()
            .next()
            .ok_or_else(|| anyhow!("No embeddings in Ollama response"))
    }

    async fn generate_fastembed(&self, _text: &str) -> Result<Vector> {
        Err(anyhow!(
            "Local embedding generation via fastembed is not available. To generate embeddings locally, \
             install and start Ollama (https://ollama.com), then install a model whose runtime metadata declares embedding capability. \
             Alternatively, configure an OpenAI or Google API key in Settings for cloud-based embeddings."
        ))
    }

    pub async fn generate_batch(&self, texts: &[&str]) -> Result<Vec<Vector>> {
        let mut embeddings = Vec::with_capacity(texts.len());

        for text in texts {
            let embedding = self.generate(text).await?;
            embeddings.push(embedding);
        }

        Ok(embeddings)
    }

    pub fn dimensions(&self) -> usize {
        self.observed_dimensions.load(Ordering::Relaxed)
    }

    /// Returns a stable identifier for the current embedding model.
    /// Used to tag stored embeddings so they are only compared within
    /// the same vector space.
    pub fn model_id(&self) -> String {
        match (&self.config.model, self.ollama_model.as_deref()) {
            (EmbeddingModel::OllamaRuntime, Some(model)) => format!("ollama:{model}"),
            (EmbeddingModel::OllamaRuntime, None) => "embedding:runtime-unresolved".to_string(),
            (EmbeddingModel::BundledUnavailable, _) => "embedding:bundled-unavailable".to_string(),
        }
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
                    assert!(!embedding.is_empty());
                    assert_eq!(generator.dimensions(), embedding.len());
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
