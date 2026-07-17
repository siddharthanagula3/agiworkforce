//! The four dialect stream drivers.
//!
//! Each dialect has two layers:
//!
//! 1. an HTTP layer (`stream_chat` dispatching per [`Dialect`]) that builds
//!    the request from a [`ProviderSpec`] + [`ChatRequest`], sends it, and
//!    classifies non-success responses into [`LlmError`]s; and
//! 2. a pure byte-stream runner (`run_*_stream`) that decodes SSE/NDJSON
//!    framing, emits a [`StreamEvent`] at every observation point, and folds
//!    the authoritative [`ChatOutcome`].
//!
//! The runners are public so conformance fixtures (and, in stage c2, the
//! desktop's own HTTP stack) can replay raw byte chunks without a socket.
//!
//! Behavior parity note: the decode loops, accumulation rules, and error
//! classification moved VERBATIM from `apps/cli/src/models/streaming.rs`.
//! Event emission is additive — it happens at exactly the points where the
//! legacy code mutated its accumulators, so byte-identical CLI behavior falls
//! out of construction.

use std::collections::HashSet;
use std::time::Duration;

use bytes::Bytes;
use futures_util::{Stream, TryStreamExt};
use serde_json::Value;

use crate::assembler::{ToolCallAssembler, normalize_tool_arguments_value};
use crate::decode::Utf8StreamDecoder;
use crate::error::{LlmError, classify_error_response, provider_name_from_url};
use crate::events::{ChatOutcome, StreamEvent, Usage};
use crate::serialize::{
    add_message_cache_breakpoint, anthropic_tools_json, build_gemini_tool_name_map,
    compact_ollama_message_values, convert_message_to_anthropic, convert_message_to_gemini,
    convert_message_to_openai, convert_message_to_openai_responses,
    gemini_function_declarations_json, ollama_chat_request_body, ollama_nativize_message_values,
    openai_function_tools_json, openai_responses_function_tools_json, set_openai_max_tokens,
};
use crate::spec::{Auth, Dialect, OpenAiOpts, ProviderSpec};
use crate::watchdog::IdleWatchdog;
use crate::wire::{Message, ToolCall, ToolDefinition};

/// One streamed chat completion request, dialect-agnostic.
#[derive(Debug)]
pub struct ChatRequest<'a> {
    pub model: &'a str,
    pub messages: &'a [Message],
    /// Output-token cap. `0` means "no explicit limit" where the dialect
    /// supports that (Ollama omits `num_predict`).
    pub max_tokens: u32,
    pub temperature: Option<f32>,
    pub tools: Option<&'a [ToolDefinition]>,
    /// Anthropic extended-thinking budget; ignored by other dialects.
    pub thinking_budget: Option<u32>,
    /// Ollama total context window (`options.num_ctx`); ignored by other
    /// dialects. `None` omits the field (Ollama then defaults to 4096).
    pub num_ctx: Option<u32>,
    /// Ollama extended-thinking toggle (`think`); ignored by other dialects.
    /// NOT the same knob as `thinking_budget` (Anthropic-only). `None` keeps
    /// this engine's legacy wire default (`think: false`) so existing callers'
    /// request bytes are unchanged; `Some(v)` forwards `v`.
    pub ollama_think: Option<bool>,
    /// Max silence between stream chunks before [`LlmError::IdleTimeout`].
    pub idle_timeout: Duration,
}

/// Callback receiving every [`StreamEvent`] as it is decoded.
pub type OnEvent<'a> = &'a mut (dyn FnMut(StreamEvent) + Send);

/// Send a streaming chat completion for `spec` and drive the response through
/// the dialect's stream runner. Returns the assembled [`ChatOutcome`]; emits
/// a [`StreamEvent`] for every delta along the way.
pub async fn stream_chat(
    client: &reqwest::Client,
    spec: &ProviderSpec,
    req: &ChatRequest<'_>,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError> {
    match &spec.dialect {
        Dialect::Anthropic => stream_anthropic(client, spec, req, on_event).await,
        Dialect::Gemini => stream_gemini(client, spec, req, on_event).await,
        Dialect::OllamaNative => stream_ollama(client, spec, req, on_event).await,
        Dialect::OpenAiResponses => stream_openai_responses(client, spec, req, on_event).await,
        Dialect::OpenAiCompat(opts) => {
            stream_openai_compat(client, spec, opts, req, on_event).await
        }
    }
}

// ---------------------------------------------------------------------------
// Shared HTTP plumbing
// ---------------------------------------------------------------------------

/// Error/log label for a spec: its `id`, or a URL-inferred fallback when empty.
fn provider_label(spec: &ProviderSpec) -> &str {
    if spec.id.is_empty() {
        provider_name_from_url(&spec.base_url)
    } else {
        &spec.id
    }
}

/// Apply auth + caller extra headers. Secrets only ever come from
/// [`Auth`] — never log the returned builder's headers.
fn apply_headers(
    mut builder: reqwest::RequestBuilder,
    spec: &ProviderSpec,
) -> reqwest::RequestBuilder {
    builder = match &spec.auth {
        Auth::None => builder,
        Auth::Bearer(token) => builder.header("Authorization", format!("Bearer {token}")),
        Auth::Header { name, value } => builder.header(name.as_str(), value.as_str()),
    };
    for (name, value) in &spec.extra_headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    builder
}

/// Classify a non-success response, consuming its body.
async fn error_from_response(label: &str, model: &str, resp: reqwest::Response) -> LlmError {
    let status = resp.status().as_u16();
    let retry_after = resp
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let body = resp.text().await.unwrap_or_default();
    classify_error_response(label, model, status, retry_after.as_deref(), &body)
}

/// Map a reqwest byte stream into the runner item type.
fn llm_byte_stream(resp: reqwest::Response) -> impl Stream<Item = Result<Bytes, LlmError>> + Unpin {
    resp.bytes_stream().map_err(|e| LlmError::Read {
        message: e.to_string(),
    })
}

// ---------------------------------------------------------------------------
// Anthropic Messages API (streaming)
// ---------------------------------------------------------------------------

/// Build the Anthropic Messages request body for `req`. Pure — exposed so
/// conformance/parity oracles (stage c2c) can byte-compare request bodies
/// without a socket.
pub fn build_anthropic_request_body(req: &ChatRequest<'_>) -> Value {
    let mut api_messages: Vec<Value> = req
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(convert_message_to_anthropic)
        .collect();
    // Cache the conversation prefix (3rd breakpoint after system + tools).
    add_message_cache_breakpoint(&mut api_messages);

    let system_text = req
        .messages
        .iter()
        .find(|m| m.role == "system")
        .map(super::wire::Message::text_content)
        .unwrap_or_default();

    // Build a system prompt with a cache breakpoint just before the volatile
    // <environment> block (the env block is always last when the standard
    // system prompt builder produced it). When the prefix is non-empty we send
    // the system field as an array of two text blocks; cache_control on the
    // first block makes everything above the env block cacheable. This
    // typically halves the billed input tokens on the second-and-later turn of
    // a session.
    //
    // The split is robust: if the marker isn't present (e.g. sysprompt was
    // overridden with no env block), we fall back to a single cached block.
    // If the system text is empty, omit the system field entirely.
    let system_value: Option<Value> = if system_text.is_empty() {
        None
    } else if let Some(env_pos) = system_text.rfind("<environment>") {
        let (head, tail) = system_text.split_at(env_pos);
        let head_trimmed = head.trim_end();
        if head_trimmed.is_empty() {
            // No stable prefix — single non-cached block.
            Some(serde_json::json!(system_text))
        } else {
            Some(serde_json::json!([
                {
                    "type": "text",
                    "text": head_trimmed,
                    "cache_control": {"type": "ephemeral"}
                },
                {"type": "text", "text": tail}
            ]))
        }
    } else {
        // No env marker — cache the whole system prompt (rare path: custom
        // prompt with no environment injection).
        Some(serde_json::json!([
            {
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"}
            }
        ]))
    };

    let mut body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens,
        "stream": true,
        "messages": api_messages,
    });
    if let Some(sys) = system_value {
        body["system"] = sys;
    }

    if let Some(temp) = req.temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = req.tools {
        // Mark the last tool with cache_control so the entire tools array is
        // cacheable. Tools rarely change mid-session, so this is pure win.
        body["tools"] = serde_json::json!(anthropic_tools_json(tool_defs));
    }

    // Extended thinking: inject a `thinking` block when the caller requests it.
    // Requires the interleaved-thinking-2025-05-14 beta header.
    if let Some(budget) = req.thinking_budget {
        body["thinking"] = serde_json::json!({
            "type": "enabled",
            "budget_tokens": budget
        });
    }

    body
}

async fn stream_anthropic(
    client: &reqwest::Client,
    spec: &ProviderSpec,
    req: &ChatRequest<'_>,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError> {
    let body = build_anthropic_request_body(req);
    let use_thinking = req.thinking_budget.is_some();

    tracing::trace!(spec = ?spec, model = %req.model, "sending anthropic chat request");

    let url = &spec.base_url;
    let mut builder = client.post(url);
    builder = apply_headers(builder, spec);
    builder = builder
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json");
    if use_thinking {
        builder = builder.header("anthropic-beta", "interleaved-thinking-2025-05-14");
    }
    let resp = builder
        .json(&body)
        .send()
        .await
        .map_err(|e| LlmError::Network {
            url: url.clone(),
            message: e.to_string(),
        })?;

    if !resp.status().is_success() {
        return Err(error_from_response(provider_label(spec), req.model, resp).await);
    }

    run_anthropic_stream(llm_byte_stream(resp), req.idle_timeout, on_event).await
}

/// Decode an Anthropic Messages SSE byte stream.
pub async fn run_anthropic_stream<S>(
    mut stream: S,
    idle_timeout: Duration,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError>
where
    S: Stream<Item = Result<Bytes, LlmError>> + Unpin,
{
    let watchdog = IdleWatchdog::new(idle_timeout);
    let mut full_text = String::new();
    let mut usage = Usage::default();
    // True while the parser is inside a `thinking` content block
    let mut in_thinking_block = false;
    let mut buffer = String::new();
    // Reassemble multibyte UTF-8 codepoints split across chunk boundaries
    // (emoji/CJK/accents) instead of corrupting them with per-chunk lossy decode.
    let mut decoder = Utf8StreamDecoder::new();

    // Tool call tracking: blocks are sequential; each tool_use block gets a
    // fresh index and is finalized at its content_block_stop.
    let mut assembler = ToolCallAssembler::new();
    let mut current_tool_index: Option<usize> = None;
    let mut next_tool_index: usize = 0;
    let mut stop_reason: Option<String> = None;

    loop {
        let chunk = match watchdog.next_item(&mut stream).await? {
            None => break,
            Some(item) => item?,
        };
        buffer.push_str(&decoder.push(&chunk));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with(':') {
                // SSE comment — keepalive, no payload.
                on_event(StreamEvent::Keepalive);
                continue;
            }
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                let event = match serde_json::from_str::<Value>(data) {
                    Ok(event) => event,
                    Err(err) => {
                        // A malformed/truncated SSE event would otherwise be
                        // dropped silently, yielding an incomplete response that
                        // looks like a normal completion. Surface it at debug.
                        tracing::debug!(
                            provider = "anthropic",
                            error = %err,
                            "discarding unparsable stream event"
                        );
                        continue;
                    }
                };
                {
                    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            // Check if this is a tool_use or thinking block
                            if let Some(cb) = event.get("content_block") {
                                match cb.get("type").and_then(|t| t.as_str()) {
                                    Some("tool_use") => {
                                        in_thinking_block = false;
                                        let id = cb
                                            .get("id")
                                            .and_then(|i| i.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let name = cb
                                            .get("name")
                                            .and_then(|n| n.as_str())
                                            .unwrap_or("")
                                            .to_string();
                                        let index = next_tool_index;
                                        next_tool_index += 1;
                                        assembler.update(index, Some(&id), Some(&name), None);
                                        current_tool_index = Some(index);
                                        on_event(StreamEvent::ToolCallStart { index, id, name });
                                    }
                                    Some("thinking") => {
                                        in_thinking_block = true;
                                    }
                                    _ => {
                                        in_thinking_block = false;
                                    }
                                }
                            }
                        }
                        "content_block_delta" => {
                            if let Some(delta) = event.get("delta") {
                                let delta_type =
                                    delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                match delta_type {
                                    "text_delta" => {
                                        if !in_thinking_block
                                            && let Some(text) =
                                                delta.get("text").and_then(|t| t.as_str())
                                        {
                                            full_text.push_str(text);
                                            on_event(StreamEvent::TextDelta {
                                                text: text.to_string(),
                                            });
                                        }
                                    }
                                    "thinking_delta" => {
                                        // Thinking text is for internal reasoning; don't merge
                                        // it into the answer but count the tokens. The real
                                        // count from the usage object (message_delta)
                                        // overrides this ~4-chars-per-token estimate.
                                        if let Some(thinking_text) =
                                            delta.get("thinking").and_then(|t| t.as_str())
                                        {
                                            usage.reasoning_output_tokens +=
                                                (thinking_text.len() / 4).max(1) as u32;
                                            on_event(StreamEvent::ReasoningDelta {
                                                text: thinking_text.to_string(),
                                            });
                                        }
                                    }
                                    "input_json_delta" => {
                                        if let Some(json_chunk) =
                                            delta.get("partial_json").and_then(|p| p.as_str())
                                            && let Some(index) = current_tool_index
                                        {
                                            assembler.update(index, None, None, Some(json_chunk));
                                            on_event(StreamEvent::ToolCallArgsDelta {
                                                index,
                                                fragment: json_chunk.to_string(),
                                            });
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        "content_block_stop" => {
                            in_thinking_block = false;
                            // If we were accumulating a tool call, finalize it
                            if let Some(index) = current_tool_index.take() {
                                assembler.finalize_block(index);
                            }
                        }
                        "message_start" => {
                            if let Some(u) = event.get("message").and_then(|m| m.get("usage")) {
                                usage.input_tokens =
                                    u.get("input_tokens")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                // Anthropic returns cache stats inline with the
                                // initial usage object on message_start. Capture
                                // them here so callers see cache hits even when
                                // the rest of the message is streamed slowly.
                                usage.cache_read_input_tokens =
                                    u.get("cache_read_input_tokens")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                usage.cache_creation_input_tokens =
                                    u.get("cache_creation_input_tokens")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                on_event(StreamEvent::Usage {
                                    usage: usage.clone(),
                                });
                            }
                        }
                        "message_delta" => {
                            if let Some(delta) = event.get("delta")
                                && let Some(reason) =
                                    delta.get("stop_reason").and_then(|r| r.as_str())
                            {
                                stop_reason = Some(reason.to_string());
                            }
                            if let Some(u) = event.get("usage") {
                                usage.output_tokens =
                                    u.get("output_tokens")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                // Some Anthropic responses populate cache stats
                                // on message_delta instead of (or in addition
                                // to) message_start. Prefer the larger value so
                                // we don't lose accuracy if both fire.
                                let delta_cache_read =
                                    u.get("cache_read_input_tokens")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                if delta_cache_read > usage.cache_read_input_tokens {
                                    usage.cache_read_input_tokens = delta_cache_read;
                                }
                                let delta_cache_creation =
                                    u.get("cache_creation_input_tokens")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                if delta_cache_creation > usage.cache_creation_input_tokens {
                                    usage.cache_creation_input_tokens = delta_cache_creation;
                                }
                                // Capture real thinking/reasoning tokens from the usage
                                // object; override the character-count estimate.
                                let real_reasoning =
                                    u.get("thinking_tokens")
                                        .or_else(|| u.get("reasoning_tokens"))
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as u32;
                                if real_reasoning > 0 {
                                    usage.reasoning_output_tokens = real_reasoning;
                                }
                                on_event(StreamEvent::Usage {
                                    usage: usage.clone(),
                                });
                            }
                        }
                        "ping" => {
                            on_event(StreamEvent::Keepalive);
                        }
                        _ => {
                            // Vendor events this crate does not interpret
                            // (message_stop, error frames, future additions).
                            // Legacy behavior ignored them for the outcome;
                            // consumers can observe them here.
                            on_event(StreamEvent::Vendor {
                                event: event_type.to_string(),
                                data: event,
                            });
                        }
                    }
                }
            }
        }
    }

    // Truncated-stream semantics: only block-stop-finalized calls surface.
    let tool_calls = assembler.into_completed();
    on_event(StreamEvent::End {
        stop_reason: stop_reason.clone(),
    });
    Ok(ChatOutcome {
        text: full_text,
        tool_calls,
        usage,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// OpenAI-compatible Chat Completions API (streaming)
// ---------------------------------------------------------------------------

/// Build the OpenAI-compatible Chat Completions request body for `req`. Pure —
/// exposed so conformance/parity oracles (stage c2c) can byte-compare request
/// bodies without a socket.
pub fn build_openai_compat_request_body(req: &ChatRequest<'_>, opts: &OpenAiOpts) -> Value {
    let api_messages: Vec<Value> = req
        .messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": req.model,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });
    set_openai_max_tokens(&mut body, opts, req.max_tokens);

    if let Some(temp) = req.temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = req.tools {
        body["tools"] = serde_json::json!(openai_function_tools_json(tool_defs));
    }

    body
}

async fn stream_openai_compat(
    client: &reqwest::Client,
    spec: &ProviderSpec,
    opts: &OpenAiOpts,
    req: &ChatRequest<'_>,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError> {
    let body = build_openai_compat_request_body(req, opts);

    tracing::trace!(spec = ?spec, model = %req.model, "sending openai-compatible chat request");

    let url = &spec.base_url;
    let mut builder = client.post(url);
    builder = apply_headers(builder, spec);
    builder = builder.header("content-type", "application/json");
    let resp = builder
        .json(&body)
        .send()
        .await
        .map_err(|e| LlmError::Network {
            url: url.clone(),
            message: e.to_string(),
        })?;

    if !resp.status().is_success() {
        return Err(error_from_response(provider_label(spec), req.model, resp).await);
    }

    run_openai_compat_stream(llm_byte_stream(resp), req.idle_timeout, on_event).await
}

/// Decode an OpenAI-compatible Chat Completions SSE byte stream.
pub async fn run_openai_compat_stream<S>(
    mut stream: S,
    idle_timeout: Duration,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError>
where
    S: Stream<Item = Result<Bytes, LlmError>> + Unpin,
{
    let watchdog = IdleWatchdog::new(idle_timeout);
    let mut full_text = String::new();
    let mut usage = Usage::default();
    let mut buffer = String::new();
    // Reassemble multibyte UTF-8 codepoints split across chunk boundaries
    // (emoji/CJK/accents) instead of corrupting them with per-chunk lossy decode.
    let mut decoder = Utf8StreamDecoder::new();

    // Tool call tracking: indexed deltas, possibly interleaved/out-of-order;
    // finalized (sorted by index) at end-of-stream.
    let mut assembler = ToolCallAssembler::new();
    let mut stop_reason: Option<String> = None;

    loop {
        let chunk = match watchdog.next_item(&mut stream).await? {
            None => break,
            Some(item) => item?,
        };
        buffer.push_str(&decoder.push(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with(':') {
                // SSE comment — e.g. OpenRouter's ": OPENROUTER PROCESSING".
                on_event(StreamEvent::Keepalive);
                continue;
            }
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                let event = match serde_json::from_str::<Value>(data) {
                    Ok(event) => event,
                    Err(err) => {
                        tracing::debug!(
                            provider = "openai-compatible",
                            error = %err,
                            "discarding unparsable stream event"
                        );
                        continue;
                    }
                };
                {
                    let has_choices = event.get("choices").is_some();
                    let has_usage = event.get("usage").is_some();
                    if let Some(choices) = event.get("choices").and_then(|c| c.as_array())
                        && let Some(choice) = choices.first()
                    {
                        // Text content delta
                        if let Some(text) = choice
                            .get("delta")
                            .and_then(|d| d.get("content"))
                            .and_then(|c| c.as_str())
                        {
                            full_text.push_str(text);
                            on_event(StreamEvent::TextDelta {
                                text: text.to_string(),
                            });
                        }

                        // Tool call deltas
                        if let Some(tc_array) = choice
                            .get("delta")
                            .and_then(|d| d.get("tool_calls"))
                            .and_then(|t| t.as_array())
                        {
                            for tc in tc_array {
                                let index =
                                    tc.get("index")
                                        .and_then(serde_json::Value::as_u64)
                                        .unwrap_or(0) as usize;
                                let id = tc.get("id").and_then(|i| i.as_str());
                                let (name, args) = match tc.get("function") {
                                    Some(func) => (
                                        func.get("name").and_then(|n| n.as_str()),
                                        func.get("arguments").and_then(|a| a.as_str()),
                                    ),
                                    None => (None, None),
                                };
                                let newly_seen = assembler.update(index, id, name, args);
                                if newly_seen {
                                    on_event(StreamEvent::ToolCallStart {
                                        index,
                                        id: id.unwrap_or("").to_string(),
                                        name: name.unwrap_or("").to_string(),
                                    });
                                }
                                if let Some(fragment) = args {
                                    on_event(StreamEvent::ToolCallArgsDelta {
                                        index,
                                        fragment: fragment.to_string(),
                                    });
                                }
                            }
                        }

                        // Finish reason
                        if let Some(reason) = choice.get("finish_reason").and_then(|r| r.as_str())
                            && !reason.is_empty()
                            && reason != "null"
                        {
                            stop_reason = Some(reason.to_string());
                        }
                    }
                    if let Some(u) = event.get("usage") {
                        usage.input_tokens = u
                            .get("prompt_tokens")
                            .and_then(serde_json::Value::as_u64)
                            .unwrap_or(0) as u32;
                        usage.output_tokens = u
                            .get("completion_tokens")
                            .and_then(serde_json::Value::as_u64)
                            .unwrap_or(0) as u32;
                        on_event(StreamEvent::Usage {
                            usage: usage.clone(),
                        });
                    }
                    if !has_choices && !has_usage {
                        // Frame this dialect does not interpret (managed-cloud
                        // billing frames, provider extensions). Ignored for the
                        // outcome — surfaced for richer consumers.
                        let label = event
                            .get("object")
                            .or_else(|| event.get("type"))
                            .or_else(|| event.get("event"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown")
                            .to_string();
                        on_event(StreamEvent::Vendor {
                            event: label,
                            data: event,
                        });
                    }
                }
            }
        }
    }

    // Convert accumulated tool call buffers (sorted by index).
    let tool_calls = assembler.finish();
    on_event(StreamEvent::End {
        stop_reason: stop_reason.clone(),
    });
    Ok(ChatOutcome {
        text: full_text,
        tool_calls,
        usage,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// OpenAI Responses API (streaming)
// ---------------------------------------------------------------------------

/// Build the canonical OpenAI Responses request body from the shared wire
/// request. Kept pure so every Rust consumer can fixture-test request shape
/// without opening a socket.
/// Build the OpenAI Responses request body for `req`. Pure — exposed so
/// conformance/parity oracles (stage c2c) can byte-compare request bodies
/// without a socket.
pub fn build_openai_responses_body(req: &ChatRequest<'_>) -> Value {
    let input: Vec<Value> = req
        .messages
        .iter()
        .filter(|message| message.role != "system")
        .flat_map(convert_message_to_openai_responses)
        .collect();
    let instructions = req
        .messages
        .iter()
        .filter(|message| message.role == "system")
        .map(Message::text_content)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    let mut body = serde_json::json!({
        "model": req.model,
        "input": input,
        "stream": true,
    });
    if !instructions.is_empty() {
        body["instructions"] = serde_json::json!(instructions);
    }
    if req.max_tokens > 0 {
        body["max_output_tokens"] = serde_json::json!(req.max_tokens);
    }
    if let Some(temperature) = req.temperature {
        body["temperature"] = serde_json::json!(temperature);
    }
    if let Some(tool_defs) = req.tools {
        body["tools"] = serde_json::json!(openai_responses_function_tools_json(tool_defs));
    }
    body
}

async fn stream_openai_responses(
    client: &reqwest::Client,
    spec: &ProviderSpec,
    req: &ChatRequest<'_>,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError> {
    let body = build_openai_responses_body(req);
    tracing::trace!(spec = ?spec, model = %req.model, "sending openai responses request");

    let url = &spec.base_url;
    let mut builder = client.post(url);
    builder = apply_headers(builder, spec);
    builder = builder.header("content-type", "application/json");
    let response = builder
        .json(&body)
        .send()
        .await
        .map_err(|error| LlmError::Network {
            url: url.clone(),
            message: error.to_string(),
        })?;

    if !response.status().is_success() {
        return Err(error_from_response(provider_label(spec), req.model, response).await);
    }

    run_openai_responses_stream(llm_byte_stream(response), req.idle_timeout, on_event).await
}

fn openai_responses_usage(response: &Value) -> Option<Usage> {
    let usage = response.get("usage")?;
    if usage.is_null() {
        return None;
    }
    Some(Usage {
        input_tokens: usage
            .get("input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32,
        output_tokens: usage
            .get("output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32,
        cache_read_input_tokens: usage
            .pointer("/input_tokens_details/cached_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32,
        cache_creation_input_tokens: 0,
        reasoning_output_tokens: usage
            .pointer("/output_tokens_details/reasoning_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0) as u32,
    })
}

fn openai_responses_error(event: &Value) -> LlmError {
    let error = if event.get("type").and_then(Value::as_str) == Some("response.failed") {
        event.pointer("/response/error").unwrap_or(&Value::Null)
    } else {
        event
    };
    let code = error.get("code").and_then(Value::as_str);
    let message = error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("OpenAI Responses stream failed");
    let message = match code.filter(|code| !code.is_empty()) {
        Some(code) => format!("{code}: {message}"),
        None => message.to_string(),
    };

    // A semantic SSE error is delivered after the HTTP request has already
    // succeeded. Preserve that transport fact instead of inventing a status.
    LlmError::Api {
        provider: "openai".to_string(),
        status: 200,
        message,
    }
}

fn emit_openai_responses_usage(response: &Value, usage: &mut Usage, on_event: OnEvent<'_>) {
    if let Some(reported) = openai_responses_usage(response) {
        *usage = reported;
        on_event(StreamEvent::Usage {
            usage: usage.clone(),
        });
    }
}

/// Decode OpenAI Responses typed SSE events.
///
/// The Responses API is intentionally not fed through the Chat Completions
/// decoder. Text, reasoning summaries, function calls, usage, failures, and
/// completion are all carried by different semantic event types.
pub async fn run_openai_responses_stream<S>(
    mut stream: S,
    idle_timeout: Duration,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError>
where
    S: Stream<Item = Result<Bytes, LlmError>> + Unpin,
{
    let watchdog = IdleWatchdog::new(idle_timeout);
    let mut full_text = String::new();
    let mut usage = Usage::default();
    let mut stop_reason = None;
    let mut terminal_emitted = false;
    let mut assembler = ToolCallAssembler::new();
    let mut started_tool_calls = HashSet::new();
    let mut tool_args_seen = HashSet::new();
    let mut buffer = String::new();
    let mut decoder = Utf8StreamDecoder::new();

    loop {
        let chunk = match watchdog.next_item(&mut stream).await? {
            None => break,
            Some(item) => item?,
        };
        buffer.push_str(&decoder.push(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with(':') {
                on_event(StreamEvent::Keepalive);
                continue;
            }
            let Some(data) = line.strip_prefix("data:").map(str::trim_start) else {
                continue;
            };
            if data == "[DONE]" {
                continue;
            }
            let event = match serde_json::from_str::<Value>(data) {
                Ok(event) => event,
                Err(error) => {
                    tracing::debug!(
                        provider = "openai-responses",
                        error = %error,
                        "discarding unparsable stream event"
                    );
                    continue;
                }
            };
            let event_type = event.get("type").and_then(Value::as_str).unwrap_or("");

            match event_type {
                "response.output_text.delta" | "response.refusal.delta" => {
                    if let Some(text) = event.get("delta").and_then(Value::as_str) {
                        full_text.push_str(text);
                        on_event(StreamEvent::TextDelta {
                            text: text.to_string(),
                        });
                    }
                }
                "response.reasoning_summary_text.delta" => {
                    if let Some(text) = event.get("delta").and_then(Value::as_str) {
                        on_event(StreamEvent::ReasoningDelta {
                            text: text.to_string(),
                        });
                    }
                }
                "response.output_item.added" => {
                    let item = event.get("item").unwrap_or(&Value::Null);
                    if item.get("type").and_then(Value::as_str) == Some("function_call") {
                        let index = event
                            .get("output_index")
                            .and_then(Value::as_u64)
                            .unwrap_or(0) as usize;
                        let id = item
                            .get("call_id")
                            .or_else(|| item.get("id"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let name = item.get("name").and_then(Value::as_str).unwrap_or("");
                        assembler.update(index, Some(id), Some(name), None);
                        if started_tool_calls.insert(index) {
                            on_event(StreamEvent::ToolCallStart {
                                index,
                                id: id.to_string(),
                                name: name.to_string(),
                            });
                        }
                    }
                }
                "response.function_call_arguments.delta" => {
                    let index = event
                        .get("output_index")
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as usize;
                    let fragment = event.get("delta").and_then(Value::as_str).unwrap_or("");
                    assembler.update(index, None, None, Some(fragment));
                    tool_args_seen.insert(index);
                    if started_tool_calls.insert(index) {
                        on_event(StreamEvent::ToolCallStart {
                            index,
                            id: String::new(),
                            name: String::new(),
                        });
                    }
                    on_event(StreamEvent::ToolCallArgsDelta {
                        index,
                        fragment: fragment.to_string(),
                    });
                }
                "response.function_call_arguments.done" => {
                    let index = event
                        .get("output_index")
                        .and_then(Value::as_u64)
                        .unwrap_or(0) as usize;
                    let name = event.get("name").and_then(Value::as_str).unwrap_or("");
                    let fallback_id = event.get("item_id").and_then(Value::as_str).unwrap_or("");
                    let id = (!started_tool_calls.contains(&index)).then_some(fallback_id);
                    let full_arguments = event
                        .get("arguments")
                        .and_then(Value::as_str)
                        .filter(|_| !tool_args_seen.contains(&index));
                    assembler.update(index, id, Some(name), full_arguments);
                    if started_tool_calls.insert(index) {
                        on_event(StreamEvent::ToolCallStart {
                            index,
                            id: fallback_id.to_string(),
                            name: name.to_string(),
                        });
                    }
                    if let Some(arguments) = full_arguments {
                        tool_args_seen.insert(index);
                        on_event(StreamEvent::ToolCallArgsDelta {
                            index,
                            fragment: arguments.to_string(),
                        });
                    }
                }
                "response.output_item.done" => {
                    let item = event.get("item").unwrap_or(&Value::Null);
                    if item.get("type").and_then(Value::as_str) == Some("function_call") {
                        let index = event
                            .get("output_index")
                            .and_then(Value::as_u64)
                            .unwrap_or(0) as usize;
                        let call_id = item
                            .get("call_id")
                            .or_else(|| item.get("id"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let name = item.get("name").and_then(Value::as_str).unwrap_or("");
                        let id = (!started_tool_calls.contains(&index)).then_some(call_id);
                        let full_arguments = item
                            .get("arguments")
                            .and_then(Value::as_str)
                            .filter(|_| !tool_args_seen.contains(&index));
                        assembler.update(index, id, Some(name), full_arguments);
                        if started_tool_calls.insert(index) {
                            on_event(StreamEvent::ToolCallStart {
                                index,
                                id: call_id.to_string(),
                                name: name.to_string(),
                            });
                        }
                        if let Some(arguments) = full_arguments {
                            tool_args_seen.insert(index);
                            on_event(StreamEvent::ToolCallArgsDelta {
                                index,
                                fragment: arguments.to_string(),
                            });
                        }
                    }
                }
                "response.completed" => {
                    let response = event.get("response").unwrap_or(&Value::Null);
                    emit_openai_responses_usage(response, &mut usage, on_event);
                    stop_reason = response
                        .get("status")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .or_else(|| Some("completed".to_string()));
                    on_event(StreamEvent::End {
                        stop_reason: stop_reason.clone(),
                    });
                    terminal_emitted = true;
                }
                "response.incomplete" => {
                    let response = event.get("response").unwrap_or(&Value::Null);
                    emit_openai_responses_usage(response, &mut usage, on_event);
                    stop_reason = response
                        .pointer("/incomplete_details/reason")
                        .and_then(Value::as_str)
                        .or_else(|| response.get("status").and_then(Value::as_str))
                        .map(str::to_string)
                        .or_else(|| Some("incomplete".to_string()));
                    on_event(StreamEvent::End {
                        stop_reason: stop_reason.clone(),
                    });
                    terminal_emitted = true;
                }
                "error" | "response.failed" => {
                    return Err(openai_responses_error(&event));
                }
                // Known lifecycle/completion frames whose full values would
                // duplicate already-streamed deltas.
                "response.created"
                | "response.queued"
                | "response.in_progress"
                | "response.output_text.done"
                | "response.refusal.done"
                | "response.reasoning_summary_part.added"
                | "response.reasoning_summary_part.done"
                | "response.reasoning_summary_text.done"
                | "response.content_part.added"
                | "response.content_part.done" => {}
                _ => {
                    on_event(StreamEvent::Vendor {
                        event: if event_type.is_empty() {
                            "unknown".to_string()
                        } else {
                            event_type.to_string()
                        },
                        data: event,
                    });
                }
            }
        }
    }

    buffer.push_str(&decoder.finish());
    if !buffer.trim().is_empty() {
        tracing::debug!(
            provider = "openai-responses",
            "discarding unterminated trailing SSE data"
        );
    }

    if !terminal_emitted {
        on_event(StreamEvent::End {
            stop_reason: stop_reason.clone(),
        });
    }
    Ok(ChatOutcome {
        text: full_text,
        tool_calls: assembler.finish(),
        usage,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// Google Gemini API (streaming)
// ---------------------------------------------------------------------------

/// Build the Gemini `generateContent` request body for `req`. Pure — exposed
/// so conformance/parity oracles (stage c2c) can byte-compare request bodies
/// without a socket. (The model path/URL handling stays in the stream driver.)
pub fn build_gemini_request_body(req: &ChatRequest<'_>) -> Value {
    // Gemini uses a different message format: contents with parts
    let gemini_tool_names = build_gemini_tool_name_map(req.messages);
    let contents: Vec<Value> = req
        .messages
        .iter()
        .filter(|m| m.role != "system")
        .map(|m| convert_message_to_gemini(m, &gemini_tool_names))
        .collect();

    let system_instruction = req.messages.iter().find(|m| m.role == "system").map(|m| {
        serde_json::json!({
            "parts": [{ "text": m.text_content() }]
        })
    });

    let mut body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": req.max_tokens,
        },
    });

    if let Some(temp) = req.temperature {
        body["generationConfig"]["temperature"] = serde_json::json!(temp);
    }

    if let Some(si) = system_instruction {
        body["systemInstruction"] = si;
    }

    if let Some(tool_defs) = req.tools {
        let declarations = gemini_function_declarations_json(tool_defs);
        body["tools"] = serde_json::json!([{ "functionDeclarations": declarations }]);
    }

    body
}

async fn stream_gemini(
    client: &reqwest::Client,
    spec: &ProviderSpec,
    req: &ChatRequest<'_>,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError> {
    let body = build_gemini_request_body(req);

    // Normalize model name: strip "models/" prefix if user included it
    let model_path = if req.model.starts_with("models/") {
        req.model.to_string()
    } else {
        format!("models/{}", req.model)
    };

    // Security note (CodeQL rust/cleartext-transmission): the API key is sent
    // via the `x-goog-api-key` header (see [`Auth::Header`]) instead of the
    // `?key=` query parameter. URL query strings are routinely logged by
    // proxies and access logs — the header keeps the key out of those byways.
    let base = spec.base_url.trim_end_matches('/');
    let url = format!("{base}/{model_path}:streamGenerateContent?alt=sse");

    tracing::trace!(spec = ?spec, model = %req.model, "sending gemini chat request");

    let mut builder = client.post(&url);
    builder = builder.header("content-type", "application/json");
    builder = apply_headers(builder, spec);
    let resp = builder
        .json(&body)
        .send()
        .await
        .map_err(|e| LlmError::Network {
            url: url.clone(),
            message: e.to_string(),
        })?;

    if !resp.status().is_success() {
        return Err(error_from_response(provider_label(spec), req.model, resp).await);
    }

    run_gemini_stream(llm_byte_stream(resp), req.idle_timeout, on_event).await
}

/// Decode a Gemini `streamGenerateContent?alt=sse` byte stream.
pub async fn run_gemini_stream<S>(
    mut stream: S,
    idle_timeout: Duration,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError>
where
    S: Stream<Item = Result<Bytes, LlmError>> + Unpin,
{
    let watchdog = IdleWatchdog::new(idle_timeout);
    let mut full_text = String::new();
    let mut usage = Usage::default();
    let mut assembler = ToolCallAssembler::new();
    let mut stop_reason: Option<String> = None;
    let mut buffer = String::new();
    // Reassemble multibyte UTF-8 codepoints split across chunk boundaries
    // (emoji/CJK/accents) instead of corrupting them with per-chunk lossy decode.
    let mut decoder = Utf8StreamDecoder::new();

    loop {
        let chunk = match watchdog.next_item(&mut stream).await? {
            None => break,
            Some(item) => item?,
        };
        buffer.push_str(&decoder.push(&chunk));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.starts_with(':') {
                on_event(StreamEvent::Keepalive);
                continue;
            }
            if let Some(data) = line.strip_prefix("data: ") {
                let event = match serde_json::from_str::<Value>(data) {
                    Ok(event) => event,
                    Err(err) => {
                        tracing::debug!(
                            provider = "google",
                            error = %err,
                            "discarding unparsable stream event"
                        );
                        continue;
                    }
                };
                {
                    let has_candidates = event.get("candidates").is_some();
                    let has_usage = event.get("usageMetadata").is_some();
                    // Extract text and tool calls from candidates[0].content.parts
                    if let Some(candidates) = event.get("candidates").and_then(|c| c.as_array())
                        && let Some(candidate) = candidates.first()
                    {
                        // Check finish reason
                        if let Some(reason) = candidate.get("finishReason").and_then(|r| r.as_str())
                        {
                            stop_reason = Some(reason.to_string());
                        }

                        if let Some(parts) = candidate
                            .get("content")
                            .and_then(|c| c.get("parts"))
                            .and_then(|p| p.as_array())
                        {
                            for part in parts {
                                // Text content
                                if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                                    full_text.push_str(text);
                                    on_event(StreamEvent::TextDelta {
                                        text: text.to_string(),
                                    });
                                }
                                // Function call — arrives complete, args
                                // already a JSON value.
                                if let Some(fc) = part.get("functionCall") {
                                    let name = fc
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or_default()
                                        .to_string();
                                    let args = fc.get("args").cloned().unwrap_or(
                                        serde_json::Value::Object(serde_json::Map::new()),
                                    );
                                    let index = assembler.completed_len();
                                    let id = format!("gemini_{index}");
                                    on_event(StreamEvent::ToolCallStart {
                                        index,
                                        id: id.clone(),
                                        name: name.clone(),
                                    });
                                    on_event(StreamEvent::ToolCallArgsDelta {
                                        index,
                                        fragment: args.to_string(),
                                    });
                                    assembler.push_completed(ToolCall {
                                        id,
                                        name,
                                        arguments: args,
                                    });
                                }
                            }
                        }
                    }
                    // Token usage from usageMetadata
                    if let Some(u) = event.get("usageMetadata") {
                        usage.input_tokens = u
                            .get("promptTokenCount")
                            .and_then(serde_json::Value::as_u64)
                            .unwrap_or(0) as u32;
                        usage.output_tokens = u
                            .get("candidatesTokenCount")
                            .and_then(serde_json::Value::as_u64)
                            .unwrap_or(0) as u32;
                        on_event(StreamEvent::Usage {
                            usage: usage.clone(),
                        });
                    }
                    if !has_candidates && !has_usage {
                        on_event(StreamEvent::Vendor {
                            event: "unknown".to_string(),
                            data: event,
                        });
                    }
                }
            }
        }
    }

    let tool_calls = assembler.into_completed();
    on_event(StreamEvent::End {
        stop_reason: stop_reason.clone(),
    });
    Ok(ChatOutcome {
        text: full_text,
        tool_calls,
        usage,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// Ollama native API (streaming NDJSON)
// ---------------------------------------------------------------------------

/// Build the Ollama-native `/api/chat` request body for `req` (message
/// compaction + nativization + body shell). Pure — exposed so
/// conformance/parity oracles (stage c2c) can byte-compare request bodies
/// without a socket.
pub fn build_ollama_request_body(req: &ChatRequest<'_>) -> Value {
    let mut api_messages: Vec<Value> = req
        .messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();
    compact_ollama_message_values(
        &mut api_messages,
        req.tools.is_some_and(|tool_defs| !tool_defs.is_empty()),
    );
    // Map OpenAI content-part arrays (esp. images) into Ollama's native shape.
    ollama_nativize_message_values(&mut api_messages);

    ollama_chat_request_body(
        req.model,
        api_messages,
        req.tools,
        &crate::serialize::OllamaRequestOpts {
            max_tokens: req.max_tokens,
            temperature: req.temperature,
            // `None` keeps this engine's legacy wire default (`think: false`)
            // so pre-c2c callers' request bytes are unchanged.
            think: Some(req.ollama_think.unwrap_or(false)),
            num_ctx: req.num_ctx,
            stream: true,
        },
    )
}

async fn stream_ollama(
    client: &reqwest::Client,
    spec: &ProviderSpec,
    req: &ChatRequest<'_>,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError> {
    let body = build_ollama_request_body(req);
    let base = spec.base_url.trim_end_matches('/');
    let url = format!("{base}/api/chat");

    tracing::trace!(spec = ?spec, model = %req.model, "sending ollama chat request");

    let mut builder = client.post(&url);
    builder = builder.header("content-type", "application/json");
    builder = apply_headers(builder, spec);
    let resp = builder.json(&body).send().await.map_err(|e| {
        let msg = e.to_string();
        if msg.contains("Connection refused") || msg.contains("connection refused") {
            LlmError::Network {
                url: url.clone(),
                message: "Ollama server not running. Start it with: ollama serve".to_string(),
            }
        } else {
            LlmError::Network {
                url: url.clone(),
                message: msg,
            }
        }
    })?;

    if !resp.status().is_success() {
        return Err(error_from_response(provider_label(spec), req.model, resp).await);
    }

    run_ollama_stream(llm_byte_stream(resp), req.idle_timeout, on_event).await
}

/// Per-event decode for Ollama's NDJSON stream. Shared by the in-loop and
/// trailing-buffer paths.
struct OllamaFold {
    full_text: String,
    usage: Usage,
    assembler: ToolCallAssembler,
    stop_reason: Option<String>,
}

fn handle_ollama_stream_event(event: &Value, fold: &mut OllamaFold, on_event: OnEvent<'_>) {
    if let Some(text) = event
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        && !text.is_empty()
    {
        fold.full_text.push_str(text);
        on_event(StreamEvent::TextDelta {
            text: text.to_string(),
        });
    }

    if let Some(tc_array) = event
        .get("message")
        .and_then(|m| m.get("tool_calls"))
        .and_then(|t| t.as_array())
    {
        for tc in tc_array {
            if let Some(func) = tc.get("function") {
                let name = func
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or_default()
                    .to_string();
                let args = normalize_tool_arguments_value(&name, func.get("arguments"));
                let index = fold.assembler.completed_len();
                let id = format!("ollama_{index}");
                on_event(StreamEvent::ToolCallStart {
                    index,
                    id: id.clone(),
                    name: name.clone(),
                });
                on_event(StreamEvent::ToolCallArgsDelta {
                    index,
                    fragment: args.to_string(),
                });
                fold.assembler.push_completed(ToolCall {
                    id,
                    name,
                    arguments: args,
                });
            }
        }
        fold.stop_reason = Some("tool_calls".to_string());
    }

    if event.get("done").and_then(serde_json::Value::as_bool) == Some(true) {
        fold.usage.input_tokens = event
            .get("prompt_eval_count")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0) as u32;
        fold.usage.output_tokens = event
            .get("eval_count")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(0) as u32;
        if fold.stop_reason.is_none() {
            fold.stop_reason = Some("stop".to_string());
        }
        on_event(StreamEvent::Usage {
            usage: fold.usage.clone(),
        });
    }
}

/// Decode an Ollama-native `/api/chat` NDJSON byte stream.
pub async fn run_ollama_stream<S>(
    mut stream: S,
    idle_timeout: Duration,
    on_event: OnEvent<'_>,
) -> Result<ChatOutcome, LlmError>
where
    S: Stream<Item = Result<Bytes, LlmError>> + Unpin,
{
    let watchdog = IdleWatchdog::new(idle_timeout);
    let mut fold = OllamaFold {
        full_text: String::new(),
        usage: Usage::default(),
        assembler: ToolCallAssembler::new(),
        stop_reason: None,
    };
    let mut buffer = String::new();
    // Reassemble multibyte UTF-8 codepoints split across chunk boundaries
    // (emoji/CJK/accents) instead of corrupting them with per-chunk lossy decode.
    let mut decoder = Utf8StreamDecoder::new();

    loop {
        let chunk = match watchdog.next_item(&mut stream).await? {
            None => break,
            Some(item) => item?,
        };
        buffer.push_str(&decoder.push(&chunk));

        // Ollama sends newline-delimited JSON (not SSE)
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            match serde_json::from_str::<Value>(&line) {
                Ok(event) => handle_ollama_stream_event(&event, &mut fold, on_event),
                Err(err) => tracing::debug!(
                    provider = "ollama",
                    error = %err,
                    "discarding unparsable stream line"
                ),
            }
        }
    }

    // Flush any bytes the decoder is still holding so the trailing NDJSON parse
    // sees a complete object (a clean stream yields "").
    buffer.push_str(&decoder.finish());
    let trailing = buffer.trim();
    if !trailing.is_empty() {
        match serde_json::from_str::<Value>(trailing) {
            Ok(event) => handle_ollama_stream_event(&event, &mut fold, on_event),
            Err(err) => tracing::debug!(
                provider = "ollama",
                error = %err,
                "discarding unparsable trailing stream data"
            ),
        }
    }

    let OllamaFold {
        full_text,
        usage,
        assembler,
        stop_reason,
    } = fold;
    let tool_calls = assembler.into_completed();
    on_event(StreamEvent::End {
        stop_reason: stop_reason.clone(),
    });
    Ok(ChatOutcome {
        text: full_text,
        tool_calls,
        usage,
        stop_reason,
    })
}

#[cfg(test)]
mod responses_request_tests {
    use super::*;
    use crate::wire::ContentBlock;

    #[test]
    fn responses_body_uses_typed_items_flat_tools_and_responses_token_limit() {
        let messages = vec![
            Message::text("system", "Keep answers concise."),
            Message::blocks(
                "user",
                vec![
                    ContentBlock::Text {
                        text: "Read this".to_string(),
                    },
                    ContentBlock::Image {
                        mime: "image/png".to_string(),
                        data_b64: "BASE64DATA".to_string(),
                    },
                ],
            ),
            Message::blocks(
                "assistant",
                vec![ContentBlock::ToolUse {
                    id: "call_1".to_string(),
                    name: "read_file".to_string(),
                    input: serde_json::json!({"path": "a.txt"}),
                }],
            ),
            Message::blocks(
                "user",
                vec![ContentBlock::ToolResult {
                    tool_use_id: "call_1".to_string(),
                    content: "hello".to_string(),
                    is_error: false,
                }],
            ),
        ];
        let tools = vec![ToolDefinition {
            name: "read_file".to_string(),
            description: "Read a file".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"]
            }),
            is_read_only: true,
            is_concurrency_safe: true,
            max_result_size_chars: None,
            should_defer: false,
            aliases: Vec::new(),
            owner: String::new(),
            permission_class: String::new(),
            diagnostic_tags: Vec::new(),
        }];
        let request = ChatRequest {
            model: "registry-selected-reasoning-model",
            messages: &messages,
            max_tokens: 64,
            temperature: None,
            tools: Some(&tools),
            thinking_budget: None,
            num_ctx: None,
            ollama_think: None,
            idle_timeout: Duration::from_secs(5),
        };

        let body = build_openai_responses_body(&request);

        assert_eq!(body["instructions"], "Keep answers concise.");
        assert_eq!(body["max_output_tokens"], 64);
        assert_eq!(body["stream"], true);
        assert!(body.get("messages").is_none());
        assert!(body.get("max_completion_tokens").is_none());
        assert!(body.get("stream_options").is_none());

        let input = body["input"].as_array().expect("Responses input items");
        assert_eq!(input[0]["role"], "user");
        assert_eq!(input[0]["content"][0]["type"], "input_text");
        assert_eq!(input[0]["content"][1]["type"], "input_image");
        assert_eq!(
            input[0]["content"][1]["image_url"],
            "data:image/png;base64,BASE64DATA"
        );
        assert_eq!(input[1]["type"], "function_call");
        assert_eq!(input[1]["call_id"], "call_1");
        assert_eq!(input[2]["type"], "function_call_output");
        assert_eq!(input[2]["call_id"], "call_1");

        let function = &body["tools"][0];
        assert_eq!(function["type"], "function");
        assert_eq!(function["name"], "read_file");
        assert_eq!(function["parameters"]["required"][0], "path");
        assert!(function.get("function").is_none());
    }
}
