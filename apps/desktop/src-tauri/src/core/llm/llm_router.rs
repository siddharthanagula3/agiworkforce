use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{anyhow, Result};
use futures_util::{Stream, StreamExt as _};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use tokio::time::sleep;

use agiworkforce_model_registry::{
    resolve_auto_route, AutoRouteDecision, AutoRoutingRequest,
    RoutingTaskType as RegistryRoutingTaskType, TrustMode,
};

use crate::core::llm::cache_manager::CacheManager;
use crate::core::llm::cost_calculator::CostCalculator;
use crate::core::llm::daily_budget;
use crate::core::llm::prompt_tool_injection::build_tool_injection_prompt;
use crate::core::llm::sse_parser::StreamChunk;
use crate::core::llm::token_counter::TokenCounter;
use crate::core::llm::{
    ChatMessage, LLMProvider, LLMRequest, LLMResponse, Provider, ToolDefinition,
};

const BASE_STREAM_TIMEOUT_SECS: u64 = 90;
const LARGE_PROMPT_TOKEN_THRESHOLD: u64 = 4_000;
const CONSERVATIVE_EVAL_TOKENS_PER_SEC: u64 = 100;
const MAX_STREAM_TIMEOUT_SECS: u64 = 240;

pub(crate) fn compute_streaming_timeout(
    messages: &[ChatMessage],
    tools: Option<&[ToolDefinition]>,
) -> Duration {
    let tool_injection_tokens: u64 = tools
        .filter(|tools| !tools.is_empty())
        .map(|tools| TokenCounter::estimate_text_tokens(&build_tool_injection_prompt(tools)) as u64)
        .unwrap_or(0);
    let prompt_tokens =
        TokenCounter::estimate_prompt_tokens(messages) as u64 + tool_injection_tokens;
    let extra_secs = prompt_tokens.saturating_sub(LARGE_PROMPT_TOKEN_THRESHOLD)
        / CONSERVATIVE_EVAL_TOKENS_PER_SEC;
    Duration::from_secs((BASE_STREAM_TIMEOUT_SECS + extra_secs).min(MAX_STREAM_TIMEOUT_SECS))
}

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
pub(crate) const SESSION_COST_SAFETY_CAP: f64 = 50.0;

fn enforce_daily_budget() -> Result<()> {
    let Some(budget) = daily_budget::global() else {
        return Ok(());
    };
    budget
        .check_or_reject(daily_budget::LOCAL_PROFILE_BUDGET_KEY)
        .map_err(|exceeded| anyhow!("{exceeded}"))
}

/// Record a completed streaming request. Unlike non-streaming preflight, this
/// runs after provider delivery has begun, so the real charge is always added
/// even when it crosses the defense-in-depth cap; the returned error then stops
/// the stream and every subsequent request sees the exceeded cumulative total.
fn record_completed_request_cost(
    cumulative_cost: &parking_lot::Mutex<f64>,
    request_cost: f64,
    request_kind: &str,
) -> Result<()> {
    if !request_cost.is_finite() || request_cost < 0.0 {
        return Err(anyhow!("Invalid streaming request cost"));
    }

    if let Some(budget) = daily_budget::global() {
        if let Err(e) = budget.record_actual(daily_budget::LOCAL_PROFILE_BUDGET_KEY, request_cost) {
            tracing::warn!("Failed to record daily LLM spend: {e}");
        }
    }

    let mut cumulative = cumulative_cost.lock();
    *cumulative += request_cost;
    if *cumulative > SESSION_COST_SAFETY_CAP {
        return Err(anyhow!(
            "Session cost safety cap exceeded after {request_kind} request: \
             cumulative=${:.4}, limit=${:.2}. Reset the router to continue.",
            *cumulative,
            SESSION_COST_SAFETY_CAP
        ));
    }
    Ok(())
}

pub(crate) fn record_streaming_cost(
    cumulative_cost: &parking_lot::Mutex<f64>,
    request_cost: f64,
) -> Result<()> {
    record_completed_request_cost(cumulative_cost, request_cost, "streaming")
}

pub(crate) fn record_non_streaming_cost(
    cumulative_cost: &parking_lot::Mutex<f64>,
    request_cost: f64,
) -> Result<()> {
    record_completed_request_cost(cumulative_cost, request_cost, "non-streaming")
}

fn streaming_request_cost(
    calculator: &CostCalculator,
    provider: Provider,
    model: &str,
    fallback_prompt_tokens: u32,
    fallback_completion_tokens: u32,
    usage: Option<&crate::core::llm::sse_parser::TokenUsage>,
    completed_normally: bool,
    as_of: chrono::NaiveDate,
) -> f64 {
    let prompt_tokens = usage
        .and_then(|usage| usage.prompt_tokens)
        .unwrap_or(fallback_prompt_tokens);
    let completion_tokens = match usage.and_then(|usage| usage.completion_tokens) {
        // A normal end makes the latest non-zero provider usage authoritative.
        // An aborted stream may only have a partial usage snapshot, so fail
        // closed by retaining at least the locally observed output.
        Some(reported) if completed_normally && reported > 0 => reported,
        Some(reported) => reported.max(fallback_completion_tokens),
        None => fallback_completion_tokens,
    };
    calculator.calculate_with_cache(
        provider,
        model,
        prompt_tokens,
        completion_tokens,
        usage
            .and_then(|usage| usage.cache_read_input_tokens)
            .unwrap_or(0),
        usage
            .and_then(|usage| usage.cache_creation_input_tokens)
            .unwrap_or(0),
        as_of,
    )
}

/// Ensures a started streaming request reaches the cumulative ledger exactly
/// once, including when the consumer cancels or drops the stream before the
/// provider's final usage event. Provider usage is preferred; local estimates
/// are the fail-closed fallback.
struct StreamingCostGuard {
    calculator: CostCalculator,
    cumulative_cost: Arc<parking_lot::Mutex<f64>>,
    provider: Provider,
    model: String,
    fallback_prompt_tokens: u32,
    fallback_completion_tokens: u32,
    latest_usage: Option<crate::core::llm::sse_parser::TokenUsage>,
    latest_authoritative_cost: Option<f64>,
    priced_on: chrono::NaiveDate,
    recorded: bool,
}

impl StreamingCostGuard {
    fn observe(&mut self, chunk: &StreamChunk) {
        if let Some(response_model) = chunk.model.as_ref() {
            self.model.clone_from(response_model);
        }
        if let Some(credits) = chunk.credits.as_ref() {
            let cost = credits.cost_cents / 100.0;
            if cost.is_finite() && cost >= 0.0 {
                self.latest_authoritative_cost = Some(cost);
            }
        }
        let estimated_chunk_tokens = TokenCounter::estimate_text_tokens(&chunk.content)
            .saturating_add(
                chunk
                    .reasoning
                    .as_deref()
                    .map(TokenCounter::estimate_text_tokens)
                    .unwrap_or(0),
            );
        self.fallback_completion_tokens = self
            .fallback_completion_tokens
            .saturating_add(u32::try_from(estimated_chunk_tokens).unwrap_or(u32::MAX));

        if let Some(incoming) = chunk.usage.as_ref() {
            let latest = self.latest_usage.get_or_insert_with(|| incoming.clone());
            let merge = |current: &mut Option<u32>, next: Option<u32>| {
                if let Some(next) = next {
                    *current = Some(current.map_or(next, |value| value.max(next)));
                }
            };
            merge(&mut latest.prompt_tokens, incoming.prompt_tokens);
            merge(&mut latest.completion_tokens, incoming.completion_tokens);
            merge(&mut latest.total_tokens, incoming.total_tokens);
            merge(
                &mut latest.cache_read_input_tokens,
                incoming.cache_read_input_tokens,
            );
            merge(
                &mut latest.cache_creation_input_tokens,
                incoming.cache_creation_input_tokens,
            );
        }
    }

    fn record(&mut self, completed_normally: bool) -> Result<()> {
        if self.recorded {
            return Ok(());
        }
        self.recorded = true;
        let request_cost = self.latest_authoritative_cost.unwrap_or_else(|| {
            streaming_request_cost(
                &self.calculator,
                self.provider,
                &self.model,
                self.fallback_prompt_tokens,
                self.fallback_completion_tokens,
                self.latest_usage.as_ref(),
                completed_normally,
                self.priced_on,
            )
        });
        record_streaming_cost(&self.cumulative_cost, request_cost)
    }
}

impl Drop for StreamingCostGuard {
    fn drop(&mut self) {
        if let Err(error) = self.record(false) {
            tracing::error!(
                error = %error,
                "streaming request crossed the cost cap while its stream was dropped"
            );
        }
    }
}

/// Maximum idle time (no data received) before a streaming SSE connection is
/// closed with a `StreamingError::IdleTimeout`.
///
/// This guards against providers that stop sending data without closing the
/// connection.  It is distinct from the *connection* timeout (90 s) used in
/// `invoke_streaming_with_retry`, which covers the initial HTTP handshake.
///
/// When fired the wrapper stream:
/// 1. Logs at `error!` level with provider/model context.
/// 2. Yields a single `Err(StreamingError::IdleTimeout ...)` item.
/// 3. Terminates the stream (drops the inner stream, closing the HTTP
///    connection) so resources are not leaked.
///
/// Keepalive/heartbeat chunks (`StreamChunk::keepalive == true`) reset this
/// timer because they are normal `Ok(chunk)` items from the inner stream.
pub(crate) const CHUNK_IDLE_TIMEOUT: Duration = Duration::from_secs(30);

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

    // Non-retryable: authentication/authorization errors (403, 401, invalid key)
    if is_auth_error(error) {
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

fn is_auth_error(error: &str) -> bool {
    let e = error.to_lowercase();
    e.contains("403")
        || e.contains("401")
        || e.contains("forbidden")
        || e.contains("unauthorized")
        || e.contains("invalid_api_key")
        || e.contains("invalid api key")
        || (e.contains("api key")
            && (e.contains("invalid") || e.contains("rejected") || e.contains("expired")))
        || e.contains("authentication_error")
        || e.contains("permission_denied")
}

/// Normalizes model IDs to a canonical format for routing and API payloads.
///
/// The normalized (lowercased, canonicalized) ID is used end-to-end for both
/// routing decisions and provider API payloads.  Delegates to the centralized
/// canonicalization maps in `models.json` via `models_config::get_canonicalized_id`,
/// then applies additional routing-only aliases not covered by the per-provider
/// maps (e.g. dot-versioned shorthand that shouldn't change the API payload).
fn normalize_model_id(id: &str) -> String {
    let trimmed = id.trim().to_lowercase();

    // First, delegate to the models.json canonicalization maps (single source of truth).
    let canonical = super::models_config::get_canonicalized_id(&trimmed);
    if canonical != trimmed {
        return canonical;
    }

    trimmed
}

/// Rewrite an auth error into a user-friendly message that tells the user
/// exactly what to do (check their key in Settings).
fn rewrite_auth_error(error: &str, provider_name: &str) -> String {
    format!(
        "API key rejected (403 Forbidden). Check your API key in Settings \u{2192} Models for {}. Original error: {}",
        provider_name, error
    )
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
    pub local_only: bool,
    /// TRUST BOUNDARY: when true, candidates must use AGI Managed Cloud and
    /// must never fall back to a direct/BYOK or local provider.
    pub managed_cloud_only: bool,
    /// Canonical three-way execution boundary. New chat callers must set this;
    /// the legacy booleans remain temporarily for non-chat call sites.
    pub trust_mode: Option<TrustMode>,
}

/// TRUST BOUNDARY: what to tell a Local conversation that produced no candidate.
///
/// A Local conversation keeps only local providers (see
/// [`provider_matches_trust_mode`]), so picking a configured BYOK model inside
/// one empties the candidate list. The generic "start your local runtime"
/// message blamed Ollama for a refusal Ollama had nothing to do with; a BYOK
/// selection has to name the boundary and the fork that crosses it properly.
pub(crate) fn local_only_no_candidate_message(requested: Option<Provider>) -> &'static str {
    let asked_for_byok = requested.is_some_and(|provider| {
        !provider_matches_trust_mode(provider, TrustMode::Local)
            && provider != Provider::ManagedCloud
    });
    if asked_for_byok {
        return "This conversation is Local, so it will not be sent to a BYOK provider. \
                Fork it to BYOK, which lets you choose the context, scans it for secrets and \
                shows you the payload first, or pick a local model to keep the thread on device.";
    }
    "No local model provider is reachable. Ensure your local runtime (e.g. Ollama) is \
     running and a local model is installed and selected, then try again."
}

fn provider_matches_trust_mode(provider: Provider, trust_mode: TrustMode) -> bool {
    let is_local = matches!(
        provider,
        Provider::Ollama | Provider::LmStudio | Provider::LlamaCpp | Provider::Vllm
    );
    match trust_mode {
        TrustMode::Local | TrustMode::OnDevice => is_local,
        TrustMode::Byok => !is_local && provider != Provider::ManagedCloud,
        TrustMode::ManagedCloud => provider == Provider::ManagedCloud,
    }
}

fn effective_trust_mode(preferences: &RouterPreferences) -> Option<TrustMode> {
    // `local_only` and "unset" both resolve to the same fail-closed
    // boundary; only an explicit `managed_cloud_only` widens it.
    Some(
        preferences
            .trust_mode
            .unwrap_or(if preferences.managed_cloud_only {
                TrustMode::ManagedCloud
            } else {
                TrustMode::Local
            }),
    )
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
    pub plan_tier: String,

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
                let normalized = normalize_model_id(selected_model);
                if let Some(provider) = self.infer_provider_from_model(&normalized) {
                    let reason = context
                        .routing_reason
                        .clone()
                        .unwrap_or_else(|| format!("Intelligent routing selected: {}", normalized));

                    tracing::info!(
                        "Using intelligent routing: model={} (normalized from {}), provider={:?}, intent={:?}, confidence={:?}",
                        normalized,
                        selected_model,
                        provider,
                        context.intent_type,
                        context.confidence
                    );

                    if self.has_provider(provider) {
                        return RouterSuggestion {
                            provider,
                            model: normalized,
                            reason,
                        };
                    }
                    tracing::warn!(
                        selected_model = %selected_model,
                        inferred_provider = ?provider,
                        "Intelligent routing selection cannot be honored: provider not configured, falling back to legacy routing"
                    );
                } else {
                    tracing::warn!(
                        selected_model = %selected_model,
                        "Intelligent routing selection is not catalog-addressable; refusing the model and falling back to catalog routing"
                    );
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

        // For free and basic plans, prefer ultra-cheap models ('hobby' kept for
        // pre-rename subscription rows still persisted with the old plan name)
        let is_budget_plan = matches!(context.plan_tier.as_str(), "free" | "basic" | "hobby");

        let mut provider = Provider::Google;
        let mut task_category = TaskCategory::Simple;
        let mut reason = if is_budget_plan {
            "Budget plan detected - routing to current low-cost catalog models.".to_string()
        } else {
            "General developer chat - routing to balanced core models.".to_string()
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
                provider = Provider::OpenAI;
                task_category = TaskCategory::Complex;
                reason =
                    "Developer workflow + budget plan - routing to the affordable coding catalog slot."
                        .to_string();
            } else {
                provider = Provider::Anthropic;
                task_category = TaskCategory::Complex;
                reason =
                    "Developer or automation workflow detected - routing to the Anthropic reasoning catalog slot."
                        .to_string();
            }
        } else if normalized_intents
            .iter()
            .any(|intent| matches!(intent.as_str(), "writing" | "research"))
        {
            provider = if is_budget_plan {
                Provider::Google // Use the Google economy catalog slot.
            } else {
                Provider::OpenAI
            };
            task_category = TaskCategory::Complex;
            reason = if is_budget_plan {
                "Writing/research + budget plan - routing to the affordable Google catalog slot."
                    .to_string()
            } else {
                "Writing or research task detected - routing to OpenAI GPT for quality output."
                    .to_string()
            };
        } else if context.cost_priority == CostPriority::Low || is_budget_plan {
            provider = Provider::OpenAI;
            task_category = TaskCategory::Simple;
            reason = "Cost priority is low - routing to the efficient low-cost catalog slot."
                .to_string();
        }

        if context.token_estimate > 12_000 && provider == Provider::OpenAI && !is_budget_plan {
            task_category = TaskCategory::Complex;
            reason = format!(
                "{} Large context (~{} tokens) detected - upgrading to latest OpenAI model.",
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
        let is_budget_plan = matches!(context.plan_tier.as_str(), "free" | "basic" | "hobby");

        let (provider, model, reason) = match intent_type {
            // === Search intents - route to Perplexity ===
            "search" => (
                Provider::Perplexity,
                perplexity_search_model("fast"),
                "Search intent detected - routing using the Perplexity catalog quick-search default."
                    .to_string(),
            ),
            "deep-research" => (
                Provider::Perplexity,
                perplexity_search_model("best"),
                "Deep research intent detected - routing using the Perplexity catalog deep-research default."
                    .to_string(),
            ),

            // === Coding intent - route to best coding models ===
            "coding" => {
                if is_budget_plan {
                    (
                        Provider::OpenAI,
                        provider_task_model(Provider::OpenAI, "fast_completion"),
                        "Coding intent + budget plan - routing using OpenAI fast-completion default."
                            .to_string(),
                    )
                } else {
                    (
                        Provider::Anthropic,
                        provider_task_model(Provider::Anthropic, "code_generation"),
                        "Coding intent detected - routing using Anthropic catalog code-generation default."
                            .to_string(),
                    )
                }
            }

            // === Reasoning intent - route to reasoning specialists ===
            "reasoning" => {
                if is_budget_plan {
                    (
                        Provider::Google,
                        provider_task_model(Provider::Google, "chat"),
                        "Reasoning intent + budget plan - routing using Google catalog chat default."
                            .to_string(),
                    )
                } else {
                    (
                        Provider::OpenAI,
                        provider_task_model(Provider::OpenAI, "complex_reasoning"),
                        "Reasoning intent detected - routing using OpenAI catalog reasoning default."
                            .to_string(),
                    )
                }
            }

            // === Agentic intent - route to capable models with tool use ===
            "agentic" => {
                if is_budget_plan {
                    (
                        Provider::Google,
                        provider_task_model(Provider::Google, "chat"),
                        "Agentic intent + budget plan - routing using Google catalog chat default."
                            .to_string(),
                    )
                } else {
                    (
                        Provider::Anthropic,
                        provider_task_model(Provider::Anthropic, "chat"),
                        "Agentic intent detected - routing using Anthropic catalog chat default."
                            .to_string(),
                    )
                }
            }

            // === Multimodal intent - route to vision-capable models ===
            "multimodal" => (
                Provider::Google,
                provider_task_model(
                    Provider::Google,
                    if is_budget_plan { "chat" } else { "vision" },
                ),
                "Multimodal intent detected - routing using Google catalog vision-capable default."
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
                        provider_task_model(Provider::Google, "fast_completion"),
                        "Chat intent + budget plan - routing using Google catalog fast model."
                            .to_string(),
                    )
                } else {
                    (
                        Provider::Google,
                        provider_task_model(Provider::Google, "chat"),
                        "Chat intent detected - routing using Google catalog chat default."
                            .to_string(),
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

    /// Infer provider from model name for intelligent routing.
    /// Delegates to the single-source-of-truth model catalog.
    pub(crate) fn infer_provider_from_model(&self, model: &str) -> Option<Provider> {
        crate::core::llm::models_config::get_provider_for_model(&normalize_model_id(model))
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
            Provider::Together,
            Provider::Fireworks,
            Provider::Cerebras,
            Provider::DeepInfra,
            Provider::Cohere,
            Provider::AI21,
            Provider::Sambanova,
            Provider::Azure,
            Provider::Bedrock,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Minimax,
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

    /// Drop all provider clients while preserving router policy, cache, cost,
    /// and rate-limit state. Used after a proxy profile changes so no request
    /// can continue through an HTTP client built with stale network settings.
    pub fn clear_providers(&mut self) {
        self.providers.clear();
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

    pub fn set_minimax(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Minimax, provider);
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

    pub fn set_together(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Together, provider);
    }

    pub fn set_fireworks(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Fireworks, provider);
    }

    pub fn set_cerebras(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Cerebras, provider);
    }

    pub fn set_deepinfra(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::DeepInfra, provider);
    }

    pub fn set_cohere(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Cohere, provider);
    }

    pub fn set_ai21(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::AI21, provider);
    }

    pub fn set_sambanova(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Sambanova, provider);
    }

    pub fn set_azure(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Azure, provider);
    }

    pub fn set_bedrock(&mut self, provider: Box<dyn LLMProvider>) {
        self.set_provider(Provider::Bedrock, provider);
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
        if preferences.local_only && preferences.managed_cloud_only {
            tracing::error!(
                "Invalid router trust boundary: local_only and managed_cloud_only are both true"
            );
            return Vec::new();
        }
        let boundary = effective_trust_mode(preferences);
        if matches!(boundary, Some(TrustMode::ManagedCloud)) && preferences.local_only
            || matches!(boundary, Some(TrustMode::Local | TrustMode::OnDevice))
                && preferences.managed_cloud_only
        {
            tracing::error!("Invalid router trust boundary: canonical and legacy modes disagree");
            return Vec::new();
        }
        let mut order = Vec::new();
        let _user_specified_provider = preferences.provider.is_some();

        if let Some(preferred) = preferences.provider {
            if self.has_provider(preferred)
                && boundary
                    .is_none_or(|trust_mode| provider_matches_trust_mode(preferred, trust_mode))
            {
                order.push(RouteCandidate {
                    strategy: None,
                    provider: preferred,
                    model: preferences
                        .model
                        .as_deref()
                        .map(normalize_model_id)
                        .unwrap_or_else(|| self.default_model(preferred, TaskCategory::Simple)),
                    reason: "user-preference",
                });
            }

            return order;
        }

        // If user prefers cloud credits and ManagedCloud is available, prioritize it
        // BUT skip this if we are using an Auto strategy, as the strategy itself will handle
        // ManagedCloud selection with better catalog-backed model specificity.
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
            && boundary.is_none_or(|trust_mode| {
                provider_matches_trust_mode(Provider::ManagedCloud, trust_mode)
            })
        {
            let task_type = classify_request(request);
            order.push(RouteCandidate {
                strategy: None,
                provider: Provider::ManagedCloud,
                model: self.default_model(Provider::ManagedCloud, task_type),
                reason: "cloud-credits-preference",
            });
        }

        if !is_auto_strategy {
            if let Some(context) = &preferences.context {
                let suggestion = self.suggest_for_context(context);
                // Don't override ManagedCloud if it was already added
                if !order
                    .iter()
                    .any(|existing| existing.provider == suggestion.provider)
                    && self.has_provider(suggestion.provider)
                    && boundary.is_none_or(|trust_mode| {
                        provider_matches_trust_mode(suggestion.provider, trust_mode)
                    })
                {
                    order.push(RouteCandidate {
                        strategy: None,
                        provider: suggestion.provider,
                        model: suggestion.model,
                        reason: "context-signal",
                    });
                }
            }
        }

        let task_type = classify_request(request);
        let registry_task = classify_registry_task(request, preferences.context.as_ref());
        let plan_tier = preferences.context.as_ref().map(|c| c.plan_tier.as_str());
        // `boundary` is always `Some` now (see `effective_trust_mode`'s fail-closed
        // default), but keep the fallback fail-closed to `Local` rather than the
        // old permissive `Byok` default in case that invariant ever changes.
        let trust_mode = boundary.unwrap_or(TrustMode::Local);
        let mut strategy_set = self.strategy_order(
            task_type,
            registry_task,
            preferences.strategy,
            plan_tier,
            trust_mode,
        );

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

        // Auto policy is authoritative. Do not append legacy provider defaults
        // after an unavailable policy decision; doing so could bypass capability,
        // tier, or trust-boundary admission.
        if is_auto_strategy {
            if let Some(trust_mode) = boundary {
                order.retain(|candidate| {
                    provider_matches_trust_mode(candidate.provider, trust_mode)
                });
            }
            return order;
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
            Provider::Together,
            Provider::Fireworks,
            Provider::Cerebras,
            Provider::DeepInfra,
            Provider::Cohere,
            Provider::AI21,
            Provider::Sambanova,
            Provider::Azure,
            Provider::Bedrock,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Minimax,
            Provider::Perplexity,
            Provider::Ollama,
            Provider::LmStudio,
            Provider::LlamaCpp,
            Provider::Vllm,
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

        // Demote rate-limited providers to the end of the candidate list
        // so non-limited providers are tried first, but rate-limited ones
        // remain as last-resort fallbacks.
        if let Some(ref tracker) = self.rate_limit_tracker {
            let (ok, limited): (Vec<_>, Vec<_>) = order
                .into_iter()
                .partition(|c| !tracker.is_rate_limited(c.provider, Some(&c.model)));
            order = ok;
            order.extend(limited);
        }

        if let Some(trust_mode) = boundary {
            order.retain(|candidate| provider_matches_trust_mode(candidate.provider, trust_mode));
        }

        // LOCAL-CHAT-NOINVOKE-01 diagnostics: an empty list here (especially with
        // preferred=Some(Ollama) and local_only=true) means the send is dropped before
        // any /api/chat. `preferred=Some(Ollama)` + count=0 => has_provider(Ollama) was
        // false at routing time; `preferred=None` + count=0 => provider was not forwarded
        // and the Auto path found no local candidate.
        tracing::info!(
            target: "chat",
            candidate_count = order.len(),
            preferred = ?preferences.provider,
            local_only = preferences.local_only,
            trust_mode = ?boundary,
            "router candidates assembled"
        );

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
                        let saved_cost = cached_response.cost.unwrap_or(0.0);

                        let _ = cache_manager.update_cache_hit(
                            &conn,
                            &cache_key,
                            prompt_tokens + completion_tokens,
                            saved_cost,
                        );

                        tracing::info!(
                            "Cache hit for {}/{} - saved {} tokens, ${:.4}",
                            candidate.provider.as_string(),
                            candidate.model,
                            prompt_tokens + completion_tokens,
                            saved_cost
                        );

                        let mut response = cached_response;
                        response.cached = true;
                        // The cached response's stored cost is historical: it
                        // measures what the original provider request cost and
                        // is useful for cache-savings telemetry. Serving this
                        // response incurs no new provider request, so the
                        // current request's authoritative cost is zero.
                        response.cost = Some(0.0);

                        return Ok(RouteOutcome {
                            provider: candidate.provider,
                            model: response.model.clone(),
                            response,
                            prompt_tokens,
                            completion_tokens,
                            cost: 0.0,
                        });
                    }
                }
            }
        }

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
        }

        enforce_daily_budget()?;

        let provider = self
            .providers
            .get(&candidate.provider)
            .ok_or_else(|| anyhow!("Provider {:?} not configured", candidate.provider))?;

        let mut routed_request = request.clone();

        if let Some(strategy) = candidate.strategy {
            return Err(anyhow!(
                "Unresolved routing strategy {:?} reached provider execution; Auto candidates must be resolved by the canonical policy",
                strategy
            ));
        } else if candidate.model == "auto" {
            // Check if strategy is somehow missing but model is auto (fallback)
            // Use a safe default from the active model catalog.
            routed_request.model =
                crate::core::llm::models_config::get_default_model(&candidate.provider).to_string();
        } else {
            routed_request.model = normalize_model_id(&candidate.model);
        }

        // Enforce output protocol to prevent XML/tool-tag leakage
        crate::core::llm::prompt_policy::apply_no_xml_rule(&mut routed_request);

        // Strip tools for providers that don't support function calling (e.g. Perplexity).
        // The per-provider adapter also strips them at serialization time, but doing it here
        // makes the intent explicit and avoids building/serializing a tool list unnecessarily.
        if !provider.supports_function_calling() {
            if routed_request.tools.is_some() {
                tracing::debug!(
                    provider = %candidate.provider.as_string(),
                    "Provider does not support function calling, stripping tools from request"
                );
            }
            routed_request.tools = None;
            routed_request.tool_choice = None;
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
            // Price this request on today's date: the router is long-lived, so
            // the date must be read per request, not captured at construction.
            let cost = self.cost_calculator.calculate_with_cache(
                candidate.provider,
                &response.model,
                prompt_tokens,
                completion_tokens,
                response.cache_read_input_tokens.unwrap_or(0),
                response.cache_creation_input_tokens.unwrap_or(0),
                chrono::Utc::now().date_naive(),
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

        // The provider already completed this request, so its cost must remain
        // in the cumulative ledger even when this response crosses the
        // defense-in-depth cap and is withheld from the caller.
        record_non_streaming_cost(&self.cumulative_cost, outcome.cost)?;

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

                    if is_auth_error(&error_str) {
                        let friendly =
                            rewrite_auth_error(&error_str, candidate.provider.as_string());
                        tracing::warn!(
                            provider = %candidate.provider.as_string(),
                            "Auth error detected, not retrying"
                        );
                        last_error = Some(anyhow!(friendly));
                        break;
                    }

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
            // LOCAL-CHAT-NOINVOKE-01 defense-in-depth: in Local mode the user DOES
            // have a provider configured (Ollama), so the generic message is
            // misleading and hides the real cause (the local runtime is unreachable
            // or no local model is installed/selected). Surface that specifically so
            // the failure is diagnosable instead of a silent/confusing drop.
            let message = if preferences.local_only {
                local_only_no_candidate_message(preferences.provider)
            } else {
                "No LLM providers configured"
            };
            return Err(anyhow!(message));
        }

        let max_candidates = if config.try_fallback_candidates {
            candidates.len()
        } else {
            1
        };

        let mut last_error: Option<anyhow::Error> = None;
        let mut all_rate_limited = true;
        let mut any_attempted = false;
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

            let has_structured_output = request.output_config.is_some();
            let has_effort = request.effort.is_some();
            tracing::info!(
                provider = %candidate.provider.as_string(),
                model = %candidate.model,
                candidate_index = idx,
                total_candidates = candidates.len(),
                structured_output = has_structured_output,
                effort = has_effort,
                "Attempting LLM request"
            );

            any_attempted = true;

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
                    all_rate_limited &= is_rate_limit_error(&err_str);
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

        // User-friendly message when every attempted provider hit 429
        if all_rate_limited && any_attempted && last_error.is_some() {
            return Err(anyhow!(
                "All AI providers are currently busy. Please try again in a moment."
            ));
        }
        if candidates_skipped_rate_limit > 0 && last_error.is_none() {
            return Err(anyhow!(
                "Rate limited, please wait ~60 seconds and try again, or switch to a different model."
            ));
        }

        Err(last_error.unwrap_or_else(|| anyhow!("All LLM providers failed")))
    }

    #[allow(clippy::only_used_in_recursion)]
    fn strategy_order(
        &self,
        task: TaskCategory,
        registry_task: RegistryRoutingTaskType,
        strategy: RoutingStrategy,
        plan_tier: Option<&str>,
        trust_mode: TrustMode,
    ) -> Vec<RouteCandidate> {
        match strategy {
            RoutingStrategy::LocalFirst => {
                let mut candidates = Vec::new();
                let local_model = super::models_config::get_default_model(&Provider::Ollama);
                if !local_model.is_empty() {
                    candidates.push(RouteCandidate {
                        strategy: None,
                        provider: Provider::Ollama,
                        model: local_model.to_string(),
                        reason: "strategy-local-first",
                    });
                }
                candidates.push(RouteCandidate {
                    strategy: None,
                    provider: Provider::ManagedCloud,
                    model: "managed-cloud-auto".to_string(),
                    reason: "strategy-local-first-fallback",
                });
                candidates
            }
            RoutingStrategy::CostOptimized => match task {
                TaskCategory::Simple => vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Google,
                        model: super::models_config::get_task_model(
                            &Provider::Google,
                            "fast_completion",
                        )
                        .to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::OpenAI,
                        model: super::models_config::get_task_model(
                            &Provider::OpenAI,
                            "fast_completion",
                        )
                        .to_string(),
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
                        model: super::models_config::get_task_model(
                            &Provider::OpenAI,
                            "complex_reasoning",
                        )
                        .to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Anthropic,
                        model: super::models_config::get_task_model(&Provider::Anthropic, "chat")
                            .to_string(),
                        reason: "strategy-cost",
                    },
                ],
                TaskCategory::Creative => vec![
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::Google,
                        model: super::models_config::get_task_model(&Provider::Google, "chat")
                            .to_string(),
                        reason: "strategy-cost",
                    },
                    RouteCandidate {
                        strategy: None,
                        provider: Provider::OpenAI,
                        model: super::models_config::get_task_model(
                            &Provider::OpenAI,
                            "fast_completion",
                        )
                        .to_string(),
                        reason: "strategy-cost",
                    },
                ],
            },
            RoutingStrategy::LatencyOptimized => vec![
                RouteCandidate {
                    strategy: None,
                    provider: Provider::OpenAI,
                    model: super::models_config::get_task_model(
                        &Provider::OpenAI,
                        "fast_completion",
                    )
                    .to_string(),
                    reason: "strategy-latency",
                },
                RouteCandidate {
                    strategy: None,
                    provider: Provider::Google,
                    model: super::models_config::get_task_model(
                        &Provider::Google,
                        "fast_completion",
                    )
                    .to_string(),
                    reason: "strategy-latency",
                },
            ],
            RoutingStrategy::Auto => {
                // Auto maps to different strategies based on plan tier
                let strategy = if matches!(
                    plan_tier,
                    Some("free") | Some("basic") | Some("hobby") | Some("standard")
                ) {
                    RoutingStrategy::AutoEconomy
                } else if matches!(plan_tier, Some("pro") | Some("professional")) {
                    RoutingStrategy::AutoBalanced
                } else {
                    RoutingStrategy::AutoPremium
                };
                self.strategy_order(task, registry_task, strategy, plan_tier, trust_mode)
            }
            RoutingStrategy::AutoEconomy
            | RoutingStrategy::AutoBalanced
            | RoutingStrategy::AutoPremium => {
                self.auto_policy_candidate(strategy, registry_task, plan_tier, trust_mode)
            }
        }
    }

    fn auto_policy_candidate(
        &self,
        strategy: RoutingStrategy,
        task_type: RegistryRoutingTaskType,
        plan_tier: Option<&str>,
        trust_mode: TrustMode,
    ) -> Vec<RouteCandidate> {
        let selection = match strategy {
            RoutingStrategy::Auto | RoutingStrategy::AutoBalanced => "auto-balanced",
            RoutingStrategy::AutoEconomy => "auto-economy",
            RoutingStrategy::AutoPremium => "auto-premium",
            _ => return Vec::new(),
        };
        let runtime_profile_id = match trust_mode {
            TrustMode::ManagedCloud => "desktop/cloud-chat",
            TrustMode::Byok => "desktop/byok-chat",
            TrustMode::Local | TrustMode::OnDevice => "desktop/local-chat",
        };
        let request = AutoRoutingRequest {
            selection: Some(selection),
            task_type,
            subscription_tier: plan_tier,
            trust_mode,
            runtime_profile_id: Some(runtime_profile_id),
            ..AutoRoutingRequest::default()
        };

        match resolve_auto_route(&request) {
            Ok(AutoRouteDecision::Selected(selected)) => {
                let provider = if trust_mode == TrustMode::ManagedCloud {
                    Provider::ManagedCloud
                } else if let Some(provider) = Provider::from_string(&selected.provider) {
                    provider
                } else {
                    tracing::warn!(
                        provider = %selected.provider,
                        model = %selected.model_key,
                        "Auto policy selected a provider unsupported by the Desktop runtime"
                    );
                    return Vec::new();
                };

                if !self.has_provider(provider) {
                    tracing::warn!(
                        provider = %provider.as_string(),
                        model = %selected.model_key,
                        "Auto policy route is eligible but its Desktop transport is not configured"
                    );
                    return Vec::new();
                }

                vec![RouteCandidate {
                    strategy: None,
                    provider,
                    model: selected.provider_model_id,
                    reason: "canonical-auto-policy",
                }]
            }
            Ok(AutoRouteDecision::Unavailable(unavailable)) => {
                tracing::warn!(
                    code = ?unavailable.code,
                    reasons = ?unavailable.reasons,
                    "Canonical Auto policy found no eligible Desktop route"
                );
                self.runtime_profile_harness_candidates(runtime_profile_id, trust_mode)
            }
            Err(error) => {
                tracing::error!(error = %error, "Failed to load canonical Auto policy");
                Vec::new()
            }
        }
    }

    fn runtime_profile_harness_candidates(
        &self,
        runtime_profile_id: &str,
        trust_mode: TrustMode,
    ) -> Vec<RouteCandidate> {
        let profile = match agiworkforce_model_registry::runtime_profile(runtime_profile_id) {
            Ok(Some(profile)) => profile,
            Ok(None) => return Vec::new(),
            Err(error) => {
                tracing::error!(
                    error = %error,
                    "Failed to load the runtime profile harness fallback"
                );
                return Vec::new();
            }
        };

        let mut candidates: Vec<RouteCandidate> = Vec::new();
        for harness_id in &profile.allowed_harness_ids {
            let Some((provider_key, _)) = harness_id.split_once('/') else {
                continue;
            };
            let Some(provider) = Provider::from_string(provider_key) else {
                continue;
            };
            if !provider_matches_trust_mode(provider, trust_mode) {
                continue;
            }
            if !self.has_provider(provider) {
                continue;
            }
            if candidates
                .iter()
                .any(|candidate| candidate.provider == provider)
            {
                continue;
            }
            candidates.push(RouteCandidate {
                strategy: None,
                provider,
                model: super::models_config::get_default_model(&provider).to_string(),
                reason: "runtime-profile-harness",
            });
        }
        candidates
    }

    /// Default model selection for each provider and task category.
    ///
    /// Provider defaults are catalog-backed. Keep model upgrades in
    /// `packages/ai/model-registry/catalog/models.curation.json` and regenerate `models.json`
    /// instead of copying provider model IDs into router logic.
    fn default_model(&self, provider: Provider, task: TaskCategory) -> String {
        super::models_config::get_task_model(&provider, task_category_to_routing_key(task))
            .to_string()
    }
}

#[cfg(test)]
mod streaming_cost_guard_tests {
    use super::*;
    use crate::core::llm::sse_parser::TokenUsage;

    fn priced_model() -> (&'static str, Provider) {
        let model = crate::core::llm::models_config::config()
            .models
            .values()
            .find(|entry| {
                entry.provider == Provider::Anthropic.as_string()
                    && entry.deprecated != Some(true)
                    && entry.input_cost > 0.0
                    && entry.output_cost > 0.0
            })
            .expect("catalog must contain an active paid model for streaming tests");
        (model.id.as_str(), Provider::Anthropic)
    }

    fn usage_chunk(content: &str, usage: TokenUsage) -> StreamChunk {
        StreamChunk {
            content: content.to_string(),
            done: false,
            finish_reason: None,
            model: None,
            usage: Some(usage),
            credits: None,
            tool_calls: None,
            reasoning: None,
            keepalive: false,
        }
    }

    fn guard(
        calculator: CostCalculator,
        cumulative_cost: Arc<parking_lot::Mutex<f64>>,
        model: &str,
        provider: Provider,
        fallback_prompt_tokens: u32,
    ) -> StreamingCostGuard {
        StreamingCostGuard {
            calculator,
            cumulative_cost,
            provider,
            model: model.to_string(),
            fallback_prompt_tokens,
            fallback_completion_tokens: 0,
            latest_usage: None,
            latest_authoritative_cost: None,
            priced_on: chrono::NaiveDate::from_ymd_opt(2026, 9, 1)
                .expect("valid fixed pricing date"),
            recorded: false,
        }
    }

    #[test]
    fn partial_then_final_usage_records_final_output_exactly_once() {
        let calculator = CostCalculator::new();
        let cumulative = Arc::new(parking_lot::Mutex::new(0.0));
        let (model, provider) = priced_model();
        let mut guard = guard(
            calculator.clone(),
            Arc::clone(&cumulative),
            model,
            provider,
            1_000,
        );
        guard.observe(&usage_chunk(
            "",
            TokenUsage {
                prompt_tokens: Some(1_000),
                completion_tokens: Some(0),
                total_tokens: Some(1_000),
                cache_read_input_tokens: None,
                cache_creation_input_tokens: None,
            },
        ));
        guard.observe(&usage_chunk(
            "final output",
            TokenUsage {
                prompt_tokens: None,
                completion_tokens: Some(500),
                total_tokens: Some(1_500),
                cache_read_input_tokens: None,
                cache_creation_input_tokens: None,
            },
        ));

        guard
            .record(true)
            .expect("final usage should remain under the cap");
        let expected =
            calculator.calculate_with_cache(provider, model, 1_000, 500, 0, 0, guard.priced_on);
        assert!((*cumulative.lock() - expected).abs() < 1e-12);
        guard.record(true).expect("a second record must be a no-op");
        assert!((*cumulative.lock() - expected).abs() < 1e-12);
    }

    #[test]
    fn managed_credit_cost_overrides_catalog_estimate() {
        let calculator = CostCalculator::new();
        let cumulative = Arc::new(parking_lot::Mutex::new(0.0));
        let (model, _) = priced_model();
        let mut guard = guard(
            calculator.clone(),
            Arc::clone(&cumulative),
            model,
            Provider::ManagedCloud,
            1_000,
        );
        let authoritative_cost = 0.1234;
        let mut chunk = usage_chunk(
            "managed response",
            TokenUsage {
                prompt_tokens: Some(1_000),
                completion_tokens: Some(500),
                total_tokens: Some(1_500),
                cache_read_input_tokens: None,
                cache_creation_input_tokens: None,
            },
        );
        chunk.credits = Some(crate::core::llm::CreditsInfo {
            cost_cents: authoritative_cost * 100.0,
            remaining_cents: 100.0,
            daily_limit: None,
            daily_used: None,
            daily_remaining: None,
            daily_reset_at: None,
        });
        guard.observe(&chunk);

        let catalog_estimate =
            calculator.calculate(Provider::ManagedCloud, model, 1_000, 500, guard.priced_on);
        assert_ne!(catalog_estimate, authoritative_cost);
        guard
            .record(true)
            .expect("authoritative managed charge should remain below the cap");
        assert!((*cumulative.lock() - authoritative_cost).abs() < 1e-12);
    }

    #[test]
    fn dropped_stream_keeps_partial_usage_and_locally_observed_output() {
        let calculator = CostCalculator::new();
        let cumulative = Arc::new(parking_lot::Mutex::new(0.0));
        let (model, provider) = priced_model();
        let content = "observed streamed output before cancellation";
        let observed_output = u32::try_from(TokenCounter::estimate_text_tokens(content))
            .expect("test output estimate must fit");
        let priced_on =
            chrono::NaiveDate::from_ymd_opt(2026, 9, 1).expect("valid fixed pricing date");
        {
            let mut guard = guard(
                calculator.clone(),
                Arc::clone(&cumulative),
                model,
                provider,
                1_000,
            );
            guard.observe(&usage_chunk(
                content,
                TokenUsage {
                    prompt_tokens: Some(1_000),
                    completion_tokens: Some(0),
                    total_tokens: Some(1_000),
                    cache_read_input_tokens: Some(100),
                    cache_creation_input_tokens: None,
                },
            ));
        }

        let expected = calculator.calculate_with_cache(
            provider,
            model,
            1_000,
            observed_output,
            100,
            0,
            priced_on,
        );
        assert!((*cumulative.lock() - expected).abs() < 1e-12);
    }

    #[test]
    fn dropped_stream_uses_observed_output_above_nonzero_partial_usage() {
        let calculator = CostCalculator::new();
        let cumulative = Arc::new(parking_lot::Mutex::new(0.0));
        let (model, provider) = priced_model();
        let content = "enough observed streamed output to exceed one partial token";
        let observed_output = u32::try_from(TokenCounter::estimate_text_tokens(content))
            .expect("test output estimate must fit");
        assert!(
            observed_output > 1,
            "fixture must exceed partial provider usage"
        );
        let priced_on =
            chrono::NaiveDate::from_ymd_opt(2026, 9, 1).expect("valid fixed pricing date");
        {
            let mut guard = guard(
                calculator.clone(),
                Arc::clone(&cumulative),
                model,
                provider,
                1_000,
            );
            guard.observe(&usage_chunk(
                content,
                TokenUsage {
                    prompt_tokens: Some(1_000),
                    completion_tokens: Some(1),
                    total_tokens: Some(1_001),
                    cache_read_input_tokens: None,
                    cache_creation_input_tokens: None,
                },
            ));
        }

        let expected = calculator.calculate_with_cache(
            provider,
            model,
            1_000,
            observed_output,
            0,
            0,
            priced_on,
        );
        assert!((*cumulative.lock() - expected).abs() < 1e-12);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TaskCategory {
    Simple,
    Complex,
    Creative,
}

fn task_category_to_routing_key(task: TaskCategory) -> &'static str {
    match task {
        TaskCategory::Simple => "fast_completion",
        TaskCategory::Complex => "chat",
        TaskCategory::Creative => "vision",
    }
}

fn provider_task_model(provider: Provider, task: &'static str) -> String {
    super::models_config::get_task_model(&provider, task).to_string()
}

/// Perplexity search model for a catalog `qualityTier`.
///
/// Perplexity's `taskRouting` points every chat-shaped task at the deep-research
/// model, so quick search cannot read it without picking up deep research's
/// latency and price. The search tiers come off the catalog's own `modelType`
/// and `qualityTier` instead.
///
/// The tier is what carries the protection; the fallback does not. A catalog
/// that stopped declaring a tier would land both intents on Perplexity's
/// `defaultModel`, i.e. quick search would inherit
/// deep-research cost. `models_config`'s
/// `get_model_by_type_and_tier_resolves_non_chat_modalities` asserts both tiers
/// resolve and differ, so that is a catalog regression the test suite catches
/// rather than a state this function is expected to reach.
fn perplexity_search_model(quality_tier: &'static str) -> String {
    super::models_config::get_model_by_type_and_tier(&Provider::Perplexity, "search", quality_tier)
        .unwrap_or_else(|| super::models_config::get_default_model(&Provider::Perplexity))
        .to_string()
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

fn classify_registry_task(
    request: &LLMRequest,
    context: Option<&RouterContext>,
) -> RegistryRoutingTaskType {
    if let Some(context) = context {
        if context.requires_vision {
            return RegistryRoutingTaskType::Multimodal;
        }
        if context.token_estimate >= 50_000 {
            return RegistryRoutingTaskType::LongContext;
        }
        if let Some(intent) = context
            .intent_type
            .as_deref()
            .or(context.model_category.as_deref())
        {
            match intent.trim().to_ascii_lowercase().as_str() {
                "coding" | "code" => return RegistryRoutingTaskType::Coding,
                "reasoning" | "analysis" | "planning" => {
                    return RegistryRoutingTaskType::Reasoning;
                }
                "creative" | "creative-writing" | "writing" => {
                    return RegistryRoutingTaskType::CreativeWriting;
                }
                "multimodal" | "vision" => return RegistryRoutingTaskType::Multimodal,
                "search" | "research" | "deep-research" => {
                    return RegistryRoutingTaskType::Research;
                }
                "agentic" | "tool-use" => return RegistryRoutingTaskType::Agentic,
                "computer-use" | "computer_use" => {
                    return RegistryRoutingTaskType::ComputerUse;
                }
                "image-gen" | "image_generation" | "image" => {
                    return RegistryRoutingTaskType::ImageGeneration;
                }
                "simple-chat" | "simple_chat" => return RegistryRoutingTaskType::SimpleChat,
                _ => {}
            }
        }
    }

    if request
        .messages
        .iter()
        .any(|message| message.multimodal_content.is_some())
    {
        return RegistryRoutingTaskType::Multimodal;
    }
    if TokenCounter::estimate_prompt_tokens(&request.messages) >= 50_000 {
        return RegistryRoutingTaskType::LongContext;
    }

    let last_user_text = request
        .messages
        .iter()
        .rev()
        .find(|message| message.role.eq_ignore_ascii_case("user"))
        .map(|message| message.content.to_ascii_lowercase())
        .unwrap_or_default();
    if contains_word(&last_user_text, "code")
        || last_user_text.contains("coding")
        || contains_word(&last_user_text, "function")
        || contains_word(&last_user_text, "debug")
    {
        RegistryRoutingTaskType::Coding
    } else if last_user_text.contains("analyze")
        || last_user_text.contains("analysis")
        || contains_word(&last_user_text, "plan")
        || contains_word(&last_user_text, "reason")
    {
        RegistryRoutingTaskType::Reasoning
    } else if contains_word(&last_user_text, "design")
        || contains_word(&last_user_text, "story")
        || last_user_text.contains("creative")
        || last_user_text.contains("write a poem")
    {
        RegistryRoutingTaskType::CreativeWriting
    } else {
        RegistryRoutingTaskType::General
    }
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
            // LOCAL-CHAT-NOINVOKE-01 defense-in-depth: in Local mode the user DOES
            // have a provider configured (Ollama), so the generic message is
            // misleading and hides the real cause (the local runtime is unreachable
            // or no local model is installed/selected). Surface that specifically so
            // the failure is diagnosable instead of a silent/confusing drop.
            let message = if preferences.local_only {
                local_only_no_candidate_message(preferences.provider)
            } else {
                "No LLM providers configured"
            };
            return Err(anyhow!(message));
        }

        let max_candidates = if config.try_fallback_candidates {
            candidates.len()
        } else {
            1
        };

        let mut last_error: Option<anyhow::Error> = None;
        let mut all_rate_limited = true;
        let mut any_attempted = false;
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

            let has_structured_output = request.output_config.is_some();
            let has_effort = request.effort.is_some();
            tracing::info!(
                provider = %candidate.provider.as_string(),
                model = %candidate.model,
                candidate_index = idx,
                total_candidates = candidates.len(),
                structured_output = has_structured_output,
                effort = has_effort,
                "Attempting streaming LLM request"
            );

            any_attempted = true;

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
                    // Wrap the raw stream with a per-chunk idle timeout so that if
                    // the provider goes silent (stops sending chunks without closing
                    // the connection) the frontend does not freeze indefinitely.
                    //
                    // The unfold state carries the active stream plus fallback
                    // output-token estimates and a one-shot metering flag. `None`
                    // after an idle timeout or cap error drops the connection
                    // immediately. Final provider usage wins over the estimates.
                    let provider_name = candidate.provider.as_string().to_string();
                    let cost_guard = StreamingCostGuard {
                        calculator: self.cost_calculator.clone(),
                        cumulative_cost: Arc::clone(&self.cumulative_cost),
                        provider: candidate.provider,
                        model: candidate.model.clone(),
                        fallback_prompt_tokens: u32::try_from(
                            TokenCounter::estimate_prompt_tokens(&request.messages),
                        )
                        .unwrap_or(u32::MAX),
                        fallback_completion_tokens: 0,
                        latest_usage: None,
                        latest_authoritative_cost: None,
                        priced_on: chrono::Utc::now().date_naive(),
                        recorded: false,
                    };
                    let wrapped = futures_util::stream::unfold(
                        Some((stream, cost_guard)),
                        move |state| {
                            let provider_name = provider_name.clone();
                            async move {
                                let (mut stream, mut cost_guard) = state?;
                                match tokio::time::timeout(CHUNK_IDLE_TIMEOUT, stream.next()).await
                                {
                                    Ok(Some(item)) => {
                                        let mut metering_error = None;
                                        if let Ok(chunk) = &item {
                                            cost_guard.observe(chunk);
                                        } else {
                                            // A provider-side stream error may be the last item the
                                            // consumer polls. Record observed usage now rather than
                                            // relying only on the guard's drop fallback.
                                            metering_error = cost_guard.record(false).err();
                                        }

                                        if let Some(error) = metering_error {
                                            let error: Box<dyn std::error::Error + Send + Sync> =
                                                error.to_string().into();
                                            return Some((Err(error), None));
                                        }
                                        Some((item, Some((stream, cost_guard))))
                                    }
                                    Ok(None) => match cost_guard.record(true) {
                                        Ok(()) => None,
                                        Err(error) => {
                                            let error: Box<dyn std::error::Error + Send + Sync> =
                                                error.to_string().into();
                                            Some((Err(error), None))
                                        }
                                    },
                                    Err(_elapsed) => {
                                        if let Err(error) = cost_guard.record(false) {
                                            tracing::error!(
                                                error = %error,
                                                "streaming cost cap crossed while handling idle timeout"
                                            );
                                        }
                                        let model_name = cost_guard.model.clone();
                                        let timeout_secs = CHUNK_IDLE_TIMEOUT.as_secs();
                                        tracing::error!(
                                            provider = %provider_name,
                                            model = %model_name,
                                            idle_timeout_secs = timeout_secs,
                                            "Streaming idle timeout: provider went silent \
                                             for {timeout_secs}s with no data, closing connection"
                                        );
                                        let err: Box<dyn std::error::Error + Send + Sync> =
                                            format!(
                                                "StreamingError::IdleTimeout, no data received \
                                                 for {timeout_secs}s (provider: {provider_name}, \
                                                 model: {model_name}). The connection has been \
                                                 closed. This is distinct from a network/connection \
                                                 timeout; the connection was open but the provider \
                                                 stopped sending data."
                                            )
                                            .into();
                                        // Yield the error and set state to None so the
                                        // next poll terminates the stream (and drops the
                                        // inner stream, closing the HTTP connection).
                                        Some((Err(err), None))
                                    }
                                }
                            }
                        },
                    );
                    return Ok(Box::pin(wrapped));
                }
                Err(e) => {
                    let err_str = e.to_string();
                    all_rate_limited &= is_rate_limit_error(&err_str);
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

        // User-friendly message when every attempted provider hit 429
        if all_rate_limited && any_attempted && last_error.is_some() {
            return Err(anyhow!(
                "All AI providers are currently busy. Please try again in a moment."
            ));
        }
        if candidates_skipped_rate_limit > 0 && last_error.is_none() {
            return Err(anyhow!(
                "Rate limited, please wait ~60 seconds and try again, or switch to a different model."
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

        if let Some(strategy) = candidate.strategy {
            return Err(anyhow!(
                "Unresolved routing strategy {:?} reached streaming provider execution; Auto candidates must be resolved by the canonical policy",
                strategy
            ));
        } else if candidate.model == "auto" {
            // Check if strategy is somehow missing but model is auto (fallback)
            // Use a safe default from the active model catalog.
            routed_request.model =
                crate::core::llm::models_config::get_default_model(&candidate.provider).to_string();
        } else {
            routed_request.model = normalize_model_id(&candidate.model);
        }

        routed_request.stream = true;

        // Strip tools for providers that don't support function calling (e.g. Perplexity).
        // Mirrors the guard in invoke_candidate; keeps both paths consistent and avoids
        // sending tool definitions that will just be stripped by the adapter anyway.
        if !provider.supports_function_calling() {
            if routed_request.tools.is_some() {
                tracing::debug!(
                    provider = %candidate.provider.as_string(),
                    "Provider does not support function calling, stripping tools from streaming request"
                );
            }
            routed_request.tools = None;
            routed_request.tool_choice = None;
        }

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

            enforce_daily_budget()?;

            let prompt_tokens = TokenCounter::estimate_prompt_tokens(&request.messages);
            let estimated_input_cost = self.cost_calculator.calculate(
                candidate.provider,
                &routed_request.model,
                prompt_tokens,
                0, // output tokens unknown at this point; guard on input alone
                chrono::Utc::now().date_naive(),
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

        let stream_timeout = compute_streaming_timeout(&request.messages, request.tools.as_deref());

        for attempt in 0..=retry_config.max_retries {
            tracing::info!(
                "Starting streaming request to {} with model {} (attempt {}/{}), stream_timeout={:?}",
                provider.name(),
                candidate.model,
                attempt + 1,
                retry_config.max_retries + 1,
                stream_timeout
            );

            // Add timeout to the streaming connection attempt
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

                    if is_auth_error(&error_str) {
                        let friendly =
                            rewrite_auth_error(&error_str, candidate.provider.as_string());
                        tracing::warn!(
                            provider = %candidate.provider.as_string(),
                            "Auth error detected in streaming path, not retrying"
                        );
                        last_error = Some(anyhow!(friendly));
                        break;
                    }

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
