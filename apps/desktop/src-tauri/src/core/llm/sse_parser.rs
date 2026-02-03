use futures_util::Stream;
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::task::{Context, Poll};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
    pub finish_reason: Option<String>,
    pub model: Option<String>,
    pub usage: Option<TokenUsage>,
    pub credits: Option<crate::core::llm::CreditsInfo>,
    /// Tool calls received in this chunk (for streaming tool use)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<StreamingToolCall>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
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
    pending_chunks: Vec<Result<StreamChunk, Box<dyn Error + Send + Sync>>>,
}

impl Unpin for SseStreamParser {}

impl SseStreamParser {
    fn new(response: reqwest::Response, provider: crate::core::llm::Provider) -> Self {
        Self {
            inner: Box::pin(response.bytes_stream()),
            buffer: Vec::new(),
            provider,
            pending_chunks: Vec::new(),
        }
    }

    fn process_buffer(&mut self) {
        let delimiter: &[u8] = match self.provider {
            crate::core::llm::Provider::Ollama => b"\n",
            _ => b"\n\n",
        };

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

            match parse_sse_event(&event, self.provider) {
                Ok(chunk) => {
                    self.pending_chunks.insert(0, Ok(chunk));
                }
                Err(e) => {
                    let error_str = e.to_string();
                    let error_str_lower = error_str.to_lowercase();
                    // Check if this is a critical error that should be propagated
                    // Critical errors include: API errors, authentication failures, rate limits, JSON errors
                    if error_str_lower.contains("error")
                        || error_str_lower.contains("api")
                        || error_str_lower.contains("authentication")
                        || error_str_lower.contains("rate limit")
                        || error_str_lower.contains("unauthorized")
                        || error_str_lower.contains("forbidden")
                        || error_str_lower.contains("invalid")
                        || error_str_lower.contains("failed")
                        || error_str_lower.contains("timeout")
                        || error_str_lower.contains("connection")
                        || error_str.contains("401")
                        || error_str.contains("403")
                        || error_str.contains("429")
                        || error_str.contains("500")
                        || error_str.contains("502")
                        || error_str.contains("503")
                        || error_str.contains("504")
                    {
                        tracing::error!("Critical stream error: {}", e);
                        self.pending_chunks.insert(0, Err(e));
                    } else {
                        // Non-critical parsing errors (e.g., partial data, comments, empty data fields)
                        // Use WARN level for better debugging visibility (upgraded from DEBUG)
                        tracing::warn!("Non-critical stream parse issue (ignored): {}", e);
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
            return Poll::Ready(self.pending_chunks.pop());
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
                    return Poll::Ready(self.pending_chunks.pop());
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

fn parse_sse_event(
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
        crate::core::llm::Provider::ManagedCloud => parse_openai_sse(event), // ManagedCloud uses OpenAI-compatible format
    }
}

fn parse_openai_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;
    let mut credits = None;

    for line in event.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" {
                done = true;
                break;
            }

            let json: Value = serde_json::from_str(data)?;

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
                        }
                    }
                    if let Some(finish) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                        finish_reason = Some(finish.to_string());
                        done = true;
                    }
                }
            }

            if let Some(m) = json.get("model").and_then(|m| m.as_str()) {
                model = Some(m.to_string());
            }

            if let Some(u) = json.get("usage") {
                usage = Some(TokenUsage {
                    prompt_tokens: u
                        .get("prompt_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    completion_tokens: u
                        .get("completion_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
                    total_tokens: u
                        .get("total_tokens")
                        .and_then(|t| t.as_u64())
                        .map(|t| t as u32),
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

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits,
        tool_calls: None,
    })
}

fn parse_anthropic_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;

    let mut event_type = None;
    let mut data_str = None;

    for line in event.lines() {
        if let Some(evt) = line.strip_prefix("event: ") {
            event_type = Some(evt.to_string());
        } else if let Some(data) = line.strip_prefix("data: ") {
            data_str = Some(data.to_string());
        }
    }

    if let Some(data) = data_str {
        let json: Value = serde_json::from_str(&data)?;

        match event_type.as_deref() {
            Some("error") => {
                // Handle Anthropic error events
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
            Some("content_block_delta") => {
                if let Some(delta) = json.get("delta") {
                    if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                        content.push_str(text);
                    }
                }
            }
            Some("message_delta") => {
                if let Some(delta) = json.get("delta") {
                    if let Some(stop_reason) = delta.get("stop_reason").and_then(|r| r.as_str()) {
                        finish_reason = Some(stop_reason.to_string());
                        done = true;
                    }
                }
                if let Some(usage_data) = json.get("usage") {
                    usage = Some(TokenUsage {
                        prompt_tokens: usage_data
                            .get("input_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32),
                        completion_tokens: usage_data
                            .get("output_tokens")
                            .and_then(|t| t.as_u64())
                            .map(|t| t as u32),
                        total_tokens: None,
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
            }
            _ => {}
        }
    }

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits: None,
        tool_calls: None,
    })
}

fn parse_google_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;

    for line in event.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
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
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    content.push_str(text);
                                }
                            }
                        }
                    }
                    if let Some(finish) = candidate.get("finishReason").and_then(|f| f.as_str()) {
                        // Check for safety filter blocks before accepting the finish reason
                        if finish == "SAFETY" {
                            return Err("Response was blocked by Google's safety filters. Try rephrasing your request or adjusting safety settings.".into());
                        } else if finish == "RECITATION" {
                            return Err("Response was blocked due to recitation concerns. Try rephrasing your request.".into());
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
                });
            }

            if let Some(m) = json.get("model").and_then(|m| m.as_str()) {
                model = Some(m.to_string());
            }
        }
    }

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage,
        credits: None,
        tool_calls: None,
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

    if let Some(message) = json.get("message") {
        if let Some(text) = message.get("content").and_then(|c| c.as_str()) {
            content.push_str(text);
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
            });
        }
    }

    Ok(StreamChunk {
        content,
        done,
        finish_reason: None,
        model,
        usage,
        credits: None,
        tool_calls: None,
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
            pending_chunks: Vec::new(),
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
                    // In tests, we want to fail explicitly rather than panic
                    // This allows the test framework to report the failure properly
                    assert!(false, "Error in parser: {}", e);
                    break;
                }
            }
        }

        assert_eq!(full_content, "🚀");
    }
}
