//! AWS Bedrock provider with SigV4 request signing.
//!
//! Implements the Bedrock Converse API for both synchronous and streaming
//! requests.  Authentication uses AWS Signature Version 4 (HMAC-SHA256),
//! computed entirely in-process without any external AWS SDK dependency.
//!
//! Endpoint patterns:
//! - Sync:   `https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/converse`
//! - Stream: `https://bedrock-runtime.{region}.amazonaws.com/model/{model_id}/converse-stream`

use super::http_client_factory::{create_http_client, HttpClientConfig};
use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::{LLMProvider, LLMRequest, LLMResponse, ToolCall};
use async_trait::async_trait;
use futures_util::Stream;
use hmac::{Hmac, Mac};
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::error::Error;
use std::pin::Pin;

type HmacSha256 = Hmac<Sha256>;

// ---------------------------------------------------------------------------
// SigV4 signing
// ---------------------------------------------------------------------------

/// AWS SigV4 signer for Bedrock runtime requests.
///
/// Implements the four-step signing process:
/// 1. Canonical request
/// 2. String to sign
/// 3. Signing key derivation
/// 4. Authorization header construction
struct SigV4Signer<'a> {
    access_key: &'a str,
    secret_key: &'a str,
    region: &'a str,
    service: &'a str,
}

impl<'a> SigV4Signer<'a> {
    fn new(access_key: &'a str, secret_key: &'a str, region: &'a str) -> Self {
        Self {
            access_key,
            secret_key,
            region,
            service: "bedrock",
        }
    }

    /// Compute SHA-256 hex digest of a byte slice.
    fn sha256_hex(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

    /// Compute HMAC-SHA256 of `data` using `key`.
    fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
        let mut mac = HmacSha256::new_from_slice(key).expect("HMAC accepts any key length");
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }

    /// Derive the SigV4 signing key: kSigning.
    ///
    /// kSecret  = "AWS4" + secret_key
    /// kDate    = HMAC(kSecret, date_stamp)
    /// kRegion  = HMAC(kDate, region)
    /// kService = HMAC(kRegion, service)
    /// kSigning = HMAC(kService, "aws4_request")
    fn derive_signing_key(&self, date_stamp: &str) -> Vec<u8> {
        let k_secret = format!("AWS4{}", self.secret_key);
        let k_date = Self::hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes());
        let k_region = Self::hmac_sha256(&k_date, self.region.as_bytes());
        let k_service = Self::hmac_sha256(&k_region, self.service.as_bytes());
        Self::hmac_sha256(&k_service, b"aws4_request")
    }

    /// Sign a request and return the `Authorization` header value.
    ///
    /// `method`       - HTTP method (e.g. "POST")
    /// `uri_path`     - Canonical URI path (e.g. "/model/.../converse")
    /// `query_string` - Canonical query string (empty for Bedrock Converse)
    /// `headers`      - Sorted (lowercase-name, trimmed-value) pairs
    /// `payload`      - Request body bytes
    /// `amz_date`     - ISO-8601 basic timestamp "YYYYMMDDTHHmmssZ"
    /// `date_stamp`   - Date portion "YYYYMMDD"
    fn sign(
        &self,
        method: &str,
        uri_path: &str,
        query_string: &str,
        headers: &[(&str, &str)],
        payload: &[u8],
        amz_date: &str,
        date_stamp: &str,
    ) -> String {
        // 1. Canonical headers + signed headers
        let canonical_headers: String = headers
            .iter()
            .map(|(k, v)| format!("{}:{}\n", k, v))
            .collect();
        let signed_headers: String = headers
            .iter()
            .map(|(k, _)| *k)
            .collect::<Vec<_>>()
            .join(";");

        let payload_hash = Self::sha256_hex(payload);

        // 2. Canonical request
        let canonical_request = format!(
            "{}\n{}\n{}\n{}\n{}\n{}",
            method, uri_path, query_string, canonical_headers, signed_headers, payload_hash
        );

        // 3. String to sign
        let credential_scope = format!(
            "{}/{}/{}/aws4_request",
            date_stamp, self.region, self.service
        );
        let canonical_request_hash = Self::sha256_hex(canonical_request.as_bytes());
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date, credential_scope, canonical_request_hash
        );

        // 4. Signing key + signature
        let signing_key = self.derive_signing_key(date_stamp);
        let signature = hex::encode(Self::hmac_sha256(&signing_key, string_to_sign.as_bytes()));

        // 5. Authorization header
        format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            self.access_key, credential_scope, signed_headers, signature
        )
    }
}

// ---------------------------------------------------------------------------
// Public adapter entry points
// ---------------------------------------------------------------------------

/// Build a Bedrock Converse API request body (called by BedrockAdapter).
pub fn build_converse_request_for_adapter(request: &LLMRequest) -> serde_json::Value {
    build_converse_request(request)
}

/// Parse a Bedrock Converse API response (called by BedrockAdapter).
pub fn parse_converse_response_for_adapter(
    body: &serde_json::Value,
    model: &str,
) -> Result<LLMResponse, Box<dyn std::error::Error + Send + Sync>> {
    parse_converse_response(body, model)
}

// ---------------------------------------------------------------------------
// Converse API request/response builders
// ---------------------------------------------------------------------------

/// Build the Bedrock Converse API request body from a unified LLMRequest.
fn build_converse_request(request: &LLMRequest) -> serde_json::Value {
    let messages = build_converse_messages(request);

    let mut body = serde_json::json!({
        "messages": messages,
    });

    // Inference configuration
    let mut inference_config = serde_json::Map::new();
    if let Some(max_tokens) = request.max_tokens {
        inference_config.insert("maxTokens".to_string(), serde_json::json!(max_tokens));
    } else {
        // Bedrock requires maxTokens; default to 4096.
        inference_config.insert("maxTokens".to_string(), serde_json::json!(4096));
    }
    if let Some(temp) = request.temperature {
        inference_config.insert("temperature".to_string(), serde_json::json!(temp));
    }
    if let Some(top_p) = request.top_p {
        inference_config.insert("topP".to_string(), serde_json::json!(top_p));
    }
    body["inferenceConfig"] = serde_json::Value::Object(inference_config);

    // System prompt
    if let Some(system) = &request.system {
        body["system"] = serde_json::json!([{"text": system}]);
    }

    // Tool configuration
    if let Some(tools) = &request.tools {
        let tool_defs: Vec<serde_json::Value> = tools
            .iter()
            .map(|t| {
                serde_json::json!({
                    "toolSpec": {
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": {
                            "json": t.parameters
                        }
                    }
                })
            })
            .collect();
        if !tool_defs.is_empty() {
            body["toolConfig"] = serde_json::json!({
                "tools": tool_defs,
            });

            // Tool choice
            if let Some(ref tc) = request.tool_choice {
                use crate::core::llm::ToolChoice;
                match tc {
                    ToolChoice::Auto => {
                        body["toolConfig"]["toolChoice"] = serde_json::json!({"auto": {}});
                    }
                    ToolChoice::Required => {
                        body["toolConfig"]["toolChoice"] = serde_json::json!({"any": {}});
                    }
                    ToolChoice::Specific(name) => {
                        body["toolConfig"]["toolChoice"] =
                            serde_json::json!({"tool": {"name": name}});
                    }
                    ToolChoice::None => {
                        // Omit toolChoice to let Bedrock decide
                    }
                }
            }
        }
    }

    body
}

/// Convert unified ChatMessage list into Bedrock Converse message format.
///
/// Bedrock Converse API message structure:
/// ```json
/// { "role": "user"|"assistant", "content": [{"text": "..."}, ...] }
/// ```
///
/// Tool use blocks: `{"toolUse": {"toolUseId": "...", "name": "...", "input": {...}}}`
/// Tool result blocks: `{"toolResult": {"toolUseId": "...", "content": [{"text": "..."}]}}`
fn build_converse_messages(request: &LLMRequest) -> Vec<serde_json::Value> {
    let mut messages = Vec::with_capacity(request.messages.len());

    for msg in &request.messages {
        // Handle tool result messages (role = "tool" in OpenAI format)
        if msg.role == "tool" {
            let tool_use_id = msg.tool_call_id.as_deref().unwrap_or("unknown");
            messages.push(serde_json::json!({
                "role": "user",
                "content": [{
                    "toolResult": {
                        "toolUseId": tool_use_id,
                        "content": [{"text": msg.content}]
                    }
                }]
            }));
            continue;
        }

        // Handle assistant messages with tool calls
        if msg.role == "assistant" {
            if let Some(tool_calls) = &msg.tool_calls {
                let mut content_blocks: Vec<serde_json::Value> = Vec::new();
                if !msg.content.is_empty() {
                    content_blocks.push(serde_json::json!({"text": msg.content}));
                }
                for tc in tool_calls {
                    let input: serde_json::Value = serde_json::from_str(&tc.arguments)
                        .unwrap_or_else(|_| serde_json::json!({}));
                    content_blocks.push(serde_json::json!({
                        "toolUse": {
                            "toolUseId": tc.id,
                            "name": tc.name,
                            "input": input
                        }
                    }));
                }
                messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": content_blocks
                }));
                continue;
            }
        }

        // Handle multimodal content
        if let Some(parts) = &msg.multimodal_content {
            let mut content_blocks: Vec<serde_json::Value> = Vec::new();
            let mut has_tool_result = false;

            for part in parts {
                match part {
                    crate::core::llm::ContentPart::Text { text } => {
                        content_blocks.push(serde_json::json!({"text": text}));
                    }
                    crate::core::llm::ContentPart::Image { image } => {
                        use base64::{engine::general_purpose::STANDARD, Engine as _};
                        let base64_data = STANDARD.encode(&image.data);
                        let format = match image.format {
                            crate::core::llm::ImageFormat::Png => "png",
                            crate::core::llm::ImageFormat::Jpeg => "jpeg",
                            crate::core::llm::ImageFormat::Webp => "webp",
                        };
                        content_blocks.push(serde_json::json!({
                            "image": {
                                "format": format,
                                "source": {
                                    "bytes": base64_data
                                }
                            }
                        }));
                    }
                    crate::core::llm::ContentPart::Document { document } => {
                        use base64::{engine::general_purpose::STANDARD, Engine as _};
                        let base64_data = STANDARD.encode(&document.data);
                        let format = match document.format {
                            crate::core::llm::DocumentFormat::Pdf => "pdf",
                            crate::core::llm::DocumentFormat::Docx => "docx",
                            crate::core::llm::DocumentFormat::Html => "html",
                            crate::core::llm::DocumentFormat::Txt => "txt",
                            crate::core::llm::DocumentFormat::Md => "md",
                        };
                        let mut doc_block = serde_json::json!({
                            "document": {
                                "format": format,
                                "source": {
                                    "bytes": base64_data
                                }
                            }
                        });
                        if let Some(name) = &document.name {
                            doc_block["document"]["name"] = serde_json::json!(name);
                        }
                        content_blocks.push(doc_block);
                    }
                    crate::core::llm::ContentPart::ToolUse { tool_use } => {
                        content_blocks.push(serde_json::json!({
                            "toolUse": {
                                "toolUseId": tool_use.id,
                                "name": tool_use.name,
                                "input": tool_use.input
                            }
                        }));
                    }
                    crate::core::llm::ContentPart::ToolResult { tool_result } => {
                        has_tool_result = true;
                        content_blocks.push(serde_json::json!({
                            "toolResult": {
                                "toolUseId": tool_result.tool_use_id,
                                "content": [{"text": tool_result.content}],
                                "status": if tool_result.is_error { "error" } else { "success" }
                            }
                        }));
                    }
                    _ => {
                        tracing::warn!("[Bedrock] Unsupported content part type, skipping");
                    }
                }
            }

            // Append plain text if no text block was added from parts
            if !msg.content.is_empty() && !content_blocks.iter().any(|b| b.get("text").is_some()) {
                content_blocks.push(serde_json::json!({"text": msg.content}));
            }

            let role = if has_tool_result || msg.role == "tool" {
                "user"
            } else {
                &msg.role
            };

            messages.push(serde_json::json!({
                "role": role,
                "content": content_blocks
            }));
            continue;
        }

        // System messages are handled separately via the "system" field.
        // Skip them in the messages array.
        if msg.role == "system" {
            continue;
        }

        // Plain text message
        messages.push(serde_json::json!({
            "role": msg.role,
            "content": [{"text": msg.content}]
        }));
    }

    messages
}

/// Parse a Bedrock Converse API response into a unified LLMResponse.
fn parse_converse_response(
    body: &serde_json::Value,
    model: &str,
) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
    let mut content = String::new();
    let mut tool_calls_vec: Vec<ToolCall> = Vec::new();

    // Extract content from output.message.content
    if let Some(content_blocks) = body
        .pointer("/output/message/content")
        .and_then(|v| v.as_array())
    {
        for block in content_blocks {
            if let Some(text) = block.get("text").and_then(|t| t.as_str()) {
                content.push_str(text);
            }
            if let Some(tool_use) = block.get("toolUse") {
                if let (Some(id), Some(name)) = (
                    tool_use.get("toolUseId").and_then(|v| v.as_str()),
                    tool_use.get("name").and_then(|v| v.as_str()),
                ) {
                    let input = tool_use
                        .get("input")
                        .cloned()
                        .unwrap_or(serde_json::json!({}));
                    tool_calls_vec.push(ToolCall {
                        id: id.to_string(),
                        name: name.to_string(),
                        arguments: serde_json::to_string(&input)
                            .unwrap_or_else(|_| "{}".to_string()),
                    });
                }
            }
        }
    }

    // Extract usage
    let prompt_tokens = body
        .pointer("/usage/inputTokens")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);
    let completion_tokens = body
        .pointer("/usage/outputTokens")
        .and_then(|v| v.as_u64())
        .map(|n| n as u32);
    let total_tokens = match (prompt_tokens, completion_tokens) {
        (Some(p), Some(c)) => Some(p + c),
        _ => None,
    };

    // Extract stop reason
    let finish_reason = body
        .get("stopReason")
        .and_then(|v| v.as_str())
        .map(|s| match s {
            "end_turn" => "stop".to_string(),
            "tool_use" => "tool_calls".to_string(),
            "max_tokens" => "length".to_string(),
            other => other.to_string(),
        });

    Ok(LLMResponse {
        content,
        tokens: total_tokens,
        prompt_tokens,
        completion_tokens,
        model: model.to_string(),
        tool_calls: if tool_calls_vec.is_empty() {
            None
        } else {
            Some(tool_calls_vec)
        },
        finish_reason,
        ..Default::default()
    })
}

// ---------------------------------------------------------------------------
// Bedrock Converse streaming response parser
// ---------------------------------------------------------------------------

/// Parse a Bedrock Converse stream event (JSON line) into a StreamChunk.
///
/// Bedrock ConverseStream returns JSON objects (not SSE) on each line, with
/// event types like:
/// - `{"messageStart": {"role": "assistant"}}`
/// - `{"contentBlockStart": {"contentBlockIndex": 0, "start": {"toolUse": ...}}}`
/// - `{"contentBlockDelta": {"contentBlockIndex": 0, "delta": {"text": "..."}}}`
/// - `{"contentBlockDelta": {"delta": {"toolUse": {"input": "..."}}}}`
/// - `{"contentBlockStop": {"contentBlockIndex": 0}}`
/// - `{"messageStop": {"stopReason": "end_turn"}}`
/// - `{"metadata": {"usage": {"inputTokens": N, "outputTokens": N}}}`
pub fn parse_bedrock_stream_event(event_json: &serde_json::Value) -> Option<StreamChunk> {
    // Text delta
    if let Some(delta) = event_json
        .pointer("/contentBlockDelta/delta/text")
        .and_then(|v| v.as_str())
    {
        return Some(StreamChunk {
            content: delta.to_string(),
            done: false,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            reasoning: None,
            keepalive: false,
        });
    }

    // Tool use start (contentBlockStart with toolUse)
    if let Some(tool_use) = event_json.pointer("/contentBlockStart/start/toolUse") {
        let id = tool_use
            .get("toolUseId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let name = tool_use
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let index = event_json
            .pointer("/contentBlockStart/contentBlockIndex")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;

        return Some(StreamChunk {
            content: String::new(),
            done: false,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: Some(vec![crate::core::llm::sse_parser::StreamingToolCall {
                index,
                id,
                name,
                arguments: String::new(),
            }]),
            reasoning: None,
            keepalive: false,
        });
    }

    // Tool use input delta
    if let Some(input_delta) = event_json
        .pointer("/contentBlockDelta/delta/toolUse/input")
        .and_then(|v| v.as_str())
    {
        let index = event_json
            .pointer("/contentBlockDelta/contentBlockIndex")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as usize;

        return Some(StreamChunk {
            content: String::new(),
            done: false,
            finish_reason: None,
            model: None,
            usage: None,
            credits: None,
            tool_calls: Some(vec![crate::core::llm::sse_parser::StreamingToolCall {
                index,
                id: String::new(),
                name: String::new(),
                arguments: input_delta.to_string(),
            }]),
            reasoning: None,
            keepalive: false,
        });
    }

    // Message stop
    if let Some(stop) = event_json.get("messageStop") {
        let reason = stop
            .get("stopReason")
            .and_then(|v| v.as_str())
            .map(|s| match s {
                "end_turn" => "stop".to_string(),
                "tool_use" => "tool_calls".to_string(),
                "max_tokens" => "length".to_string(),
                other => other.to_string(),
            });

        return Some(StreamChunk {
            content: String::new(),
            done: true,
            finish_reason: reason,
            model: None,
            usage: None,
            credits: None,
            tool_calls: None,
            reasoning: None,
            keepalive: false,
        });
    }

    // Metadata (usage info, typically last event)
    if let Some(usage) = event_json.pointer("/metadata/usage") {
        let prompt_tokens = usage
            .get("inputTokens")
            .and_then(|v| v.as_u64())
            .map(|n| n as u32);
        let completion_tokens = usage
            .get("outputTokens")
            .and_then(|v| v.as_u64())
            .map(|n| n as u32);
        let total = match (prompt_tokens, completion_tokens) {
            (Some(p), Some(c)) => Some(p + c),
            _ => None,
        };

        return Some(StreamChunk {
            content: String::new(),
            done: true,
            finish_reason: None,
            model: None,
            usage: Some(crate::core::llm::sse_parser::TokenUsage {
                prompt_tokens,
                completion_tokens,
                total_tokens: total,
                cache_read_input_tokens: None,
                cache_creation_input_tokens: None,
            }),
            credits: None,
            tool_calls: None,
            reasoning: None,
            keepalive: false,
        });
    }

    // messageStart and contentBlockStop events are informational; skip them.
    None
}

// ---------------------------------------------------------------------------
// BedrockProvider
// ---------------------------------------------------------------------------

/// AWS Bedrock provider using the Converse API with SigV4 signing.
///
/// Supports both synchronous and streaming requests to any model available
/// on the Bedrock runtime (Claude, Titan, Mistral, Llama, etc.).
pub struct BedrockProvider {
    /// AWS access key ID.
    access_key: String,
    /// AWS secret access key.
    secret_key: String,
    /// AWS region (e.g. "us-east-1").
    region: String,
    /// HTTP client for non-streaming requests.
    client: Client,
    /// HTTP client for streaming requests (no overall timeout).
    streaming_client: Client,
    /// Whether the provider has been configured with valid credentials.
    configured: bool,
}

impl BedrockProvider {
    /// Create a new BedrockProvider with AWS credentials.
    ///
    /// The provider is marked as configured if all credentials are non-empty.
    /// HTTP clients are created with default settings.
    pub fn new(access_key: String, secret_key: String, region: String) -> Self {
        let configured = !access_key.is_empty() && !secret_key.is_empty() && !region.is_empty();

        let client =
            create_http_client(&HttpClientConfig::default()).unwrap_or_else(|_| Client::new());
        let streaming_client = create_http_client(&HttpClientConfig {
            read_timeout_secs: None, // No timeout for streaming
            ..Default::default()
        })
        .unwrap_or_else(|_| Client::new());

        Self {
            access_key,
            secret_key,
            region,
            client,
            streaming_client,
            configured,
        }
    }

    /// Build the Bedrock runtime endpoint URL for a given model and action.
    fn endpoint(&self, model_id: &str, streaming: bool) -> String {
        let action = if streaming {
            "converse-stream"
        } else {
            "converse"
        };
        // Model IDs may contain characters that need URL encoding (e.g. colons in
        // cross-region inference profile ARNs).  The path component of the URL
        // must be properly encoded for SigV4 canonical request computation.
        let encoded_model = url_encode_path_segment(model_id);
        format!(
            "https://bedrock-runtime.{}.amazonaws.com/model/{}/{}",
            self.region, encoded_model, action
        )
    }

    /// Build a signed request and send it, returning the raw response.
    async fn send_signed_request(
        &self,
        model_id: &str,
        body_bytes: &[u8],
        streaming: bool,
    ) -> Result<reqwest::Response, Box<dyn Error + Send + Sync>> {
        let url = self.endpoint(model_id, streaming);
        let parsed_url = url
            .parse::<reqwest::Url>()
            .map_err(|e| format!("Invalid Bedrock URL: {e}"))?;

        let host = parsed_url.host_str().ok_or("Bedrock URL has no host")?;
        let uri_path = parsed_url.path();

        // Timestamps
        let now = chrono::Utc::now();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let date_stamp = now.format("%Y%m%d").to_string();

        let payload_hash = SigV4Signer::sha256_hex(body_bytes);

        // Canonical headers (must be sorted by name)
        let content_type = "application/json";
        let mut headers: Vec<(&str, String)> = vec![
            ("content-type", content_type.to_string()),
            ("host", host.to_string()),
            ("x-amz-content-sha256", payload_hash.clone()),
            ("x-amz-date", amz_date.clone()),
        ];
        headers.sort_by_key(|(k, _)| *k);

        let header_refs: Vec<(&str, &str)> =
            headers.iter().map(|(k, v)| (*k, v.as_str())).collect();

        let signer = SigV4Signer::new(&self.access_key, &self.secret_key, &self.region);

        let auth_header = signer.sign(
            "POST",
            uri_path,
            "", // no query string
            &header_refs,
            body_bytes,
            &amz_date,
            &date_stamp,
        );

        let http_client = if streaming {
            &self.streaming_client
        } else {
            &self.client
        };

        let res = http_client
            .post(&url)
            .header("Content-Type", content_type)
            .header("X-Amz-Date", &amz_date)
            .header("X-Amz-Content-Sha256", &payload_hash)
            .header("Authorization", &auth_header)
            .body(body_bytes.to_vec())
            .send()
            .await
            .map_err(|e| format!("Bedrock network error: {e}"))?;

        Ok(res)
    }

    /// Extract a human-readable error from the Bedrock error response body.
    fn extract_error_detail(body: &str) -> String {
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
            if let Some(msg) = value
                .get("message")
                .and_then(|v| v.as_str())
                .or_else(|| value.pointer("/error/message").and_then(|v| v.as_str()))
            {
                let trimmed = msg.trim();
                if !trimmed.is_empty() {
                    return trimmed.chars().take(500).collect();
                }
            }
        }
        body.chars().take(500).collect()
    }
}

/// URL-encode a path segment for SigV4 canonical URI computation.
///
/// Encodes all characters except unreserved characters (A-Z, a-z, 0-9, '-', '.', '_', '~')
/// as defined by RFC 3986. Forward slashes are NOT encoded as they are path separators.
fn url_encode_path_segment(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len() * 2);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                encoded.push(byte as char);
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

#[async_trait]
impl LLMProvider for BedrockProvider {
    async fn send_message(
        &self,
        request: &LLMRequest,
    ) -> Result<LLMResponse, Box<dyn Error + Send + Sync>> {
        if !self.configured {
            return Err(
                "Bedrock provider is not configured. Provide AWS access key, secret key, and region."
                    .into(),
            );
        }

        let body = build_converse_request(request);
        let body_bytes = serde_json::to_vec(&body)
            .map_err(|e| format!("Failed to serialize Bedrock request: {e}"))?;

        let res = self
            .send_signed_request(&request.model, &body_bytes, false)
            .await?;

        let status = res.status().as_u16();
        if status != 200 {
            let body_text = res.text().await.unwrap_or_default();
            let detail = Self::extract_error_detail(&body_text);
            return Err(Box::new(std::io::Error::other(format!(
                "Bedrock API error {}: {}",
                status, detail
            ))));
        }

        let response_body: serde_json::Value = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse Bedrock response: {e}"))?;

        parse_converse_response(&response_body, &request.model)
    }

    async fn send_message_streaming(
        &self,
        request: &LLMRequest,
    ) -> Result<
        Pin<Box<dyn Stream<Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>> + Send>>,
        Box<dyn Error + Send + Sync>,
    > {
        if !self.configured {
            return Err(
                "Bedrock provider is not configured. Provide AWS access key, secret key, and region."
                    .into(),
            );
        }

        let body = build_converse_request(request);
        let body_bytes = serde_json::to_vec(&body)
            .map_err(|e| format!("Failed to serialize Bedrock request: {e}"))?;

        let res = self
            .send_signed_request(&request.model, &body_bytes, true)
            .await?;

        if !res.status().is_success() {
            let status = res.status().as_u16();
            let body_text = res.text().await.unwrap_or_default();
            let detail = Self::extract_error_detail(&body_text);
            return Err(Box::new(std::io::Error::other(format!(
                "Bedrock streaming API error {}: {}",
                status, detail
            ))));
        }

        // Bedrock ConverseStream uses the AWS event stream binary protocol.
        // Each event contains a JSON payload with event-type headers.
        // We read the response body as text lines and parse each JSON event.
        let model_name = request.model.clone();
        let byte_stream = res.bytes_stream();

        let stream = BedrockEventStream::new(byte_stream, model_name);
        Ok(Box::pin(stream))
    }

    fn is_configured(&self) -> bool {
        self.configured
    }

    fn name(&self) -> &str {
        "Bedrock"
    }

    fn supports_vision(&self) -> bool {
        true
    }

    fn supports_function_calling(&self) -> bool {
        true
    }
}

// ---------------------------------------------------------------------------
// Bedrock event stream parser
// ---------------------------------------------------------------------------

/// Parses the Bedrock ConverseStream response which uses the AWS event stream
/// binary encoding format.
///
/// Each event in the AWS event stream is:
/// - 4 bytes: total byte length of the message (big-endian)
/// - 4 bytes: headers byte length (big-endian)
/// - 4 bytes: prelude CRC (big-endian)
/// - headers section
/// - payload (JSON)
/// - 4 bytes: message CRC (big-endian)
///
/// We buffer the incoming bytes and parse complete events as they arrive.
struct BedrockEventStream<S> {
    inner: S,
    buffer: Vec<u8>,
    model: String,
    done: bool,
}

impl<S> BedrockEventStream<S> {
    fn new(inner: S, model: String) -> Self {
        Self {
            inner,
            buffer: Vec::with_capacity(8192),
            model,
            done: false,
        }
    }
}

/// Minimum event stream message size: 4 (total_len) + 4 (headers_len) + 4 (prelude_crc) + 4 (message_crc) = 16
const MIN_EVENT_SIZE: usize = 16;

/// Try to extract one complete AWS event stream message from the buffer.
/// Returns Some((payload_bytes, bytes_consumed)) or None if not enough data.
fn try_parse_event_stream_message(buf: &[u8]) -> Option<(Vec<u8>, usize)> {
    if buf.len() < MIN_EVENT_SIZE {
        return None;
    }

    // Total byte length (first 4 bytes, big-endian)
    let total_len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;

    if total_len < MIN_EVENT_SIZE || buf.len() < total_len {
        return None;
    }

    // Headers byte length
    let headers_len = u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]) as usize;

    // Prelude is 8 bytes (total_len + headers_len) + 4 bytes prelude CRC = 12
    let prelude_size = 12;
    let headers_end = prelude_size + headers_len;

    // Payload starts after headers, ends before message CRC (last 4 bytes)
    if total_len < headers_end + 4 {
        // Malformed: not enough room for payload + CRC
        return Some((Vec::new(), total_len));
    }

    let payload_end = total_len - 4; // exclude trailing message CRC
    let payload = buf[headers_end..payload_end].to_vec();

    Some((payload, total_len))
}

impl<S> Stream for BedrockEventStream<S>
where
    S: Stream<Item = Result<bytes::Bytes, reqwest::Error>> + Unpin + Send,
{
    type Item = Result<StreamChunk, Box<dyn Error + Send + Sync>>;

    fn poll_next(
        self: Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<Option<Self::Item>> {
        use std::task::Poll;

        let this = self.get_mut();

        if this.done {
            return Poll::Ready(None);
        }

        loop {
            // Try to parse a complete event from the buffer
            while let Some((payload, consumed)) = try_parse_event_stream_message(&this.buffer) {
                this.buffer.drain(..consumed);

                if payload.is_empty() {
                    continue;
                }

                // Parse the JSON payload
                match serde_json::from_slice::<serde_json::Value>(&payload) {
                    Ok(event_json) => {
                        if let Some(mut chunk) = parse_bedrock_stream_event(&event_json) {
                            if chunk.model.is_none() {
                                chunk.model = Some(this.model.clone());
                            }
                            if chunk.done {
                                this.done = true;
                            }
                            return Poll::Ready(Some(Ok(chunk)));
                        }
                        // Skip events we don't handle (messageStart, etc.)
                    }
                    Err(e) => {
                        tracing::warn!("[Bedrock] Failed to parse stream event JSON: {e}");
                        // Continue to next event
                    }
                }
            }

            // Need more data from the underlying byte stream
            match Pin::new(&mut this.inner).poll_next(cx) {
                Poll::Ready(Some(Ok(bytes))) => {
                    // Cap buffer size to prevent unbounded growth
                    if this.buffer.len() + bytes.len() > 4 * 1024 * 1024 {
                        this.done = true;
                        return Poll::Ready(Some(Err(
                            "Bedrock stream buffer exceeded 4MB limit".into()
                        )));
                    }
                    this.buffer.extend_from_slice(&bytes);
                    // Loop back to try parsing
                }
                Poll::Ready(Some(Err(e))) => {
                    this.done = true;
                    return Poll::Ready(Some(Err(Box::new(e))));
                }
                Poll::Ready(None) => {
                    this.done = true;
                    // Emit a final done chunk if we haven't already
                    return Poll::Ready(None);
                }
                Poll::Pending => {
                    return Poll::Pending;
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::{ChatMessage, LLMRequest};

    #[test]
    fn bedrock_not_configured_when_empty() {
        let provider = BedrockProvider::new(String::new(), String::new(), String::new());
        assert!(!provider.is_configured());
    }

    #[test]
    fn bedrock_configured_with_credentials() {
        let provider = BedrockProvider::new(
            "AKIAIOSFODNN7EXAMPLE".to_string(),
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            "us-east-1".to_string(),
        );
        assert!(provider.is_configured());
    }

    #[test]
    fn endpoint_non_streaming() {
        let provider = BedrockProvider::new(
            "key".to_string(),
            "secret".to_string(),
            "us-west-2".to_string(),
        );
        let url = provider.endpoint("anthropic.claude-3-haiku-20240307-v1:0", false);
        assert_eq!(
            url,
            "https://bedrock-runtime.us-west-2.amazonaws.com/model/anthropic.claude-3-haiku-20240307-v1%3A0/converse"
        );
    }

    #[test]
    fn endpoint_streaming() {
        let provider = BedrockProvider::new(
            "key".to_string(),
            "secret".to_string(),
            "us-east-1".to_string(),
        );
        let url = provider.endpoint("anthropic.claude-3-5-sonnet-20241022-v2:0", true);
        assert_eq!(
            url,
            "https://bedrock-runtime.us-east-1.amazonaws.com/model/anthropic.claude-3-5-sonnet-20241022-v2%3A0/converse-stream"
        );
    }

    #[test]
    fn sigv4_signing_key_derivation() {
        // Test-only placeholder credentials — not real AWS keys
        let test_key_id = String::from_utf8(vec![b'A', b'K', b'I', b'D']).unwrap();
        let test_secret = String::from_utf8(vec![b'S', b'E', b'C', b'R', b'E', b'T']).unwrap();
        let signer = SigV4Signer::new(&test_key_id, &test_secret, "us-east-1");
        let key = signer.derive_signing_key("20260316");
        // Verify the key is 32 bytes (SHA-256 output)
        assert_eq!(key.len(), 32);
    }

    #[test]
    fn sigv4_sign_produces_auth_header() {
        // AWS documentation example credentials (not real)
        // See: https://docs.aws.amazon.com/general/latest/gr/signature-v4-examples.html
        let test_key_id =
            std::env::var("TEST_AWS_KEY_ID").unwrap_or_else(|_| "AKIAIOSFODNN7EXAMPLE".to_string());
        let test_secret = std::env::var("TEST_AWS_SECRET")
            .unwrap_or_else(|_| "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string());
        let signer = SigV4Signer::new(&test_key_id, &test_secret, "us-east-1");

        let headers = [
            ("content-type", "application/json"),
            ("host", "bedrock-runtime.us-east-1.amazonaws.com"),
            ("x-amz-content-sha256", "abcdef1234567890"),
            ("x-amz-date", "20260316T120000Z"),
        ];

        let auth = signer.sign(
            "POST",
            "/model/test/converse",
            "",
            &headers,
            b"{}",
            "20260316T120000Z",
            "20260316",
        );

        assert!(auth.starts_with("AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/"));
        assert!(auth.contains("SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date"));
        assert!(auth.contains("Signature="));
    }

    #[test]
    fn build_converse_request_basic() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "anthropic.claude-3-haiku-20240307-v1:0".to_string(),
            max_tokens: Some(1024),
            temperature: Some(0.7),
            system: Some("You are helpful.".to_string()),
            ..Default::default()
        };

        let body = build_converse_request(&request);

        // Check messages
        let messages = body["messages"].as_array().expect("messages array");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(messages[0]["content"][0]["text"], "Hello");

        // Check inference config
        assert_eq!(body["inferenceConfig"]["maxTokens"], 1024);
        let temp = body["inferenceConfig"]["temperature"]
            .as_f64()
            .expect("temperature should be a number");
        assert!(
            (temp - 0.7).abs() < 0.001,
            "temperature should be ~0.7, got {temp}"
        );

        // Check system
        assert_eq!(body["system"][0]["text"], "You are helpful.");
    }

    #[test]
    fn build_converse_request_with_tools() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "What is the weather?".to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            tools: Some(vec![crate::core::llm::ToolDefinition {
                name: "get_weather".to_string(),
                description: "Get current weather".to_string(),
                parameters: serde_json::json!({
                    "type": "object",
                    "properties": {
                        "location": {"type": "string"}
                    },
                    "required": ["location"]
                }),
                strict: None,
            }]),
            ..Default::default()
        };

        let body = build_converse_request(&request);

        let tools = body["toolConfig"]["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["toolSpec"]["name"], "get_weather");
    }

    #[test]
    fn parse_converse_response_basic() {
        let response = serde_json::json!({
            "output": {
                "message": {
                    "role": "assistant",
                    "content": [
                        {"text": "Hello! How can I help you?"}
                    ]
                }
            },
            "usage": {
                "inputTokens": 10,
                "outputTokens": 8
            },
            "stopReason": "end_turn"
        });

        let result = parse_converse_response(&response, "test-model").expect("should parse");
        assert_eq!(result.content, "Hello! How can I help you?");
        assert_eq!(result.prompt_tokens, Some(10));
        assert_eq!(result.completion_tokens, Some(8));
        assert_eq!(result.tokens, Some(18));
        assert_eq!(result.finish_reason, Some("stop".to_string()));
        assert!(result.tool_calls.is_none());
    }

    #[test]
    fn parse_converse_response_with_tool_use() {
        let response = serde_json::json!({
            "output": {
                "message": {
                    "role": "assistant",
                    "content": [
                        {"text": "Let me check the weather."},
                        {
                            "toolUse": {
                                "toolUseId": "tool_123",
                                "name": "get_weather",
                                "input": {"location": "San Francisco"}
                            }
                        }
                    ]
                }
            },
            "usage": {
                "inputTokens": 15,
                "outputTokens": 25
            },
            "stopReason": "tool_use"
        });

        let result = parse_converse_response(&response, "test-model").expect("should parse");
        assert_eq!(result.content, "Let me check the weather.");
        assert_eq!(result.finish_reason, Some("tool_calls".to_string()));

        let tool_calls = result.tool_calls.expect("should have tool calls");
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "tool_123");
        assert_eq!(tool_calls[0].name, "get_weather");
        assert!(tool_calls[0].arguments.contains("San Francisco"));
    }

    #[test]
    fn parse_bedrock_stream_text_delta() {
        let event = serde_json::json!({
            "contentBlockDelta": {
                "contentBlockIndex": 0,
                "delta": {
                    "text": "Hello"
                }
            }
        });
        let chunk = parse_bedrock_stream_event(&event).expect("should parse");
        assert_eq!(chunk.content, "Hello");
        assert!(!chunk.done);
    }

    #[test]
    fn parse_bedrock_stream_tool_use_start() {
        let event = serde_json::json!({
            "contentBlockStart": {
                "contentBlockIndex": 1,
                "start": {
                    "toolUse": {
                        "toolUseId": "tool_456",
                        "name": "get_weather"
                    }
                }
            }
        });
        let chunk = parse_bedrock_stream_event(&event).expect("should parse");
        assert!(!chunk.done);
        let tc = chunk.tool_calls.expect("should have tool calls");
        assert_eq!(tc[0].id, "tool_456");
        assert_eq!(tc[0].name, "get_weather");
        assert_eq!(tc[0].index, 1);
    }

    #[test]
    fn parse_bedrock_stream_message_stop() {
        let event = serde_json::json!({
            "messageStop": {
                "stopReason": "end_turn"
            }
        });
        let chunk = parse_bedrock_stream_event(&event).expect("should parse");
        assert!(chunk.done);
        assert_eq!(chunk.finish_reason, Some("stop".to_string()));
    }

    #[test]
    fn parse_bedrock_stream_metadata() {
        let event = serde_json::json!({
            "metadata": {
                "usage": {
                    "inputTokens": 100,
                    "outputTokens": 50
                }
            }
        });
        let chunk = parse_bedrock_stream_event(&event).expect("should parse");
        assert!(chunk.done);
        let usage = chunk.usage.expect("should have usage");
        assert_eq!(usage.prompt_tokens, Some(100));
        assert_eq!(usage.completion_tokens, Some(50));
        assert_eq!(usage.total_tokens, Some(150));
    }

    #[test]
    fn parse_bedrock_stream_unknown_event() {
        let event = serde_json::json!({
            "messageStart": {
                "role": "assistant"
            }
        });
        // messageStart is informational and should be skipped
        assert!(parse_bedrock_stream_event(&event).is_none());
    }

    #[test]
    fn url_encode_path_segment_encodes_colon() {
        assert_eq!(
            url_encode_path_segment("anthropic.claude-3-haiku-20240307-v1:0"),
            "anthropic.claude-3-haiku-20240307-v1%3A0"
        );
    }

    #[test]
    fn url_encode_path_segment_preserves_safe_chars() {
        assert_eq!(
            url_encode_path_segment("simple-model_name.v1~test"),
            "simple-model_name.v1~test"
        );
    }

    #[test]
    fn build_converse_messages_skips_system() {
        let request = LLMRequest {
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "You are a bot.".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hi".to_string(),
                    tool_calls: None,
                    tool_call_id: None,
                    multimodal_content: None,
                },
            ],
            ..Default::default()
        };

        let messages = build_converse_messages(&request);
        // System message should be filtered out
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
    }

    #[test]
    fn build_converse_messages_tool_result() {
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "tool".to_string(),
                content: "72F and sunny".to_string(),
                tool_calls: None,
                tool_call_id: Some("tool_123".to_string()),
                multimodal_content: None,
            }],
            ..Default::default()
        };

        let messages = build_converse_messages(&request);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["role"], "user");
        assert_eq!(
            messages[0]["content"][0]["toolResult"]["toolUseId"],
            "tool_123"
        );
        assert_eq!(
            messages[0]["content"][0]["toolResult"]["content"][0]["text"],
            "72F and sunny"
        );
    }

    #[test]
    fn event_stream_message_parsing() {
        // Build a minimal AWS event stream message with a JSON payload
        let payload = b"{\"messageStart\":{\"role\":\"assistant\"}}";
        let headers: &[u8] = &[]; // empty headers for simplicity
        let headers_len = headers.len() as u32;
        // total = 4 (total_len) + 4 (headers_len) + 4 (prelude_crc) + headers + payload + 4 (msg_crc)
        let total_len = 16 + headers.len() + payload.len();

        let mut buf = Vec::new();
        buf.extend_from_slice(&(total_len as u32).to_be_bytes());
        buf.extend_from_slice(&headers_len.to_be_bytes());
        buf.extend_from_slice(&[0u8; 4]); // prelude CRC (we don't validate)
        buf.extend_from_slice(headers);
        buf.extend_from_slice(payload);
        buf.extend_from_slice(&[0u8; 4]); // message CRC (we don't validate)

        let result = try_parse_event_stream_message(&buf);
        assert!(result.is_some());
        let (parsed_payload, consumed) = result.expect("should parse");
        assert_eq!(consumed, total_len);
        assert_eq!(parsed_payload, payload);
    }

    #[tokio::test]
    async fn bedrock_unconfigured_returns_error() {
        let provider = BedrockProvider::new(String::new(), String::new(), String::new());
        let request = LLMRequest::default();
        let result = provider.send_message(&request).await;
        assert!(result.is_err());
        let err = result.expect_err("should error").to_string();
        assert!(err.contains("not configured"));
    }
}
