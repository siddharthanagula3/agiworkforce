//! LLM provider trait and per-provider implementations.
//!
//! Each provider normalizes messages, tool definitions, and streaming responses
//! into a common format. Provider-specific quirks are handled here.

// Model catalog API surface is intentionally broad: find_model, models_for_provider,
// supports_tool_use, etc. are used by --list-models and will be wired into model
// selection heuristics, deprecation warnings, and the /models REPL command.
#![allow(dead_code)]

use serde_json::Value;

/// Static model catalog entry.
#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub provider: &'static str,
    pub context_window: usize,
    pub input_price_per_1m: f64,  // USD per 1M input tokens
    pub output_price_per_1m: f64, // USD per 1M output tokens
    pub supports_tools: bool,
    pub supports_vision: bool,
    pub supports_reasoning: bool,     // extended thinking / reasoning
    pub supports_audio_input: bool,
    pub supports_audio_output: bool,
    pub supports_pdf: bool,
    pub max_output_tokens: usize,
    pub status: &'static str,         // "active", "beta", "deprecated"
    pub release_date: &'static str,   // "2025-03" etc.
}

/// Built-in model catalog with capabilities and pricing.
pub fn model_catalog() -> Vec<ModelInfo> {
    vec![
        // ── Anthropic ──────────────────────────────────────────────
        ModelInfo {
            id: "claude-opus-4-6".into(),
            provider: "anthropic",
            context_window: 200_000,
            input_price_per_1m: 15.0,
            output_price_per_1m: 75.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: true,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: true,
            max_output_tokens: 32_000,
            status: "active",
            release_date: "2025-05",
        },
        ModelInfo {
            id: "claude-sonnet-4-6".into(),
            provider: "anthropic",
            context_window: 200_000,
            input_price_per_1m: 3.0,
            output_price_per_1m: 15.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: true,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: true,
            max_output_tokens: 16_000,
            status: "active",
            release_date: "2025-05",
        },
        ModelInfo {
            id: "claude-haiku-4-5".into(),
            provider: "anthropic",
            context_window: 200_000,
            input_price_per_1m: 0.25,
            output_price_per_1m: 1.25,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: true,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2025-04",
        },
        // ── OpenAI ─────────────────────────────────────────────────
        ModelInfo {
            id: "gpt-5.4".into(),
            provider: "openai",
            context_window: 1_047_576,
            input_price_per_1m: 2.50,
            output_price_per_1m: 10.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: true,
            supports_audio_output: true,
            supports_pdf: false,
            max_output_tokens: 16_384,
            status: "active",
            release_date: "2026-01",
        },
        ModelInfo {
            id: "gpt-5.4-mini".into(),
            provider: "openai",
            context_window: 1_047_576,
            input_price_per_1m: 0.15,
            output_price_per_1m: 0.60,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 16_384,
            status: "active",
            release_date: "2026-01",
        },
        ModelInfo {
            id: "gpt-4.1".into(),
            provider: "openai",
            context_window: 1_047_576,
            input_price_per_1m: 2.0,
            output_price_per_1m: 8.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 32_768,
            status: "active",
            release_date: "2025-04",
        },
        ModelInfo {
            id: "o3-mini".into(),
            provider: "openai",
            context_window: 200_000,
            input_price_per_1m: 1.10,
            output_price_per_1m: 4.40,
            supports_tools: true,
            supports_vision: false,
            supports_reasoning: true,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 100_000,
            status: "active",
            release_date: "2025-01",
        },
        // ── Google ─────────────────────────────────────────────────
        ModelInfo {
            id: "gemini-3.1-pro-preview".into(),
            provider: "google",
            context_window: 1_048_576,
            input_price_per_1m: 1.25,
            output_price_per_1m: 10.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: true,
            supports_audio_input: true,
            supports_audio_output: false,
            supports_pdf: true,
            max_output_tokens: 65_536,
            status: "active",
            release_date: "2026-02",
        },
        ModelInfo {
            id: "gemini-3-flash-preview".into(),
            provider: "google",
            context_window: 1_048_576,
            input_price_per_1m: 0.10,
            output_price_per_1m: 0.40,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: true,
            supports_audio_output: true,
            supports_pdf: true,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2026-01",
        },
        // ── Mistral ────────────────────────────────────────────────
        ModelInfo {
            id: "mistral-large-2512".into(),
            provider: "mistral",
            context_window: 256_000,
            input_price_per_1m: 2.0,
            output_price_per_1m: 6.0,
            supports_tools: true,
            supports_vision: false,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2025-12",
        },
        ModelInfo {
            id: "codestral-latest".into(),
            provider: "mistral",
            context_window: 32_000,
            input_price_per_1m: 0.3,
            output_price_per_1m: 0.9,
            supports_tools: true,
            supports_vision: false,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2024-05",
        },
        // ── xAI ────────────────────────────────────────────────────
        ModelInfo {
            id: "grok-4.1".into(),
            provider: "xai",
            context_window: 2_000_000,
            input_price_per_1m: 2.0,
            output_price_per_1m: 10.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2026-02",
        },
        ModelInfo {
            id: "grok-4-1-fast-non-reasoning".into(),
            provider: "xai",
            context_window: 2_000_000,
            input_price_per_1m: 0.60,
            output_price_per_1m: 4.0,
            supports_tools: true,
            supports_vision: true,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2026-02",
        },
        // ── DeepSeek ───────────────────────────────────────────────
        ModelInfo {
            id: "deepseek-chat".into(),
            provider: "deepseek",
            context_window: 64_000,
            input_price_per_1m: 0.14,
            output_price_per_1m: 0.28,
            supports_tools: true,
            supports_vision: false,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2025-01",
        },
        ModelInfo {
            id: "deepseek-reasoner".into(),
            provider: "deepseek",
            context_window: 64_000,
            input_price_per_1m: 0.55,
            output_price_per_1m: 2.19,
            supports_tools: false,
            supports_vision: false,
            supports_reasoning: true,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 8_192,
            status: "active",
            release_date: "2025-01",
        },
        // ── Ollama (local, free) ───────────────────────────────────
        ModelInfo {
            id: "llama3.1".into(),
            provider: "ollama",
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
            status: "active",
            release_date: "2024-07",
        },
        ModelInfo {
            id: "qwen2.5".into(),
            provider: "ollama",
            context_window: 32_000,
            input_price_per_1m: 0.0,
            output_price_per_1m: 0.0,
            supports_tools: false,
            supports_vision: false,
            supports_reasoning: false,
            supports_audio_input: false,
            supports_audio_output: false,
            supports_pdf: false,
            max_output_tokens: 4_096,
            status: "active",
            release_date: "2024-09",
        },
    ]
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

/// Auto-detect the provider name from a model ID string.
///
/// Uses prefix heuristics: "claude" -> anthropic, "gpt"/"o3"/"o1" -> openai,
/// "gemini" -> google, "mistral"/"codestral" -> mistral, "grok" -> xai,
/// "deepseek" -> deepseek. Falls back to the catalog for exact matches.
/// Returns `None` for unrecognized models.
pub fn provider_for_model(model_id: &str) -> Option<&'static str> {
    let lower = model_id.to_lowercase();

    // Prefix-based detection (fast path, no catalog scan)
    let prefix_match = if lower.starts_with("claude") {
        Some("anthropic")
    } else if lower.starts_with("gpt") || lower.starts_with("o3") || lower.starts_with("o1") {
        Some("openai")
    } else if lower.starts_with("gemini") {
        Some("google")
    } else if lower.starts_with("mistral") || lower.starts_with("codestral") {
        Some("mistral")
    } else if lower.starts_with("grok") {
        Some("xai")
    } else if lower.starts_with("deepseek") {
        Some("deepseek")
    } else if lower.starts_with("llama") || lower.starts_with("qwen") {
        Some("ollama")
    } else {
        None
    };

    if prefix_match.is_some() {
        return prefix_match;
    }

    // Fall back to catalog lookup for non-standard names
    find_model(model_id).map(|m| m.provider)
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
/// claude-opus-4-6  (anthropic)  [active]
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

    let mut current_provider = "";
    for model in &catalog {
        if model.provider != current_provider {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&format!("{}:\n", model.provider.to_uppercase()));
            current_provider = model.provider;
        }

        let status_icon = match model.status {
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
        assert!(ids.contains(&"claude-opus-4-6"));
        assert!(ids.contains(&"gpt-4.1"));
        assert!(ids.contains(&"gpt-5.4"));
        assert!(ids.contains(&"gpt-5.4-mini"));
        assert!(ids.contains(&"gemini-3.1-pro-preview"));
        assert!(ids.contains(&"gemini-3-flash-preview"));
        assert!(ids.contains(&"grok-4.1"));
        assert!(ids.contains(&"grok-4-1-fast-non-reasoning"));
        assert!(ids.contains(&"mistral-large-2512"));
        assert!(ids.contains(&"llama3.1"));
        assert!(ids.contains(&"qwen2.5"));
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
        assert_eq!(ids.len(), original_len, "Catalog contains duplicate model IDs");
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
                ["active", "beta", "deprecated"].contains(&model.status),
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
        assert!(reasoning_ids.contains(&"claude-opus-4-6"));
        assert!(reasoning_ids.contains(&"claude-sonnet-4-6"));
        assert!(reasoning_ids.contains(&"o3-mini"));
        assert!(reasoning_ids.contains(&"gemini-3.1-pro-preview"));
        assert!(reasoning_ids.contains(&"deepseek-reasoner"));
    }

    #[test]
    fn test_non_reasoning_models_not_flagged() {
        let model = find_model("gpt-5.4").unwrap();
        assert!(!model.supports_reasoning);
        let model = find_model("llama3.1").unwrap();
        assert!(!model.supports_reasoning);
    }

    #[test]
    fn test_audio_capabilities() {
        let gpt54 = find_model("gpt-5.4").unwrap();
        assert!(gpt54.supports_audio_input);
        assert!(gpt54.supports_audio_output);

        let gemini_flash = find_model("gemini-3-flash-preview").unwrap();
        assert!(gemini_flash.supports_audio_input);
        assert!(gemini_flash.supports_audio_output);

        // Claude does not support audio
        let claude = find_model("claude-opus-4-6").unwrap();
        assert!(!claude.supports_audio_input);
        assert!(!claude.supports_audio_output);
    }

    #[test]
    fn test_pdf_support() {
        let claude = find_model("claude-opus-4-6").unwrap();
        assert!(claude.supports_pdf);

        let gemini = find_model("gemini-3.1-pro-preview").unwrap();
        assert!(gemini.supports_pdf);

        // OpenAI GPT-5.4 does not support native PDF
        let gpt54 = find_model("gpt-5.4").unwrap();
        assert!(!gpt54.supports_pdf);
    }

    // ── find_model ─────────────────────────────────────────────

    #[test]
    fn test_find_model_exact() {
        let model = find_model("gpt-5.4");
        assert!(model.is_some());
        assert_eq!(model.unwrap().provider, "openai");
    }

    #[test]
    fn test_find_model_case_insensitive() {
        let model = find_model("Claude-Opus-4-6");
        assert!(model.is_some());
    }

    #[test]
    fn test_find_model_not_found() {
        assert!(find_model("nonexistent-model-xyz").is_none());
    }

    #[test]
    fn test_find_model_new_entries() {
        assert!(find_model("claude-opus-4-6").is_some());
        assert!(find_model("gpt-4.1").is_some());
        assert!(find_model("gpt-5.4").is_some());
        assert!(find_model("gpt-5.4-mini").is_some());
        assert!(find_model("gemini-3.1-pro-preview").is_some());
        assert!(find_model("gemini-3-flash-preview").is_some());
        assert!(find_model("grok-4.1").is_some());
        assert!(find_model("mistral-large-2512").is_some());
        assert!(find_model("llama3.1").is_some());
        assert!(find_model("qwen2.5").is_some());
    }

    // ── models_for_provider ────────────────────────────────────

    #[test]
    fn test_models_for_provider() {
        let anthropic = models_for_provider("anthropic");
        assert!(anthropic.len() >= 3);
        assert!(anthropic.iter().all(|m| m.provider == "anthropic"));
    }

    #[test]
    fn test_models_for_provider_ollama() {
        let ollama = models_for_provider("ollama");
        assert_eq!(ollama.len(), 2);
        let ids: Vec<&str> = ollama.iter().map(|m| m.id.as_str()).collect();
        assert!(ids.contains(&"llama3.1"));
        assert!(ids.contains(&"qwen2.5"));
    }

    #[test]
    fn test_models_for_provider_unknown() {
        assert!(models_for_provider("nonexistent_provider").is_empty());
    }

    // ── provider_for_model ─────────────────────────────────────

    #[test]
    fn test_provider_for_model_prefix_anthropic() {
        assert_eq!(provider_for_model("claude-opus-4-6"), Some("anthropic"));
        assert_eq!(
            provider_for_model("claude-sonnet-4-6"),
            Some("anthropic")
        );
        assert_eq!(provider_for_model("claude-anything"), Some("anthropic"));
    }

    #[test]
    fn test_provider_for_model_prefix_openai() {
        assert_eq!(provider_for_model("gpt-5.4"), Some("openai"));
        assert_eq!(provider_for_model("gpt-5.4-mini"), Some("openai"));
        assert_eq!(provider_for_model("gpt-4.1"), Some("openai"));
        assert_eq!(provider_for_model("o3-mini"), Some("openai"));
        assert_eq!(provider_for_model("o1-preview"), Some("openai"));
    }

    #[test]
    fn test_provider_for_model_prefix_google() {
        assert_eq!(provider_for_model("gemini-3.1-pro-preview"), Some("google"));
        assert_eq!(provider_for_model("gemini-3-flash-preview"), Some("google"));
        // Unrecognized Gemini IDs still resolve via prefix
        assert_eq!(provider_for_model("gemini-future"), Some("google"));
    }

    #[test]
    fn test_provider_for_model_prefix_mistral() {
        assert_eq!(
            provider_for_model("mistral-large-2512"),
            Some("mistral")
        );
        // Legacy name still resolves via prefix
        assert_eq!(
            provider_for_model("mistral-large-latest"),
            Some("mistral")
        );
        assert_eq!(provider_for_model("codestral-latest"), Some("mistral"));
    }

    #[test]
    fn test_provider_for_model_prefix_xai() {
        assert_eq!(provider_for_model("grok-4.1"), Some("xai"));
        assert_eq!(provider_for_model("grok-4-1-fast-non-reasoning"), Some("xai"));
        // Unrecognized Grok IDs still resolve via prefix
        assert_eq!(provider_for_model("grok-future"), Some("xai"));
    }

    #[test]
    fn test_provider_for_model_prefix_deepseek() {
        assert_eq!(provider_for_model("deepseek-chat"), Some("deepseek"));
        assert_eq!(provider_for_model("deepseek-reasoner"), Some("deepseek"));
    }

    #[test]
    fn test_provider_for_model_prefix_ollama() {
        assert_eq!(provider_for_model("llama3.1"), Some("ollama"));
        assert_eq!(provider_for_model("qwen2.5"), Some("ollama"));
    }

    #[test]
    fn test_provider_for_model_case_insensitive() {
        assert_eq!(provider_for_model("CLAUDE-OPUS-4-6"), Some("anthropic"));
        assert_eq!(provider_for_model("GPT-5.4"), Some("openai"));
        assert_eq!(provider_for_model("Gemini-3-flash-preview"), Some("google"));
    }

    #[test]
    fn test_provider_for_model_unknown() {
        assert_eq!(provider_for_model("totally-unknown-model"), None);
    }

    // ── supports_tool_use ──────────────────────────────────────

    #[test]
    fn test_supports_tool_use_true() {
        assert!(supports_tool_use("claude-opus-4-6"));
        assert!(supports_tool_use("gpt-5.4"));
        assert!(supports_tool_use("gemini-3.1-pro-preview"));
        assert!(supports_tool_use("grok-4.1"));
        assert!(supports_tool_use("gpt-4.1"));
    }

    #[test]
    fn test_supports_tool_use_false() {
        assert!(!supports_tool_use("deepseek-reasoner"));
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
        assert_eq!(default_temperature("o3-mini"), Some(0.0));
        assert_eq!(default_temperature("o1-preview"), Some(0.0));
    }

    #[test]
    fn test_default_temperature_gemini() {
        assert_eq!(default_temperature("gemini-3.1-pro-preview"), Some(1.0));
        assert_eq!(default_temperature("gemini-3-flash-preview"), Some(1.0));
    }

    #[test]
    fn test_default_temperature_claude_none() {
        assert_eq!(default_temperature("claude-opus-4-6"), None);
        assert_eq!(default_temperature("claude-sonnet-4-6"), None);
    }

    #[test]
    fn test_default_temperature_openai_non_reasoning_none() {
        assert_eq!(default_temperature("gpt-5.4"), None);
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
        assert!(supports_reasoning("claude-opus-4-6"));
        assert!(supports_reasoning("claude-sonnet-4-6"));
        assert!(supports_reasoning("o3-mini"));
        assert!(supports_reasoning("gemini-3.1-pro-preview"));
        assert!(supports_reasoning("deepseek-reasoner"));
    }

    #[test]
    fn test_supports_reasoning_false() {
        assert!(!supports_reasoning("gpt-5.4"));
        assert!(!supports_reasoning("gpt-5.4-mini"));
        assert!(!supports_reasoning("llama3.1"));
        assert!(!supports_reasoning("mistral-large-2512"));
    }

    #[test]
    fn test_supports_reasoning_unknown_false() {
        assert!(!supports_reasoning("nonexistent-model"));
    }

    // ── is_deprecated ──────────────────────────────────────────

    #[test]
    fn test_is_deprecated_false() {
        assert!(!is_deprecated("claude-opus-4-6"));
        assert!(!is_deprecated("gpt-5.4"));
        assert!(!is_deprecated("gemini-3.1-pro-preview"));
        assert!(!is_deprecated("grok-4.1"));
        assert!(!is_deprecated("mistral-large-2512"));
    }

    #[test]
    fn test_is_deprecated_unknown_false() {
        assert!(!is_deprecated("nonexistent-model"));
    }

    // ── format_model_detail ────────────────────────────────────

    #[test]
    fn test_format_model_detail_paid_model() {
        let model = find_model("claude-opus-4-6").unwrap();
        let detail = format_model_detail(&model);
        assert!(detail.contains("claude-opus-4-6"));
        assert!(detail.contains("(anthropic)"));
        assert!(detail.contains("[active]"));
        assert!(detail.contains("200K tokens"));
        assert!(detail.contains("32K tokens"));
        assert!(detail.contains("$15.00 / $75.00"));
        assert!(detail.contains("Tool use:        yes"));
        assert!(detail.contains("Vision:          yes"));
        assert!(detail.contains("Reasoning:       yes"));
        assert!(detail.contains("PDF:             yes"));
    }

    #[test]
    fn test_format_model_detail_free_model() {
        let model = find_model("llama3.1").unwrap();
        let detail = format_model_detail(&model);
        assert!(detail.contains("llama3.1"));
        assert!(detail.contains("(ollama)"));
        assert!(detail.contains("[active]"));
        assert!(detail.contains("128K tokens"));
        assert!(detail.contains("free (local)"));
        assert!(detail.contains("Tool use:        no"));
        assert!(detail.contains("Vision:          no"));
        assert!(detail.contains("Reasoning:       no"));
    }

    #[test]
    fn test_format_model_detail_no_tools_with_vision() {
        // deepseek-reasoner: no tools, no vision
        let model = find_model("deepseek-reasoner").unwrap();
        let detail = format_model_detail(&model);
        assert!(detail.contains("Tool use:        no"));
        assert!(detail.contains("Vision:          no"));
        assert!(detail.contains("Reasoning:       yes"));
        // should NOT say "free (local)"
        assert!(!detail.contains("free (local)"));
        assert!(detail.contains("$0.55 / $2.19"));
    }

    // ── format_model_list ──────────────────────────────────────

    #[test]
    fn test_format_model_list_contains_providers() {
        let list = format_model_list();
        assert!(list.contains("ANTHROPIC:"));
        assert!(list.contains("OPENAI:"));
        assert!(list.contains("GOOGLE:"));
        assert!(list.contains("OLLAMA:"));
    }

    #[test]
    fn test_format_model_list_contains_new_models() {
        let list = format_model_list();
        assert!(list.contains("claude-opus-4-6"));
        assert!(list.contains("gpt-5.4"));
        assert!(list.contains("gpt-5.4-mini"));
        assert!(list.contains("gpt-4.1"));
        assert!(list.contains("gemini-3.1-pro-preview"));
        assert!(list.contains("gemini-3-flash-preview"));
        assert!(list.contains("grok-4.1"));
        assert!(list.contains("mistral-large-2512"));
        assert!(list.contains("llama3.1"));
        assert!(list.contains("qwen2.5"));
    }

    #[test]
    fn test_format_model_list_free_label() {
        let list = format_model_list();
        // Ollama models should show "free"
        assert!(list.contains("free"));
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
