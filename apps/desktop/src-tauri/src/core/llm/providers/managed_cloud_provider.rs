use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, LLMProvider, LLMRequest, LLMResponse,
};
use crate::sys::account::{get_access_token, get_api_base_url};
use async_trait::async_trait;
use base64::Engine;
use futures_util::Stream;
use reqwest::Client;
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;

pub struct ManagedCloudProvider {
    /// HTTP client with a 300s overall timeout, used for non-streaming requests.
    client: Client,
    /// HTTP client with no overall timeout, used for SSE streaming to avoid
    /// premature disconnection during long-running agentic sessions.
    streaming_client: Client,
}

fn managed_cloud_base_url() -> String {
    get_api_base_url()
}

fn managed_cloud_llm_url() -> String {
    format!("{}/api/llm/v1/chat/completions", managed_cloud_base_url())
}

fn auth_failed_message() -> &'static str {
    if cfg!(debug_assertions) {
        "Authentication failed (401). In local dev, ensure AGI_API_URL points to the same environment as your Supabase project, then sign in again."
    } else {
        "Authentication failed. Please sign in again."
    }
}

fn method_not_allowed_message() -> &'static str {
    if cfg!(debug_assertions) {
        "HTTP 405 Method Not Allowed. The server may not be handling CORS preflight requests correctly. Check that OPTIONS handlers are exported for the API endpoint."
    } else {
        "Service temporarily unavailable. Please try again in a few moments."
    }
}

// DESK-10 (audit 2026-05-03): the FIX-007 `impl Default` was an
// `expect(...)` that panicked on TLS-builder failure (Alpine CI,
// minimal Windows installs without the Visual C++ Redistributable,
// sandboxed environments). `Default` is invoked in test harnesses and
// `#[derive(Default)]` containers, giving the panic a wide blast
// radius. Removed entirely — every caller now uses
// `ManagedCloudProvider::new().map_err(...)` and propagates errors.

impl ManagedCloudProvider {
    fn canonicalize_cloud_model(model: &str) -> String {
        let trimmed = model.trim().to_lowercase();

        // Delegate to the centralized models.json canonicalization maps first.
        let canonical = super::super::models_config::get_canonicalized_id(&trimmed);
        if canonical != trimmed {
            return canonical;
        }

        // Cloud-specific aliases not in models.json (pattern-based rules that
        // cannot be expressed as simple key-value pairs in the JSON map).
        match trimmed.as_str() {
            m if m.starts_with("gpt-5.4-codex-") => "gpt-5.4-codex".to_string(),
            // Keep the trimmed/lowercased model ID when no alias is needed.
            _ => trimmed,
        }
    }

    fn codex_effort_override(model: &str) -> Option<&'static str> {
        let normalized = model.trim().to_lowercase();
        if normalized.ends_with("-low") {
            Some("low")
        } else if normalized.ends_with("-medium") {
            Some("medium")
        } else if normalized.ends_with("-high") || normalized.ends_with("-xhigh") {
            Some("high")
        } else {
            None
        }
    }

    fn extract_error_message(value: &Value) -> Option<String> {
        let candidate = value
            .pointer("/error/message")
            .and_then(Value::as_str)
            .or_else(|| value.pointer("/message").and_then(Value::as_str))
            .or_else(|| value.pointer("/error").and_then(Value::as_str))
            .or_else(|| value.pointer("/detail").and_then(Value::as_str))
            .or_else(|| value.pointer("/code").and_then(Value::as_str));

        candidate.and_then(|msg| {
            let trimmed = msg.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.chars().take(500).collect::<String>())
            }
        })
    }

    async fn extract_error_detail(res: reqwest::Response) -> Option<String> {
        let raw = res.text().await.ok()?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return None;
        }

        if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
            if let Some(msg) = Self::extract_error_message(&value) {
                return Some(msg);
            }
        }

        Some(trimmed.chars().take(500).collect::<String>())
    }

    fn is_anthropic_model(model: &str) -> bool {
        let m = model.to_lowercase();
        m.starts_with("claude")
            || m.starts_with("anthropic/")
            || m.contains("claude-")
            || m.contains("sonnet")
            || m.contains("opus")
            || m.contains("haiku")
    }

    /// Returns true for Perplexity / Sonar models, which do not support
    /// function calling.  Sending `tools` or `tool_choice` to Perplexity
    /// results in an HTTP 400 error.
    fn is_perplexity_model(model: &str) -> bool {
        let m = model.to_lowercase();
        m.contains("perplexity") || m.contains("sonar")
    }

    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        Self::with_config(HttpClientConfig::default())
    }

    /// Create a new provider with explicit proxy / CA certificate configuration.
    ///
    /// Builds two HTTP clients from the same config: one with the configured
    /// overall timeout (used for non-streaming requests) and one with no overall
    /// timeout (used for SSE streaming so that long-running agentic sessions are
    /// not killed mid-stream). Both clients share the same proxy/CA/connect-timeout
    /// settings.
    pub fn with_config(
        config: HttpClientConfig,
    ) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = create_http_client(&config)
            .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?;

        // Streaming client: same proxy/CA settings but no overall timeout
        // (connect timeout still applies so unreachable hosts fail fast)
        let streaming_config = HttpClientConfig {
            proxy_url: config.proxy_url.clone(),
            ca_cert_path: config.ca_cert_path.clone(),
            connect_timeout_secs: config.connect_timeout_secs,
            read_timeout_secs: None,
        };
        let streaming_client = create_http_client(&streaming_config)
            .map_err(Box::<dyn std::error::Error + Send + Sync>::from)?;

        Ok(Self {
            client,
            streaming_client,
        })
    }

    /// Transform tools from desktop's flat format to OpenAI's nested format
    /// Desktop format: { name, description, parameters }
    /// OpenAI format: { type: "function", function: { name, description, parameters } }
    fn transform_tools_to_openai_format(tools: &[crate::core::llm::ToolDefinition]) -> Vec<Value> {
        tools
            .iter()
            .map(|tool| {
                let normalized_parameters = Self::normalize_array_items_in_schema(&tool.parameters);
                serde_json::json!({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": normalized_parameters
                    }
                })
            })
            .collect()
    }

    /// OpenAI-compatible function schemas require `items` in any array schema.
    /// Some local tool definitions only specify `type: "array"`, which managed
    /// cloud providers reject as `invalid_function_parameters`.
    fn normalize_array_items_in_schema(schema: &Value) -> Value {
        let mut normalized = schema.clone();
        Self::normalize_array_items_in_schema_mut(&mut normalized);
        normalized
    }

    fn normalize_array_items_in_schema_mut(schema: &mut Value) {
        match schema {
            Value::Object(map) => {
                let is_array = map.get("type").and_then(Value::as_str) == Some("array");
                if is_array && !map.contains_key("items") {
                    map.insert("items".to_string(), serde_json::json!({}));
                }

                for value in map.values_mut() {
                    Self::normalize_array_items_in_schema_mut(value);
                }
            }
            Value::Array(items) => {
                for item in items {
                    Self::normalize_array_items_in_schema_mut(item);
                }
            }
            _ => {}
        }
    }

    /// Transform LLMRequest to OpenAI-compatible format for the web API.
    /// For Claude models, we preserve Anthropic-native features (server tools,
    /// prompt caching, thinking) so the managed cloud can proxy them correctly.
    fn transform_request(&self, request: &LLMRequest) -> Value {
        let canonical_model = Self::canonicalize_cloud_model(&request.model);
        let is_claude_model = Self::is_anthropic_model(&canonical_model);

        let mut transformed =
            serde_json::to_value(request).unwrap_or_else(|_| serde_json::json!({}));
        transformed["model"] = serde_json::json!(canonical_model);

        // Transform messages: OpenAI format for GPT models, Anthropic format for Claude
        transformed["messages"] =
            serde_json::json!(self.transform_messages(&request.messages, is_claude_model));

        // Transform tools if present
        if let Some(tools) = &request.tools {
            if is_claude_model {
                // For Claude models routed through managed cloud, use Anthropic's
                // native tool format (flat + server tools) rather than OpenAI wrapper.
                // The managed cloud backend will detect the Claude model and forward
                // appropriately.
                use crate::core::llm::server_tools;
                let anthropic_tools: Vec<Value> = tools
                    .iter()
                    .filter_map(|tool| {
                        let tool_name = tool.name.as_str();
                        if server_tools::is_anthropic_server_tool(tool_name) {
                            server_tools::build_server_tool_definition(tool_name)
                        } else {
                            let normalized_input_schema =
                                Self::normalize_array_items_in_schema(&tool.parameters);
                            Some(serde_json::json!({
                                "name": tool.name,
                                "description": tool.description,
                                "input_schema": normalized_input_schema
                            }))
                        }
                    })
                    .collect();
                transformed["tools"] = serde_json::json!(anthropic_tools);
            } else {
                transformed["tools"] =
                    serde_json::json!(Self::transform_tools_to_openai_format(tools));
            }
        }

        // Perplexity / Sonar models do not support function calling.
        // Strip tools and tool_choice to avoid HTTP 400 errors from the API.
        if Self::is_perplexity_model(&canonical_model) {
            if let Some(obj) = transformed.as_object_mut() {
                obj.remove("tools");
                obj.remove("tool_choice");
            }
        }

        // For Claude models, preserve cache_control, thinking, and effort parameters.
        // These are stripped by default serialization since they're Anthropic-specific.
        if is_claude_model {
            if let Some(ref cache_control) = request.cache_control {
                transformed["cache_control"] =
                    serde_json::to_value(cache_control).unwrap_or(serde_json::Value::Null);
            }
            if let Some(ref thinking) = request.thinking {
                transformed["thinking"] =
                    serde_json::to_value(thinking).unwrap_or(serde_json::Value::Null);
            }
            if let Some(ref effort) = request.effort {
                transformed["effort"] = serde_json::json!(effort);
            }
        }

        // Map desktop Codex quality variants to OpenAI reasoning effort.
        // This keeps "gpt-5.4-codex-low|medium|high|xhigh" behavior after
        // alias normalization to the canonical API model.
        if let Some(effort) = Self::codex_effort_override(&request.model) {
            if transformed
                .get("effort")
                .and_then(Value::as_str)
                .is_none_or(|current| current.trim().is_empty())
            {
                transformed["effort"] = serde_json::json!(effort);
            }
        }

        transformed
    }

    fn transform_messages(&self, messages: &[ChatMessage], is_claude_model: bool) -> Vec<Value> {
        if is_claude_model {
            return self.transform_messages_anthropic(messages);
        }

        // OpenAI-compatible format (unchanged)
        messages
            .iter()
            .map(|message| {
                let mut msg = serde_json::json!({
                    "role": message.role,
                    "content": message.content,
                });

                if let Some(tool_calls) = &message.tool_calls {
                    msg["tool_calls"] = serde_json::json!(tool_calls);
                }
                if let Some(tool_call_id) = &message.tool_call_id {
                    msg["tool_call_id"] = serde_json::json!(tool_call_id);
                }

                if let Some(parts) = &message.multimodal_content {
                    let mut content_parts: Vec<Value> = Vec::new();

                    if !message.content.is_empty() {
                        content_parts.push(serde_json::json!({
                            "type": "text",
                            "text": message.content,
                        }));
                    }

                    for part in parts {
                        match part {
                            ContentPart::Text { text } => content_parts.push(serde_json::json!({
                                "type": "text",
                                "text": text,
                            })),
                            ContentPart::Image { image } => {
                                let mime = Self::image_format_to_mime(image.format);
                                let encoded =
                                    base64::engine::general_purpose::STANDARD.encode(&image.data);
                                content_parts.push(serde_json::json!({
                                    "type": "image_url",
                                    "image_url": {
                                        "url": format!("data:{};base64,{}", mime, encoded),
                                        "detail": Self::image_detail_to_str(image.detail),
                                    }
                                }));
                            }
                            _ => {}
                        }
                    }

                    msg["content"] = serde_json::json!(content_parts);
                }

                msg
            })
            .collect()
    }

    /// Transform messages to Anthropic format for Claude models.
    /// Converts OpenAI-style tool messages to Anthropic's content block format:
    /// - Assistant `tool_calls` → `tool_use` content blocks
    /// - `role: "tool"` messages → `tool_result` content blocks in a `role: "user"` message
    /// - Consecutive tool results are merged into a single user message
    ///   (Anthropic disallows consecutive messages with the same role)
    fn transform_messages_anthropic(&self, messages: &[ChatMessage]) -> Vec<Value> {
        let mut result: Vec<Value> = Vec::new();
        let mut i = 0;

        while i < messages.len() {
            let message = &messages[i];

            // Merge consecutive tool result messages into one "user" message.
            // Anthropic requires tool_result blocks inside a role:"user" message.
            if message.role == "tool" {
                let mut tool_results: Vec<Value> = Vec::new();
                while i < messages.len() && messages[i].role == "tool" {
                    let tool_msg = &messages[i];
                    if let Some(ref tool_call_id) = tool_msg.tool_call_id {
                        tool_results.push(serde_json::json!({
                            "type": "tool_result",
                            "tool_use_id": tool_call_id,
                            "content": tool_msg.content,
                        }));
                    }
                    i += 1;
                }
                if !tool_results.is_empty() {
                    result.push(serde_json::json!({
                        "role": "user",
                        "content": tool_results,
                    }));
                }
                continue;
            }

            // Assistant messages with tool_calls → Anthropic tool_use content blocks
            if message.role == "assistant" {
                if let Some(ref tool_calls) = message.tool_calls {
                    let mut content_parts: Vec<Value> = Vec::new();
                    if !message.content.is_empty() {
                        content_parts.push(serde_json::json!({
                            "type": "text",
                            "text": message.content,
                        }));
                    }
                    for tc in tool_calls {
                        let input: Value = serde_json::from_str(&tc.arguments)
                            .unwrap_or_else(|_| serde_json::json!({}));
                        content_parts.push(serde_json::json!({
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.name,
                            "input": input,
                        }));
                    }
                    result.push(serde_json::json!({
                        "role": "assistant",
                        "content": content_parts,
                    }));
                    i += 1;
                    continue;
                }
            }

            // All other messages (user, system, regular assistant without tool_calls):
            // standard format with multimodal support
            let mut msg = serde_json::json!({
                "role": message.role,
                "content": message.content,
            });

            if let Some(parts) = &message.multimodal_content {
                let mut content_parts: Vec<Value> = Vec::new();
                if !message.content.is_empty() {
                    content_parts.push(serde_json::json!({
                        "type": "text",
                        "text": message.content,
                    }));
                }
                for part in parts {
                    match part {
                        ContentPart::Text { text } => content_parts.push(serde_json::json!({
                            "type": "text",
                            "text": text,
                        })),
                        ContentPart::Image { image } => {
                            let mime = Self::image_format_to_mime(image.format);
                            let encoded =
                                base64::engine::general_purpose::STANDARD.encode(&image.data);
                            content_parts.push(serde_json::json!({
                                "type": "image_url",
                                "image_url": {
                                    "url": format!("data:{};base64,{}", mime, encoded),
                                    "detail": Self::image_detail_to_str(image.detail),
                                }
                            }));
                        }
                        _ => {}
                    }
                }
                msg["content"] = serde_json::json!(content_parts);
            }

            result.push(msg);
            i += 1;
        }

        result
    }

    fn image_format_to_mime(format: ImageFormat) -> &'static str {
        match format {
            ImageFormat::Png => "image/png",
            ImageFormat::Jpeg => "image/jpeg",
            ImageFormat::Webp => "image/webp",
        }
    }

    fn image_detail_to_str(detail: ImageDetail) -> &'static str {
        match detail {
            ImageDetail::Low => "low",
            ImageDetail::High => "high",
            ImageDetail::Auto => "auto",
        }
    }
}

#[async_trait]
impl LLMProvider for ManagedCloudProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        // Get access token from keyring
        let token = get_access_token()
            .map_err(|e| format!("Failed to get access token: {}. Please sign in again.", e))?;

        let url = managed_cloud_llm_url();

        // Transform request to OpenAI-compatible format
        let transformed_request = self.transform_request(request);

        let res = self
            .client
            .post(url)
            .bearer_auth(&token)
            .json(&transformed_request)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let status = res.status().as_u16();
        match status {
            200 => {
                let body: Value = res
                    .json()
                    .await
                    .map_err(|e| format!("Parse error: {}", e))?;

                let content = if let Some(s) = body["choices"][0]["message"]["content"].as_str() {
                    s.to_string()
                } else if let Some(parts) = body["choices"][0]["message"]["content"].as_array() {
                    parts
                        .iter()
                        .filter_map(|p| match p["type"].as_str() {
                            Some("text") => p["text"].as_str(),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    String::new()
                };

                let prompt_tokens = body["usage"]["prompt_tokens"].as_u64().map(|v| v as u32);
                let completion_tokens = body["usage"]["completion_tokens"]
                    .as_u64()
                    .map(|v| v as u32);
                let total_tokens = body["usage"]["total_tokens"].as_u64().map(|v| v as u32);

                // Extract credit information if available
                let credits = body.get("credits").and_then(|c| {
                    let obj = c.as_object()?;
                    Some(crate::core::llm::CreditsInfo {
                        cost_cents: obj.get("cost_cents")?.as_f64()?,
                        remaining_cents: obj.get("remaining_cents")?.as_f64()?,
                        daily_limit: obj.get("daily_limit").and_then(|v| v.as_f64()),
                        daily_used: obj.get("daily_used").and_then(|v| v.as_f64()),
                        daily_remaining: obj.get("daily_remaining").and_then(|v| v.as_f64()),
                        daily_reset_at: obj
                            .get("daily_reset_at")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                    })
                });

                let cost = credits.as_ref().map(|c| c.cost_cents / 100.0);

                // Extract tool_calls from non-streaming response (OpenAI format)
                let tool_calls = body["choices"][0]["message"]["tool_calls"]
                    .as_array()
                    .map(|calls| {
                        calls
                            .iter()
                            .filter_map(|call| {
                                let id = call["id"].as_str()?.to_string();
                                let name = call["function"]["name"].as_str()?.to_string();
                                let arguments = call["function"]["arguments"]
                                    .as_str()
                                    .unwrap_or("{}")
                                    .to_string();
                                Some(crate::core::llm::ToolCall {
                                    id,
                                    name,
                                    arguments,
                                })
                            })
                            .collect::<Vec<_>>()
                    })
                    .filter(|calls| !calls.is_empty());

                // Also handle Anthropic-style tool blocks (for Claude models)
                let tool_calls = tool_calls.or_else(|| {
                    body["choices"][0]["message"]["content"]
                        .as_array()
                        .map(|parts| {
                            parts
                                .iter()
                                .filter_map(|part| {
                                    let part_type = part["type"].as_str()?;
                                    if part_type == "tool_use" || part_type == "server_tool_use" {
                                        let id = part["id"].as_str()?.to_string();
                                        let raw_name = part["name"].as_str()?.to_string();
                                        let name = if part_type == "server_tool_use" {
                                            format!("__server__{}", raw_name)
                                        } else {
                                            raw_name
                                        };
                                        let arguments = serde_json::to_string(&part["input"])
                                            .unwrap_or_else(|_| "{}".to_string());
                                        Some(crate::core::llm::ToolCall {
                                            id,
                                            name,
                                            arguments,
                                        })
                                    } else {
                                        None
                                    }
                                })
                                .collect::<Vec<_>>()
                        })
                        .filter(|calls| !calls.is_empty())
                });

                Ok(LLMResponse {
                    content,
                    tokens: total_tokens,
                    prompt_tokens,
                    completion_tokens,
                    cost,
                    credits,
                    model: body["model"].as_str().unwrap_or(&request.model).to_string(),
                    tool_calls,
                    ..LLMResponse::default()
                })
            }
            402 => {
                // Try to parse error response for detailed information
                let error_body: Value = res.json().await.unwrap_or(Value::Null);
                let error_code = error_body
                    .get("code")
                    .and_then(|c| c.as_str())
                    .unwrap_or("CREDIT_LIMIT_REACHED");

                let error_message = if error_code == "DAILY_CREDIT_LIMIT_REACHED" {
                    let reset_hours = error_body
                        .get("reset_in_hours")
                        .and_then(|h| h.as_f64())
                        .map(|h| h.ceil() as u64)
                        .unwrap_or(24);
                    format!(
                        "Daily credit limit reached. You can use more credits in {} hours.",
                        reset_hours
                    )
                } else {
                    "Monthly credit limit reached. Please upgrade your plan (Pro/Max) to continue using Cloud models.".to_string()
                };

                Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    error_message,
                )))
            }
            401 => Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                auth_failed_message(),
            ))),
            403 => {
                let mut detail_suffix = String::new();
                if let Some(detail) = Self::extract_error_detail(res).await {
                    detail_suffix = format!(": {}", detail);
                }
                Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    format!(
                        "API key rejected (403 Forbidden). Check your API key in Settings \u{2192} Models for the selected provider{}",
                        detail_suffix
                    ),
                )))
            }
            405 => Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                method_not_allowed_message(),
            ))),
            _ => {
                let mut message = format!(
                    "Cloud provider error: {} (model: {})",
                    status,
                    Self::canonicalize_cloud_model(&request.model)
                );
                if let Some(detail) = Self::extract_error_detail(res).await {
                    message.push_str(": ");
                    message.push_str(&detail);
                }
                Err(Box::new(std::io::Error::other(message)))
            }
        }
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        // Get access token from keyring
        let token = get_access_token()
            .map_err(|e| format!("Failed to get access token: {}. Please sign in again.", e))?;

        let url = managed_cloud_llm_url();

        let mut streaming_request = request.clone();
        streaming_request.stream = true;

        // Transform request to OpenAI-compatible format
        let transformed_request = self.transform_request(&streaming_request);

        let res = self
            .streaming_client
            .post(url)
            .bearer_auth(&token)
            .json(&transformed_request)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            if status == 402 {
                let error_body: Value = res.json().await.unwrap_or(Value::Null);
                let error_code = error_body
                    .get("code")
                    .and_then(|c| c.as_str())
                    .unwrap_or("CREDIT_LIMIT_REACHED");

                let error_message = if error_code == "DAILY_CREDIT_LIMIT_REACHED" {
                    let reset_hours = error_body
                        .get("reset_in_hours")
                        .and_then(|h| h.as_f64())
                        .map(|h| h.ceil() as u64)
                        .unwrap_or(24);
                    format!(
                        "Daily credit limit reached. You can use more credits in {} hours.",
                        reset_hours
                    )
                } else {
                    "Monthly credit limit reached. Please upgrade your plan (Pro/Max) to continue using Cloud models.".to_string()
                };

                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    error_message,
                )));
            } else if status == 401 {
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    auth_failed_message(),
                )));
            } else if status == 403 {
                let mut detail_suffix = String::new();
                if let Some(detail) = Self::extract_error_detail(res).await {
                    detail_suffix = format!(": {}", detail);
                }
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::PermissionDenied,
                    format!(
                        "API key rejected (403 Forbidden). Check your API key in Settings \u{2192} Models for the selected provider{}",
                        detail_suffix
                    ),
                )));
            } else if status == 405 {
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::ConnectionRefused,
                    method_not_allowed_message(),
                )));
            } else {
                let mut message = format!(
                    "Cloud provider error: {} (model: {})",
                    status,
                    Self::canonicalize_cloud_model(&request.model)
                );
                if let Some(detail) = Self::extract_error_detail(res).await {
                    message.push_str(": ");
                    message.push_str(&detail);
                }
                return Err(Box::new(std::io::Error::other(message)));
            }
        }

        use crate::core::llm::sse_parser::parse_sse_stream;
        Ok(Box::pin(parse_sse_stream(
            res,
            crate::core::llm::Provider::ManagedCloud,
        )))
    }

    fn is_configured(&self) -> bool {
        // Check if we have an access token
        get_access_token().is_ok()
    }

    fn name(&self) -> &str {
        "ManagedCloud"
    }

    fn supports_vision(&self) -> bool {
        // Managed cloud supports vision through the API
        true
    }

    fn supports_function_calling(&self) -> bool {
        // Managed cloud supports function calling through the API
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{ToolChoice, ToolDefinition};

    #[test]
    fn transform_request_adds_items_for_array_tool_params() {
        let provider = ManagedCloudProvider::new().expect("ManagedCloudProvider::new");
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Run db update".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "gpt-5.4-nano".to_string(),
            temperature: None,
            max_tokens: None,
            stream: false,
            tools: Some(vec![ToolDefinition {
                name: "db_execute".to_string(),
                description: "Execute SQL".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "sql": { "type": "string" },
                        "params": { "type": "array" }
                    }
                }),
                strict: None,
            }]),
            tool_choice: Some(ToolChoice::Auto),
            thinking_mode: None,
            top_p: None,
            top_k: None,
            system: None,
            thinking: None,
            response_format: None,
            output_config: None,
            cache_control: None,
            effort: None,
            thinking_level: None,
            metadata: None,
            audio_output: None,
            background: None,
            previous_response_id: None,
            conversation_id: None,
        };

        let transformed = provider.transform_request(&request);
        assert_eq!(
            transformed["tools"][0]["function"]["parameters"]["properties"]["params"]["items"],
            serde_json::json!({}),
            "managed cloud tool schema should include items for array params"
        );
    }
}
