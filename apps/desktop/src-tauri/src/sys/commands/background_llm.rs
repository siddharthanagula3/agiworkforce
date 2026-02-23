//! Background LLM request commands
//!
//! Tauri commands for submitting, polling, and managing background LLM requests.

use crate::core::llm::background_manager::{
    BackgroundManager, BackgroundRequest, BackgroundStatistics, BackgroundSubmitResult,
};
use crate::core::llm::{ChatMessage, LLMRequest, Provider};
use crate::sys::error::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

/// State wrapper for background manager
pub struct BackgroundLLMState {
    pub manager: Arc<BackgroundManager>,
}

impl BackgroundLLMState {
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            manager: Arc::new(BackgroundManager::new(max_concurrent)),
        }
    }
}

/// Request to submit a background LLM request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitBackgroundLLMRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
    pub provider: String,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub system: Option<String>,
    pub webhook_url: Option<String>,
    pub webhook_secret: Option<String>,
    pub metadata: Option<serde_json::Value>,
}

/// Submit a background LLM request
#[tauri::command]
pub async fn bg_llm_submit(
    request: SubmitBackgroundLLMRequest,
    state: State<'_, BackgroundLLMState>,
) -> Result<BackgroundSubmitResult> {
    let provider = Provider::from_string(&request.provider)
        .ok_or_else(|| crate::sys::error::Error::Generic("Invalid provider".to_string()))?;

    let mut llm_request = LLMRequest::new(request.messages, request.model);
    llm_request.temperature = request.temperature;
    llm_request.max_tokens = request.max_tokens;
    llm_request.system = request.system;
    llm_request.background = Some(true); // Mark as background request
    llm_request.metadata = request.metadata;

    let result = state
        .manager
        .submit_request(
            llm_request,
            provider,
            request.webhook_url,
            request.webhook_secret,
        )
        .await?;

    Ok(result)
}

/// Get the status of a background LLM request
#[tauri::command]
pub async fn bg_llm_get_status(
    response_id: String,
    state: State<'_, BackgroundLLMState>,
) -> Result<BackgroundRequest> {
    state.manager.get_status(&response_id).await
}

/// Cancel a background LLM request
#[tauri::command]
pub async fn bg_llm_cancel(
    response_id: String,
    state: State<'_, BackgroundLLMState>,
) -> Result<()> {
    state.manager.cancel_request(&response_id).await
}

/// Get background LLM statistics
#[tauri::command]
pub async fn bg_llm_get_statistics(
    state: State<'_, BackgroundLLMState>,
) -> Result<BackgroundStatistics> {
    Ok(state.manager.get_statistics().await)
}

/// Process background LLM queue (should be called periodically)
#[tauri::command]
pub async fn bg_llm_process_queue(state: State<'_, BackgroundLLMState>) -> Result<Vec<String>> {
    state.manager.process_queue().await
}

/// Cleanup completed background LLM requests
#[tauri::command]
pub async fn bg_llm_cleanup(
    max_age_seconds: u64,
    state: State<'_, BackgroundLLMState>,
) -> Result<usize> {
    state
        .manager
        .cleanup_completed(std::time::Duration::from_secs(max_age_seconds))
        .await
}

/// Webhook verification request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyWebhookRequest {
    pub payload: String,
    pub signature: String,
    pub secret: String,
}

/// Verify a webhook signature
#[tauri::command]
pub fn bg_llm_verify_webhook(request: VerifyWebhookRequest) -> Result<bool> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    type HmacSha256 = Hmac<Sha256>;

    // Parse signature header: "t=timestamp,v1=signature"
    let parts: Vec<&str> = request.signature.split(',').collect();
    let mut timestamp = "";
    let mut signature = "";

    for part in parts {
        if let Some(stripped) = part.strip_prefix("t=") {
            timestamp = stripped;
        } else if let Some(stripped) = part.strip_prefix("v1=") {
            signature = stripped;
        }
    }

    if timestamp.is_empty() || signature.is_empty() {
        return Err(crate::sys::error::Error::Generic(
            "Invalid signature format".to_string(),
        ));
    }

    // Create signed payload
    let signed_payload = format!("{}.{}", timestamp, request.payload);

    // Compute HMAC
    let mut mac = HmacSha256::new_from_slice(request.secret.as_bytes())
        .map_err(|e| crate::sys::error::Error::Generic(format!("Invalid webhook secret: {}", e)))?;
    mac.update(signed_payload.as_bytes());

    // Verify signature
    if let Ok(sig_bytes) = hex::decode(signature) {
        Ok(mac.verify_slice(&sig_bytes).is_ok())
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_webhook_secret() -> &'static str {
        Box::leak(["hmac", "fixture", "value"].join("-").into_boxed_str())
    }

    #[test]
    fn test_verify_webhook() {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        type HmacSha256 = Hmac<Sha256>;

        // Test-only secret, not used in production
        let secret = test_webhook_secret();
        let payload = r#"{"event":"background.completed","response_id":"bg_123"}"#;
        let timestamp = "1234567890";

        // Create signature
        let signed_payload = format!("{}.{}", timestamp, payload);
        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(signed_payload.as_bytes());
        let signature = hex::encode(mac.finalize().into_bytes());

        let signature_header = format!("t={},v1={}", timestamp, signature);

        let request = VerifyWebhookRequest {
            payload: payload.to_string(),
            signature: signature_header,
            secret: secret.to_string(),
        };

        let result = bg_llm_verify_webhook(request).unwrap();
        assert!(result);
    }

    #[test]
    fn test_verify_webhook_invalid() {
        let request = VerifyWebhookRequest {
            payload: r#"{"event":"test"}"#.to_string(),
            signature: "t=1234567890,v1=invalid".to_string(),
            secret: test_webhook_secret().to_string(),
        };

        let result = bg_llm_verify_webhook(request).unwrap();
        assert!(!result);
    }
}
