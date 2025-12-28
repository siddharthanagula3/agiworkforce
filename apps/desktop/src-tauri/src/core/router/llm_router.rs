use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Result};
use futures_util::Stream;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;

use crate::core::router::cache_manager::CacheManager;
use crate::core::router::cost_calculator::CostCalculator;
use crate::core::router::sse_parser::StreamChunk;
use crate::core::router::token_counter::TokenCounter;
use crate::core::router::{ChatMessage, LLMProvider, LLMRequest, LLMResponse, Provider};

/// Configuration for retry behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts per candidate
    pub max_retries: u32,
    /// Initial delay before first retry (in milliseconds)
    pub initial_delay_ms: u64,
    /// Maximum delay between retries (in milliseconds)
    pub max_delay_ms: u64,
    /// Multiplier for exponential backoff
    pub backoff_multiplier: f64,
    /// Whether to try fallback candidates after all retries fail
    pub try_fallback_candidates: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay_ms: 500,
            max_delay_ms: 10000,
            backoff_multiplier: 2.0,
            try_fallback_candidates: true,
        }
    }
}

/// Determines if an error is retryable (transient) or permanent
fn is_retryable_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();

    // Rate limiting errors - should retry with backoff
    if error_lower.contains("rate limit")
        || error_lower.contains("too many requests")
        || error_lower.contains("429")
    {
        return true;
    }

    // Temporary server errors
    if error_lower.contains("500")
        || error_lower.contains("502")
        || error_lower.contains("503")
        || error_lower.contains("504")
        || error_lower.contains("internal server error")
        || error_lower.contains("bad gateway")
        || error_lower.contains("service unavailable")
        || error_lower.contains("gateway timeout")
    {
        return true;
    }

    // Network/connection errors
    if error_lower.contains("connection")
        || error_lower.contains("timeout")
        || error_lower.contains("network")
        || error_lower.contains("temporarily")
    {
        return true;
    }

    // Overloaded errors
    if error_lower.contains("overloaded") || error_lower.contains("capacity") {
        return true;
    }

    false
}

/// Calculate delay for exponential backoff
fn calculate_backoff_delay(attempt: u32, config: &RetryConfig) -> Duration {
    let delay_ms =
        (config.initial_delay_ms as f64) * config.backoff_multiplier.powi(attempt as i32);
    let capped_delay_ms = delay_ms.min(config.max_delay_ms as f64) as u64;

    // Add jitter (up to 25% of the delay) to prevent thundering herd
    let jitter = (capped_delay_ms as f64 * 0.25 * rand::random::<f64>()) as u64;

    Duration::from_millis(capped_delay_ms + jitter)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum RoutingStrategy {
    #[default]
    Auto,
    CostOptimized,
    LatencyOptimized,
    LocalFirst,
}

#[derive(Debug, Clone, Default)]
pub struct RouterPreferences {
    pub provider: Option<Provider>,
    pub model: Option<String>,
    pub strategy: RoutingStrategy,
    pub context: Option<RouterContext>,
    pub prefer_cloud_credits: bool, // When true, prioritize ManagedCloud for Pro/Max users
}

#[derive(Debug, Clone)]
pub struct RouteCandidate {
    pub provider: Provider,
    pub model: String,
    pub reason: &'static str,
}

#[derive(Debug, Clone)]
pub struct RouteOutcome {
    pub provider: Provider,
    pub model: String,
    pub response: LLMResponse,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub cost: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum CostPriority {
    Low,
    #[default]
    Balanced,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouterContext {
    #[serde(default)]
    pub intents: Vec<String>,
    #[serde(default)]
    pub requires_vision: bool,
    #[serde(default)]
    pub token_estimate: u32,
    #[serde(default)]
    pub cost_priority: CostPriority,
    #[serde(default)]
    pub plan_tier: String, // 'free', 'hobby', 'pro', 'max', 'enterprise'
}

impl Default for RouterContext {
    fn default() -> Self {
        Self {
            intents: Vec::new(),
            requires_vision: false,
            token_estimate: 0,
            cost_priority: CostPriority::Balanced,
            plan_tier: "pro".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct RouterSuggestion {
    pub provider: Provider,
    pub model: String,
    pub reason: String,
}

pub struct LLMRouter {
    providers: HashMap<Provider, Box<dyn LLMProvider>>,
    default_provider: Provider,
    cost_calculator: CostCalculator,
    cache_manager: Option<CacheManager>,
    db_connection: Option<Arc<Mutex<Connection>>>,
}

impl Default for LLMRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl LLMRouter {
    pub fn suggest_for_context(&self, context: &RouterContext) -> RouterSuggestion {
        let normalized_intents: Vec<String> = context
            .intents
            .iter()
            .map(|intent| intent.to_lowercase())
            .collect();

        // For free and hobby plans, prefer ultra-cheap models
        let is_budget_plan = matches!(context.plan_tier.as_str(), "free" | "hobby");

        let mut provider = if is_budget_plan {
            Provider::Google // Gemini Flash is cheapest at $0.1/$0.4
        } else {
            Provider::OpenAI
        };
        let mut task_category = TaskCategory::Simple;
        let mut reason = if is_budget_plan {
            "Budget plan detected - routing to cheapest options (Gemini Flash or Claude Haiku)."
                .to_string()
        } else {
            "General developer chat - routing to balanced cost/quality model.".to_string()
        };

        if context.requires_vision {
            provider = Provider::Google;
            task_category = TaskCategory::Creative;
            reason =
                "Vision or multimodal content detected - routing to Google Gemini for multimodal reasoning."
                    .to_string();
        } else if normalized_intents
            .iter()
            .any(|intent| matches!(intent.as_str(), "creative" | "generate" | "design" | "art"))
        {
            provider = Provider::Google;
            task_category = TaskCategory::Creative;
            reason =
                "Creative or generation task detected - routing to Google Gemini for creative capabilities."
                    .to_string();
        } else if normalized_intents.iter().any(|intent| {
            matches!(
                intent.as_str(),
                "code" | "devops" | "repo" | "terminal" | "automation" | "build" | "test"
            )
        }) {
            if is_budget_plan {
                // Budget plans use local Llama for complex tasks instead of paid Claude
                provider = Provider::Ollama;
                task_category = TaskCategory::Simple;
                reason = "Developer workflow + budget plan - routing to local Llama 4.".to_string();
            } else {
                provider = Provider::Anthropic;
                task_category = TaskCategory::Complex;
                reason =
                    "Developer or automation workflow detected - routing to Anthropic Claude for deep reasoning."
                        .to_string();
            }
        } else if normalized_intents
            .iter()
            .any(|intent| matches!(intent.as_str(), "writing" | "research"))
        {
            provider = if is_budget_plan {
                Provider::Google // Use Gemini Flash
            } else {
                Provider::OpenAI
            };
            task_category = TaskCategory::Complex;
            reason = if is_budget_plan {
                "Writing/research + budget plan - routing to affordable Gemini.".to_string()
            } else {
                "Writing or research task detected - routing to OpenAI GPT for quality output."
                    .to_string()
            };
        } else if context.cost_priority == CostPriority::Low || is_budget_plan {
            provider = Provider::Ollama;
            task_category = TaskCategory::Simple;
            reason = "Cost priority is low - routing to local Ollama model for inexpensive loops."
                .to_string();
        }

        if context.token_estimate > 12_000 && provider == Provider::OpenAI && !is_budget_plan {
            task_category = TaskCategory::Complex;
            reason = format!(
                "{} Large context (~{} tokens) detected - upgrading to GPT-4o.",
                reason, context.token_estimate
            );
        }

        self.prepare_context_suggestion(provider, task_category, reason)
    }

    fn prepare_context_suggestion(
        &self,
        preferred: Provider,
        task_category: TaskCategory,
        mut reason: String,
    ) -> RouterSuggestion {
        if self.has_provider(preferred) {
            let model = self.default_model(preferred, task_category);
            return RouterSuggestion {
                provider: preferred,
                model,
                reason,
            };
        }

        let fallback_order = [
            self.default_provider,
            Provider::Anthropic,
            Provider::OpenAI,
            Provider::Google,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Mistral,
            Provider::Moonshot,
            Provider::Ollama,
            Provider::XAI,
        ];

        for fallback in fallback_order {
            if self.has_provider(fallback) {
                if fallback != preferred {
                    reason = format!(
                        "{} ({} unavailable, falling back to {})",
                        reason,
                        preferred.as_string(),
                        fallback.as_string()
                    );
                }
                let model = self.default_model(fallback, task_category);
                return RouterSuggestion {
                    provider: fallback,
                    model,
                    reason,
                };
            }
        }

        RouterSuggestion {
            provider: preferred,
            model: self.default_model(preferred, task_category),
            reason,
        }
    }

    pub fn new() -> Self {
        Self {
            providers: HashMap::new(),
            default_provider: Provider::OpenAI,
            cost_calculator: CostCalculator::new(),
            cache_manager: None,
            db_connection: None,
        }
    }

    pub fn set_cache(
        &mut self,
        cache_manager: CacheManager,
        db_connection: Arc<Mutex<Connection>>,
    ) {
        self.cache_manager = Some(cache_manager);
        self.db_connection = Some(db_connection);
    }

    pub fn set_default_provider(&mut self, provider: Provider) {
        self.default_provider = provider;
    }

    pub fn set_provider(&mut self, provider: Provider, instance: Box<dyn LLMProvider>) {
        self.providers.insert(provider, instance);
    }

    pub fn set_openai(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::OpenAI, provider);
    }

    pub fn set_anthropic(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Anthropic, provider);
    }

    pub fn set_google(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Google, provider);
    }

    pub fn set_ollama(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Ollama, provider);
    }

    pub fn set_xai(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::XAI, provider);
    }

    pub fn set_deepseek(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::DeepSeek, provider);
    }

    pub fn set_qwen(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Qwen, provider);
    }

    pub fn set_mistral(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Mistral, provider);
    }

    pub fn set_moonshot(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Moonshot, provider);
    }

    pub fn set_managed_cloud(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::ManagedCloud, provider);
    }

    pub fn has_provider(&self, provider: Provider) -> bool {
        self.providers
            .get(&provider)
            .map(|p| p.is_configured())
            .unwrap_or(false)
    }

    pub fn candidates(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
    ) -> Vec<RouteCandidate> {
        let mut order = Vec::new();
        let _user_specified_provider = preferences.provider.is_some();

        if let Some(preferred) = preferences.provider {
            if self.has_provider(preferred) {
                order.push(RouteCandidate {
                    provider: preferred,
                    model: preferences
                        .model
                        .clone()
                        .unwrap_or_else(|| self.default_model(preferred, TaskCategory::Simple)),
                    reason: "user-preference",
                });
            }

            return order;
        }

        // If user prefers cloud credits and ManagedCloud is available, prioritize it
        if preferences.prefer_cloud_credits && self.has_provider(Provider::ManagedCloud) {
            let task_type = classify_request(request);
            order.push(RouteCandidate {
                provider: Provider::ManagedCloud,
                model: self.default_model(Provider::ManagedCloud, task_type),
                reason: "cloud-credits-preference",
            });
        }

        if let Some(context) = &preferences.context {
            let suggestion = self.suggest_for_context(context);
            // Don't override ManagedCloud if it was already added
            if !order
                .iter()
                .any(|existing| existing.provider == suggestion.provider)
            {
                order.push(RouteCandidate {
                    provider: suggestion.provider,
                    model: suggestion.model,
                    reason: "context-signal",
                });
            }
        }

        let task_type = classify_request(request);
        let mut strategy_set = self.strategy_order(task_type, preferences.strategy);

        for candidate in strategy_set.drain(..) {
            if order
                .iter()
                .any(|existing| existing.provider == candidate.provider)
            {
                continue;
            }
            if self.has_provider(candidate.provider) {
                order.push(candidate);
            }
        }

        if !order.iter().any(|c| c.provider == self.default_provider)
            && self.has_provider(self.default_provider)
        {
            order.push(RouteCandidate {
                provider: self.default_provider,
                model: self.default_model(self.default_provider, task_type),
                reason: "default-provider",
            });
        }

        for provider in [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Mistral,
            Provider::Moonshot,
            Provider::ManagedCloud,
        ] {
            if order.iter().any(|c| c.provider == provider) {
                continue;
            }
            if self.has_provider(provider) {
                order.push(RouteCandidate {
                    provider,
                    model: self.default_model(provider, task_type),
                    reason: "fallback",
                });
            }
        }

        order
    }

    pub async fn invoke_candidate(
        &self,
        candidate: &RouteCandidate,
        request: &LLMRequest,
    ) -> Result<RouteOutcome> {
        if let (Some(cache_manager), Some(db_conn)) = (&self.cache_manager, &self.db_connection) {
            let cache_key = CacheManager::compute_cache_key(
                candidate.provider,
                &candidate.model,
                &request.messages,
                request.temperature,
                request.max_tokens,
            );

            if let Ok(conn) = db_conn.lock() {
                if let Ok(Some(cached_entry)) = cache_manager.fetch(&conn, &cache_key) {
                    if let Ok(cached_response) =
                        serde_json::from_str::<LLMResponse>(&cached_entry.response)
                    {
                        let prompt_tokens = cached_response.prompt_tokens.unwrap_or(0);
                        let completion_tokens = cached_response.completion_tokens.unwrap_or(0);
                        let cost = cached_response.cost.unwrap_or(0.0);

                        let _ = cache_manager.update_cache_hit(
                            &conn,
                            &cache_key,
                            prompt_tokens + completion_tokens,
                            cost,
                        );

                        tracing::info!(
                            "Cache hit for {}/{} - saved {} tokens, ${:.4}",
                            candidate.provider.as_string(),
                            candidate.model,
                            prompt_tokens + completion_tokens,
                            cost
                        );

                        let mut response = cached_response;
                        response.cached = true;

                        return Ok(RouteOutcome {
                            provider: candidate.provider,
                            model: response.model.clone(),
                            response,
                            prompt_tokens,
                            completion_tokens,
                            cost,
                        });
                    }
                }
            }
        }

        let provider = self
            .providers
            .get(&candidate.provider)
            .ok_or_else(|| anyhow!("Provider {:?} not configured", candidate.provider))?;

        let mut routed_request = request.clone();
        routed_request.model = candidate.model.clone();

        let mut response = provider
            .send_message(&routed_request)
            .await
            .map_err(|e| anyhow!(e.to_string()))?;
        if response.model.is_empty() {
            response.model = candidate.model.clone();
        }

        let (prompt_tokens, completion_tokens) =
            match (response.prompt_tokens, response.completion_tokens) {
                (Some(input), Some(output)) => (input, output),
                _ => TokenCounter::estimate_for_provider(
                    candidate.provider,
                    &routed_request.messages,
                    &response.content,
                ),
            };

        let total_tokens = response.tokens.unwrap_or(prompt_tokens + completion_tokens);
        response.tokens = Some(total_tokens);
        response.prompt_tokens = Some(prompt_tokens);
        response.completion_tokens = Some(completion_tokens);

        if response.cost.is_none() {
            let cost = self.cost_calculator.calculate(
                candidate.provider,
                &response.model,
                prompt_tokens,
                completion_tokens,
            );
            response.cost = Some(cost);
        }

        let total_cost = response.cost.unwrap_or(0.0);

        if let (Some(cache_manager), Some(db_conn)) = (&self.cache_manager, &self.db_connection) {
            if let Ok(conn) = db_conn.lock() {
                let cache_key = CacheManager::compute_cache_key(
                    candidate.provider,
                    &candidate.model,
                    &request.messages,
                    request.temperature,
                    request.max_tokens,
                );

                let prompt_hash = CacheManager::compute_hash(&request.messages);
                let expires_at = cache_manager.temperature_aware_expiry(request.temperature);

                if let Ok(response_json) = serde_json::to_string(&response) {
                    let cache_record = crate::core::router::cache_manager::CacheRecord {
                        cache_key: &cache_key,
                        provider: candidate.provider,
                        model: &candidate.model,
                        prompt_hash: &prompt_hash,
                        response: &response_json,
                        tokens: Some(total_tokens),
                        cost: Some(total_cost),
                        temperature: request.temperature,
                        max_tokens: request.max_tokens,
                        expires_at,
                    };

                    if let Err(e) = cache_manager.upsert(&conn, cache_record) {
                        tracing::warn!("Failed to cache LLM response: {}", e);
                    } else {
                        tracing::debug!(
                            "Cached response for {}/{} (expires: {})",
                            candidate.provider.as_string(),
                            candidate.model,
                            expires_at
                        );
                    }
                }
            }
        }

        Ok(RouteOutcome {
            provider: candidate.provider,
            model: response.model.clone(),
            response,
            prompt_tokens,
            completion_tokens,
            cost: total_cost,
        })
    }

    /// Invoke a candidate with retry logic and exponential backoff
    pub async fn invoke_with_retry(
        &self,
        candidate: &RouteCandidate,
        request: &LLMRequest,
        retry_config: &RetryConfig,
    ) -> Result<RouteOutcome> {
        let mut last_error: Option<anyhow::Error> = None;

        for attempt in 0..=retry_config.max_retries {
            match self.invoke_candidate(candidate, request).await {
                Ok(outcome) => return Ok(outcome),
                Err(e) => {
                    let error_str = e.to_string();
                    let is_retryable = is_retryable_error(&error_str);

                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        attempt = attempt + 1,
                        max_retries = retry_config.max_retries,
                        is_retryable = is_retryable,
                        error = %error_str,
                        "LLM request failed"
                    );

                    if !is_retryable || attempt == retry_config.max_retries {
                        last_error = Some(e);
                        break;
                    }

                    let delay = calculate_backoff_delay(attempt, retry_config);
                    tracing::info!(
                        delay_ms = delay.as_millis() as u64,
                        "Retrying after backoff delay"
                    );
                    sleep(delay).await;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("Request failed after retries")))
    }

    /// Route a request with retry logic and fallback to other candidates
    pub async fn route_with_retry(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
        retry_config: Option<RetryConfig>,
    ) -> Result<RouteOutcome> {
        let config = retry_config.unwrap_or_default();
        let candidates = self.candidates(request, preferences);

        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        let max_candidates = if config.try_fallback_candidates {
            candidates.len()
        } else {
            1
        };

        let mut last_error: Option<anyhow::Error> = None;

        for (idx, candidate) in candidates.iter().take(max_candidates).enumerate() {
            tracing::info!(
                provider = %candidate.provider.as_string(),
                model = %candidate.model,
                candidate_index = idx,
                total_candidates = candidates.len(),
                "Attempting LLM request"
            );

            match self.invoke_with_retry(candidate, request, &config).await {
                Ok(outcome) => {
                    if idx > 0 {
                        tracing::info!(
                            provider = %outcome.provider.as_string(),
                            model = %outcome.model,
                            fallback_index = idx,
                            "Request succeeded with fallback provider"
                        );
                    }
                    return Ok(outcome);
                }
                Err(e) => {
                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        error = %e,
                        "Candidate exhausted after retries, trying next candidate"
                    );
                    last_error = Some(e);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("All LLM providers failed")))
    }

    fn strategy_order(&self, task: TaskCategory, strategy: RoutingStrategy) -> Vec<RouteCandidate> {
        match strategy {
            RoutingStrategy::LocalFirst => {
                vec![RouteCandidate {
                    provider: Provider::Ollama,
                    model: "llama3".to_string(),
                    reason: "strategy-local-first",
                }]
            }
            RoutingStrategy::CostOptimized => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        provider: Provider::Ollama,
                        model: "llama3".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-flash".to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Complex => vec![
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::Anthropic,
                        model: "claude-3-5-sonnet-20241022".to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Creative => vec![
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-pro".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "strategy-cost",
                    },
                ],
            },
            RoutingStrategy::LatencyOptimized => vec![
                RouteCandidate {
                    provider: Provider::OpenAI,
                    model: "gpt-4o-mini".to_string(),
                    reason: "strategy-latency",
                },
                RouteCandidate {
                    provider: Provider::Google,
                    model: "gemini-1.5-flash".to_string(),
                    reason: "strategy-latency",
                },
            ],
            RoutingStrategy::Auto => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "task-simple",
                    },
                    RouteCandidate {
                        provider: Provider::Anthropic,
                        model: "claude-3-5-haiku-20241022".to_string(),
                        reason: "task-simple",
                    },
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-flash".to_string(),
                        reason: "task-simple",
                    },
                ],
                TaskCategory::Complex => vec![
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o".to_string(),
                        reason: "task-complex",
                    },
                    RouteCandidate {
                        provider: Provider::Anthropic,
                        model: "claude-3-5-sonnet-20241022".to_string(),
                        reason: "task-complex",
                    },
                ],
                TaskCategory::Creative => vec![
                    RouteCandidate {
                        provider: Provider::Google,
                        model: "gemini-1.5-pro".to_string(),
                        reason: "task-creative",
                    },
                    RouteCandidate {
                        provider: Provider::OpenAI,
                        model: "gpt-4o-mini".to_string(),
                        reason: "task-creative",
                    },
                ],
            },
        }
    }

    fn default_model(&self, provider: Provider, task: TaskCategory) -> String {
        match provider {
            Provider::OpenAI => match task {
                TaskCategory::Simple => "gpt-4o-mini".to_string(),
                TaskCategory::Complex => "gpt-4o".to_string(),
                TaskCategory::Creative => "gpt-4o-mini".to_string(),
            },
            Provider::Anthropic => match task {
                TaskCategory::Simple => "claude-3-5-haiku-20241022".to_string(),
                TaskCategory::Complex => "claude-3-5-sonnet-20241022".to_string(),
                TaskCategory::Creative => "claude-3-5-sonnet-20241022".to_string(),
            },
            Provider::Google => match task {
                TaskCategory::Simple => "gemini-1.5-flash".to_string(),
                TaskCategory::Complex => "gemini-1.5-pro".to_string(),
                TaskCategory::Creative => "gemini-1.5-pro".to_string(),
            },
            Provider::Ollama => "llama3".to_string(),
            Provider::XAI => match task {
                TaskCategory::Simple => "grok-3".to_string(),
                TaskCategory::Complex => "grok-4".to_string(),
                TaskCategory::Creative => "grok-4".to_string(),
            },
            Provider::DeepSeek => match task {
                TaskCategory::Simple => "deepseek-chat".to_string(),
                TaskCategory::Complex => "deepseek-reasoner".to_string(),
                TaskCategory::Creative => "deepseek-chat".to_string(),
            },
            Provider::Qwen => match task {
                TaskCategory::Simple => "qwen-max-2025-01-25".to_string(),
                TaskCategory::Complex => "qwen-max-2025-01-25".to_string(),
                TaskCategory::Creative => "qwen-max-2025-01-25".to_string(),
            },
            Provider::Mistral => match task {
                TaskCategory::Simple => "mistral-large-2".to_string(),
                TaskCategory::Complex => "mistral-large-2".to_string(),
                TaskCategory::Creative => "mistral-large-2".to_string(),
            },
            Provider::Moonshot => match task {
                TaskCategory::Simple => "kimi-k2-thinking".to_string(),
                TaskCategory::Complex => "kimi-k2-thinking".to_string(),
                TaskCategory::Creative => "kimi-k2-thinking".to_string(),
            },
            Provider::ManagedCloud => match task {
                TaskCategory::Simple => "gpt-5-mini".to_string(),
                TaskCategory::Complex => "gpt-5".to_string(),
                TaskCategory::Creative => "gpt-5".to_string(),
            },
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TaskCategory {
    Simple,
    Complex,
    Creative,
}

fn classify_request(request: &LLMRequest) -> TaskCategory {
    let last_user_message = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role.eq_ignore_ascii_case("user"));

    if let Some(message) = last_user_message {
        let content = message.content.to_lowercase();
        if content.contains("code") || content.contains("function") || content.contains("debug") {
            return TaskCategory::Complex;
        }

        if content.contains("design")
            || content.contains("story")
            || content.contains("creative")
            || content.contains("write a poem")
        {
            return TaskCategory::Creative;
        }

        if content.contains("analyze") || content.contains("plan") || content.contains("reason") {
            return TaskCategory::Complex;
        }
    }

    TaskCategory::Simple
}

impl LLMRouter {
    pub async fn send_message(
        &self,
        prompt: &str,
        preferences: Option<RouterPreferences>,
    ) -> Result<String> {
        let prefs = preferences.unwrap_or_default();
        let request = LLMRequest {
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
                tool_calls: None,
                tool_call_id: None,
                multimodal_content: None,
            }],
            model: "".to_string(),
            temperature: Some(0.7),
            max_tokens: Some(4000),
            stream: false,
            tools: None,
            tool_choice: None,
            thinking_mode: None,
        };

        let candidates = self.candidates(&request, &prefs);
        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        let outcome = self.invoke_candidate(&candidates[0], &request).await?;
        Ok(outcome.response.content)
    }

    pub async fn send_message_streaming(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
    ) -> Result<
        Pin<
            Box<
                dyn Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>>
                    + Send,
            >,
        >,
    > {
        let candidates = self.candidates(request, preferences);
        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        let candidate = &candidates[0];
        let provider = self
            .providers
            .get(&candidate.provider)
            .ok_or_else(|| anyhow!("Provider {:?} not configured", candidate.provider))?;

        let mut routed_request = request.clone();
        routed_request.model = candidate.model.clone();
        routed_request.stream = true;

        tracing::info!(
            "Starting streaming request to {} with model {}",
            provider.name(),
            candidate.model
        );

        provider
            .send_message_streaming(&routed_request)
            .await
            .map_err(|e| anyhow!(e.to_string()))
    }
}
