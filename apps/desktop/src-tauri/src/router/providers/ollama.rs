/**
 * Ollama Provider - Local LLM Inference (Zero Cost)
 *
 * Supported Models (November 2025):
 * - llama3.1:405b (Meta Llama 3.1 405B Instruct) - Most capable local model
 * - llama3.1:70b, llama3.1:8b - Smaller variants
 * - codellama:70b - Specialized for code
 * - mistral:latest - Mistral 7B
 * - mixtral:8x7b - Mixture of Experts
 * - llava:latest - Vision-capable model for image analysis
 * - bakllava:latest - Alternative vision model
 *
 * Install models: `ollama pull llama3.1:405b` or `ollama pull llava`
 * Note: Larger models (405B) require significant VRAM/RAM
 */
use crate::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::router::{ContentPart, LLMProvider, LLMRequest, LLMResponse};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct OllamaRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>, // base64 encoded images
}

#[derive(Debug, Clone, Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
struct OllamaResponse {
    model: String,
    message: OllamaMessage,
    #[serde(default)]
    _done: bool,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
}

pub struct OllamaProvider {
    client: Client,
    base_url: String,
}

impl OllamaProvider {
    pub fn new(base_url: Option<String>) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
        }
    }

    /// Extract images from multimodal content as base64 strings
    fn extract_images(multimodal: Option<&Vec<ContentPart>>) -> Option<Vec<String>> {
        multimodal.and_then(|parts| {
            let images: Vec<String> = parts
                .iter()
                .filter_map(|part| match part {
                    ContentPart::Image { image } => Some(base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        &image.data,
                    )),
                    _ => None,
                })
                .collect();

            if images.is_empty() {
                None
            } else {
                Some(images)
            }
        })
    }

    /// Check if model supports vision (llava models)
    fn model_supports_vision(model: &str) -> bool {
        model.to_lowercase().contains("llava")
            || model.to_lowercase().contains("bakllava")
            || model.to_lowercase().contains("vision")
    }
}

#[async_trait::async_trait]
impl LLMProvider for OllamaProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Extract images from the last user message (Ollama uses images at request level)
        let user_images = request
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .and_then(|m| Self::extract_images(m.multimodal_content.as_ref()));
        let supports_vision = Self::model_supports_vision(&request.model);
        let images = if supports_vision {
            user_images
        } else {
            if let Some(ref imgs) = user_images {
                tracing::debug!(
                    "Model '{}' does not support vision, dropping {} attached image(s)",
                    request.model,
                    imgs.len()
                );
            }
            None
        };

        let ollama_request = OllamaRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect(),
            stream: Some(false),
            options: Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            }),
            images,
        };

        let response = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .header("Content-Type", "application/json")
            .json(&ollama_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Ollama API error {}: {}", status, error_text).into());
        }

        let ollama_response: OllamaResponse = response.json().await?;

        let prompt_tokens = ollama_response.prompt_eval_count;
        let completion_tokens = ollama_response.eval_count;
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            (Some(p), None) => Some(p),
            (None, Some(c)) => Some(c),
            (None, None) => None,
        };

        Ok(LLMResponse {
            content: ollama_response.message.content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            cost: Some(0.0), // Ollama is local, no cost
            model: ollama_response.model,
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        // Ollama doesn't require API keys, check if server is reachable
        true
    }

    fn name(&self) -> &str {
        "Ollama"
    }

    fn supports_vision(&self) -> bool {
        true // Ollama supports vision via llava models
    }

    fn supports_function_calling(&self) -> bool {
        true // Some Ollama models support function calling via prompt engineering
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        // Extract images from the last user message (Ollama uses images at request level)
        let user_images = request
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .and_then(|m| Self::extract_images(m.multimodal_content.as_ref()));
        let supports_vision = Self::model_supports_vision(&request.model);
        let images = if supports_vision {
            user_images
        } else {
            if let Some(ref imgs) = user_images {
                tracing::debug!(
                    "Model '{}' does not support vision, dropping {} attached image(s)",
                    request.model,
                    imgs.len()
                );
            }
            None
        };

        let ollama_request = OllamaRequest {
            model: request.model.clone(),
            messages: request
                .messages
                .iter()
                .map(|m| OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect(),
            stream: Some(true), // Enable streaming
            options: Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            }),
            images,
        };

        tracing::debug!(
            "Starting Ollama streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .header("Content-Type", "application/json")
            .json(&ollama_request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Ollama API error {}: {}", status, error_text).into());
        }

        tracing::debug!("Ollama streaming response received, starting JSON line parsing");

        // Ollama uses JSON lines (newline-delimited JSON), which our parser handles
        Ok(Box::pin(parse_sse_stream(
            response,
            crate::router::Provider::Ollama,
        )))
    }
}
