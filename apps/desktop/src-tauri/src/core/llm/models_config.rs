//! Single-source-of-truth model catalog loaded from `models.json`.
//!
//! All model metadata (IDs, pricing, context windows, SSE delimiters, token
//! multipliers, canonicalization maps, task routing) lives in one JSON file
//! shared between the Rust backend and TS frontend.  This module deserializes
//! it at startup via `include_str!` and exposes lookup helpers consumed by
//! `sse_parser`, `token_counter`, `llm_router`, `provider_adapter`,
//! `cost_calculator`, and `sys/commands/llm`.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;

use super::Provider;

// ---------------------------------------------------------------------------
// Embedded JSON (compile-time)
// ---------------------------------------------------------------------------

/// The raw JSON string, embedded at compile time.
/// Path is relative to this .rs file:
///   src-tauri/src/core/llm/models_config.rs  ->  ../../../../src/constants/models.json
const MODELS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/constants/models.json"
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
    pub tier_allowed_models: TierConfig,
    pub model_presets: HashMap<String, Vec<PresetOption>>,
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

/// Pricing per million tokens.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PricingEntry {
    pub input_per_million: f64,
    pub output_per_million: f64,
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
    pub capabilities: ModelCapabilities,
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

/// Subscription tier allowed-model lists.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct TierConfig {
    pub economy: Vec<String>,
    pub pro_additions: Vec<String>,
    pub flagship_additions: Vec<String>,
}

/// Preset option for the QuickModelSelector UI.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PresetOption {
    pub value: String,
    pub label: String,
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
        .unwrap_or_else(|| {
            debug_assert!(
                CONFIG.models.contains_key("gpt-5-nano"),
                "Fallback model 'gpt-5-nano' not found in models.json"
            );
            "gpt-5-nano"
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
        .unwrap_or_else(|| get_default_model(provider))
}

/// Pricing (input, output per 1M tokens) for a specific model.
/// Falls back to provider default, then to (1.0, 1.0).
pub fn get_pricing(provider: &Provider, model_id: &str) -> PricingEntry {
    if let Some(model) = CONFIG.models.get(model_id) {
        return PricingEntry {
            input_per_million: model.input_cost,
            output_per_million: model.output_cost,
        };
    }
    if let Some(provider_cfg) = CONFIG.providers.get(provider.as_string()) {
        return provider_cfg.default_pricing.clone();
    }
    PricingEntry {
        input_per_million: 1.0,
        output_per_million: 1.0,
    }
}

/// Token estimation multiplier for a provider.
/// Returns the prompt multiplier (prompt == completion for all current providers).
pub fn get_token_multiplier(provider: &Provider) -> f64 {
    CONFIG
        .providers
        .get(provider.as_string())
        .map(|p| p.token_multiplier.prompt)
        .unwrap_or(1.0)
}

/// Resolve the wire API model ID for a given catalog model ID.
///
/// If the catalog entry has an `apiModelId` field set (e.g. `"mistral-medium-2508"` for
/// the internal key `"mistral-medium-3"`), that wire string is returned so it can be sent
/// directly in the HTTP request body.  Falls back to the input unchanged when no entry or
/// no `apiModelId` is found.
pub fn get_api_model_id(model_id: &str) -> String {
    if let Some(entry) = CONFIG.models.get(model_id) {
        if let Some(api_id) = &entry.api_model_id {
            return api_id.clone();
        }
    }
    model_id.to_string()
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
    model_id.to_string()
}

/// Infer the Rust `Provider` enum from a model ID string using prefix matching.
/// Returns `None` if no prefix matches (caller should default to ManagedCloud).
pub fn get_provider_for_model(model_id: &str) -> Option<Provider> {
    let model_lower = model_id.to_lowercase();
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
///   - GPT-5 series (gpt-5, gpt-5.1, gpt-5.2, gpt-5.3, gpt-5.4, gpt-5-mini, gpt-5.3-codex)
///   - GPT-4.1 series (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
///   - O-series reasoning (o3, o3-mini, o3-pro, o3-deep-research, o4-mini, o4-mini-deep-research)
///   - GPT open-source (gpt-oss-120b, gpt-oss-20b)
///   - Codex models (codex-mini-latest)
///
/// Chat Completions remains the default for older models (gpt-4o, gpt-4-turbo, gpt-3.5-turbo).
pub fn model_uses_responses_api(model_id: &str) -> bool {
    let id = model_id.to_lowercase();
    id.starts_with("gpt-5")
        || id.starts_with("gpt-4.1")
        || id.starts_with("o3")
        || id.starts_with("o4")
        || id.starts_with("gpt-oss")
        || id.starts_with("codex-")
}

/// Whether a model supports Gemini-style thinking_config.
pub fn model_supports_gemini_thinking(model_id: &str) -> bool {
    model_id.contains("gemini-3-pro")
        || model_id.contains("gemini-3.1-pro")
        || model_id.contains("gemini-2.5-pro")
}

/// Return all model entries from the catalog.
pub fn get_all_model_entries() -> &'static HashMap<String, ModelEntry> {
    &CONFIG.models
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::llm::Provider;

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
            Provider::Zhipu,
            Provider::ManagedCloud,
            Provider::Mistral,
            Provider::Groq,
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
            Provider::Zhipu,
            Provider::ManagedCloud,
            Provider::Mistral,
            Provider::Groq,
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
    fn get_provider_for_model_returns_some_for_known_prefix() {
        // gpt- prefix maps to OpenAI
        let provider = get_provider_for_model("gpt-5.2");
        assert!(provider.is_some(), "gpt-5.2 should resolve to a provider");
        assert_eq!(provider.unwrap(), Provider::OpenAI);
    }

    #[test]
    fn get_provider_for_model_returns_none_for_unknown() {
        let provider = get_provider_for_model("completely-unknown-xyz-model");
        assert!(provider.is_none(), "unknown models should return None");
    }

    #[test]
    fn model_uses_responses_api_for_gpt5_models() {
        assert!(model_uses_responses_api("gpt-5.2"));
        assert!(model_uses_responses_api("gpt-5-nano"));
        assert!(!model_uses_responses_api("claude-opus-4-6"));
        assert!(!model_uses_responses_api("gemini-2.5-pro"));
    }

    #[test]
    fn model_supports_gemini_thinking_for_pro_models() {
        assert!(model_supports_gemini_thinking("gemini-2.5-pro"));
        assert!(!model_supports_gemini_thinking("gemini-2.0-flash"));
        assert!(!model_supports_gemini_thinking("claude-opus-4-6"));
    }

    #[test]
    fn get_all_model_entries_non_empty() {
        let models = get_all_model_entries();
        assert!(!models.is_empty(), "model entries must not be empty");
        // Spot-check a well-known model exists
        assert!(
            models.contains_key("claude-opus-4.6") || models.contains_key("claude-sonnet-4.6"),
            "At least one claude model must be in the catalog"
        );
    }

    #[test]
    fn get_pricing_returns_non_zero_for_known_model() {
        let pricing = get_pricing(&Provider::Anthropic, "claude-opus-4-6");
        assert!(
            pricing.input_per_million > 0.0 || pricing.output_per_million > 0.0,
            "claude-opus-4-6 pricing must be non-zero"
        );
    }

    #[test]
    fn get_sse_delimiter_returns_valid_bytes() {
        let delim = get_sse_delimiter(&Provider::Anthropic);
        assert!(!delim.is_empty(), "SSE delimiter must not be empty");
    }
}
