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
    #[allow(dead_code)]
    modelfile: Option<String>,
    details: Option<OllamaModelDetails>,
    model_info: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct OllamaModelDetails {
    family: Option<String>,
    #[allow(dead_code)]
    parameter_size: Option<String>,
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

    let response = match client
        .post(&url)
        .json(&serde_json::json!({"name": model}))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!("[CapDetect] Failed to query /api/show for {model}: {e}");
            return default_capabilities(model);
        }
    };

    let show: OllamaShowResponse = match response.json().await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("[CapDetect] Failed to parse /api/show response for {model}: {e}");
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
        supports_tools: TOOL_CAPABLE_FAMILIES
            .iter()
            .any(|f| lower.contains(*f)),
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
