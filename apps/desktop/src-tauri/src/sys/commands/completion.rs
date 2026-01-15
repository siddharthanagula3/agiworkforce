use crate::core::llm::{LLMRequest, LLMRouter, RouterPreferences, RoutingStrategy};
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
        messages: vec![crate::core::llm::ChatMessage {
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
        messages: vec![crate::core::llm::ChatMessage {
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

/// Request for AI-powered prompt completion (ghost text suggestions)
#[derive(Debug, Deserialize)]
pub struct PromptCompletionRequest {
    /// The user's current input text
    pub input: String,
    /// Optional context from the conversation or project
    pub context: Option<String>,
}

/// Response containing the ghost text suggestion
#[derive(Debug, Serialize)]
pub struct PromptCompletionResponse {
    /// The suggested completion text (to be shown as ghost text)
    pub suggestion: String,
    /// The model used for generation
    pub model: String,
    /// Latency in milliseconds
    pub latency_ms: u64,
}

/// Get AI-powered prompt completion for ghost text suggestions
/// Similar to Gemini CLI's implementation
#[tauri::command]
pub async fn get_prompt_completion(
    request: PromptCompletionRequest,
    router_state: State<'_, Arc<tokio::sync::Mutex<LLMRouter>>>,
) -> Result<PromptCompletionResponse, String> {
    let start_time = std::time::Instant::now();

    // Validate input - minimum 5 characters like Gemini CLI
    let input = request.input.trim();
    if input.len() < 5 {
        return Err("Input too short for completion".to_string());
    }

    // Build the prompt for ghost text completion
    let system_prompt = r#"You are a helpful AI assistant providing prompt completions.
Your task is to complete the user's prompt with a natural, helpful continuation.

Rules:
- Provide ONLY the completion text (10-20 words maximum)
- Do NOT repeat the user's input
- Do NOT add any explanation or formatting
- Make the completion feel natural and conversational
- Focus on the user's likely intent
- If the input is a question, suggest how to expand it
- If the input is a command, suggest relevant parameters or clarifications"#;

    let user_prompt = match &request.context {
        Some(ctx) => format!(
            "Context: {}\n\nComplete this prompt (return ONLY the continuation, 10-20 words max): \"{}\"",
            ctx, input
        ),
        None => format!(
            "Complete this prompt (return ONLY the continuation, 10-20 words max): \"{}\"",
            input
        ),
    };

    // Use latency-optimized strategy for fast suggestions
    let preferences = RouterPreferences {
        strategy: RoutingStrategy::LatencyOptimized,
        ..Default::default()
    };

    let llm_request = LLMRequest {
        messages: vec![
            crate::core::llm::ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            },
            crate::core::llm::ChatMessage {
                role: "user".to_string(),
                content: user_prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            },
        ],
        model: "".to_string(),  // Let router choose the fastest model
        max_tokens: Some(50),   // Keep it short for ghost text
        temperature: Some(0.3), // Lower temperature for consistency
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
    };

    let router = router_state.lock().await;
    let candidates = router.candidates(&llm_request, &preferences);

    if candidates.is_empty() {
        return Err("No LLM providers configured for prompt completion".to_string());
    }

    // Try candidates in order until one succeeds
    for candidate in &candidates {
        match router.invoke_candidate(candidate, &llm_request).await {
            Ok(outcome) => {
                let latency = start_time.elapsed().as_millis() as u64;

                // Clean up the suggestion
                let suggestion = outcome
                    .response
                    .content
                    .trim()
                    .trim_matches('"')
                    .trim()
                    .to_string();

                tracing::debug!(
                    "[PromptCompletion] Generated suggestion using {:?} in {}ms: '{}'",
                    outcome.provider,
                    latency,
                    suggestion
                );

                return Ok(PromptCompletionResponse {
                    suggestion,
                    model: outcome.model,
                    latency_ms: latency,
                });
            }
            Err(e) => {
                tracing::warn!(
                    "[PromptCompletion] Provider {:?} failed: {}. Trying next...",
                    candidate.provider,
                    e
                );
                continue;
            }
        }
    }

    Err("All providers failed to generate prompt completion".to_string())
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

    #[test]
    fn test_prompt_completion_request_deserialize() {
        let json = r#"{
            "input": "help me write a function",
            "context": "TypeScript project"
        }"#;

        let req: PromptCompletionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.input, "help me write a function");
        assert_eq!(req.context, Some("TypeScript project".to_string()));
    }
}
