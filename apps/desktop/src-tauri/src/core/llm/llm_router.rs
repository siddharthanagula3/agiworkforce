use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Result};
use futures_util::Stream;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;

use crate::core::llm::cache_manager::CacheManager;
use crate::core::llm::cost_calculator::CostCalculator;
use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::token_counter::TokenCounter;
use crate::core::llm::{ChatMessage, LLMProvider, LLMRequest, LLMResponse, Provider};

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

/// Defense-in-depth session cost safety cap (USD).
///
/// Primary enforcement is in `AutonomousAgent` (`max_session_cost` from config, default $50).
/// This constant guards direct `route_with_retry()` callers (chat commands, background tasks)
/// that bypass `AutonomousAgent` entirely and would otherwise have no cost ceiling.
const SESSION_COST_SAFETY_CAP: f64 = 50.0;

/// Determines if an error is retryable (transient) or permanent
fn is_retryable_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();

    // Non-retryable: credit/billing/quota exhaustion errors (must be checked FIRST
    // to prevent false positives from substring matches like "connection" in
    // "connection to billing" or "try again" in "try again with a different payment")
    if error_lower.contains("402")
        || error_lower.contains("insufficient_quota")
        || error_lower.contains("insufficient credits")
        || error_lower.contains("billing")
        || error_lower.contains("payment_required")
        || error_lower.contains("quota_exceeded")
        || (error_lower.contains("credit") && error_lower.contains("exhaust"))
    {
        return false;
    }

    // Rate limiting errors - should retry with backoff
    if error_lower.contains("rate limit")
        || error_lower.contains("too many requests")
        || error_lower.contains("429")
    {
        return true;
    }

    // Temporary server errors - delegate to is_server_error to avoid duplication
    if is_server_error(error) {
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

/// Determine if an error indicates a server-side 5xx failure
fn is_server_error(error: &str) -> bool {
    let e = error.to_lowercase();
    e.contains("500")
        || e.contains("502")
        || e.contains("503")
        || e.contains("504")
        || e.contains("internal server error")
        || e.contains("bad gateway")
        || e.contains("service unavailable")
        || e.contains("gateway timeout")
}

/// Determine if an error indicates a 429 rate limit specifically.
/// Used to immediately skip to the next provider candidate instead of
/// retrying the same rate-limited provider with backoff.
fn is_rate_limit_error(error: &str) -> bool {
    let e = error.to_lowercase();
    e.contains("rate limit")
        || e.contains("too many requests")
        || e.contains("429")
        || e.contains("rate_limit_exceeded")
        || e.contains("tokens per min")
        || e.contains("requests per min")
        || e.contains("rpm limit")
        || e.contains("tpm limit")
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
    // Legacy fields (backward compatible)
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

    // New intelligent routing fields (January 2026)
    /// Primary classified intent type (chat, coding, image-gen, video-gen, search, etc.)
    #[serde(default)]
    pub intent_type: Option<String>,
    /// Model category for routing (chat, image, video, search, tts, stt, music)
    #[serde(default)]
    pub model_category: Option<String>,
    /// Selected model from TypeScript intelligent routing
    #[serde(default)]
    pub selected_model: Option<String>,
    /// Tool categories that should be available
    #[serde(default)]
    pub suggested_tool_categories: Option<Vec<String>>,
    /// Whether tools should auto-execute (full autonomy mode)
    #[serde(default)]
    pub auto_execute_tools: Option<bool>,
    /// Classification confidence (0-1)
    #[serde(default)]
    pub confidence: Option<f32>,
    /// Routing reasoning for debugging
    #[serde(default)]
    pub routing_reason: Option<String>,
}

impl Default for RouterContext {
    fn default() -> Self {
        Self {
            intents: Vec::new(),
            requires_vision: false,
            token_estimate: 0,
            cost_priority: CostPriority::Balanced,
            plan_tier: "pro".to_string(),
            intent_type: None,
            model_category: None,
            selected_model: None,
            suggested_tool_categories: None,
            auto_execute_tools: None,
            confidence: None,
            routing_reason: None,
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
    /// Cumulative cost across all LLM invocations in this session (USD).
    cumulative_cost: Arc<parking_lot::Mutex<f64>>,
    /// Optional rate-limit / 5xx circuit-breaker tracker shared with the fallback chain.
    rate_limit_tracker: Option<Arc<crate::core::llm::fallback_chain::RateLimitTracker>>,
}

impl Default for LLMRouter {
    fn default() -> Self {
        Self::new()
    }
}

impl LLMRouter {
    pub fn suggest_for_context(&self, context: &RouterContext) -> RouterSuggestion {
        // === INTELLIGENT ROUTING (January 2026) ===
        // If TypeScript has already selected a model via intelligent routing, use it directly
        if let Some(selected_model) = &context.selected_model {
            if !selected_model.is_empty() {
                let provider = self.infer_provider_from_model(selected_model);
                let reason = context
                    .routing_reason
                    .clone()
                    .unwrap_or_else(|| format!("Intelligent routing selected: {}", selected_model));

                tracing::info!(
                    "Using intelligent routing: model={}, provider={:?}, intent={:?}, confidence={:?}",
                    selected_model,
                    provider,
                    context.intent_type,
                    context.confidence
                );

                // Check if provider is available, otherwise fallback
                if self.has_provider(provider) {
                    return RouterSuggestion {
                        provider,
                        model: selected_model.clone(),
                        reason,
                    };
                }
                // Provider not available, fall through to legacy routing with intelligent context
            }
        }

        // Use intent_type for smarter routing if available
        if let Some(intent_type) = &context.intent_type {
            if let Some(suggestion) = self.route_by_intent_type(intent_type, context) {
                return suggestion;
            }
        }

        // === LEGACY ROUTING (fallback) ===
        let normalized_intents: Vec<String> = context
            .intents
            .iter()
            .map(|intent| intent.to_lowercase())
            .collect();

        // For free and hobby plans, prefer ultra-cheap models
        let is_budget_plan = matches!(context.plan_tier.as_str(), "free" | "hobby");

        let mut provider = if is_budget_plan {
            Provider::DeepSeek // DeepSeek Chat is best value
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
                provider = Provider::DeepSeek; // DeepSeek Chat is excellent for code
                task_category = TaskCategory::Complex;
                reason = "Developer workflow + budget plan - routing to DeepSeek Chat.".to_string();
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

    /// Route based on intent type from intelligent classification
    fn route_by_intent_type(
        &self,
        intent_type: &str,
        context: &RouterContext,
    ) -> Option<RouterSuggestion> {
        let is_budget_plan = matches!(context.plan_tier.as_str(), "free" | "hobby");

        let (provider, model, reason) = match intent_type {
            // === Search intents - route to Perplexity ===
            "search" => (
                Provider::Perplexity,
                "sonar".to_string(),
                "Search intent detected - routing to Perplexity Sonar for real-time web search."
                    .to_string(),
            ),
            "deep-research" => (
                Provider::Perplexity,
                "sonar-deep-research".to_string(),
                "Deep research intent detected - routing to Perplexity Sonar Deep Research."
                    .to_string(),
            ),

            // === Coding intent - route to best coding models ===
            "coding" => {
                if is_budget_plan {
                    (
                        Provider::DeepSeek,
                        "deepseek-chat".to_string(),
                        "Coding intent + budget plan - routing to DeepSeek Chat.2 (best coding value).".to_string(),
                    )
                } else {
                    (
                        Provider::Anthropic,
                        "claude-sonnet-4-5".to_string(),
                        "Coding intent detected - routing to Claude Sonnet 4.5 (excellent coding)."
                            .to_string(),
                    )
                }
            }

            // === Reasoning intent - route to reasoning specialists ===
            "reasoning" => {
                if is_budget_plan {
                    (
                        Provider::XAI,
                        "grok-4-fast-reasoning".to_string(),
                        "Reasoning intent + budget plan - routing to Grok 4 Fast Reasoning."
                            .to_string(),
                    )
                } else {
                    (
                        Provider::OpenAI,
                        "o3".to_string(),
                        "Reasoning intent detected - routing to OpenAI o3 (reasoning specialist)."
                            .to_string(),
                    )
                }
            }

            // === Agentic intent - route to capable models with tool use ===
            "agentic" => {
                if is_budget_plan {
                    (
                        Provider::Google,
                        "gemini-3-flash-preview".to_string(),
                        "Agentic intent + budget plan - routing to Gemini 3 Flash for tool use."
                            .to_string(),
                    )
                } else {
                    (
                        Provider::Anthropic,
                        "claude-sonnet-4-5".to_string(),
                        "Agentic intent detected - routing to Claude Sonnet 4.5 for tool orchestration.".to_string(),
                    )
                }
            }

            // === Multimodal intent - route to vision-capable models ===
            "multimodal" => (
                Provider::Google,
                if is_budget_plan {
                    "gemini-3-flash-preview".to_string()
                } else {
                    "gemini-3-pro-preview".to_string()
                },
                "Multimodal intent detected - routing to Google Gemini for vision capabilities."
                    .to_string(),
            ),

            // === Non-chat modalities (image, video, tts, stt, music) ===
            // These are handled by the TypeScript multiModalRouter with selected_model
            // If we reach here, fall back to chat model that can describe/plan the task
            "image-gen" | "video-gen" | "tts" | "stt" | "music" => {
                // These should have been handled by selected_model from TypeScript
                // Fall back to a chat model to explain the task
                return None;
            }

            // === Default chat intent ===
            _ => {
                if is_budget_plan {
                    (
                        Provider::Google,
                        "gemini-3-flash-preview".to_string(),
                        "Chat intent + budget plan - routing to Gemini 3 Flash.".to_string(),
                    )
                } else {
                    (
                        Provider::Google,
                        "gemini-3-pro-preview".to_string(),
                        "Chat intent detected - routing to Gemini 3 Pro.".to_string(),
                    )
                }
            }
        };

        // Check if provider is available
        if self.has_provider(provider) {
            Some(RouterSuggestion {
                provider,
                model,
                reason,
            })
        } else {
            // Try ManagedCloud as fallback
            if self.has_provider(Provider::ManagedCloud) {
                Some(RouterSuggestion {
                    provider: Provider::ManagedCloud,
                    model: model.clone(),
                    reason: format!("{} (via ManagedCloud)", reason),
                })
            } else {
                None // Fall through to legacy routing
            }
        }
    }

    /// Infer provider from model name for intelligent routing
    pub(crate) fn infer_provider_from_model(&self, model: &str) -> Provider {
        let model_lower = model.to_lowercase();

        // OpenAI models
        if model_lower.starts_with("gpt-")
            || model_lower.starts_with("o1")
            || model_lower.starts_with("o3")
            || model_lower.starts_with("dall-e")
            || model_lower.starts_with("tts-")
            || model_lower.starts_with("whisper")
        {
            return Provider::OpenAI;
        }

        // Anthropic models
        if model_lower.starts_with("claude") {
            return Provider::Anthropic;
        }

        // Google models
        if model_lower.starts_with("gemini") || model_lower.starts_with("imagen") {
            return Provider::Google;
        }

        // DeepSeek models
        if model_lower.starts_with("deepseek") {
            return Provider::DeepSeek;
        }

        // xAI models
        if model_lower.starts_with("grok") {
            return Provider::XAI;
        }

        // Perplexity models
        if model_lower.starts_with("sonar") {
            return Provider::Perplexity;
        }

        // Qwen models
        if model_lower.starts_with("qwen") || model_lower.starts_with("qwen3") {
            return Provider::Qwen;
        }

        // Moonshot/Kimi models
        if model_lower.starts_with("kimi") || model_lower.starts_with("moonshot") {
            return Provider::Moonshot;
        }

        // ZhipuAI/GLM models
        if model_lower.starts_with("glm") {
            return Provider::Zhipu;
        }

        // Flux models (via ManagedCloud)
        if model_lower.starts_with("flux") {
            return Provider::ManagedCloud;
        }

        // Default to ManagedCloud for unknown models
        Provider::ManagedCloud
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
            Provider::Zhipu,
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
            cumulative_cost: Arc::new(parking_lot::Mutex::new(0.0)),
            rate_limit_tracker: Some(Arc::new(
                crate::core::llm::fallback_chain::RateLimitTracker::new(Default::default()),
            )),
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

    pub fn set_zhipu(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Zhipu, provider);
    }

    pub fn set_perplexity(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Perplexity, provider);
    }

    pub fn set_managed_cloud(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::ManagedCloud, provider);
    }

    /// Get the cumulative cost (USD) across all LLM invocations in this session.
    pub fn get_cumulative_cost(&self) -> f64 {
        *self.cumulative_cost.lock()
    }

    /// Reset the cumulative cost counter to zero.
    pub fn reset_cumulative_cost(&self) {
        *self.cumulative_cost.lock() = 0.0;
    }

    /// Set a shared rate-limit / 5xx circuit-breaker tracker.
    pub fn set_rate_limit_tracker(
        &mut self,
        tracker: Arc<crate::core::llm::fallback_chain::RateLimitTracker>,
    ) {
        self.rate_limit_tracker = Some(tracker);
    }

    pub fn rate_limit_tracker(
        &self,
    ) -> Option<Arc<crate::core::llm::fallback_chain::RateLimitTracker>> {
        self.rate_limit_tracker.clone()
    }

    pub async fn is_provider_available(&self, provider: Provider) -> bool {
        match self.providers.get(&provider) {
            Some(instance) => instance.is_available().await,
            None => false,
        }
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
        // ManagedCloud selection with better model specificity (e.g. AutoEconomy -> deepseek-chat)
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
            Provider::Perplexity,
            Provider::Ollama,
            Provider::Zhipu,
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

            // H13 fix: delegate to shared helper to avoid copy-paste with streaming path
            let resolved_model =
                Self::resolve_model_for_strategy(strategy, token_count, &candidate.model);

            tracing::info!(
                "Dynamic Routing [Strategy: {:?}] [Tokens: {}] -> Selected: {}",
                strategy,
                token_count,
                resolved_model
            );

            routed_request.model = resolved_model;
        } else if candidate.model == "auto" {
            // Check if strategy is somehow missing but model is auto (fallback)
            // Use a safe default from the active model catalog.
            routed_request.model = "gpt-5.2".to_string();
        } else {
            routed_request.model = candidate.model.clone();
        }

        // Enforce output protocol to prevent XML/tool-tag leakage
        crate::core::llm::prompt_policy::apply_no_xml_rule(&mut routed_request);

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
                    let cache_record = crate::core::llm::cache_manager::CacheRecord {
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

        let outcome = RouteOutcome {
            provider: candidate.provider,
            model: response.model.clone(),
            response,
            prompt_tokens,
            completion_tokens,
            cost: total_cost,
        };

        // Accumulate cost for session-level cost cap enforcement
        let new_session_total = {
            let mut cost = self.cumulative_cost.lock();
            *cost += outcome.cost;
            *cost
        };

        // Defense-in-depth: hard-stop if the session cost safety cap is exceeded.
        // AutonomousAgent enforces configurable caps; this catches all other callers.
        if new_session_total > SESSION_COST_SAFETY_CAP {
            return Err(anyhow!(
                "Session cost safety cap exceeded: ${:.4} > ${:.2} limit. \
                 Reset the router to continue.",
                new_session_total,
                SESSION_COST_SAFETY_CAP
            ));
        }

        Ok(outcome)
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
                Ok(outcome) => {
                    if let Some(ref tracker) = self.rate_limit_tracker {
                        tracker.record_success(candidate.provider, Some(&candidate.model));
                    }
                    return Ok(outcome);
                }
                Err(e) => {
                    let error_str = e.to_string();
                    let is_retryable = is_retryable_error(&error_str);
                    let is_rate_limited = is_rate_limit_error(&error_str);

                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        attempt = attempt + 1,
                        max_retries = retry_config.max_retries,
                        is_retryable = is_retryable,
                        is_rate_limited = is_rate_limited,
                        error = %error_str,
                        "LLM request failed"
                    );

                    // 429 rate limit: record in tracker and break immediately
                    // to skip to the next provider candidate instead of wasting
                    // retries on a provider that told us to slow down.
                    if is_rate_limited {
                        if let Some(ref tracker) = self.rate_limit_tracker {
                            tracker.record_rate_limit(
                                candidate.provider,
                                Some(&candidate.model),
                                None,
                            );
                        }
                        last_error = Some(e);
                        break;
                    }

                    if !is_retryable || attempt == retry_config.max_retries {
                        // Record 5xx server errors in the circuit breaker
                        if is_server_error(&error_str) {
                            if let Some(ref tracker) = self.rate_limit_tracker {
                                tracker.record_server_error(
                                    candidate.provider,
                                    Some(&candidate.model),
                                );
                            }
                        }
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
        let raw_candidates = self.candidates(request, preferences);

        // Pre-filter: skip any provider whose is_available() returns false (e.g. Ollama when
        // the local server is unreachable), avoiding burning the full retry budget before falling
        // through to cloud providers.
        let mut candidates = Vec::with_capacity(raw_candidates.len());
        for c in raw_candidates {
            if let Some(provider) = self.providers.get(&c.provider) {
                if !provider.is_available().await {
                    tracing::info!(
                        provider = %c.provider.as_string(),
                        model = %c.model,
                        "Provider not reachable, removing from candidate list"
                    );
                    continue;
                }
            }
            candidates.push(c);
        }

        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        let max_candidates = if config.try_fallback_candidates {
            candidates.len()
        } else {
            1
        };

        let mut last_error: Option<anyhow::Error> = None;
        let mut all_rate_limited = true;
        let mut candidates_skipped_rate_limit: usize = 0;

        for (idx, candidate) in candidates.iter().take(max_candidates).enumerate() {
            // Skip candidates already known to be rate-limited from previous requests
            if let Some(ref tracker) = self.rate_limit_tracker {
                if tracker.is_rate_limited(candidate.provider, Some(&candidate.model)) {
                    tracing::info!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        "Skipping rate-limited candidate (429 cooldown active)"
                    );
                    candidates_skipped_rate_limit += 1;
                    continue;
                }
            }

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
                    let err_str = e.to_string();
                    if !is_rate_limit_error(&err_str) {
                        all_rate_limited = false;
                    }
                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        error = %err_str,
                        "Candidate exhausted after retries, trying next candidate"
                    );
                    last_error = Some(e);
                }
            }
        }

        // User-friendly message when every provider hit 429
        if all_rate_limited && last_error.is_some() {
            return Err(anyhow!(
                "All AI providers are currently busy. Please try again in a moment."
            ));
        }
        if candidates_skipped_rate_limit > 0 && last_error.is_none() {
            return Err(anyhow!(
                "All AI providers are currently busy. Please try again in a moment."
            ));
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
                vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Ollama,
                        model: "llama4-maverick".to_string(),
                        reason: "strategy-local-first",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::ManagedCloud,
                        model: "managed-cloud-auto".to_string(),
                        reason: "strategy-local-first-fallback",
                    },
                ]
            }
            RoutingStrategy::CostOptimized => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Google,
                        model: "gemini-3-flash-preview".to_string(),
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
                        model: "gemini-3-pro-preview".to_string(),
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
                    model: "gemini-3-flash-preview".to_string(),
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
                                model: "deepseek-chat".to_string(), // Managed Cloud supports DeepSeek Chat ($0.28/1M)
                                reason: "auto-economy-best-value-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(), // Best cost efficiency: $0.28/1M, 73.1% SWE-bench
                                reason: "auto-economy-best-value",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-flash-preview".to_string(), // Best value: 3,307 Elo/$, $0.375/1M
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
                                model: "deepseek-chat".to_string(), // Managed Cloud supports DeepSeek Chat ($0.28/1M)
                                reason: "auto-economy-best-value-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(), // Best cost efficiency: $0.28/1M, 73.1% SWE-bench, 87.5% AIME
                                reason: "auto-economy-best-value",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-flash-preview".to_string(), // Best value: 3,307 Elo/$
                                reason: "auto-economy",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "grok-4-fast-reasoning".to_string(), // Managed Cloud Reasoning
                                reason: "auto-economy-xai-reasoning-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4-fast-reasoning".to_string(), // Reasoning variant: $0.50/1M, ~1230 Elo, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-economy-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4-fast".to_string(), // $0.50/1M, ~1230 Elo, 2M context (non-reasoning)
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
                                model: "gemini-3-flash-preview".to_string(), // Best value, multimodal: 3,307 Elo/$
                                reason: "auto-economy",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::ManagedCloud,
                                model: "deepseek-chat".to_string(), // Managed Cloud supports DeepSeek Chat ($0.28/1M)
                                reason: "auto-economy-deepseek-cloud",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(), // Best cost efficiency: $0.28/1M
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
                                model: "grok-4-fast-reasoning".to_string(), // Reasoning variant: $0.50/1M, ~1230 Elo, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-economy-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4-fast".to_string(), // $0.50/1M, ~1230 Elo, 2M context (non-reasoning)
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
                // Example: grok-4-fast-reasoning ($0.50/1M) over grok-4-fast ($0.50/1M)
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
                                model: "gemini-3-pro-preview".to_string(), // Best chat: 1501 Elo, best reasoning
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
                                model: "kimi-k2.5-thinking".to_string(),
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(),
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
                                model: "gpt-5.2".to_string(),
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
                                model: "kimi-k2.5-thinking".to_string(), // Reasoning model: $7.50/1M, exceptional math: 99.1% AIME, 84.5% GPQA (prioritized over non-reasoning at same price)
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Qwen,
                                model: "qwen-max".to_string(), // Reasoning model with thinking mode: $12.50/1M, best open-source coding: 69.6% SWE-bench, 92.1% HumanEval
                                reason: "auto-balanced-reasoning-coding",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro-preview".to_string(), // Best chat: 1501 Elo, best reasoning: 91.9% GPQA ($7.50/1M)
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
                                model: "grok-4-fast-reasoning".to_string(), // Reasoning variant: Fast, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-balanced-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4-fast".to_string(), // Fast, 2M context (non-reasoning)
                                reason: "auto-balanced-xai",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(), // Best cost efficiency: $0.28/1M
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
                                model: "kimi-k2.5-thinking".to_string(), // Reasoning model: $7.50/1M, exceptional math: 99.1% AIME, 84.5% GPQA (prioritized over non-reasoning at same price)
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Qwen,
                                model: "qwen-max".to_string(), // Reasoning model with thinking mode: $12.50/1M
                                reason: "auto-balanced-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro-preview".to_string(), // Best chat: 1501 Elo, best reasoning: 91.9% GPQA, multimodal ($7.50/1M)
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
                                model: "grok-4-fast-reasoning".to_string(), // Reasoning variant: Fast, 2M context (prioritized - same price as non-reasoning)
                                reason: "auto-balanced-xai-reasoning",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4-fast".to_string(), // Fast, 2M context (non-reasoning)
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
                                model: "gpt-5-pro".to_string(), // Best all-around quality
                                reason: "auto-premium",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-opus-4-6".to_string(), // Best reasoning/coding
                                reason: "auto-premium",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Google,
                                model: "gemini-3-pro-preview".to_string(), // Best multimodal
                                reason: "auto-premium",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::XAI,
                                model: "grok-4".to_string(),
                                reason: "auto-premium-xai",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(),
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
                                model: "claude-opus-4-6".to_string(),
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
                                model: "claude-opus-4-6".to_string(), // Best coding: 80.9% SWE-bench
                                reason: "auto-premium-coding",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5.2-codex-high".to_string(), // Best code generation
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
                                model: "gemini-3-pro-preview".to_string(),
                                reason: "auto-premium-complex",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::DeepSeek,
                                model: "deepseek-chat".to_string(), // Strong code reasoning
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
                                model: "gemini-3-pro-preview".to_string(), // Best multimodal/creative
                                reason: "auto-premium-creative",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::OpenAI,
                                model: "gpt-5-pro".to_string(), // High creativity
                                reason: "auto-premium-creative",
                            },
                            RouteCandidate {
                                strategy: None,
                                provider: Provider::Anthropic,
                                model: "claude-opus-4-6".to_string(),
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
    /// - **xAI**: `grok-4-fast-reasoning` ($0.50/1M) prioritized over `grok-4-fast` ($0.50/1M)
    ///
    /// **Other Providers Checked:**
    /// - **Qwen**: `qwen-max` has thinking mode built-in (always reasoning, no separate non-reasoning variant)
    /// - **OpenAI**: GPT-5.2 supports effort-based reasoning controls without a separate "thinking" model ID
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
                TaskCategory::Simple => "gemini-3-flash-preview".to_string(),
                TaskCategory::Complex => "gemini-3-pro-preview".to_string(),
                TaskCategory::Creative => "gemini-3-pro-preview".to_string(),
            },
            Provider::Ollama => "llama4-maverick".to_string(),
            Provider::XAI => match task {
                // Prioritize reasoning variant when same price as non-reasoning (December 2025: Grok 4 Fast reasoning = $0.50/1M, same as non-reasoning)
                TaskCategory::Simple => "grok-4-fast-reasoning".to_string(), // Reasoning variant: $0.50/1M, 2M context (prioritized - same price as non-reasoning)
                TaskCategory::Complex => "grok-4".to_string(),
                TaskCategory::Creative => "grok-4".to_string(),
            },
            Provider::DeepSeek => match task {
                TaskCategory::Simple => "deepseek-chat".to_string(), // DeepSeek Chat.2
                TaskCategory::Complex => "deepseek-chat".to_string(), // DeepSeek Chat.2
                TaskCategory::Creative => "deepseek-chat".to_string(), // DeepSeek Chat.2
            },
            Provider::Qwen => match task {
                TaskCategory::Simple => "qwen-max".to_string(),
                TaskCategory::Complex => "qwen-max".to_string(),
                TaskCategory::Creative => "qwen-max".to_string(),
            },
            Provider::Moonshot => match task {
                TaskCategory::Simple => "kimi-k2.5-thinking".to_string(),
                TaskCategory::Complex => "kimi-k2.5-thinking".to_string(),
                TaskCategory::Creative => "kimi-k2.5-thinking".to_string(),
            },
            // ZhipuAI - GLM-4.7 is excellent for coding (73.8% SWE-bench)
            Provider::Zhipu => match task {
                TaskCategory::Simple => "glm-4.6v-flash".to_string(), // Fast and free
                TaskCategory::Complex => "glm-4.7".to_string(),       // Best for coding
                TaskCategory::Creative => "glm-4.6v".to_string(),     // Vision for creative
            },
            Provider::Perplexity => match task {
                TaskCategory::Simple => "sonar".to_string(),
                TaskCategory::Complex => "sonar-deep-research".to_string(),
                TaskCategory::Creative => "sonar-pro".to_string(),
            },
            Provider::ManagedCloud => match task {
                TaskCategory::Simple => "gpt-5-nano".to_string(),
                TaskCategory::Complex => "gpt-5.2".to_string(),
                TaskCategory::Creative => "gpt-5.2".to_string(),
            },
        }
    }

    /// H13 fix: shared model-resolution logic extracted from `invoke_candidate` and
    /// `invoke_streaming_with_retry` to eliminate the copy-paste duplication.
    ///
    /// Given a routing strategy and the estimated prompt token count, returns the concrete
    /// model name that should be used.  For strategies not listed the `candidate_model`
    /// is returned unchanged.
    pub(crate) fn resolve_model_for_strategy(
        strategy: RoutingStrategy,
        token_count: u32,
        candidate_model: &str,
    ) -> String {
        match strategy {
            RoutingStrategy::AutoEconomy => {
                // Cost-optimized: simple queries use cheap models, complex use capable
                if token_count < 1000 {
                    "gpt-5-nano".to_string() // $0.05/$0.40 per 1M - cheapest OpenAI
                } else if token_count < 8000 {
                    "deepseek-chat".to_string() // $0.28/$0.42 per 1M - best value for medium context
                } else {
                    "gemini-3-flash-preview".to_string() // $0.50/$3.00 per 1M - long context value
                }
            }
            RoutingStrategy::AutoBalanced => {
                // Balance: cheap for simple, quality for complex
                if token_count < 500 {
                    "gpt-5-nano".to_string() // $0.05/$0.40 per 1M - fast and cheap
                } else if token_count < 4000 {
                    "claude-sonnet-4-5".to_string() // $3/$15 per 1M - excellent quality
                } else {
                    "gpt-5.2".to_string() // Strong OpenAI balanced model
                }
            }
            RoutingStrategy::AutoPremium => {
                // Premium: Always best models, switch based on context window needs
                if token_count < 16000 {
                    "claude-sonnet-4-5".to_string() // $3/$15 per 1M - excellent coding
                } else {
                    "claude-opus-4-6".to_string() // $5/$25 per 1M - best for heavy lifting
                }
            }
            _ => candidate_model.to_string(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TaskCategory {
    Simple,
    Complex,
    Creative,
}

/// Checks if `text` contains `word` as a whole word using regex `\b` word boundaries.
/// Both `text` and `word` should already be lowercase when used with `classify_request`.
///
/// H1 fix: Regex is compiled once per unique word and cached in a thread-local HashMap,
/// avoiding repeated compilation on every call in the classification hot path.
pub(crate) fn contains_word(text: &str, word: &str) -> bool {
    use std::cell::RefCell;
    use std::collections::HashMap;

    thread_local! {
        static WORD_REGEX_CACHE: RefCell<HashMap<String, regex::Regex>> =
            RefCell::new(HashMap::new());
    }

    WORD_REGEX_CACHE.with(|cache| {
        let mut map = cache.borrow_mut();
        let re = map.entry(word.to_owned()).or_insert_with(|| {
            regex::Regex::new(&format!(r"\b{}\b", regex::escape(word))).expect("valid word regex")
        });
        re.is_match(text)
    })
}

fn classify_request(request: &LLMRequest) -> TaskCategory {
    let last_user_message = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role.eq_ignore_ascii_case("user"));

    if let Some(message) = last_user_message {
        let content = message.content.to_lowercase();

        // Complex: programming / debugging tasks
        // Use word-boundary matching to avoid false positives like "barcode", "encode",
        // "malfunction", "dysfunction", "airplane", "planet", "history", "season".
        if contains_word(&content, "code")
            || content.contains("coding")
            || content.contains("coder")
            || contains_word(&content, "function")
            || contains_word(&content, "debug")
            || content.contains("debugging")
        {
            return TaskCategory::Complex;
        }

        // Creative: design, storytelling, artistic tasks
        if contains_word(&content, "design")
            || contains_word(&content, "story")
            || content.contains("storytelling")
            || content.contains("creative")
            || content.contains("write a poem")
        {
            return TaskCategory::Creative;
        }

        // Complex: analytical / planning / reasoning tasks
        if content.contains("analyze")
            || content.contains("analysis")
            || contains_word(&content, "plan")
            || content.contains("planning")
            || contains_word(&content, "reason")
            || content.contains("reasoning")
        {
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
            ..Default::default()
        };

        // Delegate to route_with_retry so all configured providers are tried
        // with exponential backoff — consistent with send_message_streaming_with_retry.
        let outcome = self.route_with_retry(&request, &prefs, None).await?;
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
        self.send_message_streaming_with_retry(request, preferences, None)
            .await
    }

    /// Send a streaming message with retry logic and fallback to other candidates
    pub async fn send_message_streaming_with_retry(
        &self,
        request: &LLMRequest,
        preferences: &RouterPreferences,
        retry_config: Option<RetryConfig>,
    ) -> Result<
        Pin<
            Box<
                dyn Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>>
                    + Send,
            >,
        >,
    > {
        let config = retry_config.unwrap_or_default();
        let raw_candidates = self.candidates(request, preferences);

        // Pre-filter: skip any provider whose is_available() returns false (mirrors
        // route_with_retry behavior for consistency).
        let mut candidates = Vec::with_capacity(raw_candidates.len());
        for c in raw_candidates {
            if let Some(provider) = self.providers.get(&c.provider) {
                if !provider.is_available().await {
                    tracing::info!(
                        provider = %c.provider.as_string(),
                        model = %c.model,
                        "Provider not reachable, removing from streaming candidate list"
                    );
                    continue;
                }
            }
            candidates.push(c);
        }

        if candidates.is_empty() {
            return Err(anyhow!("No LLM providers configured"));
        }

        let max_candidates = if config.try_fallback_candidates {
            candidates.len()
        } else {
            1
        };

        let mut last_error: Option<anyhow::Error> = None;
        let mut all_rate_limited = true;
        let mut candidates_skipped_rate_limit: usize = 0;

        for (idx, candidate) in candidates.iter().take(max_candidates).enumerate() {
            // Skip candidates already known to be rate-limited from previous requests
            if let Some(ref tracker) = self.rate_limit_tracker {
                if tracker.is_rate_limited(candidate.provider, Some(&candidate.model)) {
                    tracing::info!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        "Skipping rate-limited streaming candidate (429 cooldown active)"
                    );
                    candidates_skipped_rate_limit += 1;
                    continue;
                }
            }

            tracing::info!(
                provider = %candidate.provider.as_string(),
                model = %candidate.model,
                candidate_index = idx,
                total_candidates = candidates.len(),
                "Attempting streaming LLM request"
            );

            match self
                .invoke_streaming_with_retry(candidate, request, &config)
                .await
            {
                Ok(stream) => {
                    if idx > 0 {
                        tracing::info!(
                            provider = %candidate.provider.as_string(),
                            model = %candidate.model,
                            fallback_index = idx,
                            "Streaming request succeeded with fallback provider"
                        );
                    }
                    return Ok(stream);
                }
                Err(e) => {
                    let err_str = e.to_string();
                    if !is_rate_limit_error(&err_str) {
                        all_rate_limited = false;
                    }
                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        error = %err_str,
                        "Streaming candidate exhausted after retries, trying next candidate"
                    );
                    last_error = Some(e);
                }
            }
        }

        // User-friendly message when every provider hit 429
        if all_rate_limited && last_error.is_some() {
            return Err(anyhow!(
                "All AI providers are currently busy. Please try again in a moment."
            ));
        }
        if candidates_skipped_rate_limit > 0 && last_error.is_none() {
            return Err(anyhow!(
                "All AI providers are currently busy. Please try again in a moment."
            ));
        }

        Err(last_error.unwrap_or_else(|| anyhow!("All LLM providers failed for streaming")))
    }

    /// Invoke a streaming request with retry logic for a single candidate
    async fn invoke_streaming_with_retry(
        &self,
        candidate: &RouteCandidate,
        request: &LLMRequest,
        retry_config: &RetryConfig,
    ) -> Result<
        Pin<
            Box<
                dyn Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>>
                    + Send,
            >,
        >,
    > {
        let provider = self
            .providers
            .get(&candidate.provider)
            .ok_or_else(|| anyhow!("Provider {:?} not configured", candidate.provider))?;

        let mut routed_request = request.clone();

        // Handle dynamic model resolution based on strategy (mirrors non-streaming invoke_candidate)
        if let Some(strategy) = candidate.strategy {
            let token_count = TokenCounter::estimate_prompt_tokens(&request.messages);

            // H13 fix: delegate to shared helper to avoid copy-paste with non-streaming path
            let resolved_model =
                Self::resolve_model_for_strategy(strategy, token_count, &candidate.model);

            tracing::info!(
                "Dynamic Routing (Streaming) [Strategy: {:?}] [Tokens: {}] -> Selected: {}",
                strategy,
                token_count,
                resolved_model
            );

            routed_request.model = resolved_model;
        } else if candidate.model == "auto" {
            // Check if strategy is somehow missing but model is auto (fallback)
            // Use a safe default from the active model catalog.
            routed_request.model = "gpt-5.2".to_string();
        } else {
            routed_request.model = candidate.model.clone();
        }

        routed_request.stream = true;

        // C1 fix: pre-flight session cost cap check for the streaming path.
        //
        // Non-streaming `invoke_candidate` increments `cumulative_cost` and hard-stops when
        // `SESSION_COST_SAFETY_CAP` is exceeded.  The streaming path previously had no such
        // guard, allowing unlimited spending via streaming calls.
        //
        // We enforce the cap in two stages:
        //   1. Reject immediately if the current session total already exceeds the cap.
        //   2. Estimate the input cost from prompt tokens and reject if adding it would
        //      push the session over the cap (conservative pre-flight guard).
        {
            let current_cost = *self.cumulative_cost.lock();
            if current_cost > SESSION_COST_SAFETY_CAP {
                return Err(anyhow!(
                    "Session cost safety cap exceeded: ${:.4} > ${:.2} limit. \
                     Reset the router to continue.",
                    current_cost,
                    SESSION_COST_SAFETY_CAP
                ));
            }

            let prompt_tokens = TokenCounter::estimate_prompt_tokens(&request.messages);
            let estimated_input_cost = self.cost_calculator.calculate(
                candidate.provider,
                &routed_request.model,
                prompt_tokens,
                0, // output tokens unknown at this point; guard on input alone
            );
            let projected_cost = current_cost + estimated_input_cost;
            if projected_cost > SESSION_COST_SAFETY_CAP {
                return Err(anyhow!(
                    "Session cost safety cap would be exceeded by streaming request: \
                     current=${:.4}, estimated_input=${:.4}, limit=${:.2}. \
                     Reset the router to continue.",
                    current_cost,
                    estimated_input_cost,
                    SESSION_COST_SAFETY_CAP
                ));
            }
        }

        let mut last_error: Option<anyhow::Error> = None;

        for attempt in 0..=retry_config.max_retries {
            tracing::info!(
                "Starting streaming request to {} with model {} (attempt {}/{})",
                provider.name(),
                candidate.model,
                attempt + 1,
                retry_config.max_retries + 1
            );

            // Add timeout to the streaming connection attempt
            let stream_timeout = Duration::from_secs(90); // 90s timeout for initial connection (thinking/reasoning models need 60-90s)
            let stream_result = tokio::time::timeout(
                stream_timeout,
                provider.send_message_streaming(&routed_request),
            )
            .await;

            match stream_result {
                Ok(Ok(stream)) => {
                    // Record the streaming success in the circuit breaker so that
                    // non-streaming and streaming paths share consistent state.
                    if let Some(ref tracker) = self.rate_limit_tracker {
                        tracker.record_success(candidate.provider, Some(&candidate.model));
                    }
                    return Ok(stream);
                }
                Ok(Err(e)) => {
                    let error_str = e.to_string();
                    let is_retryable = is_retryable_error(&error_str);
                    let is_rate_limited = is_rate_limit_error(&error_str);

                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        attempt = attempt + 1,
                        max_retries = retry_config.max_retries,
                        is_retryable = is_retryable,
                        is_rate_limited = is_rate_limited,
                        error = %error_str,
                        "Streaming LLM request failed"
                    );

                    // 429 rate limit: record in tracker and break immediately
                    // to skip to the next provider candidate instead of wasting
                    // retries on a provider that told us to slow down.
                    if is_rate_limited {
                        if let Some(ref tracker) = self.rate_limit_tracker {
                            tracker.record_rate_limit(
                                candidate.provider,
                                Some(&candidate.model),
                                None,
                            );
                        }
                        last_error = Some(anyhow!(error_str));
                        break;
                    }

                    if !is_retryable || attempt == retry_config.max_retries {
                        // Mirror the non-streaming path: record 5xx server errors so the
                        // circuit breaker activates cooldown for the affected provider.
                        if is_server_error(&error_str) {
                            if let Some(ref tracker) = self.rate_limit_tracker {
                                tracker.record_server_error(
                                    candidate.provider,
                                    Some(&candidate.model),
                                );
                            }
                        }
                        last_error = Some(anyhow!(error_str));
                        break;
                    }

                    let delay = calculate_backoff_delay(attempt, retry_config);
                    tracing::info!(
                        delay_ms = delay.as_millis() as u64,
                        "Retrying streaming request after backoff delay"
                    );
                    sleep(delay).await;
                }
                Err(_elapsed) => {
                    // Timeout occurred
                    let error_str = format!(
                        "Streaming connection timeout after {}s for {} ({})",
                        stream_timeout.as_secs(),
                        provider.name(),
                        candidate.model
                    );

                    tracing::warn!(
                        provider = %candidate.provider.as_string(),
                        model = %candidate.model,
                        attempt = attempt + 1,
                        max_retries = retry_config.max_retries,
                        error = %error_str,
                        "Streaming connection timed out"
                    );

                    // Timeouts are retryable
                    if attempt == retry_config.max_retries {
                        last_error = Some(anyhow!(error_str));
                        break;
                    }

                    let delay = calculate_backoff_delay(attempt, retry_config);
                    tracing::info!(
                        delay_ms = delay.as_millis() as u64,
                        "Retrying streaming request after timeout"
                    );
                    sleep(delay).await;
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow!("Streaming request failed after retries")))
    }
}
