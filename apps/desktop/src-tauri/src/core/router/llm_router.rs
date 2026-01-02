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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum RoutingStrategy {
    #[default]
    Auto, // Legacy - maps to AutoBalanced for backward compatibility
    #[serde(rename = "auto-economy")]
    AutoEconomy, // Cost-optimized: Best value models (Hobby plan)
    #[serde(rename = "auto-balanced")]
    AutoBalanced, // Quality/cost balance: Balanced models (Pro plan)
    #[serde(rename = "auto-premium")]
    AutoPremium, // Performance-optimized: Best models (Max plan)
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
    pub strategy: Option<RoutingStrategy>,
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
            Provider::DeepSeek // DeepSeek V3 is best value
        } else {
            Provider::Google // Gemini 3 Pro is best balanced/quality
        };
        let mut task_category = TaskCategory::Simple;
        let mut reason = if is_budget_plan {
            "Budget plan detected - routing to best value options (DeepSeek or Gemini Flash)."
                .to_string()
        } else {
            "General developer chat - routing to balanced cost/quality model.".to_string()
        };

        if context.requires_vision {
            provider = Provider::Google;
            task_category = TaskCategory::Creative;
            reason =
                "Vision or multimodal content detected - routing to Google Gemini for multimodal capabilities."
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
                // Budget plans use affordable models
                provider = Provider::DeepSeek; // DeepSeek V3 is excellent for code
                task_category = TaskCategory::Complex;
                reason = "Developer workflow + budget plan - routing to DeepSeek V3.".to_string();
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
            provider = Provider::DeepSeek; // Use DeepSeek for low cost high quality
            task_category = TaskCategory::Simple;
            reason = "Cost priority is low - routing to affordable DeepSeek for efficient loops."
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
            Provider::ManagedCloud,
            Provider::Anthropic,
            Provider::OpenAI,
            Provider::Google,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
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
                    strategy: None,
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
        // BUT skip this if we are using an Auto strategy, as the strategy itself will handle
        // ManagedCloud selection with better model specificity (e.g. AutoEconomy -> deepseek-v3)
        let is_auto_strategy = matches!(
            preferences.strategy,
            RoutingStrategy::Auto
                | RoutingStrategy::AutoEconomy
                | RoutingStrategy::AutoBalanced
                | RoutingStrategy::AutoPremium
        );

        if preferences.prefer_cloud_credits
            && self.has_provider(Provider::ManagedCloud)
            && !is_auto_strategy
        {
            let task_type = classify_request(request);
            order.push(RouteCandidate {
                strategy: None,
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
                    strategy: None,
                    provider: suggestion.provider,
                    model: suggestion.model,
                    reason: "context-signal",
                });
            }
        }

        let task_type = classify_request(request);
        let plan_tier = preferences.context.as_ref().map(|c| c.plan_tier.as_str());
        let mut strategy_set = self.strategy_order(task_type, preferences.strategy, plan_tier);

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
                strategy: None,
                provider: self.default_provider,
                model: self.default_model(self.default_provider, task_type),
                reason: "default-provider",
            });
        }

        for provider in [
            Provider::ManagedCloud,
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
        ] {
            if order.iter().any(|c| c.provider == provider) {
                continue;
            }
            if self.has_provider(provider) {
                order.push(RouteCandidate {
                    strategy: None,
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

        // Handle dynamic model resolution based on strategy
        if let Some(strategy) = candidate.strategy {
            let token_count = TokenCounter::estimate_prompt_tokens(&request.messages);

            // Resolve logic based on strategy and tokens
            let resolved_model = match strategy {
                RoutingStrategy::AutoEconomy => {
                    // Cost-optimized: simple queries use cheap models, complex use capable
                    if token_count < 1000 {
                        "gpt-4o-mini" // Cheap, fast, capable enough for short contexts
                    } else if token_count < 8000 {
                        "deepseek-v3.2" // Best value for medium context
                    } else {
                        "gemini-3-flash" // Long context value
                    }
                }
                RoutingStrategy::AutoBalanced => {
                    // Balance: gpt-4o-mini for very simple, claude-3.5-sonnet/gpt-4o for complex
                    if token_count < 500 {
                        "gpt-4o-mini"
                    } else if token_count < 4000 {
                        "claude-3-5-sonnet-20240620"
                    } else {
                        "gpt-4o"
                    }
                }
                RoutingStrategy::AutoPremium => {
                    // Premium: Always best models, switch based on context window needs
                    if token_count < 16000 {
                        "claude-3-5-sonnet-20240620"
                    } else {
                        "claude-3-opus-20240229" // Opus for heavy lifting, or Gemini 1.5 Pro for massive context
                    }
                }
                _ => candidate.model.as_str(),
            };

            tracing::info!(
                "Dynamic Routing [Strategy: {:?}] [Tokens: {}] -> Selected: {}",
                strategy,
                token_count,
                resolved_model
            );

            routed_request.model = resolved_model.to_string();
        } else if candidate.model == "auto" {
            // Check if strategy is somehow missing but model is auto (fallback)
            // Use a safe default
            routed_request.model = "gpt-4o".to_string();
        } else {
            routed_request.model = candidate.model.clone();
        }

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

    #[allow(clippy::only_used_in_recursion)]
    fn strategy_order(
        &self,
        task: TaskCategory,
        strategy: RoutingStrategy,
        plan_tier: Option<&str>,
    ) -> Vec<RouteCandidate> {
        match strategy {
            RoutingStrategy::LocalFirst => {
                // LocalFirst strategy removed - use ManagedCloud or cloud providers instead
                vec![RouteCandidate {
                    strategy: None,
                    provider: Provider::ManagedCloud,
                    model: "managed-cloud-auto".to_string(),
                    reason: "strategy-cloud-first",
                }]
            }
            RoutingStrategy::CostOptimized => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Google,
                        model: "gemini-3-flash".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::OpenAI,
                        model: "gpt-5-nano".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::ManagedCloud,
                        model: "managed-cloud-auto".to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Complex => vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::OpenAI,
                        model: "gpt-5.2".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Anthropic,
                        model: "claude-sonnet-4-5".to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Creative => vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Google,
                        model: "gemini-3-pro".to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::OpenAI,
                        model: "gpt-5-nano".to_string(),
                        reason: "strategy-cost",
                    },
                ],
            },
            RoutingStrategy::LatencyOptimized => vec![
                RouteCandidate {
                    strategy: None,
                    provider: Provider::OpenAI,
                    model: "gpt-5-nano".to_string(),
                    reason: "strategy-latency",
                },
                RouteCandidate {
                    strategy: None,
                    provider: Provider::Google,
                    model: "gemini-3-flash".to_string(),
                    reason: "strategy-latency",
                },
            ],
            RoutingStrategy::Auto => {
                // Auto maps to different strategies based on plan tier
                let strategy =
                    if matches!(plan_tier, Some("free") | Some("hobby") | Some("standard")) {
                        RoutingStrategy::AutoEconomy
                    } else if matches!(plan_tier, Some("pro") | Some("professional")) {
                        RoutingStrategy::AutoBalanced
                    } else {
                        RoutingStrategy::AutoPremium
                    };
                self.strategy_order(task, strategy, plan_tier)
            }
            RoutingStrategy::AutoEconomy => {
                // AutoEconomy: Cost-optimized routing - Best value models ranked by cost efficiency
                // Focuses on maximum tokens per dollar (Hobby plan models)
                match task {
                    TaskCategory::Simple => {
                        vec![
                            // Dynamic Economy Strategy
                            RouteCandidate {
                                strategy: Some(RoutingStrategy::AutoEconomy),
                                provider: Provider::ManagedCloud,
                                model: "auto-economy".to_string(),
                                reason: "auto-economy-dynamic",
                            },
                            // Fallbacks
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "deepseek-v3.2".to_string(), // Managed Cloud supports DeepSeek V3 ($0.28/1M)
                                reason: "auto-economy-best-value-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3.2".to_string(), // Best cost efficiency: $0.28/1M, 73.1% SWE-bench
                                reason: "auto-economy-best-value",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-flash".to_string(), // Best value: 3,307 Elo/$, $0.375/1M
                                reason: "auto-economy-best-chat-value",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(), // Fallback
                                reason: "auto-economy-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-haiku-4-5".to_string(),
                                reason: "auto-economy-quality",
                            },
                        ]
                    }
                    TaskCategory::Complex => {
                        vec![
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "deepseek-v3".to_string(), // Managed Cloud supports DeepSeek V3 ($0.28/1M)
                                reason: "auto-economy-best-value-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3".to_string(), // Best cost efficiency: $0.28/1M, 73.1% SWE-bench, 87.5% AIME
                                reason: "auto-economy-best-value",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-flash".to_string(), // Best value: 3,307 Elo/$
                                reason: "auto-economy",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "grok-4.1-fast-reasoning".to_string(), // Managed Cloud Reasoning
                                reason: "auto-economy-xai-reasoning-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast-reasoning".to_string(), // Reasoning variant: $0.50/1M, ~1230 Elo, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-economy-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast".to_string(), // $0.50/1M, ~1230 Elo, 2M context (non-reasoning)
                                reason: "auto-economy-xai",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-3-mini".to_string(), // General purpose: $0.80/1M (legacy)
                                reason: "auto-economy-xai-legacy",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-haiku-4-5".to_string(), // Best quality/price: 208 Elo/$
                                reason: "auto-economy",
                            },
                        ]
                    }
                    TaskCategory::Creative => {
                        vec![
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-flash".to_string(), // Best value, multimodal: 3,307 Elo/$
                                reason: "auto-economy",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "deepseek-v3".to_string(), // Managed Cloud supports DeepSeek V3 ($0.28/1M)
                                reason: "auto-economy-deepseek-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3".to_string(), // Best cost efficiency: $0.28/1M
                                reason: "auto-economy-deepseek",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "gpt-5-nano".to_string(), // Managed Cloud fallback
                                reason: "auto-economy-fast-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5-nano".to_string(), // Fast budget: 2,667 Elo/$
                                reason: "auto-economy",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast-reasoning".to_string(), // Reasoning variant: $0.50/1M, ~1230 Elo, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-economy-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast".to_string(), // $0.50/1M, ~1230 Elo, 2M context (non-reasoning)
                                reason: "auto-economy-xai",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-3-mini".to_string(), // General purpose: $0.80/1M (legacy)
                                reason: "auto-economy-xai-legacy",
                            },
                        ]
                    }
                }
            }
            RoutingStrategy::AutoBalanced => {
                // AutoBalanced: Quality/cost balance - Balanced models (Pro plan focus)
                // Best quality per dollar with good performance
                //
                // Reasoning Model Priority (December 2025):
                // When same provider offers reasoning and non-reasoning at same price, prioritize reasoning.
                // Example: grok-4.1-fast-reasoning ($0.50/1M) over grok-4.1-fast ($0.50/1M)
                match task {
                    TaskCategory::Simple => {
                        vec![
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(),
                                reason: "auto-balanced-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro".to_string(), // Best chat: 1501 Elo, best reasoning
                                reason: "auto-balanced-best-quality",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-sonnet-4-5".to_string(),
                                reason: "auto-balanced-sonnet",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Moonshot,
                                model: "kimi-k2-thinking".to_string(),
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3.2".to_string(),
                                reason: "auto-balanced-deepseek",
                            },
                        ]
                    }
                    TaskCategory::Complex => {
                        vec![
                            RouteCandidate {
                                strategy: Some(RoutingStrategy::AutoBalanced),
                                provider: Provider::ManagedCloud,
                                model: "auto-balanced".to_string(),
                                reason: "auto-balanced-dynamic",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-4o".to_string(),
                                reason: "auto-balanced-performance",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-sonnet-4-5".to_string(),
                                reason: "auto-balanced-performance",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(),
                                reason: "auto-balanced-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-sonnet-4-5".to_string(), // Excellent coding: 77.2% SWE-bench
                                reason: "auto-balanced-coding",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Moonshot,
                                model: "kimi-k2-thinking".to_string(), // Reasoning model: $7.50/1M, exceptional math: 99.1% AIME, 84.5% GPQA (prioritized over non-reasoning at same price)
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Qwen,
                                model: "qwen3-max".to_string(), // Reasoning model with thinking mode: $12.50/1M, best open-source coding: 69.6% SWE-bench, 92.1% HumanEval
                                reason: "auto-balanced-reasoning-coding",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro".to_string(), // Best chat: 1501 Elo, best reasoning: 91.9% GPQA ($7.50/1M)
                                reason: "auto-balanced",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2".to_string(), // Fast inference: 187 tok/s, 76.3% SWE-bench, 88.1% GPQA
                                reason: "auto-balanced",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast-reasoning".to_string(), // Reasoning variant: Fast, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-balanced-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast".to_string(), // Fast, 2M context (non-reasoning)
                                reason: "auto-balanced-xai",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3".to_string(), // Best cost efficiency: $0.28/1M
                                reason: "auto-balanced-deepseek",
                            },
                        ]
                    }
                    TaskCategory::Creative => {
                        vec![
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(),
                                reason: "auto-balanced-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Moonshot,
                                model: "kimi-k2-thinking".to_string(), // Reasoning model: $7.50/1M, exceptional math: 99.1% AIME, 84.5% GPQA (prioritized over non-reasoning at same price)
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Qwen,
                                model: "qwen3-max".to_string(), // Reasoning model with thinking mode: $12.50/1M
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro".to_string(), // Best chat: 1501 Elo, best reasoning: 91.9% GPQA, multimodal ($7.50/1M)
                                reason: "auto-balanced",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2".to_string(), // Fast inference: 187 tok/s, 88.1% GPQA
                                reason: "auto-balanced",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-sonnet-4-5".to_string(), // Excellent coding: 77.2% SWE-bench
                                reason: "auto-balanced",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast-reasoning".to_string(), // Reasoning variant: Fast, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-balanced-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1-fast".to_string(), // Fast, 2M context (non-reasoning)
                                reason: "auto-balanced-xai",
                            },
                        ]
                    }
                }
            }
            RoutingStrategy::AutoPremium => {
                // AutoPremium: Performance optimized - Best possible models regardless of cost (Max plan)
                match task {
                    TaskCategory::Simple => {
                        vec![
                            RouteCandidate {
                                strategy: Some(RoutingStrategy::AutoPremium),
                                provider: Provider::ManagedCloud,
                                model: "auto-premium".to_string(),
                                reason: "auto-premium-dynamic",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2".to_string(),
                                reason: "auto-premium-quality",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(),
                                reason: "auto-premium-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2-pro".to_string(), // Best all-around: 1325 Elo
                                reason: "auto-premium",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-opus-4-5".to_string(), // Best reasoning/coding
                                reason: "auto-premium",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro".to_string(), // Best multimodal
                                reason: "auto-premium",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4.1".to_string(),
                                reason: "auto-premium-xai",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3.2".to_string(),
                                reason: "auto-premium-deepseek", // Good backup
                            },
                        ]
                    }
                    TaskCategory::Complex => {
                        vec![
                            RouteCandidate {
                                strategy: Some(RoutingStrategy::AutoPremium),
                                provider: Provider::ManagedCloud,
                                model: "auto-premium".to_string(),
                                reason: "auto-premium-dynamic",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-opus-4-5".to_string(),
                                reason: "auto-premium-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(),
                                reason: "auto-premium-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-opus-4-5".to_string(), // Best coding: 80.9% SWE-bench
                                reason: "auto-premium-coding",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2-codex".to_string(), // Best code generation
                                reason: "auto-premium-coding",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "o3".to_string(), // Reasoning specialist
                                reason: "auto-premium-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro".to_string(),
                                reason: "auto-premium-complex",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-v3.2".to_string(), // Strong code reasoning
                                reason: "auto-premium-deepseek",
                            },
                        ]
                    }
                    TaskCategory::Creative => {
                        vec![
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "managed-cloud-auto".to_string(),
                                reason: "auto-premium-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro".to_string(), // Best multimodal/creative
                                reason: "auto-premium-creative",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2-pro".to_string(), // High creativity
                                reason: "auto-premium-creative",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-opus-4-5".to_string(),
                                reason: "auto-premium-creative",
                            },
                        ]
                    }
                }
            }
        }
    }

    /// Default model selection for each provider and task category.
    ///
    /// **Reasoning Model Priority (December 2025):**
    /// When a provider offers both reasoning and non-reasoning variants at the same price,
    /// we prioritize the reasoning variant to get better capabilities without additional cost.
    ///
    /// **Confirmed Same-Price Reasoning Variants (December 2025):**
    /// - **xAI**: `grok-4.1-fast-reasoning` ($0.50/1M) prioritized over `grok-4.1-fast` ($0.50/1M)
    ///
    /// **Other Providers Checked:**
    /// - **Qwen**: `qwen3-max` has thinking mode built-in (always reasoning, no separate non-reasoning variant)
    /// - **OpenAI**: GPT-5.2 "thinking" mode mentioned but separate model ID not confirmed at same price
    /// - **DeepSeek**: V3.2-Exp Reasoner mentioned but model ID not in current codebase
    /// - **Anthropic**: Reasoning variants (Opus) priced higher than non-reasoning (Sonnet)
    /// - **Google**: Reasoning variants (Deep Think) priced higher than non-reasoning (Pro/Flash)
    fn default_model(&self, provider: Provider, task: TaskCategory) -> String {
        match provider {
            Provider::OpenAI => match task {
                TaskCategory::Simple => "gpt-5-nano".to_string(),
                TaskCategory::Complex => "gpt-5.2".to_string(),
                TaskCategory::Creative => "gpt-5-nano".to_string(),
            },
            Provider::Anthropic => match task {
                TaskCategory::Simple => "claude-haiku-4-5".to_string(),
                TaskCategory::Complex => "claude-sonnet-4-5".to_string(),
                TaskCategory::Creative => "claude-sonnet-4-5".to_string(),
            },
            Provider::Google => match task {
                TaskCategory::Simple => "gemini-3-flash".to_string(),
                TaskCategory::Complex => "gemini-3-pro".to_string(),
                TaskCategory::Creative => "gemini-3-pro".to_string(),
            },
            Provider::Ollama => "llama4-maverick".to_string(),
            Provider::XAI => match task {
                // Prioritize reasoning variant when same price as non-reasoning (December 2025: Grok 4.1 Fast reasoning = $0.50/1M, same as non-reasoning)
                TaskCategory::Simple => "grok-4.1-fast-reasoning".to_string(), // Reasoning variant: $0.50/1M, 2M context (prioritized - same price as non-reasoning)
                TaskCategory::Complex => "grok-4.1".to_string(),
                TaskCategory::Creative => "grok-4.1".to_string(),
            },
            Provider::DeepSeek => match task {
                TaskCategory::Simple => "deepseek-v3.2".to_string(), // DeepSeek V3.2
                TaskCategory::Complex => "deepseek-v3.2".to_string(), // DeepSeek V3.2
                TaskCategory::Creative => "deepseek-v3.2".to_string(), // DeepSeek V3.2
            },
            Provider::Qwen => match task {
                TaskCategory::Simple => "qwen-max-2025-01-25".to_string(),
                TaskCategory::Complex => "qwen-max-2025-01-25".to_string(),
                TaskCategory::Creative => "qwen-max-2025-01-25".to_string(),
            },
            Provider::Moonshot => match task {
                TaskCategory::Simple => "kimi-k2-thinking".to_string(),
                TaskCategory::Complex => "kimi-k2-thinking".to_string(),
                TaskCategory::Creative => "kimi-k2-thinking".to_string(),
            },
            Provider::Perplexity => match task {
                TaskCategory::Simple => "sonar".to_string(),
                TaskCategory::Complex => "sonar-deep-research".to_string(),
                TaskCategory::Creative => "sonar-pro".to_string(),
            },
            Provider::ManagedCloud => match task {
                TaskCategory::Simple => "gpt-5-nano".to_string(),
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
