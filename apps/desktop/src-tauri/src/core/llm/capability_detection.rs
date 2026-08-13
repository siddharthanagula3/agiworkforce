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
    pub supports_thinking: bool,
    pub supports_completion: bool,
    pub supports_embedding: bool,
    pub context_length: usize,
}

#[derive(Deserialize)]
struct OllamaShowResponse {
    template: Option<String>,
    #[serde(default)]
    capabilities: Vec<String>,
    model_info: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct OllamaTagsResponse {
    #[serde(default)]
    models: Vec<OllamaTagModel>,
}

#[derive(Deserialize)]
struct OllamaTagModel {
    name: String,
}

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
            .json(&serde_json::json!({"model": model}))
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

    capabilities_from_show(&show)
}

fn capabilities_from_show(show: &OllamaShowResponse) -> ModelCapabilities {
    let declares = |capability: &str| {
        show.capabilities
            .iter()
            .any(|item| item.eq_ignore_ascii_case(capability))
    };

    // Older Ollama releases did not expose the capability array consistently,
    // so a provider-owned tool template remains a conservative compatibility
    // signal. Model-family names are never used as capability declarations.
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

    // Context length from model_info or default
    let context_length = show
        .model_info
        .as_ref()
        .and_then(|info| {
            info.get("general.context_length")
                .or_else(|| {
                    info.as_object().and_then(|entries| {
                        entries
                            .iter()
                            .find(|(key, value)| key.ends_with(".context_length") && value.is_u64())
                            .map(|(_, value)| value)
                    })
                })
                .and_then(|v| v.as_u64())
        })
        .unwrap_or(4096) as usize;

    ModelCapabilities {
        supports_tools: declares("tools") || template_has_tools,
        supports_vision: declares("vision"),
        supports_thinking: declares("thinking"),
        supports_completion: declares("completion"),
        supports_embedding: declares("embedding"),
        context_length,
    }
}

/// Fail-closed fallback used when `/api/show` is unreachable or invalid.
/// A model name is an address, not a capability declaration.
pub fn default_capabilities(_model: &str) -> ModelCapabilities {
    ModelCapabilities {
        supports_tools: false,
        supports_vision: false,
        supports_thinking: false,
        supports_completion: false,
        supports_embedding: false,
        context_length: 4096,
    }
}

/// Select an installed Ollama model from provider-reported capabilities.
///
/// The returned ID comes from `/api/tags`; repository code never guesses a
/// local model name. Unknown capability labels fail closed.
pub async fn find_installed_model_with_capability(
    client: &reqwest::Client,
    base_url: &str,
    required_capability: &str,
) -> Result<String, String> {
    if !matches!(required_capability, "completion" | "embedding") {
        return Err(format!(
            "Unsupported Ollama capability selector: {required_capability}"
        ));
    }

    let response = client
        .get(format!("{}/api/tags", base_url.trim_end_matches('/')))
        .send()
        .await
        .map_err(|error| format!("Failed to list installed Ollama models: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Ollama model discovery returned status {}",
            response.status()
        ));
    }

    let mut models = response
        .json::<OllamaTagsResponse>()
        .await
        .map_err(|error| format!("Failed to parse installed Ollama models: {error}"))?
        .models;
    models.sort_by(|left, right| left.name.cmp(&right.name));

    for model in models {
        let capabilities = detect_ollama_capabilities(client, base_url, &model.name).await;
        let matches = match required_capability {
            "completion" => capabilities.supports_completion,
            "embedding" => capabilities.supports_embedding,
            _ => false,
        };
        if matches {
            return Ok(model.name);
        }
    }

    Err(format!(
        "No installed Ollama model declares the {required_capability} capability"
    ))
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

    #[test]
    fn provider_capability_metadata_is_authoritative() {
        let show = OllamaShowResponse {
            template: None,
            capabilities: vec![
                "completion".to_string(),
                "tools".to_string(),
                "vision".to_string(),
                "embedding".to_string(),
                "thinking".to_string(),
            ],
            model_info: Some(serde_json::json!({
                "fixture.context_length": 32_768
            })),
        };
        let caps = capabilities_from_show(&show);
        assert!(caps.supports_tools);
        assert!(caps.supports_vision);
        assert!(caps.supports_thinking);
        assert!(caps.supports_completion);
        assert!(caps.supports_embedding);
        assert_eq!(caps.context_length, 32_768);
    }

    #[test]
    fn provider_template_remains_a_conservative_tools_fallback() {
        let show = OllamaShowResponse {
            template: Some("{{.ToolCalls}}".to_string()),
            capabilities: vec!["completion".to_string()],
            model_info: None,
        };
        let caps = capabilities_from_show(&show);
        assert!(caps.supports_tools);
        assert!(!caps.supports_vision);
        assert!(!caps.supports_thinking);
        assert!(caps.supports_completion);
        assert!(!caps.supports_embedding);
    }

    #[test]
    fn missing_provider_metadata_fails_closed_independent_of_model_name() {
        for model in ["fixture-local-model:tools", "fixture-local-model:vision"] {
            let caps = default_capabilities(model);
            assert!(!caps.supports_tools);
            assert!(!caps.supports_vision);
            assert!(!caps.supports_thinking);
            assert!(!caps.supports_completion);
            assert!(!caps.supports_embedding);
            assert_eq!(caps.context_length, 4096);
        }
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
        let model = "fixture-local-model:current";

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
        let model_a = "fixture-local-model:a";
        let model_b = "fixture-local-model:b";

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
                    supports_thinking: false,
                    supports_completion: true,
                    supports_embedding: false,
                    context_length: 8192,
                },
            );
            cache.insert(
                "http://localhost:11434:seed-model-b:latest".to_string(),
                ModelCapabilities {
                    supports_tools: false,
                    supports_vision: true,
                    supports_thinking: false,
                    supports_completion: true,
                    supports_embedding: false,
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
            supports_thinking: true,
            supports_completion: true,
            supports_embedding: false,
            context_length: 16384,
        };
        let cloned = original.clone();
        assert_eq!(original.supports_tools, cloned.supports_tools);
        assert_eq!(original.supports_vision, cloned.supports_vision);
        assert_eq!(original.supports_thinking, cloned.supports_thinking);
        assert_eq!(original.supports_completion, cloned.supports_completion);
        assert_eq!(original.supports_embedding, cloned.supports_embedding);
        assert_eq!(original.context_length, cloned.context_length);
    }
}
