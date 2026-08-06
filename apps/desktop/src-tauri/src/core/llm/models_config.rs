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

/// Catalog `cachePolicy` — only the fields cost calculation needs.
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
    /// hardcode 0.5x the input rate for OpenAI and Managed Cloud, while the
    /// catalog prices a cache read at 0.1x for both gpt-5.6-sol and
    /// gpt-5.6-luna — a 5x overcharge on every cached token.
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
    pub context_window: u64,
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
    /// makes the window inapplicable — an unreadable schedule must never move a
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
    /// Rates that apply to this model on `as_of`.
    ///
    /// The first `pricingSchedule` window covering `as_of` wins; with no
    /// schedule (the usual case) or no covering window, the model's top-level
    /// fields — which always hold the enduring/standard price — are returned.
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
            // Local runtimes have no fixed default model — the actual model is
            // always dynamically discovered (Ollama /api/tags, LM Studio/llama.cpp/vLLM
            // /v1/models) and sent explicitly by the frontend. This fallback string
            // is only used when no explicit model was requested.
            Provider::Ollama
            | Provider::OllamaCloud
            | Provider::LmStudio
            | Provider::LlamaCpp
            | Provider::Vllm => "llama4-maverick",
            _ => {
                debug_assert!(
                    CONFIG.models.contains_key("gpt-5.6-luna"),
                    "Fallback model 'gpt-5.6-luna' not found in models.json"
                );
                "gpt-5.6-luna"
            }
        })
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
/// `as_of` is explicit — no clock is read here — because a model may carry a
/// dated `pricingSchedule` and the rate that applies is a function of the
/// request's date, not of when this process happens to run.
pub fn get_pricing(provider: &Provider, model_id: &str, as_of: NaiveDate) -> Option<PricingEntry> {
    fn entry_pricing(model: &ModelEntry, as_of: NaiveDate) -> PricingEntry {
        let effective = model.effective_pricing(as_of);
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
        return Some(entry_pricing(model, as_of));
    }

    let canonical_model_id = get_canonicalized_id(model_id);
    if let Some(model) = CONFIG.models.get(&canonical_model_id) {
        return Some(entry_pricing(model, as_of));
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
         cost tracking will be skipped for this request — add pricing to \
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
/// If the catalog entry has an `apiModelId` field set (e.g. `"MiniMax-M3"` for
/// the internal key `"minimax-m3"`), that wire string is returned so it can be sent
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

/// Infer the Rust `Provider` enum from a model ID string using prefix matching.
/// Returns `None` if no prefix matches (caller should default to ManagedCloud).
pub fn get_provider_for_model(model_id: &str) -> Option<Provider> {
    let canonical_model_id = get_canonicalized_id(model_id);

    if let Some(entry) = CONFIG.models.get(&canonical_model_id) {
        return Provider::from_string(&entry.provider);
    }

    let model_lower = canonical_model_id.to_lowercase();
    for (provider_id, cfg) in &CONFIG.providers {
        for prefix in &cfg.model_prefixes {
            if model_lower.starts_with(prefix) {
                return Provider::from_string(provider_id);
            }
        }
    }
    None
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

/// Whether a model uses the OpenAI Responses API (vs Chat Completions).
///
/// As of March 2026, the Responses API is used by:
///   - GPT-5+ series (gpt-5, gpt-5.1, gpt-5-turbo, gpt-6, gpt-7, ...)
///   - GPT-4.1 series (gpt-4.1, gpt-4.1-mini, ...)
///   - O-series reasoning (o3+, o4+, ...)
///   - GPT open-source (gpt-oss-120b, gpt-oss-20b)
///   - Codex models (codex-mini-latest)
///
/// Chat Completions remains the default for older models (gpt-4o, gpt-4-turbo, gpt-3.5-turbo).
///
/// Uses version-aware detection: any GPT major version >= 5 (and 4.1+) uses the Responses API.
/// This future-proofs for gpt-5-turbo, gpt-6, gpt-7, etc. without code changes.
pub fn model_uses_responses_api(model_id: &str) -> bool {
    let id = get_canonicalized_id(model_id).to_lowercase();

    // Catalog is authoritative for known models: trust the declared
    // `model_type`. Only OpenAI reasoning-tier models use the Responses API;
    // OpenAI chat models and every non-OpenAI model use Chat Completions.
    // Returning here (rather than falling through to
    // the version heuristics below) prevents the `gpt-` major>=5 / 4.1 heuristic
    // from misrouting a catalog chat model into a Responses-shaped body (`input`,
    // no `messages`) — which is posted to `/chat/completions` and 400s with
    // "Missing required parameter: 'messages'". No hardcoded SPECIFIC model IDs
    // per the locked rule — capability info flows through models.json. The
    // heuristics below only apply to ids NOT present in the catalog.
    if let Some(entry) = CONFIG.models.get(&id) {
        return entry.provider == "openai" && entry.model_type == "reasoning";
    }

    // O-series (oN) reasoning family — parse a single digit after the
    // leading 'o' to future-proof for o5/o6/o7/etc. without code edits.
    // Variants like "o3-mini" / "o4-mini" / "o3-pro" are also covered.
    if let Some(rest) = id.strip_prefix('o') {
        if rest.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            return true;
        }
    }

    // OpenAI reasoning-adjacent families (gpt-oss open-weight, codex-).
    // These are non-versioned product names so prefix is the only signal.
    if id.starts_with("gpt-oss") || id.starts_with("codex-") {
        return true;
    }

    // For GPT models, parse the major version after "gpt-" to future-proof
    // for gpt-5-turbo, gpt-6, gpt-7, etc. without requiring code changes.
    // gpt-4.1+ and gpt-5+ use Responses API; gpt-4o, gpt-4-turbo, gpt-3.5 do not.
    if let Some(rest) = id.strip_prefix("gpt-") {
        let version_str: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(major) = version_str.parse::<u32>() {
            if major >= 5 {
                return true;
            }
            if major == 4 {
                let after_major = &rest[version_str.len()..];
                if let Some(minor_str) = after_major.strip_prefix('.') {
                    let minor_digits: String = minor_str
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(minor) = minor_digits.parse::<u32>() {
                        return minor >= 1;
                    }
                }
            }
        }
    }

    false
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
            .get("claude-opus-5")
            .expect("claude-opus-5 must exist in the catalog")
            .clone();
        model.id = "fixture-scheduled-model".to_string();
        model.api_model_id = None;
        model.input_cost = 3.0;
        model.output_cost = 15.0;
        model.cached_input = Some(0.3);
        model.cached_write = Some(3.75);
        model.cached_write_1h = Some(6.0);
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
        let opus = CONFIG
            .models
            .get("claude-opus-5")
            .expect("claude-opus-5 must exist in the catalog");
        assert!(opus.pricing_schedule.is_empty());
        let early = opus.effective_pricing(day(2020, 1, 1));
        let late = opus.effective_pricing(day(2099, 12, 31));
        assert_eq!(early, late);
        assert_eq!(early.input_cost, opus.input_cost);
    }

    #[test]
    fn sonnet_5_prices_the_founder_standard_rates_on_every_date() {
        // Founder pin — Decision #22 (docs/decisions/CURRENT_DECISIONS.md,
        // reaffirmed 2026-08-05): Sonnet 5 bills users the standard $3/$15 per
        // MTok (cache read $0.30, 5m write $3.75, 1h write $6.00) on EVERY date.
        // Anthropic's introductory window is a provider-COST fact for the
        // registry's verificationLog, never a product price.
        let sonnet = CONFIG
            .models
            .get("claude-sonnet-5")
            .expect("claude-sonnet-5 must exist in the catalog");
        assert!(
            sonnet.pricing_schedule.is_empty(),
            "claude-sonnet-5 must not carry a dated pricing schedule"
        );

        for date in [day(2020, 1, 1), day(2026, 8, 15), day(2026, 9, 15)] {
            let pricing = sonnet.effective_pricing(date);
            assert_eq!(pricing.input_cost, 3.0, "input cost on {date}");
            assert_eq!(pricing.output_cost, 15.0, "output cost on {date}");
            assert_eq!(pricing.cached_input, Some(0.3), "cache read on {date}");
            assert_eq!(pricing.cached_write, Some(3.75), "5m cache write on {date}");
            assert_eq!(
                pricing.cached_write_1h,
                Some(6.0),
                "1h cache write on {date}"
            );
        }
    }

    #[test]
    fn get_pricing_carries_the_declared_cache_write_price() {
        for date in [day(2026, 8, 15), day(2026, 9, 15)] {
            let sonnet = get_pricing(&Provider::Anthropic, "claude-sonnet-5", date)
                .expect("claude-sonnet-5 must have pricing");
            assert_eq!(sonnet.cache_write_per_million, Some(3.75));
        }

        // Pre-GPT-5.6 OpenAI models declare no write price at all.
        let mini = get_pricing(&Provider::OpenAI, "gpt-5.4-mini", priced_on())
            .expect("gpt-5.4-mini must have pricing");
        assert_eq!(mini.cache_write_per_million, None);

        // The GPT-5.6 family does declare one.
        let sol = get_pricing(&Provider::OpenAI, "gpt-5.6-sol", priced_on())
            .expect("gpt-5.6-sol must have pricing");
        assert_eq!(sol.cache_write_per_million, Some(6.25));
    }

    #[test]
    fn config_singleton_loads_without_panic() {
        let cfg = config();
        assert!(!cfg.models.is_empty(), "models map must not be empty");
        assert!(!cfg.providers.is_empty(), "providers map must not be empty");
    }

    #[test]
    fn get_default_model_returns_non_empty_for_all_providers() {
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
            let model = get_default_model(&provider);
            assert!(
                !model.is_empty(),
                "{:?}.default_model must not be empty",
                provider
            );
        }
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
        assert_eq!(
            get_canonicalized_id("claude-sonnet-9-9"),
            "claude-sonnet-9-9"
        );
        assert_eq!(get_canonicalized_id("claude-opus-5"), "claude-opus-5");
        assert_eq!(
            get_canonicalized_id("gemini-3.1-pro-preview"),
            "gemini-3.1-pro-preview"
        );
        assert_eq!(get_canonicalized_id("gpt-9.9-mini"), "gpt-9.9-mini");
        assert_eq!(
            get_canonicalized_id("unlisted-model-id"),
            "unlisted-model-id"
        );
    }

    #[test]
    fn get_provider_for_model_returns_some_for_known_prefix() {
        // Catalog models resolve via their catalog entry.
        let provider = get_provider_for_model("gpt-5.6-sol");
        assert!(
            provider.is_some(),
            "gpt-5.6-sol should resolve to a provider"
        );
        assert_eq!(provider.unwrap(), Provider::OpenAI);
        // Non-catalog ids fall back to the gpt- provider prefix.
        let provider = get_provider_for_model("gpt-unlisted-future-model");
        assert!(
            provider.is_some(),
            "gpt- prefixed ids should resolve via provider prefixes"
        );
        assert_eq!(provider.unwrap(), Provider::OpenAI);
    }

    #[test]
    fn get_provider_for_model_returns_none_for_unknown() {
        let provider = get_provider_for_model("completely-unknown-xyz-model");
        assert!(provider.is_none(), "unknown models should return None");
    }

    #[test]
    fn model_uses_responses_api_for_gpt5_models() {
        // GPT-5 series
        assert!(model_uses_responses_api("gpt-5.6-sol"));
        assert!(model_uses_responses_api("gpt-5.6-luna"));
        assert!(model_uses_responses_api("gpt-5-turbo"));
        assert!(model_uses_responses_api("gpt-5"));
        // Future GPT versions
        assert!(model_uses_responses_api("gpt-6"));
        assert!(model_uses_responses_api("gpt-7-turbo"));
        // GPT-4.1 series
        assert!(model_uses_responses_api("gpt-4.1"));
        assert!(model_uses_responses_api("gpt-4.1-mini"));
        // O-series and codex
        assert!(model_uses_responses_api("o3-mini"));
        assert!(model_uses_responses_api("o4-mini"));
        assert!(model_uses_responses_api("codex-mini-latest"));
        // NOT Responses API (legacy Chat Completions)
        assert!(!model_uses_responses_api("gpt-4o"));
        assert!(!model_uses_responses_api("gpt-4-turbo"));
        assert!(!model_uses_responses_api("gpt-3.5-turbo"));
        assert!(!model_uses_responses_api("claude-opus-5"));
        assert!(!model_uses_responses_api("gemini-2.5-pro"));
    }

    #[test]
    fn catalog_openai_reasoning_models_use_responses() {
        // The catalog classifies the gpt-5.6 lineup as reasoning models that
        // list both Responses and Chat Completions as supported endpoints.
        // AGI deliberately selects Responses so reasoning effort and
        // provider-native tools have one canonical request shape.
        for id in ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"] {
            let entry = CONFIG
                .models
                .get(id)
                .unwrap_or_else(|| panic!("{id} missing from catalog"));
            assert_eq!(entry.provider, "openai", "{id} should be an openai model");
            assert_eq!(
                entry.model_type, "reasoning",
                "{id} should be a reasoning model"
            );
            assert!(
                model_uses_responses_api(id),
                "{id} is a catalog reasoning model and must use Responses"
            );
        }
        // Catalog reasoning-tier OpenAI models still use the Responses API.
        assert!(model_uses_responses_api("gpt-5.6-sol"));
        assert!(model_uses_responses_api("gpt-5.6-luna"));
    }

    #[test]
    fn api_model_id_maps_dotted_internal_ids_to_wire_and_is_idempotent() {
        // BUG 1 regression: the wire body must carry `apiModelId` (dash form),
        // never the dotted internal catalog id. Anthropic returns 404 for the
        // dotted id. Verify every catalog model whose internal id differs from
        // its apiModelId maps correctly AND that re-running through
        // `get_api_model_id` on the already-wire id is a no-op (idempotent) — the
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

        // Pin the specific Anthropic haiku case that surfaced the bug.
        assert_eq!(get_api_model_id("claude-sonnet-5"), "claude-sonnet-5");
        assert_eq!(get_api_model_id("claude-sonnet-5"), "claude-sonnet-5");

        // Pin get_canonicalized_id's reverse-lookup branch directly: it maps a
        // wire (apiModelId) id back to its dotted catalog id, and leaves the
        // catalog id unchanged. This branch is what keeps get_provider_for_model
        // working when handed a wire id; it must not be removed. (Note:
        // get_api_model_id above is idempotent for the wire id with OR without
        // this branch — the branch earns its keep via provider lookup, not
        // idempotence — but the ADAPTER must call get_api_model_id, never
        // get_canonicalized_id, for the wire model field.)
        assert_eq!(get_canonicalized_id("claude-sonnet-5"), "claude-sonnet-5");
        assert_eq!(get_canonicalized_id("claude-sonnet-5"), "claude-sonnet-5");
    }

    #[test]
    fn model_supports_gemini_thinking_for_pro_models() {
        assert!(model_supports_gemini_thinking("gemini-3.1-pro-preview"));
        assert!(!model_supports_gemini_thinking("gemini-3-flash"));
        assert!(!model_supports_gemini_thinking("claude-opus-5"));
    }

    #[test]
    fn model_effort_support_comes_from_exact_catalog_request_metadata() {
        assert!(model_supports_effort("claude-opus-5", "high"));
        assert!(model_supports_effort("claude-opus-5", "xhigh"));
        assert!(model_supports_effort("claude-opus-5", "max"));
        // 3044350c5 admitted the economy reasoning route: sonnet-5 now declares
        // low/medium in the catalog, and support must follow the catalog.
        assert!(model_supports_effort("claude-sonnet-5", "low"));
        assert!(!model_supports_effort("unknown-anthropic-model", "high"));
        assert!(!model_supports_effort("claude-opus-5", "minimal"));
    }

    #[test]
    fn opus_5_request_contract_comes_from_catalog_metadata() {
        assert!(model_uses_adaptive_thinking("claude-opus-5"));
        assert!(model_rejects_sampling_parameters("claude-opus-5"));
        assert!(model_allows_effort_with_thinking_disabled(
            "claude-opus-5",
            "high"
        ));
        assert!(!model_allows_effort_with_thinking_disabled(
            "claude-opus-5",
            "xhigh"
        ));
        assert!(!model_allows_effort_with_thinking_disabled(
            "claude-opus-5",
            "max"
        ));
        assert_eq!(
            max_effort_when_thinking_disabled("claude-opus-5"),
            Some("high")
        );
    }

    #[test]
    fn get_all_model_entries_non_empty() {
        let models = get_all_model_entries();
        assert!(!models.is_empty(), "model entries must not be empty");
        // Spot-check a well-known model exists
        assert!(
            models.contains_key("claude-opus-5") || models.contains_key("claude-sonnet-5"),
            "At least one claude model must be in the catalog"
        );
    }

    #[test]
    fn get_pricing_returns_some_for_known_model() {
        let pricing = get_pricing(&Provider::Anthropic, "claude-opus-5", priced_on());
        assert!(pricing.is_some(), "claude-opus-5 must have pricing");
        let p = pricing.unwrap();
        assert!(
            p.input_per_million > 0.0 || p.output_per_million > 0.0,
            "claude-opus-5 pricing must be non-zero"
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
        let pricing = get_pricing(&Provider::Anthropic, "claude-opus-5", priced_on());
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
