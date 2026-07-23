use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::prompt_tool_injection;
use crate::core::llm::sse_parser::{StreamChunk, StreamingToolCall};
use crate::core::llm::stream_engine::decode_direct_stream;
use crate::core::llm::{ContentPart, LLMProvider, LLMRequest, LLMResponse, ToolDefinition};
use futures_util::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use std::pin::Pin;

/// Hard cap on how many tools get injected as markdown text into the system
/// prompt for models without native tool-calling support (see
/// `prompt_tool_injection.rs`). Tool-native models are unaffected — they
/// still receive the full set via Ollama's compact structured `tools` field
/// below, which this cap does not touch.
///
/// Confirmed empirically (2026-07-11, docs/agent-context/known-flaws.md): a
/// realistic 111-tool catalog in this injected format measured 88.7s of
/// prompt-eval ALONE on an idle, warm Ollama instance — already at the
/// streaming timeout's edge before the model generated a single token. 111
/// tools stuffed into one small local model's context is wrong regardless of
/// timeout headroom; a cap keeps prompt-eval bounded and, per common
/// tool-selection-accuracy findings, likely improves the model's ability to
/// pick the right tool from a smaller list too.
const MAX_PROMPT_INJECTED_TOOLS: usize = 32;

/// Applies `MAX_PROMPT_INJECTED_TOOLS`, logging when the catalog is actually
/// truncated so a real user hitting this is diagnosable in the app log rather
/// than silently losing access to tools past the cap.
fn cap_tools_for_prompt_injection(tools: &[ToolDefinition]) -> &[ToolDefinition] {
    if tools.len() > MAX_PROMPT_INJECTED_TOOLS {
        tracing::warn!(
            "[Ollama] {} tool(s) enabled but this model has no native tool support; \
             only the first {} are injected into the system prompt to keep prompt-eval \
             time bounded — the remaining {} are unavailable this turn.",
            tools.len(),
            MAX_PROMPT_INJECTED_TOOLS,
            tools.len() - MAX_PROMPT_INJECTED_TOOLS,
        );
        &tools[..MAX_PROMPT_INJECTED_TOOLS]
    } else {
        tools
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
    /// Extended reasoning returned by Ollama reasoning models. This is
    /// intentionally kept separate from `content` so the renderer can present
    /// it in the shared collapsible thinking block instead of leaking it into
    /// the final answer.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

/// RETIRED by c2c (2026-07-16): request bodies are now built through the
/// shared `agiworkforce-llm` serializers (see [`build_ollama_chat_body`]);
/// byte-parity with this struct's serialization is proven by
/// `tests/c2c_request_oracle.rs` modulo the enumerated intentional deltas.
/// Kept until the founder-gated twin-deletion pass (the oracle holds its own
/// frozen verbatim copy of the old builder).
#[allow(dead_code)]
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
    /// Ollama's own extended-thinking toggle. Unlike Anthropic/OpenAI, where
    /// omitting a thinking parameter means "no extended thinking", Ollama's
    /// newer reasoning models (e.g. qwen3.5) default thinking ON at the API
    /// level -- omitting this field does NOT disable it. Must be forwarded
    /// explicitly whenever the caller has an opinion either way.
    #[serde(skip_serializing_if = "Option::is_none")]
    think: Option<bool>,
}

/// Translate the provider-agnostic `ThinkingParameter` into the plain
/// `think: bool` Ollama's `/api/chat` expects. Any variant other than an
/// explicit `Enabled(false)` is treated as "thinking wanted" since Ollama has
/// no equivalent to Anthropic-style budgets/adaptive levels.
fn resolve_ollama_think(thinking: Option<&crate::core::llm::ThinkingParameter>) -> Option<bool> {
    match thinking {
        Some(crate::core::llm::ThinkingParameter::Enabled(enabled)) => Some(*enabled),
        Some(_) => Some(true),
        None => None,
    }
}

/// RETIRED by c2c (2026-07-16) — see [`OllamaRequest`].
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
    /// Ollama's total context window (prompt + response tokens). Ollama
    /// silently defaults this to 4096 regardless of the model's real
    /// capability (e.g. qwen3.5's advertised 128K) unless set explicitly.
    /// AGI Workforce's "Claude Desktop-like" chat mode injects a large system
    /// prompt plus every enabled MCP tool's schema, which alone can consume
    /// nearly all of a 4096 window, leaving the model almost no budget to
    /// respond before Ollama truncates with `done_reason: "length"`. Set to a
    /// larger fixed value to leave real headroom for a response; still far
    /// below most local models' actual ceiling to avoid excessive KV-cache
    /// memory use on modest hardware. Follow-up: size this per-model from
    /// real capability metadata once available instead of one fixed value.
    #[serde(skip_serializing_if = "Option::is_none")]
    num_ctx: Option<u32>,
}

const OLLAMA_DEFAULT_NUM_CTX: u32 = 32768;

use crate::core::llm::provider_adapter::to_crate_tool_definitions;

/// Convert desktop `ChatMessage`s into shared-crate wire messages.
///
/// `images` (raw base64, already vision-gated by the caller) attach to the
/// LAST user message as `ContentBlock::Image` so the crate's nativization
/// emits them as that message's `images` array — Ollama's native `/api/chat`
/// vision format. (The retired local builder sent a TOP-LEVEL `images` field,
/// which `/api/chat` ignores; that placement fix is an enumerated c2c delta.)
fn to_wire_messages(
    messages: &[crate::core::llm::ChatMessage],
    images: Option<&[String]>,
) -> Vec<agiworkforce_llm::Message> {
    use agiworkforce_llm::{ContentBlock, Message};

    let last_user_idx = messages.iter().rposition(|m| m.role == "user");
    messages
        .iter()
        .enumerate()
        .map(|(idx, m)| {
            if m.role == "tool" {
                return Message::blocks(
                    "tool",
                    vec![ContentBlock::ToolResult {
                        tool_use_id: m.tool_call_id.clone().unwrap_or_default(),
                        content: m.content.clone(),
                        is_error: false,
                    }],
                );
            }
            let message_images = images
                .filter(|imgs| !imgs.is_empty() && Some(idx) == last_user_idx)
                .map(<[String]>::to_vec)
                .unwrap_or_default();
            let tool_calls = m.tool_calls.as_deref().unwrap_or_default();
            if message_images.is_empty() && tool_calls.is_empty() {
                return Message::text(&m.role, m.content.clone());
            }
            let mut blocks: Vec<ContentBlock> = Vec::new();
            if !m.content.is_empty() {
                blocks.push(ContentBlock::Text {
                    text: m.content.clone(),
                });
            }
            for b64 in message_images {
                blocks.push(ContentBlock::Image {
                    // The MIME only shapes the intermediate `data:` URL, which
                    // Ollama nativization strips back to the raw base64.
                    mime: "image/png".to_string(),
                    data_b64: b64,
                });
            }
            for tc in tool_calls {
                blocks.push(ContentBlock::ToolUse {
                    id: tc.id.clone(),
                    name: tc.name.clone(),
                    input: serde_json::from_str(&tc.arguments)
                        .unwrap_or_else(|_| serde_json::json!({})),
                });
            }
            Message::blocks(&m.role, blocks)
        })
        .collect()
}

/// c2c (2026-07-16): build the native `/api/chat` request body through the
/// shared `agiworkforce-llm` serializers instead of the retired local
/// `OllamaRequest` twin. Deliberately does NOT apply the crate's
/// `compact_ollama_message_values` system-prompt compaction — the desktop
/// never compacted, and adopting compaction is a separate product decision.
/// Byte-parity with the retired builder is proven by
/// `tests/c2c_request_oracle.rs` modulo the enumerated intentional deltas.
pub(crate) fn build_ollama_chat_body(
    request: &LLMRequest,
    effective_messages: &[crate::core::llm::ChatMessage],
    tools: Option<&[crate::core::llm::ToolDefinition]>,
    images: Option<&[String]>,
    stream: bool,
) -> serde_json::Value {
    use agiworkforce_llm::serialize::{
        convert_message_to_openai, ollama_chat_request_body, ollama_nativize_message_values,
    };

    let wire_messages = to_wire_messages(effective_messages, images);
    let mut api_messages: Vec<serde_json::Value> = wire_messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();
    ollama_nativize_message_values(&mut api_messages);

    let crate_tools = tools.map(to_crate_tool_definitions);
    ollama_chat_request_body(
        &request.model,
        api_messages,
        crate_tools.as_deref(),
        &agiworkforce_llm::OllamaRequestOpts {
            max_tokens: request.max_tokens.unwrap_or(0),
            temperature: request.temperature,
            think: resolve_ollama_think(request.thinking.as_ref()),
            num_ctx: Some(OLLAMA_DEFAULT_NUM_CTX),
            stream,
        },
    )
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
            base_url: base_url.unwrap_or_else(|| super::super::OLLAMA_DEFAULT_BASE_URL.to_string()),
        })
    }

    /// Checks whether the Ollama server is reachable by hitting the `/api/version` endpoint.
    /// Returns `true` when the server responds with a success status, `false` otherwise.
    /// This is intentionally a lightweight probe (no model load) suitable for pre-routing checks.
    pub async fn is_available(&self) -> bool {
        // Validate `base_url` up front so a malformed value (e.g. a stray partial
        // string left over from an in-progress settings edit, or a future caller
        // that bypasses the `llm_configure_provider` validation gate) produces a
        // clear, traceable log line instead of an opaque
        // `reqwest::Error{Builder, RelativeUrlWithoutBase}` that collapses into a
        // plain `false` with no indication of *why* Ollama looks unreachable.
        if let Err(e) = self.base_url.parse::<reqwest::Url>() {
            tracing::warn!(
                "Ollama base_url '{}' is not a valid URL, treating server as unavailable: {}",
                self.base_url,
                e
            );
            return false;
        }

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

    /// RETIRED by c2c (2026-07-16) — see [`OllamaRequest`]. Message conversion
    /// now flows through the shared crate serializers in
    /// [`build_ollama_chat_body`].
    #[allow(dead_code)]
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
                    thinking: None,
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
        let mut prompt_injected_tool_nonce: Option<String> = None;
        let (native_tools, effective_messages) = if let Some(req_tools) = &request.tools {
            if !req_tools.is_empty() {
                let caps = crate::core::llm::capability_detection::detect_ollama_capabilities(
                    &self.client,
                    &self.base_url,
                    &request.model,
                )
                .await;
                if caps.supports_tools {
                    (Some(req_tools.as_slice()), request.messages.clone())
                } else {
                    let capped_tools = cap_tools_for_prompt_injection(req_tools);
                    tracing::info!(
                        "[Ollama] Model {} does not support native tools \
                         — injecting {} tool(s) into system prompt",
                        request.model,
                        capped_tools.len(),
                    );
                    let injected =
                        prompt_tool_injection::inject_tools_into_system_prompt_with_nonce(
                            &request.messages,
                            capped_tools,
                        );
                    prompt_injected_tool_nonce = Some(injected.nonce.clone());
                    (None, injected.messages)
                }
            } else {
                (None, request.messages.clone())
            }
        } else {
            (None, request.messages.clone())
        };

        let body = build_ollama_chat_body(
            request,
            &effective_messages,
            native_tools,
            images.as_deref(),
            false,
        );

        let response = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .header("Content-Type", "application/json")
            .json(&body)
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
        let OllamaMessage {
            content: mut response_content,
            thinking,
            tool_calls,
            ..
        } = ollama_response.message;
        let reasoning_content = thinking.filter(|value| !value.trim().is_empty());

        let response_tool_calls = if let Some(tool_nonce) = prompt_injected_tool_nonce.as_deref() {
            // Parse tool calls the model attempted via text output
            let parsed = prompt_tool_injection::parse_tool_calls_from_text_with_nonce(
                &response_content,
                tool_nonce,
            );
            if !parsed.is_empty() {
                tracing::info!(
                    "[Ollama] Parsed {} prompt-injected tool call(s) from model {} text response",
                    parsed.len(),
                    request.model,
                );
                // Strip tool-call blocks from the content so the user sees clean text
                response_content = prompt_tool_injection::strip_tool_call_blocks(&response_content);
                Some(parsed)
            } else {
                None
            }
        } else {
            // Native tool calls from the Ollama API
            tool_calls.as_ref().map(|calls| {
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
                                    serde_json::to_string(a).unwrap_or_else(|_| "{}".to_string())
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
            reasoning_content,
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
        let mut prompt_injected_tool_nonce: Option<String> = None;
        let (native_tools, effective_messages) = if let Some(req_tools) = &request.tools {
            if !req_tools.is_empty() {
                let caps = crate::core::llm::capability_detection::detect_ollama_capabilities(
                    &self.client,
                    &self.base_url,
                    &request.model,
                )
                .await;
                if caps.supports_tools {
                    (Some(req_tools.as_slice()), request.messages.clone())
                } else {
                    let capped_tools = cap_tools_for_prompt_injection(req_tools);
                    tracing::info!(
                        "[Ollama] Model {} does not support native tools \
                         — injecting {} tool(s) into system prompt (streaming)",
                        request.model,
                        capped_tools.len(),
                    );
                    let injected =
                        prompt_tool_injection::inject_tools_into_system_prompt_with_nonce(
                            &request.messages,
                            capped_tools,
                        );
                    prompt_injected_tool_nonce = Some(injected.nonce.clone());
                    (None, injected.messages)
                }
            } else {
                (None, request.messages.clone())
            }
        } else {
            (None, request.messages.clone())
        };

        let body = build_ollama_chat_body(
            request,
            &effective_messages,
            native_tools,
            images.as_deref(),
            true,
        );

        tracing::debug!(
            "Starting Ollama streaming request for model: {}",
            request.model
        );

        let response = self
            .client
            .post(format!("{}/api/chat", self.base_url))
            .header("Content-Type", "application/json")
            .json(&body)
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

        // c2b: decode Ollama's `/api/chat` NDJSON through the shared engine
        // (byte-identical to the retired `parse_sse_stream` Ollama path modulo the
        // enumerated intentional decode fixes — proven by the c2a oracle).
        let inner_stream =
            decode_direct_stream(response, crate::core::llm::Provider::Ollama, &request.model);

        if let Some(tool_nonce) = prompt_injected_tool_nonce {
            // Wrap the stream to accumulate text and parse tool calls on the final chunk.
            let wrapped = PromptToolInjectionStream {
                inner: Box::pin(inner_stream),
                accumulated_text: String::new(),
                tool_nonce,
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
    tool_nonce: String,
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
                    let parsed = prompt_tool_injection::parse_tool_calls_from_text_with_nonce(
                        &self.accumulated_text,
                        &self.tool_nonce,
                    );
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
                        let cleaned =
                            prompt_tool_injection::strip_tool_call_blocks(&self.accumulated_text);
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

    fn make_tool(name: &str) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: "A test tool.".to_string(),
            parameters: serde_json::json!({"type": "object", "properties": {}}),
            strict: None,
        }
    }

    // -----------------------------------------------------------------
    // Regression tests for cap_tools_for_prompt_injection (2026-07-11): a
    // real, contention-free measurement showed a realistic 111-tool
    // catalog took 88.7s of prompt-eval ALONE for a non-tool-native local
    // model, already at the (now also fixed) streaming timeout's edge
    // before generation even started.
    // -----------------------------------------------------------------

    #[test]
    fn test_cap_tools_for_prompt_injection_leaves_a_small_catalog_untouched() {
        let tools: Vec<ToolDefinition> = (0..10).map(|i| make_tool(&format!("tool_{i}"))).collect();
        let capped = cap_tools_for_prompt_injection(&tools);
        assert_eq!(
            capped.len(),
            10,
            "a catalog under the cap must not be truncated"
        );
    }

    #[test]
    fn test_cap_tools_for_prompt_injection_truncates_a_111_tool_catalog() {
        let tools: Vec<ToolDefinition> =
            (0..111).map(|i| make_tool(&format!("tool_{i}"))).collect();
        let capped = cap_tools_for_prompt_injection(&tools);
        assert_eq!(
            capped.len(),
            MAX_PROMPT_INJECTED_TOOLS,
            "111 tools (the size observed live) must be truncated to the cap"
        );
    }

    #[test]
    fn test_cap_tools_for_prompt_injection_is_exactly_at_the_boundary() {
        let at_cap: Vec<ToolDefinition> = (0..MAX_PROMPT_INJECTED_TOOLS)
            .map(|i| make_tool(&format!("tool_{i}")))
            .collect();
        assert_eq!(
            cap_tools_for_prompt_injection(&at_cap).len(),
            MAX_PROMPT_INJECTED_TOOLS
        );

        let one_over: Vec<ToolDefinition> = (0..=MAX_PROMPT_INJECTED_TOOLS)
            .map(|i| make_tool(&format!("tool_{i}")))
            .collect();
        assert_eq!(
            cap_tools_for_prompt_injection(&one_over).len(),
            MAX_PROMPT_INJECTED_TOOLS
        );
    }

    #[test]
    fn test_cap_tools_for_prompt_injection_preserves_order_and_identity_of_kept_tools() {
        let tools: Vec<ToolDefinition> =
            (0..111).map(|i| make_tool(&format!("tool_{i}"))).collect();
        let capped = cap_tools_for_prompt_injection(&tools);
        for (i, tool) in capped.iter().enumerate() {
            assert_eq!(
                tool.name,
                format!("tool_{i}"),
                "kept tools must retain their original order"
            );
        }
    }

    #[test]
    fn test_ollama_request_shape_is_constructible_without_network() {
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

        assert!(provider.is_configured());
        assert_eq!(request.model, "tinyllama");
        assert_eq!(request.max_tokens, Some(10));
        assert!(!request.stream);
    }

    #[test]
    fn test_ollama_response_preserves_separate_thinking_content() {
        let response: OllamaResponse = serde_json::from_value(serde_json::json!({
            "model": "qwen3.5:latest",
            "message": {
                "role": "assistant",
                "thinking": "I should compare the relevant facts first.",
                "content": "The answer is 42."
            },
            "done": true,
            "eval_count": 12,
            "prompt_eval_count": 8
        }))
        .expect("Ollama response should deserialize");

        assert_eq!(
            response.message.thinking.as_deref(),
            Some("I should compare the relevant facts first.")
        );
        assert_eq!(response.message.content, "The answer is 42.");
    }

    /// A malformed `base_url` (e.g. a partial string with no scheme) must make
    /// `is_available()` return `false` quickly, without panicking or hanging on
    /// an opaque `reqwest::Error{Builder, RelativeUrlWithoutBase}`. This is a
    /// defense-in-depth check for callers that construct `OllamaProvider`
    /// without going through the `llm_configure_provider` validation gate.
    #[tokio::test]
    async fn test_is_available_returns_false_for_malformed_base_url() {
        let provider = OllamaProvider::new(Some("not-a-valid-url".to_string()))
            .expect("Failed to create provider");

        assert!(!provider.is_available().await);
    }

    #[tokio::test]
    async fn test_is_available_returns_false_for_empty_base_url() {
        let provider = OllamaProvider::new(Some(String::new())).expect("Failed to create provider");

        assert!(!provider.is_available().await);
    }
}
