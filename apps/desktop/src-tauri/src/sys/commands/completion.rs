use crate::core::router::{LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
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

#[tauri::command]
pub async fn get_code_completion(
    request: CompletionRequest,
    router_state: State<'_, Arc<tokio::sync::Mutex<LLMRouter>>>,
) -> Result<CompletionResponse, String> {
    let start_time = std::time::Instant::now();

    let preferences = RouterPreferences {
        strategy: RoutingStrategy::LatencyOptimized,
        ..Default::default()
    };

    let llm_request = LLMRequest {
        messages: vec![crate::core::router::ChatMessage {
            role: "user".to_string(),
            content: request.prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: "".to_string(),
        max_tokens: request.max_tokens.or(Some(150)),
        temperature: request.temperature.or(Some(0.3)),
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
    };

    let router = router_state.lock().await;
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err(
            "No LLM providers configured. Please configure a provider in Settings.".to_string(),
        );
    }

    for candidate in &candidates {
        match router.invoke_candidate(candidate, &llm_request).await {
            Ok(outcome) => {
                let latency = start_time.elapsed().as_millis() as u64;
                tracing::debug!(
                    "[Completion] Generated completion using {:?} in {}ms",
                    outcome.provider,
                    latency
                );

                return Ok(CompletionResponse {
                    content: outcome.response.content,
                    model: outcome.model,
                    tokens: outcome.completion_tokens,
                    latency,
                });
            }
            Err(e) => {
                tracing::warn!(
                    "[Completion] Provider {:?} failed: {}. Trying next candidate...",
                    candidate.provider,
                    e
                );
                continue;
            }
        }
    }

    Err("All configured LLM providers failed to generate a completion.".to_string())
}

#[tauri::command]
pub async fn get_inline_completion(
    context_before: String,
    context_after: String,
    language: String,
    router_state: State<'_, Arc<tokio::sync::Mutex<LLMRouter>>>,
) -> Result<String, String> {
    let prompt = format!(
        "Complete the code:\n```{}\n{}[CURSOR]{}\n```\nReturn ONLY the completion text:",
        language,
        context_before
            .chars()
            .rev()
            .take(200)
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>(),
        context_after.chars().take(100).collect::<String>()
    );

    let preferences = RouterPreferences {
        strategy: RoutingStrategy::LatencyOptimized,
        ..Default::default()
    };

    let llm_request = LLMRequest {
        messages: vec![crate::core::router::ChatMessage {
            role: "user".to_string(),
            content: prompt,
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        }],
        model: "".to_string(),
        max_tokens: Some(50),
        temperature: Some(0.2),
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
    };

    let router = router_state.lock().await;
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured".to_string());
    }

    let outcome = router
        .invoke_candidate(&candidates[0], &llm_request)
        .await
        .map_err(|e| format!("Inline completion failed: {}", e))?;

    Ok(outcome.response.content.trim().to_string())
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
