use crate::core::router::sse_parser::{parse_sse_stream, StreamChunk};
use crate::core::router::{ContentPart, LLMProvider, LLMRequest, LLMResponse};
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
    images: Option<Vec<String>>,
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
            base_url: base_url.unwrap_or_else(|| "http://localhost:3000".to_string()),
        }
    }

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

        if self
            .client
            .get(format!("{}/api/tags", self.base_url))
            .timeout(std::time::Duration::from_secs(1))
            .send()
            .await
            .is_err()
        {
            return Err(
                "Ollama is unreachable. Please ensure 'ollama serve' is running in your terminal."
                    .into(),
            );
        }

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
            cost: Some(0.0),
            model: ollama_response.model,
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        true
    }

    fn name(&self) -> &str {
        "Ollama"
    }

    fn supports_vision(&self) -> bool {
        true
    }

    fn supports_function_calling(&self) -> bool {
        true
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
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
            stream: Some(true),
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

        Ok(Box::pin(parse_sse_stream(
            response,
            crate::core::router::Provider::Ollama,
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::router::{ChatMessage, LLMRequest};

    #[tokio::test]
    #[ignore]
    async fn test_real_ollama_connection_attempt() {
        let provider = OllamaProvider::new(None);

        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "tinyllama".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(10),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
        };

        let result = provider.send_message(&request).await;

        match result {
            Ok(response) => {
                println!("Ollama connection SUCCESS");
                println!("Response content: {}", response.content);
                assert!(
                    !response.content.is_empty(),
                    "Response content should not be empty"
                );
            }
            Err(e) => {
                panic!("Ollama connection FAILED: {}", e);
            }
        }
    }
}
