use crate::core::router::sse_parser::StreamChunk;
use crate::core::router::{LLMProvider, LLMRequest, LLMResponse};
use crate::sys::account::get_access_token;
use async_trait::async_trait;
use futures_util::Stream;
use reqwest::Client;
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;

pub struct ManagedCloudProvider {
    client: Client,
}

impl Default for ManagedCloudProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ManagedCloudProvider {
    pub fn new() -> Self {
        Self {
            client: Client::new(),
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

        let url = "https://agiworkforce.com/api/llm/completion";

        let res = self
            .client
            .post(url)
            .bearer_auth(&token)
            .json(request)
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        match res.status().as_u16() {
            200 => {
                let body: Value = res
                    .json()
                    .await
                    .map_err(|e| format!("Parse error: {}", e))?;

                let content = body["choices"][0]["message"]["content"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();

                let prompt_tokens = body["usage"]["prompt_tokens"].as_u64().map(|v| v as u32);
                let completion_tokens = body["usage"]["completion_tokens"]
                    .as_u64()
                    .map(|v| v as u32);
                let total_tokens = body["usage"]["total_tokens"].as_u64().map(|v| v as u32);

                // Extract credit information if available
                let credits_info = body.get("credits").and_then(|c| c.as_object());
                let cost = credits_info
                    .and_then(|c| c.get("cost_cents"))
                    .and_then(|v| v.as_u64())
                    .map(|cents| cents as f64 / 100.0);

                Ok(LLMResponse {
                    content,
                    tokens: total_tokens,
                    prompt_tokens,
                    completion_tokens,
                    cost,
                    model: body["model"].as_str().unwrap_or(&request.model).to_string(),
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
                "Authentication failed. Please sign in again.",
            ))),
            _ => Err(Box::new(std::io::Error::other(format!(
                "Cloud provider error: {}",
                res.status()
            )))),
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

        let url = "https://agiworkforce.com/api/llm/completion";

        let mut streaming_request = request.clone();
        streaming_request.stream = true;

        let res = self
            .client
            .post(url)
            .bearer_auth(&token)
            .json(&streaming_request)
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
                    "Authentication failed. Please sign in again.",
                )));
            } else {
                return Err(Box::new(std::io::Error::other(format!(
                    "Cloud provider error: {}",
                    status
                ))));
            }
        }

        use crate::core::router::sse_parser::parse_sse_stream;
        Ok(Box::pin(parse_sse_stream(
            res,
            crate::core::router::Provider::ManagedCloud,
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
