/**
 * Code Completion Commands
 * Tauri commands for AI-powered code completions
 */

use crate::router::{LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Deserialize)]
pub struct CompletionRequest {
    pub prompt: String,
    pub language: String,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize)]
pub struct CompletionResponse {
    pub content: String,
    pub model: String,
    pub tokens: u32,
    pub latency: u64,
}

/// Get AI-powered code completion
/// Optimized for sub-500ms latency with fast models
#[tauri::command]
pub async fn get_code_completion(
    request: CompletionRequest,
    router_state: State<'_, Arc<tokio::sync::Mutex<LLMRouter>>>,
) -> Result<CompletionResponse, String> {
    let start_time = std::time::Instant::now();

    // Use latency-optimized routing for completions
    let preferences = RouterPreferences {
        strategy: RoutingStrategy::LatencyOptimized,
        ..Default::default()
    };

    let llm_request = LLMRequest {
        messages: vec![crate::router::Message {
            role: crate::router::MessageRole::User,
            content: request.prompt,
        }],
        max_tokens: request.max_tokens.or(Some(150)),
        temperature: request.temperature.or(Some(0.3)),
        stream: false, // No streaming for completions (need full response fast)
    };

    let router = router_state.lock().await;
    let response = router
        .send_message_with_preferences(&llm_request, &preferences)
        .await
        .map_err(|e| format!("Completion failed: {}", e))?;

    let latency = start_time.elapsed().as_millis() as u64;

    tracing::debug!(
        "[Completion] Generated completion using {} in {}ms",
        response.provider,
        latency
    );

    Ok(CompletionResponse {
        content: response.content,
        model: response.provider.to_string(),
        tokens: response.tokens.unwrap_or(0),
        latency,
    })
}

/// Get inline completion (shorter, faster variant)
/// Target: sub-200ms for simple completions
#[tauri::command]
pub async fn get_inline_completion(
    context_before: String,
    context_after: String,
    language: String,
    router_state: State<'_, Arc<tokio::sync::Mutex<LLMRouter>>>,
) -> Result<String, String> {
    // Build minimal prompt for speed
    let prompt = format!(
        "Complete the code:\n```{}\n{}[CURSOR]{}\n```\nReturn ONLY the completion text:",
        language,
        context_before.chars().rev().take(200).collect::<String>().chars().rev().collect::<String>(),
        context_after.chars().take(100).collect::<String>()
    );

    let preferences = RouterPreferences {
        strategy: RoutingStrategy::LatencyOptimized,
        ..Default::default()
    };

    let llm_request = LLMRequest {
        messages: vec![crate::router::Message {
            role: crate::router::MessageRole::User,
            content: prompt,
        }],
        max_tokens: Some(50), // Very short completions
        temperature: Some(0.2), // Low temperature for consistency
        stream: false,
    };

    let router = router_state.lock().await;
    let response = router
        .send_message_with_preferences(&llm_request, &preferences)
        .await
        .map_err(|e| format!("Inline completion failed: {}", e))?;

    Ok(response.content.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_completion_request_deserialize() {
        let json = r#"{
            "prompt": "complete this function",
            "language": "typescript",
            "max_tokens": 100,
            "temperature": 0.3
        }"#;

        let req: CompletionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.language, "typescript");
        assert_eq!(req.max_tokens, Some(100));
    }
}
