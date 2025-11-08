use futures_util::Stream;
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::task::{Context, Poll};

/// SSE (Server-Sent Events) chunk from LLM providers
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StreamChunk {
    pub content: String,
    pub done: bool,
    pub finish_reason: Option<String>,
    pub model: Option<String>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TokenUsage {
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

/// Maximum buffer size (1MB) to prevent memory exhaustion
const MAX_BUFFER_SIZE: usize = 1024 * 1024;

/// SSE Stream Parser that buffers incomplete events
struct SseStreamParser {
    inner: Pin<Box<dyn Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Send>>,
    buffer: String,
    provider: crate::router::Provider,
    pending_chunks: Vec<Result<StreamChunk, Box<dyn Error + Send + Sync>>>,
}

// Required for Pin projection
impl Unpin for SseStreamParser {}

impl SseStreamParser {
    fn new(
        response: reqwest::Response,
        provider: crate::router::Provider,
    ) -> Self {
        Self {
            inner: Box::pin(response.bytes_stream()),
            buffer: String::new(),
            provider,
            pending_chunks: Vec::new(),
        }
    }
}

impl Stream for SseStreamParser {
    type Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        // First, return any pending chunks
        if !self.pending_chunks.is_empty() {
            return Poll::Ready(self.pending_chunks.pop());
        }

        // Poll the inner stream for more bytes
        match self.inner.as_mut().poll_next(cx) {
            Poll::Ready(Some(Ok(bytes))) => {
                let text = String::from_utf8_lossy(&bytes);

                // Enforce buffer size limit to prevent memory exhaustion
                if self.buffer.len() + text.len() > MAX_BUFFER_SIZE {
                    tracing::error!("SSE buffer exceeded max size of {}MB", MAX_BUFFER_SIZE / 1024 / 1024);
                    return Poll::Ready(Some(Err(
                        "SSE buffer size exceeded maximum limit".into()
                    )));
                }

                self.buffer.push_str(&text);

                // Process complete SSE events (ending with \n\n)
                while let Some(event_end) = self.buffer.find("\n\n") {
                    let event = self.buffer[..event_end].to_string();
                    self.buffer = self.buffer[event_end + 2..].to_string();

                    match parse_sse_event(&event, self.provider) {
                        Ok(chunk) => {
                            if chunk.done {
                                // Return done chunk and then None
                                self.pending_chunks.push(Ok(chunk));
                                return Poll::Ready(self.pending_chunks.pop());
                            } else {
                                return Poll::Ready(Some(Ok(chunk)));
                            }
                        }
                        Err(e) => {
                            // Skip malformed events, but log them
                            tracing::warn!("Failed to parse SSE event: {}", e);
                        }
                    }
                }

                // More data might be coming, wake to check again
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Poll::Ready(Some(Err(e))) => Poll::Ready(Some(Err(Box::new(e)))),
            Poll::Ready(None) => {
                // Stream ended, process any remaining buffer
                if !self.buffer.trim().is_empty() {
                    match parse_sse_event(&self.buffer, self.provider) {
                        Ok(chunk) => {
                            self.buffer.clear();
                            Poll::Ready(Some(Ok(chunk)))
                        }
                        Err(e) => Poll::Ready(Some(Err(e))),
                    }
                } else {
                    Poll::Ready(None)
                }
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Parse SSE stream from reqwest Response
pub fn parse_sse_stream(
    response: reqwest::Response,
    provider: crate::router::Provider,
) -> impl Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send {
    SseStreamParser::new(response, provider)
}

fn parse_sse_event(
    event: &str,
    provider: crate::router::Provider,
) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    match provider {
        crate::router::Provider::OpenAI => parse_openai_sse(event),
        crate::router::Provider::Anthropic => parse_anthropic_sse(event),
        crate::router::Provider::Google => parse_google_sse(event),
        crate::router::Provider::Ollama => parse_ollama_sse(event),
    }
}

fn parse_openai_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    // OpenAI format: "data: {...}\n" or "data: [DONE]\n"
    let mut content = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let mut model = None;
    let mut usage = None;

    for line in event.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            if data == "[DONE]" {
                done = true;
                break;
            }

            let json: Value = serde_json::from_str(data)?;
            
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
                    prompt_tokens: u.get("prompt_tokens").and_then(|t| t.as_u64()).map(|t| t as u32),
                    completion_tokens: u.get("completion_tokens").and_then(|t| t.as_u64()).map(|t| t as u32),
                    total_tokens: u.get("total_tokens").and_then(|t| t.as_u64()).map(|t| t as u32),
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
    })
}

fn parse_anthropic_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    // Anthropic format: "event: message_start\ndata: {...}\n" or "event: content_block_delta\ndata: {...}\n"
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
                        prompt_tokens: usage_data.get("input_tokens").and_then(|t| t.as_u64()).map(|t| t as u32),
                        completion_tokens: usage_data.get("output_tokens").and_then(|t| t.as_u64()).map(|t| t as u32),
                        total_tokens: None,
                    });
                }
            }
            Some("message_stop") => {
                done = true;
            }
            Some("message_start") => {
                if let Some(m) = json.get("message").and_then(|m| m.get("model")).and_then(|m| m.as_str()) {
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
    })
}

fn parse_google_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    // Google format: "data: {...}\n"
    let mut content = String::new();
    let mut done = false;
    let mut finish_reason = None;
    let model = None;

    for line in event.lines() {
        if let Some(data) = line.strip_prefix("data: ") {
            let json: Value = serde_json::from_str(data)?;

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
                        finish_reason = Some(finish.to_string());
                        done = true;
                    }
                }
            }
        }
    }

    Ok(StreamChunk {
        content,
        done,
        finish_reason,
        model,
        usage: None,
    })
}

fn parse_ollama_sse(event: &str) -> Result<StreamChunk, Box<dyn Error + Send + Sync>> {
    // Ollama format: JSON object directly
    let json: Value = serde_json::from_str(event.trim())?;

    let mut content = String::new();
    let mut done = false;
    let mut model = None;

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

    Ok(StreamChunk {
        content,
        done,
        finish_reason: None,
        model,
        usage: None,
    })
}
