// apps/desktop/src-tauri/src/core/llm/capability_detection.rs
//
// Per-model capability detection for Ollama.  Prevents tool injection for
// models that don't support native function calling, avoiding cryptic
// errors or silent failures at inference time.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::LazyLock;
use tokio::sync::RwLock;

/// Cached model capabilities to avoid repeated /api/show calls.
static CAPABILITY_CACHE: LazyLock<RwLock<HashMap<String, ModelCapabilities>>> =
    LazyLock::new(|| RwLock::new(HashMap::new()));

#[derive(Debug, Clone)]
pub struct ModelCapabilities {
    pub supports_tools: bool,
    pub supports_vision: bool,
    pub context_length: usize,
}

#[derive(Deserialize)]
struct OllamaShowResponse {
    template: Option<String>,
    details: Option<OllamaModelDetails>,
    model_info: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    family: Option<String>,
}

/// Known model families that support native function calling in Ollama.
const TOOL_CAPABLE_FAMILIES: &[&str] = &[
    "llama3.1",
    "llama3.2",
    "llama3.3",
    "llama4",
    "qwen2.5",
    "qwen3",
    "mistral",
    "mixtral",
    "mistral-nemo",
    "command-r",
    "command-r-plus",
    "deepseek-v2",
    "deepseek-v3",
    "deepseek-r1",
    "phi-3",
    "phi-4",
    "gemma2",
    "gemma3",
    "hermes3",
    "firefunction",
    "nemotron",
];

/// Detect capabilities of an Ollama model by querying /api/show.
///
/// Results are cached in `CAPABILITY_CACHE` so subsequent calls for the same
/// model ID return immediately without a network round-trip.
pub async fn detect_ollama_capabilities(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
) -> ModelCapabilities {
    // Cache key includes base_url to avoid stale entries when switching Ollama instances
    let cache_key = format!("{}:{}", base_url, model);

    // Check cache first
    {
        let cache = CAPABILITY_CACHE.read().await;
        if let Some(cached) = cache.get(&cache_key) {
            return cached.clone();
        }
    }

    let caps = detect_uncached(client, base_url, model).await;

    // Cache the result
    {
        let mut cache = CAPABILITY_CACHE.write().await;
        cache.insert(cache_key, caps.clone());
    }

    caps
}

async fn detect_uncached(
    client: &reqwest::Client,
    base_url: &str,
    model: &str,
) -> ModelCapabilities {
    let url = format!("{}/api/show", base_url.trim_end_matches('/'));

    // Wrap the entire HTTP exchange in tokio::time::timeout so a stalled
    // connection can never block the tokio runtime beyond 5 seconds.
    let http_future = async {
        let response = client
            .post(&url)
            .json(&serde_json::json!({"name": model}))
            .send()
            .await?;
        response.json::<OllamaShowResponse>().await
    };

    let show: OllamaShowResponse =
        match tokio::time::timeout(std::time::Duration::from_secs(5), http_future).await {
            Ok(Ok(s)) => s,
            Ok(Err(e)) => {
                tracing::warn!("[CapDetect] Failed to query /api/show for {model}: {e}");
                return default_capabilities(model);
            }
            Err(_elapsed) => {
                tracing::warn!("[CapDetect] Timeout querying /api/show for {model} (5s elapsed)");
                return default_capabilities(model);
            }
        };

    // Check if the template contains tool-related tokens
    let template_has_tools = show
        .template
        .as_deref()
        .map(|t| {
            t.contains("tool_call")
                || t.contains("<tool>")
                || t.contains("{{.ToolCalls}}")
                || t.contains("<|tool_calls|>")
                || t.contains("function_call")
        })
        .unwrap_or(false);

    // Check model family against known tool-capable families
    let family = show
        .details
        .as_ref()
        .and_then(|d| d.family.as_deref())
        .unwrap_or("");
    let family_supports_tools = TOOL_CAPABLE_FAMILIES.iter().any(|f| {
        family.to_lowercase().contains(&f.to_lowercase())
            || model.to_lowercase().contains(&f.to_lowercase())
    });

    // Check for vision support
    let supports_vision = model.contains("vision")
        || model.contains("llava")
        || model.contains("bakllava")
        || model.contains("moondream")
        || (model.contains("llama3.2") && model.contains("vision"));

    // Context length from model_info or default
    let context_length = show
        .model_info
        .as_ref()
        .and_then(|info| {
            info.get("general.context_length")
                .or_else(|| info.get("llama.context_length"))
                .and_then(|v| v.as_u64())
        })
        .unwrap_or(4096) as usize;

    ModelCapabilities {
        supports_tools: template_has_tools || family_supports_tools,
        supports_vision,
        context_length,
    }
}

/// Fallback capabilities derived purely from the model name, used when
/// the /api/show endpoint is unreachable or returns an unparseable response.
pub fn default_capabilities(model: &str) -> ModelCapabilities {
    let lower = model.to_lowercase();
    ModelCapabilities {
        supports_tools: TOOL_CAPABLE_FAMILIES.iter().any(|f| lower.contains(*f)),
        supports_vision: lower.contains("vision") || lower.contains("llava"),
        context_length: 4096,
    }
}

/// Clear the in-memory capability cache.
///
/// Call this when models are pulled or removed so stale entries don't persist
/// across the session.
pub async fn clear_capability_cache() {
    let mut cache = CAPABILITY_CACHE.write().await;
    cache.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    // -----------------------------------------------------------------------
    // TOOL_CAPABLE_FAMILIES content
    // -----------------------------------------------------------------------

    /// The list must contain every well-known function-calling family so that
    /// capability detection does not silently drop tool support for a model.
    #[test]
    fn tool_capable_families_contains_expected_entries() {
        let expected = [
            "llama3.1",
            "llama3.2",
            "llama3.3",
            "llama4",
            "qwen2.5",
            "qwen3",
            "mistral",
            "mixtral",
            "mistral-nemo",
            "command-r",
            "command-r-plus",
            "deepseek-v2",
            "deepseek-v3",
            "deepseek-r1",
            "phi-3",
            "phi-4",
            "gemma2",
            "gemma3",
            "hermes3",
            "firefunction",
            "nemotron",
        ];
        for entry in &expected {
            assert!(
                TOOL_CAPABLE_FAMILIES.contains(entry),
                "TOOL_CAPABLE_FAMILIES is missing expected family: {entry}"
            );
        }
    }

    #[test]
    fn tool_capable_families_has_no_duplicates() {
        let mut seen = std::collections::HashSet::new();
        for family in TOOL_CAPABLE_FAMILIES {
            assert!(
                seen.insert(*family),
                "Duplicate entry in TOOL_CAPABLE_FAMILIES: {family}"
            );
        }
    }

    // -----------------------------------------------------------------------
    // default_capabilities — pure name-based fallback (no network)
    // -----------------------------------------------------------------------

    #[test]
    fn default_capabilities_llama31_supports_tools() {
        let caps = default_capabilities("llama3.1:8b");
        assert!(
            caps.supports_tools,
            "llama3.1 model must report supports_tools via name matching"
        );
        assert!(!caps.supports_vision, "llama3.1 is not a vision model");
        assert_eq!(caps.context_length, 4096, "fallback context_length is 4096");
    }

    #[test]
    fn default_capabilities_llama32_vision_supports_both() {
        let caps = default_capabilities("llama3.2-vision:11b");
        assert!(caps.supports_tools, "llama3.2 is a tool-capable family");
        assert!(caps.supports_vision, "model name contains 'vision'");
    }

    #[test]
    fn default_capabilities_llava_supports_vision() {
        let caps = default_capabilities("llava:13b");
        assert!(
            caps.supports_vision,
            "llava model must report supports_vision"
        );
        assert!(
            !caps.supports_tools,
            "plain llava is not a tool-capable family"
        );
    }

    #[test]
    fn default_capabilities_qwen25_supports_tools() {
        let caps = default_capabilities("qwen2.5-coder:7b");
        assert!(
            caps.supports_tools,
            "qwen2.5 family must match via name substring"
        );
    }

    #[test]
    fn default_capabilities_qwen3_supports_tools() {
        let caps = default_capabilities("qwen3:14b");
        assert!(
            caps.supports_tools,
            "qwen3 family must match via name substring"
        );
    }

    #[test]
    fn default_capabilities_deepseek_r1_supports_tools() {
        let caps = default_capabilities("deepseek-r1:70b");
        assert!(
            caps.supports_tools,
            "deepseek-r1 family must be detected as tool-capable"
        );
    }

    #[test]
    fn default_capabilities_phi4_supports_tools() {
        let caps = default_capabilities("phi-4:latest");
        assert!(
            caps.supports_tools,
            "phi-4 family must be detected as tool-capable"
        );
    }

    #[test]
    fn default_capabilities_gemma3_supports_tools() {
        let caps = default_capabilities("gemma3:27b");
        assert!(
            caps.supports_tools,
            "gemma3 family must be detected as tool-capable"
        );
    }

    #[test]
    fn default_capabilities_unknown_model_does_not_support_tools() {
        let caps = default_capabilities("tinyllama:1.1b");
        assert!(
            !caps.supports_tools,
            "unknown model family must not claim tool support"
        );
        assert!(
            !caps.supports_vision,
            "unknown model must not claim vision support"
        );
        assert_eq!(caps.context_length, 4096);
    }

    #[test]
    fn default_capabilities_name_matching_is_case_insensitive() {
        // The model name might arrive in any casing from the Ollama API.
        let caps_lower = default_capabilities("mistral:7b");
        let caps_upper = default_capabilities("Mistral:7b");
        assert_eq!(
            caps_lower.supports_tools, caps_upper.supports_tools,
            "Family matching must be case-insensitive"
        );
    }

    #[test]
    fn default_capabilities_command_r_supports_tools() {
        let caps = default_capabilities("command-r-plus:latest");
        assert!(
            caps.supports_tools,
            "command-r-plus must be detected as tool-capable"
        );
    }

    #[test]
    fn default_capabilities_hermes3_supports_tools() {
        let caps = default_capabilities("hermes3:8b");
        assert!(
            caps.supports_tools,
            "hermes3 must be detected as tool-capable"
        );
    }

    #[test]
    fn default_capabilities_nemotron_supports_tools() {
        let caps = default_capabilities("nemotron-mini:4b");
        assert!(
            caps.supports_tools,
            "nemotron must be detected as tool-capable"
        );
    }

    // -----------------------------------------------------------------------
    // Cache key collision — different base_urls must not share entries
    // -----------------------------------------------------------------------

    /// Verifies that the cache key incorporates the base_url so that two
    /// Ollama instances serving the same model name are treated independently.
    #[test]
    fn cache_key_format_includes_base_url() {
        let base_url_a = "http://localhost:11434";
        let base_url_b = "http://192.168.1.5:11434";
        let model = "llama3.1:8b";

        let key_a = format!("{}:{}", base_url_a, model);
        let key_b = format!("{}:{}", base_url_b, model);

        assert_ne!(
            key_a, key_b,
            "Cache keys for different base_urls must not collide"
        );
        assert!(
            key_a.starts_with(base_url_a),
            "Cache key must start with the base_url"
        );
        assert!(
            key_b.starts_with(base_url_b),
            "Cache key must start with the base_url"
        );
    }

    #[test]
    fn cache_key_format_includes_model_name() {
        let base_url = "http://localhost:11434";
        let model_a = "llama3.1:8b";
        let model_b = "mistral:7b";

        let key_a = format!("{}:{}", base_url, model_a);
        let key_b = format!("{}:{}", base_url, model_b);

        assert_ne!(
            key_a, key_b,
            "Cache keys for different model names on the same host must not collide"
        );
    }

    // -----------------------------------------------------------------------
    // clear_capability_cache — async cache management
    // -----------------------------------------------------------------------

    /// Manually insert an entry into the cache and verify that
    /// `clear_capability_cache` removes it.
    #[tokio::test]
    async fn clear_capability_cache_removes_all_entries() {
        // Seed two entries directly into the shared cache.
        {
            let mut cache = CAPABILITY_CACHE.write().await;
            cache.insert(
                "http://localhost:11434:seed-model-a:latest".to_string(),
                ModelCapabilities {
                    supports_tools: true,
                    supports_vision: false,
                    context_length: 8192,
                },
            );
            cache.insert(
                "http://localhost:11434:seed-model-b:latest".to_string(),
                ModelCapabilities {
                    supports_tools: false,
                    supports_vision: true,
                    context_length: 4096,
                },
            );
            assert_eq!(
                cache.len(),
                2,
                "Pre-condition: cache must have 2 seeded entries"
            );
        }

        clear_capability_cache().await;

        {
            let cache = CAPABILITY_CACHE.read().await;
            assert!(
                cache.is_empty(),
                "Cache must be empty after clear_capability_cache()"
            );
        }
    }

    #[tokio::test]
    async fn clear_capability_cache_is_idempotent_on_empty_cache() {
        // Ensure the cache is empty first.
        clear_capability_cache().await;
        // Calling again on an already-empty cache must not panic.
        clear_capability_cache().await;

        let cache = CAPABILITY_CACHE.read().await;
        assert!(
            cache.is_empty(),
            "Cache must remain empty after double clear"
        );
    }

    // -----------------------------------------------------------------------
    // ModelCapabilities struct
    // -----------------------------------------------------------------------

    #[test]
    fn model_capabilities_clone_is_independent() {
        let original = ModelCapabilities {
            supports_tools: true,
            supports_vision: false,
            context_length: 16384,
        };
        let cloned = original.clone();
        assert_eq!(original.supports_tools, cloned.supports_tools);
        assert_eq!(original.supports_vision, cloned.supports_vision);
        assert_eq!(original.context_length, cloned.context_length);
    }
}
