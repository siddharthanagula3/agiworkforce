use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::{LLMProvider, LLMRequest, LLMResponse};
use crate::sys::account::{get_access_token, get_api_base_url};
use async_trait::async_trait;
use futures_util::Stream;
use reqwest::Client;
use serde_json::Value;
use std::error::Error;
use std::pin::Pin;
use std::time::Duration;

pub struct ManagedCloudProvider {
    client: Client,
}

fn managed_cloud_base_url() -> String {
    get_api_base_url()
}

fn managed_cloud_llm_url() -> String {
    format!("{}/api/llm/completion", managed_cloud_base_url())
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

impl Default for ManagedCloudProvider {
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| {
            tracing::warn!(
                "Failed to create ManagedCloudProvider with custom timeouts: {}. Using default client.",
                e
            );
            // Fallback to default client which cannot fail
            Self {
                client: Client::new(),
            }
        })
    }
}

impl ManagedCloudProvider {
    pub fn new() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
        Ok(Self { client })
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

                Ok(LLMResponse {
                    content,
                    tokens: total_tokens,
                    prompt_tokens,
                    completion_tokens,
                    cost,
                    credits,
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
                auth_failed_message(),
            ))),
            405 => Err(Box::new(std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                method_not_allowed_message(),
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

        let url = managed_cloud_llm_url();

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
                    auth_failed_message(),
                )));
            } else if status == 405 {
                return Err(Box::new(std::io::Error::new(
                    std::io::ErrorKind::ConnectionRefused,
                    method_not_allowed_message(),
                )));
            } else {
                return Err(Box::new(std::io::Error::other(format!(
                    "Cloud provider error: {}",
                    status
                ))));
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
