use std::time::Duration;

use chrono::{DateTime, Utc};

use crate::core::llm::fallback_chain::{is_rate_limit_error, parse_retry_after};
use crate::core::llm::{LLMRequest, Provider, RouteCandidate, RouterPreferences, RoutingStrategy};
use crate::sys::commands::llm::LLMState;
use crate::sys::commands::ollama::ollama_list_models;
use anyhow::Result;
use serde::{Deserialize, Serialize};
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
    state: State<'_, LLMState>,
) -> Result<CompletionResponse, String> {
    let start_time = std::time::Instant::now();

    let preferences = RouterPreferences {
        strategy: RoutingStrategy::LatencyOptimized,
        ..Default::default()
    };

    // System prompt for AGI Workforce code completion
    let system_prompt = format!(
        r#"You are AGI Workforce's code completion engine. You help users write {} code efficiently.

Provide accurate, idiomatic code completions. Return ONLY the code - no explanations or markdown formatting."#,
        request.language
    );

    let llm_request = LLMRequest {
        messages: vec![
            crate::core::llm::ChatMessage {
                role: "system".to_string(),
                content: system_prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            },
            crate::core::llm::ChatMessage {
                role: "user".to_string(),
                content: request.prompt,
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            },
        ],
        model: "".to_string(),
        max_tokens: request.max_tokens.or(Some(150)),
        temperature: request.temperature.or(Some(0.3)),
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
        ..Default::default()
    };

    let router = state.router.read().await;
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
    state: State<'_, LLMState>,
) -> Result<String, String> {
    // System prompt for AGI Workforce inline completion
    let system_prompt = format!(
        r#"You are AGI Workforce's inline code completion engine for {} code.
Provide the most likely code that should appear at the cursor position.
Return ONLY the completion text - no explanations, no markdown, no code fences."#,
        language
    );

    let user_prompt = format!(
        "Complete the code at [CURSOR]:\n{}[CURSOR]{}",
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
        messages: vec![
            crate::core::llm::ChatMessage {
                role: "system".to_string(),
                content: system_prompt,
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
        model: "".to_string(),
        max_tokens: Some(50),
        temperature: Some(0.2),
        stream: false,
        tools: None,
        tool_choice: None,
        thinking_mode: None,
        ..Default::default()
    };

    let router = state.router.read().await;
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

const PROMPT_COMPLETION_RATE_LIMIT_MESSAGE: &str = "Prompt completion is temporarily rate-limited.";
const MIN_PROMPT_COMPLETION_COOLDOWN: Duration = Duration::from_secs(1);

fn merge_retry_after(
    current_retry_after: &mut Option<Duration>,
    candidate_retry_after: Option<Duration>,
) {
    if let Some(candidate_retry_after) = candidate_retry_after {
        *current_retry_after = Some(
            current_retry_after
                .unwrap_or(Duration::ZERO)
                .max(candidate_retry_after),
        );
    }
}

fn parse_retry_after_with_timestamp(error: &str) -> Option<Duration> {
    parse_retry_after(error).or_else(|| {
        let marker = "try again after";
        let error_lower = error.to_lowercase();
        let marker_pos = error_lower.find(marker)?;
        let retry_at_text = error[marker_pos + marker.len()..].trim_start();
        let retry_at_token = retry_at_text
            .split_whitespace()
            .next()?
            .trim_end_matches(['.', ',', ';', '"', '\'']);
        let retry_at = DateTime::parse_from_rfc3339(retry_at_token)
            .ok()?
            .with_timezone(&Utc);
        let remaining = retry_at.signed_duration_since(Utc::now());

        match remaining.to_std() {
            Ok(duration) => Some(duration.max(MIN_PROMPT_COMPLETION_COOLDOWN)),
            Err(_) => Some(MIN_PROMPT_COMPLETION_COOLDOWN),
        }
    })
}

fn format_prompt_completion_rate_limit_error(retry_after: Option<Duration>) -> String {
    match retry_after {
        Some(retry_after) => {
            let retry_after_secs = retry_after.as_secs().max(1);
            format!(
                "{} Retry after {} second{}.",
                PROMPT_COMPLETION_RATE_LIMIT_MESSAGE,
                retry_after_secs,
                if retry_after_secs == 1 { "" } else { "s" }
            )
        }
        None => PROMPT_COMPLETION_RATE_LIMIT_MESSAGE.to_string(),
    }
}

fn is_server_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();
    error_lower.contains("500")
        || error_lower.contains("502")
        || error_lower.contains("503")
        || error_lower.contains("504")
        || error_lower.contains("internal server error")
        || error_lower.contains("bad gateway")
        || error_lower.contains("service unavailable")
        || error_lower.contains("gateway timeout")
}

/// Get AI-powered prompt completion for ghost text suggestions
/// Similar to Gemini CLI's implementation
#[tauri::command]
pub async fn get_prompt_completion(
    request: PromptCompletionRequest,
    state: State<'_, LLMState>,
) -> Result<PromptCompletionResponse, String> {
    let start_time = std::time::Instant::now();

    // Validate input - minimum 5 characters like Gemini CLI
    let input = request.input.trim();
    if input.len() < 5 {
        return Err("Input too short for completion".to_string());
    }

    // Build the prompt for ghost text completion
    let system_prompt = r#"You are AGI Workforce's prompt suggestion engine.
Your task is to complete the user's prompt with a natural, helpful continuation.

AGI Workforce is a desktop AI assistant that can automate tasks (browser, files, terminal, email, etc.).

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
        ..Default::default()
    };

    let (has_managed_cloud, has_zhipu, has_ollama, mut candidates, rate_limit_tracker) = {
        let router = state.router.read().await;
        (
            router.has_provider(Provider::ManagedCloud),
            router.has_provider(Provider::Zhipu),
            router.has_provider(Provider::Ollama),
            router.candidates(&llm_request, &preferences),
            router.rate_limit_tracker(),
        )
    };

    // Prefer GLM-4.7-Flash for Gemini-style ghost text prompt completion.
    // In this app, cloud providers are typically accessed via ManagedCloud (Vercel-backed API),
    // so prefer ManagedCloud + model hint first, then direct Zhipu if available, while keeping
    // the normal router-generated fallbacks.
    if has_managed_cloud {
        candidates.insert(
            0,
            RouteCandidate {
                provider: Provider::ManagedCloud,
                model: "glm-4.7-flash".to_string(),
                reason: "prompt-completion-managed-cloud-glm-free",
                strategy: None,
            },
        );
    }

    if has_zhipu {
        candidates.insert(
            usize::from(has_managed_cloud),
            RouteCandidate {
                provider: Provider::Zhipu,
                model: "glm-4.7-flash".to_string(),
                reason: "prompt-completion-zhipu-free",
                strategy: None,
            },
        );
    }

    // If Ollama is configured, try installed local models first. The router's default Ollama
    // model may not be installed on a given machine (e.g. it defaults to llama4-maverick).
    if has_ollama {
        if let Ok(mut models) = ollama_list_models().await {
            models.sort_by_key(|m| m.size);

            let insert_at = usize::from(has_managed_cloud) + usize::from(has_zhipu);
            let mut offset = 0usize;

            for model in models.into_iter().take(3) {
                let already_present = candidates.iter().any(|c| {
                    c.provider == Provider::Ollama && c.model.eq_ignore_ascii_case(&model.name)
                });
                if already_present {
                    continue;
                }

                candidates.insert(
                    insert_at + offset,
                    RouteCandidate {
                        provider: Provider::Ollama,
                        model: model.name,
                        reason: "prompt-completion-ollama-installed",
                        strategy: None,
                    },
                );
                offset += 1;
            }
        }
    }

    if candidates.is_empty() {
        return Err("No LLM providers configured for prompt completion".to_string());
    }

    if let Some(rate_limit_tracker) = rate_limit_tracker.as_ref() {
        rate_limit_tracker.cleanup_expired();
    }

    // Try candidates in order until one succeeds
    let router = state.router.read().await;
    let mut failures: Vec<String> = Vec::new();
    let mut retry_after: Option<Duration> = None;
    let mut skipped_rate_limited = 0usize;
    let mut skipped_unavailable = 0usize;
    let mut saw_rate_limit = false;

    for candidate in &candidates {
        if let Some(rate_limit_tracker) = rate_limit_tracker.as_ref() {
            if rate_limit_tracker.is_rate_limited(candidate.provider, Some(&candidate.model)) {
                skipped_rate_limited += 1;
                merge_retry_after(
                    &mut retry_after,
                    Some(
                        rate_limit_tracker
                            .cooldown_remaining(candidate.provider, Some(&candidate.model)),
                    ),
                );
                tracing::debug!(
                    provider = %candidate.provider.as_string(),
                    model = %candidate.model,
                    "Skipping prompt completion candidate in cooldown"
                );
                continue;
            }
        }

        if !router.is_provider_available(candidate.provider).await {
            skipped_unavailable += 1;
            tracing::debug!(
                provider = %candidate.provider.as_string(),
                model = %candidate.model,
                "Skipping unavailable prompt completion provider"
            );
            continue;
        }

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

                if let Some(rate_limit_tracker) = rate_limit_tracker.as_ref() {
                    rate_limit_tracker.record_success(candidate.provider, Some(&candidate.model));
                }

                return Ok(PromptCompletionResponse {
                    suggestion,
                    model: outcome.model,
                    latency_ms: latency,
                });
            }
            Err(e) => {
                let error_message = e.to_string();
                let is_rate_limited = is_rate_limit_error(&error_message);

                if is_rate_limited {
                    saw_rate_limit = true;
                    let provider_retry_after = parse_retry_after_with_timestamp(&error_message);
                    merge_retry_after(&mut retry_after, provider_retry_after);

                    if let Some(rate_limit_tracker) = rate_limit_tracker.as_ref() {
                        rate_limit_tracker.record_rate_limit(
                            candidate.provider,
                            Some(&candidate.model),
                            provider_retry_after,
                        );
                    }
                } else if is_server_error(&error_message) {
                    if let Some(rate_limit_tracker) = rate_limit_tracker.as_ref() {
                        rate_limit_tracker
                            .record_server_error(candidate.provider, Some(&candidate.model));
                    }
                }

                failures.push(format!(
                    "{:?}/{}: {}",
                    candidate.provider, candidate.model, error_message
                ));
                tracing::warn!(
                    provider = %candidate.provider.as_string(),
                    model = %candidate.model,
                    is_rate_limited = is_rate_limited,
                    "[PromptCompletion] Provider {:?} failed: {}. Trying next...",
                    candidate.provider,
                    error_message
                );
                continue;
            }
        }
    }

    if saw_rate_limit || skipped_rate_limited > 0 {
        Err(format_prompt_completion_rate_limit_error(retry_after))
    } else if failures.is_empty() {
        if skipped_unavailable > 0 {
            Err("No available LLM providers configured for prompt completion".to_string())
        } else {
            Err("Prompt completion is temporarily unavailable".to_string())
        }
    } else {
        Err(format!(
            "Prompt completion failed: {}",
            failures.into_iter().take(2).collect::<Vec<_>>().join(" | ")
        ))
    }
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

    #[test]
    fn test_parse_prompt_completion_retry_after_timestamp() {
        let retry_at = (Utc::now() + chrono::Duration::seconds(45)).to_rfc3339();
        let parsed = parse_retry_after_with_timestamp(&format!(
            "Rate limit exceeded. Please try again after {}",
            retry_at
        ))
        .unwrap();

        assert!(parsed >= Duration::from_secs(30));
        assert!(parsed <= Duration::from_secs(45));
    }

    #[test]
    fn test_parse_prompt_completion_retry_after_timestamp_uses_minimum_cooldown() {
        let retry_at = (Utc::now() - chrono::Duration::seconds(5)).to_rfc3339();
        let parsed = parse_retry_after_with_timestamp(&format!(
            "Rate limit exceeded. Please try again after {}",
            retry_at
        ))
        .unwrap();

        assert_eq!(parsed, MIN_PROMPT_COMPLETION_COOLDOWN);
    }

    #[test]
    fn test_format_prompt_completion_rate_limit_error() {
        assert_eq!(
            format_prompt_completion_rate_limit_error(Some(Duration::from_secs(12))),
            "Prompt completion is temporarily rate-limited. Retry after 12 seconds."
        );
    }
}
