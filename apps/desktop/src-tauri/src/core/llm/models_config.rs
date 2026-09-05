//! Single-source-of-truth model catalog loaded from `models.json`.
//!
//! All model metadata (IDs, pricing, context windows, SSE delimiters, token
//! multipliers, canonicalization maps, task routing) lives in one JSON file
//! shared between the Rust backend and TS frontend.  This module deserializes
//! it at startup via `include_str!` and exposes lookup helpers consumed by
//! `sse_parser`, `token_counter`, `llm_router`, `provider_adapter`,
//! `cost_calculator`, and `sys/commands/llm`.

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

use super::Provider;

// ---------------------------------------------------------------------------
// Embedded JSON (compile-time)
// ---------------------------------------------------------------------------

/// The raw JSON string, embedded at compile time.
/// Path is relative to this .rs file:
///   src-tauri/src/core/llm/models_config.rs  ->  ../../../../../packages/contracts/types/src/models.json
const MODELS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../packages/contracts/types/src/models.json"
));

/// Global singleton for the loaded models config.
pub static CONFIG: LazyLock<ModelsConfig> = LazyLock::new(|| {
    serde_json::from_str(MODELS_JSON).expect("models.json is invalid -- check JSON syntax")
});

// ---------------------------------------------------------------------------
// Serde structs
// ---------------------------------------------------------------------------

/// Top-level config loaded from models.json.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelsConfig {
    pub version: u32,
    pub last_updated: String,
    pub providers: HashMap<String, ProviderConfig>,
    pub models: HashMap<String, ModelEntry>,
    #[serde(default)]
    pub provider_defaults: HashMap<String, HashMap<String, String>>,
    pub providers_in_order: Vec<String>,
}

/// Per-provider metadata.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub label: String,
    pub sse_delimiter: String,
    pub token_multiplier: TokenMultiplier,
    pub default_pricing: PricingEntry,
    #[serde(default)]
    pub model_prefixes: Vec<String>,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    pub default_model: Option<String>,
    #[serde(default)]
    pub task_routing: Option<TaskRouting>,
    #[serde(default)]
    pub canonicalization: HashMap<String, String>,
}

/// Token estimation multipliers (prompt / completion).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TokenMultiplier {
    pub prompt: f64,
    pub completion: f64,
}

/// Catalog `cachePolicy`, only the fields cost calculation needs.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachePolicyEntry {
    #[serde(default)]
    pub write_multiplier: Option<f64>,
    #[serde(default)]
    pub read_discount: Option<f64>,
}

/// Pricing per million tokens.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingEntry {
    pub input_per_million: f64,
    pub output_per_million: f64,
    /// Absolute per-million price for a cache READ, straight from the catalog's
    /// `cached_input`. `None` when the model prices no cache read, in which case
    /// callers must fall back to the full input rate rather than guessing a
    /// discount. Carrying the real number matters: the cost calculator used to
    /// hardcode 0.5x the input rate for OpenAI and Managed Cloud, while current
    /// catalog entries can price cache reads at 0.1x, a 5x overcharge if ignored.
    #[serde(default)]
    pub cache_read_per_million: Option<f64>,
    /// Multiplier applied to the input rate when WRITING a cache entry, from
    /// `cachePolicy.writeMultiplier`. `None` means the model does not price
    /// cache writes separately.
    #[serde(default)]
    pub cache_write_multiplier: Option<f64>,
    /// Absolute per-million price of a cache WRITE, from the catalog's
    /// `cached_write`. Preferred over `cache_write_multiplier` because it is the
    /// provider's published number rather than a derived one. `None` means the
    /// model declares no write price, and callers must NOT invent a surcharge.
    #[serde(default)]
    pub cache_write_per_million: Option<f64>,
}

/// Absolute per-million rates applied when a request's prompt exceeds the
/// catalog threshold. The threshold is strict: exactly `threshold_tokens`
/// remains on the base tier and the next token switches the whole request.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LongContextPricing {
    pub threshold_tokens: u64,
    pub input_cost: f64,
    pub output_cost: f64,
    #[serde(default, rename = "cached_input")]
    pub cached_input: Option<f64>,
    #[serde(default, rename = "cached_write")]
    pub cached_write: Option<f64>,
    #[serde(default, rename = "cached_write_1h")]
    pub cached_write_1h: Option<f64>,
}

/// One dated pricing window from the catalog's `pricingSchedule`.
///
/// A window is a dated `costOverride`: it applies while
/// `effectiveFrom <= date <= effectiveUntil`, both bounds inclusive and both
/// optional (an absent bound is open-ended on that side). Dates are catalog ISO
/// `YYYY-MM-DD` strings; parsing failures make a window inapplicable rather than
/// silently shifting a price.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingWindowEntry {
    #[serde(default)]
    pub effective_from: Option<String>,
    #[serde(default)]
    pub effective_until: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub input_cost: Option<f64>,
    #[serde(default)]
    pub output_cost: Option<f64>,
    #[serde(default, rename = "cached_input")]
    pub cached_input: Option<f64>,
    #[serde(default, rename = "cached_write")]
    pub cached_write: Option<f64>,
    #[serde(default, rename = "cached_write_1h")]
    pub cached_write_1h: Option<f64>,
}

/// Per-task model routing for a provider.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct TaskRouting {
    pub fast_completion: Option<String>,
    pub code_generation: Option<String>,
    pub complex_reasoning: Option<String>,
    pub chat: Option<String>,
    pub vision: Option<String>,
    pub long_context: Option<String>,
    #[serde(default)]
    pub computer_use: Option<String>,
}

impl TaskRouting {
    /// Look up a model for a snake_case task name.
    pub fn get_model(&self, task: &str) -> Option<&str> {
        match task {
            "fast_completion" => self.fast_completion.as_deref(),
            "code_generation" => self.code_generation.as_deref(),
            "complex_reasoning" => self.complex_reasoning.as_deref(),
            "chat" => self.chat.as_deref(),
            "vision" => self.vision.as_deref(),
            "long_context" => self.long_context.as_deref(),
            "computer_use" => self.computer_use.as_deref(),
            _ => None,
        }
    }
}

/// A single model entry from the catalog.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    #[serde(default)]
    pub api_model_id: Option<String>,
    pub name: String,
    pub provider: String,
    pub model_type: String,
    #[serde(default)]
    pub input_modalities: Vec<String>,
    /// Token context is meaningful only for prompt-consuming models. Media
    /// generation APIs such as Runway do not publish or use a token window, so
    /// the canonical catalog intentionally omits this field for them. Callers
    /// must distinguish that known absence from an uncatalogued Local/BYOK
    /// model whose window is unknown.
    #[serde(default)]
    pub context_window: Option<u64>,
    pub input_cost: f64,
    pub output_cost: f64,
    /// Catalog `cached_input`: absolute per-million price of a cache read.
    #[serde(default, rename = "cached_input")]
    pub cached_input: Option<f64>,
    /// Catalog `cached_write`: absolute per-million price of a cache write
    /// (5-minute / default TTL). Absent when the model prices no cache write.
    #[serde(default, rename = "cached_write")]
    pub cached_write: Option<f64>,
    /// Catalog `cached_write_1h`: absolute per-million price of a one-hour-TTL
    /// cache write. Absent when the model has no extended-TTL cache tier.
    #[serde(default, rename = "cached_write_1h")]
    pub cached_write_1h: Option<f64>,
    /// Dated pricing windows. Empty for the (usual) single-price model.
    #[serde(default)]
    pub pricing_schedule: Vec<PricingWindowEntry>,
    #[serde(default)]
    pub cache_policy: Option<CachePolicyEntry>,
    /// Ordered request-wide token-pricing bands. The greatest threshold that
    /// the request strictly exceeds wins.
    #[serde(default)]
    pub input_token_pricing_tiers: Vec<LongContextPricing>,
    /// Backward-compatible singular tier while generated catalogs migrate to
    /// `inputTokenPricingTiers`. Ignored when the array is non-empty.
    #[serde(default)]
    pub long_context: Option<LongContextPricing>,
    pub capabilities: ModelCapabilities,
    #[serde(default)]
    pub reasoning: Option<ModelReasoning>,
    #[serde(default)]
    pub benchmarks: Option<HashMap<String, f64>>,
    pub speed: String,
    pub quality: String,
    pub quality_tier: String,
    pub best_for: Vec<String>,
    #[serde(default)]
    pub video_per_second_cost: Option<f64>,
    #[serde(default)]
    pub availability: Option<String>,
    #[serde(default)]
    pub unavailable_reason: Option<String>,
    #[serde(default)]
    pub released: Option<String>,
    #[serde(default)]
    pub deprecated: Option<bool>,
}

/// Per-million rates that apply to a model on a specific date.
#[derive(Debug, Clone, PartialEq)]
pub struct EffectivePricing {
    pub input_cost: f64,
    pub output_cost: f64,
    pub cached_input: Option<f64>,
    pub cached_write: Option<f64>,
    pub cached_write_1h: Option<f64>,
}

impl PricingWindowEntry {
    /// Whether this window covers `as_of`. Both bounds are inclusive; an absent
    /// bound is open-ended. A bound that is not a parseable `YYYY-MM-DD` date
    /// makes the window inapplicable, an unreadable schedule must never move a
    /// price silently.
    fn covers(&self, as_of: NaiveDate) -> bool {
        let bound = |value: &Option<String>| -> Option<Option<NaiveDate>> {
            match value {
                None => Some(None),
                Some(raw) => NaiveDate::parse_from_str(raw, "%Y-%m-%d").ok().map(Some),
            }
        };
        let (Some(from), Some(until)) = (bound(&self.effective_from), bound(&self.effective_until))
        else {
            return false;
        };
        from.is_none_or(|start| start <= as_of) && until.is_none_or(|end| as_of <= end)
    }
}

impl ModelEntry {
    /// Greatest catalog token-pricing threshold strictly below this request.
    pub fn input_token_pricing_tier(&self, input_tokens: u64) -> Option<&LongContextPricing> {
        let tiers = if self.input_token_pricing_tiers.is_empty() {
            self.long_context.as_slice()
        } else {
            self.input_token_pricing_tiers.as_slice()
        };
        tiers
            .iter()
            .filter(|tier| input_tokens > tier.threshold_tokens)
            .max_by_key(|tier| tier.threshold_tokens)
    }

    /// Rates that apply to this model on `as_of`.
    ///
    /// The first `pricingSchedule` window covering `as_of` wins; with no
    /// schedule (the usual case) or no covering window, the model's top-level
    /// fields, which always hold the enduring/standard price, are returned.
    pub fn effective_pricing(&self, as_of: NaiveDate) -> EffectivePricing {
        let base = EffectivePricing {
            input_cost: self.input_cost,
            output_cost: self.output_cost,
            cached_input: self.cached_input,
            cached_write: self.cached_write,
            cached_write_1h: self.cached_write_1h,
        };
        let Some(window) = self
            .pricing_schedule
            .iter()
            .find(|window| window.covers(as_of))
        else {
            return base;
        };
        EffectivePricing {
            input_cost: window.input_cost.unwrap_or(base.input_cost),
            output_cost: window.output_cost.unwrap_or(base.output_cost),
            cached_input: window.cached_input.or(base.cached_input),
            cached_write: window.cached_write.or(base.cached_write),
            cached_write_1h: window.cached_write_1h.or(base.cached_write_1h),
        }
    }

    /// Rates that apply on `as_of` for a request with `input_tokens` prompt
    /// tokens. Date-window pricing is resolved first; a qualifying long-context
    /// tier then replaces its declared absolute rates. Optional cache rates
    /// inherit the date-resolved base when the long-context block omits them.
    pub fn effective_pricing_for_input(
        &self,
        as_of: NaiveDate,
        input_tokens: u64,
    ) -> EffectivePricing {
        let mut effective = self.effective_pricing(as_of);
        let Some(tier) = self.input_token_pricing_tier(input_tokens) else {
            return effective;
        };

        effective.input_cost = tier.input_cost;
        effective.output_cost = tier.output_cost;
        effective.cached_input = tier.cached_input.or(effective.cached_input);
        effective.cached_write = tier.cached_write.or(effective.cached_write);
        effective.cached_write_1h = tier.cached_write_1h.or(effective.cached_write_1h);
        effective
    }
}

/// Provider request metadata for model-scoped reasoning controls.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelReasoning {
    #[serde(default)]
    pub supported_efforts: Vec<String>,
    #[serde(default)]
    pub thinking_default: Option<String>,
    #[serde(default)]
    pub supports_manual_thinking: Option<bool>,
    #[serde(default)]
    pub max_effort_when_thinking_disabled: Option<String>,
    #[serde(default)]
    pub rejects_sampling_parameters: Option<bool>,
    #[serde(default)]
    pub request: Option<ModelReasoningRequest>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelReasoningRequest {
    #[serde(default)]
    pub effort_path: Option<String>,
}

/// Boolean capability flags for a model.  JSON uses camelCase.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelCapabilities {
    pub streaming: bool,
    pub tools: bool,
    pub vision: bool,
    pub json: bool,
    pub thinking: bool,
    pub computer_use: bool,
    pub agentic: bool,
    pub image_gen: bool,
    pub video_gen: bool,
    pub search: bool,
    pub research: bool,
    pub code_execution: bool,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Return a reference to the global config singleton.
pub fn config() -> &'static ModelsConfig {
    &CONFIG
}

/// Default model for a provider (by provider string ID).
pub fn get_default_model(provider: &Provider) -> &'static str {
    CONFIG
        .providers
        .get(provider.as_string())
        .and_then(|p| p.default_model.as_deref())
        .filter(|model_id| !model_id.is_empty())
        .unwrap_or_else(|| match provider {
            // Local runtimes have no fixed default model. Returning an empty
            // value forces callers to use provider discovery instead of
            // inventing a model that may not be installed.
            Provider::Ollama
            | Provider::OllamaCloud
            | Provider::LmStudio
            | Provider::LlamaCpp
            | Provider::Vllm => "",
            _ => catalog_fallback_model(),
        })
}

/// Last-resort model for a cloud provider that has no `defaultModel` in the
/// catalog (Bedrock, OpenRouter, NVIDIA NIM, and the aggregators that carry no
/// `providers` entry at all).
///
/// Walks `providersInOrder`, the catalog's own preference order, and takes the
/// first provider that declares a default. The previous code returned a literal
/// model ID guarded by `debug_assert!`, which is compiled out of release builds,
/// so a catalog rename would have shipped a dead ID to users with no signal.
///
/// Note what this does and does not buy: the result is guaranteed to be a live
/// catalog entry, not to be servable by the provider that asked. Bedrock,
/// OpenRouter, Together and NVIDIA NIM declare no `defaultModel` and no
/// canonicalization, so they land on another provider's ID either way, the fix
/// is a catalog entry for those providers, not a different literal here.
///
/// The empty-string arm is the `Option` the iterator forces and is unreachable
/// while any provider declares a default; `get_default_model_returns_non_empty_for_all_providers`
/// fails if it is ever taken.
fn catalog_fallback_model() -> &'static str {
    CONFIG
        .providers_in_order
        .iter()
        .filter_map(|provider_id| CONFIG.providers.get(provider_id))
        .filter_map(|p| p.default_model.as_deref())
        .find(|model_id| !model_id.is_empty() && CONFIG.models.contains_key(*model_id))
        .unwrap_or("")
}

/// Pick a catalog model by provider, `modelType`, and `qualityTier`.
///
/// `taskRouting` in `models.json` only covers chat-shaped tasks, so non-chat
/// modalities (`search`, `stt`, …) have no routing entry to read and their call
/// sites used to retype wire IDs. Selecting on the catalog's own `modelType` and
/// `qualityTier` keeps those sites catalog-backed.
///
/// Ties break on input price then ID because `CONFIG.models` is a `HashMap` and
/// its iteration order would otherwise make the choice vary between runs.
pub fn get_model_by_type_and_tier(
    provider: &Provider,
    model_type: &str,
    quality_tier: &str,
) -> Option<&'static str> {
    let provider_str = provider.as_string();
    CONFIG
        .models
        .values()
        .filter(|entry| {
            entry.provider == provider_str
                && entry.model_type == model_type
                && entry.quality_tier == quality_tier
                && entry.deprecated != Some(true)
        })
        .min_by(|a, b| {
            a.input_cost
                .total_cmp(&b.input_cost)
                .then_with(|| a.id.cmp(&b.id))
        })
        .map(|entry| entry.id.as_str())
}

/// Model for a specific task type (snake_case task name).
/// Falls back to the provider's default model.
pub fn get_task_model(provider: &Provider, task: &str) -> &'static str {
    let provider_str = provider.as_string();
    CONFIG
        .providers
        .get(provider_str)
        .and_then(|p| p.task_routing.as_ref())
        .and_then(|tr| tr.get_model(task))
        .filter(|model_id| !model_id.is_empty())
        .unwrap_or_else(|| get_default_model(provider))
}

/// Pricing (input, output per 1M tokens) for a specific model, on `as_of`.
///
/// Returns the model-specific pricing if found in the catalog, otherwise
/// falls back to the provider's default pricing.  Returns `None` when
/// neither is available so callers can decide how to handle the gap
/// (e.g. skip cost tracking, surface an error) instead of silently
/// using an inaccurate placeholder.
///
/// `as_of` is explicit, no clock is read here, because a model may carry a
/// dated `pricingSchedule` and the rate that applies is a function of the
/// request's date, not of when this process happens to run.
pub fn get_pricing(provider: &Provider, model_id: &str, as_of: NaiveDate) -> Option<PricingEntry> {
    get_pricing_for_input(provider, model_id, as_of, 0)
}

/// Pricing for one request after applying any catalog long-context tier.
pub fn get_pricing_for_input(
    provider: &Provider,
    model_id: &str,
    as_of: NaiveDate,
    input_tokens: u64,
) -> Option<PricingEntry> {
    fn entry_pricing(model: &ModelEntry, as_of: NaiveDate, input_tokens: u64) -> PricingEntry {
        let effective = model.effective_pricing_for_input(as_of, input_tokens);
        PricingEntry {
            input_per_million: effective.input_cost,
            output_per_million: effective.output_cost,
            cache_read_per_million: effective.cached_input,
            cache_write_multiplier: model
                .cache_policy
                .as_ref()
                .and_then(|policy| policy.write_multiplier),
            cache_write_per_million: effective.cached_write,
        }
    }

    if let Some(model) = CONFIG.models.get(model_id) {
        return Some(entry_pricing(model, as_of, input_tokens));
    }

    let canonical_model_id = get_canonicalized_id(model_id);
    if let Some(model) = CONFIG.models.get(&canonical_model_id) {
        return Some(entry_pricing(model, as_of, input_tokens));
    }
    if let Some(provider_cfg) = CONFIG.providers.get(provider.as_string()) {
        tracing::debug!(
            model_id = %model_id,
            provider = %provider.as_string(),
            input = provider_cfg.default_pricing.input_per_million,
            output = provider_cfg.default_pricing.output_per_million,
            "model not in catalog; using provider default pricing"
        );
        return Some(provider_cfg.default_pricing.clone());
    }
    tracing::warn!(
        model_id = %model_id,
        provider = %provider.as_string(),
        "model not found in catalog and provider has no default pricing; \
         cost tracking will be skipped for this request, add pricing to \
         models.json to enable accurate cost reporting"
    );
    None
}

/// Token estimation multiplier for a provider.
/// Returns the prompt multiplier (prompt == completion for all current providers).
pub fn get_token_multiplier(provider: &Provider) -> f64 {
    match CONFIG
        .providers
        .get(provider.as_string())
        .map(|p| p.token_multiplier.prompt)
    {
        Some(m) => m,
        None => {
            tracing::debug!(
                provider = %provider.as_string(),
                "No token multiplier configured for provider, defaulting to 1.0"
            );
            1.0
        }
    }
}

/// Resolve the wire API model ID for a given catalog model ID.
///
/// If the catalog entry has an `apiModelId` distinct from its internal key,
/// that wire string is returned so it can be sent
/// directly in the HTTP request body.  Falls back to the input unchanged when no entry or
/// no `apiModelId` is found.
pub fn get_api_model_id(model_id: &str) -> String {
    let canonical_model_id = get_canonicalized_id(model_id);
    if let Some(entry) = CONFIG.models.get(&canonical_model_id) {
        if let Some(api_id) = &entry.api_model_id {
            return api_id.clone();
        }
    }
    canonical_model_id
}

/// Canonicalize a model ID using the provider's canonicalization map.
/// If the model is not found in the map, returns the input unchanged.
pub fn get_canonicalized_id(model_id: &str) -> String {
    // Look up in all providers' canonicalization maps.
    for cfg in CONFIG.providers.values() {
        if let Some(canonical) = cfg.canonicalization.get(model_id) {
            return canonical.clone();
        }
    }

    if CONFIG.models.contains_key(model_id) {
        return model_id.to_string();
    }

    for (catalog_model_id, entry) in &CONFIG.models {
        if entry.api_model_id.as_deref() == Some(model_id) {
            return catalog_model_id.clone();
        }
    }

    model_id.to_string()
}

/// Whether an exact catalog model supports an exact provider-native effort.
/// Unknown models and models without a declared request path fail closed.
pub fn model_supports_effort(model_id: &str, effort: &str) -> bool {
    let canonical_model_id = get_canonicalized_id(model_id);
    CONFIG
        .models
        .get(&canonical_model_id)
        .and_then(|entry| entry.reasoning.as_ref())
        .filter(|reasoning| {
            reasoning
                .request
                .as_ref()
                .and_then(|request| request.effort_path.as_deref())
                .is_some_and(|path| !path.is_empty())
        })
        .is_some_and(|reasoning| {
            reasoning
                .supported_efforts
                .iter()
                .any(|item| item == effort)
        })
}

fn get_model_entry(model_id: &str) -> Option<&'static ModelEntry> {
    let canonical_model_id = get_canonicalized_id(model_id);
    CONFIG.models.get(&canonical_model_id)
}

/// Whether the canonical catalog verifies this exact model for AGI Tasks.
///
/// Provider runtime discovery can prove generic function-call transport, but
/// it cannot establish agentic planning quality or compatibility with AGI's
/// registered tool vocabulary. Unknown/dynamic models therefore fail closed.
pub fn model_is_verified_for_agi_tasks(model_id: &str) -> bool {
    get_model_entry(model_id)
        .is_some_and(|entry| entry.capabilities.agentic && entry.capabilities.tools)
}

/// Whether this model's provider contract uses adaptive rather than
/// manually-budgeted thinking.
pub fn model_uses_adaptive_thinking(model_id: &str) -> bool {
    get_model_entry(model_id)
        .and_then(|entry| entry.reasoning.as_ref())
        .is_some_and(|reasoning| reasoning.thinking_default.as_deref() == Some("adaptive"))
}

/// Whether provider sampling knobs must be omitted for this exact model.
pub fn model_rejects_sampling_parameters(model_id: &str) -> bool {
    get_model_entry(model_id)
        .and_then(|entry| entry.reasoning.as_ref())
        .and_then(|reasoning| reasoning.rejects_sampling_parameters)
        .unwrap_or(false)
}

/// Validate an effort requested while thinking is explicitly disabled.
/// Unknown models have no declared ceiling and are left to their provider.
pub fn model_allows_effort_with_thinking_disabled(model_id: &str, effort: &str) -> bool {
    const ORDER: &[&str] = &["none", "minimal", "low", "medium", "high", "xhigh", "max"];
    let Some(maximum) = get_model_entry(model_id)
        .and_then(|entry| entry.reasoning.as_ref())
        .and_then(|reasoning| reasoning.max_effort_when_thinking_disabled.as_deref())
    else {
        return true;
    };
    let Some(effort_index) = ORDER.iter().position(|item| *item == effort) else {
        return false;
    };
    let Some(maximum_index) = ORDER.iter().position(|item| *item == maximum) else {
        return false;
    };
    effort_index <= maximum_index
}

pub fn max_effort_when_thinking_disabled(model_id: &str) -> Option<&'static str> {
    get_model_entry(model_id)
        .and_then(|entry| entry.reasoning.as_ref())
        .and_then(|reasoning| reasoning.max_effort_when_thinking_disabled.as_deref())
}

/// Infer the Rust `Provider` enum from a catalog-addressable model ID.
///
/// Unknown names fail closed even when they resemble a provider's model
/// family. This prevents a retired or invented ID from bypassing catalog
/// removal through a familiar prefix. Explicit BYOK provider selection is
/// handled separately and does not use this inference path.
pub fn get_provider_for_model(model_id: &str) -> Option<Provider> {
    let canonical_model_id = get_canonicalized_id(model_id);
    CONFIG
        .models
        .get(&canonical_model_id)
        .and_then(|entry| Provider::from_string(&entry.provider))
}

/// SSE event delimiter bytes for a provider.
pub fn get_sse_delimiter(provider: &Provider) -> &'static [u8] {
    let delim = CONFIG
        .providers
        .get(provider.as_string())
        .map(|p| p.sse_delimiter.as_str())
        .unwrap_or("\n\n");
    match delim {
        "\n" => b"\n",
        _ => b"\n\n",
    }
}

/// Whether a cataloged model uses the OpenAI Responses API.
///
/// The canonical catalog is the only authority for provider and request-shape
/// selection. Unknown Local/BYOK IDs fail closed to Chat Completions instead of
/// guessing from a name prefix; a newly released OpenAI model becomes eligible
/// only after its catalog metadata is verified and regenerated.
pub fn model_uses_responses_api(model_id: &str) -> bool {
    let id = get_canonicalized_id(model_id).to_lowercase();
    CONFIG
        .models
        .get(&id)
        .is_some_and(|entry| entry.provider == "openai" && entry.model_type == "reasoning")
}

/// Whether a model supports Gemini-style `thinking_config` API parameter.
///
/// Reads `capabilities.thinking` from the bundled `models.json` catalog and
/// gates by `provider == "google"` since the `thinking_config` field is
/// Google-specific (Anthropic + OpenAI use different parameter shapes).
/// No hardcoded model-family prefixes per the locked rule.
pub fn model_supports_gemini_thinking(model_id: &str) -> bool {
    let canonical_model_id = get_canonicalized_id(model_id);
    CONFIG
        .models
        .get(&canonical_model_id)
        .map(|entry| entry.provider == "google" && entry.capabilities.thinking)
        .unwrap_or(false)
}

/// Capability name the catalog uses for image generation output.
pub const IMAGE_OUTPUT_CAPABILITY: &str = "imageOutput";

/// The model a provider serves for `capability` when the caller names none.
///
/// `None` means the catalog declares no default, which is only safe when the
/// provider has exactly one active model offering the capability. The registry
/// compiler refuses to emit a catalog where that is not true.
pub fn get_provider_default_model(provider: &str, capability: &str) -> Option<&'static str> {
    CONFIG
        .provider_defaults
        .get(provider)?
        .get(capability)
        .map(String::as_str)
}

/// Return all model entries from the catalog.
pub fn get_all_model_entries() -> &'static HashMap<String, ModelEntry> {
    &CONFIG.models
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::Provider;

    /// Fixed lookup date. `get_pricing` takes the request date explicitly
    /// because a model may carry dated `pricingSchedule` windows, so tests pin a
    /// date rather than reading the clock. No shipped model schedules a price,
    /// so this is simply an ordinary date.
    fn priced_on() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, 1).expect("2026-09-01 is a valid date")
    }

    fn day(year: i32, month: u32, day: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(year, month, day).expect("valid calendar date")
    }

    fn active_catalog_model(
        provider: &str,
        predicate: impl Fn(&ModelEntry) -> bool,
    ) -> &'static ModelEntry {
        CONFIG
            .models
            .values()
            .find(|entry| {
                entry.provider == provider && entry.deprecated != Some(true) && predicate(entry)
            })
            .expect("catalog must contain an active model matching the test predicate")
    }

    /// The catalog entry Decision #22 (docs/decisions/README.md) names by id,
    /// selected by identity rather than by its current price: the founder has
    /// repinned this model's rate before (most recently 2026-09-03) and the
    /// synced catalog is the single source of truth for what it is today.
    fn founder_standard_anthropic_model() -> &'static ModelEntry {
        let default_id = get_default_model(&Provider::Anthropic);
        active_catalog_model("anthropic", |entry| entry.id == default_id)
    }

    /// SYNTHETIC test-only entry with a dated schedule on arbitrary dates.
    ///
    /// The dated-pricing MECHANISM is proved against this rather than against a
    /// shipped promotional window, so it stays covered whatever the catalog
    /// currently prices, and no product price is reachable by editing a
    /// mechanism test. It starts from a real catalog entry only to fill the
    /// identity/capability fields; every rate is overwritten below.
    fn scheduled_fixture_model() -> ModelEntry {
        let mut model = CONFIG
            .models
            .values()
            .find(|entry| entry.context_window.is_some())
            .expect("catalog must contain a prompt-consuming model for fixture metadata")
            .clone();
        model.id = "fixture-scheduled-model".to_string();
        model.api_model_id = None;
        model.input_cost = 3.0;
        model.output_cost = 15.0;
        model.cached_input = Some(0.3);
        model.cached_write = Some(3.75);
        model.cached_write_1h = Some(6.0);
        model.input_token_pricing_tiers.clear();
        model.long_context = None;
        model.pricing_schedule = vec![
            PricingWindowEntry {
                effective_from: None,
                effective_until: Some("2030-03-31".to_string()),
                note: None,
                input_cost: Some(2.0),
                output_cost: Some(10.0),
                cached_input: Some(0.2),
                cached_write: Some(2.5),
                cached_write_1h: Some(4.0),
            },
            // Declares only its start, so every rate falls back to the
            // top-level (enduring) fields.
            PricingWindowEntry {
                effective_from: Some("2030-04-01".to_string()),
                effective_until: None,
                note: None,
                input_cost: None,
                output_cost: None,
                cached_input: None,
                cached_write: None,
                cached_write_1h: None,
            },
        ];
        model
    }

    #[test]
    fn effective_pricing_selects_the_window_covering_the_date() {
        let model = scheduled_fixture_model();

        let first = model.effective_pricing(day(2030, 2, 15));
        assert_eq!(first.input_cost, 2.0);
        assert_eq!(first.output_cost, 10.0);
        assert_eq!(first.cached_input, Some(0.2));
        assert_eq!(first.cached_write, Some(2.5));
        assert_eq!(first.cached_write_1h, Some(4.0));

        // The second window overrides nothing, so every rate falls back to the
        // top-level fields.
        let second = model.effective_pricing(day(2030, 4, 1));
        assert_eq!(second.input_cost, 3.0);
        assert_eq!(second.output_cost, 15.0);
        assert_eq!(second.cached_input, Some(0.3));
        assert_eq!(second.cached_write, Some(3.75));
        assert_eq!(second.cached_write_1h, Some(6.0));

        // Bounds are inclusive UTC calendar days: the window's last day is still
        // inside it, and a date before every window falls back to the base.
        assert_eq!(model.effective_pricing(day(2030, 3, 31)).input_cost, 2.0);
        assert_eq!(model.effective_pricing(day(2029, 1, 1)).input_cost, 2.0);
    }

    #[test]
    fn effective_pricing_is_date_invariant_without_a_schedule() {
        let model = CONFIG
            .models
            .values()
            .find(|entry| entry.context_window.is_some() && entry.pricing_schedule.is_empty())
            .expect("catalog must include a scheduleless prompt-consuming model");
        let early = model.effective_pricing(day(2020, 1, 1));
        let late = model.effective_pricing(day(2099, 12, 31));
        assert_eq!(early, late);
        assert_eq!(early.input_cost, model.input_cost);
    }

    #[test]
    fn founder_standard_anthropic_route_prices_the_standard_rates_on_every_date() {
        // Founder pin, Decision #22 (docs/decisions/README.md): Sonnet 5 bills
        // users a single standard per-MTok rate on EVERY date, never a
        // provider's introductory window; that rate has changed before (most
        // recently 2026-09-03) and comes from the synced catalog rather than a
        // number pinned in this test, which would go stale on the next
        // repricing. The invariant this test proves stays meaningful: a
        // schedule-free model's effective pricing on any date must equal its
        // own top-level catalog fields, never drift with the calendar.
        let standard_model = founder_standard_anthropic_model();
        assert!(
            standard_model.pricing_schedule.is_empty(),
            "the founder-standard model must not carry a dated pricing schedule"
        );

        for date in [day(2020, 1, 1), day(2026, 8, 15), day(2026, 9, 15)] {
            let pricing = standard_model.effective_pricing(date);
            assert_eq!(
                pricing.input_cost, standard_model.input_cost,
                "input cost on {date}"
            );
            assert_eq!(
                pricing.output_cost, standard_model.output_cost,
                "output cost on {date}"
            );
            assert_eq!(
                pricing.cached_input, standard_model.cached_input,
                "cache read on {date}"
            );
            assert_eq!(
                pricing.cached_write, standard_model.cached_write,
                "5m cache write on {date}"
            );
            assert_eq!(
                pricing.cached_write_1h, standard_model.cached_write_1h,
                "1h cache write on {date}"
            );
        }
    }

    #[test]
    fn get_pricing_carries_the_declared_cache_write_price() {
        let standard_model = founder_standard_anthropic_model();
        let expected_cache_write = standard_model
            .cached_write
            .expect("the founder-standard model must price 5-minute cache writes");
        for date in [day(2026, 8, 15), day(2026, 9, 15)] {
            let pricing = get_pricing(&Provider::Anthropic, &standard_model.id, date)
                .expect("founder-standard Anthropic model must have pricing");
            assert_eq!(pricing.cache_write_per_million, Some(expected_cache_write));
        }

        let openai_model = CONFIG
            .models
            .values()
            .find(|entry| entry.provider == "openai" && entry.cached_write.is_some())
            .expect("catalog must include an OpenAI model with cache-write pricing");
        let pricing = get_pricing(&Provider::OpenAI, &openai_model.id, priced_on())
            .expect("catalog OpenAI model must have pricing");
        assert_eq!(pricing.cache_write_per_million, openai_model.cached_write);
    }

    #[test]
    fn config_singleton_loads_without_panic() {
        let cfg = config();
        assert!(!cfg.models.is_empty(), "models map must not be empty");
        assert!(!cfg.providers.is_empty(), "providers map must not be empty");

        let contextless_media_model = cfg
            .models
            .values()
            .find(|entry| {
                entry.context_window.is_none()
                    && (entry.capabilities.image_gen || entry.capabilities.video_gen)
            })
            .expect("the canonical catalog must include a contextless media model");
        assert_eq!(
            contextless_media_model.context_window, None,
            "a media API without a published token window must not receive an invented value"
        );
    }

    #[test]
    fn get_default_model_returns_non_empty_for_cloud_providers() {
        for provider in [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Minimax,
            Provider::Zhipu,
            Provider::ManagedCloud,
            Provider::Together,
            Provider::Fireworks,
            Provider::Cerebras,
            Provider::DeepInfra,
            Provider::Cohere,
            Provider::AI21,
            Provider::Sambanova,
            Provider::Azure,
            Provider::Bedrock,
        ] {
            let model = get_default_model(&provider);
            assert!(
                !model.is_empty(),
                "{:?}.default_model must not be empty",
                provider
            );
        }
    }

    #[test]
    fn dynamically_discovered_local_providers_have_no_static_default() {
        for provider in [
            Provider::Ollama,
            Provider::OllamaCloud,
            Provider::LmStudio,
            Provider::LlamaCpp,
            Provider::Vllm,
        ] {
            assert_eq!(
                get_default_model(&provider),
                "",
                "{provider:?} must resolve its model from the configured runtime"
            );
        }
    }

    /// The cloud-provider fallback used to be a literal guarded by
    /// `debug_assert!`, which release builds strip, a catalog rename shipped a
    /// dead model ID. Every cloud default must resolve in the catalog.
    #[test]
    fn get_default_model_resolves_in_catalog_for_cloud_providers() {
        for provider in [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Minimax,
            Provider::Zhipu,
            Provider::ManagedCloud,
            // No catalog `providers` entry at all, these exercise the fallback.
            Provider::Together,
            Provider::Bedrock,
            Provider::OpenRouter,
            Provider::NvidiaNim,
        ] {
            let model = get_default_model(&provider);
            assert!(
                CONFIG.models.contains_key(model),
                "{provider:?}.default_model = \"{model}\" is not in models.json"
            );
        }

        // Providers with no catalog entry must land on the catalog's own first
        // choice, not on an ID typed into this file.
        let first_catalog_default = CONFIG
            .providers_in_order
            .iter()
            .filter_map(|provider_id| CONFIG.providers.get(provider_id))
            .filter_map(|p| p.default_model.as_deref())
            .find(|model_id| CONFIG.models.contains_key(*model_id))
            .expect("models.json must declare at least one provider default");
        assert_eq!(
            get_default_model(&Provider::Bedrock),
            first_catalog_default,
            "the no-default-model fallback must be read from providersInOrder"
        );
    }

    /// The routing and command layers must name models through this module, not
    /// by literal. Each entry below was an inline ID at the cited call site; a
    /// literal reappearing there is drift that outlives the next catalog
    /// regeneration silently, which is how ghost model IDs reach users.
    #[test]
    fn no_catalog_model_ids_in_routing_and_commands() {
        let sources: &[(&str, &str)] = &[
            ("core/llm/llm_router.rs", include_str!("llm_router.rs")),
            (
                "sys/commands/completion.rs",
                include_str!("../../sys/commands/completion.rs"),
            ),
            (
                "sys/commands/voice.rs",
                include_str!("../../sys/commands/voice.rs"),
            ),
        ];

        for &(path, src) in sources {
            for entry in CONFIG.models.values() {
                for model_id in
                    std::iter::once(entry.id.as_str()).chain(entry.api_model_id.as_deref())
                {
                    let literal = format!("\"{model_id}\"");
                    if model_id.is_empty() {
                        continue;
                    }
                    assert!(
                        !src.contains(&literal),
                        "{path} names model literal {literal}, resolve it through \
                     models_config::get_task_model / get_model_by_type_and_tier instead"
                    );
                }
            }
        }
    }

    /// Non-chat modalities have no `taskRouting` entry, so their call sites
    /// resolve through `modelType` + `qualityTier` instead.
    #[test]
    fn get_model_by_type_and_tier_resolves_non_chat_modalities() {
        let stt = get_model_by_type_and_tier(&Provider::OpenAI, "stt", "balanced")
            .expect("openai must expose a balanced stt model");
        assert_eq!(
            CONFIG.models[stt].model_type, "stt",
            "resolved stt model must be an stt entry"
        );

        let fast_search = get_model_by_type_and_tier(&Provider::Perplexity, "search", "fast")
            .expect("perplexity must expose a fast search model");
        let deep_search = get_model_by_type_and_tier(&Provider::Perplexity, "search", "best")
            .expect("perplexity must expose a best-tier search model");
        assert_ne!(
            fast_search, deep_search,
            "quick search and deep research must not collapse onto one model"
        );

        assert!(
            get_model_by_type_and_tier(&Provider::Anthropic, "stt", "balanced").is_none(),
            "anthropic ships no stt model, the lookup must not invent one"
        );
    }

    #[test]
    fn get_token_multiplier_returns_positive_for_all_providers() {
        for provider in [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
            Provider::Perplexity,
            Provider::XAI,
            Provider::DeepSeek,
            Provider::Qwen,
            Provider::Moonshot,
            Provider::Minimax,
            Provider::Zhipu,
            Provider::ManagedCloud,
            Provider::Together,
            Provider::Fireworks,
            Provider::Cerebras,
            Provider::DeepInfra,
            Provider::Cohere,
            Provider::AI21,
            Provider::Sambanova,
            Provider::Azure,
            Provider::Bedrock,
        ] {
            let mult = get_token_multiplier(&provider);
            assert!(
                mult > 0.0,
                "{:?} token multiplier must be positive, got {}",
                provider,
                mult
            );
        }
    }

    #[test]
    fn get_canonicalized_id_returns_original_for_unknown_model() {
        let unknown = "totally-unknown-model-xyz";
        assert_eq!(get_canonicalized_id(unknown), unknown);
    }

    #[test]
    fn get_canonicalized_id_keeps_unlisted_aliases_unchanged() {
        for unlisted in [
            "fixture-unlisted-provider-model",
            "fixture-unlisted-preview-model",
            "unlisted-model-id",
        ] {
            assert_eq!(get_canonicalized_id(unlisted), unlisted);
        }
    }

    #[test]
    fn get_provider_for_model_accepts_catalog_entries_and_rejects_unknown_prefixes() {
        // Catalog models resolve via their catalog entry.
        let model = CONFIG
            .models
            .values()
            .find(|entry| entry.provider == "openai")
            .expect("catalog must include an OpenAI model");
        let provider = get_provider_for_model(&model.id);
        assert!(
            provider.is_some(),
            "a catalog OpenAI model should resolve to a provider"
        );
        assert_eq!(provider.unwrap(), Provider::OpenAI);
        // Build a retired-shaped unknown from the catalog's own provider prefix
        // rather than embedding a concrete provider model ID.
        let prefix = CONFIG
            .providers
            .get("openai")
            .and_then(|provider| provider.model_prefixes.first())
            .expect("OpenAI must declare at least one model prefix");
        let unlisted = format!("{prefix}fixture-retired-model");
        let provider = get_provider_for_model(&unlisted);
        assert!(
            provider.is_none(),
            "an unknown model must fail closed even with a catalog-declared prefix"
        );
    }

    #[test]
    fn get_provider_for_model_returns_none_for_unknown() {
        let provider = get_provider_for_model("completely-unknown-xyz-model");
        assert!(provider.is_none(), "unknown models should return None");
    }

    #[test]
    fn catalog_openai_reasoning_models_use_responses_and_unknowns_fail_closed() {
        let mut checked = 0;
        for entry in CONFIG
            .models
            .values()
            .filter(|entry| entry.provider == "openai" && entry.model_type == "reasoning")
        {
            checked += 1;
            assert!(
                model_uses_responses_api(&entry.id),
                "{} is a catalog OpenAI reasoning model and must use Responses",
                entry.id
            );
        }
        assert!(
            checked > 0,
            "catalog must contain an OpenAI reasoning model"
        );
        assert!(
            !model_uses_responses_api("fixture-unknown-text-model"),
            "unknown model IDs must not be assigned an API shape from their name"
        );
    }

    #[test]
    fn api_model_id_maps_dotted_internal_ids_to_wire_and_is_idempotent() {
        // BUG 1 regression: the wire body must carry `apiModelId` (dash form),
        // never the dotted internal catalog id. Anthropic returns 404 for the
        // dotted id. Verify every catalog model whose internal id differs from
        // its apiModelId maps correctly AND that re-running through
        // `get_api_model_id` on the already-wire id is a no-op (idempotent), the
        // reverse-lookup branch in `get_canonicalized_id` exists precisely to
        // keep this idempotent, so it must not corrupt an already-wire id.
        let mut checked_any = false;
        for (internal_id, entry) in &CONFIG.models {
            let Some(api_id) = entry.api_model_id.as_deref() else {
                continue;
            };
            if api_id == internal_id {
                continue;
            }
            checked_any = true;
            // internal (dotted) id -> wire (dash) id
            assert_eq!(
                get_api_model_id(internal_id),
                api_id,
                "get_api_model_id({internal_id}) must return the apiModelId {api_id}"
            );
            // already-wire id -> unchanged (idempotent)
            assert_eq!(
                get_api_model_id(api_id),
                api_id,
                "get_api_model_id is not idempotent for wire id {api_id}"
            );
        }
        assert!(
            checked_any,
            "expected at least one catalog model with internal_id != apiModelId"
        );

        // Pin get_canonicalized_id's reverse-lookup branch directly: it maps a
        // wire (apiModelId) id back to its dotted catalog id, and leaves the
        // catalog id unchanged. This branch is what keeps get_provider_for_model
        // working when handed a wire id; it must not be removed. (Note:
        // get_api_model_id above is idempotent for the wire id with OR without
        // this branch, the branch earns its keep via provider lookup, not
        // idempotence, but the ADAPTER must call get_api_model_id, never
        // get_canonicalized_id, for the wire model field.)
        for (internal_id, entry) in &CONFIG.models {
            let Some(api_id) = entry.api_model_id.as_deref() else {
                continue;
            };
            assert_eq!(get_canonicalized_id(api_id), *internal_id);
            assert_eq!(get_canonicalized_id(internal_id), *internal_id);
        }
    }

    #[test]
    fn model_supports_gemini_thinking_for_pro_models() {
        let thinking = active_catalog_model("google", |entry| entry.capabilities.thinking);
        let non_thinking = active_catalog_model("google", |entry| !entry.capabilities.thinking);
        let non_google = active_catalog_model("anthropic", |entry| entry.capabilities.thinking);
        assert!(model_supports_gemini_thinking(&thinking.id));
        assert!(!model_supports_gemini_thinking(&non_thinking.id));
        assert!(!model_supports_gemini_thinking(&non_google.id));
    }

    #[test]
    fn model_effort_support_comes_from_exact_catalog_request_metadata() {
        let model = active_catalog_model("anthropic", |entry| {
            entry.reasoning.as_ref().is_some_and(|reasoning| {
                ["low", "high", "xhigh", "max"].iter().all(|effort| {
                    reasoning
                        .supported_efforts
                        .iter()
                        .any(|item| item == effort)
                })
            })
        });
        assert!(model_supports_effort(&model.id, "high"));
        assert!(model_supports_effort(&model.id, "xhigh"));
        assert!(model_supports_effort(&model.id, "max"));
        assert!(model_supports_effort(&model.id, "low"));
        assert!(!model_supports_effort("unknown-anthropic-model", "high"));
        assert!(!model_supports_effort(&model.id, "minimal"));
    }

    #[test]
    fn adaptive_request_contract_comes_from_catalog_metadata() {
        let model = active_catalog_model("anthropic", |entry| {
            entry.reasoning.as_ref().is_some_and(|reasoning| {
                reasoning.thinking_default.as_deref() == Some("adaptive")
                    && reasoning.rejects_sampling_parameters == Some(true)
                    && reasoning.max_effort_when_thinking_disabled.as_deref() == Some("high")
            })
        });
        assert!(model_uses_adaptive_thinking(&model.id));
        assert!(model_rejects_sampling_parameters(&model.id));
        assert!(model_allows_effort_with_thinking_disabled(
            &model.id, "high"
        ));
        assert!(!model_allows_effort_with_thinking_disabled(
            &model.id, "xhigh"
        ));
        assert!(!model_allows_effort_with_thinking_disabled(
            &model.id, "max"
        ));
        assert_eq!(max_effort_when_thinking_disabled(&model.id), Some("high"));
    }

    #[test]
    fn get_all_model_entries_non_empty() {
        let models = get_all_model_entries();
        assert!(!models.is_empty(), "model entries must not be empty");
        assert!(
            models.values().any(|entry| entry.provider == "anthropic"),
            "At least one Anthropic model must be in the catalog"
        );
    }

    #[test]
    fn get_pricing_returns_some_for_known_model() {
        let model = active_catalog_model("anthropic", |_| true);
        let pricing = get_pricing(&Provider::Anthropic, &model.id, priced_on());
        assert!(pricing.is_some(), "catalog model must have pricing");
        let p = pricing.unwrap();
        assert!(
            p.input_per_million > 0.0 || p.output_per_million > 0.0,
            "catalog model pricing must be non-zero"
        );
    }

    #[test]
    fn get_pricing_falls_back_to_provider_default_for_unknown_model() {
        // An unknown model under a known provider should still return
        // the provider's default pricing.
        let pricing = get_pricing(
            &Provider::OpenAI,
            "totally-unknown-openai-model-xyz",
            priced_on(),
        );
        assert!(
            pricing.is_some(),
            "unknown model under known provider should return provider default pricing"
        );
        let p = pricing.unwrap();
        assert!(
            p.input_per_million > 0.0 || p.output_per_million > 0.0,
            "provider default pricing must be non-zero"
        );
    }

    #[test]
    fn get_pricing_returns_provider_default_for_all_enum_variants() {
        // All Provider enum variants have entries in models.json, so unknown
        // models get provider-level default pricing. The None path is a safety
        // net for future changes when providers might be added to the enum
        // before models.json is updated.
        let known_model = active_catalog_model("anthropic", |_| true);
        let pricing = get_pricing(&Provider::Anthropic, &known_model.id, priced_on());
        assert!(pricing.is_some(), "known model must have pricing");

        // Verify provider fallback works for all providers
        for provider in [
            Provider::OpenAI,
            Provider::Anthropic,
            Provider::Google,
            Provider::Ollama,
        ] {
            let p = get_pricing(&provider, "nonexistent-model-xyz-12345", priced_on());
            assert!(
                p.is_some(),
                "{:?} should have provider-level default pricing",
                provider
            );
        }
    }

    #[test]
    fn get_sse_delimiter_returns_valid_bytes() {
        let delim = get_sse_delimiter(&Provider::Anthropic);
        assert!(!delim.is_empty(), "SSE delimiter must not be empty");
    }
}
