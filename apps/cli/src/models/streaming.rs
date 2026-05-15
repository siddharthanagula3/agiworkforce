use anyhow::{bail, Context, Result};
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::Value;
use std::collections::HashMap;

use crate::config::CliConfig;
use crate::errors::CliError;

use super::{
    provider_dispatch::{resolve_key, try_subscription_auth},
    serialization::{
        convert_message_to_anthropic, convert_message_to_gemini, convert_message_to_openai,
    },
    CompletionResult, Message, OllamaMode, Provider, StreamCallback, ToolCallResponse,
    ToolDefinition, STREAM_IDLE_TIMEOUT,
};

// ---------------------------------------------------------------------------
// HTTP status → CliError classification
// ---------------------------------------------------------------------------

/// Infer provider name from a base URL for error reporting.
fn provider_name_from_url(url: &str) -> &str {
    if url.contains("openai") {
        "openai"
    } else if url.contains("mistral") {
        "mistral"
    } else if url.contains("xai") || url.contains("grok") {
        "xai"
    } else if url.contains("deepseek") {
        "deepseek"
    } else if url.contains("localhost") || url.contains("127.0.0.1") {
        "ollama"
    } else {
        "unknown"
    }
}

/// Check whether an error message looks like a context window overflow.
fn looks_like_context_overflow(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("context")
        && (lower.contains("exceed")
            || lower.contains("too long")
            || lower.contains("overflow")
            || lower.contains("maximum"))
}

/// Convert an HTTP error response into a typed `CliError`.
///
/// Classifies by status code:
/// - 401/403 -> `CliError::Auth`
/// - 429     -> `CliError::RateLimited` (with `Retry-After` header if present)
/// - 500/502/503/504 -> `CliError::Api`
/// - everything else -> `CliError::Api`
fn classify_http_error(
    provider: &str,
    status: reqwest::StatusCode,
    retry_after: Option<&reqwest::header::HeaderValue>,
    body: &str,
) -> CliError {
    let code = status.as_u16();

    // Provider-specific error messages
    match (provider, code) {
        ("anthropic", 529) => {
            return CliError::api(provider, code, "Anthropic is overloaded. Retrying...");
        }
        ("openai", 404) => {
            return CliError::api(provider, code, "Model not found or not available");
        }
        ("google", 400) if body.to_lowercase().contains("api key") => {
            return CliError::auth(provider, "Invalid Google API key");
        }
        _ => {}
    }

    match code {
        401 | 403 => CliError::auth(provider, body),
        429 => {
            // AGI Workforce managed-cloud paywall: 429 + {"kind":"paywall", ...}
            // Takes precedence over generic rate-limit handling.
            if let Some(pw) = parse_paywall_body(body) {
                return pw;
            }
            let secs = retry_after
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok());
            CliError::rate_limited(provider, secs)
        }
        _ => CliError::api(provider, code, body),
    }
}

/// Attempt to parse a paywall JSON body returned by the AGI Workforce managed-cloud
/// API (`/api/llm/v1/chat/completions`) when a user exceeds 150 % of their tier quota.
///
/// Expected shape: `{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"..."}`
///
/// Returns `Some(CliError::Paywall {...})` when the body matches, `None` otherwise so
/// callers can fall back to the regular rate-limit error.
pub fn parse_paywall_body(body: &str) -> Option<CliError> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    if v.get("kind").and_then(|k| k.as_str()) != Some("paywall") {
        return None;
    }
    let feature = v
        .get("feature")
        .and_then(|f| f.as_str())
        .unwrap_or("chat")
        .to_string();
    let required_tier = v
        .get("requiredTier")
        .and_then(|t| t.as_str())
        .unwrap_or("hobby")
        .to_string();
    let reason = v
        .get("reason")
        .and_then(|r| r.as_str())
        .unwrap_or("Monthly token quota exceeded")
        .to_string();
    Some(CliError::paywall(feature, required_tier, reason))
}

// ---------------------------------------------------------------------------
// Streaming completion (main entry point)
// ---------------------------------------------------------------------------

/// Send a streaming chat completion request and invoke `on_chunk` for each text delta.
/// Returns a `CompletionResult` with text, tool calls, and token usage.
pub async fn stream_completion(
    config: &CliConfig,
    provider: &Provider,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    tools: Option<&[ToolDefinition]>,
    mut on_chunk: StreamCallback,
) -> Result<CompletionResult> {
    let client = Client::new();
    let temperature = config.default.temperature;

    // ---- Try subscription auth first (Copilot, ChatGPT Plus) ----
    if let Some((token, url, sub_name, account_id)) = try_subscription_auth(provider).await {
        let mut result = match sub_name.as_str() {
            "copilot" => {
                stream_copilot_api(
                    &client,
                    &token,
                    &url,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    &mut on_chunk,
                )
                .await?
            }
            "chatgpt" => {
                stream_chatgpt_codex(
                    &client,
                    &token,
                    &url,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    &mut on_chunk,
                    account_id.as_deref(),
                )
                .await?
            }
            _ => {
                stream_openai_compatible(
                    &client,
                    &token,
                    &url,
                    model,
                    messages,
                    max_tokens,
                    temperature,
                    tools,
                    &mut on_chunk,
                )
                .await?
            }
        };
        result.via_subscription = true;
        return Ok(result);
    }

    // ---- Fall through to API key auth ----
    let api_key = resolve_key(config, provider)?;

    match provider {
        Provider::Anthropic => {
            stream_anthropic(
                &client,
                api_key.as_deref().unwrap_or_default(),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Google => {
            stream_google(
                &client,
                api_key.as_deref().unwrap_or_default(),
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Local) => {
            let base_url = config
                .base_url("ollama")
                .unwrap_or_else(|| "http://localhost:11434".to_string());
            stream_ollama(
                &client,
                &base_url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Ollama(OllamaMode::Cloud) => {
            let base_url = config
                .base_url("ollama-cloud")
                .unwrap_or_else(|| "https://api.ollama.com/v1".to_string());
            let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
            stream_openai_compatible(
                &client,
                api_key.as_deref().unwrap_or_default(),
                &url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::OpenAICompatible {
            name: _,
            base_url,
            ..
        } => {
            stream_openai_compatible(
                &client,
                api_key.as_deref().unwrap_or_default(),
                base_url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
        Provider::Custom { base_url, .. } => {
            stream_openai_compatible(
                &client,
                api_key.as_deref().unwrap_or_default(),
                base_url,
                model,
                messages,
                max_tokens,
                temperature,
                tools,
                &mut on_chunk,
            )
            .await
        }
    }
}

// ---------------------------------------------------------------------------
// Anthropic Messages API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_anthropic(
    client: &Client,
    api_key: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(convert_message_to_anthropic)
        .collect();

    let system_text = messages
        .iter()
        .find(|m| m.role == "system")
        .map(|m| m.text_content())
        .unwrap_or_default();

    // Build a system prompt with a cache breakpoint just before the volatile
    // <environment> block (see agent.rs::build_system_prompt — the env block
    // is always last). When the prefix is non-empty we send the system field
    // as an array of two text blocks; cache_control on the first block makes
    // everything above the env block cacheable. This typically halves the
    // billed input tokens on the second-and-later turn of a session.
    //
    // The split is robust: if the marker isn't present (e.g. sysprompt was
    // overridden via --system-prompt with no env block), we fall back to a
    // single cached block. If the system text is empty, omit the system
    // field entirely.
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
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "messages": api_messages,
    });
    if let Some(sys) = system_value {
        body["system"] = sys;
    }

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        // Mark the last tool with cache_control so the entire tools array is
        // cacheable. Tools rarely change mid-session, so this is pure win.
        let last_idx = tool_defs.len().saturating_sub(1);
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .enumerate()
            .map(|(i, t)| {
                let mut entry = serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "input_schema": t.input_schema,
                });
                if i == last_idx && !tool_defs.is_empty() {
                    entry["cache_control"] = serde_json::json!({"type": "ephemeral"});
                }
                entry
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let url = "https://api.anthropic.com/v1/messages";
    let resp = client
        .post(url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("anthropic", status, retry_after.as_ref(), &text).into());
    }

    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut cache_read_input_tokens: u32 = 0;
    let mut cache_creation_input_tokens: u32 = 0;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    // Tool call tracking
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut current_tool_id = String::new();
    let mut current_tool_name = String::new();
    let mut current_tool_input = String::new();
    let mut stop_reason: Option<String> = None;

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Process complete SSE lines
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

                    match event_type {
                        "content_block_start" => {
                            // Check if this is a tool_use block
                            if let Some(cb) = event.get("content_block") {
                                if cb.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                    current_tool_id = cb
                                        .get("id")
                                        .and_then(|i| i.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    current_tool_name = cb
                                        .get("name")
                                        .and_then(|n| n.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    current_tool_input.clear();
                                }
                            }
                        }
                        "content_block_delta" => {
                            if let Some(delta) = event.get("delta") {
                                let delta_type =
                                    delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                match delta_type {
                                    "text_delta" => {
                                        if let Some(text) =
                                            delta.get("text").and_then(|t| t.as_str())
                                        {
                                            full_text.push_str(text);
                                            on_chunk(text);
                                        }
                                    }
                                    "input_json_delta" => {
                                        if let Some(json_chunk) =
                                            delta.get("partial_json").and_then(|p| p.as_str())
                                        {
                                            current_tool_input.push_str(json_chunk);
                                        }
                                    }
                                    _ => {}
                                }
                            }
                        }
                        "content_block_stop" => {
                            // If we were accumulating a tool call, finalize it
                            if !current_tool_name.is_empty() {
                                let arguments = serde_json::from_str(&current_tool_input)
                                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                                tool_calls.push(ToolCallResponse {
                                    id: current_tool_id.clone(),
                                    name: current_tool_name.clone(),
                                    arguments,
                                });
                                current_tool_id.clear();
                                current_tool_name.clear();
                                current_tool_input.clear();
                            }
                        }
                        "message_start" => {
                            if let Some(usage) = event.get("message").and_then(|m| m.get("usage")) {
                                input_tokens = usage
                                    .get("input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                // Anthropic returns cache stats inline with the
                                // initial usage object on message_start. Capture
                                // them here so callers see cache hits even when
                                // the rest of the message is streamed slowly.
                                cache_read_input_tokens = usage
                                    .get("cache_read_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                cache_creation_input_tokens = usage
                                    .get("cache_creation_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                            }
                        }
                        "message_delta" => {
                            if let Some(delta) = event.get("delta") {
                                if let Some(reason) =
                                    delta.get("stop_reason").and_then(|r| r.as_str())
                                {
                                    stop_reason = Some(reason.to_string());
                                }
                            }
                            if let Some(usage) = event.get("usage") {
                                output_tokens = usage
                                    .get("output_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                // Some Anthropic responses populate cache stats
                                // on message_delta instead of (or in addition
                                // to) message_start. Prefer the larger value so
                                // we don't lose accuracy if both fire.
                                let delta_cache_read = usage
                                    .get("cache_read_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                if delta_cache_read > cache_read_input_tokens {
                                    cache_read_input_tokens = delta_cache_read;
                                }
                                let delta_cache_creation = usage
                                    .get("cache_creation_input_tokens")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0)
                                    as u32;
                                if delta_cache_creation > cache_creation_input_tokens {
                                    cache_creation_input_tokens = delta_cache_creation;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens,
        cache_creation_input_tokens,
        via_subscription: false,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// OpenAI-compatible Chat Completions API (streaming)
// Used by: OpenAI, Mistral, xAI, DeepSeek
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_openai_compatible(
    client: &Client,
    api_key: &str,
    base_url: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let resp = client
        .post(base_url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(base_url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        let provider = provider_name_from_url(base_url);
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error(provider, status, retry_after.as_ref(), &text).into());
    }

    parse_openai_sse_stream(resp, on_chunk).await
}

// ---------------------------------------------------------------------------
// Google Gemini API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_google(
    client: &Client,
    api_key: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    // Gemini uses a different message format: contents with parts
    let contents: Vec<Value> = messages
        .iter()
        .filter(|m| m.role != "system")
        .map(convert_message_to_gemini)
        .collect();

    let system_instruction = messages.iter().find(|m| m.role == "system").map(|m| {
        serde_json::json!({
            "parts": [{ "text": m.text_content() }]
        })
    });

    let mut body = serde_json::json!({
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": max_tokens,
        },
    });

    if let Some(temp) = temperature {
        body["generationConfig"]["temperature"] = serde_json::json!(temp);
    }

    if let Some(si) = system_instruction {
        body["systemInstruction"] = si;
    }

    if let Some(tool_defs) = tools {
        let declarations: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                })
            })
            .collect();
        body["tools"] = serde_json::json!([{ "functionDeclarations": declarations }]);
    }

    // Normalize model name: strip "models/" prefix if user included it
    let model_path = if model.starts_with("models/") {
        model.to_string()
    } else {
        format!("models/{}", model)
    };

    // CodeQL rust/cleartext-transmission (audit 2026-05-03): pass the
    // API key via `x-goog-api-key` header instead of the `?key=` query
    // parameter. URL query strings are routinely logged in proxy logs,
    // browser histories, and reverse-proxy access logs — putting the
    // key in the header keeps it out of those byways. The transmission
    // itself was already HTTPS-encrypted but the key would still
    // appear in upstream log middleware records.
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/{}:streamGenerateContent?alt=sse",
        model_path
    );

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(&url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("google", status, retry_after.as_ref(), &text).into());
    }

    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut stop_reason: Option<String> = None;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    // Extract text and tool calls from candidates[0].content.parts
                    if let Some(candidates) = event.get("candidates").and_then(|c| c.as_array()) {
                        if let Some(candidate) = candidates.first() {
                            // Check finish reason
                            if let Some(reason) =
                                candidate.get("finishReason").and_then(|r| r.as_str())
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
                                        on_chunk(text);
                                    }
                                    // Function call
                                    if let Some(fc) = part.get("functionCall") {
                                        let name = fc
                                            .get("name")
                                            .and_then(|n| n.as_str())
                                            .unwrap_or_default()
                                            .to_string();
                                        let args = fc.get("args").cloned().unwrap_or(
                                            serde_json::Value::Object(serde_json::Map::new()),
                                        );
                                        let id = format!("gemini_{}", tool_calls.len());
                                        tool_calls.push(ToolCallResponse {
                                            id,
                                            name,
                                            arguments: args,
                                        });
                                    }
                                }
                            }
                        }
                    }
                    // Token usage from usageMetadata
                    if let Some(usage) = event.get("usageMetadata") {
                        input_tokens = usage
                            .get("promptTokenCount")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        output_tokens = usage
                            .get("candidatesTokenCount")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                    }
                }
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        via_subscription: false,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// Ollama API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_ollama(
    client: &Client,
    base_url: &str,
    model: &str,
    messages: &[Message],
    _max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "messages": api_messages,
        "stream": true,
    });

    if let Some(temp) = temperature {
        body["options"] = serde_json::json!({ "temperature": temp });
    }

    // Ollama supports OpenAI-format tool definitions
    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let url = format!("{}/api/chat", base_url.trim_end_matches('/'));

    let resp = client
        .post(&url)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("Connection refused") || msg.contains("connection refused") {
                CliError::network(
                    &url,
                    "Ollama server not running. Start it with: ollama serve",
                )
            } else {
                CliError::network(&url, msg)
            }
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("ollama", status, retry_after.as_ref(), &text).into());
    }

    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut stop_reason: Option<String> = None;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        // Ollama sends newline-delimited JSON (not SSE)
        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if line.is_empty() {
                continue;
            }

            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                // Streaming content
                if let Some(text) = event
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                {
                    if !text.is_empty() {
                        full_text.push_str(text);
                        on_chunk(text);
                    }
                }

                // Tool calls from Ollama (in the message.tool_calls field)
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
                            let args = func
                                .get("arguments")
                                .and_then(|a| {
                                    if a.is_string() {
                                        serde_json::from_str(a.as_str().unwrap_or("{}")).ok()
                                    } else {
                                        Some(a.clone())
                                    }
                                })
                                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                            let id = format!("ollama_{}", tool_calls.len());
                            tool_calls.push(ToolCallResponse {
                                id,
                                name,
                                arguments: args,
                            });
                        }
                    }
                    stop_reason = Some("tool_calls".to_string());
                }

                // Final message includes done=true and token counts
                if event.get("done").and_then(|d| d.as_bool()) == Some(true) {
                    input_tokens = event
                        .get("prompt_eval_count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    output_tokens = event
                        .get("eval_count")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0) as u32;
                    if stop_reason.is_none() {
                        stop_reason = Some("stop".to_string());
                    }
                }
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        via_subscription: false,
        stop_reason,
    })
}

// ---------------------------------------------------------------------------
// GitHub Copilot subscription API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_copilot_api(
    client: &Client,
    token: &str,
    url: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .header(
            "User-Agent",
            concat!("agiworkforce-cli/", env!("CARGO_PKG_VERSION")),
        )
        .header("Openai-Intent", "conversation-edits")
        .header("Copilot-Vision-Request", "true")
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("copilot", status, retry_after.as_ref(), &text).into());
    }

    parse_openai_sse_stream(resp, on_chunk).await
}

// ---------------------------------------------------------------------------
// ChatGPT Plus / Codex subscription API (streaming)
// ---------------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
async fn stream_chatgpt_codex(
    client: &Client,
    token: &str,
    url: &str,
    model: &str,
    messages: &[Message],
    max_tokens: u32,
    temperature: Option<f32>,
    tools: Option<&[ToolDefinition]>,
    on_chunk: &mut StreamCallback,
    account_id: Option<&str>,
) -> Result<CompletionResult> {
    let api_messages: Vec<Value> = messages
        .iter()
        .flat_map(convert_message_to_openai)
        .collect();

    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": max_tokens,
        "stream": true,
        "stream_options": { "include_usage": true },
        "messages": api_messages,
    });

    if let Some(temp) = temperature {
        body["temperature"] = serde_json::json!(temp);
    }

    if let Some(tool_defs) = tools {
        let tools_json: Vec<Value> = tool_defs
            .iter()
            .map(|t| {
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    }
                })
            })
            .collect();
        body["tools"] = serde_json::json!(tools_json);
    }

    let mut req = client
        .post(url)
        .header("Authorization", format!("Bearer {}", token))
        .header("content-type", "application/json")
        .header("originator", "agiworkforce");

    if let Some(aid) = account_id {
        req = req.header("ChatGPT-Account-Id", aid);
    }

    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| CliError::network(url, e.to_string()))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let retry_after = resp.headers().get(reqwest::header::RETRY_AFTER).cloned();
        let text = resp.text().await.unwrap_or_default();
        if looks_like_context_overflow(&text) {
            return Err(CliError::context_overflow(model, 0, 0).into());
        }
        return Err(classify_http_error("chatgpt", status, retry_after.as_ref(), &text).into());
    }

    parse_openai_sse_stream(resp, on_chunk).await
}

// ---------------------------------------------------------------------------
// Shared SSE parser for OpenAI-compatible streaming responses
// ---------------------------------------------------------------------------

/// Parse an OpenAI-compatible SSE stream into a CompletionResult.
/// Used by `stream_openai_compatible`, `stream_copilot_api`, and
/// `stream_chatgpt_codex` to avoid duplicating the SSE parsing logic.
async fn parse_openai_sse_stream(
    resp: reqwest::Response,
    on_chunk: &mut StreamCallback,
) -> Result<CompletionResult> {
    let mut full_text = String::new();
    let mut input_tokens: u32 = 0;
    let mut output_tokens: u32 = 0;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    // Tool call tracking
    let mut tool_call_buffers: HashMap<usize, (String, String, String)> = HashMap::new();
    let mut stop_reason: Option<String> = None;

    loop {
        let chunk = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()).await;
        let chunk = match chunk {
            Err(_) => bail!("Streaming timed out: no data received for 5 minutes"),
            Ok(None) => break,
            Ok(Some(result)) => result,
        };
        let bytes = chunk.context("Error reading stream")?;
        buffer.push_str(&String::from_utf8_lossy(&bytes));

        while let Some(line_end) = buffer.find('\n') {
            let line = buffer[..line_end].trim_end().to_string();
            buffer = buffer[line_end + 1..].to_string();

            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    continue;
                }
                if let Ok(event) = serde_json::from_str::<Value>(data) {
                    if let Some(choices) = event.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.first() {
                            // Text content delta
                            if let Some(text) = choice
                                .get("delta")
                                .and_then(|d| d.get("content"))
                                .and_then(|c| c.as_str())
                            {
                                full_text.push_str(text);
                                on_chunk(text);
                            }

                            // Tool call deltas
                            if let Some(tc_array) = choice
                                .get("delta")
                                .and_then(|d| d.get("tool_calls"))
                                .and_then(|t| t.as_array())
                            {
                                for tc in tc_array {
                                    let index =
                                        tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0)
                                            as usize;
                                    let entry =
                                        tool_call_buffers.entry(index).or_insert_with(|| {
                                            (String::new(), String::new(), String::new())
                                        });

                                    if let Some(id) = tc.get("id").and_then(|i| i.as_str()) {
                                        entry.0 = id.to_string();
                                    }
                                    if let Some(func) = tc.get("function") {
                                        if let Some(name) =
                                            func.get("name").and_then(|n| n.as_str())
                                        {
                                            entry.1 = name.to_string();
                                        }
                                        if let Some(args) =
                                            func.get("arguments").and_then(|a| a.as_str())
                                        {
                                            entry.2.push_str(args);
                                        }
                                    }
                                }
                            }

                            // Finish reason
                            if let Some(reason) =
                                choice.get("finish_reason").and_then(|r| r.as_str())
                            {
                                if !reason.is_empty() && reason != "null" {
                                    stop_reason = Some(reason.to_string());
                                }
                            }
                        }
                    }
                    if let Some(usage) = event.get("usage") {
                        input_tokens = usage
                            .get("prompt_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                        output_tokens = usage
                            .get("completion_tokens")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0) as u32;
                    }
                }
            }
        }
    }

    // Convert tool call buffers to ToolCallResponse
    let mut tool_calls: Vec<ToolCallResponse> = Vec::new();
    let mut sorted_indices: Vec<usize> = tool_call_buffers.keys().copied().collect();
    sorted_indices.sort();
    for idx in sorted_indices {
        if let Some((id, name, args_json)) = tool_call_buffers.remove(&idx) {
            if !name.is_empty() {
                let arguments = serde_json::from_str(&args_json)
                    .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
                tool_calls.push(ToolCallResponse {
                    id,
                    name,
                    arguments,
                });
            }
        }
    }

    Ok(CompletionResult {
        text: full_text,
        tool_calls,
        input_tokens,
        output_tokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        via_subscription: false,
        stop_reason,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // -- Context overflow detection --

    #[test]
    fn context_overflow_detects_exceed() {
        assert!(looks_like_context_overflow(
            "This request's context exceeds the model's maximum"
        ));
    }

    #[test]
    fn context_overflow_detects_too_long() {
        assert!(looks_like_context_overflow(
            "The context is too long for this model"
        ));
    }

    #[test]
    fn context_overflow_detects_overflow() {
        assert!(looks_like_context_overflow(
            "context overflow: token limit reached"
        ));
    }

    #[test]
    fn context_overflow_detects_maximum() {
        assert!(looks_like_context_overflow(
            "context length exceeds maximum allowed"
        ));
    }

    #[test]
    fn context_overflow_ignores_unrelated() {
        assert!(!looks_like_context_overflow("invalid api key"));
        assert!(!looks_like_context_overflow("rate limited"));
        assert!(!looks_like_context_overflow("exceeded quota")); // no "context"
    }

    // -- Provider-specific error messages --

    #[test]
    fn anthropic_529_overloaded() {
        let err = classify_http_error(
            "anthropic",
            reqwest::StatusCode::from_u16(529).unwrap(),
            None,
            "overloaded",
        );
        let msg = err.to_string();
        assert!(
            msg.contains("Anthropic is overloaded"),
            "Expected overloaded message, got: {}",
            msg
        );
    }

    #[test]
    fn openai_404_model_not_found() {
        let err = classify_http_error(
            "openai",
            reqwest::StatusCode::NOT_FOUND,
            None,
            "model does not exist",
        );
        let msg = err.to_string();
        assert!(
            msg.contains("Model not found or not available"),
            "Expected model-not-found message, got: {}",
            msg
        );
    }

    #[test]
    fn google_400_bad_api_key() {
        let err = classify_http_error(
            "google",
            reqwest::StatusCode::BAD_REQUEST,
            None,
            "API key not valid. Please pass a valid API key.",
        );
        let msg = err.to_string();
        assert!(
            msg.contains("Invalid Google API key"),
            "Expected api-key message, got: {}",
            msg
        );
    }

    #[test]
    fn google_400_without_api_key_text_is_generic() {
        let err = classify_http_error(
            "google",
            reqwest::StatusCode::BAD_REQUEST,
            None,
            "some other bad request",
        );
        let msg = err.to_string();
        // Should fall through to generic API error, not the api key message
        assert!(
            !msg.contains("Invalid Google API key"),
            "Should not show api-key message for unrelated 400: {}",
            msg
        );
    }

    // -- Streaming idle timeout --

    #[tokio::test]
    async fn stream_timeout_fires_on_stall() {
        // Simulate a stream that never produces data — timeout should fire quickly
        let short_timeout = Duration::from_millis(50);
        let stream = futures_util::stream::pending::<Result<bytes::Bytes, reqwest::Error>>();
        let mut stream = Box::pin(stream);

        let result = tokio::time::timeout(short_timeout, stream.next()).await;
        assert!(result.is_err(), "Expected timeout on stalled stream");
    }

    #[tokio::test]
    async fn stream_timeout_does_not_fire_on_data() {
        // A stream that yields immediately should not time out
        let short_timeout = Duration::from_millis(500);
        let data = bytes::Bytes::from("data: {}\n\n");
        let stream = futures_util::stream::once(async move { Ok::<_, reqwest::Error>(data) });
        let mut stream = Box::pin(stream);

        let result = tokio::time::timeout(short_timeout, stream.next()).await;
        assert!(result.is_ok(), "Should not timeout when data is available");
        assert!(result.unwrap().is_some());
    }

    #[tokio::test]
    async fn stream_timeout_detects_end_of_stream() {
        let short_timeout = Duration::from_millis(500);
        let stream = futures_util::stream::empty::<Result<bytes::Bytes, reqwest::Error>>();
        let mut stream = Box::pin(stream);

        let result = tokio::time::timeout(short_timeout, stream.next()).await;
        assert!(result.is_ok(), "End-of-stream should not be a timeout");
        assert!(result.unwrap().is_none(), "Stream ended, should be None");
    }

    // -- classify_http_error standard codes --

    #[test]
    fn classify_401_as_auth() {
        let err = classify_http_error(
            "openai",
            reqwest::StatusCode::UNAUTHORIZED,
            None,
            "invalid key",
        );
        assert!(
            err.to_string().contains("Authentication failed"),
            "401 should be auth error"
        );
    }

    #[test]
    fn classify_429_as_rate_limited() {
        let err = classify_http_error(
            "anthropic",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            None,
            "rate limited",
        );
        assert!(
            err.to_string().contains("Rate limited"),
            "429 should be rate-limited"
        );
    }

    #[test]
    fn classify_500_as_api_error() {
        let err = classify_http_error(
            "google",
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            None,
            "internal error",
        );
        assert!(
            err.to_string().contains("API error"),
            "500 should be api error"
        );
    }

    // -- Paywall detection --

    #[test]
    fn parse_paywall_body_detects_paywall_json() {
        let body = r#"{"kind":"paywall","feature":"chat","requiredTier":"hobby","reason":"Monthly token quota exceeded (150%)"}"#;
        let result = parse_paywall_body(body);
        assert!(result.is_some(), "Should parse paywall body");
        let err = result.unwrap();
        assert!(
            err.is_paywall(),
            "Should return a Paywall error variant"
        );
        // Verify the formatted message contains required tier and upgrade URL
        let msg = err.to_string();
        assert!(
            msg.contains("hobby"),
            "Message should contain required tier: {msg}"
        );
        assert!(
            msg.contains("agiworkforce.com/pricing"),
            "Message should contain pricing URL: {msg}"
        );
        assert!(
            msg.contains("Monthly token quota exceeded"),
            "Message should contain reason: {msg}"
        );
    }

    #[test]
    fn parse_paywall_body_returns_none_for_non_paywall_429() {
        // Generic rate-limit body from Anthropic
        let body = r#"{"error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}"#;
        let result = parse_paywall_body(body);
        assert!(result.is_none(), "Non-paywall 429 should not parse as paywall");
    }

    #[test]
    fn parse_paywall_body_returns_none_for_empty_body() {
        assert!(parse_paywall_body("").is_none());
        assert!(parse_paywall_body("null").is_none());
    }

    #[test]
    fn classify_http_error_returns_paywall_for_managed_cloud_429() {
        let paywall_body = r#"{"kind":"paywall","feature":"chat","requiredTier":"pro","reason":"Pro features require upgrade"}"#;
        let err = classify_http_error(
            "agiworkforce",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            None,
            paywall_body,
        );
        assert!(
            err.is_paywall(),
            "classify_http_error should return Paywall for 429 + paywall body"
        );
        assert_eq!(
            err.exit_code(),
            78,
            "Paywall errors should exit with code 78 (EX_CONFIG)"
        );
    }

    #[test]
    fn classify_http_error_returns_rate_limited_for_plain_429() {
        let plain_body = r#"{"error":"rate limited"}"#;
        let err = classify_http_error(
            "agiworkforce",
            reqwest::StatusCode::TOO_MANY_REQUESTS,
            None,
            plain_body,
        );
        // Plain 429 without kind:paywall should still be RateLimited
        assert!(
            !err.is_paywall(),
            "Plain 429 should NOT be Paywall, got: {:?}", err
        );
        assert!(
            err.to_string().contains("Rate limited"),
            "Plain 429 should be rate-limited: {}", err
        );
    }

    #[test]
    fn paywall_exit_code_is_78() {
        let err = crate::errors::CliError::paywall("chat", "hobby", "quota exceeded");
        assert_eq!(err.exit_code(), 78);
    }

    #[test]
    fn non_paywall_exit_code_is_1() {
        let err = crate::errors::CliError::rate_limited("anthropic", None);
        assert_eq!(err.exit_code(), 1);
    }
}
