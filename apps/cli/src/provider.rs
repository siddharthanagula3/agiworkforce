//! LLM provider trait and per-provider implementations.
//!
//! Each provider normalizes messages, tool definitions, and streaming responses
//! into a common format. Provider-specific quirks are handled here.

// Provider catalog mixes live helpers (find_model, provider_for_model,
// format_model_list[_with_local], used by lib.rs, doctor.rs, slash_commands.rs,
// --list-models) with reserved-for-future-wiring helpers
// (models_for_provider, supports_tool_use, default_temperature, …). Rather than
// a blanket file-level `#![allow(dead_code)]`, each currently-unwired item
// carries its own scoped `#[allow(dead_code)]` so a genuinely orphaned *new*
// helper still trips the dead-code lint instead of rotting unnoticed.

use crate::model_catalog;
use serde_json::Value;

/// Static model catalog entry.
///
/// Some capability fields (`supports_audio_input`, `supports_audio_output`,
/// `supports_pdf`, `release_date`) are currently only surfaced by the reserved
/// `format_model_detail` view, so the struct carries a scoped `dead_code` allow
/// for its not-yet-wired fields rather than a module-wide suppression.
#[derive(Debug, Clone)]
#[allow(dead_code)] // reserved capability fields surfaced only by format_model_detail
pub struct ModelInfo {
    pub id: String,
    pub provider: String,
    pub context_window: usize,
    pub input_price_per_1m: f64,  // USD per 1M input tokens
    pub output_price_per_1m: f64, // USD per 1M output tokens
    pub supports_tools: bool,
    pub supports_vision: bool,
    pub supports_reasoning: bool, // extended thinking / reasoning
    pub supports_audio_input: bool,
    pub supports_audio_output: bool,
    pub supports_pdf: bool,
    pub max_output_tokens: usize,
    pub status: String,       // "active", "beta", "deprecated"
    pub release_date: String, // "2025-03" etc.
}

/// Built-in model catalog with capabilities and pricing.
pub fn model_catalog() -> Vec<ModelInfo> {
    model_catalog::catalog()
        .all()
        .iter()
        .map(ModelInfo::from)
        .collect()
}

impl From<&model_catalog::Model> for ModelInfo {
    fn from(model: &model_catalog::Model) -> Self {
        Self {
            id: model.id.clone(),
            provider: model.provider.clone(),
            context_window: model.context_window,
            input_price_per_1m: model.input_price_per_1m,
            output_price_per_1m: model.output_price_per_1m,
            supports_tools: model.supports_tools,
            supports_vision: model.supports_vision,
            supports_reasoning: model.supports_reasoning,
            supports_audio_input: model.supports_audio_input,
            supports_audio_output: model.supports_audio_output,
            supports_pdf: model.supports_pdf,
            max_output_tokens: model.max_output_tokens,
            status: model.status.clone(),
            release_date: model.release_date.clone(),
        }
    }
}

/// Look up a model by ID (case-insensitive, exact match preferred, then an
/// *unambiguous* prefix match).
///
/// The prefix fallback only resolves when exactly one catalog entry matches the
/// bidirectional prefix relation. A truncated query that matches
/// several entries returns `None` rather than silently binding to whichever
/// model happens to come first in catalog order, otherwise capability,
/// pricing, and deprecation lookups could bind to the wrong model.
pub fn find_model(model_id: &str) -> Option<ModelInfo> {
    let lower = model_id.to_lowercase();
    let catalog = model_catalog();

    // Prefer exact match first
    if let Some(exact) = catalog.iter().find(|m| m.id.to_lowercase() == lower) {
        return Some(exact.clone());
    }

    // Fall back to prefix match, but only when it is unambiguous.
    let mut matches = catalog.iter().filter(|m| {
        let id = m.id.to_lowercase();
        lower.starts_with(&id) || id.starts_with(&lower)
    });
    let first = matches.next()?;
    match matches.next() {
        // Exactly one prefix match → safe to resolve.
        None => Some(first.clone()),
        // Two or more candidates → ambiguous, refuse to guess.
        Some(_) => None,
    }
}

/// List all models for a given provider.
#[allow(dead_code)] // reserved: provider-scoped catalog views (exercised by tests)
pub fn models_for_provider(provider: &str) -> Vec<ModelInfo> {
    model_catalog()
        .into_iter()
        .filter(|m| m.provider == provider)
        .collect()
}

fn looks_like_local_ollama_model(model_id: &str) -> bool {
    let lower = model_id.to_lowercase();
    lower.starts_with("ollama:") || (lower.contains(':') && !lower.contains('/'))
}

/// Auto-detect the provider name from a model ID string.
///
/// Hosted model IDs must be known to the catalog. This deliberately avoids
/// prefix-only guesses like `claude-*` or `gpt-*`, which made typoed or
/// invented cloud model IDs look valid. Local Ollama-style names are accepted
/// and then verified by the local provider at request time.
pub fn provider_for_model(model_id: &str) -> Option<&'static str> {
    let lower = model_id.to_lowercase();

    if let Some(model) = model_catalog::find(model_id) {
        return Some(model.provider.as_str());
    }
    if let Some(model) = lower.strip_prefix("models/").and_then(model_catalog::find) {
        return Some(model.provider.as_str());
    }
    if looks_like_local_ollama_model(&lower) {
        Some("ollama")
    } else {
        None
    }
}

/// Check whether a model supports tool use (function calling).
///
/// Returns `false` for unknown models (safe default, avoids sending tool
/// schemas to models that would reject or ignore them).
#[allow(dead_code)] // reserved: tool-schema gating (exercised by tests)
pub fn supports_tool_use(model_id: &str) -> bool {
    find_model(model_id).is_some_and(|m| m.supports_tools)
}

/// Get default temperature for a model (some models have specific defaults).
///
/// Returns `None` when the parameter should be omitted and the provider default
/// used. Returns `Some(value)` only when a model-specific temperature is both
/// recommended *and* accepted by that provider.
///
/// Provider-specific sampling exclusions are enforced by the request boundary
/// from `reasoning.rejectsSamplingParameters` in the canonical catalog. This
/// helper only supplies an accepted family default where one is documented.
#[allow(dead_code)] // reserved: per-model temperature defaulting (exercised by tests)
pub fn default_temperature(model_id: &str) -> Option<f64> {
    // The DeepSeek reasoning tier prefers deterministic output and accepts low
    // temperatures. Both provider and reasoning support come from the catalog.
    if provider_for_model(model_id) == Some("deepseek") && supports_reasoning(model_id) {
        return Some(0.0);
    }

    // Google models default to 1.0. Models whose provider genuinely rejects sampling parameters
    // are excluded at the request boundary from the catalog flag
    // (`models::streaming::effective_temperature`), not from a list here.
    if provider_for_model(model_id) == Some("google") {
        return Some(1.0);
    }

    // Claude models: use provider default (1.0 server-side)
    // OpenAI non-reasoning: use provider default
    // Ollama: use provider default
    None
}

/// Check if a model supports extended thinking / reasoning mode.
///
/// Returns `false` for unknown models.
#[allow(dead_code)] // reserved: reasoning-mode gating (exercised by tests)
pub fn supports_reasoning(model_id: &str) -> bool {
    find_model(model_id).is_some_and(|m| m.supports_reasoning)
}

/// Check if a model is deprecated.
///
/// Returns `false` for unknown models.
#[allow(dead_code)] // reserved: deprecation warnings (exercised by tests)
pub fn is_deprecated(model_id: &str) -> bool {
    find_model(model_id).is_some_and(|m| m.status == "deprecated")
}

/// Format a verbose detail string for a single model.
///
/// Example output:
/// ```text
/// catalog-selected-model  (provider)  [active]
///   Context window:  1M tokens
///   Max output:      128K tokens
///   Pricing:         $5.00 / $25.00 per 1M tokens (input/output)
///   Tool use:        yes
///   Vision:          yes
///   Reasoning:       yes
///   Audio in/out:    no / no
///   PDF:             yes
/// ```
#[allow(dead_code)] // reserved: verbose per-model detail view (exercised by tests)
pub fn format_model_detail(model: &ModelInfo) -> String {
    let ctx = format_context_size(model.context_window);
    let max_out = format_context_size(model.max_output_tokens);
    let price = if model.input_price_per_1m == 0.0 && model.output_price_per_1m == 0.0 {
        "free (local)".to_string()
    } else {
        let tier_note = if model_catalog::input_token_pricing_tiers(&model.id).is_empty() {
            "base"
        } else {
            "base; request tiers available"
        };
        format!(
            "${:.2} / ${:.2} per 1M tokens (input/output, {tier_note})",
            model.input_price_per_1m, model.output_price_per_1m,
        )
    };
    let yes_no = |b: bool| if b { "yes" } else { "no" };

    format!(
        "{}  ({})  [{}]\n  Context window:  {} tokens\n  Max output:      {} tokens\n  Pricing:         {}\n  Tool use:        {}\n  Vision:          {}\n  Reasoning:       {}\n  Audio in/out:    {} / {}\n  PDF:             {}",
        model.id,
        model.provider,
        model.status,
        ctx,
        max_out,
        price,
        yes_no(model.supports_tools),
        yes_no(model.supports_vision),
        yes_no(model.supports_reasoning),
        yes_no(model.supports_audio_input),
        yes_no(model.supports_audio_output),
        yes_no(model.supports_pdf),
    )
}

/// Format the model catalog as a display string for --list-models / /models.
pub fn format_model_list() -> String {
    let mut out = String::new();
    let catalog = model_catalog();

    let mut current_provider = String::new();
    for model in &catalog {
        if model.provider != current_provider {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&format!("{}:\n", model.provider.to_uppercase()));
            current_provider = model.provider.clone();
        }

        let status_icon = match model.status.as_str() {
            "beta" => "B",
            "deprecated" => "!",
            _ => " ", // "active"
        };
        let tools_icon = if model.supports_tools { "T" } else { " " };
        let vision_icon = if model.supports_vision { "V" } else { " " };
        let reasoning_icon = if model.supports_reasoning { "R" } else { " " };
        let ctx = format_context_size(model.context_window);
        let max_out = format_context_size(model.max_output_tokens);
        let price = if model.input_price_per_1m == 0.0 {
            "free".to_string()
        } else {
            let tier_note = if model_catalog::input_token_pricing_tiers(&model.id).is_empty() {
                "base"
            } else {
                "base+tiered"
            };
            format!(
                "${:.2}/${:.2} {tier_note}",
                model.input_price_per_1m, model.output_price_per_1m,
            )
        };

        out.push_str(&format!(
            "  {}{:<30} [{}{}{}] {:>6} ctx {:>5} out  {}\n",
            status_icon, model.id, tools_icon, vision_icon, reasoning_icon, ctx, max_out, price
        ));
    }

    out.push_str(
        "\nFlags: T=tools, V=vision, R=reasoning. !=deprecated, B=beta.\n\
         Prices per 1M tokens (input/output); `base+tiered` has request-input bands shown by `agi --cost MODEL`.\n",
    );
    out
}

/// Format static catalog models plus live managed-gateway and local discovery.
pub async fn format_model_list_with_discovery(config: &crate::config::CliConfig) -> String {
    let mut out = format_model_list();
    let (probes, gateway) = tokio::join!(
        crate::local_models::discover_all(config),
        crate::models::gateway_models::discover_gateway_models(),
    );
    match gateway {
        Ok(catalog) => {
            out.push('\n');
            out.push_str(&format!(
                "AGI MANAGED CLOUD (live · {}{}):\n",
                catalog.user_tier,
                if catalog.authenticated {
                    " · authenticated"
                } else {
                    " · public"
                }
            ));
            let models = crate::models::gateway_models::picker_models(&catalog);
            if models.is_empty() {
                out.push_str("  No models available to this CLI account tier.\n");
            } else {
                for model in models {
                    out.push_str(&format!(
                        "  {:<34} {:>6} ctx {:>5} out\n",
                        model.id,
                        format_context_size(model.context_window),
                        format_context_size(model.max_output_tokens),
                    ));
                }
            }
        }
        Err(error) => {
            out.push('\n');
            out.push_str(&format!(
                "AGI MANAGED CLOUD: discovery unavailable ({error})\n"
            ));
        }
    }

    let discovered = crate::local_models::discovered_models(&probes);
    if !discovered.is_empty() {
        out.push('\n');
        out.push_str("INSTALLED LOCAL MODELS:\n");
        for model in discovered {
            out.push_str(&format!(
                "  {:<12} {:<34} {}\n",
                model.provider, model.id, model.base_url
            ));
        }
    }
    out
}

fn format_context_size(tokens: usize) -> String {
    if tokens >= 1_000_000 {
        format!("{}M", tokens / 1_000_000)
    } else {
        format!("{}K", tokens / 1_000)
    }
}

/// Provider-specific message normalization rules.
///
/// Namespace-only unit struct: its associated helpers are reserved for the
/// not-yet-wired provider normalization path (currently exercised by tests), so
/// it carries a scoped `dead_code` allow instead of a module-wide suppression.
#[allow(dead_code)] // reserved: provider message normalization namespace
pub struct MessageNormalizer;

impl MessageNormalizer {
    /// Sanitize a tool ID for Anthropic (only alphanumeric, underscore, hyphen allowed).
    #[allow(dead_code)] // reserved: provider message normalization (exercised by tests)
    pub fn sanitize_anthropic_tool_id(id: &str) -> String {
        id.chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '_' || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect()
    }

    /// Generate a Mistral-compatible tool ID (exactly 9 alphanumeric chars).
    #[allow(dead_code)] // reserved: provider message normalization (exercised by tests)
    pub fn mistral_tool_id(index: usize) -> String {
        format!("call{:05}", index)
    }

    /// Sanitize a JSON Schema for Gemini (remove unsupported fields).
    ///
    /// Gemini's function-declaration schema is an OpenAPI 3.0 subset and rejects
    /// several JSON Schema keywords. We strip the unsupported set at every level
    /// and recurse through *all* schema-bearing positions, not just
    /// `properties`, so array-item and union sub-schemas are sanitized too.
    /// Otherwise tools with `items`/`anyOf`/`oneOf` sub-schemas still carry
    /// rejected fields and fail tool registration with a 400.
    #[allow(dead_code)] // reserved: Gemini schema sanitization (exercised by tests)
    pub fn sanitize_gemini_schema(schema: &Value) -> Value {
        // Keywords Gemini's function-declaration schema rejects outright.
        const UNSUPPORTED_KEYS: &[&str] = &[
            "default",
            "$schema",
            "$id",
            "$ref",
            "$defs",
            "definitions",
            "additionalProperties",
            "patternProperties",
            "examples",
            "const",
            "exclusiveMinimum",
            "exclusiveMaximum",
            "not",
        ];
        // Keys whose value is a single nested sub-schema.
        const SUBSCHEMA_KEYS: &[&str] = &["items", "additionalItems", "contains"];
        // Keys whose value is an array of nested sub-schemas.
        const SUBSCHEMA_LIST_KEYS: &[&str] = &["anyOf", "oneOf", "allOf", "prefixItems"];

        let mut cleaned = schema.clone();
        if let Some(obj) = cleaned.as_object_mut() {
            for key in UNSUPPORTED_KEYS {
                obj.remove(*key);
            }

            // Recurse into the named property sub-schemas.
            if let Some(props_obj) = obj.get_mut("properties").and_then(Value::as_object_mut) {
                for (_key, val) in props_obj.iter_mut() {
                    *val = Self::sanitize_gemini_schema(val);
                }
            }

            // Recurse into single nested sub-schema positions.
            for key in SUBSCHEMA_KEYS {
                if let Some(val) = obj.get_mut(*key) {
                    *val = Self::sanitize_gemini_schema(val);
                }
            }

            // Recurse into arrays-of-sub-schema positions.
            for key in SUBSCHEMA_LIST_KEYS {
                if let Some(arr) = obj.get_mut(*key).and_then(Value::as_array_mut) {
                    for val in arr.iter_mut() {
                        *val = Self::sanitize_gemini_schema(val);
                    }
                }
            }
        }
        cleaned
    }

    /// Filter empty messages (some providers reject them).
    #[allow(dead_code)] // reserved: provider message normalization (exercised by tests)
    pub fn filter_empty_messages(messages: &[Value]) -> Vec<Value> {
        messages
            .iter()
            .filter(|m| {
                if let Some(content) = m.get("content") {
                    if let Some(s) = content.as_str() {
                        return !s.is_empty();
                    }
                    if let Some(arr) = content.as_array() {
                        return !arr.is_empty();
                    }
                }
                true
            })
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn openai_catalog_models() -> Vec<ModelInfo> {
        model_catalog()
            .into_iter()
            .filter(|model| model.provider == "openai")
            .collect()
    }

    fn first_openai_model() -> ModelInfo {
        openai_catalog_models()
            .into_iter()
            .next()
            .expect("embedded catalog must include an OpenAI text model")
    }

    fn first_model_matching(provider: &str, predicate: impl Fn(&ModelInfo) -> bool) -> ModelInfo {
        models_for_provider(provider)
            .into_iter()
            .find(predicate)
            .unwrap_or_else(|| panic!("embedded catalog lacks required {provider} model"))
    }

    // ── model_catalog ──────────────────────────────────────────

    #[test]
    fn test_model_catalog_not_empty() {
        assert!(!model_catalog().is_empty());
    }

    #[test]
    fn test_catalog_has_expected_provider_families() {
        let catalog = model_catalog();
        for provider in [
            "anthropic",
            "openai",
            "google",
            "xai",
            "minimax",
            "moonshot",
            "deepseek",
            "zhipu",
        ] {
            assert!(
                catalog.iter().any(|model| model.provider == provider),
                "CLI catalog must expose the registry's {provider} family"
            );
        }
    }

    #[test]
    fn test_all_models_have_positive_context() {
        for model in model_catalog() {
            assert!(
                model.context_window > 0,
                "Model {} has zero context window",
                model.id
            );
        }
    }

    #[test]
    fn test_no_duplicate_model_ids() {
        let catalog = model_catalog();
        let mut ids: Vec<String> = catalog.iter().map(|m| m.id.clone()).collect();
        let original_len = ids.len();
        ids.sort();
        ids.dedup();
        assert_eq!(
            ids.len(),
            original_len,
            "Catalog contains duplicate model IDs"
        );
    }

    #[test]
    fn test_ollama_models_are_free() {
        for model in models_for_provider("ollama") {
            assert_eq!(model.input_price_per_1m, 0.0, "{} should be free", model.id);
            assert_eq!(
                model.output_price_per_1m, 0.0,
                "{} should be free",
                model.id
            );
        }
    }

    // ── capability matrix fields ──────────────────────────────

    #[test]
    fn test_all_models_have_valid_status() {
        for model in model_catalog() {
            assert!(
                ["active", "beta", "deprecated"].contains(&model.status.as_str()),
                "Model {} has invalid status: {}",
                model.id,
                model.status
            );
        }
    }

    /// Presence is asserted against the SSOT rather than demanded outright: a
    /// model whose curated entry carries no published date keeps an empty
    /// string, and inventing one would be worse than reporting the gap. Every
    /// date the SSOT does publish must still normalize to `YYYY-MM`.
    #[test]
    fn test_all_models_have_release_date() {
        let mut dated = 0usize;
        for model in model_catalog() {
            let published = ssot_string_field(&model.id, "released").unwrap_or_default();
            assert_eq!(
                model.release_date.is_empty(),
                published.trim().is_empty(),
                "release_date for {} disagrees with models.json released {:?}",
                model.id,
                published
            );
            if model.release_date.is_empty() {
                continue;
            }
            let (year, month) = model
                .release_date
                .split_once('-')
                .unwrap_or_else(|| panic!("{} release_date must be YYYY-MM", model.id));
            assert!(
                year.len() == 4 && year.chars().all(|c| c.is_ascii_digit()),
                "Model {} release_date should be YYYY-MM, got: {}",
                model.id,
                model.release_date
            );
            assert!(
                month.len() == 2 && (1..=12).contains(&month.parse::<u8>().unwrap_or_default()),
                "Model {} release_date should be YYYY-MM, got: {}",
                model.id,
                model.release_date
            );
            dated += 1;
        }
        assert!(
            dated >= 10,
            "expected the catalog to carry at least 10 published release dates, got {dated}"
        );
    }

    #[test]
    fn test_all_models_have_positive_max_output() {
        for model in model_catalog() {
            assert!(
                model.max_output_tokens > 0,
                "Model {} has zero max_output_tokens",
                model.id
            );
        }
    }

    #[test]
    fn test_reasoning_models_flagged() {
        let catalog = model_catalog();
        assert!(catalog.iter().any(|model| model.supports_reasoning));
        for model in catalog {
            assert_eq!(
                supports_reasoning(&model.id),
                model.supports_reasoning,
                "{}",
                model.id
            );
        }
    }

    #[test]
    fn test_google_catalog_includes_a_reasoning_model() {
        assert!(models_for_provider("google")
            .iter()
            .any(|model| model.supports_reasoning));
    }

    fn ssot_models() -> &'static serde_json::Map<String, serde_json::Value> {
        static SSOT: std::sync::OnceLock<serde_json::Value> = std::sync::OnceLock::new();
        SSOT.get_or_init(|| {
            serde_json::from_str(include_str!(
                "../../../packages/contracts/types/src/models.json"
            ))
            .expect("models.json must parse")
        })
        .get("models")
        .and_then(|models| models.as_object())
        .expect("models.json must have a models object")
    }

    fn ssot_entry(api_id: &str) -> Option<&'static serde_json::Value> {
        ssot_models().iter().find_map(|(canonical_id, entry)| {
            let entry_api_id = entry
                .get("apiModelId")
                .and_then(|value| value.as_str())
                .unwrap_or(canonical_id);
            (entry_api_id == api_id).then_some(entry)
        })
    }

    fn ssot_string_field(api_id: &str, field: &str) -> Option<String> {
        ssot_entry(api_id)
            .and_then(|entry| entry.get(field))
            .and_then(|value| value.as_str())
            .map(str::to_string)
    }

    /// Guard against test-vs-SSOT drift: derive reasoning expectations from
    /// `packages/contracts/types/src/models.json` (the SSOT the catalog is compiled
    /// from) instead of hardcoding per-model booleans. A capability flip in
    /// the SSOT (e.g. Haiku 4.5 thinking=true in the effort-catalog wave)
    /// must never leave this suite asserting stale values.
    ///
    /// The lookup is exact, never `find_model`: its unambiguous-prefix fallback
    /// binds an SSOT id the CLI catalog excludes to a sibling that shares its
    /// prefix, and then compares that sibling's capabilities to the wrong entry.
    #[test]
    fn test_reasoning_flags_match_ssot_thinking_capability() {
        let catalog = model_catalog();
        let mut checked = 0usize;
        for (canonical_id, entry) in ssot_models() {
            let api_id = entry
                .get("apiModelId")
                .and_then(|v| v.as_str())
                .unwrap_or(canonical_id);
            let thinking = entry
                .get("capabilities")
                .and_then(|c| c.get("thinking"))
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            // Only models that made it into the CLI catalog (supported
            // provider, CLI-compatible modelType, not deprecated) are checked.
            if let Some(model) = catalog.iter().find(|model| model.id == api_id) {
                assert_eq!(
                    model.supports_reasoning, thinking,
                    "supports_reasoning for '{}' diverged from models.json capabilities.thinking",
                    api_id
                );
                checked += 1;
            }
        }
        assert!(
            checked >= 10,
            "expected to cross-check at least 10 catalog models against the SSOT, got {}",
            checked
        );
    }

    #[test]
    fn test_capabilities_match_shared_catalog() {
        for model in model_catalog() {
            let shared = crate::model_catalog::find(&model.id)
                .expect("provider view model must resolve in shared catalog");
            assert_eq!(model.supports_tools, shared.supports_tools, "{}", model.id);
            assert_eq!(
                model.supports_vision, shared.supports_vision,
                "{}",
                model.id
            );
            assert_eq!(
                model.supports_reasoning, shared.supports_reasoning,
                "{}",
                model.id
            );
            assert_eq!(
                model.supports_audio_input, shared.supports_audio_input,
                "{}",
                model.id
            );
            assert_eq!(
                model.supports_audio_output, shared.supports_audio_output,
                "{}",
                model.id
            );
            assert_eq!(model.supports_pdf, shared.supports_pdf, "{}", model.id);
        }
    }

    // ── find_model ─────────────────────────────────────────────

    #[test]
    fn test_find_model_exact() {
        let id = first_openai_model().id;
        let model = find_model(&id);
        assert!(model.is_some());
        assert_eq!(model.unwrap().provider, "openai");
    }

    #[test]
    fn test_find_model_case_insensitive() {
        let id = first_openai_model().id.to_ascii_uppercase();
        let model = find_model(&id);
        assert!(model.is_some());
    }

    #[test]
    fn test_find_model_not_found() {
        assert!(find_model("nonexistent-model-xyz").is_none());
    }

    #[test]
    fn test_find_model_resolves_every_catalog_entry() {
        for model in model_catalog() {
            assert!(find_model(&model.id).is_some(), "{}", model.id);
        }
    }

    // ── models_for_provider ────────────────────────────────────

    #[test]
    fn test_models_for_provider() {
        let anthropic = models_for_provider("anthropic");
        assert!(anthropic.len() >= 3);
        assert!(anthropic.iter().all(|m| m.provider == "anthropic"));
    }

    #[test]
    fn test_models_for_provider_ollama_is_live_discovery_only() {
        let ollama = models_for_provider("ollama");
        assert!(
            ollama.is_empty(),
            "local Ollama models are discovered live by local_models.rs, not hardcoded in the cloud catalog"
        );
    }

    #[test]
    fn test_models_for_provider_unknown() {
        assert!(models_for_provider("nonexistent_provider").is_empty());
    }

    // ── provider_for_model ─────────────────────────────────────

    fn first_model_id_for(provider: &str) -> String {
        models_for_provider(provider)
            .first()
            .unwrap_or_else(|| panic!("expected at least one {provider} model"))
            .id
            .clone()
    }

    #[test]
    fn test_provider_for_model_catalog_anthropic() {
        let model = first_model_id_for("anthropic");
        assert_eq!(provider_for_model(&model), Some("anthropic"));
        assert_eq!(provider_for_model("fixture-unknown-anthropic-model"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_openai() {
        let model = first_model_id_for("openai");
        assert_eq!(provider_for_model(&model), Some("openai"));
        assert_eq!(provider_for_model("fixture-unknown-cloud-model"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_google() {
        let model = first_model_id_for("google");
        assert_eq!(provider_for_model(&model), Some("google"));
        assert_eq!(provider_for_model("fixture-unknown-google-model"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_minimax() {
        let model = first_model_id_for("minimax");
        assert_eq!(provider_for_model(&model), Some("minimax"));
        assert_eq!(provider_for_model("fixture-unknown-minimax-model"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_xai() {
        let model = first_model_id_for("xai");
        assert_eq!(provider_for_model(&model), Some("xai"));
        assert_eq!(provider_for_model("fixture-unknown-xai-model"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_deepseek() {
        let model = first_model_id_for("deepseek");
        assert_eq!(provider_for_model(&model), Some("deepseek"));
        assert_eq!(provider_for_model("fixture-unknown-deepseek-model"), None);
    }

    #[test]
    fn test_provider_for_model_local_ollama_names() {
        assert_eq!(provider_for_model("ollama:fixture-model"), Some("ollama"));
        assert_eq!(
            provider_for_model("fixture-local-model:latest"),
            Some("ollama")
        );
        assert_eq!(provider_for_model("fixture-local-model"), None);
    }

    #[test]
    fn test_provider_for_model_case_insensitive() {
        let model = first_model_id_for("anthropic").to_uppercase();
        assert_eq!(provider_for_model(&model), Some("anthropic"));
    }

    #[test]
    fn test_provider_for_model_unknown() {
        assert_eq!(provider_for_model("totally-unknown-model"), None);
    }

    // ── supports_tool_use ──────────────────────────────────────

    #[test]
    fn test_supports_tool_use_true() {
        let tool_models: Vec<ModelInfo> = model_catalog()
            .into_iter()
            .filter(|model| model.supports_tools)
            .collect();
        assert!(!tool_models.is_empty());
        assert!(tool_models.iter().all(|model| supports_tool_use(&model.id)));
    }

    #[test]
    fn test_supports_tool_use_false() {
        assert!(!supports_tool_use("fixture-local-model:latest"));
        assert!(!supports_tool_use("ollama:fixture-model"));
    }

    #[test]
    fn test_supports_tool_use_unknown_returns_false() {
        assert!(!supports_tool_use("nonexistent-model"));
    }

    // ── default_temperature ────────────────────────────────────

    #[test]
    fn test_default_temperature_reasoning_models() {
        let reasoning_model = first_model_matching("deepseek", |model| model.supports_reasoning);
        assert_eq!(default_temperature(&reasoning_model.id), Some(0.0));
        assert_eq!(default_temperature("fixture-reasoning-model"), None);
    }

    #[test]
    fn test_default_temperature_gemini() {
        // No Gemini model currently carries reasoning.rejectsSamplingParameters,
        // so every one of them takes the family default. If a Gemini release
        // starts rejecting temperature, set the flag in models.curation.json.
        // do not add an ID back here. The flag is enforced in
        // `models::streaming::effective_temperature`, which is what the request
        // body actually reads.
        for model in models_for_provider("google") {
            assert_eq!(
                default_temperature(&model.id),
                Some(1.0),
                "{} must take the Google family default, per-model sampling \
                 exclusions belong in models.json, not in an ID arm here",
                model.id
            );
        }
    }

    #[test]
    fn test_default_temperature_anthropic_none() {
        for model in models_for_provider("anthropic") {
            assert_eq!(default_temperature(&model.id), None);
        }
    }

    #[test]
    fn test_default_temperature_openai_non_reasoning_none() {
        for model in openai_catalog_models() {
            assert_eq!(default_temperature(&model.id), None);
        }
    }

    #[test]
    fn test_default_temperature_ollama_none() {
        assert_eq!(default_temperature("fixture-local-model:latest"), None);
        assert_eq!(default_temperature("ollama:fixture-model"), None);
    }

    #[test]
    fn test_default_temperature_unknown_none() {
        assert_eq!(default_temperature("nonexistent-model"), None);
    }

    // ── supports_reasoning ─────────────────────────────────────

    #[test]
    fn test_supports_reasoning_true() {
        let reasoning_models: Vec<ModelInfo> = model_catalog()
            .into_iter()
            .filter(|model| model.supports_reasoning)
            .collect();
        assert!(!reasoning_models.is_empty());
        assert!(reasoning_models
            .iter()
            .all(|model| supports_reasoning(&model.id)));
    }

    #[test]
    fn test_supports_reasoning_false() {
        for model in model_catalog()
            .into_iter()
            .filter(|model| !model.supports_reasoning)
        {
            assert!(!supports_reasoning(&model.id));
        }
        assert!(!supports_reasoning("fixture-local-model:latest"));
    }

    #[test]
    fn test_supports_reasoning_unknown_false() {
        assert!(!supports_reasoning("nonexistent-model"));
    }

    // ── is_deprecated ──────────────────────────────────────────

    #[test]
    fn test_is_deprecated_false() {
        for model in model_catalog() {
            assert_eq!(is_deprecated(&model.id), model.status == "deprecated");
        }
    }

    #[test]
    fn test_is_deprecated_unknown_false() {
        assert!(!is_deprecated("nonexistent-model"));
    }

    // ── format_model_detail ────────────────────────────────────

    #[test]
    fn test_format_model_detail_paid_model() {
        let model = model_catalog()
            .into_iter()
            .find(|model| model.input_price_per_1m > 0.0 && model.output_price_per_1m > 0.0)
            .expect("catalog must contain a paid model");
        let detail = format_model_detail(&model);
        assert!(detail.contains(&model.id));
        assert!(detail.contains(&format!("({})", model.provider)));
        assert!(detail.contains(&format!("[{}]", model.status)));
        assert!(detail.contains(&format!(
            "${:.2} / ${:.2}",
            model.input_price_per_1m, model.output_price_per_1m
        )));
    }

    #[test]
    fn test_format_model_detail_free_model() {
        let model = ModelInfo {
            id: "fixture-local-model".to_string(),
            provider: "ollama".to_string(),
            context_window: 128_000,
            input_price_per_1m: 0.0,
            output_price_per_1m: 0.0,
            supports_tools: false,
            supports_vision: false,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 4_096,
            status: "active".to_string(),
            release_date: "local".to_string(),
        };
        let detail = format_model_detail(&model);
        assert!(detail.contains("fixture-local-model"));
        assert!(detail.contains("(ollama)"));
        assert!(detail.contains("[active]"));
        assert!(detail.contains("128K tokens"));
        assert!(detail.contains("free (local)"));
        assert!(detail.contains("Tool use:        no"));
        assert!(detail.contains("Vision:          no"));
        assert!(detail.contains("Reasoning:       no"));
    }

    #[test]
    fn test_format_model_detail_deepseek_capable_tier() {
        let model = models_for_provider("deepseek")
            .into_iter()
            .filter(|model| {
                model.supports_tools && model.supports_vision && model.supports_reasoning
            })
            .max_by(|left, right| left.input_price_per_1m.total_cmp(&right.input_price_per_1m))
            .expect("catalog must contain a fully capable DeepSeek tier");
        let detail = format_model_detail(&model);
        assert!(detail.contains("Tool use:        yes"));
        assert!(detail.contains("Vision:          yes"));
        assert!(detail.contains("Reasoning:       yes"));
        assert!(!detail.contains("free (local)"));
        assert!(detail.contains(&format!(
            "${:.2} / ${:.2} per 1M tokens",
            model.input_price_per_1m, model.output_price_per_1m
        )));
        assert!(model.input_price_per_1m > 0.0 && model.output_price_per_1m > 0.0);
    }

    // ── format_model_list ──────────────────────────────────────

    #[test]
    fn test_format_model_list_contains_providers() {
        let list = format_model_list();
        assert!(list.contains("ANTHROPIC:"));
        assert!(list.contains("OPENAI:"));
        assert!(list.contains("GOOGLE:"));
        assert!(!list.contains("OLLAMA:"));
    }

    #[test]
    fn test_format_model_list_contains_new_models() {
        let list = format_model_list();
        assert!(model_catalog().iter().all(|model| list.contains(&model.id)));
    }

    #[test]
    fn test_format_model_list_free_label() {
        let list = format_model_list();
        assert!(
            !list.contains("OLLAMA:"),
            "Ollama is discovered live; the static cloud catalog should not hardcode local models"
        );
    }

    #[test]
    fn test_format_model_list_shows_flags_legend() {
        let list = format_model_list();
        assert!(list.contains("T=tools"));
        assert!(list.contains("V=vision"));
        assert!(list.contains("R=reasoning"));
        assert!(list.contains("!=deprecated"));
        assert!(list.contains("B=beta"));
    }

    #[test]
    fn test_format_model_list_shows_output_tokens() {
        let list = format_model_list();
        // Should contain "out" column for max output tokens
        assert!(list.contains("out"));
    }

    #[test]
    fn tiered_catalog_prices_are_labeled_as_base_projections() {
        let tiered = model_catalog()
            .into_iter()
            .find(|model| !model_catalog::input_token_pricing_tiers(&model.id).is_empty())
            .expect("embedded catalog must include a request-tiered model");

        let detail = format_model_detail(&tiered);
        let list = format_model_list();

        assert!(detail.contains("base; request tiers available"));
        assert!(list
            .lines()
            .any(|line| { line.contains(&tiered.id) && line.contains("base+tiered") }));
    }

    // ── format_context_size ────────────────────────────────────

    #[test]
    fn test_format_context_size() {
        assert_eq!(format_context_size(128_000), "128K");
        assert_eq!(format_context_size(1_000_000), "1M");
        assert_eq!(format_context_size(2_000_000), "2M");
    }

    // ── MessageNormalizer ──────────────────────────────────────

    #[test]
    fn test_sanitize_anthropic_tool_id() {
        assert_eq!(
            MessageNormalizer::sanitize_anthropic_tool_id("tool-123_abc"),
            "tool-123_abc"
        );
        assert_eq!(
            MessageNormalizer::sanitize_anthropic_tool_id("tool@#$"),
            "tool___"
        );
    }

    #[test]
    fn test_mistral_tool_id() {
        assert_eq!(MessageNormalizer::mistral_tool_id(0), "call00000");
        assert_eq!(MessageNormalizer::mistral_tool_id(42), "call00042");
        assert_eq!(MessageNormalizer::mistral_tool_id(0).len(), 9);
    }

    #[test]
    fn test_sanitize_gemini_schema_recurses_all_positions() {
        // A schema with unsupported fields buried in items, anyOf, and nested
        // object properties, Gemini rejects `default` and `additionalProperties`
        // at every level, so the sanitizer must strip them everywhere.
        let schema = serde_json::json!({
            "type": "object",
            "default": {},
            "additionalProperties": false,
            "properties": {
                "tags": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "default": "x"
                    }
                },
                "choice": {
                    "anyOf": [
                        { "type": "string", "default": "a" },
                        { "type": "integer", "const": 7 }
                    ]
                },
                "nested": {
                    "type": "object",
                    "additionalProperties": true,
                    "properties": {
                        "inner": { "type": "string", "default": "y" }
                    }
                }
            }
        });

        let cleaned = MessageNormalizer::sanitize_gemini_schema(&schema);

        // Top-level rejected keys removed.
        assert!(cleaned.get("default").is_none());
        assert!(cleaned.get("additionalProperties").is_none());
        // items sub-schema sanitized.
        assert!(cleaned["properties"]["tags"]["items"]
            .get("default")
            .is_none());
        // anyOf union members sanitized.
        let any_of = cleaned["properties"]["choice"]["anyOf"].as_array().unwrap();
        assert!(any_of[0].get("default").is_none());
        assert!(any_of[1].get("const").is_none());
        // Nested object property sanitized at depth.
        assert!(cleaned["properties"]["nested"]
            .get("additionalProperties")
            .is_none());
        assert!(cleaned["properties"]["nested"]["properties"]["inner"]
            .get("default")
            .is_none());
        // Structural fields preserved.
        assert_eq!(cleaned["properties"]["tags"]["items"]["type"], "string");
        assert_eq!(
            cleaned["properties"]["choice"]["anyOf"][1]["type"],
            "integer"
        );
    }
}
