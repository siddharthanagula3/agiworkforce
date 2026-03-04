use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::prompt_tool_injection;
use crate::core::llm::sse_parser::{parse_sse_stream, StreamChunk, StreamingToolCall};
use crate::core::llm::{ContentPart, LLMProvider, LLMRequest, LLMResponse};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<serde_json::Value>>,
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
    pub fn new(base_url: Option<String>) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Self::with_config(base_url, HttpClientConfig::default())
    }

    /// Create a new Ollama provider with explicit proxy / CA certificate configuration.
    pub fn with_config(
        base_url: Option<String>,
        config: HttpClientConfig,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = create_http_client(&config)
            .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?;
        Ok(Self {
            client,
            base_url: base_url.unwrap_or_else(|| "http://localhost:11434".to_string()),
        })
    }

    /// Checks whether the Ollama server is reachable by hitting the `/api/version` endpoint.
    /// Returns `true` when the server responds with a success status, `false` otherwise.
    /// This is intentionally a lightweight probe (no model load) suitable for pre-routing checks.
    pub async fn is_available(&self) -> bool {
        let url = format!("{}/api/version", self.base_url);
        self.client
            .get(&url)
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
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
        let m = model.to_lowercase();
        m.contains("llava")
            || m.contains("bakllava")
            || m.contains("vision")
            || m.contains("moondream")
            || m.contains("minicpm")
            || m.contains("llama3-v")
            || m.contains("qwen-vl")
            // Modern vision-capable models (2025-2026)
            || m.contains("llama4-maverick")
            || m.contains("llama3.2-vision")
            || m.contains("gemma3")
            || m.contains("phi-4-multimodal")
            || m.contains("minicpm-v")
    }

    /// Convert a list of `ChatMessage`s to `OllamaMessage`s.
    fn to_ollama_messages(messages: &[crate::core::llm::ChatMessage]) -> Vec<OllamaMessage> {
        messages
            .iter()
            .map(|m| {
                let tool_calls = m.tool_calls.as_ref().map(|calls| {
                    calls
                        .iter()
                        .map(|tc| {
                            let args: serde_json::Value = serde_json::from_str(&tc.arguments)
                                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                            serde_json::json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": args
                                }
                            })
                        })
                        .collect()
                });
                OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                    tool_calls,
                    tool_call_id: m.tool_call_id.clone(),
                }
            })
            .collect()
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

        // Determine which tools (if any) to inject, gated on capability detection.
        // When the model lacks native tool support we inject tool descriptions into the
        // system prompt instead and will parse tool calls from the plain-text response.
        let mut prompt_injected_tools = false;
        let (tools, effective_messages) = if let Some(req_tools) = &request.tools {
            if !req_tools.is_empty() {
                let caps = crate::core::llm::capability_detection::detect_ollama_capabilities(
                    &self.client,
                    &self.base_url,
                    &request.model,
                )
                .await;
                if caps.supports_tools {
                    (
                        Some(
                            req_tools
                                .iter()
                                .map(|tool| {
                                    serde_json::json!({
                                        "type": "function",
                                        "function": {
                                            "name": tool.name,
                                            "description": tool.description,
                                            "parameters": tool.parameters
                                        }
                                    })
                                })
                                .collect::<Vec<_>>(),
                        ),
                        request.messages.clone(),
                    )
                } else {
                    tracing::info!(
                        "[Ollama] Model {} does not support native tools \
                         — injecting {} tool(s) into system prompt",
                        request.model,
                        req_tools.len(),
                    );
                    prompt_injected_tools = true;
                    let injected = prompt_tool_injection::inject_tools_into_system_prompt(
                        &request.messages,
                        req_tools,
                    );
                    (None, injected)
                }
            } else {
                (None, request.messages.clone())
            }
        } else {
            (None, request.messages.clone())
        };

        let ollama_request = OllamaRequest {
            model: request.model.clone(),
            messages: Self::to_ollama_messages(&effective_messages),
            stream: Some(false),
            options: Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            }),
            images,
            tools,
        };

        let response = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .header("Content-Type", "application/json")
            .json(&ollama_request)
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    "Ollama is unreachable. Please ensure 'ollama serve' is running in your terminal.".to_string()
                } else {
                    format!("Ollama request failed: {}", e)
                }
            })?;

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

        // Extract tool calls from the Ollama response.
        // Two paths: (1) prompt-injected tool calls parsed from the plain-text
        // response, (2) native tool calls returned by the Ollama API.
        let mut response_content = ollama_response.message.content;

        let response_tool_calls = if prompt_injected_tools {
            // Parse tool calls the model attempted via text output
            let parsed = prompt_tool_injection::parse_tool_calls_from_text(&response_content);
            if !parsed.is_empty() {
                tracing::info!(
                    "[Ollama] Parsed {} prompt-injected tool call(s) from model {} text response",
                    parsed.len(),
                    request.model,
                );
                // Strip tool-call blocks from the content so the user sees clean text
                response_content =
                    prompt_tool_injection::strip_tool_call_blocks(&response_content);
                Some(parsed)
            } else {
                None
            }
        } else {
            // Native tool calls from the Ollama API
            ollama_response.message.tool_calls.as_ref().map(|calls| {
                calls
                    .iter()
                    .filter_map(|tc| {
                        let func = tc.get("function")?;
                        let name = func.get("name")?.as_str()?.to_string();
                        let arguments = func
                            .get("arguments")
                            .map(|a| {
                                if a.is_string() {
                                    a.as_str().unwrap_or("{}").to_string()
                                } else {
                                    serde_json::to_string(a)
                                        .unwrap_or_else(|_| "{}".to_string())
                                }
                            })
                            .unwrap_or_else(|| "{}".to_string());
                        let id = tc
                            .get("id")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        Some(crate::core::llm::ToolCall {
                            id,
                            name,
                            arguments,
                        })
                    })
                    .collect::<Vec<_>>()
            })
        };

        let finish_reason = if response_tool_calls
            .as_ref()
            .is_some_and(|tc| !tc.is_empty())
        {
            Some("tool_calls".to_string())
        } else {
            None
        };

        Ok(LLMResponse {
            content: response_content,
            tokens: total_tokens,
            prompt_tokens,
            completion_tokens,
            cost: Some(0.0),
            model: ollama_response.model,
            tool_calls: response_tool_calls,
            finish_reason,
            ..LLMResponse::default()
        })
    }

    fn is_configured(&self) -> bool {
        !self.base_url.is_empty()
    }

    /// Delegates to the struct-level health-ping so the router can pre-filter Ollama
    /// from the candidate list when the local server is unreachable.
    async fn is_available(&self) -> bool {
        OllamaProvider::is_available(self).await
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

        // Determine which tools (if any) to inject, gated on capability detection.
        // When the model lacks native tool support we inject tool descriptions into the
        // system prompt and will parse tool calls from the accumulated text on the final chunk.
        let mut prompt_injected_tools = false;
        let (tools, effective_messages) = if let Some(req_tools) = &request.tools {
            if !req_tools.is_empty() {
                let caps = crate::core::llm::capability_detection::detect_ollama_capabilities(
                    &self.client,
                    &self.base_url,
                    &request.model,
                )
                .await;
                if caps.supports_tools {
                    (
                        Some(
                            req_tools
                                .iter()
                                .map(|tool| {
                                    serde_json::json!({
                                        "type": "function",
                                        "function": {
                                            "name": tool.name,
                                            "description": tool.description,
                                            "parameters": tool.parameters
                                        }
                                    })
                                })
                                .collect::<Vec<_>>(),
                        ),
                        request.messages.clone(),
                    )
                } else {
                    tracing::info!(
                        "[Ollama] Model {} does not support native tools \
                         — injecting {} tool(s) into system prompt (streaming)",
                        request.model,
                        req_tools.len(),
                    );
                    prompt_injected_tools = true;
                    let injected = prompt_tool_injection::inject_tools_into_system_prompt(
                        &request.messages,
                        req_tools,
                    );
                    (None, injected)
                }
            } else {
                (None, request.messages.clone())
            }
        } else {
            (None, request.messages.clone())
        };

        let ollama_request = OllamaRequest {
            model: request.model.clone(),
            messages: Self::to_ollama_messages(&effective_messages),
            stream: Some(true),
            options: Some(OllamaOptions {
                temperature: request.temperature,
                num_predict: request.max_tokens,
            }),
            images,
            tools,
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
            .await
            .map_err(|e| {
                if e.is_connect() {
                    "Ollama is unreachable. Please ensure 'ollama serve' is running in your terminal.".to_string()
                } else {
                    format!("Ollama streaming request failed: {}", e)
                }
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());
            return Err(format!("Ollama API error {}: {}", status, error_text).into());
        }

        tracing::debug!("Ollama streaming response received, starting JSON line parsing");

        let inner_stream = parse_sse_stream(response, crate::core::llm::Provider::Ollama);

        if prompt_injected_tools {
            // Wrap the stream to accumulate text and parse tool calls on the final chunk.
            let wrapped = PromptToolInjectionStream {
                inner: Box::pin(inner_stream),
                accumulated_text: String::new(),
            };
            Ok(Box::pin(wrapped))
        } else {
            Ok(Box::pin(inner_stream))
        }
    }
}

/// A stream wrapper that accumulates text from all chunks and, when the final
/// chunk arrives (`done == true`), parses any prompt-injected tool calls from
/// the accumulated text and attaches them to the final `StreamChunk`.
///
/// This is only used when the model does not support native function calling
/// and tools were injected into the system prompt instead.
struct PromptToolInjectionStream {
    inner: Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
    accumulated_text: String,
}

impl Stream for PromptToolInjectionStream {
    type Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>;

    fn poll_next(
        mut self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        match self.inner.as_mut().poll_next(cx) {
            std::task::Poll::Pending => std::task::Poll::Pending,
            std::task::Poll::Ready(None) => std::task::Poll::Ready(None),
            std::task::Poll::Ready(Some(Err(e))) => std::task::Poll::Ready(Some(Err(e))),
            std::task::Poll::Ready(Some(Ok(mut chunk))) => {
                // Accumulate text content
                self.accumulated_text.push_str(&chunk.content);

                if chunk.done {
                    // Final chunk: parse tool calls from the full accumulated text
                    let parsed =
                        prompt_tool_injection::parse_tool_calls_from_text(&self.accumulated_text);
                    if !parsed.is_empty() {
                        tracing::info!(
                            "[Ollama] Parsed {} prompt-injected tool call(s) from streaming response",
                            parsed.len(),
                        );
                        // Convert ToolCall -> StreamingToolCall for the chunk
                        let streaming_calls: Vec<StreamingToolCall> = parsed
                            .iter()
                            .enumerate()
                            .map(|(idx, tc)| StreamingToolCall {
                                index: idx,
                                id: tc.id.clone(),
                                name: tc.name.clone(),
                                arguments: tc.arguments.clone(),
                            })
                            .collect();

                        chunk.tool_calls = Some(streaming_calls);
                        chunk.finish_reason = Some("tool_calls".to_string());

                        // Clean tool-call blocks from the content so downstream
                        // consumers see clean conversational text.
                        let cleaned = prompt_tool_injection::strip_tool_call_blocks(
                            &self.accumulated_text,
                        );
                        chunk.content = cleaned;
                    }
                }

                std::task::Poll::Ready(Some(Ok(chunk)))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{ChatMessage, LLMRequest};

    #[tokio::test]
    #[ignore]
    async fn test_real_ollama_connection_attempt() {
        let provider = OllamaProvider::new(None).expect("Failed to create provider");

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
            ..Default::default()
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
