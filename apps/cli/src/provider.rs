//! LLM provider trait and per-provider implementations.
//!
//! Each provider normalizes messages, tool definitions, and streaming responses
//! into a common format. Provider-specific quirks are handled here.

// Provider catalog mixes live helpers (find_model, format_model_list, ModelInfo
// — used by output.rs, repl.rs, --list-models) with reserved-for-deprecation-
// warnings/heuristics helpers (models_for_provider, supports_tool_use, …).
// File-level allow stays until those secondary surfaces are wired.
#![allow(dead_code)]

use crate::model_catalog;
use serde_json::Value;

/// Static model catalog entry.
#[derive(Debug, Clone)]
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

/// Look up a model by ID (case-insensitive, exact match preferred, then prefix match).
pub fn find_model(model_id: &str) -> Option<ModelInfo> {
    let lower = model_id.to_lowercase();
    let catalog = model_catalog();

    // Prefer exact match first
    if let Some(exact) = catalog.iter().find(|m| m.id.to_lowercase() == lower) {
        return Some(exact.clone());
    }

    // Fall back to prefix match
    catalog.into_iter().find(|m| {
        lower.starts_with(&m.id.to_lowercase()) || m.id.to_lowercase().starts_with(&lower)
    })
}

/// List all models for a given provider.
pub fn models_for_provider(provider: &str) -> Vec<ModelInfo> {
    model_catalog()
        .into_iter()
        .filter(|m| m.provider == provider)
        .collect()
}

fn looks_like_local_ollama_model(model_id: &str) -> bool {
    let lower = model_id.to_lowercase();
    lower.starts_with("ollama:")
        || (lower.contains(':') && !lower.contains('/'))
        || lower.starts_with("llama")
        || lower.starts_with("codellama")
        || lower.starts_with("qwen2")
        || lower.starts_with("qwen3")
        || lower.starts_with("gemma")
        || lower.starts_with("phi")
        || lower.starts_with("deepseek-r1")
        || lower.starts_with("nomic-embed")
        || lower.contains("command-r")
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
/// Returns `false` for unknown models (safe default — avoids sending tool
/// schemas to models that would reject or ignore them).
pub fn supports_tool_use(model_id: &str) -> bool {
    find_model(model_id).is_some_and(|m| m.supports_tools)
}

/// Get default temperature for a model (some models have specific defaults).
///
/// Returns `None` when the provider default should be used (e.g., Anthropic
/// defaults to 1.0 server-side). Returns `Some(value)` when a model-specific
/// temperature is recommended.
pub fn default_temperature(model_id: &str) -> Option<f64> {
    let lower = model_id.to_lowercase();

    // Reasoning models prefer deterministic output
    if lower.contains("deepseek-reasoner") || lower.contains("o3") || lower.contains("o1") {
        return Some(0.0);
    }

    // Gemini models default to 1.0
    if lower.starts_with("gemini") {
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
pub fn supports_reasoning(model_id: &str) -> bool {
    find_model(model_id).is_some_and(|m| m.supports_reasoning)
}

/// Check if a model is deprecated.
///
/// Returns `false` for unknown models.
pub fn is_deprecated(model_id: &str) -> bool {
    find_model(model_id).is_some_and(|m| m.status == "deprecated")
}

/// Format a verbose detail string for a single model.
///
/// Example output:
/// ```text
/// claude-opus-4-8  (anthropic)  [active]
///   Context window:  200K tokens
///   Max output:      32K tokens
///   Pricing:         $15.00 / $75.00 per 1M tokens (input/output)
///   Tool use:        yes
///   Vision:          yes
///   Reasoning:       yes
///   Audio in/out:    no / no
///   PDF:             yes
/// ```
pub fn format_model_detail(model: &ModelInfo) -> String {
    let ctx = format_context_size(model.context_window);
    let max_out = format_context_size(model.max_output_tokens);
    let price = if model.input_price_per_1m == 0.0 && model.output_price_per_1m == 0.0 {
        "free (local)".to_string()
    } else {
        format!(
            "${:.2} / ${:.2} per 1M tokens (input/output)",
            model.input_price_per_1m, model.output_price_per_1m
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
            format!(
                "${:.2}/${:.2}",
                model.input_price_per_1m, model.output_price_per_1m
            )
        };

        out.push_str(&format!(
            "  {}{:<30} [{}{}{}] {:>6} ctx {:>5} out  {}\n",
            status_icon, model.id, tools_icon, vision_icon, reasoning_icon, ctx, max_out, price
        ));
    }

    out.push_str(
        "\nFlags: T=tools, V=vision, R=reasoning. !=deprecated, B=beta.\n\
         Prices per 1M tokens (input/output).\n",
    );
    out
}

/// Format static catalog models plus live local models discovered at runtime.
pub async fn format_model_list_with_local(config: &crate::config::CliConfig) -> String {
    let mut out = format_model_list();
    let probes = crate::local_models::discover_all(config).await;
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
pub struct MessageNormalizer;

impl MessageNormalizer {
    /// Sanitize a tool ID for Anthropic (only alphanumeric, underscore, hyphen allowed).
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
    pub fn mistral_tool_id(index: usize) -> String {
        format!("call{:05}", index)
    }

    /// Sanitize a JSON Schema for Gemini (remove unsupported fields).
    pub fn sanitize_gemini_schema(schema: &Value) -> Value {
        // Gemini doesn't support some JSON Schema features
        let mut cleaned = schema.clone();
        if let Some(obj) = cleaned.as_object_mut() {
            // Remove 'default' values (Gemini rejects them)
            obj.remove("default");
            // Recursively clean properties
            if let Some(props) = obj.get_mut("properties") {
                if let Some(props_obj) = props.as_object_mut() {
                    for (_key, val) in props_obj.iter_mut() {
                        *val = Self::sanitize_gemini_schema(val);
                    }
                }
            }
        }
        cleaned
    }

    /// Filter empty messages (some providers reject them).
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

    // ── model_catalog ──────────────────────────────────────────

    #[test]
    fn test_model_catalog_not_empty() {
        assert!(!model_catalog().is_empty());
    }

    #[test]
    fn test_catalog_has_new_models() {
        let catalog = model_catalog();
        let ids: Vec<&str> = catalog.iter().map(|m| m.id.as_str()).collect();
        // claude-opus-4.8 apiModelId = "claude-opus-4-8" per models.json
        assert!(ids.contains(&"claude-opus-4-8"));
        assert!(ids.contains(&"claude-sonnet-4-6"));
        // OpenAI flagship + mini entries are both sourced from models.json.
        assert!(ids.contains(&"gpt-5.5"));
        assert!(ids.contains(&"gpt-5.4-mini"));
        assert!(ids.contains(&"gemini-3.5-flash"));
        assert!(ids.contains(&"gemini-3.1-pro-preview"));
        assert!(ids.contains(&"gemini-3.1-flash-lite"));
        // xAI flagship is sourced from models.json.
        assert!(ids.contains(&"grok-4.3"));
        assert!(ids.contains(&"mistral-large-2512"));
        assert!(ids.contains(&"mistral-medium-2508"));
        assert!(ids.contains(&"deepseek-v4-flash"));
        assert!(ids.contains(&"deepseek-v4-pro"));
        assert!(ids.contains(&"glm-5.1"));
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

    #[test]
    fn test_all_models_have_release_date() {
        for model in model_catalog() {
            assert!(
                !model.release_date.is_empty(),
                "Model {} has empty release_date",
                model.id
            );
            // Verify YYYY-MM format
            let parts: Vec<&str> = model.release_date.split('-').collect();
            assert_eq!(
                parts.len(),
                2,
                "Model {} release_date should be YYYY-MM, got: {}",
                model.id,
                model.release_date
            );
        }
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
        let reasoning_ids: Vec<&str> = catalog
            .iter()
            .filter(|m| m.supports_reasoning)
            .map(|m| m.id.as_str())
            .collect();
        // claude-opus-4.8 apiModelId = "claude-opus-4-8" per models.json (thinking=true)
        assert!(reasoning_ids.contains(&"claude-opus-4-8"));
        assert!(reasoning_ids.contains(&"claude-sonnet-4-6"));
        // OpenAI flagship + mini entries are both sourced from models.json.
        assert!(reasoning_ids.contains(&"gpt-5.5"));
        assert!(reasoning_ids.contains(&"gpt-5.4-mini"));
        assert!(reasoning_ids.contains(&"gemini-3.1-pro-preview"));
        // xAI flagship has reasoning enabled.
        assert!(reasoning_ids.contains(&"grok-4.3"));
        assert!(reasoning_ids.contains(&"deepseek-v4-pro"));
    }

    #[test]
    fn test_non_reasoning_models_not_flagged() {
        let model = find_model("claude-haiku-4-5-20251001").unwrap();
        assert!(!model.supports_reasoning);
        let model = find_model("gemini-3.1-flash-lite").unwrap();
        assert!(!model.supports_reasoning);
    }

    #[test]
    fn test_audio_capabilities() {
        // gpt-5.5 is the current OpenAI flagship in models.json
        let gpt55 = find_model("gpt-5.5").unwrap();
        assert!(!gpt55.supports_audio_input);
        assert!(!gpt55.supports_audio_output);

        let gemini_flash = find_model("gemini-3.1-flash-lite").unwrap();
        assert!(!gemini_flash.supports_audio_input);
        assert!(!gemini_flash.supports_audio_output);

        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json
        let claude = find_model("claude-opus-4-8").unwrap();
        assert!(!claude.supports_audio_input);
        assert!(!claude.supports_audio_output);
    }

    #[test]
    fn test_pdf_support() {
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json
        let claude = find_model("claude-opus-4-8").unwrap();
        assert!(!claude.supports_pdf);

        let gemini = find_model("gemini-3.1-pro-preview").unwrap();
        assert!(!gemini.supports_pdf);

        // gpt-5.5 is the current OpenAI flagship in models.json
        let gpt55 = find_model("gpt-5.5").unwrap();
        assert!(!gpt55.supports_pdf);
    }

    // ── find_model ─────────────────────────────────────────────

    #[test]
    fn test_find_model_exact() {
        let model = find_model("gpt-5.5");
        assert!(model.is_some());
        assert_eq!(model.unwrap().provider, "openai");
    }

    #[test]
    fn test_find_model_case_insensitive() {
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json
        let model = find_model("Claude-Opus-4-8");
        assert!(model.is_some());
    }

    #[test]
    fn test_find_model_not_found() {
        assert!(find_model("nonexistent-model-xyz").is_none());
    }

    #[test]
    fn test_find_model_new_entries() {
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json
        assert!(find_model("claude-opus-4-8").is_some());
        assert!(find_model("claude-sonnet-4-6").is_some());
        // OpenAI flagship + mini entries are both sourced from models.json.
        assert!(find_model("gpt-5.5").is_some());
        assert!(find_model("gpt-5.4-mini").is_some());
        assert!(find_model("gemini-3.5-flash").is_some());
        assert!(find_model("gemini-3.1-pro-preview").is_some());
        assert!(find_model("gemini-3.1-flash-lite").is_some());
        // xAI flagship is sourced from models.json.
        assert!(find_model("grok-4.3").is_some());
        assert!(find_model("mistral-large-2512").is_some());
        assert!(find_model("glm-5.1").is_some());
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
        assert_eq!(provider_for_model("claude-anything"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_openai() {
        let model = first_model_id_for("openai");
        assert_eq!(provider_for_model(&model), Some("openai"));
        assert_eq!(provider_for_model("gpt-future"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_google() {
        let model = first_model_id_for("google");
        assert_eq!(provider_for_model(&model), Some("google"));
        assert_eq!(provider_for_model("gemini-future"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_mistral() {
        let model = first_model_id_for("mistral");
        assert_eq!(provider_for_model(&model), Some("mistral"));
        assert_eq!(provider_for_model("mistral-future"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_xai() {
        let model = first_model_id_for("xai");
        assert_eq!(provider_for_model(&model), Some("xai"));
        assert_eq!(provider_for_model("grok-future"), None);
    }

    #[test]
    fn test_provider_for_model_catalog_deepseek() {
        let model = first_model_id_for("deepseek");
        assert_eq!(provider_for_model(&model), Some("deepseek"));
        assert_eq!(provider_for_model("deepseek-future"), None);
    }

    #[test]
    fn test_provider_for_model_local_ollama_names() {
        assert_eq!(provider_for_model("llama3.1"), Some("ollama"));
        assert_eq!(provider_for_model("qwen2.5"), Some("ollama"));
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
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json (tools=true)
        assert!(supports_tool_use("claude-opus-4-8"));
        // gpt-5.5 is the current OpenAI flagship (tools=true)
        assert!(supports_tool_use("gpt-5.5"));
        assert!(supports_tool_use("gemini-3.1-pro-preview"));
        // grok-4.3 deprecated; use grok-4.3 (live xAI flagship).
        assert!(supports_tool_use("grok-4.3"));
        assert!(supports_tool_use("deepseek-v4-pro"));
    }

    #[test]
    fn test_supports_tool_use_false() {
        assert!(!supports_tool_use("llama3.1"));
        assert!(!supports_tool_use("qwen2.5"));
    }

    #[test]
    fn test_supports_tool_use_unknown_returns_false() {
        assert!(!supports_tool_use("nonexistent-model"));
    }

    // ── default_temperature ────────────────────────────────────

    #[test]
    fn test_default_temperature_reasoning_models() {
        assert_eq!(default_temperature("deepseek-reasoner"), Some(0.0));
        assert_eq!(default_temperature("o3"), Some(0.0));
        assert_eq!(default_temperature("o1-preview"), Some(0.0));
    }

    #[test]
    fn test_default_temperature_gemini() {
        assert_eq!(default_temperature("gemini-3.1-pro-preview"), Some(1.0));
        assert_eq!(default_temperature("gemini-3.1-flash-lite"), Some(1.0));
    }

    #[test]
    fn test_default_temperature_claude_none() {
        assert_eq!(default_temperature("claude-opus-4-8"), None);
        assert_eq!(default_temperature("claude-sonnet-4-6"), None);
    }

    #[test]
    fn test_default_temperature_openai_non_reasoning_none() {
        assert_eq!(default_temperature("gpt-5.5"), None);
        assert_eq!(default_temperature("gpt-5.4-mini"), None);
    }

    #[test]
    fn test_default_temperature_ollama_none() {
        assert_eq!(default_temperature("llama3.1"), None);
        assert_eq!(default_temperature("qwen2.5"), None);
    }

    #[test]
    fn test_default_temperature_unknown_none() {
        assert_eq!(default_temperature("nonexistent-model"), None);
    }

    // ── supports_reasoning ─────────────────────────────────────

    #[test]
    fn test_supports_reasoning_true() {
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json (thinking=true)
        assert!(supports_reasoning("claude-opus-4-8"));
        assert!(supports_reasoning("claude-sonnet-4-6"));
        // OpenAI flagship + mini entries are both sourced from models.json.
        assert!(supports_reasoning("gpt-5.5"));
        assert!(supports_reasoning("gpt-5.4-mini"));
        assert!(supports_reasoning("gemini-3.1-pro-preview"));
        assert!(supports_reasoning("deepseek-v4-pro"));
    }

    #[test]
    fn test_supports_reasoning_false() {
        assert!(!supports_reasoning("llama3.1"));
        assert!(!supports_reasoning("gemini-3.1-flash-lite"));
    }

    #[test]
    fn test_supports_reasoning_unknown_false() {
        assert!(!supports_reasoning("nonexistent-model"));
    }

    // ── is_deprecated ──────────────────────────────────────────

    #[test]
    fn test_is_deprecated_false() {
        assert!(!is_deprecated("claude-opus-4-8"));
        assert!(!is_deprecated("gpt-5.5"));
        assert!(!is_deprecated("gemini-3.1-pro-preview"));
        assert!(!is_deprecated("grok-4.3"));
        assert!(!is_deprecated("mistral-large-2512"));
    }

    #[test]
    fn test_is_deprecated_unknown_false() {
        assert!(!is_deprecated("nonexistent-model"));
    }

    // ── format_model_detail ────────────────────────────────────

    #[test]
    fn test_format_model_detail_paid_model() {
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json
        // context: 1,000,000 (1M), input $5.00/output $25.00
        let model = find_model("claude-opus-4-8").unwrap();
        let detail = format_model_detail(&model);
        assert!(detail.contains("claude-opus-4-8"));
        assert!(detail.contains("(anthropic)"));
        assert!(detail.contains("[active]"));
        assert!(detail.contains("1M tokens"));
        assert!(detail.contains("$5.00 / $25.00"));
        assert!(detail.contains("Tool use:        yes"));
        assert!(detail.contains("Vision:          yes"));
        assert!(detail.contains("Reasoning:       yes"));
        assert!(detail.contains("PDF:             no"));
    }

    #[test]
    fn test_format_model_detail_free_model() {
        let model = ModelInfo {
            id: "local-ollama-model".to_string(),
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
        assert!(detail.contains("local-ollama-model"));
        assert!(detail.contains("(ollama)"));
        assert!(detail.contains("[active]"));
        assert!(detail.contains("128K tokens"));
        assert!(detail.contains("free (local)"));
        assert!(detail.contains("Tool use:        no"));
        assert!(detail.contains("Vision:          no"));
        assert!(detail.contains("Reasoning:       no"));
    }

    #[test]
    fn test_format_model_detail_deepseek_v4_pro() {
        // deepseek-v4-pro in models.json: tools=yes, vision=yes, reasoning=yes,
        // pricing $0.435/$0.87 per 1M tokens (permanent discount since 2026-05-22).
        let model = find_model("deepseek-v4-pro").unwrap();
        let detail = format_model_detail(&model);
        assert!(detail.contains("Tool use:        yes"));
        assert!(detail.contains("Vision:          yes"));
        assert!(detail.contains("Reasoning:       yes"));
        assert!(!detail.contains("free (local)"));
        assert!(detail.contains("$0.43 / $0.87"));
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
        // claude-opus-4-8 is the apiModelId for claude-opus-4.8 per models.json
        assert!(list.contains("claude-opus-4-8"));
        // OpenAI flagship + mini entries are both sourced from models.json.
        assert!(list.contains("gpt-5.5"));
        assert!(list.contains("gpt-5.4-mini"));
        assert!(list.contains("gemini-3.5-flash"));
        assert!(list.contains("gemini-3.1-pro-preview"));
        assert!(list.contains("gemini-3.1-flash-lite"));
        // xAI flagship is sourced from models.json.
        assert!(list.contains("grok-4.3"));
        assert!(list.contains("mistral-large-2512"));
        assert!(list.contains("glm-5.1"));
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
}
