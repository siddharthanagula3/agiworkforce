use futures_util::Stream;
use serde_json::Value;
use std::collections::HashMap;
use std::error::Error;
use std::pin::Pin;
use std::task::{Context, Poll};

/// A single chunk of data received from a streaming LLM response (SSE).
/// Chunks are emitted incrementally and must be reassembled by the caller
/// into a complete `LLMResponse` once `done` is `true`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StreamChunk {
    /// The text content of this SSE chunk. May be an empty string for non-content
    /// events such as keepalives, tool-call deltas without text, or usage-only chunks.
    pub content: String,
    /// Whether this is the final chunk in the stream. When `true`, no further chunks
    /// will be emitted and the caller should finalize the assembled response.
    pub done: bool,
    /// Why the stream ended, if known. Common values: `"stop"` (natural end),
    /// `"length"` (max-token limit hit), `"tool_calls"` (model invoked a tool),
    /// `"content_filter"` (filtered by provider policy). `None` while streaming.
    pub finish_reason: Option<String>,
    /// The model identifier echoed back by the provider, if included in the response.
    pub model: Option<String>,
    /// Token usage information provided by the model, typically included only in
    /// the final chunk. `None` for intermediate chunks from most providers.
    pub usage: Option<TokenUsage>,
    /// Credit-deduction information returned by the AGI Workforce billing layer.
    /// `None` when billing is not active or for intermediate chunks.
    pub credits: Option<crate::core::llm::CreditsInfo>,
    /// Streaming tool-call deltas accumulated across chunks. Each entry corresponds
    /// to one tool invocation; `arguments` is built up incrementally as chunks arrive.
    /// `None` when the model is producing plain-text output with no tool calls.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<StreamingToolCall>>,
    /// Streaming reasoning/thinking text for providers that expose it separately
    /// from normal output text (for example Anthropic extended thinking or
    /// OpenAI reasoning summaries in the Responses API).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    /// When `true`, this chunk is a keepalive/heartbeat signal from the provider
    /// (e.g. SSE comment lines like `: keep-alive`, Anthropic `ping` events).
    /// The chunk carries no content but keeps the stream alive so idle-timeout
    /// watchdogs do not fire prematurely during long-running operations like
    /// image generation or extended thinking.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub keepalive: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    /// Anthropic: tokens read from prompt cache (billed at 0.1x input rate)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u32>,
    /// Anthropic: tokens written to prompt cache (billed at 1.25x input rate)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u32>,
}

/// Represents a streaming tool call that arrives in multiple chunks.
/// Tool calls are accumulated by index as chunks arrive.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StreamingToolCall {
    /// Index of this tool call in the array (used for accumulation)
    pub index: usize,
    /// Unique identifier for this tool call
    pub id: String,
    /// Name of the tool being called
    pub name: String,
    /// JSON arguments for the tool (accumulated across chunks)
    pub arguments: String,
}

const MAX_BUFFER_SIZE: usize = 1024 * 1024;

struct SseStreamParser {
    inner: Pin<Box<dyn Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send>>,
    buffer: Vec<u8>,
    provider: crate::core::llm::Provider,
    pending_chunks: std::collections::VecDeque<Result<StreamChunk, Box<dyn Error + Send + Sync>>>,
}

impl Unpin for SseStreamParser {}

impl SseStreamParser {
    fn new(response: reqwest::Response, provider: crate::core::llm::Provider) -> Self {
        Self {
            inner: Box::pin(response.bytes_stream()),
            buffer: Vec::new(),
            provider,
            pending_chunks: std::collections::VecDeque::new(),
        }
    }

    /// Check if an SSE event is a keepalive/comment that carries no data.
    /// SSE spec: lines starting with `:` are comments (used as keepalives).
    /// Also matches Anthropic `event: ping` and similar heartbeat patterns.
    fn is_keepalive_event(event: &str) -> bool {
        let trimmed = event.trim();
        // Pure SSE comment lines (`: keep-alive`, `: ping`, `: ok`, etc.)
        if trimmed.starts_with(':') {
            return true;
        }
        // Anthropic sends `event: ping\ndata: {}` as keepalive
        trimmed.lines().any(|line| {
            let l = line.trim();
            l == "event: ping" || l == "event:ping"
        })
    }

    fn process_buffer(&mut self) {
        let delimiter: &[u8] = crate::core::llm::models_config::get_sse_delimiter(&self.provider);

        while let Some(event_end) = self
            .buffer
            .windows(delimiter.len())
            .position(|window| window == delimiter)
        {
            let event_bytes = self.buffer[..event_end].to_vec();
            let delimiter_len = delimiter.len();
            self.buffer.drain(..event_end + delimiter_len);

            let event = String::from_utf8_lossy(&event_bytes).to_string();
            if event.trim().is_empty() {
                continue;
            }

            // Emit an empty keepalive chunk for SSE comments and ping events.
            // This is critical: without it, provider keepalives (`: keep-alive`,
            // `event: ping`) are silently dropped and `stream.next()` never
            // yields, causing the Rust-side idle timeout to fire even though
            // the TCP connection is alive and the provider is still working.
            if Self::is_keepalive_event(&event) {
                tracing::debug!("SSE keepalive received: {}", event.trim());
                self.pending_chunks.push_back(Ok(StreamChunk {
                    content: String::new(),
                    done: false,
                    finish_reason: None,
                    model: None,
                    usage: None,
                    credits: None,
                    tool_calls: None,
                    reasoning: None,
                    keepalive: true,
                }));
                continue;
            }

            match parse_sse_event(&event, self.provider) {
                Ok(chunk) => {
                    self.pending_chunks.push_back(Ok(chunk));
                }
                Err(e) => {
                    // Classify errors by their concrete type rather than fragile
                    // string matching.  There are three categories:
                    //
                    // 1. serde_json::Error  -- JSON parse failure on a partial SSE
                    //    chunk.  This is *expected* during streaming when a chunk
                    //    boundary splits a JSON payload.  Non-terminal: log a
                    //    warning and emit a keepalive so the idle-timeout resets.
                    //
                    // 2. Structured provider API errors -- the provider-specific
                    //    parsers (parse_openai_sse, parse_anthropic_sse, etc.)
                    //    detect `{"error": {...}}` in the response and return a
                    //    descriptive String error.  These are terminal.
                    //
                    // 3. Any other error (network, I/O, etc.) -- terminal.
                    let is_json_parse_error = e.downcast_ref::<serde_json::Error>().is_some();

                    if is_json_parse_error {
                        // Non-terminal: partial JSON chunk will be completed by
                        // the next bytes arriving on the stream.  Emit a keepalive
                        // so the idle timeout in chat/mod.rs gets reset.
                        tracing::warn!(
                            "JSON parse error on partial SSE chunk (continuing stream): {}",
                            e
                        );
                        self.pending_chunks.push_back(Ok(StreamChunk {
                            content: String::new(),
                            done: false,
                            finish_reason: None,
                            model: None,
                            usage: None,
                            credits: None,
                            tool_calls: None,
                            reasoning: None,
                            keepalive: true,
                        }));
                    } else {
                        // Terminal: provider API error, network error, or other
                        // unrecoverable failure.  Propagate to the caller.
                        tracing::error!("Terminal stream error: {}", e);
                        self.pending_chunks.push_back(Err(e));
                    }
                }
            }
        }
    }
}

impl Stream for SseStreamParser {
    type Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if !self.pending_chunks.is_empty() {
            return Poll::Ready(Some(
                self.pending_chunks
                    .pop_front()
                    .expect("pending_chunks was checked non-empty"),
            ));
        }

        match self.inner.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                if self.buffer.len() + bytes.len() > MAX_BUFFER_SIZE {
                    tracing::error!(
                        "SSE buffer exceeded max size of {}MB",
                        MAX_BUFFER_SIZE / 1024 / 1024
                    );
                    return Poll::Ready(Some(Err("SSE buffer size exceeded maximum limit".into())));
                }

                self.buffer.extend_from_slice(&bytes);

                self.process_buffer();

                if !self.pending_chunks.is_empty() {
                    return Poll::Ready(Some(
                        self.pending_chunks
                            .pop_front()
                            .expect("pending_chunks was checked non-empty"),
                    ));
                }

                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(Box::new(e)))),
            Poll::Ready(None) => {
                let buffer_str = String::from_utf8_lossy(&self.buffer);
                if !buffer_str.trim().is_empty() {
                    match parse_sse_event(&buffer_str, self.provider) {
                        Ok(chunk) => {
                            self.buffer.clear();
                            Poll::Ready(Some(Ok(chunk)))
                        }
                        Err(e) => {
                            self.buffer.clear();
                            Poll::Ready(Some(Err(e)))
                        }
                    }
                } else {
                    self.buffer.clear();
                    Poll::Ready(None)
                }
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

pub fn parse_sse_stream(
    response: reqwest::Response,
    provider: crate::core::llm::Provider,
) -> impl Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send {
    SseStreamParser::new(response, provider)
}

pub(crate) fn parse_sse_event(
    event: &str,
    provider: crate::core::llm::Provider,
) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    match provider {
        crate::core::llm::Provider::OpenAI => parse_openai_sse(event),
        crate::core::llm::Provider::Anthropic => parse_anthropic_sse(event),
        crate::core::llm::Provider::Google => parse_google_sse(event),
        crate::core::llm::Provider::Ollama => parse_ollama_sse(event),
        crate::core::llm::Provider::Perplexity => parse_openai_sse(event), // Perplexity uses OpenAI-compatible format
        crate::core::llm::Provider::XAI => parse_openai_sse(event),
        crate::core::llm::Provider::DeepSeek => parse_openai_sse(event),
        crate::core::llm::Provider::Qwen => parse_openai_sse(event),
        crate::core::llm::Provider::Moonshot => parse_openai_sse(event),
        crate::core::llm::Provider::Zhipu => parse_openai_sse(event), // ZhipuAI uses OpenAI-compatible format
        crate::core::llm::Provider::Mistral => parse_openai_sse(event), // Mistral uses OpenAI-compatible format
        crate::core::llm::Provider::ManagedCloud => parse_openai_sse(event), // ManagedCloud uses OpenAI-compatible format
        // New OpenAI-compatible providers
        crate::core::llm::Provider::Groq => parse_openai_sse(event),
        crate::core::llm::Provider::Together => parse_openai_sse(event),
        crate::core::llm::Provider::Fireworks => parse_openai_sse(event),
        crate::core::llm::Provider::Cerebras => parse_openai_sse(event),
        crate::core::llm::Provider::DeepInfra => parse_openai_sse(event),
        crate::core::llm::Provider::Cohere => parse_openai_sse(event),
        crate::core::llm::Provider::AI21 => parse_openai_sse(event),
        crate::core::llm::Provider::Sambanova => parse_openai_sse(event),
        crate::core::llm::Provider::Azure => parse_openai_sse(event), // Azure OpenAI uses OpenAI-compatible format
        // Bedrock uses its own event stream parser (BedrockEventStream), not SSE.
        // This branch should not be reached in practice; fallback to OpenAI format.
        crate::core::llm::Provider::Bedrock => parse_openai_sse(event),
        crate::core::llm::Provider::NvidiaNim => parse_openai_sse(event), // NVIDIA NIM uses OpenAI-compatible format
        crate::core::llm::Provider::OpenRouter => parse_openai_sse(event), // OpenRouter uses OpenAI-compatible format
    }
}

fn extract_data_payload(line: &str) -> Option<&str> {
    line.strip_prefix("data:")
        .map(|data| data.strip_prefix(' ').unwrap_or(data))
}

fn parse_openai_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;
    let mut credits = None;
    // Use a HashMap keyed by index so that out-of-order or duplicate indices
    // within the same SSE event are merged correctly instead of appended as
    // separate entries. The map is converted to a sorted Vec at the end.
    let mut tool_call_map: HashMap<usize, StreamingToolCall> = HashMap::new();

    // Track the last tool call index we saw across data: lines within this SSE
    // event. When a continuation delta omits the "index" field and the delta
    // array has only one element, falling back to array position (0) is wrong
    // if the actual tool call lives at a higher index. Using the last-seen
    // index is a much safer heuristic.
    let mut last_tool_call_index: Option<usize> = None;

    for line in event.lines() {
        if let Some(data) = extract_data_payload(line) {
            if data == "[DONE]" {
                done = true;
                break;
            }

            let json: Value = serde_json::from_str(data)?;
            let event_type = json.get("type").and_then(|t| t.as_str());

            // Check for API error responses in streaming format
            if let Some(error) = json.get("error") {
                let error_message = error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error");
                let error_type = error
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("api_error");
                let error_code = error.get("code").and_then(|c| c.as_str()).unwrap_or("");
                return Err(format!(
                    "OpenAI API error ({}{}): {}",
                    error_type,
                    if error_code.is_empty() {
                        String::new()
                    } else {
                        format!("/{}", error_code)
                    },
                    error_message
                )
                .into());
            }

            if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                if let Some(choice) = choices.first() {
                    if let Some(delta) = choice.get("delta") {
                        if let Some(text) = delta.get("content").and_then(|c| c.as_str()) {
                            content.push_str(text);
                        } else if let Some(parts) = delta.get("content").and_then(|c| c.as_array())
                        {
                            for part in parts {
                                if let Some(text) = part.as_str() {
                                    content.push_str(text);
                                } else if let Some(text) = part.get("text").and_then(|t| t.as_str())
                                {
                                    content.push_str(text);
                                }
                            }
                        }

                        if let Some(delta_tool_calls) =
                            delta.get("tool_calls").and_then(|tc| tc.as_array())
                        {
                            for (position, tool_call) in delta_tool_calls.iter().enumerate() {
                                // Prefer the explicit "index" field from the provider.
                                // Falling back to array position is dangerous because a
                                // single-element array with index=1 would be misassigned
                                // to 0. When the explicit index is missing AND the delta
                                // array has only one element, use the last-seen index
                                // (from a prior data: line) if available — this handles
                                // continuation deltas that carry only arguments without
                                // repeating the index. For multi-element arrays without
                                // explicit indices, fall back to array position (best we
                                // can do) and log a warning.
                                let explicit_index = tool_call
                                    .get("index")
                                    .and_then(|i| i.as_u64())
                                    .map(|idx| idx as usize);

                                let index = if let Some(idx) = explicit_index {
                                    idx
                                } else if delta_tool_calls.len() == 1 {
                                    // Single-element continuation: prefer last-seen index.
                                    last_tool_call_index.unwrap_or(position)
                                } else {
                                    tracing::warn!(
                                        "[SSE] Tool call delta at position {} missing 'index' \
                                        field in multi-tool chunk — falling back to array \
                                        position. This may corrupt tool call accumulation.",
                                        position
                                    );
                                    position
                                };

                                last_tool_call_index = Some(index);

                                let id = tool_call
                                    .get("id")
                                    .and_then(|i| i.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let name = tool_call
                                    .get("function")
                                    .and_then(|f| f.get("name"))
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let arguments = tool_call
                                    .get("function")
                                    .and_then(|f| f.get("arguments"))
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("")
                                    .to_string();

                                // Merge into the HashMap entry for this index.
                                // Multiple data: lines in the same SSE event can carry
                                // deltas for the same tool call index (e.g. first line
                                // sends id+name, second sends arguments). The HashMap
                                // guarantees O(1) lookup and prevents duplicate entries
                                // regardless of arrival order.
                                let entry = tool_call_map.entry(index).or_insert_with(|| {
                                    StreamingToolCall {
                                        index,
                                        id: String::new(),
                                        name: String::new(),
                                        arguments: String::new(),
                                    }
                                });
                                if !id.is_empty() {
                                    entry.id = id;
                                }
                                if !name.is_empty() {
                                    entry.name = name;
                                }
                                entry.arguments.push_str(&arguments);
                            }
                        }
                    }
                    if let Some(finish) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                        finish_reason = Some(finish.to_string());
                        done = true;
                    }
                }
            }

            // ── OpenAI Responses API fallback ───────────────────────────
            // The Responses API (used by o3, o4-mini, gpt-4.1) emits different
            // event types than Chat Completions.  Only activate when the Chat
            // Completions `choices` block above did not produce content.
            if content.is_empty() {
                // Handle Responses API text deltas. Support both the older underscore
                // event alias and the current dotted event name.
                if matches!(
                    event_type,
                    Some("output_text_delta") | Some("response.output_text.delta")
                ) {
                    if let Some(delta_text) = json.get("delta").and_then(|d| d.as_str()) {
                        content.push_str(delta_text);
                    }
                }

                // Handle response.output_item.done with full content
                if let Some(item) = json.get("item") {
                    if let Some(content_parts) = item.get("content").and_then(|c| c.as_array()) {
                        for part in content_parts {
                            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                content.push_str(text);
                            }
                        }
                    }
                }
            }

            if matches!(
                event_type,
                Some("response.reasoning_summary_text.delta")
                    | Some("reasoning_summary_text_delta")
                    | Some("response.reasoning_text.delta")
                    | Some("reasoning_text_delta")
            ) {
                if let Some(delta_text) = json
                    .get("delta")
                    .and_then(|d| d.as_str())
                    .or_else(|| json.get("text").and_then(|t| t.as_str()))
                    .or_else(|| json.get("summary_text").and_then(|t| t.as_str()))
                {
                    reasoning.push_str(delta_text);
                }
            }

            // Handle Responses API "response.completed" event with usage
            if let Some(response) = json.get("response") {
                if let Some(u) = response.get("usage") {
                    usage = Some(TokenUsage {
                        prompt_tokens: u
                            .get("input_tokens")
                            .or(u.get("prompt_tokens"))
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32),
                        completion_tokens: u
                            .get("output_tokens")
                            .or(u.get("completion_tokens"))
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32),
                        total_tokens: u
                            .get("total_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32),
                        cache_read_input_tokens: None,
                        cache_creation_input_tokens: None,
                    });
                }
                if response.get("status").and_then(|s| s.as_str()) == Some("completed") {
                    done = true;
                }
            }

            if let Some(m) = json.get("model").and_then(|m| m.as_str()) {
                model = Some(m.to_string());
            }

            if let Some(u) = json.get("usage") {
                usage = Some(TokenUsage {
                    prompt_tokens: u
                        .get("prompt_tokens")
                        .or(u.get("input_tokens"))
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    completion_tokens: u
                        .get("completion_tokens")
                        .or(u.get("output_tokens"))
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    total_tokens: u
                        .get("total_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    cache_read_input_tokens: None,
                    cache_creation_input_tokens: None,
                });
            }

            if let Some(c) = json.get("credits").and_then(|c| c.as_object()) {
                credits = Some(crate::core::llm::CreditsInfo {
                    cost_cents: c.get("cost_cents").and_then(|v| v.as_f64()).unwrap_or(0.0),
                    remaining_cents: c
                        .get("remaining_cents")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0),
                    daily_limit: c.get("daily_limit").and_then(|v| v.as_f64()),
                    daily_used: c.get("daily_used").and_then(|v| v.as_f64()),
                    daily_remaining: c.get("daily_remaining").and_then(|v| v.as_f64()),
                    daily_reset_at: c
                        .get("daily_reset_at")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                });
            }
        }
    }

    // Convert HashMap to Vec sorted by index for deterministic execution order.
    let mut tool_calls: Vec<StreamingToolCall> = tool_call_map.into_values().collect();
    tool_calls.sort_by_key(|tc| tc.index);

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        },
        reasoning: if reasoning.is_empty() {
            None
        } else {
            Some(reasoning)
        },
        keepalive: false,
    })
}

fn parse_anthropic_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;
    // Use HashMap keyed by block index so content_block_start and
    // content_block_delta for the same index merge correctly even if
    // events arrive out of order or are reprocessed.
    let mut tool_call_map: HashMap<usize, StreamingToolCall> = HashMap::new();

    let mut event_type = None;
    let mut data_str = None;

    for line in event.lines() {
        if let Some(evt) = line.strip_prefix("event: ") {
            event_type = Some(evt.to_string());
        } else if let Some(data) = extract_data_payload(line) {
            data_str = Some(data.to_string());
        }
    }

    if let Some(data) = data_str {
        let json: Value = serde_json::from_str(&data)?;

        // Determine event type: prefer explicit event: line, fallback to type field in JSON
        let effective_type = event_type
            .as_deref()
            .or_else(|| json.get("type").and_then(|t| t.as_str()));

        match effective_type {
            Some("error") => {
                let error_type = json
                    .get("error")
                    .and_then(|e| e.get("type"))
                    .and_then(|t| t.as_str())
                    .unwrap_or("unknown_error");
                let error_message = json
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error");
                return Err(
                    format!("Anthropic API error ({}): {}", error_type, error_message).into(),
                );
            }

            // ── content_block_start ──────────────────────────────────────
            // Anthropic signals a new content block (text, tool_use, or
            // server_tool_use).  For tool_use / server_tool_use we emit a
            // StreamingToolCall with the id + name so the accumulation
            // logic in chat/mod.rs can start tracking it by index.
            Some("content_block_start") => {
                if let Some(block) = json.get("content_block") {
                    let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    let index = json.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;

                    match block_type {
                        "tool_use" | "server_tool_use" => {
                            let id = block
                                .get("id")
                                .and_then(|i| i.as_str())
                                .unwrap_or("")
                                .to_string();
                            let name = block
                                .get("name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("")
                                .to_string();
                            let entry =
                                tool_call_map
                                    .entry(index)
                                    .or_insert_with(|| StreamingToolCall {
                                        index,
                                        id: String::new(),
                                        name: String::new(),
                                        arguments: String::new(),
                                    });
                            if !id.is_empty() {
                                entry.id = id;
                            }
                            if !name.is_empty() {
                                entry.name = name;
                            }
                        }
                        // web_search_tool_result / web_fetch_tool_result are
                        // server-side result blocks.  They don't need client
                        // execution – they are informational.  We surface them
                        // as text so the frontend can display them.
                        "web_search_tool_result" | "web_fetch_tool_result" => {
                            // These are result blocks from server-side tools.
                            // The actual search results are in the content_block
                            // and will be consumed by the model automatically.
                            // We just note that a search happened for the UI.
                            let tool_use_id = block
                                .get("tool_use_id")
                                .and_then(|t| t.as_str())
                                .unwrap_or("");
                            tracing::debug!(
                                "[Anthropic SSE] Server tool result block: {} for {}",
                                block_type,
                                tool_use_id
                            );
                        }
                        _ => {
                            // "text", "thinking", etc. – nothing to do here
                        }
                    }
                }
            }

            // ── content_block_delta ──────────────────────────────────────
            // Anthropic streams content incrementally via delta types:
            //   - text_delta        → regular text content
            //   - thinking_delta    → extended thinking content
            //   - input_json_delta  → partial JSON for tool_use arguments
            Some("content_block_delta") => {
                let index = json.get("index").and_then(|i| i.as_u64()).unwrap_or(0) as usize;

                if let Some(delta) = json.get("delta") {
                    let delta_type = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match delta_type {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                content.push_str(text);
                            }
                        }
                        "input_json_delta" => {
                            // Streaming tool call arguments as partial JSON.
                            // Merge into the HashMap entry for this index --
                            // the entry was typically created by content_block_start
                            // but the HashMap handles both cases uniformly.
                            let partial_json = delta
                                .get("partial_json")
                                .and_then(|p| p.as_str())
                                .unwrap_or("");
                            let entry =
                                tool_call_map
                                    .entry(index)
                                    .or_insert_with(|| StreamingToolCall {
                                        index,
                                        id: String::new(),
                                        name: String::new(),
                                        arguments: String::new(),
                                    });
                            entry.arguments.push_str(partial_json);
                        }
                        "thinking_delta" => {
                            if let Some(thinking_text) = delta
                                .get("thinking")
                                .and_then(|t| t.as_str())
                                .or_else(|| delta.get("text").and_then(|t| t.as_str()))
                            {
                                reasoning.push_str(thinking_text);
                            }
                        }
                        "signature_delta" => {
                            // Signature-only blocks carry no user-visible content.
                        }
                        _ => {}
                    }
                }
            }

            // ── content_block_stop ───────────────────────────────────────
            // Signals that a content block is complete.  We don't need to
            // do anything special – the accumulator in chat/mod.rs will
            // consider the tool call complete once it sees the message_delta
            // with stop_reason "tool_use".
            Some("content_block_stop") => {
                // No action needed; handled by accumulation logic.
            }

            Some("message_delta") => {
                if let Some(delta) = json.get("delta") {
                    if let Some(stop_reason) = delta.get("stop_reason").and_then(|r| r.as_str()) {
                        finish_reason = Some(stop_reason.to_string());
                        // Anthropic uses "end_turn" for normal completion and
                        // "tool_use" when the model wants to call tools.
                        // Both signal that the current message is done.
                        done = true;
                    }
                }
                if let Some(usage_data) = json.get("usage") {
                    let input = usage_data
                        .get("input_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32);
                    let output = usage_data
                        .get("output_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32);
                    let total = match (input, output) {
                        (Some(i), Some(o)) => Some(i + o),
                        (Some(i), None) => Some(i),
                        (None, Some(o)) => Some(o),
                        (None, None) => None,
                    };
                    let cache_read = usage_data
                        .get("cache_read_input_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32);
                    let cache_creation = usage_data
                        .get("cache_creation_input_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32);
                    usage = Some(TokenUsage {
                        prompt_tokens: input,
                        completion_tokens: output,
                        total_tokens: total,
                        cache_read_input_tokens: cache_read,
                        cache_creation_input_tokens: cache_creation,
                    });
                }
            }
            Some("message_stop") => {
                done = true;
            }
            Some("message_start") => {
                if let Some(m) = json
                    .get("message")
                    .and_then(|m| m.get("model"))
                    .and_then(|m| m.as_str())
                {
                    model = Some(m.to_string());
                }
                // Also extract usage from message_start (input token count
                // is available here for Anthropic).
                if let Some(msg) = json.get("message") {
                    if let Some(usage_data) = msg.get("usage") {
                        let input = usage_data
                            .get("input_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32);
                        let output = usage_data
                            .get("output_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32);
                        let total = match (input, output) {
                            (Some(i), Some(o)) => Some(i + o),
                            (Some(i), None) => Some(i),
                            (None, Some(o)) => Some(o),
                            (None, None) => None,
                        };
                        let cache_read = usage_data
                            .get("cache_read_input_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32);
                        let cache_creation = usage_data
                            .get("cache_creation_input_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32);
                        usage = Some(TokenUsage {
                            prompt_tokens: input,
                            completion_tokens: output,
                            total_tokens: total,
                            cache_read_input_tokens: cache_read,
                            cache_creation_input_tokens: cache_creation,
                        });
                    }
                }
            }
            Some("ping") => {
                // Keep-alive event, nothing to do.
            }
            _ => {}
        }
    }

    // Convert HashMap to Vec sorted by index for deterministic execution order.
    let mut tool_calls: Vec<StreamingToolCall> = tool_call_map.into_values().collect();
    tool_calls.sort_by_key(|tc| tc.index);

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits: None,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        },
        reasoning: if reasoning.is_empty() {
            None
        } else {
            Some(reasoning)
        },
        keepalive: false,
    })
}

fn parse_google_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;
    // Use HashMap so duplicate indices within the same event are merged.
    let mut tool_call_map: HashMap<usize, StreamingToolCall> = HashMap::new();
    let mut next_tool_index: usize = 0;

    for line in event.lines() {
        if let Some(data) = extract_data_payload(line) {
            let json: Value = serde_json::from_str(data)?;

            // Check for Google API error responses in streaming format
            if let Some(error) = json.get("error") {
                let error_message = error
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error");
                let error_code = error.get("code").and_then(|c| c.as_i64()).unwrap_or(0);
                let error_status = error
                    .get("status")
                    .and_then(|s| s.as_str())
                    .unwrap_or("UNKNOWN");
                return Err(format!(
                    "Google API error {} ({}): {}",
                    error_code, error_status, error_message
                )
                .into());
            }

            if let Some(candidates) = json.get("candidates").and_then(|c| c.as_array()) {
                if let Some(candidate) = candidates.first() {
                    if let Some(content_block) = candidate.get("content") {
                        if let Some(parts) = content_block.get("parts").and_then(|p| p.as_array()) {
                            for part in parts {
                                // Check for text content
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    content.push_str(text);
                                }
                                // Check for function calls (tool execution)
                                if let Some(function_call) = part.get("functionCall") {
                                    let name = function_call
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or("tool");
                                    let args = function_call
                                        .get("args")
                                        .map(|a| {
                                            serde_json::to_string(a)
                                                .unwrap_or_else(|_| "{}".to_string())
                                        })
                                        .unwrap_or_else(|| "{}".to_string());
                                    // Google doesn't provide IDs; generate one.
                                    // Use a monotonic counter for the index.
                                    let id = format!("call_{}", uuid::Uuid::new_v4());
                                    let idx = next_tool_index;
                                    next_tool_index += 1;
                                    let entry = tool_call_map.entry(idx).or_insert_with(|| {
                                        StreamingToolCall {
                                            index: idx,
                                            id: String::new(),
                                            name: String::new(),
                                            arguments: String::new(),
                                        }
                                    });
                                    entry.id = id;
                                    entry.name = name.to_string();
                                    entry.arguments.push_str(&args);
                                }
                            }
                        }
                    }
                    if let Some(finish) = candidate.get("finishReason").and_then(|f| f.as_str()) {
                        // Check for safety filter blocks before accepting the finish reason
                        match finish {
                            "SAFETY" | "BLOCKLIST" | "PROHIBITED_CONTENT" | "SPII" => {
                                return Err("Response was blocked by Google's safety filters. Try rephrasing your request or adjusting safety settings.".into());
                            }
                            "RECITATION" => {
                                return Err("Response was blocked due to recitation concerns. Try rephrasing your request.".into());
                            }
                            "MALFORMED_FUNCTION_CALL" => {
                                return Err("Google returned a malformed function call. Try simplifying your request or tool definitions.".into());
                            }
                            _ => {}
                        }
                        finish_reason = Some(finish.to_string());
                        done = true;
                    }
                }
            }

            if let Some(u) = json.get("usageMetadata") {
                usage = Some(TokenUsage {
                    prompt_tokens: u
                        .get("promptTokenCount")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    completion_tokens: u
                        .get("candidatesTokenCount")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    total_tokens: u
                        .get("totalTokenCount")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    cache_read_input_tokens: None,
                    cache_creation_input_tokens: None,
                });
            }

            if let Some(m) = json.get("model").and_then(|m| m.as_str()) {
                model = Some(m.to_string());
            }
        }
    }

    // Convert HashMap to Vec sorted by index for deterministic execution order.
    let mut tool_calls: Vec<StreamingToolCall> = tool_call_map.into_values().collect();
    tool_calls.sort_by_key(|tc| tc.index);

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits: None,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        },
        reasoning: None,
        keepalive: false,
    })
}

fn parse_ollama_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let json: Value = serde_json::from_str(event.trim())?;

    // Check for Ollama error responses
    if let Some(error) = json.get("error").and_then(|e| e.as_str()) {
        return Err(format!("Ollama error: {}", error).into());
    }

    let mut content = String::new();
    let mut done = false;
    let mut model = None;
    let mut usage = None;
    // Use HashMap for consistent index-based merging.
    let mut tool_call_map: HashMap<usize, StreamingToolCall> = HashMap::new();

    if let Some(message) = json.get("message") {
        if let Some(text) = message.get("content").and_then(|c| c.as_str()) {
            content.push_str(text);
        }

        // Parse tool calls from Ollama streaming messages
        if let Some(tc_arr) = message.get("tool_calls").and_then(|tc| tc.as_array()) {
            for (idx, call) in tc_arr.iter().enumerate() {
                if let Some(func) = call.get("function") {
                    let name = func
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("tool")
                        .to_string();
                    // Ollama may return arguments as object or string
                    let arguments =
                        if let Some(args_str) = func.get("arguments").and_then(|a| a.as_str()) {
                            args_str.to_string()
                        } else if let Some(args_val) = func.get("arguments") {
                            serde_json::to_string(args_val).unwrap_or_else(|_| "{}".to_string())
                        } else {
                            "{}".to_string()
                        };
                    let id = call
                        .get("id")
                        .and_then(|i| i.as_str())
                        .unwrap_or("")
                        .to_string();
                    let entry = tool_call_map
                        .entry(idx)
                        .or_insert_with(|| StreamingToolCall {
                            index: idx,
                            id: String::new(),
                            name: String::new(),
                            arguments: String::new(),
                        });
                    if !id.is_empty() {
                        entry.id = id;
                    }
                    if !name.is_empty() {
                        entry.name = name;
                    }
                    entry.arguments.push_str(&arguments);
                }
            }
        }
    }

    if let Some(d) = json.get("done").and_then(|d| d.as_bool()) {
        done = d;
    }

    if let Some(m) = json.get("model").and_then(|m| m.as_str()) {
        model = Some(m.to_string());
    }

    if done {
        let prompt_tokens = json
            .get("prompt_eval_count")
            .and_then(|t| t.as_u64())
            .map(|t| t as u32);
        let completion_tokens = json
            .get("eval_count")
            .and_then(|t| t.as_u64())
            .map(|t| t as u32);
        let total_tokens = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            (Some(p), None) => Some(p),
            (None, Some(c)) => Some(c),
            (None, None) => None,
        };

        if prompt_tokens.is_some() || completion_tokens.is_some() {
            usage = Some(TokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens,
                cache_read_input_tokens: None,
                cache_creation_input_tokens: None,
            });
        }
    }

    // Extract finish reason: Ollama sends done_reason when done=true.
    // Synthesize "tool_calls" if tool calls are present (Ollama doesn't always signal this).
    let finish_reason = if !tool_call_map.is_empty() {
        Some("tool_calls".to_string())
    } else if done {
        json.get("done_reason")
            .and_then(|r| r.as_str())
            .map(|r| r.to_string())
            .or_else(|| Some("stop".to_string()))
    } else {
        None
    };

    // Convert HashMap to Vec sorted by index for deterministic execution order.
    let mut tool_calls: Vec<StreamingToolCall> = tool_call_map.into_values().collect();
    tool_calls.sort_by_key(|tc| tc.index);

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits: None,
        tool_calls: if tool_calls.is_empty() {
            None
        } else {
            Some(tool_calls)
        },
        reasoning: None,
        keepalive: false,
    })
}

#[cfg(test)]
mod stream_tests {
    use super::*;
    use futures_util::StreamExt;
    use tokio_stream::iter;

    #[tokio::test]
    async fn test_sse_utf8_boundary_handling() {
        let chunk1 = b"data: {\"choices\":[{\"delta\":{\"content\":\"\xf0".to_vec();
        let chunk2 = b"\x9f\x9a\x80\"}}]}\n\n".to_vec();

        let stream = iter(vec![
            Ok(bytes::Bytes::from(chunk1)),
            Ok(bytes::Bytes::from(chunk2)),
        ]);

        let mut parser = SseStreamParser {
            inner: Box::pin(stream.map(|res| {
                res.map_err(|_e: std::convert::Infallible| -> reqwest::Error { unreachable!() })
            })),
            buffer: Vec::new(),
            provider: crate::core::llm::Provider::OpenAI,
            pending_chunks: std::collections::VecDeque::new(),
        };

        let mut full_content = String::new();
        while let Some(res) = parser.next().await {
            match res {
                Ok(chunk) => {
                    full_content.push_str(&chunk.content);
                    if chunk.done {
                        break;
                    }
                }
                Err(e) => {
                    panic!("Error in parser: {:?}", e);
                }
            }
        }

        assert_eq!(full_content, "🚀");
    }

    #[test]
    fn test_parse_openai_sse_extracts_streaming_tool_calls() {
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc123","type":"function","function":{"name":"document_create_pdf","arguments":"{\"title\":\"Q4 Plan\""}}]},"finish_reason":null}],"model":"gpt-5"}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();

        assert!(chunk.tool_calls.is_some());
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].id, "call_abc123");
        assert_eq!(tool_calls[0].name, "document_create_pdf");
        assert!(tool_calls[0].arguments.contains("\"title\":\"Q4 Plan\""));
        assert_eq!(chunk.model.as_deref(), Some("gpt-5"));
        assert_eq!(chunk.finish_reason, None);
        assert!(!chunk.done);
    }

    #[test]
    fn test_parse_openai_sse_extracts_tool_call_finish_reason() {
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"~/report.pdf\"}"}}]},"finish_reason":"tool_calls"}]}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();

        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_calls"));
        assert!(chunk.done);
        assert!(chunk.tool_calls.is_some());
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].arguments, "~/report.pdf\"}");
    }

    #[test]
    fn test_parse_openai_sse_accepts_data_prefix_without_space() {
        let event = r#"data:{"choices":[{"delta":{"content":"hello"}}],"model":"gpt-5"}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();

        assert_eq!(chunk.content, "hello");
        assert_eq!(chunk.model.as_deref(), Some("gpt-5"));
        assert!(chunk.tool_calls.is_none());
    }

    #[test]
    fn test_parse_openai_sse_falls_back_to_position_for_missing_tool_index() {
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"id":"call_a","type":"function","function":{"name":"image_generate","arguments":"{"}},{"id":"call_b","type":"function","function":{"name":"video_generate","arguments":"}"}}]}}]}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();
        let tool_calls = chunk.tool_calls.unwrap();

        assert_eq!(tool_calls.len(), 2);
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].id, "call_a");
        assert_eq!(tool_calls[1].index, 1);
        assert_eq!(tool_calls[1].id, "call_b");
    }

    #[test]
    fn test_parse_openai_sse_extracts_reasoning_summary_delta() {
        let event = r#"data: {"type":"response.reasoning_summary_text.delta","delta":"First evaluate options."}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();

        assert_eq!(chunk.reasoning.as_deref(), Some("First evaluate options."));
        assert!(chunk.content.is_empty());
    }

    // ── Anthropic SSE tool call tests ────────────────────────────────

    #[test]
    fn test_parse_anthropic_sse_content_block_start_tool_use() {
        let event = "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_01ABC\",\"name\":\"get_weather\",\"input\":{}}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert!(chunk.tool_calls.is_some());
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 1);
        assert_eq!(tool_calls[0].id, "toolu_01ABC");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert_eq!(tool_calls[0].arguments, "");
    }

    #[test]
    fn test_parse_anthropic_sse_input_json_delta() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"location\\\":\\\"San Fra\"}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert!(chunk.tool_calls.is_some());
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].index, 1);
        assert_eq!(tool_calls[0].arguments, "{\"location\":\"San Fra");
        // id and name are empty for delta chunks (sent in content_block_start)
        assert_eq!(tool_calls[0].id, "");
        assert_eq!(tool_calls[0].name, "");
    }

    #[test]
    fn test_parse_anthropic_sse_extracts_thinking_delta() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"Consider the simplest path first.\"}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert_eq!(
            chunk.reasoning.as_deref(),
            Some("Consider the simplest path first.")
        );
        assert!(chunk.content.is_empty());
    }

    #[test]
    fn test_parse_anthropic_sse_text_delta_unchanged() {
        let event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hello!\"}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert_eq!(chunk.content, "Hello!");
        assert!(chunk.tool_calls.is_none());
    }

    #[test]
    fn test_parse_anthropic_sse_tool_use_stop_reason() {
        let event = "event: message_delta\ndata: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":89}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert_eq!(chunk.finish_reason.as_deref(), Some("tool_use"));
        assert!(chunk.done);
        assert!(chunk.usage.is_some());
        assert_eq!(chunk.usage.unwrap().completion_tokens, Some(89));
    }

    #[test]
    fn test_parse_anthropic_sse_server_tool_use() {
        let event = "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"server_tool_use\",\"id\":\"srvtoolu_01XYZ\",\"name\":\"web_search\",\"input\":{}}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert!(chunk.tool_calls.is_some());
        let tool_calls = chunk.tool_calls.unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "srvtoolu_01XYZ");
        assert_eq!(tool_calls[0].name, "web_search");
    }

    #[test]
    fn test_parse_anthropic_sse_message_start_with_usage() {
        let event = "event: message_start\ndata: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_01\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-opus-4-6\",\"content\":[],\"stop_reason\":null,\"usage\":{\"input_tokens\":472,\"output_tokens\":2}}}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert_eq!(chunk.model.as_deref(), Some("claude-opus-4-6"));
        assert!(chunk.usage.is_some());
        let usage = chunk.usage.unwrap();
        assert_eq!(usage.prompt_tokens, Some(472));
        assert_eq!(usage.completion_tokens, Some(2));
    }

    #[test]
    fn test_parse_anthropic_sse_ping_event() {
        let event = "event: ping\ndata: {\"type\":\"ping\"}";

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Anthropic).unwrap();

        assert_eq!(chunk.content, "");
        assert!(!chunk.done);
        assert!(chunk.tool_calls.is_none());
    }

    // ── Bug #27 regression tests: tool call index ordering ──────────

    /// Reproduces the core out-of-order issue: an OpenAI SSE event with two
    /// data: lines where the second line carries a tool call delta at index 1
    /// but with no explicit "index" field. Before the fix, the fallback index
    /// would be 0 (array position), causing it to collide with or appear before
    /// the first tool call.
    #[test]
    fn test_openai_multi_data_line_tool_call_index_preserved() {
        // First data: line introduces tool call at index 1 with id and name.
        // Second data: line continues arguments for the same tool call but
        // omits the "index" field (only has function.arguments).
        let event = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":1,\"id\":\"call_x\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"src/\"}}]}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"function\":{\"arguments\":\"main.rs\\\"}\"}}]}}]}"
        );

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();
        let tool_calls = chunk.tool_calls.expect("should have tool calls");

        // Should be a single merged entry at index 1, not two entries.
        assert_eq!(tool_calls.len(), 1, "should merge into one entry, not two");
        assert_eq!(tool_calls[0].index, 1, "index must be 1, not 0");
        assert_eq!(tool_calls[0].id, "call_x");
        assert_eq!(tool_calls[0].name, "read_file");
        assert_eq!(
            tool_calls[0].arguments, "{\"path\":\"src/main.rs\"}",
            "arguments should be concatenated across data: lines"
        );
    }

    /// When tool calls arrive out of insertion order (index 2 before index 0),
    /// the Vec must be sorted by index before being returned.
    #[test]
    fn test_openai_tool_calls_sorted_by_index() {
        // Single data: line with two tool calls: index 2 first, then index 0.
        let event = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":2,"id":"call_c","type":"function","function":{"name":"tool_c","arguments":"{}"}},{"index":0,"id":"call_a","type":"function","function":{"name":"tool_a","arguments":"{}"}}]}}]}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();
        let tool_calls = chunk.tool_calls.expect("should have tool calls");

        assert_eq!(tool_calls.len(), 2);
        // Must be sorted: index 0 first, then index 2.
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].id, "call_a");
        assert_eq!(tool_calls[1].index, 2);
        assert_eq!(tool_calls[1].id, "call_c");
    }

    /// Anthropic: content_block_start + input_json_delta in a single SSE
    /// parsing event should merge by index rather than creating duplicates.
    /// This tests the Anthropic-specific merge fix.
    #[test]
    fn test_anthropic_input_json_delta_merges_with_content_block_start() {
        // Simulate: first we parse content_block_start (creates entry at index 2),
        // then in a separate call we parse input_json_delta at index 2.
        // Both calls produce separate StreamChunks, so we just verify the
        // delta doesn't create duplicate entries when the start was in the
        // same event. (In practice they are separate events, so this test
        // verifies the delta alone produces one clean entry.)
        let start_event = "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":2,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_99\",\"name\":\"bash\",\"input\":{}}}";
        let delta_event = "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":2,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"cmd\\\":\\\"ls\"}}";

        let start_chunk =
            parse_sse_event(start_event, crate::core::llm::Provider::Anthropic).unwrap();
        let start_tcs = start_chunk.tool_calls.expect("start should have tool call");
        assert_eq!(start_tcs.len(), 1);
        assert_eq!(start_tcs[0].index, 2);
        assert_eq!(start_tcs[0].id, "toolu_99");
        assert_eq!(start_tcs[0].name, "bash");
        assert_eq!(start_tcs[0].arguments, "");

        let delta_chunk =
            parse_sse_event(delta_event, crate::core::llm::Provider::Anthropic).unwrap();
        let delta_tcs = delta_chunk.tool_calls.expect("delta should have tool call");
        // Should be exactly one entry, not a duplicate
        assert_eq!(delta_tcs.len(), 1);
        assert_eq!(delta_tcs[0].index, 2);
        assert_eq!(delta_tcs[0].arguments, "{\"cmd\":\"ls");
    }

    /// Three tool calls from Google arriving in a single SSE event should be
    /// sorted by their assigned indices (0, 1, 2).
    #[test]
    fn test_google_tool_calls_sorted_by_index() {
        let event = r#"data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"tool_b","args":{"x":2}}},{"functionCall":{"name":"tool_a","args":{"x":1}}},{"functionCall":{"name":"tool_c","args":{"x":3}}}]},"finishReason":"STOP"}]}"#;

        let chunk = parse_sse_event(event, crate::core::llm::Provider::Google).unwrap();
        let tool_calls = chunk.tool_calls.expect("should have tool calls");

        assert_eq!(tool_calls.len(), 3);
        // Google assigns sequential indices 0, 1, 2 based on array position,
        // so they should already be sorted.
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].name, "tool_b");
        assert_eq!(tool_calls[1].index, 1);
        assert_eq!(tool_calls[1].name, "tool_a");
        assert_eq!(tool_calls[2].index, 2);
        assert_eq!(tool_calls[2].name, "tool_c");
    }

    /// OpenAI: when the same SSE event has two data: lines both carrying
    /// deltas for index 0, they must be merged (arguments concatenated,
    /// id/name from whichever line has them).
    #[test]
    fn test_openai_same_index_across_data_lines_merges() {
        let event = concat!(
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_merge\",\"type\":\"function\",\"function\":{\"name\":\"write_file\",\"arguments\":\"{\\\"path\\\":\\\"a.txt\\\",\"}}]}}]}\n",
            "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"content\\\":\\\"hello\\\"}\"}}]}}]}"
        );

        let chunk = parse_sse_event(event, crate::core::llm::Provider::OpenAI).unwrap();
        let tool_calls = chunk.tool_calls.expect("should have tool calls");

        assert_eq!(
            tool_calls.len(),
            1,
            "duplicate index entries must be merged"
        );
        assert_eq!(tool_calls[0].index, 0);
        assert_eq!(tool_calls[0].id, "call_merge");
        assert_eq!(tool_calls[0].name, "write_file");
        assert_eq!(
            tool_calls[0].arguments,
            "{\"path\":\"a.txt\",\"content\":\"hello\"}"
        );
    }
}
