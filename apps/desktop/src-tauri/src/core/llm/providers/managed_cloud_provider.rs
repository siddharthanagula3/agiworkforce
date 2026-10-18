use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::{
    ChatMessage, ContentPart, ImageDetail, ImageFormat, LLMProvider, LLMRequest, LLMResponse,
    ThinkingParameter,
};
use crate::sys::account::{get_access_token_for_active_managed_boundary, get_api_base_url};
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
        "Authentication failed (401). In local dev, ensure AGI_API_URL points to the expected AGI backend environment, then sign in again."
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

/// The gateway rejects a thinking budget above this (`thinking.budget_tokens`
/// in apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts).
const MANAGED_THINKING_BUDGET_CEILING: u32 = 32_000;

impl ManagedCloudProvider {
    fn canonicalize_cloud_model(model: &str) -> String {
        let trimmed = model.trim().to_lowercase();

        // Delegate to the centralized models.json canonicalization maps first.
        let canonical = super::super::models_config::get_canonicalized_id(&trimmed);
        if canonical != trimmed {
            return canonical;
        }

        trimmed
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

    /// Returns true for Perplexity search models, which do not support
    /// function calling.  Sending `tools` or `tool_choice` to Perplexity
    /// results in an HTTP 400 error.
    fn is_perplexity_model(model: &str) -> bool {
        crate::core::llm::models_config::get_provider_for_model(model)
            == Some(crate::core::llm::Provider::Perplexity)
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
            read_timeout_secs: None,
            ..config.clone()
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
    fn transform_tools_to_openai_format<'a>(
        tools: impl IntoIterator<Item = &'a crate::core::llm::ToolDefinition>,
    ) -> Vec<Value> {
        tools
            .into_iter()
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

    /// The gateway (`/api/llm/v1/chat/completions`) validates every body as an
    /// OpenAI chat-completions request and translates it to the serving
    /// provider itself, so every model is sent in that one shape. A tool entry
    /// without `type: "function"`, a flat tool call, or a thinking value that is
    /// not `{type, budget_tokens}` fails that validation with a 400.
    fn transform_request(&self, request: &LLMRequest) -> Value {
        use crate::core::llm::server_tools;

        let canonical_model = Self::canonicalize_cloud_model(&request.model);

        let mut transformed =
            serde_json::to_value(request).unwrap_or_else(|_| serde_json::json!({}));
        transformed["model"] = serde_json::json!(canonical_model);
        transformed["messages"] = serde_json::json!(self.transform_messages(&request.messages));
        if let Some(obj) = transformed.as_object_mut() {
            obj.remove("tools");
            obj.remove("thinking");
        }

        if let Some(tools) = &request.tools {
            let (provider_tools, function_tools): (Vec<_>, Vec<_>) = tools
                .iter()
                .partition(|tool| server_tools::is_anthropic_server_tool(&tool.name));
            if function_tools.is_empty() {
                if let Some(obj) = transformed.as_object_mut() {
                    obj.remove("tool_choice");
                }
            } else {
                transformed["tools"] =
                    serde_json::json!(Self::transform_tools_to_openai_format(function_tools));
            }
            if provider_tools.iter().any(|tool| tool.name == "web_search") {
                transformed["web_search"] = serde_json::json!(true);
            }
        }

        // Perplexity search models do not support function calling.
        // Strip tools and tool_choice to avoid HTTP 400 errors from the API.
        if Self::is_perplexity_model(&canonical_model) {
            if let Some(obj) = transformed.as_object_mut() {
                obj.remove("tools");
                obj.remove("tool_choice");
            }
        }

        match &request.thinking {
            Some(ThinkingParameter::Enabled(enabled)) => {
                transformed["thinking_mode"] = serde_json::json!(enabled);
                if !enabled {
                    transformed["thinking"] = serde_json::json!({ "type": "disabled" });
                }
            }
            Some(ThinkingParameter::Level { .. }) => {
                transformed["thinking_mode"] = serde_json::json!(true);
            }
            Some(ThinkingParameter::Budget {
                thinking_type,
                budget_tokens,
            }) => {
                transformed["thinking"] = serde_json::json!({
                    "type": thinking_type,
                    "budget_tokens": (*budget_tokens).min(MANAGED_THINKING_BUDGET_CEILING),
                });
            }
            Some(ThinkingParameter::Adaptive { thinking_type }) => {
                transformed["thinking"] = serde_json::json!({ "type": thinking_type });
            }
            None => {}
        }

        // Map local quality suffixes to OpenAI reasoning effort when callers
        // still pass a suffix-bearing model string.
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

    fn transform_messages(&self, messages: &[ChatMessage]) -> Vec<Value> {
        messages
            .iter()
            .map(|message| {
                let mut msg = serde_json::json!({
                    "role": message.role,
                    "content": message.content,
                });

                if let Some(tool_calls) = &message.tool_calls {
                    msg["tool_calls"] = tool_calls
                        .iter()
                        .map(|call| {
                            serde_json::json!({
                                "id": call.id,
                                "type": "function",
                                "function": {
                                    "name": call.name,
                                    "arguments": call.arguments,
                                },
                            })
                        })
                        .collect();
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
        // Atomically select the current bearer inside any native goal's
        // captured account/session boundary before constructing the request.
        let token = get_access_token_for_active_managed_boundary()
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
        // Atomically select the current bearer inside any native goal's
        // captured account/session boundary before constructing the request.
        let token = get_access_token_for_active_managed_boundary()
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

        // c4 DECISION (2026-07-16): ManagedCloud deliberately STAYS on the
        // desktop `parse_sse_stream` decoder instead of the shared
        // `agiworkforce-llm` engine (which every direct provider now uses).
        // The managed gateway's envelope is OpenAI-shaped PLUS a per-chunk
        // `credits` billing object the crate cannot represent, migrating
        // would silently drop live billing telemetry. Pinned by
        // `c4_pin_managed_cloud_credits_extraction_from_openai_shaped_sse`
        // in tests/sse_parser_tests.rs; unblock by adding a vendor-meta
        // event to the crate first.
        use crate::core::llm::sse_parser::parse_sse_stream;
        Ok(Box::pin(parse_sse_stream(
            res,
            crate::core::llm::Provider::ManagedCloud,
        )))
    }

    fn is_configured(&self) -> bool {
        // Check if we have an access token
        get_access_token_for_active_managed_boundary().is_ok()
    }

    fn name(&self) -> &str {
        "ManagedCloud"
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
    use crate::sys::account::app_mode::AppModeTestGuard;
    use crate::sys::account::{
        capture_managed_auth_boundary, get_access_token,
        replace_access_token_for_managed_boundary_test, scope_managed_auth_boundary,
    };
    use base64::Engine;

    fn managed_test_token(subject: &str, session_id: &str) -> String {
        let header = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(br#"{"alg":"none"}"#);
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
            serde_json::json!({ "sub": subject, "sid": session_id, "jti": uuid::Uuid::new_v4() })
                .to_string(),
        );
        format!("{header}.{payload}.test-signature")
    }

    #[tokio::test]
    async fn managed_goal_cannot_use_a_replacement_accounts_bearer() {
        let _guard = AppModeTestGuard::cloud().await;
        let account_a_token = managed_test_token("account-a", "session-a");
        let account_b_token = managed_test_token("account-b", "session-b");
        replace_access_token_for_managed_boundary_test(Some(account_a_token));
        let account_a_boundary =
            capture_managed_auth_boundary().expect("account A boundary should be captured");

        // This is the reviewer race: the old native goal remains alive while
        // the ambient credential is replaced by account B.
        replace_access_token_for_managed_boundary_test(Some(account_b_token));
        let provider = ManagedCloudProvider::new().expect("ManagedCloudProvider::new");
        let request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "continue the old account A goal".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "managed-cloud-auto".to_string(),
        );

        let result = scope_managed_auth_boundary(Some(account_a_boundary), async {
            provider.send_message(&request).await
        })
        .await;
        replace_access_token_for_managed_boundary_test(None);

        let error = result.expect_err("the old goal must fail before any account B request");
        assert!(
            error.to_string().contains("account session changed"),
            "unexpected managed ownership error: {error}"
        );
    }

    #[tokio::test]
    async fn managed_goal_accepts_a_rotated_token_from_the_same_account_session() {
        let _guard = AppModeTestGuard::cloud().await;
        let original = managed_test_token("account-a", "session-a");
        let rotated = managed_test_token("account-a", "session-a");
        assert_ne!(original, rotated);
        replace_access_token_for_managed_boundary_test(Some(original));
        let boundary =
            capture_managed_auth_boundary().expect("account A boundary should be captured");
        replace_access_token_for_managed_boundary_test(Some(rotated.clone()));

        let selected =
            scope_managed_auth_boundary(Some(boundary), async { get_access_token() }).await;
        replace_access_token_for_managed_boundary_test(None);

        assert_eq!(
            selected.expect("same-session refresh should remain authorized"),
            rotated
        );
    }

    #[tokio::test]
    async fn managed_goal_rejects_a_new_session_for_the_same_account() {
        let _guard = AppModeTestGuard::cloud().await;
        let old_session = managed_test_token("account-a", "session-a1");
        let new_session = managed_test_token("account-a", "session-a2");
        replace_access_token_for_managed_boundary_test(Some(old_session));
        let boundary =
            capture_managed_auth_boundary().expect("old account A boundary should be captured");
        replace_access_token_for_managed_boundary_test(Some(new_session));

        let result =
            scope_managed_auth_boundary(Some(boundary), async { get_access_token() }).await;
        replace_access_token_for_managed_boundary_test(None);

        assert!(result
            .expect_err("new account session must revoke the old goal")
            .contains("account session changed"));
    }

    #[tokio::test]
    async fn a_local_process_never_sends_a_managed_request() {
        let _guard = AppModeTestGuard::local().await;
        replace_access_token_for_managed_boundary_test(Some(managed_test_token(
            "account-a",
            "session-a",
        )));
        let provider = ManagedCloudProvider::new().expect("ManagedCloudProvider::new");
        let request = LLMRequest::new(
            vec![ChatMessage {
                role: "user".to_string(),
                content: "a Local transcript".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            "managed-cloud-auto".to_string(),
        );

        let configured = provider.is_configured();
        let result = provider.send_message(&request).await;
        replace_access_token_for_managed_boundary_test(None);

        assert!(
            !configured,
            "a signed-in session must not make ManagedCloud routable in Local mode"
        );
        let error = result.expect_err("a Local process must fail before any network request");
        assert!(
            error
                .to_string()
                .contains(crate::sys::account::app_mode::LOCAL_MODE_REFUSAL),
            "unexpected Local-mode refusal: {error}"
        );
    }

    fn tool(name: &str) -> ToolDefinition {
        ToolDefinition {
            name: name.to_string(),
            description: format!("{name} tool"),
            parameters: serde_json::json!({ "type": "object", "properties": {} }),
            strict: None,
        }
    }

    fn message(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.to_string(),
            content: content.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }
    }

    // The gateway's ChatCompletionRequestSchema takes `tools[]` only as
    // `{type: "function", function}` and `tool_calls[]` only as
    // `{id, type: "function", function: {name, arguments}}`; an Anthropic-native
    // body for a Claude model was a 400 on every tool turn.
    #[test]
    fn a_claude_tool_turn_is_sent_in_the_gateway_shape() {
        let provider = ManagedCloudProvider::new().expect("ManagedCloudProvider::new");
        let model = crate::core::llm::models_config::get_default_model(
            &crate::core::llm::Provider::Anthropic,
        );
        let mut assistant = message("assistant", "");
        assistant.tool_calls = Some(vec![crate::core::llm::ToolCall {
            id: "toolu_1".to_string(),
            name: "file_read".to_string(),
            arguments: r#"{"path":"a.txt"}"#.to_string(),
        }]);
        let mut result = message("tool", "contents");
        result.tool_call_id = Some("toolu_1".to_string());
        let mut request = LLMRequest::new(
            vec![message("user", "read a.txt"), assistant, result],
            model.to_string(),
        );
        request.tools = Some(vec![tool("file_read"), tool("web_search")]);
        request.tool_choice = Some(ToolChoice::Auto);

        let body = provider.transform_request(&request);

        assert_eq!(
            body["tools"],
            serde_json::json!([{
                "type": "function",
                "function": {
                    "name": "file_read",
                    "description": "file_read tool",
                    "parameters": { "type": "object", "properties": {} },
                },
            }])
        );
        assert_eq!(body["web_search"], serde_json::json!(true));
        assert_eq!(
            body["messages"][1]["tool_calls"],
            serde_json::json!([{
                "id": "toolu_1",
                "type": "function",
                "function": { "name": "file_read", "arguments": r#"{"path":"a.txt"}"# },
            }])
        );
        assert_eq!(body["messages"][2]["role"], "tool");
        assert_eq!(body["messages"][2]["tool_call_id"], "toolu_1");
    }

    #[test]
    fn a_provider_tool_alone_sends_no_tools_and_no_tool_choice() {
        let provider = ManagedCloudProvider::new().expect("ManagedCloudProvider::new");
        let mut request =
            LLMRequest::new(vec![message("user", "news")], "fixture-managed-model".into());
        request.tools = Some(vec![tool("web_search")]);
        request.tool_choice = Some(ToolChoice::Auto);

        let body = provider.transform_request(&request);

        assert!(body.get("tools").is_none());
        assert!(body.get("tool_choice").is_none());
        assert_eq!(body["web_search"], serde_json::json!(true));
    }

    // The gateway accepts `thinking` only as `{type, budget_tokens <= 32000}`.
    #[test]
    fn thinking_is_sent_in_the_gateway_shape() {
        let provider = ManagedCloudProvider::new().expect("ManagedCloudProvider::new");
        let body_for = |thinking: ThinkingParameter| {
            let mut request =
                LLMRequest::new(vec![message("user", "hi")], "fixture-managed-model".into());
            request.thinking = Some(thinking);
            provider.transform_request(&request)
        };

        let off = body_for(ThinkingParameter::Enabled(false));
        assert_eq!(off["thinking"], serde_json::json!({ "type": "disabled" }));
        assert_eq!(off["thinking_mode"], serde_json::json!(false));

        let on = body_for(ThinkingParameter::Enabled(true));
        assert!(on.get("thinking").is_none());
        assert_eq!(on["thinking_mode"], serde_json::json!(true));

        let budget = body_for(ThinkingParameter::Budget {
            thinking_type: "enabled".to_string(),
            budget_tokens: 128_000,
        });
        assert_eq!(
            budget["thinking"],
            serde_json::json!({
                "type": "enabled",
                "budget_tokens": MANAGED_THINKING_BUDGET_CEILING,
            })
        );

        let adaptive = body_for(ThinkingParameter::Adaptive {
            thinking_type: "adaptive".to_string(),
        });
        assert_eq!(adaptive["thinking"], serde_json::json!({ "type": "adaptive" }));
    }

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
            model: "fixture-managed-model".to_string(),
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
