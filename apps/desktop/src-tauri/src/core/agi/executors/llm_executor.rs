//! LLM reasoning executor.
//!
//! Handles LLM-based reasoning operations using the LLM router.
//! This executor provides the AGI system with the ability to perform
//! sub-reasoning tasks, delegate questions to specialized models,
//! and chain reasoning steps together.
//!
//! # Supported Tools
//!
//! - `llm_reason`: Performs reasoning on a given prompt using the LLM router
//!
//! # Model Selection
//!
//! The executor supports model preferences through parameters:
//! - `provider`: Override the default provider (anthropic, openai, google, etc.)
//! - `model`: Specify a particular model (claude-haiku-4-5, gpt-5-nano, etc.)
//! - `temperature`: Control response randomness (0.0 - 1.0, default 0.7)
//! - `max_tokens`: Limit response length (default 2000)
//! - `stream`: Enable streaming responses (default false)
//!
//! # Example Usage
//!
//! ```json
//! {
//!     "prompt": "Analyze this code for potential security issues...",
//!     "temperature": 0.3,
//!     "max_tokens": 4000,
//!     "model": "claude-sonnet-4-5"
//! }
//! ```

use super::{ExecutorContext, ToolExecutor};
use crate::core::agi::ExecutionContext;
use crate::core::llm::{
    ChatMessage, LLMRequest, LLMRouter, Provider, RouterPreferences, RoutingStrategy,
};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Executor for LLM reasoning operations.
///
/// Provides the AGI system with the ability to make LLM reasoning calls
/// for sub-tasks, delegation, or chained reasoning workflows.
pub struct LlmExecutor {
    router: Arc<RwLock<LLMRouter>>,
}

impl LlmExecutor {
    /// Create a new LLM executor with the given router.
    ///
    /// # Arguments
    ///
    /// * `router` - Shared reference to the LLM router for provider routing
    pub fn new(router: Arc<RwLock<LLMRouter>>) -> Self {
        Self { router }
    }

    /// Parse provider string into Provider enum.
    ///
    /// Supports common provider names in lowercase.
    fn parse_provider(provider_str: &str) -> Option<Provider> {
        match provider_str.to_lowercase().as_str() {
            // All cloud providers route via ManagedCloud (no local API keys)
            "anthropic" | "claude" | "openai" | "gpt" | "google" | "gemini" | "deepseek"
            | "xai" | "grok" | "qwen" | "alibaba" | "moonshot" | "kimi" | "zhipu" | "glm"
            | "perplexity" | "sonar" => Some(Provider::ManagedCloud),
            "ollama" | "local" => Some(Provider::Ollama),
            "managed" | "cloud" | "managed-cloud" => Some(Provider::ManagedCloud),
            _ => None,
        }
    }

    /// Execute llm_reason operation.
    ///
    /// Uses the LLM router to perform reasoning on a given prompt.
    /// Supports customization of provider, model, temperature, and token limits.
    ///
    /// # Parameters
    ///
    /// - `prompt`: The reasoning prompt (required)
    /// - `provider`: Override provider selection (optional)
    /// - `model`: Specific model to use (optional)
    /// - `temperature`: Response randomness 0.0-1.0 (optional, default 0.7)
    /// - `max_tokens`: Maximum response tokens (optional, default 2000)
    /// - `system_prompt`: System instruction for the LLM (optional)
    /// - `stream`: Whether to stream the response (optional, default false)
    ///
    /// # Returns
    ///
    /// JSON object with:
    /// - `success`: Boolean indicating success
    /// - `reasoning`: The LLM's response content
    /// - `model`: The model that was used
    /// - `provider`: The provider that was used
    /// - `cost`: Estimated cost of the request
    /// - `tokens`: Token usage information
    async fn execute_reason(
        &self,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
    ) -> Result<Value> {
        let prompt = parameters
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow!("Missing required 'prompt' parameter"))?;

        // Extract optional parameters
        let provider_override = parameters
            .get("provider")
            .and_then(|v| v.as_str())
            .and_then(Self::parse_provider);

        let model_override = parameters
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from);

        let temperature = parameters
            .get("temperature")
            .and_then(|v| v.as_f64())
            .map(|t| t.clamp(0.0, 2.0) as f32)
            .unwrap_or(0.7);

        let max_tokens = parameters
            .get("max_tokens")
            .and_then(|v| v.as_u64())
            .map(|t| t.clamp(1, 128000) as u32)
            .unwrap_or(2000);

        let system_prompt = parameters.get("system_prompt").and_then(|v| v.as_str());

        let stream = parameters
            .get("stream")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        // Log the reasoning request (truncate long prompts for readability)
        let truncated_prompt = if prompt.len() > 100 {
            format!("{}...", &prompt[..100])
        } else {
            prompt.to_string()
        };
        tracing::info!(
            "[LlmExecutor] LLM reasoning request: prompt='{}' provider={:?} model={:?} temp={} max_tokens={}",
            truncated_prompt,
            provider_override,
            model_override,
            temperature,
            max_tokens
        );

        // Emit progress event
        context.emit_progress("Starting LLM reasoning...", Some(0.1));

        // Build message list
        let mut messages = Vec::new();

        // Add system prompt if provided
        if let Some(sys_prompt) = system_prompt {
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: sys_prompt.to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            });
        }

        // Add user prompt
        messages.push(ChatMessage {
            role: "user".to_string(),
            content: prompt.to_string(),
            tool_calls: None,
            tool_call_id: None,
            multimodal_content: None,
        });

        // Determine default provider and model based on overrides
        let (default_provider, default_model) = match (&provider_override, &model_override) {
            (Some(p), Some(m)) => (*p, m.clone()),
            (Some(p), None) => (*p, self.default_model_for_provider(*p)),
            (None, Some(m)) => (self.infer_provider_from_model(m), m.clone()),
            (None, None) => (Provider::ManagedCloud, "gpt-5-nano".to_string()),
        };

        // Build router preferences
        let preferences = RouterPreferences {
            provider: Some(default_provider),
            model: Some(default_model.clone()),
            strategy: RoutingStrategy::Auto,
            context: None,
            prefer_cloud_credits: false,
        };

        // Build LLM request
        let request = LLMRequest {
            messages,
            model: default_model,
            temperature: Some(temperature),
            max_tokens: Some(max_tokens),
            stream,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
            ..Default::default()
        };

        // Execute the request
        let start_time = std::time::Instant::now();
        let router = self.router.read().await;
        let candidates = router.candidates(&request, &preferences);

        if candidates.is_empty() {
            drop(router);
            context.emit_error("No LLM providers available", start_time, true);
            return Err(anyhow!("No LLM candidates available for reasoning"));
        }

        context.emit_progress("Invoking LLM...", Some(0.3));

        // Handle streaming vs non-streaming
        if stream {
            // For streaming, we need to collect the response
            // Note: Full streaming support would emit chunks via events
            drop(router);
            self.execute_streaming_reason(&request, &preferences, context, start_time)
                .await
        } else {
            // Non-streaming: invoke the candidate directly
            match router.invoke_candidate(&candidates[0], &request).await {
                Ok(outcome) => {
                    drop(router);

                    let elapsed = start_time.elapsed();
                    tracing::info!(
                        "[LlmExecutor] LLM reasoning completed: model={} tokens={:?} cost={:?} duration={:?}",
                        outcome.response.model,
                        outcome.response.tokens,
                        outcome.response.cost,
                        elapsed
                    );

                    let result = json!({
                        "success": true,
                        "reasoning": outcome.response.content,
                        "model": outcome.response.model,
                        "provider": candidates[0].provider.as_string(),
                        "cost": outcome.response.cost,
                        "tokens": {
                            "prompt": outcome.prompt_tokens,
                            "completion": outcome.completion_tokens,
                            "total": outcome.prompt_tokens + outcome.completion_tokens
                        },
                        "duration_ms": elapsed.as_millis() as u64,
                        "cached": outcome.response.cached
                    });

                    context.emit_completed(&result, start_time);
                    Ok(result)
                }
                Err(e) => {
                    drop(router);
                    let error_msg = format!("LLM reasoning failed: {}", e);
                    tracing::error!("[LlmExecutor] {}", error_msg);
                    context.emit_error(&error_msg, start_time, true);
                    Err(anyhow!(error_msg))
                }
            }
        }
    }

    /// Execute streaming reasoning request.
    ///
    /// Collects streamed chunks and emits progress events during generation.
    async fn execute_streaming_reason(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
        context: &ExecutorContext,
        start_time: std::time::Instant,
    ) -> Result<Value> {
        use futures_util::StreamExt;

        let router = self.router.read().await;

        match router.send_message_streaming(request, preferences).await {
            Ok(mut stream) => {
                drop(router);

                let mut full_content = String::new();
                let mut chunk_count = 0u32;

                // Collect chunks from the stream
                while let Some(chunk_result) = stream.next().await {
                    match chunk_result {
                        Ok(chunk) => {
                            // Always accumulate content, even if empty (fixes Gemini empty message bug)
                            full_content.push_str(&chunk.content);

                            // Only increment counter and emit for non-empty chunks
                            if !chunk.content.is_empty() {
                                chunk_count += 1;

                                // Emit progress periodically (every 10 chunks)
                                if chunk_count.is_multiple_of(10) {
                                    let progress =
                                        0.3 + (0.6 * (chunk_count as f32 / 100.0).min(1.0));
                                    context.emit_progress(
                                        &format!("Generating... ({} chunks)", chunk_count),
                                        Some(progress),
                                    );
                                }

                                // Emit streaming chunk event to UI if app handle available
                                if let Some(ref app_handle) = context.app_handle {
                                    use tauri::Emitter;
                                    let _ = app_handle.emit(
                                        "llm:stream_chunk",
                                        json!({
                                            "tool_id": context.tool_id,
                                            "content": &chunk.content,
                                            "chunk_index": chunk_count,
                                        }),
                                    );
                                }
                            }

                            // Check for completion AFTER processing content (done is bool, not Option<bool>)
                            if chunk.done {
                                tracing::debug!(
                                    "[LlmExecutor] Stream completed with done=true. Final content length: {}",
                                    full_content.len()
                                );
                                break;
                            }
                        }
                        Err(e) => {
                            tracing::warn!("[LlmExecutor] Stream chunk error: {}", e);
                            // Continue collecting - some errors may be recoverable
                        }
                    }
                }

                let elapsed = start_time.elapsed();
                tracing::info!(
                    "[LlmExecutor] Streaming reasoning completed: {} chunks, {} chars, {:?}",
                    chunk_count,
                    full_content.len(),
                    elapsed
                );

                let result = json!({
                    "success": true,
                    "reasoning": full_content,
                    "model": request.model,
                    "provider": preferences.provider.map(|p| p.as_string()).unwrap_or("unknown"),
                    "streaming": true,
                    "chunks": chunk_count,
                    "duration_ms": elapsed.as_millis() as u64
                });

                context.emit_completed(&result, start_time);
                Ok(result)
            }
            Err(e) => {
                drop(router);
                let error_msg = format!("Streaming LLM reasoning failed: {}", e);
                tracing::error!("[LlmExecutor] {}", error_msg);
                context.emit_error(&error_msg, start_time, true);
                Err(anyhow!(error_msg))
            }
        }
    }

    /// Get the default model for a given provider.
    fn default_model_for_provider(&self, provider: Provider) -> String {
        match provider {
            Provider::Ollama => "llama4-maverick".to_string(),
            _ => "gpt-5-nano".to_string(),
        }
    }

    /// Infer provider from model name.
    fn infer_provider_from_model(&self, model: &str) -> Provider {
        let model_lower = model.to_lowercase();

        if model_lower.starts_with("llama")
            || model_lower.starts_with("mistral")
            || model_lower.starts_with("phi")
        {
            Provider::Ollama
        } else {
            // Route all non-local models through ManagedCloud
            Provider::ManagedCloud
        }
    }
}

#[async_trait]
impl ToolExecutor for LlmExecutor {
    fn tool_names(&self) -> Vec<&'static str> {
        vec!["llm_reason"]
    }

    fn description(&self) -> &'static str {
        "Handles LLM reasoning operations using the LLM router for sub-tasks, \
        delegation, and chained reasoning workflows with support for multiple providers."
    }

    async fn execute(
        &self,
        tool_name: &str,
        parameters: &HashMap<String, Value>,
        context: &ExecutorContext,
        _execution_context: &ExecutionContext,
    ) -> Result<Value> {
        match tool_name {
            "llm_reason" => self.execute_reason(parameters, context).await,
            _ => Err(anyhow!("Unknown LLM tool: {}", tool_name)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::agi::{Goal, Priority, ResourceState};

    fn create_test_router() -> Arc<RwLock<LLMRouter>> {
        Arc::new(RwLock::new(LLMRouter::new()))
    }

    fn create_test_context() -> ExecutorContext {
        use std::sync::Arc;

        ExecutorContext {
            app_handle: None,
            automation: Arc::new(
                crate::automation::AutomationService::new()
                    .expect("Failed to create AutomationService for tests"),
            ),
            router: create_test_router(),
            tool_cache: Arc::new(crate::data::cache::ToolResultCache::new()),
            security_guard: Arc::new(crate::sys::security::ToolExecutionGuard::new()),
            change_tracker: None,
            session_id: "test_session".to_string(),
            tool_id: "test_tool".to_string(),
        }
    }

    fn create_test_execution_context() -> ExecutionContext {
        ExecutionContext {
            goal: Goal {
                id: "test".to_string(),
                description: "test".to_string(),
                priority: Priority::Medium,
                deadline: None,
                constraints: vec![],
                success_criteria: vec![],
            },
            current_state: HashMap::new(),
            available_resources: ResourceState {
                cpu_usage_percent: 0.0,
                memory_usage_mb: 0,
                network_usage_mbps: 0.0,
                storage_usage_mb: 0,
                available_tools: vec![],
            },
            tool_results: vec![],
            context_memory: vec![],
        }
    }

    #[test]
    fn test_tool_names() {
        let router = create_test_router();
        let executor = LlmExecutor::new(router);
        let names = executor.tool_names();

        assert!(names.contains(&"llm_reason"));
        assert_eq!(names.len(), 1);
    }

    #[test]
    fn test_description() {
        let router = create_test_router();
        let executor = LlmExecutor::new(router);
        let desc = executor.description();

        assert!(!desc.is_empty());
        assert!(desc.contains("LLM"));
        assert!(desc.contains("reasoning"));
    }

    #[test]
    fn test_parse_provider() {
        assert_eq!(
            LlmExecutor::parse_provider("anthropic"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("claude"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("openai"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("gpt"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("google"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("gemini"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("deepseek"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("xai"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(
            LlmExecutor::parse_provider("grok"),
            Some(Provider::ManagedCloud)
        );
        assert_eq!(LlmExecutor::parse_provider("unknown_provider"), None);
    }

    #[test]
    fn test_infer_provider_from_model() {
        let router = create_test_router();
        let executor = LlmExecutor::new(router);

        assert_eq!(
            executor.infer_provider_from_model("claude-sonnet-4-5"),
            Provider::Anthropic
        );
        assert_eq!(
            executor.infer_provider_from_model("gpt-5-nano"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("gemini-3-pro"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("deepseek-v3.2"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("grok-4.1"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("qwen-max"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("kimi-k2"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("glm-4.7"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("sonar-pro"),
            Provider::ManagedCloud
        );
        assert_eq!(
            executor.infer_provider_from_model("llama4-maverick"),
            Provider::Ollama
        );
        assert_eq!(
            executor.infer_provider_from_model("unknown-model"),
            Provider::ManagedCloud
        );
    }

    #[test]
    fn test_default_model_for_provider() {
        let router = create_test_router();
        let executor = LlmExecutor::new(router);

        assert_eq!(
            executor.default_model_for_provider(Provider::Anthropic),
            "gpt-5-nano"
        );
        assert_eq!(
            executor.default_model_for_provider(Provider::OpenAI),
            "gpt-5-nano"
        );
        assert_eq!(
            executor.default_model_for_provider(Provider::Google),
            "gpt-5-nano"
        );
    }

    #[tokio::test]
    async fn test_missing_prompt_parameter() {
        let router = create_test_router();
        let executor = LlmExecutor::new(router);
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let params = HashMap::new(); // No prompt parameter

        let result = executor
            .execute("llm_reason", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Missing required 'prompt' parameter"));
    }

    #[tokio::test]
    async fn test_unknown_tool() {
        let router = create_test_router();
        let executor = LlmExecutor::new(router);
        let context = create_test_context();
        let exec_context = create_test_execution_context();

        let params = HashMap::new();

        let result = executor
            .execute("llm_unknown", &params, &context, &exec_context)
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown LLM tool"));
    }
}
